// ─────────────────────────────────────────────────────────────────────────────
// helpers/mime.js — MIME parsing utilities
// Handles: encoded-word headers, quoted-printable, base64, multipart splitting
// Pure Node.js — no external dependencies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse raw RFC 2822 headers from a string.
 * Returns an object with lowercase header names as keys.
 * Handles folded headers (continuation lines starting with whitespace).
 *
 * @param {string} headerText - raw header block (before the blank line)
 * @returns {Object} headers map
 */
function parseHeaders(headerText) {
  const headers = {};
  // Unfold: join continuation lines
  const unfolded = headerText.replace(/\r?\n([ \t])/g, ' ');
  const lines    = unfolded.split(/\r?\n/);

  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const name  = line.slice(0, colon).toLowerCase().trim();
    const value = line.slice(colon + 1).trim();
    // Keep first occurrence (RFC 2822 allows duplicates, we take first)
    if (!headers[name]) {
      headers[name] = value;
    }
  }
  return headers;
}

/**
 * Decode an encoded-word string: =?charset?encoding?text?=
 * Handles UTF-8, ISO-8859-1, Base64 (B), Quoted-Printable (Q).
 */
function decodeEncodedWords(str) {
  if (!str) return '';
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        const buf = Buffer.from(text, 'base64');
        return buf.toString(_normalizeCharset(charset));
      } else {
        // Q encoding: _ → space, =XX → hex byte
        const qText = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        return qText;
      }
    } catch (_) {
      return text;
    }
  });
}

/**
 * Decode quoted-printable encoded content.
 */
function decodeQuotedPrintable(str) {
  if (!str) return '';
  return str
    .replace(/=\r?\n/g, '')  // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Decode base64 content to a string.
 */
function decodeBase64(str, charset) {
  if (!str) return '';
  try {
    const clean = str.replace(/\s/g, '');
    const buf   = Buffer.from(clean, 'base64');
    return buf.toString(_normalizeCharset(charset) || 'utf8');
  } catch (_) {
    return '';
  }
}

/**
 * Decode base64 content to a Buffer (for binary attachments).
 */
function decodeBase64Buffer(str) {
  if (!str) return Buffer.alloc(0);
  try {
    return Buffer.from(str.replace(/\s/g, ''), 'base64');
  } catch (_) {
    return Buffer.alloc(0);
  }
}

/**
 * Split a multipart message body into parts.
 * Returns array of { headers, body } objects.
 *
 * @param {string} body     - full body content
 * @param {string} boundary - MIME boundary string
 */
function splitMultipart(body, boundary) {
  const parts  = [];
  const delim  = '--' + boundary;
  const end    = '--' + boundary + '--';
  const lines  = body.split(/\r?\n/);

  let inPart       = false;
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith(end)) {
      if (inPart && currentLines.length > 0) {
        parts.push(_parsePart(currentLines.join('\n')));
      }
      break;
    }
    if (line.startsWith(delim)) {
      if (inPart && currentLines.length > 0) {
        parts.push(_parsePart(currentLines.join('\n')));
      }
      inPart       = true;
      currentLines = [];
      continue;
    }
    if (inPart) {
      currentLines.push(line);
    }
  }

  return parts;
}

/**
 * Extract boundary string from a Content-Type header value.
 * e.g. 'multipart/mixed; boundary="----=_Part_123"' → '----=_Part_123'
 */
function extractBoundary(contentType) {
  if (!contentType) return null;
  const match = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  return match ? match[1] : null;
}

/**
 * Extract charset from a Content-Type header value.
 * e.g. 'text/html; charset=utf-8' → 'utf-8'
 */
function extractCharset(contentType) {
  if (!contentType) return null;
  const match = contentType.match(/charset=["']?([^"';\s]+)["']?/i);
  return match ? match[1] : null;
}

/**
 * Extract filename from Content-Disposition or Content-Type header.
 */
function extractFilename(headers) {
  const cd = headers['content-disposition'] || '';
  const ct = headers['content-type'] || '';

  // Try Content-Disposition: attachment; filename="foo.pdf"
  let match = cd.match(/filename\*?=["']?(?:UTF-8'')?([^"';\r\n]+)["']?/i);
  if (match) return decodeEncodedWords(match[1].trim());

  // Try Content-Type: application/pdf; name="foo.pdf"
  match = ct.match(/name=["']?([^"';\r\n]+)["']?/i);
  if (match) return decodeEncodedWords(match[1].trim());

  return null;
}

/**
 * Sanitize a filename for safe use on Windows filesystem.
 * Strips characters illegal on Windows: \ / : * ? " < > |
 */
function sanitizeFilename(name) {
  if (!name) return 'attachment';
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .trim()
    .slice(0, 200) || 'attachment';
}

/**
 * Parse a From/To/Cc header value into { name, address } pairs.
 * Handles: "Name <email>", "email", multiple addresses separated by comma.
 */
function parseAddresses(str) {
  if (!str) return [];
  const decoded = decodeEncodedWords(str);
  const results = [];

  // Split on commas that are not inside quotes or angle brackets
  const parts = decoded.split(/,(?![^<]*>)(?![^"]*")/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const angleMatch = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
    if (angleMatch) {
      results.push({
        name   : angleMatch[1].trim(),
        address: angleMatch[2].trim().toLowerCase(),
      });
    } else if (trimmed.includes('@')) {
      results.push({ name: '', address: trimmed.toLowerCase() });
    }
  }
  return results;
}

/**
 * Extract first address string for display (name or email).
 */
function firstAddress(str) {
  const addrs = parseAddresses(str);
  if (!addrs.length) return str || '';
  return addrs[0].name || addrs[0].address || str;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _parsePart(text) {
  const blankLine = text.search(/\r?\n\r?\n/);
  if (blankLine < 0) return { headers: {}, body: text };
  const headerText = text.slice(0, blankLine);
  const body       = text.slice(blankLine).replace(/^\r?\n\r?\n?/, '');
  return { headers: parseHeaders(headerText), body };
}

function _normalizeCharset(charset) {
  if (!charset) return 'utf8';
  const c = charset.toLowerCase().replace(/[-_]/g, '');
  if (c === 'utf8' || c === 'utf8bom') return 'utf8';
  if (c === 'latin1' || c === 'iso88591') return 'latin1';
  if (c === 'ascii' || c === 'usascii') return 'ascii';
  return 'utf8'; // safe fallback
}

module.exports = {
  parseHeaders,
  decodeEncodedWords,
  decodeQuotedPrintable,
  decodeBase64,
  decodeBase64Buffer,
  splitMultipart,
  extractBoundary,
  extractCharset,
  extractFilename,
  sanitizeFilename,
  parseAddresses,
  firstAddress,
};
