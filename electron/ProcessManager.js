// ─────────────────────────────────────────────────────────────────────────────
// ProcessManager.js — Stormbird process monitor
// Every service registers here. Tracks health via heartbeats.
// Auto-restarts eligible processes. Escalates to IssueResolver on failure.
// ─────────────────────────────────────────────────────────────────────────────

const logger        = require('./logger');
const IssueResolver = require('./IssueResolver');

// ── Process states ────────────────────────────────────────────────────────────

const STATE = {
  BOOTING    : 'BOOTING',
  HEALTHY    : 'HEALTHY',
  RUNNING    : 'RUNNING',
  IDLE       : 'IDLE',
  SCHEDULED  : 'SCHEDULED',
  STALLED    : 'STALLED',
  ERROR      : 'ERROR',
  CRASHED    : 'CRASHED',
  RESTARTING : 'RESTARTING',
  DISABLED   : 'DISABLED',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_AUTO_RESTARTS  = 3;
const CHECK_INTERVAL_MS  = 15000; // check all processes every 15s
const RESTART_DELAY_MS   = 5000;  // wait 5s before restarting

// ── State ────────────────────────────────────────────────────────────────────

const processes  = new Map();   // name → ProcessEntry
let   checkTimer = null;
let   mainWindow = null;

// ── ProcessEntry structure ───────────────────────────────────────────────────
//
// {
//   name:              string
//   state:             STATE
//   restartable:       boolean
//   criticalOnCrash:   boolean   — if true, show blocking error, no auto-restart
//   restartFn:         function  — async fn to restart the process
//   heartbeatInterval: number    — expected ms between heartbeats
//   stalledAfter:      number    — ms with no heartbeat before marking STALLED
//   lastHeartbeat:     number    — Date.now() of last ping
//   lastEvent:         string    — human-readable last status message
//   startedAt:         number    — Date.now() when last started
//   restartCount:      number    — consecutive restart attempts
//   errorCount:        number    — consecutive errors since last HEALTHY
//   lastError:         string    — last error message
//   issues:            array     — unresolved issue objects
// }

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a process with the manager.
 * Call once per service at initialization time.
 *
 * Example:
 *   ProcessManager.register('ImapSync', {
 *     restartable:       true,
 *     restartFn:         () => imapClient.start(),
 *     heartbeatInterval: 30000,
 *     stalledAfter:      120000,
 *     criticalOnCrash:   false,
 *   });
 */
function register(name, options) {
  if (processes.has(name)) {
    logger.warn('MANAGER', `Process already registered: ${name}`);
    return;
  }

  const entry = {
    name,
    state              : STATE.BOOTING,
    restartable        : options.restartable        ?? false,
    criticalOnCrash    : options.criticalOnCrash    ?? false,
    restartFn          : options.restartFn          || null,
    stopFn             : options.stopFn             || null,
    heartbeatInterval  : options.heartbeatInterval  || 60000,
    stalledAfter       : options.stalledAfter        || options.heartbeatInterval * 3 || 180000,
    lastHeartbeat      : Date.now(),
    lastEvent          : 'Registered',
    startedAt          : Date.now(),
    restartCount       : 0,
    errorCount         : 0,
    lastError          : null,
    issues             : [],
  };

  processes.set(name, entry);
  logger.log('MANAGER', `Registered process: ${name}`);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

/**
 * Services call this regularly to signal they are alive and working.
 *
 * Example:
 *   ProcessManager.heartbeat('ImapSync', 'Fetching batch 14 of INBOX');
 */
function heartbeat(name, eventMessage) {
  const entry = processes.get(name);
  if (!entry) {
    logger.warn('MANAGER', `Heartbeat from unregistered process: ${name}`);
    return;
  }

  entry.lastHeartbeat = Date.now();
  entry.lastEvent     = eventMessage || 'OK';
  entry.errorCount    = 0;

  // Transition to HEALTHY if recovering
  if ([STATE.STALLED, STATE.ERROR, STATE.BOOTING, STATE.RESTARTING].includes(entry.state)) {
    _setState(entry, STATE.HEALTHY, `Recovered: ${entry.lastEvent}`);
  }

  _pushUpdate();
}

/**
 * Mark a process as actively doing work (e.g. in a sync loop).
 */
function running(name, eventMessage) {
  const entry = processes.get(name);
  if (!entry) return;
  entry.lastHeartbeat = Date.now();
  entry.lastEvent     = eventMessage || 'Running';
  entry.errorCount    = 0;
  _setState(entry, STATE.RUNNING, eventMessage);
  _pushUpdate();
}

/**
 * Mark a process as idle (waiting for work).
 */
function idle(name, eventMessage) {
  const entry = processes.get(name);
  if (!entry) return;
  entry.lastHeartbeat = Date.now();
  entry.lastEvent     = eventMessage || 'Idle';
  _setState(entry, STATE.IDLE, eventMessage);
  _pushUpdate();
}

/**
 * Mark a process as scheduled for future work.
 */
function scheduled(name, nextRunMs, eventMessage) {
  const entry = processes.get(name);
  if (!entry) return;
  entry.lastHeartbeat = Date.now();
  entry.lastEvent     = eventMessage || `Next run in ${Math.round((nextRunMs - Date.now()) / 60000)}m`;
  _setState(entry, STATE.SCHEDULED, entry.lastEvent);
  _pushUpdate();
}

// ── Error reporting ───────────────────────────────────────────────────────────

/**
 * Report an error from a process.
 * After MAX_AUTO_RESTARTS consecutive errors, escalates to IssueResolver.
 *
 * Example:
 *   ProcessManager.error('ImapSync', 'Connection timeout', err);
 */
function reportError(name, message, err) {
  const entry = processes.get(name);
  if (!entry) {
    logger.error('MANAGER', `Error from unregistered process: ${name}`, err);
    return;
  }

  entry.errorCount++;
  entry.lastError = message;
  logger.error(name, message, err);

  if (entry.criticalOnCrash) {
    _setState(entry, STATE.CRASHED, message);
    _handleCriticalCrash(entry, message, err);
    _pushUpdate();
    return;
  }

  if (entry.errorCount >= MAX_AUTO_RESTARTS) {
    _setState(entry, STATE.CRASHED, message);
    _handleCrashed(entry, message, err);
  } else {
    _setState(entry, STATE.ERROR, message);
    if (entry.restartable && entry.restartFn) {
      _scheduleRestart(entry, message, err);
    }
  }

  _pushUpdate();
}

/**
 * Explicitly mark a process as crashed (e.g. from an uncaught exception handler).
 */
function crashed(name, message, err) {
  reportError(name, message || 'Crashed', err);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _setState(entry, newState, reason) {
  const old = entry.state;
  entry.state = newState;
  if (old !== newState) {
    logger.log('MANAGER', `${entry.name}: ${old} → ${newState}${reason ? ' — ' + reason : ''}`);
  }
}

function _scheduleRestart(entry, errorMessage, err) {
  entry.restartCount++;
  const attempt = entry.restartCount;
  logger.log('MANAGER', `Scheduling restart of ${entry.name} (attempt ${attempt}/${MAX_AUTO_RESTARTS}) in ${RESTART_DELAY_MS / 1000}s`);

  _setState(entry, STATE.RESTARTING, `Attempt ${attempt}`);
  _pushUpdate();

  setTimeout(async () => {
    try {
      logger.log('MANAGER', `Restarting ${entry.name} (attempt ${attempt})`);
      await entry.restartFn();
      entry.lastHeartbeat = Date.now();
      entry.lastEvent     = `Restarted (attempt ${attempt})`;
      _setState(entry, STATE.HEALTHY, 'Restart succeeded');
      entry.restartCount  = 0;
      _pushUpdate();
    } catch (restartErr) {
      logger.error('MANAGER', `Restart of ${entry.name} failed`, restartErr);
      _setState(entry, STATE.CRASHED, 'Restart failed');
      _handleCrashed(entry, `Restart failed: ${restartErr.message}`, restartErr);
      _pushUpdate();
    }
  }, RESTART_DELAY_MS);
}

function _handleCrashed(entry, message, err) {
  logger.error('MANAGER', `${entry.name} has crashed after ${entry.restartCount} restart attempts`);

  const issue = {
    id          : `${entry.name}-${Date.now()}`,
    process     : entry.name,
    status      : 'crashed',
    errorMsg    : message,
    stack       : err && err.stack ? err.stack : null,
    occurredAt  : Date.now(),
    resolved    : false,
    diagnosedBy : null,
    diagnosis   : null,
    logs        : logger.getByCategory(entry.name).slice(-50),
  };

  entry.issues.push(issue);

  // Notify renderer to show issue card
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('process:issue', issue);
  }
}

function _handleCriticalCrash(entry, message, err) {
  logger.error('MANAGER', `CRITICAL: ${entry.name} crashed — user action required`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('process:critical', {
      process  : entry.name,
      message,
      stack    : err && err.stack ? err.stack : null,
    });
  }
}

function _checkAllProcesses() {
  const now = Date.now();

  processes.forEach((entry) => {
    // Skip processes that don't need heartbeat monitoring
    if ([STATE.IDLE, STATE.SCHEDULED, STATE.DISABLED, STATE.CRASHED,
         STATE.RESTARTING, STATE.BOOTING].includes(entry.state)) {
      return;
    }

    const silence = now - entry.lastHeartbeat;
    if (silence > entry.stalledAfter) {
      if (entry.state !== STATE.STALLED) {
        logger.warn('MANAGER', `${entry.name} stalled — no heartbeat for ${Math.round(silence / 1000)}s`);
        _setState(entry, STATE.STALLED, `No heartbeat for ${Math.round(silence / 1000)}s`);
        _handleCrashed(entry, `Stalled — no heartbeat for ${Math.round(silence / 1000)}s`, null);
        _pushUpdate();
      }
    }
  });
}

function _pushUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('process:update', getAll());
  } catch (_) {}
}

