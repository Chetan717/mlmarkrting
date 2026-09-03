import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const { calculateTeamMemberSummary, buildSanitizedLead } = require("../functions/marketingTeamMetrics.js");

test("team bonus uses the child commission as its base", () => {
  const summary = calculateTeamMemberSummary({ subscriptions: [{ PaymentAmount: 10000 }, { PaymentAmount: 5000 }], userCount: 8, commissionPercentage: 10, uplineBonusPercentage: 10 });
  assert.deepEqual(summary, { userCount: 8, salesCount: 2, revenue: 15000, childCommission: 1500, parentBonus: 150 });
});

test("sanitized team lead never contains mobile or password fields", () => {
  const lead = buildSanitizedLead({
    opaqueId: "opaque", couponCode: "ABC123",
    user: { name: "User", mobileNo: "9876543210", password: "secret", createdAt: new Date("2026-01-01"), lastDownloadAt: new Date("2026-02-02T03:04:00Z") },
    subscription: { mobileNo: "9876543210", plan: "Gold", Active: true, Expire: false },
    profile: { mobile: "9876543210", companyName: "Example" },
  });
  assert.equal(lead.name, "User");
  assert.equal(lead.planStatus, "Active");
  assert.equal(lead.lastDownloadAt, Date.parse("2026-02-02T03:04:00Z"));
  for (const field of ["mobile", "mobileNo", "phone", "password", "pin"]) assert.equal(Object.hasOwn(lead, field), false);
});

test("My Team endpoint enforces direct parent scope and UI omits sensitive columns", async () => {
  const [backend, ui, portal] = await Promise.all([
    readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/Pages/Mteam/MyMarketingTeam.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/Pages/Mteam/MteamPortal.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(backend, /exports\.marketingGetMyTeam\s*=\s*onCall/);
  assert.match(backend, /exports\.marketingGetTeamMemberLeads\s*=\s*onCall/);
  assert.match(backend, /parentMteamId[^\n]+owner\.id/);
  assert.match(backend, /buildSanitizedLead/);
  assert.doesNotMatch(ui, /<th[^>]*>\s*Mobile|<th[^>]*>\s*Password/i);
  assert.match(ui, /Mobile number and password are not returned/);
  assert.match(portal, /<MyMarketingTeam/);
  assert.match(portal, /portalusers/);
});
