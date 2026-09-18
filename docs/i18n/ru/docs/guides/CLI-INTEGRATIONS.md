# CLI-INTEGRATIONS (Русский)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI Интеграции — настройте любой кодирующий CLI для работы с AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI Интеграции

AgentProxy поставляется с набором команд `setup-*`, которые настраивают кодирующий
CLI (Codex, Claude Code, OpenCode, Cline и др.) для использования AgentProxy в качестве бэкенда — так
инструмент обращается к **одному** конечному пункту, а AgentProxy перенаправляет к нужному провайдеру с
авто-резервированием. Каждая команда считывает **живой** каталог моделей с работающего
AgentProxy (локального или удаленного) и записывает собственный конфигурационный файл инструмента на **вашей**
машине. API-ключ ссылается на переменную окружения, где это поддерживается инструментом. Команды, которые сохраняют локальный файл окружения инструмента, указаны ниже.

Также есть универсальный запускатель — `agentproxy run <target>` — который запускает
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` или `gemini` с
правильной средой, без записи какой-либо конфигурации. Цели и их
псевдонимы берутся из канонического манифеста `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), а `agentproxy completion` предлагает
те же слова целей, полученные из манифеста. Устаревшие запускатели для каждого инструмента —
`agentproxy launch` (Claude Code) и `agentproxy launch-codex` (Codex) — остаются
доступными.

Подключение провайдеров доступно из того же локального/удаленного контекста. Команды
с API внизу отделяют управление аутентификацией от учетных данных провайдера и никогда не выводят учетные данные в структурированном выводе:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Для скриптов предпочтительнее использовать `--credential-stdin` или `--credential-env`; `--credential`
сохраняется для контролируемого локального использования. `providers remove` требует `--yes` на
неинтерактивном терминале, и все пять команд учитывают активный контекст или глобальные опции `--base-url`/`--api-key`.

Для одноразовой, ручной базовой настройки двух самых богатых интеграций смотрите
глубокие погружения по каждому инструменту:

- [Конфигурация Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Конфигурация Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Удаленный режим](./REMOTE-MODE.md) — управляйте удаленным AgentProxy (VPS / Tailnet) с вашего ноутбука
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — расширение OmniCopilot; оно также может выполнять эти
  команды `setup-*` за вас изнутри редактора

---

## Основная таблица

Каждая команда учитывает **активный контекст** (установленный с помощью `agentproxy connect`, см.
[Удаленный режим](./REMOTE-MODE.md)) или явные флаги `--remote <url> --api-key <key>`.
"Локальный против удаленного" ниже означает: без флагов она нацелена на `http://localhost:20128`;
с `--remote` (или активным удаленным контекстом) она получает каталог с этого
сервера и записывает конфигурацию локально.

