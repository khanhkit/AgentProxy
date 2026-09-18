# CLI-INTEGRATIONS (Svenska)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI-integrationer — rikta vilken kodnings-CLI mot AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI-integrationer

AgentProxy levererar en familj av `setup-*` kommandon som konfigurerar en kodnings-CLI (Codex, Claude Code, OpenCode, Cline, …) att använda AgentProxy som sin backend — så att verktyget pratar med **ett** slutpunkt och AgentProxy dirigerar till rätt leverantör med automatisk fallback. Varje kommando läser den **aktuella** modellkatalogen från en körande AgentProxy (lokal eller fjärr) och skriver verktygets egen konfigurationsfil på **din** maskin. API-nyckeln refereras av en miljövariabel där verktyget stöder det. Kommandon som sparar en verktygs-lokal miljöfil noteras nedan.

Det finns också en generell launcher — `agentproxy run <target>` — som startar `claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` eller `gemini` med rätt miljö injicerad, utan att skriva någon konfiguration alls. Mål och deras alias kommer från den kanoniska manifestfilen `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), och `agentproxy completion` erbjuder
samma manifest-avledda målord. De äldre per-verktyg launchers —
`agentproxy launch` (Claude Code) och `agentproxy launch-codex` (Codex) — förblir
tillgängliga.

Leverantörsintroduktion är tillgänglig från samma lokala/fjärrkontext. De
API-först kommandon nedan håller hanteringsautentisering separat från leverantörs
uppgifter och skriver aldrig ut en uppgift i strukturerad utdata:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

För skript, föredra `--credential-stdin` eller `--credential-env`; `--credential`
behålls för kontrollerad lokal användning. `providers remove` kräver `--yes` på en
icke-interaktiv terminal, och alla fem kommandon hedrar den aktiva kontexten eller de
globala `--base-url`/`--api-key` alternativen.

För den engångs, handskrivna basinställningen av de två rikaste integrationerna, se de
per-verktyg djupdykningarna:

- [Claude Code-konfiguration](./CLAUDE-CODE-CONFIGURATION.md)
- [Codex CLI-konfiguration](./CODEX-CLI-CONFIGURATION.md)
- [Fjärrläge](./REMOTE-MODE.md) — styra en fjärr AgentProxy (VPS / Tailnet) från din laptop
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — OmniCopilot-tillägget; det kan också köra dessa
  `setup-*` kommandon för dig från inuti redigeraren

---

## Huvudtabell

Varje kommando hedrar den **aktiva kontexten** (inställd med `agentproxy connect`, se
[Fjärrläge](./REMOTE-MODE.md)) eller explicita `--remote <url> --api-key <key>` flaggor.
"Lokalt vs fjärr" nedan betyder: utan flaggor riktar det sig mot `http://localhost:20128`;
med `--remote` (eller en aktiv fjärrkontext) hämtar det katalogen från den
servern och skriver konfigurationen lokalt.

