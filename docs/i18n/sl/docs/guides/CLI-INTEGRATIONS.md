# CLI-INTEGRATIONS (Slovenščina)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "Integracije CLI — usmerite kateri koli CLI za programiranje v AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# Integracije CLI

AgentProxy vključuje družino ukazov `setup-*`, ki konfigurirajo CLI za
programiranje (Codex, Claude Code, OpenCode, Cline, …), da uporablja AgentProxy
kot zaledje — tako orodje komunicira z **eno** končno točko, AgentProxy pa zahteve
usmerja k ustreznemu ponudniku s samodejnim preklopom ob napaki. Vsak ukaz prebere
**aktualni** katalog modelov iz delujočega primerka AgentProxy (lokalnega ali
oddaljenega) in zapiše lastno konfiguracijsko datoteko orodja v **vaš**
računalnik. Ključ API je naveden prek okoljske spremenljivke povsod, kjer orodje
to podpira. Ukazi, ki trajno shranijo lokalno okoljsko datoteko orodja, so
navedeni spodaj.

Na voljo je tudi splošni zaganjalnik — `agentproxy run <target>` — ki zažene
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` ali `gemini` z ustrezno
vstavljenimi okoljskimi spremenljivkami, ne da bi zapisal kakršno koli
konfiguracijo. Cilji in njihovi vzdevki izvirajo iz kanoničnega manifesta
`bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), ukaz `agentproxy completion` pa ponuja
iste ciljne izraze, izpeljane iz manifesta. Starejša zaganjalnika za posamezni
orodji — `agentproxy launch` (Claude Code) in `agentproxy launch-codex` (Codex) —
ostajata na voljo.

Uvajanje ponudnikov je na voljo iz istega lokalnega/oddaljenega konteksta.
Spodnji ukazi, ki temeljijo predvsem na API-ju, ločujejo overjanje za upravljanje
od poverilnic ponudnika in poverilnice nikoli ne izpišejo v strukturiranem
izhodu:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Za skripte raje uporabite `--credential-stdin` ali `--credential-env`;
`--credential` je ohranjen za nadzorovano lokalno uporabo. `providers remove`
na neinteraktivnem terminalu zahteva `--yes`, vseh pet ukazov pa upošteva
aktivni kontekst ali globalni možnosti `--base-url`/`--api-key`.

Za enkratno, ročno napisano osnovno nastavitev dveh najbogatejših integracij
glejte podrobna vodiča za posamezni orodji:

- [Konfiguracija Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Konfiguracija Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Oddaljeni način](./REMOTE-MODE.md) — upravljajte oddaljeni AgentProxy (VPS / Tailnet) s svojega prenosnika
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — razširitev OmniCopilot; te ukaze
  `setup-*` lahko namesto vas izvaja tudi znotraj urejevalnika

---

## Glavna tabela

Vsak ukaz upošteva **aktivni kontekst** (nastavljen z `agentproxy connect`; glejte
[Oddaljeni način](./REMOTE-MODE.md)) ali izrecni zastavici `--remote <url> --api-key <key>`.
»Lokalno ali oddaljeno« spodaj pomeni: brez zastavic cilja na `http://localhost:20128`;
z `--remote` (ali aktivnim oddaljenim kontekstom) pridobi katalog s tega
strežnika in konfiguracijo zapiše lokalno.

