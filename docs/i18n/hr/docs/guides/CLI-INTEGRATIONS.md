# CLI-INTEGRATIONS (Hrvatski)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI Integracije — usmjerite bilo koji coding CLI na AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI Integracije

AgentProxy isporučuje skupinu `setup-*` naredbi koje konfiguriraju coding
CLI (Codex, Claude Code, OpenCode, Cline, …) da koristi AgentProxy kao pozadinsku uslugu — tako
da alat komunicira s **jednom** krajnjom točkom, a AgentProxy preusmjerava na pravog pružatelja uz
automatski prelazak na zamjenu. Svaka naredba čita **aktivan** katalog modela s pokrenutog
AgentProxy instance (lokalne ili udaljene) i zapisuje vlastitu konfiguracijsku datoteku alata na **vašem**
računalu. API ključ se referencira putem varijable okruženja gdje god to alat podržava. Naredbe koje trajno pohranjuju lokalnu datoteku okruženja alata navedene su u nastavku.

Postoji i generički pokretač — `agentproxy run <target>` — koji pokreće
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` ili `gemini` s
ispravno postavljenim env varijablama, bez pisanja ikakve konfiguracije. Ciljevi i njihovi
pseudonimi dolaze iz kanonskog manifesta `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), a `agentproxy completion` nudi
iste ciljne riječi izvedene iz manifesta. Naslijeđeni pokretači za pojedine alate —
`agentproxy launch` (Claude Code) i `agentproxy launch-codex` (Codex) — ostaju
dostupni.

Uključivanje pružatelja usluga dostupno je iz istog lokalnog/udaljenog konteksta. Naredbe
usmjerene na API u nastavku drže autentikaciju upravljanja odvojenom od vjerodajnica pružatelja
i nikada ne ispisuju vjerodajnicu u strukturiranom izlazu:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Za skripte preferirajte `--credential-stdin` ili `--credential-env`; `--credential`
je zadržan za kontroliranu lokalnu upotrebu. `providers remove` zahtijeva `--yes` na
neterminalnom sučelju, a svih pet naredbi poštuje aktivni kontekst ili
globalne opcije `--base-url`/`--api-key`.

Za jednokratno, ručno pisano osnovno postavljanje dviju najbogatijih integracija, pogledajte
detaljne vodiče za pojedine alate:

- [Konfiguracija Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Konfiguracija Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Udaljeni način rada](./REMOTE-MODE.md) — upravljajte udaljenim AgentProxy (VPS / Tailnet) s vašeg laptopa
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — OmniCopilot ekstenzija; može i sama pokrenuti ove
  `setup-*` naredbe iz uređivača

---

## Glavna tablica

Svaka naredba poštuje **aktivni kontekst** (postavljen s `agentproxy connect`, vidi
[Udaljeni način rada](./REMOTE-MODE.md)) ili eksplicitne zastavice `--remote <url> --api-key <key>`.
"Lokalno vs udaljeno" u nastavku znači: bez zastavica cilja `http://localhost:20128`;
s `--remote` (ili aktivnim udaljenim kontekstom) dohvaća katalog s tog
poslužitelja i lokalno zapisuje konfiguraciju.

