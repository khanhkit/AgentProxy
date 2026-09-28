import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MCP audit runtime sqlite loader", () => {
  let dataDir: string;

  beforeEach(() => {
    vi.resetModules();
    globalThis.__omnirouteMcpAuditDb = undefined;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-mcp-audit-runtime-"));
    fs.writeFileSync(path.join(dataDir, "storage.sqlite"), "");
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    globalThis.__omnirouteMcpAuditDb = undefined;
    vi.doUnmock("../../../src/lib/db/adapters/runtimeRequire.ts");
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("loads better-sqlite3 through the standalone-safe runtime helper", async () => {
    class FakeDatabase {
      open = true;
      prepare(sql: string) {
        if (sql.includes("COUNT(*) as total") && sql.includes("AVG(duration_ms)")) {
          return {
            get: vi.fn(() => ({ total: 7, successRate: 0.75, avgDuration: 12 })),
            all: vi.fn(),
            run: vi.fn(),
          };
        }
        return {
          get: vi.fn(),
          all: vi.fn(() => [{ tool: "omniroute_get_health", count: 7 }]),
          run: vi.fn(),
        };
      }
      pragma() {}
      close() {}
    }

    const runtimeRequire = vi.fn(() => FakeDatabase);
    vi.doMock("../../../src/lib/db/adapters/runtimeRequire.ts", () => ({ runtimeRequire }));

    const audit = await import("../audit.ts");
    await expect(audit.getAuditStats()).resolves.toEqual({
      totalCalls: 7,
      successRate: 0.75,
      avgDurationMs: 12,
      topTools: [{ tool: "omniroute_get_health", count: 7 }],
    });
    expect(runtimeRequire).toHaveBeenCalledWith("better-sqlite3");
  }, 30000);
});
