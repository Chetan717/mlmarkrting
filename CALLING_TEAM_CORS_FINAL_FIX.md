# Calling Team CORS Final Fix

This build fixes browser preflight/CORS failures for the complete Calling Team workflow.

## Root cause
Firebase callable functions already handle callable CORS, but Gen-2 HTTPS functions can still be blocked at the Cloud Run/IAM invoker layer before the callable runtime gets a chance to answer the browser OPTIONS preflight. A browser then reports a misleading `No Access-Control-Allow-Origin` error.

## Fix applied
All browser-facing Calling Team functions now use:

- `cors: true`
- `invoker: "public"`
- region `asia-south1`

Authentication and authorization remain enforced inside the callable handlers with Firebase Auth custom claims, Calling panel session documents, Marketing-member ownership checks, one-time referral claims, and per-user Calling Team ownership checks.

## Functions covered
Marketing-side Calling Team management:
- marketingListCallingTeam
- marketingCreateCallingMember
- marketingUpdateCallingMember
- marketingSetCallingMemberActive
- marketingResetCallingMemberPassword
- marketingGetCallingMemberAnalysis

MLMLIVE Calling-code integration:
- resolveCallingTeamCode
- claimCallingTeamAttribution

Calling login/panel:
- callingStartTwoFactorOtp
- callingVerifyTwoFactorOtp
- callingCreateSessionFromTwoFactor
- callingSessionStatus
- callingUnlockSession
- callingPanelLogout
- callingGetDashboard
- callingSaveFollowup

## Deploy only these functions
Deploy in two groups (keeps each deploy under 10 functions):

```bash
firebase deploy --only functions:marketingListCallingTeam,functions:marketingCreateCallingMember,functions:marketingUpdateCallingMember,functions:marketingSetCallingMemberActive,functions:marketingResetCallingMemberPassword,functions:marketingGetCallingMemberAnalysis,functions:resolveCallingTeamCode,functions:claimCallingTeamAttribution
```

```bash
firebase deploy --only functions:callingStartTwoFactorOtp,functions:callingVerifyTwoFactorOtp,functions:callingCreateSessionFromTwoFactor,functions:callingSessionStatus,functions:callingUnlockSession,functions:callingPanelLogout,functions:callingGetDashboard,functions:callingSaveFollowup
```

Then redeploy the Marketing frontend on Vercel and hard-refresh the browser.

Do not redeploy the existing MLMLIVE auth functions such as `authSignupInit` or `authSignupVerify` for this fix.

## Validation
- `node --check functions/index.js`: passed
- Calling/Marketing automated tests: 22/22 passed
