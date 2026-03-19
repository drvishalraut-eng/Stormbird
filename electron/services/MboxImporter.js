// ─────────────────────────────────────────────────────────────────────────────
// services/MboxImporter.js — Import emails from MBOX files
// Streams the file — never loads it fully into memory.
// Writes each email as an atomic .eml file, extracts attachments,
// deduplicates by Message-ID, updates SQLite index.
// ─────────────────────────────────────────────────────────────────────────────

const path               = require('path');
const logger             = require('../logger');
const ProcessManager     = require('../ProcessManager');
const MessageStore       = require('./MessageStore');
const AttachmentExtractor = require('./AttachmentExtractor');
const { splitMbox }      = require('../helpers/mbox-splitter');
const { writeEml, buildEmlPath, cleanStaleTmps } = require('../helpers/eml');
const { hashString, shortHash } = require('../helpers/crypto');
const mime               = require('../helpers/mime');

// ── State ────────────────────────────────────────────────────────────────────

let activeImport = null; // current import job state

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Import an MBOX file for a given account.
 *
 * @param {string} mboxPath   - path to the .mbox file
 * @param {string} accountId  - account identifier (email address)
 * @param {string} mailDir    - base mail directory (Stormbird-Data/mail/)
 * @param {string} folderName - folder name to assign (default: parsed from filename)
 * @param {Function} onProgress - callback({ processed, inserted, duplicates, errors, pct })
 * @returns {Promise<{ inserted, duplicates, errors, skipped }>}
 */
function importMbox(mboxPath, accountId, mailDir, folderName, onProgress) {
  return new Promise((resolve, reject) => {

    if (activeImport) {
      reject(new Error('An import is already in progress'));
      return;
    }

    ProcessManager.register('MboxImporter', {
      restartable      : false,
      heartbeatInterval: 5000,
      stalledAfter     : 60000,
      criticalOnCrash  : false,
    });

    // Clean up stale .tmp files from any previous crashed session
    cleanStaleTmps(mailDir);

    // Determine folder name from filename if not provided
    const folder = folderName || _folderFromPath(mboxPath);

    logger.log('MBOX', `Starting import: ${mboxPath} → account:${accountId} folder:${folder}`);

    activeImport = {
      mboxPath,
      accountId,
      folder,
      processed  : 0,
      inserted   : 0,
      duplicates : 0,
      errors     : 0,
      startedAt  : Date.now(),
    };

    ProcessManager.running('MboxImporter', `Importing ${path.basename(mboxPath)}`);

    splitMbox(
      mboxPath,

      // onMessage — called for each raw message
      async (rawMessage, index) => {
        activeImport.processed++;

        try {
          const result = await _processMessage(rawMessage, accountId, folder, mailDir);
          if (result.inserted) {
            activeImport.inserted++;
          } else {
            activeImport.duplicates++;
          }
        } catch (err) {
          activeImport.errors++;
          logger.warn('MBOX', `Message ${index} failed: ${err.message}`);
        }

        // Heartbeat every 50 messages
        if (activeImport.processed % 50 === 0) {
          ProcessManager.heartbeat('MboxImporter',
            `${activeImport.processed} processed, ${activeImport.inserted} inserted`
          );
        }

        // Report progress
        onProgress && onProgress({
          processed  : activeImport.processed,
          inserted   : activeImport.inserted,
          duplicates : activeImport.duplicates,
          errors     : activeImport.errors,
        });
      },

      // onProgress — file read progress
      (msgCount, pct) => {
        onProgress && onProgress({
          processed  : activeImport.processed,
          inserted   : activeImport.inserted,
          duplicates : activeImport.duplicates,
          errors     : activeImport.errors,
          filePct    : pct,
        });
      },

      // onDone
      (total, skipped) => {
        const duration = Math.round((Date.now() - activeImport.startedAt) / 1000);
        const result   = {
          inserted   : activeImport.inserted,
          duplicates : activeImport.duplicates,
          errors     : activeImport.errors,
          skipped,
          total      : activeImport.processed,
          durationSec: duration,
        };

        logger.log('MBOX', `Import complete in ${duration}s — ` +
          `${result.inserted} inserted, ${result.duplicates} duplicates, ${result.errors} errors`
        );

        ProcessManager.idle('MboxImporter', `Import complete — ${result.inserted} messages imported`);
        activeImport = null;

        // Flush database to disk
        MessageStore.flush();

        resolve(result);
      },

      // onError
      (err) => {
        logger.error('MBOX', 'Import failed', err);
        ProcessManager.reportError('MboxImporter', err.message, err);
        activeImport = null;
        reject(err);
      }
    );
  });
}

