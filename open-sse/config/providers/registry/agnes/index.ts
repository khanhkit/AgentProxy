import type { RegistryEntry } from "../../shared.ts";

const AGNES_FLASH_THINKING_EFFORTS = ["none", "low", "medium", "high", "max"] as const;

export const agnesProvider: RegistryEntry = {
  id: "agnes",
  format: "openai",
  executor: "default",
  baseUrl: "https://apihub.agnes-ai.com/v1/chat/completions",
  authType: "apikey",
  authHeader: "bearer",
  models: [
    {
      id: "agnes-1.5-flash",
      name: "Agnes 1.5 Flash",
      contextLength: 262144,
      maxOutputTokens: 65536,
      supportsVision: true,
      toolCalling: true,
    },
    {
      id: "agnes-2.0-flash",
      name: "Agnes 2.0 Flash",
      contextLength: 262144,
      maxOutputTokens: 65536,
      supportsReasoning: true,
      supportedThinkingEfforts: [...AGNES_FLASH_THINKING_EFFORTS],
      supportsVision: true,
      toolCalling: true,
    },
    {
      id: "agnes-2.5-flash",
      name: "Agnes 2.5 Flash",
      contextLength: 524288,
      maxOutputTokens: 65536,
      supportsReasoning: true,
      supportedThinkingEfforts: [...AGNES_FLASH_THINKING_EFFORTS],
      supportsVision: true,
      toolCalling: true,
      interleavedField: "reasoning_content",
    },
  ],
};
