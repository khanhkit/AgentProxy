# CLI-TOOLS (Svenska)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI-verktyg — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI-verktyg — AgentProxy

Senast uppdaterad: 2026-08-18

AgentProxy integreras med tre kategorier av CLI-verktyg spridda över tre dedikerade instrumentpanelssidor:

| Sida            | Rutt                    | Koncept                                                                           | Antal       |
| --------------- | ----------------------- | --------------------------------------------------------------------------------- | ----------- |
| **CLI-kod**     | `/dashboard/cli-code`   | Kodningsverktyg som du pekar på AgentProxy (Klient → CLI → AgentProxy → Leverantör) | 26          |
| **CLI-agenter** | `/dashboard/cli-agents` | Autonoma agenter som du pekar på AgentProxy (samma flöde, bredare omfattning)      | 8           |
| **ACP-agenter** | `/dashboard/acp-agents` | CLIs som AgentProxy skapar som backend via stdio/ACP (omvänt flöde)                | se register |

Äldre rutter omdirigerar via 308: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## Hur det fungerar

```
CLI-kod / CLI-agenter (konsumeringsflöde):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (alla pekar på AgentProxy)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (AgentProxy dirigerar till rätt leverantör)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP-agenter (omvänt skapande flöde):
    Klientförfrågan → AgentProxy → skapar CLI via stdio/ACP → svar
```

**Fördelar:**

- Ett API-nyckel för att hantera alla verktyg
- Kostnadsspårning över alla CLIs i instrumentpanelen
- Modellbyte utan att omkonfigurera varje verktyg
- Fungerar lokalt och på fjärrservrar (VPS, Docker, Akamai, Cloudflare Tunnel)

---

## Auto-konfigurera med `setup-*`

