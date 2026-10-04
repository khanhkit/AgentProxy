import { getModelTargetFormat } from "../config/providerModels.ts";

const EFFORT_LEVELS = ["none", "low", "high", "max"] as const;
const EFFORT_TIERS: Record<string, readonly string[]> = {
  "deepseek-v4-pro": EFFORT_LEVELS,
  "deepseek-v4-flash": EFFORT_LEVELS,
  "glm-5.2": ["high", "max"],
  "mimo-v2.5": ["high", "max"],
  "grok-4.5": ["low", "medium", "high"],
  hy3: ["none", "low", "high"],
  "kimi-k3": ["max"],
  "qwen3.6-plus": ["high", "max"],
  "qwen3.7-max": ["high", "max"],
  "qwen3.7-plus": ["high", "max"],
  "muse-spark-1.2-contributor": ["minimal", "low", "medium", "high", "xhigh"],
  "muse-spark-1.3-contributor": ["minimal", "low", "medium", "high", "xhigh"],
};

export function parseEffortLevel(model: string): { baseModel: string; effort: string } | null {
  const value = String(model || "");
  for (const [baseModel, levels] of Object.entries(EFFORT_TIERS)) {
    for (const level of levels) {
      if (value === `${baseModel}-${level}`) return { baseModel, effort: level };
    }
  }
  return null;
}

export function resolveOpencodeTargetFormat(provider: string, model: string): string {
  return getModelTargetFormat(provider, model) || "openai";
}
