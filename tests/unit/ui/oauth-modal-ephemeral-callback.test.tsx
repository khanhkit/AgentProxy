// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (key: string) => key,
    }),
}));

import OAuthModal from "@/shared/components/OAuthModal";

type MockChannel = {
  name: string;
  onmessage: ((event: { data: unknown }) => void) | null;
  close: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

const roots: Array<{ root: Root; element: HTMLDivElement }> = [];
let channels: MockChannel[];
let fetchMock: ReturnType<typeof vi.fn>;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderModal() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const root = createRoot(element);
  roots.push({ root, element });
  act(() => {
    root.render(
      <OAuthModal
        isOpen
        provider="openai"
        providerInfo={{ name: "OpenAI" }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
  });
  return element;
}

describe("OAuthModal ephemeral state-scoped callback handoff", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    channels = [];
    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      close = vi.fn();
      postMessage = vi.fn();
      constructor(name: string) {
        this.name = name;
        channels.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    vi.spyOn(window, "open").mockImplementation(() => null);
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/oauth/openai/authorize")) {
        return new Response(
          JSON.stringify({
            authUrl: "https://auth.example/authorize",
            state: "expected-state",
            codeVerifier: "verifier-1",
            redirectUri: "http://localhost:1455/auth/callback",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/oauth/openai/exchange") {
        return new Response(JSON.stringify({ success: true, requestBody: init?.body }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("oauth_callback", JSON.stringify({ code: "stale-secret", timestamp: 1 }));
  });

  afterEach(() => {
    for (const { root, element } of roots.splice(0)) {
      act(() => root.unmount());
      element.remove();
    }
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("purges legacy storage and exchanges only from the expected state-scoped channel", async () => {
    renderModal();
    await flushEffects();

    expect(localStorage.getItem("oauth_callback")).toBeNull();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("oauth_callback:expected-state");

    await act(async () => {
      channels[0].onmessage?.({ data: { code: "good-code", state: "expected-state" } });
      await Promise.resolve();
    });

    const exchangeCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/oauth/openai/exchange");
    expect(exchangeCall).toBeTruthy();
    const body = JSON.parse(String((exchangeCall?.[1] as RequestInit).body));
    expect(body).toMatchObject({ code: "good-code", state: "expected-state" });
  });

  it("rejects a mismatched callback state before token exchange", async () => {
    const element = renderModal();
    await flushEffects();
    expect(channels).toHaveLength(1);

    await act(async () => {
      channels[0].onmessage?.({ data: { code: "stolen-code", state: "wrong-state" } });
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/oauth/openai/exchange")).toBe(false);
    expect(element.textContent).toContain("errorStateMismatch");
  });
});
