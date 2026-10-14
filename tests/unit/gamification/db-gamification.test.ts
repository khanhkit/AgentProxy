import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addXp, getAggregateXp, getXp } from "../../../src/lib/db/gamification";
import { calculateLevel } from "../../../src/lib/gamification/xp";
import { getDbInstance } from "../../../src/lib/db/core";

describe("DB Gamification — addXp level computation", () => {
  it("AP-ISS-0198 4233376578: rolls back audit and action count when the level write fails", () => {
    const testKey = `test-addxp-atomic-${Date.now()}`;
    const db = getDbInstance();
    db.exec(`CREATE TRIGGER fail_ap0198_user_level
      BEFORE INSERT ON user_levels
      WHEN NEW.api_key_id = '${testKey}'
      BEGIN SELECT RAISE(ABORT, 'forced level failure'); END`);
    try {
      assert.throws(() => addXp(testKey, "request", 7), /forced level failure/);
      const audit = db
        .prepare("SELECT COUNT(*) AS n FROM xp_audit_log WHERE api_key_id = ?")
        .get(testKey) as { n: number };
      const counts = db
        .prepare("SELECT COUNT(*) AS n FROM xp_action_counts WHERE api_key_id = ?")
        .get(testKey) as { n: number };
      assert.equal(audit.n, 0);
      assert.equal(counts.n, 0);
    } finally {
      db.exec("DROP TRIGGER IF EXISTS fail_ap0198_user_level");
      db.prepare("DELETE FROM xp_audit_log WHERE api_key_id = ?").run(testKey);
      db.prepare("DELETE FROM xp_action_counts WHERE api_key_id = ?").run(testKey);
      db.prepare("DELETE FROM user_levels WHERE api_key_id = ?").run(testKey);
    }
  });
  it("sets correct level for large initial XP", () => {
    const testKey = `test-addxp-level-${Date.now()}`;
    addXp(testKey, "invite_redeem", 50000);

    const xp = getXp(testKey);
    assert.ok(xp);
    assert.equal(xp.currentLevel, calculateLevel(50000));

    // Cleanup
    const db = getDbInstance();
    db.prepare("DELETE FROM user_levels WHERE api_key_id = ?").run(testKey);
    db.prepare("DELETE FROM xp_audit_log WHERE api_key_id = ?").run(testKey);
  });

  it("sets level 1 for small initial XP", () => {
    const testKey = `test-addxp-small-${Date.now()}`;
    addXp(testKey, "request", 1);

    const xp = getXp(testKey);
    assert.ok(xp);
    assert.equal(xp.currentLevel, 1);

    // Cleanup
    const db = getDbInstance();
    db.prepare("DELETE FROM user_levels WHERE api_key_id = ?").run(testKey);
    db.prepare("DELETE FROM xp_audit_log WHERE api_key_id = ?").run(testKey);
  });

  it("derives the operator level from aggregate XP instead of the highest key level", () => {
    const firstKey = `test-aggregate-xp-a-${Date.now()}`;
    const secondKey = `test-aggregate-xp-b-${Date.now()}`;
    const db = getDbInstance();
    const existing = getAggregateXp();
    const firstXp = 9000;
    const secondXp = 8153;

    try {
      addXp(firstKey, "request", firstXp);
      addXp(secondKey, "request", secondXp);

      const aggregate = getAggregateXp();
      const expectedTotal = existing.totalXp + firstXp + secondXp;
      assert.equal(aggregate.totalXp, expectedTotal);
      assert.equal(aggregate.currentLevel, calculateLevel(expectedTotal));
    } finally {
      for (const key of [firstKey, secondKey]) {
        db.prepare("DELETE FROM user_levels WHERE api_key_id = ?").run(key);
        db.prepare("DELETE FROM xp_audit_log WHERE api_key_id = ?").run(key);
      }
    }
  });
});
