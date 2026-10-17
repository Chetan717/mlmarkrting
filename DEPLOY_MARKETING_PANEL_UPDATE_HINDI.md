# MLM LIVE Marketing / Calling Panel update — 17 Oct 2026

## Is patch mein kya hai

1. Marketing Lead Pipeline ki desktop list/mobile cards aur Dashboard subscriber list mein Company Name. Multiple profiles mein company-filled profile choose hoti hai; profile, subscription aur user ke existing company fields se fallback. Available na ho to `—`.
2. Dono panels mein desktop/mobile header menu. Sidebar hide hone par content full available width use karta hai. Calling Panel mein My Leads aur Customer Search navigation.
3. Same India calendar day mein Firebase login restore: refresh, navigation aur browser/tab reopen par dobara password/OTP nahi. Agle din 00:00 IST par expiry; fresh OTP + password required. Manual logout server session delete karta hai aur local Firebase sign-out karta hai. Network error par restore Retry milta hai, unnecessary fresh OTP nahi.
4. Calling assigned-list search: case-insensitive name, formatted/full/partial mobile search, company search retained, Clear Search. Yeh filter sirf pehle se permitted Calling leads par lagta hai.
5. Dono panels ka on-demand Customer Search. New `panelCustomerSearch` callable exact mobile queries se `users.mobileNo` aur `mlmprofiles.mobile` lookup karta hai. Read-only matching customer/profile details; safe field allowlists; no passwords/OTP/auth tokens. Calling attribution, owners aur commission coupon unchanged.

## File apply karna

- Pehle apne existing Marketing project aur current hosting release ka backup rakhein.
- Changed-files ZIP ke `src`, `functions`, `tests` folders aur dono new MD guides ko existing Marketing project root mein same paths par merge/copy karein. Root wahi hai jahan `package.json` aur `firebase.json` hain. Nayi empty project directory mein sirf patch files mat chalayein.
- Apni `.env`, Firebase config values, EMAIL_PASS secret aur current dependencies ko preserve karein. Koi naya secret/env variable nahi chahiye.
- Alternative: matching uploaded baseline par `changes.patch` ko `git apply --check changes.patch` se check karke `git apply changes.patch` laga sakte hain. Changed files copy aur patch apply mein se ek method use karein.
- `functions/index.js` mein original exported functions preserved hain. Helper files `panelSessionPolicy.js` aur `customerLookup.js` bhi saath copy karna zaroori hai.

## Local validation

Marketing project root mein:

```powershell
npm ci --legacy-peer-deps
npm test
npm run build
```

46/46 automated tests passed in this environment. 11 browser regression groups passed with mocked Firebase responses: both panels, desktop/mobile navigation, restore/reopen, logout, lookup states and company display. Production build passed. New standalone helper/UI modules pass ESLint. Touched older modules have existing lint errors: comparable baseline 40, updated 38; no new lint-error counts. No live Firebase customer/login data was accessed.

## Deploy order — Functions first, frontend last

New frontend ko old `SessionStatus` endpoints ke saath deploy mat karein: updated status response mein `serverNow` aur daily expiry required hain.

```powershell
cd functions
npm ci
cd ..
```

Existing Firebase project `mlmbooster-a4887` ke liye named deploys:

```powershell
firebase deploy --only "functions:marketingCreateSessionFromTwoFactor,functions:marketingSessionStatus,functions:marketingUnlockSession,functions:marketingListSessions,functions:marketingRevokeSession,functions:marketingPanelLogout,functions:marketingGetProfiles,functions:marketingGetMyTeam,functions:marketingGetTeamMemberLeads" --project mlmbooster-a4887
```

```powershell
firebase deploy --only "functions:marketingListCallingTeam,functions:marketingCreateCallingMember,functions:marketingUpdateCallingMember,functions:marketingSetCallingMemberActive,functions:marketingResetCallingMemberPassword,functions:marketingGetCallingMemberAnalysis,functions:panelCustomerSearch" --project mlmbooster-a4887
```

