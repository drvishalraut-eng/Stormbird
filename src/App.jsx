// ─────────────────────────────────────────────────────────────────────────────
// App.jsx — Stormbird main shell
// Phase 0: Shows titlebar, statusbar, console panel, process manager.
// Later phases will add sidebar, message list, reading pane.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import Console           from './components/Console';
import ProcessManagerUI  from './components/ProcessManagerUI';
import '../src/styles/globals.css';

export default function App() {
  const [theme,          setTheme]          = useState('dark');
  const [consoleOpen,    setConsoleOpen]    = useState(false);
  const [processesOpen,  setProcessesOpen]  = useState(false);
  const [version,        setVersion]        = useState('0.1.0');
  const [processes,      setProcesses]      = useState([]);
  const [openIssues,     setOpenIssues]     = useState(0);

  // ── Apply theme to <html> ────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Load version ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.sb) {
      window.sb.app.version().then(v => { if (v) setVersion(v); });
    }
  }, []);

  // ── Subscribe to process updates for statusbar badge ─────────────────────
  useEffect(() => {
    if (!window.sb) return;

    window.sb.processes.getAll().then(data => {
      if (data) {
        setProcesses(data);
        setOpenIssues(data.reduce((n, p) => n + (p.issues?.length || 0), 0));
      }
    });

    const unsub = window.sb.processes.onUpdate((data) => {
      setProcesses(data);
      setOpenIssues(data.reduce((n, p) => n + (p.issues?.length || 0), 0));
    });

    const unsubIssue = window.sb.processes.onIssue(() => {
      setOpenIssues(n => n + 1);
    });

    return () => {
      if (unsub)      unsub();
      if (unsubIssue) unsubIssue();
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        setConsoleOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const healthyCount = processes.filter(p => ['HEALTHY','RUNNING','IDLE','SCHEDULED'].includes(p.state)).length;
  const unhealthyCount = processes.filter(p => ['STALLED','ERROR','CRASHED'].includes(p.state)).length;

  return (
    <div style={{
      height        : '100vh',
      display       : 'flex',
      flexDirection : 'column',
      background    : 'var(--bg-app)',
      color         : 'var(--text-primary)',
      overflow      : 'hidden',
    }}>

      {/* ── Titlebar ── */}
      <div style={{
        height        : 32,
        background    : 'var(--titlebar-bg)',
        borderBottom  : '1px solid var(--titlebar-border)',
        display       : 'flex',
        alignItems    : 'center',
        flexShrink    : 0,
        WebkitAppRegion: 'drag',
        padding       : '0 0 0 12px',
      }}>
        {/* Logo */}
        <span style={{ fontSize: 14, marginRight: 6 }}>⚡</span>
        <span style={{
          fontWeight   : 700,
          fontSize     : 11,
          letterSpacing: '0.1em',
          color        : 'var(--accent)',
        }}>
          STORMBIRD
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 10 }}>
          v{version}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Window controls — no drag */}
        <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
          <TitleButton
            onClick = {toggleTheme}
            style   = {{ color: 'var(--accent)', fontWeight: 600, fontSize: 10, minWidth: 80 }}
          >
            {theme === 'dark' ? '☀ Classic' : '🌙 Dark'}
          </TitleButton>

          <TitleButton onClick={() => window.sb?.win.minimize()}>─</TitleButton>
          <TitleButton onClick={() => window.sb?.win.maximize()}>□</TitleButton>
          <TitleButton
            onClick   = {() => window.sb?.win.close()}
            hoverColor= "#c42b1c"
          >✕</TitleButton>
        </div>
      </div>

      {/* ── Main content area (grows to fill) ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Phase 0 placeholder — replaced by full UI in Phase 1 */}
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-accent)', letterSpacing: '0.15em' }}>
            STORMBIRD
          </div>
          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>
            Phase 0 — Foundation running
          </div>
          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
            Press <kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: '1px 5px', fontSize: 11 }}>Ctrl+`</kbd> to open the console
          </div>
          <button
            onClick = {() => setProcessesOpen(true)}
            style   = {{
              marginTop  : 16,
              padding    : '6px 16px',
              background : 'var(--accent-dim)',
              border     : '1px solid var(--border-accent)',
              color      : 'var(--text-accent)',
              fontSize   : 12,
              cursor     : 'pointer',
              fontFamily : 'inherit',
            }}
          >
            Open Process Manager
          </button>
        </div>
      </div>

      {/* ── Console panel (docked bottom) ── */}
      <Console
        isOpen  = {consoleOpen}
        onClose = {() => setConsoleOpen(false)}
      />

      {/* ── Status bar ── */}
      <div style={{
        height        : 22,
        background    : 'var(--bg-toolbar)',
        borderTop     : '1px solid var(--border)',
        display       : 'flex',
        alignItems    : 'center',
        padding       : '0 10px',
        gap           : 14,
        fontSize      : 10,
        color         : 'var(--text-muted)',
        flexShrink    : 0,
      }}>
        {/* Process health */}
        <button
          onClick = {() => setProcessesOpen(true)}
          style   = {{
            display    : 'flex',
            alignItems : 'center',
            gap        : 5,
            background : 'none',
            border     : 'none',
            color      : openIssues > 0 ? 'var(--cat-error)' : 'var(--text-muted)',
            cursor     : 'pointer',
            fontSize   : 10,
            fontFamily : 'inherit',
            padding    : 0,
          }}
        >
          {openIssues > 0
            ? <><span style={{ color: 'var(--cat-error)' }}>⚠</span> {openIssues} issue{openIssues !== 1 ? 's' : ''}</>
            : <><span style={{ color: 'var(--green)' }}>●</span> {healthyCount} processes healthy</>
          }
        </button>

        <span>|</span>

        {/* Console toggle */}
        <button
          onClick = {() => setConsoleOpen(o => !o)}
          style   = {{
            background : consoleOpen ? 'var(--accent-dim)' : 'none',
            border     : consoleOpen ? '1px solid var(--border-accent)' : 'none',
            color      : consoleOpen ? 'var(--text-accent)' : 'var(--text-muted)',
            cursor     : 'pointer',
            fontSize   : 10,
            padding    : consoleOpen ? '0 5px' : '0',
            fontFamily : 'inherit',
          }}
        >
          ⌨ Console {consoleOpen ? '' : '(Ctrl+`)'}
        </button>

        <div style={{ flex: 1 }} />

        <span>Stormbird v{version} — Phase 0</span>
      </div>

      {/* ── Process Manager modal ── */}
      <ProcessManagerUI
        isOpen  = {processesOpen}
        onClose = {() => setProcessesOpen(false)}
      />
    </div>
  );
}

// ── Reusable titlebar button ──────────────────────────────────────────────────

function TitleButton({ children, onClick, style = {}, hoverColor }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick      = {onClick}
      onMouseEnter = {() => setHovered(true)}
      onMouseLeave = {() => setHovered(false)}
      style={{
        width     : 46,
        height    : 32,
        background: hovered ? (hoverColor || 'var(--bg-hover)') : 'none',
        border    : 'none',
        color     : 'var(--text-second)',
        fontSize  : 12,
        cursor    : 'pointer',
        display   : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.1s',
        ...style,
      }}
    >{children}</button>
  );
}
