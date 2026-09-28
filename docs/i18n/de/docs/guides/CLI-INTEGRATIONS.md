# CLI-INTEGRATIONS (Deutsch)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇾 [ms](../../../ms/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "CLI-Integrationen — jede Coding-CLI auf AgentProxy ausrichten"
version: 3.8.50
lastUpdated: 2026-08-18
---

# CLI-Integrationen

AgentProxy liefert eine Familie von `setup-*`-Befehlen, die eine Coding-CLI (Codex, Claude Code, OpenCode, Cline, …) so konfigurieren, dass sie AgentProxy als Backend verwendet — sodass das Tool mit **einem** Endpunkt kommuniziert und AgentProxy an den richtigen Anbieter weiterleitet mit automatischem Fallback. Jeder Befehl liest den **aktuellen** Modellkatalog von einem laufenden AgentProxy (lokal oder remote) und schreibt die eigene Konfigurationsdatei des Tools auf **deinem** Rechner. Der API-Schlüssel wird durch eine Umgebungsvariable referenziert, wo immer das Tool dies unterstützt. Befehle, die eine lokal umgebungsbezogene Datei des Tools speichern, sind unten aufgeführt.

Es gibt auch einen generischen Launcher — `agentproxy run <target>` — der `claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` oder `gemini` mit der richtigen Umgebung injiziert, ohne überhaupt eine Konfiguration zu schreiben. Ziele und deren Aliase stammen aus dem kanonischen Manifest `bin/cli/cli-manifest.mjs` (`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`, `open-code`, `qwen-code`, `gemini-cli`), und `agentproxy completion` bietet die gleichen manifest-abgeleiteten Zielwörter an. Die Legacy-Launcher pro Tool — `agentproxy launch` (Claude Code) und `agentproxy launch-codex` (Codex) — bleiben verfügbar.

Die Anbieter-Onboarding ist aus demselben lokalen/remote Kontext verfügbar. Die API-first-Befehle unten halten die Verwaltungsauthentifizierung von den Anbieteranmeldeinformationen getrennt und drucken niemals eine Anmeldeinformation in strukturiertem Output:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Für Skripte bevorzuge `--credential-stdin` oder `--credential-env`; `--credential` bleibt für kontrollierte lokale Nutzung erhalten. `providers remove` erfordert `--yes` in einem nicht-interaktiven Terminal, und alle fünf Befehle respektieren den aktiven Kontext oder die globalen `--base-url`/`--api-key`-Optionen.

Für die einmalige, handgeschriebene Basiseinrichtung der beiden umfangreichsten Integrationen siehe die tiefgehenden Analysen pro Tool:

- [Claude Code-Konfiguration](./CLAUDE-CODE-CONFIGURATION.md)
- [Codex CLI-Konfiguration](./CODEX-CLI-CONFIGURATION.md)
- [Remote-Modus](./REMOTE-MODE.md) — steuere ein entferntes AgentProxy (VPS / Tailnet) von deinem Laptop aus
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — die OmniCopilot-Erweiterung; sie kann auch diese `setup-*`-Befehle für dich innerhalb des Editors ausführen

---

## Mastertabelle

Jeder Befehl respektiert den **aktiven Kontext** (gesetzt mit `agentproxy connect`, siehe [Remote-Modus](./REMOTE-MODE.md)) oder explizite `--remote <url> --api-key <key>`-Flags. "Lokal vs. remote" bedeutet unten: ohne Flags zielt es auf `http://localhost:20128`; mit `--remote` (oder einem aktiven Remote-Kontext) wird der Katalog von diesem Server abgerufen und die Konfiguration lokal geschrieben.

