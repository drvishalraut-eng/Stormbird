// ─────────────────────────────────────────────────────────────────────────────
// services/MessageStore.js — SQLite message index
// Uses sql.js (WASM SQLite) — no native compilation required.
// Stores metadata only — email body lives in .eml files on disk.
// ─────────────────────────────────────────────────────────────────────────────

const fs             = require('fs');
const path           = require('path');
const logger         = require('../logger');
const ProcessManager = require('../ProcessManager');
const { shortId }    = require('../helpers/crypto');

// ── Schema migrations — one entry per phase ───────────────────────────────────
// Each migration runs exactly once, in order, on first boot after upgrade.

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        account_id   TEXT NOT NULL,
        folder       TEXT NOT NULL DEFAULT 'Inbox',
        year         INTEGER,
        month        INTEGER,
        message_id   TEXT,
        content_hash TEXT,
        subject      TEXT,
        from_name    TEXT,
        from_addr    TEXT,
        to_addrs     TEXT,
        cc_addrs     TEXT,
        date_ms      INTEGER,
        size_bytes   INTEGER,
        has_attach   INTEGER DEFAULT 0,
        attach_names TEXT,
        flags        TEXT DEFAULT '[]',
        eml_path     TEXT,
        checksum     TEXT,
        imported_at  INTEGER,
        source       TEXT DEFAULT 'mbox'
      );

      CREATE INDEX IF NOT EXISTS idx_msg_account   ON messages(account_id);
      CREATE INDEX IF NOT EXISTS idx_msg_folder    ON messages(account_id, folder);
      CREATE INDEX IF NOT EXISTS idx_msg_date      ON messages(date_ms);
      CREATE INDEX IF NOT EXISTS idx_msg_msgid     ON messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_msg_hash      ON messages(content_hash);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_dedup ON messages(account_id, message_id)
        WHERE message_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS message_folders (
        message_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        folder     TEXT NOT NULL,
        PRIMARY KEY (message_id, account_id, folder)
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id              TEXT PRIMARY KEY,
        email           TEXT NOT NULL,
        display_name    TEXT,
        color           TEXT DEFAULT '#f59e0b',
        imap_host       TEXT,
        imap_port       INTEGER DEFAULT 993,
        imap_user       TEXT,
        _pw_encrypted   TEXT,
        smtp_host       TEXT,
        smtp_port       INTEGER DEFAULT 587,
        smtp_user       TEXT,
        _pw_smtp_enc    TEXT,
        delete_on_server INTEGER DEFAULT 0,
        created_at      INTEGER
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        account_id   TEXT NOT NULL,
        folder       TEXT NOT NULL,
        last_uid     INTEGER DEFAULT 0,
        uidvalidity  INTEGER DEFAULT 0,
        last_sync_ms INTEGER DEFAULT 0,
        total_server INTEGER DEFAULT 0,
        PRIMARY KEY (account_id, folder)
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id           TEXT PRIMARY KEY,
        account_id   TEXT NOT NULL,
        to_addrs     TEXT,
        cc_addrs     TEXT,
        bcc_addrs    TEXT,
        subject      TEXT,
        body_text    TEXT,
        body_html    TEXT,
        status       TEXT DEFAULT 'queued',
        queued_at    INTEGER,
        sent_at      INTEGER,
        error        TEXT,
        retry_count  INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS issue_log (
        id           TEXT PRIMARY KEY,
        process      TEXT,
        status       TEXT,
        error_msg    TEXT,
        diagnosed_by TEXT,
        diagnosis    TEXT,
        resolved     INTEGER DEFAULT 0,
        resolved_by  TEXT,
        occurred_at  INTEGER,
        resolved_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
  // Phase 4 will add checksum columns
  // Phase 5 will add backup_log table
];

// ── State ────────────────────────────────────────────────────────────────────

let db          = null;
let SQL         = null;
let dbPath      = null;
let flushTimer  = null;
const FLUSH_INTERVAL_MS = 800;

// ── Initialization ────────────────────────────────────────────────────────────

async function init(dataDir) {
  ProcessManager.register('MessageStore', {
    restartable     : true,
    restartFn       : () => init(dataDir),
    heartbeatInterval: 60000,
    stalledAfter    : 300000,
    criticalOnCrash : true,
  });

  try {
    logger.log('DB', 'Initializing MessageStore…');
    dbPath = path.join(dataDir, 'stormbird.db');

    // Load sql.js WASM
    SQL = await _loadSqlJs(dataDir);

    // Load or create database
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      logger.log('DB', `Loaded existing database (${Math.round(fileBuffer.length / 1024)}KB)`);
    } else {
      db = new SQL.Database();
      logger.log('DB', 'Created new database');
    }

    // Enable WAL mode equivalent (sql.js uses in-memory, we flush to disk)
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');

    // Run migrations
    _migrate();

    // Start periodic flush to disk
    _startFlush(dataDir);

    const count = _queryOne('SELECT COUNT(*) as n FROM messages').n;
    logger.log('DB', `MessageStore ready — ${count} messages indexed`);
    ProcessManager.heartbeat('MessageStore', `${count} messages indexed`);

  } catch (err) {
    logger.error('DB', 'MessageStore init failed', err);
    ProcessManager.reportError('MessageStore', err.message, err);
    throw err;
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────

function _migrate() {
  // Get current schema version
  let currentVersion = 0;
  try {
    const result = db.exec('PRAGMA user_version');
    currentVersion = result[0]?.values[0][0] || 0;
  } catch (_) {}

  const pending = MIGRATIONS.filter(m => m.version > currentVersion);
  if (pending.length === 0) {
    logger.log('DB', `Schema up to date (version ${currentVersion})`);
    return;
  }

  for (const migration of pending) {
    logger.log('DB', `Running migration to schema version ${migration.version}…`);
    db.run(migration.sql);
    db.run(`PRAGMA user_version = ${migration.version}`);
    logger.log('DB', `Migrated to schema version ${migration.version}`);
  }
}

// ── Message operations ────────────────────────────────────────────────────────

/**
 * Insert a message into the index.
 * Returns { inserted: true } or { inserted: false, reason: string }
 */
function insertMessage(msg) {
  if (!db) throw new Error('MessageStore not initialized');

  // Deduplication check — by message_id first
  if (msg.message_id) {
    const existing = _queryOne(
      'SELECT id FROM messages WHERE account_id = ? AND message_id = ?',
      [msg.account_id, msg.message_id]
    );
    if (existing) {
      return { inserted: false, reason: 'duplicate_message_id' };
    }
  }

  // Deduplication check — by content hash fallback
  if (msg.content_hash) {
    const existing = _queryOne(
      'SELECT id FROM messages WHERE account_id = ? AND content_hash = ?',
      [msg.account_id, msg.content_hash]
    );
    if (existing) {
      return { inserted: false, reason: 'duplicate_content_hash' };
    }
  }

  const id = msg.id || shortId();
  const now = Date.now();

  try {
    db.run(`
      INSERT INTO messages
        (id, account_id, folder, year, month, message_id, content_hash,
         subject, from_name, from_addr, to_addrs, cc_addrs,
         date_ms, size_bytes, has_attach, attach_names,
         flags, eml_path, checksum, imported_at, source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      id,
      msg.account_id   || '',
      msg.folder       || 'Inbox',
      msg.year         || null,
      msg.month        || null,
      msg.message_id   || null,
      msg.content_hash || null,
      msg.subject      || '(no subject)',
      msg.from_name    || '',
      msg.from_addr    || '',
      msg.to_addrs     || '',
      msg.cc_addrs     || '',
      msg.date_ms      || now,
      msg.size_bytes   || 0,
      msg.has_attach   ? 1 : 0,
      msg.attach_names || '',
      JSON.stringify(msg.flags || []),
      msg.eml_path     || '',
      msg.checksum     || '',
      now,
      msg.source       || 'mbox',
    ]);

    ProcessManager.heartbeat('MessageStore', `Inserted message: ${msg.subject || '(no subject)'}`);
    return { inserted: true, id };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return { inserted: false, reason: 'unique_constraint' };
    }
    throw err;
  }
}

/**
 * Get list of folders with message counts for an account.
 */
function getFolders(accountId) {
  if (!db) return [];
  const rows = _query(`
    SELECT folder,
           COUNT(*) as total,
           SUM(CASE WHEN flags NOT LIKE '%"read"%' THEN 1 ELSE 0 END) as unread
    FROM messages
    WHERE account_id = ?
    GROUP BY folder
    ORDER BY folder
  `, [accountId]);
  return rows;
}

/**
 * List messages in a folder with pagination.
 */
function listMessages({ accountId, folder, page = 0, pageSize = 50, search = '' }) {
  if (!db) return { messages: [], total: 0 };

  let where  = 'WHERE account_id = ?';
  let params = [accountId];

  if (folder) {
    where  += ' AND folder = ?';
    params.push(folder);
  }

  if (search) {
    where  += ' AND (subject LIKE ? OR from_addr LIKE ? OR from_name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const total = _queryOne(`SELECT COUNT(*) as n FROM messages ${where}`, params).n;
  const rows  = _query(`
    SELECT id, subject, from_name, from_addr, date_ms,
           has_attach, flags, folder, eml_path
    FROM messages ${where}
    ORDER BY date_ms DESC
    LIMIT ? OFFSET ?
  `, [...params, pageSize, page * pageSize]);

  return {
    messages: rows.map(r => ({ ...r, flags: _parseJson(r.flags, []) })),
    total,
    page,
    pageSize,
  };
}

/**
 * Get a single message by ID.
 */
function getMessage(id) {
  if (!db) return null;
  const row = _queryOne('SELECT * FROM messages WHERE id = ?', [id]);
  if (!row) return null;
  return { ...row, flags: _parseJson(row.flags, []) };
}

/**
 * Mark a message with a flag (read, starred, deleted).
 */
function markMessage(id, flag, value) {
  if (!db) return;
  const row = _queryOne('SELECT flags FROM messages WHERE id = ?', [id]);
  if (!row) return;

  let flags = _parseJson(row.flags, []);
  if (value && !flags.includes(flag)) {
    flags.push(flag);
  } else if (!value) {
    flags = flags.filter(f => f !== flag);
  }

  db.run('UPDATE messages SET flags = ? WHERE id = ?', [JSON.stringify(flags), id]);
}

/**
 * Delete a message record from the index.
 */
function deleteMessage(id) {
  if (!db) return;
  db.run('DELETE FROM messages WHERE id = ?', [id]);
}

/**
 * Get total and unread counts per folder for an account.
 */
function getCounts(accountId) {
  if (!db) return {};
  const rows = _query(`
    SELECT folder,
           COUNT(*) as total,
           SUM(CASE WHEN flags NOT LIKE '%"read"%' THEN 1 ELSE 0 END) as unread
    FROM messages WHERE account_id = ?
    GROUP BY folder
  `, [accountId]);

  const result = {};
  for (const row of rows) {
    result[row.folder] = { total: row.total, unread: row.unread };
  }
  return result;
}

/**
 * Check if a message exists by message_id.
 */
function messageExists(accountId, messageId) {
  if (!db) return false;
  return !!_queryOne(
    'SELECT 1 FROM messages WHERE account_id = ? AND message_id = ?',
    [accountId, messageId]
  );
}

/**
 * Get count of all messages.
 */
function getTotalCount() {
  if (!db) return 0;
  return _queryOne('SELECT COUNT(*) as n FROM messages').n;
}

// ── Settings ──────────────────────────────────────────────────────────────────

function getSetting(key) {
  if (!db) return null;
  const row = _queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setSetting(key, value) {
  if (!db) return;
  db.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, String(value)]
  );
}

// ── Disk flush ────────────────────────────────────────────────────────────────

function flush(dataDir) {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buf  = Buffer.from(data);
    // Write atomically: .tmp → rename
    const tmp  = dbPath + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dbPath);
    _rotateBackups(dbPath);
  } catch (err) {
    logger.error('DB', 'Flush to disk failed', err);
  }
}

function _startFlush(dataDir) {
  flushTimer = setInterval(() => flush(dataDir), FLUSH_INTERVAL_MS);
}

function stopFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Keep last 3 rolling backups of the database.
 */
function _rotateBackups(dbPath) {
  try {
    // Rotate: .db.bak2 → .db.bak3, .db.bak1 → .db.bak2, .db → .db.bak1
    if (fs.existsSync(dbPath + '.bak2')) fs.copyFileSync(dbPath + '.bak2', dbPath + '.bak3');
    if (fs.existsSync(dbPath + '.bak1')) fs.copyFileSync(dbPath + '.bak1', dbPath + '.bak2');
    if (fs.existsSync(dbPath))           fs.copyFileSync(dbPath, dbPath + '.bak1');
  } catch (_) {}
}

// ── sql.js loader ─────────────────────────────────────────────────────────────

async function _loadSqlJs(dataDir) {
  const initSqlJs = require('sql.js');
  const wasmDir   = _findWasmDir();
  logger.log('DB', `Loading sql.js WASM from: ${wasmDir}`);

  return initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });
}

function _findWasmDir() {
  const { app } = require('electron');
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'node_modules', 'sql.js', 'dist');
  }
  return path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist');
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function _query(sql, params = []) {
  try {
    const stmt    = db.prepare(sql);
    const results = [];
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    logger.error('DB', `Query failed: ${sql.slice(0, 80)}`, err);
    throw err;
  }
}

function _queryOne(sql, params = []) {
  const results = _query(sql, params);
  return results[0] || null;
}

function _parseJson(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

// ── Close ─────────────────────────────────────────────────────────────────────

function close(dataDir) {
  stopFlush();
  if (db) {
    flush(dataDir);
    db.close();
    db = null;
    logger.log('DB', 'Database closed cleanly');
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  init,
  insertMessage,
  getFolders,
  listMessages,
  getMessage,
  markMessage,
  deleteMessage,
  getCounts,
  messageExists,
  getTotalCount,
  getSetting,
  setSetting,
  flush,
  close,
  _getDb: () => db,  // for AccountManager shared access
};
