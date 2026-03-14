# Stormbird Changelog

All notable changes to this project are documented here.
Format: [version] — Phase name (date)

---

## v0.1.0 — Phase 0: Foundation (2026-03)

### Added
- Project scaffold — Electron 29, React 18, Vite 5
- `logger.js` — singleton logger, color-coded categories, file rotation (10MB × 3 files), live IPC push to renderer
- `ProcessManager.js` — heartbeat registry, state machine (9 states), auto-restart with backoff, critical crash handling
- `IssueResolver.js` — offline rule-based diagnosis + Claude API fallback, sensitive data stripping
- Diagnosis rules: IMAP (5 rules), Storage (4 rules), SMTP (3 rules), MBOX import (3 rules)
- `Console.jsx` — live log panel, Ctrl+` toggle, category filter buttons, pause/resume, copy-all
- `ProcessManagerUI.jsx` — process health table, issue cards, AI diagnosis display, step-by-step resolution
- Dark theme — true black (#000000) + amber (#f59e0b) accent, high contrast
- Classic theme — Windows 10 off-white (#f3f3f3) + Microsoft blue (#0078d4)
- Custom frameless titlebar with Windows-style controls
- Status bar with process health badge and console toggle
- `BUILD.bat` — one-click Windows build script
- SQLite schema migration framework (auto-migrates on startup)
- IPC bridge — full `window.sb` API surface (stubbed for future phases)
- Git structure — develop → phase branches → main, semantic versioning

### Technical decisions
- Zero native compilation — sql.js (WASM), nodemailer (pure JS), Node built-ins only
- Portable data dir — Stormbird-Data/ next to .exe, no AppData, no registry
- No FTS5 — sql.js ships without it; search uses LIKE queries
- electron-packager over electron-builder — avoids winCodeSign symlink failure on Windows

---

*Next: v0.2.0 — Phase 1: Foundation (MBOX import, MessageStore, read UI)*
