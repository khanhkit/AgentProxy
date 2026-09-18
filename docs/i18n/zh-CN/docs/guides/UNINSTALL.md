---
title: "AgentProxy — 卸载指南"
version: 3.8.40
lastUpdated: 2026-06-28
---

# AgentProxy — 卸载指南

🌐 **Languages:** 🇺🇸 [English](../../../../guides/UNINSTALL.md) · 🇸🇦 [ar](../../../ar/docs/guides/UNINSTALL.md) · 🇦🇿 [az](../../../az/docs/guides/UNINSTALL.md) · 🇧🇬 [bg](../../../bg/docs/guides/UNINSTALL.md) · 🇧🇩 [bn](../../../bn/docs/guides/UNINSTALL.md) · 🇨🇿 [cs](../../../cs/docs/guides/UNINSTALL.md) · 🇩🇰 [da](../../../da/docs/guides/UNINSTALL.md) · 🇩🇪 [de](../../../de/docs/guides/UNINSTALL.md) · 🇬🇷 [el](../../../el/docs/guides/UNINSTALL.md) · 🇪🇸 [es](../../../es/docs/guides/UNINSTALL.md) · 🇪🇪 [et](../../../et/docs/guides/UNINSTALL.md) · 🇮🇷 [fa](../../../fa/docs/guides/UNINSTALL.md) · 🇫🇮 [fi](../../../fi/docs/guides/UNINSTALL.md) · 🇫🇷 [fr](../../../fr/docs/guides/UNINSTALL.md) · 🇮🇪 [ga](../../../ga/docs/guides/UNINSTALL.md) · 🇮🇳 [gu](../../../gu/docs/guides/UNINSTALL.md) · 🇮🇱 [he](../../../he/docs/guides/UNINSTALL.md) · 🇮🇳 [hi](../../../hi/docs/guides/UNINSTALL.md) · 🇭🇷 [hr](../../../hr/docs/guides/UNINSTALL.md) · 🇭🇺 [hu](../../../hu/docs/guides/UNINSTALL.md) · 🇮🇩 [id](../../../id/docs/guides/UNINSTALL.md) · 🇮🇹 [it](../../../it/docs/guides/UNINSTALL.md) · 🇯🇵 [ja](../../../ja/docs/guides/UNINSTALL.md) · 🇰🇷 [ko](../../../ko/docs/guides/UNINSTALL.md) · 🇱🇹 [lt](../../../lt/docs/guides/UNINSTALL.md) · 🇱🇻 [lv](../../../lv/docs/guides/UNINSTALL.md) · 🇮🇳 [mr](../../../mr/docs/guides/UNINSTALL.md) · 🇲🇾 [ms](../../../ms/docs/guides/UNINSTALL.md) · 🇲🇹 [mt](../../../mt/docs/guides/UNINSTALL.md) · 🇳🇱 [nl](../../../nl/docs/guides/UNINSTALL.md) · 🇳🇴 [no](../../../no/docs/guides/UNINSTALL.md) · 🇵🇭 [phi](../../../phi/docs/guides/UNINSTALL.md) · 🇵🇱 [pl](../../../pl/docs/guides/UNINSTALL.md) · 🇵🇹 [pt](../../../pt/docs/guides/UNINSTALL.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/UNINSTALL.md) · 🇷🇴 [ro](../../../ro/docs/guides/UNINSTALL.md) · 🇷🇺 [ru](../../../ru/docs/guides/UNINSTALL.md) · 🇸🇰 [sk](../../../sk/docs/guides/UNINSTALL.md) · 🇸🇮 [sl](../../../sl/docs/guides/UNINSTALL.md) · 🇷🇸 [sr](../../../sr/docs/guides/UNINSTALL.md) · 🇸🇪 [sv](../../../sv/docs/guides/UNINSTALL.md) · 🇰🇪 [sw](../../../sw/docs/guides/UNINSTALL.md) · 🇮🇳 [ta](../../../ta/docs/guides/UNINSTALL.md) · 🇮🇳 [te](../../../te/docs/guides/UNINSTALL.md) · 🇹🇭 [th](../../../th/docs/guides/UNINSTALL.md) · 🇹🇷 [tr](../../../tr/docs/guides/UNINSTALL.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/UNINSTALL.md) · 🇵🇰 [ur](../../../ur/docs/guides/UNINSTALL.md) · 🇻🇳 [vi](../../../vi/docs/guides/UNINSTALL.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/UNINSTALL.md)

