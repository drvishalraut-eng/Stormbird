// ─────────────────────────────────────────────────────────────────────────────
// services/IntegrityScanner.js — Data integrity verification
//
// Spot-check: verify a random sample of .eml files on startup
// Deep scan : verify every .eml checksum against the database record
// MANIFEST  : write/read plain-text checksums per year/month folder
// Snapshots : keep last 3 rolling copies of stormbird.db
// ─────────────────────────────────────────────────────────────────────────────

const fs           = require('fs');
const path         = require('path');
const logger       = require('../logger');
const ProcessManager = require('../ProcessManager');
const MessageStore = require('./MessageStore');
const { hashFile } = require('../helpers/crypto');

const SPOT_CHECK_SAMPLE  = 50;   // files to check on startup
const SNAPSHOT_KEEP      = 3;    // rolling DB snapshots to keep
const DEEP_SCAN_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

let mainWindow = null;
let dataDir    = null;
let scanning   = false;

// ── Init ──────────────────────────────────────────────────────────────────────

function init(window, dir) {
  mainWindow = window;
  dataDir    = dir;

  ProcessManager.register('IntegrityScan', {
    restartable      : false,
    heartbeatInterval: 60000,
    criticalOnCrash  : false,
  });
  ProcessManager.idle('IntegrityScan', 'No scan running');

  // Run spot-check on startup
  setTimeout(() => spotCheck(), 5000);

  // Schedule deep scan if overdue
  _scheduleDeepScan();

  logger.log('DB', 'IntegrityScanner initialized');
}

// ── Spot check ────────────────────────────────────────────────────────────────

/**
 * Verify a random sample of .eml files against stored checksums.
 * Fast — runs on startup without blocking.
 * Returns { checked, failed, missing }
 */
async function spotCheck() {
  if (scanning) return { checked: 0, failed: 0, missing: 0 };

  logger.log('DB', `Starting spot-check (sample: ${SPOT_CHECK_SAMPLE})`);
  ProcessManager.running('IntegrityScan', 'Running spot-check…');

  const mailDir  = path.join(dataDir, 'mail');
  const messages = MessageStore.sampleMessages(SPOT_CHECK_SAMPLE);

  let checked = 0, failed = 0, missing = 0;

  for (const msg of messages) {
    const emlPath = path.join(mailDir, msg.eml_path || '');
    if (!msg.eml_path || !fs.existsSync(emlPath)) {
      missing++;
      continue;
    }
    if (!msg.checksum) {
      checked++;
      continue; // No stored checksum to compare
    }
    try {
      const actual = await hashFile(emlPath);
      if (actual !== msg.checksum) {
        failed++;
        logger.warn('DB', `Checksum FAIL: ${msg.eml_path} (expected ${msg.checksum.slice(0,8)}… got ${actual.slice(0,8)}…)`);
        MessageStore.flagCorrupt(msg.id);
      } else {
        checked++;
      }
    } catch (err) {
      missing++;
      logger.warn('DB', `Cannot read: ${msg.eml_path} — ${err.message}`);
    }
  }

  const status = failed > 0
    ? `⚠ Spot-check: ${failed} corrupt, ${missing} missing out of ${messages.length}`
    : `✓ Spot-check passed — ${checked} files OK`;

  logger.log('DB', status);
  ProcessManager.idle('IntegrityScan', status);

  if (failed > 0) {
    ProcessManager.reportError('IntegrityScan', `${failed} corrupted .eml file(s) detected`);
  }

  _pushReport({ type: 'spot', checked, failed, missing, total: messages.length });
  MessageStore.setSetting('last_spotcheck', String(Date.now()));

  return { checked, failed, missing };
}

// ── Deep scan ─────────────────────────────────────────────────────────────────

/**
 * Verify every .eml file in the database.
 * Slow — should run weekly or on demand.
 * Pushes progress to renderer.
 */
async function deepScan() {
  if (scanning) {
    logger.warn('DB', 'Deep scan already running');
    return { checked: 0, failed: 0, missing: 0 };
  }

  scanning = true;
  logger.log('DB', 'Starting deep scan…');
  ProcessManager.running('IntegrityScan', 'Deep scan running…');

  const mailDir = path.join(dataDir, 'mail');
  const total   = MessageStore.getTotalCount();
  const batch   = 100;

  let offset  = 0;
  let checked = 0, failed = 0, missing = 0;

  while (offset < total) {
    const messages = MessageStore.listMessagesBatch(offset, batch);
    if (messages.length === 0) break;

    for (const msg of messages) {
      const emlPath = path.join(mailDir, msg.eml_path || '');
      if (!msg.eml_path || !fs.existsSync(emlPath)) {
        missing++;
        continue;
      }
      if (!msg.checksum) { checked++; continue; }

      try {
        const actual = await hashFile(emlPath);
        if (actual !== msg.checksum) {
          failed++;
          logger.warn('DB', `Corrupt: ${msg.eml_path}`);
          MessageStore.flagCorrupt(msg.id);
        } else {
          checked++;
        }
      } catch (_) {
        missing++;
      }
    }

    offset += batch;
    const pct = Math.round((offset / total) * 100);
    ProcessManager.running('IntegrityScan', `Deep scan: ${pct}% (${offset}/${total})`);
    _pushProgress({ pct, checked, failed, missing, total });

    // Yield to event loop between batches
    await new Promise(r => setTimeout(r, 10));
  }

  scanning = false;

  const status = failed > 0
    ? `⚠ Deep scan: ${failed} corrupt, ${missing} missing / ${total} total`
    : `✓ Deep scan complete — ${checked}/${total} files OK`;

  logger.log('DB', status);
  ProcessManager.idle('IntegrityScan', status);
  MessageStore.setSetting('last_deepscan', String(Date.now()));

  _pushReport({ type: 'deep', checked, failed, missing, total });
  return { checked, failed, missing, total };
}

