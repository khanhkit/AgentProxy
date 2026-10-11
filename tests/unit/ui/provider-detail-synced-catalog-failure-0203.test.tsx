// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/store/notificationStore", () => ({
  useNotificationStore: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const { useProviderModels } =
  await import("@/app/(dashboard)/dashboard/providers/[id]/hooks/useProviderModels");

afterEach(() => vi.unstubAllGlobals());

it("failed model sync invalidates a previously authoritative provider catalog", async () => {
  let failSync = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.startsWith("/api/provider-models?")) {
        return { ok: true, json: async () => ({ models: [], modelCompatOverrides: [] }) };
      }
      if (input.startsWith("/api/synced-available-models?")) {
        return { ok: !failSync, json: async () => ({ models: ["model-a"], authoritative: true }) };
      }
      throw new Error(`Unexpected request: ${input}`);
    })
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let current!: ReturnType<typeof useProviderModels>;
  function Harness() {
    current = useProviderModels("provider-a", false);
    return null;
  }
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await current.fetchProviderModelMeta();
    });
    expect(current.syncedCatalogAuthoritative).toBe(true);
    failSync = true;
    await act(async () => {
      await current.fetchProviderModelMeta();
    });
    expect(current.syncedCatalogAuthoritative).toBe(false);
    expect(current.syncedAvailableModels).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
