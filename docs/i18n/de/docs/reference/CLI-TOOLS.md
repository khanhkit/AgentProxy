# CLI-TOOLS (Deutsch)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI-Tools — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI-Tools — AgentProxy

Zuletzt aktualisiert: 2026-08-18

AgentProxy integriert sich mit drei Kategorien von CLI-Tools, die auf drei speziellen Dashboard-Seiten verteilt sind:

| Seite          | Route                   | Konzept                                                                                    | Anzahl              |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ------------------- |
| **CLI Code's** | `/dashboard/cli-code`   | Codierungswerkzeuge, die Sie auf AgentProxy verweisen (Client → CLI → AgentProxy → Provider) | 26                  |
| **CLI Agents** | `/dashboard/cli-agents` | Autonome Agenten, die Sie auf AgentProxy verweisen (derselbe Fluss, breiterer Umfang)       | 8                   |
| **ACP Agents** | `/dashboard/acp-agents` | CLIs, die AgentProxy als Backend über stdio/ACP erzeugt (umgekehrter Fluss)                 | siehe Registrierung |

Legacy-Routen leiten über 308 um: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## So funktioniert es

```
CLI Code's / CLI Agents (Konsumfluss):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (alle verweisen auf AgentProxy)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (AgentProxy leitet an den richtigen Anbieter weiter)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP Agents (umgekehrter Erzeugungsfluss):
    Client-Anfrage → AgentProxy → erzeugt CLI über stdio/ACP → Antwort
```

**Vorteile:**

- Ein API-Schlüssel zur Verwaltung aller Werkzeuge
- Kostenverfolgung über alle CLIs im Dashboard
- Modellwechsel ohne Neukonfiguration jedes Werkzeugs
- Funktioniert lokal und auf Remote-Servern (VPS, Docker, Akamai, Cloudflare Tunnel)

---

## Automatische Konfiguration mit `setup-*`

