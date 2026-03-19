// ─────────────────────────────────────────────────────────────────────────────
// ipc/index.js — Registers all IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

const { shell, app } = require('electron');
const path           = require('path');
const logger         = require('../logger');
const ProcessManager = require('../ProcessManager');

function registerIpc(ipcMain, dataDir, mainWindow) {

  // ── Window controls ──────────────────────────────────────────────────────
  ipcMain.handle('win:minimize',    () => mainWindow.minimize());
  ipcMain.handle('win:maximize',    () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('win:close',       () => mainWindow.close());
  ipcMain.handle('win:isMaximized', () => mainWindow.isMaximized());

  // ── Logger ───────────────────────────────────────────────────────────────
  ipcMain.handle('logger:getRecent', (_, n) => logger.getRecent(n));

  // ── Process Manager ──────────────────────────────────────────────────────
  ipcMain.handle('process:getAll',   ()        => ProcessManager.getAll());
  ipcMain.handle('process:diagnose', (_, id)   => ProcessManager.diagnoseIssue(id));
  ipcMain.handle('process:resolve',  (_, id)   => ProcessManager.resolveIssue(id));
  ipcMain.handle('process:retry',    (_, name) => {
    const entry = ProcessManager.getProcess(name);
    if (entry && entry.restartFn) {
      entry.restartFn().catch(err => logger.error('MANAGER', `Retry failed for ${name}`, err));
    }
  });

  // ── App info ─────────────────────────────────────────────────────────────
  ipcMain.handle('app:version', () => {
    try { return require('../../package.json').version; } catch (_) { return 'unknown'; }
  });
  ipcMain.handle('app:dataDir', () => dataDir);

  // ── Dialog helpers ────────────────────────────────────────────────────────
  const { dialog } = require('electron');
  ipcMain.handle('dialog:openFile', (_, options) =>
    dialog.showOpenDialog(mainWindow, { properties: ['openFile'], ...options })
  );
  ipcMain.handle('dialog:openDir', (_, options) =>
    dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], ...options })
  );
  ipcMain.handle('dialog:saveFile', (_, options) =>
    dialog.showSaveDialog(mainWindow, options)
  );

  // ── Shell ────────────────────────────────────────────────────────────────
  ipcMain.handle('shell:openPath',     (_, p)   => shell.openPath(p));
  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

  // ── Settings ──────────────────────────────────────────────────────────────
  const fs           = require('fs');
  const settingsPath = path.join(dataDir, 'settings.json');

  function readSettings() {
    try {
      if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (_) {}
    return {};
  }
  function writeSettings(data) {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
  }

  ipcMain.handle('settings:getAll', ()            => readSettings());
  ipcMain.handle('settings:get',    (_, key)      => readSettings()[key]);
  ipcMain.handle('settings:set',    (_, key, val) => {
    const s = readSettings(); s[key] = val; writeSettings(s);
    return true;
  });

  // ── Domain IPC modules ────────────────────────────────────────────────────
  require('./messages.ipc').register(ipcMain, dataDir);
  require('./importer.ipc').register(ipcMain, dataDir, mainWindow);
  require('./accounts.ipc').register(ipcMain);
  require('./sync.ipc').register(ipcMain, dataDir, mainWindow);

  // ── Initialize SyncService ────────────────────────────────────────────────
  const SyncService = require('../services/SyncService');
  SyncService.init(mainWindow);

  // ── Stub handlers for future phases ──────────────────────────────────────
  const stub = (name) => {
    try { ipcMain.handle(name, () => null); } catch (_) {}
  };

  stub('mail:send');
  stub('mail:outbox');
  stub('mail:retry');
  stub('backup:runFull');
  stub('backup:runIncremental');
  stub('backup:listSnapshots');
  stub('backup:restore');
  stub('backup:log');
  stub('drive:listRemovable');
  stub('drive:getHealth');
  stub('drive:format');
  stub('drive:safeEject');
  stub('integrity:spotCheck');
  stub('integrity:deepScan');
  stub('integrity:getReport');
  stub('sync:stop');

  logger.log('BOOT', 'All IPC handlers registered');
}

module.exports = registerIpc;