| Ukaz                       | Orodje                         | Kaj zapiše                                                                                                                                                               | Ključne zastavice                                                                                                                          | Lokalno ali oddaljeno |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI               | `~/.codex/<name>.config.toml` — en profil za vsak združljiv besedilni model (`codex --profile <name>`)                                                                   | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Oboje                 |
| `agentproxy setup-claude`   | Claude Code                    | `~/.claude/profiles/<name>/settings.json` — en profil za vsak ujemajoči se model (`CLAUDE_CONFIG_DIR`)                                                                   | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Oboje                 |
| `agentproxy setup-opencode` | OpenCode (združljiv z OpenAI)  | `~/.config/opencode/opencode.json` — ponudnik `agentproxy` z vsakim modelom iz kataloga (`opencode -m agentproxy/<model>`)                                                 | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Oboje                 |
| `agentproxy setup-cline`    | Cline                          | `~/.cline/data/{globalState,secrets}.json` (način CLI) + izpiše nastavitve razširitve VS Code                                                                            | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Oboje                 |
| `agentproxy setup-kilo`     | Kilo Code                      | `~/.local/share/kilo/auth.json` (CLI) + združi `kilocode.*` v `settings.json` za VS Code, če ta obstaja                                                                  | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Oboje                 |
| `agentproxy setup-continue` | Continue / `cn` CLI            | `~/.continue/config.yaml` — modeli `provider: openai`, ključ prek `${{ secrets.AGENTPROXY_API_KEY }}`                                                                     | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Oboje                 |
| `agentproxy setup-cursor`   | Cursor                         | Nič — izpiše korake za izvedbo v aplikaciji (konfiguracija Cursor je neprosojna zbirka SQLite)                                                                           | `--remote` `--api-key` `--only` `--port`                                                                                                   | Oboje                 |
| `agentproxy setup-roo`      | Roo Code                       | `~/.agentproxy/roo-settings.json` (dokument za uvoz) + nastavi `roo-cline.autoImportSettingsPath`, če obstaja `settings.json` za VS Code                                  | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Oboje                 |
| `agentproxy setup-crush`    | Crush                          | `~/.config/crush/crush.json` — ponudnik `openai-compat`, ključ prek `$AGENTPROXY_API_KEY`                                                                                 | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Oboje                 |
| `agentproxy setup-goose`    | Goose                          | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + izpiše recept za okoljske spremenljivke                                                   | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Oboje                 |
| `agentproxy setup-aider`    | Aider                          | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + izpiše recept za okoljske spremenljivke                                                                 | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Oboje                 |
| `agentproxy setup-qwen`     | Qwen Code                      | `~/.qwen/settings.json` — polje V4 `modelProviders.openai` + `AGENTPROXY_API_KEY` v `~/.qwen/.env`                                                                        | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Oboje                 |
| `agentproxy setup-5dive`    | 5dive (flota agentov)          | Nič pod `$HOME` — zapiše **profil za overjanje** 5dive (`/var/lib/5dive/auth-profiles/<name>/`) prek `5dive agent auth set`; samo za root, izvaja se na gostitelju flote | `--remote` `--api-key` `--model` `--auth-profile` `--agent` `--byo-provider` `--fivedive-bin` `--no-sudo` `--yes` `--dry-run` `--port`     | Oboje                 |
| `agentproxy run <target>`   | Zagon med izvajanjem (splošno) | Nič — zažene `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` z ustreznim okoljem in argumenti; Qwen in Gemini uporabljata začasno izolirano domačo mapo      | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Oboje                 |
| `agentproxy launch`         | Claude Code                    | Nič — zažene `claude` z vstavljenima `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`                                                                                         | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Oboje                 |
| `agentproxy launch-codex`   | OpenAI Codex CLI               | Nič — zažene `codex` s ponudnikom `agentproxy`, vstavljenim prek zastavic `-c`                                                                                            | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Oboje                 |

Opombe o zastavicah (preverjeno v izvorni kodi ukazov):

- `--remote <url>` — pridobi katalog iz oddaljenega primerka AgentProxy (preglasi
  `--port` in aktivni kontekst). `--api-key <key>` posreduje poverilnico za ta
  strežnik (privzeto okoljska spremenljivka `AGENTPROXY_API_KEY` ali žeton
  aktivnega konteksta).
- `--only <patterns>` — podnizi, ločeni z vejicami; ohrani samo ID-je modelov, ki
  se ujemajo (npr. `--only glm,kimi`). Na voljo pri `setup-codex`,
  `setup-claude`, `setup-opencode`, `setup-continue`, `setup-cursor`,
  `setup-crush`.
- `--dry-run` — izpiše natanko to, kar bi bilo zapisano, ne da bi spreminjal
  datotečni sistem. Na voljo pri vsakem ukazu `setup-*` **razen**
  `setup-cursor` (ki nikoli ne zapiše datoteke).
- `--model <id>` — obvezen (ali izbran interaktivno) za orodja brez samodejnega
  odkrivanja modelov: Cline, Kilo, Roo, Goose, Qwen, Aider, 5dive. Ta orodja
  sprejmejo tudi `--yes` za neinteraktivne zagone (ki nato zahtevajo `--model`).
  `setup-opencode` sprejme `--model` za nastavitev privzetega modela na najvišji
  ravni.
