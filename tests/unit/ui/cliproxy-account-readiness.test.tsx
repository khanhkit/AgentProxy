// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { CliproxyAccountHealthCard } = await import(
  "../../../src/app/(dashboard)/dashboard/providers/services/components/CliproxyAccountHealthCard"
);

const mounted: Array<{ root: ReturnType<typeof createRoot>; el: HTMLDivElement }> = [];

function renderCard(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }))
  );
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<CliproxyAccountHealthCard />));
  mounted.push({ root, el });
  return el;
}

async function waitForText(el: HTMLElement, text: string, timeoutMs = 2_000) {
  const start = Date.now();
  while (!(el.textContent ?? "").includes(text)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${JSON.stringify(text)} in ${JSON.stringify(el.textContent)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

afterEach(() => {
  for (const { root, el } of mounted.splice(0)) {
    act(() => root.unmount());
    el.remove();
  }
  vi.unstubAllGlobals();
});

describe("CLIProxyAPI request readiness", () => {
  it("shows not-ready separately from reachable account-health data", async () => {
    const el = renderCard({
      state: "ready",
      ready: false,
      version: "7.5.0",
      accounts: [
        {
          authIndex: "cooling",
          provider: "codex",
          type: "codex",
          label: "Cooling account",
          status: "active",
          disabled: false,
          unavailable: true,
          createdAt: null,
          updatedAt: null,
          success: 0,
          failed: 1,
          recentRequests: [],
        },
      ],
    });

    await waitForText(el, "Request readiness");
    expect(el.textContent).toContain("Not ready");
    expect(el.textContent).toContain("Cooling account");
  });

  it("shows ready when at least one routed credential is usable", async () => {
    const el = renderCard({
      state: "ready",
      ready: true,
      version: "7.5.0",
      accounts: [
        {
          authIndex: "usable",
          provider: "codex",
          type: "codex",
          label: "Usable account",
          status: "active",
          disabled: false,
          unavailable: false,
          createdAt: null,
          updatedAt: null,
          success: 1,
          failed: 0,
          recentRequests: [],
        },
      ],
    });

    await waitForText(el, "Request readiness");
    expect(el.textContent).toContain("Ready");
    expect(el.textContent).toContain("Usable account");
  });
});