Sie müssen die Konfiguration jedes Werkzeugs nicht von Hand schreiben. AgentProxy liefert einen `setup-*`
Befehl pro unterstütztem CLI, der das **live** Modellkatalog von einem laufenden
AgentProxy (lokal oder remote) liest und die eigene Konfiguration des Werkzeugs auf Ihrem Rechner schreibt:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
```

Jeder akzeptiert `--remote <url> --api-key <key>` (konfiguriert ein lokales Werkzeug gegen ein
remote AgentProxy), `--dry-run` (Vorschau ohne Schreiben) und `--port`. Werkzeuge
ohne automatische Modellerkennung (Cline, Kilo, Roo, Goose, Aider, Qwen) benötigen
`--model <id>` (und `--yes` für nicht-interaktive Ausführungen). Um ein CLI mit der
richtigen Umgebung zu starten und keine Konfiguration überhaupt zu schreiben, verwenden Sie den generischen
`agentproxy run <target>` Launcher (claude, codex, aider, goose, opencode, qwen,
gemini — Ziele und Aliase stammen aus `bin/cli/cli-manifest.mjs`); die Legacy
pro-Werkzeug-Launcher `agentproxy launch` (Claude Code) und `agentproxy launch-codex`
(Codex) bleiben verfügbar. Gemini CLI ist nur zum Starten: es ist ein `agentproxy run`
Ziel, hat aber kein `setup-*`/`configure` Rezept.

> **Vollständige Referenz:** die Mastertabelle — was jeder Befehl schreibt, jede Flagge,
> lokal vs. remote und welche Werkzeuge ein `/v1` Suffix benötigen — befindet sich in
> **[CLI-Integrationen](../guides/CLI-INTEGRATIONS.md)**.

### Ausführen dieser innerhalb eines Containers

Ein `setup-*` Befehl, der innerhalb des AgentProxy-Containers ausgeführt wird, schreibt in das
eigene Home des Containers, das von keinem Host-CLI gelesen wird und mit dem
Container verschwindet. AgentProxy erkennt das und beendet mit `2` und Anweisungen, anstatt zu schreiben. Zwei unterstützte Wege nach vorne — installieren Sie das CLI auf dem Host und
`agentproxy connect` zum Container, oder binden Sie die Konfigurationsverzeichnisse und setzen Sie
`CLI_CONFIG_HOME` (das Compose `host` Profil). Jeder `setup-*` Befehl, plus
`agentproxy configure` und `agentproxy config set`, akzeptiert
`--allow-container-write`, wenn die Konfiguration der eigenen CLIs des Containers tatsächlich gemeint war; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` tut dasselbe für
den Server. Siehe
[Docker Guide → Konfigurieren von Host-CLI-Tools](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

Der **apply endpoint** des Dashboards (`POST /api/cli-tools/apply`) erzwingt den
gleichen Schutz: in einem Container beantwortet ein Schreiben, dessen Ziel nicht vom
Host gebunden ist, mit **`422`** und `containerEphemeralTarget: true`, dem sicheren Fehlertext und — für die Werkzeuge mit einem Host-Rezept (claude, codex, opencode, cline,
kilo, continue) — einem `hostSetupCommand` (z.B. `agentproxy setup-opencode`), das stattdessen auf dem Host ausgeführt werden soll; es wird nichts geschrieben. `dryRun: true` funktioniert weiterhin im Container-Modus und gibt den generierten Inhalt + Zielpfad zurück, ohne die Festplatte zu berühren, sodass Sie eine Vorschau vom Dashboard anzeigen und auf dem Host anwenden können. Dieses Verhalten ist
absichtlich und durch `tests/unit/api/cli-tools/apply-container-guard.test.ts` geschützt — niemals "reparieren" Sie ein 422, indem Sie den Schutz entfernen.

---

## Quelle der Wahrheit

Der einheitliche Katalog befindet sich in `src/shared/constants/cliTools.ts` als `CLI_TOOLS: Record<string, CliCatalogEntry>`.

Jeder Eintrag hat diese Felder (definiert in `src/shared/schemas/cliCatalog.ts`):

| Feld                                            | Typ                                                          | Beschreibung                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `category`                                      | `"code" \| "agent"`                                          | Auf welcher Seite das Tool erscheint                                           |
| `vendor`                                        | `string`                                                     | Herkunft des Tools ("Anthropic", "OSS (P. Gauthier)")                          |
| `acpSpawnable`                                  | `boolean`                                                    | Auch als ACP-Agent nutzbar (Abzeichen angezeigt)                               |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | Unterstützungsgrad für benutzerdefinierte Endpunkte. `"none"` = MITM-Rückstand |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Konfigurationsmechanismus                                                      |
| `id`, `name`, `color`, `description`, `docsUrl` | standard                                                     | Kernanzeigefelder                                                              |

Einträge mit `baseUrlSupport: "none"` werden **nicht angezeigt** auf den Dashboard-Seiten — sie sind im MITM-Rückstand für Plan 11 registriert (siehe `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Fähigkeitsstufen (katalogisiert × erkennbar × konfigurierbar × startbar)

Nicht jedes katalogisierte Tool ist erkennbar, konfigurierbar oder startbar. Jede Stufe hat eine deklarierende Quelle, und ein Drift-Test hält sie synchron:

| Stufe              | Bedeutung                                                                           | Deklariert in                                                     |
| ------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Katalogisiert**  | Erscheint im Dashboard-Katalog (Name, Anbieter, Dokumentation, Konfigurationstyp)   | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                  |
| **Erkennbar**      | Binär-/Konfigurationsdetektion, Gesundheitsprüfungen, Konfigurationspfade           | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` Laufzeitkatalog) |
| **Konfigurierbar** | Unterstützt durch `agentproxy configure <cli>` (Setup-Rezept vorhanden)              | `bin/cli/cli-manifest.mjs` (`configure: true`)                    |
| **Startbar**       | Unterstützt durch `agentproxy run <target>` (Umgebungs-/Argumenteinfügung definiert) | `bin/cli/cli-manifest.mjs` (`run: true`)                          |

`bin/cli/cli-manifest.mjs` ist das kanonische ausführbare Manifest für die CLI-Befehle: `run`, `configure` und die Shell-Vervollständigungs-Generatoren leiten ihre Ziel-Listen, Alias-Auflösung (zum Beispiel `kilocode`/`kilo-code`/`kilo_cli` → `kilo`) und die Verkabelung des `--model`-Flags davon ab. Der Drift-Wächter `tests/unit/cli/cli-manifest-drift.test.ts` stellt sicher, dass das Manifest, der Laufzeitkatalog, der UI-Katalog und jede Verbraucherschnittstelle synchron bleiben — ein Ziel, das einer Oberfläche hinzugefügt wird, ohne dass die anderen aktualisiert werden, führt zum Fehlschlagen der Suite, anstatt stillschweigend abzuweichen.

## 1. Katalog der CLI-Tools (26 Werkzeuge)

Alle Werkzeuge, die in `/dashboard/cli-code` erscheinen. Die mit `baseUrlSupport: none` sind über MITM oder einen manuellen Leitfaden verbunden, anstatt über eine benutzerdefinierte Basis-URL:

| id           | name                    | vendor              | baseUrlSupport | configType     | acpSpawnable |
| ------------ | ----------------------- | ------------------- | -------------- | -------------- | ------------ |
| claude       | Claude Code             | Anthropic           | full           | env            | true         |
| codex        | OpenAI Codex CLI        | OpenAI              | full           | custom         | true         |
| zcode        | ZCode (GLM Coding Plan) | Z.ai                | none           | custom         | false        |
| cline        | Cline                   | OSS (ex-Claude Dev) | full           | custom         | true         |
| kilo         | Kilo Code               | Kilo-Org            | full           | custom         | false        |
| roo          | Roo Code                | Roo (OSS)           | full           | guide          | false        |
| continue     | Continue                | continue.dev        | full           | guide          | false        |
| aider        | Aider                   | OSS (P. Gauthier)   | full           | guide          | true         |
| forge        | ForgeCode               | Antinomy HQ         | full           | custom         | true         |
| jcode        | jcode                   | 1jehuang (OSS)      | full           | custom         | false        |
| deepseek-tui | DeepSeek TUI            | Hunter Bown (OSS)   | full           | custom         | false        |
| codewhale    | CodeWhale               | Hmbown (OSS)        | full           | custom         | false        |
| opencode     | OpenCode                | Anomaly (ex-SST)    | full           | guide          | true         |
| droid        | Factory Droid           | Factory AI          | partial        | guide          | false        |
| copilot      | GitHub Copilot CLI      | GitHub/MS           | full           | custom         | false        |
| cursor-cli   | Cursor CLI              | Anysphere           | partial        | guide          | true         |
| smelt        | Smelt                   | leonardcser (OSS)   | full           | custom         | false        |
| pi           | Pi (pi-coding-agent)    | M. Zechner (OSS)    | full           | custom         | false        |
| grok-build   | Grok Build              | xAI                 | full           | custom         | false        |
| crush        | Crush                   | OSS (Charm)         | full           | custom         | false        |
| qwen         | Qwen Code               | Alibaba             | full           | guide          | true         |
| cursor       | Cursor                  | Anysphere           | none           | guide          | false        |
| antigravity  | Antigravity             | Google              | none           | mitm           | false        |
| hermes       | Hermes                  | Nous Research       | none           | guide          | false        |
| kiro         | Kiro AI                 | Amazon              | none           | mitm           | false        |
| custom       | Custom CLI              | —                   | full           | custom-builder | false        |

Werkzeuge mit `baseUrlSupport: "partial"` zeigen ein Badge "⚠ Teilweise Basis-URL" in der Dashboard-Karte an.
---

## 2. CLI-Agenten-Katalog (8 Werkzeuge)

Autonome Agenten, die in `/dashboard/cli-agents` erscheinen:

| id           | name             | vendor                   | baseUrlSupport | acpSpawnable |
| ------------ | ---------------- | ------------------------ | -------------- | ------------ |
| hermes-agent | Hermes-Agent     | Nous Research            | voll           | falsch       |
| openclaw     | OpenClaw         | OSS (P. Steinberger)     | voll           | wahr         |
| goose        | Goose            | Block / Linux Foundation | voll           | wahr         |
| interpreter  | Open Interpreter | OSS                      | voll           | wahr         |
| warp         | Warp AI          | Warp Inc.                | teilweise      | wahr         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)      | voll           | falsch       |
| omp          | Oh My Pi         | OSS                      | voll           | wahr         |
| letta        | Letta CLI        | Letta                    | voll           | falsch       |

