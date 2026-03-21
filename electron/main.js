// ─────────────────────────────────────────────────────────────────────────────
// main.js — Stormbird Electron main process
// ─────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Config file — persists user-chosen data directory ─────────────────────────
// Stored next to the executable so it travels with the USB drive.

function getConfigPath() {
  return path.join(path.dirname(process.execPath), 'stormbird-config.json');
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return {};
}

function writeConfig(obj) {
  try {
    const existing = readConfig();
    fs.writeFileSync(getConfigPath(), JSON.stringify({ ...existing, ...obj }, null, 2), 'utf8');
    return true;
  } catch (_) { return false; }
}

function getDataDir() {
  // 1. User-configured path (set via setup wizard or settings)
  const config = readConfig();
  if (config.dataDir && config.dataDir.trim()) {
    return config.dataDir.trim();
  }
  // 2. Default — next to the executable
  if (app.isPackaged) {
    if (process.platform === 'darwin') {
      // .app/Contents/MacOS/Stormbird → go up 3 levels to folder containing .app
      return path.join(path.dirname(process.execPath), '..', '..', '..', 'Stormbird-Data');
    }
    return path.join(path.dirname(process.execPath), 'Stormbird-Data');
  }
  return path.join(__dirname, '..', 'Stormbird-Data');
}

const DATA_DIR = getDataDir();
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Logger first ─────────────────────────────────────────────────────────────
const logger = require('./logger');
logger.init(DATA_DIR, null);

// ── Services ──────────────────────────────────────────────────────────────────
const ProcessManager = require('./ProcessManager');
const MessageStore   = require('./services/MessageStore');
const registerIpc    = require('./ipc/index');

let mainWindow = null;

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width : 1280, height: 800,
    minWidth: 900, minHeight: 600,
    frame: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.log('BOOT', 'Window ready');
  });

  logger.setWindow(mainWindow);
  ProcessManager.start(mainWindow);

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

app.whenReady().then(async () => {
  logger.log('BOOT', `Stormbird v${_getVersion()} starting — data: ${DATA_DIR}`);

  const win = createWindow();
  registerIpc(ipcMain, DATA_DIR, win);

  // Initialize MessageStore
  try {
    await MessageStore.init(DATA_DIR);
  } catch (err) {
    logger.error('BOOT', 'MessageStore failed to initialize', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  logger.log('BOOT', 'Closing — flushing database');
  MessageStore.close(DATA_DIR);
  ProcessManager.stop();
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  logger.error('BOOT', 'Uncaught exception', err);
  try {
    const errLog = app.isPackaged
      ? path.join(path.dirname(process.execPath), 'Stormbird-error.log')
      : path.join(__dirname, '..', 'Stormbird-error.log');
    fs.appendFileSync(errLog, `\n[${new Date().toISOString()}] ${err.stack || err.message}\n`);
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  logger.error('BOOT', 'Unhandled rejection', { reason: String(reason) });
});

function _getVersion() {
  try { return require('../package.json').version; } catch (_) { return '?'; }
}

module.exports = { getDataDir, DATA_DIR, readConfig, writeConfig };
