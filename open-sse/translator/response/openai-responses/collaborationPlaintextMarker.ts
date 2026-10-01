const PLAINTEXT_COLLABORATION_CALLS = new Set(["spawn_agent", "send_message", "followup_task"]);

/** Codex collaboration calls with plaintext args require this explicit delivery marker. */
export function plaintextCollaborationFields(
  namespace: string | undefined,
  name: string | undefined
): Record<string, unknown> {
  return namespace === "collaboration" && !!name && PLAINTEXT_COLLABORATION_CALLS.has(name)
    ? { encrypted_function_args: [] }
    : {};
}
