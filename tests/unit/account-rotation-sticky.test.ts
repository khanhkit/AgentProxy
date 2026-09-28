import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { pickAccount, type RotatableAccount } from "../../open-sse/executors/accountRotation.ts";
import {
  __resetProxyRefusalMemoryForTesting,
  noteProxyRefusal,
  noteProxyServed,
  proxyEgressKey,
} from "../../open-sse/utils/proxyRefusalMemory.ts";

function proxy(port: number): RotatableAccount["proxy"] {
  return { type: "http", host: "127.0.0.1", port };
}
function fleet(): RotatableAccount[] {
  return [
    { fingerprint: "m0", cooldownUntil: 0, consecutiveFails: 0, proxy: proxy(9001) },
    { fingerprint: "m1", cooldownUntil: 0, consecutiveFails: 0, proxy: proxy(9002) },
    { fingerprint: "m2", cooldownUntil: 0, consecutiveFails: 0, proxy: proxy(9003) },
  ];
}

beforeEach(() => {
  __resetProxyRefusalMemoryForTesting();
  process.env.PROXY_SKIP_RECENTLY_FAILED = "true";
});
afterEach(() => {
  __resetProxyRefusalMemoryForTesting();
  delete process.env.PROXY_SKIP_RECENTLY_FAILED;
});

test("#14202: refused cursor member is drained and last healthy member becomes sticky", () => {
  const accounts = fleet();
  const state: { nextAccountIdx: number; lastHealthyFingerprint?: string } = { nextAccountIdx: 0 };
  const first = pickAccount(accounts, state);
  assert.equal(first.fingerprint, "m0");
  const key1 = proxyEgressKey(accounts[1].proxy);
  assert.ok(noteProxyRefusal(key1, "ip_quota_429") !== null);
  const second = pickAccount(accounts, state);
  assert.equal(second.fingerprint, "m0");
});

test("#14202: store-refused member is skipped while another healthy member exists", () => {
  const accounts = fleet();
  assert.ok(noteProxyRefusal(proxyEgressKey(accounts[0].proxy), "ip_quota_429") !== null);
  assert.equal(pickAccount(accounts, { nextAccountIdx: 0 }).fingerprint, "m1");
});

test("#14202: flag-off remains plain round robin even with store history", () => {
  const accounts = fleet();
  assert.ok(noteProxyRefusal(proxyEgressKey(accounts[0].proxy), "ip_quota_429") !== null);
  delete process.env.PROXY_SKIP_RECENTLY_FAILED;
  const state: { nextAccountIdx: number; lastHealthyFingerprint?: string } = { nextAccountIdx: 0 };
  assert.equal(pickAccount(accounts, state).fingerprint, "m0");
  assert.equal(pickAccount(accounts, state).fingerprint, "m1");
  assert.equal(state.lastHealthyFingerprint, undefined);
});

test("#14202: all-refused saturation still returns an account", () => {
  const accounts = fleet();
  for (const account of accounts) {
    assert.ok(noteProxyRefusal(proxyEgressKey(account.proxy), "ip_quota_429") !== null);
  }
  assert.ok(accounts.includes(pickAccount(accounts, { nextAccountIdx: 0 })));
});

test("#14202: direct account is never drained and noteProxyServed releases set-aside", () => {
  const direct: RotatableAccount = { fingerprint: "direct", cooldownUntil: 0, consecutiveFails: 0, proxy: null };
  const proxied: RotatableAccount = { fingerprint: "m1", cooldownUntil: 0, consecutiveFails: 0, proxy: proxy(9002) };
  assert.equal(proxyEgressKey(direct.proxy), null);
  const key = proxyEgressKey(proxied.proxy);
  assert.ok(noteProxyRefusal(key, "ip_quota_429") !== null);
  assert.equal(pickAccount([direct, proxied], { nextAccountIdx: 0 }).fingerprint, "direct");
  noteProxyServed(key);
  assert.equal(pickAccount([proxied], { nextAccountIdx: 0 }).fingerprint, "m1");
});

test("#14202: custom readiness always overrides stickiness", () => {
  const accounts = fleet();
  const state: { nextAccountIdx: number; lastHealthyFingerprint?: string } = { nextAccountIdx: 0 };
  pickAccount(accounts, state);
  assert.equal(state.lastHealthyFingerprint, "m0");
  assert.ok(noteProxyRefusal(proxyEgressKey(accounts[1].proxy), "ip_quota_429") !== null);
  const picked = pickAccount(accounts, state, (account) => account.fingerprint !== "m0");
  assert.notEqual(picked.fingerprint, "m0");
});
