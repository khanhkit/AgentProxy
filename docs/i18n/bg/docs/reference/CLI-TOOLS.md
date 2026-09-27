# CLI-TOOLS (Български)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI инструменти — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI инструменти — AgentProxy

Последно обновление: 2026-08-18

AgentProxy интегрира три категории CLI инструменти, разпределени на три специализирани страници на таблото:

| Страница       | Път                     | Концепция                                                                                     | Брой            |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------- | --------------- |
| **CLI Кодове** | `/dashboard/cli-code`   | Инструменти за кодиране, които насочвате към AgentProxy (Клиент → CLI → AgentProxy → Доставчик) | 26              |
| **CLI Агенти** | `/dashboard/cli-agents` | Автономни агенти, които насочвате към AgentProxy (същия поток, по-широк обхват)                | 8               |
| **ACP Агенти** | `/dashboard/acp-agents` | CLI, които AgentProxy създава като бекенд чрез stdio/ACP (обратен поток)                       | вижте регистъра |

Наследствените маршрути пренасочват чрез 308: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## Как работи

```
CLI Кодове / CLI Агенти (поток на потребление):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (всички насочват към AgentProxy)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (AgentProxy маршрутизира към правилния доставчик)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP Агенти (обратен поток на създаване):
    Клиентска заявка → AgentProxy → създава CLI чрез stdio/ACP → отговор
```

**Ползи:**

- Един API ключ за управление на всички инструменти
- Проследяване на разходите за всички CLI в таблото
- Смяна на модели без пренастройване на всеки инструмент
- Работи локално и на отдалечени сървъри (VPS, Docker, Akamai, Cloudflare Tunnel)

---

## Автоматична конфигурация с `setup-*`

