/**
 * Runtime state for Traffic Inspector capture modes.
 *
 * HTTP-proxy/TLS toggles are process-local. System-proxy state additionally has
 * a crash-safe authenticated recovery record because the OS mutation outlives
 * this process and must be reversible after SIGKILL/restart.
 *
 * Exported mutation functions are the single write path so all route handlers
 * stay stateless.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  applyOwnerOnlyPermissionsSync,
  repairOwnerOnlyFileSync,
} from "@/lib/security/ownerOnlyFile";
import { resolveMitmDataDir } from "@/mitm/dataDir";
import {
  isPreviousStateValidForCurrentPlatform,
  type PreviousState,
} from "@/mitm/inspector/systemProxyConfig";
import type { HttpProxyServerHandle } from "@/mitm/inspector/httpProxyServer";

// ── HTTP Proxy ──────────────────────────────────────────────────────────────

let httpProxyHandle: HttpProxyServerHandle | null = null;

export function getHttpProxyHandle(): HttpProxyServerHandle | null {
  return httpProxyHandle;
}

export function setHttpProxyHandle(handle: HttpProxyServerHandle | null): void {
  httpProxyHandle = handle;
}

// ── System Proxy ────────────────────────────────────────────────────────────

interface SystemProxyState {
  applied: boolean;
  port: number | null;
  guardUntil: string | null; // ISO 8601
  previousState: PreviousState | null;
}

interface SystemProxyRecoveryPayload {
  version: 1;
  port: number;
  guardUntil: string;
  previousState: PreviousState;
}

interface SystemProxyRecoveryEnvelope {
  version: 1;
  payload: string;
  hmac: string;
}

const RECOVERY_VERSION = 1 as const;
const RECOVERY_FILE_NAME = "system-proxy-recovery.json";
const RECOVERY_KEY_FILE_NAME = ".system-proxy-recovery.key";
const MAX_TIMER_DELAY_MS = 2_147_000_000;

let systemProxyState: SystemProxyState = {
  applied: false,
  port: null,
  guardUntil: null,
  previousState: null,
};

let guardTimer: ReturnType<typeof setTimeout> | null = null;

function recoveryPaths() {
  const dir = path.join(resolveMitmDataDir(), "mitm");
  return {
    dir,
    recordPath: path.join(dir, RECOVERY_FILE_NAME),
    keyPath: path.join(dir, RECOVERY_KEY_FILE_NAME),
  };
}

function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Windows/non-POSIX filesystems may not implement chmod semantics.
  }
}

function fsyncParentDir(dir: string): void {
  let fd: number | null = null;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch {
    // Directory fsync is not supported uniformly (notably on Windows).
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // already closed / unsupported
      }
    }
  }
}

function atomicWritePrivateFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  ensurePrivateDir(dir);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, "wx", 0o600);
    applyOwnerOnlyPermissionsSync(tmpPath);
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
    applyOwnerOnlyPermissionsSync(filePath);
    fsyncParentDir(dir);
  } catch (error) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // temp file may not exist
    }
    throw error;
  }
}

function readRecoveryKey(createIfMissing: boolean): Buffer | null {
  const { dir, keyPath, recordPath } = recoveryPaths();
  ensurePrivateDir(dir);

  if (!fs.existsSync(keyPath)) {
    if (!createIfMissing) return null;
    if (fs.existsSync(recordPath)) {
      throw new Error("System proxy recovery record exists but its authentication key is missing");
    }
    atomicWritePrivateFile(keyPath, randomBytes(32).toString("hex"));
  }

  let raw: string;
  try {
    repairOwnerOnlyFileSync(keyPath);
    const stat = fs.lstatSync(keyPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("System proxy recovery authentication key is not a regular file");
    }
    raw = fs.readFileSync(keyPath, "utf8").trim();
  } catch (error) {
    if (createIfMissing) throw error;
    return null;
  }

  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    if (createIfMissing) throw new Error("System proxy recovery authentication key is invalid");
    return null;
  }
  return Buffer.from(raw, "hex");
}

function recoveryHmac(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

function constantTimeHexEqual(expectedHex: string, actualHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expectedHex) || !/^[0-9a-f]{64}$/i.test(actualHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validateRecoveryPayload(value: unknown): value is SystemProxyRecoveryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (payload.version !== RECOVERY_VERSION) return false;
  if (
    typeof payload.port !== "number" ||
    !Number.isInteger(payload.port) ||
    payload.port <= 0 ||
    payload.port > 65535
  ) {
    return false;
  }
  if (typeof payload.guardUntil !== "string" || !Number.isFinite(Date.parse(payload.guardUntil))) {
    return false;
  }
  return isPreviousStateValidForCurrentPlatform(payload.previousState);
}

function loadRecoveryPayload(): SystemProxyRecoveryPayload | null {
  const { recordPath } = recoveryPaths();
  if (!fs.existsSync(recordPath)) return null;

  const key = readRecoveryKey(false);
  if (!key) return null;

  try {
    repairOwnerOnlyFileSync(recordPath);
    const stat = fs.lstatSync(recordPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const envelope = JSON.parse(fs.readFileSync(recordPath, "utf8")) as unknown;
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
    const record = envelope as Record<string, unknown>;
    if (
      record.version !== RECOVERY_VERSION ||
      typeof record.payload !== "string" ||
      typeof record.hmac !== "string"
    ) {
      return null;
    }
    const expected = recoveryHmac(key, record.payload);
    if (!constantTimeHexEqual(expected, record.hmac)) return null;
    const payload = JSON.parse(record.payload) as unknown;
    return validateRecoveryPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

function persistRecoveryPayload(payload: SystemProxyRecoveryPayload): void {
  const { recordPath } = recoveryPaths();
  // Never overwrite an unresolved record, even if it is malformed. A stale or
  // tampered recovery artifact needs explicit operator repair/removal rather than
  // silently discarding the only evidence of a prior OS mutation.
  if (fs.existsSync(recordPath)) {
    throw new Error(
      "Pending system proxy recovery state exists; revert or repair it before applying again"
    );
  }
  const key = readRecoveryKey(true);
  if (!key) throw new Error("Unable to create system proxy recovery authentication key");
  const serialized = JSON.stringify(payload);
  const envelope: SystemProxyRecoveryEnvelope = {
    version: RECOVERY_VERSION,
    payload: serialized,
    hmac: recoveryHmac(key, serialized),
  };
  atomicWritePrivateFile(recordPath, JSON.stringify(envelope));
}

function scheduleGuardTimer(): void {
  if (guardTimer) {
    clearTimeout(guardTimer);
    guardTimer = null;
  }
  const guardUntil = systemProxyState.guardUntil;
  if (!systemProxyState.applied || !guardUntil) return;

  const remaining = Date.parse(guardUntil) - Date.now();
  if (!Number.isFinite(remaining)) return;
  if (remaining > MAX_TIMER_DELAY_MS) {
    guardTimer = setTimeout(scheduleGuardTimer, MAX_TIMER_DELAY_MS);
    guardTimer.unref?.();
    return;
  }

  guardTimer = setTimeout(
    () => {
      const ps = systemProxyState.previousState;
      if (!ps) return;
      // Import lazily to avoid a static cycle. Keep the durable record until the
      // OS restore succeeds; a failed restore must remain retryable by Repair.
      void import("@/mitm/inspector/systemProxyConfig")
        .then(async ({ revert }) => {
          await revert(ps);
          clearSystemProxy();
        })
        .catch(() => {
          /* best-effort; durable recovery record remains for retry */
        });
    },
    Math.max(0, remaining)
  );
  guardTimer.unref?.();
}

