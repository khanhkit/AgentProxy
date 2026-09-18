# CLI-INTEGRATIONS (Kiswahili)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI Mchanganyiko — elekeza CLI ya uandishi kwenye AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI Mchanganyiko

AgentProxy inatoa familia ya amri `setup-*` ambazo zinaweka mchanganyiko wa uandishi
CLI (Codex, Claude Code, OpenCode, Cline, …) kutumia AgentProxy kama backend yake — hivyo
chombo kinawasiliana na **nukta** moja na AgentProxy inaelekeza kwa mtoa huduma sahihi kwa
kuanguka kiotomatiki. Kila amri inasoma **katalogi** ya mfano wa moja kwa moja kutoka kwa
AgentProxy inayofanya kazi (ya ndani au ya mbali) na kuandika faili la usanidi la chombo
kwenye **kompyuta yako**. Funguo ya API inarejelewa na mabadiliko ya mazingira popote ambapo chombo
kinaiunga mkono. Amri ambazo zinaweka faili la mazingira la chombo la ndani zimeandikwa hapa chini.

Pia kuna mchezaji wa jumla — `agentproxy run <target>` — ambaye anazalisha
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` au `gemini` na
muhimu sahihi ikingizwa, bila kuandika usanidi wowote. Malengo na majina yao
yanatoka kwenye orodha ya kawaida `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), na `agentproxy completion` inatoa
maneno ya malengo yanayotokana na orodha hiyo. Mchezaji wa zamani wa kila chombo —
`agentproxy launch` (Claude Code) na `agentproxy launch-codex` (Codex) — bado
zinapatikana.

Kujiunga na mtoa huduma kunapatikana kutoka kwa muktadha wa ndani/mbali. Amri
za API-kwanza hapa chini zinaweka uthibitishaji wa usimamizi tofauti na
akidi za mtoa huduma na kamwe hazichapishi akidi katika matokeo yaliyopangwa:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Kwa scripts, pendelea `--credential-stdin` au `--credential-env`; `--credential`
imehifadhiwa kwa matumizi ya ndani yaliyodhibitiwa. `providers remove` inahitaji `--yes` kwenye
terminal isiyoingiliana, na amri zote tano heshimu muktadha wa sasa au chaguo za
global `--base-url`/`--api-key`.

Kwa usanidi wa msingi wa mara moja, wa mikono wa mchanganyiko wenye utajiri zaidi, angalia
uchambuzi wa kina wa kila chombo:

- [Usanidi wa Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Usanidi wa Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Hali ya Mbali](./REMOTE-MODE.md) — endesha AgentProxy ya mbali (VPS / Tailnet) kutoka kwa kompyuta yako
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — nyongeza ya OmniCopilot; inaweza pia kuendesha hizi
  `setup-*` amri kwa niaba yako kutoka ndani ya mhariri

---

## Jedwali Kuu

Kila amri heshimu **muktadha wa sasa** (iliyowekwa na `agentproxy connect`, ona
[Hali ya Mbali](./REMOTE-MODE.md)) au bendera wazi `--remote <url> --api-key <key>`.
"Ya ndani dhidi ya mbali" hapa chini inamaanisha: bila bendera inashughulikia `http://localhost:20128`;
ikiwa na `--remote` (au muktadha wa mbali ulio hai) inapata katalogi kutoka kwa
seva hiyo na kuandika usanidi kwa ndani.