Не е необходимо да пишете конфигурацията на всеки инструмент на ръка. AgentProxy предлага команда `setup-*`
за всеки поддържан CLI, която чете **активния** каталог на модели от работещ
AgentProxy (локален или отдалечен) и записва собствената конфигурация на инструмента на вашата машина:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
```

Всеки приема `--remote <url> --api-key <key>` (конфигуриране на локален инструмент спрямо
отдалечен AgentProxy), `--dry-run` (преглед без запис), и `--port`. Инструменти
без автоматично откриване на модел (Cline, Kilo, Roo, Goose, Aider, Qwen) приемат
`--model <id>` (и `--yes` за неинтерактивни изпълнения). За да стартирате CLI с
правилната среда инжектирана и без записана конфигурация, използвайте общия
`agentproxy run <target>` стартер (claude, codex, aider, goose, opencode, qwen,
gemini — целите и алиасите идват от `bin/cli/cli-manifest.mjs`); наследствените
стартери за всеки инструмент `agentproxy launch` (Claude Code) и `agentproxy launch-codex`
(Codex) остават налични. Gemini CLI е само за стартиране: той е цел за `agentproxy run`
но няма `setup-*`/`configure` рецепта.

> **Пълен справочник:** главната таблица — какво пише всяка команда, всеки флаг,
> локално срещу отдалечено, и кои инструменти искат суфикс `/v1` — се намира в
> **[CLI Интеграции](../guides/CLI-INTEGRATIONS.md)**.

### Изпълнение на тези команди в контейнер

Команда `setup-*`, изпълнена в контейнера на AgentProxy, записва в
собствената домашна директория на контейнера, която никой хост CLI не чете и която изчезва с
контейнера. AgentProxy открива това и излиза с `2` с инструкции, вместо да записва. Два поддържани начина напред — инсталирайте CLI на хоста и
`agentproxy connect` към контейнера, или свържете директориите за конфигурация и задайте
`CLI_CONFIG_HOME` (профил на compose `host`). Всяка команда `setup-*`, плюс
`agentproxy configure` и `agentproxy config set`, приема
`--allow-container-write`, когато конфигурирането на собствените CLI на контейнера е това, което наистина имате предвид; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` прави същото за
сървъра. Вижте
[Docker Ръководство → Конфигуриране на инструменти CLI на хоста](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

**apply endpoint** на таблото (`POST /api/cli-tools/apply`) налага
същата защита: в контейнер, запис, чиято цел не е свързана от хоста, отговаря с **`422`** с `containerEphemeralTarget: true`, безопасен текст за грешка и — за инструментите с рецепта за хост (claude, codex, opencode, cline,
kilo, continue) — `hostSetupCommand` (например `agentproxy setup-opencode`), който да се изпълни
на хоста вместо това; нищо не се записва. `dryRun: true` продължава да работи в режим на контейнер
и връща генерираното съдържание + целевия път без да докосва диска, така че
можете да прегледате от таблото и да приложите на хоста. Това поведение е
намерено и защитено от регресия с
`tests/unit/api/cli-tools/apply-container-guard.test.ts` — никога не "поправяйте" 422
чрез премахване на защитата.

---

## Източник на истината

Обединеният каталог се намира в `src/shared/constants/cliTools.ts` като `CLI_TOOLS: Record<string, CliCatalogEntry>`.

Всеки запис има тези полета (определени в `src/shared/schemas/cliCatalog.ts`):

| Поле                                            | Тип                                                          | Описание                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `category`                                      | `"code" \| "agent"`                                          | На коя страница се появява инструментът                                    |
| `vendor`                                        | `string`                                                     | Произход на инструмента ("Anthropic", "OSS (P. Gauthier)")                 |
| `acpSpawnable`                                  | `boolean`                                                    | Също така използваем като ACP агент (показан значка)                       |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | Ниво на поддръжка на персонализирани крайни точки. `"none"` = MITM backlog |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Механизъм за конфигурация                                                  |
| `id`, `name`, `color`, `description`, `docsUrl` | стандарт                                                     | Основни полета за показване                                                |

Записите с `baseUrlSupport: "none"` **не се показват** на страниците на таблото — те са регистрирани в MITM backlog за план 11 (виж `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Нива на способности (каталогизирани × откриваеми × конфигурируеми × стартиваеми)

Не всеки каталогизиран инструмент е откриваем, конфигурируем или стартиваем. Всяко ниво има един
деклариращ източник, а тест за отклонение ги поддържа синхронизирани:

| Ниво               | Значение                                                                                  | Декларирано в                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Каталогизирано** | Появява се в каталога на таблото (име, производител, документация, тип конфигурация)      | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                  |
| **Откриваемо**     | Откритие на бинарни/конфигурационни файлове, проверки на здравето, пътища за конфигурация | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` runtime catalog) |
| **Конфигурируемо** | Поддържа се от `agentproxy configure <cli>` (съществува рецепта за настройка)              | `bin/cli/cli-manifest.mjs` (`configure: true`)                    |
| **Стартиваемо**    | Поддържа се от `agentproxy run <target>` (определено инжектиране на env/args)              | `bin/cli/cli-manifest.mjs` (`run: true`)                          |

`bin/cli/cli-manifest.mjs` е каноничният изпълним манифест за командата CLI
повърхности: `run`, `configure` и генераторите за завършване на командния ред произвеждат своите
списъци с цели, разрешаване на псевдоними (например `kilocode`/`kilo-code`/`kilo_cli` → `kilo`)
и свързване на флага `--model` от него. Тестът за отклонение
`tests/unit/cli/cli-manifest-drift.test.ts` удостоверява, че манифестът, времевият
каталог, UI каталогът и всяка повърхност на потребителя остават синхронизирани — цел, добавена към
една повърхност без другите, проваля тестовия пакет вместо да се отклонява безшумно.

## 1. Каталог на CLI кода (26 инструмента)

Всички инструменти, които се появяват в `/dashboard/cli-code`. Тези с `baseUrlSupport: none` са свързани чрез MITM или ръководство вместо персонализиран базов URL:

| id           | име                     | доставчик             | baseUrlSupport | тип конфигурация | acpSpawnable |
| ------------ | ----------------------- | --------------------- | -------------- | ---------------- | ------------ |
| claude       | Claude Code             | Anthropic             | full           | env              | true         |
| codex        | OpenAI Codex CLI        | OpenAI                | full           | custom           | true         |
| zcode        | ZCode (GLM Coding Plan) | Z.ai                  | none           | custom           | false        |
| cline        | Cline                   | OSS (бивш Claude Dev) | full           | custom           | true         |
| kilo         | Kilo Code               | Kilo-Org              | full           | custom           | false        |
| roo          | Roo Code                | Roo (OSS)             | full           | guide            | false        |
| continue     | Continue                | continue.dev          | full           | guide            | false        |
| aider        | Aider                   | OSS (П. Готие)        | full           | guide            | true         |
| forge        | ForgeCode               | Antinomy HQ           | full           | custom           | true         |
| jcode        | jcode                   | 1jehuang (OSS)        | full           | custom           | false        |
| deepseek-tui | DeepSeek TUI            | Hunter Bown (OSS)     | full           | custom           | false        |
| codewhale    | CodeWhale               | Hmbown (OSS)          | full           | custom           | false        |
| opencode     | OpenCode                | Anomaly (бивш SST)    | full           | guide            | true         |
| droid        | Factory Droid           | Factory AI            | partial        | guide            | false        |
| copilot      | GitHub Copilot CLI      | GitHub/MS             | full           | custom           | false        |
| cursor-cli   | Cursor CLI              | Anysphere             | partial        | guide            | true         |
| smelt        | Smelt                   | leonardcser (OSS)     | full           | custom           | false        |
| pi           | Pi (pi-coding-agent)    | M. Zechner (OSS)      | full           | custom           | false        |
| grok-build   | Grok Build              | xAI                   | full           | custom           | false        |
| crush        | Crush                   | OSS (Charm)           | full           | custom           | false        |
| qwen         | Qwen Code               | Alibaba               | full           | guide            | true         |
| cursor       | Cursor                  | Anysphere             | none           | guide            | false        |
| antigravity  | Antigravity             | Google                | none           | mitm             | false        |
| hermes       | Hermes                  | Nous Research         | none           | guide            | false        |
| kiro         | Kiro AI                 | Amazon                | none           | mitm             | false        |
| custom       | Custom CLI              | —                     | full           | custom-builder   | false        |

Инструментите с `baseUrlSupport: "partial"` показват значка "⚠ Частичен базов URL" в картата на таблото.

## 2. Каталог на CLI агенти (8 инструмента)

Автономни агенти, които се появяват в `/dashboard/cli-agents`:

| id           | име              | доставчик                | поддръжка на baseUrl | acpSpawnable |
| ------------ | ---------------- | ------------------------ | -------------------- | ------------ |
| hermes-agent | Hermes Agent     | Nous Research            | пълна                | false        |
| openclaw     | OpenClaw         | OSS (P. Steinberger)     | пълна                | true         |
| goose        | Goose            | Block / Linux Foundation | пълна                | true         |
| interpreter  | Open Interpreter | OSS                      | пълна                | true         |
| warp         | Warp AI          | Warp Inc.                | частична             | true         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)      | пълна                | false        |
| omp          | Oh My Pi         | OSS                      | пълна                | true         |
| letta        | Letta CLI        | Letta                    | пълна                | false        |

