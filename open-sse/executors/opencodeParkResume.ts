/**
 * opencodeParkResume.ts — park-and-resume after repeated transient 429s.
 *
 * Leaf module: zero imports outside the executors layer
 * (sleepAbortable only — same pattern as opencodeRateLimited.ts).
 * Reads the pool-strain marker written by the pool watcher (read-only,
 * fail-closed) and exposes the park decision helpers for the opencode loop.
 */

import { isProxyAvoided, noteProxyRefusal, proxyEgressKey, proxySetAsideSeq } from "../utils/proxyRefusalMemory.ts";
import { maskAccountId, type RotatableAccount } from "./accountRotation.ts";
import { proxyKeyOf } from "./opencodeGeoBlock.ts";
import { runWithProxyContext } from "../utils/proxyFetch.ts";
import { noteResilienceAction } from "@/lib/usage/resilienceActionsContext.ts";
import { noteParkWait, noteReplayed, noteStoredFallback } from "./opencodeResilienceNotes.ts";
import type { ExecuteInput, ExecutorExecuteResult } from "./base.ts";
import * as egressPacing from "./opencodeEgressThrottle.ts";


/** Abort-aware sleep local to the park helper; current canonical main has no transient-backoff sleep export. */
export async function parkSleepAbortable(
  ms: number,
  signal?: AbortSignal | null
): Promise<boolean> {
  if (signal?.aborted) return false;
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Consecutive transient 429s before a request parks. */
export const BURST_PARK_THRESHOLD = 6;
/** Park duration once triggered. */
export const PARK_WAIT_MS = 120_000;
/** Heartbeat interval while parked (SSE comment frames). */
export const PARK_PING_MS = 15_000;
/** Replay legs after the park (single capped leg, sequential). */
export const PARK_PROBE_MAX = 3;
/** Freshness window of the pool-strain marker. */
export const STRAIN_MARKER_TTL_MS = 300_000;
/** Upper bound of a marker read. */
export const STRAIN_MARKER_MAX_BYTES = 1024;

export interface PoolStrainMarker {
  fresh: boolean;
  ttlLeftMs: number;
}

/** Default marker path — where the external pool watcher writes it. */
export const DEFAULT_POOL_STRAIN_MARKER_PATH = "/tmp/opencode-pool-strain.json";

/** Env-overridable marker path; trust is enforced before reading marker contents. */
export function poolStrainMarkerPath(): string {
  const override = process.env.OPENCODE_POOL_STRAIN_MARKER_PATH?.trim();
  return override && override !== "" ? override : DEFAULT_POOL_STRAIN_MARKER_PATH;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Read the pool-strain marker without touching the network. Fail-closed:
 * anything unreadable, unparsable or stale reports `{ fresh: false, ttlLeftMs: 0 }`
 * so the caller falls back to the 429 counter alone. Duration budget stays
 * anchored on `since` (the TTL the watcher auto-bounds), clamped to [0, ttl]:
 * a future marker never parks past the ceiling, a stale one never parks at all.
 */
export async function readPoolStrainMarker(
  markerPath: string = poolStrainMarkerPath(),
  nowMs: number = Date.now(),
  readFile: (path: string) => Promise<{ mtimeMs: number; text: string }> = defaultReadMarker
): Promise<PoolStrainMarker> {
  try {
    const { mtimeMs, text } = await readFile(markerPath);
    if (!Number.isFinite(mtimeMs) || nowMs - mtimeMs > STRAIN_MARKER_TTL_MS) {
      return { fresh: false, ttlLeftMs: 0 };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { fresh: false, ttlLeftMs: 0 };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { fresh: false, ttlLeftMs: 0 };
    }
    const record = parsed as Record<string, unknown>;
    const since =
      typeof record.since === "number" && Number.isFinite(record.since) ? record.since : mtimeMs;
    const ttl =
      typeof record.ttl_s === "number" && Number.isFinite(record.ttl_s) && record.ttl_s > 0
        ? record.ttl_s * 1000
        : STRAIN_MARKER_TTL_MS;
    const ttlLeftMs = clamp(since + ttl - nowMs, 0, ttl);
    if (ttlLeftMs <= 0) return { fresh: false, ttlLeftMs: 0 };
    return { fresh: true, ttlLeftMs };
  } catch {
    return { fresh: false, ttlLeftMs: 0 };
  }
}

function isOwnerLockedDown(mode: number, uid: number | undefined): boolean {
  if (typeof process.getuid !== "function") return true;
  if (uid !== process.getuid()) return false;
  return (mode & 0o022) === 0;
}

async function defaultReadMarker(markerPath: string): Promise<{ mtimeMs: number; text: string }> {
  const { lstat, open } = await import("node:fs/promises");
  const st = await lstat(markerPath);
  if (!st.isFile()) throw new Error("pool-strain marker is not a regular file");
  if (!isOwnerLockedDown(st.mode, st.uid)) {
    throw new Error("pool-strain marker is not owner-locked-down");
  }
  const handle = await open(markerPath, "r");
  try {
    const buffer = Buffer.alloc(STRAIN_MARKER_MAX_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, STRAIN_MARKER_MAX_BYTES, 0);
    return { mtimeMs: st.mtimeMs, text: buffer.toString("utf8", 0, bytesRead) };
  } finally {
    await handle.close();
  }
}

/** Park duration: capped at PARK_WAIT_MS and never past the marker budget. */
export function parkWaitMs(ttlLeftMs: number | null): number {
  if (ttlLeftMs === null) return PARK_WAIT_MS;
  return Math.min(PARK_WAIT_MS, Math.max(0, ttlLeftMs));
}

/**
 * Replay candidates: cooldown-ready accounts (bans included) that are not set
 * aside, least-recently-penalized first, capped at PARK_PROBE_MAX.
 */
export function replayCandidates<T extends RotatableAccount>(
  accounts: T[],
  nowMs = Date.now(),
  keyOfMember: (account: T) => string | null = (a) => proxyEgressKey(a.proxy)
): T[] {
  const ready = accounts.filter((a) => a.cooldownUntil <= nowMs);
  const fresh = ready.filter((a) => !isProxyAvoided(keyOfMember(a)));
  return (fresh.length > 0 ? fresh : ready)
    .sort((x, y) => {
      const sx = proxySetAsideSeq(keyOfMember(x)) ?? -1;
      const sy = proxySetAsideSeq(keyOfMember(y)) ?? -1;
      return sx - sy;
    })
    .slice(0, PARK_PROBE_MAX);
}

/** Executor surface the park runner needs (kept injectable for tests). */
export interface ParkDriver<TAccount extends RotatableAccount = RotatableAccount> {
  execute: (input: ExecuteInput) => Promise<ExecutorExecuteResult & { response: Response }>;
  markCooldown: (account: TAccount) => void;
  markSuccess: (account: TAccount) => void;
  sleep: (ms: number, signal?: AbortSignal | null) => Promise<boolean>;
  replayKeyOfMember?: (account: TAccount) => string | null;
}

export interface ParkBurstState {
  burstStreak: number;
  parked: boolean;
}

export type Parkable429Outcome =
  | { kind: "continue" }
  | { kind: "return"; result: ExecutorExecuteResult & { response: Response }; normalize: boolean };

export type PacedParkable429Outcome = Parkable429Outcome | { kind: "break" };

/** Keep #14290 pacing bookkeeping and park decisions out of the executor loop. */
export async function handlePacedParkable429<TAccount extends RotatableAccount>(args: {
  state: ParkBurstState;
  account: TAccount;
  skipRecentlyFailed: boolean;
  noteRefused?: () => number | null;
  release: (() => void) | null;
  pacing: egressPacing.EgressPacing;
  parkEnabled: boolean;
  driver: ParkDriver<TAccount> & { accounts: TAccount[] };
  input: ExecuteInput;
  result: ExecutorExecuteResult & { response: Response };
  log: ExecuteInput["log"];
  cid: string;
}): Promise<PacedParkable429Outcome> {
  const { state, account, skipRecentlyFailed, parkEnabled } = args;
  args.driver.markCooldown(account);
  const setAsideMs = args.noteRefused
    ? args.noteRefused()
    : egressPacing.noteRefusedMember(account.proxy, skipRecentlyFailed);
  const arm = await egressPacing.settle429Arm(args.release, args.pacing, args.result.response);
  egressPacing.log429Outcome(args.log, args.cid, arm, maskAccountId(account.fingerprint), setAsideMs);
  if (arm === "park") {
    if (!parkEnabled) return { kind: "break" };
    state.burstStreak = Math.max(state.burstStreak + 1, BURST_PARK_THRESHOLD);
  } else {
    state.burstStreak += 1;
  }
  if (state.parked || !parkEnabled) return { kind: "continue" };
  const marker = await readPoolStrainMarker();
  if (state.burstStreak < BURST_PARK_THRESHOLD && !marker.fresh) return { kind: "continue" };
  state.parked = true;
  args.log?.warn?.("OPENCODE", `${args.cid}burstStreak=${state.burstStreak} freshD2=${marker.fresh} park`);
  const parkStartMs = Date.now();
  const replay = await runParkAndReplay(
    args.driver,
    args.input,
    parkWaitMs(marker.fresh ? marker.ttlLeftMs : null),
    args.result,
    args.log,
    args.cid
  );
  noteParkWait(Date.now() - parkStartMs);
  if (!replay) return { kind: "continue" };
  if (!args.input.stream) {
    if (replay === args.result) noteStoredFallback();
    else noteReplayed();
  }
  return { kind: "return", result: replay === args.result ? args.result : replay, normalize: true };
}

/** Keep the repeated-429 decision tree out of the main executor loop. */
export async function handleParkable429<TAccount extends RotatableAccount>(args: {
  state: ParkBurstState;
  account: TAccount;
  triedKeys: Set<string>;
  skipRecentlyFailed: boolean;
  parkEnabled: boolean;
  driver: ParkDriver<TAccount> & { accounts: TAccount[] };
  input: ExecuteInput;
  result: ExecutorExecuteResult & { response: Response };
  log: ExecuteInput["log"];
  cid: string;
}): Promise<Parkable429Outcome> {
  const { state, account, triedKeys, skipRecentlyFailed, parkEnabled } = args;
  args.driver.markCooldown(account);
  const key = proxyKeyOf(account.proxy);
  if (key !== null) triedKeys.add(key);
  const setAsideMs = skipRecentlyFailed
    ? noteProxyRefusal(proxyEgressKey(account.proxy), "ip_quota_429")
    : null;
  args.log?.warn?.(
    "OPENCODE",
    `${args.cid}Rate limited (429) on account ${maskAccountId(account.fingerprint)} (proxy ${key ?? "direct"})` +
      (setAsideMs ? `, member set aside for ${Math.round(setAsideMs / 1000)}s` : "") +
      ", rotating to next…"
  );
  state.burstStreak += 1;
  if (state.parked || !parkEnabled) return { kind: "continue" };
  const marker = await readPoolStrainMarker();
  if (state.burstStreak < BURST_PARK_THRESHOLD && !marker.fresh) return { kind: "continue" };
  state.parked = true;
  args.log?.warn?.(
    "OPENCODE",
    `${args.cid}burstStreak=${state.burstStreak} freshD2=${marker.fresh} park`
  );
  const parkStartMs = Date.now();
  const replay = await runParkAndReplay(
    args.driver,
    args.input,
    parkWaitMs(marker.fresh ? marker.ttlLeftMs : null),
    args.result,
    args.log,
    args.cid
  );
  noteParkWait(Date.now() - parkStartMs);
  if (!replay) return { kind: "continue" };
  if (!args.input.stream) {
    if (replay === args.result) noteStoredFallback();
    else noteReplayed();
  }
  return { kind: "return", result: replay === args.result ? args.result : replay, normalize: true };
}

/**
 * Park-and-resume runner (leaf-owned so opencode.ts stays under its cap).
 * Streaming: returns the UNIQUE SSE response immediately — its producer emits
 * `:ping` heartbeats while parked, replays one capped leg, then copies the
 * final body into the same stream. Non-streaming: waits, replays, and returns
 * the final response. A client abort (or zero replay candidates) surfaces
 * `fallback` with no further route call.
 */
export async function runParkAndReplay<TAccount extends RotatableAccount>(
  driver: ParkDriver<TAccount> & { accounts: TAccount[] },
  input: ExecuteInput,
  waitMs: number,
  fallback: ExecutorExecuteResult & { response: Response },
  log: ExecuteInput["log"],
  cid: string
): Promise<(ExecutorExecuteResult & { response: Response }) | null> {
  if (input.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const ping = (): void => {
          try {
            controller.enqueue(encoder.encode(":ping\n\n"));
          } catch {
            /* consumer gone — the abort check below ends the park */
          }
        };
        const ready = await parkWithHeartbeat(waitMs, input.signal, ping, driver.sleep);
        if (!ready) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }
        const probe = await replayOneLeg(driver, input, driver.accounts, log, cid);
        const finalBody = probe?.result.response ?? fallback.response;
        let recopied = true;
        try {
          controller.enqueue(encoder.encode(await finalBody.text()));
        } catch {
          recopied = false;
        }
        if (probe == null && fallback.response.status === 429) {
          noteResilienceAction({ stored429: true, replayed: false });
        } else if (probe != null && recopied) {
          noteResilienceAction({ replayed: true });
        } else if (probe != null) {
          noteResilienceAction({ replayed: false });
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      },
    });
    return {
      ...fallback,
      response: new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    };
  }
  const ready = await parkWithHeartbeat(waitMs, input.signal, () => undefined, driver.sleep);
  if (!ready) return fallback;
  const probe = await replayOneLeg(driver, input, driver.accounts, log, cid);
  if (probe === null) return fallback;
  driver.markSuccess(probe.account);
  return probe.result;
}

