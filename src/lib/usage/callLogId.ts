const CALL_LOG_ID_RETRY_LIMIT = 3;

export function generateCallLogId(): string {
  return globalThis.crypto.randomUUID();
}

function isCallLogIdCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? "");
  if (/SQLITE_CONSTRAINT_PRIMARYKEY/i.test(code)) return true;
  if (/SQLITE_CONSTRAINT_UNIQUE/i.test(code) && /call_logs\.id/i.test(message)) return true;
  return /UNIQUE constraint failed: call_logs\.id/i.test(message);
}

export function runCallLogInsertWithIdRetry<T extends { id: string }>(
  params: T,
  run: (value: T) => void
): void {
  for (let attempt = 0; ; attempt++) {
    try {
      run(params);
      return;
    } catch (error) {
      if (!isCallLogIdCollision(error) || attempt >= CALL_LOG_ID_RETRY_LIMIT) throw error;
      params.id = generateCallLogId();
    }
  }
}