| Befehl                     | Tool                          | Was es schreibt                                                                                                                                                                  | Schlüssel-Flags                                                                                                                            | Lokal vs. remote |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI              | `~/.codex/<name>.config.toml` — ein Profil pro kompatiblem Textmodell (`codex --profile <name>`)                                                                                 | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Beide            |
| `agentproxy setup-claude`   | Claude Code                   | `~/.claude/profiles/<name>/settings.json` — ein Profil pro übereinstimmendem Modell (`CLAUDE_CONFIG_DIR`)                                                                        | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Beide            |
| `agentproxy setup-opencode` | OpenCode (openai-kompatibel)  | `~/.config/opencode/opencode.json` — `agentproxy`-Anbieter mit jedem Katalogmodell (`opencode -m agentproxy/<model>`)                                                              | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Beide            |
| `agentproxy setup-cline`    | Cline                         | `~/.cline/data/{globalState,secrets}.json` (CLI-Modus) + druckt VS Code-Erweiterungseinstellungen                                                                                | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Beide            |
| `agentproxy setup-kilo`     | Kilo Code                     | `~/.local/share/kilo/auth.json` (CLI) + fügt `kilocode.*` in die VS Code `settings.json` ein, falls vorhanden                                                                    | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Beide            |
| `agentproxy setup-continue` | Continue / `cn` CLI           | `~/.continue/config.yaml` — `provider: openai` Modelle, Schlüssel über `${{ secrets.AGENTPROXY_API_KEY }}`                                                                        | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Beide            |
| `agentproxy setup-cursor`   | Cursor                        | Nichts — druckt die Schritte in der App (Cursor-Konfiguration ist undurchsichtiges SQLite)                                                                                       | `--remote` `--api-key` `--only` `--port`                                                                                                   | Beide            |
| `agentproxy setup-roo`      | Roo Code                      | `~/.agentproxy/roo-settings.json` (Importdokument) + setzt `roo-cline.autoImportSettingsPath`, falls eine VS Code `settings.json` existiert                                       | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Beide            |
| `agentproxy setup-crush`    | Crush                         | `~/.config/crush/crush.json` — `openai-kompatibler` Anbieter, Schlüssel über `$AGENTPROXY_API_KEY`                                                                                | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Beide            |
| `agentproxy setup-goose`    | Goose                         | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + druckt Umgebungsrezept                                                                            | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Beide            |
| `agentproxy setup-aider`    | Aider                         | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + druckt Umgebungsrezept                                                                                          | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Beide            |
| `agentproxy setup-qwen`     | Qwen Code                     | `~/.qwen/settings.json` — V4 `modelProviders.openai`-Array + `AGENTPROXY_API_KEY` in `~/.qwen/.env`                                                                               | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Beide            |
| `agentproxy run <target>`   | Laufzeit-Launcher (generisch) | Nichts — startet `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` mit der richtigen Umgebung und Argumenten; Qwen und Gemini verwenden ein temporäres isoliertes Home | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Beide            |
| `agentproxy launch`         | Claude Code                   | Nichts — startet `claude` mit `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` injiziert                                                                                              | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Beide            |
| `agentproxy launch-codex`   | OpenAI Codex CLI              | Nichts — startet `codex` mit dem `agentproxy`-Anbieter, der über `-c`-Flags injiziert wird                                                                                        | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Beide            |

Hinweise zu den Flags (verifiziert im Befehlsquellcode):

