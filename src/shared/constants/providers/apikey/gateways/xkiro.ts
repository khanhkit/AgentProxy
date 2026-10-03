export const XKIRO_APIKEY_PROVIDER = {
  id: "xkiro",
  serviceKinds: ["llm"],
  alias: "xkiro",
  name: "xKiro",
  icon: "hub",
  color: "#0EA5E9",
  textIcon: "XK",
  passthroughModels: true,
  website: "https://xkiro.com",
  hasFree: true,
  freeNote:
    "Free plan: 5M tokens/day per account across 40 upstream free models — 39 pinned here (Qwen, MiniMax, DeepSeek, Mistral, SenseNova) — no card; past the daily allowance free requests get a 429 until the reset. RPM not published.",
  authHint:
    "Create a free account at xkiro.com and paste the key here (Bearer; x-api-key also accepted).",
  apiHint:
    "OpenAI-compatible endpoint at https://api.xkiro.com/v1. Public /v1/models tags free rows with access_tier=free; paid models are rejected on the free plan.",
} as const;
