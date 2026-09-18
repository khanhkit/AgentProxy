# CLI-TOOLS (Azərbaycan dili)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI Alətləri — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI Alətləri — AgentProxy

Sonuncu yeniləmə: 2026-08-18

AgentProxy, üç xüsusi idarəetmə səhifəsində yayılmış üç kateqoriyalı CLI alətləri ilə inteqrasiya edir:

| Səhifə            | Marşrut                 | Konsept                                                                                    | Say              |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| **CLI Kodu**      | `/dashboard/cli-code`   | AgentProxy-a yönləndirdiyiniz kodlaşdırma alətləri (Müştəri → CLI → AgentProxy → Təchizatçı) | 26               |
| **CLI Agentləri** | `/dashboard/cli-agents` | AgentProxy-a yönləndirdiyiniz müstəqil agentlər (eyni axın, daha geniş əhatə)               | 8                |
| **ACP Agentləri** | `/dashboard/acp-agents` | AgentProxy-un stdio/ACP vasitəsilə arxa planda yaratdığı CLİ-lər (tərs axın)                | qeydiyyata baxın |

Köhnə marşrutlar 308 ilə yönləndirilir: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## Necə İşləyir

```
CLI Kodu / CLI Agentləri (istehlak axını):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (hamısı AgentProxy-a yönləndirilir)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (AgentProxy düzgün təchizatçıya yönləndirir)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP Agentləri (tərs yaradılma axını):
    Müştəri tələbi → AgentProxy → stdio/ACP vasitəsilə CLİ yaradır → cavab
```

**Faydaları:**

- Bütün alətləri idarə etmək üçün bir API açarı
- İdarəetmə panelində bütün CLİ-lər üzrə xərclərin izlənməsi
- Hər aləti yenidən konfiqurasiya etmədən model dəyişdirmək
- Yerli və uzaq serverlərdə (VPS, Docker, Akamai, Cloudflare Tunnel) işləyir

---

## `setup-*` ilə Avtomatik Konfiqurasiya

