import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const REPO_URL = "https://github.com/khanhkit/AgentProxy";

test("AP-ISS-0113 Radar fails closed before network when no feed URL is configured", async () => {
  const previous = process.env.RADAR_FEED_URL;
  delete process.env.RADAR_FEED_URL;
  try {
    const [{ syncRadar }, { syncRadarIntel }, { syncRadarOffers }, { syncRadarReferrals }] =
      await Promise.all([
        import("../../../src/lib/radar/sync.ts"),
        import("../../../src/lib/radar/intelSync.ts"),
        import("../../../src/lib/radar/offersSync.ts"),
        import("../../../src/lib/radar/referralsSync.ts"),
      ]);

    let fetchCount = 0;
    const blockedFetch = (async () => {
      fetchCount += 1;
      throw new Error("network must not be reached without RADAR_FEED_URL");
    }) as typeof fetch;

    const common = {
      getFlag: () => true,
      getSettings: () => ({ optIn: true, supporterKey: "omr_release_guard" }),
      fetch: blockedFetch,
    };

    for (const result of [
      await syncRadar(common),
      await syncRadarIntel(common),
      await syncRadarOffers(common),
      await syncRadarReferrals(common),
    ]) {
      assert.equal(result.status, "error");
      assert.match(result.reason, /RADAR_FEED_URL/i);
    }
    assert.equal(fetchCount, 0);
  } finally {
    if (previous === undefined) delete process.env.RADAR_FEED_URL;
    else process.env.RADAR_FEED_URL = previous;
  }
});

test("AP-ISS-0113 Radar fallback links point to the AgentProxy repository", async () => {
  const oldContributor = process.env.RADAR_CONTRIBUTOR_CLAIM_URL;
  const oldSupporter = process.env.RADAR_SUPPORTER_PLANS_URL;
  delete process.env.RADAR_CONTRIBUTOR_CLAIM_URL;
  delete process.env.RADAR_SUPPORTER_PLANS_URL;
  try {
    const { getContributorClaimUrl, getSupporterPlansUrl } =
      await import("../../../src/lib/radar/links.ts");
    assert.equal(getContributorClaimUrl(), REPO_URL);
    assert.equal(getSupporterPlansUrl(), REPO_URL);
  } finally {
    if (oldContributor === undefined) delete process.env.RADAR_CONTRIBUTOR_CLAIM_URL;
    else process.env.RADAR_CONTRIBUTOR_CLAIM_URL = oldContributor;
    if (oldSupporter === undefined) delete process.env.RADAR_SUPPORTER_PLANS_URL;
    else process.env.RADAR_SUPPORTER_PLANS_URL = oldSupporter;
  }
});

test("AP-ISS-0113 release metadata never publishes to a placeholder or legacy owner", () => {
  const dockerfile = fs.readFileSync("Dockerfile.bun", "utf8");
  assert.match(
    dockerfile,
    /org\.opencontainers\.image\.url="https:\/\/github\.com\/khanhkit\/AgentProxy"/
  );

  const electron = JSON.parse(fs.readFileSync("electron/package.json", "utf8")) as {
    homepage?: string;
    build?: { publish?: { owner?: string; repo?: string } };
  };
  assert.equal(electron.homepage, REPO_URL);
  assert.equal(electron.build?.publish?.owner, "khanhkit");
  assert.equal(electron.build?.publish?.repo, "AgentProxy");

  const news = JSON.parse(fs.readFileSync("news.json", "utf8")) as {
    items?: Array<{ id?: string; link?: string }>;
  };
  const radar = news.items?.find((item) => item.id === "radar-launch-2026-08");
  assert.equal(radar?.link, REPO_URL);
});