---

## 3. ACP агенти (/dashboard/acp-agents)

Тази страница (преименувана от `/dashboard/agents`) показва CLI, които AgentProxy може да **създаде** като бекенд изпълнителни двигатели чрез протокола stdio/ACP. Каталогът се поддържа отделно в `src/lib/acp/registry.ts` и **не** е същият като `CLI_TOOLS`.

---

## 4. MITM задължения (не показани в таблото)

Следните CLI не поддържат персонализиран base URL по подразбиране и **не са изброени** в страниците на CLI Code или CLI Agents. Те са кандидати за MITM прихващане в план 11:

| CLI                 | Причина                                                             |
| ------------------- | ------------------------------------------------------------------- |
| windsurf            | BYOK ограничен до избрани модели на Claude + корпоративен URL/токен |
| amp                 | Затворена екосистема (Sourcegraph)                                  |
| amazon-q / kiro-cli | AWS SSO удостоверяване, без персонализиран URL                      |
| cowork              | Anthropic Desktop, без конфигурируем крайна точка                   |

Вижте `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` за пълния крос-референс.

---

## 5. API за откриване на партиди

Всички открития на инструменти се агрегат чрез единен крайна точка:

**`GET /api/cli-tools/all-statuses`**

- Удостоверяване: `requireCliToolsAuth(request)` (същото като другите маршрути `/api/cli-tools/`)
- Връща: `Record<toolId, ToolBatchStatus>` (тип: `src/shared/types/cliBatchStatus.ts`)
- Стратегия: `Promise.all` за всички инструменти, 5s таймаут на инструмент
- Кеш: в паметта LRU, индексиран по конфигурационен файл `mtime`. Кешът се невалидира, когато mtime се променя. Нулира се при рестарт на сървъра.

