# CLI-INTEGRATIONS (Nederlands)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI Integraties — wijs elke coderende CLI aan AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI Integraties

AgentProxy levert een familie van `setup-*` commando's die een coderende
CLI (Codex, Claude Code, OpenCode, Cline, …) configureert om AgentProxy als backend te gebruiken — zodat
de tool met **één** endpoint communiceert en AgentProxy naar de juiste provider doorverwijst met
automatische fallback. Elk commando leest de **live** modelcatalogus van een draaiende
AgentProxy (lokaal of op afstand) en schrijft het configuratiebestand van de tool op **jouw**
machine. De API-sleutel wordt verwezen door een omgevingsvariabele waar de tool
dit ondersteunt. Commando's die een tool-lokaal omgevingsbestand persistent maken, worden hieronder opgemerkt.

Er is ook een generieke launcher — `agentproxy run <target>` — die
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` of `gemini` opstart met de
juiste omgeving geïnjecteerd, zonder enige configuratie te schrijven. Doelen en hun
aliassen komen uit het canonieke manifest `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), en `agentproxy completion` biedt de
zelfde manifest-afgeleide doelwoorden. De legacy per-tool launchers —
`agentproxy launch` (Claude Code) en `agentproxy launch-codex` (Codex) — blijven
beschikbaar.

Provider onboarding is beschikbaar vanuit dezelfde lokale/remote context. De
API-eerste commando's hieronder houden het beheer van authenticatie gescheiden van provider
referenties en printen nooit een referentie in gestructureerde output:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Voor scripts, geef de voorkeur aan `--credential-stdin` of `--credential-env`; `--credential`
wordt behouden voor gecontroleerd lokaal gebruik. `providers remove` vereist `--yes` op een
niet-interactieve terminal, en alle vijf commando's respecteren de actieve context of de
globale `--base-url`/`--api-key` opties.

Voor de eenmalige, handgeschreven basisconfiguratie van de twee rijkste integraties, zie de
per-tool diepgaande analyses:

- [Claude Code configuratie](./CLAUDE-CODE-CONFIGURATION.md)
- [Codex CLI configuratie](./CODEX-CLI-CONFIGURATION.md)
- [Remote Mode](./REMOTE-MODE.md) — bestuur een remote AgentProxy (VPS / Tailnet) vanaf je laptop
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — de OmniCopilot extensie; het kan ook deze
  `setup-*` commando's voor je uitvoeren vanuit de editor

---

## Hoofdtabel

Elk commando respecteert de **actieve context** (gesteld met `agentproxy connect`, zie
[Remote Mode](./REMOTE-MODE.md)) of expliciete `--remote <url> --api-key <key>` vlaggen.
"Lokale vs remote" hieronder betekent: zonder vlaggen richt het zich op `http://localhost:20128`;
met `--remote` (of een actieve remote context) haalt het de catalogus van die
server en schrijft de configuratie lokaal.

