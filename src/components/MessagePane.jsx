// ─────────────────────────────────────────────────────────────────────────────
// MessagePane.jsx — Email reading pane
// Shows subject, metadata, body (plain text or sanitized HTML), attachments.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export default function MessagePane({ messageId }) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewHtml, setViewHtml] = useState(false);

  // ── Load message when ID changes ──────────────────────────────────────────
  useEffect(() => {
    if (!messageId || !window.sb) {
      setMessage(null);
      return;
    }
    setLoading(true);
    window.sb.messages.get(messageId)
      .then(msg => {
        setMessage(msg);
        setViewHtml(!!msg?.body_html && !msg?.body_text);
      })
      .catch(() => setMessage(null))
      .finally(() => setLoading(false));
  }, [messageId]);

  if (!messageId) return <EmptyPane />;
  if (loading)    return <LoadingPane />;
  if (!message)   return <EmptyPane text="Could not load message." />;

  const attachNames = message.attach_names
    ? message.attach_names.split(',').filter(Boolean)
    : [];

  return (
    <div style={{
      flex         : 1,
      background   : 'var(--bg-pane)',
      display      : 'flex',
      flexDirection: 'column',
      overflow     : 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding     : '14px 18px 12px',
        borderBottom: '1px solid var(--border-strong)',
        flexShrink  : 0,
      }}>
        {/* Subject */}
        <div style={{
          fontSize    : 15,
          fontWeight  : 700,
          lineHeight  : 1.3,
          marginBottom: 10,
        }}>
          {_cleanDisplay(message.subject) || '(no subject)'}
        </div>

        {/* Metadata */}
        <div style={{
          display   : 'flex',
          flexWrap  : 'wrap',
          gap       : '3px 18px',
          fontSize  : 12,
          marginBottom: 10,
        }}>
          <MetaField label="From" value={_cleanDisplay(`${message.from_name || ''} ${message.from_addr ? `<${message.from_addr}>` : ''}`.trim())} />
          <MetaField label="To"   value={_cleanDisplay(message.to_addrs)} />
          {message.cc_addrs && <MetaField label="Cc" value={_cleanDisplay(message.cc_addrs)} />}
          <MetaField label="Date" value={_formatFullDate(message.date_ms)} />
          <MetaField label="Folder" value={message.folder} />
        </div>

        {/* Attachments */}
        {attachNames.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {attachNames.map((name, i) => (
              <AttachmentChip
                key     = {i}
                name    = {name}
                emlPath = {message.eml_path}
              />
            ))}
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View toggle */}
          {message.body_html && message.body_text && (
            <button
              onClick = {() => setViewHtml(v => !v)}
              style   = {{
                padding  : '3px 10px',
                background: 'var(--bg-hover)',
                border   : '1px solid var(--border)',
                color    : 'var(--text-second)',
                fontSize : 11,
                cursor   : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {viewHtml ? '📄 Plain text' : '🌐 HTML view'}
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Actions */}
          {[
            { label: '↩ Reply',   action: () => {} },
            { label: '↪ Forward', action: () => {} },
            { label: '↓ Export .eml', action: () => _exportEml(message) },
            { label: '🤖 AI (v2)', disabled: true },
          ].map(btn => (
            <button
              key      = {btn.label}
              onClick  = {btn.disabled ? undefined : btn.action}
              style    = {{
                padding   : '4px 10px',
                background: btn.disabled ? 'none' : 'var(--accent-dim)',
                border    : `1px solid ${btn.disabled ? 'var(--border)' : 'var(--border-accent)'}`,
                color     : btn.disabled ? 'var(--text-muted)' : 'var(--text-accent)',
                fontSize  : 11,
                cursor    : btn.disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 500,
                opacity   : btn.disabled ? 0.5 : 1,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {viewHtml && message.body_html ? (
          <div
            dangerouslySetInnerHTML={{ __html: _sanitizeHtml(message.body_html) }}
            style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-second)' }}
          />
        ) : (
          <pre style={{
            fontFamily : "'Segoe UI', system-ui, sans-serif",
            fontSize   : 13,
            lineHeight : 1.75,
            color      : 'var(--text-second)',
            whiteSpace : 'pre-wrap',
            wordBreak  : 'break-word',
            margin     : 0,
          }}>
            {message.body_text || message.body_html
              ? _htmlToText(message.body_html || '')
              : '(No message body)'}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyPane({ text }) {
  return (
    <div style={{
      flex           : 1,
      display        : 'flex',
      alignItems     : 'center',
      justifyContent : 'center',
      color          : 'var(--text-muted)',
      fontSize       : 13,
    }}>
      {text || 'Select a message to read it'}
    </div>
  );
}

function LoadingPane() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12,
    }}>
      Loading…
    </div>
  );
}

function MetaField({ label, value }) {
  if (!value) return null;
  return (
    <span>
      <span style={{ color: 'var(--text-muted)' }}>{label}: </span>
      <span style={{ color: 'var(--text-second)' }}>{value}</span>
    </span>
  );
}

function AttachmentChip({ name, emlPath }) {
  const handleOpen = () => {
    if (!window.sb || !emlPath) return;
    // The attachment folder is next to the .eml file
    const attachDir = emlPath.replace(/\.eml$/, '');
    window.sb.shell.openPath(attachDir);
  };

  return (
    <button
      onClick = {handleOpen}
      title   = {`Open attachments folder for: ${name}`}
      style   = {{
        display   : 'flex',
        alignItems: 'center',
        gap       : 5,
        padding   : '2px 8px',
        background: 'var(--bg-tag)',
        border    : '1px solid var(--border)',
        color     : 'var(--text-second)',
        fontSize  : 11,
        cursor    : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span>📎</span>
      <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _cleanDisplay(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function _formatFullDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString([], {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function _exportEml(message) {
  if (!window.sb) return;
  const result = await window.sb.dialog.saveFile({
    defaultPath: `${message.subject || 'email'}.eml`,
    filters: [{ name: 'Email files', extensions: ['eml'] }],
  });
  if (!result.canceled && result.filePath) {
    // File is already on disk — just open the folder
    window.sb.shell.openPath(result.filePath);
  }
}

/**
 * Very basic HTML sanitizer — removes scripts and dangerous attributes.
 * For display inside Electron contextIsolation is our main safety.
 */
function _sanitizeHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-removed=')
    .replace(/javascript:/gi, 'removed:');
}

function _htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .trim();
}
