// ─────────────────────────────────────────────────────────────────────────────
// ipc/messages.ipc.js — IPC handlers for message operations
// ─────────────────────────────────────────────────────────────────────────────

const path         = require('path');
const fs           = require('fs');
const logger       = require('../logger');
const MessageStore = require('../services/MessageStore');
const { readEml }  = require('../helpers/eml');
const mime         = require('../helpers/mime');

function register(ipcMain, dataDir) {
  const mailDir = path.join(dataDir, 'mail');

  // ── Get folders for an account ──
  ipcMain.handle('messages:folders', (_, accountId) => {
    return MessageStore.getFolders(accountId);
  });

  // ── List messages in a folder ──
  ipcMain.handle('messages:list', (_, query) => {
    return MessageStore.listMessages(query);
  });

  // ── Get a single message — reads .eml from disk and parses body ──
  ipcMain.handle('messages:get', (_, id) => {
    const msg = MessageStore.getMessage(id);
    if (!msg) return null;

    // Read .eml file and extract body
    try {
      const emlPath = path.join(mailDir, msg.eml_path);
      const raw     = readEml(emlPath).toString('binary');
      const body    = _extractBody(raw);

      // Mark as read
      MessageStore.markMessage(id, 'read', true);

      return { ...msg, ...body };
    } catch (err) {
      logger.warn('DB', `Could not read .eml for message ${id}: ${err.message}`);
      return { ...msg, body_text: '[Email file could not be read]', body_html: null };
    }
  });

  // ── Search messages ──
  ipcMain.handle('messages:search', (_, query) => {
    return MessageStore.listMessages({ ...query, search: query.search });
  });

  // ── Mark a message (read, starred, deleted) ──
  ipcMain.handle('messages:mark', (_, id, flags) => {
    for (const [flag, value] of Object.entries(flags)) {
      MessageStore.markMessage(id, flag, value);
    }
    return true;
  });

  // ── Delete a message ──
  ipcMain.handle('messages:delete', (_, id) => {
    const msg = MessageStore.getMessage(id);
    if (msg) {
      // Move to trash folder instead of deleting
      MessageStore.markMessage(id, 'deleted', true);
      logger.log('DB', `Message marked deleted: ${msg.subject}`);
    }
    return true;
  });

  // ── Get counts per folder ──
  ipcMain.handle('messages:counts', (_, accountId) => {
    return MessageStore.getCounts(accountId);
  });

  // ── Global search across all accounts ──
  ipcMain.handle('messages:globalSearch', (_, query, limit) => {
    return MessageStore.globalSearch(query, limit || 100);
  });

  // ── First run check ──
  ipcMain.handle('app:isFirstRun', () => {
    return MessageStore.isFirstRun();
  });

  // ── Get all folder counts (for badges) ──
  ipcMain.handle('messages:allCounts', () => {
    const { db } = { db: MessageStore._getDb() };
    if (!db) return {};
    try {
      const rows = db.exec(`
        SELECT account_id, folder,
               COUNT(*) as total,
               SUM(CASE WHEN flags NOT LIKE '%"read"%' AND flags NOT LIKE '%\\\\Seen%' THEN 1 ELSE 0 END) as unread
        FROM messages GROUP BY account_id, folder
      `);
      const result = {};
      if (rows[0]) {
        for (const row of rows[0].values) {
          const [acct, folder, total, unread] = row;
          if (!result[acct]) result[acct] = {};
          result[acct][folder] = { total, unread: unread || 0 };
        }
      }
      return result;
    } catch (_) { return {}; }
  });

  logger.log('BOOT', 'Message IPC handlers registered');
}

// ── Body extraction ───────────────────────────────────────────────────────────

function _extractBody(rawEmail) {
  const blankLine = rawEmail.search(/\r?\n\r?\n/);
  if (blankLine < 0) return { body_text: rawEmail, body_html: null };

  let headerText = rawEmail.slice(0, blankLine);
  // Skip MBOX envelope line
  if (headerText.startsWith('From ')) {
    headerText = headerText.slice(headerText.indexOf('\n') + 1);
  }

  const body    = rawEmail.slice(blankLine + 2);
  const headers = mime.parseHeaders(headerText);
  const ct      = headers['content-type'] || 'text/plain';

  if (ct.includes('multipart')) {
    return _extractMultipartBody(body, ct);
  }

  return _extractSingleBody(body, headers);
}

function _extractSingleBody(body, headers) {
  const ct       = headers['content-type'] || 'text/plain';
  const encoding = (headers['content-transfer-encoding'] || '').toLowerCase().trim();
  const charset  = mime.extractCharset(ct) || 'utf-8';

  let decoded;
  if (encoding === 'base64') {
    decoded = mime.decodeBase64(body, charset);
  } else if (encoding === 'quoted-printable') {
    decoded = mime.decodeQuotedPrintable(body);
  } else {
    decoded = body;
  }

  if (ct.includes('text/html')) {
    return { body_text: null, body_html: decoded };
  }
  return { body_text: decoded, body_html: null };
}

function _extractMultipartBody(body, ct) {
  const boundary = mime.extractBoundary(ct);
  if (!boundary) return { body_text: body, body_html: null };

  const parts     = mime.splitMultipart(body, boundary);
  let body_text   = null;
  let body_html   = null;

  for (const part of parts) {
    const partCt  = part.headers['content-type'] || '';
    const encoding = (part.headers['content-transfer-encoding'] || '').toLowerCase().trim();
    const charset  = mime.extractCharset(partCt) || 'utf-8';

    let decoded;
    if (encoding === 'base64') {
      decoded = mime.decodeBase64(part.body, charset);
    } else if (encoding === 'quoted-printable') {
      decoded = mime.decodeQuotedPrintable(part.body);
    } else {
      decoded = part.body;
    }

    if (partCt.includes('text/plain') && !body_text) {
      body_text = decoded;
    } else if (partCt.includes('text/html') && !body_html) {
      body_html = decoded;
    } else if (partCt.includes('multipart')) {
      // Nested multipart
      const nestedBoundary = mime.extractBoundary(partCt);
      if (nestedBoundary) {
        const nested = _extractMultipartBody(part.body, partCt);
        if (!body_text && nested.body_text) body_text = nested.body_text;
        if (!body_html && nested.body_html) body_html = nested.body_html;
      }
    }
  }

  return { body_text, body_html };
}

module.exports = { register };
