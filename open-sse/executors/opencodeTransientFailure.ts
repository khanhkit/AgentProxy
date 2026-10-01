/**
 * opencodeTransientFailure.ts — retriable-upstream predicate and bounded
 * transient-failover pause helpers for the OpenCode executor loop.
 */

import type { ExecutorLog } from "./base.ts";
import { isEmptyUpstreamRejection } from "./accountRotation.ts";
import { discardResponseBody } from "./opencodeResponseBody.ts";

export function isRetriableUpstreamFailure(status: number, bodyText?: string): boolean {
  if (status >= 500 && status < 600) return true;
  if (status !== 400) return false;
  if (typeof bodyText !== "string" || bodyText === "") return false;
  return isEmptyUpstreamRejection(status, bodyText);
}

/** Consecutive transient failures before the first opt-in pause. */
export const TRANSIENT_PAUSE_STREAK = 2;
/** First pause, aligned with the existing WAF retry delay. */
export const TRANSIENT_RETRY_BASE_DELAY_MS = 1500;
/** Maximum duration of one pause. */
export const TRANSIENT_RETRY_MAX_DELAY_MS = 6000;
/** Maximum aggregate pause time per request. */
export const TRANSIENT_RETRY_TOTAL_BUDGET_MS = 10_000;

export function transientRetryDelayMs(consecutiveFailures: number, pausedMs = 0): number {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures < TRANSIENT_PAUSE_STREAK) {
    return 0;
  }
  const step = Math.min(consecutiveFailures - TRANSIENT_PAUSE_STREAK, 16);
  const delay = Math.min(TRANSIENT_RETRY_BASE_DELAY_MS * 2 ** step, TRANSIENT_RETRY_MAX_DELAY_MS);
  const left = TRANSIENT_RETRY_TOTAL_BUDGET_MS - Math.max(0, pausedMs);
  return Math.max(0, Math.min(delay, left));
}

/** Resolve false on abort, true after the timer expires. */
export function sleepAbortable(ms: number, signal?: AbortSignal | null): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Cancel a failed body before waiting while preserving surfaceable response metadata. */
export function releaseResponseBody(response: Response): Response {
  discardResponseBody(response);
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Request-local state machine for the opt-in transient failover pause. */
export function createTransientFailoverBackoff(
  sleep: (ms: number, signal?: AbortSignal | null) => Promise<boolean> = sleepAbortable
) {
  let streak = 0;
  let pausedMs = 0;
  let observedResponse: Response | null = null;

  const observe = (response: Response | null) => {
    if (!response || response === observedResponse) return;
    observedResponse = response;
    streak = response.status >= 500 && response.status < 600 ? streak + 1 : 0;
  };

  return {
    reset() {
      streak = 0;
    },
    noteEmpty400(response: Response) {
      if (response === observedResponse) return;
      observedResponse = response;
      streak++;
    },
    async beforeDispatch(
      lastResult: { response: Response } | null,
      signal: AbortSignal | null | undefined,
      enabled: boolean,
      log?: ExecutorLog | null,
      cid = ""
    ): Promise<boolean> {
      observe(lastResult?.response ?? null);
      const pauseMs = transientRetryDelayMs(streak, pausedMs);
      if (!lastResult || pauseMs === 0 || !enabled) return true;
      lastResult.response = releaseResponseBody(lastResult.response);
      pausedMs += pauseMs;
      log?.info?.("OPENCODE", `${cid}${streak} transient failures, pausing ${pauseMs}ms`);
      return sleep(pauseMs, signal);
    },
  };
}