- `--remote <url>` — ruft den Katalog von einem entfernten AgentProxy ab (überschreibt `--port` und den aktiven Kontext). `--api-key <key>` liefert die Anmeldeinformation für diesen Server (standardmäßig auf die Umgebungsvariable `AGENTPROXY_API_KEY` oder das Token des aktiven Kontexts gesetzt).
- `--only <patterns>` — durch Kommas getrennte Teilstrings; behält nur Modell-IDs, die übereinstimmen (z. B. `--only glm,kimi`). Verfügbar bei `setup-codex`, `setup-claude`, `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — druckt genau das, was geschrieben werden würde, ohne das Dateisystem zu berühren. Verfügbar bei jedem `setup-*`-Befehl **außer** `setup-cursor` (das niemals eine Datei schreibt).
- `--model <id>` — erforderlich (oder interaktiv ausgewählt) für die Tools, die keine Modell-Autoentdeckung haben: Cline, Kilo, Roo, Goose, Qwen, Aider. Diese Tools akzeptieren auch `--yes` für nicht-interaktive Ausführungen (was dann `--model` erfordert). `setup-opencode` benötigt `--model`, um das standardmäßige oberste Modell festzulegen.
- `--model <id>` bei `agentproxy run` folgt der pro-Ziel-Verkabelung des Manifests (`bin/cli/cli-manifest.mjs`): **aider** erhält `--model openai/<id>` und **opencode** `--model agentproxy/<id>` (das Präfix wird nur hinzugefügt, wenn die ID es nicht bereits trägt); **qwen** und **gemini** erhalten die ID unverändert; **claude** erhält sie über `ANTHROPIC_MODEL`, **goose** über `GOOSE_MODEL`, und **codex** über `-c model_providers.agentproxy.*`-Argumente. **Qwen ist das einzige Laufziel, das zwingend `--model` erfordert** — `agentproxy run qwen` ohne es beendet mit `2` und einem expliziten Fehler.
- `--port <port>` — lokaler AgentProxy-Port (Standard `20128`, ignoriert, wenn `--remote` gesetzt ist). Vorhanden bei allen `setup-*` und beiden Launchern.
- `agentproxy run` Rückgabecodes: Der eigene Rückgabecode der untergeordneten CLI wird unverändert weitergegeben; `2` = ungültige Argumente (nicht unterstütztes Ziel, fehlendes erforderliches `--model`, Container-Schutz); `127` = die Zielbinary ist nicht im `PATH`; `130`/`143`/`129`, wenn der Start durch `SIGINT`/`SIGTERM`/`SIGHUP` beendet wird; `1` = andere Laufzeitstartfehler.
- Die beiden Launcher (`launch`, `launch-codex`) akzeptieren `--profile <name>`, um ein von `setup-claude` / `setup-codex` geschriebenes Profil auszuwählen, plus Durchlauf-Argumente für die zugrunde liegende `claude` / `codex`-Binary.

Der interaktive Picker wird auch von den Setup-Rezepten geteilt:

```bash
# Wähle aus dem aktiven lokalen oder entfernten Modellkatalog und konfiguriere das Ziel.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` delegiert derzeit an die getesteten Rezepte für `codex`, `claude`, `opencode`, `qwen`, `aider`, `goose`, `cline`, `continue` und `kilo`. IDE-only, MITM und guide-only Katalogeinträge bleiben explizite `setup-*`/manuelle Abläufe und werden nicht als startbare Ziele präsentiert.

> `setup-opencode` ist die **leichte openai-kompatible** OpenCode-Integration.
> Es gibt auch eine umfangreichere Plugin-Integration — `agentproxy setup opencode` — die `@agentproxy/opencode-plugin` installiert. Es sind verschiedene Befehle; die obige Tabelle dokumentiert `setup-opencode`.

---

## Lokale Nutzung

Mit AgentProxy, das auf `localhost:20128` läuft, führen Sie einfach den Setup-Befehl für Ihr Tool aus. Der Katalog wird vom lokalen Server abgerufen.

```bash
# Codex: schreibe ein Profil pro übereinstimmendem Modell in ~/.codex/
agentproxy setup-codex
codex --profile glm52            # verwende ein generiertes Profil

# Claude Code: schreibe pro Modell Profile und starte dann eines
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: schreibe den openai-kompatiblen Anbieter mit allen Katalogmodellen
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # verwiesen über {env:AGENTPROXY_API_KEY}, niemals auf der Festplatte
opencode -m agentproxy/glm/glm-5.2 "..."

# Tools ohne automatische Erkennung benötigen ein explizites Modell:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Vorschau ohne irgendetwas zu schreiben:
agentproxy setup-continue --dry-run
```