Hər alətin konfiqurasiyasını əl ilə yazmağa ehtiyac yoxdur. AgentProxy, dəstəklənən hər bir CLİ üçün **canlı** model kataloqunu oxuyan və alətin öz konfiqurasiyasını sizin maşınınıza yazan `setup-*` komandasını təqdim edir:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
```

Hər biri `--remote <url> --api-key <key>` (uzaq AgentProxy-a qarşı yerli aləti konfiqurasiya etmək), `--dry-run` (yazmadan önizləmə) və `--port` qəbul edir. Model avtomatik aşkar edilməyən alətlər (Cline, Kilo, Roo, Goose, Aider, Qwen) `--model <id>` (və interaktiv olmayan işlər üçün `--yes`) qəbul edir. Doğru mühitin daxil edildiyi və heç bir konfiqurasiya yazılmadan CLİ başlatmaq üçün, ümumi `agentproxy run <target>` başlatıcısını istifadə edin (claude, codex, aider, goose, opencode, qwen, gemini — hədəflər və təyin etmələr `bin/cli/cli-manifest.mjs`-dən gəlir); köhnə alət başlatmaçıları `agentproxy launch` (Claude Kodu) və `agentproxy launch-codex` (Codex) hələ də mövcuddur. Gemini CLİ yalnız başlatma üçündür: bu `agentproxy run` hədəfidir, lakin `setup-*`/`configure` resepti yoxdur.

> **Tam istinad:** ustad cədvəl — hər bir komandanın yazdığı, hər bir bayraq, yerli vs uzaq və hansı alətlərin `/v1` əlavəsinə ehtiyacı olduğu — **[CLI İnteqrasiyaları](../guides/CLI-INTEGRATIONS.md)**-da yerləşir.

### Bir konteyner içində bunları işlətmək

AgentProxy konteyneri içində icra olunan `setup-*` komandası konteynerin öz evinə yazır, bu da heç bir ev sahibi CLİ tərəfindən oxunmur və konteynerlə birlikdə yox olur. AgentProxy bunu aşkar edir və yazmadan əvvəl təlimatlarla `2` ilə çıxır. İki dəstəklənən yol — CLİ-ni ev sahibində quraşdırmaq və konteynerə `agentproxy connect` etmək, ya da konfiqurasiya qovluqlarını bağlamaq və `CLI_CONFIG_HOME` təyin etməkdir (compose `host` profili). Hər `setup-*` komandası, eləcə də `agentproxy configure` və `agentproxy config set`, konteynerin öz CLİ-lərini konfiqurasiya etmək istədiyiniz zaman `--allow-container-write` qəbul edir; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` server üçün eyni şeyi edir. Baxın
[Docker Bələdçisi → Ev sahibi CLİ alətlərini konfiqurasiya etmək](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

İdarəetmə panelinin **tətbiq son nöqtəsi** (`POST /api/cli-tools/apply`) eyni qorumağı tətbiq edir: konteynerdə, ev sahibi tərəfindən bağlanmamış bir yazı **`422`** ilə `containerEphemeralTarget: true` cavabını verir, təhlükəsiz xəta mətni və — ev sahibi resepti olan alətlər üçün (claude, codex, opencode, cline, kilo, continue) — ev sahibində işlətmək üçün `hostSetupCommand` (məsələn, `agentproxy setup-opencode`) təqdim edir; heç nə yazılmır. `dryRun: true` konteyner rejimində işləməyə davam edir və diskə toxunmadan yaradılan məzmunu + hədəf yolunu qaytarır, beləliklə, siz idarəetmə panelindən önizləyə və ev sahibində tətbiq edə bilərsiniz. Bu davranış məqsədli və `tests/unit/api/cli-tools/apply-container-guard.test.ts` ilə geriyə qorunmuşdur — heç vaxt qorumanı aradan qaldıraraq 422-ni "düzəltməyin".

---

## Həqiqət Mənbəyi

Birləşmiş kataloq `src/shared/constants/cliTools.ts` faylında `CLI_TOOLS: Record<string, CliCatalogEntry>` kimi yaşayır.

Hər bir girişin bu sahələri var (müəyyən edilib `src/shared/schemas/cliCatalog.ts` faylında):

| Sahə                                            | Tip                                                          | Təsvir                                                    |
| ----------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `category`                                      | `"code" \| "agent"`                                          | Alət hansı səhifədə görünür                               |
| `vendor`                                        | `string`                                                     | Alətin mənşəyi ("Anthropic", "OSS (P. Gauthier)")         |
| `acpSpawnable`                                  | `boolean`                                                    | ACP Agent kimi də istifadə oluna bilər (badge göstərilir) |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | Xüsusi endpoint dəstək səviyyəsi. `"none"` = MITM backlog |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Konfiqurasiya mexanizmi                                   |
| `id`, `name`, `color`, `description`, `docsUrl` | standart                                                     | Əsas görüntü sahələri                                     |

`baseUrlSupport: "none"` olan girişlər **göstərilmir** dashboard səhifələrində — onlar plan 11 üçün MITM backlog-da qeyd olunur (baxın `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Bacarıq pillələri (kataloqda × aşkar edilə bilən × konfiqurasiya edilə bilən × işə salına bilən)

Hər kataloqda olan alət aşkar edilə bilən, konfiqurasiya edilə bilən və ya işə salına bilən deyil. Hər pillənin bir
bəyannamə mənbəyi var və bir drift testi onları uyğun saxlayır:

| Pillə                         | Mənası                                                                              | Bəyannamə edilib                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Kataloqda**                 | Dashboard kataloqunda görünür (ad, vendor, sənədlər, konfiqurasiya tipi)            | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                   |
| **Aşkar edilə bilən**         | İkili/konfiqurasiya aşkar edilməsi, sağlamlıq yoxlamaları, konfiqurasiya yolları    | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` runtime kataloqu) |
| **Konfiqurasiya edilə bilən** | `agentproxy configure <cli>` tərəfindən dəstəklənir (quraşdırma resepti mövcuddur)   | `bin/cli/cli-manifest.mjs` (`configure: true`)                     |
| **İşə salına bilən**          | `agentproxy run <target>` tərəfindən dəstəklənir (env/args inyeksiya müəyyən edilib) | `bin/cli/cli-manifest.mjs` (`run: true`)                           |

`bin/cli/cli-manifest.mjs` CLI əmri üçün kanonik icra manifestidir
sahələri: `run`, `configure` və shell-completion generator-ları hamısı
hədəf siyahılarını, alias həllini (məsələn, `kilocode`/`kilo-code`/`kilo_cli` → `kilo`)
və `--model` flag bağlantısını ondan alır. Drift qoruyucusu
`tests/unit/cli/cli-manifest-drift.test.ts` manifestin, runtime
kataloqunun, UI kataloqunun və hər bir istehlakçı sahəsinin uyğun qaldığını təsdiqləyir — bir sahəyə əlavə olunan hədəf
digər sahələr olmadan əlavə edildikdə, sessiya sükutla drift etmək əvəzinə uğursuz olur.

## 1. CLI Kod Kataloqu (26 alət)

`/dashboard/cli-code`-da görünən bütün alətlər. `baseUrlSupport: none` olanlar xüsusi əsas URL əvəzinə MITM və ya manual bələdçi vasitəsilə qoşulmuşdur:

| id           | ad                        | istehsalçı          | baseUrlSupport | konfiqurasiya Növü | acpSpawnable |
| ------------ | ------------------------- | ------------------- | -------------- | ------------------ | ------------ |
| claude       | Claude Kod                | Anthropic           | tam            | env                | true         |
| codex        | OpenAI Codex CLI          | OpenAI              | tam            | xüsusi             | true         |
| zcode        | ZCode (GLM Kodlama Planı) | Z.ai                | heç biri       | xüsusi             | false        |
| cline        | Cline                     | OSS (ex-Claude Dev) | tam            | xüsusi             | true         |
| kilo         | Kilo Kod                  | Kilo-Org            | tam            | xüsusi             | false        |
| roo          | Roo Kod                   | Roo (OSS)           | tam            | bələdçi            | false        |
| continue     | Continue                  | continue.dev        | tam            | bələdçi            | false        |
| aider        | Aider                     | OSS (P. Gauthier)   | tam            | bələdçi            | true         |
| forge        | ForgeCode                 | Antinomy HQ         | tam            | xüsusi             | true         |
| jcode        | jcode                     | 1jehuang (OSS)      | tam            | xüsusi             | false        |
| deepseek-tui | DeepSeek TUI              | Hunter Bown (OSS)   | tam            | xüsusi             | false        |
| codewhale    | CodeWhale                 | Hmbown (OSS)        | tam            | xüsusi             | false        |
| opencode     | OpenCode                  | Anomaly (ex-SST)    | tam            | bələdçi            | true         |
| droid        | Factory Droid             | Factory AI          | qismən         | bələdçi            | false        |
| copilot      | GitHub Copilot CLI        | GitHub/MS           | tam            | xüsusi             | false        |
| cursor-cli   | Cursor CLI                | Anysphere           | qismən         | bələdçi            | true         |
| smelt        | Smelt                     | leonardcser (OSS)   | tam            | xüsusi             | false        |
| pi           | Pi (pi-coding-agent)      | M. Zechner (OSS)    | tam            | xüsusi             | false        |
| grok-build   | Grok Build                | xAI                 | tam            | xüsusi             | false        |
| crush        | Crush                     | OSS (Charm)         | tam            | xüsusi             | false        |
| qwen         | Qwen Kod                  | Alibaba             | tam            | bələdçi            | true         |
| cursor       | Cursor                    | Anysphere           | heç biri       | bələdçi            | false        |
| antigravity  | Antigravity               | Google              | heç biri       | mitm               | false        |
| hermes       | Hermes                    | Nous Research       | heç biri       | bələdçi            | false        |
| kiro         | Kiro AI                   | Amazon              | heç biri       | mitm               | false        |
| custom       | Xüsusi CLI                | —                   | tam            | xüsusi-builder     | false        |

`baseUrlSupport: "partial"` olan alətlər, idarəetmə kartında "⚠ Base URL qismən" nişanı göstərir.

## 2. CLI Agentləri Kataloqu (8 alət)

`/dashboard/cli-agents`-də görünən müstəqil agentlər:

| id           | ad               | istehsalçı               | baseUrlDəstəyi | acpYaradılan |
| ------------ | ---------------- | ------------------------ | -------------- | ------------ |
| hermes-agent | Hermes Agent     | Nous Research            | tam            | false        |
| openclaw     | OpenClaw         | OSS (P. Steinberger)     | tam            | true         |
| goose        | Goose            | Block / Linux Foundation | tam            | true         |
| interpreter  | Open Interpreter | OSS                      | tam            | true         |
| warp         | Warp AI          | Warp Inc.                | qismən         | true         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)      | tam            | false        |
| omp          | Oh My Pi         | OSS                      | tam            | true         |
| letta        | Letta CLI        | Letta                    | tam            | false        |

