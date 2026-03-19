// ─────────────────────────────────────────────────────────────────────────────
// DrivePanel.jsx — Drive health, Safe Eject, integrity report, snapshots
// Accessed from Settings / status bar Safe Eject button
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

export default function DrivePanel({ isOpen, onClose }) {
  const [health,     setHealth]     = useState(null);
  const [report,     setReport]     = useState(null);
  const [installMode, setInstallMode] = useState(null);
  const [scanning,   setScanning]   = useState(false);
  const [ejecting,   setEjecting]   = useState(false);
  const [ejectResult, setEjectResult] = useState(null);
  const [snapshots,  setSnapshots]  = useState([]);
  const [scanResult, setScanResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    load();
  }, [isOpen]);

  const load = async () => {
    if (!window.sb) return;
    const [h, r, m] = await Promise.all([
      window.sb.drive.getHealth(),
      window.sb.integrity.getReport(),
      window.sb.appControl.installMode(),
    ]);
    setHealth(h);
    setReport(r);
    setInstallMode(m);
    setSnapshots(r?.snapshots || []);
  };

  const handleSpotCheck = async () => {
    setScanning('spot');
    setScanResult(null);
    const result = await window.sb.integrity.spotCheck();
    setScanning(false);
    setScanResult({ type: 'spot', ...result });
    load();
  };

  const handleDeepScan = async () => {
    setScanning('deep');
    setScanResult(null);
    const result = await window.sb.integrity.deepScan();
    setScanning(false);
    setScanResult({ type: 'deep', ...result });
    load();
  };

  const handleSnapshot = async () => {
    await window.sb.integrity.takeSnapshot();
    load();
  };

  const handleWriteManifests = async () => {
    await window.sb.integrity.writeManifests();
    setScanResult({ type: 'manifest', msg: 'MANIFEST.txt written to all folders.' });
  };

  const handleSafeEject = async () => {
    setEjecting(true);
    setEjectResult(null);
    const result = await window.sb.drive.safeEject(health?.letter);
    setEjecting(false);
    setEjectResult(result);
  };

  if (!isOpen) return null;

  const freeGB  = health ? (health.freeBytes  / 1e9).toFixed(1) : '—';
  const dbSizeKB = health ? Math.round(health.dbSizeBytes / 1024) : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        width: 520, maxHeight: '85vh', background: 'var(--bg-app)',
        border: '1px solid var(--border-strong)',
        borderTop: '2px solid var(--accent)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-toolbar)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
            DRIVE & INTEGRITY
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── Install mode ── */}
          <Section title="Install mode">
            <Row label="Mode"      value={installMode?.mode        || '—'} />
            <Row label="Exe drive" value={installMode?.drives?.exeDrive  || '—'} />
            <Row label="Data drive" value={installMode?.drives?.dataDrive || '—'} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              {installMode?.description || ''}
            </p>
          </Section>

          {/* ── Drive health ── */}
          <Section title="Drive">
            <Row label="Data path" value={health?.dataDir || '—'} mono />
            <Row label="Drive"     value={health?.letter  || '—'} />
            <Row label="Database"  value={health?.dbExists ? `${dbSizeKB.toLocaleString()} KB` : '⚠ Not found'} warn={!health?.dbExists} />
          </Section>

          {/* ── Safe Eject ── */}
          <Section title="Safe Eject">
            {installMode?.mode === 'portable' && (
              <div style={{
                padding: '8px 12px', marginBottom: 10, fontSize: 11,
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)',
                color: 'var(--accent)',
              }}>
                ⚠ <strong>Portable mode:</strong> Stormbird is running from the USB drive.
                Ejecting will close the application. Make sure all syncs are complete first.
              </div>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
              Flushes all pending writes and closes the database before unmounting the USB drive.
              Always use this before removing the drive.
            </p>
            {ejectResult && (
              <div style={{
                padding: '6px 10px', marginBottom: 8, fontSize: 11,
                background: ejectResult.success ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${ejectResult.success ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: ejectResult.success ? 'var(--green)' : 'var(--cat-error)',
              }}>
                {ejectResult.success ? '✓ ' : '⚠ '}{ejectResult.message}
              </div>
            )}
            <button onClick={handleSafeEject} disabled={ejecting}
              style={btnStyle('accent', ejecting)}>
              {ejecting ? '⟳ Ejecting…' : '⏏ Safe Eject'}
            </button>
          </Section>

          {/* ── Integrity ── */}
          <Section title="Integrity">
            <Row label="Total messages" value={report?.totalMessages?.toLocaleString() || '—'} />
            <Row label="Last spot-check" value={_formatDate(report?.lastSpotCheck)} />
            <Row label="Last deep scan"  value={_formatDate(report?.lastDeepScan)} />

            {scanResult && (
              <div style={{
                padding: '6px 10px', margin: '8px 0', fontSize: 11,
                background: scanResult.failed > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                border: `1px solid ${scanResult.failed > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
                color: scanResult.failed > 0 ? 'var(--cat-error)' : 'var(--green)',
              }}>
                {scanResult.type === 'manifest'
                  ? `✓ ${scanResult.msg}`
                  : scanResult.failed > 0
                    ? `⚠ ${scanResult.failed} corrupt, ${scanResult.missing} missing`
                    : `✓ ${scanResult.checked} files OK — no corruption found`
                }
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button onClick={handleSpotCheck} disabled={!!scanning}
                style={btnStyle('normal', scanning === 'spot')}>
                {scanning === 'spot' ? '⟳ Checking…' : '⚡ Spot-check'}
              </button>
              <button onClick={handleDeepScan} disabled={!!scanning}
                style={btnStyle('normal', scanning === 'deep')}>
                {scanning === 'deep' ? '⟳ Scanning…' : '🔍 Deep scan'}
              </button>
              <button onClick={handleWriteManifests} disabled={!!scanning}
                style={btnStyle('normal')}>
                📄 Write MANIFESTs
              </button>
            </div>
          </Section>

          {/* ── Snapshots ── */}
          <Section title="Database snapshots">
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Last {snapshots.length > 0 ? snapshots.length : 0} of 3 rolling snapshots stored on USB.
            </p>
            {snapshots.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>No snapshots yet.</p>
            )}
            {snapshots.map(s => (
              <div key={s.name} style={{
                display: 'flex', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid var(--border)',
                fontSize: 11,
              }}>
                <span style={{ color: 'var(--text-second)', flex: 1 }}>{s.name}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>
                  {Math.round(s.size / 1024)} KB
                </span>
              </div>
            ))}
            <button onClick={handleSnapshot} style={{ ...btnStyle('normal'), marginTop: 8 }}>
              📸 Take snapshot now
            </button>
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

function Row({ label, value, mono, warn }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', width: 120, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: warn ? 'var(--cat-error)' : 'var(--text-primary)',
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: mono ? 11 : 12,
        wordBreak: 'break-all',
      }}>{value}</span>
    </div>
  );
}

function btnStyle(type, loading) {
  const base = {
    padding: '5px 12px', fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', opacity: loading ? 0.6 : 1,
  };
  if (type === 'accent') return { ...base, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--text-accent)', fontWeight: 600 };
  return { ...base, background: 'none', border: '1px solid var(--border-strong)', color: 'var(--text-second)' };
}

function _formatDate(tsStr) {
  if (!tsStr) return 'Never';
  const d = new Date(parseInt(tsStr, 10));
  return isNaN(d) ? 'Never' : d.toLocaleString();
}
