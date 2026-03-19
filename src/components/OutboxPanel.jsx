// ─────────────────────────────────────────────────────────────────────────────
// OutboxPanel.jsx — Outbox drawer showing sent/pending/failed messages
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

const STATUS_COLOR = {
  queued : 'var(--accent)',
  sending: 'var(--cat-imap)',
  sent   : 'var(--green)',
  failed : 'var(--cat-error)',
  draft  : 'var(--text-muted)',
};

const STATUS_LABEL = {
  queued : '⏳ Queued',
  sending: '⟳ Sending',
  sent   : '✓ Sent',
  failed : '✗ Failed',
  draft  : '✎ Draft',
};

export default function OutboxPanel({ isOpen, onClose }) {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [flushing, setFlushing] = useState(false);

  const load = async () => {
    if (!window.sb) return;
    setLoading(true);
    const data = await window.sb.mail.outbox();
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    load();

    const unsub = window.sb?.mail.onUpdate((data) => {
      setItems(data || []);
    });
    return () => { if (unsub) unsub(); };
  }, [isOpen]);

  const handleRetry = async (id) => {
    await window.sb.mail.retry(id);
    load();
  };

  const handleDelete = async (id) => {
    await window.sb.mail.deleteOutbox(id);
    load();
  };

  const handleFlush = async () => {
    setFlushing(true);
    await window.sb.mail.flushQueue();
    setFlushing(false);
    load();
  };

  if (!isOpen) return null;

  const queued = items.filter(i => i.status === 'queued' || i.status === 'sending');
  const failed = items.filter(i => i.status === 'failed');
  const sent   = items.filter(i => i.status === 'sent');

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'stretch',
      justifyContent: 'flex-end', zIndex: 2500,
    }}>
      <div style={{
        width: 440, background: 'var(--bg-app)',
        borderLeft: '1px solid var(--border-strong)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-toolbar)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
            OUTBOX
          </span>
          {queued.length > 0 && (
            <span style={{
              marginLeft: 8, background: 'var(--accent-dim)', color: 'var(--text-accent)',
              border: '1px solid var(--border-accent)', borderRadius: 2,
              padding: '1px 6px', fontSize: 10,
            }}>
              {queued.length} pending
            </span>
          )}
          <div style={{ flex: 1 }} />
          {queued.length > 0 && (
            <button onClick={handleFlush} disabled={flushing} style={btnStyle('accent')}>
              {flushing ? '⟳ Sending…' : '⟳ Send now'}
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginLeft: 8 }}>✕</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              Loading…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              Outbox is empty
            </div>
          )}

          {[...queued, ...failed, ...sent].map(item => (
            <OutboxItem
              key={item.id}
              item={item}
              onRetry={handleRetry}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OutboxItem({ item, onRetry, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const date = item.sent_at
    ? new Date(item.sent_at).toLocaleString()
    : new Date(item.queued_at).toLocaleString();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: STATUS_COLOR[item.status] || 'var(--text-muted)' }}>
          {STATUS_LABEL[item.status] || item.status}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {date}
        </span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>
        {item.subject || '(no subject)'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        To: {item.to_addrs}
      </div>

      {item.error && (
        <div style={{ fontSize: 10, color: 'var(--cat-error)', marginTop: 4 }}>
          ⚠ {item.error}
        </div>
      )}

      {/* Actions */}
      {hovered && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {item.status === 'failed' && (
            <button onClick={() => onRetry(item.id)} style={btnStyle('accent')}>
              Retry
            </button>
          )}
          {item.status !== 'sending' && (
            <button onClick={() => onDelete(item.id)} style={btnStyle('danger')}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(type) {
  if (type === 'accent') return {
    padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
    background: 'var(--accent-dim)', border: '1px solid var(--border-accent)',
    color: 'var(--text-accent)',
  };
  if (type === 'danger') return {
    padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
    background: 'none', border: '1px solid var(--border)',
    color: 'var(--cat-error)',
  };
  return {
    padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-second)',
  };
}
