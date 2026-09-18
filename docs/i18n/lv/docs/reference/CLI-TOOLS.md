# CLI-TOOLS (Latviešu)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇷 [hr](../../../hr/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI rīki — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-23
---

# CLI rīki — AgentProxy

Pēdējoreiz atjaunināts: 2026-08-23

AgentProxy integrējas ar trim CLI rīku kategorijām, kas izvietotas trīs īpašās informācijas paneļa lapās:

| Lapa           | Maršruts                | Koncepts                                                                                             | Daudzums       |
| -------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| **CLI Code's** | `/dashboard/cli-code`   | Programmēšanas rīki, kurus novirzāt uz AgentProxy (Klients → CLI → AgentProxy → Pakalpojumu sniedzējs) | 26             |
| **CLI Agents** | `/dashboard/cli-agents` | Autonomi aģenti, kurus novirzāt uz AgentProxy (tāda pati plūsma, plašāks tvēriens)                    | 10             |
| **ACP Agents** | `/dashboard/acp-agents` | CLI, kurus AgentProxy izveido kā aizmugursistēmu, izmantojot stdio/ACP (apgriezta plūsma)             | skat. reģistru |

Vecie maršruti veic pāradresēšanu ar 308: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## Kā tas darbojas

```
CLI Code's / CLI Agents (patēriņa plūsma):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (visi norāda uz AgentProxy)
    http://JŪSU_SERVERIS:20128/v1
           │
           ▼  (AgentProxy maršrutē uz atbilstošo pakalpojumu sniedzēju)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP Agents (apgrieztā izveidošanas plūsma):
    Klienta pieprasījums → AgentProxy → izveido CLI caur stdio/ACP → atbilde
```

**Ieguvumi:**

- Viena API atslēga visu rīku pārvaldībai
- Izdevumu izsekošana visos CLI informācijas panelī
- Modeļu maiņa bez katra rīka atkārtotas konfigurēšanas
- Strādā lokāli un attālos serveros (VPS, Docker, Akamai, Cloudflare Tunnel)

---

## Automātiskā konfigurēšana ar `setup-*`

