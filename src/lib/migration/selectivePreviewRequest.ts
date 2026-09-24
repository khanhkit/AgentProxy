import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  previewJsonMigrationSource,
  previewSqliteMigrationSource,
  type MigrationPreviewPlan,
} from "./selectivePreview.ts";

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

interface PreviewSqliteAdapter {
  prepare(sql: string): {
    all?: () => unknown[];
    get?: () => unknown;
  };
  pragma(sql: string): unknown;
  close(): void;
}

export interface SelectiveMigrationPreviewDeps {
  isAuthRequired(request: Request): Promise<boolean>;
  isAuthenticated(request: Request): Promise<boolean>;
  openDatabase(
    filePath: string,
    options: { readonly: true }
  ): Promise<PreviewSqliteAdapter>;
  maxUploadBytes?: number;
  tempDir?: string;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function parseContentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isJsonName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".json");
}

function isSqliteName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".sqlite") || lower.endsWith(".db");
}

function hasSqliteHeader(buffer: Buffer): boolean {
  return buffer.length >= 16 && buffer.subarray(0, 16).toString("utf8") === "SQLite format 3\0";
}

function previewJson(rawText: string): Response {
  if (!rawText.trim()) return json({ error: "Empty request payload" }, 400);

  try {
    const plan = previewJsonMigrationSource(JSON.parse(rawText));
    return json(plan);
  } catch {
    return json({ error: "Unsupported or invalid migration JSON source" }, 400);
  }
}

function integrityOk(result: unknown): boolean {
  if (Array.isArray(result)) {
    return result.some(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        "integrity_check" in row &&
        (row as { integrity_check?: unknown }).integrity_check === "ok"
    );
  }
  return result === "ok";
}

export async function handleSelectiveMigrationPreview(
  request: Request,
  deps: SelectiveMigrationPreviewDeps
): Promise<Response> {
  if ((await deps.isAuthRequired(request)) && !(await deps.isAuthenticated(request))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const maxUploadBytes = deps.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const announcedSize = parseContentLength(request);
  if (announcedSize !== null && announcedSize > maxUploadBytes) {
    return json({ error: "File too large for migration preview" }, 400);
  }

  let tmpPath: string | null = null;
  let sourceDb: PreviewSqliteAdapter | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let fileName = "";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const candidate = formData.get("file");
      if (!(candidate instanceof File)) {
        return json({ error: "No migration source file provided" }, 400);
      }
      file = candidate;
      fileName = file.name;
      if (file.size > maxUploadBytes) {
        return json({ error: "File too large for migration preview" }, 400);
      }

      if (isJsonName(fileName)) {
        return previewJson(await file.text());
      }
      if (!isSqliteName(fileName)) {
        return json({ error: "Unsupported migration file type" }, 400);
      }
    } else if (contentType.includes("application/json")) {
      return previewJson(await request.text());
    } else {
      const url = new URL(request.url);
      fileName = url.searchParams.get("filename") ?? "";
      if (!isSqliteName(fileName)) {
        return json({ error: "Unsupported migration file type" }, 400);
      }
    }

    const buffer = file
      ? Buffer.from(await file.arrayBuffer())
      : Buffer.from(await request.arrayBuffer());

    if (buffer.length === 0) {
      return json({ error: "Empty migration source" }, 400);
    }
    if (buffer.length > maxUploadBytes) {
      return json({ error: "File too large for migration preview" }, 400);
    }
    if (!hasSqliteHeader(buffer)) {
      return json({ error: "Invalid SQLite migration source" }, 400);
    }

    const tempRoot = deps.tempDir ?? os.tmpdir();
    tmpPath = path.join(tempRoot, "agentproxy-migration-preview-" + randomUUID() + ".sqlite");
    await fs.writeFile(tmpPath, buffer);

    sourceDb = await deps.openDatabase(tmpPath, { readonly: true });
    if (!integrityOk(sourceDb.pragma("integrity_check"))) {
      return json({ error: "Migration source integrity check failed" }, 400);
    }

    let plan: MigrationPreviewPlan;
    try {
      plan = previewSqliteMigrationSource(sourceDb);
    } catch {
      return json({ error: "Unsupported SQLite migration source" }, 400);
    }
    return json(plan);
  } catch {
    return json({ error: "Unable to preview migration source" }, 400);
  } finally {
    try {
      sourceDb?.close();
    } catch {
      // best effort: the source DB is read-only and temporary
    }
    if (tmpPath) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // best effort cleanup
      }
    }
  }
}
