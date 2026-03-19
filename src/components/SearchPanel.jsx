// ─────────────────────────────────────────────────────────────────────────────
// SearchPanel.jsx — Global message search
// Searches subject, from, to across all accounts and folders.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

export default function SearchPanel({ isOpen, onClose, onMessageSelect }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSearched(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const runSearch = async (q) => {
    if (!q.trim() || !window.sb) return;
    setLoading(true);
    const res = await window.sb.messages.globalSearch(q.trim(), 200);
    setResults(res || []);
    setSearched(true);
    setLoading(false);
  };

  const handleSelect = (msg) => {
    onMessageSelect(msg.id, { accountId: msg.account_id, folder: msg.folder });
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 4000, paddingTop: 80,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div style={{
        width: 600, maxHeight: '70vh',
        background: 'var(--bg-app)',
        border: '1px solid var(--border-strong)',
        borderTop: '2px solid var(--accent)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search subject, from, to… (all accounts)"
            style={{
              flex: 1, background: 'none', border: 'none',
              color: 'var(--text-primary)', fontSize: 14,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          {loading && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>⟳</span>}
          {query && (
            <button onClick={() => setQuery('')} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 14, padding: 0,
            }}>✕</button>
          )}
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!searched && !loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Type to search across all your emails
            </div>
          )}

          {searched && results.length === 0 && !loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No results for <strong style={{ color: 'var(--text-second)' }}>"{query}"</strong>
            </div>
          )}

          {results.map(msg => (
            <SearchResult key={msg.id} msg={msg} query={query} onSelect={handleSelect} />
          ))}

          {results.length > 0 && (
            <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
              {results.length} result{results.length !== 1 ? 's' : ''}
              {results.length === 200 ? ' (showing first 200)' : ''}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '6px 16px', borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-muted)',
          background: 'var(--bg-toolbar)',
          display: 'flex', gap: 16,
        }}>
          <span><kbd style={kbd}>↵</kbd> Open message</span>
          <span><kbd style={kbd}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

function SearchResult({ msg, query, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const date = msg.date_ms ? new Date(msg.date_ms).toLocaleDateString() : '';
  const isRead = (msg.flags || []).includes('read') || (msg.flags || []).includes('\\Seen');

  return (
    <div
      onClick={() => onSelect(msg)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        {!isRead && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
        )}
        <span style={{
          fontSize: 13, fontWeight: isRead ? 400 : 600,
          color: 'var(--text-primary)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {_highlight(msg.subject || '(no subject)', query)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{date}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {_highlight(msg.from_name || msg.from_addr || '', query)}
        </span>
        <span style={{
          background: 'var(--bg-toolbar)', border: '1px solid var(--border)',
          padding: '0 5px', borderRadius: 2, flexShrink: 0, fontSize: 10,
        }}>
          {msg.folder}
        </span>
      </div>
    </div>
  );
}

function _highlight(text, query) {
  if (!query || !text) return text;
  try {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(245,158,11,0.3)', color: 'inherit', padding: 0 }}>
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    );
  } catch (_) {
    return text;
  }
}

const kbd = {
  background: 'var(--bg-toolbar)', border: '1px solid var(--border)',
  borderRadius: 2, padding: '1px 4px', fontSize: 9, fontFamily: 'monospace',
};