Starten Sie ohne jegliche Konfiguration zu schreiben (nur Umgebungsinjektion):

```bash
agentproxy launch                 # Claude Code → lokales AgentProxy
agentproxy launch-codex           # Codex CLI → lokales AgentProxy
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "antwort OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "antwort OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "antwort OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "antwort OK"

# Expliziter Befehls-Pfad: alles, was nach -- kommt, wird durchgereicht
agentproxy run claude -- --print-system-prompt "überprüfe diesen Unterschied"
```

---

## Remote-Nutzung

Richten Sie jeden Setup-Befehl auf ein entferntes AgentProxy mit `--remote` + `--api-key` aus. Der Katalog wird von der Ferne abgerufen; die Konfiguration wird auf Ihrem lokalen Computer geschrieben.

```bash
# OpenCode gegen einen entfernten VPS, nur glm/kimi Modelle behalten
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # exportiere AGENTPROXY_API_KEY zuerst

# Codex-Profile aus einem entfernten Katalog
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Starte eine CLI direkt gegen die Ferne
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Anstatt `--remote`/`--api-key` jedes Mal zu übergeben, melden Sie sich einmal an und lassen Sie den **aktiven Kontext** sie automatisch bereitstellen:

```bash
agentproxy connect 192.168.0.15        # erstellt ein eingeschränktes Token, speichert den Kontext
agentproxy setup-codex                 # ← verwendet jetzt den entfernten Katalog
agentproxy setup-opencode              # ← dasselbe
agentproxy launch                      # ← Claude Code gegen die Ferne
```

Siehe [Remote-Modus](./REMOTE-MODE.md) für Kontexte, Bereiche und Token-Management.

---

## Basis-URL-Konventionen (welche Tools `/v1` wollen)

AgentProxy stellt die OpenAI-Oberfläche unter `/v1` zur Verfügung, die Anthropic-Oberfläche an der Wurzel und eine native Gemini-Oberfläche unter `/v1beta`. Jede Integration ist an die Form angeschlossen, die ihr Tool erwartet (verifiziert in der Befehlsquelle):

| Integration                                                                | Basis-URL geschrieben | `/v1`?                                           |
| -------------------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| `setup-cline` (`openAiBaseUrl`)                                            | Wurzel                | Nein — Cline fügt `/v1/chat/completions` hinzu   |
| `setup-goose` (`OPENAI_HOST`)                                              | Wurzel                | Nein — Goose fügt den Pfad hinzu                 |
| `setup-aider` (`OPENAI_API_BASE`)                                          | Wurzel                | Nein — LiteLLM fügt `/v1/chat/completions` hinzu |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | mit `/v1`             | Ja                                               |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | Wurzel                | Nein — Claude Code fügt `/v1/messages` hinzu     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | mit `/v1`             | Ja                                               |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | mit `/v1`             | Ja                                               |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | Wurzel                | Nein — das SDK fügt `/v1beta/models/…` hinzu     |

---

## Native Abhängigkeiten bei Updates beibehalten: `--include=optional`

Wenn Sie mit `agentproxy update` aktualisieren (nach Bestätigung oder mit `--apply`),
führt AgentProxy die Installation mit `--include=optional` aus:

```bash
npm install -g agentproxy@latest --include=optional
```

Dies ist **kein** Flag, das Sie an `agentproxy update` übergeben — es wird immer vom
Updater angewendet. Es garantiert, dass die `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, der LLMLingua SLM-Stack) das Update überstehen, selbst wenn Ihre npm-Konfiguration
`omit=optional` gesetzt hat, was andernfalls den nativen SQLite-Treiber und die OS-Keyring-Bindung
stillschweigend entfernen würde. Um den genauen Befehl ohne Anwendung anzuzeigen:

```bash
agentproxy update --dry-run
# [DRY RUN] Würde ausgeführt: npm install -g agentproxy@latest --include=optional
```

