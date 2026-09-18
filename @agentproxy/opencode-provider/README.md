# @agentproxy/opencode-provider

> ## ⚠️ Deprecated — use [`@agentproxy/opencode-plugin`](https://www.npmjs.com/package/@agentproxy/opencode-plugin) instead
>
> This package writes a **static** `provider.agentproxy` block to `opencode.json` from a hardcoded default model list, so it **drifts behind your live AgentProxy catalog** — adding a model in AgentProxy won't show up in OpenCode until you re-run the generator, and OpenCode Desktop/Web only surfaces a subset of the static models.
>
> **`@agentproxy/opencode-plugin`** solves this by fetching `GET /v1/models` from your AgentProxy instance at OpenCode startup, so the model list is always live (see [#3419](https://github.com/khanhkit/AgentProxy/issues/3419)). It is now the recommended path.
>
> **One-line migration** — replace the static `provider.agentproxy` block in `opencode.json` with a single plugin entry:
>
> ```jsonc
> // opencode.json
> {
>   "$schema": "https://opencode.ai/config.json",
>   "plugin": ["@agentproxy/opencode-plugin"]
> }
> ```
>
> This package is **not removed** and still works for static/offline config generation, but it is no longer actively recommended and won't track new models automatically.

Helper for connecting [OpenCode](https://opencode.ai) to a running [AgentProxy](https://github.com/khanhkit/AgentProxy) AI gateway.

The package emits a **schema-valid entry** for `opencode.json` (`https://opencode.ai/config.json`) that delegates the actual runtime to [`@ai-sdk/openai-compatible`](https://www.npmjs.com/package/@ai-sdk/openai-compatible). It does not ship any new HTTP client — AgentProxy already exposes an OpenAI-compatible surface, and OpenCode already speaks it through the AI SDK.

> Pre-1.0. The API may still change. See `CHANGELOG` in the AgentProxy repo for breaking notes.

## Installation

```bash
npm install --save-dev @agentproxy/opencode-provider
# or
pnpm add -D @agentproxy/opencode-provider
```

You also need OpenCode's own runtime dep, but that's a transitive concern — OpenCode itself ships with `@ai-sdk/openai-compatible`. This package only **generates configuration**.

## Quick start

### 1. Scaffold a fresh `opencode.json`

```ts
import { writeFileSync } from "node:fs";
import { buildAgentProxyOpenCodeConfig } from "@agentproxy/opencode-provider";

const config = buildAgentProxyOpenCodeConfig({
  baseURL: "http://localhost:20128", // or your AgentProxy deployment URL
  apiKey: process.env.AGENTPROXY_API_KEY ?? "sk_agentproxy",
});

writeFileSync("opencode.json", JSON.stringify(config, null, 2));
```

The resulting `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "agentproxy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "AgentProxy",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "sk_agentproxy",
      },
      "models": {
        "claude-opus-4-5-thinking": { "name": "claude-opus-4-5-thinking" },
        "claude-sonnet-4-5-thinking": { "name": "claude-sonnet-4-5-thinking" },
        "gemini-3.1-pro-high": { "name": "gemini-3.1-pro-high" },
        "gemini-3-flash": { "name": "gemini-3-flash" },
      },
    },
  },
}
```

### 2. Merge into an existing `opencode.json`

```ts
import { createAgentProxyProvider } from "@agentproxy/opencode-provider";

const provider = createAgentProxyProvider({
  baseURL: "http://localhost:20128",
  apiKey: process.env.AGENTPROXY_API_KEY!,
});

// Place `provider` under provider.agentproxy in your opencode.json
```

If you already have an `opencode.json` on disk and want a non-destructive merge from the AgentProxy side, use `agentproxy config opencode` from the CLI (ships with the main AgentProxy install) — it preserves comments and unrelated keys.

## API

### `createAgentProxyProvider(options): OpenCodeProviderEntry`

Returns the value to place under `provider.agentproxy` inside `opencode.json`.

| Option        | Type                    | Required | Description                                                                                                  |
| ------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `baseURL`     | `string`                | Yes      | AgentProxy base URL. Accepts `http://host:port` **or** `http://host:port/v1`. Trailing slashes are tolerated. |
| `apiKey`      | `string`                | Yes      | AgentProxy API key. Use `sk_agentproxy` for local installs that have `REQUIRE_API_KEY=false`.                  |
| `displayName` | `string`                | No       | Custom name shown in the OpenCode UI. Default: `"AgentProxy"`.                                                |
| `models`      | `string[]`              | No       | Override the surfaced model catalog. Default: 4 curated models — see `AGENTPROXY_DEFAULT_OPENCODE_MODELS`.    |
| `modelLabels` | `Record<string,string>` | No       | Human-readable labels keyed by model id.                                                                     |

Throws on empty/invalid input — `baseURL` must be a real URL, `apiKey` must be a non-empty string.

### `buildAgentProxyOpenCodeConfig(options): OpenCodeConfigDocument`

Same options as above, but returns a full document with `$schema` and the `provider.agentproxy` wrapper, ready to write to `opencode.json`.

### `normalizeBaseURL(input): string`

Exported for completeness. Strips trailing `/`, deduplicates a trailing `/v1`, and re-appends exactly one `/v1`. Throws on empty / non-URL input.

### Constants

- `AGENTPROXY_PROVIDER_KEY` — `"agentproxy"` (the key used under `provider.*`).
- `AGENTPROXY_PROVIDER_NPM` — `"@ai-sdk/openai-compatible"` (the runtime delegate).
- `OPENCODE_CONFIG_SCHEMA` — `"https://opencode.ai/config.json"`.
- `AGENTPROXY_DEFAULT_OPENCODE_MODELS` — readonly list of default model ids.

## Custom model catalog

```ts
import { createAgentProxyProvider } from "@agentproxy/opencode-provider";

createAgentProxyProvider({
  baseURL: "http://localhost:20128",
  apiKey: "sk_agentproxy",
  models: ["auto", "claude-opus-4-8", "gpt-5.5"],
  modelLabels: {
    auto: "Auto-Combo (recommended)",
    "claude-opus-4-8": "Claude Opus 4.8",
    "gpt-5.5": "GPT-5.5",
  },
});
```

Duplicates and empty strings are dropped automatically, and order is preserved.

## Troubleshooting

- **Requests 404 with `/v1/v1/...`** — you're on an old version (≤1.0.0). Update to `≥0.1.0` of this re-released package. The new build normalises `baseURL` automatically.
- **`401 Invalid API key`** — your AgentProxy instance has `REQUIRE_API_KEY=true` but the key you supplied doesn't exist there. Create one via the dashboard or set `REQUIRE_API_KEY=false` and use `sk_agentproxy`.
- **OpenCode complains the provider has no models** — supply an explicit `models` list; the default 4 may be hidden by your provider visibility settings.

## Related

- [AgentProxy](https://github.com/khanhkit/AgentProxy) — the AI gateway this plugin targets.
- [OpenCode](https://opencode.ai) — the agentic CLI consumer.
- [`@ai-sdk/openai-compatible`](https://www.npmjs.com/package/@ai-sdk/openai-compatible) — the runtime delegate that actually speaks HTTP.

## License

MIT — see [`LICENSE`](./LICENSE).