Форма на отговора за всеки инструмент:

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
  error?: string; // санитаризирано, без стек трасове
}
```

## 6. Настройки на обработчиците за нови инструменти

Новите инструменти с `configType: "custom"` имат специализирани API маршрути за настройки:

| Маршрут                                     | Инструмент                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                                        |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url флаг)                                                        |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, наследствен)                                    |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, основен + наследствен `~/.deepseek` синхронизация) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                                          |
| `POST /api/cli-tools/pi-settings`           | Pi кодов агент                                                                 |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)                          |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + специален `.env` ключ)                    |

Всички маршрути използват `sanitizeErrorMessage()` за отговори при грешки (Твърдо правило #12).

---

## 7. Архитектура на страниците на таблото

### CLI Код (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — сървърен компонент
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — клиентска решетка
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — страница с детайли за инструмента
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 специализирани карти за инструменти + `ToolDetailClient.tsx`

### CLI Агенти (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — сървърен компонент
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — клиентска решетка
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — повторно използва `ToolDetailClient`

### ACP Агенти (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — сървърен компонент (преместен от `agents/`)

### Споделени UI Компоненти (`src/shared/components/cli/`)

| Файл                    | Цел                                                           |
| ----------------------- | ------------------------------------------------------------- |
| `CliToolCard.tsx`       | Умен статусен картон (детекция + конфигурация + крайна точка) |
| `CliConceptCard.tsx`    | Карта с обяснение на концепцията на страницата                |
| `CliComparisonCard.tsx` | Сравнение в три колони между CLI типове                       |
| `BaseUrlSelect.tsx`     | Падащо меню за крайна точка (Локално/Облачно/Персонализирано) |
| `ApiKeySelect.tsx`      | Избор на API ключ                                             |
| `ManualConfigModal.tsx` | Модал за копируем фрагмент от конфигурация                    |

### Споделен Хук (`src/shared/hooks/cli/`)

| Файл                      | Цел                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `useToolBatchStatuses.ts` | Извлича `/api/cli-tools/all-statuses`, управлява състоянието на зареждане/освежаване |

## 8. i18n

Нови пространства от имена добавени в план 14 F9:

| Пространство от имена | Цел                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `cliCommon`           | Споделени низове (етикети на карти, текстове за концепции/сравнения, етикети на детайлни страници) |
| `cliCode`             | Низове на страницата на CLI Code                                                                   |
| `cliAgents`           | Низове на страницата на CLI Agents                                                                 |
| `acpAgents`           | Низове на страницата на ACP Agents                                                                 |

Пълни преводи на PT-BR и EN са предоставени. 39 други локализации автоматично се връщат към EN чрез сливане на ниво пространство от имена в `src/i18n/request.ts`.

---

## 9. Бързо начало

### Стъпка 1 — Получете API ключ за AgentProxy

1. Отворете `/dashboard/api-manager` → **Създайте API ключ**
2. Дайте му име (например `cli-tools`) и изберете всички разрешения
3. Копирайте ключа — ще ви е необходим за всеки CLI по-долу

> Вашият ключ изглежда така: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### Стъпка 2 — Инсталирайте CLI инструменти

Всички инструменти, базирани на npm, изискват Node.js 22.22.2+ или 24.x:

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

# Google Gemini CLI (може да се стартира чрез `agentproxy run gemini` → /v1beta surface)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Базиран на Rust

# Pi coding agent
# вижте https://github.com/zechnerj/pi-coding-agent за инсталация

# jcode
# вижте https://github.com/1jehuang/jcode за инсталация
```

---

### Стъпка 3 — Конфигурирайте чрез таблото

