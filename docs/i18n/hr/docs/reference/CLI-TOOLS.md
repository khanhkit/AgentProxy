# CLI-TOOLS (Hrvatski)

🌐 **Languages:** 🇺🇸 [English](../../../../reference/CLI-TOOLS.md) · 🇸🇦 [ar](../../../ar/docs/reference/CLI-TOOLS.md) · 🇦🇿 [az](../../../az/docs/reference/CLI-TOOLS.md) · 🇧🇬 [bg](../../../bg/docs/reference/CLI-TOOLS.md) · 🇧🇩 [bn](../../../bn/docs/reference/CLI-TOOLS.md) · 🇨🇿 [cs](../../../cs/docs/reference/CLI-TOOLS.md) · 🇩🇰 [da](../../../da/docs/reference/CLI-TOOLS.md) · 🇩🇪 [de](../../../de/docs/reference/CLI-TOOLS.md) · 🇬🇷 [el](../../../el/docs/reference/CLI-TOOLS.md) · 🇪🇸 [es](../../../es/docs/reference/CLI-TOOLS.md) · 🇪🇪 [et](../../../et/docs/reference/CLI-TOOLS.md) · 🇮🇷 [fa](../../../fa/docs/reference/CLI-TOOLS.md) · 🇫🇮 [fi](../../../fi/docs/reference/CLI-TOOLS.md) · 🇫🇷 [fr](../../../fr/docs/reference/CLI-TOOLS.md) · 🇮🇪 [ga](../../../ga/docs/reference/CLI-TOOLS.md) · 🇮🇳 [gu](../../../gu/docs/reference/CLI-TOOLS.md) · 🇮🇱 [he](../../../he/docs/reference/CLI-TOOLS.md) · 🇮🇳 [hi](../../../hi/docs/reference/CLI-TOOLS.md) · 🇭🇺 [hu](../../../hu/docs/reference/CLI-TOOLS.md) · 🇮🇩 [id](../../../id/docs/reference/CLI-TOOLS.md) · 🇮🇹 [it](../../../it/docs/reference/CLI-TOOLS.md) · 🇯🇵 [ja](../../../ja/docs/reference/CLI-TOOLS.md) · 🇰🇷 [ko](../../../ko/docs/reference/CLI-TOOLS.md) · 🇱🇹 [lt](../../../lt/docs/reference/CLI-TOOLS.md) · 🇱🇻 [lv](../../../lv/docs/reference/CLI-TOOLS.md) · 🇮🇳 [mr](../../../mr/docs/reference/CLI-TOOLS.md) · 🇲🇾 [ms](../../../ms/docs/reference/CLI-TOOLS.md) · 🇲🇹 [mt](../../../mt/docs/reference/CLI-TOOLS.md) · 🇳🇱 [nl](../../../nl/docs/reference/CLI-TOOLS.md) · 🇳🇴 [no](../../../no/docs/reference/CLI-TOOLS.md) · 🇵🇭 [phi](../../../phi/docs/reference/CLI-TOOLS.md) · 🇵🇱 [pl](../../../pl/docs/reference/CLI-TOOLS.md) · 🇵🇹 [pt](../../../pt/docs/reference/CLI-TOOLS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/reference/CLI-TOOLS.md) · 🇷🇴 [ro](../../../ro/docs/reference/CLI-TOOLS.md) · 🇷🇺 [ru](../../../ru/docs/reference/CLI-TOOLS.md) · 🇸🇰 [sk](../../../sk/docs/reference/CLI-TOOLS.md) · 🇸🇮 [sl](../../../sl/docs/reference/CLI-TOOLS.md) · 🇷🇸 [sr](../../../sr/docs/reference/CLI-TOOLS.md) · 🇸🇪 [sv](../../../sv/docs/reference/CLI-TOOLS.md) · 🇰🇪 [sw](../../../sw/docs/reference/CLI-TOOLS.md) · 🇮🇳 [ta](../../../ta/docs/reference/CLI-TOOLS.md) · 🇮🇳 [te](../../../te/docs/reference/CLI-TOOLS.md) · 🇹🇭 [th](../../../th/docs/reference/CLI-TOOLS.md) · 🇹🇷 [tr](../../../tr/docs/reference/CLI-TOOLS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/reference/CLI-TOOLS.md) · 🇵🇰 [ur](../../../ur/docs/reference/CLI-TOOLS.md) · 🇻🇳 [vi](../../../vi/docs/reference/CLI-TOOLS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/reference/CLI-TOOLS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/reference/CLI-TOOLS.md)

---

---

title: "CLI Alati — AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-23
---

# CLI Alati — AgentProxy

Posljednje ažuriranje: 2026-08-23

AgentProxy se integrira s tri kategorije CLI alata raspoređenih na tri namjenske stranice nadzorne ploče:

| Stranica       | Ruta                    | Koncept                                                                                  | Broj          |
| -------------- | ----------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| **CLI Code's** | `/dashboard/cli-code`   | Alati za kodiranje koje usmjeravate na AgentProxy (Klijent → CLI → AgentProxy → Pružatelj) | 26            |
| **CLI Agents** | `/dashboard/cli-agents` | Autonomni agenti koje usmjeravate na AgentProxy (isti tok, širi opseg)                    | 10            |
| **ACP Agents** | `/dashboard/acp-agents` | CLI-jevi koje AgentProxy pokreće kao pozadinsku uslugu putem stdio/ACP (obrnuti tok)      | vidi registar |

Zastarjele rute preusmjeravaju putem 308: `/dashboard/cli-tools` → `/dashboard/cli-code`, `/dashboard/agents` → `/dashboard/acp-agents`.

---

## Kako funkcionira

```
CLI Code's / CLI Agents (tok potrošnje):
Claude / Codex / OpenCode / Cline / KiloCode / Continue / Hermes Agent / Goose / ...
           │
           ▼  (svi usmjeravaju na AgentProxy)
    http://YOUR_SERVER:20128/v1
           │
           ▼  (AgentProxy preusmjerava na odgovarajućeg pružatelja)
    Anthropic / OpenAI / Gemini / DeepSeek / Groq / Mistral / ...

ACP Agents (tok obrnutog pokretanja):
    Zahtjev klijenta → AgentProxy → pokreće CLI putem stdio/ACP → odgovor
```

**Prednosti:**

- Jedan API ključ za upravljanje svim alatima
- Praćenje troškova svih CLI-jeva unutar nadzorne ploče
- Promjena modela bez ponovnog konfiguriranja svakog alata
- Radi lokalno i na udaljenim poslužiteljima (VPS, Docker, Akamai, Cloudflare Tunnel)

---

## Automatska konfiguracija s `setup-*`

Ne morate ručno pisati konfiguraciju za svaki alat. AgentProxy dolazi s naredbom `setup-*`
za svaki podržani CLI koja čita **živu** listu modela iz pokrenutog
AgentProxy-a (lokalnog ili udaljenog) i zapisuje vlastitu konfiguraciju alata na vaše računalo:

```bash
agentproxy setup-codex        agentproxy setup-claude       agentproxy setup-opencode
agentproxy setup-cline        agentproxy setup-kilo         agentproxy setup-continue
agentproxy setup-cursor       agentproxy setup-roo          agentproxy setup-crush
agentproxy setup-goose        agentproxy setup-qwen         agentproxy setup-aider
agentproxy setup-5dive
```

Svaka prihvaća `--remote <url> --api-key <key>` (konfigurira lokalni alat nasuprot udaljenom
AgentProxy-u), `--dry-run` (pregled bez zapisivanja) i `--port`. Alati
bez automatskog otkrivanja modela (Cline, Kilo, Roo, Goose, Aider, Qwen, 5dive) prihvaćaju
`--model <id>` (i `--yes` za neinteraktivne pokretaje). `setup-5dive` je jedini
recept koji ne zapisuje pod `$HOME`: konfigurira fleet 5dive agenata
zapisivanjem auth profila u vlasništvu roota na fleet hostu, pa se ponovno pokreće putem `sudo`
i nema vlastiti udaljeni način rada. Za pokretanje CLI-ja s
ispravno ubačenim env-om i bez ikakvog zapisivanja konfiguracije, koristite generički
pokretač `agentproxy run <target>` (claude, codex, aider, goose, opencode, qwen,
gemini — ciljevi i aliasi dolaze iz `bin/cli/cli-manifest.mjs`); zastarjeli
pokretači za pojedine alate `agentproxy launch` (Claude Code) i `agentproxy launch-codex`
(Codex) ostaju dostupni. Gemini CLI je samo za pokretanje: on je cilj naredbe `agentproxy run`,
ali nema recept `setup-*`/`configure`.

> **Potpuna referenca:** glavna tablica — što svaka naredba zapisuje, sve zastavice,
> lokalno nasuprot udaljenom i koji alati trebaju sufiks `/v1` — nalazi se u
> **[CLI Integracije](../guides/CLI-INTEGRATIONS.md)**.

### Pokretanje unutar kontejnera

