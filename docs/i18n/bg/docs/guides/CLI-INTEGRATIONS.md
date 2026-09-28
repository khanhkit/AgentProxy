# CLI-INTEGRATIONS (Български)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI Интеграции — насочете всяко CLI за кодиране към AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI Интеграции

AgentProxy предлага набор от команди `setup-*`, които конфигурират CLI за кодиране (Codex, Claude Code, OpenCode, Cline и др.) да използва AgentProxy като свой бекенд — така инструментът комуникира с **една** крайна точка и AgentProxy маршрутизира към правилния доставчик с автоматично резервиране. Всяка команда чете **активния** каталог на моделите от работещ AgentProxy (локален или отдалечен) и записва конфигурационния файл на инструмента на **вашата** машина. API ключът се посочва чрез променлива на средата, където инструментът го поддържа. Командите, които запазват локален файл на средата на инструмента, са отбелязани по-долу.

Има и универсален стартер — `agentproxy run <target>` — който стартира `claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` или `gemini` с правилно инжектирана среда, без да записва никаква конфигурация. Целите и техните псевдоними идват от каноничния манифест `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), а `agentproxy completion` предлага
същите целеви думи, произтичащи от манифеста. Легаси стартерите за всеки инструмент —
`agentproxy launch` (Claude Code) и `agentproxy launch-codex` (Codex) — остават
достъпни.

Включването на доставчици е налично от същия локален/отдалечен контекст. Командите с API-първи подход по-долу поддържат управлението на удостоверяване отделно от удостоверителните данни на доставчика и никога не отпечатват удостоверителни данни в структурирания изход:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

За скриптове, предпочитайте `--credential-stdin` или `--credential-env`; `--credential`
се запазва за контролирана локална употреба. `providers remove` изисква `--yes` на
неинтерактивен терминал, а всички пет команди уважават активния контекст или глобалните опции `--base-url`/`--api-key`.

За еднократната, ръчно написана основна настройка на двата най-богати интеграции, вижте
дълбочинните анализи за всеки инструмент:

- [Конфигурация на Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Конфигурация на Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Отдалечен режим](./REMOTE-MODE.md) — управлявайте отдалечен AgentProxy (VPS / Tailnet) от вашия лаптоп
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — разширението OmniCopilot; то може също да изпълнява тези
  `setup-*` команди вместо вас от вътре в редактора

---

## Основна таблица

Всяка команда уважава **активния контекст** (настроен с `agentproxy connect`, вижте
[Отдалечен режим](./REMOTE-MODE.md)) или явни флагове `--remote <url> --api-key <key>`.
"Локално срещу отдалечено" по-долу означава: без флагове, целта е `http://localhost:20128`;
с `--remote` (или активен отдалечен контекст) извлича каталога от този
сървър и записва конфигурацията локално.

