// ─────────────────────────────────────────────────────────────────────────────
// SetupWizard.jsx — First-run setup wizard
// Steps: Welcome → Data location → Add account → Done
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

const STEPS = ['welcome', 'location', 'account', 'done'];

export default function SetupWizard({ onComplete }) {
  const [step,     setStep]     = useState(0);
  const [dataDir,  setDataDir]  = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [skipAccount, setSkipAccount] = useState(false);

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));

  const handleBrowseDir = async () => {
    const dir = await window.sb?.dialog.openDir({ title: 'Choose Stormbird data folder' });
    if (dir) setDataDir(dir);
  };

  const handleTestImap = async () => {
    if (!email || !password) { setError('Email and App Password are required.'); return; }
    setError('');
    setTesting(true);
    const result = await window.sb.accounts.testImap({ email, password });
    setTesting(false);
    setTestResult(result);
    if (!result.success) setError(result.error || 'Connection failed');
  };

  const handleAddAccount = async () => {
    if (!email || !password) { setError('Email and App Password are required.'); return; }
    setSaving(true);
    try {
      await window.sb.accounts.add({
        email,
        display_name: email.split('@')[0],
        password,
        imap_host: 'imap.gmail.com',
        imap_port: 993,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
      });
      next();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const S = {
    overlay: {
      position: 'fixed', inset: 0,
      background: 'var(--bg-app)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000,
    },
    card: {
      width: 520,
      border: '1px solid var(--border-strong)',
      borderTop: '3px solid var(--accent)',
      background: 'var(--bg-app)',
    },
    header: {
      padding: '24px 28px 0',
    },
    body: {
      padding: '20px 28px 24px',
    },
    footer: {
      padding: '14px 28px',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--bg-toolbar)',
    },
  };

  return (
    <div style={S.overlay}>
      <div style={S.card}>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, padding: '16px 28px 0' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 8, height: 8,
              borderRadius: 4,
              background: i <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <>
            <div style={S.header}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>⚡</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                Welcome to Stormbird
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                USB-portable email archiver. Your emails stay on your drive — private, offline, yours.
              </p>
            </div>
            <div style={S.body}>
              <FeatureRow icon="📦" title="Archive your Gmail" desc="Download all your email via IMAP and store it locally as .eml files." />
              <FeatureRow icon="✉" title="Compose & send" desc="Write and send emails using your Gmail App Password." />
              <FeatureRow icon="🔒" title="Integrity verified" desc="Every email gets a SHA-256 checksum. Corruption is detected automatically." />
              <FeatureRow icon="🗄" title="NAS backup" desc="Copy your archive to a NAS or network drive on a schedule." />
            </div>
            <div style={S.footer}>
              <div style={{ flex: 1 }} />
              <Btn accent onClick={next}>Get started →</Btn>
            </div>
          </>
        )}

        {/* ── Step 1: Data location ── */}
        {step === 1 && (
          <>
            <div style={S.header}>
              <h2 style={heading}>Where should Stormbird store your emails?</h2>
              <p style={sub}>Choose a folder on your USB drive or local disk. All .eml files and the database will be stored here.</p>
            </div>
            <div style={S.body}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  value={dataDir}
                  onChange={e => setDataDir(e.target.value)}
                  placeholder="E:\Stormbird-Data  or  C:\Users\You\Stormbird-Data"
                  style={inputStyle()}
                />
                <Btn onClick={handleBrowseDir}>Browse…</Btn>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Leave blank to use the default location next to the Stormbird executable.
              </p>
            </div>
            <div style={S.footer}>
              <Btn muted onClick={() => setStep(0)}>← Back</Btn>
              <div style={{ flex: 1 }} />
              <Btn onClick={next}>Skip for now</Btn>
              <Btn accent onClick={next}>Continue →</Btn>
            </div>
          </>
        )}

        {/* ── Step 2: Add account ── */}
        {step === 2 && (
          <>
            <div style={S.header}>
              <h2 style={heading}>Connect your Gmail account</h2>
              <p style={sub}>Stormbird uses Gmail App Passwords — not your regular password.</p>
            </div>
            <div style={S.body}>
              <div style={{
                background: 'var(--accent-dim)', border: '1px solid var(--border-accent)',
                padding: '8px 12px', marginBottom: 16, fontSize: 11, color: 'var(--text-second)', lineHeight: 1.6,
              }}>
                <strong style={{ color: 'var(--text-accent)' }}>Generate an App Password:</strong>{' '}
                Go to myaccount.google.com → Security → App Passwords → Mail → Generate.
                Copy the 16-character code.
              </div>

              <Label>Gmail address</Label>
              <input value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="you@gmail.com" style={{ ...inputStyle(), marginBottom: 12 }} autoFocus />

              <Label>App Password (16 characters)</Label>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="xxxx xxxx xxxx xxxx" style={{ ...inputStyle(), marginBottom: 12 }} />

              {error && <p style={{ fontSize: 11, color: 'var(--cat-error)', margin: '0 0 8px' }}>⚠ {error}</p>}
              {testResult?.success && <p style={{ fontSize: 11, color: 'var(--green)', margin: '0 0 8px' }}>✓ Connection successful</p>}

              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={handleTestImap} disabled={testing}>
                  {testing ? '⟳ Testing…' : 'Test connection'}
                </Btn>
              </div>
            </div>
            <div style={S.footer}>
              <Btn muted onClick={() => setStep(1)}>← Back</Btn>
              <div style={{ flex: 1 }} />
              <Btn onClick={next}>Skip</Btn>
              <Btn accent onClick={handleAddAccount} disabled={saving}>
                {saving ? '⟳ Adding…' : 'Add account →'}
              </Btn>
            </div>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && (
          <>
            <div style={{ ...S.header, textAlign: 'center', paddingBottom: 0 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
              <h2 style={{ ...heading, textAlign: 'center' }}>You're all set!</h2>
              <p style={{ ...sub, textAlign: 'center' }}>
                Stormbird is ready. Click Sync to download your emails, or explore the interface first.
              </p>
            </div>
            <div style={{ ...S.body, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <strong style={{ color: 'var(--text-second)' }}>Ctrl+N</strong> — Compose &nbsp;|&nbsp;
                <strong style={{ color: 'var(--text-second)' }}>Ctrl+F</strong> — Search &nbsp;|&nbsp;
                <strong style={{ color: 'var(--text-second)' }}>Ctrl+`</strong> — Console
              </p>
            </div>
            <div style={S.footer}>
              <div style={{ flex: 1 }} />
              <Btn accent onClick={onComplete}>Open Stormbird →</Btn>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureRow({ icon, title, desc }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 5 }}>{children.toUpperCase()}</div>;
}

function Btn({ children, onClick, accent, muted, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      padding: '7px 16px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
      background: accent ? 'var(--accent-dim)' : 'none',
      border: `1px solid ${accent ? 'var(--border-accent)' : muted ? 'var(--border)' : 'var(--border-strong)'}`,
      color: accent ? 'var(--text-accent)' : muted ? 'var(--text-muted)' : 'var(--text-second)',
      fontWeight: accent ? 700 : 400,
    }}>{children}</button>
  );
}

function inputStyle() {
  return {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', padding: '8px 10px', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
}

const heading = { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px' };
const sub     = { fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 };