function hydrateSystemProxyStateFromRecovery(): void {
  if (systemProxyState.applied) return;
  const recovered = loadRecoveryPayload();
  if (!recovered) return;
  systemProxyState = {
    applied: true,
    port: recovered.port,
    guardUntil: recovered.guardUntil,
    previousState: recovered.previousState,
  };
  scheduleGuardTimer();
}

export function getSystemProxyState(): Readonly<SystemProxyState> {
  hydrateSystemProxyStateFromRecovery();
  return { ...systemProxyState };
}

/**
 * Persist the prior OS proxy state before the caller performs the first system
 * proxy mutation. The record is HMAC-authenticated, owner-only where the
 * platform supports POSIX modes, fsync'd, and atomically renamed into place.
 */
export function setSystemProxyApplied(
  port: number,
  previousState: PreviousState,
  guardMinutes: number
): void {
  if (
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    !Number.isInteger(guardMinutes) ||
    guardMinutes <= 0 ||
    !isPreviousStateValidForCurrentPlatform(previousState)
  ) {
    throw new Error("Invalid system proxy recovery state");
  }

  const guardUntil = new Date(Date.now() + guardMinutes * 60_000).toISOString();
  const payload: SystemProxyRecoveryPayload = {
    version: RECOVERY_VERSION,
    port,
    guardUntil,
    previousState,
  };
  persistRecoveryPayload(payload);
  systemProxyState = { applied: true, port, guardUntil, previousState };
  scheduleGuardTimer();
}

export function clearSystemProxy(): void {
  const { recordPath } = recoveryPaths();
  if (fs.existsSync(recordPath) && !systemProxyState.applied) {
    throw new Error(
      "Pending system proxy recovery state cannot be cleared without a validated successful restore"
    );
  }
  try {
    fs.unlinkSync(recordPath);
    fsyncParentDir(path.dirname(recordPath));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }

  if (guardTimer) {
    clearTimeout(guardTimer);
    guardTimer = null;
  }
  systemProxyState = { applied: false, port: null, guardUntil: null, previousState: null };
}

// ── TLS Intercept ───────────────────────────────────────────────────────────

let tlsInterceptEnabled = process.env.INSPECTOR_TLS_INTERCEPT === "true";

export function isTlsInterceptEnabled(): boolean {
  return tlsInterceptEnabled;
}

export function setTlsIntercept(enabled: boolean): void {
  tlsInterceptEnabled = enabled;
}