- `--model <id>` pri `agentproxy run` sledi povezavam za posamezne cilje v
  manifestu (`bin/cli/cli-manifest.mjs`): **aider** prejme
  `--model openai/<id>`, **opencode** pa `--model agentproxy/<id>` (predpona je
  dodana samo, če je ID še ne vsebuje); **qwen** in **gemini** prejmeta ID
  nespremenjen; **claude** ga prejme prek `ANTHROPIC_MODEL`, **goose** prek
  `GOOSE_MODEL`, **codex** pa prek argumentov `-c model_providers.agentproxy.*`.
  **Qwen je edini cilj ukaza run, ki strogo zahteva `--model`** — ukaz
  `agentproxy run qwen` brez njega se konča s kodo `2` in izrecnim sporočilom o
  napaki.
- `--port <port>` — vrata lokalnega primerka AgentProxy (privzeto `20128`;
  prezrta, ko je nastavljen `--remote`). Prisotna pri vseh ukazih `setup-*` in
  obeh zaganjalnikih.
- Izhodne kode ukaza `agentproxy run`: izhodna koda podrejenega CLI-ja se prenese
  nespremenjena; `2` = neveljavni argumenti (nepodprt cilj, manjkajoči obvezni
  `--model`, varovalo vsebnika); `127` = ciljna izvršljiva datoteka ni v `PATH`;
  `130`/`143`/`129`, ko se zagon konča zaradi `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = druga napaka pri zagonu med izvajanjem.
- Zaganjalnika (`launch`, `launch-codex`) sprejmeta `--profile <name>` za izbiro
  profila, ki ga je zapisal `setup-claude` / `setup-codex`, ter posredujeta
  dodatne argumente osnovni izvršljivi datoteki `claude` / `codex`.

Interaktivni izbirnik je prav tako skupen receptom za nastavitev:

```bash
# Izberite iz aktivnega lokalnega ali oddaljenega kataloga modelov in konfigurirajte cilj.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` trenutno izvedbo prepusti preizkušenim receptom za `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, `kilo` in `5dive`.
Vnosi v katalogu, namenjeni samo okoljem IDE, MITM ali vodičem, ostajajo izrecni
postopki `setup-*`/ročni postopki in niso predstavljeni kot cilji, ki jih je
mogoče zagnati.

> `setup-opencode` je **lahka integracija OpenCode, združljiva z OpenAI**.
> Obstaja tudi bogatejša integracija z vtičnikom — `agentproxy setup opencode` —
> ki namesti `@agentproxy/opencode-plugin`. To sta različna ukaza; zgornja tabela
> dokumentira `setup-opencode`.

---

## Lokalna uporaba

Ko AgentProxy deluje na `localhost:20128`, preprosto zaženite ukaz za nastavitev
svojega orodja. Katalog se pridobi iz lokalnega strežnika.

```bash
# Codex: za vsak ustrezen model zapiši profil v ~/.codex/
agentproxy setup-codex
codex --profile glm52            # uporabi ustvarjeni profil

# Claude Code: zapiši profile za posamezne modele in nato zaženi enega
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: zapiši ponudnika, združljivega z OpenAI, z vsemi modeli iz kataloga
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # uporabljen prek {env:AGENTPROXY_API_KEY}, nikoli na disku
opencode -m agentproxy/glm/glm-5.2 "..."

# Orodja brez samodejnega odkrivanja potrebujejo izrecno določen model:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Predogled brez zapisovanja:
agentproxy setup-continue --dry-run
```

Zagon brez zapisovanja kakršne koli konfiguracije (samo vstavljanje spremenljivk okolja):

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

# Izrecna pot do ukaza: nespremenjeno posreduj vse, kar sledi za --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Oddaljena uporaba

Poljuben ukaz za nastavitev usmerite na oddaljeni AgentProxy z `--remote` + `--api-key`.
Katalog se pridobi z oddaljenega strežnika, konfiguracija pa se zapiše v vaš lokalni računalnik.

