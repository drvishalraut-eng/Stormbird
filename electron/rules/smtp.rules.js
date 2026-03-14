// rules/smtp.rules.js — Offline diagnosis rules for SMTP send failures

module.exports = [
  {
    id: 'smtp-auth-failed',
    match: (ctx) => ctx.process === 'OutboxQueue' && /auth|535|username|password/i.test(ctx.error),
    explanation    : 'Gmail rejected the outgoing mail login. Your SMTP App Password may need updating.',
    likelyCause    : 'The SMTP App Password is incorrect or has been revoked.',
    steps          : [
      'Go to Settings → Accounts → select the affected account → Edit.',
      'Re-enter your Gmail App Password in the SMTP section.',
      'Click "Test SMTP" to verify the credentials work.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'SMTP and IMAP use the same App Password — updating one updates both.',
  },

  {
    id: 'smtp-connection-failed',
    match: (ctx) => ctx.process === 'OutboxQueue' && /ECONNREFUSED|ETIMEDOUT|connect/i.test(ctx.error),
    explanation    : 'Stormbird could not connect to Gmail to send your queued messages.',
    likelyCause    : 'Your internet connection is offline, or port 587 is blocked.',
    steps          : [
      'Check your internet connection.',
      'Stormbird will automatically retry sending when you reconnect.',
      'Your messages are safely saved in the Outbox and will not be lost.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Stormbird automatically queues and retries messages — no action needed for temporary outages.',
  },

  {
    id: 'smtp-recipient-rejected',
    match: (ctx) => ctx.process === 'OutboxQueue' && /550|551|recipient|invalid address/i.test(ctx.error),
    explanation    : 'One or more recipient email addresses were rejected by Gmail.',
    likelyCause    : 'An email address in the To/Cc/Bcc field is invalid or does not exist.',
    steps          : [
      'Open the Outbox from the sidebar.',
      'Find the failed message and click Edit.',
      'Check the recipient email addresses for typos.',
      'Correct the address and click Send.',
    ],
    recurrenceRisk : 'low',
    prevention     : 'Double-check recipient addresses before sending.',
  },
];