---

## 3. ACP-Agenten (/dashboard/acp-agents)

Diese Seite (umbenannt von `/dashboard/agents`) zeigt CLIs, die AgentProxy als **Backend-Ausführungs-Engines** über das stdio/ACP-Protokoll **erzeugen** kann. Der Katalog wird separat in `src/lib/acp/registry.ts` gepflegt und ist **nicht** dasselbe wie `CLI_TOOLS`.

---

## 4. MITM-Rückstand (nicht im Dashboard angezeigt)

Die folgenden CLIs unterstützen nativ keine benutzerdefinierte Basis-URL und sind **nicht aufgeführt** auf den Seiten CLI Code oder CLI Agents. Sie sind Kandidaten für die MITM-Abfangung im Plan 11:

| CLI                 | Grund                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| windsurf            | BYOK beschränkt auf ausgewählte Claude-Modelle + Unternehmens-URL/Token |
| amp                 | Geschlossenes Ökosystem (Sourcegraph)                                   |
| amazon-q / kiro-cli | AWS SSO-Auth, keine benutzerdefinierte URL                              |
| cowork              | Anthropic Desktop, kein konfigurierbarer Endpunkt                       |

Siehe `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` für das vollständige Querverzeichnis.

---

## 5. Batch Detection API

Alle Werkzeugerkennungen werden über einen einzigen Endpunkt aggregiert:

**`GET /api/cli-tools/all-statuses`**

- Auth: `requireCliToolsAuth(request)` (gleich wie bei anderen `/api/cli-tools/` Routen)
- Gibt zurück: `Record<toolId, ToolBatchStatus>` (Typ: `src/shared/types/cliBatchStatus.ts`)
- Strategie: `Promise.all` über alle Werkzeuge, 5s Timeout pro Werkzeug
- Cache: In-Memory LRU, indiziert nach Konfigurationsdatei `mtime`. Cache wird ungültig, wenn sich mtime ändert. Wird beim Neustart des Servers zurückgesetzt.

Antwortstruktur pro Werkzeug:

```ts
interface ToolBatchStatus {
  detection: {
    installed: boolean;
    runnable: boolean;
    version?: string;
    command?: string;
    commandPath?: string;
    reason?: string;
  };
  config: {
    status: "configured" | "not_configured" | "not_installed" | "unknown" | "other";
    endpoint?: string | null;
    lastConfiguredAt?: string | null;
  };
  error?: string; // bereinigt, keine Stack-Traces
}
```

## 6. Einstellungen für neue Werkzeuge

Neue Werkzeuge mit `configType: "custom"` haben dedizierte API-Routen für Einstellungen:

| Route                                       | Werkzeug                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                                     |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url Flag)                                                     |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, legacy)                                      |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, primär + legacy `~/.deepseek` Synchronisierung) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                                       |
| `POST /api/cli-tools/pi-settings`           | Pi Coding-Agent                                                             |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)                       |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + dedizierter `.env` Schlüssel)          |