/**
 * One capped replay leg: up to PARK_PROBE_MAX sequential dispatches over the
 * replay candidates. Stops at the first non-429. Null when no candidate exists
 * or a dispatch threw — the caller then surfaces the last wave result untouched
 * (never an empty leg).
 */
export async function replayOneLeg<TAccount extends RotatableAccount>(
  driver: ParkDriver<TAccount>,
  input: ExecuteInput,
  accounts: TAccount[],
  log: ExecuteInput["log"],
  cid: string
): Promise<{
  account: TAccount;
  result: ExecutorExecuteResult & { response: Response };
} | null> {
  let last: {
    account: TAccount;
    result: ExecutorExecuteResult & { response: Response };
  } | null = null;
  for (const account of replayCandidates(accounts, Date.now(), driver.replayKeyOfMember)) {
    const masked = maskAccountId(account.fingerprint);
    const proxy = (account as { proxy?: { host?: string; port?: unknown } | null }).proxy;
    log?.info?.(
      "OPENCODE",
      `${cid}replay leg via account ${masked} after park` +
        (proxy ? ` through proxy ${proxy.host}:${String(proxy.port)}` : " direct")
    );
    try {
      const result = (await runWithProxyContext(proxy ?? null, () =>
        driver.execute({ ...input, skipUpstreamRetry: true })
      )) as ExecutorExecuteResult & { response: Response };
      last = { account, result };
      if (result.response.status !== 429) break;
    } catch {
      break;
    }
  }
  return last;
}

/**
 * Park then report readiness: emits SSE `:ping` comment frames every
 * PARK_PING_MS while waiting (abort-aware via sleepAbortable), and resolves
 * false as soon as the client signal aborts so the caller closes without any
 * further route call. The injected sleep keeps tests off real 120s timers.
 */
export async function parkWithHeartbeat(
  parkMs: number,
  signal: AbortSignal | null | undefined,
  onPing: () => void,
  sleep: (ms: number, signal?: AbortSignal | null) => Promise<boolean> = parkSleepAbortable
): Promise<boolean> {
  let waited = 0;
  while (waited < parkMs) {
    const step = Math.min(PARK_PING_MS, parkMs - waited);
    if (!(await sleep(step, signal ?? null))) return false;
    waited += step;
    onPing();
  }
  return true;
}