| Commando                   | Tool                         | Wat het schrijft                                                                                                                                                         | Sleutelvlaggen                                                                                                                             | Lokaal vs remote |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI             | `~/.codex/<name>.config.toml` — één profiel per compatibel tekstmodel (`codex --profile <name>`)                                                                         | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Beide            |
| `agentproxy setup-claude`   | Claude Code                  | `~/.claude/profiles/<name>/settings.json` — één profiel per gematcht model (`CLAUDE_CONFIG_DIR`)                                                                         | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Beide            |
| `agentproxy setup-opencode` | OpenCode (openai-compatibel) | `~/.config/opencode/opencode.json` — `agentproxy` provider met elk catalogusmodel (`opencode -m agentproxy/<model>`)                                                       | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Beide            |
| `agentproxy setup-cline`    | Cline                        | `~/.cline/data/{globalState,secrets}.json` (CLI-modus) + print VS Code extensie-instellingen                                                                             | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Beide            |
| `agentproxy setup-kilo`     | Kilo Code                    | `~/.local/share/kilo/auth.json` (CLI) + voegt `kilocode.*` samen in VS Code `settings.json` indien aanwezig                                                              | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Beide            |
| `agentproxy setup-continue` | Continue / `cn` CLI          | `~/.continue/config.yaml` — `provider: openai` modellen, sleutel via `${{ secrets.AGENTPROXY_API_KEY }}`                                                                  | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Beide            |
| `agentproxy setup-cursor`   | Cursor                       | Niets — print de stappen in de app (Cursor-configuratie is ondoorzichtig SQLite)                                                                                         | `--remote` `--api-key` `--only` `--port`                                                                                                   | Beide            |
| `agentproxy setup-roo`      | Roo Code                     | `~/.agentproxy/roo-settings.json` (import doc) + stelt `roo-cline.autoImportSettingsPath` in als er een VS Code `settings.json` bestaat                                   | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Beide            |
| `agentproxy setup-crush`    | Crush                        | `~/.config/crush/crush.json` — `openai-compat` provider, sleutel via `$AGENTPROXY_API_KEY`                                                                                | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Beide            |
| `agentproxy setup-goose`    | Goose                        | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + print omgevingsrecept                                                                     | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Beide            |
| `agentproxy setup-aider`    | Aider                        | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + print omgevingsrecept                                                                                   | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Beide            |
| `agentproxy setup-qwen`     | Qwen Code                    | `~/.qwen/settings.json` — V4 `modelProviders.openai` array + `AGENTPROXY_API_KEY` in `~/.qwen/.env`                                                                       | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Beide            |
| `agentproxy run <target>`   | Runtime launch (generiek)    | Niets — start `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` met de juiste omgeving en argumenten; Qwen en Gemini gebruiken een tijdelijke geïsoleerde home | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Beide            |
| `agentproxy launch`         | Claude Code                  | Niets — start `claude` met `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` geïnjecteerd                                                                                      | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Beide            |
| `agentproxy launch-codex`   | OpenAI Codex CLI             | Niets — start `codex` met de `agentproxy` provider geïnjecteerd via `-c` vlaggen                                                                                          | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Beide            |

Opmerkingen over vlaggen (gecontroleerd in de commandobron):

- `--remote <url>` — haal de catalogus op van een remote AgentProxy (overschrijft `--port`
  en de actieve context). `--api-key <key>` levert de referentie voor die
  server (standaard ingesteld op de `AGENTPROXY_API_KEY` omgevingsvariabele, of de token van de actieve context).
- `--only <patterns>` — komma-gescheiden substrings; houd alleen model-ID's die overeenkomen
  (bijv. `--only glm,kimi`). Beschikbaar op `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — print precies wat er geschreven zou worden zonder het
  bestandssysteem aan te raken. Beschikbaar op elk `setup-*` commando **behalve** `setup-cursor`
  (dat nooit een bestand schrijft).
- `--model <id>` — vereist (of interactief gekozen) voor de tools die geen
  model auto-ontdekking hebben: Cline, Kilo, Roo, Goose, Qwen, Aider. Die tools
  accepteren ook `--yes` voor niet-interactieve uitvoeringen (die dan `--model` vereisen).
  `setup-opencode` neemt `--model` om het standaard top-level model in te stellen.
- `--model <id>` op `agentproxy run` volgt de manifest's per-target bedrading
  (`bin/cli/cli-manifest.mjs`): **aider** ontvangt `--model openai/<id>` en
  **opencode** `--model agentproxy/<id>` (de prefix wordt alleen toegevoegd wanneer de id
  het nog niet draagt); **qwen** en **gemini** ontvangen de id letterlijk;
  **claude** krijgt het via `ANTHROPIC_MODEL`, **goose** via `GOOSE_MODEL`, en
  **codex** via `-c model_providers.agentproxy.*` args. **Qwen is het enige run
  doel dat hard `--model` vereist** — `agentproxy run qwen` zonder het verlaat
  `2` met een expliciete fout.
- `--port <port>` — lokale AgentProxy poort (standaard `20128`, genegeerd wanneer `--remote`
  is ingesteld). Aanwezig op alle `setup-*` en beide launchers.
- `agentproxy run` exitcodes: de eigen exitcode van de child CLI wordt
  letterlijk doorgegeven; `2` = ongeldige argumenten (ondersteunde doel, ontbrekende vereiste
  `--model`, container guard); `127` = het doel-binaire bestand is niet in `PATH`;
  `130`/`143`/`129` wanneer de lancering eindigt door `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = andere runtime lancering fout.
