// ─────────────────────────────────────────────────────────────────────────────
// ipc/importer.ipc.js — IPC handlers for MBOX import
// ─────────────────────────────────────────────────────────────────────────────

const path         = require('path');
const logger       = require('../logger');
const MboxImporter = require('../services/MboxImporter');

function register(ipcMain, dataDir, mainWindow) {
  const mailDir = path.join(dataDir, 'mail');

  // ── Import an MBOX file ──
  ipcMain.handle('importer:importMbox', async (_, mboxPath, accountId) => {
    logger.log('MBOX', `Import requested: ${mboxPath} for ${accountId}`);

    try {
      // Derive folder name from filename — keep original casing
      const path2      = require('path');
      const baseName   = path2.basename(mboxPath, path2.extname(mboxPath));
      const folderMap  = {
        'inbox': 'Inbox', 'sent': 'Sent', 'drafts': 'Drafts',
        'trash': 'Trash', 'junk': 'Junk', 'spam': 'Spam',
        'archive': 'Archive', 'sent mail': 'Sent',
      };
      const folderName = folderMap[baseName.toLowerCase()] || baseName;

      const result = await MboxImporter.importMbox(
        mboxPath,
        accountId,
        mailDir,
        folderName,
        (progress) => {
          // Push progress to renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('importer:progress', progress);
          }
        }
      );
      return { success: true, ...result };
    } catch (err) {
      logger.error('MBOX', 'Import failed', err);
      return { success: false, error: err.message };
    }
  });

  // ── Get import status ──
  ipcMain.handle('importer:status', () => {
    return MboxImporter.getStatus();
  });

  logger.log('BOOT', 'Importer IPC handlers registered');
}

module.exports = { register };