| Kommando                   | Verktyg                      | Vad det skriver                                                                                                                                                  | Nyckelflaggor                                                                                                                              | Lokalt vs fjärr |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI             | `~/.codex/<name>.config.toml` — en profil per kompatibel textmodell (`codex --profile <name>`)                                                                   | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Båda            |
| `agentproxy setup-claude`   | Claude Code                  | `~/.claude/profiles/<name>/settings.json` — en profil per matchad modell (`CLAUDE_CONFIG_DIR`)                                                                   | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Båda            |
| `agentproxy setup-opencode` | OpenCode (openai-kompatibel) | `~/.config/opencode/opencode.json` — `agentproxy` leverantör med varje katalogmodell (`opencode -m agentproxy/<model>`)                                            | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Båda            |
| `agentproxy setup-cline`    | Cline                        | `~/.cline/data/{globalState,secrets}.json` (CLI-läge) + skriver VS Code-tilläggsinställningar                                                                    | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Båda            |
| `agentproxy setup-kilo`     | Kilo Code                    | `~/.local/share/kilo/auth.json` (CLI) + slår samman `kilocode.*` i VS Code `settings.json` om det finns                                                          | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Båda            |
| `agentproxy setup-continue` | Continue / `cn` CLI          | `~/.continue/config.yaml` — `provider: openai` modeller, nyckel via `${{ secrets.AGENTPROXY_API_KEY }}`                                                           | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Båda            |
| `agentproxy setup-cursor`   | Cursor                       | Ingenting — skriver in-app steg (Cursor-konfiguration är ogenomskinlig SQLite)                                                                                   | `--remote` `--api-key` `--only` `--port`                                                                                                   | Båda            |
| `agentproxy setup-roo`      | Roo Code                     | `~/.agentproxy/roo-settings.json` (importdokument) + ställer in `roo-cline.autoImportSettingsPath` om en VS Code `settings.json` finns                            | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Båda            |
| `agentproxy setup-crush`    | Crush                        | `~/.config/crush/crush.json` — `openai-kompatibel` leverantör, nyckel via `$AGENTPROXY_API_KEY`                                                                   | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Båda            |
| `agentproxy setup-goose`    | Goose                        | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + skriver miljörecept                                                               | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Båda            |
| `agentproxy setup-aider`    | Aider                        | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + skriver miljörecept                                                                             | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Båda            |
| `agentproxy setup-qwen`     | Qwen Code                    | `~/.qwen/settings.json` — V4 `modelProviders.openai` array + `AGENTPROXY_API_KEY` i `~/.qwen/.env`                                                                | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Båda            |
| `agentproxy run <target>`   | Runtime launch (generisk)    | Ingenting — startar `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` med rätt miljö och argument; Qwen och Gemini använder ett temporärt isolerat hem | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Båda            |
| `agentproxy launch`         | Claude Code                  | Ingenting — startar `claude` med `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` injicerad                                                                           | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Båda            |
| `agentproxy launch-codex`   | OpenAI Codex CLI             | Ingenting — startar `codex` med `agentproxy` leverantören injicerad via `-c` flaggor                                                                              | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Båda            |

Noter om flaggor (verifierade i kommandokällan):

- `--remote <url>` — hämtar katalogen från en fjärr AgentProxy (överskrider `--port`
  och den aktiva kontexten). `--api-key <key>` tillhandahåller uppgiften för den
  servern (standard till `AGENTPROXY_API_KEY` miljövariabeln, eller den aktiva kontextens token).
- `--only <mönster>` — kommatecken-separerade delsträngar; behåll endast modell-ID:n som matchar
  (t.ex. `--only glm,kimi`). Tillgänglig på `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — skriv ut exakt vad som skulle skrivas utan att röra vid
  filsystemet. Tillgänglig på varje `setup-*` kommando **förutom** `setup-cursor`
  (som aldrig skriver en fil).
- `--model <id>` — krävs (eller väljs interaktivt) för de verktyg som inte har
  automatisk modellupptäckning: Cline, Kilo, Roo, Goose, Qwen, Aider. Dessa verktyg
  accepterar också `--yes` för icke-interaktiva körningar (vilket då kräver `--model`).
  `setup-opencode` tar `--model` för att ställa in den standard översta modellen.
- `--model <id>` på `agentproxy run` följer manifestets per-mål koppling
  (`bin/cli/cli-manifest.mjs`): **aider** får `--model openai/<id>` och
  **opencode** `--model agentproxy/<id>` (prefixet läggs till endast när id
  inte redan bär det); **qwen** och **gemini** får id:t verbatim;
  **claude** får det via `ANTHROPIC_MODEL`, **goose** via `GOOSE_MODEL`, och
  **codex** via `-c model_providers.agentproxy.*` argument. **Qwen är det enda kör
  målet som hårt kräver `--model`** — `agentproxy run qwen` utan det avslutas
  `2` med ett explicit fel.
- `--port <port>` — lokal AgentProxy port (standard `20128`, ignoreras när `--remote`
  är inställt). Present på alla `setup-*` och båda launchers.
- `agentproxy run` exit-koder: barn-CLI:s egen exit-kod propagateras
  verbatim; `2` = ogiltiga argument (stödjer inte mål, saknar krävd
  `--model`, container skydd); `127` = mål-binären finns inte i `PATH`;
  `130`/`143`/`129` när starten avslutas av `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = annan körningsfel.
