import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMlmProfileStats,
  fetchMlmProfiles,
  getMlmProfileByMobile,
  indexMlmProfiles,
  normalizeMobile,
} from "../src/Utils/mlmProfile.js";

test("normalizes legacy Indian mobile formats to the same join key", () => {
  assert.equal(normalizeMobile("98765 43210"), "9876543210");
  assert.equal(normalizeMobile("+91-98765-43210"), "9876543210");
  assert.equal(normalizeMobile(9876543210), "9876543210");
});

test("profile presence and dashboard totals always use the same rule", () => {
  const users = [
    { id: "u1", mobileNo: "9876543210" },
    { id: "u2", mobileNo: "+91 91234 56789" },
    { id: "u3", mobileNo: "9000000000" },
    { id: "u4" },
  ];
  const profiles = [
    { id: "p1", mobile: "+91-9876543210" },
    { id: "p2", mobile: "9123456789" },
  ];

  const stats = calculateMlmProfileStats(users, profiles);
  assert.deepEqual(stats, {
    totalUsers: 4,
    hasProfileCount: 2,
    noProfileCount: 2,
  });
  assert.equal(
    stats.hasProfileCount + stats.noProfileCount,
    stats.totalUsers
  );
});

test("all profile displays resolve through the normalized mobile index", () => {
  const byMobile = indexMlmProfiles([
    { id: "p1", mobile: "+91 98765 43210", companyName: "Example" },
  ]);

  assert.equal(
    getMlmProfileByMobile(byMobile, "9876543210")?.companyName,
    "Example"
  );
  assert.equal(getMlmProfileByMobile(byMobile, "9000000000"), null);
});

test("profile lookup uses the callable 100-mobile limit without losing results", async () => {
  const calls = [];
  const mobiles = Array.from(
    { length: 65 },
    (_, index) => String(7000000000 + index)
  );
  mobiles.push("", "invalid");

  const profiles = await fetchMlmProfiles(mobiles, async ({ mobiles: batch }) => {
    calls.push(batch);
    return {
      data: {
        profiles: batch.map(mobile => ({ mobile, id: `p-${mobile}` })),
      },
    };
  });

  assert.deepEqual(calls.map(batch => batch.length), [65]);
  assert.equal(profiles.length, 65);
});


test("profile lookup splits requests larger than the callable 100-mobile limit", async () => {
  const calls = [];
  const mobiles = Array.from(
    { length: 205 },
    (_, index) => String(7000000000 + index)
  );

  const profiles = await fetchMlmProfiles(mobiles, async ({ mobiles: batch }) => {
    calls.push(batch);
    return {
      data: {
        profiles: batch.map(mobile => ({ mobile, id: `p-${mobile}` })),
      },
    };
  });

  assert.deepEqual(calls.map(batch => batch.length), [100, 100, 5]);
  assert.equal(profiles.length, 205);
});