---

## 3. ACP Agentləri (/dashboard/acp-agents)

Bu səhifə (`/dashboard/agents`-dən adlandırılmışdır) AgentProxy-un stdio/ACP protokolu vasitəsilə **yarada biləcəyi** arxa plan icra mühərriklərini göstərir. Kataloq ayrıca `src/lib/acp/registry.ts`-də saxlanılır və `CLI_TOOLS` ilə **eyni deyil**.

---

## 4. MITM Gecikməsi (dashboard-da göstərilmir)

Aşağıdakı CLI-lər özəl base URL-ni yerli olaraq dəstəkləmir və CLI Kodunun və ya CLI Agentləri səhifələrinin **siyahısında deyil**. Onlar plan 11-də MITM müdaxiləsi üçün namizəddirlər:

| CLI                 | Səbəb                                                         |
| ------------------- | ------------------------------------------------------------- |
| windsurf            | BYOK yalnız seçilmiş Claude modelləri + korporativ URL/token  |
| amp                 | Bağlı ekosistem (Sourcegraph)                                 |
| amazon-q / kiro-cli | AWS SSO auth, özəl URL yoxdur                                 |
| cowork              | Anthropic Desktop, konfiqurasiya edilə bilən son nöqtə yoxdur |

Tam kross-referans üçün `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`-ə baxın.