// ── Queries ───────────────────────────────────────────────────────────────────

function getAll() {
  const result = [];
  processes.forEach((entry) => {
    result.push({
      name         : entry.name,
      state        : entry.state,
      lastEvent    : entry.lastEvent,
      lastHeartbeat: entry.lastHeartbeat,
      startedAt    : entry.startedAt,
      restartCount : entry.restartCount,
      errorCount   : entry.errorCount,
      lastError    : entry.lastError,
      issues       : entry.issues.filter(i => !i.resolved),
    });
  });
  return result;
}

function getProcess(name) {
  return processes.get(name) || null;
}

// ── Diagnosis request (from UI) ───────────────────────────────────────────────

async function diagnoseIssue(issueId) {
  // Find the issue across all processes
  let targetIssue = null;
  let targetEntry = null;

  processes.forEach((entry) => {
    const issue = entry.issues.find(i => i.id === issueId);
    if (issue) {
      targetIssue = issue;
      targetEntry = entry;
    }
  });

  if (!targetIssue || !targetEntry) {
    logger.warn('MANAGER', `Diagnosis requested for unknown issue: ${issueId}`);
    return null;
  }

  logger.log('MANAGER', `Diagnosing issue: ${issueId} for process ${targetEntry.name}`);

  const diagnosis = await IssueResolver.diagnose(targetIssue, targetEntry);
  targetIssue.diagnosis   = diagnosis;
  targetIssue.diagnosedBy = diagnosis.source; // 'rules' or 'claude'

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('process:diagnosis', { issueId, diagnosis });
  }

  return diagnosis;
}

