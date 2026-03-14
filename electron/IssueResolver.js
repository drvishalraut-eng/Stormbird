// ─────────────────────────────────────────────────────────────────────────────
// IssueResolver.js — Diagnose process failures
// Tries offline rule-based suggestions first.
// Falls back to Claude API when online and API key is configured.
// Never sends passwords, email content, or full email addresses to Claude.
// ─────────────────────────────────────────────────────────────────────────────

const https  = require('https');
const logger = require('./logger');

// Rules are loaded from separate files per process domain
const RULES = [
  ...require('./rules/imap.rules'),
  ...require('./rules/storage.rules'),
  ...require('./rules/smtp.rules'),
  ...require('./rules/import.rules'),
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * diagnose(issue, processEntry)
 *
 * Returns a diagnosis object:
 * {
 *   source:           'rules' | 'claude' | 'unknown'
 *   explanation:      string   — plain English, 1-2 sentences
 *   likelyCause:      string
 *   steps:            string[] — numbered action steps
 *   recurrenceRisk:   'low' | 'medium' | 'high'
 *   prevention:       string
 * }
 */
async function diagnose(issue, processEntry) {
  logger.log('CLAUDE', `Starting diagnosis for ${issue.process}: ${issue.errorMsg}`);

  // ── Step 1: Try offline rules first (instant, no network) ──
  const ruleMatch = _tryRules(issue, processEntry);
  if (ruleMatch) {
    logger.log('CLAUDE', `Rule match found for ${issue.process} — no API call needed`);
    return { source: 'rules', ...ruleMatch };
  }

  // ── Step 2: Try Claude API if online and key configured ──
  const apiKey = _getApiKey();
  if (!apiKey) {
    logger.warn('CLAUDE', 'No API key configured — cannot use Claude for diagnosis');
    return _unknownDiagnosis(issue);
  }

  const online = await _checkConnectivity();
  if (!online) {
    logger.warn('CLAUDE', 'Offline — cannot reach Claude API');
    return _unknownDiagnosis(issue);
  }

  try {
    const diagnosis = await _callClaude(issue, processEntry, apiKey);
    logger.log('CLAUDE', `Claude diagnosis received for ${issue.process}`);
    return { source: 'claude', ...diagnosis };
  } catch (err) {
    logger.error('CLAUDE', 'Claude API call failed', err);
    return _unknownDiagnosis(issue);
  }
}

// ── Rule engine ───────────────────────────────────────────────────────────────

function _tryRules(issue, processEntry) {
  const ctx = _buildContext(issue, processEntry);

  for (const rule of RULES) {
    try {
      if (rule.match(ctx)) {
        logger.log('CLAUDE', `Rule matched: "${rule.id}"`);
        return {
          explanation    : rule.explanation,
          likelyCause    : rule.likelyCause,
          steps          : rule.steps,
          recurrenceRisk : rule.recurrenceRisk || 'medium',
          prevention     : rule.prevention     || 'Monitor the process log for recurring patterns.',
        };
      }
    } catch (_) {
      // Rule threw — skip it
    }
  }

  return null;
}

// ── Context builder — strips all sensitive data ───────────────────────────────

function _buildContext(issue, processEntry) {
  return {
    process     : issue.process,
    error       : issue.errorMsg || '',
    state       : processEntry.state,
    restartCount: processEntry.restartCount,
    errorCount  : processEntry.errorCount,
    // Sanitized logs — no email content, no addresses, no passwords
    recentLogs  : (issue.logs || []).map(l => ({
      category: l.category,
      message : _sanitize(l.message),
    })),
  };
}

/**
 * Strip potentially sensitive values from log messages.
 * Removes email addresses, passwords that may have leaked, auth tokens.
 */
function _sanitize(text) {
  if (!text) return '';
  return text
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/password[=:]["']?[^\s"',}]*/gi, 'password=[REDACTED]')
    .replace(/auth[=:]["']?[^\s"',}]*/gi,     'auth=[REDACTED]')
    .replace(/token[=:]["']?[^\s"',}]*/gi,    'token=[REDACTED]')
    .replace(/key[=:]["']?[^\s"',}]*/gi,      'key=[REDACTED]');
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function _callClaude(issue, processEntry, apiKey) {
  const ctx = _buildContext(issue, processEntry);

  const systemPrompt = `You are a diagnostic assistant for Stormbird — a Windows portable email archiving app built on Electron.
When a process fails, diagnose the issue and guide the user to resolution.
Always respond in plain English. Never use jargon. Be specific and actionable.
The user is not a developer — give them steps they can actually follow in the Stormbird UI.
Respond ONLY with valid JSON. No preamble, no markdown, no backticks.`;

  const userPrompt = `A Stormbird process has failed. Diagnose it and provide resolution steps.

Process: ${ctx.process}
Error: ${ctx.error}
State: ${ctx.state}
Restart attempts: ${ctx.restartCount}
Recent log lines:
${ctx.recentLogs.map(l => `  [${l.category}] ${l.message}`).join('\n')}

Respond with this exact JSON structure:
{
  "explanation": "1-2 sentence plain English explanation of what went wrong",
  "likelyCause": "most likely root cause in one sentence",
  "steps": ["step 1", "step 2", "step 3"],
  "recurrenceRisk": "low|medium|high",
  "prevention": "one sentence on how to prevent this happening again"
}`;

  const body = JSON.stringify({
    model      : 'claude-sonnet-4-20250514',
    max_tokens : 1000,
    system     : systemPrompt,
    messages   : [{ role: 'user', content: userPrompt }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path    : '/v1/messages',
      method  : 'POST',
      headers : {
        'Content-Type'     : 'application/json',
        'x-api-key'        : apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed   = JSON.parse(data);
          const text     = parsed.content?.[0]?.text || '';
          const diagnosis = JSON.parse(text);
          resolve(diagnosis);
        } catch (e) {
          reject(new Error(`Failed to parse Claude response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Claude API request timed out after 30s'));
    });

    req.write(body);
    req.end();
  });
}

// ── Connectivity check ────────────────────────────────────────────────────────

function _checkConnectivity() {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path    : '/',
      method  : 'HEAD',
    }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getApiKey() {
  // Read from settings — AccountManager will expose this
  // For now read from environment (dev) or settings file
  try {
    const settingsPath = require('path').join(
      require('electron').app.getPath('userData'), '..', 'Stormbird-Data', 'settings.json'
    );
    if (require('fs').existsSync(settingsPath)) {
      const settings = JSON.parse(require('fs').readFileSync(settingsPath, 'utf8'));
      return settings.claudeApiKey || null;
    }
  } catch (_) {}
  return process.env.STORMBIRD_CLAUDE_KEY || null;
}

function _unknownDiagnosis(issue) {
  return {
    source         : 'unknown',
    explanation    : `The process "${issue.process}" encountered an error: ${issue.errorMsg}`,
    likelyCause    : 'The specific cause could not be determined automatically.',
    steps          : [
      'Check the Console panel for more detail — press Ctrl+` to open it.',
      'Try clicking "Retry manually" to restart the process.',
      'If the problem persists, check your internet connection and account settings.',
      'Configure a Claude API key in Settings → AI to enable automatic diagnosis.',
    ],
    recurrenceRisk : 'unknown',
    prevention     : 'Enable AI diagnosis in Settings for automatic issue resolution.',
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { diagnose };