```bash
# OpenCode z oddaljenim VPS-jem, obdrži samo modele glm/kimi
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # najprej izvozi AGENTPROXY_API_KEY

# Profili Codex iz oddaljenega kataloga
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Zaženi CLI neposredno proti oddaljenemu strežniku
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Namesto vsakokratnega podajanja `--remote`/`--api-key` se enkrat prijavite in pustite,
da ju **aktivni kontekst** zagotovi samodejno:

```bash
agentproxy connect 192.168.0.15        # ustvari žeton z omejenim obsegom in shrani kontekst
agentproxy setup-codex                 # ← zdaj uporablja oddaljeni katalog
agentproxy setup-opencode              # ← enako
agentproxy launch                      # ← Claude Code proti oddaljenemu strežniku
```

Za kontekste, obsege in upravljanje žetonov glejte [Oddaljeni način](./REMOTE-MODE.md).

---

## Flote agentov 5dive

[5dive](https://5dive.ai) poganja floto dolgotrajno delujočih agentov za programiranje,
pri čemer je vsak svoja enota systemd pod lastnim uporabnikom Unix. Sam po sebi ni
CLI za programiranje, zato `agentproxy run` nima ničesar, kar bi lahko zagnal —
`5dive` je cilj **samo za konfiguracijo**.

```bash
agentproxy configure 5dive --model failover-demo --yes
agentproxy setup-5dive --model failover-demo --auth-profile agentproxy --agent worker1
```

Obe obliki zapišeta en **profil za overjanje** 5dive, vsaka instanca `claude`, vezana
na ta profil, pa nato komunicira z AgentProxy. Za ta cilj so značilne tri stvari:

- **Izvaja se na gostitelju flote kot root.** Ukazi 5dive delujejo na lokalnih enotah
  systemd in imeniku stanja v lasti uporabnika root; oddaljeni način ni na voljo.
  Recept se prek `sudo` znova zažene, kadar se še ne izvaja kot root (`--no-sudo` to
  izklopi in namesto tega izpiše ukaz).
- **Končna točka mora uporabljati `https://`, razen če gre za povratno zanko.**
  Ključ API agenta se po tem URL-ju pošilja z vsako zahtevo, 5dive pa zavrne
  nešifrirano zunanjo končno točko. Zasebni naslov LAN ni izjema.
- **Lastna pripeta nastavitev modela vsake instance ima prednost pred profilom.**
  Profil vsebuje `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`, vendar instanca,
  ki je še vedno pripeta na privzeti ID modela, pri prvem koraku odpove s sporočilom
  _"There's an issue with the selected model"_. Podajte `--agent <name>` (lahko večkrat),
  da pripnete tudi instance; če tega ne storite, recept izpiše ukaz.

Ključ API se 5dive posreduje prek **stdin** (`--api-key=-`), zato se nikoli ne prikaže
v izpisu `ps`.