---

## 5. Batch Detection API

Bütün alət aşkarlanması tək bir son nöqtə vasitəsilə toplanır:

**`GET /api/cli-tools/all-statuses`**

- Auth: `requireCliToolsAuth(request)` (digər `/api/cli-tools/` marşrutları ilə eynidir)
- Dönüş: `Record<toolId, ToolBatchStatus>` (növ: `src/shared/types/cliBatchStatus.ts`)
- Strategiya: `Promise.all` bütün alətlər üzərində, hər alət üçün 5s vaxt aşımı
- Cache: konfiqurasiya faylı `mtime` ilə indekslənmiş yaddaşda LRU. Cache, mtime dəyişdikdə etibarsızlaşdırılır. Server yenidən başladıqda sıfırlanır.

Hər alət üçün cavab forması:

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
  error?: string; // sanitizasiya edilmiş, heç bir stack trace yoxdur
}
```

## 6. Yeni Alətlər Üçün Ayar İdarəediciləri

`configType: "custom"` olan yeni alətlərin xüsusi ayar API marşrutları var:

| Marşrut                                     | Alət                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                                |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url flag)                                                |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, köhnə)                                  |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, əsas + köhnə `~/.deepseek` sinxronizasiya) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                                  |
| `POST /api/cli-tools/pi-settings`           | Pi kodlaşdırma agenti                                                  |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)                  |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + xüsusi `.env` açarı)              |

Bütün marşrutlar xəta cavabları üçün `sanitizeErrorMessage()` istifadə edir (Sərt Qayda #12).

---

## 7. İdarə Paneli Səhifələrinin Arxitekturası

### CLI Kodu (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — server komponenti
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — müştəri grid
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — alət detal səhifəsi
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 ixtisaslaşmış alət kartı + `ToolDetailClient.tsx`

### CLI Agentləri (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — server komponenti
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — müştəri grid
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — `ToolDetailClient`-dən istifadə edir

### ACP Agentləri (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — server komponenti (moved from `agents/`)

### Paylaşılan UI Komponentləri (`src/shared/components/cli/`)

| Fayl                    | Məqsəd                                              |
| ----------------------- | --------------------------------------------------- |
| `CliToolCard.tsx`       | Ağıllı status kartı (detection + config + endpoint) |
| `CliConceptCard.tsx`    | Hər səhifə üçün konsept izah kartı                  |
| `CliComparisonCard.tsx` | CLI növləri arasında üç sütunlu müqayisə            |
| `BaseUrlSelect.tsx`     | Endpoint açılan menyusu (Local/Cloud/Custom)        |
| `ApiKeySelect.tsx`      | API açar seçici                                     |
| `ManualConfigModal.tsx` | Kopyalanabilən konfiqurasiya snippet modal          |

### Paylaşılan Hook (`src/shared/hooks/cli/`)

| Fayl                      | Məqsəd                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | `/api/cli-tools/all-statuses`-i əldə edir, yükləmə/yeniləmə vəziyyətini idarə edir |

## 8. i18n

Plan 14 F9-da yeni adlar əlavə edildi:

| Namespace   | Məqsəd                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------- |
| `cliCommon` | Paylaşılan mətnlər (kart etiketləri, konsept/müqayisə mətnləri, detal səhifə etiketləri) |
| `cliCode`   | CLI Kod səhifə mətnləri                                                                  |
| `cliAgents` | CLI Agentləri səhifə mətnləri                                                            |
| `acpAgents` | ACP Agentləri səhifə mətnləri                                                            |

Tam PT-BR və EN tərcümələri təqdim edilir. 39 digər dil avtomatik olaraq EN-ə geri dönür `src/i18n/request.ts`-də ad səviyyəsində birləşmə vasitəsilə.

---

## 9. Tez Başlama

### Addım 1 — AgentProxy API Açarını Alın

1. `/dashboard/api-manager`-ı açın → **API Açarı Yaradın**
2. Bir ad verin (məsələn, `cli-tools`) və bütün icazələri seçin
3. Açarı kopyalayın — aşağıdakı hər CLI üçün buna ehtiyacınız olacaq

> Açarınız belə görünür: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### Addım 2 — CLI Alətləri Quraşdırın

Bütün npm əsaslı alətlər Node.js 22.22.2+ və ya 24.x tələb edir:

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

# Google Gemini CLI (launchable via `agentproxy run gemini` → /v1beta surface)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Rust əsaslı

# Pi coding agent
# quraşdırma üçün https://github.com/zechnerj/pi-coding-agent-ə baxın

# jcode
# quraşdırma üçün https://github.com/1jehuang/jcode-ə baxın
```

