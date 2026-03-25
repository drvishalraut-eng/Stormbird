// ─────────────────────────────────────────────────────────────────────────────
// ipc/integrity.ipc.js — Integrity scan and drive management IPC
// ─────────────────────────────────────────────────────────────────────────────

const logger           = require('../logger');
const IntegrityScanner = require('../services/IntegrityScanner');
const DriveManager     = require('../services/DriveManager');

function register(ipcMain) {

  // ── Integrity ───────────────────────────────────────────────────────────────

  ipcMain.handle('integrity:spotCheck', async () => {
    logger.log('DB', 'Spot-check requested via IPC');
    return IntegrityScanner.spotCheck();
  });

  ipcMain.handle('integrity:deepScan', async () => {
    logger.log('DB', 'Deep scan requested via IPC');
    return IntegrityScanner.deepScan();
  });

  ipcMain.handle('integrity:writeManifests', async () => {
    return IntegrityScanner.writeManifests();
  });

  ipcMain.handle('integrity:takeSnapshot', () => {
    return IntegrityScanner.takeSnapshot();
  });

  ipcMain.handle('integrity:listSnapshots', () => {
    return IntegrityScanner.listSnapshots();
  });

  ipcMain.handle('integrity:getReport', () => {
    return IntegrityScanner.getReport();
  });

  // ── Drive management ────────────────────────────────────────────────────────

  ipcMain.handle('drive:listRemovable', async () => {
    return DriveManager.listRemovable();
  });

  ipcMain.handle('drive:getHealth', () => {
    return DriveManager.getDriveHealth();
  });

  ipcMain.handle('drive:safeEject', async (_, driveLetter) => {
    logger.log('DRIVE', `Safe eject requested: ${driveLetter || 'auto'}`);
    return DriveManager.safeEject(driveLetter);
  });

  logger.log('BOOT', 'Integrity + Drive IPC handlers registered');
}

module.exports = { register };
