# CLI-INTEGRATIONS (Gaeilge)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "Comhtháthuithe CLI — cuir aon CLI ríomhchláraíochta ag díriú ar AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# Comhtháthuithe CLI

Seolann OmniRange teaghlach de chomhandaí `setup-*` a chumraíonn CLI
ríomhchláiríochta (Codex, Claude Code, OpenCode, Cline, …) chun AgentProxy a
úsáid mar a chuid cúlra — ionas go labhrann an t-uirlis le **h-amháin**
críochphointe agus go n-aimseoiríonn AgentProxy chuig an soláthraí ceart le
tuirlingt uathoibríoch. Léann gach comhanda an catalóg samhlacha **beo** ó
AgentProxy áitiúil nó cianda agus scríobhann sé comhaid chumraíochta an
uirlis ar **do** ríomhaire féin. Tagraítear d'eochair API trí athróg
timpeallachta áit a n-éiríonn an t-uirlis leis. Tugtar faoi deara na
comhandaí a chuireann comhad timpeallachta uirlise leabaithe in áirithe thios.

Tá seoltóir ginearálta freisin — `agentproxy run <sprioc>` — a ionsíonn
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` nó `gemini` leis an
timpeallacht cheart inste, gan aon chumraíocht a scríobh ar chor ar bith.
Tagann na spriocanna agus a n-ailiasanna ón léarscáil chinéil `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), agus cuireann `agentproxy completion` na
focail spriocanna céanna bunaithe ar an léarscáil ar fáil. Tá na seoltóirí
séanacha in aghaidh na huirlise —
`agentproxy launch` (Claude Code) agus `agentproxy launch-codex` (Codex) — ar
fáil fós.

Tá bordáil soláthraí ar fáil ón timpeallacht áitiúil/cianda chéanna.
Coinnigh na comhandaí API-thosaigh thuas greimniú riaracháin agus creidiúintí
soláthraí agus ná cuir aon chruthúnas i bhfocail structúrtha:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Do scriptí, b'fhearr `--credential-stdin` nó `--credential-env`; coinnítear
`--credential` le haghaidh úsáide áitiúil rialaithe. Éilíonn `providers remove`
`--yes` ar thairseach neamh-idirghníomhach, agus moidh an cúig comhanda leis an
gcomhthéacs gníomhach nó leis na roghanna comhfhreagracha `--base-url`/`--api-key`.

Le haghaidh bunshocrú láimhe aon-uair do an dá comhtháthú is saibhre, féach
forbhreathnú in aghaidh na huirlise:

- [Cumraíocht Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Cumraíocht Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Mód Cianda](./REMOTE-MODE.md) — tiomáin AgentProxy cianda (VPS / Tailnet) ó do ríomhaire glúine
- [Comhrá VS Code Copilot](./VSCODE-COPILOT.md) — síneadh OmniCopilot; is féidir leis na comhandaí
  `setup-*` seo a rith freisin taobh istigh den eagarthóir

---

## Príomhchlár

Moidh gach comhanda leis an **gcomhthéacs gníomhach** (socraithe le `agentproxy connect`, féach
[Mód Cianda](./REMOTE-MODE.md)) nó le comharthaí sainráite `--remote <url> --api-key <key>`.
Ciallaíonn "áitiúil vs cianda" anseo: gan aon chomharthaí díríonn sé ar `http://localhost:20128`;
le `--remote` (nó comhthéacs cianda gníomhach) faigheann sé an catalóg ón
bhfreastalaí sin agus scríobhann sé an chumraíocht go háitiúil.

