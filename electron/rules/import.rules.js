// rules/import.rules.js — Offline diagnosis rules for MBOX import failures

module.exports = [
  {
    id: 'import-file-not-found',
    match: (ctx) => ctx.process === 'MboxImporter' && /ENOENT|not found|cannot find/i.test(ctx.error),
    explanation    : 'Stormbird cannot find the MBOX file you selected.',
    likelyCause    : 'The file was moved, renamed, or is on a drive that is no longer connected.',
    steps          : [
      'Go to File → Import MBOX and select the file again.',
      'Make sure the drive or folder containing the MBOX file is still accessible.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Keep MBOX source files in a stable location during import.',
  },

  {
    id: 'import-stalled',
    match: (ctx) => ctx.process === 'MboxImporter' && /stalled|no progress/i.test(ctx.error),
    explanation    : 'The MBOX import has stopped making progress. The file may be very large or contain unusual content.',
    likelyCause    : 'A very large or malformed section of the MBOX file may have stalled the parser.',
    steps          : [
      'Click "Retry" — the import will resume from where it left off.',
      'If it stalls again at the same point, the MBOX file may have a corrupt section.',
      'Check the Console panel (Ctrl+`) for details about which message caused the stall.',
      'The import log will show how many messages were successfully imported before the stall.',
    ],
    recurrenceRisk : 'medium',
    prevention     : 'Large MBOX files from Thunderbird can exceed 1GB — imports may take several minutes.',
  },

  {
    id: 'import-thunderbird-locked',
    match: (ctx) => ctx.process === 'MboxImporter' && /EBUSY|locked|being used/i.test(ctx.error),
    explanation    : 'The Thunderbird MBOX file is locked by another program.',
    likelyCause    : 'Thunderbird is currently running and has the file open.',
    steps          : [
      'Close Thunderbird completely before importing.',
      'Check the system tray to make sure Thunderbird is not running in the background.',
      'Retry the import after Thunderbird is fully closed.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Always close Thunderbird before importing its data into Stormbird.',
  },
];
