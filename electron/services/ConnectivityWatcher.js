// ─────────────────────────────────────────────────────────────────────────────
// services/ConnectivityWatcher.js — Network connectivity monitor
// Pings smtp.gmail.com every 60 seconds.
// On reconnect after offline period, auto-flushes the outbox queue.
// ─────────────────────────────────────────────────────────────────────────────

const dns    = require('dns');
const logger = require('../logger');

const CHECK_INTERVAL_MS = 60000; // 60 seconds
const PING_HOST         = 'smtp.gmail.com';

let _isOnline    = true;
let _wasOffline  = false;
let _timer       = null;
let _onReconnect = null;
let _onChange    = null;
let mainWindow   = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Start watching connectivity.
 * @param {Object} options
 * @param {Function} options.onReconnect  — called when going online after offline
 * @param {Function} options.onChange     — called on any state change (online, offline)
 * @param {BrowserWindow} options.window  — Electron main window for IPC push
 */
function start(options = {}) {
  _onReconnect = options.onReconnect || null;
  _onChange    = options.onChange    || null;
  mainWindow   = options.window      || null;

  // Initial check
  _check();

  // Repeat every 60 seconds
  _timer = setInterval(_check, CHECK_INTERVAL_MS);
  logger.log('NET', `ConnectivityWatcher started — checking every ${CHECK_INTERVAL_MS / 1000}s`);
}

/**
 * Stop the watcher.
 */
function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  logger.log('NET', 'ConnectivityWatcher stopped');
}

/**
 * Get current online status.
 */
function isOnline() {
  return _isOnline;
}

/**
 * Manually trigger a connectivity check.
 */
async function checkNow() {
  return _check();
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _check() {
  return new Promise((resolve) => {
    dns.lookup(PING_HOST, (err) => {
      const online = !err;
      _handleResult(online);
      resolve(online);
    });
  });
}

function _handleResult(online) {
  const changed = online !== _isOnline;

  if (changed) {
    _isOnline = online;
    logger.log('NET', `Connectivity changed: ${online ? 'ONLINE ✓' : 'OFFLINE ✗'}`);

    if (_onChange) _onChange(online);
    _pushToRenderer(online);

    if (online && _wasOffline) {
      logger.log('NET', 'Reconnected — triggering outbox flush');
      if (_onReconnect) _onReconnect();
    }
  }

  _wasOffline = !online;
}

function _pushToRenderer(online) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('net:status', { online });
  }
}

module.exports = { start, stop, isOnline, checkNow };
