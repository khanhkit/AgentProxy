/** Singleton registry of ServiceSupervisor instances. */

import type { ServiceSupervisor } from "./ServiceSupervisor";

const supervisors = new Map<string, ServiceSupervisor>();

export function registerSupervisor(supervisor: ServiceSupervisor): void {
  supervisors.set(supervisor.getStatus().tool, supervisor);
}

export function getSupervisor(tool: string): ServiceSupervisor | null {
  return supervisors.get(tool) ?? null;
}

/** Remove a supervisor by tool name. Intended for use in tests. */
export function unregisterSupervisor(tool: string): void {
  supervisors.delete(tool);
}

export async function stopAllSupervisors(): Promise<void> {
  // Supervisors persist terminal status, so the lifecycle coordinator must await
  // them before the database close phase. Signal/final-exit ownership belongs to
  // the process entrypoint, never this leaf registry.
  const results = await Promise.allSettled(
    Array.from(supervisors.values()).map((supervisor) => supervisor.stop())
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "Supervisor shutdown failed"
    );
  }
}
