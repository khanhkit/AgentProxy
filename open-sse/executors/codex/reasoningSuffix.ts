export const CODEX_EFFORT_ORDER = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
export type CodexEffortLevel = (typeof CODEX_EFFORT_ORDER)[number];

export function applyForcedCodexReasoningEffort(body: unknown, effort: string | null | undefined) {
  if (!effort) return body;
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const reasoning =
    record.reasoning && typeof record.reasoning === "object" && !Array.isArray(record.reasoning)
      ? (record.reasoning as Record<string, unknown>)
      : {};
  return { ...record, reasoning: { ...reasoning, effort } };
}

export function stripUnsupportedCodexReasoningFields(body: Record<string, unknown>): void {
  const reasoning =
    body.reasoning && typeof body.reasoning === "object" && !Array.isArray(body.reasoning)
      ? (body.reasoning as Record<string, unknown>)
      : null;
  if (!reasoning) return;
  for (const key of Object.keys(reasoning)) {
    if (key !== "effort" && key !== "summary") delete reasoning[key];
  }
  if (Object.keys(reasoning).length === 0) delete body.reasoning;
}
export const GPT_5_6_MAX_ALIAS_MODELS = new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
export const GPT_5_6_ULTRA_ALIAS_MODELS = new Set(["gpt-5.6-sol", "gpt-5.6-terra"]);

export function splitCodexReasoningSuffix(model: unknown): {
  baseModel: string;
  effort: CodexEffortLevel | null;
} {
  const modelId = typeof model === "string" ? model : "";
  const gpt56Match = /^(gpt-5\.6-(?:sol|terra|luna))(?:-(max|ultra)|\((max|ultra)\))$/.exec(
    modelId
  );
  if (gpt56Match) {
    const [, baseModel, hyphenEffort, parenthesizedEffort] = gpt56Match;
    const effort = hyphenEffort ?? parenthesizedEffort;
    const supportedModels = parenthesizedEffort
      ? GPT_5_6_MAX_ALIAS_MODELS
      : effort === "ultra"
        ? GPT_5_6_ULTRA_ALIAS_MODELS
        : GPT_5_6_MAX_ALIAS_MODELS;
    if (supportedModels.has(baseModel)) {
      return { baseModel, effort: effort as CodexEffortLevel };
    }
  }

  for (const effort of ["none", "low", "medium", "high", "xhigh"] as const) {
    if (modelId.endsWith(`-${effort}`)) {
      return { baseModel: modelId.slice(0, -`-${effort}`.length), effort };
    }
  }
  return { baseModel: modelId, effort: null };
}
