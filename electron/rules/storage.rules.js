// rules/storage.rules.js — Offline diagnosis rules for storage/DB/drive failures

module.exports = [
  {
    id: 'storage-drive-full',
    match: (ctx) => /ENOSPC|no space|disk full|drive full/i.test(ctx.error),
    explanation    : 'The USB drive has run out of space. Stormbird cannot write any more email files.',
    likelyCause    : 'The drive is full.',
    steps          : [
      'Open File Explorer and check how much space is left on the Stormbird drive.',
      'Delete old backup snapshots from the Stormbird-Data/backups/snapshots/ folder to free space.',
      'Consider moving to a larger USB drive — use Settings → Drive Management to format a new drive and migrate data.',
    ],
    recurrenceRisk : 'high',
    prevention     : 'Stormbird warns when free space drops below 2GB. Keep an eye on the status bar.',
  },

  {
    id: 'storage-db-corrupt',
    match: (ctx) => ctx.process === 'MessageStore' && /corrupt|malformed|database disk image/i.test(ctx.error),
    explanation    : 'The Stormbird database file appears to be damaged.',
    likelyCause    : 'The database was likely damaged by an unsafe ejection of the USB drive.',
    steps          : [
      'Stormbird keeps rolling backups of the database. Go to Settings → Drive Management → Restore Database.',
      'Select the most recent backup (stormbird.db.bak1) and click Restore.',
      'If all backups are damaged, your .eml files are still intact — go to Settings → Rebuild Index to regenerate the database from your email files.',
    ],
    recurrenceRisk : 'medium',
    prevention     : 'Always use the Safe Eject button before removing the USB drive.',
  },

  {
    id: 'storage-write-error',
    match: (ctx) => /EACCES|permission denied|read.?only/i.test(ctx.error),
    explanation    : 'Stormbird cannot write files to the USB drive.',
    likelyCause    : 'The drive may be write-protected, or another program has locked the files.',
    steps          : [
      'Check the physical write-protect switch on your USB drive — slide it to the unlocked position.',
      'Close any other programs that might be accessing the Stormbird-Data folder.',
      'Right-click the Stormbird-Data folder → Properties → Security → verify your user account has write permission.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Ensure the USB drive has no write-protect switch enabled before use.',
  },

  {
    id: 'storage-path-missing',
    match: (ctx) => /ENOENT|no such file|cannot find path/i.test(ctx.error),
    explanation    : 'Stormbird cannot find a required file or folder.',
    likelyCause    : 'The Stormbird-Data folder structure may have been moved or deleted.',
    steps          : [
      'Check that the Stormbird-Data folder is next to Stormbird.exe on your drive.',
      'Do not move or rename the Stormbird-Data folder.',
      'If the folder is missing, re-run the setup wizard to reinitialize it.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Never move or rename the Stormbird-Data folder.',
  },
];
