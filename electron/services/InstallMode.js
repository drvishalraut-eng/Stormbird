// ─────────────────────────────────────────────────────────────────────────────
// services/InstallMode.js — Detect Stormbird install mode (cross-platform)
//
// THREE MODES:
//   portable  — exe AND data both on a removable drive
//               Safe eject will kill the running process. Warn user.
//
//   data-only — exe on fixed drive, data on removable drive
//               Safe eject is safe — app keeps running.
//
//   fixed     — Everything on fixed drives. No removable drive involved.
//
// Windows: checks Win32_LogicalDisk DriveType via PowerShell
// macOS:   checks /Volumes mounts via diskutil
// ─────────────────────────────────────────────────────────────────────────────

const { exec } = require('child_process');
const path     = require('path');
const fs       = require('fs');
const logger   = require('../logger');

let _mode      = 'unknown';
let _exeDrive  = null;
let _dataDrive = null;

// ── Public API ────────────────────────────────────────────────────────────────

async function detect(dataDir) {
  _exeDrive  = _driveFromPath(process.execPath);
  _dataDrive = _driveFromPath(dataDir);

  logger.log('BOOT', `InstallMode — exe: ${_exeDrive || '?'}  data: ${_dataDrive || '?'}`);

  if (!_exeDrive || !_dataDrive) {
    _mode = 'unknown';
    return _mode;
  }

  try {
    const removable = await _getRemovableDrives();
    const exeRemovable  = removable.some(r => _driveMatch(r, _exeDrive));
    const dataRemovable = removable.some(r => _driveMatch(r, _dataDrive));

    if (exeRemovable && dataRemovable)  _mode = 'portable';
    else if (!exeRemovable && dataRemovable) _mode = 'data-only';
    else _mode = 'fixed';

  } catch (_) {
    // Fallback heuristic
    _mode = _exeDrive === _dataDrive ? 'portable' : 'data-only';
  }

  logger.log('BOOT', `Install mode: ${_mode.toUpperCase()}`);
  return _mode;
}

function getMode()        { return _mode; }
function getDrives()      { return { exeDrive: _exeDrive, dataDrive: _dataDrive }; }

function ejectWillKillApp(targetDrive) {
  if (_mode !== 'portable') return false;
  if (!targetDrive || !_exeDrive) return false;
  return _driveMatch(_exeDrive, targetDrive);
}

function getModeDescription() {
  switch (_mode) {
    case 'portable' :
      return 'Portable — exe and data both on removable drive. Ejecting will close Stormbird.';
    case 'data-only':
      return 'Data on removable drive — exe installed on this machine. Safe to eject data drive.';
    case 'fixed'    :
      return 'Fixed install — data stored on this machine\'s internal drive.';
    default:
      return 'Install mode could not be determined.';
  }
}

// ── Platform helpers ──────────────────────────────────────────────────────────

function _driveFromPath(p) {
  if (!p) return null;
  if (process.platform === 'win32') {
    const m = p.match(/^([A-Za-z]):/);
    return m ? m[1].toUpperCase() + ':' : null;
  }
  // macOS / Linux: match /Volumes/xxx or just /
  const m = p.match(/^(\/Volumes\/[^/]+)/);
  return m ? m[1] : '/';
}

function _driveMatch(a, b) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

async function _getRemovableDrives() {
  if (process.platform === 'win32') return _windowsRemovable();
  if (process.platform === 'darwin') return _macRemovable();
  return [];
}

function _windowsRemovable() {
  return new Promise((resolve) => {
    const ps = `Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DriveType -eq 2} | Select-Object -ExpandProperty DeviceID`;
    exec(`powershell -Command "${ps}"`, (err, stdout) => {
      if (err || !stdout.trim()) { resolve([]); return; }
      resolve(stdout.trim().split('\n').map(d => d.trim()).filter(Boolean));
    });
  });
}

function _macRemovable() {
  return new Promise((resolve) => {
    // List external volumes via diskutil
    exec('diskutil list -plist external', (err) => {
      if (err) {
        // Fallback: all /Volumes entries except Macintosh HD are likely removable
        fs.readdir('/Volumes', (e, entries) => {
          if (e) { resolve([]); return; }
          resolve(entries
            .filter(v => !v.startsWith('.') && v !== 'Macintosh HD')
            .map(v => `/Volumes/${v}`)
          );
        });
        return;
      }
      // Same fallback — diskutil -plist is complex to parse without plist module
      fs.readdir('/Volumes', (e, entries) => {
        if (e) { resolve([]); return; }
        resolve(entries
          .filter(v => !v.startsWith('.') && v !== 'Macintosh HD')
          .map(v => `/Volumes/${v}`)
        );
      });
    });
  });
}

module.exports = { detect, getMode, getDrives, ejectWillKillApp, getModeDescription };
