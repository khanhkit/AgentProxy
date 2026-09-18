---
title: "AgentProxy — Uninstall Guide"
version: 3.8.40
lastUpdated: 2026-06-28
---

# AgentProxy — Uninstall Guide

🌐 **Languages:** 🇺🇸 [English](./UNINSTALL.md) | 🇸🇦 [العربية](../i18n/ar/docs/guides/UNINSTALL.md) | 🇦🇿 [Azərbaycan dili](../i18n/az/docs/guides/UNINSTALL.md) | 🇧🇬 [Български](../i18n/bg/docs/guides/UNINSTALL.md) | 🇧🇩 [বাংলা](../i18n/bn/docs/guides/UNINSTALL.md) | 🇨🇿 [Čeština](../i18n/cs/docs/guides/UNINSTALL.md) | 🇩🇰 [Dansk](../i18n/da/docs/guides/UNINSTALL.md) | 🇩🇪 [Deutsch](../i18n/de/docs/guides/UNINSTALL.md) | 🇬🇷 [Ελληνικά](../i18n/el/docs/guides/UNINSTALL.md) | 🇪🇸 [Español](../i18n/es/docs/guides/UNINSTALL.md) | 🇪🇪 [Eesti](../i18n/et/docs/guides/UNINSTALL.md) | 🇮🇷 [فارسی](../i18n/fa/docs/guides/UNINSTALL.md) | 🇫🇮 [Suomi](../i18n/fi/docs/guides/UNINSTALL.md) | 🇫🇷 [Français](../i18n/fr/docs/guides/UNINSTALL.md) | 🇮🇪 [Gaeilge](../i18n/ga/docs/guides/UNINSTALL.md) | 🇮🇳 [ગુજરાતી](../i18n/gu/docs/guides/UNINSTALL.md) | 🇮🇱 [עברית](../i18n/he/docs/guides/UNINSTALL.md) | 🇮🇳 [हिन्दी](../i18n/hi/docs/guides/UNINSTALL.md) | 🇭🇷 [Hrvatski](../i18n/hr/docs/guides/UNINSTALL.md) | 🇭🇺 [Magyar](../i18n/hu/docs/guides/UNINSTALL.md) | 🇮🇩 [Bahasa Indonesia](../i18n/id/docs/guides/UNINSTALL.md) | 🇮🇹 [Italiano](../i18n/it/docs/guides/UNINSTALL.md) | 🇯🇵 [日本語](../i18n/ja/docs/guides/UNINSTALL.md) | 🇰🇷 [한국어](../i18n/ko/docs/guides/UNINSTALL.md) | 🇱🇹 [Lietuvių](../i18n/lt/docs/guides/UNINSTALL.md) | 🇱🇻 [Latviešu](../i18n/lv/docs/guides/UNINSTALL.md) | 🇮🇳 [मराठी](../i18n/mr/docs/guides/UNINSTALL.md) | 🇲🇾 [Bahasa Melayu](../i18n/ms/docs/guides/UNINSTALL.md) | 🇲🇹 [Malti](../i18n/mt/docs/guides/UNINSTALL.md) | 🇳🇱 [Nederlands](../i18n/nl/docs/guides/UNINSTALL.md) | 🇳🇴 [Norsk](../i18n/no/docs/guides/UNINSTALL.md) | 🇵🇭 [Filipino](../i18n/phi/docs/guides/UNINSTALL.md) | 🇵🇱 [Polski](../i18n/pl/docs/guides/UNINSTALL.md) | 🇵🇹 [Português (Portugal)](../i18n/pt/docs/guides/UNINSTALL.md) | 🇧🇷 [Português (Brasil)](../i18n/pt-BR/docs/guides/UNINSTALL.md) | 🇷🇴 [Română](../i18n/ro/docs/guides/UNINSTALL.md) | 🇷🇺 [Русский](../i18n/ru/docs/guides/UNINSTALL.md) | 🇸🇰 [Slovenčina](../i18n/sk/docs/guides/UNINSTALL.md) | 🇸🇮 [Slovenščina](../i18n/sl/docs/guides/UNINSTALL.md) | 🇷🇸 [Српски](../i18n/sr/docs/guides/UNINSTALL.md) | 🇸🇪 [Svenska](../i18n/sv/docs/guides/UNINSTALL.md) | 🇰🇪 [Kiswahili](../i18n/sw/docs/guides/UNINSTALL.md) | 🇮🇳 [தமிழ்](../i18n/ta/docs/guides/UNINSTALL.md) | 🇮🇳 [తెలుగు](../i18n/te/docs/guides/UNINSTALL.md) | 🇹🇭 [ไทย](../i18n/th/docs/guides/UNINSTALL.md) | 🇹🇷 [Türkçe](../i18n/tr/docs/guides/UNINSTALL.md) | 🇺🇦 [Українська](../i18n/uk-UA/docs/guides/UNINSTALL.md) | 🇵🇰 [اردو](../i18n/ur/docs/guides/UNINSTALL.md) | 🇻🇳 [Tiếng Việt](../i18n/vi/docs/guides/UNINSTALL.md) | 🇨🇳 [中文 (简体)](../i18n/zh-CN/docs/guides/UNINSTALL.md) | 🇹🇼 [中文 (繁體)](../i18n/zh-TW/docs/guides/UNINSTALL.md)

