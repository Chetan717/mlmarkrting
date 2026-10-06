# Calling Team Gen-2 deploy recovery

The Calling Team endpoints are Firebase HTTPS callable functions. `cors: true` is retained, but the explicit `invoker: "public"` override was removed. Firebase callable deployment already publishes callable endpoints and handles OPTIONS preflight.

## 1. Use current Firebase CLI

```bash
npm install -g firebase-tools@latest
firebase --version
firebase use mlmbooster-a4887
```

## 2. Retry the four failed revisions ONE AT A TIME

Run from the project root:

```bash
firebase deploy --only functions:marketingCreateCallingMember
firebase deploy --only functions:marketingSetCallingMemberActive
firebase deploy --only functions:resolveCallingTeamCode
firebase deploy --only functions:claimCallingTeamAttribution
```

Do not deploy the whole functions folder.

## 3. If one of those still says Container Healthcheck failed

Retry that same function once by itself. If it still fails, inspect only that function's runtime log:

```bash
firebase functions:log --only resolveCallingTeamCode --lines 50
```

(replace the function name as needed)

## 4. If deploy succeeds but browser still gets CORS/403

A failed initial Gen-2 create can leave the Cloud Run service without public invoker permission. Since these Calling Team functions are new, clean-recreate ONLY the affected Calling function:

```bash
firebase functions:delete resolveCallingTeamCode --region asia-south1 --force
firebase deploy --only functions:resolveCallingTeamCode
```

Repeat only for the affected new Calling Team function. Do NOT delete any existing MLM LIVE auth functions.

Alternative if gcloud is installed and you prefer not to delete/recreate:

```bash
gcloud run services add-iam-policy-binding resolvecallingteamcode \
  --region=asia-south1 \
  --project=mlmbooster-a4887 \
  --member=allUsers \
  --role=roles/run.invoker
```

Cloud Run service names are normally lowercase function names. Use the exact service name shown in the deployment error/Cloud Run console.

## 5. Then deploy remaining Calling login functions in small batches / individually if needed

```bash
firebase deploy --only functions:callingStartTwoFactorOtp
firebase deploy --only functions:callingVerifyTwoFactorOtp
firebase deploy --only functions:callingCreateSessionFromTwoFactor
firebase deploy --only functions:callingSessionStatus
firebase deploy --only functions:callingUnlockSession
firebase deploy --only functions:callingPanelLogout
firebase deploy --only functions:callingGetDashboard
firebase deploy --only functions:callingSaveFollowup
```

Existing MLM LIVE functions such as `authSignupInit` and `authSignupVerify` must not be redeployed for this fix.
