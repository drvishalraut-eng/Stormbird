// ─────────────────────────────────────────────────────────────────────────────
// ipc/index.js — Registers all IPC handlers with the main process
// Each domain has its own file. This just wires them together.
// ─────────────────────────────────────────────────────────────────────────────

const { shell, app } = require('electron');
const path           = require('path');
const logger         = require('../logger');
const ProcessManager = require('../ProcessManager');

function registerIpc(ipcMain, dataDir, mainWindow) {

  // ── Window controls ──────────────────────────────────────────────────────
  ipcMain.handle('win:minimize',   () => mainWindow.minimize());
  ipcMain.handle('win:maximize',   () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('win:close',      () => mainWindow.close());
  ipcMain.handle('win:isMaximized',() => mainWindow.isMaximized());

  // ── Logger ───────────────────────────────────────────────────────────────
  ipcMain.handle('logger:getRecent', (_, n) => logger.getRecent(n));

  // ── Process Manager ──────────────────────────────────────────────────────
  ipcMain.handle('process:getAll',   ()         => ProcessManager.getAll());
  ipcMain.handle('process:diagnose', (_, id)    => ProcessManager.diagnoseIssue(id));
  ipcMain.handle('process:resolve',  (_, id)    => ProcessManager.resolveIssue(id));
  ipcMain.handle('process:retry',    (_, name)  => {
    logger.log('MANAGER', `Manual retry requested for: ${name}`);
    const entry = ProcessManager.getProcess(name);
    if (entry && entry.restartFn) {
      entry.restartFn().catch(err => logger.error('MANAGER', `Manual retry failed for ${name}`, err));
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
  ipcMain.handle('shell:openPath',     (_, filePath) => shell.openPath(filePath));
  ipcMain.handle('shell:openExternal', (_, url)      => shell.openExternal(url));

  // ── Settings (simple JSON file) ───────────────────────────────────────────
  const settingsPath = path.join(dataDir, 'settings.json');
  const fs           = require('fs');

  function readSettings() {
    try {
      if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (_) {}
    return {};
  }
  function writeSettings(data) {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
  }

  ipcMain.handle('settings:getAll', ()           => readSettings());
  ipcMain.handle('settings:get',    (_, key)     => readSettings()[key]);
  ipcMain.handle('settings:set',    (_, key, val) => {
    const s = readSettings();
    s[key]  = val;
    writeSettings(s);
    logger.log('INFO', `Setting updated: ${key}`);
    return true;
  });

  // ── Stub handlers for future phases ──────────────────────────────────────
  // These return empty/default responses so the UI doesn't crash in Phase 0.
  // Each will be replaced in the appropriate phase.

  const stub = (name) => ipcMain.handle(name, () => {
    logger.log('INFO', `Stub IPC called: ${name} — not yet implemented`);
    return null;
  });

  stub('accounts:list');
  stub('accounts:add');
  stub('accounts:update');
  stub('accounts:remove');
  stub('accounts:testImap');
  stub('accounts:testSmtp');
  stub('messages:folders');
  stub('messages:list');
  stub('messages:get');
  stub('messages:search');
  stub('messages:mark');
  stub('messages:delete');
  stub('messages:counts');
  stub('sync:run');
  stub('sync:runAll');
  stub('sync:status');
  stub('importer:importMbox');
  stub('importer:status');
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

  logger.log('BOOT', 'All IPC handlers registered');
}

module.exports = registerIpc;
