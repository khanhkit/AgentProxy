# CLI-TOOLS (العربية)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "أدوات CLI — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# أدوات CLI — AgentProxy

آخر تحديث: 2026-08-18

يتكامل AgentProxy مع ثلاث فئات من أدوات CLI موزعة عبر ثلاث صفحات لوحة معلومات مخصصة:

| الصفحة        | المسار                  | المفهوم                                                                   | العدد      |
| ------------- | ----------------------- | ------------------------------------------------------------------------- | ---------- |
| **كود CLI**   | `/dashboard/cli-code`   | أدوات البرمجة التي تشير إلى AgentProxy (العميل → CLI → AgentProxy → المزود) | 26         |
| **وكلاء CLI** | `/dashboard/cli-agents` | وكلاء مستقلون تشير إلى AgentProxy (نفس التدفق، نطاق أوسع)                  | 8          |
| **وكلاء ACP** | `/dashboard/acp-agents` | CLIs التي يولدها AgentProxy كخلفية عبر stdio/ACP (تدفق عكسي)               | انظر السجل |

تقوم المسارات القديمة بإعادة التوجيه عبر 308: `/dashboard/cli-tools` → `/dashboard/cli-code`، `/dashboard/agents` → `/dashboard/acp-agents`.

---

## كيف يعمل

```
كود CLI / وكلاء CLI (تدفق الاستهلاك):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (جميعها تشير إلى AgentProxy)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (يقوم AgentProxy بتوجيه الطلب إلى المزود الصحيح)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

وكلاء ACP (تدفق توليد عكسي):
    طلب العميل → AgentProxy → يولد CLI عبر stdio/ACP → استجابة
```

**الفوائد:**

- مفتاح API واحد لإدارة جميع الأدوات
- تتبع التكاليف عبر جميع CLIs في لوحة المعلومات
- تبديل النماذج دون إعادة تكوين كل أداة
- يعمل محليًا وعلى الخوادم البعيدة (VPS، Docker، Akamai، Cloudflare Tunnel)

---

## التكوين التلقائي مع `setup-*`