```powershell
firebase deploy --only "functions:callingCreateSessionFromTwoFactor,functions:callingSessionStatus,functions:callingUnlockSession,functions:callingPanelLogout,functions:callingGetDashboard,functions:callingSaveFollowup" --project mlmbooster-a4887
```

Ye session-aware functions hain, isliye sab listed groups update karein. CORS region/settings unchanged hain. Existing app signup/referral functions aur `resolveCallingTeamCode`/`claimCallingTeamAttribution` ko is patch ke liye redeploy karna zaroori nahi. `firebase deploy --only functions` jaisa blanket deploy use na karein.

## Firestore rules — required merge

`MARKETING_PANEL_SESSION_RULES.md` mein diya session guard actual complete production rules mein merge karein. Live rules ZIP mein nahi hain, isliye koi replacement rules file assume nahi ki gayi. Marketing ke existing direct Firestore reads par daily expiry/logout server-side enforce karne ke liye yeh merge required hai. Global customer read permission add mat karein.

Naye lookup queries single-field `in` queries hain; existing automatic mobileNo/mobile indexes use hote hain. Koi new composite index ya customer collection migration is patch mein nahi hai. Agar production mein in fields ki single-field indexing disable ki gayi hai, unhe enable karna hoga.

## Frontend

Functions/rules ready hone ke baad current Marketing Vercel Preview redeploy karein, existing VITE env values ke saath. Agar Firebase Hosting use karte hain:

```powershell
firebase deploy --only hosting --project mlmbooster-a4887
```

Updated project ZIP mein complete source/configs hain. Generated `dist` aur `node_modules` include nahi hain; upar diye root aur Functions ke `npm ci` commands se dependencies install karein.

## Portal User permission

Marketing owner aur Calling member ko Customer Search available hai. Marketing Portal Users ke liye existing `Portal Users` page par naya **Customer Search** tab permission assign karein. Permission removal backend par current team array se verify hoti hai. Newly assigned permission ko token mein lane ke liye us Portal User ko ek baar logout/login karayein. Existing tab permissions automatically broaden nahi hoti.

## Smoke test

- Dono panels: OTP/password login, refresh 2–3 times, same-day new tab/browser reopen; no repeat challenge.
- Manual Logout ke baad refresh par full login. Next India day par full login. Server validity backend clock se check hoti hai.
- Restore ke waqt loading; network failure par Retry. Device/browser clock change se server validity extend nahi hoti.
- Desktop menu close/open: content width grows/shrinks. Mobile menu open, tab select, backdrop/Escape close, header menu accessible.
- Calling My Leads: Fetch, name in different case, +91/spaces/mobile partial search, Clear Search. Follow-up, filters and paging continue working.
- Lead Pipeline/Dashboard: populated company profile, first blank profile + second named profile, no-company `—`, company search/filter and existing pagination.
- Customer Search tab: opening alone makes no customer/list query. Search valid registered number, unassigned customer, missing number, invalid input, network failure, and a second number clearing previous details.
- Customer Search result must omit password, OTP, auth/refresh tokens and credential objects. Result has no edit/action that changes attribution.

## Data boundaries

Actual safe stored fields are shown only when present. No guessed company, name, plan or profile data is inserted. Lookup returns one customer for the matching normalized mobile; canonical records are preferred if duplicate legacy records exist. Up to 30 matching profiles are returned with an explicit truncation notice. Missing customer message: `Is mobile number par customer registered nahi hai.`

Normal 10-digit strings, numeric legacy values, 91/+91 prefixes, leading 0, and common spaced mobile formats are supported with bounded equality queries. There is no full-collection download/scan for universal search. Search is rate-limited to 30 requests per session per minute.

Old same-day legacy sessions may require one fresh login during rollout. New sessions follow the daily policy. The project still shares one Firebase Auth instance between Marketing and Calling, so the same browser profile has one active panel identity at a time, as before.

Rollback: restore the previous frontend/source release and redeploy only the functions listed above from that backed-up source. Retain safe scoped Firestore rules; do not open global users/profile reads to work around a deployment issue.