| Команда                    | Инструмент                        | Какво записва                                                                                                                                                  | Ключови флагове                                                                                                                            | Локално срещу отдалечено |
| -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `agentproxy setup-codex`    | OpenAI Codex CLI                  | `~/.codex/<name>.config.toml` — един профил за всеки съвместим текстов модел (`codex --profile <name>`)                                                        | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | И двете                  |
| `agentproxy setup-claude`   | Claude Code                       | `~/.claude/profiles/<name>/settings.json` — един профил за всеки съвпадащ модел (`CLAUDE_CONFIG_DIR`)                                                          | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | И двете                  |
| `agentproxy setup-opencode` | OpenCode (съвместим с openai)     | `~/.config/opencode/opencode.json` — `agentproxy` доставчик с всеки модел от каталога (`opencode -m agentproxy/<model>`)                                         | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | И двете                  |
| `agentproxy setup-cline`    | Cline                             | `~/.cline/data/{globalState,secrets}.json` (CLI режим) + отпечатва настройки за разширението на VS Code                                                        | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | И двете                  |
| `agentproxy setup-kilo`     | Kilo Code                         | `~/.local/share/kilo/auth.json` (CLI) + слива `kilocode.*` в `settings.json` на VS Code, ако е наличен                                                         | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | И двете                  |
| `agentproxy setup-continue` | Continue / `cn` CLI               | `~/.continue/config.yaml` — `provider: openai` модели, ключ чрез `${{ secrets.AGENTPROXY_API_KEY }}`                                                            | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | И двете                  |
| `agentproxy setup-cursor`   | Cursor                            | Нищо — отпечатва стъпките в приложението (конфигурацията на Cursor е непрозрачна SQLite)                                                                       | `--remote` `--api-key` `--only` `--port`                                                                                                   | И двете                  |
| `agentproxy setup-roo`      | Roo Code                          | `~/.agentproxy/roo-settings.json` (импортен документ) + задава `roo-cline.autoImportSettingsPath`, ако съществува `settings.json` на VS Code                    | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | И двете                  |
| `agentproxy setup-crush`    | Crush                             | `~/.config/crush/crush.json` — `openai-compat` доставчик, ключ чрез `$AGENTPROXY_API_KEY`                                                                       | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | И двете                  |
| `agentproxy setup-goose`    | Goose                             | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + отпечатва рецепта за среда                                                      | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | И двете                  |
| `agentproxy setup-aider`    | Aider                             | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + отпечатва рецепта за среда                                                                    | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | И двете                  |
| `agentproxy setup-qwen`     | Qwen Code                         | `~/.qwen/settings.json` — V4 `modelProviders.openai` масив + `AGENTPROXY_API_KEY` в `~/.qwen/.env`                                                              | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | И двете                  |
| `agentproxy run <target>`   | Стартиране на време (универсално) | Нищо — стартира `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` с правилната среда и аргументи; Qwen и Gemini използват временно изолирано домашно | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | И двете                  |
| `agentproxy launch`         | Claude Code                       | Нищо — стартира `claude` с инжектирани `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`                                                                             | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | И двете                  |
| `agentproxy launch-codex`   | OpenAI Codex CLI                  | Нищо — стартира `codex` с инжектиран `agentproxy` доставчик чрез `-c` флагове                                                                                   | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | И двете                  |

Бележки относно флаговете (потвърдени в източника на командата):

- `--remote <url>` — извлича каталога от отдалечен AgentProxy (презаписва `--port`
  и активния контекст). `--api-key <key>` предоставя удостоверителните данни за този
  сървър (по подразбиране е `AGENTPROXY_API_KEY` променливата на средата или токена на активния контекст).
- `--only <patterns>` — низове, разделени с запетаи; запазва само идентификаторите на моделите, които съвпадат
  (например `--only glm,kimi`). Наличен на `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — отпечатва точно какво би било записано, без да засяга
  файловата система. Наличен на всяка команда `setup-*` **освен** `setup-cursor`
  (която никога не записва файл).
- `--model <id>` — задължителен (или избран интерактивно) за инструментите, които нямат
  автоматично откриване на модел: Cline, Kilo, Roo, Goose, Qwen, Aider. Тези инструменти
  също приемат `--yes` за неинтерактивни изпълнения (което след това изисква `--model`).
  `setup-opencode` приема `--model`, за да зададе основния модел на най-високо ниво.
- `--model <id>` на `agentproxy run` следва свързването на манифеста за всяка цел
  (`bin/cli/cli-manifest.mjs`): **aider** получава `--model openai/<id>` и
  **opencode** `--model agentproxy/<id>` (префиксът се добавя само когато идентификаторът
  не го носи); **qwen** и **gemini** получават идентификатора без промяна;
  **claude** го получава чрез `ANTHROPIC_MODEL`, **goose** чрез `GOOSE_MODEL`, а
  **codex** чрез `-c model_providers.agentproxy.*` аргументи. **Qwen е единствената цел за изпълнение, която изисква `--model`** — `agentproxy run qwen` без него излиза
  `2` с явна грешка.
- `--port <port>` — локален порт на AgentProxy (по подразбиране `20128`, игнорира се, когато е зададен `--remote`).
  Наличен на всички `setup-*` и двата стартера.
- Кодове за изход на `agentproxy run`: изходният код на детското CLI се предава
  без промяна; `2` = невалидни аргументи (неподдържана цел, липсващ задължителен
  `--model`, защитник на контейнера); `127` = целевият бинарен файл не е в `PATH`;
  `130`/`143`/`129`, когато стартирането е прекратено от `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = друга грешка при стартиране.