| Naredba                    | Alat                           | Što zapisuje                                                                                                                                                           | Ključne zastavice                                                                                                                          | Lokalno vs udaljeno |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI               | `~/.codex/<name>.config.toml` — jedan profil po kompatibilnom tekstualnom modelu (`codex --profile <name>`)                                                            | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Oba                 |
| `agentproxy setup-claude`   | Claude Code                    | `~/.claude/profiles/<name>/settings.json` — jedan profil po odgovarajućem modelu (`CLAUDE_CONFIG_DIR`)                                                                 | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Oba                 |
| `agentproxy setup-opencode` | OpenCode (openai-compatible)   | `~/.config/opencode/opencode.json` — `agentproxy` pružatelj s svakim modelom iz kataloga (`opencode -m agentproxy/<model>`)                                              | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Oba                 |
| `agentproxy setup-cline`    | Cline                          | `~/.cline/data/{globalState,secrets}.json` (CLI način) + ispisuje postavke VS Code ekstenzije                                                                          | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Oba                 |
| `agentproxy setup-kilo`     | Kilo Code                      | `~/.local/share/kilo/auth.json` (CLI) + spaja `kilocode.*` u VS Code `settings.json` ako postoji                                                                       | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Oba                 |
| `agentproxy setup-continue` | Continue / `cn` CLI            | `~/.continue/config.yaml` — modeli s `provider: openai`, ključ putem `${{ secrets.AGENTPROXY_API_KEY }}`                                                                | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Oba                 |
| `agentproxy setup-cursor`   | Cursor                         | Ništa — ispisuje korake unutar aplikacije (Cursor konfiguracija je neprozirni SQLite)                                                                                  | `--remote` `--api-key` `--only` `--port`                                                                                                   | Oba                 |
| `agentproxy setup-roo`      | Roo Code                       | `~/.agentproxy/roo-settings.json` (dokument za uvoz) + postavlja `roo-cline.autoImportSettingsPath` ako postoji VS Code `settings.json`                                 | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Oba                 |
| `agentproxy setup-crush`    | Crush                          | `~/.config/crush/crush.json` — `openai-compat` pružatelj, ključ putem `$AGENTPROXY_API_KEY`                                                                             | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Oba                 |
| `agentproxy setup-goose`    | Goose                          | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + ispisuje env recept                                                                     | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Oba                 |
| `agentproxy setup-aider`    | Aider                          | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + ispisuje env recept                                                                                   | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Oba                 |
| `agentproxy setup-qwen`     | Qwen Code                      | `~/.qwen/settings.json` — V4 `modelProviders.openai` polje + `AGENTPROXY_API_KEY` u `~/.qwen/.env`                                                                      | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Oba                 |
| `agentproxy setup-5dive`    | 5dive (agent fleet)            | Ništa pod `$HOME` — zapisuje 5dive **auth profil** (`/var/lib/5dive/auth-profiles/<name>/`) putem `5dive agent auth set`; samo root, pokreće se na fleet hostu         | `--remote` `--api-key` `--model` `--auth-profile` `--agent` `--byo-provider` `--fivedive-bin` `--no-sudo` `--yes` `--dry-run` `--port`     | Oba                 |
| `agentproxy run <target>`   | Runtime pokretanje (generičko) | Ništa — pokreće `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` s ispravnim env varijablama i argumentima; Qwen i Gemini koriste privremeni izolirani home | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Oba                 |
| `agentproxy launch`         | Claude Code                    | Ništa — pokreće `claude` s umetnutim `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`                                                                                       | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Oba                 |
| `agentproxy launch-codex`   | OpenAI Codex CLI               | Ništa — pokreće `codex` s umetnutim `agentproxy` pružateljem putem `-c` zastavica                                                                                       | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Oba                 |

Napomene o zastavicama (provjereno u izvornom kodu naredbi):

- `--remote <url>` — dohvaća katalog s udaljenog AgentProxy (nadjačava `--port`
  i aktivni kontekst). `--api-key <key>` pruža vjerodajnicu za taj
  poslužitelj (zadano na env varijablu `AGENTPROXY_API_KEY`, ili token aktivnog konteksta).
- `--only <patterns>` — podnizkovi odvojeni zarezima; zadržava samo ID-ove modela koji se podudaraju
  (npr. `--only glm,kimi`). Dostupno na `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — ispisuje točno što bi bilo zapisano bez dodirivanja
  datotečnog sustava. Dostupno na svakoj `setup-*` naredbi **osim** `setup-cursor`
  (koja nikada ne zapisuje datoteku).
- `--model <id>` — obavezno (ili odabrano interaktivno) za alate koji nemaju
  automatsko otkrivanje modela: Cline, Kilo, Roo, Goose, Qwen, Aider, 5dive. Ti alati
  također prihvaćaju `--yes` za neinteraktivna pokretanja (što tada zahtijeva `--model`).
  `setup-opencode` prima `--model` za postavljanje zadanog modela najviše razine.
- `--model <id>` na `agentproxy run` prati ožičenje manifesta po cilju
  (`bin/cli/cli-manifest.mjs`): **aider** prima `--model openai/<id>`, a
  **opencode** `--model agentproxy/<id>` (prefiks se dodaje samo kada id
  ga već ne sadrži); **qwen** i **gemini** primaju id doslovno;
  **claude** ga dobiva putem `ANTHROPIC_MODEL`, **goose** putem `GOOSE_MODEL`, a
  **codex** putem `-c model_providers.agentproxy.*` argumenata. **Qwen je jedini run
  cilj koji strogo zahtijeva `--model`** — `agentproxy run qwen` bez njega izlazi
  s `2` uz eksplicitnu grešku.
- `--port <port>` — lokalni AgentProxy port (zadano `20128`, ignorira se kada je postavljen `--remote`).
  Prisutno na svim `setup-*` naredbama i oba pokretača.
- Izlazni kodovi `agentproxy run`: vlastiti izlazni kod podređenog CLI-ja se prenosi
  doslovno; `2` = nevaljani argumenti (nepodržani cilj, nedostaje obavezni
  `--model`, zaštita kontejnera); `127` = ciljana binarna datoteka nije u `PATH`-u;
  `130`/`143`/`129` kada je pokretanje završeno s `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = ostale greške pri pokretanju.
