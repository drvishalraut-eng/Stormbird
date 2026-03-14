// ─────────────────────────────────────────────────────────────────────────────
// ProcessManagerUI.jsx — Process health monitor panel
// Shows all registered processes, their state, and any open issues.
// Issue cards let the user diagnose with AI or retry manually.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

const STATE_COLOR = {
  BOOTING    : '#888888',
  HEALTHY    : '#4ade80',
  RUNNING    : '#22d3ee',
  IDLE       : '#555555',
  SCHEDULED  : '#555555',
  STALLED    : '#f59e0b',
  ERROR      : '#f87171',
  CRASHED    : '#f87171',
  RESTARTING : '#f59e0b',
  DISABLED   : '#333333',
};

const STATE_ICON = {
  BOOTING    : '◌',
  HEALTHY    : '●',
  RUNNING    : '◎',
  IDLE       : '○',
  SCHEDULED  : '◷',
  STALLED    : '⚠',
  ERROR      : '⚠',
  CRASHED    : '✕',
  RESTARTING : '⟳',
  DISABLED   : '—',
};

export default function ProcessManagerUI({ isOpen, onClose }) {
  const [processes,     setProcesses]     = useState([]);
  const [activeIssue,   setActiveIssue]   = useState(null);
  const [diagnosing,    setDiagnosing]    = useState(false);
  const [diagnoses,     setDiagnoses]     = useState({});

  // ── Load and subscribe ────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.sb || !isOpen) return;

    window.sb.processes.getAll().then(data => {
      if (data) setProcesses(data);
    });

    const unsubUpdate = window.sb.processes.onUpdate((data) => {
      setProcesses(data);
    });

    const unsubIssue = window.sb.processes.onIssue((issue) => {
      setActiveIssue(issue);
    });

    const unsubDiagnosis = window.sb.processes.onDiagnosis(({ issueId, diagnosis }) => {
      setDiagnoses(d => ({ ...d, [issueId]: diagnosis }));
      setDiagnosing(false);
    });

    return () => {
      if (unsubUpdate)   unsubUpdate();
      if (unsubIssue)    unsubIssue();
      if (unsubDiagnosis) unsubDiagnosis();
    };
  }, [isOpen]);

  const handleDiagnose = async (issueId) => {
    setDiagnosing(true);
    await window.sb.processes.diagnose(issueId);
  };

  const handleResolve = async (issueId) => {
    await window.sb.processes.resolve(issueId);
    setActiveIssue(null);
  };

  const handleRetry = async (processName) => {
    await window.sb.processes.retry(processName);
  };

  if (!isOpen) return null;

  const openIssues = processes.flatMap(p => p.issues || []);

  return (
    <div style={{
      position   : 'fixed',
      top        : 0, left: 0, right: 0, bottom: 0,
      background : 'rgba(0,0,0,0.7)',
      display    : 'flex',
      alignItems : 'center',
      justifyContent: 'center',
      zIndex     : 1000,
    }}
    onClick = {(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width      : 720,
        maxHeight  : '80vh',
        background : 'var(--bg-app)',
        border     : '1px solid var(--border-strong)',
        borderTop  : '2px solid var(--accent)',
        display    : 'flex',
        flexDirection: 'column',
        overflow   : 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display       : 'flex',
          alignItems    : 'center',
          padding       : '10px 14px',
          borderBottom  : '1px solid var(--border)',
          background    : 'var(--bg-toolbar)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            PROCESS MANAGER
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            {processes.length} processes · {openIssues.length} open issues
          </span>
          <button
            onClick = {onClose}
            style={{
              marginLeft : 'auto',
              color      : 'var(--text-muted)',
              fontSize   : 14,
              padding    : '2px 8px',
              border     : '1px solid var(--border)',
            }}
          >✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* ── Process table ── */}
          <div style={{ border: '1px solid var(--border)' }}>
            {/* Table header */}
            <div style={{
              display        : 'grid',
              gridTemplateColumns: '160px 100px 1fr 120px',
              padding        : '5px 10px',
              background     : 'var(--bg-toolbar)',
              borderBottom   : '1px solid var(--border)',
              fontSize       : 10,
              color          : 'var(--text-muted)',
              fontWeight     : 700,
              letterSpacing  : '0.08em',
            }}>
              <span>PROCESS</span>
              <span>STATUS</span>
              <span>LAST EVENT</span>
              <span style={{ textAlign: 'right' }}>RESTARTS</span>
            </div>

            {/* Process rows */}
            {processes.length === 0 && (
              <div style={{ padding: '12px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                No processes registered yet.
              </div>
            )}
            {processes.map((proc) => {
              const color     = STATE_COLOR[proc.state] || '#888';
              const icon      = STATE_ICON[proc.state]  || '?';
              const hasIssues = proc.issues && proc.issues.length > 0;

              return (
                <div
                  key   = {proc.name}
                  style={{
                    display        : 'grid',
                    gridTemplateColumns: '160px 100px 1fr 120px',
                    padding        : '6px 10px',
                    borderBottom   : '1px solid var(--border)',
                    background     : hasIssues ? 'rgba(248,113,113,0.05)' : 'transparent',
                    alignItems     : 'center',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: hasIssues ? 600 : 400 }}>
                    {proc.name}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color, fontSize: 12 }}>{icon}</span>
                    <span style={{ color, fontSize: 11, fontWeight: 600 }}>{proc.state}</span>
                  </span>
                  <span style={{
                    fontSize     : 11,
                    color        : 'var(--text-second)',
                    overflow     : 'hidden',
                    textOverflow : 'ellipsis',
                    whiteSpace   : 'nowrap',
                  }}>
                    {proc.lastEvent}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 11, color: proc.restartCount > 0 ? 'var(--cat-warn)' : 'var(--text-muted)' }}>
                    {proc.restartCount > 0 ? `${proc.restartCount}×` : '—'}
                    {hasIssues && (
                      <button
                        onClick = {() => setActiveIssue(proc.issues[0])}
                        style={{
                          marginLeft : 8,
                          background : 'rgba(248,113,113,0.15)',
                          border     : '1px solid #f87171',
                          color      : '#f87171',
                          fontSize   : 10,
                          padding    : '1px 5px',
                          fontFamily : 'inherit',
                          cursor     : 'pointer',
                        }}
                      >
                        ⚠ {proc.issues.length}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Active issue card ── */}
          {activeIssue && (
            <IssueCard
              issue      = {activeIssue}
              diagnosis  = {diagnoses[activeIssue.id]}
              diagnosing = {diagnosing}
              onDiagnose = {() => handleDiagnose(activeIssue.id)}
              onResolve  = {() => handleResolve(activeIssue.id)}
              onRetry    = {() => handleRetry(activeIssue.process)}
              onClose    = {() => setActiveIssue(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Issue card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, diagnosis, diagnosing, onDiagnose, onResolve, onRetry, onClose }) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div style={{
      border    : '1px solid #f87171',
      borderTop : '2px solid #f87171',
      background: 'rgba(248,113,113,0.05)',
    }}>
      {/* Issue header */}
      <div style={{
        display      : 'flex',
        alignItems   : 'center',
        padding      : '8px 12px',
        borderBottom : '1px solid rgba(248,113,113,0.2)',
        gap          : 8,
      }}>
        <span style={{ color: '#f87171', fontSize: 14 }}>⚠</span>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#f87171' }}>ISSUE DETECTED</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>✕</button>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Meta */}
        <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
          <span><span style={{ color: 'var(--text-muted)' }}>Process: </span>{issue.process}</span>
          <span><span style={{ color: 'var(--text-muted)' }}>Status: </span>
            <span style={{ color: '#f87171' }}>{issue.status.toUpperCase()}</span>
          </span>
          <span><span style={{ color: 'var(--text-muted)' }}>At: </span>
            {new Date(issue.occurredAt).toLocaleTimeString()}
          </span>
        </div>

        {/* Error message */}
        <div style={{
          background : 'rgba(0,0,0,0.3)',
          border     : '1px solid var(--border)',
          padding    : '6px 10px',
          fontSize   : 12,
          color      : '#f87171',
          fontFamily : 'monospace',
        }}>
          {issue.errorMsg}
        </div>

        {/* Diagnosis result */}
        {diagnosis && <DiagnosisResult diagnosis={diagnosis} />}

        {/* Loading state */}
        {diagnosing && !diagnosis && (
          <div style={{ color: 'var(--cat-claude)', fontSize: 12, padding: '6px 0' }}>
            <span style={{ animation: 'pulse 1.5s infinite', display: 'inline-block' }}>◎</span>
            {' '}Asking Claude for diagnosis…
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick  = {() => setShowLogs(l => !l)}
            style    = {{
              padding  : '4px 10px',
              border   : '1px solid var(--border)',
              color    : 'var(--text-second)',
              fontSize : 11,
            }}
          >
            {showLogs ? '▲ Hide logs' : '▼ Show logs'}
          </button>

          <button
            onClick  = {onRetry}
            style    = {{
              padding  : '4px 10px',
              border   : '1px solid var(--border)',
              color    : 'var(--text-second)',
              fontSize : 11,
            }}
          >
            ⟳ Retry manually
          </button>

          {!diagnosis && !diagnosing && (
            <button
              onClick  = {onDiagnose}
              style    = {{
                padding    : '4px 12px',
                background : 'var(--accent-dim)',
                border     : '1px solid var(--border-accent)',
                color      : 'var(--text-accent)',
                fontSize   : 11,
                fontWeight : 600,
              }}
            >
              🤖 Diagnose with AI
            </button>
          )}

          {diagnosis && (
            <button
              onClick  = {onResolve}
              style    = {{
                padding    : '4px 12px',
                background : 'rgba(74,222,128,0.1)',
                border     : '1px solid var(--green)',
                color      : 'var(--green)',
                fontSize   : 11,
                fontWeight : 600,
                marginLeft : 'auto',
              }}
            >
              ✓ Mark resolved
            </button>
          )}
        </div>

        {/* Log lines */}
        {showLogs && (
          <div style={{
            background : '#050505',
            border     : '1px solid var(--border)',
            maxHeight  : 150,
            overflowY  : 'auto',
            padding    : '6px 8px',
            fontSize   : 11,
            fontFamily : 'monospace',
          }}>
            {(issue.logs || []).map((l, i) => (
              <div key={i} style={{ color: '#888', lineHeight: 1.6 }}>
                <span style={{ color: '#444', marginRight: 8 }}>[{l.category}]</span>
                {l.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Diagnosis result display ──────────────────────────────────────────────────

function DiagnosisResult({ diagnosis }) {
  const sourceLabel = diagnosis.source === 'claude' ? '🤖 Claude' :
                      diagnosis.source === 'rules'  ? '📋 Rule match' : '? Unknown';

  return (
    <div style={{
      background : 'var(--accent-dim)',
      border     : '1px solid var(--border-accent)',
      padding    : '10px 12px',
      display    : 'flex',
      flexDirection: 'column',
      gap        : 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-accent)' }}>AI DIAGNOSIS</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>via {sourceLabel}</span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-second)', lineHeight: 1.6 }}>
        {diagnosis.explanation}
      </p>

      {diagnosis.steps && diagnosis.steps.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
            RESOLUTION STEPS
          </div>
          <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {diagnosis.steps.map((step, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text-second)', lineHeight: 1.6 }}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {diagnosis.prevention && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-accent)' }}>Prevention: </strong>
          {diagnosis.prevention}
        </p>
      )}
    </div>
  );
}
