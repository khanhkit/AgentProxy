type SuccessBreaker = {
  getStatus(): { state: string };
  _onSuccess(): void;
};

export const NON_RETRYABLE_PAYLOAD_TOO_LARGE = {
  shouldFallback: false,
  cooldownMs: 0,
  reason: "payload_too_large",
  skipProviderBreaker: true,
} as const;

export function isTpmCapacityPayload(errorText: string): boolean {
  return /\b(?:tokens per minute|TPM)\b/i.test(errorText);
}

export function recordProviderWideRecovery(
  connectionBreaker: SuccessBreaker,
  providerBreaker: SuccessBreaker | null | undefined
): void {
  if (
    providerBreaker &&
    providerBreaker !== connectionBreaker &&
    providerBreaker.getStatus().state !== "OPEN"
  ) {
    providerBreaker._onSuccess();
  }
}
