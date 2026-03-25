// ─────────────────────────────────────────────────────────────────────────────
// services/DriveManager.js — USB drive management (Windows + macOS)
// Safe Eject: flush WAL → close DB → platform eject command
// Windows: PowerShell Shell.Application
// macOS:   diskutil eject
// ─────────────────────────────────────────────────────────────────────────────

const { exec } = require('child_process');
const fs       = require('fs');
const path     = require('path');
const logger   = require('../logger');
const MessageStore = require('./MessageStore');

let dataDir    = null;
let mainWindow = null;

// ── Init ──────────────────────────────────────────────────────────────────────

function init(window, dir) {
  mainWindow = window;
  dataDir    = dir;
  logger.log('DRIVE', `DriveManager initialized — platform: ${process.platform}`);
}

// ── Safe Eject ────────────────────────────────────────────────────────────────

/**
 * Safe eject sequence:
 * 1. Flush all pending SQLite writes (WAL → main file)
 * 2. Close the database
 * 3. Eject via platform command
 *
 * Windows: driveLetter is e.g. "E:"
 * macOS:   driveLetter is mount point e.g. "/Volumes/STORMBIRD"
 */
async function safeEject(driveTarget) {
  if (!driveTarget) {
    driveTarget = _driveFromPath(dataDir);
  }

  logger.log('DRIVE', `Safe eject requested: ${driveTarget}`);

  try {
    logger.log('DRIVE', 'Flushing SQLite WAL…');
    MessageStore.flush();
    await new Promise(r => setTimeout(r, 500));

    logger.log('DRIVE', 'Closing database…');
    MessageStore.close();
    await new Promise(r => setTimeout(r, 500));

    if (process.platform === 'win32' && driveTarget) {
      await _windowsEject(driveTarget);
    } else if (process.platform === 'darwin' && driveTarget) {
      await _macEject(driveTarget);
    }

    logger.log('DRIVE', `✓ Safely ejected: ${driveTarget}`);
    _push('drive:ejected', { driveLetter: driveTarget, success: true });
    return { success: true, message: `${driveTarget} safely ejected` };

  } catch (err) {
    logger.error('DRIVE', `Safe eject failed: ${err.message}`, err);
    _push('drive:ejected', { driveLetter: driveTarget, success: false, error: err.message });
    return { success: false, message: err.message };
  }
}

// ── Drive listing ─────────────────────────────────────────────────────────────

/**
 * List removable drives.
 * Windows: returns [{ letter, label, isRemovable }]
 * macOS:   returns [{ letter (mountPoint), label, isRemovable }]
 */
async function listRemovable() {
  if (process.platform === 'win32') return _windowsListRemovable();
  if (process.platform === 'darwin') return _macListRemovable();
  return [];
}

// ── Drive health ──────────────────────────────────────────────────────────────

function getDriveHealth() {
  const dbPath = path.join(dataDir, 'stormbird.db');
  const drive  = _driveFromPath(dataDir);

  return {
    letter      : drive,
    freeBytes   : 0,          // platform-specific, best-effort
    totalBytes  : 0,
    dataDirExists: fs.existsSync(dataDir),
    dbExists    : fs.existsSync(dbPath),
    dbSizeBytes : fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
    dataDir,
    platform    : process.platform,
  };
}

// ── Windows helpers ───────────────────────────────────────────────────────────

async function _windowsEject(driveLetter) {
  const letter = driveLetter.replace(':', '');
  const script = `
    $shell = New-Object -comObject Shell.Application;
    $folder = $shell.Namespace(17);
    $drive = $folder.Items() | Where-Object { $_.Path -eq '${letter}:\\' };
    if ($drive) { $drive.InvokeVerb('Eject') }
  `;
  return new Promise((resolve, reject) => {
    exec(`powershell -Command "${script}"`, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

function _windowsListRemovable() {
  return new Promise((resolve) => {
    const ps = `Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DriveType -eq 2} | Select-Object DeviceID, VolumeName, FreeSpace, Size | ConvertTo-Json`;
    exec(`powershell -Command "${ps}"`, (err, stdout) => {
      if (err || !stdout.trim()) { resolve([]); return; }
      try {
        let raw = JSON.parse(stdout.trim());
        if (!Array.isArray(raw)) raw = [raw];
        resolve(raw.map(d => ({
          letter     : d.DeviceID,
          label      : d.VolumeName || 'USB Drive',
          freeBytes  : d.FreeSpace  || 0,
          totalBytes : d.Size       || 0,
          isRemovable: true,
        })));
      } catch (_) { resolve([]); }
    });
  });
}

function _driveLetterFromPath(p) {
  if (!p) return null;
  const m = p.match(/^([A-Za-z]):/);
  return m ? m[1].toUpperCase() + ':' : null;
}

// ── macOS helpers ─────────────────────────────────────────────────────────────

async function _macEject(mountPoint) {
  return new Promise((resolve, reject) => {
    // diskutil eject works for both USB drives and disk images
    exec(`diskutil eject "${mountPoint}"`, (err, stdout) => {
      if (err) reject(new Error(`diskutil eject failed: ${err.message}`));
      else resolve(stdout);
    });
  });
}

function _macListRemovable() {
  return new Promise((resolve) => {
    // diskutil list -plist gives machine-readable output
    // We use the simpler 'mount' approach to find external volumes
    exec(`diskutil list -plist external`, (err, stdout) => {
      if (err || !stdout.trim()) {
        // Fallback: list /Volumes manually
        _macListVolumes().then(resolve).catch(() => resolve([]));
        return;
      }
      // Parse volumes from /Volumes
      _macListVolumes().then(resolve).catch(() => resolve([]));
    });
  });
}

function _macListVolumes() {
  return new Promise((resolve) => {
    fs.readdir('/Volumes', (err, entries) => {
      if (err) { resolve([]); return; }
      const drives = entries
        .filter(e => !e.startsWith('.') && e !== 'Macintosh HD')
        .map(e => ({
          letter     : `/Volumes/${e}`,
          label      : e,
          freeBytes  : _macFreeSpace(`/Volumes/${e}`),
          totalBytes : 0,
          isRemovable: true,
        }));
      resolve(drives);
    });
  });
}

function _macFreeSpace(mountPoint) {
  try {
    const stat = fs.statfsSync ? fs.statfsSync(mountPoint) : null;
    return stat ? stat.bfree * stat.bsize : 0;
  } catch (_) { return 0; }
}

// ── Cross-platform drive detection ────────────────────────────────────────────

function _driveFromPath(p) {
  if (!p) return null;
  if (process.platform === 'win32') return _driveLetterFromPath(p);
  // macOS: return the mount point (/Volumes/xxx)
  const match = p.match(/^(\/Volumes\/[^/]+)/);
  return match ? match[1] : null;
}

function _push(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

module.exports = { init, safeEject, listRemovable, getDriveHealth };