| Comhanda                   | Uirlis                                   | An bhfuil sé ag scríobh                                                                                                                                                                 | Príomhchomharthaí                                                                                                                          | Áitiúil vs cianda |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI                         | `~/.codex/<ainm>.config.toml` — próifíl amháin in aghaidh na samhail téacs comhoiriúnach (`codex --profile <ainm>`)                                                                     | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Araon             |
| `agentproxy setup-claude`   | Claude Code                              | `~/.claude/profiles/<ainm>/settings.json` — próifíl amháin in aghaidh na samhail mheaitseáilte (`CLAUDE_CONFIG_DIR`)                                                                    | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Araon             |
| `agentproxy setup-opencode` | OpenCode (comhoiriúnach le openai)       | `~/.config/opencode/opencode.json` — soláthraí `agentproxy` le gach samhail catalóige (`opencode -m agentproxy/<samhail>`)                                                                | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Araon             |
| `agentproxy setup-cline`    | Cline                                    | `~/.cline/data/{globalState,secrets}.json` (mód CLI) + priontáil suíomhanna síneadh VS Code                                                                                             | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Araon             |
| `agentproxy setup-kilo`     | Kilo Code                                | `~/.local/share/kilo/auth.json` (CLI) + cumascann `kilocode.*` le VS Code `settings.json` má tá sé i láthair                                                                            | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Araon             |
| `agentproxy setup-continue` | Continue / `cn` CLI                      | `~/.continue/config.yaml` — samhlacha `provider: openai`, eochair trí `${{ secrets.AGENTPROXY_API_KEY }}`                                                                                | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Araon             |
| `agentproxy setup-cursor`   | Cursor                                   | Rud ar bith — priontáil na céimeanna in-app (tá cumraíocht Cursor in SQLite do-ghlactha)                                                                                                | `--remote` `--api-key` `--only` `--port`                                                                                                   | Araon             |
| `agentproxy setup-roo`      | Roo Code                                 | `~/.agentproxy/roo-settings.json` (doiciméad ionmportála) + socraíonn `roo-cline.autoImportSettingsPath` má tá VS Code `settings.json` i láthair                                         | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Araon             |
| `agentproxy setup-crush`    | Crush                                    | `~/.config/crush/crush.json` — soláthraí `openai-compat`, eochair trí `$AGENTPROXY_API_KEY`                                                                                              | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Araon             |
| `agentproxy setup-goose`    | Goose                                    | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + priontáil oideas timpeallachta                                                                           | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Araon             |
| `agentproxy setup-aider`    | Aider                                    | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + priontáil oideas timpeallachta                                                                                         | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Araon             |
| `agentproxy setup-qwen`     | Qwen Code                                | `~/.qwen/settings.json` — eagar V4 `modelProviders.openai` + `AGENTPROXY_API_KEY` in `~/.qwen/.env`                                                                                      | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Araon             |
| `agentproxy setup-5dive`    | 5dive (slua oibreoirí)                   | Rud ar bith faoi `$HOME` — scríobhann próifíl **umhlaíochta 5dive** (`/var/lib/5dive/auth-profiles/<ainm>/`) trí `5dive agent auth set`; ríth-riantóir, rith ar an óstach slua          | `--remote` `--api-key` `--model` `--auth-profile` `--agent` `--byo-provider` `--fivedive-bin` `--no-sudo` `--yes` `--dry-run` `--port`     | Araon             |
| `agentproxy run <sprioc>`   | Seoladh rith-thimpeallachta (ginearálta) | Rud ar bith — ionsíonn `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` leis an timpeallacht agus na h-argóintí cearta; úsáideann Qwen agus Gemini baile aimseartha in aonrú | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Araon             |
| `agentproxy launch`         | Claude Code                              | Rud ar bith — ionsíonn `claude` le `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` inste                                                                                                    | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Araon             |
| `agentproxy launch-codex`   | OpenAI Codex CLI                         | Rud ar bith — ionsíonn `codex` le soláthraí `agentproxy` inste trí chomharthaí `-c`                                                                                                      | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Araon             |

Nótaí maidir le comharthaí (fíoraithe sa foinse comhanda):

- `--remote <url>` — faigh an catalóg ó AgentProxy cianda (sáraíonn `--port`
  agus an comhthéacs gníomhach). Soláthraíonn `--api-key <eochair>` an creidiúnas don
  fhreastalaí sin (réamhshocrú athróg timpeallachta `AGENTPROXY_API_KEY`, nó comhartha an
  chomhthéacs ghníomhaigh).
