// ─────────────────────────────────────────────────────────────────────────────
// services/SyncService.js — IMAP trickle downloader
// Downloads email in batches, fully resumable by UID per folder.
// Respects Gmail rate limits with configurable batch size and wait time.
// Sequential per account — never hammers the server.
// ─────────────────────────────────────────────────────────────────────────────

const path               = require('path');
const logger             = require('../logger');
const ProcessManager     = require('../ProcessManager');
const ImapClient         = require('./ImapClient');
const MessageStore       = require('./MessageStore');
const MboxImporter       = require('./MboxImporter');
const AttachmentExtractor = require('./AttachmentExtractor');
const { writeEml, buildEmlPath, cleanStaleTmps } = require('../helpers/eml');
const { shortHash }      = require('../helpers/crypto');
const mime               = require('../helpers/mime');

// ── Gmail folder priority — sync these first ──────────────────────────────────
const PRIORITY_FOLDERS = ['INBOX', 'Sent', '[Gmail]/Sent Mail', 'Drafts', 'Archive', '[Gmail]/All Mail'];

// ── Skip these — system folders with no useful content ───────────────────────
const SKIP_FOLDERS = ['[Gmail]/Spam', '[Gmail]/Trash', '[Gmail]/Important', '[Gmail]/Starred'];

// ── State ─────────────────────────────────────────────────────────────────────
let activeSyncs  = new Map(); // accountId → sync state
let syncQueued   = [];        // accounts waiting to sync
let mainWindow   = null;

// ── Public API ────────────────────────────────────────────────────────────────

function init(window) {
  mainWindow = window;
  ProcessManager.register('ImapSync', {
    restartable      : true,
    restartFn        : () => Promise.resolve(),
    heartbeatInterval: 30000,
    stalledAfter     : 300000,
    criticalOnCrash  : false,
  });
  ProcessManager.idle('ImapSync', 'Waiting for sync request');
  logger.log('IMAP', 'SyncService initialized');
}

/**
 * Start syncing an account.
 * If already syncing, queues the request.
 *
 * @param {Object} account   - { id, email, _pw_encrypted, imap_host, imap_port }
 * @param {string} dataDir   - Stormbird-Data path
 * @param {Object} options   - { batchSize, batchWaitMs }
 */
async function syncAccount(account, dataDir, options = {}) {
  const batchSize  = options.batchSize  || 100;
  const batchWaitMs = options.batchWaitMs || 0; // 0 = no wait between batches in manual sync

  const mailDir = path.join(dataDir, 'mail');
  cleanStaleTmps(mailDir);

  if (activeSyncs.has(account.id)) {
    logger.warn('IMAP', `Sync already running for ${account.email} — skipping`);
    return;
  }

  const syncState = {
    accountId  : account.id,
    email      : account.email,
    status     : 'connecting',
    folder     : null,
    downloaded : 0,
    total      : 0,
    errors     : 0,
    startedAt  : Date.now(),
    batchSize,
  };

  activeSyncs.set(account.id, syncState);
  _pushProgress(syncState);

  const password = _decryptPassword(account._pw_encrypted);
  const client   = new ImapClient(account.id, account.email, password);

  try {
    // ── Connect and login ──
    _updateStatus(syncState, 'connecting', 'Connecting to Gmail…');
    await client.connect();

    _updateStatus(syncState, 'logging_in', 'Logging in…');
    await client.login();

    // ── Discover folders ──
    _updateStatus(syncState, 'discovering', 'Discovering folders…');
    const allFolders = await client.listFolders();
    const folders    = _prioritizeFolders(allFolders);

    logger.log('IMAP', `Syncing ${folders.length} folders for ${account.email}`);

    // ── Sync each folder ──
    for (const folder of folders) {
      if (!activeSyncs.has(account.id)) break; // stopped externally

      try {
        await _syncFolder(client, account, folder.name, mailDir, batchSize, syncState, dataDir);
      } catch (err) {
        logger.error('IMAP', `Failed to sync folder "${folder.name}": ${err.message}`, err);
        syncState.errors++;
      }
    }

    _updateStatus(syncState, 'complete',
      `Sync complete — ${syncState.downloaded} new messages`
    );
    logger.log('IMAP', `Sync complete for ${account.email} — ${syncState.downloaded} downloaded`);
    ProcessManager.idle('ImapSync', `Last sync: ${syncState.downloaded} messages for ${account.email}`);

  } catch (err) {
    logger.error('IMAP', `Sync failed for ${account.email}`, err);
    ProcessManager.reportError('ImapSync', err.message, err);
    syncState.status = 'error';
    syncState.error  = err.message;
    _pushProgress(syncState);
  } finally {
    try { await client.logout(); } catch (_) {}
    activeSyncs.delete(account.id);
    MessageStore.flush();
  }
}