Alle Routen verwenden `sanitizeErrorMessage()` für Fehlermeldungen (Hard Rule #12).

---

## 7. Architektur der Dashboard-Seiten

### CLI-Code (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — Serverkomponente
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — Client-Grid
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — Werkzeug-Detailseite
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 spezialisierte Werkzeugkarten + `ToolDetailClient.tsx`

### CLI-Agenten (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — Serverkomponente
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — Client-Grid
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — wiederverwendet `ToolDetailClient`

### ACP-Agenten (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — Serverkomponente (verschoben von `agents/`)

### Gemeinsame UI-Komponenten (`src/shared/components/cli/`)

| Datei                   | Zweck                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `CliToolCard.tsx`       | Intelligente Statuskarte (Erkennung + Konfiguration + Endpunkt) |
| `CliConceptCard.tsx`    | Konzept-Erklärungskarte pro Seite                               |
| `CliComparisonCard.tsx` | Dreispaltiger Vergleich zwischen CLI-Typen                      |
| `BaseUrlSelect.tsx`     | Endpunkt-Dropdown (Lokal/Cloud/Benutzerdefiniert)               |
| `ApiKeySelect.tsx`      | API-Schlüssel-Auswahl                                           |
| `ManualConfigModal.tsx` | Kopierbarer Konfigurationsausschnitt-Modus                      |

### Gemeinsamer Hook (`src/shared/hooks/cli/`)

| Datei                     | Zweck                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | Ruft `/api/cli-tools/all-statuses` ab, verwaltet Lade-/Aktualisierungszustand |

## 8. i18n

Neue Namensräume, die in Plan 14 F9 hinzugefügt wurden:

| Namensraum  | Zweck                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `cliCommon` | Gemeinsame Strings (Kartenbeschriftungen, Konzept-/Vergleichstexte, Detailseitenbeschriftungen) |
| `cliCode`   | Strings der CLI-Code-Seite                                                                      |
| `cliAgents` | Strings der CLI-Agenten-Seite                                                                   |
| `acpAgents` | Strings der ACP-Agenten-Seite                                                                   |

Vollständige PT-BR- und EN-Übersetzungen sind vorhanden. 39 andere Lokalisierungen fallen automatisch auf EN über die Namensraum-Ebene in `src/i18n/request.ts` zurück.

---

## 9. Schnellstart

### Schritt 1 — Holen Sie sich einen AgentProxy API-Schlüssel

1. Öffnen Sie `/dashboard/api-manager` → **API-Schlüssel erstellen**
2. Geben Sie ihm einen Namen (z.B. `cli-tools`) und wählen Sie alle Berechtigungen aus
3. Kopieren Sie den Schlüssel — Sie benötigen ihn für jede CLI unten

> Ihr Schlüssel sieht so aus: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### Schritt 2 — Installieren Sie die CLI-Tools

Alle npm-basierten Tools erfordern Node.js 22.22.2+ oder 24.x:

```bash
# Claude Code (Anthropic)
npm install -g @anthropic-ai/claude-code

# OpenAI Codex
npm install -g @openai/codex

# OpenCode
npm install -g opencode-ai

# Cline
npm install -g cline

# KiloCode
npm install -g kilocode

# Qwen Code
npm install -g @qwen-code/qwen-code

# Google Gemini CLI (startbar über `agentproxy run gemini` → /v1beta surface)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Rust-basiert

# Pi-Coding-Agent
# siehe https://github.com/zechnerj/pi-coding-agent für die Installation

# jcode
# siehe https://github.com/1jehuang/jcode für die Installation
```

---

### Schritt 3 — Konfigurieren Sie über das Dashboard

1. Gehen Sie zu `http://localhost:20128/dashboard/cli-code`
2. Finden Sie Ihr Tool im Raster
3. Klicken Sie auf die Karte, um die Detailseite des Tools zu öffnen
4. Wählen Sie Ihren API-Schlüssel und die Basis-URL aus
5. Klicken Sie auf **Konfiguration anwenden** oder kopieren Sie den manuellen Konfigurationsausschnitt

---

### Schritt 4 — Setzen Sie globale Umgebungsvariablen

```bash
# AgentProxy Universeller Endpunkt
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI liest GOOGLE_GEMINI_BASE_URL an der WURZEL (sein SDK fügt /v1beta/... selbst hinzu)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> Für einen **Remote-Server** ersetzen Sie `localhost:20128` durch die Server-IP oder Domain,
> z.B. `http://<your-server-ip>:20128`.

---

### Schritt 4 — Konfigurieren Sie jedes Tool

#### Claude Code

```bash
# Erstellen Sie ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Verwenden Sie das einheitliche Anthropic-Gateway-Wurzel für Claude Code. Fügen Sie hier nicht `/v1` hinzu.

**Test:** `claude "sag hallo"`

---

#### OpenAI Codex

Der moderne Codex (v0.137+) liest nur `~/.codex/config.toml` — die alte
`config.yaml` gehört zur Legacy-npm-CLI und wird stillschweigend ignoriert. Der API
Schlüssel bleibt in der Umgebungsvariablen `AGENTPROXY_API_KEY` (`env_key`), niemals
innerhalb der Datei:

```bash
mkdir -p ~/.codex && cat > ~/.codex/config.toml << EOF
model_provider = "agentproxy"

[model_providers.agentproxy]
name                 = "AgentProxy"
base_url             = "http://localhost:20128/v1"
env_key              = "AGENTPROXY_API_KEY"
requires_openai_auth = false
EOF
export AGENTPROXY_API_KEY="sk-your-agentproxy-key"
```

Vollständige Referenz (Profile, `wire_api`, Kontextfenster): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

**Test:** `codex "was ist 2+2?"`

---

#### OpenCode

```bash
mkdir -p ~/.config/opencode && cat > ~/.config/opencode/opencode.json << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "agentproxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "AgentProxy",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "sk-your-agentproxy-key"
      },
      "models": {
        "claude-sonnet-4-5": { "name": "claude-sonnet-4-5" },
        "claude-sonnet-4-5-thinking": { "name": "claude-sonnet-4-5-thinking" },
        "gemini-3-flash": { "name": "gemini-3-flash" }
      }
    }
  }
}
EOF
```

**Test:** `opencode`

> Verwenden Sie `opencode run "Ihr Prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> um Denkvarianten zu senden.

---

#### Cline (CLI oder VS Code)

**CLI-Modus:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code-Modus:**
Cline-Erweiterungseinstellungen → API-Anbieter: `OpenAI Compatible` → Basis-URL: `http://localhost:20128/v1`

