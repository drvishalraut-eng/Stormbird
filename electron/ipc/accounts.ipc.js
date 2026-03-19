// ─────────────────────────────────────────────────────────────────────────────
// ipc/accounts.ipc.js — Account management IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

const logger         = require('../logger');
const AccountManager = require('../services/AccountManager');
const SyncService    = require('../services/SyncService');

function register(ipcMain) {

  ipcMain.handle('accounts:list', () => {
    return AccountManager.listAccounts().map(_safeAccount);
  });

  ipcMain.handle('accounts:add', (_, account) => {
    const added = AccountManager.addAccount(account);
    logger.log('DB', `Account added via IPC: ${account.email}`);
    return _safeAccount(added);
  });

  ipcMain.handle('accounts:update', (_, account) => {
    const updated = AccountManager.updateAccount(account);
    return _safeAccount(updated);
  });

  ipcMain.handle('accounts:remove', (_, id) => {
    AccountManager.removeAccount(id);
    return true;
  });

  ipcMain.handle('accounts:testImap', async (_, config) => {
    logger.log('IMAP', `Testing IMAP connection for ${config.email}`);
    return SyncService.testConnection(config.email, config.password);
  });

  ipcMain.handle('accounts:testSmtp', async (_, config) => {
    logger.log('SEND', `Testing SMTP connection for ${config.email}`);
    // Phase 3 — stub for now
    return { success: false, error: 'SMTP testing available in Phase 3' };
  });

  logger.log('BOOT', 'Account IPC handlers registered');
}

// Strip passwords before sending to renderer
function _safeAccount(acct) {
  if (!acct) return null;
  const { _pw_encrypted, _pw_smtp_enc, ...safe } = acct;
  return safe;
}

module.exports = { register };