1. Отидете на `http://localhost:20128/dashboard/cli-code`
2. Намерете инструмента си в мрежата
3. Щракнете върху картата, за да отворите страницата с детайли на инструмента
4. Изберете вашия API ключ и основен URL
5. Щракнете **Приложи конфигурация** или копирайте ръчно фрагмента за конфигурация

---

### Стъпка 4 — Задайте глобални променливи на средата

```bash
# AgentProxy универсален крайна точка
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI чете GOOGLE_GEMINI_BASE_URL на ROOT (неговият SDK сам добавя /v1beta/... )
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> За **отдалечен сървър** заменете `localhost:20128` с IP адреса или домейна на сървъра,
> например `http://<your-server-ip>:20128`.

---

### Стъпка 4 — Конфигурирайте всеки инструмент

#### Claude Code

```bash
# Създайте ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Използвайте обединената коренова точка на Anthropic за Claude Code. Не добавяйте `/v1` тук.

**Тест:** `claude "say hello"`

---

#### OpenAI Codex

Съвременният Codex (v0.137+) чете `~/.codex/config.toml` само — старият
`config.yaml` принадлежи на наследения npm CLI и се игнорира безшумно. API
ключът остава в променливата на средата `AGENTPROXY_API_KEY` (`env_key`), никога
във файла:

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

Пълна справка (профили, `wire_api`, контекстни прозорци): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

**Тест:** `codex "what is 2+2?"`

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

**Тест:** `opencode`

> Използвайте `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> за да изпратите мисловни варианти.

---

#### Cline (CLI или VS Code)

**CLI режим:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code режим:**
Настройки на разширението Cline → API доставчик: `OpenAI Compatible` → Основен URL: `http://localhost:20128/v1`

Или използвайте таблото на AgentProxy → **CLI инструменти → Cline → Приложи конфигурация**.

---

#### KiloCode (CLI или VS Code)

**CLI режим:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**Настройки на VS Code:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Или използвайте таблото на AgentProxy → **CLI инструменти → KiloCode → Приложи конфигурация**.

---

#### Continue (разширение за VS Code)

Редактирайте `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Рестартирайте VS Code след редактиране.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Използвайте това, когато VS Code Insiders е конфигуриран за модели на персонализирани крайни точки и искате AgentProxy да работи без персонализирано поле на заглавката.

**Препоръчано местоположение:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Пример с токенизирания псевдоним на AgentProxy:**

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

**Бележки:**

- Заменете `sk-your-agentproxy-key` с API ключ, създаден в AgentProxy.
- Полето `url` трябва да сочи към `/api/v1/vscode/{token}/chat/completions`.
- Полето `modelsUrl` трябва да сочи към `/api/v1/vscode/{token}/models`.
- Предпочитайте нормалния поток `/v1` + заглавка Bearer, когато клиентът поддържа персонализирани заглавки.
- Вградени токени в URL са съвместимостна резервна опция и могат да се появят в логовете на редактора или историята на проксито.

---

#### Kiro CLI (Amazon)

```bash
# Влезте в акаунта си в AWS/Kiro:
kiro-cli login

# CLI използва собствена автентикация — AgentProxy не е необходима като бекенд за Kiro CLI самата.
# Използвайте kiro-cli заедно с AgentProxy за други инструменти.
kiro-cli status
```

За настолната апликация **Kiro IDE** използвайте MITM крайна точка, предоставена от AgentProxy
под `/dashboard/cli-tools → Kiro`.

---

## 10. Вътрешен AgentProxy CLI

Бинарният файл `agentproxy` предоставя команди за жизнения цикъл на сървъра, настройка, диагностика и управление на доставчици. Точка на вход: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Стартиране на сървъра (по подразбиране порт 20128)
agentproxy setup                        # Интерактивен помощник за настройка
agentproxy doctor                       # Проверка на конфигурация, БД, портове, време на работа
agentproxy providers list               # Конфигурирани връзки с доставчици
agentproxy providers test-all           # Тест на всяка активна връзка
agentproxy reset-password               # Нулиране на паролата на администратора
agentproxy logs                         # Поток на логовете на заявките
agentproxy health                       # Подробно здравословно състояние (разпределители, кеш, памет)
agentproxy --version                    # Печат на версията
agentproxy --help                       # Показване на всички команди
```