| Команда                    | Инструмент                                 | Что она записывает                                                                                                                                                     | Ключевые флаги                                                                                                                             | Локальный против удаленного |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI                           | `~/.codex/<name>.config.toml` — один профиль для каждой совместимой текстовой модели (`codex --profile <name>`)                                                        | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Оба                         |
| `agentproxy setup-claude`   | Claude Code                                | `~/.claude/profiles/<name>/settings.json` — один профиль для каждой совпадающей модели (`CLAUDE_CONFIG_DIR`)                                                           | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Оба                         |
| `agentproxy setup-opencode` | OpenCode (совместимый с openai)            | `~/.config/opencode/opencode.json` — провайдер `agentproxy` с каждой моделью каталога (`opencode -m agentproxy/<model>`)                                                 | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Оба                         |
| `agentproxy setup-cline`    | Cline                                      | `~/.cline/data/{globalState,secrets}.json` (CLI режим) + выводит настройки расширения VS Code                                                                          | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Оба                         |
| `agentproxy setup-kilo`     | Kilo Code                                  | `~/.local/share/kilo/auth.json` (CLI) + объединяет `kilocode.*` в `settings.json` VS Code, если он присутствует                                                        | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Оба                         |
| `agentproxy setup-continue` | Continue / `cn` CLI                        | `~/.continue/config.yaml` — модели `provider: openai`, ключ через `${{ secrets.AGENTPROXY_API_KEY }}`                                                                   | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Оба                         |
| `agentproxy setup-cursor`   | Cursor                                     | Ничего — выводит шаги в приложении (конфигурация Cursor является непрозрачной SQLite)                                                                                  | `--remote` `--api-key` `--only` `--port`                                                                                                   | Оба                         |
| `agentproxy setup-roo`      | Roo Code                                   | `~/.agentproxy/roo-settings.json` (импорт документа) + устанавливает `roo-cline.autoImportSettingsPath`, если существует `settings.json` VS Code                        | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Оба                         |
| `agentproxy setup-crush`    | Crush                                      | `~/.config/crush/crush.json` — провайдер `openai-compat`, ключ через `$AGENTPROXY_API_KEY`                                                                              | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Оба                         |
| `agentproxy setup-goose`    | Goose                                      | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + выводит рецепт окружения                                                                | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Оба                         |
| `agentproxy setup-aider`    | Aider                                      | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + выводит рецепт окружения                                                                              | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Оба                         |
| `agentproxy setup-qwen`     | Qwen Code                                  | `~/.qwen/settings.json` — массив V4 `modelProviders.openai` + `AGENTPROXY_API_KEY` в `~/.qwen/.env`                                                                     | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Оба                         |
| `agentproxy run <target>`   | Запуск в режиме выполнения (универсальный) | Ничего — запускает `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` с правильной средой и аргументами; Qwen и Gemini используют временный изолированный дом | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Оба                         |
| `agentproxy launch`         | Claude Code                                | Ничего — запускает `claude` с `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`, внедренными                                                                                 | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Оба                         |
| `agentproxy launch-codex`   | OpenAI Codex CLI                           | Ничего — запускает `codex` с провайдером `agentproxy`, внедренным через флаги `-c`                                                                                      | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Оба                         |

Примечания по флагам (проверено в исходном коде команды):

- `--remote <url>` — получить каталог с удаленного AgentProxy (перезаписывает `--port`
  и активный контекст). `--api-key <key>` предоставляет учетные данные для этого
  сервера (по умолчанию используется переменная окружения `AGENTPROXY_API_KEY` или токен активного контекста).
- `--only <patterns>` — подстроки, разделенные запятыми; оставляет только идентификаторы моделей, которые соответствуют
  (например, `--only glm,kimi`). Доступно для `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — выводит точно то, что будет записано, не затрагивая
  файловую систему. Доступно для каждой команды `setup-*` **кроме** `setup-cursor`
  (которая никогда не записывает файл).
- `--model <id>` — требуется (или выбирается интерактивно) для инструментов, у которых нет
  автоматического обнаружения модели: Cline, Kilo, Roo, Goose, Qwen, Aider. Эти инструменты
  также принимают `--yes` для неинтерактивных запусков (что затем требует `--model`).
  `setup-opencode` принимает `--model`, чтобы установить модель по умолчанию на верхнем уровне.
- `--model <id>` на `agentproxy run` следует проводке по манифесту для каждой цели
  (`bin/cli/cli-manifest.mjs`): **aider** получает `--model openai/<id>` и
  **opencode** `--model agentproxy/<id>` (префикс добавляется только тогда, когда идентификатор
  его не содержит); **qwen** и **gemini** получают идентификатор без изменений;
  **claude** получает его через `ANTHROPIC_MODEL`, **goose** через `GOOSE_MODEL`, а
  **codex** через аргументы `-c model_providers.agentproxy.*`. **Qwen является единственной целью запуска,
  которая жестко требует `--model`** — `agentproxy run qwen` без него завершает работу
  с кодом `2` с явной ошибкой.
- `--port <port>` — локальный порт AgentProxy (по умолчанию `20128`, игнорируется при установке `--remote`).
  Присутствует во всех командах `setup-*` и обоих запускателях.
- Коды выхода `agentproxy run`: код выхода дочернего CLI передается
  без изменений; `2` = недопустимые аргументы (неподдерживаемая цель, отсутствует требуемый
  `--model`, защитник контейнера); `127` = целевой бинарный файл отсутствует в `PATH`;
  `130`/`143`/`129`, когда запуск завершен `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = другая ошибка запуска.
