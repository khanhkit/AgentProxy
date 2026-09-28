# Windows helpers — run AgentProxy from a source checkout

Two double-clickable `.bat` files for Windows users who cloned the repo instead of installing the npm package. Both resolve the repo root from their own location, so they work from any checkout path.

| File | What it does |
| --- | --- |
| `start-agentproxy.bat` | `npm run dev` — dev server + dashboard on `http://localhost:20128` |
| `launch-claude.bat` | launches Claude Code through the local AgentProxy CLI |

Usage:

1. Run `npm install` once.
2. Double-click `start-agentproxy.bat` and wait for the dev server.
3. Open the dashboard, connect a provider, and create/copy an API key.
4. Double-click `launch-claude.bat`. Extra arguments are forwarded.

The launch helper starts Claude Code in the selected project folder, not inside the AgentProxy checkout, so repository-specific instructions are not injected into unrelated Claude sessions.

## npm ≥ 11 and `better-sqlite3` on Windows

`better-sqlite3` is an optional dependency. If a fresh npm 11 checkout skips it, AgentProxy can fall back to `node:sqlite`, but development logs may show that `better-sqlite3` is unavailable. The package ships Windows prebuilt binaries, so a compiler is normally unnecessary; install/restore the package before restarting the dev server.

If native compilation is required and `python` resolves to the Microsoft Store build, `node-gyp` can fail because of the Store sandbox. Prefer a python.org installation or point `node-gyp` at a development directory outside `%LOCALAPPDATA%`.
