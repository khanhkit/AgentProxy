# CLI-TOOLS (Norsk)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI-verktøy — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI-verktøy — AgentProxy

Sist oppdatert: 2026-08-18

AgentProxy integreres med tre kategorier av CLI-verktøy fordelt på tre dedikerte dashbord-sider:

| Side            | Rute                    | Konsept                                                                     | Antall      |
| --------------- | ----------------------- | --------------------------------------------------------------------------- | ----------- |
| **CLI-kode**    | `/dashboard/cli-code`   | Kodingverktøy du peker på AgentProxy (Klient → CLI → AgentProxy → Leverandør) | 26          |
| **CLI-agenter** | `/dashboard/cli-agents` | Autonome agenter du peker på AgentProxy (samme flyt, bredere omfang)         | 8           |
| **ACP-agenter** | `/dashboard/acp-agents` | CLIs som AgentProxy genererer som backend via stdio/ACP (omvendt flyt)       | se register |

Legacy-ruter omdirigerer via 308: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## Hvordan det fungerer

```
CLI-kode / CLI-agenter (forbruksflyt):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (alle peker på AgentProxy)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (AgentProxy ruter til riktig leverandør)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP-agenter (omvendt genereringsflyt):
    Klientforespørsel → AgentProxy → genererer CLI via stdio/ACP → respons
```

**Fordeler:**

- Ett API-nøkkel for å administrere alle verktøy
- Kostnadssporing på tvers av alle CLIs i dashbordet
- Modellbytte uten å omkonfigurere hvert verktøy
- Fungerer lokalt og på eksterne servere (VPS, Docker, Akamai, Cloudflare Tunnel)

---

## Auto-konfigurer med `setup-*`

