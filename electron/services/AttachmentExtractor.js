// ─────────────────────────────────────────────────────────────────────────────
// services/AttachmentExtractor.js — Extract attachments from .eml files
// Writes attachments to <msgid>/ folder next to the .eml file.
// Filenames preserved exactly as in the email for Explorer searchability.
// ─────────────────────────────────────────────────────────────────────────────

const fs     = require('fs');
const path   = require('path');
const logger = require('../logger');
const mime   = require('../helpers/mime');

/**
 * Extract all attachments from a raw email string.
 * Writes them to <emlPath without .eml>/<filename>
 *
 * @param {string} rawEmail  - full RFC 2822 email content
 * @param {string} emlPath   - path to the .eml file
 * @returns {{ names: string[], count: number }}
 */
function extractAttachments(rawEmail, emlPath) {
  const attachDir  = emlPath.replace(/\.eml$/, '');
  const names      = [];

  try {
    const parts = _getParts(rawEmail);
    const attachParts = parts.filter(p => _isAttachment(p.headers));

    if (attachParts.length === 0) {
      return { names: [], count: 0 };
    }

    // Create attachment folder
    if (!fs.existsSync(attachDir)) {
      fs.mkdirSync(attachDir, { recursive: true });
    }

    for (const part of attachParts) {
      const name = _writeAttachment(part, attachDir, names);
      if (name) names.push(name);
    }

    if (names.length > 0) {
      logger.log('WRITE', `Extracted ${names.length} attachment(s) to ${path.basename(attachDir)}/`);
    }

  } catch (err) {
    logger.warn('WRITE', `Attachment extraction failed for ${path.basename(emlPath)}: ${err.message}`);
  }

  return { names, count: names.length };
}

/**
 * Check if a raw email has attachments without extracting them.
 */
function hasAttachments(rawEmail) {
  try {
    const parts = _getParts(rawEmail);
    return parts.some(p => _isAttachment(p.headers));
  } catch (_) {
    return false;
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _getParts(rawEmail) {
  // Split headers and body
  const blankLine = rawEmail.search(/\r?\n\r?\n/);
  if (blankLine < 0) return [];

  const headerText = rawEmail.slice(0, blankLine);
  const body       = rawEmail.slice(blankLine + 2);
  const headers    = mime.parseHeaders(headerText);
  const ct         = headers['content-type'] || '';

  // Single-part message
  if (!ct.includes('multipart')) {
    return [{ headers, body }];
  }

  // Multipart — split on boundary
  const boundary = mime.extractBoundary(ct);
  if (!boundary) return [];

  const parts = mime.splitMultipart(body, boundary);

  // Recursively handle nested multipart
  const result = [];
  for (const part of parts) {
    const partCt = part.headers['content-type'] || '';
    if (partCt.includes('multipart')) {
      const nestedBoundary = mime.extractBoundary(partCt);
      if (nestedBoundary) {
        const nested = mime.splitMultipart(part.body, nestedBoundary);
        result.push(...nested);
      }
    } else {
      result.push(part);
    }
  }
  return result;
}

function _isAttachment(headers) {
  const cd = headers['content-disposition'] || '';
  const ct = headers['content-type']        || '';

  // Explicit attachment disposition
  if (/attachment/i.test(cd)) return true;

  // Inline with a filename is effectively an attachment
  if (/inline/i.test(cd) && mime.extractFilename(headers)) return true;

  // Non-text content types with a name
  if (!/^text\//i.test(ct) && !/^multipart\//i.test(ct) && mime.extractFilename(headers)) return true;

  return false;
}

function _writeAttachment(part, attachDir, existingNames) {
  const headers  = part.headers;
  const ct       = headers['content-type'] || 'application/octet-stream';
  const encoding = (headers['content-transfer-encoding'] || '').toLowerCase().trim();

  // Get filename
  let filename = mime.extractFilename(headers);
  if (!filename) {
    // Generate a fallback filename from content type
    const ext = _extFromMimeType(ct);
    filename  = `attachment${existingNames.length + 1}${ext}`;
  }

  filename = mime.sanitizeFilename(filename);

  // Handle filename collisions
  filename = _dedupeFilename(filename, attachDir);

  // Decode content
  let data;
  if (encoding === 'base64') {
    data = mime.decodeBase64Buffer(part.body);
  } else if (encoding === 'quoted-printable') {
    data = Buffer.from(mime.decodeQuotedPrintable(part.body), 'binary');
  } else {
    data = Buffer.from(part.body, 'binary');
  }

  if (!data || data.length === 0) return null;

  const filePath = path.join(attachDir, filename);
  fs.writeFileSync(filePath, data);

  return filename;
}

function _dedupeFilename(filename, dir) {
  let candidate = filename;
  let counter   = 1;
  const ext     = path.extname(filename);
  const base    = path.basename(filename, ext);

  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}_${counter}${ext}`;
    counter++;
  }
  return candidate;
}

function _extFromMimeType(ct) {
  const type = ct.split(';')[0].trim().toLowerCase();
  const map  = {
    'application/pdf'  : '.pdf',
    'image/jpeg'       : '.jpg',
    'image/png'        : '.png',
    'image/gif'        : '.gif',
    'text/plain'       : '.txt',
    'text/html'        : '.html',
    'application/zip'  : '.zip',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  return map[type] || '.bin';
}

module.exports = { extractAttachments, hasAttachments };