Oder verwenden Sie das AgentProxy-Dashboard → **CLI-Tools → Cline → Konfiguration anwenden**.

---

#### KiloCode (CLI oder VS Code)

**CLI-Modus:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**VS Code-Einstellungen:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Oder verwenden Sie das AgentProxy-Dashboard → **CLI-Tools → KiloCode → Konfiguration anwenden**.

---

#### Continue (VS Code-Erweiterung)

Bearbeiten Sie `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Starten Sie VS Code nach der Bearbeitung neu.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Verwenden Sie dies, wenn VS Code Insiders für benutzerdefinierte Endpunktmodelle konfiguriert ist und Sie möchten, dass AgentProxy ohne ein benutzerdefiniertes Headerfeld funktioniert.

**Empfohlener Speicherort:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Beispiel unter Verwendung des tokenisierten AgentProxy-Alias:**

```json
[
  {
    "vendor": "customendpoint",
    "id": "auto",
    "name": "AgentProxy Auto",
    "family": "gpt-4",
    "version": "1.0.0",
    "url": "http://localhost:20128/api/v1/vscode/sk-your-agentproxy-key/chat/completions",
    "modelsUrl": "http://localhost:20128/api/v1/vscode/sk-your-agentproxy-key/models",
    "requestFormat": "openai-chat-completions",
    "contextWindow": 256000,
    "maxOutputTokens": 32768,
    "auth": {
      "type": "none"
    }
  }
]
```

**Hinweise:**

- Ersetzen Sie `sk-your-agentproxy-key` durch einen in AgentProxy erstellten API-Schlüssel.
- Das `url`-Feld sollte auf `/api/v1/vscode/{token}/chat/completions` zeigen.
- Das `modelsUrl`-Feld sollte auf `/api/v1/vscode/{token}/models` zeigen.
- Bevorzugen Sie den normalen `/v1` + Bearer-Header-Flow, wenn der Client benutzerdefinierte Header unterstützt.
- URL-eingebettete Tokens sind ein Kompatibilitätsfallback und können in Editorprotokollen oder Proxyverläufen erscheinen.

---

#### Kiro CLI (Amazon)

```bash
# Melden Sie sich bei Ihrem AWS/Kiro-Konto an:
kiro-cli login

# Die CLI verwendet ihre eigene Authentifizierung — AgentProxy wird nicht als Backend für die Kiro CLI selbst benötigt.
# Verwenden Sie kiro-cli zusammen mit AgentProxy für andere Tools.
kiro-cli status
```

Für die **Kiro IDE** Desktop-App verwenden Sie den MITM-Endpunkt, der von AgentProxy unter `/dashboard/cli-tools → Kiro` bereitgestellt wird.

## 10. Interne AgentProxy CLI

Die `agentproxy`-Binärdatei bietet Befehle für den Serverlebenszyklus, die Einrichtung, Diagnosen und das Management von Anbietern. Einstiegspunkt: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Server starten (Standardport 20128)
agentproxy setup                        # Interaktiver Einrichtungsassistent
agentproxy doctor                       # Konfiguration, DB, Ports, Laufzeit überprüfen
agentproxy providers list               # Konfigurierte Anbieterverbindungen
agentproxy providers test-all           # Jede aktive Verbindung testen
agentproxy reset-password               # Admin-Passwort zurücksetzen
agentproxy logs                         # Anforderungsprotokolle streamen
agentproxy health                       # Detaillierte Gesundheit (Schalter, Cache, Speicher)
agentproxy --version                    # Version drucken
agentproxy --help                       # Alle Befehle anzeigen
```

### Einrichtung & Initialisierung

```bash
agentproxy setup                        # Interaktiver Einrichtungsassistent
agentproxy setup --non-interactive      # CI/Automatisierungsmodus (liest Umgebungsvariablen + Flags)
agentproxy setup --password '<value>'   # Admin-Passwort direkt festlegen
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # Anbieter hinzufügen und in einem Schritt testen
```

Erkannte Umgebungsvariablen für die nicht-interaktive Einrichtung:

| Var                 | Zweck                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| `AGENTPROXY_API_KEY` | Anbieter-API-Schlüssel (gebunden an `--api-key` über Commander `.env()`) |
| `DATA_DIR`          | Überschreibt das AgentProxy-Datenverzeichnis                              |