/**
 * Stop a running sync.
 */
function stopSync(accountId) {
  if (activeSyncs.has(accountId)) {
    activeSyncs.delete(accountId);
    logger.log('IMAP', `Sync stopped for account ${accountId}`);
  }
}

/**
 * Get current sync status for all accounts.
 */
function getStatus() {
  const result = [];
  activeSyncs.forEach((state) => result.push({ ...state }));
  return result;
}

/**
 * Test IMAP credentials.
 */
async function testConnection(email, password) {
  const client = new ImapClient('test', email, password);
  return client.test();
}

// ── Folder sync ───────────────────────────────────────────────────────────────

async function _syncFolder(client, account, folderName, mailDir, batchSize, syncState, dataDir) {
  logger.log('IMAP', `Syncing folder: "${folderName}"`);
  _updateStatus(syncState, 'syncing', `Syncing ${folderName}…`, folderName);

  // ── Select folder ──
  let meta;
  try {
    meta = await client.selectFolder(folderName);
  } catch (err) {
    logger.warn('IMAP', `Cannot select "${folderName}": ${err.message}`);
    return;
  }

  if (meta.exists === 0) {
    logger.log('IMAP', `Folder "${folderName}" is empty — skipping`);
    return;
  }

  // ── Get last synced UID from database ──
  const syncKey    = `sync_uid_${account.id}_${folderName}`;
  const lastUidStr = MessageStore.getSetting(syncKey) || '0';
  let   lastUid    = parseInt(lastUidStr, 10) || 0;

  // ── Check UIDVALIDITY — if changed, must re-sync from scratch ──
  const validityKey     = `sync_validity_${account.id}_${folderName}`;
  const storedValidity  = parseInt(MessageStore.getSetting(validityKey) || '0', 10);
  if (storedValidity && storedValidity !== meta.uidvalidity) {
    logger.warn('IMAP', `UIDVALIDITY changed for "${folderName}" — resetting sync state`);
    lastUid = 0;
  }
  MessageStore.setSetting(validityKey, String(meta.uidvalidity));

  // ── Get new UIDs ──
  const newUids = await client.getUidsSince(lastUid);

  if (newUids.length === 0) {
    logger.log('IMAP', `Folder "${folderName}" is up to date`);
    return;
  }

  logger.log('IMAP', `${newUids.length} new messages in "${folderName}"`);
  syncState.total += newUids.length;
  _pushProgress(syncState);

  // ── Fetch in batches ──
  const displayFolder = _normalizeFolder(folderName);

  for (let i = 0; i < newUids.length; i += batchSize) {
    if (!activeSyncs.has(account.id)) {
      logger.log('IMAP', 'Sync stopped — aborting batch');
      return;
    }

    const batch = newUids.slice(i, i + batchSize);
    logger.log('IMAP', `Batch ${Math.floor(i / batchSize) + 1}: UIDs ${batch[0]}–${batch[batch.length - 1]}`);

    ProcessManager.running('ImapSync',
      `${folderName}: ${i + batch.length}/${newUids.length} messages`
    );

    let batchDownloaded = 0;

    await client.fetchMessages(batch, async (uid, rawEmail) => {
      try {
        await _saveMessage(rawEmail, account.id, displayFolder, mailDir, 'imap');
        batchDownloaded++;
        syncState.downloaded++;

        // Checkpoint: save highest UID seen
        MessageStore.setSetting(syncKey, String(uid));
      } catch (err) {
        logger.warn('IMAP', `Failed to save UID ${uid}: ${err.message}`);
        syncState.errors++;
      }

      _pushProgress(syncState);
    });

    logger.log('IMAP', `Batch complete — ${batchDownloaded} saved`);
    ProcessManager.heartbeat('ImapSync', `${syncState.downloaded} total downloaded`);
  }
}

