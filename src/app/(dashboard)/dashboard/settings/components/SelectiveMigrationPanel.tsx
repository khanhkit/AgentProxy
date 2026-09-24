"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/components";

interface PreviewEntity {
  category: string;
  sourceId: string;
  label: string;
  disposition: string;
}

interface PreviewPayload {
  source?: {
    family?: string;
    format?: string;
    version?: string;
  };
  entities?: PreviewEntity[];
  unsupported?: Array<{
    category?: string;
    count?: number;
  }>;
  error?: string;
}

function entityKey(entity: Pick<PreviewEntity, "category" | "sourceId">): string {
  return entity.category + ":" + entity.sourceId;
}

function dispositionClass(disposition: string): string {
  if (disposition === "REQUIRES_REAUTH") return "text-amber-500";
  if (disposition === "KEEP_TARGET") return "text-blue-500";
  if (disposition === "CONFLICT" || disposition === "UNSUPPORTED") return "text-red-500";
  return "text-emerald-500";
}

export default function SelectiveMigrationPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);

  const entities = preview?.entities ?? [];
  const categories = Array.from(new Set(entities.map((entity) => entity.category))).sort();
  const selectedCount = selected.size;
  const reauthCount = entities.filter(
    (entity) =>
      selected.has(entityKey(entity)) && entity.disposition === "REQUIRES_REAUTH"
  ).length;

  const clear = () => {
    setSourceFile(null);
    setPreview(null);
    setSelected(new Set());
    setStatus(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const previewFile = async (file: File) => {
    setPreviewLoading(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/settings/migration/preview", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as PreviewPayload;
      if (!response.ok) {
        throw new Error(data.error || "Unable to preview migration source");
      }

      const nextEntities = Array.isArray(data.entities) ? data.entities : [];
      setSourceFile(file);
      setPreview(data);
      setSelected(new Set(nextEntities.map(entityKey)));
      setStatus({
        type: "info",
        message:
          nextEntities.length > 0
            ? `Previewed ${nextEntities.length} portable item(s). Review the selection before applying.`
            : "No portable migration items were found in this source.",
      });
    } catch (error) {
      setSourceFile(null);
      setPreview(null);
      setSelected(new Set());
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to preview migration source",
      });
    } finally {
      setPreviewLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void previewFile(file);
  };

  const toggle = (entity: PreviewEntity) => {
    const key = entityKey(entity);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(entities.map(entityKey)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const setCategorySelection = (category: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const entity of entities) {
        if (entity.category !== category) continue;
        const key = entityKey(entity);
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const apply = async () => {
    if (!sourceFile || selectedCount === 0) return;

    setApplyLoading(true);
    setStatus(null);
    try {
      const selection = entities
        .filter((entity) => selected.has(entityKey(entity)))
        .map(({ category, sourceId }) => ({ category, sourceId }));

      const form = new FormData();
      form.set("file", sourceFile);
      form.set("selection", JSON.stringify(selection));

      const response = await fetch("/api/settings/migration/apply", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        error?: string;
        restorePointId?: string | null;
        rolledBack?: boolean;
        plan?: {
          items?: Array<{
            category?: string;
            sourceId?: string;
            label?: string;
            disposition?: string;
            unresolvedDependencies?: Array<{ category?: string; sourceId?: string }>;
          }>;
        };
        result?: {
          restorePointId?: string | null;
          items?: Array<{ status?: string }>;
        };
      };

      if (!response.ok) {
        if (response.status === 409) {
          const blockers =
            data.plan?.items
              ?.filter(
                (item) =>
                  item.disposition === "CONFLICT" ||
                  (item.unresolvedDependencies?.length ?? 0) > 0
              )
              .map((item) => {
                const name = item.label || item.sourceId || item.category || "item";
                const deps =
                  item.unresolvedDependencies
                    ?.map(
                      (dependency) =>
                        `${dependency.category || "dependency"}:${dependency.sourceId || "unknown"}`
                    )
                    .join(", ") || "";
                return deps ? `${name} → missing ${deps}` : name;
              })
              .slice(0, 4) ?? [];
          throw new Error(
            "Migration has unresolved dependencies or target conflicts." +
              (blockers.length > 0 ? ` Blockers: ${blockers.join("; ")}.` : "") +
              " Adjust the category/item selection before applying."
          );
        }
        const rollbackSuffix =
          data.rolledBack === true
            ? " Changes were rolled back to the pre-migration restore point."
            : "";
        throw new Error((data.error || "Migration apply failed") + rollbackSuffix);
      }

      const restorePoint = data.result?.restorePointId;
      const reauth =
        data.result?.items?.filter((item) => item.status === "REQUIRES_REAUTH").length ?? 0;
      setStatus({
        type: "success",
        message:
          `Selective migration applied for ${selection.length} item(s).` +
          (restorePoint ? ` Restore point: ${restorePoint}.` : "") +
          (reauth > 0 ? ` ${reauth} item(s) require re-authentication.` : ""),
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Migration apply failed",
      });
    } finally {
      setApplyLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-black/[0.02] p-3 dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Selective migration</p>
          <p className="mt-1 text-xs text-text-muted">
            Preview 9Router or OmniRoute data, choose individual portable items, then migrate
            without replacing the current AgentProxy database.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            loading={previewLoading}
          >
            <span className="material-symbols-outlined mr-1 text-[14px]" aria-hidden="true">
              manage_search
            </span>
            Choose legacy file
          </Button>
          {sourceFile && (
            <Button variant="outline" size="sm" onClick={clear} disabled={applyLoading}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".json,.sqlite,.db"
        className="hidden"
        onChange={handleFileSelected}
      />

      {preview && sourceFile && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="font-medium text-text-main">{sourceFile.name}</span>
            <span>•</span>
            <span>
              {preview.source?.family || "legacy"} / {preview.source?.format || "unknown"}
              {preview.source?.version ? ` / ${preview.source.version}` : ""}
            </span>
            <span>•</span>
            <span>
              {selectedCount}/{entities.length} selected
            </span>
            {reauthCount > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-500">{reauthCount} require re-auth</span>
              </>
            )}
          </div>

          {entities.length > 0 && (
            <>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={selectAll}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-text-muted hover:underline"
                  onClick={clearSelection}
                >
                  Clear selection
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {categories.map((category) => {
                  const categoryEntities = entities.filter(
                    (entity) => entity.category === category
                  );
                  const allSelected = categoryEntities.every((entity) =>
                    selected.has(entityKey(entity))
                  );
                  return (
                    <span key={category} className="text-[11px] text-text-muted">
                      <span className="font-medium text-text-main">{category}</span>{" "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setCategorySelection(category, !allSelected)}
                      >
                        {allSelected ? "clear" : "select"}
                      </button>
                    </span>
                  );
                })}
              </div>

              <div className="mt-2 max-h-64 space-y-1 overflow-auto rounded-md border border-border/60 p-2">
                {entities.map((entity) => {
                  const key = entityKey(entity);
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(entity)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-main">
                          {entity.label || entity.sourceId}
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {entity.category} · {entity.sourceId}
                        </span>
                      </span>
                      <span
                        className={
                          "shrink-0 text-[10px] font-medium " +
                          dispositionClass(entity.disposition)
                        }
                      >
                        {entity.disposition}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void apply()}
                  loading={applyLoading}
                  disabled={selectedCount === 0 || previewLoading}
                >
                  Apply selected migration
                </Button>
                <span className="text-[11px] text-text-muted">
                  A stable restore point is required before the first target write.
                </span>
              </div>
            </>
          )}

          {(preview.unsupported?.length ?? 0) > 0 && (
            <p className="mt-2 text-[11px] text-text-muted">
              Unsupported or intentionally excluded source data:{" "}
              {preview.unsupported
                ?.map((entry) => `${entry.category || "unknown"} (${entry.count ?? 0})`)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {status && (
        <div
          className={
            "mt-3 rounded-lg border p-2 text-xs " +
            (status.type === "success"
              ? "border-green-500/20 bg-green-500/10 text-green-500"
              : status.type === "info"
                ? "border-blue-500/20 bg-blue-500/10 text-blue-500"
                : "border-red-500/20 bg-red-500/10 text-red-500")
          }
          role="status"
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