| Amri                       | Chombo                        | Kile kinachoandikwa                                                                                                                                      | Bendera muhimu                                                                                                                             | Ya ndani dhidi ya mbali |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI              | `~/.codex/<name>.config.toml` — wasifu mmoja kwa kila mfano wa maandiko unaofaa (`codex --profile <name>`)                                               | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Zote                    |
| `agentproxy setup-claude`   | Claude Code                   | `~/.claude/profiles/<name>/settings.json` — wasifu mmoja kwa kila mfano uliofanana (`CLAUDE_CONFIG_DIR`)                                                 | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Zote                    |
| `agentproxy setup-opencode` | OpenCode (inayofaa na openai) | `~/.config/opencode/opencode.json` — mtoa huduma wa `agentproxy` na kila mfano wa katalogi (`opencode -m agentproxy/<model>`)                              | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Zote                    |
| `agentproxy setup-cline`    | Cline                         | `~/.cline/data/{globalState,secrets}.json` (hali ya CLI) + inachapisha mipangilio ya nyongeza ya VS Code                                                 | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Zote                    |
| `agentproxy setup-kilo`     | Kilo Code                     | `~/.local/share/kilo/auth.json` (CLI) + inachanganya `kilocode.*` katika `settings.json` ya VS Code ikiwa inapatikana                                    | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Zote                    |
| `agentproxy setup-continue` | Continue / `cn` CLI           | `~/.continue/config.yaml` — `provider: openai` mifano, funguo kupitia `${{ secrets.AGENTPROXY_API_KEY }}`                                                 | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Zote                    |
| `agentproxy setup-cursor`   | Cursor                        | Hakuna — inachapisha hatua za ndani ya programu (mipangilio ya Cursor ni SQLite isiyoonekana)                                                            | `--remote` `--api-key` `--only` `--port`                                                                                                   | Zote                    |
| `agentproxy setup-roo`      | Roo Code                      | `~/.agentproxy/roo-settings.json` (nyaraka ya kuagiza) + inaweka `roo-cline.autoImportSettingsPath` ikiwa `settings.json` ya VS Code inapatikana          | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Zote                    |
| `agentproxy setup-crush`    | Crush                         | `~/.config/crush/crush.json` — mtoa huduma wa `openai-compat`, funguo kupitia `$AGENTPROXY_API_KEY`                                                       | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Zote                    |
| `agentproxy setup-goose`    | Goose                         | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + inachapisha mapishi ya mazingira                                          | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Zote                    |
| `agentproxy setup-aider`    | Aider                         | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + inachapisha mapishi ya mazingira                                                        | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Zote                    |
| `agentproxy setup-qwen`     | Qwen Code                     | `~/.qwen/settings.json` — V4 `modelProviders.openai` orodha + `AGENTPROXY_API_KEY` katika `~/.qwen/.env`                                                  | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Zote                    |
| `agentproxy run <target>`   | Uzinduzi wa wakati (jumla)    | Hakuna — anazalisha `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` na mazingira na hoja sahihi; Qwen na Gemini hutumia nyumbani iliyotengwa | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Zote                    |
| `agentproxy launch`         | Claude Code                   | Hakuna — anazalisha `claude` na `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` ikingizwa                                                                    | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Zote                    |
| `agentproxy launch-codex`   | OpenAI Codex CLI              | Hakuna — anazalisha `codex` na mtoa huduma wa `agentproxy` ikingizwa kupitia bendera `-c`                                                                 | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Zote                    |

Maelezo kuhusu bendera (yamehakikishwa katika chanzo cha amri):

- `--remote <url>` — pata katalogi kutoka kwa AgentProxy ya mbali (inabatilisha `--port`
  na muktadha wa sasa). `--api-key <key>` inatoa akidi kwa ajili ya
  seva hiyo (inatumika kama chaguo la `AGENTPROXY_API_KEY` env var, au token ya muktadha wa sasa).
