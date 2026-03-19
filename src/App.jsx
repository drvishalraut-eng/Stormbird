// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — Stormbird main shell — Phase 2
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import Sidebar          from './components/Sidebar';
import MessageList      from './components/MessageList';
import MessagePane      from './components/MessagePane';
import Console          from './components/Console';
import ProcessManagerUI from './components/ProcessManagerUI';
import AccountSetup     from './components/AccountSetup';
import './styles/globals.css';

export default function App() {
  const [theme,          setTheme]          = useState('dark');
  const [consoleOpen,    setConsoleOpen]     = useState(false);
  const [processesOpen,  setProcessesOpen]   = useState(false);
  const [accountSetupOpen, setAccountSetupOpen] = useState(false);
  const [activeFolder,   setActiveFolder]    = useState(null);
  const [activeMessage,  setActiveMessage]   = useState(null);
  const [accounts,       setAccounts]        = useState([]);
  const [version,        setVersion]         = useState('0.3.0');
  const [openIssues,     setOpenIssues]      = useState(0);
  const [importing,      setImporting]       = useState(false);
  const [syncStatus,     setSyncStatus]      = useState(null);

  // ── Apply theme ───────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Load accounts and version ─────────────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;
    window.sb.app.version().then(v => { if (v) setVersion(v); });
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    if (!window.sb) return;
    const accts = await window.sb.accounts.list();
    // Always include local import account
    const local = { id: 'local', email: 'local', color: '#f59e0b' };
    setAccounts([local, ...(accts || [])]);
  };

  // ── Process manager badge ─────────────────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;
    const unsub = window.sb.processes.onUpdate((data) => {
      setOpenIssues(data.reduce((n, p) => n + (p.issues?.length || 0), 0));
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // ── Sync progress ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;
    const unsub = window.sb.sync.onProgress((status) => {
      setSyncStatus(status);
      if (status.status === 'complete' || status.status === 'error') {
        setTimeout(() => setSyncStatus(null), 3000);
        // Refresh accounts to update folder counts
        loadAccounts();
      }
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // ── Import progress ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;
    const unsub = window.sb.importer.onProgress((p) => {
      setImporting(true);
      if (p.filePct >= 99) {
        setTimeout(() => { setImporting(false); loadAccounts(); }, 1000);
      }
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') setConsoleOpen(o => !o);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleImport = async (mboxPath, accountId) => {
    if (!window.sb) return;
    setImporting(true);
    await window.sb.importer.importMbox(mboxPath, accountId);
    setImporting(false);
    loadAccounts();
  };

  const handleSync = async (accountId) => {
    if (!window.sb) return;
    await window.sb.sync.run(accountId);
  };

  const handleAccountAdded = (account) => {
    setAccountSetupOpen(false);
    loadAccounts();
  };

  // ── Sync status text ──────────────────────────────────────────────────────
  const syncText = syncStatus
    ? `⟳ ${syncStatus.email?.split('@')[0]} — ${syncStatus.folder || syncStatus.message || syncStatus.status} (${syncStatus.downloaded || 0})`
    : null;

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-app)', color: 'var(--text-primary)', overflow: 'hidden',
    }}>

      {/* ── Titlebar ── */}
      <div style={{
        height: 32, background: 'var(--titlebar-bg)',
        borderBottom: '1px solid var(--titlebar-border)',
        display: 'flex', alignItems: 'center', flexShrink: 0,
        WebkitAppRegion: 'drag', padding: '0 0 0 12px',
      }}>
        <span style={{ fontSize: 14, marginRight: 6 }}>⚡</span>
        <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', color: 'var(--accent)' }}>
          STORMBIRD
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 8 }}>v{version}</span>

        {/* Sync progress pill */}
        {syncText && (
          <div style={{
            marginLeft : 16,
            background : 'var(--accent-dim)',
            border     : '1px solid var(--border-accent)',
            padding    : '2px 10px',
            fontSize   : 10,
            color      : 'var(--text-accent)',
            maxWidth   : 360,
            overflow   : 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace : 'nowrap',
          }}>
            {syncText}
          </div>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
          <TitleBtn onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 10, minWidth: 80 }}>
            {theme === 'dark' ? '☀ Classic' : '🌙 Dark'}
          </TitleBtn>
          <TitleBtn onClick={() => window.sb?.win.minimize()}>─</TitleBtn>
          <TitleBtn onClick={() => window.sb?.win.maximize()}>□</TitleBtn>
          <TitleBtn onClick={() => window.sb?.win.close()} hoverRed>✕</TitleBtn>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          accounts        = {accounts}
          activeFolder    = {activeFolder}
          onFolderSelect  = {(f) => { setActiveFolder(f); setActiveMessage(null); }}
          onImport        = {handleImport}
          onSync          = {handleSync}
          onAddAccount    = {() => setAccountSetupOpen(true)}
        />
        <MessageList
          activeFolder    = {activeFolder}
          activeMessageId = {activeMessage}
          onMessageSelect = {setActiveMessage}
        />
        <MessagePane messageId={activeMessage} />
      </div>

      {/* ── Console panel ── */}
      <Console isOpen={consoleOpen} onClose={() => setConsoleOpen(false)} />

      {/* ── Status bar ── */}
      <div style={{
        height: 22, background: 'var(--bg-toolbar)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 10px',
        gap: 14, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
      }}>
        <button onClick={() => setProcessesOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', padding: 0,
          color: openIssues > 0 ? 'var(--cat-error)' : 'var(--text-muted)',
          cursor: 'pointer', fontSize: 10, fontFamily: 'inherit',
        }}>
          {openIssues > 0
            ? <><span style={{ color: 'var(--cat-error)' }}>⚠</span> {openIssues} issue{openIssues !== 1 ? 's' : ''}</>
            : <><span style={{ color: 'var(--green)' }}>●</span> Healthy</>
          }
        </button>
        <span>|</span>
        {importing && <><span style={{ color: 'var(--accent)' }}>⟳ Importing…</span><span>|</span></>}
        <button onClick={() => setConsoleOpen(o => !o)} style={{
          background: consoleOpen ? 'var(--accent-dim)' : 'none',
          border: consoleOpen ? '1px solid var(--border-accent)' : 'none',
          color: consoleOpen ? 'var(--text-accent)' : 'var(--text-muted)',
          cursor: 'pointer', padding: consoleOpen ? '0 5px' : 0,
          fontSize: 10, fontFamily: 'inherit',
        }}>
          ⌨ Console {consoleOpen ? '' : '(Ctrl+`)'}
        </button>
        <div style={{ flex: 1 }} />
        <span>Stormbird v{version} — Phase 2</span>
      </div>

      {/* ── Modals ── */}
      <ProcessManagerUI isOpen={processesOpen} onClose={() => setProcessesOpen(false)} />
      {accountSetupOpen && (
        <AccountSetup
          onSave   = {handleAccountAdded}
          onCancel = {() => setAccountSetupOpen(false)}
        />
      )}
    </div>
  );
}

function TitleBtn({ children, onClick, style = {}, hoverRed }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 46, height: 32, border: 'none', cursor: 'pointer',
        background: hovered ? (hoverRed ? '#c42b1c' : 'var(--bg-hover)') : 'none',
        color: 'var(--text-second)', fontSize: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s', ...style,
      }}
    >{children}</button>
  );
}