- `--only <phatrúin>` — fo-phatrúin ina gcéimseata le poncanna; coinnigh ach samhlacha ID a mheaitseálann
  (m.sh. `--only glm,kimi`). Ar fáil ar `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — priontáil go díreach an méid a scríofa faoin comhad gan an
  comhadlann a bhaint amach. Ar fáil ar gach comhanda `setup-*` **seachas** `setup-cursor`
  (nach scríobhann comhad ar chor ar bith).
- `--model <id>` — éilítear (nó roghnaítear go h-idirghníomhach) le haghaidh na huirlisí nach bhfuil
  aimsiú uathoibríoch samhail acu: Cline, Kilo, Roo, Goose, Qwen, Aider, 5dive. Glacann na huirlisí sin
  freisin le `--yes` le haghaidh rith neamh-idirghníomhach (a éilíonn ansin `--model`).
  Glacann `setup-opencode` le `--model` chun an tsamhail phríomhshuíomh a shocrú.
- Glacann `--model <id>` ar `agentproxy run` le ceangal in aghaidh na spriocanna sa léarscáil
  (`bin/cli/cli-manifest.mjs`): faigheann **aider** `--model openai/<id>` agus
  **opencode** `--model agentproxy/<id>` (cuirtear an réamhfhocal leis ach nuair nach bhfuil
  an id go dtí ann); faigheann **qwen** agus **gemini** an id mar atá;
  faigheann **claude** é trí `ANTHROPIC_MODEL`, faigheann **goose** é trí `GOOSE_MODEL`,
  agus faigheann **codex** é trí `model_providers.agentproxy.*` argóintí. **Is é Qwen an t-aon sprioc
  run a éilíonn `--model` go crua** — má dhéanann `agentproxy run qwen` gan é is amhlaidh a
  críochnaíonn sé `2` le hearráid shainráite.
- `--port <port>` — port AgentProxy áitiúil (réamhshocrú `20128`, neamhairde nuair a bhíonn `--remote`
  socraithe). I láthair ar gach `setup-*` agus ar an dá sheoltóir.
- Códanna fholmh `agentproxy run`: folaítear cód fholmh an CLI leanbh mar atá;
  `2` = argóintí neamhcheadaithe (sprioc neamhthacaíochta, `--model` riachtanach in easnamh, cosaint coimeádáin);
  `127` níl an déannach sprioc i `PATH`;
  `130`/`143`/`129` nuair a chríochnaítear an seoladh le `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = teip eile seoladh rith.
- Glacann an dá sheoltóir (`launch`, `launch-codex`) le `--profile <ainm>` chun
  próifíl a scríobh le `setup-claude` / `setup-codex`, chomh maith le hargóintí pas-tríd don
  déannach `claude` / `codex`.

Roinntear an roghnóir idirghníomhach leis na h-oideas socraithe freisin:

```bash
# Roghnaigh ón catalóg samhlacha áitiúil nó cianda gníomhach agus cumraigh an sprioc.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

Delegálann `configure` faoi láthair leis na h-oideas tástála do `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, `kilo`, agus `5dive`.
Ealaíon amháin,
MITM, agus catalóg ach treoir-fhollúnach fanann sreafaí `setup-*`/láimhe sainráite agus
nach dtugtar mar spriocanna in-ghlactha.

> Is é `setup-opencode` an comhtháthú **éadrom comhoiriúnach le openai** OpenCode.
> Tá comhtháthú breiseán saibhre ann freisin — `agentproxy setup opencode` — a
> shuiteálann `@agentproxy/opencode-plugin`. Tá siad ina gcomhandaí éagsúla; cláraíonn
> an tábla thuas `setup-opencode`.

## Úsáid áitiúil

