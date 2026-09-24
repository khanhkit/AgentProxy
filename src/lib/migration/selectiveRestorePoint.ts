export interface RestorePointSnapshot {
  filename: string;
  size: number;
}

export interface RestorePointListing {
  id?: string;
  filename: string;
  size: number;
}

export interface AwaitStableRestorePointDeps {
  createBackup(): RestorePointSnapshot | null | Promise<RestorePointSnapshot | null>;
  listBackups(): Promise<RestorePointListing[]>;
  sleep?(ms: number): Promise<void>;
  maxAttempts?: number;
  delayMs?: number;
}

export interface StableRestorePoint {
  id: string;
  filename: string;
  size: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function awaitStableRestorePoint(
  deps: AwaitStableRestorePointDeps
): Promise<StableRestorePoint> {
  const created = await deps.createBackup();
  if (!created?.filename || !Number.isFinite(created.size) || created.size <= 0) {
    throw new Error("Selective migration restore point was not created");
  }

  const maxAttempts = Math.max(2, deps.maxAttempts ?? 40);
  const delayMs = Math.max(0, deps.delayMs ?? 100);
  const sleep = deps.sleep ?? defaultSleep;
  let stableObservations = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const backups = await deps.listBackups();
    const entry = backups.find(
      (candidate) =>
        candidate.filename === created.filename ||
        candidate.id === created.filename
    );

    if (entry && entry.size === created.size) {
      stableObservations += 1;
      if (stableObservations >= 2) {
        return {
          id: entry.id ?? entry.filename,
          filename: entry.filename,
          size: entry.size,
        };
      }
    } else {
      stableObservations = 0;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    "Selective migration restore point did not become ready before mutation"
  );
}