Du trenger ikke å skrive hver verktøys konfigurasjon for hånd. AgentProxy leverer en `setup-*`
kommando per støttet CLI som leser den **live** modellkatalogen fra en kjørende
AgentProxy (lokal eller ekstern) og skriver verktøyets egen konfigurasjon på maskinen din:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
```

Hver aksepterer `--remote <url> --api-key <key>` (konfigurer et lokalt verktøy mot en
ekstern AgentProxy), `--dry-run` (forhåndsvisning uten skriving), og `--port`. Verktøy
uten modell auto-oppsporing (Cline, Kilo, Roo, Goose, Aider, Qwen) tar
`--model <id>` (og `--yes` for ikke-interaktive kjøringer). For å starte en CLI med
riktig miljø injisert og ingen konfigurasjon skrevet i det hele tatt, bruk den generiske
`agentproxy run <target>` launcher (claude, codex, aider, goose, opencode, qwen,
gemini — mål og aliaser kommer fra `bin/cli/cli-manifest.mjs`); de legacy
per-verktøy launcherne `agentproxy launch` (Claude Code) og `agentproxy launch-codex`
(Codex) forblir tilgjengelige. Gemini CLI er kun for oppstart: det er et `agentproxy run`
mål, men har ingen `setup-*`/`configure` oppskrift.

> **Full referanse:** hovedtabellen — hva hver kommando skriver, hver flagg,
> lokal vs ekstern, og hvilke verktøy som ønsker en `/v1` suffiks — finnes i
> **[CLI-integrasjoner](../guides/CLI-INTEGRATIONS.md)**.

### Kjøring av disse inne i en container

En `setup-*` kommando utført inne i AgentProxy-containeren skriver inn i
containerens egen hjem, som ingen vert-CLI leser og som forsvinner med
containeren. AgentProxy oppdager dette og avslutter med `2` med instruksjoner i stedet for
å skrive. To støttede måter videre — installer CLI på verten og
`agentproxy connect` til containeren, eller bind-mount konfigurasjonskatalogene og sett
`CLI_CONFIG_HOME` (compose `host` profil). Hver `setup-*` kommando, pluss
`agentproxy configure` og `agentproxy config set`, aksepterer
`--allow-container-write` når konfigurasjon av containerens egne CLIs er det du
faktisk mente; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` gjør det samme for
serveren. Se
[Docker Guide → Konfigurere vert-CLI-verktøy](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

Dashbordets **apply-endepunkt** (`POST /api/cli-tools/apply`) håndhever den
samme beskyttelsen: i en container, en skriving hvis mål ikke er bind-mountet fra
vertsystemet svarer **`422`** med `containerEphemeralTarget: true`, den trygge feilmeldingen
og — for verktøyene med en vert-oppskrift (claude, codex, opencode, cline,
kilo, continue) — en `hostSetupCommand` (f.eks. `agentproxy setup-opencode`) som skal kjøres
på verten i stedet; ingenting skrives. `dryRun: true` fortsetter å fungere i container
modus og returnerer det genererte innholdet + målsti uten å berøre disken, så
du kan forhåndsvise fra dashbordet og bruke på verten. Denne oppførselen er
intensjonell og regresjonsbeskyttet av
`tests/unit/api/cli-tools/apply-container-guard.test.ts` — aldri "fikse" en 422
ved å fjerne beskyttelsen.

---

## Kilde til sannhet

Den enhetlige katalogen finnes i `src/shared/constants/cliTools.ts` som `CLI_TOOLS: Record<string, CliCatalogEntry>`.

Hver oppføring har disse feltene (definert i `src/shared/schemas/cliCatalog.ts`):

| Felt                                            | Type                                                         | Beskrivelse                                               |
| ----------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `category`                                      | `"code" \| "agent"`                                          | Hvilken side verktøyet vises på                           |
| `vendor`                                        | `string`                                                     | Verktøyets opprinnelse ("Anthropic", "OSS (P. Gauthier)") |
| `acpSpawnable`                                  | `boolean`                                                    | Også brukbar som en ACP Agent (merke vist)                |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | Tilpasset endepunkt støtte nivå. `"none"` = MITM backlog  |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Konfigurasjonsmekanisme                                   |
| `id`, `name`, `color`, `description`, `docsUrl` | standard                                                     | Kjerne visningsfelt                                       |

Oppføringer med `baseUrlSupport: "none"` vises **ikke** på dashbordsidene — de er registrert i MITM backlog for plan 11 (se `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Kapabilitetsnivåer (katalogisert × oppdagbar × konfigurerbar × lanserbar)

Ikke hvert katalogisert verktøy er oppdagbart, konfigurerbart eller lanserbart. Hvert nivå har en
deklarerende kilde, og en driftstest holder dem synkronisert:

| Nivå              | Betydning                                                                       | Deklarert i                                                       |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Katalogisert**  | Visas i dashbordkatalogen (navn, leverandør, dokumentasjon, konfigurasjonstype) | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                  |
| **Oppdagbar**     | Binær-/konfigurasjonsdeteksjon, helsesjekker, konfigurasjonsstier               | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` runtime katalog) |
| **Konfigurerbar** | Støttet av `agentproxy configure <cli>` (oppskriftsoppsett eksisterer)           | `bin/cli/cli-manifest.mjs` (`configure: true`)                    |
| **Lanserbar**     | Støttet av `agentproxy run <target>` (miljø/argumentinjeksjon definert)          | `bin/cli/cli-manifest.mjs` (`run: true`)                          |

`bin/cli/cli-manifest.mjs` er det kanoniske kjørbare manifestet for CLI-kommandoene
overflater: `run`, `configure` og shell-fullføringsgeneratorene henter alle sine
mål lister, aliasoppløsning (for eksempel `kilocode`/`kilo-code`/`kilo_cli` → `kilo`)
og `--model` flagg kabling fra det. Driftbeskyttelsen
`tests/unit/cli/cli-manifest-drift.test.ts` bekrefter at manifestet, runtime
katalogen, UI-katalogen og hver forbrukeroverflate forblir synkronisert — et mål lagt til
én overflate uten de andre feiler testen i stedet for å drive stille.

## 1. Katalog over CLI-kode (26 verktøy)

Alle verktøy som vises i `/dashboard/cli-code`. De med `baseUrlSupport: none` er koblet gjennom MITM eller en manuell guide i stedet for en tilpasset base-URL:

| id           | navn                    | leverandør          | baseUrlSupport | configType     | acpSpawnable |
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

Verktøy med `baseUrlSupport: "partial"` viser et merke "⚠ Base URL parcial" i dashboard-kortet.

## 2. CLI Agenter Katalog (8 verktøy)

Autonome agenter som vises i `/dashboard/cli-agents`:

| id           | navn             | leverandør               | baseUrlSupport | acpSpawnable |
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

Denne siden (omdøpt fra `/dashboard/agents`) viser CLI-er som AgentProxy kan **spawne** som backend utførelsesmotorer via stdio/ACP-protokollen. Katalogen vedlikeholdes separat i `src/lib/acp/registry.ts` og er **ikke** den samme som `CLI_TOOLS`.

---

## 4. MITM Backlog (ikke vist i dashbordet)

Følgende CLI-er støtter ikke tilpasset base-URL nativt og er **ikke oppført** på CLI-kode- eller CLI-agenter-sidene. De er kandidater for MITM-intervensjon i plan 11:

| CLI                 | Årsak                                                            |
| ------------------- | ---------------------------------------------------------------- |
| windsurf            | BYOK begrenset til utvalgte Claude-modeller + bedrifts-URL/token |
| amp                 | Lukket økosystem (Sourcegraph)                                   |
| amazon-q / kiro-cli | AWS SSO autentisering, ingen tilpasset URL                       |
| cowork              | Anthropic Desktop, ingen konfigurerbar endepunkt                 |

Se `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` for full kryssreferanse.

---

## 5. Batch Deteksjon API

All verktøydeteksjon er aggregert via et enkelt endepunkt:

**`GET /api/cli-tools/all-statuses`**

- Auth: `requireCliToolsAuth(request)` (samme som andre `/api/cli-tools/` ruter)
- Returnerer: `Record<toolId, ToolBatchStatus>` (type: `src/shared/types/cliBatchStatus.ts`)
- Strategi: `Promise.all` over alle verktøy, 5s tidsavbrudd per verktøy
- Cache: i minnet LRU indeksert av konfigurasjonsfil `mtime`. Cache ugyldiggjøres når mtime endres. Tilbakestilles ved serveromstart.

Responsform per verktøy:

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
  error?: string; // sanitert, ingen stakkspor
}
```

## 6. Innstillinger for nye verktøy

Nye verktøy med `configType: "custom"` har dedikerte innstillings-API-ruter:

| Rute                                        | Verktøy                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                         |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url flag)                                         |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, legacy)                          |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, primær + legacy `~/.deepseek` synk) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                           |
| `POST /api/cli-tools/pi-settings`           | Pi coding agent                                                 |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)           |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + dedikert `.env` nøkkel)    |

Alle ruter bruker `sanitizeErrorMessage()` for feilmeldinger (Hard Rule #12).

---

## 7. Arkitektur for dashbord-sider

### CLI-kode (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — serverkomponent
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — klientgrid
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — verktøydetaljside
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 spesialiserte verktøykort + `ToolDetailClient.tsx`

### CLI-agenter (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — serverkomponent
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — klientgrid
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — gjenbruker `ToolDetailClient`

### ACP-agenter (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — serverkomponent (flyttet fra `agents/`)

### Delte UI-komponenter (`src/shared/components/cli/`)

| Fil                     | Formål                                             |
| ----------------------- | -------------------------------------------------- |
| `CliToolCard.tsx`       | Smart statuskort (deteksjon + konfig + endepunkt)  |
| `CliConceptCard.tsx`    | Forklaringskort for konsept per side               |
| `CliComparisonCard.tsx` | Sammenligning i tre kolonner på tvers av CLI-typer |
| `BaseUrlSelect.tsx`     | Endepunkt nedtrekksmeny (Lokal/Cloud/Custom)       |
| `ApiKeySelect.tsx`      | API-nøkkelvelger                                   |
| `ManualConfigModal.tsx` | Kopierbar konfigurasjonsutdrag modal               |

### Delt Hook (`src/shared/hooks/cli/`)

| Fil                       | Formål                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | Henter `/api/cli-tools/all-statuses`, håndterer lasting/oppdateringstilstand |

## 8. i18n

Nye navnerom lagt til i plan 14 F9:

| Navnerom    | Formål                                                                             |
| ----------- | ---------------------------------------------------------------------------------- |
| `cliCommon` | Delte strenger (kortetiketter, konsept/sammenligningstekster, detaljsideetiketter) |
| `cliCode`   | Strenger for CLI-kode siden                                                        |
| `cliAgents` | Strenger for CLI-agenter siden                                                     |
| `acpAgents` | Strenger for ACP-agenter siden                                                     |

Full PT-BR og EN oversettelser er tilgjengelige. 39 andre lokaliteter faller automatisk tilbake til EN via navneromsnivå sammenslåing i `src/i18n/request.ts`.

---

## 9. Hurtigstart

### Trinn 1 — Få en AgentProxy API-nøkkel

1. Åpne `/dashboard/api-manager` → **Opprett API-nøkkel**
2. Gi den et navn (f.eks. `cli-tools`) og velg alle tillatelser
3. Kopier nøkkelen — du trenger den for hver CLI nedenfor

> Nøkkelen din ser slik ut: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### Trinn 2 — Installer CLI-verktøy

Alle npm-baserte verktøy krever Node.js 22.22.2+ eller 24.x:

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

# Google Gemini CLI (kan startes via `agentproxy run gemini` → /v1beta surface)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Rust-basert

# Pi coding agent
# se https://github.com/zechnerj/pi-coding-agent for installasjon

# jcode
# se https://github.com/1jehuang/jcode for installasjon
```

