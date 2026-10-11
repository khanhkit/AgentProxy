import {
  getLastProviderLimitsAutoSyncTime,
  getProviderLimitsSyncIntervalMinutes,
  getProviderLimitsSyncIntervalMs,
  syncAllProviderLimits,
} from "@/lib/usage/providerLimits";

const STARTUP_DELAY_MS = 5_000;

let schedulerTimer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let schedulerEnabled = false;
let startupSetup: Promise<void> | null = null;
let activeCycle: Promise<void> | null = null;

function runProviderLimitsSyncCycle(): Promise<void> {
  if (activeCycle) {
    console.log("[ProviderLimitsSync] Skipping cycle — previous run still in progress");
    return activeCycle;
  }

  const cycle = (async () => {
    const start = Date.now();

    try {
      const result = await syncAllProviderLimits({ source: "scheduled" });
      console.log(
        `[ProviderLimitsSync] Cycle complete: ${result.succeeded}/${result.total} synced in ${Date.now() - start}ms`
      );
    } catch (error) {
      console.warn("[ProviderLimitsSync] Cycle failed:", (error as Error).message);
    }
  })();
  activeCycle = cycle;
  const clearActiveCycle = () => {
    if (activeCycle === cycle) activeCycle = null;
  };
  void cycle.then(clearActiveCycle, clearActiveCycle);
  return cycle;
}

export function startProviderLimitsSyncScheduler(): void {
  if (schedulerTimer || startupTimer || startupSetup || schedulerEnabled) {
    console.log("[ProviderLimitsSync] Scheduler already running — skipping start");
    return;
  }

  const intervalMs = getProviderLimitsSyncIntervalMs();
  const intervalMinutes = getProviderLimitsSyncIntervalMinutes();
  schedulerEnabled = true;

  console.log(`[ProviderLimitsSync] Scheduler started — interval: ${intervalMinutes}m`);

  const setup = (async () => {
    let initialDelayMs = STARTUP_DELAY_MS;
    const lastAutoSyncAt = await getLastProviderLimitsAutoSyncTime();

    if (lastAutoSyncAt) {
      const lastRunMs = Date.parse(lastAutoSyncAt);
      if (Number.isFinite(lastRunMs)) {
        const elapsedMs = Date.now() - lastRunMs;
        if (elapsedMs < intervalMs) {
          initialDelayMs = Math.max(intervalMs - elapsedMs, STARTUP_DELAY_MS);
        }
      }
    }

    if (!schedulerEnabled || startupSetup !== setup) return;
    startupTimer = setTimeout(() => {
      startupTimer = null;
      if (!schedulerEnabled) return;
      void runProviderLimitsSyncCycle();

      schedulerTimer = setInterval(() => {
        if (schedulerEnabled) void runProviderLimitsSyncCycle();
      }, intervalMs);
      schedulerTimer.unref?.();
    }, initialDelayMs);

    startupTimer.unref?.();
  })();
  startupSetup = setup;
  void setup.then(
    () => {
      if (startupSetup === setup) startupSetup = null;
    },
    (error) => {
      console.warn("[ProviderLimitsSync] Scheduler setup failed:", (error as Error).message);
      if (startupSetup === setup) {
        startupSetup = null;
        schedulerEnabled = false;
      }
    }
  );
}

export function stopProviderLimitsSyncScheduler(): void {
  schedulerEnabled = false;
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export async function drainProviderLimitsSyncScheduler(): Promise<void> {
  while (startupSetup || activeCycle) {
    await Promise.allSettled([startupSetup, activeCycle].filter(Boolean) as Promise<void>[]);
  }
}
