// ─────────────────────────────────────────────────────────────────────────────
// AccountSetup.jsx — Add OR edit Gmail account dialog
// Pass `account` prop to enter edit mode (pre-fills fields, shows Remove button)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import React from 'react';

export default function AccountSetup({ onSave, onCancel, account }) {
  const isEdit = !!account;

  const [email,      setEmail]      = useState(account?.email    || '');
  const [password,   setPassword]   = useState('');
  const [name,       setName]       = useState(account?.display_name || '');
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [removing,   setRemoving]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error,      setError]      = useState('');

  const handleTest = async () => {
    if (!email || !password) { setError('Email and App Password are required.'); return; }
    setError(''); setTesting(true); setTestResult(null);
    const result = await window.sb.accounts.testImap({ email, password });
    setTesting(false); setTestResult(result);
    if (!result.success) setError(result.error || 'Connection failed');
  };

  const handleSave = async () => {
    if (!email) { setError('Email is required.'); return; }
    if (!isEdit && !password) { setError('App Password is required.'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const updates = { id: account.id, email, display_name: name || email.split('@')[0] };
        if (password) { updates.password = password; }
        await window.sb.accounts.update(updates);
      } else {
        await window.sb.accounts.add({
          email, display_name: name || email.split('@')[0],
          password, imap_host: 'imap.gmail.com', imap_port: 993,
          smtp_host: 'smtp.gmail.com', smtp_port: 587,
        });
      }
      onSave();
    } catch (err) {
      setError(err.message); setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setRemoving(true);
    await window.sb.accounts.remove(account.id);
    onSave();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{
        width: 460, background: 'var(--bg-app)',
        border: '1px solid var(--border-strong)', borderTop: '2px solid var(--accent)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-toolbar)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>
            {isEdit ? 'EDIT ACCOUNT' : 'ADD GMAIL ACCOUNT'}
          </span>
          <button onClick={onCancel} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Notice */}
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid var(--border-accent)',
            padding: '8px 12px', fontSize: 11, color: 'var(--text-second)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-accent)' }}>App Password required.</strong>{' '}
            {isEdit
              ? 'Leave the password field blank to keep the existing password.'
              : 'Stormbird uses Gmail App Passwords — not your regular password.'
            }<br />
            <span
              onClick={() => window.sb?.shell.openExternal('https://myaccount.google.com/apppasswords')}
              style={{ color: 'var(--text-accent)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Generate one at myaccount.google.com/apppasswords →
            </span>
          </div>

          <Field label="Gmail address">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@gmail.com" autoFocus={!isEdit} />
          </Field>

          <Field label={isEdit ? 'New App Password (leave blank to keep existing)' : 'App Password (16 characters)'}>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={isEdit ? '(unchanged)' : 'xxxx xxxx xxxx xxxx'} autoFocus={isEdit} />
          </Field>

          <Field label="Display name (optional)">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Work Gmail" />
          </Field>

          {error && (
            <div style={{ color: 'var(--cat-error)', fontSize: 11, padding: '4px 0' }}>⚠ {error}</div>
          )}
          {testResult?.success && (
            <div style={{ color: 'var(--green)', fontSize: 11 }}>✓ Connection successful</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4, alignItems: 'center' }}>
            {/* Remove button — only in edit mode */}
            {isEdit && (
              <button onClick={handleRemove} disabled={removing} style={{
                padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                background: confirmDel ? 'rgba(239,68,68,0.15)' : 'none',
                border: '1px solid rgba(239,68,68,0.4)',
                color: 'var(--cat-error)', marginRight: 'auto',
                opacity: removing ? 0.6 : 1,
              }}>
                {removing ? '⟳ Removing…' : confirmDel ? '⚠ Confirm remove?' : '🗑 Remove account'}
              </button>
            )}

            <Btn onClick={onCancel} muted>Cancel</Btn>
            <Btn onClick={handleTest} loading={testing} disabled={testing || saving}>
              {testing ? '⟳ Testing…' : 'Test connection'}
            </Btn>
            <Btn onClick={handleSave} accent loading={saving} disabled={saving || testing}>
              {saving ? '⟳ Saving…' : isEdit ? 'Save changes' : 'Add account'}
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
            width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', padding: '7px 10px', fontSize: 13,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }
        })}
      </div>
    </div>
  );
}

function Btn({ children, onClick, accent, muted, loading, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      padding: '6px 14px',
      background: accent ? 'var(--accent-dim)' : 'none',
      border: `1px solid ${accent ? 'var(--border-accent)' : muted ? 'var(--border)' : 'var(--border-strong)'}`,
      color: accent ? 'var(--text-accent)' : muted ? 'var(--text-muted)' : 'var(--text-second)',
      fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', fontWeight: accent ? 600 : 400, opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}
