import { parentPort } from "node:worker_threads";
import {
  applyCompression,
  applyStackedCompression,
  type StackedCompressionStep,
} from "./strategySelector.ts";
import { adaptBodyForCompression } from "./bodyAdapter.ts";
import type { CompressionResult } from "./types.ts";
import type {
  CompressionWorkerJob,
  CompressionWorkerMessage,
} from "./compressionWorkerProtocol.ts";

function runStackedJob(
  job: CompressionWorkerJob,
  onEngineStep: (step: StackedCompressionStep) => void
): CompressionResult {
  const adapter = adaptBodyForCompression(
    job.body,
    job.options?.config?.codexResponsesConfig?.preserveToolNames
  );
  const result = applyStackedCompression(adapter.body, job.options?.config?.stackedPipeline, {
    ...job.options,
    onEngineStep,
  });
  return adapter.adapted ? { ...result, body: adapter.restore(result.body) } : result;
}

if (!parentPort) throw new Error("compressionWorker must run in a worker thread");
parentPort.on("message", (job: CompressionWorkerJob) => {
  try {
    const onEngineStep = (step: StackedCompressionStep) =>
      parentPort.postMessage({
        id: job.id,
        type: "step",
        step,
      } satisfies CompressionWorkerMessage);
    const result =
      job.mode === "stacked"
        ? runStackedJob(job, onEngineStep)
        : applyCompression(job.body, job.mode, job.options);
    parentPort.postMessage({
      id: job.id,
      type: "result",
      result,
    } satisfies CompressionWorkerMessage);
  } catch (error) {
    parentPort.postMessage({
      id: job.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    } satisfies CompressionWorkerMessage);
  }
});
