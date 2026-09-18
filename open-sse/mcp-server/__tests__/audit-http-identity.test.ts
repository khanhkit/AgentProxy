import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setMcpHttpAuditApiKeyId,
  withMcpHttpAuthContext,
} from "../httpAuthContext.ts";
import { logToolCall } from "../audit.ts";

type MockAuditDb = {
  prepare: ReturnType<typeof vi.fn>;
  pragma: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  open?: boolean;
};

describe("AP-ISS-0016 MCP HTTP audit caller identity", () => {
  beforeEach(() => {
    delete process.env.OMNIROUTE_API_KEY_ID;
    globalThis.__omnirouteMcpAuditDb = undefined;
  });

  afterEach(() => {
    delete process.env.OMNIROUTE_API_KEY_ID;
    globalThis.__omnirouteMcpAuditDb = undefined;
    vi.restoreAllMocks();
  });

  it("keeps concurrent keyed HTTP audit ids distinct without persisting bearer tokens", async () => {
    const run = vi.fn();
    const mockDb: MockAuditDb = {
      prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run })),
      pragma: vi.fn(),
      close: vi.fn(),
      open: true,
    };
    globalThis.__omnirouteMcpAuditDb = mockDb as unknown as typeof globalThis.__omnirouteMcpAuditDb;

    const invoke = (rawToken: string, id: string, tool: string) =>
      withMcpHttpAuthContext(
        new Request("http://localhost/api/mcp", {
          headers: { authorization: `Bearer ${rawToken}` },
        }),
        async () => {
          setMcpHttpAuditApiKeyId(id);
          await Promise.resolve();
          await logToolCall(tool, { input: tool }, { ok: true }, 1, true);
        }
      );

    await Promise.all([
      invoke("raw-secret-token-a", "api-key-id-a", "tool-a"),
      invoke("raw-secret-token-b", "api-key-id-b", "tool-b"),
    ]);

    expect(run).toHaveBeenCalledTimes(2);
    const calls = run.mock.calls;
    const ids = calls.map((args) => args[4]).sort();
    expect(ids).toEqual(["api-key-id-a", "api-key-id-b"]);
    expect(JSON.stringify(calls)).not.toContain("raw-secret-token-a");
    expect(JSON.stringify(calls)).not.toContain("raw-secret-token-b");
  }, 30_000);

  it("keeps stdio/local env attribution distinct when no HTTP caller context exists", async () => {
    const run = vi.fn();
    const mockDb: MockAuditDb = {
      prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run })),
      pragma: vi.fn(),
      close: vi.fn(),
      open: true,
    };
    globalThis.__omnirouteMcpAuditDb = mockDb as unknown as typeof globalThis.__omnirouteMcpAuditDb;
    process.env.OMNIROUTE_API_KEY_ID = "stdio-static-id";

    await logToolCall("stdio-tool", {}, { ok: true }, 1, true);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[4]).toBe("stdio-static-id");
  }, 30_000);
});