### Настройка и инициализация

```bash
agentproxy setup                        # Интерактивен помощник за настройка
agentproxy setup --non-interactive      # CI/автоматизираен режим (чете променливи на средата + флагове)
agentproxy setup --password '<value>'   # Задаване на парола на администратора директно
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # Добавяне и тестване на доставчик в едно
```

Разпознати променливи на средата за неинтерактивна настройка:

| Var                 | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | API ключ на доставчика (свързан с `--api-key` чрез Commander `.env()`) |
| `DATA_DIR`          | Презаписване на директорията за данни на AgentProxy                     |

Всички останали неинтерактивни входове се предават като флагове, а не променливи на средата:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(вижте опциите за `agentproxy setup` по-горе).

### Диагностика

```bash
agentproxy doctor                       # Проверка на конфигурация, БД, портове, време на работа, памет, жизненост
agentproxy doctor --json                # Машинно четим JSON
agentproxy doctor --no-liveness         # Пропускане на HTTP проверката за здравословно състояние
agentproxy doctor --host 0.0.0.0        # Презаписване на хоста за жизненост
agentproxy doctor --liveness-url <url>  # Презаписване на пълния URL на крайна точка за здравословно състояние
```

Докторът извършва тези проверки: `Конфигурация`, `База данни`, `Съхранение/шифроване`,
`Наличност на порт`, `Време на работа на Node`, `Нативен бинарен файл` (better-sqlite3),
`Памет` и `Жизненост на сървъра`. Излиза с ненулев код, ако някоя проверка е `неуспешна`.

### Управление на доставчици

```bash
agentproxy providers available                       # Каталог на доставчиците на AgentProxy
agentproxy providers available --search openai       # Филтриране на каталога по id/име/псевдоним/категория
agentproxy providers available --category api-key    # Филтриране по категория (api-key, oauth, free, ...)
agentproxy providers available --json                # Машинно четим JSON

agentproxy providers list                            # Конфигурирани връзки с доставчици
agentproxy providers list --json

agentproxy providers test <id|name>                  # Тест на една конфигурирана връзка
agentproxy providers test-all                        # Тест на всяка активна връзка
agentproxy providers validate                        # Локална структурна валидация
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # Съществуващ OAuth поток
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` са API-първи и следователно работят срещу
активния локален или отдалечен контекст. Входът на удостоверение трябва да използва
`--credential-stdin` или `--credential-env`; `--dry-run --json` отчита само
редактирана наличност/форма. `providers available` чете каталога на AgentProxy;
`providers list/test/test-all/validate` запазват локалното си SQLite поведение и
не изискват сървърът да работи.

### Възстановяване и нулиране

```bash
agentproxy reset-password                # Нулиране на паролата на администратора (също: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Показване на предупреждение + пробен режим за нулиране на шифровани удостоверения
agentproxy reset-encrypted-columns --force  # Всъщност нулира шифрованите удостоверения в SQLite
```

### Експорт на удостоверения (⚠ обработвайте с внимание)

```bash
agentproxy auth export                                 # Показване на предупреждение + врата за потвърждение — без достъп до БД
agentproxy auth export --force                          # Експорт на ВСИЧКИ DECRYPTED удостоверения на връзките в stdout като JSON
agentproxy auth export --force --id <id>                 # Експорт само на съответстващата връзка
agentproxy auth export --force --format env               # Изход AGENTPROXY_<PROVIDER>_<FIELD>=<value> редове
agentproxy auth export --force --out creds.json           # Запис в файл (създаден с 0600 права)
```

`auth export` е **локален** (директно четене от SQLite, без HTTP маршрут) и умишлено печата/записва
**плоски** `apiKey`/`accessToken`/`refreshToken`/`idToken` стойности — това е функция, а не
грешка. Нищо не се чете от базата данни и нищо не се декриптира, без `--force`. Предупредителен банер
винаги се печата преди всяко излъчване на плоски данни. Изисква `STORAGE_ENCRYPTION_KEY` да
бъде зададен. Поле, което не успее да се декриптира (остарял ключ, повреден шифрован текст) се отчита като
`<field>DecryptFailed: true` вместо да прекратява целия експорт или да изтича основната грешка.

