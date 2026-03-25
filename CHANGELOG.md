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

## [0.4.0] — Phase 3 — Send

### Added
- ComposeWindow — To, Cc, Bcc, Subject, body, from-account picker
- OutboxQueue — SQLite queue with status: queued → sending → sent | failed
- SmtpService — nodemailer, Gmail App Password, port 587, STARTTLS
- ConnectivityWatcher — DNS ping every 60s, auto-flush on reconnect
- OutboxPanel — sidebar panel showing outbox status, retry, delete
- Draft auto-save every 30 seconds
- Offline indicator in titlebar
- Outbox badge in status bar
- Ctrl+N shortcut to open compose
- Schema migration v2 — outbox columns, drafts table

## [0.5.0] — Phase 4 — Integrity & Safe Eject

### Added
- IntegrityScanner — spot-check (50 random files on startup), deep scan (all files weekly)
- SHA-256 checksum verification against database records
- Corrupt file detection and flagging in database
- MANIFEST.txt — plain-text checksum file per year/month folder
- Rolling DB snapshots — last 3 copies, pruned automatically
- DriveManager — Safe Eject (flush WAL → close DB → Windows eject)
- DrivePanel UI — health, safe eject, scan controls, snapshot list
- Safe Eject button in status bar
- Schema migration v2 — outbox from_addr, eml_path, attach_paths, drafts table
- MessageStore.sampleMessages, listMessagesBatch, flagCorrupt

## [0.5.1] — Phase 4 additions

### Added
- Stop all processes — graceful shutdown of IMAP, SMTP, connectivity, integrity in order
- Stop all & quit — confirmation dialog, flushes DB, then app.quit()
- InstallMode detection — portable (exe+data on USB) vs data-only vs fixed
- Safe Eject now shows warning banner in portable mode
- NasBackup service — full and incremental copy of Stormbird-Data to any path
- NasBackupPanel UI — browse path, schedule (off/daily/weekly), progress bar, run now
- ProcessManager.stopAll(), stopProcess(), stopFn in register options
- NAS Backup button in sidebar
- Stop all processes + Stop & quit buttons in sidebar

## [1.0.0] — Phase 6 — Final release

### Added
- Setup wizard — 4-step first-run: welcome, data location, account, done
- Global search — Ctrl+F, searches subject/from/to across all accounts
- Search results with match highlighting and folder badges
- SettingsPanel — General (theme, paths), Shortcuts reference, About
- About screen with version, build info, GitHub link
- Keyboard shortcut: Ctrl+F (search), Ctrl+, (settings), F5 (sync all)
- Settings gear icon in titlebar
- Search bar in titlebar (clickable)
- MessageStore.globalSearch, isFirstRun
- First-run detection on boot

### Changed
- Version bumped to 1.0.0
- Phase label removed from status bar
- Console shortcut hint simplified

## [1.0.0] — Phase 6 — Polish & Release

### Added
- Setup wizard — first-run flow: welcome, data folder, Gmail account, quick-reference
- Global search in titlebar — Ctrl+F opens SearchPanel across all accounts/folders
- Settings panel — theme toggle, data path, install mode, keyboard shortcuts, about
- ⚙ Settings button in titlebar (Ctrl+,)
- Escape key closes top-most open panel in priority order
- SetupWizard shown automatically on first run (no accounts configured)
- handleSearchSelect — navigates directly to message from search result
- Version bumped to 1.0.0
- README rewritten for public release

### Changed
- App.jsx fully rewritten for v1.0.0 — all panels wired, all shortcuts active
- Status bar shows "Stormbird v1.0.0" (no phase label)
- TitleBtn width reduced to 38px for tighter titlebar
