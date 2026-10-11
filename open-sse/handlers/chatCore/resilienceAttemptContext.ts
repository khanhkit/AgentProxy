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
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      notePreviousResponseResumed(record._agentproxyPreviousResponseResumed);
      if (Object.hasOwn(record, "_agentproxyPreviousResponseResumed")) {
        // Strip private metadata from the inner request without mutating a caller's
        // shared or frozen body (which may be reused by retries/combo legs).
        const cleanBody = { ...record };
        delete cleanBody._agentproxyPreviousResponseResumed;
        const forwardedArgs = [...args] as TArgs;
        forwardedArgs[0] = { ...first, body: cleanBody } as TArgs[0];
        return inner(...forwardedArgs);
      }
    }
    return inner(...args);
  });
}