Naredba `setup-*` izvršena unutar AgentProxy kontejnera zapisuje u
vlastiti home kontejnera, koji nijedan host CLI ne čita i koji nestaje zajedno s
kontejnerom. AgentProxy to detektira i izlazi s kodom `2` uz upute umjesto
zapisivanja. Dva podržana načina naprijed — instalirajte CLI na hostu i
povežite se s kontejnerom putem `agentproxy connect`, ili montirajte direktorije konfiguracije i postavite
`CLI_CONFIG_HOME` (compose profil `host`). Svaka naredba `setup-*`, kao i
`agentproxy configure` i `agentproxy config set`, prihvaća
`--allow-container-write` kada je konfiguriranje vlastitih CLI-jeva kontejnera ono što stvarno
namjeravate; `AGENTPROXY_ALLOW_CONTAINER_CONFIG_WRITE=true` postiže isto za
poslužitelj. Pogledajte
[Docker Vodič → Konfiguracija host CLI alata](../guides/DOCKER_GUIDE.md#configuring-host-cli-tools-when-agentproxy-runs-in-docker).

**Endpoint za primjenu** nadzorne ploče (`POST /api/cli-tools/apply`) primjenjuje
isti čuvar: u kontejneru, zahtjev za zapisivanje čija ciljna lokacija nije bind-montirana s
hosta vraća **`422`** s `containerEphemeralTarget: true`, sigurnim tekstom greške i — za alate koji imaju host recept (claude, codex, opencode, cline,
kilo, continue) — `hostSetupCommand` (npr. `agentproxy setup-opencode`) za pokretanje
na hostu; ništa se ne zapisuje. `dryRun: true` nastavlja raditi u načinu rada kontejnera
i vraća generirani sadržaj + ciljnu putanju bez dodirivanja diska, tako da
možete pregledati s nadzorne ploče i primijeniti na hostu. Ovo ponašanje je
namjerno i zaštićeno regresijskim testovima u
`tests/unit/api/cli-tools/apply-container-guard.test.ts` — nikada ne "popravljajte" 422
uklanjanjem čuvara.

---

## Izvor istine

Objedinjeni katalog nalazi se u `src/shared/constants/cliTools.ts` kao `CLI_TOOLS: Record<string, CliCatalogEntry>`.

Svaki unos ima sljedeća polja (definirana u `src/shared/schemas/cliCatalog.ts`):

| Polje                                           | Tip                                                          | Opis                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `category`                                      | `"code" \| "agent"`                                          | Na kojoj se stranici alat prikazuje                                   |
| `vendor`                                        | `string`                                                     | Podrijetlo alata ("Anthropic", "OSS (P. Gauthier)")                   |
| `acpSpawnable`                                  | `boolean`                                                    | Može se koristiti i kao ACP Agent (prikazuje se značka)               |
| `baseUrlSupport`                                | `"full" \| "partial" \| "none"`                              | Razina podrške za prilagođenu krajnju točku. `"none"` = MITM zaostaci |
| `configType`                                    | `"env" \| "custom" \| "guide" \| "custom-builder" \| "mitm"` | Mehanizam konfiguracije                                               |
| `id`, `name`, `color`, `description`, `docsUrl` | standardno                                                   | Osnovna polja za prikaz                                               |

Unosi s `baseUrlSupport: "none"` **nisu prikazani** na stranicama nadzorne ploče — registrirani su u MITM zaostacima za plan 11 (pogledajte `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md`).

### Razine mogućnosti (katalogizirano × otkrivljivo × konfigurabilno × pokretljivo)

Nije svaki katalogizirani alat otkrivljiv, konfigurabilam ili pokretljiv. Svaka razina ima jedan
izvor deklaracije, a test za otkrivanje odstupanja održava ih usklađenima:

| Razina             | Značenje                                                                                    | Deklarirano u                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Katalogizirano** | Prikazuje se u katalogu nadzorne ploče (naziv, dobavljač, dokumentacija, tip konfiguracije) | `src/shared/constants/cliTools.ts` (`CLI_TOOLS`)                  |
| **Otkrivljivo**    | Otkrivanje binarne datoteke/konfiguracije, provjere zdravlja, putanje konfiguracije         | `src/shared/services/cliRuntime.ts` (izvodni katalog `CLI_TOOLS`) |
| **Konfigurabilno** | Podržava `agentproxy configure <cli>` (postoji recept za postavljanje)                       | `bin/cli/cli-manifest.mjs` (`configure: true`)                    |
| **Pokretljivo**    | Podržava `agentproxy run <target>` (definirana injekcija env/args)                           | `bin/cli/cli-manifest.mjs` (`run: true`)                          |

`bin/cli/cli-manifest.mjs` je kanonski izvršni manifest za površine CLI naredbi:
`run`, `configure` i generatori dovršavanja ljuske izvode svoje
popise ciljeva, razrješavanje pseudonima (na primjer `kilocode`/`kilo-code`/`kilo_cli` → `kilo`)
i povezivanje zastavice `--model` iz njega. Čuvar odstupanja
`tests/unit/cli/cli-manifest-drift.test.ts` potvrđuje da manifest, izvodni
katalog, UI katalog i sve površine potrošača ostaju sinkronizirani — cilj dodan jednoj
površini bez ostalih ne uspijeva u paketu testova umjesto da tiho odstupa.

---

## 1. Katalog CLI koda (26 alata)

Svi alati koji se pojavljuju u `/dashboard/cli-code`. Oni s `baseUrlSupport: none` spojeni su putem MITM-a ili ručnog vodiča umjesto prilagođenog osnovnog URL-a:

| id           | naziv                   | proizvođač          | baseUrlSupport | configType     | acpSpawnable |
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
| custom       | Prilagođeno CLI sučelje | —                   | full           | custom-builder | false        |

Alati s `baseUrlSupport: "partial"` prikazuju oznaku "⚠ Djelomični osnovni URL" na kartici nadzorne ploče.

## 2. Katalog CLI agenata (10 alata)

Autonomni agenti koji se pojavljuju u `/dashboard/cli-agents`:

| id           | name             | vendor                   | baseUrlSupport | acpSpawnable |
| ------------ | ---------------- | ------------------------ | -------------- | ------------ |
| hermes-agent | Hermes Agent     | Nous Research            | full           | false        |
| openclaw     | OpenClaw         | OSS (P. Steinberger)     | full           | true         |
| goose        | Goose            | Block / Linux Foundation | full           | true         |
| interpreter  | Open Interpreter | OSS                      | full           | true         |
| warp         | Warp AI          | Warp Inc.                | partial        | true         |
| agent-deck   | Agent Deck       | asheshgoplani (OSS)      | full           | false        |
| omp          | Oh My Pi         | OSS                      | full           | true         |
| letta        | Letta CLI        | Letta                    | full           | false        |
| prime-agent  | Prime Agent      | Prime Intellect (OSS)    | full           | false        |
| 5dive        | 5dive            | OSS (5dive-ai)           | full           | false        |

---

## 3. ACP agenti (/dashboard/acp-agents)

Ova stranica (preimenovana iz `/dashboard/agents`) prikazuje CLI-ove koje AgentProxy može **pokrenuti** kao pozadinske izvršne pogone putem stdio/ACP protokola. Katalog se zasebno održava u `src/lib/acp/registry.ts` i **nije** isti kao `CLI_TOOLS`.

---

## 4. MITM zaostatak (nije prikazano na nadzornoj ploči)

Sljedeći CLI-ovi ne podržavaju prilagođeni osnovni URL izvorno i **nisu navedeni** na stranicama CLI koda ili CLI agenata. Kandidati su za MITM presretanje u planu 11:

| CLI                 | Razlog                                                            |
| ------------------- | ----------------------------------------------------------------- |
| windsurf            | BYOK ograničen na odabrane Claude modele + korporativni URL/token |
| amp                 | Zatvoreni ekosustav (Sourcegraph)                                 |
| amazon-q / kiro-cli | AWS SSO autentifikacija, bez prilagođenog URL-a                   |
| cowork              | Anthropic Desktop, bez konfigurabilnog krajnjeg točke             |

Pogledajte `_tasks/features-v3.8.6/refactorpages/_orchestration/_plan11-mitm-backlog.md` za potpunu unakrsnu referencu.

---

## 5. API za skupno otkrivanje

Sve detekcije alata agregiraju se putem jedne krajnje točke:

**`GET /api/cli-tools/all-statuses`**

- Autentifikacija: `requireCliToolsAuth(request)` (isto kao i ostale rute `/api/cli-tools/`)
- Vraća: `Record<toolId, ToolBatchStatus>` (tip: `src/shared/types/cliBatchStatus.ts`)
- Strategija: `Promise.all` nad svim alatima, vremensko ograničenje od 5 s po alatu
- Predmemorija: LRU u memoriji indeksiran prema `mtime` konfiguracijske datoteke. Predmemorija se poništava kada se mtime promijeni. Resetira se pri ponovnom pokretanju poslužitelja.

Oblik odgovora po alatu:

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
  error?: string; // sanirano, bez tragova stoha
}
```

---

## 6. Handleri Postavki za Nove Alate

Novi alati s `configType: "custom"` imaju namjenske API rute za postavke:

| Ruta                                        | Alat                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/cli-tools/forge-settings`        | ForgeCode (.forge.toml)                                                          |
| `POST /api/cli-tools/jcode-settings`        | jcode (zastavica --base-url)                                                     |
| `POST /api/cli-tools/deepseek-tui-settings` | DeepSeek TUI (OPENAI_BASE_URL, naslijeđeno)                                      |
| `POST /api/cli-tools/codewhale-settings`    | CodeWhale (OPENAI_BASE_URL, primarno + naslijeđena `~/.deepseek` sinkronizacija) |
| `POST /api/cli-tools/smelt-settings`        | Smelt                                                                            |
| `POST /api/cli-tools/pi-settings`           | Pi coding agent                                                                  |
| `POST /api/cli-tools/grok-build-settings`   | Grok Build (~/.grok/config.toml, `[model.agentproxy]`)                            |
| `POST /api/cli-tools/qwen-settings`         | Qwen Code (`~/.qwen/settings.json` + namjenski `.env` ključ)                     |

