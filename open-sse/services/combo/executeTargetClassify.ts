/**
 * Pure classify helpers for executeTarget's retry loop.
 * Lift-as-is from combo.ts #8375 / #2101 / #4279. No I/O.
 *
 * @internal — not part of the public combo.ts barrel.
 */
import { isInputBoundRequestFailure } from "./comboPredicates.ts";
import { comboTargetDecision } from "./statusDecisionTable.ts";

export function remainderIsHomogeneous(
  orderedTargets: { modelStr: string }[],
  index: number,
  modelStr: string
): boolean {
  return orderedTargets.slice(index + 1).every((nextInPool) => nextInPool.modelStr === modelStr);
}

export function shouldAbortOnInputBoundFailure(opts: {
  structuredError: unknown;
  remainderIsHomogeneous: boolean;
}): boolean {
  const structured = opts.structuredError as
    { code?: string | null; type?: string | null } | undefined;
  return isInputBoundRequestFailure(structured) && opts.remainderIsHomogeneous;
}

/**
 * #2101 / #4279: body-specific 400 must surface via {ok,response}, not null.
 * The stop set is COMBO_400_STOP_ROWS. Model-scoped, overflow, and parameter
 * 400s advance even when the body is wrapped as invalid_request_error or
 * Bad Request.
 */
export function shouldSurfaceBodySpecific400(opts: {
  status: number;
  errorText: string;
  shouldFallback: boolean;
}): boolean {
  return opts.shouldFallback && comboTargetDecision(opts.status, opts.errorText) === "stop";
}
