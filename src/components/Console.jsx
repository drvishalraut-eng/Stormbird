// ─────────────────────────────────────────────────────────────────────────────
// Console.jsx — Live log panel
// Uses CSS variables so it responds correctly to dark/light theme switches.
// Console always uses a dark background regardless of app theme (better for logs).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';

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
  NET    : 'var(--cat-db)',
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
  const bottomRef    = useRef(null);
  const containerRef = useRef(null);
  const pauseBuffer  = useRef([]);

  useEffect(() => {
    if (!window.sb) return;
    window.sb.logger.getRecent(200).then(recent => { if (recent) setLines(recent); });
  }, []);

  useEffect(() => {
    if (!window.sb) return;
    const unsub = window.sb.logger.onLine(entry => {
      if (paused) { pauseBuffer.current.push(entry); return; }
      setLines(prev => {
        const next = [...prev, entry];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    });
    return () => { if (unsub) unsub(); };
  }, [paused]);

  useEffect(() => {
    if (!paused && pauseBuffer.current.length > 0) {
      setLines(prev => {
        const next = [...prev, ...pauseBuffer.current];
        pauseBuffer.current = [];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    }
  }, [paused]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [lines, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { if (isOpen) onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleCopy  = () => navigator.clipboard.writeText(filteredLines.map(l => l.line).join('\n')).catch(() => {});
  const handleClear = () => setLines([]);

  const filteredLines = filter
    ? lines.filter(l => l.line.toLowerCase().includes(filter.toLowerCase()) || l.category.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  if (!isOpen) return null;

  // Console uses its own dark CSS vars — stays readable in both app themes
  const C = {
    bg      : 'var(--console-bg)',
    toolbar : 'var(--console-toolbar)',
    border  : 'var(--console-border)',
    text    : 'var(--console-text)',
    muted   : 'var(--console-muted)',
    hover   : 'var(--console-hover)',
    input   : 'var(--console-input)',
  };

  return (
    <div style={{
      height      : 260,
      background  : C.bg,
      borderTop   : '2px solid var(--accent)',
      display     : 'flex',
      flexDirection: 'column',
      flexShrink  : 0,
      fontFamily  : "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      fontSize    : 11,
    }}>

      {/* ── Toolbar ── */}
      <div style={{
        height      : 30,
        display     : 'flex',
        alignItems  : 'center',
        gap         : 6,
        padding     : '0 10px',
        background  : C.toolbar,
        borderBottom: `1px solid ${C.border}`,
        flexShrink  : 0,
      }}>
        <span style={{ color: 'var(--cat-manager)', fontWeight: 700, fontSize: 10, letterSpacing: '0.1em' }}>
          CONSOLE
        </span>

        <div style={{ width: 1, height: 14, background: C.border, margin: '0 2px' }} />

        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="filter…"
          style={{
            background : C.input,
            border     : `1px solid ${C.border}`,
            color      : C.text,
            padding    : '2px 6px',
            fontSize   : 11,
            width      : 140,
            fontFamily : 'inherit',
            outline    : 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
          {['ERROR', 'WARN', 'IMAP', 'DB', 'WRITE'].map(cat => (
            <button key={cat}
              onClick={() => setFilter(f => f === cat ? '' : cat)}
              style={{
                padding    : '1px 6px',
                background : filter === cat ? CAT_COLOR[cat] : 'transparent',
                border     : `1px solid ${CAT_COLOR[cat]}`,
                color      : filter === cat ? '#000' : CAT_COLOR[cat],
                fontSize   : 10,
                fontFamily : 'inherit',
                fontWeight : 600,
                cursor     : 'pointer',
              }}
            >{cat}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ color: C.muted, fontSize: 10 }}>{filteredLines.length} lines</span>
        <div style={{ width: 1, height: 14, background: C.border, margin: '0 2px' }} />

        <ConsoleBtn onClick={() => setPaused(p => !p)} color={paused ? 'var(--cat-warn)' : C.muted} border={C.border} active={paused}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </ConsoleBtn>
        <ConsoleBtn onClick={handleCopy} color={C.muted} border={C.border}>📋 Copy</ConsoleBtn>
        <ConsoleBtn onClick={handleClear} color={C.muted} border={C.border}>✕ Clear</ConsoleBtn>
        <ConsoleBtn onClick={onClose} color={C.muted} border={C.border} style={{ marginLeft: 4 }}>✕</ConsoleBtn>
      </div>

      {/* ── Log lines ── */}
      <div ref={containerRef} onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

        {filteredLines.length === 0 && (
          <div style={{ color: C.muted, padding: '8px 12px', fontStyle: 'italic' }}>
            No log entries yet…
          </div>
        )}

        {filteredLines.map((entry, i) => (
          <LogLine key={i} entry={entry} hoverColor={C.hover} />
        ))}

        <div ref={bottomRef} />
      </div>

      {!autoScroll && (
        <div onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView(); }}
          style={{
            position  : 'absolute',
            bottom    : 264,
            right     : 16,
            background: 'var(--accent)',
            color     : '#000',
            fontSize  : 10,
            fontWeight: 700,
            padding   : '3px 8px',
            cursor    : 'pointer',
            fontFamily: "'Segoe UI', sans-serif",
          }}>
          ↓ Jump to bottom
        </div>
      )}
    </div>
  );
}

function ConsoleBtn({ children, onClick, color, border, active, style = {} }) {
  return (
    <button onClick={onClick} style={{
      color,
      fontSize   : 11,
      padding    : '2px 8px',
      border     : `1px solid ${active ? color : border}`,
      background : 'transparent',
      fontFamily : 'inherit',
      cursor     : 'pointer',
      ...style,
    }}>{children}</button>
  );
}

function LogLine({ entry, hoverColor }) {
  const color = CAT_COLOR[entry.category] || DEFAULT_COLOR;
  const msgColor = entry.category === 'ERROR' ? 'var(--cat-error)'
    : entry.category === 'WARN' ? 'var(--cat-warn)'
    : 'var(--console-text)';

  return (
    <div
      onMouseEnter={e => e.currentTarget.style.background = hoverColor}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      style={{ display: 'flex', gap: 8, padding: '1px 12px', lineHeight: 1.6, userSelect: 'text' }}
    >
      <span style={{ color: 'var(--console-ts)', flexShrink: 0, fontSize: 10 }}>
        {entry.timestamp}
      </span>
      <span style={{ color, flexShrink: 0, minWidth: 60, fontWeight: 700, fontSize: 10 }}>
        [{entry.category}]
      </span>
      <span style={{ color: msgColor }}>
        {entry.message}
        {entry.data && (
          <span style={{ color: 'var(--console-muted)', marginLeft: 8 }}>
            {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
          </span>
        )}
      </span>
    </div>
  );
}
