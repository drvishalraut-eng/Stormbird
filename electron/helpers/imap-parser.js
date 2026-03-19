// ─────────────────────────────────────────────────────────────────────────────
// helpers/imap-parser.js — IMAP response parser
// Handles the hardest part of raw IMAP: {N} byte-count literals.
// IMAP responses are NOT simple line-delimited text.
// A response like: * 1 FETCH (BODY[] {12345}\r\n<exactly 12345 bytes>)
// requires reading exactly N bytes after the literal marker.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ImapResponseBuffer — accumulates raw TCP data and emits complete responses.
 *
 * Usage:
 *   const buf = new ImapResponseBuffer();
 *   socket.on('data', chunk => buf.push(chunk));
 *   buf.on('response', line => { ... });
 */
class ImapResponseBuffer {
  constructor() {
    this._buf       = Buffer.alloc(0);
    this._handlers  = {};
    this._literalRemaining = 0;
    this._literalCallback  = null;
    this._literalChunks    = [];
  }

  on(event, handler) {
    this._handlers[event] = handler;
    return this;
  }

  _emit(event, data) {
    if (this._handlers[event]) this._handlers[event](data);
  }

  push(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    this._process();
  }

  _process() {
    while (this._buf.length > 0) {

      // ── In literal mode: consume exactly N bytes ──
      if (this._literalRemaining > 0) {
        if (this._buf.length < this._literalRemaining) {
          // Not enough data yet — wait for more
          return;
        }
        const literalData = this._buf.slice(0, this._literalRemaining);
        this._buf = this._buf.slice(this._literalRemaining);
        this._literalRemaining = 0;

        if (this._literalCallback) {
          this._literalCallback(literalData);
          this._literalCallback = null;
        }
        continue;
      }

      // ── Normal mode: find next \r\n ──
      const crlf = this._buf.indexOf('\r\n');
      if (crlf < 0) return; // incomplete line — wait for more data

      const line = this._buf.slice(0, crlf).toString('binary');
      this._buf  = this._buf.slice(crlf + 2);

      // Check if this line ends with a literal marker: {N}
      const literalMatch = line.match(/\{(\d+)\}$/);
      if (literalMatch) {
        const size = parseInt(literalMatch[1], 10);
        this._emit('line', line);

        // Switch to literal mode for next N bytes
        this._literalRemaining = size;
        this._literalCallback  = (data) => {
          this._emit('literal', { size, data });
        };
        continue;
      }

      this._emit('line', line);
    }
  }
}

/**
 * Parse a FETCH response line into structured data.
 * Handles: FLAGS, ENVELOPE, UID, RFC822.SIZE, BODY[]
 *
 * @param {string} line - the FETCH response line
 * @returns {{ uid, flags, size, envelope, hasBody }}
 */
function parseFetchLine(line) {
  const result = { uid: null, flags: [], size: 0, envelope: null, hasBody: false };

  // UID
  const uidMatch = line.match(/UID\s+(\d+)/i);
  if (uidMatch) result.uid = parseInt(uidMatch[1], 10);

  // FLAGS
  const flagsMatch = line.match(/FLAGS\s+\(([^)]*)\)/i);
  if (flagsMatch) {
    result.flags = flagsMatch[1].split(/\s+/).filter(Boolean);
  }

  // RFC822.SIZE
  const sizeMatch = line.match(/RFC822\.SIZE\s+(\d+)/i);
  if (sizeMatch) result.size = parseInt(sizeMatch[1], 10);

  // BODY[] literal follows
  if (/BODY\[\]/.test(line)) result.hasBody = true;

  return result;
}

/**
 * Parse a LIST response line into folder info.
 * e.g.: * LIST (\HasNoChildren) "/" "INBOX"
 * Returns: { flags, delimiter, name }
 */
function parseListLine(line) {
  const match = line.match(/^\* LIST \(([^)]*)\) "([^"]*)" (.+)$/i)
             || line.match(/^\* LIST \(([^)]*)\) NIL (.+)$/i);
  if (!match) return null;

  let name = match[3] || match[2];
  // Strip surrounding quotes
  name = name.replace(/^"(.*)"$/, '$1').trim();

  return {
    flags    : match[1].split(/\s+/).filter(Boolean),
    delimiter: match[2] || '/',
    name,
  };
}

/**
 * Parse a SELECT response to get folder metadata.
 * Returns: { exists, uidvalidity, uidnext }
 */
function parseSelectResponse(lines) {
  const result = { exists: 0, uidvalidity: 0, uidnext: 0 };
  for (const line of lines) {
    const existsMatch      = line.match(/^\* (\d+) EXISTS/i);
    const uidvalidityMatch = line.match(/UIDVALIDITY (\d+)/i);
    const uidnextMatch     = line.match(/UIDNEXT (\d+)/i);
    if (existsMatch)      result.exists      = parseInt(existsMatch[1], 10);
    if (uidvalidityMatch) result.uidvalidity  = parseInt(uidvalidityMatch[1], 10);
    if (uidnextMatch)     result.uidnext      = parseInt(uidnextMatch[1], 10);
  }
  return result;
}

/**
 * Extract tag from an IMAP tagged response line.
 * e.g.: "A001 OK [READ-WRITE] SELECT completed" → { tag: 'A001', ok: true }
 */
function parseTaggedResponse(line) {
  const match = line.match(/^([A-Z]\d+)\s+(OK|NO|BAD)\s*(.*)/i);
  if (!match) return null;
  return {
    tag    : match[1],
    ok     : match[2].toUpperCase() === 'OK',
    status : match[2].toUpperCase(),
    text   : match[3],
  };
}

module.exports = {
  ImapResponseBuffer,
  parseFetchLine,
  parseListLine,
  parseSelectResponse,
  parseTaggedResponse,
};