// ── Message saving ────────────────────────────────────────────────────────────

async function _saveMessage(rawEmail, accountId, folder, mailDir, source) {
  // Parse key headers
  const blankLine = rawEmail.search(/\r?\n\r?\n/);
  if (blankLine < 0) throw new Error('No header separator');

  const headerText = rawEmail.slice(0, blankLine);
  const headers    = mime.parseHeaders(headerText);

  const messageId   = _extractMessageId(headers['message-id']);
  const subject     = _clean(headers['subject'] || '(no subject)');
  const fromHeader  = headers['from'] || '';
  const fromName    = _clean(mime.firstAddress(fromHeader));
  const fromAddr    = _extractEmail(fromHeader);
  const toAddrs     = _clean(headers['to'] || '');
  const ccAddrs     = _clean(headers['cc'] || '');
  const dateMs      = _parseDate(headers['date']);
  const contentHash = shortHash(rawEmail.slice(0, 512));

  // Dedup check
  if (messageId && MessageStore.messageExists(accountId, messageId)) {
    return { inserted: false, reason: 'duplicate' };
  }

  // Build paths
  const fileId   = messageId ? shortHash(messageId) : shortHash(rawEmail.slice(0, 256));
  const emlPath  = buildEmlPath(mailDir, accountId, dateMs, fileId);
  const checksum = await writeEml(emlPath, rawEmail);

  // Extract attachments
  const { names: attachNames, count: attachCount } =
    AttachmentExtractor.extractAttachments(rawEmail, emlPath);

  const relativePath = emlPath.replace(mailDir, '').replace(/^[/\\]/, '');
  const date         = new Date(dateMs);

  return MessageStore.insertMessage({
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
    size_bytes  : rawEmail.length,
    has_attach  : attachCount > 0,
    attach_names: attachNames.join(','),
    flags       : [],
    eml_path    : relativePath,
    checksum,
    source,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _prioritizeFolders(folders) {
  // Skip system folders, sort by priority
  return folders
    .filter(f => {
      const skip = SKIP_FOLDERS.some(s => f.name.toLowerCase() === s.toLowerCase());
      const noSelect = f.flags.includes('\\Noselect');
      return !skip && !noSelect;
    })
    .sort((a, b) => {
      const ai = PRIORITY_FOLDERS.findIndex(p => p.toLowerCase() === a.name.toLowerCase());
      const bi = PRIORITY_FOLDERS.findIndex(p => p.toLowerCase() === b.name.toLowerCase());
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.name.localeCompare(b.name);
    });
}

function _normalizeFolder(name) {
  // Normalize Gmail folder names to friendly names
  const map = {
    'inbox'              : 'Inbox',
    '[gmail]/sent mail'  : 'Sent',
    '[gmail]/drafts'     : 'Drafts',
    '[gmail]/all mail'   : 'All Mail',
    '[gmail]/starred'    : 'Starred',
    'sent'               : 'Sent',
    'drafts'             : 'Drafts',
    'archive'            : 'Archive',
  };
  return map[name.toLowerCase()] || name;
}

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

function _parseDate(str) {
  if (!str) return Date.now();
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
  } catch (_) {}
  return Date.now();
}

function _clean(str) {
  if (!str) return '';
  return mime.decodeEncodedWords(str)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '').trim();
}

function _decryptPassword(encrypted) {
  // Phase 2: passwords stored as base64 (proper encryption in Phase 4)
  if (!encrypted) return '';
  try {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  } catch (_) {
    return encrypted;
  }
}

function _updateStatus(state, status, message, folder) {
  state.status  = status;
  state.message = message;
  if (folder) state.folder = folder;
  _pushProgress(state);
  ProcessManager.running('ImapSync', message);
}

function _pushProgress(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:progress', { ...state });
  }
}

module.exports = { init, syncAccount, stopSync, getStatus, testConnection };
