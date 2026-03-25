// ─────────────────────────────────────────────────────────────────────────────
// Sidebar.jsx — Account list and folder tree
// Shows accounts, their folders, unread counts, and import button.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

const FOLDER_ICONS = {
  'Inbox'  : '✉',
  'Sent'   : '↗',
  'Drafts' : '✏',
  'Trash'  : '🗑',
  'Junk'   : '⊘',
  'Spam'   : '⊘',
  'Archive': '◫',
};

// Account colors cycling
const ACCOUNT_COLORS = ['#f59e0b', '#60a5fa', '#4ade80', '#c084fc', '#f87171', '#22d3ee'];

export default function Sidebar({ accounts, activeFolder, onFolderSelect, onImport, onAddAccount, onSync, onCompose, onOutbox, outboxCount, onNasBackup, onStopAll, onStopAndExit, onEditAccount }) {
  const [collapsed,  setCollapsed]  = useState({});
  const [counts,     setCounts]     = useState({});
  const [importing,  setImporting]  = useState(false);
  const [importPct,  setImportPct]  = useState(0);

  // ── Load folder counts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.sb || accounts.length === 0) return;

    const loadCounts = async () => {
      const newCounts = {};
      for (const acct of accounts) {
        try {
          const c = await window.sb.messages.counts(acct.id);
          if (c) newCounts[acct.id] = c;
        } catch (_) {}
      }
      setCounts(newCounts);
    };

    loadCounts();
  }, [accounts]);

  // ── Subscribe to import progress ──────────────────────────────────────────
  useEffect(() => {
    if (!window.sb) return;
    const unsub = window.sb.importer.onProgress((p) => {
      setImporting(true);
      setImportPct(p.filePct || 0);
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const toggleAcct = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const handleImport = async () => {
    if (!window.sb) return;
    const result = await window.sb.dialog.openFile({
      title: 'Select MBOX file to import',
      filters: [
        { name: 'MBOX Files', extensions: ['mbox', 'mbx', ''] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return;
    if (accounts.length === 0) {
      alert('Please add an account first before importing.');
      return;
    }
    setImporting(true);
    onImport && onImport(result.filePaths[0], accounts[0].id);
  };

  return (
    <div style={{
      width        : 210,
      flexShrink   : 0,
      background   : 'var(--bg-sidebar)',
      borderRight  : '1px solid var(--border-strong)',
      display      : 'flex',
      flexDirection: 'column',
      overflow     : 'hidden',
    }}>

      {/* ── Search box ── */}
      <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          background  : 'var(--bg-input)',
          border      : '1px solid var(--border)',
          display     : 'flex',
          alignItems  : 'center',
          padding     : '4px 8px',
          gap         : 6,
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>🔍</span>
          <input
            placeholder = "Search mail…"
            style={{
              background : 'none',
              border     : 'none',
              outline    : 'none',
              color      : 'var(--text-primary)',
              fontSize   : 12,
              width      : '100%',
            }}
          />
        </div>
      </div>

      {/* ── Account trees ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {accounts.length === 0 && (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            No accounts yet.<br />
            Import an MBOX file or add a Gmail account to get started.
          </div>
        )}

        {accounts.map((acct, i) => {
          const color      = acct.color || ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
          const isCollapsed = collapsed[acct.id];
          const acctCounts = counts[acct.id] || {};

          // Get unique folders from counts
          const folders = Object.keys(acctCounts).sort((a, b) => {
            const order = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Junk', 'Spam', 'Trash'];
            const ai = order.indexOf(a), bi = order.indexOf(b);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1;
            if (bi >= 0) return 1;
            return a.localeCompare(b);
          });

          return (
            <div key={acct.id}>
              {/* Account header */}
              <AccountHeader
                acct       = {acct}
                color      = {color}
                isCollapsed= {isCollapsed}
                onToggle   = {() => toggleAcct(acct.id)}
                onSync     = {acct.id !== 'local' ? () => onSync && onSync(acct.id) : null}
                onEdit     = {acct.id !== 'local' ? () => onEditAccount && onEditAccount(acct) : null}
              />

              {/* Folder list */}
              {!isCollapsed && folders.map(folder => {
                const isActive = activeFolder?.accountId === acct.id && activeFolder?.folder === folder;
                const fc       = acctCounts[folder] || {};
                const unread   = fc.unread || 0;
                const icon     = FOLDER_ICONS[folder] || '📁';

                return (
                  <FolderRow
                    key      = {folder}
                    icon     = {icon}
                    name     = {folder}
                    unread   = {unread}
                    isActive = {isActive}
                    onClick  = {() => onFolderSelect({ accountId: acct.id, folder })}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Import progress bar ── */}
      {importing && (
        <div style={{
          padding    : '4px 8px',
          borderTop  : '1px solid var(--border)',
          background : 'var(--bg-toolbar)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-accent)', marginBottom: 3 }}>
            Importing… {importPct}%
          </div>
          <div style={{ background: 'var(--border)', height: 3 }}>
            <div style={{
              width     : `${importPct}%`,
              height    : '100%',
              background: 'var(--accent)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* ── Bottom actions ── */}
      <div style={{
        borderTop    : '1px solid var(--border-strong)',
        padding      : '6px 6px 8px',
        display      : 'flex',
        flexDirection: 'column',
        gap          : 3,
      }}>
        <SidebarButton onClick={handleImport} accent icon="📥">
          Import MBOX
        </SidebarButton>
        <SidebarButton onClick={() => onSync && accounts.filter(a => a.id !== 'local').forEach(a => onSync(a.id))} icon="⟳">
          Sync all accounts
        </SidebarButton>
        <SidebarButton onClick={onCompose} accent2 icon="✉">
          Compose
        </SidebarButton>
        <SidebarButton onClick={onOutbox} icon="📤">
          Outbox {outboxCount > 0 ? <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 4 }}>({outboxCount})</span> : ''}
        </SidebarButton>
        <SidebarButton onClick={onNasBackup} icon="💾">
          NAS Backup
        </SidebarButton>
        <SidebarButton onClick={onAddAccount} icon="＋">
          Add Gmail account
        </SidebarButton>

        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

        <SidebarButton onClick={onStopAll} icon="⏹">
          Stop all processes
        </SidebarButton>
        <SidebarButton onClick={onStopAndExit} danger icon="⏻">
          Stop &amp; quit
        </SidebarButton>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FolderRow({ icon, name, unread, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick      = {onClick}
      onMouseEnter = {() => setHovered(true)}
      onMouseLeave = {() => setHovered(false)}
      style={{
        display     : 'flex',
        alignItems  : 'center',
        gap         : 7,
        padding     : '5px 8px 5px 22px',
        cursor      : 'pointer',
        background  : isActive ? 'var(--bg-selected)' : hovered ? 'var(--bg-hover)' : 'none',
        borderLeft  : isActive ? '2px solid var(--accent)' : '2px solid transparent',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span style={{
        flex        : 1,
        fontSize    : 12,
        color       : isActive ? 'var(--text-accent)' : 'var(--text-primary)',
        fontWeight  : unread > 0 ? 600 : 400,
        overflow    : 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace  : 'nowrap',
      }}>
        {name}
      </span>
      {unread > 0 && (
        <span style={{
          background : 'var(--accent)',
          color      : 'var(--bg-app)',
          fontSize   : 10,
          fontWeight : 700,
          padding    : '1px 5px',
          minWidth   : 18,
          textAlign  : 'center',
        }}>
          {unread}
        </span>
      )}
    </div>
  );
}

function SidebarButton({ children, onClick, accent, accent2, danger, icon }) {
  const [hovered, setHovered] = useState(false);

  const bgColor = danger
    ? (hovered ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.06)')
    : accent
      ? (hovered ? 'var(--accent)' : 'var(--accent-dim)')
      : accent2
        ? (hovered ? 'rgba(96,165,250,0.2)' : 'rgba(96,165,250,0.08)')
        : (hovered ? 'var(--bg-hover)' : 'transparent');

  const borderColor = danger
    ? (hovered ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)')
    : accent
      ? 'var(--border-accent)'
      : accent2
        ? (hovered ? 'rgba(96,165,250,0.6)' : 'rgba(96,165,250,0.25)')
        : (hovered ? 'var(--border-strong)' : 'var(--border)');

  const textColor = danger
    ? 'var(--cat-error)'
    : accent
      ? (hovered ? '#000' : 'var(--text-accent)')
      : accent2
        ? (hovered ? '#93c5fd' : '#60a5fa')
        : 'var(--text-second)';

  const iconColor = danger
    ? 'var(--cat-error)'
    : accent
      ? (hovered ? '#000' : 'var(--accent)')
      : accent2
        ? '#60a5fa'
        : 'var(--text-muted)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width        : '100%',
        padding      : '7px 10px',
        textAlign    : 'left',
        display      : 'flex',
        alignItems   : 'center',
        gap          : 8,
        background   : bgColor,
        border       : `1px solid ${borderColor}`,
        color        : textColor,
        fontSize     : 11,
        cursor       : 'pointer',
        fontFamily   : 'inherit',
        fontWeight   : (accent || accent2) ? 600 : 500,
        transition   : 'background 0.1s, border-color 0.1s',
      }}
    >
      {icon && (
        <span style={{
          fontSize   : 14,
          lineHeight : 1,
          width      : 18,
          textAlign  : 'center',
          flexShrink : 0,
          color      : iconColor,
          filter     : (accent && hovered) ? 'brightness(0)' : 'none',
          transition : 'color 0.1s',
        }}>
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  );
}

// ── AccountHeader — per-account row with sync + edit buttons ──────────────────

function AccountHeader({ acct, color, isCollapsed, onToggle, onSync, onEdit }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 8px 5px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-toolbar)',
        position: 'relative',
      }}
    >
      {/* Collapse toggle */}
      <span
        onClick={onToggle}
        style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
      >
        {isCollapsed ? '▶' : '▼'}
      </span>

      {/* Color dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />

      {/* Account name — clicking toggles collapse */}
      <div onClick={onToggle} style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {acct.email === 'local' ? 'Local Import' : acct.email.split('@')[0]}
        </div>
        {acct.email !== 'local' && (
          <div style={{
            fontSize: 9, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {acct.email}
          </div>
        )}
      </div>

      {/* Per-account action buttons — always visible for Gmail accounts */}
      {acct.id !== 'local' && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {onSync && (
            <button
              onClick={e => { e.stopPropagation(); onSync(); }}
              title="Sync this account"
              style={{
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: 10, padding: '2px 6px', fontFamily: 'inherit',
                lineHeight: 1,
              }}
            >⟳</button>
          )}
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              title="Edit / remove account"
              style={{
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer',
                fontSize: 10, padding: '2px 6px', fontFamily: 'inherit',
                lineHeight: 1,
              }}
            >✎</button>
          )}
        </div>
      )}
    </div>
  );
}
