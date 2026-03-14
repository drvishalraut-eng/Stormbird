// ─────────────────────────────────────────────────────────────────────────────
// rules/imap.rules.js — Offline diagnosis rules for IMAP failures
// Each rule has: id, match(ctx), explanation, likelyCause, steps, recurrenceRisk, prevention
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  {
    id: 'imap-auth-failed',
    match: (ctx) => ctx.process === 'ImapSync' && /auth|login|credential|password/i.test(ctx.error),
    explanation    : 'Gmail rejected the login credentials. Your App Password may have been revoked or changed.',
    likelyCause    : 'The Gmail App Password stored in Stormbird is no longer valid.',
    steps          : [
      'Go to Settings → Accounts → select the affected account.',
      'Click "Edit" and re-enter your Gmail App Password.',
      'If you do not have an App Password, go to myaccount.google.com → Security → App Passwords and generate a new one.',
      'Make sure 2-Step Verification is enabled on your Google account — App Passwords require it.',
      'Save and click "Test Connection" to verify.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'App Passwords only need replacing if you revoke them or change your Google password.',
  },

  {
    id: 'imap-overquota',
    match: (ctx) => ctx.process === 'ImapSync' && /overquota|rate.?limit|too.?many|slowdown/i.test(ctx.error),
    explanation    : 'Gmail has temporarily throttled the connection. This is normal when downloading large email archives.',
    likelyCause    : 'Google limits how quickly you can download email via IMAP. You have hit a temporary rate limit.',
    steps          : [
      'Wait 30–60 minutes for the rate limit to reset.',
      'Go to Settings → Sync → reduce Batch Size from 100 to 50.',
      'Increase the wait between batches to at least 10 minutes.',
      'Click "Retry" in the Process Manager.',
    ],
    recurrenceRisk : 'medium',
    prevention     : 'Keep batch size at 50 or lower and batch wait at 10+ minutes for large archives.',
  },

  {
    id: 'imap-timeout',
    match: (ctx) => ctx.process === 'ImapSync' && /timeout|timed.?out|ETIMEDOUT/i.test(ctx.error),
    explanation    : 'The connection to Gmail timed out. This is usually a temporary network issue.',
    likelyCause    : 'The network connection dropped or Gmail did not respond in time.',
    steps          : [
      'Check your internet connection is working.',
      'Wait 2–3 minutes and click "Retry manually" in the Process Manager.',
      'If the problem persists, try restarting Stormbird.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Stormbird will automatically retry with exponential backoff on repeated timeouts.',
  },

  {
    id: 'imap-connection-refused',
    match: (ctx) => ctx.process === 'ImapSync' && /ECONNREFUSED|connection refused/i.test(ctx.error),
    explanation    : 'Stormbird could not connect to the Gmail IMAP server at all.',
    likelyCause    : 'Your internet connection is offline, or a firewall is blocking port 993.',
    steps          : [
      'Check that your internet connection is active.',
      'If you are on a corporate or school network, port 993 may be blocked — try a different network.',
      'Verify IMAP is enabled in your Gmail settings: Gmail → Settings → See all settings → Forwarding and POP/IMAP.',
    ],
    recurrenceRisk : 'medium',
    prevention     : 'IMAP access must be enabled in Gmail settings and port 993 must be open on your network.',
  },

  {
    id: 'imap-ssl-error',
    match: (ctx) => ctx.process === 'ImapSync' && /SSL|TLS|certificate|CERT/i.test(ctx.error),
    explanation    : 'There was a security certificate error when connecting to Gmail.',
    likelyCause    : 'A network proxy or antivirus software may be intercepting the secure connection.',
    steps          : [
      'Temporarily disable any VPN or antivirus and retry.',
      'If on a corporate network, your IT department may need to whitelist imap.gmail.com:993.',
      'Go to Settings → Accounts → Advanced → enable "Allow insecure TLS" as a temporary workaround.',
    ],
    recurrenceRisk : 'high',
    prevention     : 'Corporate networks with SSL inspection require IT-level configuration.',
  },
];
