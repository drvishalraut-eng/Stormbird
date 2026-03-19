// ─────────────────────────────────────────────────────────────────────────────
// AccountSetup.jsx — Add/edit Gmail account dialog
// Collects email + App Password, tests connection before saving.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

export default function AccountSetup({ onSave, onCancel }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const handleTest = async () => {
    if (!email || !password) { setError('Email and App Password are required.'); return; }
    setError('');
    setTesting(true);
    setTestResult(null);

    const result = await window.sb.accounts.testImap({ email, password });
    setTesting(false);
    setTestResult(result);
    if (!result.success) setError(result.error || 'Connection failed');
  };

  const handleSave = async () => {
    if (!email || !password) { setError('Email and App Password are required.'); return; }
    setSaving(true);
    try {
      const account = await window.sb.accounts.add({
        email,
        display_name: name || email.split('@')[0],
        password,
        imap_host: 'imap.gmail.com',
        imap_port: 993,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
      });
      onSave(account);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={{
      position      : 'fixed',
      inset         : 0,
      background    : 'rgba(0,0,0,0.75)',
      display       : 'flex',
      alignItems    : 'center',
      justifyContent: 'center',
      zIndex        : 2000,
    }}>
      <div style={{
        width     : 460,
        background: 'var(--bg-app)',
        border    : '1px solid var(--border-strong)',
        borderTop : '2px solid var(--accent)',
      }}>
        {/* Header */}
        <div style={{
          display      : 'flex',
          alignItems   : 'center',
          padding      : '10px 14px',
          borderBottom : '1px solid var(--border)',
          background   : 'var(--bg-toolbar)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>
            ADD GMAIL ACCOUNT
          </span>
          <button onClick={onCancel} style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* App Password notice */}
          <div style={{
            background : 'var(--accent-dim)',
            border     : '1px solid var(--border-accent)',
            padding    : '8px 12px',
            fontSize   : 11,
            color      : 'var(--text-second)',
            lineHeight : 1.6,
          }}>
            <strong style={{ color: 'var(--text-accent)' }}>App Password required.</strong> Stormbird
            uses Gmail App Passwords — not your regular password.<br />
            <span
              onClick={() => window.sb?.shell.openExternal('https://myaccount.google.com/apppasswords')}
              style={{ color: 'var(--text-accent)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Generate one at myaccount.google.com/apppasswords →
            </span>
          </div>

          <Field label="Gmail address">
            <input
              type        = "email"
              value       = {email}
              onChange    = {e => setEmail(e.target.value)}
              placeholder = "drvishalraut@gmail.com"
              autoFocus
            />
          </Field>

          <Field label="App Password (16 characters)">
            <input
              type        = "password"
              value       = {password}
              onChange    = {e => setPassword(e.target.value)}
              placeholder = "xxxx xxxx xxxx xxxx"
            />
          </Field>

          <Field label="Display name (optional)">
            <input
              type        = "text"
              value       = {name}
              onChange    = {e => setName(e.target.value)}
              placeholder = "Dr Vishal Raut"
            />
          </Field>

          {error && (
            <div style={{ color: 'var(--cat-error)', fontSize: 11, padding: '4px 0' }}>
              ⚠ {error}
            </div>
          )}

          {testResult?.success && (
            <div style={{ color: 'var(--green)', fontSize: 11 }}>
              ✓ Connection successful — Gmail is reachable
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Btn onClick={onCancel} muted>Cancel</Btn>
            <Btn onClick={handleTest} loading={testing} disabled={testing || saving}>
              {testing ? '⟳ Testing…' : 'Test connection'}
            </Btn>
            <Btn onClick={handleSave} accent loading={saving} disabled={saving || testing}>
              {saving ? '⟳ Saving…' : 'Add account'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
        {label.toUpperCase()}
      </label>
      <div style={{ position: 'relative' }}>
        {React.cloneElement(children, {
          style: {
            width      : '100%',
            background : 'var(--bg-input)',
            border     : '1px solid var(--border)',
            color      : 'var(--text-primary)',
            padding    : '7px 10px',
            fontSize   : 13,
            outline    : 'none',
            fontFamily : 'inherit',
            boxSizing  : 'border-box',
          }
        })}
      </div>
    </div>
  );
}

function Btn({ children, onClick, accent, muted, loading, disabled }) {
  return (
    <button
      onClick  = {disabled ? undefined : onClick}
      disabled = {disabled}
      style    = {{
        padding   : '6px 14px',
        background: accent ? 'var(--accent-dim)' : 'none',
        border    : `1px solid ${accent ? 'var(--border-accent)' : muted ? 'var(--border)' : 'var(--border-strong)'}`,
        color     : accent ? 'var(--text-accent)' : muted ? 'var(--text-muted)' : 'var(--text-second)',
        fontSize  : 12,
        cursor    : disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        fontWeight: accent ? 600 : 400,
        opacity   : disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Need React for cloneElement
import React from 'react';
