# CLI-INTEGRATIONS (Bahasa Melayu)

🌐 **Languages:** 🇺🇸 [English](../../../../guides/CLI-INTEGRATIONS.md) · 🇸🇦 [ar](../../../ar/docs/guides/CLI-INTEGRATIONS.md) · 🇦🇿 [az](../../../az/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇬 [bg](../../../bg/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇩 [bn](../../../bn/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇿 [cs](../../../cs/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇰 [da](../../../da/docs/guides/CLI-INTEGRATIONS.md) · 🇩🇪 [de](../../../de/docs/guides/CLI-INTEGRATIONS.md) · 🇬🇷 [el](../../../el/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇸 [es](../../../es/docs/guides/CLI-INTEGRATIONS.md) · 🇪🇪 [et](../../../et/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇷 [fa](../../../fa/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇮 [fi](../../../fi/docs/guides/CLI-INTEGRATIONS.md) · 🇫🇷 [fr](../../../fr/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇪 [ga](../../../ga/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [gu](../../../gu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇱 [he](../../../he/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [hi](../../../hi/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇷 [hr](../../../hr/docs/guides/CLI-INTEGRATIONS.md) · 🇭🇺 [hu](../../../hu/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇩 [id](../../../id/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇹 [it](../../../it/docs/guides/CLI-INTEGRATIONS.md) · 🇯🇵 [ja](../../../ja/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇷 [ko](../../../ko/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇹 [lt](../../../lt/docs/guides/CLI-INTEGRATIONS.md) · 🇱🇻 [lv](../../../lv/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [mr](../../../mr/docs/guides/CLI-INTEGRATIONS.md) · 🇲🇹 [mt](../../../mt/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇱 [nl](../../../nl/docs/guides/CLI-INTEGRATIONS.md) · 🇳🇴 [no](../../../no/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇭 [phi](../../../phi/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇱 [pl](../../../pl/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇹 [pt](../../../pt/docs/guides/CLI-INTEGRATIONS.md) · 🇧🇷 [pt-BR](../../../pt-BR/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇴 [ro](../../../ro/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇺 [ru](../../../ru/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇰 [sk](../../../sk/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇮 [sl](../../../sl/docs/guides/CLI-INTEGRATIONS.md) · 🇷🇸 [sr](../../../sr/docs/guides/CLI-INTEGRATIONS.md) · 🇸🇪 [sv](../../../sv/docs/guides/CLI-INTEGRATIONS.md) · 🇰🇪 [sw](../../../sw/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [ta](../../../ta/docs/guides/CLI-INTEGRATIONS.md) · 🇮🇳 [te](../../../te/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇭 [th](../../../th/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇷 [tr](../../../tr/docs/guides/CLI-INTEGRATIONS.md) · 🇺🇦 [uk-UA](../../../uk-UA/docs/guides/CLI-INTEGRATIONS.md) · 🇵🇰 [ur](../../../ur/docs/guides/CLI-INTEGRATIONS.md) · 🇻🇳 [vi](../../../vi/docs/guides/CLI-INTEGRATIONS.md) · 🇨🇳 [zh-CN](../../../zh-CN/docs/guides/CLI-INTEGRATIONS.md) · 🇹🇼 [zh-TW](../../../zh-TW/docs/guides/CLI-INTEGRATIONS.md)

---

---

title: "Integrasi CLI — arahkan mana-mana CLI pengkodan ke AgentProxy"
version: 3.8.50
lastUpdated: 2026-08-18
---

# Integrasi CLI

AgentProxy menyediakan sekumpulan perintah `setup-*` yang mengkonfigurasi CLI pengkodan
(Codex, Claude Code, OpenCode, Cline, …) untuk menggunakan AgentProxy sebagai backend-nya — jadi
alat ini berkomunikasi dengan **satu** titik akhir dan AgentProxy mengarahkan ke penyedia yang tepat dengan
auto-fallback. Setiap perintah membaca katalog model **langsung** dari AgentProxy yang sedang berjalan
(lokal atau jauh) dan menulis fail konfigurasi alat itu sendiri di **komputer anda**. Kunci API dirujuk oleh pembolehubah persekitaran di mana sahaja alat itu menyokongnya. Perintah yang mengekalkan fail persekitaran tempatan alat dicatat di bawah.

Terdapat juga pelancar generik — `agentproxy run <target>` — yang melancarkan
`claude`, `codex`, `aider`, `goose`, `opencode`, `qwen` atau `gemini` dengan
persekitaran yang betul disuntik, tanpa menulis sebarang konfigurasi. Sasaran dan aliasnya datang dari manifest kanonik `bin/cli/cli-manifest.mjs`
(`claude-code|cc|anthropic`, `codex-cli|openai-codex|openai`, `goose-cli`,
`open-code`, `qwen-code`, `gemini-cli`), dan `agentproxy completion` menawarkan
kata sasaran yang sama yang diperoleh dari manifest. Pelancar per-alat yang lama —
`agentproxy launch` (Claude Code) dan `agentproxy launch-codex` (Codex) — masih
tersedia.

Pendaftaran penyedia tersedia dari konteks lokal/jauh yang sama. Perintah
API-first di bawah mengekalkan pengesahan pengurusan terpisah dari kelayakan penyedia
dan tidak pernah mencetak kelayakan dalam output terstruktur:

```bash
agentproxy providers add glm --credential-env GLM_API_KEY --name work
agentproxy providers import ./providers.json --dry-run --json
agentproxy providers auth openai
agentproxy providers edit <connection-id> --default-model glm/glm-5.2
agentproxy providers remove <connection-id> --yes
```

Untuk skrip, lebih baik menggunakan `--credential-stdin` atau `--credential-env`; `--credential`
dikekalkan untuk penggunaan lokal yang terkawal. `providers remove` memerlukan `--yes` pada terminal
non-interaktif, dan semua lima perintah menghormati konteks aktif atau pilihan global `--base-url`/`--api-key`.

Untuk penyediaan asas yang ditulis tangan sekali sahaja bagi dua integrasi terkaya, lihat
penyelaman mendalam per-alat:

- [Konfigurasi Claude Code](./CLAUDE-CODE-CONFIGURATION.md)
- [Konfigurasi Codex CLI](./CODEX-CLI-CONFIGURATION.md)
- [Mod Jauh](./REMOTE-MODE.md) — mengendalikan AgentProxy jauh (VPS / Tailnet) dari komputer riba anda
- [VS Code Copilot Chat](./VSCODE-COPILOT.md) — sambungan OmniCopilot; ia juga boleh menjalankan
  perintah `setup-*` ini untuk anda dari dalam editor

---

## Jadual Utama

Setiap perintah menghormati **konteks aktif** (ditetapkan dengan `agentproxy connect`, lihat
[Mod Jauh](./REMOTE-MODE.md)) atau bendera eksplisit `--remote <url> --api-key <key>`.
"Tempatan vs jauh" di bawah bermaksud: tanpa bendera ia menyasarkan `http://localhost:20128`;
dengan `--remote` (atau konteks jauh yang aktif) ia mengambil katalog dari pelayan itu
dan menulis konfigurasi secara lokal.

| Perintah                   | Alat                            | Apa yang ditulis                                                                                                                                                                  | Bendera utama                                                                                                                              | Tempatan vs jauh |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `agentproxy setup-codex`    | OpenAI Codex CLI                | `~/.codex/<name>.config.toml` — satu profil bagi setiap model teks yang serasi (`codex --profile <name>`)                                                                         | `--remote` `--api-key` `--only` `--dry-run` `--port` `--codex-home`                                                                        | Kedua            |
| `agentproxy setup-claude`   | Claude Code                     | `~/.claude/profiles/<name>/settings.json` — satu profil bagi setiap model yang sepadan (`CLAUDE_CONFIG_DIR`)                                                                      | `--remote` `--api-key` `--only` `--dry-run` `--port` `--claude-home`                                                                       | Kedua            |
| `agentproxy setup-opencode` | OpenCode (serasi dengan openai) | `~/.config/opencode/opencode.json` — penyedia `agentproxy` dengan setiap model katalog (`opencode -m agentproxy/<model>`)                                                           | `--remote` `--api-key` `--only` `--model` `--dry-run` `--port`                                                                             | Kedua            |
| `agentproxy setup-cline`    | Cline                           | `~/.cline/data/{globalState,secrets}.json` (mod CLI) + mencetak tetapan sambungan VS Code                                                                                         | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--cline-dir`                                                                | Kedua            |
| `agentproxy setup-kilo`     | Kilo Code                       | `~/.local/share/kilo/auth.json` (CLI) + menggabungkan `kilocode.*` ke dalam `settings.json` VS Code jika ada                                                                      | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--auth-path` `--vscode-settings`                                            | Kedua            |
| `agentproxy setup-continue` | Continue / `cn` CLI             | `~/.continue/config.yaml` — model `provider: openai`, kunci melalui `${{ secrets.AGENTPROXY_API_KEY }}`                                                                            | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Kedua            |
| `agentproxy setup-cursor`   | Cursor                          | Tiada — mencetak langkah dalam aplikasi (konfigurasi Cursor adalah SQLite yang tidak telus)                                                                                       | `--remote` `--api-key` `--only` `--port`                                                                                                   | Kedua            |
| `agentproxy setup-roo`      | Roo Code                        | `~/.agentproxy/roo-settings.json` (dok import) + menetapkan `roo-cline.autoImportSettingsPath` jika `settings.json` VS Code wujud                                                  | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--import-path` `--vscode-settings`                                          | Kedua            |
| `agentproxy setup-crush`    | Crush                           | `~/.config/crush/crush.json` — penyedia `openai-compat`, kunci melalui `$AGENTPROXY_API_KEY`                                                                                       | `--remote` `--api-key` `--only` `--dry-run` `--port` `--config-path`                                                                       | Kedua            |
| `agentproxy setup-goose`    | Goose                           | `~/.config/goose/config.yaml` (`GOOSE_PROVIDER`/`OPENAI_HOST`/`GOOSE_MODEL`) + mencetak resipi env                                                                                | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Kedua            |
| `agentproxy setup-aider`    | Aider                           | `~/.aider.conf.yml` (`openai-api-base` + `model: openai/<id>`) + mencetak resipi env                                                                                              | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path`                                                              | Kedua            |
| `agentproxy setup-qwen`     | Qwen Code                       | `~/.qwen/settings.json` — array `modelProviders.openai` V4 + `AGENTPROXY_API_KEY` dalam `~/.qwen/.env`                                                                             | `--remote` `--api-key` `--model` `--yes` `--dry-run` `--port` `--config-path` `--env-path`                                                 | Kedua            |
| `agentproxy run <target>`   | Pelancaran runtime (generik)    | Tiada — melancarkan `claude`/`codex`/`aider`/`goose`/`opencode`/`qwen`/`gemini` dengan persekitaran dan argumen yang betul; Qwen dan Gemini menggunakan rumah terpencil sementara | `--remote` `--base-url` `--context` `--provider` `--model` `--api-key` `--api-key-env` `--dry-run` `--json` `--port` `--profile` `--token` | Kedua            |
| `agentproxy launch`         | Claude Code                     | Tiada — melancarkan `claude` dengan `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` disuntik                                                                                          | `--remote` `--api-key` `--token` `--profile` `--port`                                                                                      | Kedua            |
| `agentproxy launch-codex`   | OpenAI Codex CLI                | Tiada — melancarkan `codex` dengan penyedia `agentproxy` disuntik melalui bendera `-c`                                                                                             | `--remote` `--api-key` `--profile` (`-p`) `--port`                                                                                         | Kedua            |

Nota mengenai bendera (disahkan dalam sumber perintah):

- `--remote <url>` — mengambil katalog dari AgentProxy jauh (menimpa `--port`
  dan konteks aktif). `--api-key <key>` membekalkan kelayakan untuk pelayan itu
  (secara default kepada pembolehubah persekitaran `AGENTPROXY_API_KEY`, atau token konteks aktif).
- `--only <patterns>` — substring yang dipisahkan dengan koma; hanya simpan ID model yang sepadan
  (contohnya `--only glm,kimi`). Tersedia pada `setup-codex`, `setup-claude`,
  `setup-opencode`, `setup-continue`, `setup-cursor`, `setup-crush`.
- `--dry-run` — mencetak dengan tepat apa yang akan ditulis tanpa menyentuh
  sistem fail. Tersedia pada setiap perintah `setup-*` **kecuali** `setup-cursor`
  (yang tidak pernah menulis fail).
- `--model <id>` — diperlukan (atau dipilih secara interaktif) untuk alat yang tidak mempunyai
  penemuan model automatik: Cline, Kilo, Roo, Goose, Qwen, Aider. Alat-alat tersebut
  juga menerima `--yes` untuk larian non-interaktif (yang kemudian memerlukan `--model`).
  `setup-opencode` mengambil `--model` untuk menetapkan model teratas lalai.
- `--model <id>` pada `agentproxy run` mengikuti pengkabelan per-sasaran manifest
  (`bin/cli/cli-manifest.mjs`): **aider** menerima `--model openai/<id>` dan
  **opencode** `--model agentproxy/<id>` (awalan hanya ditambah apabila id
  tidak sudah membawanya); **qwen** dan **gemini** menerima id secara langsung;
  **claude** mendapatkannya melalui `ANTHROPIC_MODEL`, **goose** melalui `GOOSE_MODEL`, dan
  **codex** melalui argumen `-c model_providers.agentproxy.*`. **Qwen adalah satu-satunya sasaran run
  yang memerlukan `--model`** — `agentproxy run qwen` tanpa itu keluar
  `2` dengan ralat eksplisit.
- `--port <port>` — port AgentProxy lokal (default `20128`, diabaikan apabila `--remote`
  ditetapkan). Terdapat pada semua `setup-*` dan kedua-dua pelancar.
- Kod keluar `agentproxy run`: kod keluar CLI anak disebarkan
  secara langsung; `2` = argumen tidak sah (sasaran tidak disokong, `--model` yang diperlukan hilang, pengawal kontena); `127` = binari sasaran tidak ada dalam `PATH`;
  `130`/`143`/`129` apabila pelancaran dihentikan oleh `SIGINT`/`SIGTERM`/`SIGHUP`;
  `1` = kegagalan pelancaran runtime yang lain.
- Kedua-dua pelancar (`launch`, `launch-codex`) menerima `--profile <name>` untuk memilih
  profil yang ditulis oleh `setup-claude` / `setup-codex`, serta argumen pass-through untuk
  binari `claude` / `codex` yang mendasari.

Pemilih interaktif juga dikongsi oleh resipi penyediaan:

```bash
# Pilih dari katalog model lokal atau jauh yang aktif dan konfigurasikan sasaran.
agentproxy configure claude
agentproxy configure opencode --provider glm
agentproxy configure qwen --model qwen/qwen3.8-max-preview --yes
```

`configure` kini menyerahkan kepada resipi yang diuji untuk `codex`, `claude`,
`opencode`, `qwen`, `aider`, `goose`, `cline`, `continue`, dan `kilo`. Entri katalog yang hanya untuk IDE,
MITM, dan panduan kekal sebagai aliran `setup-*`/manual yang jelas dan
tidak dipersembahkan sebagai sasaran yang boleh dilancarkan.

> `setup-opencode` adalah integrasi OpenCode yang **ringan dan serasi dengan openai**.
> Terdapat juga integrasi plugin yang lebih kaya — `agentproxy setup opencode` — yang
> memasang `@agentproxy/opencode-plugin`. Mereka adalah perintah yang berbeza; jadual
> di atas mendokumentasikan `setup-opencode`.

---

## Penggunaan tempatan

Dengan AgentProxy berjalan di `localhost:20128`, hanya jalankan arahan persediaan untuk alat anda. Katalog diambil dari pelayan tempatan.

```bash
# Codex: tulis profil bagi setiap model yang sepadan ke ~/.codex/
agentproxy setup-codex
codex --profile glm52            # gunakan profil yang dihasilkan

# Claude Code: tulis profil bagi setiap model, kemudian lancarkan satu
agentproxy setup-claude
agentproxy launch --profile glm52

# OpenCode: tulis penyedia yang serasi dengan openai dengan semua model katalog
agentproxy setup-opencode
export AGENTPROXY_API_KEY=sk-...  # dirujuk melalui {env:AGENTPROXY_API_KEY}, tidak pernah di cakera
opencode -m agentproxy/glm/glm-5.2 "..."

# Alat tanpa penemuan automatik memerlukan model yang jelas:
agentproxy setup-aider --model glm/glm-5.2
agentproxy setup-qwen --model qwen/qwen3.8-max-preview

# Pratonton tanpa menulis apa-apa:
agentproxy setup-continue --dry-run
```

Lancarkan tanpa menulis sebarang konfigurasi (hanya suntikan env):

```bash
agentproxy launch                 # Claude Code → AgentProxy tempatan
agentproxy launch-codex           # Codex CLI → AgentProxy tempatan
agentproxy launch-codex --profile glm52
agentproxy run claude --model openai/gpt-5.4
agentproxy run codex --model openai/gpt-5.4 --dry-run --json
agentproxy run aider --model glm/glm-5.2 -- --message "reply OK"
agentproxy run goose --model glm/glm-5.2
agentproxy run opencode --model glm/glm-5.2 -- run "reply OK"
agentproxy run qwen --model glm/glm-5.2 -- -p "reply OK"
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "reply OK"

# Laluan arahan yang jelas: lalui apa sahaja yang datang selepas --
agentproxy run claude -- --print-system-prompt "review this diff"
```

---

## Penggunaan jauh

Arahkan mana-mana arahan persediaan ke AgentProxy jauh dengan `--remote` + `--api-key`. Katalog diambil dari jauh; konfigurasi ditulis di mesin tempatan anda.

```bash
# OpenCode terhadap VPS jauh, simpan hanya model glm/kimi
agentproxy setup-opencode --remote http://192.168.0.15:20128 --api-key oma_live_xxx \
  --only glm,kimi
opencode -m agentproxy/glm/glm-5.2 "..."   # eksport AGENTPROXY_API_KEY terlebih dahulu

# Profil Codex dari katalog jauh
agentproxy setup-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx

# Lancarkan CLI terus terhadap jauh
agentproxy launch       --remote http://192.168.0.15:20128 --api-key oma_live_xxx
agentproxy launch-codex --remote http://192.168.0.15:20128 --api-key oma_live_xxx
```

Daripada menghantar `--remote`/`--api-key` setiap kali, log masuk sekali dan biarkan
**konteks aktif** membekalkannya secara automatik:

```bash
agentproxy connect 192.168.0.15        # mencipta token terhad, menyimpan konteks
agentproxy setup-codex                 # ← kini menggunakan katalog jauh
agentproxy setup-opencode              # ← sama
agentproxy launch                      # ← Claude Code terhadap jauh
```

Lihat [Mod Jauh](./REMOTE-MODE.md) untuk konteks, skop, dan pengurusan token.

---

## Konvensyen URL Asas (alat yang memerlukan `/v1`)

AgentProxy mendedahkan permukaan OpenAI di `/v1`, permukaan Anthropic di akar,
dan permukaan Gemini asli di `/v1beta`. Setiap integrasi disambungkan kepada bentuk yang
diharapkan oleh alatnya (disahkan dalam sumber arahan):

| Integrasi                                                                  | URL Asas yang ditulis | `/v1`?                                          |
| -------------------------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| `setup-cline` (`openAiBaseUrl`)                                            | akar                  | Tidak — Cline menambah `/v1/chat/completions`   |
| `setup-goose` (`OPENAI_HOST`)                                              | akar                  | Tidak — Goose menambah laluan                   |
| `setup-aider` (`OPENAI_API_BASE`)                                          | akar                  | Tidak — LiteLLM menambah `/v1/chat/completions` |
| `setup-kilo`, `setup-roo`, `setup-continue`, `setup-crush`, `setup-cursor` | dengan `/v1`          | Ya                                              |
| `setup-claude` (`ANTHROPIC_BASE_URL`), `launch`                            | akar                  | Tidak — Claude Code menambah `/v1/messages`     |
| `setup-codex`, `launch-codex` (`model_providers.agentproxy.base_url`)       | dengan `/v1`          | Ya                                              |
| `setup-qwen` (`modelProviders.openai[].baseUrl`)                           | dengan `/v1`          | Ya                                              |
| `run gemini` (`GOOGLE_GEMINI_BASE_URL`)                                    | akar                  | Tidak — SDK menambah `/v1beta/models/…`         |

---

## Menjaga kebergantungan asli semasa kemas kini: `--include=optional`

Apabila anda mengemas kini dengan `agentproxy update` (selepas mengesahkan, atau dengan `--apply`),
AgentProxy menjalankan pemasangan dengan `--include=optional` yang telah disertakan:

```bash
npm install -g agentproxy@latest --include=optional
```

Ini **bukan** bendera yang anda berikan kepada `agentproxy update` — ia sentiasa digunakan oleh
pengemas kini. Ia menjamin bahawa `optionalDependencies` (`better-sqlite3`, `keytar`,
`tls-client`, tumpukan LLMLingua SLM) kekal selepas kemas kini walaupun konfigurasi npm anda
mempunyai `omit=optional` yang ditetapkan, yang sebaliknya akan secara senyap membuang pemacu SQLite
asli dan pengikatan OS-keyring. Untuk melihat arahan yang tepat tanpa melaksanakan:

```bash
agentproxy update --dry-run
# [DRY RUN] Akan dijalankan: npm install -g agentproxy@latest --include=optional
```

Bendera lain untuk `agentproxy update` (disahkan dalam sumber): `--check` (keluar 1 jika
ketinggalan), `--apply` (pasang tanpa meminta), `--changelog`, `--no-backup`,
`--yes`.

---

## Google Gemini CLI melalui `agentproxy run gemini`

Kontrak disahkan terhadap `@google/gemini-cli` 0.50.0: CLI menghormati
`GOOGLE_GEMINI_BASE_URL` dan mengeluarkan `POST /v1beta/models/<model>:generateContent`
(dan `:streamGenerateContent?alt=sse`) terhadapnya — tepat seperti permukaan
Gemini asli AgentProxy (`/v1beta`). `agentproxy run gemini` menyambungkannya secara automatik:

- `GOOGLE_GEMINI_BASE_URL` → URL asas AgentProxy yang aktif (akar, tiada `/v1`);
- `GEMINI_API_KEY` → kelayakan AgentProxy yang diselesaikan (pilihan/env/konteks);
- **`GEMINI_CLI_HOME` yang terasing sementara** yang `.gemini/settings.json`
  memilih pengesahan `gemini-api-key`, jadi sesi Google OAuth yang disimpan (Code Assist)
  tidak pernah menggantikan pelancaran yang diarahkan oleh AgentProxy — dibuang selepas keluar;
- **kebersihan env**: env anak dibersihkan daripada `GOOGLE_API_KEY`,
  `GOOGLE_GENAI_USE_VERTEXAI` dan `GOOGLE_GENAI_USE_GCA` (yang akan mengalihkan
  pengesahan ke Vertex/Code Assist), dan `GEMINI_DEFAULT_AUTH_TYPE=gemini-api-key` ditetapkan
  sebagai langkah tambahan — sasaran `run` yang lain mendapat rawatan yang sama
  untuk pembolehubah yang bertentangan mereka sendiri;
- suntikan `--model <id>` dari `--provider`/`--model`.

```bash
agentproxy run gemini --model glm/glm-5.2 -- --skip-trust -p "hello"
```

Pengawal kepercayaan ruang kerja Gemini masih terpakai dalam mod tanpa kepala — berikan
`--skip-trust` (atau percayakan direktori secara interaktif) sendiri; pelancar
dengan sengaja tidak mengabaikannya. Pelancar ini berbeza daripada **pendaftaran ACP**
(`src/lib/acp/registry.ts`, `gemini --acp`), yang kekal sebagai integrasi protokol ejen untuk
`/dashboard/acp-agents`.

---

## Penyapu asap sebenar (pilihan)

Pelan pelancaran deterministik regresi dijalankan dalam CI (`tests/unit/cli/run-command.test.ts`,
`tests/unit/cli/run-execution.test.ts`). Untuk mengesahkan binari SEBENAR terhadap pelayan
AgentProxy SEBENAR, terdapat alat pilihan di
`tests/integration/upstream-cli-smoke.int.test.ts`. Ia tidak pernah dijalankan secara automatik
(setiap sub-uji akan dilepaskan kecuali `RUN_CLI_SMOKE=1`), menghantar kelayakan melalui nama
env-var (tidak pernah melalui nilai), menyunting rentetan berbentuk kunci daripada sebarang output
yang direkodkan, melewati sasaran yang binarinya tidak dipasang, dan mengklasifikasikan kegagalan
sebagai pengesahan / hulu / konfigurasi dan bukannya boolean kosong:

```bash
RUN_CLI_SMOKE=1 \
AGENTPROXY_SMOKE_BASE_URL="http://localhost:20128" \
AGENTPROXY_SMOKE_MODEL="<provider/model>" \
AGENTPROXY_SMOKE_API_KEY_ENV="AGENTPROXY_API_KEY" \
node --import tsx/esm --test tests/integration/upstream-cli-smoke.int.test.ts
```

Pilihan: `AGENTPROXY_SMOKE_TARGETS="codex,opencode,qwen"` mengehadkan sapuan;
`AGENTPROXY_SMOKE_TIMEOUT_MS` menggantikan had masa 120s bagi setiap sasaran.

---

## Lihat juga

- [Konfigurasi Claude Code](./CLAUDE-CODE-CONFIGURATION.md) — panduan mendalam mengenai Claude Code
- [Konfigurasi Codex CLI](./CODEX-CLI-CONFIGURATION.md) — penyetupan asas `[model_providers.agentproxy]` sekali sahaja
- [Mod Jauh](./REMOTE-MODE.md) — konteks, token akses terhad, mengendalikan pelayan jauh
- [Rujukan Alat CLI](../reference/CLI-TOOLS.md) — katalog penuh alat yang disokong + halaman papan pemuka
- [Panduan Persediaan](./SETUP_GUIDE.md) — kaedah pemasangan dan pengenalan pertama kali