---

### Trinn 3 — Konfigurer via Dashboard

1. Gå til `http://localhost:20128/dashboard/cli-code`
2. Finn verktøyet ditt i rutenettet
3. Klikk på kortet for å åpne verktøyets detaljside
4. Velg API-nøkkelen din og basis-URL
5. Klikk **Bruk konfigurasjon** eller kopier den manuelle konfigurasjonsbiten

---

### Trinn 4 — Sett globale miljøvariabler

```bash
# AgentProxy Universal Endpoint
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI leser GOOGLE_GEMINI_BASE_URL på ROT (SDK-en legger selv til /v1beta/...)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> For en **fjerntjener** erstatt `localhost:20128` med serverens IP eller domene,
> f.eks. `http://<your-server-ip>:20128`.

---

### Trinn 4 — Konfigurer hvert verktøy

#### Claude Code

```bash
# Opprett ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Bruk den enhetlige Anthropic gateway-roten for Claude Code. Ikke legg til `/v1` her.

**Test:** `claude "say hello"`

---

#### OpenAI Codex

Moderne Codex (v0.137+) leser `~/.codex/config.toml` kun — den gamle
`config.yaml` tilhører den eldre npm CLI og blir stille ignorert. API-nøkkelen
forblir i miljøvariabelen `AGENTPROXY_API_KEY` (`env_key`), aldri
inni filen:

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

Full referanse (profiler, `wire_api`, kontekstvinduer): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

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

> Bruk `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> for å sende tenkevarianter.

