// ─────────────────────────────────────────────────────────────────────────────
// ipc/app.ipc.js — App-level controls: stop processes, exit, install mode, NAS backup
// ─────────────────────────────────────────────────────────────────────────────

const { app, dialog } = require('electron');
const logger          = require('../logger');
const ProcessManager  = require('../ProcessManager');
const MessageStore    = require('../services/MessageStore');
const NasBackup       = require('../services/NasBackup');
const InstallMode     = require('../services/InstallMode');

function register(ipcMain, mainWindow) {

  // ── Process control ─────────────────────────────────────────────────────────

  ipcMain.handle('app:stopAll', async () => {
    logger.log('BOOT', 'Stop all processes requested');
    await ProcessManager.stopAll();
    MessageStore.flush();
    return { success: true };
  });

  ipcMain.handle('app:stopAndExit', async () => {
    logger.log('BOOT', 'Stop all and exit requested');

    const choice = await dialog.showMessageBox(mainWindow, {
      type   : 'question',
      title  : 'Quit Stormbird',
      message: 'Stop all processes and quit?',
      detail : 'All pending operations will be stopped. Any queued emails will remain in the outbox.',
      buttons: ['Cancel', 'Stop & Quit'],
      defaultId: 1,
      cancelId : 0,
    });

    if (choice.response !== 1) return { cancelled: true };

    await ProcessManager.stopAll();
    MessageStore.flush();
    MessageStore.close();

    logger.log('BOOT', 'Graceful shutdown complete — exiting');
    setTimeout(() => app.quit(), 500);
    return { success: true };
  });

  // ── Install mode ────────────────────────────────────────────────────────────

  ipcMain.handle('app:installMode', () => {
    return {
      mode       : InstallMode.getMode(),
      description: InstallMode.getModeDescription(),
      drives     : InstallMode.getDrives(),
    };
  });

  ipcMain.handle('app:ejectWillKillApp', (_, driveLetter) => {
    return InstallMode.ejectWillKillApp(driveLetter);
  });

  // ── NAS Backup ──────────────────────────────────────────────────────────────

  ipcMain.handle('backup:runFull', async (_, nasPath) => {
    logger.log('BACKUP', `Full backup requested → ${nasPath}`);
    return NasBackup.runFull(nasPath);
  });

  ipcMain.handle('backup:runIncremental', async (_, nasPath) => {
    logger.log('BACKUP', `Incremental backup requested → ${nasPath || 'saved path'}`);
    return NasBackup.runIncremental(nasPath);
  });

  ipcMain.handle('backup:setSchedule', (_, schedule, nasPath) => {
    NasBackup.setSchedule(schedule, nasPath);
    return { success: true };
  });

  ipcMain.handle('backup:getSchedule', () => {
    return NasBackup.getSchedule();
  });

  ipcMain.handle('backup:getStatus', () => {
    return NasBackup.getStatus();
  });

  ipcMain.handle('backup:browsePath', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title     : 'Select NAS or backup folder',
      properties: ['openDirectory'],
    });
    if (result.cancelled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  logger.log('BOOT', 'App IPC handlers registered');
}

module.exports = { register };
