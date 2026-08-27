# Marketing email OTP deployment

Marketing Portal login is now email-only. The existing callable IDs are retained, so deploying this source overwrites the previous mobile/SMS implementation. Mobile remains a profile/contact field and is never accepted by the OTP endpoint.

## Important secret action

The Gmail App Password shared in chat must be treated as exposed. Revoke it in the Google account, create a new App Password, and store the replacement only as a Firebase Functions secret:

```bash
firebase functions:secrets:set EMAIL_PASS
```

Do not put the password in source, a ZIP, a frontend `VITE_` variable, or a committed `.env` file. `EMAIL_NODEMAILER` defaults server-side to `soilbooster717@gmail.com`.

## Required data before cutover

Every active `mteam` document must be saved from Admin with:

- one unique, lowercase `loginEmail`;
- `active: true` when login is allowed;
- `commissionPercentage`;
- `parentMteamId` (blank for a root member);
- `uplineBonusPercentage` (default 10);
- one assigned coupon before sales/dashboard use.

Members without `loginEmail` intentionally cannot log in. Configure root members before their children so the child percentage cap can be validated.

## Safe deploy order

1. Back up the production `mteam`, `couponcode`, `subscription` and `users` collections.
2. Deploy the Admin hierarchy callables and Admin frontend first. Use `MARKETING_EMAIL_HIERARCHY_DEPLOY.md` from the Admin package.
3. In Admin, add a unique login email, parent and percentage to every active Marketing member. Confirm all coupons are assigned correctly.
4. Install Functions dependencies and set the rotated secret:

   ```bash
   cd functions
   npm ci
   cd ..
   firebase functions:secrets:set EMAIL_PASS
   ```

5. Deploy the named Marketing callables (do not deploy an unrelated Functions source wholesale):

   ```bash
   firebase deploy --only functions:marketingStartTwoFactorOtp,functions:marketingVerifyTwoFactorOtp,functions:marketingCreateSessionFromTwoFactor,functions:marketingSessionStatus,functions:marketingUnlockSession,functions:marketingListSessions,functions:marketingRevokeSession,functions:marketingPanelLogout,functions:marketingGetProfiles,functions:marketingGetMyTeam,functions:marketingGetTeamMemberLeads
   ```

6. Build and deploy the Marketing frontend:

   ```bash
   npm ci --legacy-peer-deps
   npm test
   npm run build
   firebase deploy --only hosting
   ```

7. Test a root member and a child member. Confirm the OTP arrives only at the registered email, 6 digits are required, own dashboard counts match the coupon, the child sees its parent/percentage, and the parent My Team user table has no mobile/password columns.
8. After verification, delete the obsolete 2Factor/SMS secret if nothing else uses it.

OTP validity is 5 minutes, resend cooldown is 60 seconds, and the existing 10-hour session/password flow remains unchanged.
