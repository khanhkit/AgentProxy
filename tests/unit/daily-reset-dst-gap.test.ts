import test from "node:test";
import assert from "node:assert/strict";
import { nextDailyResetAtMs } from "../../open-sse/services/dailyQuotaReset.ts";

const HOUR_MS = 60 * 60 * 1000;

function wallClock(timeZone: string, ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

test("#13671: New York spring-forward gap resolves 02:00 to first valid 03:00", () => {
  const nowMs = Date.parse("2026-03-08T00:30:00-05:00");
  const next = nextDailyResetAtMs("America/New_York", 2, nowMs);
  assert.equal(new Date(next).toISOString(), "2026-03-08T07:00:00.000Z");
  assert.equal(wallClock("America/New_York", next), "2026-03-08, 03:00");
});

test("#13671: Havana midnight gap resolves to 01:00 on the same day", () => {
  const nowMs = Date.parse("2026-03-07T20:00:00-05:00");
  const next = nextDailyResetAtMs("America/Havana", 0, nowMs);
  assert.equal(wallClock("America/Havana", next), "2026-03-08, 01:00");
  assert.equal(next - nowMs, 4 * HOUR_MS);
});

test("#13671: Santiago midnight gap resolves to 01:00 on the same day", () => {
  const nowMs = Date.parse("2026-09-05T20:00:00-04:00");
  const next = nextDailyResetAtMs("America/Santiago", 0, nowMs);
  assert.equal(wallClock("America/Santiago", next), "2026-09-06, 01:00");
  assert.equal(next - nowMs, 4 * HOUR_MS);
});

test("#13671: ordinary days stay unchanged", () => {
  const nowMs = Date.parse("2026-01-15T10:00:00Z");
  assert.equal(
    new Date(nextDailyResetAtMs("Europe/Paris", 0, nowMs)).toISOString(),
    "2026-01-15T23:00:00.000Z",
  );
  assert.equal(
    new Date(nextDailyResetAtMs("Asia/Kolkata", 0, nowMs)).toISOString(),
    "2026-01-15T18:30:00.000Z",
  );
});