- `--only <patterns>` — sehemu za maandiko zilizotenganishwa kwa koma; hifadhi tu vitambulisho vya mfano vinavyolingana
  (mfano `--only glm,kimi`). Inapatikana kwenye `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — chapisha hasa kile ambacho kingeandikwa bila kugusa
  mfumo wa faili. Inapatikana kwenye kila amri ya `setup-*` **isipokuwa** `setup-cursor`
  (ambayo kamwe haiandiki faili).
- `--model <id>` — inahitajika (au kuchaguliwa kwa njia ya mwingiliano) kwa zana ambazo hazina
  ugunduzi wa mfano kiotomatiki: Cline, Kilo, Roo, Goose, Qwen, Aider. Zana hizo
  pia zinakubali `--yes` kwa matumizi yasiyoingiliana (ambayo kisha inahitaji `--model`).
  `setup-opencode` inachukua `--model` kuweka mfano wa juu wa default.
- `--model <id>` kwenye `agentproxy run` inafuata uunganisho wa orodha ya malengo
  (`bin/cli/cli-manifest.mjs`): **aider** inapata `--model openai/<id>` na
  **opencode** `--model agentproxy/<id>` (kiambatisho kinajumuishwa tu wakati id
  haijabeba tayari); **qwen** na **gemini** zinapata id kama ilivyo; **claude** inapata kupitia `ANTHROPIC_MODEL`, **goose** kupitia `GOOSE_MODEL`, na
  **codex** kupitia `-c model_providers.agentproxy.*` hoja. **Qwen ndiyo lengo pekee la kuendesha
  ambalo linahitaji kwa nguvu `--model`** — `agentproxy run qwen` bila hiyo inatoka
  `2` na makosa wazi.
- `--port <port>` — bandari ya ndani ya AgentProxy (chaguo la msingi `20128`, ignored when `--remote`
  is set). Ipo kwenye kila `setup-*` na mchezaji wote wawili.
- Nambari za kutoka za `agentproxy run`: nambari ya kutoka ya CLI ya mtoto inasambazwa
  kama ilivyo; `2` = hoja zisizo sahihi (lengo lisiloungwa mkono, kukosa
  `--model` inayohitajika, mlinzi wa kontena); `127` = faili la lengo halipo katika `PATH`;
  `130`/`143`/`129` wakati uzinduzi unamalizika kwa `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = kushindwa kwa uzinduzi mwingine wa wakati.
- Wachezaji wawili (`launch`, `launch-codex`) wanakubali `--profile <name>` kuchagua
  wasifu ulioandikwa na `setup-claude` / `setup-codex`, pamoja na hoja za kupitisha kwa
  faili ya msingi ya `claude` / `codex`.

Mchaguzi wa mwingiliano pia unashirikiwa na mapishi ya usanidi:

```bash
# Chagua kutoka kwa katalogi ya mfano wa ndani au wa mbali na uweke malengo.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` kwa sasa inapeleka kwa mapishi yaliyopimwa kwa `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, na `kilo`. Katalogi za IDE pekee,
MITM, na zile za mwongozo pekee zinabaki kuwa wazi `setup-*`/mchakato wa mikono na
hazionyeshwi kama malengo yanayoweza kuzinduliwa.

> `setup-opencode` ni mchanganyiko wa **nyepesi unaofaa na openai** wa OpenCode.
> Pia kuna mchanganyiko wa nyongeza wenye utajiri zaidi — `agentproxy setup opencode` — ambayo
> inasakinisha `@agentproxy/opencode-plugin`. Hizi ni amri tofauti; jedwali
> hapo juu linaelezea `setup-opencode`.

---

## Matumizi ya ndani

Ikiwa AgentProxy inafanya kazi kwenye `localhost:20128`, endesha tu amri ya usanidi kwa zana yako. Katalogi inapatikana kutoka kwa seva ya ndani.

```bash
# Codex: andika profaili kwa kila mfano uliofanikiwa kwenye ~/.codex/
agentproxy setup-codex
codex --profile glm52            # tumia profaili iliyoundwa

# Claude Code: andika profaili za kila mfano, kisha anzisha moja
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: andika mtoa huduma anayefaa na modeli zote za katalogi
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # inarejelea kupitia {env:AGENTPROXY_API_KEY}, kamwe sio kwenye diski
opencode -m agentproxy/glm/glm-5.2 "..."

