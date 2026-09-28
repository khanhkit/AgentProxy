import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/db/core";
import { getVersionManagerTool, upsertVersionManagerTool } from "@/lib/db/versionManager";
import { runNpm, InstallError } from "./utils";
import {
  assertManagedUpdateCompatibility,
  mergeManagedUpdateMetadata,
  resolveVerifiedNpmArtifact,
} from "./managedUpdatePolicy";

export const BIFROST_PACKAGE = "@maximhq/bifrost";
export const BIFROST_DEFAULT_PORT = 8080;
export const BIFROST_INSTALL_DIR = path.join(DATA_DIR, "services", "bifrost");

export interface InstallResult {
  installedVersion: string;
  installPath: string;
  durationMs: number;
}

export interface SpawnArgs {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

// In-memory latest-version cache, 1h TTL
let latestVersionCache: { value: string; expiresAt: number } | null = null;
const VERSION_CACHE_TTL_MS = 3_600_000;

// Resolve the install dir lazily from the *current* DATA_DIR so a runtime
// DATA_DIR override (operator env change, or a test's tmp-dir isolation) is
// honored — the module-level BIFROST_INSTALL_DIR const is frozen at import.
function getBifrostInstallDir(): string {
  return process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, "services", "bifrost")
    : BIFROST_INSTALL_DIR;
}

function getInstalledPkgPath(): string {
  return path.join(getBifrostInstallDir(), "node_modules", "@maximhq", "bifrost", "package.json");
}

function getBinPath(): string {
  return path.join(getBifrostInstallDir(), "node_modules", "@maximhq", "bifrost", "bin.js");
}

function getInstalledVersionSync(): string | null {
  try {
    const raw = fs.readFileSync(getInstalledPkgPath(), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

export async function getInstalledVersion(): Promise<string | null> {
  return getInstalledVersionSync();
}

export async function getLatestVersion(): Promise<string | null> {
  if (latestVersionCache && latestVersionCache.expiresAt > Date.now()) {
    return latestVersionCache.value;
  }
  try {
    const { stdout } = await runNpm(["view", BIFROST_PACKAGE, "version"], { timeoutMs: 30_000 });
    const version = stdout.trim();
    if (version) {
      latestVersionCache = { value: version, expiresAt: Date.now() + VERSION_CACHE_TTL_MS };
    }
    return version || null;
  } catch {
    return null;
  }
}

export async function install(version = "latest"): Promise<InstallResult> {
  const startMs = Date.now();
  const existingState = await getVersionManagerTool("bifrost");
  const previousVersion = await getInstalledVersion();
  const artifact = await resolveVerifiedNpmArtifact(BIFROST_PACKAGE, version);
  assertManagedUpdateCompatibility("bifrost", artifact.version, {
    pinnedVersion: existingState?.pinnedVersion ?? null,
    configOverrides: existingState?.configOverrides ?? null,
  });

  // Create install dir + minimal package.json (idempotent)
  fs.mkdirSync(BIFROST_INSTALL_DIR, { recursive: true });
  const hostPkgPath = path.join(BIFROST_INSTALL_DIR, "package.json");
  if (!fs.existsSync(hostPkgPath)) {
    fs.writeFileSync(
      hostPkgPath,
      JSON.stringify(
        { name: "agentproxy-bifrost-host", version: "0.0.0", private: true, dependencies: {} },
        null,
        2
      ),
      "utf8"
    );
  }

  await runNpm(
    ["install", `${BIFROST_PACKAGE}@${artifact.version}`, "--omit=dev", "--no-audit", "--no-fund"],
    // `--prefix` via `prefix` (→ npm_config_prefix env) so paths with spaces survive Windows shell
    { cwd: BIFROST_INSTALL_DIR, prefix: BIFROST_INSTALL_DIR }
  );

  const installedVersion = await getInstalledVersion();
  if (!installedVersion) {
    throw new InstallError(
      "Could not read installed version from node_modules/@maximhq/bifrost/package.json",
      "Bifrost instalado mas versão não pôde ser lida.",
      500
    );
  }
  if (installedVersion !== artifact.version) {
    throw new InstallError(
      `Installed Bifrost version ${installedVersion} does not match admitted version ${artifact.version}`,
      "A versão instalada do Bifrost não corresponde ao artefato verificado.",
      502
    );
  }

  await upsertVersionManagerTool({
    tool: "bifrost",
    installedVersion,
    pinnedVersion: existingState?.pinnedVersion ?? null,
    binaryPath: getBinPath(),
    status: "stopped",
    port: BIFROST_DEFAULT_PORT,
    configOverrides: mergeManagedUpdateMetadata(existingState?.configOverrides, {
      version: artifact.version,
      integrity: artifact.integrity,
      previousVersion,
    }),
  });

  // Invalidate cache so next getLatestVersion() re-fetches
  latestVersionCache = null;

  return {
    installedVersion,
    installPath: BIFROST_INSTALL_DIR,
    durationMs: Date.now() - startMs,
  };
}

export async function update(): Promise<InstallResult> {
  const latest = await getLatestVersion();
  if (!latest) {
    throw new InstallError(
      "Could not resolve latest Bifrost version",
      "Não foi possível resolver a versão mais recente do Bifrost.",
      502
    );
  }
  return install(latest);
}

/**
 * Bifrost's own bin.js validates BIFROST_TRANSPORT_VERSION against
 * /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/ or the literal "latest" - it does
 * NOT accept a bare semver string like "1.6.3". getInstalledVersionSync()
 * reads the raw "version" field straight out of package.json, which is
 * always bare semver (npm/package.json convention never includes the "v"
 * prefix), so passing it through unmodified made every embedded Bifrost
 * instance fail on startup with "Invalid transport version format".
 *
 * Normalize here, at the call site that owns the env var, so both
 * bifrost.ts and the upstream @maximhq/bifrost package can stay exactly as
 * they are otherwise designed to be used.
 */
export function formatTransportVersion(version: string | null): string {
  if (!version || version === "latest") return version ?? "latest";
  return version.startsWith("v") ? version : `v${version}`;
}

export function resolveSpawnArgs(port: number): SpawnArgs {
  const binPath = getBinPath();
  // Pin transport version to the installed npm version for reproducibility (spec §2b)
  const transportVersion = formatTransportVersion(getInstalledVersionSync());

  return {
    command: process.execPath,
    args: [
      binPath,
      "-port",
      String(port),
      "-host",
      "127.0.0.1",
      "-app-dir",
      BIFROST_INSTALL_DIR,
      "-log-level",
      "warn",
    ],
    env: {
      ...process.env,
      BIFROST_TRANSPORT_VERSION: transportVersion,
    },
    cwd: BIFROST_INSTALL_DIR,
  };
}
