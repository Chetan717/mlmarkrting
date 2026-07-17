# Secure OTP panel deployment

1. Firebase Phone Auth is not used. OTP is delivered only through the server-side 2Factor.in account.
2. Every active marketing owner must have one `mteam` document with their 10-digit `mobile` and `active: true`.
3. Run `firebase use --add`, then `cd functions && npm install && cd ..`.
4. Store the 2Factor key as a server secret: `firebase functions:secrets:set TWOFACTOR_API`. Never add it to a `VITE_` variable.
5. Manually merge the supplied rule blocks into production; do not overwrite existing rules/indexes.
6. Deploy only Marketing's named callables: `firebase deploy --only functions:marketingStartTwoFactorOtp,functions:marketingVerifyTwoFactorOtp,functions:marketingCreateSessionFromTwoFactor,functions:marketingPanelLogout,functions:marketingGetProfiles`.
7. Add `.env.example` values to the frontend host and run `npm install --legacy-peer-deps && npm run build`.

Only the verified `mteam.mobile` owner receives OTP. After OTP, the owner selects their own portal or an active sub-user. Sub-users have no password and no separate OTP. Each signed session carries one immutable `mteamId`; rules scope users, subscriptions, leads, coupons and team data to that owner. Panel auth is memory-only, so refresh/close requires OTP again.