---

#### Cline (CLI eller VS Code)

**CLI-modus:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code-modus:**
Cline-utvidelsens innstillinger → API-leverandør: `OpenAI Compatible` → Basis-URL: `http://localhost:20128/v1`

Eller bruk AgentProxy-dashboardet → **CLI-verktøy → Cline → Bruk konfigurasjon**.

---

#### KiloCode (CLI eller VS Code)

**CLI-modus:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**VS Code-innstillinger:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Eller bruk AgentProxy-dashboardet → **CLI-verktøy → KiloCode → Bruk konfigurasjon**.

---

#### Continue (VS Code-utvidelse)

Rediger `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Start VS Code på nytt etter redigering.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Bruk dette når VS Code Insiders er konfigurert for tilpassede endepunktmodeller og du vil at AgentProxy skal fungere uten et tilpasset headerfelt.

**Anbefalt plassering:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Eksempel som bruker den tokeniserte AgentProxy-aliasen:**

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

**Notater:**

- Erstatt `sk-your-agentproxy-key` med en API-nøkkel opprettet i AgentProxy.
- `url`-feltet skal peke til `/api/v1/vscode/{token}/chat/completions`.
- `modelsUrl`-feltet skal peke til `/api/v1/vscode/{token}/models`.
- Foretrekk den normale `/v1` + Bearer header-flyten når klienten støtter tilpassede overskrifter.
- URL-innlemmede tokens er en kompatibilitetsfall tilbake og kan vises i redigeringslogger eller proxyhistorikk.

---

#### Kiro CLI (Amazon)

```bash
# Logg inn på din AWS/Kiro-konto:
kiro-cli login