function resolveIssue(issueId) {
  processes.forEach((entry) => {
    const issue = entry.issues.find(i => i.id === issueId);
    if (issue) {
      issue.resolved   = true;
      issue.resolvedAt = Date.now();
      logger.log('MANAGER', `Issue resolved: ${issueId} for ${entry.name}`);
      _pushUpdate();
    }
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function start(browserWindow) {
  mainWindow  = browserWindow;
  checkTimer  = setInterval(_checkAllProcesses, CHECK_INTERVAL_MS);
  logger.log('MANAGER', 'Process Manager started');
}

function stop() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  logger.log('MANAGER', 'Process Manager stopped');
}

/**
 * Gracefully stop a single named process.
 * Sets state to DISABLED and calls its stopFn if registered.
 */
async function stopProcess(name) {
  const entry = processes.get(name);
  if (!entry) return;
  logger.log('MANAGER', `Stopping ${name}…`);
  _setState(entry, STATE.DISABLED, 'Manually stopped');
  if (entry.stopFn) {
    try { await entry.stopFn(); } catch (_) {}
  }
}

/**
 * Stop all running processes gracefully, in safe order.
 * Returns when all stop functions have resolved.
 */
async function stopAll() {
  logger.log('MANAGER', 'Stopping all processes…');

  // Stop in reverse-dependency order:
  // connectivity watcher → sync → smtp → integrity → others
  const ORDER = ['ConnectivityWatcher', 'ImapSync', 'SmtpSend', 'IntegrityScan'];

  for (const name of ORDER) {
    await stopProcess(name);
  }

  // Stop any remaining registered processes
  for (const [name] of processes) {
    if (!ORDER.includes(name)) await stopProcess(name);
  }

  stop(); // stop the heartbeat checker
  logger.log('MANAGER', 'All processes stopped');
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  STATE,
  register,
  heartbeat,
  running,
  idle,
  scheduled,
  reportError,
  crashed,
  getAll,
  getProcess,
  diagnoseIssue,
  resolveIssue,
  start,
  stop,
  stopProcess,
  stopAll,
};
