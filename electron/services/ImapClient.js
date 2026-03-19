// ─────────────────────────────────────────────────────────────────────────────
// services/ImapClient.js — Raw IMAP client over TLS
// Pure Node.js net/tls — zero external packages for protocol handling.
// Connects to Gmail imap.gmail.com:993 with App Password.
// Supports: LOGIN, LIST, SELECT, UID FETCH, LOGOUT
// ─────────────────────────────────────────────────────────────────────────────

const tls    = require('tls');
const logger = require('../logger');
const {
  ImapResponseBuffer,
  parseFetchLine,
  parseListLine,
  parseSelectResponse,
  parseTaggedResponse,
} = require('../helpers/imap-parser');

const IMAP_HOST    = 'imap.gmail.com';
const IMAP_PORT    = 993;
const TIMEOUT_MS   = 30000;

class ImapClient {
  constructor(accountId, email, password) {
    this.accountId  = accountId;
    this.email      = email;
    this.password   = password;
    this._socket    = null;
    this._tagCounter = 0;
    this._pending   = new Map(); // tag → { resolve, reject, lines, literals }
    this._buffer    = null;
    this._connected = false;
  }

  // ── Connect and login ──────────────────────────────────────────────────────

  async connect() {
    return new Promise((resolve, reject) => {
      logger.log('IMAP', `Connecting to ${IMAP_HOST}:${IMAP_PORT} as ${this.email}`);

      this._socket = tls.connect({
        host              : IMAP_HOST,
        port              : IMAP_PORT,
        rejectUnauthorized: false,  // Gmail cert chain not trusted by Electron's bundled Node
      });

      this._socket.setTimeout(TIMEOUT_MS);

      this._buffer = new ImapResponseBuffer();

      // Track the greeting separately
      let greeted = false;

      this._buffer.on('line', (line) => {
        logger.log('IMAP', `← ${line.slice(0, 120)}`);

        // Server greeting
        if (!greeted && line.startsWith('* OK')) {
          greeted = true;
          return;
        }

        // Untagged response — route to active pending command
        if (line.startsWith('* ')) {
          this._routeUntagged(line);
          return;
        }

        // Tagged response — complete the pending command
        const tagged = parseTaggedResponse(line);
        if (tagged && this._pending.has(tagged.tag)) {
          const cmd = this._pending.get(tagged.tag);
          this._pending.delete(tagged.tag);
          if (tagged.ok) {
            cmd.resolve({ lines: cmd.lines, literals: cmd.literals, text: tagged.text });
          } else {
            cmd.reject(new Error(`IMAP ${tagged.status}: ${tagged.text}`));
          }
        }
      });

      this._buffer.on('literal', ({ size, data }) => {
        // Attach literal data to the most recently started pending command
        for (const [, cmd] of this._pending) {
          cmd.literals.push(data);
          break;
        }
      });

      this._socket.on('data',    (chunk) => this._buffer.push(chunk));
      this._socket.on('timeout', ()      => { this._socket.destroy(); reject(new Error('Connection timed out')); });
      this._socket.on('error',   (err)   => reject(err));
      this._socket.on('close',   ()      => { this._connected = false; logger.log('IMAP', 'Connection closed'); });

      this._socket.on('secureConnect', () => {
        logger.log('IMAP', 'TLS handshake complete');
        // Wait for greeting then resolve
        setTimeout(() => { if (greeted) resolve(); else reject(new Error('No server greeting')); }, 500);
      });
    });
  }