# CLI bruker sin egen autentisering — AgentProxy er ikke nødvendig som backend for Kiro CLI selv.
# Bruk kiro-cli sammen med AgentProxy for andre verktøy.
kiro-cli status
```

For **Kiro IDE** skrivebordsapp, bruk MITM-endepunktet som er eksponert av AgentProxy
under `/dashboard/cli-tools → Kiro`.

---

## 10. Intern AgentProxy CLI

Den `agentproxy` binæren gir kommandoer for serverlivssyklus, oppsett, diagnostikk og leverandøradministrasjon. Inngangspunkt: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Start server (standard port 20128)
agentproxy setup                        # Interaktiv oppsettsveiviser
agentproxy doctor                       # Sjekk konfigurasjon, DB, porter, kjøring
agentproxy providers list               # Konfigurerte leverandørforbindelser
agentproxy providers test-all           # Test hver aktiv forbindelse
agentproxy reset-password               # Tilbakestill adminpassord
agentproxy logs                         # Strøm forespørsel logger
agentproxy health                       # Detaljert helse (brytere, cache, minne)
agentproxy --version                    # Skriv ut versjon
agentproxy --help                       # Vis alle kommandoer
```

### Oppsett og initialisering

```bash
agentproxy setup                        # Interaktiv oppsettsveiviser
agentproxy setup --non-interactive      # CI/automatiseringsmodus (leser miljøvariabler + flagg)
agentproxy setup --password '<verdi>'   # Sett adminpassord direkte
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<verdi>' \
  --test-provider                      # Legg til og test en leverandør i ett steg
```

Gjenkjente miljøvariabler for ikke-interaktivt oppsett:

| Var                 | Formål                                                                |
| ------------------- | --------------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | Leverandør API-nøkkel (bundet til `--api-key` via Commander `.env()`) |
| `DATA_DIR`          | Overstyr AgentProxy datakatalogen                                      |

Alle andre ikke-interaktive innganger sendes som flagg, ikke miljøvariabler:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(se `agentproxy setup` alternativer ovenfor).

### Diagnostikk

```bash
agentproxy doctor                       # Sjekk konfigurasjon, DB, porter, kjøring, minne, livlighet
agentproxy doctor --json                # Maskinlesbar JSON
agentproxy doctor --no-liveness         # Hopp over HTTP helseundersøkelse
agentproxy doctor --host 0.0.0.0        # Overstyr livlighet vert
agentproxy doctor --liveness-url <url>  # Full helseendepunkt URL-overstyring
```