- Два запускателя (`launch`, `launch-codex`) принимают `--profile <name>`, чтобы выбрать
  профиль, записанный с помощью `setup-claude` / `setup-codex`, плюс аргументы для
  базового бинарного файла `claude` / `codex`.

Интерактивный выбор также используется в рецептах настройки:

```bash
# Выберите из активного локального или удаленного каталога моделей и настройте цель.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` в настоящее время делегирует проверенным рецептам для `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue` и `kilo`. Записи каталога, предназначенные только для IDE,
MITM и только для руководства, остаются явными `setup-*`/ручными потоками и
не представлены как запускаемые цели.

> `setup-opencode` является **легковесной совместимой с openai** интеграцией OpenCode.
> Существует также более богатая интеграция плагина — `agentproxy setup opencode` — которая
> устанавливает `@agentproxy/opencode-plugin`. Это разные команды; таблица
> выше документирует `setup-opencode`.

---

## Локальное использование

С запущенным AgentProxy на `localhost:20128`, просто выполните команду настройки для вашего инструмента. Каталог загружается с локального сервера.

```bash
# Codex: записать профиль для каждой совпадающей модели в ~/.codex/
agentproxy setup-codex
codex --profile glm52            # используйте сгенерированный профиль

# Claude Code: записать профили для каждой модели, затем запустить одну
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: записать совместимого с openai провайдера со всеми моделями каталога
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # ссылается через {env:AGENTPROXY_API_KEY}, никогда не на диске
opencode -m agentproxy/glm/glm-5.2 "..."

# Инструменты без автообнаружения требуют явной модели:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Предпросмотр без записи чего-либо:
agentproxy setup-continue --dry-run
```

Запустите без записи какой-либо конфигурации (только инъекция переменных окружения):

```bash
agentproxy launch                 # Claude Code → локальный AgentProxy
agentproxy launch-codex           # Codex CLI → локальный AgentProxy
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Явный путь команды: передайте все, что идет после --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Удаленное использование

Укажите любую команду настройки на удаленный AgentProxy с `--remote` + `--api-key`. Каталог загружается с удаленного сервера; конфигурация записывается на вашем локальном компьютере.

```bash
# OpenCode против удаленного VPS, оставить только модели glm/kimi
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # сначала экспортируйте AGENTPROXY_API_KEY

# Профили Codex из удаленного каталога
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Запустите CLI напрямую против удаленного
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Вместо того чтобы передавать `--remote`/`--api-key` каждый раз, войдите один раз и позвольте **активному контексту** автоматически предоставлять их:

```bash
agentproxy connect 192.168.0.15        # создает токен с областью действия, сохраняет контекст
agentproxy setup-codex                 # ← теперь использует удаленный каталог
agentproxy setup-opencode              # ← то же самое
agentproxy launch                      # ← Claude Code против удаленного
```

Смотрите [Удаленный режим](./REMOTE-MODE.md) для контекстов, областей и управления токенами.

---

## Конвенции базового URL (какие инструменты требуют `/v1`)

AgentProxy предоставляет интерфейс OpenAI по адресу `/v1`, интерфейс Anthropic по корню, и нативный интерфейс Gemini по адресу `/v1beta`. Каждая интеграция подключена к форме, которую ожидает ее инструмент (подтверждено в источнике команды):

| Интеграция                                                                 | Базовый URL записан | `/v1`?                                         |
| -------------------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| `setup-cline` (`openAiBaseUrl`)                                            | корень              | Нет — Cline добавляет `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | корень              | Нет — Goose добавляет путь                     |
| `setup-aider` (`OPENAI_API_BASE`)                                          | корень              | Нет — LiteLLM добавляет `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | с `/v1`             | Да                                             |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | корень              | Нет — Claude Code добавляет `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | с `/v1`             | Да                                             |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | с `/v1`             | Да                                             |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | корень              | Нет — SDK добавляет `/v1beta/models/…`         |

---

## Поддержание нативных зависимостей при обновлении: `--include=optional`

Когда вы обновляете с помощью `agentproxy update` (после подтверждения или с `--apply`),
AgentProxy запускает установку с `--include=optional`, встроенным в команду:

```bash
npm install -g agentproxy@latest --include=optional
```

Это **не** флаг, который вы передаете в `agentproxy update` — он всегда применяется обновляющим инструментом. Это гарантирует, что `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, стек LLMLingua SLM) сохранятся после обновления, даже если ваша конфигурация npm
имеет `omit=optional`, что в противном случае тихо удалило бы нативный драйвер SQLite
и привязку к ОС-ключу. Чтобы предварительно просмотреть точную команду без применения:

