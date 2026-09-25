/**
 * Guarded percent-decoding for proxy URL userinfo segments.
 * Correctly encoded values decode normally; malformed/literal-percent credentials
 * fall back to the raw value instead of throwing URIError.
 */
export function decodeUserinfo(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
