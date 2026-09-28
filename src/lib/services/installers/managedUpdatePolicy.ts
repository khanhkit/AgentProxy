import { getVersionManagerTool } from "@/lib/db/versionManager";
import { InstallError, runNpm, SERVICE_VERSION_PATTERN, type NpmRunResult } from "./utils";

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SRI_PATTERN =
  /^sha(?:256|384|512)-[A-Za-z0-9+/=]+(?:\s+sha(?:256|384|512)-[A-Za-z0-9+/=]+)*$/;

export type VerifiedNpmArtifact = {
  version: string;
  integrity: string;
};

export type NpmMetadataRunner = (
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; prefix?: string }
) => Promise<NpmRunResult>;

export type ManagedUpdateCompatibilityState = {
  pinnedVersion?: string | null;
  configOverrides?: Record<string, unknown> | null;
};

export type ManagedUpdateMetadata = {
  version: string;
  integrity?: string;
  verification?: string;
  previousVersion: string | null;
  verifiedAt?: string;
};

function parseJsonScalar(stdout: string, field: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new InstallError(
      `Missing npm ${field} metadata`,
      `Metadados de ${field} ausentes para a atualização.`,
      502
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    value = trimmed;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new InstallError(
      `Missing npm ${field} metadata`,
      `Metadados de ${field} ausentes para a atualização.`,
      502
    );
  }
  return value.trim();
}

export async function resolveVerifiedNpmArtifact(
  packageName: string,
  selector: string,
  runner: NpmMetadataRunner = runNpm
): Promise<VerifiedNpmArtifact> {
  if (!SERVICE_VERSION_PATTERN.test(selector)) {
    throw new InstallError(
      `Invalid npm version selector: ${selector}`,
      "Versão solicitada é inválida.",
      400
    );
  }

  const versionResult = await runner(["view", `${packageName}@${selector}`, "version", "--json"], {
    timeoutMs: 30_000,
  });
  const version = parseJsonScalar(versionResult.stdout, "version");
  if (!EXACT_VERSION_PATTERN.test(version)) {
    throw new InstallError(
      `npm selector ${selector} did not resolve to an immutable version: ${version}`,
      "A versão publicada não pôde ser resolvida para uma versão imutável.",
      502
    );
  }

  // Bind the integrity lookup to the exact version resolved above. A mutable tag
  // moving between these two requests cannot change which artifact is admitted.
  const integrityResult = await runner(
    ["view", `${packageName}@${version}`, "dist.integrity", "--json"],
    { timeoutMs: 30_000 }
  );
  const integrity = parseJsonScalar(integrityResult.stdout, "integrity");
  if (!SRI_PATTERN.test(integrity)) {
    throw new InstallError(
      `Invalid or missing npm integrity metadata for ${packageName}@${version}`,
      "Metadados de integridade ausentes ou inválidos para a atualização.",
      502
    );
  }

  return { version, integrity };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function managedUpdateConfig(
  configOverrides: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const candidate = configOverrides?.managedUpdate;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : {};
}

export function assertManagedUpdateCompatibility(
  tool: string,
  version: string,
  state: ManagedUpdateCompatibilityState
): void {
  const pinnedVersion = state.pinnedVersion?.trim();
  if (pinnedVersion && version !== pinnedVersion) {
    throw new InstallError(
      `${tool} is pinned to ${pinnedVersion}; refusing ${version}`,
      `${tool} está fixado na versão ${pinnedVersion}.`,
      409
    );
  }

  const policy = managedUpdateConfig(state.configOverrides);
  const blockedVersions = asStringList(policy.blockedVersions);
  if (blockedVersions.includes(version)) {
    throw new InstallError(
      `${tool}@${version} is blocked by managed update compatibility policy`,
      `A versão ${version} de ${tool} está bloqueada pela política de compatibilidade.`,
      409
    );
  }

  const allowedVersions = asStringList(policy.allowedVersions);
  if (allowedVersions.length > 0 && !allowedVersions.includes(version)) {
    throw new InstallError(
      `${tool}@${version} is not present in the managed update allowlist`,
      `A versão ${version} de ${tool} não está na lista de compatibilidade permitida.`,
      409
    );
  }
}

export async function assertManagedUpdateCompatible(tool: string, version: string): Promise<void> {
  const state = await getVersionManagerTool(tool);
  assertManagedUpdateCompatibility(tool, version, {
    pinnedVersion: state?.pinnedVersion ?? null,
    configOverrides: state?.configOverrides ?? null,
  });
}

export function mergeManagedUpdateMetadata(
  existing: Record<string, unknown> | null | undefined,
  metadata: ManagedUpdateMetadata
): Record<string, unknown> {
  const priorManagedUpdate = managedUpdateConfig(existing);
  return {
    ...(existing ?? {}),
    managedUpdate: {
      ...priorManagedUpdate,
      version: metadata.version,
      ...(metadata.integrity ? { integrity: metadata.integrity } : {}),
      ...(metadata.verification ? { verification: metadata.verification } : {}),
      rollbackVersion: metadata.previousVersion,
      lastKnownGoodVersion: metadata.version,
      verifiedAt: metadata.verifiedAt ?? new Date().toISOString(),
    },
  };
}
