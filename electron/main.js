// ─────────────────────────────────────────────────────────────────────────────
// main.js — Stormbird Electron main process
// Boots the app, initializes core services, registers IPC handlers.
// ─────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Determine data directory ──────────────────────────────────────────────────
// Portable: Stormbird-Data/ lives next to the .exe (or next to electron/ in dev)

function getDataDir() {
  if (app.isPackaged) {
    // Packaged: exe is in Stormbird-win32-x64/
    return path.join(path.dirname(process.execPath), 'Stormbird-Data');
  } else {
    // Dev: project root
    return path.join(__dirname, '..', 'Stormbird-Data');
  }
}

const DATA_DIR = getDataDir();

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Initialize logger FIRST — before anything else ────────────────────────────
const logger = require('./logger');
logger.init(DATA_DIR, null); // window reference added after window is created

// ── Load core services ────────────────────────────────────────────────────────
const ProcessManager = require('./ProcessManager');

// ── IPC handlers ─────────────────────────────────────────────────────────────
const registerIpc = require('./ipc/index');

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width          : 1280,
    height         : 800,
    minWidth       : 900,
    minHeight      : 600,
    frame          : false,   // custom titlebar
    backgroundColor: '#000000',
    show           : false,   // show after ready-to-show
    webPreferences : {
      preload         : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration : false,
      sandbox         : false,
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Packaged: __dirname = resources/app/electron/
    const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(htmlPath);
  }

  // Show window once loaded — avoids white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.log('BOOT', 'Main window ready');
  });

  // Update logger and process manager with window reference
  logger.setWindow(mainWindow);
  ProcessManager.start(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  logger.log('BOOT', `Stormbird starting — data dir: ${DATA_DIR}`);
  logger.log('BOOT', `Platform: ${process.platform} — Electron: ${process.versions.electron} — Node: ${process.versions.node}`);

  const win = createWindow();

  // Register all IPC handlers
  registerIpc(ipcMain, DATA_DIR, win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  logger.log('BOOT', 'All windows closed — quitting');
  ProcessManager.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  logger.log('BOOT', 'App quitting — flushing logs');
});

// ── Uncaught exception handler ────────────────────────────────────────────────
// Log crashes before Electron shows its default error dialog

process.on('uncaughtException', (err) => {
  logger.error('BOOT', 'Uncaught exception in main process', err);

  // Write to error log next to exe for easy debugging
  const errorLogPath = app.isPackaged
    ? path.join(path.dirname(process.execPath), 'Stormbird-error.log')
    : path.join(__dirname, '..', 'Stormbird-error.log');

  try {
    fs.appendFileSync(errorLogPath, `\n[${new Date().toISOString()}] ${err.stack || err.message}\n`);
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  logger.error('BOOT', 'Unhandled promise rejection', { reason: String(reason) });
});

// ── Exports (for IPC modules) ─────────────────────────────────────────────────
module.exports = { getDataDir, DATA_DIR };