Du behöver inte skriva varje verktögs konfiguration för hand. AgentProxy levererar en `setup-*`
kommando per stödd CLI som läser den **levande** modellkatalogen från en körande
AgentProxy (lokal eller fjärr) och skriver verktygets egen konfiguration på din maskin:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
```

Varje accepterar `--remote <url> --api-key <key>` (konfigurera ett lokalt verktyg mot en
fjärr AgentProxy), `--dry-run` (förhandsgranska utan att skriva), och `--port`. Verktyg
utan automatisk modellupptäckning (Cline, Kilo, Roo, Goose, Aider, Qwen) tar
`--model <id>` (och `--yes` för icke-interaktiva körningar). För att starta en CLI med rätt
miljö injicerad och ingen konfiguration skriven alls, använd den generiska
`agentproxy run <target>` startprogrammet (claude, codex, aider, goose, opencode, qwen,
gemini — mål och alias kommer från `bin/cli/cli-manifest.mjs`); de äldre
per-verktyg startprogrammen `agentproxy launch` (Claude Code) och `agentproxy launch-codex`
(Codex) förblir tillgängliga. Gemini CLI är endast startbar: det är ett `agentproxy run`
mål men har ingen `setup-*`/`configure` recept.

> **Fullständig referens:** huvudtabellen — vad varje kommando skriver, varje flagga,
> lokal vs fjärr, och vilka verktyg som vill ha en `/v1` suffix — finns i
> **[CLI-integrationer](../guides/CLI-INTEGRATIONS.md)**.

### Köra dessa inuti en container

Ett `setup-*` kommando som körs inuti AgentProxy-containern skriver in i
containerens egen hemkatalog, som ingen värd-CLI läser och som försvinner med
containern. AgentProxy upptäcker det och avslutar med `2` med instruktioner istället för
att skriva. Två stödda sätt framåt — installera CLI på värden och
`agentproxy connect` till containern, eller bind-mount konfigurationsmapparna och ställ in
`CLI_CONFIG_HOME` (den komponerade `host` profilen). Varje `setup-*` kommando, plus
`agentproxy configure` och `agentproxy config set`, accepterar
`--allow-container-write` när konfiguration av containerens egna CLIs är vad du
faktiskt menade; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` gör samma sak för
servern. Se
[Docker Guide → Konfigurera värd-CLI-verktyg](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

Instrumentpanelens **apply endpoint** (`POST /api/cli-tools/apply`) upprätthåller samma skydd: i en container, en skrivning vars mål inte är bind-mountad från
värden svarar **`422`** med `containerEphemeralTarget: true`, den säkra feltexten och — för verktygen med ett värdrecept (claude, codex, opencode, cline,
kilo, continue) — en `hostSetupCommand` (t.ex. `agentproxy setup-opencode`) att köra
på värden istället; inget skrivs. `dryRun: true` fortsätter att fungera i container
läge och returnerar det genererade innehållet + målnamn utan att röra disken, så
du kan förhandsgranska från instrumentpanelen och tillämpa på värden. Detta beteende är
avsiktligt och regressionsskyddat av
`tests/unit/api/cli-tools/apply-container-guard.test.ts` — "fixa" aldrig en 422
genom att ta bort skyddet.

---

## Källa till Sanning

Den enhetliga katalogen finns i `src/shared/constants/cliTools.ts` som `CLI_TOOLS: Record<string, CliCatalogEntry>`.

Varje post har dessa fält (definierade i `src/shared/schemas/cliCatalog.ts`):

| Fält                                            | Typ                                                          | Beskrivning                                            |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `category`                                      | `"code" \| "agent"`                                          | Vilken sida verktyget visas på                         |
| `vendor`                                        | `string`                                                     | Verktygets ursprung ("Anthropic", "OSS (P. Gauthier)") |
| `acpSpawnable`                                  | `boolean`                                                    | Kan också användas som en ACP-agent (badge visas)      |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | Anpassad slutpunkt stöd nivå. `"none"` = MITM backlog  |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Konfigurationsmekanism                                 |
| `id`, `name`, `color`, `description`, `docsUrl` | standard                                                     | Kärnvisningsfält                                       |

Poster med `baseUrlSupport: "none"` visas **inte** på instrumentpanelens sidor — de registreras i MITM-backloggen för plan 11 (se `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Kapabilitetsskikt (katalogiserade × detekterbara × konfigurerbara × lanserbara)

Inte varje katalogiserat verktyg är detekterbart, konfigurerbart eller lanserbart. Varje skikt har en
deklarerande källa, och ett driftstest håller dem synkroniserade:

| Skikt             | Betydelse                                                                               | Deklarerat i                                                      |
| ----------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Katalogiserad** | Visas i instrumentpanelens katalog (namn, leverantör, dokumentation, konfigurationstyp) | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                  |
| **Detekterbar**   | Binär-/konfigurationsdetektion, hälsokontroller, konfigurationsvägar                    | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` runtime katalog) |
| **Konfigurerbar** | Stöds av `agentproxy configure <cli>` (installationsrecept finns)                        | `bin/cli/cli-manifest.mjs` (`configure: true`)                    |
| **Lanserbar**     | Stöds av `agentproxy run <target>` (miljö/argumentinjektion definierad)                  | `bin/cli/cli-manifest.mjs` (`run: true`)                          |

`bin/cli/cli-manifest.mjs` är den kanoniska körbara manifesten för CLI-kommandon
ytor: `run`, `configure` och shell-kompletteringsgeneratorer härleder alla sina
målister, aliasupplösning (till exempel `kilocode`/`kilo-code`/`kilo_cli` → `kilo`)
och `--model` flaggkopplingar från den. Driftvakten
`tests/unit/cli/cli-manifest-drift.test.ts` säkerställer att manifestet, runtime
katalogen, UI-katalogen och varje konsumentyta förblir synkroniserade — ett mål som läggs till
en yta utan de andra misslyckas med sviten istället för att driva tyst.

## 1. CLI Kodens Katalog (26 verktyg)

Alla verktyg som visas i `/dashboard/cli-code`. De med `baseUrlSupport: none` är kopplade genom MITM eller en manuell guide istället för en anpassad bas-URL:

| id           | namn                    | leverantör          | baseUrlSupport | configType     | acpSpawnable |
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
| custom       | Anpassad CLI            | —                   | full           | custom-builder | false        |

Verktyg med `baseUrlSupport: "partial"` visar en badge "⚠ Bas-URL partiell" i dashboard-kortet.

## 2. CLI Agenter Katalog (8 verktyg)

Autonoma agenter som visas i `/dashboard/cli-agents`:

| id           | namn             | leverantör               | baseUrlSupport | acpSpawnable |
| ------------ | ---------------- | ------------------------ | -------------- | ------------ |
| hermes-agent | Hermes Agent     | Nous Research            | full           | false        |
| openclaw     | OpenClaw         | OSS (P. Steinberger)     | full           | true         |
| goose        | Goose            | Block / Linux Foundation | full           | true         |
| interpreter  | Open Interpreter | OSS                      | full           | true         |
| warp         | Warp AI          | Warp Inc.                | partial        | true         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)      | full           | false        |
| omp          | Oh My Pi         | OSS                      | full           | true         |
| letta        | Letta CLI        | Letta                    | full           | false        |