### Други подкоманди

Тези предполагат работещ сървър AgentProxy, освен ако не е посочено друго:

```bash
agentproxy status                       # Обширен статус на времето на работа
agentproxy logs                         # Поток на логовете на заявките (--json, --search, --follow)
agentproxy config show                  # Показване на текущата конфигурация

agentproxy provider list                # Списък на наличните доставчици (псевдоним на providers list)
agentproxy provider add                 # Регистриране на AgentProxy като доставчик на инструмент
agentproxy keys add | list | remove     # Управление на API ключове
agentproxy models [provider]            # Списък на модели (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Снимка на конфигурацията + БД
agentproxy restore                      # Възстановяване от предишна снимка

agentproxy health                       # Подробно здравословно състояние (разпределители, кеш, памет)
agentproxy quota                        # Използване на квота на доставчика
agentproxy cache                        # Статус на кеша
agentproxy cache clear                  # Изчистване на семантични + подписващи кешове

agentproxy mcp status | restart         # Статус на MCP сървъра / рестарт
agentproxy a2a status | card            # Статус на A2A сървъра / карта на агента

agentproxy tunnel list | create | stop  # Управление на тунели (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Инспекция / задаване на променливи на средата (временни)

agentproxy test                         # Тест за свързаност на доставчика
agentproxy update                       # Проверка за актуализации
agentproxy completion                   # Генериране на завършване на командния ред
```

### Общи флагове

| Flag                | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `--no-open`         | Не отваряйте автоматично браузъра при стартиране       |
| `--port <n>`        | Презаписване на API порта (по подразбиране 20128)      |
| `--mcp`             | Работете като MCP сървър през stdio (за IDE)           |
| `--non-interactive` | CI режим (без подканвания; чете от променливи/флагове) |
| `--json`            | Машинно четим JSON изход (doctor, providers и др.)     |
| `--help`, `-h`      | Показване на помощ, специфична за командата            |
| `--version`, `-v`   | Печат на инсталираната версия                          |

---

## Налични API крайни точки

| Крайна точка               | Описание                           | Използва се за                             |
| -------------------------- | ---------------------------------- | ------------------------------------------ |
| `/v1/chat/completions`     | Стандартен чат (всички доставчици) | Всички съвременни инструменти              |
| `/v1/responses`            | API за отговори (формат OpenAI)    | Codex, агентни работни потоци              |
| `/v1/completions`          | Остарели текстови завършвания      | По-стари инструменти, използващи `prompt:` |
| `/v1/embeddings`           | Текстови вграждания                | RAG, търсене                               |
| `/v1/images/generations`   | Генерация на изображения           | GPT-Image, Flux и др.                      |
| `/v1/audio/speech`         | Текст към реч                      | ElevenLabs, OpenAI TTS                     |
| `/v1/audio/transcriptions` | Реч към текст                      | Deepgram, AssemblyAI                       |

Примери, готови за поставяне с токенизиран AgentProxy URL:

```txt
Token пример: sk-a3ab3c080beaee3a-69f4a4-070d71af

Стандартен OpenAI базов: http://localhost:20128/v1
VS Code модели: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code чат: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code отговори: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama тагове: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama чат: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Отстраняване на проблеми

| Грешка                                         | Причина                        | Решение                                                    |
| ---------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `Connection refused`                           | AgentProxy не работи            | `agentproxy serve`                                          |
| `401 Unauthorized`                             | Грешен API ключ                | Проверете в `/dashboard/api-manager`                       |
| `No combo configured`                          | Няма активна рутинг комбинация | Настройте в `/dashboard/combos`                            |
| CLI показва "not installed"                    | Бинарният файл не е в PATH     | Проверете `which <command>`                                |
| Таблото показва "not detected" след инсталация | Кешът е остарял                | Кликнете "⟳ Refresh detection" в таблото                   |
| Стара връзка `/dashboard/cli-tools`            | Закладка преди v3.8.6          | Автоматично пренасочване към `/dashboard/cli-code` (308)   |
| Стара връзка `/dashboard/agents`               | Закладка преди v3.8.6          | Автоматично пренасочване към `/dashboard/acp-agents` (308) |
