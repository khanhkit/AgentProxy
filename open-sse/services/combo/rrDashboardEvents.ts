import { emit } from "../../../src/lib/events/eventBus";

export interface RRDashboardEvents {
  attempt(): void;
  succeeded(latencyMs: number): void;
  failed(error: string, latencyMs: number): void;
}

export function createRRDashboardEvents(
  comboName: string,
  targetIndex: number,
  provider: string,
  model: string
): RRDashboardEvents {
  return {
    attempt() {
      emit("combo.target.attempt", {
        comboName, targetIndex, provider, model, timestamp: Date.now(), strategy: "round-robin",
      });
    },
    succeeded(latencyMs) {
      emit("combo.target.succeeded", { comboName, targetIndex, provider, model, latencyMs });
    },
    failed(error, latencyMs) {
      emit("combo.target.failed", { comboName, targetIndex, provider, model, error, latencyMs });
    },
  };
}