Sve rute koriste `sanitizeErrorMessage()` za odgovore s greškama (Tvrdo Pravilo #12).

---

## 7. Arhitektura Stranica Nadzorne Ploče

### CLI Code (`/dashboard/cli-code`)

- `src/app/(dashboard)/dashboard/cli-code/page.tsx` — serverska komponenta
- `src/app/(dashboard)/dashboard/cli-code/CliCodePageClient.tsx` — klijentska mreža
- `src/app/(dashboard)/dashboard/cli-code/[id]/page.tsx` — stranica detalja alata
- `src/app/(dashboard)/dashboard/cli-code/components/` — 12 specijaliziranih kartica alata + `ToolDetailClient.tsx`

### CLI Agents (`/dashboard/cli-agents`)

- `src/app/(dashboard)/dashboard/cli-agents/page.tsx` — serverska komponenta
- `src/app/(dashboard)/dashboard/cli-agents/CliAgentsPageClient.tsx` — klijentska mreža
- `src/app/(dashboard)/dashboard/cli-agents/[id]/page.tsx` — ponovo koristi `ToolDetailClient`

### ACP Agents (`/dashboard/acp-agents`)

- `src/app/(dashboard)/dashboard/acp-agents/page.tsx` — serverska komponenta (premješteno iz `agents/`)

### Dijeljene UI Komponente (`src/shared/components/cli/`)

| Datoteka                | Svrha                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `CliToolCard.tsx`       | Pametna statusna kartica (detekcija + konfiguracija + krajnja točka) |
| `CliConceptCard.tsx`    | Kartica s objašnjenjem koncepta po stranici                          |
| `CliComparisonCard.tsx` | Usporedba u tri stupca između CLI vrsta                              |
| `BaseUrlSelect.tsx`     | Padajući izbornik krajnje točke (Lokalno/Oblak/Prilagođeno)          |
| `ApiKeySelect.tsx`      | Odabir API ključa                                                    |
| `ManualConfigModal.tsx` | Modalni prozor s isječkom konfiguracije za kopiranje                 |

### Dijeljeni Hook (`src/shared/hooks/cli/`)

| Datoteka                  | Svrha                                                                           |
| ------------------------- | ------------------------------------------------------------------------------- |
| `useToolBatchStatuses.ts` | Dohvaća `/api/cli-tools/all-statuses`, upravlja stanjem učitavanja/osvježavanja |

---

## 8. i18n

Novi prostori imena dodani u planu 14 F9:

| Prostor imena | Svrha                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------- |
| `cliCommon`   | Zajednički nizovi (oznake kartica, tekstovi koncepata/usporedbi, oznake stranice detalja) |
| `cliCode`     | Nizovi stranice CLI Code                                                                  |
| `cliAgents`   | Nizovi stranice CLI Agents                                                                |
| `acpAgents`   | Nizovi stranice ACP Agents                                                                |

Dostupni su potpuni prijevodi na PT-BR i EN. Ostalih 39 jezičnih postavki automatski koristi EN kao zamjenski jezik putem spajanja na razini prostora imena u `src/i18n/request.ts`.

---

## 9. Brzi početak

### Korak 1 — Dohvatite AgentProxy API ključ

1. Otvorite `/dashboard/api-manager` → **Create API Key**
2. Dodijelite mu naziv (npr. `cli-tools`) i odaberite sve dozvole
3. Kopirajte ključ — trebat će vam za svaki CLI alat u nastavku

> Vaš ključ izgleda ovako: `sk-xxxxxxxxxxxxxxxx-xxxxxxxxx`

---

### Korak 2 — Instalirajte CLI alate

Svi alati temeljeni na npm-u zahtijevaju Node.js 22.22.2+ ili 24.x:

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

# Google Gemini CLI (može se pokrenuti putem `agentproxy run gemini` → /v1beta površina)
npm install -g @google/gemini-cli

# Aider
pip install aider-chat

# Smelt
cargo install smelt  # Temeljen na Rustu

# Pi coding agent
# pogledajte https://github.com/zechnerj/pi-coding-agent za instalaciju

# jcode
# pogledajte https://github.com/1jehuang/jcode za instalaciju
```

---

### Korak 3 — Konfigurirajte putem nadzorne ploče

1. Idite na `http://localhost:20128/dashboard/cli-code`
2. Pronađite svoj alat u mreži
3. Kliknite karticu kako biste otvorili stranicu s detaljima alata
4. Odaberite svoj API ključ i osnovni URL
5. Kliknite **Apply Config** ili kopirajte isječak za ručnu konfiguraciju

---

### Korak 4 — Postavite globalne varijable okruženja

```bash
# AgentProxy univerzalna krajnja točka
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-your-agentproxy-key"
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="sk-your-agentproxy-key"
# Gemini CLI čita GOOGLE_GEMINI_BASE_URL na KORIJENSKOJ razini (njegov SDK sam dodaje /v1beta/...)
export GOOGLE_GEMINI_BASE_URL="http://localhost:20128"
export GEMINI_API_KEY="sk-your-agentproxy-key"
```

> Za **udaljeni poslužitelj** zamijenite `localhost:20128` s IP adresom ili domenom poslužitelja,
> npr. `http://<your-server-ip>:20128`.

---

### Korak 4 — Konfigurirajte svaki alat

#### Claude Code

```bash
# Stvorite ~/.claude/settings.json:
mkdir -p ~/.claude && cat > ~/.claude/settings.json << EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-agentproxy-key"
  }
}
EOF
```

Koristite objedinjeni Anthropic pristupnik (root) za Claude Code. Nemojte ovdje dodavati `/v1`.

**Test:** `claude "say hello"`

---

#### OpenAI Codex

Moderni Codex (v0.137+) čita isključivo `~/.codex/config.toml` — stari
`config.yaml` pripada zastarjelom npm CLI-ju i tiho se ignorira. API
ključ ostaje u varijabli okruženja `AGENTPROXY_API_KEY` (`env_key`), nikada
unutar datoteke:

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

Potpuna referenca (profili, `wire_api`, kontekstni prozori): [CODEX-CLI-CONFIGURATION.md](../guides/CODEX-CLI-CONFIGURATION.md).

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

> Koristite `opencode run "your prompt" --model agentproxy/claude-sonnet-4-5-thinking --variant high`
> za slanje varijanti s razmišljanjem.

---

#### Cline (CLI ili VS Code)

**CLI način:**

```bash
mkdir -p ~/.cline/data && cat > ~/.cline/data/globalState.json << EOF
{
  "apiProvider": "openai",
  "openAiBaseUrl": "http://localhost:20128/v1",
  "openAiApiKey": "sk-your-agentproxy-key"
}
EOF
```

**VS Code način:**
Postavke proširenja Cline → API Provider: `OpenAI Compatible` → Base URL: `http://localhost:20128/v1`

Ili koristite AgentProxy nadzornu ploču → **CLI Tools → Cline → Apply Config**.

---

#### KiloCode (CLI ili VS Code)

**CLI način:**

```bash
kilocode --api-base http://localhost:20128/v1 --api-key sk-your-agentproxy-key
```

**VS Code postavke:**

```json
{
  "kilo-code.openAiBaseUrl": "http://localhost:20128/v1",
  "kilo-code.apiKey": "sk-your-agentproxy-key"
}
```

Ili koristite AgentProxy nadzornu ploču → **CLI Tools → KiloCode → Apply Config**.

---

#### Continue (VS Code proširenje)

Uredite `~/.continue/config.yaml`:

```yaml
models:
  - name: AgentProxy
    provider: openai
    model: auto
    apiBase: http://localhost:20128/v1
    apiKey: sk-your-agentproxy-key
    default: true
```

Ponovno pokrenite VS Code nakon uređivanja.

---

#### VS Code Insiders (`chatLanguageModels.json`)

Koristite ovo kada je VS Code Insiders konfiguriran za modele s prilagođenim krajnjim točkama i želite da AgentProxy radi bez prilagođenog polja zaglavlja.

**Preporučena lokacija:**

- Linux: `~/.config/Code - Insiders/User/chatLanguageModels.json`
- Windows: `%APPDATA%/Code - Insiders/User/chatLanguageModels.json`

**Primjer s tokeniziranim AgentProxy aliasom:**

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

**Napomene:**

- Zamijenite `sk-your-agentproxy-key` s API ključem kreiranim u AgentProxy-u.
- Polje `url` treba pokazivati na `/api/v1/vscode/{token}/chat/completions`.
- Polje `modelsUrl` treba pokazivati na `/api/v1/vscode/{token}/models`.
- Koristite uobičajeni tok `/v1` + Bearer zaglavlje kada klijent podržava prilagođena zaglavlja.
- Tokeni ugrađeni u URL su zamjensko rješenje za kompatibilnost i mogu se pojaviti u zapisnicima uređivača ili povijesti proxyja.

---

#### Kiro CLI (Amazon)

```bash
# Prijavite se na svoj AWS/Kiro račun:
kiro-cli login

# CLI koristi vlastitu autentifikaciju — AgentProxy nije potreban kao pozadinski sustav za sam Kiro CLI.
# Koristite kiro-cli zajedno s AgentProxy-om za ostale alate.
kiro-cli status
```

Za **Kiro IDE** desktop aplikaciju, koristite MITM krajnju točku koju AgentProxy
izlaže putem `/dashboard/cli-tools → Kiro`.

---

## 10. Interni AgentProxy CLI

Binarna datoteka `agentproxy` pruža naredbe za životni ciklus poslužitelja, postavljanje, dijagnostiku i upravljanje pružateljima. Ulazna točka: `bin/agentproxy.mjs`.

```bash
agentproxy                              # Pokretanje poslužitelja (zadana vrata 20128)
agentproxy setup                        # Interaktivni čarobnjak za postavljanje
agentproxy doctor                       # Provjera konfiguracije, baze podataka, vrata, okoline
agentproxy providers list               # Konfigurirane veze s pružateljima
agentproxy providers test-all           # Testiranje svake aktivne veze
agentproxy reset-password               # Resetiranje lozinke administratora
agentproxy logs                         # Strujanje zapisa zahtjeva
agentproxy health                       # Detaljno zdravlje (prekidači, predmemorija, memorija)
agentproxy --version                    # Ispis verzije
agentproxy --help                       # Prikaz svih naredbi
```

### Postavljanje i inicijalizacija

```bash
agentproxy setup                        # Interaktivni čarobnjak za postavljanje
agentproxy setup --non-interactive      # Način rada za CI/automatizaciju (čita env varijable i zastavice)
agentproxy setup --password '<value>'   # Izravno postavljanje lozinke administratora
agentproxy setup --add-provider \
  --provider openai \
  --api-key '<value>' \
  --test-provider                      # Dodavanje i testiranje pružatelja u jednom koraku
```

Prepoznate varijable okoline za neinteraktivno postavljanje:

| Varijabla           | Svrha                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `AGENTPROXY_API_KEY` | API ključ pružatelja (vezan uz `--api-key` putem Commander `.env()`) |
| `DATA_DIR`          | Nadjačavanje direktorija podataka AgentProxy                          |

Svi ostali neinteraktivni unosi prosljeđuju se kao zastavice, a ne varijable okoline:
`--password`, `--provider`, `--provider-name`, `--provider-base-url`, `--default-model`
(pogledajte opcije `agentproxy setup` gore).

### Dijagnostika

```bash
agentproxy doctor                       # Provjera konfiguracije, baze podataka, vrata, okoline, memorije, živosti
agentproxy doctor --json                # Strojno čitljivi JSON
agentproxy doctor --no-liveness         # Preskakanje HTTP sonde živosti
agentproxy doctor --host 0.0.0.0        # Nadjačavanje hosta živosti
agentproxy doctor --liveness-url <url>  # Potpuno nadjačavanje URL-a zdravstvene krajnje točke
```

Naredba doctor izvodi sljedeće provjere: `Config`, `Database`, `Storage/encryption`,
`Port availability`, `Node runtime`, `Native binary` (better-sqlite3),
`Memory` i `Server liveness`. Izlazi s nenultim kodom ako ikoja provjera vrati `fail`.

### Upravljanje pružateljima

```bash
agentproxy providers available                       # Katalog pružatelja AgentProxy
agentproxy providers available --search openai       # Filtriranje kataloga prema id/imenu/alijansu/kategoriji
agentproxy providers available --category api-key    # Filtriranje prema kategoriji (api-key, oauth, free, ...)
agentproxy providers available --json                # Strojno čitljivi JSON

agentproxy providers list                            # Konfigurirane veze s pružateljima
agentproxy providers list --json

agentproxy providers test <id|name>                  # Testiranje jedne konfigurirane veze
agentproxy providers test-all                        # Testiranje svake aktivne veze
agentproxy providers validate                        # Lokalna strukturna validacija
agentproxy providers add <provider> --credential-env PROVIDER_KEY
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth <provider>                 # Postojeći OAuth tok
agentproxy providers edit <id|name> --default-model <model>
agentproxy providers remove <id|name> --yes
```

`providers add/import/auth/edit/remove` su API-prvo i stoga rade s aktivnim lokalnim ili udaljenim kontekstom. Unos vjerodajnica treba koristiti
`--credential-stdin` ili `--credential-env`; `--dry-run --json` izvještava samo o
redaktiranoj prisutnosti/obliku. `providers available` čita AgentProxy katalog;
`providers list/test/test-all/validate` zadržavaju svoje lokalno SQLite ponašanje i
ne zahtijevaju da poslužitelj bude pokrenut.

### Oporavak i resetiranje

```bash
agentproxy reset-password                # Resetiranje lozinke administratora (također: agentproxy-reset-password)
agentproxy reset-encrypted-columns       # Prikaz upozorenja + pokus bez izvršavanja za resetiranje šifriranih vjerodajnica
agentproxy reset-encrypted-columns --force  # Stvarno postavljanje šifriranih vjerodajnica na null u SQLite
```

### Izvoz vjerodajnica (⚠ rukujte pažljivo)

```bash
agentproxy auth export                                 # Prikaz upozorenja + potvrda — bez pristupa bazi podataka
agentproxy auth export --force                          # Izvoz DEŠIFRIRANIH vjerodajnica SVIH veza na stdout kao JSON
agentproxy auth export --force --id <id>                 # Izvoz samo odgovarajuće veze
agentproxy auth export --force --format env               # Emitiranje redaka AGENTPROXY_<PROVIDER>_<FIELD>=<value>
agentproxy auth export --force --out creds.json           # Pisanje u datoteku (stvorenu s dozvolama 0600)
```

`auth export` je **samo lokalan** (izravno čitanje SQLite, bez HTTP rute) i namjerno ispisuje/zapisuje
**plaintext** vrijednosti `apiKey`/`accessToken`/`refreshToken`/`idToken` — to je funkcionalnost, a ne
greška. Ništa se ne čita iz baze podataka, i ništa se ne dešifrira, bez `--force`. Natpis s upozorenjem na stderr uvijek se ispisuje prije nego što se emitira bilo koji plaintext. Zahtijeva postavljanje `STORAGE_ENCRYPTION_KEY`.
Polje koje se ne uspije dešifrirati (zastarjeli ključ, oštećeni šifrirani tekst) javlja se kao
`<field>DecryptFailed: true` umjesto prekidanja cijelog izvoza ili odavanja temeljne greške.

### Ostale podnaredbe

Ove pretpostavljaju pokrenuti AgentProxy poslužitelj, osim ako nije drugačije naznačeno:

```bash
agentproxy status                       # Sveobuhvatan status okoline izvođenja
agentproxy logs                         # Strujanje zapisa zahtjeva (--json, --search, --follow)
agentproxy config show                  # Prikaz trenutne konfiguracije

agentproxy provider list                # Popis dostupnih pružatelja (alijans za providers list)
agentproxy provider add                 # Registracija AgentProxy kao pružatelja u alatu
agentproxy keys add | list | remove     # Upravljanje API ključevima
agentproxy models [provider]            # Popis modela (--json, --search)
agentproxy combo list | switch | create | delete

agentproxy backup                       # Snimak konfiguracije i baze podataka
agentproxy restore                      # Obnova iz prethodnog snimka

agentproxy health                       # Detaljno zdravlje (prekidači, predmemorija, memorija)
agentproxy quota                        # Korištenje kvote pružatelja
agentproxy cache                        # Status predmemorije
agentproxy cache clear                  # Brisanje semantičke i predmemorije potpisa

agentproxy mcp status | restart         # Status / ponovno pokretanje MCP poslužitelja
agentproxy a2a status | card            # Status A2A poslužitelja / kartica agenta

agentproxy tunnel list | create | stop  # Upravljanje tunelima (cloudflare/tailscale/ngrok)
agentproxy env show | get <k> | set <k> <v>  # Pregled / postavljanje env varijabli (privremeno)

agentproxy test                         # Provjera povezivosti pružatelja
agentproxy update                       # Provjera dostupnih ažuriranja
agentproxy completion                   # Generiranje dovršetka ljuske
```

### Zajedničke zastavice

| Zastavica           | Opis                                                    |
| ------------------- | ------------------------------------------------------- |
| `--no-open`         | Ne otvaraj automatski preglednik pri pokretanju         |
| `--port <n>`        | Nadjačavanje API vrata (zadano 20128)                   |
| `--mcp`             | Pokretanje kao MCP poslužitelj putem stdio (za IDE-ove) |
| `--non-interactive` | Način rada za CI (bez upita; čita iz env/zastavica)     |
| `--json`            | Strojno čitljivi JSON izlaz (doctor, providers, itd.)   |
| `--help`, `-h`      | Prikaz pomoći specifične za naredbu                     |
| `--version`, `-v`   | Ispis instalirane verzije                               |

---

## Dostupni API krajnji točki

| Krajnja točka              | Opis                               | Koristi se za                        |
| -------------------------- | ---------------------------------- | ------------------------------------ |
| `/v1/chat/completions`     | Standardni chat (svi pružatelji)   | Svi moderni alati                    |
| `/v1/responses`            | Responses API (OpenAI format)      | Codex, agentski tijekovi             |
| `/v1/completions`          | Naslijeđena tekstualna dovršavanja | Stariji alati koji koriste `prompt:` |
| `/v1/embeddings`           | Tekstualni ugrađeni vektori        | RAG, pretraživanje                   |
| `/v1/images/generations`   | Generiranje slika                  | GPT-Image, Flux, itd.                |
| `/v1/audio/speech`         | Pretvaranje teksta u govor         | ElevenLabs, OpenAI TTS               |
| `/v1/audio/transcriptions` | Pretvaranje govora u tekst         | Deepgram, AssemblyAI                 |

Primjeri spremni za lijepljenje s tokeniziranim AgentProxy URL-om:

```txt
Token example: sk-a3ab3c080beaee3a-69f4a4-070d71af

Standard OpenAI base: http://localhost:20128/v1
VS Code models: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/models
VS Code chat: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/chat/completions
VS Code responses: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/responses
Ollama tags: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/tags
Ollama chat: http://localhost:20128/api/v1/vscode/sk-a3ab3c080beaee3a-69f4a4-070d71af/api/chat
```

---

## Rješavanje problema

| Pogreška                                                  | Uzrok                              | Rješenje                                                 |
| --------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `Connection refused`                                      | AgentProxy nije pokrenut            | `agentproxy serve`                                        |
| `401 Unauthorized`                                        | Pogrešan API ključ                 | Provjerite u `/dashboard/api-manager`                    |
| `No combo configured`                                     | Nema aktivne kombinacije rutiranja | Postavite u `/dashboard/combos`                          |
| CLI prikazuje "not installed"                             | Binarna datoteka nije u PATH-u     | Provjerite `which <command>`                             |
| Nadzorna ploča prikazuje "not detected" nakon instalacije | Predmemorija je zastarjela         | Kliknite "⟳ Refresh detection" na nadzornoj ploči        |
| Stara poveznica `/dashboard/cli-tools`                    | Oznaka prije v3.8.6                | Automatski preusmjerena na `/dashboard/cli-code` (308)   |
| Stara poveznica `/dashboard/agents`                       | Oznaka prije v3.8.6                | Automatski preusmjerena na `/dashboard/acp-agents` (308) |
