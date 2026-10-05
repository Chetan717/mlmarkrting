# My Calling Team — Implementation & Deploy Notes

## What is implemented in this Marketing project

- Marketing Member portal now has **My Calling Team**.
- Marketing Member can create/edit/disable Calling Team members with Name, Mobile, Login Email and unique **Calling Coupon Code (tracking only)**.
- Calling Team has a separate secure login at `/calling-login` and panel at `/calling-portal`.
- Login uses registered Email OTP + strong password + isolated Firebase custom claims/session.
- Calling Member sees only users attributed to that Calling Member.
- Marketing Member can open member-wise Analysis with date, plan, lead status, MLM profile and company filters.
- Calling Member can Call, WhatsApp and save follow-up status/note/next follow-up date.
- Password reset from Marketing Member panel revokes existing Calling Team sessions.
- Calling Team code is explicitly **0 commission** and is not used to query/compute successful subscription commission.
- Firestore indexes for calling attribution and follow-ups are included in `firestore.indexes.json`.

## Data model

Calling member:

`marketingCallingTeam/{callingMemberId}`

```text
ownerId         = Main Marketing Member mteam document ID
name            = Calling Member name
mobile          = Calling Member mobile
email           = Calling Member login email
code            = Unique Calling Coupon Code (tracking only)
active          = true/false
```

End user attributed from a Calling Team code must keep main Marketing ownership:

```text
referredByMteam = MAIN_MARKETING_MEMBER_MTEAM_ID
referredBy      = MAIN_MARKETING_REFER_CODE   (keep existing ownership/referral flow)
callingTeamId   = CALLING_MEMBER_ID
callingTeamCode = CALLING_TRACKING_CODE
```

For subscriptions/payments:

```text
couponApplied = MAIN_MARKETING_MEMBER_COUPON_CODE
```

Never put the Calling Team code in `subscription.couponApplied`. This is what guarantees that Calling Team code itself earns/counts no commission.

## MLMLIVE app integration hook

This ZIP is the Marketing project, so the mobile/app signup code is not present here. The backend hook is already implemented as the callable function:

`resolveCallingTeamCode({ code })`

When a user enters a referral/coupon code in MLMLIVE:

1. Call `resolveCallingTeamCode` with the entered code.
2. If `matched === true`, treat it as a Calling Team tracking code.
3. Save `referredByMteam`, `callingTeamId`, `callingTeamCode` from the response on the user.
4. Continue the existing referral ownership using `mainReferCode`.
5. For any paid subscription/commission logic use `mainCouponCode` / `commissionEligibleCode`, never the entered Calling Team code.
6. If `matched === false`, continue the existing normal referral/coupon flow unchanged.

Important returned values:

```text
matched
callingTeamId
callingTeamCode
referredByMteam
mainReferCode
mainCouponCode
commissionEligibleCode
callingCodeCommission = 0
```

## Deploy

**Do not deploy the whole Functions source blindly.** The existing MLMLIVE auth functions (`authSignupInit`, `authSignupVerify`, etc.) stay unchanged in `us-central1`. This Marketing project adds only the Calling Team functions in `asia-south1`.

Use the exact safe order in `CALLING_TEAM_DEPLOY_STEPS.txt`. In short:

```bash
firebase deploy --only firestore:indexes

firebase deploy --only functions:marketingCreateCallingMember,functions:marketingListCallingTeam,functions:marketingUpdateCallingMember,functions:marketingSetCallingMemberActive,functions:marketingResetCallingMemberPassword,functions:marketingGetCallingMemberAnalysis,functions:resolveCallingTeamCode,functions:claimCallingTeamAttribution,functions:callingStartTwoFactorOtp,functions:callingVerifyTwoFactorOtp,functions:callingCreateSessionFromTwoFactor,functions:callingSessionStatus,functions:callingUnlockSession,functions:callingPanelLogout,functions:callingGetDashboard,functions:callingSaveFollowup
```

Then deploy the Marketing frontend and finally the updated MLMLIVE app/frontend.

The new indexes can take some time to become ready in Firebase; detailed Calling Team queries should be tested only after index creation completes.