- De två launchers (`launch`, `launch-codex`) accepterar `--profile <name>` för att välja
  en profil skriven av `setup-claude` / `setup-codex`, plus pass-through args för
  den underliggande `claude` / `codex` binären.

Den interaktiva väljaren delas också av installationsrecepten:

```bash
# Välj från den aktiva lokala eller fjärrmodellkatalogen och konfigurera målet.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` delegerar för närvarande till de testade recepten för `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, och `kilo`. IDE-endast,
MITM, och guide-endast katalogposter förblir explicita `setup-*`/manuella flöden och
presenteras inte som körbara mål.

> `setup-opencode` är den **lätta openai-kompatibla** OpenCode-integrationen.
> Det finns också en rikare plugin-integration — `agentproxy setup opencode` — som
> installerar `@agentproxy/opencode-plugin`. De är olika kommandon; tabellen
> ovan dokumenterar `setup-opencode`.

---

## Lokal användning

Med AgentProxy som körs på `localhost:20128`, kör bara installationskommandot för ditt verktyg. Katalogen hämtas från den lokala servern.

```bash
# Codex: skriv en profil per matchad modell i ~/.codex/
agentproxy setup-codex
codex --profile glm52            # använd en genererad profil

# Claude Code: skriv profiler per modell, starta sedan en
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: skriv den openai-kompatibla leverantören med alla katalogmodeller
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # refererad via {env:AGENTPROXY_API_KEY}, aldrig på disk
opencode -m agentproxy/glm/glm-5.2 "..."

# Verktyg utan automatisk upptäckte behöver en explicit modell:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Förhandsgranska utan att skriva något:
agentproxy setup-continue --dry-run
```

Starta utan att skriva någon konfiguration alls (endast miljöinjektion):

```bash
agentproxy launch                 # Claude Code → lokal AgentProxy
agentproxy launch-codex           # Codex CLI → lokal AgentProxy
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Explicit kommandoväg: passera genom vad som helst som kommer efter --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Fjärranvändning

Peka vilket installationskommando som helst mot en fjärran AgentProxy med `--remote` + `--api-key`. Katalogen hämtas från den fjärran; konfigurationen skrivs på din lokala maskin.

```bash
# OpenCode mot en fjärran VPS, behåll endast glm/kimi-modeller
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # export AGENTPROXY_API_KEY först

# Codex-profiler från en fjärrkatalog
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Starta en CLI direkt mot den fjärran
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Istället för att passera `--remote`/`--api-key` varje gång, logga in en gång och låt den **aktiva kontexten** tillhandahålla dem automatiskt:

```bash
agentproxy connect 192.168.0.15        # skapar en scoped token, lagrar kontexten
agentproxy setup-codex                 # ← använder nu den fjärran katalogen
agentproxy setup-opencode              # ← samma
agentproxy launch                      # ← Claude Code mot den fjärran
```

Se [Fjärrläge](./REMOTE-MODE.md) för kontexter, områden och tokenhantering.

---

## Bas-URL-konventioner (vilka verktyg vill ha `/v1`)

AgentProxy exponerar OpenAI-yta på `/v1`, den Anthropic-yta på roten, och en inhemsk Gemini-yta på `/v1beta`. Varje integration är kopplad till den form som dess verktyg förväntar sig (verifierad i kommandokällan):

| Integration                                                                | Bas-URL skriven | `/v1`?                                           |
| -------------------------------------------------------------------------- | --------------- | ------------------------------------------------ |
| `setup-cline` (`openAiBaseUrl`)                                            | rot             | Nej — Cline lägger till `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | rot             | Nej — Goose lägger till sökvägen                 |
| `setup-aider` (`OPENAI_API_BASE`)                                          | rot             | Nej — LiteLLM lägger till `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | med `/v1`       | Ja                                               |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | rot             | Nej — Claude Code lägger till `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | med `/v1`       | Ja                                               |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | med `/v1`       | Ja                                               |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | rot             | Nej — SDK:n lägger till `/v1beta/models/…`       |

---

## Hålla inhemska beroenden vid uppdatering: `--include=optional`