- Двата стартера (`launch`, `launch-codex`) приемат `--profile <name>` за избор
  на профил, написан от `setup-claude` / `setup-codex`, плюс аргументи за
  предаване за основния бинарен файл `claude` / `codex`.

Интерактивният селектор също се споделя от рецептите за настройка:

```bash
# Изберете от активния локален или отдалечен каталог на модели и конфигурирайте целта.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` в момента делегира на тестваните рецепти за `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue` и `kilo`. Записите само за IDE,
MITM и само за ръководства остават явни `setup-*`/ръчни потоци и не се представят като целеви за стартиране.

> `setup-opencode` е **леката интеграция, съвместима с openai** OpenCode.
> Има и по-богата интеграция с плъгин — `agentproxy setup opencode` — която
> инсталира `@agentproxy/opencode-plugin`. Те са различни команди; таблицата
> по-горе документира `setup-opencode`.

---

## Локално използване

С AgentProxy, работещ на `localhost:20128`, просто стартирайте командата за настройка на вашия инструмент. Каталогът се извлича от локалния сървър.

```bash
# Codex: пише профил за всяка съвпаднала модел в ~/.codex/
agentproxy setup-codex
codex --profile glm52            # използвайте генериран профил

# Claude Code: пише профили за всеки модел, след което стартира един
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: пише съвместим с openai доставчик с всички модели от каталога
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # реферирано чрез {env:AGENTPROXY_API_KEY}, никога на диск
opencode -m agentproxy/glm/glm-5.2 "..."

# Инструменти без автоматично откриване се нуждаят от явен модел:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Преглед без записване на нищо:
agentproxy setup-continue --dry-run
```

Стартирайте без записване на никаква конфигурация (само инжектиране на среда):

```bash
agentproxy launch                 # Claude Code → локален AgentProxy
agentproxy launch-codex           # Codex CLI → локален AgentProxy
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Ясен път на командата: предайте всичко, което идва след --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Отдалечено използване

Посочете всяка команда за настройка на отдалечен AgentProxy с `--remote` + `--api-key`. Каталогът се извлича от отдалеченото; конфигурацията се записва на вашия локален компютър.

```bash
# OpenCode срещу отдалечен VPS, запазете само glm/kimi модели
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # първо експортирайте AGENTPROXY_API_KEY

# Профили Codex от отдалечен каталог
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Стартирайте CLI директно срещу отдалеченото
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Вместо да предавате `--remote`/`--api-key` всеки път, влезте веднъж и оставете **активния контекст** да ги предоставя автоматично:

```bash
agentproxy connect 192.168.0.15        # генерира ограничен токен, съхранява контекста
agentproxy setup-codex                 # ← сега използва отдалечения каталог
agentproxy setup-opencode              # ← същото
agentproxy launch                      # ← Claude Code срещу отдалеченото
```

Вижте [Отдалечен режим](./REMOTE-MODE.md) за контексти, обхвати и управление на токени.

---

## Конвенции за основен URL (които инструменти искат `/v1`)

AgentProxy излага OpenAI интерфейса на `/v1`, Anthropic интерфейса на корена, и местен Gemini интерфейс на `/v1beta`. Всяка интеграция е свързана с формата, който инструментът очаква (потвърдено в източника на командата):

| Интеграция                                                                 | Основен URL написан | `/v1`?                                     |
| -------------------------------------------------------------------------- | ------------------- | ------------------------------------------ |
| `setup-cline` (`openAiBaseUrl`)                                            | корен               | Не — Cline добавя `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | корен               | Не — Goose добавя пътя                     |
| `setup-aider` (`OPENAI_API_BASE`)                                          | корен               | Не — LiteLLM добавя `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | с `/v1`             | Да                                         |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | корен               | Не — Claude Code добавя `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | с `/v1`             | Да                                         |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | с `/v1`             | Да                                         |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | корен               | Не — SDK добавя `/v1beta/models/…`         |

---

## Поддържане на местни зависимости при актуализация: `--include=optional`

Когато актуализирате с `agentproxy update` (след потвърждение или с `--apply`),
AgentProxy изпълнява инсталацията с вградена опция `--include=optional`:

```bash
npm install -g agentproxy@latest --include=optional
```

Това **не е** флаг, който предавате на `agentproxy update` — той винаги се прилага от
актуализатора. Това гарантира, че `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, LLMLingua SLM стекът) оцеляват при актуализация, дори ако вашата npm конфигурация
има зададено `omit=optional`, което в противен случай тихо би премахнало местния SQLite
драйвер и свързването с OS-keyring. За да прегледате точната команда без прилагане:

