// ─────────────────────────────────────────────────────────────────────────────
// services/NasBackup.js — Backup Stormbird-Data to a NAS or network path
//
// Full backup   : copies all files to <nasPath>/Stormbird-Backup/
// Incremental   : copies only files newer than last backup timestamp
// Schedule      : daily or weekly, checked on startup and every hour
// Progress      : pushed to renderer via IPC
// ─────────────────────────────────────────────────────────────────────────────

const fs           = require('fs');
const path         = require('path');
const logger       = require('../logger');
const ProcessManager = require('../ProcessManager');
const MessageStore = require('./MessageStore');

const BACKUP_DIRNAME = 'Stormbird-Backup';

let mainWindow = null;
let dataDir    = null;
let schedTimer = null;
let running    = false;

// ── Init ──────────────────────────────────────────────────────────────────────

function init(window, dir) {
  mainWindow = window;
  dataDir    = dir;

  ProcessManager.register('NasBackup', {
    restartable      : false,
    heartbeatInterval: 3600000, // 1 hour
    criticalOnCrash  : false,
    stopFn           : () => cancelSchedule(),
  });
  ProcessManager.idle('NasBackup', 'No backup running');

  // Check if a scheduled backup is due
  _checkSchedule();

  logger.log('BACKUP', 'NasBackup initialized');
}

// ── Full backup ───────────────────────────────────────────────────────────────

/**
 * Copy all files from Stormbird-Data to nasPath/Stormbird-Backup/.
 * Returns { copied, skipped, errors, bytesTotal }
 */
async function runFull(nasPath) {
  if (running) return { success: false, error: 'Backup already running' };
  if (!nasPath || !fs.existsSync(nasPath)) {
    return { success: false, error: `NAS path not found: ${nasPath}` };
  }

  running = true;
  const destRoot = path.join(nasPath, BACKUP_DIRNAME);
  logger.log('BACKUP', `Full backup → ${destRoot}`);
  ProcessManager.running('NasBackup', 'Full backup running…');

  try {
    fs.mkdirSync(destRoot, { recursive: true });

    const result = await _copyDir(dataDir, destRoot, () => true);

    MessageStore.setSetting('last_backup_full', String(Date.now()));
    MessageStore.setSetting('backup_nas_path',  nasPath);

    const summary = `Full backup complete — ${result.copied} files, ${_formatBytes(result.bytesTotal)}`;
    logger.log('BACKUP', summary);
    ProcessManager.idle('NasBackup', summary);
    running = false;
    return { success: true, ...result };

  } catch (err) {
    running = false;
    logger.error('BACKUP', `Full backup failed: ${err.message}`, err);
    ProcessManager.reportError('NasBackup', err.message, err);
    return { success: false, error: err.message };
  }
}

// ── Incremental backup ────────────────────────────────────────────────────────

/**
 * Copy only files modified since last backup.
 * Returns { copied, skipped, errors, bytesTotal }
 */
