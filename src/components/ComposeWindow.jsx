// ─────────────────────────────────────────────────────────────────────────────
// ComposeWindow.jsx — Compose new email
// Supports: To, Cc, Bcc, Subject, body, from-picker, draft auto-save
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';

const DRAFT_SAVE_INTERVAL = 30000; // 30 seconds

export default function ComposeWindow({ accounts, onClose, prefill }) {
  const gmailAccounts = accounts.filter(a => a.id !== 'local');

  const [fromId,   setFromId]   = useState(gmailAccounts[0]?.id || '');
  const [to,       setTo]       = useState(prefill?.to      || '');
  const [cc,       setCc]       = useState(prefill?.cc      || '');
  const [bcc,      setBcc]      = useState(prefill?.bcc     || '');
  const [subject,  setSubject]  = useState(prefill?.subject || '');
  const [body,     setBody]     = useState(prefill?.body    || '');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending,  setSending]  = useState(false);
  const [result,   setResult]   = useState(null); // { type: 'success'|'error', msg }
  const [draftId,  setDraftId]  = useState(prefill?.draftId || null);
  const [dirty,    setDirty]    = useState(false);

  const draftTimer = useRef(null);

  // ── Auto-save draft ───────────────────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!dirty) return;
    const account = gmailAccounts.find(a => a.id === fromId);
    const res = await window.sb.mail.saveDraft({
      id       : draftId,
      accountId: fromId,
      fromAddr : account?.email || '',
      to, cc, bcc, subject,
      bodyText : body,
    });
    if (res?.id) setDraftId(res.id);
    setDirty(false);
  }, [dirty, draftId, fromId, to, cc, bcc, subject, body]);

  useEffect(() => {
    if (!dirty) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveDraft, DRAFT_SAVE_INTERVAL);
    return () => clearTimeout(draftTimer.current);
  }, [dirty, saveDraft]);

  const markDirty = () => setDirty(true);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!to.trim()) { setResult({ type: 'error', msg: 'To address is required.' }); return; }
    if (!fromId)    { setResult({ type: 'error', msg: 'Select an account to send from.' }); return; }

    const account = gmailAccounts.find(a => a.id === fromId);
    setSending(true);
    setResult(null);

    const res = await window.sb.mail.send({
      accountId: fromId,
      fromAddr : account?.email || '',
      to, cc, bcc, subject,
      bodyText : body,
    });

    setSending(false);
    if (res?.success) {
      // Delete draft if one was saved
      if (draftId) window.sb.mail.deleteDraft(draftId);
      setResult({ type: 'success', msg: 'Message queued for delivery.' });
      setTimeout(onClose, 1200);
    } else {
      setResult({ type: 'error', msg: res?.error || 'Send failed.' });
    }
  };

  const handleSaveDraft = async () => {
    setDirty(true);
    await saveDraft();
    setResult({ type: 'success', msg: 'Draft saved.' });
  };

  const handleDiscard = () => {
    if (draftId) window.sb.mail.deleteDraft(draftId);
    onClose();
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    overlay: {
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      zIndex: 3000, padding: 20,
    },
    window: {
      width: 560, background: 'var(--bg-app)',
      border: '1px solid var(--border-strong)',
      borderTop: '2px solid var(--accent)',
      display: 'flex', flexDirection: 'column',
      maxHeight: '85vh',
    },
    header: {
      display: 'flex', alignItems: 'center', padding: '8px 12px',
      borderBottom: '1px solid var(--border)', background: 'var(--bg-toolbar)',
      flexShrink: 0,
    },
    body: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
    footer: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
      borderTop: '1px solid var(--border)', background: 'var(--bg-toolbar)',
      flexShrink: 0,
    },
  };

  return (
    <div style={S.overlay}>
      <div style={S.window}>

        {/* Header */}
        <div style={S.header}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
            NEW MESSAGE
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={handleDiscard} style={btnStyle('muted')}>Discard</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginLeft: 8 }}>✕</button>
        </div>

        {/* Fields */}
        <div style={S.body}>
          <Field label="From">
            <select value={fromId} onChange={e => { setFromId(e.target.value); markDirty(); }}
              style={inputStyle()}>
              {gmailAccounts.length === 0
                ? <option value="">No accounts — add one first</option>
                : gmailAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.email}</option>
                  ))
              }
            </select>
          </Field>

          <Field label="To">
            <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <input value={to} onChange={e => { setTo(e.target.value); markDirty(); }}
                placeholder="recipient@example.com" style={{ ...inputStyle(), flex: 1 }} autoFocus />
              <button onClick={() => setShowCcBcc(s => !s)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, whiteSpace: 'nowrap', padding: '0 8px' }}>
                {showCcBcc ? '▲ hide' : 'Cc / Bcc'}
              </button>
            </div>
          </Field>

          {showCcBcc && (
            <>
              <Field label="Cc">
                <input value={cc} onChange={e => { setCc(e.target.value); markDirty(); }}
                  placeholder="cc@example.com" style={inputStyle()} />
              </Field>
              <Field label="Bcc">
                <input value={bcc} onChange={e => { setBcc(e.target.value); markDirty(); }}
                  placeholder="bcc@example.com" style={inputStyle()} />
              </Field>
            </>
          )}

          <Field label="Subject">
            <input value={subject} onChange={e => { setSubject(e.target.value); markDirty(); }}
              placeholder="(no subject)" style={inputStyle()} />
          </Field>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <textarea
              value={body}
              onChange={e => { setBody(e.target.value); markDirty(); }}
              placeholder="Write your message…"
              style={{
                flex: 1, resize: 'none', border: 'none',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-input)', color: 'var(--text-primary)',
                padding: '10px 14px', fontSize: 13,
                fontFamily: 'inherit', lineHeight: 1.6, outline: 'none',
                minHeight: 200,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button onClick={handleSend} disabled={sending || gmailAccounts.length === 0}
            style={btnStyle('accent', sending)}>
            {sending ? '⟳ Sending…' : '➤ Send'}
          </button>
          <button onClick={handleSaveDraft} disabled={sending} style={btnStyle('normal')}>
            Save draft
          </button>
          <div style={{ flex: 1 }} />
          {result && (
            <span style={{
              fontSize: 11,
              color: result.type === 'success' ? 'var(--green)' : 'var(--cat-error)',
            }}>
              {result.type === 'success' ? '✓' : '⚠'} {result.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      padding: '0 12px',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 56, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function inputStyle() {
  return {
    background: 'none', border: 'none', color: 'var(--text-primary)',
    padding: '8px 4px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', width: '100%',
  };
}

function btnStyle(type, loading) {
  const base = {
    padding: '6px 14px', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', border: '1px solid', opacity: loading ? 0.6 : 1,
  };
  if (type === 'accent') return { ...base, background: 'var(--accent-dim)', borderColor: 'var(--border-accent)', color: 'var(--text-accent)', fontWeight: 700 };
  if (type === 'muted')  return { ...base, background: 'none', borderColor: 'var(--border)', color: 'var(--text-muted)' };
  return { ...base, background: 'none', borderColor: 'var(--border-strong)', color: 'var(--text-second)' };
}
