// ─────────────────────────────────────────────────────────────────────────────
// services/SmtpService.js — SMTP delivery via nodemailer
// Sends queued outbox items one at a time.
// Saves a copy of every sent email as a .eml file in Stormbird-Data.
// ─────────────────────────────────────────────────────────────────────────────

const path           = require('path');
const fs             = require('fs');
const nodemailer     = require('nodemailer');
const logger         = require('../logger');
const ProcessManager = require('../ProcessManager');
const OutboxQueue    = require('./OutboxQueue');
const AccountManager = require('./AccountManager');
const { shortHash }  = require('../helpers/crypto');

let mainWindow = null;
let dataDir    = null;
let sending    = false;

// ── Init ──────────────────────────────────────────────────────────────────────

function init(window, dir) {
  mainWindow = window;
  dataDir    = dir;

  ProcessManager.register('SmtpSend', {
    restartable      : false,
    heartbeatInterval: 60000,
    criticalOnCrash  : false,
  });
  ProcessManager.idle('SmtpSend', 'Waiting for outgoing mail');
  logger.log('SEND', 'SmtpService initialized');
}

// ── Flush queue ───────────────────────────────────────────────────────────────

/**
 * Send all queued messages. Called on demand or by ConnectivityWatcher.
 * Returns { sent, failed }.
 */
async function flushQueue() {
  if (sending) {
    logger.log('SEND', 'Flush already in progress — skipping');
    return { sent: 0, failed: 0 };
  }

  const queued = OutboxQueue.getByStatus('queued');
  if (queued.length === 0) {
    logger.log('SEND', 'Outbox is empty');
    return { sent: 0, failed: 0 };
  }

  sending = true;
  logger.log('SEND', `Flushing ${queued.length} queued message(s)`);
  ProcessManager.running('SmtpSend', `Sending ${queued.length} message(s)`);

  let sent = 0, failed = 0;

  for (const item of queued) {
    try {
      await _sendOne(item);
      OutboxQueue.updateStatus(item.id, 'sent');
      sent++;
      logger.log('SEND', `✓ Sent: "${item.subject}" → ${item.to_addrs}`);
      _pushUpdate();
    } catch (err) {
      OutboxQueue.updateStatus(item.id, 'failed', err.message);
      failed++;
      logger.error('SEND', `✗ Failed: "${item.subject}" — ${err.message}`, err);
      _pushUpdate();
    }
  }

  sending = false;
  ProcessManager.idle('SmtpSend', `Last flush: ${sent} sent, ${failed} failed`);
  logger.log('SEND', `Flush complete — ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

// ── Single message send ───────────────────────────────────────────────────────

async function _sendOne(item) {
  const account = AccountManager.getAccount(item.account_id);
  if (!account) throw new Error(`Account not found: ${item.account_id}`);

  const password = AccountManager.getSmtpPassword(item.account_id);
  if (!password) throw new Error('No SMTP password configured');

  OutboxQueue.updateStatus(item.id, 'sending');
  _pushUpdate();

  const transporter = nodemailer.createTransport({
    host  : account.smtp_host || 'smtp.gmail.com',
    port  : account.smtp_port || 587,
    secure: false, // STARTTLS
    auth  : {
      user: account.smtp_user || account.email,
      pass: password,
    },
    tls: { rejectUnauthorized: false },
  });

  const attachments = _parseAttachments(item.attach_paths);

  const mailOptions = {
    from   : item.from_addr || account.email,
    to     : item.to_addrs  || '',
    cc     : item.cc_addrs  || undefined,
    bcc    : item.bcc_addrs || undefined,
    subject: item.subject   || '(no subject)',
    text   : item.body_text || '',
    attachments,
  };

  // Verify connection before sending
  await transporter.verify();

  const info = await transporter.sendMail(mailOptions);
  logger.log('SEND', `Message ID: ${info.messageId}`);

  // Save sent copy as .eml
  if (dataDir && info.messageId) {
    try {
      await _saveSentEml(item, info, account.email);
    } catch (err) {
      logger.warn('SEND', `Could not save .eml copy: ${err.message}`);
    }
  }
}

// ── Save .eml copy ────────────────────────────────────────────────────────────

async function _saveSentEml(item, info, fromEmail) {
  const date    = new Date();
  const year    = date.getFullYear();
  const month   = String(date.getMonth() + 1).padStart(2, '0');
  const fileId  = shortHash(info.messageId || item.id);
  const dir     = path.join(dataDir, 'mail', item.account_id, 'Sent', String(year), month);

  fs.mkdirSync(dir, { recursive: true });

  const emlPath = path.join(dir, `${fileId}.eml`);
  const content = _buildEmlContent(item, info, fromEmail);
  fs.writeFileSync(emlPath, content, 'binary');

  OutboxQueue.setEmlPath(item.id, emlPath);
  logger.log('WRITE', `Sent .eml saved: ${emlPath}`);
}

function _buildEmlContent(item, info, fromEmail) {
  const date = new Date().toUTCString();
  return [
    `Message-ID: <${info.messageId}>`,
    `Date: ${date}`,
    `From: ${item.from_addr || fromEmail}`,
    `To: ${item.to_addrs || ''}`,
    item.cc_addrs  ? `Cc: ${item.cc_addrs}`  : '',
    item.bcc_addrs ? `Bcc: ${item.bcc_addrs}` : '',
    `Subject: ${item.subject || '(no subject)'}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    item.body_text || '',
  ].filter(line => line !== null).join('\r\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _parseAttachments(attachPathsJson) {
  if (!attachPathsJson) return [];
  try {
    const paths = JSON.parse(attachPathsJson);
    return paths.map(p => ({ path: p })).filter(a => fs.existsSync(a.path));
  } catch (_) {
    return [];
  }
}

function _pushUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('outbox:update', OutboxQueue.listOutbox());
  }
}

/**
 * Test SMTP credentials without sending.
 */
async function testConnection(email, password, host, port) {
  try {
    const transporter = nodemailer.createTransport({
      host  : host || 'smtp.gmail.com',
      port  : port || 587,
      secure: false,
      auth  : { user: email, pass: password },
      tls   : { rejectUnauthorized: false },
    });
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { init, flushQueue, testConnection };
