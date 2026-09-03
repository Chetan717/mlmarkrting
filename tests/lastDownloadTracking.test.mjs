import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { formatLastDownload, toDownloadDate } from "../src/Utils/lastDownload.js";

const projectRoot = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(projectRoot, path), "utf8");

test("Last Download formatting supports Firestore timestamps and missing users", () => {
  const value = { seconds: Date.UTC(2026, 8, 2, 14, 0, 0) / 1000, nanoseconds: 0 };
  assert.equal(toDownloadDate(value)?.toISOString(), "2026-09-02T14:00:00.000Z");
  assert.match(formatLastDownload(value), /02\s+Sep(?:t)?\s+2026/i);
  assert.match(formatLastDownload(value), /07:30\s*pm/i);
  assert.equal(formatLastDownload(null), "Never");
});

test("existing Marketing subscriber and lead views reuse the users field", () => {
  const dashboard = read("src/Pages/Mteam/MainTeam.jsx");
  const leads = read("src/Pages/Mteam/LeadManagement.jsx");
  const teamLeads = read("src/Pages/Mteam/MyMarketingTeam.jsx");
  const sanitizer = read("functions/marketingTeamMetrics.js");
  const source = `${dashboard}\n${leads}\n${teamLeads}\n${sanitizer}`;

  assert.match(dashboard, /Last Download/);
  assert.match(dashboard, /user\?\.lastDownloadAt/);
  assert.match(leads, /Last Download/);
  assert.match(leads, /user\.lastDownloadAt/);
  assert.match(teamLeads, /formatLastDownload\(lead\.lastDownloadAt\)/);
  assert.match(sanitizer, /lastDownloadAt:\s*toMillis\(user\.lastDownloadAt\)/);
  assert.doesNotMatch(source, /collection\(db,\s*["'](?:downloads|downloadActivity|userDownloads)["']/i);
});
