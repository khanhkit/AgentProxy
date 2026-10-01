import type { RegistryEntry } from "../../shared.ts";

export const uncloseaiProvider: RegistryEntry = {
  id: "uncloseai",
  alias: "unc",
  format: "openai",
  executor: "default",
  baseUrl: "https://hermes.ai.unturf.com/v1/chat/completions",
  modelsUrl: "https://hermes.ai.unturf.com/v1/models",
  authType: "optional",
  authHeader: "bearer",
  models: [
    {
      id: "Lorbus/Qwen3.6-27B-int4-AutoRound",
      name: "Qwen3.6 27B int4 AutoRound (🆓 Free)",
    },
  ],
};