- Oba pokretača (`launch`, `launch-codex`) prihvaćaju `--profile <name>` za odabir
  profila zapisanog s `setup-claude` / `setup-codex`, uz argumente za prosljeđivanje temeljnoj
  binarnoj datoteci `claude` / `codex`.

Interaktivni birač također je zajednički za setup recepte:

```bash
# Odaberite iz aktivnog lokalnog ili udaljenog kataloga modela i konfigurirajte cilj.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` trenutno delegira na testirane recepte za `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, `kilo` i `5dive`.
Unosi kataloga samo za IDE,
MITM i samo za vodiče ostaju eksplicitni `setup-*`/ručni tokovi i
nisu prikazani kao ciljevi koji se mogu pokrenuti.

> `setup-opencode` je **lagana openai-kompatibilna** OpenCode integracija.
> Postoji i bogatija integracija putem dodatka — `agentproxy setup opencode` — koja
> instalira `@agentproxy/opencode-plugin`. To su različite naredbe; tablica
> iznad dokumentira `setup-opencode`.

---

## Lokalna uporaba

S AgentProxy koji radi na `localhost:20128`, jednostavno pokrenite narebu za postavljanje vašeg
alata. Katalog se dohvaća s lokalnog poslužitelja.

```bash
# Codex: napiši profil po podudarenom modelu u ~/.codex/
agentproxy setup-codex
codex --profile glm52            # koristi generirani profil

# Claude Code: napiši profile po modelu, zatim pokreni jedan
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: napiši openai-kompatibilnog pružatelja sa svim modelima iz kataloga
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # referencira se putem {env:AGENTPROXY_API_KEY}, nikada na disku
opencode -m agentproxy/glm/glm-5.2 "..."

# Alati bez automatskog otkrivanja zahtijevaju eksplicitan model:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Pregled bez ikakvih zapisivanja:
agentproxy setup-continue --dry-run
```

Pokretanje bez pisanja ikakve konfiguracije (samo ubrizgavanje okruženja):

```bash
agentproxy launch                 # Claude Code → lokalni AgentProxy
agentproxy launch-codex           # Codex CLI → lokalni AgentProxy
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Eksplicitna putanja naredbe: proslijedi sve što dolazi iza --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Udaljenja uporaba

Usmjerite bilo koju naredbu za postavljanje prema udaljenom AgentProxyu s `--remote` + `--api-key`. Katalog
se dohvaća s udaljenog poslužitelja; konfiguracija se zapisuje na vašem lokalnom računalu.

