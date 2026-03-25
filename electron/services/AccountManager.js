// ─────────────────────────────────────────────────────────────────────────────
// services/AccountManager.js — Account storage and retrieval
// Accounts stored in SQLite. Passwords base64 encoded (Phase 4 adds encryption).
// ─────────────────────────────────────────────────────────────────────────────

const logger       = require('../logger');
const MessageStore = require('./MessageStore');
const { shortId }  = require('../helpers/crypto');

// Account colors for auto-assignment
const COLORS = ['#f59e0b', '#60a5fa', '#4ade80', '#c084fc', '#f87171', '#22d3ee', '#fb923c'];

/**
 * List all accounts.
 */
function listAccounts() {
  try {
    return _query('SELECT * FROM accounts ORDER BY created_at ASC');
  } catch (_) {
    return [];
  }
}

/**
 * Get a single account by ID.
 */
function getAccount(id) {
  return _queryOne('SELECT * FROM accounts WHERE id = ?', [id]);
}

/**
 * Add a new account.
 */
function addAccount(account) {
  const id      = account.id || shortId();
  const color   = account.color || COLORS[listAccounts().length % COLORS.length];
  const now     = Date.now();

  _run(`
    INSERT INTO accounts
      (id, email, display_name, color,
       imap_host, imap_port, imap_user, _pw_encrypted,
       smtp_host, smtp_port, smtp_user, _pw_smtp_enc,
       delete_on_server, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    id,
    account.email        || '',
    account.display_name || account.email || '',
    color,
    account.imap_host    || 'imap.gmail.com',
    account.imap_port    || 993,
    account.imap_user    || account.email || '',
    _encryptPassword(account.password || ''),
    account.smtp_host    || 'smtp.gmail.com',
    account.smtp_port    || 587,
    account.smtp_user    || account.email || '',
    _encryptPassword(account.smtp_password || account.password || ''),
    account.delete_on_server ? 1 : 0,
    now,
  ]);

  logger.log('DB', `Account added: ${account.email}`);
  return { ...getAccount(id), id };
}

/**
 * Update an existing account.
 */
function updateAccount(account) {
  const existing = getAccount(account.id);
  if (!existing) throw new Error(`Account not found: ${account.id}`);

  _run(`
    UPDATE accounts SET
      email = ?, display_name = ?, color = ?,
      imap_host = ?, imap_port = ?, imap_user = ?,
      _pw_encrypted = ?,
      smtp_host = ?, smtp_port = ?, smtp_user = ?,
      _pw_smtp_enc = ?,
      delete_on_server = ?
    WHERE id = ?
  `, [
    account.email        || existing.email,
    account.display_name || existing.display_name,
    account.color        || existing.color,
    account.imap_host    || existing.imap_host,
    account.imap_port    || existing.imap_port,
    account.imap_user    || existing.imap_user,
    account.password     ? _encryptPassword(account.password) : existing._pw_encrypted,
    account.smtp_host    || existing.smtp_host,
    account.smtp_port    || existing.smtp_port,
    account.smtp_user    || existing.smtp_user,
    account.smtp_password ? _encryptPassword(account.smtp_password) : existing._pw_smtp_enc,
    account.delete_on_server !== undefined ? (account.delete_on_server ? 1 : 0) : existing.delete_on_server,
    account.id,
  ]);

  logger.log('DB', `Account updated: ${account.email}`);
  return getAccount(account.id);
}

/**
 * Remove an account.
 */
function removeAccount(id) {
  _run('DELETE FROM accounts WHERE id = ?', [id]);
  logger.log('DB', `Account removed: ${id}`);
}

/**
 * Get decrypted password for an account (for use in IMAP/SMTP).
 */
function getPassword(accountId) {
  const acct = getAccount(accountId);
  if (!acct) return null;
  return _decryptPassword(acct._pw_encrypted);
}

function getSmtpPassword(accountId) {
  const acct = getAccount(accountId);
  if (!acct) return null;
  return _decryptPassword(acct._pw_smtp_enc);
}

// ── Password encoding (base64 for now, encryption in Phase 4) ─────────────────

function _encryptPassword(plain) {
  if (!plain) return '';
  return Buffer.from(plain, 'utf8').toString('base64');
}

function _decryptPassword(encoded) {
  if (!encoded) return '';
  try {
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch (_) {
    return encoded;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function _run(sql, params) {
  const { db } = _getDb();
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
}

function _query(sql, params = []) {
  const { db } = _getDb();
  if (!db) return [];
  try {
    const stmt    = db.prepare(sql);
    const results = [];
    stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (err) {
    logger.error('DB', `AccountManager query failed: ${sql.slice(0, 60)}`, err);
    return [];
  }
}

function _queryOne(sql, params = []) {
  return _query(sql, params)[0] || null;
}

function _getDb() {
  // Access MessageStore's internal db via the module
  // MessageStore exposes db indirectly through its query functions
  // We use a shared SQLite instance via MessageStore
  return { db: MessageStore._getDb ? MessageStore._getDb() : null };
}

module.exports = {
  listAccounts,
  getAccount,
  addAccount,
  updateAccount,
  removeAccount,
  getPassword,
  getSmtpPassword,
};