---

## 3. ACP Agenter (/dashboard/acp-agents)

Denna sida (omdöpt från `/dashboard/agents`) visar CLIs som AgentProxy kan **skapa** som backend-exekveringsmotorer via stdio/ACP-protokollet. Katalogen underhålls separat i `src/lib/acp/registry.ts` och är **inte** densamma som `CLI_TOOLS`.

---

## 4. MITM Backlog (inte visad i dashboard)

Följande CLIs stöder inte anpassad bas-URL nativt och är **inte listade** i CLI Code's eller CLI Agents sidor. De är kandidater för MITM-avlyssning i plan 11:

| CLI                 | Orsak                                                            |
| ------------------- | ---------------------------------------------------------------- |
| windsurf            | BYOK begränsat till utvalda Claude-modeller + företags-URL/token |
| amp                 | Stängt ekosystem (Sourcegraph)                                   |
| amazon-q / kiro-cli | AWS SSO autentisering, ingen anpassad URL                        |
| cowork              | Anthropic Desktop, ingen konfigurerbar slutpunkt                 |

Se `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` för den fullständiga korsreferensen.

---

## 5. Batch Detektering API

All verktygsdetektering aggregeras via en enda slutpunkt:

**`GET /api/cli-tools/all-statuses`**

- Auth: `requireCliToolsAuth(request)` (samma som andra `/api/cli-tools/` rutter)
- Återvänder: `Record<toolId, ToolBatchStatus>` (typ: `src/shared/types/cliBatchStatus.ts`)
- Strategi: `Promise.all` över alla verktyg, 5s timeout per verktyg
- Cache: i-minnet LRU indexerat av konfigurationsfil `mtime`. Cache ogiltigförklaras när mtime ändras. Återställs vid serveromstart.