```bash
agentproxy update --dry-run
# [DRY RUN] Выполнится: npm install -g agentproxy@latest --include=optional
```

Другие флаги `agentproxy update` (подтвержденные в исходном коде): `--check` (выход 1, если
устарело), `--apply` (установить без запроса), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI через `agentproxy run gemini`

Контракт подтвержден для `@google/gemini-cli` 0.50.0: CLI учитывает
`GOOGLE_GEMINI_BASE_URL` и отправляет `POST /v1beta/models/<model>:generateContent`
(и `:streamGenerateContent?alt=sse`) к нему — точно так же, как и нативный
интерфейс Gemini AgentProxy (`/v1beta`). `agentproxy run gemini` автоматически
настраивает это:

- `GOOGLE_GEMINI_BASE_URL` → активный базовый URL AgentProxy (корень, без `/v1`);
- `GEMINI_API_KEY` → разрешенные учетные данные AgentProxy (опция/переменная окружения/контекст);
- **временная изолированная `GEMINI_CLI_HOME`**, чей `.gemini/settings.json`
  выбирает аутентификацию `gemini-api-key`, так что сохраненная сессия Google OAuth (Code Assist)
  никогда не переопределяет запуск, направленный AgentProxy — удаляется после выхода;
- **чистота окружения**: дочернее окружение очищается от `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` и `GOOGLE_GENAI_USE_GCA` (которые перенаправили бы
  аутентификацию на Vertex/Code Assist), и `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` установлено
  как запасной вариант — другие цели `run` получают такое же
  обращение для своих конфликтующих переменных;
- инъекция `--model <id>` из `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Защита доверия рабочего пространства Gemini все еще применяется в безголовом режиме — передайте
`--skip-trust` (или доверьтесь директории интерактивно) самостоятельно; загрузчик
умышленно не обходит это. Этот загрузчик отличается от **регистрации ACP**
(`src/lib/acp/registry.ts`, `gemini --acp`), которая остается интеграцией агент-протокола для `/dashboard/acp-agents`.

---

## Реальная проверка (по желанию)

Детерминированные регрессионные запуски плана запуска в CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Чтобы проверить РЕАЛЬНЫЕ бинарные файлы против РЕАЛЬНОГО
сервера AgentProxy, существует опциональный инструмент в
`tests/integration/upstream-cli-smoke.int.test.ts`. Он никогда не запускается автоматически
(каждый под-тест пропускается, если `RUN_CLI_SMOKE=1`), передает учетные данные через переменную окружения
NAME (никогда по значению), редактирует строки, похожие на ключи, из любого записанного вывода, пропускает
цели, бинарный файл которых не установлен, и классифицирует сбои как
аутентификация / upstream / конфигурация вместо простого булева значения:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Опционально: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` ограничивает проверку;
`AGENTPROXY_SMOKE_TIMEOUT_MS` переопределяет тайм-аут в 120 секунд на цель.

---

## См. также

- [Конфигурация Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — более глубокое руководство по Claude Code
- [Конфигурация Codex CLI](./CODEX-CLI-CONFIGURATION.md) — одноразовая настройка `[model_providers.agentproxy]`
- [Удалённый режим](./REMOTE-MODE.md) — контексты, токены доступа с ограниченной областью действия, управление удалённым сервером
- [Справочник по инструментам CLI](../reference/CLI-TOOLS.md) — полный каталог поддерживаемых инструментов + страницы панели управления
- [Руководство по настройке](./SETUP_GUIDE.md) — методы установки и вводный курс при первом запуске