---

### Addım 3 — Dashboard vasitəsilə Konfiqurasiya Edin

1. `http://localhost:20128/dashboard/cli-code`-a gedin
2. Şəbəkədə alətinizi tapın
3. Alət detal səhifəsini açmaq üçün kartı klikləyin
4. API açarınızı və əsas URL-i seçin
5. **Konfiqurasiyanı Tətbiq Et**-i klikləyin və ya manual konfiqurasiya parçasını kopyalayın

---

### Addım 4 — Qlobal Mühit Dəyişənlərini Təyin Edin

```bash
# AgentProxy Universal Endpoint
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI ROOT-da GOOGLE_GEMINI_BASE_URL oxuyur (SDK özü /v1beta/... əlavə edir)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> **Uzaq server** üçün `localhost:20128`-i server IP və ya domen ilə əvəz edin,
> məsələn, `http://<your-server-ip>:20128`.

---

### Addım 4 — Hər Aləti Konfiqurasiya Edin

#### Claude Code

```bash
# ~/.claude/settings.json yaradın:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Claude Code üçün birləşdirilmiş Anthropic qapı kökünü istifadə edin. Burada `/v1` əlavə etməyin.

**Test:** `claude "say hello"`

---

#### OpenAI Codex

Müasir Codex (v0.137+) yalnız `~/.codex/config.toml`-ı oxuyur — köhnə
`config.yaml` köhnə npm CLI-yə aiddir və səssizcə göz ardı edilir. API
açarı `AGENTPROXY_API_KEY` mühit dəyişənində (`env_key`) qalır, heç vaxt
faylda deyil:

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

Tam istinad (profil, `wire_api`, kontekst pəncərələri): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

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

> `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> istifadə edərək düşüncə variantlarını göndərin.

---

#### Cline (CLI və ya VS Code)

**CLI rejimi:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code rejimi:**
Cline genişləndirmə parametrləri → API Provider: `OpenAI Compatible` → Base URL: `http://localhost:20128/v1`

Yaxud AgentProxy dashboardunu istifadə edin → **CLI Alətləri → Cline → Konfiqurasiyanı Tətbiq Et**.

---

#### KiloCode (CLI və ya VS Code)

**CLI rejimi:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**VS Code parametrləri:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Yaxud AgentProxy dashboardunu istifadə edin → **CLI Alətləri → KiloCode → Konfiqurasiyanı Tətbiq Et**.