- De twee launchers (`launch`, `launch-codex`) accepteren `--profile <name>` om
  een profiel te selecteren dat is geschreven door `setup-claude` / `setup-codex`, plus doorgeefargumenten voor
  de onderliggende `claude` / `codex` binaire.

De interactieve picker wordt ook gedeeld door de setup-recepten:

```bash
# Kies uit de actieve lokale of remote modelcatalogus en configureer het doel.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` delegeert momenteel naar de geteste recepten voor `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, en `kilo`. IDE-only,
MITM, en alleen gids catalogusvermeldingen blijven expliciete `setup-*`/handmatige stromen en
worden niet gepresenteerd als lanceerbare doelen.

> `setup-opencode` is de **lichte openai-compatibele** OpenCode integratie.
> Er is ook een rijkere pluginintegratie — `agentproxy setup opencode` — die
> `@agentproxy/opencode-plugin` installeert. Het zijn verschillende commando's; de tabel
> hierboven documenteert `setup-opencode`.

---

## Lokale gebruik

Met AgentProxy draaiend op `localhost:20128`, voer gewoon de setup-opdracht uit voor jouw
tool. De catalogus wordt opgehaald van de lokale server.

```bash
# Codex: schrijf een profiel per gematcht model in ~/.codex/
agentproxy setup-codex
codex --profile glm52            # gebruik een gegenereerd profiel

# Claude Code: schrijf per-model profielen, start vervolgens één
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: schrijf de openai-compatibele provider met alle catalogusmodellen
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # verwezen via {env:AGENTPROXY_API_KEY}, nooit op schijf
opencode -m agentproxy/glm/glm-5.2 "..."

# Tools zonder autodetectie hebben een expliciet model nodig:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Voorbeeld zonder iets te schrijven:
agentproxy setup-continue --dry-run
```

Start zonder enige configuratie te schrijven (alleen env-injectie):

```bash
agentproxy launch                 # Claude Code → lokale AgentProxy
agentproxy launch-codex           # Codex CLI → lokale AgentProxy
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Expliciete opdrachtpad: geef door wat er na -- komt
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Extern gebruik

Wijs elke setup-opdracht aan een externe AgentProxy met `--remote` + `--api-key`. De
catalogus wordt opgehaald van de externe; de configuratie wordt op jouw lokale machine geschreven.

```bash
# OpenCode tegen een externe VPS, houd alleen glm/kimi modellen
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # exporteer eerst AGENTPROXY_API_KEY

# Codex profielen van een externe catalogus
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Start een CLI rechtstreeks tegen de externe
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

In plaats van elke keer `--remote`/`--api-key` door te geven, log één keer in en laat de
**actieve context** ze automatisch leveren:

```bash
agentproxy connect 192.168.0.15        # mint een scoped token, slaat de context op
agentproxy setup-codex                 # ← gebruikt nu de externe catalogus
agentproxy setup-opencode              # ← hetzelfde
agentproxy launch                      # ← Claude Code tegen de externe
```

Zie [Remote Mode](./REMOTE-MODE.md) voor contexten, scopes en tokenbeheer.

---

## Basis-URL conventies (welke tools willen `/v1`)

AgentProxy exposeert het OpenAI oppervlak op `/v1`, het Anthropic oppervlak op de root,
en een native Gemini oppervlak op `/v1beta`. Elke integratie is verbonden met de vorm die
de tool verwacht (gecontroleerd in de opdrachtbron):

| Integratie                                                                 | Basis-URL geschreven | `/v1`?                                         |
| -------------------------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| `setup-cline` (`openAiBaseUrl`)                                            | root                 | Nee — Cline voegt `/v1/chat/completions` toe   |
| `setup-goose` (`OPENAI_HOST`)                                              | root                 | Nee — Goose voegt het pad toe                  |
| `setup-aider` (`OPENAI_API_BASE`)                                          | root                 | Nee — LiteLLM voegt `/v1/chat/completions` toe |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | met `/v1`            | Ja                                             |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | root                 | Nee — Claude Code voegt `/v1/messages` toe     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | met `/v1`            | Ja                                             |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | met `/v1`            | Ja                                             |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | root                 | Nee — de SDK voegt `/v1beta/models/…` toe      |

---

## Het bijhouden van native afhankelijkheden bij updates: `--include=optional`

Wanneer je update met `agentproxy update` (na bevestiging, of met `--apply`),
voert AgentProxy de installatie uit met `--include=optional` ingebakken:

```bash
npm install -g agentproxy@latest --include=optional
```

Dit is **geen** vlag die je doorgeeft aan `agentproxy update` — het wordt altijd toegepast door de
updater. Het garandeert dat de `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, de LLMLingua SLM-stack) de update overleven, zelfs als je npm-configuratie
`omit=optional` heeft ingesteld, wat anders stilletjes de native SQLite
driver en OS-keyring binding zou verwijderen. Om de exacte opdracht zonder toepassing te bekijken:

```bash
agentproxy update --dry-run
# [DRY RUN] Zou uitvoeren: npm install -g agentproxy@latest --include=optional
```

Andere `agentproxy update` vlaggen (geverifieerd in de bron): `--check` (verlaat met 1 als
verouderd), `--apply` (installeer zonder te vragen), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI via `agentproxy run gemini`

Contract geverifieerd tegen `@google/gemini-cli` 0.50.0: de CLI respecteert
`GOOGLE_GEMINI_BASE_URL` en verstuurt `POST /v1beta/models/<model>:generateContent`
(en `:streamGenerateContent?alt=sse`) daartegen — precies de native
Gemini-interface van AgentProxy (`/v1beta`). `agentproxy run gemini` verbindt dat automatisch:

- `GOOGLE_GEMINI_BASE_URL` → de actieve AgentProxy basis-URL (root, geen `/v1`);
- `GEMINI_API_KEY` → de opgeloste AgentProxy referentie (optie/env/context);
- een **tijdelijk geïsoleerde `GEMINI_CLI_HOME`** waarvan de `.gemini/settings.json`
  `gemini-api-key` authenticatie selecteert, zodat een opgeslagen Google OAuth-sessie (Code Assist)
  nooit de AgentProxy-gestuurde lancering overschrijft — verwijderd na exit;
- **omgeving hygiëne**: de kindomgeving is ontdaan van `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` en `GOOGLE_GENAI_USE_GCA` (die de
  authenticatie naar Vertex/Code Assist zouden omleiden), en `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` is
  ingesteld als een belt-en-suspenders fallback — de andere `run` doelwitten krijgen dezelfde
  behandeling voor hun eigen conflicterende variabelen;
- `--model <id>` injectie van `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

De workspace-trust bescherming van Gemini geldt nog steeds in headless modus — geef
`--skip-trust` door (of vertrouw de directory interactief) zelf; de launcher
omzeilt dit opzettelijk niet. Deze launcher is distinct van de **ACP
registratie** (`src/lib/acp/registry.ts`, `gemini --acp`), die de
agent-protocol integratie voor `/dashboard/acp-agents` blijft.

---

## Echte rooktest (opt-in)

Deterministische lancering-plan regressietests in CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Om de ECHTE binaries tegen een ECHTE
AgentProxy-server te valideren, bestaat er een opt-in harnas op
`tests/integration/upstream-cli-smoke.int.test.ts`. Het draait nooit automatisch
(elke sub-test slaat over tenzij `RUN_CLI_SMOKE=1`), geeft de referentie door via omgevingsvariabele
NAAM (nooit via waarde), redigeert sleutelvormige strings uit elke geregistreerde output, slaat
doelen over waarvan de binary niet is geïnstalleerd, en classificeert fouten als
auth / upstream / config in plaats van een blote boolean:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Optioneel: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` beperkt de sweep;
`AGENTPROXY_SMOKE_TIMEOUT_MS` overschrijft de timeout van 120s per doel.

## Zie ook

- [Claude Code configuratie](./CLAUDE-CODE-CONFIGURATION.md) — de diepere Claude Code gids
- [Codex CLI configuratie](./CODEX-CLI-CONFIGURATION.md) — de eenmalige `[model_providers.agentproxy]` basisinstelling
- [Remote Mode](./REMOTE-MODE.md) — contexten, scoped toegangstokens, een externe server aansturen
- [CLI Tools referentie](../reference/CLI-TOOLS.md) — de volledige catalogus van ondersteunde tools + dashboardpagina's
- [Installatiegids](./SETUP_GUIDE.md) — installatiemethoden en onboarding bij de eerste keer gebruik
