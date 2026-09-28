import type { ExecuteInput, ExecutorLog } from "./base.ts";
import { isOpencodeFreeTierRefusal } from "./opencodeGeoBlock.ts";
import { getObservedToolNames, recordAcceptedToolNames } from "./opencodeToolObservation.ts";
import { generateSessionId } from "../services/sessionManager.ts";

const PLACEHOLDER_DESCRIPTION =
  "Do not call this tool. It exists only for API compatibility and must never be invoked.";
const PLACEHOLDER_PARAMETERS = { type: "object", properties: {} } as const;

export type ObservedToolsRetryContext = {
  provider: string;
  model: string;
  requestFormat: string | null;
  gated: boolean;
  borrowed?: boolean;
};

function findHeader(
  headers: Record<string, string> | null | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function observationSession(input: ExecuteInput, provider: string): string | undefined {
  const direct =
    findHeader(input.clientHeaders, "x-opencode-session") ||
    findHeader(input.clientHeaders, "x-session-affinity") ||
    findHeader(input.clientHeaders, "x-session-id");
  if (direct) return direct;

  if (!input.body || typeof input.body !== "object" || Array.isArray(input.body)) {
    return undefined;
  }

  const body = { ...(input.body as Record<string, unknown>) };
  delete body.tools;
  return (
    generateSessionId(body as Parameters<typeof generateSessionId>[0], {
      provider,
    }) ?? undefined
  );
}

function toolNameOf(tool: unknown): string | null {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return null;
  const record = tool as Record<string, unknown>;
  if (typeof record.name === "string") return record.name;
  const fn = record.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn)) {
    const name = (fn as Record<string, unknown>).name;
    if (typeof name === "string") return name;
  }
  return null;
}

export function clientToolNamesOf(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const tools = (body as Record<string, unknown>).tools;
  if (!Array.isArray(tools)) return [];
  const names: string[] = [];
  for (const tool of tools) {
    const name = toolNameOf(tool);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function mergeClientToolsWithObserved(
  body: unknown,
  requestFormat: string | null,
  provider: string,
  model: string,
  session: string | undefined
): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.tools) || record.tools.length === 0) return body;

  const own = session ? getObservedToolNames(provider, model, session) : null;
  const observed = own ?? getObservedToolNames(provider, model);
  if (!observed || observed.length === 0) return body;

  const have = new Set(clientToolNamesOf(body));
  const missing = observed.filter((name) => !have.has(name));
  if (missing.length === 0) return body;

  if (requestFormat === "openai-responses") {
    return {
      ...record,
      tools: [
        ...record.tools,
        ...missing.map((name) => ({
          type: "function",
          name,
          description: PLACEHOLDER_DESCRIPTION,
          parameters: PLACEHOLDER_PARAMETERS,
        })),
      ],
    };
  }

  if (requestFormat === "openai" || requestFormat === null) {
    return {
      ...record,
      tools: [
        ...record.tools,
        ...missing.map((name) => ({
          type: "function",
          function: {
            name,
            description: PLACEHOLDER_DESCRIPTION,
            parameters: PLACEHOLDER_PARAMETERS,
          },
        })),
      ],
    };
  }

  return body;
}

export function noteAcceptedObservedTools(
  ctx: ObservedToolsRetryContext,
  input: ExecuteInput,
  result: { response: Response }
): void {
  if (!ctx.gated || !result.response.ok) return;
  const names = clientToolNamesOf(input.body);
  if (names.length === 0) return;
  recordAcceptedToolNames(ctx.provider, ctx.model, observationSession(input, ctx.provider), names);
}

export async function handleFreeTierObservedToolsRefusal<T extends { response: Response }>(
  ctx: ObservedToolsRetryContext,
  input: ExecuteInput,
  first: T,
  log: ExecutorLog | null | undefined,
  cid: string,
  dispatch: (retryInput: ExecuteInput) => Promise<T>,
  knownBodyText?: string | null
): Promise<T | null> {
  if (!ctx.gated) return null;
  const status = first.response.status;
  if (status !== 403 && status !== 451) return null;

  let bodyText = knownBodyText;
  if (bodyText === undefined) {
    try {
      bodyText = await first.response.clone().text();
    } catch {
      log?.debug?.("OPENCODE", "body read failed on free-tier retry check");
      return null;
    }
  }
  if (!isOpencodeFreeTierRefusal(status, bodyText ?? null)) return null;

  if (ctx.borrowed) return first;

  const ownNames = clientToolNamesOf(input.body);
  if (ownNames.length === 0) return first;

  const session = observationSession(input, ctx.provider);
  const merged = mergeClientToolsWithObserved(
    input.body,
    ctx.requestFormat,
    ctx.provider,
    ctx.model,
    session
  );
  if (merged === input.body) return first;

  log?.warn?.(
    "OPENCODE",
    `${cid}free-tier refusal on own tools [${ownNames.join(",")}], retrying once with observed names appended…`
  );

  let retry: T;
  try {
    retry = await dispatch({ ...input, body: merged });
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name ?? "")
        : "";
    if (input.signal?.aborted || name === "AbortError") throw error;
    log?.warn?.(
      "OPENCODE",
      `${cid}free-tier observed-tools retry failed before a response; returning original refusal`
    );
    return first;
  }
  if (!retry.response.ok) return first;

  recordAcceptedToolNames(ctx.provider, ctx.model, session, clientToolNamesOf(merged));
  return retry;
}
