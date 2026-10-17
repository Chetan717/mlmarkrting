import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { normalizeCustomerMobile, matchesCustomerSearch } from "../src/Utils/customerMobile.js";
import { companyForLead } from "../src/Utils/company.js";
import { fetchMlmProfiles, indexMlmProfiles } from "../src/Utils/mlmProfile.js";

const require = createRequire(import.meta.url);
const { dailySessionExpiry, sessionDayKey, validPanelSession } = require("../functions/panelSessionPolicy.js");
const { normalizeLookupMobile, lookupRegisteredCustomer } = require("../functions/customerLookup.js");
const timestamp = value => ({ toMillis: () => Date.parse(value) });

test("daily sessions end at the next India midnight, including the exact boundary", () => {
  const before = Date.parse("2026-10-17T18:29:59.999Z");
  const midnight = Date.parse("2026-10-17T18:30:00Z");
  assert.equal(dailySessionExpiry(before), midnight);
  assert.equal(dailySessionExpiry(midnight), Date.parse("2026-10-18T18:30:00Z"));
  assert.equal(sessionDayKey(before), "2026-10-17");
  assert.equal(sessionDayKey(midnight), "2026-10-18");
});

test("backend accepts today's session and rejects revoked, expired, foreign and previous-day sessions", () => {
  for (const panel of ["marketing", "calling"]) {
    const session = { panel, createdAt: timestamp("2026-10-17T12:00:00Z"), expiresAt: timestamp("2026-10-17T18:30:00Z") };
    const now = Date.parse("2026-10-17T13:00:00Z");
    assert.equal(validPanelSession(session, panel, now), true);
    assert.equal(validPanelSession({ ...session, revoked: true }, panel, now), false);
    assert.equal(validPanelSession(session, "other", now), false);
    assert.equal(validPanelSession(session, panel, Date.parse("2026-10-17T18:30:00Z")), false);
    assert.equal(validPanelSession({ ...session, createdAt: timestamp("2026-10-17T14:00:00Z") }, panel, now), false);
    const legacy = { ...session, expiresAt: timestamp("2026-10-18T03:00:00Z") };
    assert.equal(validPanelSession(legacy, panel, Date.parse("2026-10-17T18:31:00Z")), false);
    assert.equal(validPanelSession({ ...session, createdAt: undefined }, panel, now), false);
  }
});

test("browser and server normalize the same common mobile formats and reject invalid input", () => {
  for (const value of ["9876543210", "+91 98765 43210", "91-98765-43210", "0091 9876543210", "09876543210", 9876543210]) {
    assert.equal(normalizeLookupMobile(value), "9876543210");
    assert.equal(normalizeCustomerMobile(value), "9876543210");
  }
  for (const value of ["", "invalid9876543210", "1234", "+1 234567890123", "987654321012345", null]) {
    assert.equal(normalizeLookupMobile(value), "");
    assert.equal(normalizeCustomerMobile(value), "");
  }
});

test("assigned-list search handles mixed case, formatted mobiles, partial numbers and clearing", () => {
  const lead = { name: "Asha Kumar", mobile: "9876543210", companyName: "Example Company" };
  for (const input of ["ASHA", " kumar ", "+91 98765 43210", "98765 43210", "54321", "EXAMPLE", ""]) {
    assert.equal(matchesCustomerSearch(lead, input), true, input);
  }
  assert.equal(matchesCustomerSearch(lead, "9123456789"), false);
  assert.equal(matchesCustomerSearch(lead, "another name"), false);
});

test("marketing profile joins prefer a populated company and retain real fallback names", async () => {
  const blank = { mobile: "9876543210", companyName: "" };
  const actual = { mobile: "+91 98765 43210", company: { name: "Actual Company" } };
  const profiles = await fetchMlmProfiles(["9876543210"], async () => ({ data: { profiles: [blank, actual] } }));
  assert.deepEqual(profiles, [actual]);
  const index = indexMlmProfiles([blank, actual]);
  assert.equal(companyForLead({}, index.get("9876543210"), null), "Actual Company");
  assert.equal(companyForLead({ companyName: "User Company" }, null, { company: "Subscription Company" }), "Subscription Company");
  assert.equal(companyForLead({}, null, null), "");
});

function database(records) {
  const reads = [];
  const db = { collection(name) {
    return { where(field, operator, values) {
      assert.equal(operator, "in");
      assert.equal(field, name === "users" ? "mobileNo" : "mobile");
      return { limit(count) { return { async get() {
        reads.push({ name, field, values, count });
        return { docs: (records[name] || []).filter(row => values.includes(row[field])).slice(0, count)
          .map((row, index) => ({ id: String(index), data: () => row })) };
      } }; } };
    } };
  } };
  return { db, reads };
}

test("universal lookup reads only matching indexed mobile records and removes secret fields", async () => {
  const unrelated = { name: "Unrelated", mobileNo: "9123456789" };
  const { db, reads } = database({
    users: [{ name: "Actual User", mobileNo: "9876543210", password: "secret", otp: "123456", authToken: "private", private: { pin: "1234" }, isverified: false }, unrelated],
    mlmprofiles: [{ name: "MLM Name", mobile: "+91 98765 43210", companyName: "Actual Company", designation: "Leader", refreshToken: "private", credentials: { password: "secret" } }],
  });
  const result = await lookupRegisteredCustomer(db, "9876543210");
  assert.equal(result.found, true);
  assert.equal(result.customer.name, "Actual User");
  assert.equal(result.customer.isverified, false);
  assert.equal(result.customer.companyName, "Actual Company");
  assert.equal(result.mlmProfiles[0].designation, "Leader");
  assert.doesNotMatch(JSON.stringify(result), /secret|123456|authToken|refreshToken|credentials|Unrelated/);
  assert.equal(reads.length, 2);
  assert.deepEqual(reads.map(read => [read.name, read.count]), [["users", 10], ["mlmprofiles", 31]]);
  assert.equal(result.profilesTruncated, false);
});

test("a missing customer returns no profile query, and legacy numeric mobile records can be found", async () => {
  const missing = database({ users: [] });
  assert.deepEqual(await lookupRegisteredCustomer(missing.db, "9876543210"), { found: false });
  assert.equal(missing.reads.length, 1);
  const numeric = database({ users: [{ name: "Numeric", mobileNo: 9876543210 }] });
  assert.equal((await lookupRegisteredCustomer(numeric.db, "9876543210")).customer.name, "Numeric");
});

test("lookup returns one customer when duplicate mobile records exist and bounds profile results", async () => {
  const data = database({ users: [{ mobileNo: "+919876543210", name: "Legacy Duplicate" }, { mobileNo: "9876543210", name: "Canonical" }],
    mlmprofiles: Array.from({ length: 40 }, (_, index) => ({ mobile: "9876543210", name: `Profile ${index}` })) });
  const result = await lookupRegisteredCustomer(data.db, "9876543210");
  assert.equal(result.customer.name, "Canonical");
  assert.equal(result.mlmProfiles.length, 30);
  assert.equal(result.profilesTruncated, true);
});