Doktoren kjører disse sjekkene: `Konfigurasjon`, `Database`, `Lagring/kryptering`,
`Port tilgjengelighet`, `Node kjøring`, `Native binær` (better-sqlite3),
`Minne`, og `Server livlighet`. Den avslutter med ikke-null hvis noen sjekk er `feil`.

### Leverandøradministrasjon

```bash
agentproxy providers available                       # AgentProxy leverandørkatalog
agentproxy providers available --search openai       # Filtrer katalog etter id/navn/alias/kategori
agentproxy providers available --category api-key    # Filtrer etter kategori (api-key, oauth, gratis, ...)
agentproxy providers available --json                # Maskinlesbar JSON

agentproxy providers list                            # Konfigurerte leverandørforbindelser
agentproxy providers list --json

agentproxy providers test <id|navn>                  # Test en konfigurert forbindelse
agentproxy providers test-all                        # Test hver aktiv forbindelse
agentproxy providers validate                        # Lokalt strukturell validering
agentproxy providers add <leverandør> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <leverandør>                 # Eksisterende OAuth flyt
agentproxy providers edit <id|navn> --default-model <modell>
agentproxy providers remove <id|navn> --yes
```

`providers add/import/auth/edit/remove` er API-først og fungerer derfor mot
den aktive lokale eller eksterne konteksten. Credential-inngang bør bruke
`--credential-stdin` eller `--credential-env`; `--dry-run --json` rapporterer kun
redigert tilstedeværelse/form. `providers available` leser AgentProxy katalogen;
`providers list/test/test-all/validate` beholder sin lokale SQLite-atferd og
krever ikke at serveren kjører.

### Gjenoppretting og tilbakestilling

```bash
agentproxy reset-password                # Tilbakestill adminpassord (også: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Vis advarsel + tørrkjøring for tilbakestilling av krypterte legitimasjoner
agentproxy reset-encrypted-columns --force  # Faktisk nullstill krypterte legitimasjoner i SQLite
```

### Eksport av legitimasjoner (⚠ håndter med forsiktighet)

```bash
agentproxy auth export                                 # Vis advarsel + bekreftelsesport — ingen DB-tilgang
agentproxy auth export --force                          # Eksporter ALLE forbindelsers DEKRYPTERTE legitimasjoner til stdout som JSON
agentproxy auth export --force --id <id>                 # Eksporter kun den matchende forbindelsen
agentproxy auth export --force --format env               # Emit AGENTPROXY_<LEVERANDØR>_<FELT>=<verdi> linjer
agentproxy auth export --force --out creds.json           # Skriv til en fil (opprettet med 0600 tillatelser)
```

`auth export` er **lokal-only** (direkte SQLite lesing, ingen HTTP-rute) og skriver med vilje
**ren tekst** `apiKey`/`accessToken`/`refreshToken`/`idToken` verdier — det er funksjonen, ikke en
bug. Ingenting leses fra databasen, og ingenting dekrypteres, uten `--force`. En stderr
advarsel banner skrives alltid ut før noen ren tekst sendes. Krever `STORAGE_ENCRYPTION_KEY` å
være satt. Et felt som mislykkes i dekryptering (utdatert nøkkel, ødelagt ciphertext) rapporteres som
`<felt>DecryptFailed: true` i stedet for å avbryte hele eksporten eller lekke den underliggende feilen.

### Andre underkommandoer

Disse forutsetter en kjørende AgentProxy-server, med mindre annet er notert:

```bash
agentproxy status                       # Omfattende kjøretidsstatus
agentproxy logs                         # Strøm forespørsel logger (--json, --search, --follow)
agentproxy config show                  # Vis nåværende konfigurasjon

agentproxy provider list                # List tilgjengelige leverandører (alias av providers list)
agentproxy provider add                 # Registrer AgentProxy som en leverandør på et verktøy
agentproxy keys add | list | remove     # Administrer API-nøkler
agentproxy models [leverandør]            # List modeller (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Snapshot konfig + DB
agentproxy restore                      # Gjenopprett fra et tidligere snapshot

agentproxy health                       # Detaljert helse (brytere, cache, minne)
agentproxy quota                        # Leverandør kvote bruk
agentproxy cache                        # Cache status
agentproxy cache clear                  # Tøm semantiske + signatur cacher

agentproxy mcp status | restart         # MCP server status / restart
agentproxy a2a status | card            # A2A server status / agent kort

agentproxy tunnel list | create | stop  # Administrer tunneler (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Inspiser / sett miljøvariabler (midlertidig)

agentproxy test                         # Leverandør tilkoblings røyk test
agentproxy update                       # Sjekk for oppdateringer
agentproxy completion                   # Generer skall fullføring
```

### Vanlige flagg

| Flag                | Beskrivelse                                        |
| ------------------- | -------------------------------------------------- |
| `--no-open`         | Ikke auto-åpne nettleseren ved start               |
| `--port <n>`        | Overstyr API-porten (standard 20128)               |
| `--mcp`             | Kjør som MCP-server over stdio (for IDE-er)        |
| `--non-interactive` | CI-modus (ingen spørsmål; leser fra miljø/flag)    |
| `--json`            | Maskinlesbar JSON-utgang (doctor, providers, osv.) |
| `--help`, `-h`      | Vis kommando-spesifikk hjelp                       |
| `--version`, `-v`   | Skriv ut installert versjon                        |

## Tilgjengelige API-endepunkter

| Endepunkt                  | Beskrivelse                       | Bruk For                           |
| -------------------------- | --------------------------------- | ---------------------------------- |
| `/v1/chat/completions`     | Standard chat (alle leverandører) | Alle moderne verktøy               |
| `/v1/responses`            | Respons API (OpenAI-format)       | Codex, agentiske arbeidsflyter     |
| `/v1/completions`          | Legacy tekstfullføringer          | Eldre verktøy som bruker `prompt:` |
| `/v1/embeddings`           | Tekstinnbøyninger                 | RAG, søk                           |
| `/v1/images/generations`   | Bildegenerering                   | GPT-Image, Flux, osv.              |
| `/v1/audio/speech`         | Tekst-til-tale                    | ElevenLabs, OpenAI TTS             |
| `/v1/audio/transcriptions` | Tale-til-tekst                    | Deepgram, AssemblyAI               |

Klar-til-å-lime eksempler med en tokenisert AgentProxy-URL:

```txt
Token eksempel: sk-a3ab3c080beaee3a-69f4a4-070d71af

Standard OpenAI base: http://localhost:20128/v1
VS Code modeller: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code chat: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code responser: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama tags: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama chat: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Feilsøking

| Feil                                              | Årsak                         | Løsning                                                 |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `Connection refused`                              | AgentProxy kjører ikke         | `agentproxy serve`                                       |
| `401 Unauthorized`                                | Feil API-nøkkel               | Sjekk i `/dashboard/api-manager`                        |
| `No combo configured`                             | Ingen aktiv rutingkombinasjon | Sett opp i `/dashboard/combos`                          |
| CLI viser "not installed"                         | Binær ikke i PATH             | Sjekk `which <command>`                                 |
| Dashboard viser "not detected" etter installasjon | Cache utdaterte               | Klikk "⟳ Oppdater deteksjon" i dashbordet               |
| Gammel lenke `/dashboard/cli-tools`               | Bokmerke før v3.8.6           | Automatisk omdirigert til `/dashboard/cli-code` (308)   |
| Gammel lenke `/dashboard/agents`                  | Bokmerke før v3.8.6           | Automatisk omdirigert til `/dashboard/acp-agents` (308) |
