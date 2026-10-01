/** Explicit OpenCode conversation identity, resolved before translation/fingerprint fallback. */
const HEADER_NAMES = [
  "x-opencode-session",
  "x-session-affinity",
  "x-session-id",
  "x-claude-code-session-id",
  "session_id",
  "session-id",
  "x-session_id",
  "thread_id",
  "thread-id",
  "x-thread-id",
] as const;

const BODY_NAMES = [
  "session_id",
  "sessionId",
  "thread_id",
  "threadId",
  "conversation_id",
  "conversationId",
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function identity(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }
  return value.trim() || undefined;
}

function bodyIdentity(value: unknown): string | undefined {
  const input = record(value);
  if (!input) return undefined;
  for (const key of BODY_NAMES) {
    const id = identity(input[key]);
    if (id) return id;
  }
  return undefined;
}

function claudeMetadataIdentity(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  try {
    return bodyIdentity(JSON.parse(value));
  } catch {
    return undefined;
  }
}

/** Headers win over metadata/body; opaque user/account IDs are never promoted to session IDs. */
export function resolveOpencodeSessionIdentity(
  headers: Record<string, string> | null | undefined,
  body?: unknown
): string | undefined {
  const normalized = new Map(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  for (const name of HEADER_NAMES) {
    const id = identity(normalized.get(name));
    if (id) return id;
  }

  const input = record(body);
  const metadata = record(input?.metadata);
  return bodyIdentity(metadata) || claudeMetadataIdentity(metadata?.user_id) || bodyIdentity(input);
}

export function preserveOpencodeSessionIdentity(
  headers: Record<string, string>,
  request?: { provider?: string; body?: unknown }
): void {
  if (request?.provider !== "opencode" && request?.provider !== "opencode-go") return;
  const sessionId = resolveOpencodeSessionIdentity(headers, request.body);
  if (sessionId) headers["x-opencode-session"] = sessionId;
}

export interface OpencodeSessionBody {
  model?: string;
  system?: unknown;
  messages?: Array<{ role?: string; content?: unknown }>;
  input?: Array<{ role?: string; content?: unknown }>;
  tools?: Array<{ name?: string; function?: { name?: string } }>;
  metadata?: unknown;
  session_id?: unknown;
  thread_id?: unknown;
}

/** Project only fingerprint/identity inputs; never inject this projection into an upstream body. */
export function projectOpencodeSessionBody(body: unknown): OpencodeSessionBody | undefined {
  const input = record(body);
  if (!input) return undefined;
  return {
    model: typeof input.model === "string" ? input.model : undefined,
    system: input.system,
    messages: Array.isArray(input.messages)
      ? (input.messages as Array<{ role?: string; content?: unknown }>)
      : undefined,
    input: Array.isArray(input.input)
      ? (input.input as Array<{ role?: string; content?: unknown }>)
      : undefined,
    tools: Array.isArray(input.tools)
      ? (input.tools as Array<{ name?: string; function?: { name?: string } }>)
      : undefined,
    metadata: input.metadata,
    session_id: input.session_id,
    thread_id: input.thread_id,
  };
}