Alle anderen nicht-interaktiven Eingaben werden als Flags übergeben, nicht als Umgebungsvariablen:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(siehe die Optionen `agentproxy setup` oben).

### Diagnosen

```bash
agentproxy doctor                       # Konfiguration, DB, Ports, Laufzeit, Speicher, Lebensfähigkeit überprüfen
agentproxy doctor --json                # Maschinenlesbares JSON
agentproxy doctor --no-liveness         # HTTP-Gesundheitsprüfung überspringen
agentproxy doctor --host 0.0.0.0        # Lebensfähigkeits-Host überschreiben
agentproxy doctor --liveness-url <url>  # Vollständige URL-Überschreibung des Gesundheitsendpunkts
```

Der Arzt führt diese Überprüfungen durch: `Konfiguration`, `Datenbank`, `Speicher/Verschlüsselung`,
`Portverfügbarkeit`, `Node-Laufzeit`, `Native Binärdatei` (better-sqlite3),
`Speicher` und `Serverlebensfähigkeit`. Er beendet mit einem Nicht-Null-Wert, wenn eine Überprüfung `fehlt`.

### Anbieterverwaltung

```bash
agentproxy providers available                       # AgentProxy-Anbieterkatalog
agentproxy providers available --search openai       # Katalog nach ID/Name/Alias/Kategorie filtern
agentproxy providers available --category api-key    # Nach Kategorie filtern (api-key, oauth, free, ...)
agentproxy providers available --json                # Maschinenlesbares JSON

agentproxy providers list                            # Konfigurierte Anbieterverbindungen
agentproxy providers list --json

agentproxy providers test <id|name>                  # Eine konfigurierte Verbindung testen
agentproxy providers test-all                        # Jede aktive Verbindung testen
agentproxy providers validate                        # Nur lokal strukturelle Validierung
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # Vorhandener OAuth-Fluss
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` sind API-first und funktionieren daher gegen
den aktiven lokalen oder entfernten Kontext. Die Eingabe von Anmeldeinformationen sollte
`--credential-stdin` oder `--credential-env` verwenden; `--dry-run --json` berichtet nur
über die redigierte Präsenz/Form. `providers available` liest den AgentProxy-Katalog;
`providers list/test/test-all/validate` behalten ihr lokales SQLite-Verhalten bei und
erfordern nicht, dass der Server läuft.

### Wiederherstellung & Zurücksetzen

```bash
agentproxy reset-password                # Admin-Passwort zurücksetzen (auch: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Warnung anzeigen + Trockenlauf für das Zurücksetzen verschlüsselter Anmeldeinformationen
agentproxy reset-encrypted-columns --force  # Tatsächlich verschlüsselte Anmeldeinformationen in SQLite nullen
```

### Anmeldeinformationen exportieren (⚠ vorsichtig behandeln)

```bash
agentproxy auth export                                 # Warnung anzeigen + Bestätigungstür — kein DB-Zugriff
agentproxy auth export --force                          # ALLE Verbindungen DEKRYPTIERTE Anmeldeinformationen als JSON in stdout exportieren
agentproxy auth export --force --id <id>                 # Nur die übereinstimmende Verbindung exportieren
agentproxy auth export --force --format env               # AGENTPROXY_<PROVIDER>_<FIELD>=<value> Zeilen ausgeben
agentproxy auth export --force --out creds.json           # In eine Datei schreiben (mit 0600 Berechtigungen erstellt)
```

`auth export` ist **nur lokal** (direkter SQLite-Lesezugriff, kein HTTP-Routen) und druckt/schreibt absichtlich
**Klartext** `apiKey`/`accessToken`/`refreshToken`/`idToken`-Werte — das ist das Feature, kein
Fehler. Nichts wird aus der Datenbank gelesen und nichts wird entschlüsselt, ohne `--force`. Ein stderr
Warnbanner wird immer vor der Ausgabe von Klartext gedruckt. Erfordert, dass `STORAGE_ENCRYPTION_KEY` gesetzt ist. Ein Feld, das nicht entschlüsselt werden kann (veralteter Schlüssel, beschädigter Chiffretext), wird als
`<field>DecryptFailed: true` gemeldet, anstatt den gesamten Export abzubrechen oder den zugrunde liegenden Fehler zu leaken.

### Andere Unterbefehle

Diese setzen einen laufenden AgentProxy-Server voraus, es sei denn, es wird anders angegeben:

