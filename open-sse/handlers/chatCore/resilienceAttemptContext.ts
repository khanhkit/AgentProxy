import { runWithResilienceActionsContext } from "@/lib/usage/resilienceActionsContext.ts";
import { notePreviousResponseResumed } from "./resumedResilienceNotes.ts";

/**
 * one implicit resilience store per attempt. Combo legs each run
 * handleChatCore, so each leg gets its own isolated store. The public
 * signature stays single-arg (forwarded verbatim); no per-caller change.
 */
export function withResilienceActionsContext<TArgs extends unknown[], TResult>(
  args: TArgs,
  inner: (...innerArgs: TArgs) => TResult
): TResult {
  return runWithResilienceActionsContext(() => {
    const first = args[0] as { body?: unknown } | undefined;
    const body = first?.body;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      notePreviousResponseResumed(record._agentproxyPreviousResponseResumed);
      delete record._agentproxyPreviousResponseResumed;
    }
    return inner(...args);
  });
}
