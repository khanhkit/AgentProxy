# AgentProxy — Uninstall Guide (Deutsch)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/UNINSTALL.md) · 🇸🇦 [ar](../../../ar/docs/guides/UNINSTALL.md) · 🇦🇿 [az](../../../az/docs/guides/UNINSTALL.md) · 🇧🇬 [bg](../../../bg/docs/guides/UNINSTALL.md) · 🇧🇩 [bn](../../../bn/docs/guides/UNINSTALL.md) · 🇨🇿 [cs](../../../cs/docs/guides/UNINSTALL.md) · 🇩🇰 [da](../../../da/docs/guides/UNINSTALL.md) · 🇬🇷 [el](../../../el/docs/guides/UNINSTALL.md) · 🇪🇸 [es](../../../es/docs/guides/UNINSTALL.md) · 🇪🇪 [et](../../../et/docs/guides/UNINSTALL.md) · 🇮🇷 [fa](../../../fa/docs/guides/UNINSTALL.md) · 🇫🇮 [fi](../../../fi/docs/guides/UNINSTALL.md) · 🇫🇷 [fr](../../../fr/docs/guides/UNINSTALL.md) · 🇮🇪 [ga](../../../ga/docs/guides/UNINSTALL.md) · 🇮🇳 [gu](../../../gu/docs/guides/UNINSTALL.md) · 🇮🇱 [he](../../../he/docs/guides/UNINSTALL.md) · 🇮🇳 [hi](../../../hi/docs/guides/UNINSTALL.md) · 🇭🇷 [hr](../../../hr/docs/guides/UNINSTALL.md) · 🇭🇺 [hu](../../../hu/docs/guides/UNINSTALL.md) · 🇮🇩 [id](../../../id/docs/guides/UNINSTALL.md) · 🇮🇹 [it](../../../it/docs/guides/UNINSTALL.md) · 🇯🇵 [ja](../../../ja/docs/guides/UNINSTALL.md) · 🇰🇷 [ko](../../../ko/docs/guides/UNINSTALL.md) · 🇱🇹 [lt](../../../lt/docs/guides/UNINSTALL.md) · 🇱🇻 [lv](../../../lv/docs/guides/UNINSTALL.md) · 🇮🇳 [mr](../../../mr/docs/guides/UNINSTALL.md) · 🇲🇾 [ms](../../../ms/docs/guides/UNINSTALL.md) · 🇲🇹 [mt](../../../mt/docs/guides/UNINSTALL.md) · 🇳🇱 [nl](../../../nl/docs/guides/UNINSTALL.md) · 🇳🇴 [no](../../../no/docs/guides/UNINSTALL.md) · 🇵🇭 [phi](../../../phi/docs/guides/UNINSTALL.md) · 🇵🇱 [pl](../../../pl/docs/guides/UNINSTALL.md) · 🇵🇹 [pt](../../../pt/docs/guides/UNINSTALL.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/UNINSTALL.md) · 🇷🇴 [ro](../../../ro/docs/guides/UNINSTALL.md) · 🇷🇺 [ru](../../../ru/docs/guides/UNINSTALL.md) · 🇸🇰 [sk](../../../sk/docs/guides/UNINSTALL.md) · 🇸🇮 [sl](../../../sl/docs/guides/UNINSTALL.md) · 🇷🇸 [sr](../../../sr/docs/guides/UNINSTALL.md) · 🇸🇪 [sv](../../../sv/docs/guides/UNINSTALL.md) · 🇰🇪 [sw](../../../sw/docs/guides/UNINSTALL.md) · 🇮🇳 [ta](../../../ta/docs/guides/UNINSTALL.md) · 🇮🇳 [te](../../../te/docs/guides/UNINSTALL.md) · 🇹🇭 [th](../../../th/docs/guides/UNINSTALL.md) · 🇹🇷 [tr](../../../tr/docs/guides/UNINSTALL.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/UNINSTALL.md) · 🇵🇰 [ur](../../../ur/docs/guides/UNINSTALL.md) · 🇻🇳 [vi](../../../vi/docs/guides/UNINSTALL.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/UNINSTALL.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/UNINSTALL.md)

---

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
