export const LYCEUM_APIKEY_PROVIDER = {
  id: "lyceum",
  serviceKinds: ["llm"],
  alias: "lyceum",
  name: "Lyceum",
  icon: "router",
  color: "#4F46E5",
  textIcon: "LY",
  passthroughModels: true,
  website: "https://lyceum.technology",
  hasFree: true,
  freeNote: "Includes monthly free credits toward serverless inference usage.",
  apiHint:
    "Create a Lyceum API key (lk_…), then use https://api.lyceum.technology/openai/v1 as the OpenAI-compatible base URL.",
} as const;
