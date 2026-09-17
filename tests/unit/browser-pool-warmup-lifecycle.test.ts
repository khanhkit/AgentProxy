import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

interface WarmupMockState {
  acquireCalls: number;
  pageCount: number;
  throwOnAcquire: boolean;
}

const originalPoolFlag = process.env.OMNIROUTE_BROWSER_POOL;
const state: WarmupMockState = {
  acquireCalls: 0,
  pageCount: 1,
  throwOnAcquire: false,
};
(globalThis as typeof globalThis & { __warmupMockState?: WarmupMockState }).__warmupMockState = state;

const mockModuleSource = `
const state = globalThis.__warmupMockState;
export async function acquireBrowserContext() {
  state.acquireCalls += 1;
  if (state.throwOnAcquire) throw new Error("synthetic acquire failure");
  return {
    id: "warmup-test",
    context: {
      async newPage() {
        state.pageCount += 1;
        return { async close() { state.pageCount -= 1; } };
      }
    },
    warmupPage: {},
    lastUsed: Date.now(),
    isStealth: false,
  };
}
export async function openPage(pooled) { return pooled.context.newPage(); }
export async function readPageResponseBody() { throw new Error("not used"); }
export async function startBoundedPageResponseCapture() { throw new Error("not used"); }
export async function releaseBrowserContext() {}
`;
const mockModuleUrl = `data:text/javascript,${encodeURIComponent(mockModuleSource)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./browserPool.ts" && context.parentURL?.includes("/browserBackedChat.ts")) {
      return { url: mockModuleUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { startBrowserWarmup } = await import(
  "../../packages/browser-pool/src/services/browserBackedChat.ts?warmup-lifecycle-test"
);

beforeEach(() => {
  process.env.OMNIROUTE_BROWSER_POOL = "on";
  state.acquireCalls = 0;
  state.pageCount = 1; // one context-owned warmup page
  state.throwOnAcquire = false;
});

after(() => {
  if (originalPoolFlag === undefined) delete process.env.OMNIROUTE_BROWSER_POOL;
  else process.env.OMNIROUTE_BROWSER_POOL = originalPoolFlag;
  delete (globalThis as typeof globalThis & { __warmupMockState?: WarmupMockState }).__warmupMockState;
});

test("repeated warmups keep the pooled context page count constant", async () => {
  for (let i = 0; i < 100; i++) {
    await startBrowserWarmup("provider-a", "https://provider.test/chat", "provider.test", null);
  }
  assert.equal(state.acquireCalls, 100);
  assert.equal(
    state.pageCount,
    1,
    "warmup must not add one unowned page per call beyond the context-owned warmup page"
  );
});

test("already-cancelled warmup does not acquire browser resources", async () => {
  const controller = new AbortController();
  controller.abort();
  await startBrowserWarmup(
    "provider-cancelled",
    "https://provider.test/chat",
    "provider.test",
    controller.signal
  );
  assert.equal(state.acquireCalls, 0);
  assert.equal(state.pageCount, 1);
});

test("acquisition failure does not create an additional page", async () => {
  state.throwOnAcquire = true;
  await assert.rejects(
    startBrowserWarmup("provider-fail", "https://provider.test/chat", "provider.test", null),
    /synthetic acquire failure/
  );
  assert.equal(state.acquireCalls, 1);
  assert.equal(state.pageCount, 1);
});
