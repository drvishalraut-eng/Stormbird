# ⚡ Stormbird

**USB-portable email archiver for Windows**

Stormbird downloads your Gmail over IMAP, stores every message as a standard `.eml` file, and keeps a searchable SQLite index — all on a USB drive. No cloud, no subscriptions, no data mining.

---

## Features

| Feature | Description |
|---------|-------------|
| **IMAP sync** | Resumable trickle downloader with UID checkpoints |
| **Portable** | Runs from USB — leaves nothing on the host machine |
| **Compose & send** | Outbox queue, SMTP via App Password, auto-flush on reconnect |
| **Global search** | Full-text search across all accounts and folders (Ctrl+F) |
| **Integrity** | SHA-256 checksums per `.eml`, spot-check on startup, weekly deep scan |
| **Safe Eject** | Flushes SQLite WAL and closes DB before unmounting USB |
| **NAS backup** | Full and incremental backup to any network path, daily/weekly schedule |
| **Install modes** | Portable (exe+data on USB), Data-only (exe on PC), Fixed |
| **MANIFEST.txt** | Plain-text checksums per year/month folder — self-verifiable |
| **DB snapshots** | Rolling 3-copy SQLite backups |
| **Stop controls** | Graceful stop-all and stop+quit with confirmation |

---

## Quick start

### Requirements
- Windows 10/11 x64
- Node.js 18+
- Gmail with IMAP enabled + [App Password](https://myaccount.google.com/apppasswords)

### Build from source

```bat
cd C:\Stormbird
npm install --ignore-scripts
npm run build
npx electron-packager . Stormbird --platform=win32 --arch=x64 --out=dist-win --overwrite --no-asar --icon=build-assets/icon.ico --prune=true --ignore=src --ignore=dist-win
dist-win\Stormbird-win32-x64\Stormbird.exe
```

### Quick rebuild (source changes only, no new packages)
```bat
cd C:\Stormbird
npm run build
npx electron-packager . Stormbird --platform=win32 --arch=x64 --out=dist-win --overwrite --no-asar --icon=build-assets/icon.ico --prune=true --ignore=src --ignore=dist-win
dist-win\Stormbird-win32-x64\Stormbird.exe
```

---

## First run

The setup wizard launches automatically. It guides you through:

1. **Choose a data folder** — pick a USB drive for portable use, or any local path
2. **Add your Gmail account** — enter your email and 16-character App Password
3. **Done** — keyboard shortcuts reference and link to start syncing

---

## Data layout

```
Stormbird-Data/
├── stormbird.db          ← SQLite metadata index
├── snapshots/            ← Rolling DB snapshots (last 3)
└── mail/
    └── <account>/
        └── <year>/
            └── <month>/
                ├── <hash>.eml      ← Raw RFC 2822 email
                ├── <hash>/         ← Extracted attachments
                └── MANIFEST.txt    ← SHA-256 checksums (human-readable)
```

All emails are stored as standard `.eml` files readable by any email client — no lock-in.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | New message |
| `Ctrl + F` | Global search |
| `Ctrl + ,` | Settings |
| `Ctrl + \`` | Toggle console |
| `Escape` | Close current panel |

---

## Architecture

| Layer | Technology |
|-------|------------|
| Shell | Electron 29 |
| UI | React 18 + Vite 5 |
| Database | sql.js (WASM SQLite, no native compilation) |
| IMAP | Raw Node.js `tls` sockets — zero packages |
| SMTP | nodemailer + Gmail App Password, port 587 |
| Storage | Atomic writes: `.tmp` → verify SHA-256 → rename |
| Integrity | SHA-256 per file, spot-check 50 files on startup, full scan weekly |

---

## Build history

| Phase | Version | Description |
|-------|---------|-------------|
| 0 | v0.1.0 | Logger, ProcessManager, IssueResolver, console UI |
| 1 | v0.2.0 | MBOX import, 2-pane message read UI |
| 2 | v0.3.0 | IMAP client, SyncService, AccountManager, trickle downloader |
| 3 | v0.4.0 | ComposeWindow, OutboxQueue, SmtpService, ConnectivityWatcher |
| 4 | v0.5.0 | IntegrityScanner, DriveManager, Safe Eject, DB snapshots |
| 4+ | v0.5.1 | NasBackup, InstallMode detection, stop-all controls |
| 6 | **v1.0.0** | Setup wizard, global search, settings panel, Escape handling, polish |

---

## License

MIT © 2026 [drvishalraut-eng](https://github.com/drvishalraut-eng/stormbird)