Usmeritev profila na **kombinacijo** AgentProxy namesto na en sam model floti omogoči
preklop ponudnika ob napaki: ko je primarna končna točka sredi koraka popolnoma
prenehala delovati v izvajanju, zabeleženem v
[#11578](https://github.com/khanhkit/AgentProxy/issues/11578), je agent preostale
korake dokončal na rezervni možnosti, ne da bi uporabniku prikazal izpad.

---

## Dogovori za osnovni URL (katera orodja zahtevajo `/v1`)

AgentProxy izpostavlja vmesnik OpenAI na `/v1`, vmesnik Anthropic v korenu,
nativni vmesnik Gemini pa na `/v1beta`. Vsaka integracija je nastavljena v obliki, ki jo
pričakuje njeno orodje (preverjeno v izvorni kodi ukaza):

| Integracija                                                                | Zapisan osnovni URL | `/v1`?                                   |
| -------------------------------------------------------------------------- | ------------------- | ---------------------------------------- |
| `setup-cline` (`openAiBaseUrl`)                                            | koren               | Ne — Cline doda `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | koren               | Ne — Goose doda pot                      |
| `setup-aider` (`OPENAI_API_BASE`)                                          | koren               | Ne — LiteLLM doda `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | z `/v1`             | Da                                       |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | koren               | Ne — Claude Code doda `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | z `/v1`             | Da                                       |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | z `/v1`             | Da                                       |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | koren               | Ne — SDK doda `/v1beta/models/…`         |
| `setup-5dive` (`ANTHROPIC_BASE_URL` v profilu za overjanje)                | koren               | Ne — Claude Code doda `/v1/messages`     |

---

## Ohranjanje nativnih odvisnosti pri posodobitvi: `--include=optional`

Ko izvedete posodobitev z `agentproxy update` (po potrditvi ali z `--apply`),
AgentProxy zažene namestitev z vključenim `--include=optional`:

```bash
npm install -g agentproxy@latest --include=optional
```

To **ni** zastavica, ki jo posredujete ukazu `agentproxy update` — program za
posodabljanje jo vedno uporabi. Zagotavlja, da se `optionalDependencies`
(`better-sqlite3`, `keytar`, `tls-client`, sklad SLM LLMLingua) ohranijo med
posodobitvijo, tudi če je v vaši konfiguraciji npm nastavljeno `omit=optional`,
kar bi sicer brez opozorila odstranilo nativni gonilnik SQLite in povezavo s
sistemsko shrambo ključev. Za predogled natančnega ukaza brez izvedbe:

```bash
agentproxy update --dry-run
# [POSKUSNI ZAGON] Izvedel bi: npm install -g agentproxy@latest --include=optional
```

Druge zastavice ukaza `agentproxy update` (preverjeno v izvorni kodi): `--check`
(izhod s kodo 1, če je različica zastarela), `--apply` (namestitev brez poziva),
`--changelog`, `--no-backup`, `--yes`.

---

## Google Gemini CLI prek `agentproxy run gemini`

Pogodba je preverjena z `@google/gemini-cli` 0.50.0: CLI upošteva
`GOOGLE_GEMINI_BASE_URL` in nanj pošilja zahteve `POST /v1beta/models/<model>:generateContent`
(in `:streamGenerateContent?alt=sse`) — natanko na nativni vmesnik Gemini
(`/v1beta`) storitve AgentProxy. `agentproxy run gemini` to nastavi samodejno:

- `GOOGLE_GEMINI_BASE_URL` → aktivni osnovni URL storitve AgentProxy (koren, brez `/v1`);
- `GEMINI_API_KEY` → razrešena poverilnica AgentProxy (možnost/okolje/kontekst);
- **začasni izolirani `GEMINI_CLI_HOME`**, katerega `.gemini/settings.json`
  izbere overjanje `gemini-api-key`, zato shranjena seja Google OAuth (Code Assist)
  nikoli ne preglasi zagona, usmerjenega v AgentProxy — po koncu se odstrani;
- **higiena okolja**: iz okolja podrejenega procesa se odstranijo
  `GOOGLE_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI` in `GOOGLE_GENAI_USE_GCA`
  (ki bi overjanje preusmerile na Vertex/Code Assist), spremenljivka
  `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` pa se nastavi kot dodatna varovalka
  — drugi cilji `run` so enako obravnavani glede svojih konfliktnih spremenljivk;
- dodajanje `--model <id>` iz `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Geminin mehanizem preverjanja zaupanja delovnemu prostoru velja tudi v brezglavem
načinu — sami posredujte `--skip-trust` (ali imeniku interaktivno izkažite
zaupanje); zaganjalnik ga namenoma ne zaobide. Ta zaganjalnik se razlikuje od
**registracije ACP** (`src/lib/acp/registry.ts`, `gemini --acp`), ki ostaja
integracija protokola agentov za `/dashboard/acp-agents`.

---

## Resnični preizkus delovanja (ob izrecni vključitvi)

Deterministični regresijski preizkusi načrta zagona se izvajajo v CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Za preverjanje RESNIČNIH izvršljivih datotek z RESNIČNIM
strežnikom AgentProxy je na voljo ogrodje, ki ga je treba izrecno vključiti, na naslovu
`tests/integration/upstream-cli-smoke.int.test.ts`. Nikoli se ne zažene samodejno
(vsak podpreizkus je preskočen, razen če je nastavljeno `RUN_CLI_SMOKE=1`), poverilnico posreduje prek IMENA
okoljske spremenljivke (nikoli prek vrednosti), iz vseh zabeleženih izhodnih podatkov zakrije nize,
ki so videti kot ključi, preskoči cilje, katerih izvršljiva datoteka ni nameščena, in napake
razvrsti kot auth / upstream / config namesto zgolj logične vrednosti:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Izbirno: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` omeji nabor preverjanj;
`AGENTPROXY_SMOKE_TIMEOUT_MS` preglasi 120-sekundno časovno omejitev za posamezen cilj.

---

## Glejte tudi

- [Konfiguracija Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — podrobnejši vodnik za Claude Code
- [Konfiguracija Codex CLI](./CODEX-CLI-CONFIGURATION.md) — enkratna osnovna nastavitev `[model_providers.agentproxy]`
- [Oddaljeni način](./REMOTE-MODE.md) — konteksti, dostopni žetoni z omejenim obsegom in upravljanje oddaljenega strežnika
- [Referenca orodij CLI](../reference/CLI-TOOLS.md) — celoten katalog podprtih orodij in strani nadzorne plošče
- [Vodnik za nastavitev](./SETUP_GUIDE.md) — načini namestitve in uvodno nastavljanje ob prvem zagonu