async function runIncremental(nasPath) {
  if (running) return { success: false, error: 'Backup already running' };

  const lastStr = MessageStore.getSetting('last_backup_full')
    || MessageStore.getSetting('last_backup_incremental')
    || '0';
  const sinceMs = parseInt(lastStr, 10) || 0;

  if (!nasPath) nasPath = MessageStore.getSetting('backup_nas_path');
  if (!nasPath || !fs.existsSync(nasPath)) {
    return { success: false, error: `NAS path not found or not configured: ${nasPath}` };
  }

  running = true;
  const destRoot = path.join(nasPath, BACKUP_DIRNAME);
  logger.log('BACKUP', `Incremental backup since ${new Date(sinceMs).toLocaleString()} → ${destRoot}`);
  ProcessManager.running('NasBackup', 'Incremental backup running…');

  try {
    fs.mkdirSync(destRoot, { recursive: true });

    const result = await _copyDir(dataDir, destRoot, (filePath) => {
      try {
        return fs.statSync(filePath).mtimeMs > sinceMs;
      } catch (_) {
        return false;
      }
    });

    MessageStore.setSetting('last_backup_incremental', String(Date.now()));
    if (nasPath) MessageStore.setSetting('backup_nas_path', nasPath);

    const summary = `Incremental backup complete — ${result.copied} files, ${_formatBytes(result.bytesTotal)}`;
    logger.log('BACKUP', summary);
    ProcessManager.idle('NasBackup', summary);
    running = false;
    return { success: true, ...result };

  } catch (err) {
    running = false;
    logger.error('BACKUP', `Incremental backup failed: ${err.message}`, err);
    ProcessManager.reportError('NasBackup', err.message, err);
    return { success: false, error: err.message };
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

/**
 * Configure backup schedule.
 * @param {'daily'|'weekly'|'off'} schedule
 * @param {string} nasPath
 */
function setSchedule(schedule, nasPath) {
  MessageStore.setSetting('backup_schedule', schedule);
  if (nasPath) MessageStore.setSetting('backup_nas_path', nasPath);
  cancelSchedule();
  if (schedule !== 'off') _startSchedule(schedule);
  logger.log('BACKUP', `Schedule set: ${schedule}, path: ${nasPath}`);
}

function getSchedule() {
  return {
    schedule         : MessageStore.getSetting('backup_schedule')          || 'off',
    nasPath          : MessageStore.getSetting('backup_nas_path')           || '',
    lastFull         : MessageStore.getSetting('last_backup_full')          || null,
    lastIncremental  : MessageStore.getSetting('last_backup_incremental')   || null,
  };
}

function cancelSchedule() {
  if (schedTimer) {
    clearTimeout(schedTimer);
    schedTimer = null;
  }
}

function getStatus() {
  return { running, ...getSchedule() };
}

// ── Internal copy engine ──────────────────────────────────────────────────────

async function _copyDir(src, dest, shouldCopy) {
  let copied = 0, skipped = 0, errors = 0, bytesTotal = 0;
  const files = _walkFiles(src);
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const srcFile  = files[i];
    const relative = path.relative(src, srcFile);
    const destFile = path.join(dest, relative);

    if (!shouldCopy(srcFile)) {
      skipped++;
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(srcFile, destFile);
      const size = fs.statSync(srcFile).size;
      bytesTotal += size;
      copied++;
    } catch (err) {
      logger.warn('BACKUP', `Failed to copy ${relative}: ${err.message}`);
      errors++;
    }

    // Push progress every 50 files
    if (i % 50 === 0) {
      const pct = Math.round((i / total) * 100);
      ProcessManager.heartbeat('NasBackup', `${pct}% — ${copied} copied`);
      _pushProgress({ pct, copied, skipped, errors, total });
      await new Promise(r => setTimeout(r, 0)); // yield
    }
  }

  _pushProgress({ pct: 100, copied, skipped, errors, total, done: true });
  return { copied, skipped, errors, bytesTotal };
}

function _walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    try {
      if (fs.statSync(full).isDirectory()) {
        _walkFiles(full, result);
      } else {
        result.push(full);
      }
    } catch (_) {}
  }
  return result;
}

function _checkSchedule() {
  const schedule = MessageStore.getSetting('backup_schedule') || 'off';
  if (schedule === 'off') return;

  const intervalMs = schedule === 'daily' ? 86400000 : 604800000;
  const lastStr = MessageStore.getSetting('last_backup_incremental')
    || MessageStore.getSetting('last_backup_full') || '0';
  const elapsed = Date.now() - parseInt(lastStr, 10);

  if (elapsed > intervalMs) {
    const nasPath = MessageStore.getSetting('backup_nas_path');
    if (nasPath) {
      logger.log('BACKUP', `Scheduled ${schedule} backup is due — starting`);
      setTimeout(() => runIncremental(nasPath), 10000); // 10s after startup
    }
  } else {
    const nextMs = intervalMs - elapsed;
    logger.log('BACKUP', `Next scheduled backup in ${Math.round(nextMs / 3600000)}h`);
    _startSchedule(schedule);
  }
}

function _startSchedule(schedule) {
  const intervalMs = schedule === 'daily' ? 86400000 : 604800000;
  schedTimer = setTimeout(async () => {
    const nasPath = MessageStore.getSetting('backup_nas_path');
    if (nasPath) await runIncremental(nasPath);
    _startSchedule(schedule); // reschedule
  }, intervalMs);
}

function _pushProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backup:progress', data);
  }
}

function _formatBytes(n) {
  if (n < 1024)     return `${n} B`;
  if (n < 1048576)  return `${(n/1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n/1048576).toFixed(1)} MB`;
  return `${(n/1073741824).toFixed(2)} GB`;
}

module.exports = {
  init,
  runFull,
  runIncremental,
  setSchedule,
  getSchedule,
  getStatus,
  cancelSchedule,
};
