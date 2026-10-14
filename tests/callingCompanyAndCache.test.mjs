import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { companyForLead, buildProfileIndex, companyNameFrom } = require("../functions/callingCompany.js");
const { createTimedCache } = require("../functions/callingReadCache.js");

test("uses a named profile rather than the first empty company profile", () => {
 const profiles = buildProfileIndex([
   {mobile: "+91 98765 43210", companyName: ""},
   {mobile: "9876543210", companyName: "AWPL"},
 ]);
 assert.equal(companyForLead({}, profiles.get("9876543210"), {}), "AWPL");
});
test("supports legacy company and subscription fallbacks with no extra DB reads", () => {
 assert.equal(companyForLead({}, {company_name:"Legacy Company"}, {}), "Legacy Company");
 assert.equal(companyForLead({}, null, {companyName:"Company Sub"}), "Company Sub");
 assert.equal(companyForLead({companyName:"Company User"}, {}, null), "Company User");
 assert.equal(companyNameFrom({company:{name:"Nested"}}), "Nested");
 assert.equal(companyNameFrom({company:{id:42}}), "");
});
test("cache deduplicates simultaneous calls and honors TTL", async () => {
 const cache=createTimedCache(); let calls=0;
 const loader=async () => { calls++; return { n:calls };};
 const [a,b]=await Promise.all([cache.get('same',loader),cache.get('same',loader)]);
 assert.strictEqual(a,b); assert.equal(calls,1);
 await cache.get('same',loader); assert.equal(calls,1);
 await cache.get('same',loader,{forceRefresh:true});assert.equal(calls,2);
 cache.invalidate('same'); await cache.get('same',loader);assert.equal(calls,3);
});
test("cache evicts oldest entries and does not cache failures", async () => {
 const cache=createTimedCache({maxEntries:2});
 await cache.get('a',()=>Promise.resolve(1));
 await cache.get('b',()=>Promise.resolve(2));
 await cache.get('c',()=>Promise.resolve(3));
 assert.equal(cache.size(),2);
 await assert.rejects(()=>cache.get('failure',()=>Promise.reject(new Error('boom'))), /boom/);
 assert.equal(cache.size(),2);
});
test("backend permissions and followup invalidation remain enforced", () => {
 const source=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
 assert.match(source,/const \{ member, owner \} = await callingSessionFor\(request\);\s*const bundle = await callingLeadsBundle/);
 assert.match(source,/callingBundleCache.invalidate\(`\$\{owner.id\}:\$\{member.id\}:5000`\)/);
 assert.match(source,/companyForLead\(user, profile, subscription\)/);
 assert.match(source,/usersQuery.limit\(maxUsers\).get\(\)/);
 assert.match(source,/shouldCache: bundle => bundle.leads.length <= 500/);
});
