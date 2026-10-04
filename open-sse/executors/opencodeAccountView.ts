import type { ScopedAccount, ScopedAccountHealth } from "./opencodeAccountScope.ts";
import type { RotationAccountSnapshot } from "./accountRotation.ts";
import { maskAccountId } from "./accountRotation.ts";

export function buildAccountView(store: Map<string, ScopedAccountHealth>): ScopedAccount[] {
  if (store.size === 0) {
    return [{ fingerprint: "", cooldownUntil: 0, consecutiveFails: 0, proxy: null }];
  }
  return [...store.entries()].map(([fingerprint]) => ({
    fingerprint,
    get cooldownUntil() {
      return store.get(fingerprint)?.cooldownUntil ?? 0;
    },
    set cooldownUntil(value: number) {
      const current = store.get(fingerprint) ?? { cooldownUntil: 0, consecutiveFails: 0 };
      store.set(fingerprint, { ...current, cooldownUntil: value });
    },
    get consecutiveFails() {
      return store.get(fingerprint)?.consecutiveFails ?? 0;
    },
    set consecutiveFails(value: number) {
      const current = store.get(fingerprint) ?? { cooldownUntil: 0, consecutiveFails: 0 };
      store.set(fingerprint, { ...current, consecutiveFails: value });
    },
    proxy: null as ScopedAccount["proxy"],
  }));
}

export function snapshotAccountEntries(
  accounts: ScopedAccount[],
  nowMs: number = Date.now()
): RotationAccountSnapshot[] {
  return accounts.map((account) => ({
    masked: maskAccountId(account.fingerprint),
    ready: account.cooldownUntil <= nowMs,
    cooldownUntilMs: account.cooldownUntil > nowMs ? account.cooldownUntil : null,
    consecutiveFails: account.consecutiveFails,
  }));
}

export function logSkippedCooldownAccounts(
  log: { info?: (...args: unknown[]) => void } | undefined,
  cid: string,
  skippedCooldown: Map<string, number>
): void {
  for (const [fingerprint, until] of skippedCooldown) {
    const remainingS = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    log?.info?.(
      "OPENCODE",
      `${cid}skipped account ${maskAccountId(fingerprint)} (cooling down, ${remainingS}s remaining)`
    );
  }
}
