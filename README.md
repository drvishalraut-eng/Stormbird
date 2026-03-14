# Stormbird ⚡

USB-portable email archiver with built-in backup and AI-assisted diagnostics.

**Current version:** v0.1.0 (Phase 0 — Foundation)  
**Repository:** https://github.com/drvishalraut-eng/stormbird  
**Status:** Private — public at v1.0.0

---

## What it is

Stormbird is a self-contained email archiving tool that lives on a USB drive.
It downloads your Gmail history, stores everything as plain `.eml` files you can
read without any special software, backs up to your NAS, and uses Claude AI
to diagnose and fix problems automatically.

## Phase roadmap

| Phase | Version | Status | Description |
|-------|---------|--------|-------------|
| 0 | v0.1.0 | ✅ Current | Logger, Process Manager, Console UI |
| 1 | v0.2.0 | ⬜ Next | MBOX import, MessageStore, read UI |
| 2 | v0.3.0 | ⬜ | Gmail IMAP trickle downloader |
| 3 | v0.4.0 | ⬜ | Compose, outbox, SMTP send |
| 4 | v0.5.0 | ⬜ | Checksums, Safe Eject, integrity scan |
| 5 | v0.6.0 | ⬜ | NAS backup and restore |
| 6 | v1.0.0 | ⬜ | Setup wizard, search, polish |

## Building

**Requirements:** Node.js 20+, Windows 10/11

```
git clone https://github.com/drvishalraut-eng/stormbird
cd stormbird
BUILD.bat
```

Output: `dist-win/Stormbird-win32-x64/Stormbird.exe`

## Running in dev mode

```
npm install
npm run dev
```

## Tech stack

- Electron 29 + React 18 + Vite 5
- sql.js (SQLite as WASM — no native compilation)
- nodemailer (SMTP — pure JS)
- Node.js built-ins for everything else (IMAP, MBOX, crypto, zlib)

## Data storage

Everything lives in `Stormbird-Data/` next to `Stormbird.exe`.
Email is stored as plain `.eml` files in `mail/<account>/<year>/<month>/`.
No installer. No registry. No AppData. Fully portable.

## License

MIT
