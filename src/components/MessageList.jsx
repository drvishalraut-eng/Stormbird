// ─────────────────────────────────────────────────────────────────────────────
// MessageList.jsx — Paginated message list panel
// Shows messages for the active folder with search and sorting.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';

const PAGE_SIZE = 50;

export default function MessageList({ activeFolder, activeMessageId, onMessageSelect }) {
  const [messages,   setMessages]   = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
  const [searchInput,setSearchInput]= useState('');
  const [loading,    setLoading]    = useState(false);

  // ── Load messages when folder or page changes ─────────────────────────────
  useEffect(() => {
    if (!window.sb || !activeFolder) {
      setMessages([]);
      setTotal(0);
      return;
    }
    loadMessages();
  }, [activeFolder, page, search]);

  const loadMessages = async () => {
    if (!activeFolder) return;
    setLoading(true);
    try {
      const result = await window.sb.messages.list({
        accountId: activeFolder.accountId,
        folder   : activeFolder.folder,
        page,
        pageSize : PAGE_SIZE,
        search,
      });
      if (result) {
        setMessages(result.messages || []);
        setTotal(result.total || 0);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Search with 300ms debounce ────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const folderName = activeFolder?.folder || '';

  return (
    <div style={{
      width        : 290,
      flexShrink   : 0,
      background   : 'var(--bg-list)',
      borderRight  : '1px solid var(--border-strong)',
      display      : 'flex',
      flexDirection: 'column',
      overflow     : 'hidden',
    }}>

      {/* ── List header ── */}
      <div style={{
        padding     : '6px 10px',
        borderBottom: '1px solid var(--border)',
        background  : 'var(--bg-toolbar)',
        display     : 'flex',
        alignItems  : 'center',
        gap         : 8,
        flexShrink  : 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>
          {folderName || 'Select a folder'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {total.toLocaleString()}
        </span>
      </div>

      {/* ── Search ── */}
      <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          background: 'var(--bg-input)',
          border    : '1px solid var(--border)',
          display   : 'flex',
          alignItems: 'center',
          padding   : '3px 8px',
          gap       : 6,
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>🔍</span>
          <input
            value       = {searchInput}
            onChange    = {e => setSearchInput(e.target.value)}
            placeholder = "Search in folder…"
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 11, width: '100%',
            }}
          />
          {searchInput && (
            <button
              onClick = {() => setSearchInput('')}
              style   = {{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Message rows ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {loading && (
          <div style={{ padding: '12px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
            Loading…
          </div>
        )}

        {!loading && !activeFolder && (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            Select a folder to view messages.
          </div>
        )}

        {!loading && activeFolder && messages.length === 0 && (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
            {search ? `No results for "${search}"` : 'No messages in this folder.'}
          </div>
        )}

        {messages.map(msg => (
          <MessageRow
            key      = {msg.id}
            msg      = {msg}
            isActive = {msg.id === activeMessageId}
            onClick  = {() => onMessageSelect(msg.id)}
          />
        ))}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display     : 'flex',
          alignItems  : 'center',
          justifyContent: 'center',
          gap         : 8,
          padding     : '5px 8px',
          borderTop   : '1px solid var(--border)',
          background  : 'var(--bg-toolbar)',
          flexShrink  : 0,
          fontSize    : 11,
        }}>
          <button
            onClick  = {() => setPage(p => Math.max(0, p - 1))}
            disabled = {page === 0}
            style    = {{
              background: 'none', border: '1px solid var(--border)',
              color: page === 0 ? 'var(--text-muted)' : 'var(--text-second)',
              padding: '2px 8px', cursor: page === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 11,
            }}
          >◀</button>
          <span style={{ color: 'var(--text-muted)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick  = {() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled = {page >= totalPages - 1}
            style    = {{
              background: 'none', border: '1px solid var(--border)',
              color: page >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text-second)',
              padding: '2px 8px', cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 11,
            }}
          >▶</button>
        </div>
      )}
    </div>
  );
}

// ── Single message row ────────────────────────────────────────────────────────

function MessageRow({ msg, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  const isUnread = !msg.flags?.includes('read');
  const date     = _formatDate(msg.date_ms);

  return (
    <div
      onClick      = {onClick}
      onMouseEnter = {() => setHovered(true)}
      onMouseLeave = {() => setHovered(false)}
      style={{
        padding     : '7px 10px',
        borderBottom: '1px solid var(--border)',
        cursor      : 'pointer',
        background  : isActive
          ? 'var(--bg-selected)'
          : hovered
          ? 'var(--bg-hover)'
          : isUnread ? 'var(--bg-unread)' : 'none',
        borderLeft  : isActive
          ? '3px solid var(--accent)'
          : isUnread
          ? '3px solid var(--accent)'
          : '3px solid transparent',
      }}
    >
      {/* From + Date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{
          fontWeight  : isUnread ? 700 : 400,
          fontSize    : 12,
          overflow    : 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace  : 'nowrap',
          flex        : 1,
        }}>
          {msg.from_name || msg.from_addr || '(unknown)'}
        </span>
        <span style={{
          fontSize   : 10,
          color      : 'var(--text-muted)',
          marginLeft : 8,
          whiteSpace : 'nowrap',
          flexShrink : 0,
        }}>
          {date}
        </span>
      </div>

      {/* Subject */}
      <div style={{
        fontSize    : 12,
        color       : isUnread ? 'var(--text-primary)' : 'var(--text-second)',
        fontWeight  : isUnread ? 600 : 400,
        overflow    : 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace  : 'nowrap',
        marginBottom: 1,
      }}>
        {msg.subject || '(no subject)'}
      </div>

      {/* Attachment indicator */}
      {msg.has_attach ? (
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📎 attachment</span>
      ) : null}
    </div>
  );
}

function _formatDate(ms) {
  if (!ms) return '';
  const date = new Date(ms);
  const now  = new Date();
  const diff = now - date;

  if (diff < 86400000 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 7 * 86400000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
