import { stripUnsupportedParams } from "../../translator/paramSupport.ts";

/** Strip fields Codex /responses rejects before native passthrough returns. */
export function stripCodexPassthroughRejectedParams(
  model: string,
  body: Record<string, unknown>
): void {
  delete body.prompt_cache_retention;
  delete body.safety_identifier;
  delete body.user;
  stripUnsupportedParams("codex", model, body);
}