لا تحتاج إلى كتابة تكوين كل أداة يدويًا. يقوم AgentProxy بتوفير أمر `setup-*`
لكل CLI مدعوم يقرأ كتالوج النموذج **الحالي** من AgentProxy قيد التشغيل (محلي أو بعيد) ويكتب تكوين الأداة الخاصة بك على جهازك:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
```

كل منها يقبل `--remote <url> --api-key <key>` (تكوين أداة محلية ضد AgentProxy بعيد)، `--dry-run` (معاينة دون كتابة)، و `--port`. الأدوات التي لا تحتوي على اكتشاف تلقائي للنموذج (Cline، Kilo، Roo، Goose، Aider، Qwen) تأخذ `--model <id>` (و `--yes` للتشغيل غير التفاعلي). لإطلاق CLI مع البيئة الصحيحة المدخلة ودون كتابة أي تكوين على الإطلاق، استخدم المشغل العام
`agentproxy run <target>` (claude، codex، aider، goose، opencode، qwen،
gemini — الأهداف والأسماء المستعارة تأتي من `bin/cli/cli-manifest.mjs`); تظل المشغلات القديمة لكل أداة `agentproxy launch` (Claude Code) و `agentproxy launch-codex`
(Codex) متاحة. CLI Gemini هو فقط للإطلاق: إنه هدف `agentproxy run`
ولكن ليس له وصفة `setup-*`/`configure`.

> **المرجع الكامل:** الجدول الرئيسي — ما يكتبه كل أمر، كل علامة،
> محلي مقابل بعيد، وأي الأدوات تحتاج إلى لاحقة `/v1` — موجود في
> **[تكاملات CLI](../guides/CLI-INTEGRATIONS.md)**.

### تشغيل هذه داخل حاوية

أمر `setup-*` المنفذ داخل حاوية AgentProxy يكتب في
المنزل الخاص بالحاوية، والذي لا تقرأه أي CLI مضيف والذي يختفي مع
الحاوية. يكتشف AgentProxy ذلك ويخرج `2` مع تعليمات بدلاً من
الكتابة. هناك طريقتان مدعومتان للمضي قدمًا — تثبيت CLI على المضيف و
`agentproxy connect` إلى الحاوية، أو ربط مجلدات التكوين وتعيين
`CLI_CONFIG_HOME` (ملف تعريف المضيف في التكوين). كل أمر `setup-*`، بالإضافة إلى
`agentproxy configure` و `agentproxy config set`، يقبل
`--allow-container-write` عندما يكون تكوين CLIs الخاصة بالحاوية هو ما كنت تعنيه بالفعل؛ `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` يفعل نفس الشيء للخادم. انظر
[دليل Docker → تكوين أدوات CLI المضيف](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

نقطة النهاية **apply** في لوحة المعلومات (`POST /api/cli-tools/apply`) تفرض نفس الحماية: في حاوية، كتابة الهدف الذي لم يتم ربطه من المضيف يجيب **`422`** مع `containerEphemeralTarget: true`، نص الخطأ الآمن و — للأدوات التي لديها وصفة مضيف (claude، codex، opencode، cline،
kilo، continue) — أمر `hostSetupCommand` (مثل `agentproxy setup-opencode`) للتشغيل
على المضيف بدلاً من ذلك؛ لا يتم كتابة أي شيء. `dryRun: true` يستمر في العمل في وضع الحاوية
ويعيد المحتوى الناتج + مسار الهدف دون لمس القرص، لذا يمكنك المعاينة من لوحة المعلومات وتطبيقها على المضيف. هذا السلوك
مقصود ومحمى من التراجع بواسطة
`tests/unit/api/cli-tools/apply-container-guard.test.ts` — لا "تصلح" 422
عن طريق إزالة الحماية.

---

## مصدر الحقيقة

يعيش الكتالوج الموحد في `src/shared/constants/cliTools.ts` كـ `CLI_TOOLS: Record<string, CliCatalogEntry>`.

كل إدخال يحتوي على هذه الحقول (المعرفة في `src/shared/schemas/cliCatalog.ts`):

| الحقل                                           | النوع                                                        | الوصف                                                   |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `category`                                      | `"code" \| "agent"`                                          | الصفحة التي يظهر عليها الأداة                           |
| `vendor`                                        | `string`                                                     | أصل الأداة ("Anthropic"، "OSS (P. Gauthier)")           |
| `acpSpawnable`                                  | `boolean`                                                    | يمكن استخدامها أيضًا كعميل ACP (شعار يظهر)              |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | مستوى دعم نقطة النهاية المخصصة. `"none"` = MITM backlog |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | آلية التكوين                                            |
| `id`, `name`, `color`, `description`, `docsUrl` | قياسي                                                        | حقول العرض الأساسية                                     |

الإدخالات التي تحتوي على `baseUrlSupport: "none"` **لا تظهر** في صفحات لوحة المعلومات — فهي مسجلة في MITM backlog للخطة 11 (انظر `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### مستويات القدرة (موثقة × قابلة للاكتشاف × قابلة للتكوين × قابلة للتشغيل)

ليس كل أداة موثقة قابلة للاكتشاف أو التكوين أو التشغيل. كل مستوى له مصدر يعلن عنه، واختبار الانجراف يحافظ على توافقها:

| المستوى            | المعنى                                                              | معلن عنه                                                          |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **موثقة**          | تظهر في كتالوج لوحة المعلومات (الاسم، البائع، الوثائق، نوع التكوين) | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                  |
| **قابلة للاكتشاف** | اكتشاف الثنائيات/التكوين، فحوصات الصحة، مسارات التكوين              | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` runtime catalog) |
| **قابلة للتكوين**  | مدعومة بواسطة `agentproxy configure <cli>` (وصفة الإعداد موجودة)     | `bin/cli/cli-manifest.mjs` (`configure: true`)                    |
| **قابلة للتشغيل**  | مدعومة بواسطة `agentproxy run <target>` (حقن env/args معرف)          | `bin/cli/cli-manifest.mjs` (`run: true`)                          |

`bin/cli/cli-manifest.mjs` هو البيان التنفيذي القياسي لأوامر CLI: `run`، `configure` ومولدات إكمال الصدفة جميعها تستمد قوائم أهدافها، وحل الأسماء المستعارة (على سبيل المثال `kilocode`/`kilo-code`/`kilo_cli` → `kilo`) وتوصيل علامة `--model` منها. يضمن حارس الانجراف
`tests/unit/cli/cli-manifest-drift.test.ts` أن البيان، كتالوج وقت التشغيل، كتالوج واجهة المستخدم وكل سطح مستهلك يبقى متزامنًا — الهدف المضاف إلى
سطح واحد دون الآخرين يفشل المجموعة بدلاً من الانجراف بصمت.

## 1. كتالوج كود CLI (26 أداة)

جميع الأدوات التي تظهر في `/dashboard/cli-code`. تلك التي تحتوي على `baseUrlSupport: none` متصلة من خلال MITM أو دليل يدوي بدلاً من عنوان URL أساسي مخصص:

| id           | name                           | vendor              | baseUrlSupport | configType | acpSpawnable |
| ------------ | ------------------------------ | ------------------- | -------------- | ---------- | ------------ |
| claude       | كود كلود                       | أنثروبيك            | كامل           | env        | true         |
| codex        | واجهة سطر أوامر OpenAI Codex   | OpenAI              | كامل           | مخصص       | true         |
| zcode        | ZCode (خطة ترميز GLM)          | Z.ai                | لا شيء         | مخصص       | false        |
| cline        | كلاين                          | OSS (ex-Claude Dev) | كامل           | مخصص       | true         |
| kilo         | كود كيلو                       | Kilo-Org            | كامل           | مخصص       | false        |
| roo          | كود رو                         | رو (OSS)            | كامل           | دليل       | false        |
| continue     | تابع                           | continue.dev        | كامل           | دليل       | false        |
| aider        | مساعد                          | OSS (P. Gauthier)   | كامل           | دليل       | true         |
| forge        | ForgeCode                      | Antinomy HQ         | كامل           | مخصص       | true         |
| jcode        | jcode                          | 1jehuang (OSS)      | كامل           | مخصص       | false        |
| deepseek-tui | واجهة DeepSeek TUI             | Hunter Bown (OSS)   | كامل           | مخصص       | false        |
| codewhale    | CodeWhale                      | Hmbown (OSS)        | كامل           | مخصص       | false        |
| opencode     | OpenCode                       | Anomaly (ex-SST)    | كامل           | دليل       | true         |
| droid        | Factory Droid                  | Factory AI          | جزئي           | دليل       | false        |
| copilot      | واجهة سطر أوامر GitHub Copilot | GitHub/MS           | كامل           | مخصص       | false        |
| cursor-cli   | واجهة سطر أوامر Cursor         | Anysphere           | جزئي           | دليل       | true         |
| smelt        | صهر                            | leonardcser (OSS)   | كامل           | مخصص       | false        |
| pi           | باي (عميل ترميز باي)           | M. Zechner (OSS)    | كامل           | مخصص       | false        |
| grok-build   | بناء Grok                      | xAI                 | كامل           | مخصص       | false        |
| crush        | سحق                            | OSS (Charm)         | كامل           | مخصص       | false        |
| qwen         | كود كوين                       | Alibaba             | كامل           | دليل       | true         |
| cursor       | مؤشر                           | Anysphere           | لا شيء         | دليل       | false        |
| antigravity  | مضاد الجاذبية                  | Google              | لا شيء         | mitm       | false        |
| hermes       | هيرميس                         | Nous Research       | لا شيء         | دليل       | false        |
| kiro         | كيرو AI                        | أمازون              | لا شيء         | mitm       | false        |
| custom       | واجهة سطر أوامر مخصصة          | —                   | كامل           | منشئ مخصص  | false        |

الأدوات التي تحتوي على `baseUrlSupport: "جزئي"` تظهر شارة "⚠ عنوان URL أساسي جزئي" في بطاقة لوحة المعلومات.

## 2. كتالوج وكلاء CLI (8 أدوات)

الوكلاء المستقلون الذين يظهرون في `/dashboard/cli-agents`:

| id           | الاسم            | البائع               | دعم baseUrl | acpSpawnable |
| ------------ | ---------------- | -------------------- | ----------- | ------------ |
| hermes-agent | وكيل هيرميس      | أبحاث نوس            | كامل        | خطأ          |
| openclaw     | OpenClaw         | OSS (P. Steinberger) | كامل        | صحيح         |
| goose        | Goose            | Block / مؤسسة لينكس  | كامل        | صحيح         |
| interpreter  | Open Interpreter | OSS                  | كامل        | صحيح         |
| warp         | Warp AI          | Warp Inc.            | جزئي        | صحيح         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)  | كامل        | خطأ          |
| omp          | Oh My Pi         | OSS                  | كامل        | صحيح         |
| letta        | Letta CLI        | Letta                | كامل        | خطأ          |

---

## 3. وكلاء ACP (/dashboard/acp-agents)

تظهر هذه الصفحة (التي تم إعادة تسميتها من `/dashboard/agents`) واجهات CLI التي يمكن لـ AgentProxy **إنشاؤها** كأدوات تنفيذ خلفية عبر بروتوكول stdio/ACP. يتم الحفاظ على الكتالوج بشكل منفصل في `src/lib/acp/registry.ts` وهو **ليس** نفس `CLI_TOOLS`.

---

## 4. قائمة الانتظار MITM (غير معروضة في لوحة التحكم)

لا تدعم واجهات CLI التالية عنوان URL الأساسي المخصص بشكل أصلي وهي **غير مدرجة** في صفحات كود CLI أو وكلاء CLI. هم مرشحون للاعتراض MITM في الخطة 11:

| CLI                 | السبب                                                     |
| ------------------- | --------------------------------------------------------- |
| windsurf            | BYOK محدود لنماذج كلود المختارة + عنوان URL/token الشركات |
| amp                 | نظام مغلق (Sourcegraph)                                   |
| amazon-q / kiro-cli | مصادقة AWS SSO، لا يوجد عنوان URL مخصص                    |
| cowork              | Anthropic Desktop، لا يوجد نقطة نهاية قابلة للتكوين       |

راجع `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` للحصول على المرجع الكامل.

---

## 5. واجهة برمجة تطبيقات اكتشاف الدفعات

يتم تجميع جميع اكتشاف الأدوات عبر نقطة نهاية واحدة:

**`GET /api/cli-tools/all-statuses`**

- المصادقة: `requireCliToolsAuth(request)` (نفس مسارات `/api/cli-tools/` الأخرى)
- العائدات: `Record<toolId, ToolBatchStatus>` (النوع: `src/shared/types/cliBatchStatus.ts`)
- الاستراتيجية: `Promise.all` على جميع الأدوات، مهلة 5 ثوان لكل أداة
- التخزين المؤقت: في الذاكرة LRU مفهرس بواسطة ملف التكوين `mtime`. يتم إبطال التخزين المؤقت عند تغيير mtime. يتم إعادة تعيينه عند إعادة تشغيل الخادم.

شكل الاستجابة لكل أداة:

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
  error?: string; // تم تنظيفه، لا توجد تتبع للأخطاء
}
```