Andere `agentproxy update`-Flags (verifiziert im Quellcode): `--check` (beendet mit 1, wenn
veraltet), `--apply` (installiert ohne Aufforderung), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI über `agentproxy run gemini`

Vertrag verifiziert gegen `@google/gemini-cli` 0.50.0: die CLI respektiert
`GOOGLE_GEMINI_BASE_URL` und gibt `POST /v1beta/models/<model>:generateContent`
(und `:streamGenerateContent?alt=sse`) dagegen aus — genau wie die native
Gemini-Oberfläche von AgentProxy (`/v1beta`). `agentproxy run gemini` verbindet das automatisch:

- `GOOGLE_GEMINI_BASE_URL` → die aktive AgentProxy-Basis-URL (Wurzel, kein `/v1`);
- `GEMINI_API_KEY` → die aufgelöste AgentProxy-Anmeldeinformation (Option/Umgebung/Kontext);
- ein **temporäres isoliertes `GEMINI_CLI_HOME`**, dessen `.gemini/settings.json`
  die Authentifizierung `gemini-api-key` auswählt, sodass eine gespeicherte Google OAuth-Sitzung (Code Assist)
  niemals den AgentProxy-gesteuerten Start überschreibt — nach dem Verlassen entfernt;
- **Umgebungs-Hygiene**: die Kind-Umgebung wird von `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` und `GOOGLE_GENAI_USE_GCA` bereinigt (die die
  Authentifizierung an Vertex/Code Assist umleiten würden), und `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` wird
  als Sicherheitsnetz gesetzt — die anderen `run`-Ziele erhalten die gleiche
  Behandlung für ihre eigenen widersprüchlichen Variablen;
- `--model <id>`-Einspritzung von `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Der Workspace-Vertrauensschutz von Gemini gilt weiterhin im Headless-Modus — übergeben Sie
`--skip-trust` (oder vertrauen Sie dem Verzeichnis interaktiv) selbst; der Launcher
umgeht dies absichtlich nicht. Dieser Launcher ist von der **ACP-Registrierung**
(`src/lib/acp/registry.ts`, `gemini --acp`) zu unterscheiden, die die
Agenten-Protokoll-Integration für `/dashboard/acp-agents` bleibt.

---

## Echter Smoke-Test (Opt-in)

Deterministische Launch-Plan-Regressionsläufe in CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Um die REALEN Binärdateien gegen einen REALEN
AgentProxy-Server zu validieren, gibt es ein Opt-in-Harness unter
`tests/integration/upstream-cli-smoke.int.test.ts`. Es wird niemals automatisch ausgeführt
(jeder Untertest wird übersprungen, es sei denn, `RUN_CLI_SMOKE=1`), übergibt die Anmeldeinformationen
über die Umgebungsvariable NAME (niemals durch Wert), redigiert schlüsselähnliche Zeichenfolgen
aus allen aufgezeichneten Ausgaben, überspringt Ziele, deren Binärdatei nicht installiert ist,
und klassifiziert Fehler als auth / upstream / config anstelle eines einfachen Booleans:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Optional: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` beschränkt den Test;
`AGENTPROXY_SMOKE_TIMEOUT_MS` überschreibt das Timeout von 120s pro Ziel.

---

## Siehe auch

- [Claude Code-Konfiguration](./CLAUDE-CODE-CONFIGURATION.md) — der tiefere Claude Code-Leitfaden
- [Codex CLI-Konfiguration](./CODEX-CLI-CONFIGURATION.md) — die einmalige `[model_providers.agentproxy]` Basiseinrichtung
- [Remote-Modus](./REMOTE-MODE.md) — Kontexte, eingeschränkte Zugriffstoken, einen Remote-Server steuern
- [CLI-Tools-Referenz](../reference/CLI-TOOLS.md) — der vollständige Katalog unterstützter Tools + Dashboard-Seiten
- [Einrichtungsanleitung](./SETUP_GUIDE.md) — Installationsmethoden und Onboarding beim ersten Start