---

#### Continue (VS Code Genişləndirməsi)

`~/.continue/config.yaml`-ı redaktə edin:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Redaktə etdikdən sonra VS Code-u yenidən başladın.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Bu, VS Code Insiders xüsusi son nöqtə modelləri üçün konfiqurasiya edildikdə və AgentProxy-un xüsusi başlıq sahəsi olmadan işləməsini istədiyiniz zaman istifadə olunur.

**Tövsiyə olunan yer:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Tokenləşdirilmiş AgentProxy təxmini istifadə edərək nümunə:**

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

**Qeydlər:**

- `sk-your-agentproxy-key`-i AgentProxy-da yaradılmış API açarı ilə əvəz edin.
- `url` sahəsi `/api/v1/vscode/{token}/chat/completions`-a işarə etməlidir.
- `modelsUrl` sahəsi `/api/v1/vscode/{token}/models`-a işarə etməlidir.
- Müştəri xüsusi başlıqları dəstəklədikdə normal `/v1` + Bearer başlıq axınını üstün tutun.
- URL-də yerləşdirilmiş tokenlər uyğunluq üçün geri dönüşdür və redaktor qeydlərində və ya proxy tarixində görünə bilər.

---

#### Kiro CLI (Amazon)

```bash
# AWS/Kiro hesabınıza daxil olun:
kiro-cli login

# CLI öz autentifikasiyasını istifadə edir — Kiro CLI üçün AgentProxy arxa planda lazım deyil.
# Kiro CLI-ni AgentProxy ilə yanaşı digər alətlər üçün istifadə edin.
kiro-cli status
```

**Kiro IDE** masaüstü tətbiqi üçün AgentProxy tərəfindən təqdim edilən MITM son nöqtəsini istifadə edin
`/dashboard/cli-tools → Kiro` altında.

## 10. Daxili AgentProxy CLI

`agentproxy` ikili serverin həyat dövrü, qurulması, diaqnostika və təminatçı idarəetməsi üçün əmrlər təqdim edir. Giriş nöqtəsi: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Serveri başladın (default port 20128)
agentproxy setup                        # İnteraktiv qurma sehrbazı
agentproxy doctor                       # Konfiqurasiya, DB, portlar, iş vaxtını yoxlayın
agentproxy providers list               # Konfiqurasiya edilmiş təminatçı bağlantıları
agentproxy providers test-all           # Hər aktiv bağlantını test edin
agentproxy reset-password               # Admin parolunu sıfırlayın
agentproxy logs                         # İstək loglarını axın edin
agentproxy health                       # Ətraflı sağlamlıq (qırıcılar, keş, yaddaş)
agentproxy --version                    # Versiyanı çap edin
agentproxy --help                       # Bütün əmrləri göstərin
```

### Qurma və İnkşaf

```bash
agentproxy setup                        # İnteraktiv qurma sehrbazı
agentproxy setup --non-interactive      # CI/avtomatlaşdırma rejimi (mühit dəyişənlərini + bayraqları oxuyur)
agentproxy setup --password '<value>'   # Admin parolunu birbaşa təyin edin
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # Bir anda təminatçı əlavə edin və test edin
```

İnteraktiv olmayan qurma üçün tanınan mühit dəyişənləri:

| Var                 | Məqsəd                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | Təminatçı API açarı (Commander `.env()` vasitəsilə `--api-key` ilə bağlanır) |
| `DATA_DIR`          | AgentProxy məlumat qovluğunu üstələyin                                        |

Bütün digər interaktiv olmayan girişlər bayraqlar kimi ötürülür, mühit dəyişənləri kimi deyil:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(baxın `agentproxy setup` seçimlərinə yuxarıda).

### Diaqnostika

```bash
agentproxy doctor                       # Konfiqurasiya, DB, portlar, iş vaxtı, yaddaş, canlılıq yoxlayın
agentproxy doctor --json                # Maşın oxunaqlı JSON
agentproxy doctor --no-liveness         # HTTP sağlamlıq probunu atlayın
agentproxy doctor --host 0.0.0.0        # Canlılıq hostunu üstələyin
agentproxy doctor --liveness-url <url>  # Tam sağlamlıq son nöqtəsi URL üstələyin
```

Doktor bu yoxlamaları aparır: `Konfiqurasiya`, `Veritabanı`, `Saxlama/şifrələmə`,
`Port mövcudluğu`, `Node iş vaxtı`, `Təbiət ikilisi` (better-sqlite3),
`Yaddaş` və `Server canlılığı`. Hər hansı bir yoxlama `uğursuz` olarsa, sıfırdan fərqli bir çıxış edir.

### Təminatçı İdarəetməsi

```bash
agentproxy providers available                       # AgentProxy təminatçı kataloqu
agentproxy providers available --search openai       # Kataloqu id/ad/şəxsiyyət/kateqoriya ilə süzgəcdən keçirin
agentproxy providers available --category api-key    # Kateqoriya ilə süzgəcdən keçirin (api-key, oauth, pulsuz, ...)
agentproxy providers available --json                # Maşın oxunaqlı JSON