```bash
agentproxy update --dry-run
# [DRY RUN] Ще изпълни: npm install -g agentproxy@latest --include=optional
```

Други флагове на `agentproxy update` (потвърдени в източника): `--check` (изход 1, ако
остарял), `--apply` (инсталира без подканване), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI чрез `agentproxy run gemini`

Договорът е потвърден спрямо `@google/gemini-cli` 0.50.0: CLI-то уважава
`GOOGLE_GEMINI_BASE_URL` и издава `POST /v1beta/models/<model>:generateContent`
(и `:streamGenerateContent?alt=sse`) срещу него — точно така, както е местната
Gemini повърхност на AgentProxy (`/v1beta`). `agentproxy run gemini` автоматично
свързва това:

- `GOOGLE_GEMINI_BASE_URL` → активният базов URL на AgentProxy (корен, без `/v1`);
- `GEMINI_API_KEY` → разрешените идентификационни данни на AgentProxy (опция/среда/контекст);
- **временен изолиран `GEMINI_CLI_HOME`**, чийто `.gemini/settings.json`
  избира `gemini-api-key` удостоверяване, така че съхранената Google OAuth сесия (Code Assist)
  никога да не замества стартирането, насочено от AgentProxy — премахва се след изход;
- **чистота на средата**: детската среда е почистена от `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` и `GOOGLE_GENAI_USE_GCA` (които биха пренасочили
  удостоверяването към Vertex/Code Assist), и `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` е
  зададено като резервен вариант — другите цели на `run` получават същото
  третиране за техните конфликтни променливи;
- инжектиране на `--model <id>` от `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Пазачът на доверие на работното пространство на Gemini все още важи в безглав режим — предайте
`--skip-trust` (или доверете директорията интерактивно) сами; стартерът
умишлено не го заобикаля. Този стартер е различен от **регистрацията на ACP**
(`src/lib/acp/registry.ts`, `gemini --acp`), която остава интеграция на агент-протокол за `/dashboard/acp-agents`.

---

## Истинско почистване на дим (по избор)

Детерминираният план за стартиране на регресия се изпълнява в CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). За да валидирате ИСТИНСКИТЕ бинарни файлове спрямо ИСТИНСКИ
сървър на AgentProxy, съществува опционален хъб на
`tests/integration/upstream-cli-smoke.int.test.ts`. Той никога не се изпълнява автоматично
(всяко под-тест пропуска, освен ако `RUN_CLI_SMOKE=1`), предава удостоверението чрез променлива на средата
NAME (никога по стойност), цензурира ключоподобни низове от всякакъв записан изход, пропуска
цели, чийто бинарен файл не е инсталиран, и класифицира неуспехите като
удостоверяване / upstream / конфигурация вместо просто булева стойност:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Опционално: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` ограничава почистването;
`AGENTPROXY_SMOKE_TIMEOUT_MS` заменя 120-секундния таймаут за всяка цел.

## Вижте също

- [Конфигурация на Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — по-дълбокото ръководство за Claude Code
- [Конфигурация на Codex CLI](./CODEX-CLI-CONFIGURATION.md) — еднократната основна настройка `[model_providers.agentproxy]`
- [Отдалечен режим](./REMOTE-MODE.md) — контексти, ограничени токени за достъп, управление на отдалечен сървър
- [Справочник на CLI инструментите](../reference/CLI-TOOLS.md) — пълният каталог на поддържаните инструменти + страници на таблото
- [Ръководство за настройка](./SETUP_GUIDE.md) — методи за инсталиране и първоначално запознаване