  async login() {
    logger.log('IMAP', `Logging in as ${this.email}`);
    // Quote password to handle special characters
    const quotedPass = `"${this.password.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    await this._cmd(`LOGIN ${this.email} ${quotedPass}`);
    this._connected = true;
    logger.log('IMAP', 'Login successful');
  }

  async logout() {
    if (!this._connected) return;
    try {
      await this._cmd('LOGOUT');
    } catch (_) {}
    this._socket.destroy();
    this._connected = false;
    logger.log('IMAP', 'Logged out');
  }

  // ── Folder operations ─────────────────────────────────────────────────────

  /**
   * List all folders on the server.
   * Returns array of { name, flags, delimiter }
   */
  async listFolders() {
    const result  = await this._cmd('LIST "" "*"');
    const folders = [];
    for (const line of result.lines) {
      if (!line.startsWith('* LIST')) continue;
      const parsed = parseListLine(line);
      if (parsed) folders.push(parsed);
    }
    logger.log('IMAP', `Found ${folders.length} folders`);
    return folders;
  }

  /**
   * Select a folder and return its metadata.
   * Returns { exists, uidvalidity, uidnext }
   */
  async selectFolder(folderName) {
    const quoted = _quoteFolder(folderName);
    const result = await this._cmd(`SELECT ${quoted}`);
    const meta   = parseSelectResponse(result.lines);
    logger.log('IMAP', `Selected "${folderName}" — ${meta.exists} messages, UIDVALIDITY ${meta.uidvalidity}`);
    return meta;
  }

  // ── Message fetching ───────────────────────────────────────────────────────

  /**
   * Get list of UIDs in the selected folder since a given UID.
   * Returns array of numbers.
   */
  async getUidsSince(lastUid) {
    const searchTerm = lastUid > 0 ? `UID ${lastUid + 1}:*` : '1:*';
    const result     = await this._cmd(`UID SEARCH ${searchTerm}`);

    let uids = [];
    for (const line of result.lines) {
      if (line.startsWith('* SEARCH')) {
        uids = line.slice(9).trim().split(/\s+/).filter(Boolean).map(Number).filter(n => n > lastUid);
      }
    }
    logger.log('IMAP', `Found ${uids.length} new UIDs since ${lastUid}`);
    return uids;
  }

  /**
   * Fetch full message bodies for a batch of UIDs.
   * Calls onMessage(uid, rawEmail) for each fetched message.
   *
   * @param {number[]} uids      - array of UIDs to fetch
   * @param {Function} onMessage - callback(uid: number, raw: string)
   */
  async fetchMessages(uids, onMessage) {
    if (uids.length === 0) return;

    const uidSet = uids.join(',');
    logger.log('IMAP', `Fetching ${uids.length} messages (UIDs: ${uids[0]}…${uids[uids.length - 1]})`);

    // We fetch one at a time to correctly associate literals with UIDs
    // For performance, could batch but single fetch is safer for the parser
    for (const uid of uids) {
      try {
        const result = await this._cmd(
          `UID FETCH ${uid} (FLAGS RFC822.SIZE BODY.PEEK[])`,
          15000 // longer timeout for large emails
        );

        // The literal data is the raw email
        if (result.literals.length > 0) {
          const raw = result.literals[0].toString('binary');
          await onMessage(uid, raw);
        } else {
          logger.warn('IMAP', `No literal data for UID ${uid}`);
        }
      } catch (err) {
        logger.warn('IMAP', `Failed to fetch UID ${uid}: ${err.message}`);
      }
    }
  }

  /**
   * Test connection — connect, login, logout.
   * Returns { success: true } or { success: false, error: string }
   */
  async test() {
    try {
      await this.connect();
      await this.login();
      await this.logout();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Command engine ────────────────────────────────────────────────────────

  _nextTag() {
    this._tagCounter++;
    return `A${String(this._tagCounter).padStart(3, '0')}`;
  }

  _cmd(commandText, timeoutMs) {
    return new Promise((resolve, reject) => {
      const tag     = this._nextTag();
      const full    = `${tag} ${commandText}\r\n`;
      const timeout = timeoutMs || TIMEOUT_MS;

      // Redact password in logs
      const logLine = commandText.startsWith('LOGIN')
        ? `LOGIN ${this.email} [PASSWORD REDACTED]`
        : commandText;
      logger.log('IMAP', `→ ${tag} ${logLine.slice(0, 100)}`);

      const cmd = {
        resolve,
        reject,
        lines   : [],
        literals: [],
        timer   : setTimeout(() => {
          this._pending.delete(tag);
          reject(new Error(`IMAP command timed out: ${tag} ${commandText.slice(0, 40)}`));
        }, timeout),
      };

      // Wrap resolve/reject to clear timer
      const origResolve = cmd.resolve;
      const origReject  = cmd.reject;
      cmd.resolve = (val) => { clearTimeout(cmd.timer); origResolve(val); };
      cmd.reject  = (err) => { clearTimeout(cmd.timer); origReject(err); };

      this._pending.set(tag, cmd);
      this._socket.write(full);
    });
  }

  _routeUntagged(line) {
    // Route untagged responses to all pending commands' line arrays
    for (const [, cmd] of this._pending) {
      cmd.lines.push(line);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _quoteFolder(name) {
  // Folder names with spaces or special chars must be quoted
  if (/[\s"\\]/.test(name)) {
    return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return name;
}

module.exports = ImapClient;