# Zana ambazo hazina kugunduliwa kiotomatiki zinahitaji mfano wazi:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Tazama bila kuandika chochote:
agentproxy setup-continue --dry-run
```

Anzisha bila kuandika usanidi wowote (injection ya env pekee):

```bash
agentproxy launch                 # Claude Code → AgentProxy ya ndani
agentproxy launch-codex           # Codex CLI → AgentProxy ya ndani
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Njia ya amri wazi: pitisha chochote kinachokuja baada ya --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Matumizi ya mbali

Elekeza amri yoyote ya usanidi kwenye AgentProxy ya mbali kwa `--remote` + `--api-key`. Katalogi inapatikana kutoka kwa mbali; usanidi unandikwa kwenye mashine yako ya ndani.

```bash
# OpenCode dhidi ya VPS ya mbali, hifadhi tu modeli za glm/kimi
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # export AGENTPROXY_API_KEY kwanza

# Profaili za Codex kutoka kwa katalogi ya mbali
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Anzisha CLI moja kwa moja dhidi ya mbali
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Badala ya kupitisha `--remote`/`--api-key` kila wakati, ingia mara moja na uache
**muktadha wa kazi** iwape kiotomatiki:

```bash
agentproxy connect 192.168.0.15        # inaunda token iliyo na upeo, inahifadhi muktadha
agentproxy setup-codex                 # ← sasa inatumia katalogi ya mbali
agentproxy setup-opencode              # ← sawa
agentproxy launch                      # ← Claude Code dhidi ya mbali
```

Tazama [Njia ya Mbali](./REMOTE-MODE.md) kwa muktadha, upeo, na usimamizi wa tokeni.

---

## Mikataba ya URL ya Msingi (ambayo zana zinataka `/v1`)

AgentProxy inatoa uso wa OpenAI kwenye `/v1`, uso wa Anthropic kwenye mzizi,
na uso wa asili wa Gemini kwenye `/v1beta`. Kila ujumuishaji umeunganishwa na fomu ambayo
zana yake inatarajia (imehakikishwa katika chanzo cha amri):

| Ujumuishaji                                                                | URL ya Msingi iliyoandikwa | `/v1`?                                            |
| -------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------- |
| `setup-cline` (`openAiBaseUrl`)                                            | mzizi                      | Hapana — Cline inaongeza `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | mzizi                      | Hapana — Goose inaongeza njia                     |
| `setup-aider` (`OPENAI_API_BASE`)                                          | mzizi                      | Hapana — LiteLLM inaongeza `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | pamoja na `/v1`            | Ndio                                              |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | mzizi                      | Hapana — Claude Code inaongeza `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | pamoja na `/v1`            | Ndio                                              |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | pamoja na `/v1`            | Ndio                                              |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | mzizi                      | Hapana — SDK inaongeza `/v1beta/models/…`         |

---

## Kuhifadhi utegemezi wa asili kwenye sasisho: `--include=optional`

Unaposasisha kwa kutumia `agentproxy update` (baada ya kuthibitisha, au kwa `--apply`),
AgentProxy inatekeleza usakinishaji kwa kutumia `--include=optional` iliyojumuishwa:

```bash
npm install -g agentproxy@latest --include=optional
```

