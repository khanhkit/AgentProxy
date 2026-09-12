import { isTrustedLoopbackInternalServiceRequest } from "../api/internalServiceAuth.ts";
import { createRustCoreSnapshotVersioner } from "./snapshotBuilder.ts";

type SnapshotHandlerDeps = {
  getConnections: () => Promise<unknown[]>;
  getApiKeys?: () => Promise<unknown[]>;
  getEnvApiKey?: () => string | null;
  getCodexCatalogModels?: () => string[];
  getCodexNativeModels?: () => string[];
};

export function createRustCoreSnapshotHandler(deps: SnapshotHandlerDeps) {
  const versioner = createRustCoreSnapshotVersioner();

  return async function handleRustCoreSnapshot(request: Request): Promise<Response> {
    if (!isTrustedLoopbackInternalServiceRequest(request)) {
      return Response.json(
        { error: { code: "RUST_CORE_FORBIDDEN", message: "Rust core snapshot requires trusted loopback access" } },
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
    return Response.json(snapshot, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  };
}
