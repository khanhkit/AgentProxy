import { HTTP_STATUS } from "../../config/constants.ts";
import {
  AUTH_CREDENTIAL_ERROR_PATTERNS,
  CONTEXT_OVERFLOW_PATTERNS,
  MALFORMED_REQUEST_PATTERNS,
  PARAM_VALIDATION_PATTERNS,
  RATE_LIMIT_TEXT_PATTERNS,
} from "../accountFallback.ts";

export const REQUEST_SCOPED_PARAM_VALIDATION_PATTERNS = [
  /\b(?:extra|additional)\s+(?:input|inputs|propert(?:y|ies)|field|fields)\b.*(?:not permitted|not allowed)/i,
  /\b(?:unknown|unrecognized|unexpected)\s+(?:field|fields|property|properties|parameter|parameters|input|inputs)\b/i,
  /\binvalid\s+(?:field|fields|property|properties|parameter|parameters|input|inputs)\b/i,
];

/**
 * #13757: is this 400 a request-level / parameter validation / malformed / input-bound error
 * where retrying a *different account* of the same model would fail identically?
 * Reuses AUTH_CREDENTIAL_ERROR_PATTERNS and RATE_LIMIT_TEXT_PATTERNS so that
 * account-specific 400s (e.g. invalid API key or throttling text) still rotate/cooldown.
 */
export function isRequestScoped400(status: number, errorText: string): boolean {
  if (status !== HTTP_STATUS.BAD_REQUEST) return false;
  if (!errorText) return false;
  if (AUTH_CREDENTIAL_ERROR_PATTERNS.some((p) => p.test(errorText))) return false;
  if (RATE_LIMIT_TEXT_PATTERNS.some((p) => p.test(errorText))) return false;
  return (
    PARAM_VALIDATION_PATTERNS.some((p) => p.test(errorText)) ||
    REQUEST_SCOPED_PARAM_VALIDATION_PATTERNS.some((p) => p.test(errorText)) ||
    CONTEXT_OVERFLOW_PATTERNS.some((p) => p.test(errorText)) ||
    MALFORMED_REQUEST_PATTERNS.some((p) => p.test(errorText))
  );
}