Svarform per verktyg:

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
  error?: string; // sanerat, inga stacktraces
}
```

## 6. Inställningshanterare för Nya Verktyg

Nya verktyg med `configType: "custom"` har dedikerade inställnings-API-rutter:

| Rutt                                        | Verktyg                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                         |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url flag)                                         |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, legacy)                          |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, primär + legacy `~/.deepseek` synk) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                           |
| `POST /api/cli-tools/pi-settings`           | Pi kodningsagent                                                |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)           |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + dedikerad `.env` nyckel)   |

Alla rutter använder `sanitizeErrorMessage()` för felmeddelanden (Hård Regel #12).

---

## 7. Dashboard-sidornas Arkitektur

### CLI Kod (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — serverkomponent
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — klientgrid
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — verktygsdetaljsida
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 specialiserade verktygskort + `ToolDetailClient.tsx`

### CLI Agenter (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — serverkomponent
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — klientgrid
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — återanvänder `ToolDetailClient`

### ACP Agenter (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — serverkomponent (flyttad från `agents/`)

### Delade UI-komponenter (`src/shared/components/cli/`)

| Fil                     | Syfte                                                    |
| ----------------------- | -------------------------------------------------------- |
| `CliToolCard.tsx`       | Smart statuskort (detektion + konfiguration + slutpunkt) |
| `CliConceptCard.tsx`    | För-sida konceptförklaringskort                          |
| `CliComparisonCard.tsx` | Trefaldig jämförelse över CLI-typer                      |
| `BaseUrlSelect.tsx`     | Slutpunkt nedrullningsmeny (Lokal/Moln/Egen)             |
| `ApiKeySelect.tsx`      | API-nyckelväljare                                        |
| `ManualConfigModal.tsx` | Kopierbar konfigurationssnutt modal                      |

### Delad Hook (`src/shared/hooks/cli/`)

| Fil                       | Syfte                                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | Hämtar `/api/cli-tools/all-statuses`, hanterar laddnings-/uppdateringsstatus |

## 8. i18n

Nya namnrymder tillagda i plan 14 F9:

| Namnrymd    | Syfte                                                                                |
| ----------- | ------------------------------------------------------------------------------------ |
| `cliCommon` | Delade strängar (kortetiketter, koncept/jämförelsetexter, etiketter för detaljsidor) |
| `cliCode`   | Strängar för CLI-kodens sidor                                                        |
| `cliAgents` | Strängar för CLI-agenter sidor                                                       |
| `acpAgents` | Strängar för ACP-agenter sidor                                                       |

Fullständiga översättningar på PT-BR och EN tillhandahålls. 39 andra språk faller automatiskt tillbaka till EN via namnrymsnivåsammanfogning i `src/i18n/request.ts`.

---

## 9. Snabbstart

### Steg 1 — Skaffa en AgentProxy API-nyckel

1. Öppna `/dashboard/api-manager` → **Skapa API-nyckel**
2. Ge den ett namn (t.ex. `cli-tools`) och välj alla behörigheter
3. Kopiera nyckeln — du kommer att behöva den för varje CLI nedan

> Din nyckel ser ut som: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### Steg 2 — Installera CLI-verktyg

Alla npm-baserade verktyg kräver Node.js 22.22.2+ eller 24.x:

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

# Google Gemini CLI (kan startas via `agentproxy run gemini` → /v1beta surface)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Rust-baserad

# Pi coding agent
# se https://github.com/zechnerj/pi-coding-agent för installation

# jcode
# se https://github.com/1jehuang/jcode för installation
```

---

### Steg 3 — Konfigurera via Dashboard

1. Gå till `http://localhost:20128/dashboard/cli-code`
2. Hitta ditt verktyg i rutnätet
3. Klicka på kortet för att öppna verktygets detaljsida
4. Välj din API-nyckel och bas-URL
5. Klicka på **Tillämpa konfiguration** eller kopiera den manuella konfigurationssnutten

---

### Steg 4 — Ställ in globala miljövariabler

```bash
# AgentProxy Universal Endpoint
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI läser GOOGLE_GEMINI_BASE_URL vid ROOT (dess SDK lägger till /v1beta/... själv)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> För en **fjärrserver** ersätt `localhost:20128` med serverns IP eller domän,
> t.ex. `http://<your-server-ip>:20128`.

---

### Steg 4 — Konfigurera varje verktyg

#### Claude Code

```bash
# Skapa ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Använd den enhetliga Anthropic gateway-rooten för Claude Code. Lägg inte till `/v1` här.

**Test:** `claude "say hello"`

---

#### OpenAI Codex

Modern Codex (v0.137+) läser endast `~/.codex/config.toml` — den gamla
`config.yaml` tillhör den äldre npm CLI och ignoreras tyst. API-nyckeln
förblir i miljövariabeln `AGENTPROXY_API_KEY` (`env_key`), aldrig
inuti filen:

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

Fullständig referens (profiler, `wire_api`, kontextfönster): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

**Test:** `codex "what is 2+2?"`

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

> Använd `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> för att skicka tänkande varianter.

