// ─────────────────────────────────────────────────────────────────────────────
// logger.js — Stormbird singleton logger
// Every service imports this and calls log(category, message, data?)
// Outputs to: console panel (via IPC), stormbird.log file (rotating)
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024; // 10MB per file
const MAX_LOG_FILES      = 3;                 // keep last 3 rotated files
const MAX_MEMORY_LINES   = 5000;              // cap in-memory log buffer

// Color codes for terminal output during development
const CATEGORY_COLORS = {
  BOOT   : '\x1b[90m',   // grey
  DB     : '\x1b[34m',   // blue
  IMAP   : '\x1b[36m',   // cyan
  MBOX   : '\x1b[35m',   // magenta
  WRITE  : '\x1b[32m',   // green
  SEND   : '\x1b[32m',   // green
  BACKUP : '\x1b[33m',   // orange/yellow
  CHECK  : '\x1b[35m',   // purple
  DRIVE  : '\x1b[36m',   // cyan
  MANAGER: '\x1b[33m',   // yellow
  PROCESS: '\x1b[33m',   // yellow
  CLAUDE : '\x1b[35m',   // magenta
  WARN   : '\x1b[33m',   // amber
  ERROR  : '\x1b[31m',   // red
  INFO   : '\x1b[37m',   // white
};
const RESET = '\x1b[0m';

// ── State ────────────────────────────────────────────────────────────────────

let logFilePath  = null;   // set once dataDir is known
let logStream    = null;   // writable stream to current log file
let memoryLines  = [];     // in-memory ring buffer
let mainWindow   = null;   // reference to BrowserWindow for IPC push
let initialized  = false;

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Call once at app start with the data directory path.
 * Creates the log file and rotates old ones if needed.
 */
function init(dataDir, browserWindow) {
  mainWindow  = browserWindow || null;
  logFilePath = path.join(dataDir, 'stormbird.log');

  _rotateIfNeeded();

  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  initialized = true;

  log('BOOT', `Stormbird v${_getVersion()} starting`);
  log('BOOT', `Log file: ${logFilePath}`);
}

/**
 * Update the browser window reference after window is created.
 */
function setWindow(browserWindow) {
  mainWindow = browserWindow;
}

// ── Core log function ─────────────────────────────────────────────────────────

/**
 * log(category, message, data?)
 *
 * category — one of the CATEGORY_COLORS keys, or any string
 * message  — plain string description
 * data     — optional object/string for extra detail (shown as JSON)
 *
 * Example:
 *   log('IMAP', 'Fetching batch 14', { uid_start: 14204, uid_end: 14303 })
 */
function log(category, message, data) {
  const now       = new Date();
  const timestamp = _formatTimestamp(now);
  const cat       = (category || 'INFO').toUpperCase().padEnd(7);
  const extra     = data !== undefined ? '  ' + JSON.stringify(data) : '';
  const line      = `${timestamp} [${cat}] ${message}${extra}`;

  // ── 1. Terminal output (dev mode) ──
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.INFO;
  process.stdout.write(`${color}${line}${RESET}\n`);

  // ── 2. File output ──
  if (logStream) {
    logStream.write(line + '\n');
    _rotateIfNeeded();
  }

  // ── 3. Memory buffer ──
  const entry = {
    timestamp,
    category: category || 'INFO',
    message,
    data: data !== undefined ? data : null,
    line,
    ms: now.getTime(),
  };

  memoryLines.push(entry);
  if (memoryLines.length > MAX_MEMORY_LINES) {
    memoryLines.shift(); // drop oldest
  }

  // ── 4. Push to renderer console panel via IPC ──
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('logger:line', entry);
    } catch (_) {
      // window may be closing — ignore
    }
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

function warn(category, message, data) {
  log('WARN', `[${category}] ${message}`, data);
}

function error(category, message, err) {
  const detail = err
    ? { message: err.message, stack: err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : undefined }
    : undefined;
  log('ERROR', `[${category}] ${message}`, detail);
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Return last N lines from memory buffer */
function getRecent(n) {
  return memoryLines.slice(-Math.min(n || 100, MAX_MEMORY_LINES));
}

/** Return all memory lines for a specific category */
function getByCategory(category) {
  return memoryLines.filter(e => e.category === category);
}

/** Return all memory lines for a specific process (last N) */
function getForProcess(processName, n) {
  return memoryLines
    .filter(e => e.message.includes(processName) || (e.data && JSON.stringify(e.data).includes(processName)))
    .slice(-(n || 50));
}

// ── Internals ────────────────────────────────────────────────────────────────

function _formatTimestamp(date) {
  const pad  = (n, w) => String(n).padStart(w, '0');
  const y    = date.getFullYear();
  const mo   = pad(date.getMonth() + 1, 2);
  const d    = pad(date.getDate(), 2);
  const h    = pad(date.getHours(), 2);
  const mi   = pad(date.getMinutes(), 2);
  const s    = pad(date.getSeconds(), 2);
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function _getVersion() {
  try {
    return require('../package.json').version;
  } catch (_) {
    return 'unknown';
  }
}

function _rotateIfNeeded() {
  if (!logFilePath) return;
  try {
    if (!fs.existsSync(logFilePath)) return;
    const stat = fs.statSync(logFilePath);
    if (stat.size < MAX_LOG_FILE_BYTES) return;

    // Close current stream
    if (logStream) {
      logStream.end();
      logStream = null;
    }

    // Rotate: .log → .log.1 → .log.2 → .log.3 (drop .log.3)
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = `${logFilePath}.${i}`;
      const to   = `${logFilePath}.${i + 1}`;
      if (fs.existsSync(from)) {
        if (i === MAX_LOG_FILES - 1) {
          fs.unlinkSync(from); // drop oldest
        } else {
          fs.renameSync(from, to);
        }
      }
    }
    fs.renameSync(logFilePath, `${logFilePath}.1`);

    // Reopen fresh stream
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  } catch (e) {
    // Rotation failed — not fatal, continue logging
    process.stderr.write(`[LOGGER] Rotation failed: ${e.message}\n`);
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { init, setWindow, log, warn, error, getRecent, getByCategory, getForProcess };
