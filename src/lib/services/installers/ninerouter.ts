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

export const NINEROUTER_PACKAGE = "9router";
export const NINEROUTER_INSTALL_DIR = path.join(DATA_DIR, "services", "9router");

const KNOWN_BAD_NINEROUTER_RELEASES = new Map<string, string>([
  [
    "0.5.75",
    "upstream 9Router #4020 reports rapid heap growth and fatal OOM under sustained workload",
  ],
]);

export function assertNinerouterReleaseAdmitted(version: string): void {
  const reason = KNOWN_BAD_NINEROUTER_RELEASES.get(version);
  if (!reason) return;
  throw new InstallError(
    `9router@${version} is blocked: ${reason}`,
    `A versão ${version} do 9router está bloqueada por uma regressão de memória conhecida.`,
    409
  );
}

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

function getServerPath(): string {
  return path.join(NINEROUTER_INSTALL_DIR, "node_modules", "9router", "app", "server.js");
}

function getInstalledPkgPath(): string {
  return path.join(NINEROUTER_INSTALL_DIR, "node_modules", "9router", "package.json");
}

export async function getInstalledVersion(): Promise<string | null> {
  try {
    const raw = fs.readFileSync(getInstalledPkgPath(), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

export async function getLatestVersion(): Promise<string | null> {
  if (latestVersionCache && latestVersionCache.expiresAt > Date.now()) {
    return latestVersionCache.value;
  }
  try {
    const { stdout } = await runNpm(["view", NINEROUTER_PACKAGE, "version"], { timeoutMs: 30_000 });
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
  const existingState = await getVersionManagerTool("9router");
  const previousVersion = await getInstalledVersion();
  const artifact = await resolveVerifiedNpmArtifact(NINEROUTER_PACKAGE, version);
  assertNinerouterReleaseAdmitted(artifact.version);
  assertManagedUpdateCompatibility("9router", artifact.version, {
    pinnedVersion: existingState?.pinnedVersion ?? null,
    configOverrides: existingState?.configOverrides ?? null,
  });

  // Create install dir + minimal package.json (idempotent)
  fs.mkdirSync(NINEROUTER_INSTALL_DIR, { recursive: true });
  const hostPkgPath = path.join(NINEROUTER_INSTALL_DIR, "package.json");
  if (!fs.existsSync(hostPkgPath)) {
    fs.writeFileSync(
      hostPkgPath,
      JSON.stringify(
        { name: "agentproxy-9router-host", version: "0.0.0", private: true, dependencies: {} },
        null,
        2
      ),
      "utf8"
    );
  }

  await runNpm(
    [
      "install",
      `${NINEROUTER_PACKAGE}@${artifact.version}`,
      "--omit=dev",
      "--no-audit",
      "--no-fund",
    ],
    // `--prefix` is passed via `prefix` (→ npm_config_prefix env) instead of an
    // argv path so an install dir with spaces survives the Windows shell (#5379).
    { cwd: NINEROUTER_INSTALL_DIR, prefix: NINEROUTER_INSTALL_DIR }
  );

  const installedVersion = await getInstalledVersion();
  if (!installedVersion) {
    throw new InstallError(
      "Could not read installed version from node_modules/9router/package.json",
      "9router instalado mas versão não pôde ser lida.",
      500
    );
  }
  if (installedVersion !== artifact.version) {
    throw new InstallError(
      `Installed 9router version ${installedVersion} does not match admitted version ${artifact.version}`,
      "A versão instalada do 9router não corresponde ao artefato verificado.",
      502
    );
  }

  await upsertVersionManagerTool({
    tool: "9router",
    installedVersion,
    pinnedVersion: existingState?.pinnedVersion ?? null,
    binaryPath: getServerPath(),
    status: "stopped",
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
    installPath: NINEROUTER_INSTALL_DIR,
    durationMs: Date.now() - startMs,
  };
}

export async function update(): Promise<InstallResult> {
  const latest = await getLatestVersion();
  if (!latest) {
    throw new InstallError(
      "Could not resolve latest 9router version",
      "Não foi possível resolver a versão mais recente do 9router.",
      502
    );
  }
  return install(latest);
}

export async function uninstall(): Promise<void> {
  const nmDir = path.join(NINEROUTER_INSTALL_DIR, "node_modules");
  if (fs.existsSync(nmDir)) {
    fs.rmSync(nmDir, { recursive: true, force: true });
  }
  await upsertVersionManagerTool({
    tool: "9router",
    status: "not_installed",
    installedVersion: null,
    binaryPath: null,
  });
}

export function resolveSpawnArgs(apiKey: string, port: number): SpawnArgs {
  const serverPath = getServerPath();
  // Next.js standalone dir ships its own node_modules — include them in NODE_PATH
  // so native addons (better-sqlite3) resolve correctly.
  const standaloneDir = path.dirname(serverPath);
  const bundledNm = path.join(standaloneDir, "node_modules");
  const existingNodePath = process.env.NODE_PATH ?? "";
  const nodePath = [bundledNm, existingNodePath].filter(Boolean).join(path.delimiter);

  return {
    command: process.execPath,
    args: ["--max-old-space-size=6144", serverPath],
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      // API_KEY_SECRET is the HMAC secret 9router uses to generate/validate API keys.
      // AgentProxy generates this secret and can derive valid keys from it.
      API_KEY_SECRET: apiKey,
      DATA_DIR: path.join(NINEROUTER_INSTALL_DIR, "data"),
      NODE_ENV: "production",
      NODE_PATH: nodePath,
      // Embedded mode: skip MITM proxy and cloud tunnel startup
      DISABLE_MITM: "true",
      DISABLE_TUNNEL: "true",
    },
    cwd: standaloneDir,
  };
}
