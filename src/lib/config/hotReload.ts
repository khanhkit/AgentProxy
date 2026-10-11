import fs from "node:fs";
import path from "node:path";
import { SQLITE_FILE } from "@/lib/db/core";
import { getSettingsCandidate, type SettingsCandidate } from "@/lib/db/settings";
import { applyRuntimeSettingsCandidate, type RuntimeReloadChange } from "./runtimeSettings";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 1_000;

type PendingReload = { source: string; candidate: SettingsCandidate };

let activeCheck: Promise<void> | null = null;
let activeRevision: number | null = null;
let queuedReload: PendingReload | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let sqliteWatcher: fs.FSWatcher | null = null;

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

async function runHotReloadCheck(source: string, candidate: SettingsCandidate) {
  const changes = await applyRuntimeSettingsCandidate(candidate, { source });
  logChanges(source, changes);
}

function queueCapturedReload(source: string, candidate: SettingsCandidate) {
  if (activeCheck) {
    if (activeRevision !== null && candidate.revision < activeRevision) return;
    if (queuedReload && candidate.revision < queuedReload.candidate.revision) return;
    queuedReload = { source, candidate };
    return;
  }

  activeRevision = candidate.revision;
  activeCheck = runHotReloadCheck(source, candidate)
    .catch((error) => {
      console.warn(
        `[HOT_RELOAD] Runtime config reload failed for ${source} revision=${candidate.revision}:`,
        error instanceof Error ? error.message : error
      );
    })
    .finally(() => {
      activeCheck = null;
      activeRevision = null;
      if (!queuedReload) return;
      const next = queuedReload;
      queuedReload = null;
      queueCapturedReload(next.source, next.candidate);
    });
}

async function captureAndQueueHotReloadCheck(source: string) {
  try {
    queueCapturedReload(source, await getSettingsCandidate());
  } catch (error) {
    console.warn(
      `[HOT_RELOAD] Runtime config candidate read failed for ${source}:`,
      error instanceof Error ? error.message : error
    );
  }
}

function queueHotReloadCheck(source: string) {
  void captureAndQueueHotReloadCheck(source);
}

export function startRuntimeConfigHotReload(options: { pollIntervalMs?: number } = {}) {
  if (pollTimer || sqliteWatcher) return;

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
        const normalizedFilename = typeof filename === "string" ? filename : filename?.toString();
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

export function stopRuntimeConfigHotReloadForTests() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  sqliteWatcher?.close();
  sqliteWatcher = null;
  queuedReload = null;
  activeRevision = null;
  activeCheck = null;
}
