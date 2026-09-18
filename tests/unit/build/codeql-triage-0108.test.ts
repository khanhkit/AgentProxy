import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const evidencePath = "docs/handoff/issues_board/evidence/CODEQL_TRIAGE_2026-09-18.json";
const allowedDispositions = new Set([
  "TEST_DEV_TOOL_DEBT",
  "CONFIRMED_DEFECT",
  "ACCEPTED_PROTOCOL_COMPATIBILITY",
  "FALSE_POSITIVE",
  "DUPLICATE",
]);

test("TC-CODEQL-TRIAGE-0108-001 is row-complete and follow-up-safe", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const rows = evidence.alerts as Array<{
    alert_number: number;
    disposition: string;
    follow_up_issue: string | null;
  }>;

  assert.equal(evidence.analysis.commit_sha, "ec476df1eb433a3e96b4c0ba90116d67b5b0e453");
  assert.equal(evidence.analysis.id, 1799410531);
  assert.equal(evidence.current_open_count, 136);
  assert.equal(rows.length, 136);
  assert.equal(new Set(rows.map((row) => row.alert_number)).size, 136);

  for (const row of rows) {
    assert.ok(
      allowedDispositions.has(row.disposition),
      "unexpected disposition for #" + row.alert_number
    );
  }

  const counted = Object.values(evidence.disposition_counts as Record<string, number>).reduce(
    (sum, value) => sum + value,
    0
  );
  assert.equal(counted, 136);

  const requiredFollowUps = new Set(["AP-ISS-0114", "AP-ISS-0115", "AP-ISS-0116"]);
  const confirmed = rows.filter((row) => row.disposition === "CONFIRMED_DEFECT");
  assert.equal(confirmed.length, 3);
  assert.deepEqual(new Set(confirmed.map((row) => row.follow_up_issue)), requiredFollowUps);

  const duplicate = rows.filter((row) => row.disposition === "DUPLICATE");
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].alert_number, 131);
  assert.equal(duplicate[0].follow_up_issue, "AP-ISS-0116");

  for (const issueId of requiredFollowUps) {
    const issuePath = "docs/handoff/issues_board/issues/" + issueId + ".md";
    await access(issuePath);
    const issue = await readFile(issuePath, "utf8");
    assert.match(issue, /\*\*Blocked By:\*\* AP-ISS-0108/);
    assert.match(issue, /\*\*Blocks:\*\* AP-ISS-0113/);
  }
});