agentproxy providers list                            # Konfiqurasiya edilmiş təminatçı bağlantıları
agentproxy providers list --json

agentproxy providers test <id|name>                  # Bir konfiqurasiya edilmiş bağlantını test edin
agentproxy providers test-all                        # Hər aktiv bağlantını test edin
agentproxy providers validate                        # Yalnız yerli struktural yoxlama
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # Mövcud OAuth axını
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` API-ilkdir və buna görə də
aktiv yerli və ya uzaq kontekstə qarşı işləyir. Şifrə girişləri
`--credential-stdin` və ya `--credential-env` istifadə etməlidir; `--dry-run --json` yalnız
redaktə edilmiş mövcudluğu/formasını bildirir. `providers available` AgentProxy kataloqunu oxuyur;
`providers list/test/test-all/validate` yerli SQLite davranışını saxlayır və
serverin işləməsini tələb etmir.

### Bərpa və Sıfırlama

```bash
agentproxy reset-password                # Admin parolunu sıfırlayın (həmçinin: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Şifrələnmiş şifrə sıfırlaması üçün xəbərdarlıq + dry-run göstərin
agentproxy reset-encrypted-columns --force  # SQLite-də şifrələnmiş şifrələri faktiki olaraq sıfırlayın
```

### Şifrə İxracı (⚠ diqqətlə idarə edin)

```bash
agentproxy auth export                                 # Xəbərdarlıq + təsdiq qapısı göstərin — DB giriş yoxdur
agentproxy auth export --force                          # BÜTÜN bağlantıların ŞİFRƏLƏNMİŞ şifrələrini stdout-a JSON olaraq ixrac edin
agentproxy auth export --force --id <id>                 # Yalnız uyğun bağlantını ixrac edin
agentproxy auth export --force --format env               # AGENTPROXY_<PROVIDER>_<FIELD>=<value> xətləri çıxarın
agentproxy auth export --force --out creds.json           # Fayla yazın (0600 icazələri ilə yaradılır)
```

`auth export` **yalnız yerli** (birbaşa SQLite oxuma, HTTP marşrutu yoxdur) və qəsdən çap edir/yazır
**düz mətndə** `apiKey`/`accessToken`/`refreshToken`/`idToken` dəyərləri — bu, xüsusiyyətdir, səhv deyil.
Veritabanından heç nə oxunmur və heç nə şifrəsi açılmır, `--force` olmadan. Hər zaman düz mətndə çıxarılmadan əvvəl bir stderr xəbərdarlıq banneri çap olunur. `STORAGE_ENCRYPTION_KEY` təyin edilməlidir. Şifrələnmədə uğursuz olan bir sahə (köhnə açar, korrupt şifrələnmiş mətn)
`<field>DecryptFailed: true` olaraq bildirilir, bütün ixracı dayandırmadan və ya əsas səhvi sızdırmadan.

### Digər alt əmrlər

Bunlar işləyən AgentProxy serverini tələb edir, əks halda qeyd edilməmişdir:

```bash
agentproxy status                       # Ətraflı iş vaxtı statusu
agentproxy logs                         # İstək loglarını axın edin (--json, --search, --follow)
agentproxy config show                  # Cari konfiqurasiyanı göstərin

agentproxy provider list                # Mövcud təminatçıları siyahıya alın (providers list-in təkrarı)
agentproxy provider add                 # AgentProxy-u bir alətdə təminatçı kimi qeyd edin
agentproxy keys add | list | remove     # API açarlarını idarə edin
agentproxy models [provider]            # Modelləri siyahıya alın (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Konfiqurasiya + DB snapshot
agentproxy restore                      # Əvvəlki snapshot-dan bərpa edin