När du uppdaterar med `agentproxy update` (efter bekräftelse, eller med `--apply`),
kör AgentProxy installationen med `--include=optional` inbakad:

```bash
npm install -g agentproxy@latest --include=optional
```

Detta är **inte** en flagga du skickar till `agentproxy update` — den tillämpas alltid av
uppdateraren. Det garanterar att `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, LLMLingua SLM-stacken) överlever uppdateringen även om din npm-konfiguration
har `omit=optional` inställt, vilket annars tyst skulle ta bort den inhemska SQLite
drivrutinen och OS-nyckelringbindningen. För att förhandsgranska det exakta kommandot utan att tillämpa:

```bash
agentproxy update --dry-run
# [DRY RUN] Skulle köra: npm install -g agentproxy@latest --include=optional
```

Andra `agentproxy update` flaggor (verifierade i källan): `--check` (avsluta 1 om
utdaterad), `--apply` (installera utan att fråga), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI via `agentproxy run gemini`

Kontrakt verifierat mot `@google/gemini-cli` 0.50.0: CLI:n hedrar
`GOOGLE_GEMINI_BASE_URL` och utfärdar `POST /v1beta/models/<model>:generateContent`
(och `:streamGenerateContent?alt=sse`) mot den — exakt AgentProxys inhemska
Gemini-yta (`/v1beta`). `agentproxy run gemini` kopplar det automatiskt:

- `GOOGLE_GEMINI_BASE_URL` → den aktiva AgentProxy bas-URL:en (rot, ingen `/v1`);
- `GEMINI_API_KEY` → den lösta AgentProxy-uppgiften (alternativ/miljö/kontekst);
- en **tillfällig isolerad `GEMINI_CLI_HOME`** vars `.gemini/settings.json`
  väljer `gemini-api-key` autentisering, så en lagrad Google OAuth-session (Code Assist)
  aldrig åsidosätter den AgentProxy-styrda lanseringen — tas bort efter avslut;
- **miljöhygien**: barnmiljön är rensad från `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` och `GOOGLE_GENAI_USE_GCA` (vilket skulle omdirigera
  autentisering till Vertex/Code Assist), och `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` sätts
  som en säkerhetsåtgärd — de andra `run` målen får samma behandling för sina egna
  konfliktande variabler;
- `--model <id>` injektion från `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Geminis arbetsytans förtroendeguard gäller fortfarande i headless-läge — skicka
`--skip-trust` (eller lita på katalogen interaktivt) själv; lanseraren
bypasserar medvetet inte det. Denna lanserare är skild från **ACP
registreringen** (`src/lib/acp/registry.ts`, `gemini --acp`), som förblir
agentprotokollintegrationen för `/dashboard/acp-agents`.

---

## Verklig rökfilt (opt-in)

Deterministiska lanseringsplanregressioner körs i CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). För att validera de VERKLIGA binärerna mot en VERKLIG
AgentProxy-server, finns en opt-in-harnes på
`tests/integration/upstream-cli-smoke.int.test.ts`. Den körs aldrig automatiskt
(varje deltest hoppar över om inte `RUN_CLI_SMOKE=1`), passerar uppgiften via miljövariabel
NAMN (aldrig via värde), redigerar nyckelformade strängar från all inspelad utdata, hoppar
över mål vars binär inte är installerad, och klassificerar misslyckanden som
autentisering / upstream / konfiguration istället för en ren boolean:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Valfritt: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` begränsar svepet;
`AGENTPROXY_SMOKE_TIMEOUT_MS` åsidosätter 120s per-mål timeout.

## Se även

- [Claude Code-konfiguration](./CLAUDE-CODE-CONFIGURATION.md) — den djupare Claude Code-guiden
- [Codex CLI-konfiguration](./CODEX-CLI-CONFIGURATION.md) — den engångs `[model_providers.agentproxy]` grundinställningen
- [Fjärrläge](./REMOTE-MODE.md) — kontexter, avgränsade åtkomsttoken, styra en fjärrserver
- [CLI-verktyg referens](../reference/CLI-TOOLS.md) — hela katalogen av stödda verktyg + instrumentpanelssidor
- [Installationsguide](./SETUP_GUIDE.md) — installationsmetoder och onboarding vid första körning