```bash
# OpenCode prema udaljenom VPS-u, zadrži samo modele glm/kimi
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # prvo izvezite AGENTPROXY_API_KEY

# Codex profili iz udaljenog kataloga
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Pokretanje CLI-ja izravno prema udaljenom poslužitelju
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Umjesto da svaki put prosljeđujete `--remote`/`--api-key`, prijavite se jednom i prepustite
**aktivnom kontekstu** da ih automatski osigura:

```bash
agentproxy connect 192.168.0.15        # kreira opsežni token, pohranjuje kontekst
agentproxy setup-codex                 # ← sada koristi udaljeni katalog
agentproxy setup-opencode              # ← isto
agentproxy launch                      # ← Claude Code prema udaljenom poslužitelju
```

Pogledajte [Udaljeni način rada](./REMOTE-MODE.md) za kontekste, opsege i upravljanje tokenima.

---

## 5dive flote agenata

[5dive](https://5dive.ai) pokreće flotu dugotrajnih agenata za kodiranje, od kojih je svaki
systemd jedinica pod vlastitim Unix korisnikom. To nije CLI za kodiranje sam po sebi, pa nema
ničega što bi `agentproxy run` trebao pokrenuti — `5dive` je cilj **samo za konfiguriranje**.

```bash
agentproxy configure 5dive --model failover-demo --yes
agentproxy setup-5dive --model failover-demo --auth-profile agentproxy --agent worker1
```

Oba oblika zapisuju jedan 5dive **auth profil**, a svako `claude` sjedalo vezano uz taj
profil tada komunicira s AgentProxyom. Tri stvari su specifične za ovaj cilj:

- **Pokreće se na poslužitelju flote, kao root.** 5dive-ovi glagoli djeluju na lokalne systemd jedinice
  i direktorij stanja koji je u vlasništvu roota; ne postoji udaljeni način rada. Recept se ponovno izvršava kroz
  `sudo` kada već nije root (`--no-sudo` to isključuje i umjesto toga ispisuje naredbu).
- **Krajnja točka mora biti `https://` osim ako nije loopback.** API ključ agenta
  putuje tom URL-om na svakom zahtjevu, a 5dive odbija nešifriranu krajnju točku izvan uređaja.
  Privatna LAN adresa nije iznimka.
- **Vlastiti pin modela svakog sjedala nadmašuje profil.** Profil nosi
  `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`, ali sjedalo koje je i dalje prikvačeno na standardni
  id modela ne uspijeva pri prvom potezu s porukom _"There's an issue with the selected model"_.
  Prosljeđujte `--agent <name>` (može se ponavljati) da biste prikvačili i sjedala; recept ispisuje
  naredbu kada to ne učinite.

API ključ se predaje 5diveu putem **stdin-a** (`--api-key=-`), pa se nikada ne pojavljuje u
ispisu `ps`.

Usmjeravanje profila na AgentProxy **kombinaciju** umjesto na jedan model ono je što
osigurava prebacivanje pružatelja usluge za flotu: kada je primarna krajnja točka potpuno pala usred poteza
u snimljenom izvođenju na
[#11578](https://github.com/khanhkit/AgentProxy/issues/11578), agent je završio
preostale korake na rezervnoj krajnjoj točki i nikada nije izložio prekid rada.

---

## Konvencije osnovnog URL-a (koji alati žele `/v1`)

AgentProxy izlaže OpenAI sučelje na `/v1`, Anthropic sučelje na korijenu,
a izvorno Gemini sučelje na `/v1beta`. Svaka integracija spojena je na oblik koji
njezin alat očekuje (provjereno u izvornom kodu naredbe):

| Integracija                                                                | Upisani osnovni URL | `/v1`?                                     |
| -------------------------------------------------------------------------- | ------------------- | ------------------------------------------ |
| `setup-cline` (`openAiBaseUrl`)                                            | korijen             | Ne — Cline dodaje `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | korijen             | Ne — Goose dodaje putanju                  |
| `setup-aider` (`OPENAI_API_BASE`)                                          | korijen             | Ne — LiteLLM dodaje `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | s `/v1`             | Da                                         |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | korijen             | Ne — Claude Code dodaje `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | s `/v1`             | Da                                         |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | s `/v1`             | Da                                         |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | korijen             | Ne — SDK dodaje `/v1beta/models/…`         |
| `setup-5dive` (`ANTHROPIC_BASE_URL` u auth profilu)                        | korijen             | Ne — Claude Code dodaje `/v1/messages`     |

---

## Zadržavanje izvornih ovisnosti pri ažuriranju: `--include=optional`

Kada ažurirate pomoću `agentproxy update` (nakon potvrde ili s `--apply`),
AgentProxy pokreće instalaciju s ugrađenom zastavicom `--include=optional`:

```bash
npm install -g agentproxy@latest --include=optional
```

Ovo **nije** zastavica koju prosljeđujete naredbi `agentproxy update` — uvijek je primjenjuje
program za ažuriranje. Jamči da `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, LLMLingua SLM skup) prežive ažuriranje čak i ako vaša npm konfiguracija
ima postavljeno `omit=optional`, što bi inače tiho uklonilo izvorni SQLite
upravljački program i vezanje OS privjeska za ključeve. Za pregled točne naredbe bez primjene:

