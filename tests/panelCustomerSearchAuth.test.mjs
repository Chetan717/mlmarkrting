import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
const require = createRequire(new URL("../functions/index.js", import.meta.url));
const { dailySessionExpiry } = require("./panelSessionPolicy.js");
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

function harness({ panel = "marketing", actorType = "owner", assigned = true, active = true, expired = false } = {}) {
  const now = Date.now();
  const ts = value => ({ toMillis: () => value });
  const records = {
    "_panelSessions/session": { panel, ownerId: "owner", actorId: "actor", callingMemberId: "caller",
      createdAt: ts(now - 1000), expiresAt: ts(expired ? now - 1 : dailySessionExpiry(now)), revoked: false },
    "mteam/owner": { active: true, loginEmail: "owner@example.com", team: [{ id: "actor", active: true, tabs: assigned ? ["customersearch"] : [] }] },
    "marketingCallingTeam/caller": { active, ownerId: "owner" },
  };
  const reads = [], writes = [];
  const db = { collection(name) {
    return {
      doc(id) {
        const path = `${name}/${id}`;
        return { path, async get() {
          reads.push(path);
          return { exists: Boolean(records[path]), id, data: () => records[path], ref: this };
        }, async update() { writes.push(path); }, async delete() { writes.push(path); } };
      },
      where(field, operator, values) {
        assert.equal(operator, "in");
        return { limit(limit) { return { async get() {
          reads.push(name);
          if (name === "users" && values.includes("9876543210")) return { docs: [{ id: "customer", data: () => ({ name: "Customer", mobileNo: "9876543210", referredByMteam: "other-owner" }) }] };
          return { docs: [] };
        } }; } };
      },
    };
  }, async runTransaction(action) {
    return action({ get: async () => ({ exists: false }), set: ref => writes.push(ref.path) });
  } };
  const exported = {};
  const fakeRequire = name => {
    if (name === "firebase-functions/v2/https") return { HttpsError, onCall: (_, handler) => handler };
    if (name === "firebase-admin/app") return { initializeApp() {} };
    if (name === "firebase-admin/auth") return { getAuth() {} };
    if (name === "firebase-admin/firestore") return { getFirestore: () => db, Timestamp: { now: () => ts(now), fromMillis: ts }, FieldValue: { serverTimestamp: () => ts(now) } };
    if (name === "firebase-functions/params") return { defineSecret: () => ({}), defineString: () => ({}) };
    if (name === "nodemailer") return {};
    return require(name);
  };
  vm.runInNewContext(source, { require: fakeRequire, exports: exported, Buffer, console }, { filename: "functions/index.js" });
  const request = { auth: { uid: "session", token: { panel, actorType, mteamId: "owner", subUserId: "actor", callingMemberId: "caller", tabs: ["customersearch"] } }, data: { mobile: "+91 98765 43210" } };
  return { handler: exported.panelCustomerSearch, request, reads, writes };
}

test("customer lookup rejects signed-out and non-panel app users before any customer query", async () => {
  for (const auth of [undefined, { uid: "app-user", token: {} }]) {
    const h = harness();
    await assert.rejects(h.handler({ ...h.request, auth }), error => error.code === "unauthenticated");
    assert.equal(h.reads.includes("users"), false);
  }
});

test("authorized Marketing owners and Calling members can read an unrelated registered customer without attribution writes", async () => {
  for (const panel of ["marketing", "calling"]) {
    const h = harness({ panel });
    const result = await h.handler(h.request);
    assert.equal(result.found, true);
    assert.equal(result.customer.name, "Customer");
    assert.equal(h.reads.filter(name => name === "users").length, 1);
    assert.equal(h.writes.some(path => path.startsWith("users/") || path.startsWith("mlmprofiles/")), false);
  }
});

test("Portal User lookup permission is checked against current assigned tabs, including revoked access", async () => {
  const allowed = harness({ actorType: "subuser" });
  assert.equal((await allowed.handler(allowed.request)).found, true);
  const removed = harness({ actorType: "subuser", assigned: false });
  await assert.rejects(removed.handler(removed.request), error => error.code === "permission-denied");
  assert.equal(removed.reads.includes("users"), false);
  const absent = harness({ actorType: "subuser" });
  absent.request.auth.token.tabs = [];
  await assert.rejects(absent.handler(absent.request), error => error.code === "permission-denied");
});

test("expired sessions, inactive callers and invalid mobiles cannot query customers", async () => {
  for (const panel of ["marketing", "calling"]) {
    const h = harness({ panel, expired: true });
    await assert.rejects(h.handler(h.request), error => error.code === "unauthenticated");
    assert.equal(h.reads.includes("users"), false);
  }
  const inactive = harness({ panel: "calling", active: false });
  await assert.rejects(inactive.handler(inactive.request), error => error.code === "permission-denied");
  const invalid = harness();
  invalid.request.data.mobile = "1234";
  await assert.rejects(invalid.handler(invalid.request), error => error.code === "invalid-argument");
  assert.equal(invalid.reads.includes("users"), false);
});
