import fs from "fs/promises";
import path from "path";
import { resolveDataDir } from "@/lib/dataPaths";
import { getCliConfigPaths } from "@/shared/services/cliRuntime";

const BACKUP_DIR = path.join(resolveDataDir(), "backups");
const MAX_BACKUPS_PER_TOOL = 5;

/**
 * Resolve a path within BACKUP_DIR and verify it stays within bounds.
 * Throws if the resolved path escapes BACKUP_DIR (path traversal guard).
 */
function safePath(...segments: string[]): string {
  const resolved = path.resolve(BACKUP_DIR, ...segments);
  const base = path.resolve(BACKUP_DIR);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("Invalid path: directory traversal detected");
  }
  return resolved;
}

type BackupMetadata = {
  originalPath?: unknown;
  backupName?: unknown;
  toolId?: unknown;
  createdAt?: unknown;
};

function resolveCanonicalRestoreTarget(toolId: string, meta: BackupMetadata): string {
  if (meta.toolId !== toolId) {
    throw new Error("Backup metadata tool mismatch");
  }
  if (typeof meta.originalPath !== "string" || !meta.originalPath) {
    throw new Error("Backup metadata original path is missing");
  }
  if (!path.isAbsolute(meta.originalPath) || path.normalize(meta.originalPath) !== meta.originalPath) {
    throw new Error("Backup metadata original path is noncanonical");
  }

  const configPaths = getCliConfigPaths(toolId);
  if (!configPaths) {
    throw new Error(`Unknown backup tool: ${toolId}`);
  }

  const metadataPath = path.resolve(meta.originalPath);
  const canonicalTarget = Object.values(configPaths).find(
    (candidate) => typeof candidate === "string" && path.resolve(candidate) === metadataPath
  );
  if (!canonicalTarget) {
    throw new Error("Backup metadata destination does not match a canonical tool path");
  }
  return canonicalTarget;
}

async function assertNoSymlinkComponents(targetPath: string): Promise<void> {
  const absolute = path.resolve(targetPath);
  const root = path.parse(absolute).root;
  const segments = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;

  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error("Backup restore target contains a symbolic-link or junction component");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

/**
 * Get backup directory for a specific tool
 */
function getToolBackupDir(toolId: string) {
  return safePath(toolId);
}

/**
 * Ensure backup directory exists for a tool
 */
async function ensureBackupDir(toolId: string) {
  const dir = getToolBackupDir(toolId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Generate a backup filename with timestamp
 */
function makeBackupName(originalPath: string) {
  const ext = path.extname(originalPath);
  const base = path.basename(originalPath, ext);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${base}_${ts}${ext}`;
}

/**
 * Create a backup of a file before modifying it.
 * Returns the backup path, or null if the source doesn't exist.
 */
export async function createBackup(toolId: string, filePath: string) {
  try {
    await fs.access(filePath);
  } catch {
    // Source file doesn't exist — nothing to back up
    return null;
  }

  const dir = await ensureBackupDir(toolId);
  const backupName = makeBackupName(filePath);
  const backupPath = path.join(dir, backupName);

  await fs.copyFile(filePath, backupPath);

  // Save metadata alongside the backup
  const metaPath = backupPath + ".meta.json";
  await fs.writeFile(
    metaPath,
    JSON.stringify({
      originalPath: filePath,
      backupName,
      toolId,
      createdAt: new Date().toISOString(),
    })
  );

  // Enforce rotation (max backups per tool)
  await rotateBackups(toolId);

  return backupPath;
}

/**
 * Create backups for multiple files in one operation (e.g. Codex config.toml + auth.json).
 * Returns an array of backup paths.
 */
export async function createMultiBackup(toolId: string, filePaths: string[]) {
  const results: (string | null)[] = [];
  for (const filePath of filePaths) {
    const result = await createBackup(toolId, filePath);
    results.push(result);
  }
  return results;
}

/**
 * List all backups for a tool (sorted newest first).
 */
export async function listBackups(toolId: string) {
  const dir = getToolBackupDir(toolId);

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const metaFiles = entries.filter((e) => e.endsWith(".meta.json"));
  const backups: any[] = [];

  for (const metaFile of metaFiles) {
    try {
      const metaPath = path.join(dir, metaFile);
      const raw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);

      const backupFile = metaFile.replace(".meta.json", "");
      const backupPath = path.join(dir, backupFile);

      let size = 0;
      try {
        const stat = await fs.stat(backupPath);
        size = stat.size;
      } catch {
        // Backup file missing — skip
        continue;
      }

      backups.push({
        id: backupFile,
        toolId: meta.toolId,
        originalPath: meta.originalPath,
        createdAt: meta.createdAt,
        size,
      });
    } catch {
      // Corrupt meta — skip
    }
  }

  // Sort newest first
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return backups;
}

/**
 * Restore a backup by its id (filename).
 */
export async function restoreBackup(toolId: string, backupId: string) {
  const dir = getToolBackupDir(toolId);
  // Anchor backupId within the tool dir — prevent path traversal via backupId
  const backupPath = safePath(toolId, backupId);
  const metaPath = backupPath + ".meta.json";

  // Read metadata, then bind its destination to the trusted tool registry before
  // any filesystem mutation. Metadata selects only among canonical tool paths;
  // it never supplies the destination directly.
  let meta: BackupMetadata;
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    meta = JSON.parse(raw) as BackupMetadata;
  } catch {
    throw new Error(`Backup metadata not found: ${backupId}`);
  }
  const restoreTarget = resolveCanonicalRestoreTarget(toolId, meta);

  // Verify actual backup file exists
  try {
    await fs.access(backupPath);
  } catch {
    throw new Error(`Backup file not found: ${backupId}`);
  }

  // Reject symlink/junction indirection before the reversible backup or mkdir can
  // touch a destination outside the canonical lexical path.
  await assertNoSymlinkComponents(restoreTarget);

  // Before restoring, back up the current file (so restore is reversible)
  await createBackup(toolId, restoreTarget);

  // Copy backup over the canonical target. Re-check after mkdir so a newly
  // materialized parent chain is also free of symlink/junction components.
  const targetDir = path.dirname(restoreTarget);
  await fs.mkdir(targetDir, { recursive: true });
  await assertNoSymlinkComponents(restoreTarget);
  await fs.copyFile(backupPath, restoreTarget);

  return {
    restored: true,
    backupId,
    originalPath: restoreTarget,
  };
}

/**
 * Delete a specific backup by its id.
 */
export async function deleteBackup(toolId: string, backupId: string) {
  // Anchor backupId within the tool dir — prevent path traversal via backupId
  const backupPath = safePath(toolId, backupId);
  const metaPath = backupPath + ".meta.json";

  try {
    await fs.unlink(backupPath);
  } catch {
    // Already gone
  }
  try {
    await fs.unlink(metaPath);
  } catch {
    // Already gone
  }

  return { deleted: true, backupId };
}

/**
 * Enforce max backups per tool — removes oldest when limit exceeded.
 * Groups by original file basename so each config file gets its own rotation.
 */
async function rotateBackups(toolId: string) {
  const all = await listBackups(toolId);

  // Group by original file basename
  const groups: Record<string, any[]> = {};
  for (const b of all) {
    const key = path.basename(b.originalPath);
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }

  for (const [, group] of Object.entries(groups) as [string, any[]][]) {
    // Already sorted newest first
    if (group.length > MAX_BACKUPS_PER_TOOL) {
      const toDelete = group.slice(MAX_BACKUPS_PER_TOOL);
      for (const old of toDelete) {
        await deleteBackup(toolId, old.id);
      }
    }
  }
}
