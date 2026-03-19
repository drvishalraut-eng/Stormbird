// ─────────────────────────────────────────────────────────────────────────────
// helpers/mbox-splitter.js — Streaming MBOX → individual message splitter
// Uses fs.createReadStream — never loads the full MBOX into memory.
// Handles files of any size including 2GB+ Thunderbird mailboxes.
// ─────────────────────────────────────────────────────────────────────────────

const fs     = require('fs');
const logger = require('../logger');

/**
 * Split an MBOX file into individual raw message strings.
 * Calls onMessage(rawMessage, index) for each message found.
 * Calls onDone(totalCount, skippedCount) when complete.
 * Calls onError(err) on fatal errors.
 *
 * @param {string}   mboxPath  - path to .mbox file
 * @param {Function} onMessage - async callback(rawMessage: string, index: number)
 * @param {Function} onProgress - callback(processed: number, total: number)
 * @param {Function} onDone    - callback(total: number, skipped: number)
 * @param {Function} onError   - callback(err: Error)
 */
function splitMbox(mboxPath, onMessage, onProgress, onDone, onError) {
  // Get file size for progress reporting
  let fileSize    = 0;
  let bytesRead   = 0;
  let msgIndex    = 0;
  let skipped     = 0;
  let currentMsg  = [];
  let lineBuffer  = '';

  try {
    fileSize = fs.statSync(mboxPath).size;
  } catch (err) {
    onError(new Error(`Cannot read MBOX file: ${err.message}`));
    return;
  }

  logger.log('MBOX', `Starting split of ${mboxPath} (${Math.round(fileSize / 1024 / 1024)}MB)`);

  const stream = fs.createReadStream(mboxPath, {
    encoding  : 'binary',  // binary to handle any encoding safely
    highWaterMark: 64 * 1024, // 64KB chunks
  });

  stream.on('data', (chunk) => {
    bytesRead += chunk.length;

    // Split chunk into lines, handling the leftover from previous chunk
    const text  = lineBuffer + chunk;
    const lines = text.split('\n');

    // Last element may be incomplete — save for next chunk
    lineBuffer = lines.pop();

    for (const line of lines) {
      _processLine(line + '\n', currentMsg, (rawMsg) => {
        _emitMessage(rawMsg, msgIndex++, onMessage, onError, (ok) => {
          if (!ok) skipped++;
        });
        currentMsg = [];
      });
    }

    // Report progress every ~1MB
    if (bytesRead % (1024 * 1024) < 65536) {
      const pct = fileSize > 0 ? Math.round((bytesRead / fileSize) * 100) : 0;
      onProgress && onProgress(msgIndex, pct);
    }
  });

  stream.on('end', () => {
    // Handle remaining line buffer
    if (lineBuffer) {
      _processLine(lineBuffer, currentMsg, (rawMsg) => {
        _emitMessage(rawMsg, msgIndex++, onMessage, onError, (ok) => {
          if (!ok) skipped++;
        });
        currentMsg = [];
      });
    }

    // Emit last message if any content remains
    if (currentMsg.length > 0) {
      const raw = currentMsg.join('');
      if (raw.trim()) {
        _emitMessage(raw, msgIndex++, onMessage, onError, (ok) => {
          if (!ok) skipped++;
          onDone(msgIndex, skipped);
        });
        return;
      }
    }

    logger.log('MBOX', `Split complete — ${msgIndex} messages found, ${skipped} skipped`);
    onDone(msgIndex, skipped);
  });

  stream.on('error', (err) => {
    logger.error('MBOX', `Stream error reading ${mboxPath}`, err);
    onError(err);
  });
}

// ── Internals ─────────────────────────────────────────────────────────────────

/**
 * Process a single line, detecting MBOX message boundaries.
 * An MBOX message starts with "From " at the beginning of a line.
 * Lines starting with ">From " are escaped "From " lines inside message body.
 */
function _processLine(line, currentMsg, onBoundary) {
  // MBOX boundary: line starts with "From " (note the space)
  // but NOT ">From " which is an escaped From line in the body
  if (line.match(/^From [^\n]/) && currentMsg.length > 0) {
    // Emit the accumulated message
    const raw = currentMsg.join('');
    if (raw.trim()) {
      onBoundary(raw);
    }
    // Start new message with this line (the From_ envelope line)
    currentMsg.length = 0;
    currentMsg.push(line);
  } else {
    // Unescape ">From " → "From " in body
    currentMsg.push(line.replace(/^>From /, 'From '));
  }
}

/**
 * Emit a single raw message by calling onMessage.
 * Validates the message has a minimum structure before emitting.
 */
function _emitMessage(raw, index, onMessage, onError, callback) {
  // Minimal validation: must have some header content
  if (!raw || raw.trim().length < 10) {
    callback(false);
    return;
  }

  try {
    onMessage(raw, index);
    callback(true);
  } catch (err) {
    logger.warn('MBOX', `Error processing message ${index}: ${err.message}`);
    callback(false);
  }
}

/**
 * Count messages in an MBOX file without parsing them.
 * Fast — just counts "From " boundary lines.
 * Returns a Promise<number>.
 */
function countMessages(mboxPath) {
  return new Promise((resolve, reject) => {
    let count      = 0;
    let lineBuffer = '';

    const stream = fs.createReadStream(mboxPath, {
      encoding: 'binary',
      highWaterMark: 64 * 1024,
    });

    stream.on('data', (chunk) => {
      const text  = lineBuffer + chunk;
      const lines = text.split('\n');
      lineBuffer  = lines.pop();
      for (const line of lines) {
        if (line.match(/^From [^\n]/)) count++;
      }
    });

    stream.on('end',   () => resolve(count));
    stream.on('error', reject);
  });
}

module.exports = { splitMbox, countMessages };
