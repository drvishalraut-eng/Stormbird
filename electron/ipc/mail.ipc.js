// ─────────────────────────────────────────────────────────────────────────────
// ipc/mail.ipc.js — Mail compose, send, outbox, draft IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

const logger      = require('../logger');
const OutboxQueue = require('../services/OutboxQueue');
const SmtpService = require('../services/SmtpService');

function register(ipcMain) {

  // ── Compose / Send ──────────────────────────────────────────────────────────

  ipcMain.handle('mail:send', async (_, msg) => {
    logger.log('SEND', `Send requested: "${msg.subject}" → ${msg.to}`);
    try {
      // Queue the message
      const item = OutboxQueue.enqueue(msg);

      // Immediately try to send (ConnectivityWatcher handles offline case)
      SmtpService.flushQueue().catch(err => {
        logger.error('SEND', `Flush failed: ${err.message}`, err);
      });

      return { success: true, id: item.id };
    } catch (err) {
      logger.error('SEND', `Enqueue failed: ${err.message}`, err);
      return { success: false, error: err.message };
    }
  });

  // ── Outbox ──────────────────────────────────────────────────────────────────

  ipcMain.handle('mail:outbox', () => {
    return OutboxQueue.listOutbox();
  });

  ipcMain.handle('mail:outboxCount', () => {
    return OutboxQueue.queuedCount();
  });

  ipcMain.handle('mail:retry', async (_, id) => {
    try {
      OutboxQueue.updateStatus(id, 'queued');
      await SmtpService.flushQueue();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mail:deleteOutbox', (_, id) => {
    OutboxQueue.deleteOutboxItem(id);
    return true;
  });

  ipcMain.handle('mail:flushQueue', async () => {
    return SmtpService.flushQueue();
  });

  // ── Drafts ──────────────────────────────────────────────────────────────────

  ipcMain.handle('mail:saveDraft', (_, draft) => {
    const id = OutboxQueue.saveDraft(draft);
    return { success: true, id };
  });

  ipcMain.handle('mail:listDrafts', () => {
    return OutboxQueue.listDrafts();
  });

  ipcMain.handle('mail:deleteDraft', (_, id) => {
    OutboxQueue.deleteDraft(id);
    return true;
  });

  // ── SMTP test ───────────────────────────────────────────────────────────────

  ipcMain.handle('mail:testSmtp', async (_, config) => {
    logger.log('SEND', `Testing SMTP for ${config.email}`);
    return SmtpService.testConnection(
      config.email,
      config.password,
      config.host,
      config.port
    );
  });

  logger.log('BOOT', 'Mail IPC handlers registered');
}

module.exports = { register };