agentproxy health                       # Ətraflı sağlamlıq (qırıcılar, keş, yaddaş)
agentproxy quota                        # Təminatçı kvota istifadəsi
agentproxy cache                        # Keş statusu
agentproxy cache clear                  # Semantik + imza keşlərini təmizləyin

agentproxy mcp status | restart         # MCP server statusu / yenidən başladın
agentproxy a2a status | card            # A2A server statusu / agent kartı

agentproxy tunnel list | create | stop  # Tunelləri idarə edin (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Mühit dəyişənlərini yoxlayın / təyin edin (müvəqqəti)

agentproxy test                         # Təminatçı bağlantısı test
agentproxy update                       # Yeniləmələri yoxlayın
agentproxy completion                   # Shell tamamlanmasını yaradın
```

### Ümumi bayraqlar

| Bayraq              | Təsvir                                                 |
| ------------------- | ------------------------------------------------------ |
| `--no-open`         | Başlanğıcda brauzeri avtomatik açmayın                 |
| `--port <n>`        | API portunu üstələyin (default 20128)                  |
| `--mcp`             | IDE-lər üçün stdio üzərində MCP serveri kimi işləyin   |
| `--non-interactive` | CI rejimi (sorğular yoxdur; mühit/bayraqlardan oxuyur) |
| `--json`            | Maşın oxunaqlı JSON çıxışı (doctor, providers və s.)   |
| `--help`, `-h`      | Əmrə spesifik kömək göstərin                           |
| `--version`, `-v`   | Quraşdırılmış versiyanı çap edin                       |

---

## Mövcud API Son Nöqtələri

| Son Nöqtə                  | Təsvir                               | İstifadə Üçün                         |
| -------------------------- | ------------------------------------ | ------------------------------------- |
| `/v1/chat/completions`     | Standart söhbət (bütün provayderlər) | Bütün müasir alətlər                  |
| `/v1/responses`            | Cavablar API (OpenAI formatı)        | Codex, agentik iş axınları            |
| `/v1/completions`          | Köhnə mətn tamamlamaları             | `prompt:` istifadə edən köhnə alətlər |
| `/v1/embeddings`           | Mətn yerləşdirmələri                 | RAG, axtarış                          |
| `/v1/images/generations`   | Şəkil yaradılması                    | GPT-Image, Flux və s.                 |
| `/v1/audio/speech`         | Mətn-dan-səs                         | ElevenLabs, OpenAI TTS                |
| `/v1/audio/transcriptions` | Səs-dan-mətn                         | Deepgram, AssemblyAI                  |

Yerləşdirmək üçün hazır nümunələr tokenləşdirilmiş AgentProxy URL ilə:

```txt
Token nümunəsi: sk-a3ab3c080beaee3a-69f4a4-070d71af

Standart OpenAI bazası: http://localhost:20128/v1
VS Code modelləri: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code söhbəti: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code cavabları: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama etiketləri: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama söhbəti: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Problemlərin Həlli

| Xəta                                                     | Səbəb                            | Həll                                                    |
| -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `Connection refused`                                     | AgentProxy işləmir                | `agentproxy serve`                                       |
| `401 Unauthorized`                                       | Yanlış API açarı                 | `/dashboard/api-manager`-də yoxlayın                    |
| `No combo configured`                                    | Aktiv yönləndirmə kombosu yoxdur | `/dashboard/combos`-da qurun                            |
| CLI "quraşdırılmayıb" göstərir                           | İcra faylı PATH-da deyil         | `which <command>`-i yoxlayın                            |
| Dashboard quraşdırmadan sonra "təsbit edilmədi" göstərir | Keş köhnədir                     | Dashboard-da "⟳ Təsbiti yenilə" düyməsini basın         |
| Köhnə link `/dashboard/cli-tools`                        | Pre-v3.8.6 işarəsi               | `/dashboard/cli-code`-ə avtomatik yönləndirilir (308)   |
| Köhnə link `/dashboard/agents`                           | Pre-v3.8.6 işarəsi               | `/dashboard/acp-agents`-ə avtomatik yönləndirilir (308) |
