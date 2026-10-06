import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const functionsSource = fs.readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
const portalSource = fs.readFileSync(new URL("../src/Pages/Calling/CallingPortal.jsx", import.meta.url), "utf8");
const managerSource = fs.readFileSync(new URL("../src/Pages/Mteam/CallingTeamManagement.jsx", import.meta.url), "utf8");

test("Calling Team uses an isolated panel and zero-commission tracking resolver", () => {
  assert.match(functionsSource, /panel:\s*"calling"/);
  assert.match(functionsSource, /callingCodeCommission:\s*0/);
  assert.match(functionsSource, /commissionEligibleCode:\s*account\.couponCode/);
  assert.match(functionsSource, /referredByMteam/);
  assert.match(functionsSource, /callingTeamId/);
});

test("Calling portal and Marketing manager expose separate Calling Team workflow", () => {
  assert.match(portalSource, /callingGetDashboard/);
  assert.match(portalSource, /callingSaveFollowup/);
  assert.match(managerSource, /marketingCreateCallingMember/);
  assert.match(managerSource, /marketingGetCallingMemberAnalysis/);
  assert.match(managerSource, /Commission ₹0/);
});

test("MLMLIVE Calling Team claim is mobile-bound, one-time and preserves main commission coupon", () => {
  assert.match(functionsSource, /CALLING_REFERRAL_CLAIM_COLLECTION/);
  assert.match(functionsSource, /claimCallingTeamAttribution/);
  assert.match(functionsSource, /mobileHash:\s*hash\(mobile\)/);
  assert.match(functionsSource, /claimData\.used === true/);
  assert.match(functionsSource, /mteamCouponCode:\s*account\.couponCode/);
  assert.match(functionsSource, /referredBy:\s*mainReferCode/);
  assert.match(functionsSource, /callingTeamAttributedAt/);
  assert.match(functionsSource, /callingCodeCommission:\s*0/);
});

test("Calling Team attribution cannot be used to reassign an old unrelated user", () => {
  assert.match(functionsSource, /recentSignup/);
  assert.match(functionsSource, /alreadyOwnedByExpectedMarketing/);
  assert.match(functionsSource, /only available during signup/);
  assert.match(functionsSource, /currentCallingMember && currentCallingMember !== member\.id/);
});


test("Calling analysis includes Lead Management expiry filters and plan helpers are wired", () => {
  assert.match(functionsSource, /daysUntil,/);
  assert.match(functionsSource, /subscriptionStatus,/);
  assert.match(functionsSource, /expiring7/);
  assert.match(managerSource, /expiringIn/);
  assert.match(managerSource, /Within 7 Days/);
  assert.match(portalSource, /expiringIn/);
  assert.match(portalSource, /<th>Expiry<\/th>/);
});

test("Calling endpoints keep standard callable CORS configuration", () => {
  assert.match(functionsSource, /const CALLING_PUBLIC_OPTIONS = \{ region: REGION, cors: true \}/);
  assert.doesNotMatch(functionsSource, /CALLING_PUBLIC_OPTIONS = \{[^}]*invoker:/);
  assert.match(functionsSource, /callingVerifyTwoFactorOtp = onCall\(CALLING_PUBLIC_OPTIONS/);
  assert.match(functionsSource, /callingSessionStatus = onCall\(CALLING_PUBLIC_OPTIONS/);
  assert.match(functionsSource, /callingGetDashboard = onCall\(CALLING_PUBLIC_OPTIONS/);
  assert.match(functionsSource, /marketingListCallingTeam = onCall\(CALLING_PUBLIC_OPTIONS/);
  assert.match(functionsSource, /claimCallingTeamAttribution = onCall\(CALLING_PUBLIC_OPTIONS/);
  assert.match(managerSource, /Calling Login Link Copied/);
});
