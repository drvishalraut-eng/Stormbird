# Stormbird Help — USB Drive Preparation

**Version:** v0.1.0  
**Phase:** 0 — Foundation

---

## Why USB drive preparation matters

Stormbird stores your entire email archive on a USB drive. The filesystem your
drive uses has a big impact on reliability:

| Filesystem | Max file size | Safe for email archive? |
|------------|--------------|------------------------|
| FAT32      | 4 GB         | ❌ Not recommended |
| exFAT      | 16 EB        | ⚠ Acceptable |
| NTFS       | 16 EB        | ✅ Recommended |

Stormbird recommends **NTFS** because it has journaling — if your computer
loses power or the drive is removed unexpectedly, NTFS can recover without
corrupting your data. FAT32 and exFAT cannot do this.

---

## How to check your current filesystem

1. Plug in your USB drive
2. Open File Explorer (Windows key + E)
3. Right-click your USB drive → Properties
4. The filesystem is shown at the top of the General tab

If it shows **FAT32** or **exFAT**, consider reformatting to NTFS before
storing your email archive on it.

---

## Reformatting to NTFS (via Stormbird)

**Warning: Reformatting erases all data on the drive. Back up anything
important first.**

1. Open Stormbird
2. Go to **Settings → Drive Management**
3. Select your USB drive from the list (removable drives only)
4. Click **Format to NTFS**
5. Type the drive letter to confirm (e.g. `E`)
6. Windows will ask for administrator permission — click **Yes**
7. The format takes 1–2 minutes
8. Stormbird creates the `Stormbird-Data/` folder automatically

---

## Reformatting to NTFS (manually)

If you prefer to do it yourself:

1. Open File Explorer
2. Right-click your USB drive → **Format**
3. Set File system to **NTFS**
4. Give the drive a label like `STORMBIRD`
5. Check **Quick Format**
6. Click Start → OK

---

## Recommended USB drive specs

For storing years of email with attachments:

| Archive size | Recommended drive size |
|-------------|----------------------|
| 1–2 years   | 16 GB                |
| 3–5 years   | 32 GB                |
| 10+ years   | 64 GB or larger      |

A rough estimate: 10,000 emails with average attachments ≈ 1–3 GB.

---

## Safe Eject — always do this before removing the drive

**Never pull out your USB drive without ejecting first.**

1. In Stormbird, click **⏏ Safe Eject** in the bottom-left of the sidebar
2. Wait for the confirmation: *"Safe to remove"*
3. Then physically remove the drive

Or use Windows: right-click the drive in the taskbar tray → Eject.

Removing the drive while Stormbird is writing data can corrupt your database
or leave `.eml` files incomplete. Stormbird's Safe Eject button flushes all
pending writes before signalling it is safe to remove.

---

## What Stormbird creates on your drive

After setup, your drive will contain:

```
Stormbird.exe                ← the application
Stormbird-Data/
  stormbird.db               ← email index (metadata only)
  stormbird.db.bak1          ← rolling database backup
  stormbird.db.bak2
  stormbird.db.bak3
  stormbird.log              ← application log
  settings.json              ← your configuration
  mail/
    you@gmail.com/
      2024/
        01/                  ← January 2024
          <id>.eml           ← individual email files
          <id>/              ← attachments folder
            document.pdf
          MANIFEST.txt       ← checksums for verification
  backups/
    snapshots/               ← full compressed backups
    incremental/             ← daily changed-files backups
```

All `.eml` files are standard RFC 2822 format — readable in any email client
or text editor, with no dependency on Stormbird.

---

## If your database gets corrupted

1. Go to **Settings → Drive Management → Restore Database**
2. Stormbird keeps the last 3 database backups (`stormbird.db.bak1/2/3`)
3. Select the most recent backup and click **Restore**

If all backups are damaged, your `.eml` files are still intact.
Go to **Settings → Rebuild Index** to regenerate the database from your
email files — this takes a few minutes but recovers everything.

---

*This help file was generated for Stormbird v0.1.0*  
*For the latest documentation, see the help/ folder next to Stormbird.exe*
