// ─────────────────────────────────────────────────────────────────────────────
// services/OutboxQueue.js — Outbox queue and draft management
// All outgoing emails queue here before SMTP delivery.
// Status flow: draft → queued → sending → sent | failed
// ─────────────────────────────────────────────────────────────────────────────

const logger       = require('../logger');
const MessageStore = require('./MessageStore');
const { shortId }  = require('../helpers/crypto');

// ── Outbox ────────────────────────────────────────────────────────────────────

/**
 * Add a message to the outbox queue.
 * Returns the new outbox record.
 */
function enqueue(msg) {
  const id  = shortId();
  const now = Date.now();

  _run(`
    INSERT INTO outbox
      (id, account_id, from_addr, to_addrs, cc_addrs, bcc_addrs,
       subject, body_text, body_html, attach_paths,
       status, queued_at, retry_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    id,
    msg.accountId    || '',
    msg.fromAddr     || '',
    msg.to           || '',
    msg.cc           || '',
    msg.bcc          || '',
    msg.subject      || '',
    msg.bodyText     || '',
    msg.bodyHtml     || '',
    JSON.stringify(msg.attachPaths || []),
    'queued',
    now,
    0,
  ]);

  logger.log('SEND', `Enqueued message: "${msg.subject}" → ${msg.to}`);
  MessageStore.flush();
  return getOutboxItem(id);
}

/**
 * Get all outbox items with a given status.
 * Status: queued | sending | sent | failed
 */
function getByStatus(status) {
  return _query('SELECT * FROM outbox WHERE status = ? ORDER BY queued_at ASC', [status]);
}

/**
 * Get all outbox items for display (all statuses except sent older than 24h).
 */
function listOutbox() {
  const oneDayAgo = Date.now() - 86400000;
  return _query(`
    SELECT * FROM outbox
    WHERE status != 'sent' OR sent_at > ?
    ORDER BY queued_at DESC
  `, [oneDayAgo]);
}

/**
 * Get a single outbox item by ID.
 */
function getOutboxItem(id) {
  return _queryOne('SELECT * FROM outbox WHERE id = ?', [id]);
}

/**
 * Update an outbox item's status.
 */
function updateStatus(id, status, errorMsg) {
  const now = Date.now();
  if (status === 'sent') {
    _run('UPDATE outbox SET status = ?, sent_at = ?, error = NULL WHERE id = ?', [status, now, id]);
  } else if (status === 'failed') {
    _run(`
      UPDATE outbox SET status = ?, error = ?, retry_count = retry_count + 1 WHERE id = ?
    `, [status, errorMsg || '', id]);
  } else {
    _run('UPDATE outbox SET status = ? WHERE id = ?', [status, id]);
  }
  MessageStore.flush();
}

/**
 * Set eml_path after the sent email is written to disk.
 */
function setEmlPath(id, emlPath) {
  _run('UPDATE outbox SET eml_path = ? WHERE id = ?', [emlPath, id]);
}

/**
 * Delete a sent or failed outbox item.
 */
function deleteOutboxItem(id) {
  _run('DELETE FROM outbox WHERE id = ?', [id]);
  MessageStore.flush();
}

/**
 * Reset failed items back to queued for retry.
 */
function requeueFailed() {
  _run("UPDATE outbox SET status = 'queued', error = NULL WHERE status = 'failed'");
  MessageStore.flush();
  logger.log('SEND', 'Failed messages requeued');
}

/**
 * Count of queued messages (for sidebar badge).
 */
function queuedCount() {
  const row = _queryOne("SELECT COUNT(*) as n FROM outbox WHERE status IN ('queued','failed')", []);
  return row ? row.n : 0;
}

// ── Drafts ────────────────────────────────────────────────────────────────────

/**
 * Save or update a draft.
 */
function saveDraft(draft) {
  const id  = draft.id || shortId();
  const now = Date.now();

  _run(`
    INSERT OR REPLACE INTO drafts
      (id, account_id, from_addr, to_addrs, cc_addrs, bcc_addrs, subject, body_text, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `, [
    id,
    draft.accountId || '',
    draft.fromAddr  || '',
    draft.to        || '',
    draft.cc        || '',
    draft.bcc       || '',
    draft.subject   || '',
    draft.bodyText  || '',
    now,
  ]);

  MessageStore.flush();
  return id;
}

/**
 * List all drafts for display.
 */
function listDrafts() {
  return _query('SELECT * FROM drafts ORDER BY updated_at DESC', []);
}

/**
 * Delete a draft by ID.
 */
function deleteDraft(id) {
  _run('DELETE FROM drafts WHERE id = ?', [id]);
  MessageStore.flush();
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function _run(sql, params = []) {
  const db = MessageStore._getDb();
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
}

function _query(sql, params = []) {
  const db = MessageStore._getDb();
  if (!db) return [];
  try {
    const stmt    = db.prepare(sql);
    const results = [];
    stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (err) {
    logger.error('DB', `OutboxQueue query failed: ${err.message}`, err);
    return [];
  }
}

function _queryOne(sql, params = []) {
  return _query(sql, params)[0] || null;
}

module.exports = {
  enqueue,
  getByStatus,
  listOutbox,
  getOutboxItem,
  updateStatus,
  setEmlPath,
  deleteOutboxItem,
  requeueFailed,
  queuedCount,
  saveDraft,
  listDrafts,
  deleteDraft,
};
