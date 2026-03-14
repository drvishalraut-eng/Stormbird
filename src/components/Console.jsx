// ─────────────────────────────────────────────────────────────────────────────
// Console.jsx — Live log panel
// Shows real-time log entries from the main process.
// Toggle with Ctrl+` or the statusbar button.
// Can be docked (bottom panel) or detached (floating window).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';

// Category → CSS variable name (defined in globals.css)
const CAT_COLOR = {
  BOOT   : 'var(--cat-boot)',
  DB     : 'var(--cat-db)',
  IMAP   : 'var(--cat-imap)',
  MBOX   : 'var(--cat-mbox)',
  WRITE  : 'var(--cat-write)',
  SEND   : 'var(--cat-send)',
  BACKUP : 'var(--cat-backup)',
  CHECK  : 'var(--cat-check)',
  DRIVE  : 'var(--cat-drive)',
  MANAGER: 'var(--cat-manager)',
  PROCESS: 'var(--cat-manager)',
  CLAUDE : 'var(--cat-claude)',
  WARN   : 'var(--cat-warn)',
  ERROR  : 'var(--cat-error)',
  INFO   : 'var(--cat-info)',
};

const DEFAULT_COLOR = 'var(--cat-info)';

export default function Console({ isOpen, onClose }) {
  const [lines,      setLines]      = useState([]);
  const [filter,     setFilter]     = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused,     setPaused]     = useState(false);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const pauseBuffer = useRef([]);

  // ── Load recent log history on mount ──────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;
    window.sb.logger.getRecent(200).then((recent) => {
      if (recent) setLines(recent);
    });
  }, []);

  // ── Subscribe to live log lines ───────────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;

    const unsubscribe = window.sb.logger.onLine((entry) => {
      if (paused) {
        pauseBuffer.current.push(entry);
        return;
      }
      setLines((prev) => {
        const next = [...prev, entry];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [paused]);

  // ── Resume from pause — flush buffer ─────────────────────────────────────
  useEffect(() => {
    if (!paused && pauseBuffer.current.length > 0) {
      setLines((prev) => {
        const next = [...prev, ...pauseBuffer.current];
        pauseBuffer.current = [];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    }
  }, [paused]);

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [lines, autoScroll]);

  // ── Detect manual scroll up → disable auto-scroll ────────────────────────
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // ── Keyboard shortcut ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleCopy = () => {
    const text = filteredLines.map(l => l.line).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleClear = () => setLines([]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredLines = filter
    ? lines.filter(l =>
        l.line.toLowerCase().includes(filter.toLowerCase()) ||
        l.category.toLowerCase().includes(filter.toLowerCase())
      )
    : lines;

  if (!isOpen) return null;

  return (
    <div style={{
      height         : 240,
      background     : '#050505',
      borderTop      : '2px solid var(--border-accent)',
      display        : 'flex',
      flexDirection  : 'column',
      flexShrink     : 0,
      fontFamily     : "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      fontSize       : 11,
    }}>

      {/* ── Toolbar ── */}
      <div style={{
        height        : 28,
        display       : 'flex',
        alignItems    : 'center',
        gap           : 6,
        padding       : '0 8px',
        background    : '#0a0a0a',
        borderBottom  : '1px solid #1a1a1a',
        flexShrink    : 0,
      }}>
        <span style={{ color: 'var(--cat-manager)', fontWeight: 700, fontSize: 10, letterSpacing: '0.1em' }}>
          CONSOLE
        </span>

        <div style={{ width: 1, height: 14, background: '#2a2a2a', margin: '0 2px' }} />

        {/* Filter input */}
        <input
          value       = {filter}
          onChange    = {(e) => setFilter(e.target.value)}
          placeholder = "filter…"
          style={{
            background  : '#0d0d0d',
            border      : '1px solid #2a2a2a',
            color       : '#a0a0a0',
            padding     : '2px 6px',
            fontSize    : 11,
            width       : 140,
            fontFamily  : 'inherit',
            outline     : 'none',
          }}
        />

        {/* Category filter buttons */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
          {['ERROR', 'WARN', 'IMAP', 'DB', 'WRITE'].map(cat => (
            <button
              key     = {cat}
              onClick = {() => setFilter(f => f === cat ? '' : cat)}
              style={{
                padding    : '1px 6px',
                background : filter === cat ? CAT_COLOR[cat] : 'transparent',
                border     : `1px solid ${CAT_COLOR[cat] || '#2a2a2a'}`,
                color      : filter === cat ? '#000' : (CAT_COLOR[cat] || '#a0a0a0'),
                fontSize   : 10,
                fontFamily : 'inherit',
                fontWeight : 600,
                cursor     : 'pointer',
              }}
            >{cat}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Line count */}
        <span style={{ color: '#444', fontSize: 10 }}>
          {filteredLines.length} lines
        </span>

        <div style={{ width: 1, height: 14, background: '#2a2a2a', margin: '0 2px' }} />

        {/* Pause */}
        <button
          onClick = {() => setPaused(p => !p)}
          title   = {paused ? 'Resume live feed' : 'Pause live feed'}
          style={{
            color      : paused ? 'var(--cat-warn)' : '#555',
            fontSize   : 11,
            padding    : '1px 6px',
            border     : `1px solid ${paused ? 'var(--cat-warn)' : '#2a2a2a'}`,
          }}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>

        {/* Copy all */}
        <button
          onClick = {handleCopy}
          title   = "Copy all log lines to clipboard"
          style={{ color: '#555', fontSize: 11, padding: '1px 6px', border: '1px solid #2a2a2a' }}
        >
          📋 Copy
        </button>

        {/* Clear */}
        <button
          onClick = {handleClear}
          title   = "Clear console display"
          style={{ color: '#555', fontSize: 11, padding: '1px 6px', border: '1px solid #2a2a2a' }}
        >
          ✕ Clear
        </button>

        {/* Close */}
        <button
          onClick = {onClose}
          title   = "Close console (Ctrl+`)"
          style={{ color: '#555', fontSize: 12, padding: '1px 8px', border: '1px solid #2a2a2a', marginLeft: 4 }}
        >
          ✕
        </button>
      </div>

      {/* ── Log lines ── */}
      <div
        ref       = {containerRef}
        onScroll  = {handleScroll}
        style={{
          flex      : 1,
          overflowY : 'auto',
          padding   : '4px 0',
        }}
      >
        {filteredLines.length === 0 && (
          <div style={{ color: '#333', padding: '8px 12px', fontStyle: 'italic' }}>
            No log entries yet…
          </div>
        )}

        {filteredLines.map((entry, i) => (
          <LogLine key={i} entry={entry} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Auto-scroll indicator ── */}
      {!autoScroll && (
        <div
          onClick = {() => { setAutoScroll(true); bottomRef.current?.scrollIntoView(); }}
          style={{
            position   : 'absolute',
            bottom     : 244,
            right      : 16,
            background : 'var(--accent)',
            color      : '#000',
            fontSize   : 10,
            fontWeight : 700,
            padding    : '3px 8px',
            cursor     : 'pointer',
            fontFamily : "'Segoe UI', sans-serif",
          }}
        >
          ↓ Jump to bottom
        </div>
      )}
    </div>
  );
}

// ── Single log line ───────────────────────────────────────────────────────────

function LogLine({ entry }) {
  const color = CAT_COLOR[entry.category] || DEFAULT_COLOR;

  return (
    <div style={{
      display    : 'flex',
      gap        : 8,
      padding    : '1px 12px',
      lineHeight : 1.6,
      userSelect : 'text',
    }}
    onMouseEnter = {e => e.currentTarget.style.background = '#0d0d0d'}
    onMouseLeave = {e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Timestamp */}
      <span style={{ color: '#333', flexShrink: 0, fontSize: 10 }}>
        {entry.timestamp}
      </span>

      {/* Category badge */}
      <span style={{
        color      : color,
        flexShrink : 0,
        minWidth   : 56,
        fontWeight : 700,
        fontSize   : 10,
      }}>
        [{entry.category}]
      </span>

      {/* Message */}
      <span style={{ color: entry.category === 'ERROR' ? '#f87171' : entry.category === 'WARN' ? '#fbbf24' : '#c0c0c0' }}>
        {entry.message}
        {entry.data && (
          <span style={{ color: '#555', marginLeft: 8 }}>
            {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
          </span>
        )}
      </span>
    </div>
  );
}