/**
 * Get current import status.
 */
function getStatus() {
  return activeImport ? { ...activeImport, active: true } : { active: false };
}

// ── Message processing ────────────────────────────────────────────────────────

async function _processMessage(rawMessage, accountId, folder, mailDir) {
  // ── 1. Parse headers ──
  const blankLine = rawMessage.search(/\r?\n\r?\n/);
  if (blankLine < 0) throw new Error('No header/body separator found');

  let headerText = rawMessage.slice(0, blankLine);

  // Skip the MBOX "From " envelope line if present
  if (headerText.startsWith('From ')) {
    const firstNewline = headerText.indexOf('\n');
    headerText = headerText.slice(firstNewline + 1);
  }

  const headers = mime.parseHeaders(headerText);

  // ── 2. Extract key fields — fully decode all display strings ──
  const messageId   = _extractMessageId(headers['message-id']);
  const subject     = _cleanHeader(headers['subject'] || '(no subject)');
  const fromHeader  = headers['from'] || '';
  const fromName    = _cleanHeader(mime.firstAddress(fromHeader));
  const fromAddr    = _extractEmail(fromHeader);
  const toAddrs     = _cleanHeader(headers['to']  || '');
  const ccAddrs     = _cleanHeader(headers['cc']  || '');
  const dateMs      = _parseDate(headers['date']);
  const date        = new Date(dateMs);

  // ── 3. Content hash for dedup fallback ──
  const contentHash = shortHash(rawMessage.slice(0, 512));

  // ── 4. Check duplicates ──
  if (messageId && MessageStore.messageExists(accountId, messageId)) {
    return { inserted: false, reason: 'duplicate' };
  }

  // ── 5. Build file ID and path ──
  const fileId  = messageId ? shortHash(messageId) : shortHash(rawMessage.slice(0, 256));
  const emlPath = buildEmlPath(mailDir, accountId, dateMs, fileId);

  // ── 6. Write .eml atomically ──
  const checksum = await writeEml(emlPath, rawMessage);

  // ── 7. Extract attachments ──
  const { names: attachNames, count: attachCount } =
    AttachmentExtractor.extractAttachments(rawMessage, emlPath);

  // ── 8. Build relative path for storage ──
  const relativePath = emlPath.replace(mailDir, '').replace(/^[/\\]/, '');

  // ── 9. Insert into SQLite ──
  const result = MessageStore.insertMessage({
    account_id  : accountId,
    folder,
    year        : date.getFullYear(),
    month       : date.getMonth() + 1,
    message_id  : messageId,
    content_hash: contentHash,
    subject,
    from_name   : fromName,
    from_addr   : fromAddr,
    to_addrs    : toAddrs,
    cc_addrs    : ccAddrs,
    date_ms     : dateMs,
    size_bytes  : rawMessage.length,
    has_attach  : attachCount > 0,
    attach_names: attachNames.join(','),
    flags       : [],
    eml_path    : relativePath,
    checksum,
    source      : 'mbox',
  });

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _extractMessageId(raw) {
  if (!raw) return null;
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw.trim() || null;
}

function _extractEmail(raw) {
  if (!raw) return '';
  const addrs = mime.parseAddresses(raw);
  return addrs.length > 0 ? addrs[0].address : raw.trim();
}

function _parseDate(dateStr) {
  if (!dateStr) return Date.now();
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getTime();
  } catch (_) {}
  return Date.now();
}

function _cleanHeader(str) {
  if (!str) return '';
  // 1. Decode MIME encoded-words =?UTF-8?B?...?=
  let decoded = mime.decodeEncodedWords(str);
  // 2. Decode HTML entities
  decoded = decoded
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ');
  // 3. Strip any residual HTML tags from header fields
  decoded = decoded.replace(/<[^>]+>/g, '');
  return decoded.trim();
}

function _folderFromPath(mboxPath) {
  const name = path.basename(mboxPath, path.extname(mboxPath));
  // Map common Thunderbird folder names
  const map = {
    'inbox' : 'Inbox',
    'sent'  : 'Sent',
    'drafts': 'Drafts',
    'trash' : 'Trash',
    'junk'  : 'Junk',
    'spam'  : 'Spam',
    'archive': 'Archive',
    'sent mail': 'Sent',
  };
  return map[name.toLowerCase()] || name;
}

module.exports = { importMbox, getStatus };