Jums nav jāraksta katra rīka konfigurācija ar roku. AgentProxy piegādā `setup-*`
komandu katrai atbalstītai CLI, kas nolasa **dzīvo** modeļu katalogu no darbojošās
AgentProxy (vietējās vai attālās) un raksta rīka paša konfigurāciju jūsu datorā:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
agentproxy setup-5dive
```

Katra pieņem `--remote <url> --api-key <key>` (konfigurēt vietēju rīku pret
attālu AgentProxy), `--dry-run` (priekšskatījums bez rakstīšanas) un `--port`. Rīki
bez modeļa automātiskās noteikšanas (Cline, Kilo, Roo, Goose, Aider, Qwen, 5dive) pieņem
`--model <id>` (un `--yes` neinteraktīviem braucieniem). `setup-5dive` ir vienīgais
recepšu risinājums, kas neraksta zem `$HOME`: tas konfigurē 5dive aģenta floti, rakstot
root-owned autentifikācijas profilu flozes saimniekdatorā, tāpēc tas atkārtoti izpilda caur `sudo`
un tam pašam nav attālā režīma. Lai palaiž CLI ar
pareizo injicēto vidi un vispār bez rakstītas konfigurācijas, izmantojiet vispārējo
`agentproxy run <mērķis>` startētāju (claude, codex, aider, goose, opencode, qwen,
gemini — mērķi un aliāši nāk no `bin/cli/cli-manifest.mjs`); vecie
par instrumentiem startētāji `agentproxy launch` (Claude Code) un `agentproxy launch-codex`
(Codex) paliek pieejami. Gemini CLI ir tikai palaižams: tas ir `agentproxy run`
mērķis, bet tam nav `setup-*`/`configure` receptes.

> **Pilna atsauce:** galvenā tabula — ko raksta katra komanda, katra karodziņa,
> vietējais pret attālo, un kuri rīki vēlas `/v1` pēcdēli — atrodas
> **[CLI integrācijas](../guides/CLI-INTEGRATIONS.md)**.

### Šo komandu palaišana konteinerī

`setup-*` komanda, kas izpildīta AgentProxy konteinerī, raksta konteinera
paša mājas direktorijā, kuru neviens saimniekdatora CLI nelasa un kas pazūd līdz ar
konteineri. AgentProxy to atklāj un iziet ar kodu `2` ar instrukcijām, nevis
rakstot. Divas atbalstītas iespējas — instalēt CLI saimniekdatorā un
`agentproxy connect` uz konteineri, vai bin-montēt konfigurācijas direktorijus un iestatīt
`CLI_CONFIG_HOME` (compose `host` profils). Katra `setup-*` komanda, plus
`agentproxy configure` un `agentproxy config set`, pieņem
`--allow-container-write`, kad faktiski bija domāts konfigurēt konteinera paša CLI; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` nodrošina to pašu serverim. Skat.
[Docker rokasgrāmata → Host CLI rīku konfigurēšana](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

Informācijas paneļa **pielietojuma galapunkts** (`POST /api/cli-tools/apply`) ievieš
tādu pašu sargu: konteinerī, rakstīšana, kuras mērķis nav bin-montēts no
saimniekdatora, atbild ar **`422`** ar `containerEphemeralTarget: true`, drošo
kļūdas tekstun — rīkiem ar saimniekdatora recepti (claude, codex, opencode, cline,
kilo, continue) — ar `hostSetupCommand` (piem., `agentproxy setup-opencode`), ko palaist
saimniekdatorā tā vietā; nekas netiek rakstīts. `dryRun: true` turpina strādāt konteinera
režīmā un atgriež ģenerēto saturu + mērķa ceļu, nesaskaroties ar disku, tāpēc
jūs varat priekšskatīt no informācijas paneļa un pielietot saimniekdatorā. Šāda uzvedība ir
apsvērta un regresijas aizsargāta ar
`tests/unit/api/cli-tools/apply-container-guard.test.ts` — nekad "neizlabojiet" 422
noņemot sargu.

---

## Avota patiesība

Vienotais katalogs atrodas `src/shared/constants/cliTools.ts` kā `CLI_TOOLS: Record<string, CliCatalogEntry>`.

Katrai ierakstam ir šie lauki (definēti `src/shared/schemas/cliCatalog.ts`):

| Lauks                                           | Tips                                                         | Apraksts                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `category`                                      | `"code" \| "agent"`                                          | Kurā lapā rīks parādās                                           |
| `vendor`                                        | `string`                                                     | Rīka izcelsme ("Anthropic", "OSS (P. Gauthier)")                 |
| `acpSpawnable`                                  | `boolean`                                                    | Arī izmantojams kā ACP aģents (tiek parādīta emblēma)            |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | pielāgoto galapunktu atbalsta līmenis. `"none"` = MITM rezervēts |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Konfigurēšanas mehānisms                                         |
| `id`, `name`, `color`, `description`, `docsUrl` | standarta                                                    | Galvenie displeja lauki                                          |

Ieraksti ar `baseUrlSupport: "none"` **netiek rādīti** informācijas paneļa lapās — tie tiek reģistrēti MITM rezervētos plānā 11 (sk. `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Spēju līmeņi (katalogizēts × nosakāms × konfigurējams × palaižams)

Ne visi katalogizētie rīki ir nosakāmi, konfigurējami vai palaižami. Katram līmenim ir viens
deklarēšanas avots, un novirzes tests tos uztur saskaņotus:

| Līmenis           | Nozīme                                                                                     | Deklarēts                                                              |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Katalogizēts**  | Parādās informācijas paneļa katalogā (nosaukums, ražotājs, dokumenti, konfigurācijas tips) | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                       |
| **Nosakāms**      | Binārā faila/konfigurācijas noteikšana, veselības pārbaudes, konfigurācijas ceļi           | `src/shared/services/cliRuntime.ts` (`CLI_TOOLS` izpildlaika katalogs) |
| **Konfigurējams** | Atbalstīts ar `agentproxy configure <cli>` (iestatīšanas recepte pastāv)                    | `bin/cli/cli-manifest.mjs` (`configure: true`)                         |
| **Palaižams**     | Atbalstīts ar `agentproxy run <target>` (iekļauti env/args injekcijas definīcijas)          | `bin/cli/cli-manifest.mjs` (`run: true`)                               |

`bin/cli/cli-manifest.mjs` ir kanoniskais izpildāmā faila manifests CLI komandu
virsmām: `run`, `configure` un čaulas pabeigšanas ģeneratori visi iegūst savus
mērķu sarakstus, aliāsu risinājumus (piemēram, `kilocode`/`kilo-code`/`kilo_cli` → `kilo`)
un `--model` karoga savienojumu no tā. Novirzes sargājs
`tests/unit/cli/cli-manifest-drift.test.ts` apgalvo, ka manifests, izpildlaika
katalogs, saskarnes katalogs un katrs patērētāja virsma paliek sinhronizēti — mērķis, kas pievienots
vienai virsmai bez pārējām, neveiksmīgi iziet testu komplektu, nevis klusēm novirzās.

---

## 1. CLI koda katalogs (26 rīki)

Visi rīki, kas atrodas direktorijā `/dashboard/cli-code`. Tie, kuriem ir `baseUrlSupport: none`, tiek savienoti, izmantojot MITM vai manuālu rokasgrāmatu, nevis pielāgotu bāzes URL:

| id           | nosaukums               | piegādātājs         | baseUrlSupport | configType     | acpSpawnable |
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

Rīkiem ar `baseUrlSupport: "partial"` informācijas kartītē tiek parādīta virsraksts "⚠ Base URL parcial".

## 2. CLI aģentu katalogs (10 rīki)

Autonomie aģenti, kas atrodas `/dashboard/cli-agents`:

| id           | nosaukums        | ražotājs                 | baseUrlSupport | acpSpawnable |
| ------------ | ---------------- | ------------------------ | -------------- | ------------ |
| hermes-agent | Hermes Agent     | Nous Research            | pilns          | false        |
| openclaw     | OpenClaw         | OSS (P. Steinberger)     | pilns          | true         |
| goose        | Goose            | Block / Linux Foundation | pilns          | true         |
| interpreter  | Open Interpreter | OSS                      | pilns          | true         |
| warp         | Warp AI          | Warp Inc.                | daļējs         | true         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)      | pilns          | false        |
| omp          | Oh My Pi         | OSS                      | pilns          | true         |
| letta        | Letta CLI        | Letta                    | pilns          | false        |
| prime-agent  | Prime Agent      | Prime Intellect (OSS)    | pilns          | false        |
| 5dive        | 5dive            | OSS (5dive-ai)           | pilns          | false        |

---

## 3. ACP aģenti (/dashboard/acp-agents)

Šī lapa (pārdēvēta no `/dashboard/agents`) parāda CLI, kurus AgentProxy var **izsaukt** kā aizmugures izpildes dzinējus, izmantojot stdio/ACP protokolu. Katalogs tiek uzturēts atsevišķi `src/lib/acp/registry.ts` un **nav** tas pats, kas `CLI_TOOLS`.

---

## 4. MITM paveicamais saraksts (netiek rādīts informācijas panelī)

Šie CLI neatbalsta pielāgotu bāzes URL natively un **nav iekļauti** CLI Code vai CLI Agents lapās. Tie ir kandidāti MITM interceptēšanai plānā 11:

| CLI                 | Iemesls                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| windsurf            | BYOK ierobežots ar atlasītiem Claude modeļiem + korporatīvs URL/tokens |
| amp                 | Slēgta ekosistēma (Sourcegraph)                                        |
| amazon-q / kiro-cli | AWS SSO autentifikācija, nav pielāgojama URL                           |
| cowork              | Anthropic Desktop, nav konfigurējams gala punkts                       |

Sk. `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` pilnīgai atsaucei.

---

## 5. Partiju noteikšanas API

Visu rīku noteikšana tiek apkopota caur vienu gala punktu:

**`GET /api/cli-tools/all-statuses`**

- Autentifikācija: `requireCliToolsAuth(request)` (tāpat kā citiem `/api/cli-tools/` maršrutiem)
- Atgriež: `Record<toolId, ToolBatchStatus>` (tips: `src/shared/types/cliBatchStatus.ts`)
- Stratēģija: `Promise.all` pār visiem rīkiem, 5s taimauts katram rīkam
- Kešatmiņa: atmiņā esoša LRU, indeksēta pēc konfigurācijas faila `mtime`. Kešatmiņa tiek atspēkota, kad mainās mtime. Atiestatāta servera restartēšanas laikā.

Atbildes forma katram rīkam:

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
  error?: string; // sanitized, no stack traces
}
```

## 6. Iestatījumu apstrādātāji jauniem rīkiem

Jauniem rīkiem ar `configType: "custom"` ir paredzētas specifiskas iestatījumu API maršruti:

| Maršruts                                    | Rīks                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                                       |
| `POST /api/cli-tools/jcode-settings`        | jcode (--base-url karogs)                                                     |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, mantojuma)                                     |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, primārā + mantojuma `~/.deepseek` sinhronizācija) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                                         |
| `POST /api/cli-tools/pi-settings`           | Pi kodēšanas aģents                                                           |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)                         |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + specifiskā `.env` atslēga)               |

