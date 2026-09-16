import { createHash } from "node:crypto";

import { isTrustedLoopbackInternalServiceRequest } from "../api/internalServiceAuth.ts";
import { createRustCoreSnapshotVersioner } from "./snapshotBuilder.ts";

type SnapshotHandlerDeps = {
  getConnections: () => Promise<unknown[]>;
  getApiKeys?: () => Promise<unknown[]>;
  getEnvApiKey?: () => string | null;
  getCodexCatalogModels?: () => string[];
  getCodexNativeModels?: () => string[];
};

function snapshotEtag(snapshot: { source_id: string; generation: number }): string {
  const digest = createHash("sha256")
    .update(snapshot.source_id)
    .update("\0")
    .update(String(snapshot.generation))
    .digest("base64url");
  return `"${digest}"`;
}

function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some((raw) => {
    const candidate = raw.trim();
    if (candidate === "*") return true;
    return candidate === etag || candidate.replace(/^W\//, "") === etag;
  });
}

export function createRustCoreSnapshotHandler(deps: SnapshotHandlerDeps) {
  const versioner = createRustCoreSnapshotVersioner();

  return async function handleRustCoreSnapshot(request: Request): Promise<Response> {
    if (!isTrustedLoopbackInternalServiceRequest(request)) {
      return Response.json(
        {
          error: {
            code: "RUST_CORE_FORBIDDEN",
            message: "Rust core snapshot requires trusted loopback access",
          },
        },
        { status: 403, headers: { "cache-control": "no-store" } }
      );
    }

    const [rows, apiKeyRows] = await Promise.all([
      deps.getConnections(),
      deps.getApiKeys ? deps.getApiKeys() : Promise.resolve([]),
    ]);
    const snapshot = versioner.next(
      rows,
      Date.now(),
      apiKeyRows,
      deps.getEnvApiKey?.() ?? null,
      deps.getCodexCatalogModels?.() ?? [],
      deps.getCodexNativeModels?.() ?? []
    );
    const etag = snapshotEtag(snapshot);
    const headers = { "cache-control": "no-store", etag };
    if (matchesEtag(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers });
    }
    return Response.json(snapshot, {
      status: 200,
      headers,
    });
  };
}
