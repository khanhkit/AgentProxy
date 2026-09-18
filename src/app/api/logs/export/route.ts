import {
  getCallLogById,
  getLegacyCallLogExportIdPage,
  getLegacyCallLogExportMaxRowId,
  type LegacyCallLogExportCursor,
} from "@/lib/usage/callLogs";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  getLegacyProxyLogExportMaxRowId,
  getLegacyProxyLogExportPage,
  type LegacyProxyLogExportCursor,
} from "@/lib/db/proxyLogs";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error";

const LEGACY_EXPORT_PAGE_SIZE = 100;
const encoder = new TextEncoder();

function indentJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/^/gm, "    ");
}

async function* iterateCallLogs(since: string, maxRowId: number): AsyncGenerator<unknown> {
  let cursor: LegacyCallLogExportCursor | null = null;

  while (true) {
    const page = getLegacyCallLogExportIdPage(since, maxRowId, cursor, LEGACY_EXPORT_PAGE_SIZE);
    if (page.length === 0) return;

    for (const row of page) {
      const log = await getCallLogById(row.id);
      if (log) yield log;
    }

    const last = page[page.length - 1];
    cursor = { timestamp: last.timestamp, rowId: last.rowId };
  }
}

async function* iterateProxyLogs(since: string, maxRowId: number): AsyncGenerator<unknown> {
  let cursor: LegacyProxyLogExportCursor | null = null;

  while (true) {
    const page = getLegacyProxyLogExportPage(since, maxRowId, cursor, LEGACY_EXPORT_PAGE_SIZE);
    if (page.length === 0) return;

    for (const row of page) yield row.record;

    const last = page[page.length - 1];
    cursor = { timestamp: last.timestamp, rowId: last.rowId };
  }
}

async function* emptyLogs(): AsyncGenerator<unknown> {
  return;
}

async function* generateExportJson(
  logs: AsyncIterable<unknown>,
  hours: number,
  logType: string
): AsyncGenerator<Uint8Array> {
  yield encoder.encode('{\n  "logs": [');

  let count = 0;
  for await (const row of logs) {
    yield encoder.encode(`${count === 0 ? "\n" : ",\n"}${indentJson(row)}`);
    count += 1;
  }

  const logsClose = count === 0 ? "]" : "\n  ]";
  yield encoder.encode(
    `${logsClose},\n  "count": ${count},\n  "hours": ${hours},\n  "type": ${JSON.stringify(logType)}\n}`
  );
}

function streamFrom(iterator: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}

/**
 * GET /api/logs/export — export logs as JSON
 * Query params: ?hours=24 (1, 6, 12, 24; default 24)
 *               &type=call-logs|request-logs|proxy-logs (default call-logs)
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const hours = Math.min(Math.max(parseInt(searchParams.get("hours") || "24") || 24, 1), 168);
    const logType = searchParams.get("type") || "call-logs";

    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    let tableName = "";
    let logs: AsyncIterable<unknown> = emptyLogs();

    if (logType === "call-logs" || logType === "request-logs") {
      tableName = "call_logs";
      const maxRowId = getLegacyCallLogExportMaxRowId(since);
      logs = iterateCallLogs(since, maxRowId);
    } else if (logType === "proxy-logs") {
      tableName = "proxy_logs";
      // NOTE: proxy export records retain the historical `public_ip` column, NOT `clientIp`.
      // This intentionally differs from GET /api/usage/proxy-logs which exposes the
      // value as `clientIp`. Callers of this export endpoint should read `public_ip`.
      // This inconsistency will be resolved in a future DB migration (#2880).
      const maxRowId = getLegacyProxyLogExportMaxRowId(since);
      logs = iterateProxyLogs(since, maxRowId);
    }

    const filename = `omniroute-${tableName}-${hours}h-${new Date().toISOString().slice(0, 10)}.json`;
    const body = streamFrom(generateExportJson(logs, hours, logType));

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          message: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
          type: "server_error",
        },
      },
      { status: 500 }
    );
  }
}