This guide covers how to cleanly remove AgentProxy from your system.

---

## Quick Uninstall (v3.6.2+)

AgentProxy provides two built-in scripts for clean removal:

### Keep Your Data

```bash
npm run uninstall
```

This removes the AgentProxy application but **preserves** your database, configurations, API keys, and provider settings in `~/.agentproxy/`. Use this if you plan to reinstall later and want to keep your setup.

### Full Removal

```bash
npm run uninstall:full
```

This removes the application **and permanently erases** all data:

- Database (`storage.sqlite`)
- Provider configurations and API keys
- Backup files
- Log files
- All files in the `~/.agentproxy/` directory

> ⚠️ **Warning:** `npm run uninstall:full` is irreversible. All your provider connections, combos, API keys, and usage history will be permanently deleted.

---

## Manual Uninstall

### NPM Global Install

```bash
# Remove the global package
npm uninstall -g agentproxy

# (Optional) Remove data directory
rm -rf ~/.agentproxy
```

### pnpm Global Install

```bash
pnpm uninstall -g agentproxy
rm -rf ~/.agentproxy
```

### Docker

```bash
# Stop and remove the container
docker stop agentproxy
docker rm agentproxy

# Remove the volume (deletes all data)
docker volume rm agentproxy-data

# (Optional) Remove the image
docker rmi khanhkit/agentproxy:latest
```

### Docker Compose

```bash
# Stop and remove containers
docker compose down

# Also remove volumes (deletes all data)
docker compose down -v
```

### Electron Desktop App

**Windows:**

- Open `Settings → Apps → AgentProxy → Uninstall`
- Or run the NSIS uninstaller from the install directory

**macOS:**

- Drag `AgentProxy.app` from `/Applications` to Trash
- Remove data: `rm -rf ~/Library/Application Support/agentproxy`

**Linux:**

- Remove the AppImage file
- Remove data: `rm -rf ~/.agentproxy`

### Source Install (git clone)

```bash
# Remove the cloned directory
rm -rf /path/to/agentproxy

# (Optional) Remove data directory
rm -rf ~/.agentproxy
```

---

## Data Directories

AgentProxy stores data in the following locations by default:

| Platform      | Default Path                  | Override                  |
| ------------- | ----------------------------- | ------------------------- |
| Linux         | `~/.agentproxy/`               | `DATA_DIR` env var        |
| macOS         | `~/.agentproxy/`               | `DATA_DIR` env var        |
| Windows       | `%APPDATA%/agentproxy/`        | `DATA_DIR` env var        |
| Docker        | `/app/data/` (mounted volume) | `DATA_DIR` env var        |
| XDG-compliant | `$XDG_CONFIG_HOME/agentproxy/` | `XDG_CONFIG_HOME` env var |

### Files in the data directory

| File/Directory       | Description                                       |
| -------------------- | ------------------------------------------------- |
| `storage.sqlite`     | Main database (providers, combos, settings, keys) |
| `storage.sqlite-wal` | SQLite write-ahead log (temporary)                |
| `storage.sqlite-shm` | SQLite shared memory (temporary)                  |
| `call_logs/`         | Request payload archives                          |
| `backups/`           | Automatic database backups                        |
| `log.txt`            | Legacy request log (optional)                     |

---

## Verify Complete Removal

After uninstalling, verify there are no remaining files:

```bash
# Check for global npm package
npm list -g agentproxy 2>/dev/null

# Check for data directory
ls -la ~/.agentproxy/ 2>/dev/null

# Check for running processes
pgrep -f agentproxy
```

If any process is still running, stop it:

```bash
pkill -f agentproxy
```
