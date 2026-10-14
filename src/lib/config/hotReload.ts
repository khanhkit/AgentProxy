import fs from "node:fs";
import path from "node:path";
import { SQLITE_FILE } from "@/lib/db/core";
import { getSettings } from "@/lib/db/settings";
import { applyRuntimeSettings, type RuntimeReloadChange } from "./runtimeSettings";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 1_000;

let activeCheck: Promise<void> | null = null;
let queuedSource: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let sqliteWatcher: fs.FSWatcher | null = null;
let reloadStopped = false;

function getPollIntervalMs() {
  const parsed = Number.parseInt(process.env.AGENTPROXY_CONFIG_HOT_RELOAD_MS || "", 10);
  if (!Number.isFinite(parsed) || parsed < MIN_POLL_INTERVAL_MS) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return parsed;
}

function isRelevantSqliteChange(filename: string | null): boolean {
  if (!filename || !SQLITE_FILE) return false;
  const baseName = path.basename(SQLITE_FILE);
  return filename === baseName || filename.startsWith(`${baseName}-`);
}

function logChanges(source: string, changes: RuntimeReloadChange[]) {
  if (changes.length === 0) return;
  console.log(
    `[HOT_RELOAD] source=${source} reloaded sections: ${changes
      .map((entry) => entry.section)
      .join(", ")}`
  );
}

async function runHotReloadCheck(source: string) {
  const settings = await getSettings();
  const changes = await applyRuntimeSettings(settings, { source });
  logChanges(source, changes);
}

function queueHotReloadCheck(source: string) {
  if (reloadStopped) return;
  if (activeCheck) {
    queuedSource = source;
    return;
  }

  activeCheck = runHotReloadCheck(source)
    .catch((error) => {
      console.warn(
        `[HOT_RELOAD] Runtime config reload failed for ${source}:`,
        error instanceof Error ? error.message : error
      );
    })
    .finally(() => {
      activeCheck = null;
      if (!queuedSource) return;
      const nextSource = queuedSource;
      queuedSource = null;
      queueHotReloadCheck(nextSource);
    });
}

export function startRuntimeConfigHotReload(options: { pollIntervalMs?: number } = {}) {
  if (pollTimer || sqliteWatcher) return;
  reloadStopped = false;

  const pollIntervalMs = Math.max(
    options.pollIntervalMs || getPollIntervalMs(),
    MIN_POLL_INTERVAL_MS
  );

  pollTimer = setInterval(() => {
    queueHotReloadCheck("hot-reload:poll");
  }, pollIntervalMs);
  if (typeof pollTimer === "object" && "unref" in pollTimer) {
    (pollTimer as { unref?: () => void }).unref?.();
  }

  if (SQLITE_FILE) {
    try {
      sqliteWatcher = fs.watch(path.dirname(SQLITE_FILE), (_eventType, filename) => {
        const normalizedFilename =
          filename === null || filename === undefined ? null : filename.toString();
        if (isRelevantSqliteChange(normalizedFilename || null)) {
          queueHotReloadCheck("hot-reload:fs-watch");
        }
      });
    } catch (error) {
      console.warn(
        "[HOT_RELOAD] SQLite file watch unavailable, polling only:",
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(
    `[HOT_RELOAD] Runtime config hot-reload started (poll=${pollIntervalMs}ms, fsWatch=${
      sqliteWatcher ? "on" : "off"
    })`
  );

  queueHotReloadCheck("hot-reload:start");
}

export function stopRuntimeConfigHotReload(): void {
  reloadStopped = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  sqliteWatcher?.close();
  sqliteWatcher = null;
  // Do not admit a queued follow-up after shutdown starts. An already-active
  // DB read/apply is awaited separately by drainRuntimeConfigHotReload().
  queuedSource = null;
}

export async function drainRuntimeConfigHotReload(): Promise<void> {
  while (activeCheck) await activeCheck;
}

export function stopRuntimeConfigHotReloadForTests() {
  stopRuntimeConfigHotReload();
  // Tests reset backing storage synchronously after this helper. Production
  // shutdown uses stopRuntimeConfigHotReload()+drainRuntimeConfigHotReload().
  activeCheck = null;
}