```bash
agentproxy update --dry-run
# [PROBNI POKRET] Bi pokrenuo: npm install -g agentproxy@latest --include=optional
```

Ostale zastavice naredbe `agentproxy update` (provjereno u izvornom kodu): `--check` (izlaz 1 ako je
zastarjelo), `--apply` (instalacija bez upita), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI putem `agentproxy run gemini`

Ugovor provjeren za `@google/gemini-cli` 0.50.0: CLI poštuje
`GOOGLE_GEMINI_BASE_URL` i šalje `POST /v1beta/models/<model>:generateContent`
(i `:streamGenerateContent?alt=sse`) na njega — točno AgentProxyovo izvorno
Gemini sučelje (`/v1beta`). `agentproxy run gemini` to automatski povezuje:

- `GOOGLE_GEMINI_BASE_URL` → aktivni AgentProxy osnovni URL (korijen, bez `/v1`);
- `GEMINI_API_KEY` → razriješena AgentProxy vjerodajnica (opcija/env/kontekst);
- **privremeni izolirani `GEMINI_CLI_HOME`** čiji `.gemini/settings.json`
  odabire autentifikaciju `gemini-api-key`, tako da pohranjena Google OAuth sesija (Code Assist)
  nikada ne nadjača AgentProxy-usmjereno pokretanje — uklanja se nakon izlaska;
- **higijene okoline**: dječja okolina pročišćuje se od `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` i `GOOGLE_GENAI_USE_GCA` (koji bi preusmjerili
  autentifikaciju na Vertex/Code Assist), a `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` postavlja se
  kao rezervna mjera pojačane sigurnosti — ostale mete `run` dobivaju jednaki
  tretman za vlastite varijable koje su u sukobu;
- ubacivanje `--model <id>` iz `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Geminijev zaštitnik povjerenja radnog prostora i dalje se primjenjuje u bezglavom načinu — prenesite
`--skip-trust` (ili interaktivno prihvatite direktorij) sami; pokretač
to namjerno ne zaobilazi. Ovaj pokretač razlikuje se od **ACP
registracije** (`src/lib/acp/registry.ts`, `gemini --acp`), koja ostaje
integracija agentskog protokola za `/dashboard/acp-agents`.

---

## Pravi smoke test (opt-in)

Determinističko pokretanje regresijskih testova plana pokretanja u CI-u (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Za validaciju PRAVIH binara protiv PRAVOG
AgentProxy poslužitelja, opt-in okvir postoji na
`tests/integration/upstream-cli-smoke.int.test.ts`. Nikada se ne pokreće automatski
(svaki podtest se preskače osim ako nije postavljen `RUN_CLI_SMOKE=1`), prosljeđuje vjerodajnicu putem env-var
NAZIVA (nikada putem vrijednosti), uklanja nizove koji izgledaju kao ključevi iz bilo kojeg snimljenog izlaza, preskače
ciljeve čiji binarni program nije instaliran, te klasificira neuspjehe kao
auth / upstream / config umjesto jednostavne logičke vrijednosti:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Neobavezno: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` ograničava sweep;
`AGENTPROXY_SMOKE_TIMEOUT_MS` nadjačava vremensko ograničenje od 120s po cilju.

---

## Vidi također

- [Konfiguracija Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — detaljniji vodič za Claude Code
- [Konfiguracija Codex CLI](./CODEX-CLI-CONFIGURATION.md) — jednokratno postavljanje `[model_providers.agentproxy]` baze
- [Udaljeni način rada](./REMOTE-MODE.md) — konteksti, ograničeni pristupni tokeni, upravljanje udaljenim poslužiteljem
- [Referenca CLI alata](../reference/CLI-TOOLS.md) — potpuni katalog podržanih alata i stranica nadzorne ploče
- [Vodič za postavljanje](./SETUP_GUIDE.md) — metode instalacije i uvođenje pri prvom pokretanju