```bash
agentproxy status                       # Umfassender Laufzeitstatus
agentproxy logs                         # Anforderungsprotokolle streamen (--json, --search, --follow)
agentproxy config show                  # Aktuelle Konfiguration anzeigen

agentproxy provider list                # Verfügbare Anbieter auflisten (Alias von providers list)
agentproxy provider add                 # AgentProxy als Anbieter in einem Tool registrieren
agentproxy keys add | list | remove     # API-Schlüssel verwalten
agentproxy models [provider]            # Modelle auflisten (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Snapshot von Konfiguration + DB
agentproxy restore                      # Aus einem vorherigen Snapshot wiederherstellen

agentproxy health                       # Detaillierte Gesundheit (Schalter, Cache, Speicher)
agentproxy quota                        # Anbieterquotenverbrauch
agentproxy cache                        # Cache-Status
agentproxy cache clear                  # Semantische + Signatur-Caches leeren

agentproxy mcp status | restart         # MCP-Serverstatus / Neustart
agentproxy a2a status | card            # A2A-Serverstatus / Agentenkarte

agentproxy tunnel list | create | stop  # Tunnel verwalten (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Umgebungsvariablen inspizieren / setzen (vorübergehend)

agentproxy test                         # Anbieter-Konnektivitätstest
agentproxy update                       # Auf Updates überprüfen
agentproxy completion                   # Shell-Vervollständigung generieren
```

### Häufige Flags

| Flag                | Beschreibung                                                |
| ------------------- | ----------------------------------------------------------- |
| `--no-open`         | Browser beim Start nicht automatisch öffnen                 |
| `--port <n>`        | API-Port überschreiben (Standard 20128)                     |
| `--mcp`             | Als MCP-Server über stdio (für IDEs) ausführen              |
| `--non-interactive` | CI-Modus (keine Eingabeaufforderungen; liest von env/flags) |
| `--json`            | Maschinenlesbare JSON-Ausgabe (doctor, providers usw.)      |
| `--help`, `-h`      | Befehlsspezifische Hilfe anzeigen                           |
| `--version`, `-v`   | Installierte Version drucken                                |

---

## Verfügbare API-Endpunkte

| Endpunkt                   | Beschreibung                   | Verwendung                                |
| -------------------------- | ------------------------------ | ----------------------------------------- |
| `/v1/chat/completions`     | Standard-Chat (alle Anbieter)  | Alle modernen Werkzeuge                   |
| `/v1/responses`            | Responses API (OpenAI-Format)  | Codex, agentische Workflows               |
| `/v1/completions`          | Legacy-Textvervollständigungen | Ältere Werkzeuge, die `prompt:` verwenden |
| `/v1/embeddings`           | Text-Embeddings                | RAG, Suche                                |
| `/v1/images/generations`   | Bildgenerierung                | GPT-Image, Flux usw.                      |
| `/v1/audio/speech`         | Text-zu-Sprache                | ElevenLabs, OpenAI TTS                    |
| `/v1/audio/transcriptions` | Sprache-zu-Text                | Deepgram, AssemblyAI                      |

Bereit zum Einfügen Beispiele mit einer tokenisierten AgentProxy-URL:

```txt
Token-Beispiel: sk-a3ab3c080beaee3a-69f4a4-070d71af

Standard OpenAI-Basis: http://localhost:20128/v1
VS Code-Modelle: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code-Chat: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code-Antworten: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama-Tags: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama-Chat: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Fehlersuche

| Fehler                                            | Ursache                          | Lösung                                                      |
| ------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `Connection refused`                              | AgentProxy läuft nicht            | `agentproxy serve`                                           |
| `401 Unauthorized`                                | Falscher API-Schlüssel           | Überprüfen in `/dashboard/api-manager`                      |
| `No combo configured`                             | Keine aktive Routing-Kombination | Einrichten in `/dashboard/combos`                           |
| CLI zeigt "nicht installiert"                     | Binary nicht im PATH             | Überprüfen mit `which <command>`                            |
| Dashboard zeigt "nicht erkannt" nach Installation | Cache veraltet                   | Klicken Sie auf "⟳ Erkennung aktualisieren" im Dashboard    |
| Alter Link `/dashboard/cli-tools`                 | Lesezeichen vor v3.8.6           | Automatische Weiterleitung zu `/dashboard/cli-code` (308)   |
| Alter Link `/dashboard/agents`                    | Lesezeichen vor v3.8.6           | Automatische Weiterleitung zu `/dashboard/acp-agents` (308) |
