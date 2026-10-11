// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/store/notificationStore", () => ({
  useNotificationStore: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/shared/components", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
const { default: CompatibleModelsSection } =
  await import("@/app/(dashboard)/dashboard/providers/[id]/components/CompatibleModelsSection");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it("late provider-A context overrides cannot replace provider-B overrides", async () => {
  const a = deferred<Response>();
  const b = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("provider=A")) return a.promise;
      if (url.includes("provider=B")) return b.promise;
      throw new Error(`Unexpected request: ${url}`);
    })
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    providerDisplayAlias: "test",
    modelAliases: {},
    availableModels: [{ id: "model-x", name: "Model X" }],
    allowImport: false,
    description: "",
    inputLabel: "Model",
    inputPlaceholder: "Model",
    onCopy: vi.fn(),
    onSetAlias: vi.fn(async () => {}),
    onDeleteAlias: vi.fn(),
    connections: [],
    onImportWithProgress: vi.fn(async () => {}),
    t: (key: string) => key,
    effectiveModelNormalize: () => false,
    effectiveModelPreserveDeveloper: () => true,
    getUpstreamHeadersRecord: () => ({}),
    saveModelCompatFlags: vi.fn(async () => {}),
    isModelHidden: () => false,
    onToggleHidden: vi.fn(async () => {}),
    onBulkToggleHidden: vi.fn(async () => {}),
  };
  try {
    await act(async () =>
      root.render(<CompatibleModelsSection {...props} providerStorageAlias="A" />)
    );
    await act(async () =>
      root.render(<CompatibleModelsSection {...props} providerStorageAlias="B" />)
    );
    await act(async () =>
      b.resolve({
        ok: true,
        json: async () => ({
          modelContextOverrides: [{ modelId: "model-x", contextWindowOverride: 222 }],
        }),
      } as Response)
    );
    expect(container.textContent).toContain("222");
    await act(async () =>
      a.resolve({
        ok: true,
        json: async () => ({
          modelContextOverrides: [{ modelId: "model-x", contextWindowOverride: 111 }],
        }),
      } as Response)
    );
    expect(container.textContent).toContain("222");
    expect(container.textContent).not.toContain("111");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
