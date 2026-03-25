// ─────────────────────────────────────────────────────────────────────────────
// ipc/sync.ipc.js — IMAP sync IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

const logger         = require('../logger');
const SyncService    = require('../services/SyncService');
const AccountManager = require('../services/AccountManager');

function register(ipcMain, dataDir, mainWindow) {

  // ── Sync a single account ──
  ipcMain.handle('sync:run', async (_, accountId) => {
    const account = AccountManager.getAccount(accountId);
    if (!account) return { success: false, error: 'Account not found' };

    // Get password
    const password = AccountManager.getPassword(accountId);
    const acctWithPass = { ...account, _pw_encrypted: _encodePass(password) };

    logger.log('IMAP', `Manual sync triggered for ${account.email}`);

    // Run sync in background — don't await so IPC returns immediately
    SyncService.syncAccount(acctWithPass, dataDir).catch(err => {
      logger.error('IMAP', `Sync failed for ${account.email}`, err);
    });

    return { success: true };
  });

  // ── Sync all accounts ──
  ipcMain.handle('sync:runAll', async () => {
    const accounts = AccountManager.listAccounts();
    logger.log('IMAP', `Syncing all ${accounts.length} accounts`);

    // Run sequentially to avoid hammering Gmail
    ;(async () => {
      for (const account of accounts) {
        const password = AccountManager.getPassword(account.id);
        const acctWithPass = { ...account, _pw_encrypted: _encodePass(password) };
        try {
          await SyncService.syncAccount(acctWithPass, dataDir);
        } catch (err) {
          logger.error('IMAP', `Sync failed for ${account.email}`, err);
        }
      }
    })();

    return { success: true };
  });

  // ── Get sync status ──
  ipcMain.handle('sync:status', () => {
    return SyncService.getStatus();
  });

  // ── Stop sync ──
  ipcMain.handle('sync:stop', (_, accountId) => {
    SyncService.stopSync(accountId);
    return true;
  });

  logger.log('BOOT', 'Sync IPC handlers registered');
}

function _encodePass(plain) {
  if (!plain) return '';
  return Buffer.from(plain, 'utf8').toString('base64');
}

module.exports = { register };