本指南介绍如何从系统中彻底移除 AgentProxy。

---

## 快速卸载（v3.6.2+）

AgentProxy 提供两个内置脚本用于干净移除：

### 保留数据

```bash
npm run uninstall
```

此命令移除 AgentProxy 应用程序，但**保留** `~/.agentproxy/` 中的数据库、配置、API Key 和服务商设置。如果你计划稍后重装并希望保留现有配置，请使用此方式。

### 完全移除

```bash
npm run uninstall:full
```

此命令移除应用程序并**永久删除**所有数据：

- 数据库（`storage.sqlite`）
- 服务商配置和 API Key
- 备份文件
- 日志文件
- `~/.agentproxy/` 目录下的所有文件

> ⚠️ **警告：** `npm run uninstall:full` 不可逆。所有服务商连接、Combo、API Key 和用量历史将被永久删除。

---

## 手动卸载

### npm 全局安装

```bash
# 移除全局包
npm uninstall -g agentproxy

# （可选）删除数据目录
rm -rf ~/.agentproxy
```

### pnpm 全局安装

```bash
pnpm uninstall -g agentproxy
rm -rf ~/.agentproxy
```

### Docker

```bash
# 停止并移除容器
docker stop agentproxy
docker rm agentproxy

# 移除卷（删除所有数据）
docker volume rm agentproxy-data

# （可选）移除镜像
docker rmi khanhkit/agentproxy:latest
```

### Docker Compose

```bash
# 停止并移除容器
docker compose down

# 同时移除卷（删除所有数据）
docker compose down -v
```

### Electron 桌面应用

**Windows：**

- 打开 `设置 → 应用 → AgentProxy → 卸载`
- 或从安装目录运行 NSIS 卸载程序

**macOS：**

- 将 `AgentProxy.app` 从 `/Applications` 拖入废纸篓
- 删除数据：`rm -rf ~/Library/Application Support/agentproxy`

**Linux：**

- 删除 AppImage 文件
- 删除数据：`rm -rf ~/.agentproxy`

### 源码安装（git clone）

```bash
# 删除克隆目录
rm -rf /path/to/agentproxy

# （可选）删除数据目录
rm -rf ~/.agentproxy
```

---

## 数据目录

AgentProxy 默认将数据存储在以下位置：

| 平台     | 默认路径                      | 覆盖方式                   |
| -------- | ----------------------------- | -------------------------- |
| Linux    | `~/.agentproxy/`               | `DATA_DIR` 环境变量        |
| macOS    | `~/.agentproxy/`               | `DATA_DIR` 环境变量        |
| Windows  | `%APPDATA%/agentproxy/`        | `DATA_DIR` 环境变量        |
| Docker   | `/app/data/`（挂载卷）        | `DATA_DIR` 环境变量        |
| XDG 兼容 | `$XDG_CONFIG_HOME/agentproxy/` | `XDG_CONFIG_HOME` 环境变量 |

### 数据目录中的文件

| 文件/目录            | 说明                                 |
| -------------------- | ------------------------------------ |
| `storage.sqlite`     | 主数据库（服务商、Combo、设置、Key） |
| `storage.sqlite-wal` | SQLite 预写日志（临时文件）          |
| `storage.sqlite-shm` | SQLite 共享内存（临时文件）          |
| `call_logs/`         | 请求载荷归档                         |
| `backups/`           | 自动数据库备份                       |
| `log.txt`            | 旧版请求日志（可选）                 |

---

## 验证完全移除

卸载后，确认没有残留文件：

```bash
# 检查全局 npm 包
npm list -g agentproxy 2>/dev/null

# 检查数据目录
ls -la ~/.agentproxy/ 2>/dev/null

# 检查运行中的进程
pgrep -f agentproxy
```

如果有进程仍在运行，停止它：

```bash
pkill -f agentproxy
```