---

#### Cline (CLI eller VS Code)

**CLI-läge:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code-läge:**
Cline-tilläggsinställningar → API-leverantör: `OpenAI Compatible` → Bas-URL: `http://localhost:20128/v1`

Eller använd AgentProxy-dashboarden → **CLI-verktyg → Cline → Tillämpa konfiguration**.

---

#### KiloCode (CLI eller VS Code)

**CLI-läge:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**VS Code-inställningar:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Eller använd AgentProxy-dashboarden → **CLI-verktyg → KiloCode → Tillämpa konfiguration**.

---

#### Continue (VS Code-tillägg)

Redigera `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Starta om VS Code efter redigering.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Använd detta när VS Code Insiders är konfigurerat för anpassade slutpunktsmodeller och du vill att AgentProxy ska fungera utan ett anpassat headerfält.

**Rekommenderad plats:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Exempel med den tokeniserade AgentProxy-aliasen:**

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

**Noter:**

- Ersätt `sk-your-agentproxy-key` med en API-nyckel skapad i AgentProxy.
- Fältet `url` bör peka på `/api/v1/vscode/{token}/chat/completions`.
- Fältet `modelsUrl` bör peka på `/api/v1/vscode/{token}/models`.
- Föredra den normala `/v1` + Bearer-headerflödet när klienten stöder anpassade headers.
- URL-inbäddade tokens är en kompatibilitetsåterställning och kan dyka upp i redigerarens loggar eller proxyhistorik.

---

#### Kiro CLI (Amazon)

```bash
# Logga in på ditt AWS/Kiro-konto:
kiro-cli login

# CLI använder sin egen autentisering — AgentProxy behövs inte som backend för Kiro CLI själv.
# Använd kiro-cli tillsammans med AgentProxy för andra verktyg.
kiro-cli status
```

För **Kiro IDE** skrivbordsapp, använd MITM-slutpunkten som exponeras av AgentProxy
under `/dashboard/cli-tools → Kiro`.

---

## 10. Intern AgentProxy CLI

Den `agentproxy` binären tillhandahåller kommandon för serverlivscykel, installation, diagnostik och leverantörshantering. Ingångspunkt: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Starta server (standardport 20128)
agentproxy setup                        # Interaktiv installationsguide
agentproxy doctor                       # Kontrollera konfiguration, DB, portar, körning
agentproxy providers list               # Konfigurerade leverantörsanslutningar
agentproxy providers test-all           # Testa varje aktiv anslutning
agentproxy reset-password               # Återställ administratörslösenord
agentproxy logs                         # Strömma begärningsloggar
agentproxy health                       # Detaljerad hälsa (brytare, cache, minne)
agentproxy --version                    # Skriv ut version
agentproxy --help                       # Visa alla kommandon
```

### Installation & Initiering

```bash
agentproxy setup                        # Interaktiv installationsguide
agentproxy setup --non-interactive      # CI/automationsläge (läser miljövariabler + flaggor)
agentproxy setup --password '<value>'   # Ställ in administratörslösenord direkt
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # Lägg till och testa en leverantör i ett steg
```

Kända miljövariabler för icke-interaktiv installation:

| Var                 | Syfte                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | Leverantörens API-nyckel (kopplad till `--api-key` via Commander `.env()`) |
| `DATA_DIR`          | Åsidosätt AgentProxy datakatalog                                            |

Alla andra icke-interaktiva inmatningar skickas som flaggor, inte miljövariabler:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(se `agentproxy setup` alternativ ovan).

### Diagnostik