Le AgentProxy ag rith ar `localhost:20128`, níl le déanamh ach an t-ordú socraithe do d'uirlis a rith. Faightear an catalóg ón bhfreastalaí áitiúil.

```bash
# Codex: scríobh próifíl do gach múnla meaitseáilte isteach i ~/.codex/
agentproxy setup-codex
codex --profile glm52            # úsáid próifíl ghinte

# Claude Code: scríobh próifílí in aghaidh an mhúnla, ansin seol ceann
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: scríobh an soláthraí atá comhoiriúnach le openai le gach múnla catalóige
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # tagairt trí {env:AGENTPROXY_API_KEY}, riamh ar dhiosca
opencode -m agentproxy/glm/glm-5.2 "..."

# Uirlisí gan fhionnachtain uathoibríoch: teastaíonn múnla sainráite:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Réamhamharc gan aon rud a scríobh:
agentproxy setup-continue --dry-run
```

Seol gan aon chumraíocht a scríobh ar chor ar bith (instealladh env amháin):

```bash
agentproxy launch                 # Claude Code → AgentProxy áitiúil
agentproxy launch-codex           # Codex CLI → AgentProxy áitiúil
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Conair ordaithe shainráite: cuir ar aghaidh gach rud a thagann i ndiaidh --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Úsáid chianda

Dírigh aon ordú socraithe ar AgentProxy cianda le `--remote` + `--api-key`. Faightear an catalóg ón bhfreastalaí cianda; scríobhtar an chumraíocht ar do mheaisín áitiúil.

```bash
# OpenCode i gcoinne VPS cianda, coinnigh ach na samhlacha glm/kimi
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # easpórtáil AGENTPROXY_API_KEY ar dtús

# Próifílí Codex ó chatalóg chianda
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Seol CLI díreach i gcoinne an fhreastalaí chianda
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

In ionad `--remote`/`--api-key` a chur ar aghaidh gach uair, logáil isteach uair amháin agus lig don **chomhthéacs ghníomhach** iad a sholáthar go huathoibríoch:

```bash
agentproxy connect 192.168.0.15        # cruthaíonn sé comhartha scóipe, stórálann sé an comhthéacs
agentproxy setup-codex                 # ← úsáideann sé an chatalóg chianda anois
agentproxy setup-opencode              # ← mar an gcéanna
agentproxy launch                      # ← Claude Code i gcoinne an chianda
```

Féach [Mód Cianda](./REMOTE-MODE.md) le haghaidh comhthéacsanna, scóip, agus bainistíocht comharthaí.

---

## 5dive cabhlaigh ghníomhairí