Visi maršruti izmanto `sanitizeErrorMessage()` kļūdu atbildēm (Stingrā Noteikuma #12).

---

## 7. Informācijas paneļa lapu arhitektūra

### CLI Code's (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — servera komponents
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — klienta režģis
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — rīka detaļu lapa
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 specializētas rīku kartes + `ToolDetailClient.tsx`

### CLI Aģenti (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — servera komponents
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — klienta režģis
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — atkārto `ToolDetailClient`

### ACP Aģenti (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — servera komponents (pārvietots no `agents/`)

### Kopīgie UI Komponenti (`src/shared/components/cli/`)

| Fails                   | Mērķis                                                        |
| ----------------------- | ------------------------------------------------------------- |
| `CliToolCard.tsx`       | Viedā statusa karte (noteikšana + konfigurācija + galapunkts) |
| `CliConceptCard.tsx`    | Lapas koncepta izskaidrošanas karte                           |
| `CliComparisonCard.tsx` | Trīs kolonnu salīdzinājums starp CLI tipiem                   |
| `BaseUrlSelect.tsx`     | Galapunkta nolaižamais saraksts (Lokāls/Mākoņs/Pielāgots)     |
| `ApiKeySelect.tsx`      | API atslēgas izvēlētājs                                       |
| `ManualConfigModal.tsx` | Kopējama konfigurācijas fragmenta modālais logs               |

### Kopīgais Āķis (`src/shared/hooks/cli/`)

| Fails                     | Mērķis                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | Iegūst `/api/cli-tools/all-statuses`, pārvalda ielādes/atjaunošanas stāvokli |

## 8. i18n

Jauni vārdtelpas pievienotas plānā 14 F9:

| Vārdtelpa   | Mērķis                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------- |
| `cliCommon` | Kopīgiem virsrakstiem (karšu nosaukumi, konceptu/salīdzinājumu teksti, detaļu lapu nosaukumi) |
| `cliCode`   | CLI Code lapas virsraksti                                                                     |
| `cliAgents` | CLI Agents lapas virsraksti                                                                   |
| `acpAgents` | ACP Agents lapas virsraksti                                                                   |

Pilnas PT-BR un EN tulkojumi ir nodrošināti. 39 citas valodas automātiski pāriet uz EN, izmantojot vārdtelpu līmeņa apvienošanu failā `src/i18n/request.ts`.

---

## 9. Ātrā sākšana

### 1. solis — Iegūstiet AgentProxy API atslēgu

1. Atveriet `/dashboard/api-manager` → **Izveidot API atslēgu**
2. Piešķirt tai nosaukumu (piem., `cli-tools`) un atlasiet visas atļaujas
3. Nokopējiet atslēgu — tā būs nepieciešama katram zemāk esošajam CLI

> Jūsu atslēga izskatās šādi: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### 2. solis — Instalējiet CLI rīkus

Visi npm bāzētie rīki prasa Node.js 22.22.2+ vai 24.x:

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

# Google Gemini CLI (palaižams ar `agentproxy run gemini` → /v1beta virsma)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Uz Rust balstīts

# Pi coding agent
# skat. https://github.com/zechnerj/pi-coding-agent instalācijai

# jcode
# skat. https://github.com/1jehuang/jcode instalācijai
```

---

### 3. solis — Konfigurējiet caur vadības paneli

1. Dodieties uz `http://localhost:20128/dashboard/cli-code`
2. Atrodiet savu rīku režģī
3. Noklikšķiniet uz kartes, lai atvērtu rīka detaļu lapu
4. Atlasiet savu API atslēgu un bāzes URL
5. Noklikšķiniet uz **Lietot konfigurāciju** vai nokopējiet manuālo konfigurācijas fragmentu

---

### 4. solis — Iestatiet globālos vides mainīgos

```bash
# AgentProxy universālais gala punkts
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI nolasa GOOGLE_GEMINI_BASE_URL saknes līmenī (tā SDK pats pievieno /v1beta/...)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> **Attālinātam serverim** aizstājiet `localhost:20128` ar servera IP adresi vai domēnvārdu,
> piem., `http://<your-server-ip>:20128`.

---

### 4. solis — Konfigurējiet katru rīku

#### Claude Code

```bash
# Izveidojiet ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Izmantojiet vienoto Anthropic vārtu sakni Claude Code. Šeit nepievienojiet `/v1`.

**Testēt:** `claude "say hello"`

---

#### OpenAI Codex

Mūsdienu Codex (v0.137+) nolasa tikai `~/.codex/config.toml` — vecais
`config.yaml` pieder vecajam npm CLI un klusām tiek ignorēts. API
atslēga paliek vides mainīgajā `AGENTPROXY_API_KEY` (`env_key`), nekad
failā:

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

Pilna atsauce (profili, `wire_api`, konteksta logi): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

**Testēt:** `codex "what is 2+2?"`

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

**Testēt:** `opencode`

> Izmantojiet `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`,
> lai nosūtītu domāšanas variantus.

---

#### Cline (CLI vai VS Code)

**CLI režīms:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code režīms:**
Cline paplašinājuma iestatījumi → API sniedzējs: `OpenAI Compatible` → Bāzes URL: `http://localhost:20128/v1`

Vai izmantojiet AgentProxy vadības paneli → **CLI rīki → Cline → Lietot konfigurāciju**.

---

#### KiloCode (CLI vai VS Code)

**CLI režīms:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**VS Code iestatījumi:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Vai izmantojiet AgentProxy vadības paneli → **CLI rīki → KiloCode → Lietot konfigurāciju**.

---

#### Continue (VS Code paplašinājums)

Rediģējiet `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Pēc rediģēšanas restartējiet VS Code.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Izmantojiet šo, kad VS Code Insiders ir konfigurēts pielāgoto gala punktu modeļiem un vēlaties, lai AgentProxy darbotos bez pielāgota galvenes lauka.

**Ieteicamā atrašanās vieta:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Piemērs, izmantojot tokenizēto AgentProxy aizstājvārdu:**

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

**Piezīmes:**

- Aizstājiet `sk-your-agentproxy-key` ar AgentProxy izveidotu API atslēgu.
- Laukam `url` jānorāda `/api/v1/vscode/{token}/chat/completions`.
- Laukam `modelsUrl` jānorāda `/api/v1/vscode/{token}/models`.
- Dodiet priekšroku parastajai `/v1` + Bearer galvenes plūsmai, kad klients atbalsta pielāgotas galvenes.
- URL iegultie tokeni ir saderības rezerves variants un var parādīties redaktora žurnālos vai starpniekservera vēsturē.

---

#### Kiro CLI (Amazon)

```bash
# Piesakieties savā AWS/Kiro kontā:
kiro-cli login

# CLI izmanto savu autentifikāciju — AgentProxy nav nepieciešams kā backend pašam Kiro CLI.
# Izmantojiet kiro-cli kopā ar AgentProxy citiem rīkiem.
kiro-cli status
```

**Kiro IDE** darbvirsmas lietotnei izmantojiet MITM gala punktu, ko nodrošina AgentProxy
vadības sadaļā `/dashboard/cli-tools → Kiro`.

## 10. Iekšējais AgentProxy CLI

Binance `agentproxy` binārais faila nodrošina komandas servera dzīves ciklam, iestatīšanai, diagnostikai un pakalpojumu sniedzēju pārvaldībai. Ieejas punkts: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Start server (default port 20128)
agentproxy setup                        # Interactive setup wizard
agentproxy doctor                       # Check config, DB, ports, runtime
agentproxy providers list               # Configured provider connections
agentproxy providers test-all           # Test every active connection
agentproxy reset-password               # Reset the admin password
agentproxy logs                         # Stream request logs
agentproxy health                       # Detailed health (breakers, cache, memory)
agentproxy --version                    # Print version
agentproxy --help                       # Show all commands
```

### Iestatīšana un inicializācija

```bash
agentproxy setup                        # Interactive setup wizard
agentproxy setup --non-interactive      # CI/automation mode (reads env vars + flags)
agentproxy setup --password '<value>'   # Set admin password directly
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # Add and test a provider in one shot
```

Neinteraktīvai iestatīšanai atpazīstamās vides mainīgās:

| Mainīgais           | Mērķis                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | Pakalpojuma sniedzēja API atslēga (saistīta ar `--api-key` caur Commander `.env()`) |
| `DATA_DIR`          | Pārrakstīt AgentProxy datu direktoriju                                               |

Visas citas neinteraktīvās ievades tiek padotas kā karogi, nevis vides mainīgās:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(sk. `agentproxy setup` opcijas iepriekš).

### Diagnostika

```bash
agentproxy doctor                       # Check config, DB, ports, runtime, memory, liveness
agentproxy doctor --json                # Machine-readable JSON
agentproxy doctor --no-liveness         # Skip the HTTP health probe
agentproxy doctor --host 0.0.0.0        # Override liveness host
agentproxy doctor --liveness-url <url>  # Full health endpoint URL override
```

`doctor` veic šādas pārbaudes: `Config`, `Database`, `Storage/encryption`,
`Port availability`, `Node runtime`, `Native binary` (better-sqlite3),
`Memory` un `Server liveness`. Tas iziet ar nenulles kodu, ja jebkura pārbaude ir `fail`.

### Pakalpojumu sniedzēju pārvaldība

```bash
agentproxy providers available                       # AgentProxy provider catalog
agentproxy providers available --search openai       # Filter catalog by id/name/alias/category
agentproxy providers available --category api-key    # Filter by category (api-key, oauth, free, ...)
agentproxy providers available --json                # Machine-readable JSON

agentproxy providers list                            # Configured provider connections
agentproxy providers list --json

agentproxy providers test <id|name>                  # Test one configured connection
agentproxy providers test-all                        # Test every active connection
agentproxy providers validate                        # Local-only structural validation
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # Existing OAuth flow
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` ir API-primāri un tāpēc darbojas pret
aktīvo lokālo vai attālo kontekstu. Pieteikšanās datu ievadei jāizmanto
`--credential-stdin` vai `--credential-env`; `--dry-run --json` ziņo tikai par
rediģētu esamību/formu. `providers available` nolasa AgentProxy katalogu;
`providers list/test/test-all/validate` saglabā savu lokālo SQLite uzvedību un
neprasa servera darbību.

### Atgūšana un atiestatīšana

```bash
agentproxy reset-password                # Reset the admin password (also: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Show warning + dry-run for encrypted credential reset
agentproxy reset-encrypted-columns --force  # Actually null out encrypted credentials in SQLite
```

### Pieteikšanās datu eksportēšana (⚠ apieties piesardzīgi)

```bash
agentproxy auth export                                 # Show warning + confirmation gate — no DB access
agentproxy auth export --force                          # Export ALL connections' DECRYPTED credentials to stdout as JSON
agentproxy auth export --force --id <id>                 # Export only the matching connection
agentproxy auth export --force --format env               # Emit AGENTPROXY_<PROVIDER>_<FIELD>=<value> lines
agentproxy auth export --force --out creds.json           # Write to a file (created with 0600 permissions)
```

`auth export` ir **tikai lokāls** (tieša SQLite nolasīšana, nevis HTTP maršruts) un apzināti drukā/raksta
**plain text** `apiKey`/`accessToken`/`refreshToken`/`idToken` vērtības — tas ir funkcionalitāte, nevis
kļūda. Nekas netiek nolasīts no datubāzes, un nekas netiek atšifrēts bez `--force`. Stderr
brīdinājums vienmēr tiek izdrukāts pirms jebkura plain text izvadīšanas. Nepieciešams, lai būtu iestatīts `STORAGE_ENCRYPTION_KEY`.
Lauks, kuram neizdodas atšifrēt (novecojusi atslēga, bojāts šifrots), tiek ziņots kā
`<field>DecryptFailed: true` tā vietā, lai pārtrauktu visu eksportu vai izplatītu pamata kļūdu.

### Citas apakškomandas

Pieņem, ka darbojas AgentProxy serveris, ja vien nav norādīts citādi:

```bash
agentproxy status                       # Comprehensive runtime status
agentproxy logs                         # Stream request logs (--json, --search, --follow)
agentproxy config show                  # Display current configuration

agentproxy provider list                # List available providers (alias of providers list)
agentproxy provider add                 # Register AgentProxy as a provider on a tool
agentproxy keys add | list | remove     # Manage API keys
agentproxy models [provider]            # List models (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Snapshot config + DB
agentproxy restore                      # Restore from a previous snapshot

agentproxy health                       # Detailed health (breakers, cache, memory)
agentproxy quota                        # Provider quota usage
agentproxy cache                        # Cache status
agentproxy cache clear                  # Clear semantic + signature caches

agentproxy mcp status | restart         # MCP server status / restart
agentproxy a2a status | card            # A2A server status / agent card

agentproxy tunnel list | create | stop  # Manage tunnels (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Inspect / set env vars (temporary)

agentproxy test                         # Provider connectivity smoke test
agentproxy update                       # Check for updates
agentproxy completion                   # Generate shell completion
```

### Bieži izmantotie karogi

| Karogs              | Apraksts                                             |
| ------------------- | ---------------------------------------------------- |
| `--no-open`         | Nesākt automātiski pārlūkprogrammu startēšanas laikā |
| `--port <n>`        | Pārrakstīt API portu (noklusējums 20128)             |
| `--mcp`             | Palaist kā MCP serveri caur stdio (IDE lietošanai)   |
| `--non-interactive` | CI režīms (nav uzvedņu; nolasās no vidiem/karogiem)  |
| `--json`            | Datorlasāms JSON izvads (doctor, providers, utt.)    |
| `--help`, `-h`      | Rāda komandai specifisku palīdzību                   |
| `--version`, `-v`   | Drukā instalēto versiju                              |

---

## Pieejamie API galapunkti

| Galapunkts                 | Apraksts                             | Izmanto                   |
| -------------------------- | ------------------------------------ | ------------------------- |
| `/v1/chat/completions`     | Standarta tērzēšana (visi sniedzēji) | Visi modernie rīki        |
| `/v1/responses`            | Atbildes API (OpenAI formāts)        | Codex, aģentu darbplūsmas |
| `/v1/completions`          | Novecojuši teksta pabeigšana         | Vecāki rīki ar `prompt:`  |
| `/v1/embeddings`           | Teksta iegultnes                     | RAG, meklēšana            |
| `/v1/images/generations`   | Attēlu ģenerēšana                    | GPT-Image, Flux u.c.      |
| `/v1/audio/speech`         | Teksts-skaņa                         | ElevenLabs, OpenAI TTS    |
| `/v1/audio/transcriptions` | Skaņa-teksts                         | Deepgram, AssemblyAI      |

Gatavi ielīmēt piemēri ar tokenizētu AgentProxy URL:

```txt
Token piemērs: sk-a3ab3c080beaee3a-69f4a4-070d71af

Standarta OpenAI bāze: http://localhost:20128/v1
VS Code modeļi: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code tērzēšana: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code atbildes: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama tagi: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama tērzēšana: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Problēmu novēršana

| Kļūda                                          | Cēlonis                                | Labojums                                               |
| ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `Connection refused`                           | AgentProxy nav palaists                 | `agentproxy serve`                                      |
| `401 Unauthorized`                             | Nepareizs API atslēga                  | Pārbaudīt `/dashboard/api-manager`                     |
| `No combo configured`                          | Nav aktīvas maršrutēšanas kombinācijas | Iestatīt `/dashboard/combos`                           |
| CLI rāda "not installed"                       | Binārfails nav PATH                    | Pārbaudīt `which <command>`                            |
| Dashboard pēc instalēšanas rāda "not detected" | Novecojušais kešatmiņa                 | Noklikšķināt "⟳ Refresh detection" dashboard           |
| Veca saite `/dashboard/cli-tools`              | Līdz v3.8.š grāmatzīme                 | Automātiski novirzīts uz `/dashboard/cli-code` (308)   |
| Veca saite `/dashboard/agents`                 | Līdz v3.8.š grāmatzīme                 | Automātiski novirzīts uz `/dashboard/acp-agents` (308) |
