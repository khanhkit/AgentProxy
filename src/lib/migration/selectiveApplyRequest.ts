import {
  applySelectiveMigrationPlan,
  SelectiveMigrationApplyError,
  type SelectiveMigrationApplyDeps,
} from "./selectiveApply.ts";
import {
  buildSelectiveMigrationPlan,
  type MigrationEntityCategory,
  type MigrationEntityRef,
  type MigrationSourceEntity,
  type MigrationTargetEntity,
} from "./selectivePlan.ts";
import {
  handleSelectiveMigrationPreview,
  type SelectiveMigrationPreviewDeps,
} from "./selectivePreviewRequest.ts";

const MAX_SELECTION_ITEMS = 5000;
const MAX_SELECTION_JSON_CHARS = 1024 * 1024;

const VALID_CATEGORIES = new Set<MigrationEntityCategory>([
  "providerConnections",
  "providerNodes",
  "combos",
  "apiKeys",
  "settings",
  "modelAliases",
  "customModels",
  "pricing",
  "proxyConfig",
]);

export interface SelectiveMigrationApplyRequestDeps
  extends SelectiveMigrationPreviewDeps {
  readTargetEntities(): Promise<MigrationTargetEntity[]>;
  applyDeps: SelectiveMigrationApplyDeps;
}

interface PreviewResponsePayload {
  entities?: MigrationSourceEntity[];
  error?: string;
  [key: string]: unknown;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function parseSelection(raw: FormDataEntryValue | null): MigrationEntityRef[] {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_SELECTION_JSON_CHARS) {
    throw new Error("Invalid migration selection");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid migration selection");
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_SELECTION_ITEMS) {
    throw new Error("Invalid migration selection");
  }

  const seen = new Set<string>();
  const result: MigrationEntityRef[] = [];

  for (const item of parsed) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid migration selection");
    }
    const row = item as Record<string, unknown>;
    const category = row.category;
    const sourceId = row.sourceId;

    if (
      typeof category !== "string" ||
      !VALID_CATEGORIES.has(category as MigrationEntityCategory) ||
      typeof sourceId !== "string" ||
      !sourceId.trim()
    ) {
      throw new Error("Invalid migration selection");
    }

    const normalized: MigrationEntityRef = {
      category: category as MigrationEntityCategory,
      sourceId: sourceId.trim(),
    };
    const key = normalized.category + ":" + normalized.sourceId;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

function refKey(ref: MigrationEntityRef): string {
  return ref.category + ":" + ref.sourceId;
}

async function previewUploadedFile(
  file: File,
  deps: SelectiveMigrationApplyRequestDeps
): Promise<Response> {
  const form = new FormData();
  form.set("file", file);

  const previewRequest = new Request("http://localhost/api/settings/migration/preview", {
    method: "POST",
    body: form,
  });

  return handleSelectiveMigrationPreview(previewRequest, {
    isAuthRequired: async () => false,
    isAuthenticated: async () => true,
    openDatabase: deps.openDatabase,
    ...(deps.maxUploadBytes !== undefined ? { maxUploadBytes: deps.maxUploadBytes } : {}),
    ...(deps.tempDir !== undefined ? { tempDir: deps.tempDir } : {}),
  });
}

export async function handleSelectiveMigrationApplyRequest(
  request: Request,
  deps: SelectiveMigrationApplyRequestDeps
): Promise<Response> {
  if ((await deps.isAuthRequired(request)) && !(await deps.isAuthenticated(request))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "Migration apply requires multipart form data" }, 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid migration apply request" }, 400);
  }

  const candidate = formData.get("file");
  if (!(candidate instanceof File)) {
    return json({ error: "No migration source file provided" }, 400);
  }

  let selected: MigrationEntityRef[];
  try {
    selected = parseSelection(formData.get("selection"));
  } catch {
    return json({ error: "Invalid migration selection" }, 400);
  }

  const previewResponse = await previewUploadedFile(candidate, deps);
  const previewPayload = (await previewResponse.json()) as PreviewResponsePayload;
  if (!previewResponse.ok) {
    return json(
      { error: previewPayload.error ?? "Unable to preview migration source" },
      previewResponse.status
    );
  }

  const entities = Array.isArray(previewPayload.entities) ? previewPayload.entities : [];
  const sourceKeys = new Set(entities.map(refKey));
  if (selected.some((ref) => !sourceKeys.has(refKey(ref)))) {
    return json({ error: "Migration selection contains unknown source items" }, 400);
  }

  const target = await deps.readTargetEntities();
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected,
    target,
  });

  if (!plan.canApply) {
    return json(
      {
        error: "Migration plan has unresolved conflicts or dependencies",
        plan,
      },
      409
    );
  }

  try {
    const result = await applySelectiveMigrationPlan(plan, deps.applyDeps);
    return json({ plan, result });
  } catch (error) {
    if (error instanceof SelectiveMigrationApplyError) {
      return json(
        {
          error: "Migration apply failed",
          restorePointId: error.restorePointId,
          rolledBack: error.rolledBack,
        },
        500
      );
    }

    return json({ error: "Migration apply failed before completion" }, 500);
  }
}
