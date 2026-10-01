import { STREAM_RECOVERY } from "../../config/constants.ts";
import { FORMATS } from "../../translator/formats.ts";
import { needsTranslation } from "../../translator/index.ts";
import {
  FLUSH_EMPTY_RETRY_MAX_BYTES,
  judgeBufferedTurn,
  readBoundedResponseOutcome,
} from "../../utils/emptyTurnRetry.ts";
import { isFeatureFlagEnabled } from "@/shared/utils/featureFlags";
import { ensureStreamReadiness } from "../../utils/streamReadiness.ts";
import { maybeConvertJsonBodyToSse } from "./jsonBodyToSse.ts";

export type FlushEmptyRetryArgs = {
  stream: boolean;
  response: Response;
  targetFormat: string;
  clientResponseFormat: string;
  timeoutMs: number;
  maxTimeoutMs: number;
  provider: string;
  model: string;
  currentModel: string;
  signal?: AbortSignal | null;
  log?: { debug?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
  getCredentials: () => Promise<Record<string, unknown> | null>;
  applyCredentials: (next: Record<string, unknown>) => void;
  executeRetry: () => Promise<unknown>;
  onRetryPrepared?: (retryResult: unknown) => void;
};

export async function maybeRetryFlushEmptyTurn(args: FlushEmptyRetryArgs): Promise<Response> {
  if (!args.stream || !args.response.ok || !args.response.body) return args.response;
  let enabled = false;
  try { enabled = isFeatureFlagEnabled("FLUSH_EMPTY_RETRY_ENABLED"); } catch { enabled = false; }
  const translatePath = args.targetFormat === FORMATS.OPENAI_RESPONSES || needsTranslation(args.targetFormat, args.clientResponseFormat);
  if (!enabled || !translatePath) return args.response;

  let response = args.response;
  for (let retries = 0; retries <= STREAM_RECOVERY.EMPTY_TURN_RETRY_MAX; retries++) {
    const verdict = judgeBufferedTurn(
      await readBoundedResponseOutcome(response, FLUSH_EMPTY_RETRY_MAX_BYTES, args.timeoutMs),
      args.targetFormat,
      args.clientResponseFormat,
      args.signal?.aborted === true
    );
    if (verdict.kind === "pass") return response;
    if (retries >= STREAM_RECOVERY.EMPTY_TURN_RETRY_MAX) return response;

    const next = await args.getCredentials().catch(() => null);
    if (!next?.connectionId) return response;
    args.applyCredentials(next);
    await response.body?.cancel().catch(() => undefined);

    let retryResult: unknown;
    try { retryResult = await args.executeRetry(); } catch { return response; }
    const retryResponse = (retryResult as { response?: Response })?.response;
    if (!retryResponse?.ok || !retryResponse.body) {
      await retryResponse?.body?.cancel().catch(() => undefined);
      return response;
    }
    const prepared = await maybeConvertJsonBodyToSse(retryResponse, { log: args.log, provider: args.provider, model: args.model });
    if (!prepared.ok) return response;
    const ready = await ensureStreamReadiness(prepared, {
      timeoutMs: args.timeoutMs,
      maxTimeoutMs: args.maxTimeoutMs,
      provider: args.provider,
      model: args.model,
      log: args.log,
    });
    if (!ready.ok) return response;
    response = ready.response;
    args.onRetryPrepared?.(retryResult);
  }
  return response;
}