// ── MANIFEST.txt ──────────────────────────────────────────────────────────────

/**
 * Write a MANIFEST.txt to every year/month folder containing:
 *   filename  sha256checksum
 * This makes archives self-verifiable without Stormbird installed.
 */
async function writeManifests() {
  const mailDir = path.join(dataDir, 'mail');
  if (!fs.existsSync(mailDir)) return;

  let written = 0;
  _walkDirs(mailDir, async (dir) => {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.eml'));
    if (files.length === 0) return;

    const lines = ['# Stormbird MANIFEST', `# Generated: ${new Date().toISOString()}`, ''];
    for (const file of files.sort()) {
      try {
        const checksum = await hashFile(path.join(dir, file));
        lines.push(`${file}  ${checksum}`);
      } catch (_) {
        lines.push(`${file}  ERROR`);
      }
    }

    fs.writeFileSync(path.join(dir, 'MANIFEST.txt'), lines.join('\n') + '\n', 'utf8');
    written++;
  });

  logger.log('DB', `MANIFEST.txt written to ${written} folder(s)`);
  return written;
}

// ── DB snapshots ──────────────────────────────────────────────────────────────

/**
 * Create a rolling snapshot of stormbird.db.
 * Keeps last SNAPSHOT_KEEP copies. Called before major operations.
 */
function takeSnapshot() {
  try {
    const dbPath       = path.join(dataDir, 'stormbird.db');
    const snapshotDir  = path.join(dataDir, 'snapshots');

    if (!fs.existsSync(dbPath)) return;
    fs.mkdirSync(snapshotDir, { recursive: true });

    // Flush WAL to main DB first
    MessageStore.flush();

    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const destPath = path.join(snapshotDir, `stormbird-${ts}.db`);
    fs.copyFileSync(dbPath, destPath);

    logger.log('DB', `Snapshot taken: stormbird-${ts}.db`);

    // Prune old snapshots — keep only SNAPSHOT_KEEP most recent
    _pruneSnapshots(snapshotDir);

    return destPath;
  } catch (err) {
    logger.error('DB', `Snapshot failed: ${err.message}`, err);
    return null;
  }
}

function listSnapshots() {
  const snapshotDir = path.join(dataDir, 'snapshots');
  if (!fs.existsSync(snapshotDir)) return [];

  return fs.readdirSync(snapshotDir)
    .filter(f => f.startsWith('stormbird-') && f.endsWith('.db'))
    .sort()
    .reverse()
    .map(f => {
      const full = path.join(snapshotDir, f);
      const stat = fs.statSync(full);
      return { name: f, path: full, size: stat.size, mtime: stat.mtimeMs };
    });
}

function getReport() {
  return {
    lastSpotCheck : MessageStore.getSetting('last_spotcheck') || null,
    lastDeepScan  : MessageStore.getSetting('last_deepscan')  || null,
    snapshots     : listSnapshots(),
    totalMessages : MessageStore.getTotalCount(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _pruneSnapshots(dir) {
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('stormbird-') && f.endsWith('.db'))
    .sort();

  while (files.length > SNAPSHOT_KEEP) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(dir, oldest));
    logger.log('DB', `Pruned old snapshot: ${oldest}`);
  }
}

function _scheduleDeepScan() {
  const lastStr = MessageStore.getSetting('last_deepscan');
  const lastMs  = lastStr ? parseInt(lastStr, 10) : 0;
  const elapsed = Date.now() - lastMs;

  if (elapsed > DEEP_SCAN_INTERVAL) {
    // Overdue — run after a 30-second startup delay
    logger.log('DB', 'Deep scan overdue — scheduling in 30s');
    setTimeout(() => deepScan(), 30000);
  } else {
    const nextMs = DEEP_SCAN_INTERVAL - elapsed;
    logger.log('DB', `Next deep scan in ${Math.round(nextMs / 3600000)}h`);
    setTimeout(() => deepScan(), nextMs);
  }
}

function _walkDirs(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      fn(full);
      _walkDirs(full, fn);
    }
  }
}

function _pushProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('integrity:progress', data);
  }
}

function _pushReport(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('integrity:report', data);
  }
}

module.exports = {
  init,
  spotCheck,
  deepScan,
  writeManifests,
  takeSnapshot,
  listSnapshots,
  getReport,
};
