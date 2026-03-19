// ─────────────────────────────────────────────────────────────────────────────
// NasBackupPanel.jsx — NAS/network backup configuration and controls
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export default function NasBackupPanel({ isOpen, onClose }) {
  const [nasPath,   setNasPath]   = useState('');
  const [schedule,  setSchedule]  = useState('off');
  const [status,    setStatus]    = useState(null);
  const [running,   setRunning]   = useState(false);
  const [progress,  setProgress]  = useState(null);
  const [result,    setResult]    = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    load();

    const unsub = window.sb?.backup.onProgress((p) => {
      setProgress(p);
      if (p.done) {
        setRunning(false);
        load();
      }
    });
    return () => { if (unsub) unsub(); };
  }, [isOpen]);

  const load = async () => {
    if (!window.sb) return;
    const [s] = await Promise.all([window.sb.backup.getStatus()]);
    setStatus(s);
    setNasPath(s?.nasPath || '');
    setSchedule(s?.schedule || 'off');
  };

  const handleBrowse = async () => {
    const p = await window.sb.backup.browsePath();
    if (p) setNasPath(p);
  };

  const handleSaveSchedule = async () => {
    await window.sb.backup.setSchedule(schedule, nasPath);
    setResult({ type: 'success', msg: 'Schedule saved.' });
    load();
  };

  const handleRunFull = async () => {
    if (!nasPath) { setResult({ type: 'error', msg: 'Select a backup folder first.' }); return; }
    setRunning(true);
    setProgress(null);
    setResult(null);
    const res = await window.sb.backup.runFull(nasPath);
    setRunning(false);
    setResult(res.success
      ? { type: 'success', msg: `Full backup complete — ${res.copied} files copied.` }
      : { type: 'error',   msg: res.error || 'Backup failed.' }
    );
    load();
  };

  const handleRunIncremental = async () => {
    if (!nasPath) { setResult({ type: 'error', msg: 'Select a backup folder first.' }); return; }
    setRunning(true);
    setProgress(null);
    setResult(null);
    const res = await window.sb.backup.runIncremental(nasPath);
    setRunning(false);
    setResult(res.success
      ? { type: 'success', msg: `Incremental backup complete — ${res.copied} files copied.` }
      : { type: 'error',   msg: res.error || 'Backup failed.' }
    );
    load();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2100,
    }}>
      <div style={{
        width: 520, background: 'var(--bg-app)',
        border: '1px solid var(--border-strong)',
        borderTop: '2px solid var(--accent)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '85vh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-toolbar)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
            NAS / NETWORK BACKUP
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Backup path */}
          <Section title="Backup destination">
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
              Select a NAS share, network folder, or any local path. Stormbird-Data will be
              copied to a <code style={{ color: 'var(--accent)' }}>Stormbird-Backup/</code> subfolder inside it.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={nasPath}
                onChange={e => setNasPath(e.target.value)}
                placeholder="\\NAS\Share or D:\Backup"
                style={inputStyle()}
              />
              <button onClick={handleBrowse} style={btnStyle('normal')}>Browse…</button>
            </div>
          </Section>

          {/* Schedule */}
          <Section title="Schedule">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              {['off', 'daily', 'weekly'].map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                  <input
                    type="radio" name="schedule" value={s}
                    checked={schedule === s}
                    onChange={() => setSchedule(s)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ color: 'var(--text-second)', textTransform: 'capitalize' }}>{s}</span>
                </label>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
              {schedule === 'off'    && 'Automatic backups disabled.'}
              {schedule === 'daily'  && 'Incremental backup runs daily when Stormbird is open.'}
              {schedule === 'weekly' && 'Incremental backup runs weekly when Stormbird is open.'}
            </p>
            <button onClick={handleSaveSchedule} style={btnStyle('normal')}>
              Save schedule
            </button>
          </Section>

          {/* Last backup info */}
          <Section title="History">
            <Row label="Last full backup"        value={_formatDate(status?.lastFull)} />
            <Row label="Last incremental backup" value={_formatDate(status?.lastIncremental)} />
          </Section>

          {/* Progress */}
          {running && progress && (
            <Section title="Progress">
              <div style={{
                height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 8,
              }}>
                <div style={{
                  height: '100%', width: `${progress.pct}%`,
                  background: 'var(--accent)', borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {progress.pct}% — {progress.copied} copied, {progress.skipped} skipped
                {progress.errors > 0 && `, ${progress.errors} errors`}
              </span>
            </Section>
          )}

          {/* Result */}
          {result && (
            <div style={{
              margin: '0 16px 12px', padding: '8px 12px', fontSize: 11,
              background: result.type === 'success' ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${result.type === 'success' ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: result.type === 'success' ? 'var(--green)' : 'var(--cat-error)',
            }}>
              {result.type === 'success' ? '✓ ' : '⚠ '}{result.msg}
            </div>
          )}

          {/* Actions */}
          <Section title="Run now">
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleRunFull} disabled={running} style={btnStyle('accent', running)}>
                {running ? '⟳ Running…' : '📦 Full backup'}
              </button>
              <button onClick={handleRunIncremental} disabled={running} style={btnStyle('normal', running)}>
                {running ? '⟳ Running…' : '⚡ Incremental backup'}
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
              Full backup copies everything. Incremental copies only files changed since last backup.
            </p>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', marginBottom: 6, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', width: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function inputStyle() {
  return {
    flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12,
    fontFamily: 'inherit', outline: 'none',
  };
}

function btnStyle(type, loading) {
  const base = {
    padding: '5px 14px', fontSize: 11,
    cursor: loading ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
  };
  if (type === 'accent') return { ...base, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--text-accent)', fontWeight: 600 };
  return { ...base, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-second)' };
}

function _formatDate(tsStr) {
  if (!tsStr) return 'Never';
  try { return new Date(parseInt(tsStr, 10)).toLocaleString(); } catch (_) { return 'Never'; }
}