## 6. معالجات الإعدادات للأدوات الجديدة

الأدوات الجديدة التي تحتوي على `configType: "custom"` لديها مسارات واجهة برمجة التطبيقات المخصصة للإعدادات:

| المسار                                      | الأداة                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                          |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url flag)                                          |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, legacy)                           |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, primary + legacy `~/.deepseek` sync) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                            |
| `POST /api/cli-tools/pi-settings`           | Pi coding agent                                                  |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)            |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + dedicated `.env` key)       |

جميع المسارات تستخدم `sanitizeErrorMessage()` لردود الأخطاء (قاعدة صارمة #12).

---

## 7. هيكل صفحات لوحة التحكم

### كود CLI (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — مكون خادم
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — شبكة عميل
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — صفحة تفاصيل الأداة
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 بطاقة أداة متخصصة + `ToolDetailClient.tsx`

### وكلاء CLI (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — مكون خادم
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — شبكة عميل
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — يعيد استخدام `ToolDetailClient`

### وكلاء ACP (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — مكون خادم (تم نقله من `agents/`)

### مكونات واجهة المستخدم المشتركة (`src/shared/components/cli/`)

| الملف                   | الغرض                                            |
| ----------------------- | ------------------------------------------------ |
| `CliToolCard.tsx`       | بطاقة حالة ذكية (الكشف + الإعداد + نقطة النهاية) |
| `CliConceptCard.tsx`    | بطاقة شرح مفهوم لكل صفحة                         |
| `CliComparisonCard.tsx` | مقارنة عبر ثلاثة أعمدة بين أنواع CLI             |
| `BaseUrlSelect.tsx`     | قائمة منسدلة لنقطة النهاية (محلي/سحابي/مخصص)     |
| `ApiKeySelect.tsx`      | محدد مفتاح API                                   |
| `ManualConfigModal.tsx` | نافذة نموذج مقتطف الإعداد القابل للنسخ           |

### هوك مشترك (`src/shared/hooks/cli/`)

| الملف                     | الغرض                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | يجلب `/api/cli-tools/all-statuses`، يدير حالة التحميل/التحديث |

---

## 8. i18n

تمت إضافة مساحات أسماء جديدة في الخطة 14 F9:

| مساحة الاسم | الغرض                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| `cliCommon` | سلاسل مشتركة (تسميات البطاقات، نصوص المفاهيم/المقارنات، تسميات صفحات التفاصيل) |
| `cliCode`   | سلاسل صفحة CLI Code                                                            |
| `cliAgents` | سلاسل صفحة CLI Agents                                                          |
| `acpAgents` | سلاسل صفحة ACP Agents                                                          |

تم توفير ترجمات كاملة بالبرتغالية البرازيلية والإنجليزية. 39 لغة أخرى تتراجع تلقائيًا إلى الإنجليزية عبر دمج مستوى مساحة الاسم في `src/i18n/request.ts`.

---

## 9. البدء السريع

### الخطوة 1 — الحصول على مفتاح API لـ AgentProxy

1. افتح `/dashboard/api-manager` → **إنشاء مفتاح API**
2. أعطه اسمًا (مثل `cli-tools`) واختر جميع الأذونات
3. انسخ المفتاح — ستحتاجه لكل CLI أدناه

> يبدو مفتاحك كالتالي: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### الخطوة 2 — تثبيت أدوات CLI

تتطلب جميع الأدوات المعتمدة على npm Node.js 22.22.2+ أو 24.x:

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

# Google Gemini CLI (يمكن تشغيله عبر `agentproxy run gemini` → /v1beta surface)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # يعتمد على Rust

# وكيل برمجة Pi
# انظر https://github.com/zechnerj/pi-coding-agent للتثبيت

# jcode
# انظر https://github.com/1jehuang/jcode للتثبيت
```

---

### الخطوة 3 — التكوين عبر لوحة التحكم

1. انتقل إلى `http://localhost:20128/dashboard/cli-code`
2. ابحث عن أداتك في الشبكة
3. انقر على البطاقة لفتح صفحة تفاصيل الأداة
4. اختر مفتاح API الخاص بك وURL الأساسي
5. انقر على **تطبيق التكوين** أو انسخ مقتطف التكوين اليدوي

---

### الخطوة 4 — تعيين متغيرات البيئة العالمية

```bash
# نقطة النهاية العالمية لـ AgentProxy
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# يقرأ Gemini CLI GOOGLE_GEMINI_BASE_URL عند الجذر (تضيف SDK الخاصة به /v1beta/... بنفسها)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> لاستبدال `localhost:20128` بـ IP الخادم أو النطاق في **خادم بعيد**،
> مثل `http://<your-server-ip>:20128`.

---

### الخطوة 4 — تكوين كل أداة

#### Claude Code

```bash
# إنشاء ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

استخدم جذر بوابة Anthropic الموحدة لـ Claude Code. لا تضف `/v1` هنا.

**اختبار:** `claude "say hello"`

---

#### OpenAI Codex

يقرأ Codex الحديث (v0.137+) `~/.codex/config.toml` فقط — ينتمي `config.yaml` القديم إلى CLI npm التقليدي ويتم تجاهله بصمت. يبقى مفتاح API في متغير البيئة `AGENTPROXY_API_KEY` (`env_key`)، وليس داخل الملف:

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

مرجع كامل (الملفات الشخصية، `wire_api`، نوافذ السياق): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

**اختبار:** `codex "what is 2+2?"`

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

**اختبار:** `opencode`

> استخدم `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> لإرسال متغيرات التفكير.

---

#### Cline (CLI أو VS Code)

**وضع CLI:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**وضع VS Code:**
إعدادات ملحق Cline → مزود API: `OpenAI Compatible` → URL الأساسي: `http://localhost:20128/v1`

أو استخدم لوحة التحكم AgentProxy → **أدوات CLI → Cline → تطبيق التكوين**.

---

#### KiloCode (CLI أو VS Code)

**وضع CLI:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**إعدادات VS Code:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

أو استخدم لوحة التحكم AgentProxy → **أدوات CLI → KiloCode → تطبيق التكوين**.

---

#### Continue (ملحق VS Code)

قم بتحرير `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

أعد تشغيل VS Code بعد التحرير.

---

#### VS Code Insiders (`chatLanguageModels.json`)

استخدم هذا عندما يتم تكوين VS Code Insiders لنماذج نقاط النهاية المخصصة وتريد أن يعمل AgentProxy بدون حقل رأس مخصص.

**الموقع الموصى به:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**مثال باستخدام اسم مستعار AgentProxy المرمز:**

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

**ملاحظات:**

- استبدل `sk-your-agentproxy-key` بمفتاح API تم إنشاؤه في AgentProxy.
- يجب أن يشير حقل `url` إلى `/api/v1/vscode/{token}/chat/completions`.
- يجب أن يشير حقل `modelsUrl` إلى `/api/v1/vscode/{token}/models`.
- يفضل استخدام تدفق `/v1` العادي + رأس Bearer عندما يدعم العميل الرؤوس المخصصة.
- تعتبر الرموز المدمجة في URL تراجعًا للتوافق وقد تظهر في سجلات المحرر أو تاريخ الوكيل.

---

#### Kiro CLI (أمازون)

```bash
# تسجيل الدخول إلى حساب AWS/Kiro الخاص بك:
kiro-cli login

# يستخدم CLI مصادقة خاصة به — لا حاجة لـ AgentProxy كخلفية لـ Kiro CLI نفسه.
# استخدم kiro-cli جنبًا إلى جنب مع AgentProxy لأدوات أخرى.
kiro-cli status
```

بالنسبة لتطبيق **Kiro IDE** المكتبي، استخدم نقطة النهاية MITM التي تعرضها AgentProxy
تحت `/dashboard/cli-tools → Kiro`.

---

## 10. واجهة الأوامر الداخلية لـ AgentProxy

يوفر الملف الثنائي `agentproxy` أوامر لدورة حياة الخادم، الإعداد، التشخيص، وإدارة المزودين. نقطة الدخول: `bin/agentproxy.mjs`.

```bash
agentproxy                              # بدء الخادم (المنفذ الافتراضي 20128)
agentproxy setup                        # معالج الإعداد التفاعلي
agentproxy doctor                       # التحقق من التكوين، قاعدة البيانات، المنافذ، وقت التشغيل
agentproxy providers list               # اتصالات المزودين المكونة
agentproxy providers test-all           # اختبار كل اتصال نشط
agentproxy reset-password               # إعادة تعيين كلمة مرور المسؤول
agentproxy logs                         # بث سجلات الطلبات
agentproxy health                       # صحة مفصلة (قواطع، ذاكرة مؤقتة، ذاكرة)
agentproxy --version                    # طباعة الإصدار
agentproxy --help                       # عرض جميع الأوامر
```

### الإعداد والت initialization

```bash
agentproxy setup                        # معالج الإعداد التفاعلي
agentproxy setup --non-interactive      # وضع CI/الأتمتة (يقرأ متغيرات البيئة + العلامات)
agentproxy setup --password '<value>'   # تعيين كلمة مرور المسؤول مباشرة
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # إضافة واختبار مزود في خطوة واحدة
```

متغيرات البيئة المعترف بها للإعداد غير التفاعلي:

| Var                 | الغرض                                                          |
| ------------------- | -------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | مفتاح API للمزود (مرتبط بـ `--api-key` عبر Commander `.env()`) |
| `DATA_DIR`          | تجاوز دليل بيانات AgentProxy                                    |

جميع المدخلات غير التفاعلية الأخرى تمر كعلامات، وليس كمتغيرات بيئة:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(انظر خيارات `agentproxy setup` أعلاه).

### التشخيص

```bash
agentproxy doctor                       # التحقق من التكوين، قاعدة البيانات، المنافذ، وقت التشغيل، الذاكرة، الحيادية
agentproxy doctor --json                # JSON قابل للقراءة بواسطة الآلة
agentproxy doctor --no-liveness         # تخطي اختبار صحة HTTP
agentproxy doctor --host 0.0.0.0        # تجاوز مضيف الحيادية
agentproxy doctor --liveness-url <url>  # تجاوز عنوان URL لنقطة النهاية الصحية بالكامل
```

يقوم الطبيب بتشغيل هذه الفحوصات: `التكوين`، `قاعدة البيانات`، `التخزين/التشفير`،
`توفر المنفذ`، `وقت تشغيل العقدة`، `الملف الثنائي الأصلي` (better-sqlite3)،
`الذاكرة`، و`حيادية الخادم`. يخرج برقم غير صفري إذا فشل أي فحص.

### إدارة المزودين

```bash
agentproxy providers available                       # كتالوج مزود AgentProxy
agentproxy providers available --search openai       # تصفية الكتالوج حسب id/الاسم/الاسم المستعار/الفئة
agentproxy providers available --category api-key    # تصفية حسب الفئة (api-key، oauth، مجاني، ...)
agentproxy providers available --json                # JSON قابل للقراءة بواسطة الآلة

agentproxy providers list                            # اتصالات المزودين المكونة
agentproxy providers list --json

agentproxy providers test <id|name>                  # اختبار اتصال واحد مكون
agentproxy providers test-all                        # اختبار كل اتصال نشط
agentproxy providers validate                        # التحقق الهيكلي المحلي فقط
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # تدفق OAuth موجود
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` هي أولاً API وبالتالي تعمل ضد
السياق المحلي أو البعيد النشط. يجب أن تستخدم إدخال الاعتماد
`--credential-stdin` أو `--credential-env`؛ `--dry-run --json` تقارير فقط
عن الوجود/الشكل المحجوب. `providers available` يقرأ كتالوج AgentProxy؛
`providers list/test/test-all/validate` تحتفظ بسلوك SQLite المحلي الخاص بها ولا تتطلب تشغيل الخادم.

### الاسترداد وإعادة التعيين

```bash
agentproxy reset-password                # إعادة تعيين كلمة مرور المسؤول (أيضًا: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # عرض تحذير + تشغيل جافا لتعيين الاعتماد المشفر
agentproxy reset-encrypted-columns --force  # فعليًا إلغاء الاعتمادات المشفرة في SQLite
```

### تصدير الاعتماد (⚠ التعامل بحذر)

```bash
agentproxy auth export                                 # عرض تحذير + بوابة تأكيد — لا يوجد وصول إلى قاعدة البيانات
agentproxy auth export --force                          # تصدير جميع اعتمادات الاتصالات غير المشفرة إلى stdout كـ JSON
agentproxy auth export --force --id <id>                 # تصدير فقط الاتصال المطابق
agentproxy auth export --force --format env               # إصدار خطوط AGENTPROXY_<PROVIDER>_<FIELD>=<value>
agentproxy auth export --force --out creds.json           # الكتابة إلى ملف (تم إنشاؤه بأذونات 0600)
```

`auth export` هو **محلي فقط** (قراءة SQLite مباشرة، لا يوجد مسار HTTP) ويطبع/يكتب عمدًا
قيم `apiKey`/`accessToken`/`refreshToken`/`idToken` **بشكل نصي** — هذه هي الميزة، وليست
خطأ. لا يتم قراءة أي شيء من قاعدة البيانات، ولا يتم فك تشفير أي شيء، بدون `--force`. يتم دائمًا طباعة لافتة تحذير stderr قبل إصدار أي نص عادي. يتطلب تعيين `STORAGE_ENCRYPTION_KEY`.
يتم الإبلاغ عن حقل يفشل في فك التشفير (مفتاح قديم، نص مشفر تالف) كـ
`<field>DecryptFailed: true` بدلاً من إنهاء التصدير بالكامل أو تسريب الخطأ الأساسي.

### أوامر فرعية أخرى

تفترض هذه وجود خادم AgentProxy قيد التشغيل، ما لم يُذكر خلاف ذلك:

```bash
agentproxy status                       # حالة شاملة لوقت التشغيل
agentproxy logs                         # بث سجلات الطلبات (--json، --search، --follow)
agentproxy config show                  # عرض التكوين الحالي

agentproxy provider list                # قائمة بالمزودين المتاحين (اسم مستعار لقائمة المزودين)
agentproxy provider add                 # تسجيل AgentProxy كمزود على أداة
agentproxy keys add | list | remove     # إدارة مفاتيح API
agentproxy models [provider]            # قائمة النماذج (--json، --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # لقطة للتكوين + قاعدة البيانات
agentproxy restore                      # استعادة من لقطة سابقة

agentproxy health                       # صحة مفصلة (قواطع، ذاكرة مؤقتة، ذاكرة)
agentproxy quota                        # استخدام حصة المزود
agentproxy cache                        # حالة الذاكرة المؤقتة
agentproxy cache clear                  # مسح الذاكرة المؤقتة الدلالية + التوقيع

agentproxy mcp status | restart         # حالة خادم MCP / إعادة التشغيل
agentproxy a2a status | card            # حالة خادم A2A / بطاقة الوكيل

agentproxy tunnel list | create | stop  # إدارة الأنفاق (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # فحص / تعيين متغيرات البيئة (مؤقتة)

agentproxy test                         # اختبار اتصال المزود
agentproxy update                       # التحقق من التحديثات
agentproxy completion                   # توليد إكمال الصدفة
```

### العلامات الشائعة

| Flag                | الوصف                                                            |
| ------------------- | ---------------------------------------------------------------- |
| `--no-open`         | لا تفتح المتصفح تلقائيًا عند البدء                               |
| `--port <n>`        | تجاوز منفذ API (الافتراضي 20128)                                 |
| `--mcp`             | العمل كخادم MCP عبر stdio (لـ IDEs)                              |
| `--non-interactive` | وضع CI (لا توجد مطالبات؛ يقرأ من env/flags)                      |
| `--json`            | مخرجات JSON قابلة للقراءة بواسطة الآلة (doctor، providers، إلخ.) |
| `--help`, `-h`      | عرض مساعدة محددة بالأمر                                          |
| `--version`, `-v`   | طباعة الإصدار المثبت                                             |

---

## نقاط نهاية API المتاحة

| نقطة النهاية               | الوصف                                       | الاستخدام                             |
| -------------------------- | ------------------------------------------- | ------------------------------------- |
| `/v1/chat/completions`     | دردشة قياسية (جميع المزودين)                | جميع الأدوات الحديثة                  |
| `/v1/responses`            | واجهة برمجة التطبيقات للردود (تنسيق OpenAI) | Codex، سير العمل الوكيلة              |
| `/v1/completions`          | إكمالات نصية قديمة                          | الأدوات القديمة التي تستخدم `prompt:` |
| `/v1/embeddings`           | تضمينات نصية                                | RAG، بحث                              |
| `/v1/images/generations`   | توليد الصور                                 | GPT-Image، Flux، إلخ.                 |
| `/v1/audio/speech`         | تحويل النص إلى كلام                         | ElevenLabs، OpenAI TTS                |
| `/v1/audio/transcriptions` | تحويل الكلام إلى نص                         | Deepgram، AssemblyAI                  |

أمثلة جاهزة للنسخ مع عنوان URL موحد:

```txt
مثال على الرمز: sk-a3ab3c080beaee3a-69f4a4-070d71af

الأساس القياسي لـ OpenAI: http://localhost:20128/v1
نماذج VS Code: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
دردشة VS Code: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
ردود VS Code: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
علامات Ollama: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
دردشة Ollama: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## استكشاف الأخطاء وإصلاحها

| الخطأ                                       | السبب                      | الحل                                                 |
| ------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `Connection refused`                        | AgentProxy غير قيد التشغيل  | `agentproxy serve`                                    |
| `401 Unauthorized`                          | مفتاح API خاطئ             | تحقق في `/dashboard/api-manager`                     |
| `No combo configured`                       | لا يوجد مجموعة توجيه نشطة  | إعداد في `/dashboard/combos`                         |
| CLI يظهر "not installed"                    | الثنائي غير موجود في PATH  | تحقق من `which <command>`                            |
| لوحة التحكم تظهر "not detected" بعد التثبيت | ذاكرة التخزين المؤقت قديمة | انقر على "⟳ Refresh detection" في لوحة التحكم        |
| رابط قديم `/dashboard/cli-tools`            | إشارة مرجعية قبل v3.8.6    | إعادة توجيه تلقائي إلى `/dashboard/cli-code` (308)   |
| رابط قديم `/dashboard/agents`               | إشارة مرجعية قبل v3.8.6    | إعادة توجيه تلقائي إلى `/dashboard/acp-agents` (308) |
