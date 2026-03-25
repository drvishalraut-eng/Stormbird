// ─────────────────────────────────────────────────────────────────────────────
// helpers/crypto.js — SHA-256 hashing utilities
// Used for: file checksums, Message-ID → safe filename, content dedup hash
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const fs     = require('fs');

/**
 * SHA-256 hash of a string. Returns full 64-char hex string.
 */
function hashString(str) {
  return crypto.createHash('sha256').update(str || '', 'utf8').digest('hex');
}

/**
 * First 16 chars of SHA-256 hash of a string.
 * Used to turn a Message-ID into a safe filename.
 * Collision probability at 10M emails: negligible.
 */
function shortHash(str) {
  return hashString(str).slice(0, 16);
}

/**
 * SHA-256 hash of a file on disk. Returns full 64-char hex string.
 * Streams the file — never loads it fully into memory.
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data',  (chunk) => hash.update(chunk));
    stream.on('end',   ()      => resolve(hash.digest('hex')));
    stream.on('error', (err)   => reject(err));
  });
}

/**
 * SHA-256 hash of a Buffer or string.
 */
function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Generate a short unique ID for outbox messages, issue IDs etc.
 * Returns 12-char hex string.
 */
function shortId() {
  return crypto.randomBytes(6).toString('hex');
}

module.exports = { hashString, shortHash, hashFile, hashBuffer, shortId };
