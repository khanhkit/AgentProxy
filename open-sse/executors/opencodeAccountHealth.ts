/**
 * opencodeAccountHealth.ts — rotation-health writes for the opencode executor loop.
 *
 * Extracted from the executor so the rules that decide when an account's failure
 * history moves live in one place, next to their rationale, instead of being
 * inlined at every call site in the rotation loop.
 */
import {
  type RotatableAccount,
  markCooldown as markAccountCooldown,
  markSuccess as markAccountSuccess,
} from "./accountRotation.ts";
import { hasProxyRefusals, noteProxyServed, proxyEgressKey } from "../utils/proxyRefusalMemory.ts";

type ProxiedAccount = RotatableAccount & { proxy: { host: string; port: number } | null };

export function markCooldown(
  account: ProxiedAccount,
  kind: "transient" | "terminal" = "transient"
): void {
  markAccountCooldown(account, kind);
}

/** A received response proves the proxy served, but says nothing about account health. */
export function noteResponseServed(account: ProxiedAccount): void {
  if (hasProxyRefusals()) noteProxyServed(proxyEgressKey(account.proxy));
}

export function markSuccess(account: ProxiedAccount): void {
  markAccountSuccess(account);
  noteResponseServed(account);
}

/** Only an HTTP success clears account failure history; non-2xx merely proves the route responded. */
export function markOutcome(account: ProxiedAccount, response: Response): void {
  if (response.ok) markSuccess(account);
  else noteResponseServed(account);
}
