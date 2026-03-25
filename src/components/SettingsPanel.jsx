// ─────────────────────────────────────────────────────────────────────────────
// SettingsPanel.jsx — Application settings + About screen
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export default function SettingsPanel({ isOpen, onClose, theme, onThemeChange, version }) {
  const [tab,       setTab]       = useState('general');
  const [dataDir,   setDataDir]   = useState('');
  const [installMode, setInstallMode] = useState(null);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    if (!isOpen || !window.sb) return;
    window.sb.app.dataDir().then(d => setDataDir(d || ''));
    window.sb.appControl.installMode().then(m => setInstallMode(m));
  }, [isOpen]);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!isOpen) return null;

  const TABS = [
    { id: 'general',   label: 'General' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'about',     label: 'About' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3500,
    }}>
      <div style={{
        width: 560, maxHeight: '80vh', background: 'var(--bg-app)',
        border: '1px solid var(--border-strong)',
        borderTop: '2px solid var(--accent)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 16px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-toolbar)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>SETTINGS</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer',
              background: 'none', fontFamily: 'inherit', fontSize: 12,
              color: tab === t.id ? 'var(--text-accent)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              fontWeight: tab === t.id ? 600 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── General tab ── */}
          {tab === 'general' && (
            <div style={{ padding: 20 }}>
              <Section title="Appearance">
                <Row label="Theme">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['dark', 'light'].map(t => (
                      <button key={t} onClick={() => onThemeChange(t)} style={{
                        padding: '5px 14px', fontSize: 11, cursor: 'pointer',
                        fontFamily: 'inherit',
                        background: theme === t ? 'var(--accent-dim)' : 'none',
                        border: `1px solid ${theme === t ? 'var(--border-accent)' : 'var(--border)'}`,
                        color: theme === t ? 'var(--text-accent)' : 'var(--text-muted)',
                        fontWeight: theme === t ? 600 : 400,
                        textTransform: 'capitalize',
                      }}>{t === 'dark' ? '🌙 Dark' : '☀ Classic'}</button>
                    ))}
                  </div>
                </Row>
              </Section>

              <Section title="Data">
                <Row label="Data directory">
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-second)', wordBreak: 'break-all' }}>
                    {dataDir || '—'}
                  </span>
                </Row>
                <Row label="Install mode">
                  <span style={{ fontSize: 12, color: 'var(--text-second)' }}>
                    {installMode?.mode ? (
                      <span style={{
                        padding: '2px 8px', fontSize: 10,
                        background: installMode.mode === 'portable' ? 'rgba(245,158,11,0.15)' : 'rgba(74,222,128,0.08)',
                        border: `1px solid ${installMode.mode === 'portable' ? 'rgba(245,158,11,0.4)' : 'rgba(74,222,128,0.3)'}`,
                        color: installMode.mode === 'portable' ? 'var(--accent)' : 'var(--green)',
                        textTransform: 'capitalize',
                      }}>
                        {installMode.mode}
                      </span>
                    ) : '—'}
                  </span>
                </Row>
              </Section>
            </div>
          )}

          {/* ── Shortcuts tab ── */}
          {tab === 'shortcuts' && (
            <div style={{ padding: 20 }}>
              <Section title="Keyboard shortcuts">
                {[
                  ['Ctrl + N',   'Compose new message'],
                  ['Ctrl + F',   'Search all messages'],
                  ['Ctrl + `',   'Toggle console'],
                  ['Ctrl + ,',   'Open settings'],
                  ['Enter',      'Open selected message'],
                  ['R',          'Reply (coming in v1.1)'],
                  ['Delete',     'Delete selected message'],
                  ['F5',         'Sync all accounts'],
                ].map(([key, desc]) => (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center',
                    padding: '7px 0', borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                  }}>
                    <kbd style={{
                      background: 'var(--bg-toolbar)', border: '1px solid var(--border-strong)',
                      borderRadius: 3, padding: '2px 8px', fontSize: 11,
                      fontFamily: 'monospace', color: 'var(--text-second)',
                      minWidth: 100, textAlign: 'center', flexShrink: 0,
                    }}>{key}</kbd>
                    <span style={{ marginLeft: 16, color: 'var(--text-muted)' }}>{desc}</span>
                  </div>
                ))}
              </Section>
            </div>
          )}

          {/* ── About tab ── */}
          {tab === 'about' && (
            <div style={{ padding: 20 }}>
              <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Stormbird
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                  v{version} — USB-portable email archiver
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                  A <span
                    onClick={() => window.sb?.shell.openExternal('https://whitecoatfoundry.com')}
                    style={{ color: 'var(--text-accent)', cursor: 'pointer' }}
                  >White Coat Foundry</span> product by Dr Vishal Raut
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <LinkBtn onClick={() => window.sb?.shell.openExternal('https://github.com/drvishalraut-eng/stormbird')}>
                    GitHub →
                  </LinkBtn>
                  <LinkBtn onClick={() => window.sb?.shell.openExternal('https://drvishalraut-eng.github.io/Stormbird/')}>
                    Website →
                  </LinkBtn>
                  <LinkBtn onClick={() => window.sb?.shell.openExternal('https://github.com/drvishalraut-eng/stormbird/releases')}>
                    Releases →
                  </LinkBtn>
                  <LinkBtn onClick={() => window.sb?.shell.openExternal('https://github.com/drvishalraut-eng/stormbird/issues')}>
                    Issues →
                  </LinkBtn>
                  <LinkBtn
                    onClick={() => window.sb?.shell.openExternal('https://buymeacoffee.com/drvishalraut')}
                    highlight
                  >
                    ☕ Buy me a coffee
                  </LinkBtn>
                </div>

                <div style={{
                  margin: '16px 0 0', padding: '12px 16px',
                  background: 'var(--accent-dim)', border: '1px solid var(--border-accent)',
                  fontSize: 11, color: 'var(--text-second)', lineHeight: 1.7, textAlign: 'center',
                }}>
                  Stormbird is free to use. If it saves you time or protects your email,
                  consider buying a coffee — it keeps the project alive. ☕
                </div>
              </div>

              <Section title="Build">
                {[
                  ['Version',   version],
                  ['Runtime',   'Electron 29 + React 18 + Vite 5'],
                  ['Database',  'SQLite via sql.js (WASM)'],
                  ['IMAP',      'Raw Node.js TLS — no external packages'],
                  ['SMTP',      'nodemailer, port 587 STARTTLS'],
                  ['Platforms', 'Windows 10/11 x64 · macOS 10.15+'],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', padding: '6px 0',
                    borderBottom: '1px solid var(--border)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-muted)', width: 100, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: 'var(--text-second)' }}>{v}</span>
                  </div>
                ))}
              </Section>

              <Section title="Credits">
                <div style={{ fontSize: 12, color: 'var(--text-second)', lineHeight: 1.8 }}>
                  <div><strong style={{ color: 'var(--text-primary)' }}>Dr Vishal Raut</strong> — Developer &amp; Product</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paediatrician · Maharashtra, India</div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span
                      onClick={() => window.sb?.shell.openExternal('https://github.com/drvishalraut-eng')}
                      style={{ color: 'var(--text-accent)', cursor: 'pointer' }}
                    >github.com/drvishalraut-eng</span>
                  </div>
                </div>
              </Section>

              <Section title="License">
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  MIT License — free to use, modify, and distribute.<br />
                  © 2026 Dr Vishal Raut / White Coat Foundry.<br />
                  <span
                    onClick={() => window.sb?.shell.openExternal('https://github.com/drvishalraut-eng/stormbird/blob/main/LICENSE')}
                    style={{ color: 'var(--text-accent)', cursor: 'pointer' }}
                  >
                    View full license on GitHub →
                  </span>
                </p>
              </Section>
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'general' && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-toolbar)', flexShrink: 0,
          }}>
            <div style={{ flex: 1 }} />
            {saved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Saved</span>}
            <button onClick={onClose} style={{
              padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              background: 'var(--accent-dim)', border: '1px solid var(--border-accent)',
              color: 'var(--text-accent)', fontWeight: 600,
            }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function LinkBtn({ children, onClick, highlight }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        padding: '5px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        background: highlight
          ? (h ? '#d97706' : '#f59e0b')
          : (h ? 'var(--accent-dim)' : 'none'),
        border: `1px solid ${highlight ? '#f59e0b' : 'var(--border-accent)'}`,
        color: highlight ? '#000' : 'var(--text-accent)',
        fontWeight: highlight ? 700 : 400,
        transition: 'background 0.15s',
      }}>{children}</button>
  );
}
