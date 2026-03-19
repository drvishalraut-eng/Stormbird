// ─────────────────────────────────────────────────────────────────────────────
// services/InstallMode.js — Detect Stormbird install mode
//
// THREE MODES:
//   portable  — Stormbird.exe AND Stormbird-Data are both on a removable drive
//               Safe eject will kill the running process. Warn user.
//
//   data-only — Stormbird.exe is on a fixed drive, Stormbird-Data is on USB.
//               Safe eject is safe — app keeps running after data drive removed.
//               (Standard "USB as archive drive" setup)
//
//   fixed     — Everything is on a fixed drive. No removable drive involved.
//               Safe eject not applicable.
//
// Detection method: compare drive letters of process.execPath and dataDir,
// then check Win32_LogicalDisk DriveType (2 = removable) via PowerShell.
// Falls back to path heuristics on non-Windows.
// ─────────────────────────────────────────────────────────────────────────────

const { exec } = require('child_process');
const path     = require('path');
const logger   = require('../logger');

let _mode    = 'unknown';
let _exeDrive  = null;
let _dataDrive = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect install mode. Call once on startup.
 * @param {string} dataDir  — path to Stormbird-Data
 * @returns {Promise<'portable'|'data-only'|'fixed'|'unknown'>}
 */
async function detect(dataDir) {
  _exeDrive  = _driveLetterFrom(process.execPath);
  _dataDrive = _driveLetterFrom(dataDir);

  logger.log('BOOT', `Exe drive: ${_exeDrive || '?'}  Data drive: ${_dataDrive || '?'}`);

  if (!_exeDrive || !_dataDrive) {
    _mode = 'unknown';
    return _mode;
  }

  try {
    const removable = await _getRemovableDrives();
    const exeRemovable  = removable.includes(_exeDrive.toUpperCase());
    const dataRemovable = removable.includes(_dataDrive.toUpperCase());

    if (exeRemovable && dataRemovable) {
      _mode = 'portable';
    } else if (!exeRemovable && dataRemovable) {
      _mode = 'data-only';
    } else {
      _mode = 'fixed';
    }
  } catch (_) {
    // Fallback: guess from same drive letter
    _mode = _exeDrive === _dataDrive ? 'portable' : 'data-only';
  }

  logger.log('BOOT', `Install mode: ${_mode.toUpperCase()}`);
  return _mode;
}

/**
 * Get the detected mode.
 */
function getMode() {
  return _mode;
}

/**
 * Get the drive letters.
 */
function getDrives() {
  return { exeDrive: _exeDrive, dataDrive: _dataDrive };
}

/**
 * Returns true if safe eject will kill the running process.
 * Only true in portable mode when ejecting the exe drive.
 */
function ejectWillKillApp(targetDrive) {
  if (_mode !== 'portable') return false;
  if (!targetDrive || !_exeDrive) return false;
  return targetDrive.toUpperCase().startsWith(_exeDrive.toUpperCase());
}

/**
 * Returns a human-readable mode description for display.
 */
function getModeDescription() {
  switch (_mode) {
    case 'portable' :
      return 'Portable — exe and data both on USB. Ejecting will close Stormbird.';
    case 'data-only':
      return 'Data on USB — exe installed on this PC. Safe to eject data drive.';
    case 'fixed'    :
      return 'Fixed install — data stored on this PC.';
    default:
      return 'Install mode unknown.';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _driveLetterFrom(p) {
  if (!p) return null;
  const m = p.match(/^([A-Za-z]):/);
  return m ? m[1].toUpperCase() + ':' : null;
}

function _getRemovableDrives() {
  if (process.platform !== 'win32') {
    return Promise.resolve([]); // Non-Windows: assume fixed
  }

  return new Promise((resolve) => {
    const ps = `Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DriveType -eq 2} | Select-Object -ExpandProperty DeviceID`;
    exec(`powershell -Command "${ps}"`, (err, stdout) => {
      if (err || !stdout.trim()) { resolve([]); return; }
      const drives = stdout.trim().split('\n')
        .map(d => d.trim().toUpperCase())
        .filter(Boolean);
      resolve(drives);
    });
  });
}

module.exports = { detect, getMode, getDrives, ejectWillKillApp, getModeDescription };