Hii **si** bendera unayoipatia `agentproxy update` — inatumika kila wakati na
mwandikaji wa sasisho. Inahakikisha kwamba `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, stack ya LLMLingua SLM) inabaki baada ya sasisho hata kama usanidi wako wa npm
una `omit=optional` umewekwa, ambayo vinginevyo ingesababisha kimya kuondoa dereva wa SQLite
wa asili na uhusiano wa OS-keyring. Ili kuangalia amri halisi bila kutekeleza:

```bash
agentproxy update --dry-run
# [DRY RUN] Ingefanya: npm install -g agentproxy@latest --include=optional
```

Bendera nyingine za `agentproxy update` (zilizothibitishwa kwenye chanzo): `--check` (ondoka 1 ikiwa
imepitwa na wakati), `--apply` (sakinisha bila kuomba), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI kupitia `agentproxy run gemini`

Mkataba umehakikishwa dhidi ya `@google/gemini-cli` 0.50.0: CLI inaheshimu
`GOOGLE_GEMINI_BASE_URL` na kutoa `POST /v1beta/models/<model>:generateContent`
(na `:streamGenerateContent?alt=sse`) dhidi yake — hasa uso wa asili wa
Gemini wa AgentProxy (`/v1beta`). `agentproxy run gemini` inafanya hivyo kiotomatiki:

- `GOOGLE_GEMINI_BASE_URL` → URL ya msingi ya AgentProxy inayotumika (mizizi, hakuna `/v1`);
- `GEMINI_API_KEY` → akidi ya AgentProxy iliyotatuliwa (chaguo/env/muktadha);
- **nyumba ya muda ya `GEMINI_CLI_HOME`** ambayo `.gemini/settings.json`
  inachagua uthibitisho wa `gemini-api-key`, hivyo kikao kilichohifadhiwa cha Google OAuth (Code Assist)
  hakitabadilisha uzinduzi unaoelekezwa na AgentProxy — inatolewa baada ya kutoka;
- **usafi wa env**: env ya mtoto imeondolewa `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` na `GOOGLE_GENAI_USE_GCA` (ambayo ingerejelea
  uthibitisho kwa Vertex/Code Assist), na `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` imewekwa
  kama akiba ya ziada — malengo mengine ya `run` yanapata matibabu sawa
  kwa mabadiliko yao yanayopingana;
- `--model <id>` kuingizwa kutoka `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Mlinzi wa uaminifu wa Gemini bado unatumika katika hali isiyo na kichwa — pitisha
`--skip-trust` (au uamini saraka kwa njia ya mwingiliano) mwenyewe; uzinduzi
kwa makusudi haupiti. Uzinduzi huu ni tofauti na **usajili wa ACP**
(`src/lib/acp/registry.ts`, `gemini --acp`), ambayo inabaki kuwa
kuunganishwa kwa wakala-protokali kwa `/dashboard/acp-agents`.

---

## Safisha moshi halisi (kujiunga)

Mipango ya uzinduzi wa kisheria inakimbia katika CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Ili kuthibitisha binaries HALISI dhidi ya
server HALISI ya AgentProxy, kuna vifaa vya kujiunga katika
`tests/integration/upstream-cli-smoke.int.test.ts`. Hii haitakimbia kiotomatiki
(kila mtihani wa chini unakosa isipokuwa `RUN_CLI_SMOKE=1`), inapitia akidi kwa jina la env-var
(NAME (sio kwa thamani), inaficha nyuzi za funguo kutoka kwa matokeo yoyote yaliyorekodiwa, inakosa
malengo ambayo binary yake haijasanidiwa, na inakadiria kushindwa kama
uthibitisho / mwelekeo / usanidi badala ya boolean tupu:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Hiari: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` inapunguza safu;
`AGENTPROXY_SMOKE_TIMEOUT_MS` inabadilisha muda wa sekunde 120 kwa kila lengo.

---

## Tazama pia

- [Usanidi wa Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — mwongozo wa kina wa Claude Code
- [Usanidi wa Codex CLI](./CODEX-CLI-CONFIGURATION.md) — usanidi wa msingi wa mara moja `[model_providers.agentproxy]`
- [Hali ya Kijijini](./REMOTE-MODE.md) — muktadha, alama za ufikiaji zilizopangwa, kuendesha seva ya kijijini
- [Marejeleo ya Zana za CLI](../reference/CLI-TOOLS.md) — katalogi kamili ya zana zinazoungwa mkono + kurasa za dashibodi
- [Mwongozo wa Usanidi](./SETUP_GUIDE.md) — mbinu za usakinishaji na kuanzisha mara ya kwanza