Ritheann [5dive](https://5dive.ai) cabhlach d'ghníomhairí códaithe fhadtéarmacha, gach ceann acu ina aonad systemd faoina úsáideoir Unix féin. Ní CLI códaithe é féin, mar sin níl aon rud le seoladh ag `agentproxy run` — is sprioc **chumraíocht-amháin** é `5dive`.

```bash
agentproxy configure 5dive --model failover-demo --yes
agentproxy setup-5dive --model failover-demo --auth-profile agentproxy --agent worker1
```

Scríobhann an dá fhoirm próifíl **údaraithe** 5dive amháin, agus labhraíonn gach suíochán `claude` atá ceangailte leis an bpróifíl sin le AgentProxy ansin. Tá trí rud ar leith faoin sprioc seo:

- **Ritheann sé ar óstach an chabhlaigh, mar root.** Gníomhaíonn briathra 5dive ar aonaid systemd áitiúla agus ar chomhadlann stáit atá faoi úinéireacht root; níl aon mhodh cianda ann. Déanann an t-oideas athfhorghníomhú trí `sudo` nuair nach bhfuil sé ina root cheana féin (múchann `--no-sudo` é sin agus priontálann sé an t-ordú ina ionad).

- **Caithfidh an críochphointe a bheith `https://` mura loopback é.** Iompraíonn eochair API an ghníomhaithe an URL sin ar gach iarratas, agus diúltaíonn 5dive do chríochphointe plaintext lasmuigh den bhosca. Ní eisceacht é seoladh LAN príobháideach.

- **Tá biorán múnla gach suíocháin féin níos airde ná an phróifíl.** Iompraíonn an phróifíl `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`, ach má bhíonn suíochán fós bioráilte le haitheantas múnla caighdeánach, teipeann ar a chéad sheal le _"Tá fadhb leis an múnla roghnaithe"_. Cuir `--agent <name>` (in-athdhéanta) ar aghaidh chun na suíocháin a bhioránú freisin; priontálann an t-oideas an t-ordú nuair nach ndéanann tú.

Tugtar an eochair API do 5dive ar **stdin** (`--api-key=-`), mar sin ní fheictear í riamh in aschur `ps`.

Is é an phróifíl a dhíriú ar **chomhcheangal** AgentProxy seachas ar mhúnla amháin a thugann failover don tsoláthraí cabhlaigh: nuair a chuaigh an críochphointe príomhúil go hiomlán as feidhm i lár seal sa rith a taifeadadh ar [#11578](https://github.com/khanhkit/AgentProxy/issues/11578), chríochnaigh an gníomhaire a chéimeanna eile ar an gcúlchiste agus níor nocht sé an t-easnamh riamh.

## Conraitmhíonna an Bhun-URL (cén uirlisí a bhfuil `/v1` de dhíth orthu)

Cuireann AgentProxy an dromchla OpenAI ar fáil ag `/v1`, an dromchla Anthropic ag an bhfréamh,
agus dromchla native Gemini ag `/v1beta`. Tá gach comhtháthú sáite leis an bhfoirm a bhfuil
a uirlis ag súil leis (fíoraithe sa fhoinse ordaithe):

| Comhtháthú                                                                 | URL Bunscríofa | `/v1`?                                             |
| -------------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| `setup-cline` (`openAiBaseUrl`)                                            | fréamh         | Níl — cuireann Cline `/v1/chat/completions` leis   |
| `setup-goose` (`OPENAI_HOST`)                                              | fréamh         | Níl — cuireann Goose an cosán leis                 |
| `setup-aider` (`OPENAI_API_BASE`)                                          | fréamh         | Níl — cuireann LiteLLM `/v1/chat/completions` leis |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | le `/v1`       | Tá                                                 |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | fréamh         | Níl — cuireann Claude Code `/v1/messages` leis     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | le `/v1`       | Tá                                                 |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | le `/v1`       | Tá                                                 |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | fréamh         | Níl — cuireann an SDK `/v1beta/models/…` leis      |
| `setup-5dive` (`ANTHROPIC_BASE_URL` sa phróifíl údaraithe)                 | fréamh         | Níl — cuireann Claude Code `/v1/messages` leis     |

---

## Caomhnú andreasghabháil native ag uasdátú: `--include=optional`

Nuair a uasdátaíonn tú le `agentproxy update` (tar éis deimhniú, nó le `--apply`),
rithfidh AgentProxy an tsuiteáil le `--include=optional` ionsáite:

```bash
npm install -g agentproxy@latest --include=optional
```

Ní **shuíomhán** é seo a chuirtear le `agentproxy update` — cuirtear i bhfeidhm i gcónaí é ag an
uasdálaí. Cinntíonn sé go maireann na `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, an chruinne LLMLingua SLM) an t-ualach uasdáta fiú má tá `omit=optional`
socraithe agat i do chumraíocht npm, a chuirfeadh an tiománaí native SQLite agus an
bhannaíochta eochairfhreimh an leabhair os comhair i bhfolús murach sin. Chun an
ordú cruinn a réamhamharc gan iarratas:

```bash
agentproxy update --dry-run
# [DRY RUN] Would run: npm install -g agentproxy@latest --include=optional
```

Suímh eile `agentproxy update` (fíoraithe sa fhoinse): `--check` (éalú 1 má tá sé
as dáta), `--apply` (suiteáil gan tarchur), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI trí `agentproxy run gemini`

Tá an conradh fíoraithe in aghaidh `@google/gemini-cli` 0.50.0: ní mór don CLI
`GOOGLE_GEMINI_BASE_URL` a urramú agus `POST /v1beta/models/<model>:generateContent`
(agus `:streamGenerateContent?alt=sse`) a eisiúint ina n-aghaidh — go díreach dromchla
native Gemini (`/v1beta`) AgentProxy. Cuirfidh `agentproxy run gemini` sin go huathoibríoch:

- `GOOGLE_GEMINI_BASE_URL` → URL bunscríofa gníomhach AgentProxy (fréamh, gan `/v1`);
- `GEMINI_API_KEY` → an cháincheapadh resolved AgentProxy (rogha/env/comhthéacs);
- **`GEMINI_CLI_HOME` sealadach aitheanta** a roghnaíonn `.gemini/settings.json`
  údaracht `gemini-api-key`, ionas nach ndéanfaidh seisiún stóráilte Google OAuth (Code Assist)
  uacht an seoladh a stiúradh ag AgentProxy — baintear é tar éis an éalaithe;
- **sláinteachas timpeallachta**: glanadh an timpeallachta leanbh de `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` agus `GOOGLE_GENAI_USE_GCA` (a dheadh an t-údaracht a
  atreorú go Vertex/Code Assist), agus cuirtear `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key`
  mar chúltaca Dearg agus Síoraí — faigheann cinn eile `run` an cóireáil chéanna
  do na athróga ceannasacha atá ag teacht salú le chéile;
- insteáil `--model <id>` ó `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Coinneoidh cosanta muiníne Gemini fós i modh ceanntaigh — pas `--skip-trust`
(dóibh féin nó muinín an chomhadlann go hiontaofa); ní chuireann an tsoláthraí é
as bealach go saibhir. Tá an tsoláthraí seo éagsúil leis an **clárú ACP**
(`src/lib/acp/registry.ts`, `gemini --acp`), a bhfuil fós mar chomhtháthú prótacal
gníomhaire don `dashboard/acp-agents`.

## Taiscéaladh ceo fíor (roghnach)

Rith athbhreithniú plean seolta dearbhúcháin i gCI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Chun bailíochtaí fíora a dhheimhniú i gcoinne
freastalaí AgentProxy fíora, tá tacaíocht roghnach ag
`tests/integration/upstream-cli-smoke.int.test.ts`. Ní rithfidh sé go huathoibríoch
riamh (théann gach fo-thástáil ar ceal mura bhfuil `RUN_CLI_SMOKE=1` ann), seolann sé an
teistiméireacht le hainm athróg timpeallachta (ní le luach), ceartaíonn sé teaghráin atá
cosúil le heochair ó aon aschur taifeadta, scipeann sé spriocanna nach bhfuil a
dheighilt (binary) suiteáilte, agus clasálfaidh sé teipanna mar
fíordheimhniú / upstream / cumraíocht seachas Booleán lom:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" Roghnach: cuireann `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` sri ar an taiscéaladh;
ROGHNAIGH `AGENTPROXY_SMOKE_TIMEOUT_MS` an t-am amach 120s in aghaidh na spriocanna.

---

## Féach freisin

- [Cumraíocht Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — an treoir níos doimhne do Claude Code
- [Cumraíocht Codex CLI](./CODEX-CLI-CONFIGURATION.md) — an chur ar bun bunúsach `[model_providers.agentproxy]` uair amháin
- [Mód Cianda](./REMOTE-MODE.md) — comhthéacsanna, comharthaí rochtana scóipeacha, ag tiomáint freastalaí cianda
- [Tagairt Uirlisí CLI](../reference/CLI-TOOLS.md) — an catalóg iomlán de na huirlisí tacaíochta + leathanaigh an deais
- [Treoir Suiteála](./SETUP_GUIDE.md) — modhanna suiteála agus onboarding an chéad rith
```
