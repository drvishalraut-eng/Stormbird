// ─────────────────────────────────────────────────────────────────────────────
// helpers/eml.js — Atomic .eml file writer and reader
// Write pattern: content → <id>.eml.tmp → verify checksum → rename to <id>.eml
// This ensures a .eml file is always complete — never partial.
// ─────────────────────────────────────────────────────────────────────────────

const fs     = require('fs');
const path   = require('path');
const logger = require('../logger');
const { hashBuffer, hashFile } = require('./crypto');

/**
 * Write an email to disk atomically.
 *
 * 1. Write content to <targetPath>.tmp
 * 2. Compute SHA-256 of written file
 * 3. Rename .tmp → targetPath (atomic on same volume)
 * 4. Return checksum
 *
 * @param {string} targetPath  - full path to .eml file (will be created)
 * @param {string|Buffer} content - raw RFC 2822 email content
 * @returns {Promise<string>} SHA-256 checksum of the written file
 */
async function writeEml(targetPath, content) {
  const tmpPath = targetPath + '.tmp';
  const buf     = Buffer.isBuffer(content) ? content : Buffer.from(content, 'binary');

  // Ensure directory exists
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to .tmp
  fs.writeFileSync(tmpPath, buf);

  // Verify what was written
  const checksum = await hashFile(tmpPath);
  const expected = hashBuffer(buf);

  if (checksum !== expected) {
    fs.unlinkSync(tmpPath);
    throw new Error(`Checksum mismatch writing ${targetPath} — disk write corrupted`);
  }

  // Atomic rename
  fs.renameSync(tmpPath, targetPath);

  return checksum;
}

/**
 * Read a .eml file and return its content as a Buffer.
 */
function readEml(emlPath) {
  if (!fs.existsSync(emlPath)) {
    throw new Error(`EML file not found: ${emlPath}`);
  }
  return fs.readFileSync(emlPath);
}

/**
 * Delete a .eml file and its attachment folder if present.
 */
function deleteEml(emlPath) {
  if (fs.existsSync(emlPath)) {
    fs.unlinkSync(emlPath);
  }
  // Delete attachment folder <id>/ next to the .eml
  const attachDir = emlPath.replace(/\.eml$/, '');
  if (fs.existsSync(attachDir) && fs.statSync(attachDir).isDirectory()) {
    fs.rmSync(attachDir, { recursive: true, force: true });
  }
}

/**
 * Build the .eml file path for a message.
 * Structure: <mailDir>/<account>/<year>/<month>/<shortHash>.eml
 */
function buildEmlPath(mailDir, accountEmail, dateMs, fileId) {
  const date  = new Date(dateMs || Date.now());
  const year  = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // Sanitize account email for use as folder name
  const acct  = accountEmail.replace(/[<>:"/\\|?*]/g, '_');
  return path.join(mailDir, acct, year, month, `${fileId}.eml`);
}

/**
 * Clean up any stale .tmp files left by a crashed session.
 * Call on startup to avoid orphaned temp files.
 */
function cleanStaleTmps(mailDir) {
  let cleaned = 0;
  try {
    _walkDir(mailDir, (filePath) => {
      if (filePath.endsWith('.eml.tmp')) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    });
  } catch (_) {}
  if (cleaned > 0) {
    logger.log('WRITE', `Cleaned ${cleaned} stale .tmp files from previous session`);
  }
  return cleaned;
}

function _walkDir(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      _walkDir(full, fn);
    } else {
      fn(full);
    }
  }
}

module.exports = { writeEml, readEml, deleteEml, buildEmlPath, cleanStaleTmps };