```bash
agentproxy doctor                       # Kontrollera konfiguration, DB, portar, körning, minne, livaktighet
agentproxy doctor --json                # Maskinläsbar JSON
agentproxy doctor --no-liveness         # Hoppa över HTTP hälsokontroll
agentproxy doctor --host 0.0.0.0        # Åsidosätt livaktighet värd
agentproxy doctor --liveness-url <url>  # Full hälsopunkt URL åsidosättning
```

Doktorn kör dessa kontroller: `Konfiguration`, `Databas`, `Lagring/kryptering`,
`Porttillgänglighet`, `Nodkörning`, `Inbyggd binär` (better-sqlite3),
`Minne`, och `Serverlivaktighet`. Den avslutas med ett icke-nollvärde om någon kontroll är `misslyckad`.

### Leverantörshantering

```bash
agentproxy providers available                       # AgentProxy leverantörskatalog
agentproxy providers available --search openai       # Filtrera katalog efter id/namn/alias/kategori
agentproxy providers available --category api-key    # Filtrera efter kategori (api-key, oauth, gratis, ...)
agentproxy providers available --json                # Maskinläsbar JSON

agentproxy providers list                            # Konfigurerade leverantörsanslutningar
agentproxy providers list --json

agentproxy providers test <id|name>                  # Testa en konfigurerad anslutning
agentproxy providers test-all                        # Testa varje aktiv anslutning
agentproxy providers validate                        # Lokalt strukturell validering
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # Befintlig OAuth-flöde
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` är API-först och fungerar därför mot
den aktiva lokala eller fjärrkontexten. Inmatning av autentiseringsuppgifter bör använda
`--credential-stdin` eller `--credential-env`; `--dry-run --json` rapporterar endast
redigerad närvaro/form. `providers available` läser AgentProxy-katalogen;
`providers list/test/test-all/validate` behåller sitt lokala SQLite-beteende och
kräver inte att servern körs.

### Återställning & Nollställning

```bash
agentproxy reset-password                # Återställ administratörslösenord (även: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Visa varning + torrkörning för återställning av krypterade autentiseringsuppgifter
agentproxy reset-encrypted-columns --force  # Faktiskt nollställ krypterade autentiseringsuppgifter i SQLite
```

### Export av autentiseringsuppgifter (⚠ hantera med försiktighet)

```bash
agentproxy auth export                                 # Visa varning + bekräftelseport — ingen DB-åtkomst
agentproxy auth export --force                          # Exportera ALLA anslutningars DEKRYPTERADE autentiseringsuppgifter till stdout som JSON
agentproxy auth export --force --id <id>                 # Exportera endast den matchande anslutningen
agentproxy auth export --force --format env               # Utmatta AGENTPROXY_<PROVIDER>_<FIELD>=<value> rader
agentproxy auth export --force --out creds.json           # Skriv till en fil (skapad med 0600 behörigheter)
```

`auth export` är **lokal-endast** (direkt SQLite-läsning, ingen HTTP-rutt) och avsiktligt skriver/utskriver
**klartext** `apiKey`/`accessToken`/`refreshToken`/`idToken` värden — det är funktionen, inte en
bugg. Inget läses från databasen, och inget dekrypteras, utan `--force`. En stderr
varningsbanner skrivs alltid ut innan någon klartext skickas. Kräver att `STORAGE_ENCRYPTION_KEY` är
inställd. Ett fält som misslyckas med att dekryptera (gammal nyckel, korrupt ciphertext) rapporteras som
`<field>DecryptFailed: true` istället för att avbryta hela exporten eller läcka det underliggande felet.

### Andra underkommandon

Dessa förutsätter en körande AgentProxy-server, om inte annat anges:

```bash
agentproxy status                       # Omfattande körstatus
agentproxy logs                         # Strömma begärningsloggar (--json, --search, --follow)
agentproxy config show                  # Visa aktuell konfiguration

agentproxy provider list                # Lista tillgängliga leverantörer (alias av providers list)
agentproxy provider add                 # Registrera AgentProxy som en leverantör på ett verktyg
agentproxy keys add | list | remove     # Hantera API-nycklar
agentproxy models [provider]            # Lista modeller (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Snapshot konfiguration + DB
agentproxy restore                      # Återställ från en tidigare snapshot

agentproxy health                       # Detaljerad hälsa (brytare, cache, minne)
agentproxy quota                        # Leverantörens kvotförbrukning
agentproxy cache                        # Cache-status
agentproxy cache clear                  # Rensa semantiska + signaturcacher

agentproxy mcp status | restart         # MCP-serverstatus / omstart
agentproxy a2a status | card            # A2A-serverstatus / agentkort

agentproxy tunnel list | create | stop  # Hantera tunnlar (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Inspektera / ställ in miljövariabler (temporära)

agentproxy test                         # Leverantörens anslutningstest
agentproxy update                       # Kontrollera efter uppdateringar
agentproxy completion                   # Generera shell-komplettering
```

### Vanliga flaggor

| Flag                | Beskrivning                                          |
| ------------------- | ---------------------------------------------------- |
| `--no-open`         | Öppna inte automatiskt webbläsaren vid start         |
| `--port <n>`        | Åsidosätt API-porten (standard 20128)                |
| `--mcp`             | Kör som MCP-server över stdio (för IDE:er)           |
| `--non-interactive` | CI-läge (inga uppmaningar; läser från miljö/flaggar) |
| `--json`            | Maskinläsbar JSON-utdata (doctor, providers, etc.)   |
| `--help`, `-h`      | Visa kommando-specifik hjälp                         |
| `--version`, `-v`   | Skriv ut den installerade versionen                  |

---

## Tillgängliga API-slutpunkter

| Slutpunkt                  | Beskrivning                       | Används för                          |
| -------------------------- | --------------------------------- | ------------------------------------ |
| `/v1/chat/completions`     | Standardchatt (alla leverantörer) | Alla moderna verktyg                 |
| `/v1/responses`            | Svar API (OpenAI-format)          | Codex, agentiska arbetsflöden        |
| `/v1/completions`          | Legacy textkompletteringar        | Äldre verktyg som använder `prompt:` |
| `/v1/embeddings`           | Textinbäddningar                  | RAG, sökning                         |
| `/v1/images/generations`   | Bildgenerering                    | GPT-Image, Flux, etc.                |
| `/v1/audio/speech`         | Text-till-tal                     | ElevenLabs, OpenAI TTS               |
| `/v1/audio/transcriptions` | Tal-till-text                     | Deepgram, AssemblyAI                 |

Redo att klistra in exempel med en tokeniserad AgentProxy-URL:

```txt
Token exempel: sk-a3ab3c080beaee3a-69f4a4-070d71af

Standard OpenAI bas: http://localhost:20128/v1
VS Code-modeller: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code chatt: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code svar: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama-taggar: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama chatt: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Felsökning

| Fel                                               | Orsak                          | Lösning                                                |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `Connection refused`                              | AgentProxy körs inte            | `agentproxy serve`                                      |
| `401 Unauthorized`                                | Fel API-nyckel                 | Kontrollera i `/dashboard/api-manager`                 |
| `No combo configured`                             | Ingen aktiv routingkombination | Ställ in i `/dashboard/combos`                         |
| CLI visar "not installed"                         | Binärfil inte i PATH           | Kontrollera `which <command>`                          |
| Dashboard visar "not detected" efter installation | Cache föråldrad                | Klicka på "⟳ Uppdatera upptäckten" i instrumentpanelen |
| Gammal länk `/dashboard/cli-tools`                | Bokmärke före v3.8.6           | Auto-omdirigerad till `/dashboard/cli-code` (308)      |
| Gammal länk `/dashboard/agents`                   | Bokmärke före v3.8.6           | Auto-omdirigerad till `/dashboard/acp-agents` (308)    |
