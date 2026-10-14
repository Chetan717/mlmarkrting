# MLMLIVE Marketing — Final Optimized Source (14 October 2026)

Source basis: `mlmarkrting(1).zip`, plus the Calling Company/Read-Cache patch prepared earlier in this conversation. This is a complete source project, not only a patch. `node_modules` and all real `.env` files are excluded. It has **not** been deployed or tested on live Firebase/Vercel.

## Included working fixes

1. Calling Team and Calling Portal show Company Name using legacy field names and the best available named MLM profile; subscription/user fallback if appropriate. Company cannot be invented when data is missing.
2. Calling dashboard: short owner/caller-scoped in-memory caches and in-flight request dedup; manual Refresh bypasses cache; follow-up save invalidates cached leads.
3. Fresh Leads: UID + Marketing account-scoped 90-second cache, invalidate after writes, explicit Refresh bypass.
4. Month Wise Report: on-demand fresh Refresh; successful subscription snapshots shared across relevant Marketing views for up to 60 seconds.
5. Main Team Dashboard: short UID-scoped caching for successful subscriptions, referred users and MLM profiles, with a `Refresh Dashboard` control which bypasses the cache. The returned subscription objects carry both `id` and `documentId` for compatibility.
6. Lead Management: users/follow-ups always fetched live on Fetch, its subscription query also force-fetches; active company dropdown query cache (10 min).
7. Marketing Team listing: a 90-second account-scoped cache on tab remount, invalidation after successful member add/edit/delete, plus `Refresh Team`.
8. User/password/login/commission/attribution logic is unchanged. Existing 27 Marketing exports are retained.

**Limits:** In-memory caches only reduce REPEATED reads on an active browser/server instance. First wide queries still cost Firestore reads; billing savings are not quantified. Large result sets beyond cache caps are deliberately never retained. Offline or deployed multi-instance conditions may still cause network requests. Cloud Functions are NOT removed.

## Deployment without any BAT

1. Download ZIP and Extract. Keep a copy of your currently running Marketing project and all its existing `.env` files.
2. Put your existing working **frontend** `.env` into this project's root (or preserve the same environment values in Vercel). The `.env.example` contains placeholders only.
3. Put your existing working **Marketing Functions** `functions/.env.mlmbooster-a4887` or required configured secrets back in the extracted project. We intentionally do not package live secrets.
4. In extracted Marketing root on Windows PowerShell:

```powershell
cd functions
npm ci
cd ..
firebase deploy --only "functions:callingGetDashboard,functions:marketingGetCallingMemberAnalysis" --project mlmbooster-a4887
```

5. Verify both targeted Function updates successfully completed. **Do not** deploy unfiltered `functions`, delete any existing Functions, or alter Signup Auth/Referral Cloud Functions.
6. Deploy the extracted Marketing root to a **Vercel Preview** deployment, preserving existing environment variables. Build command: `npm ci && npm run build` or your existing working Vercel build settings.
7. Test: Calling Team → Fetch Team → Analysis; Calling Portal → Fetch My Users; company name in both; Save Follow-up → Refresh; Fresh Leads add/edit/Refresh; Main Team Dashboard ↻ Refresh Dashboard; Month-wise Report Refresh Report; Marketing Team Add/Edit/Delete and Refresh Team; Login and protected role access.
8. Once verified, promote this Marketing Preview. Keep the previous Vercel deployment for rollback.

## What we deliberately did NOT do

- No Cloud Function deletion, no Firestore changes/index creation, no broad permissions update.
- No hardcoding secrets, no private user data migration.
- No change to commission computation or Calling attribution flow.
- No aggressive server-side cursor rewrite that would silently drop older leads/users; that needs indexed queries and live data profiling before rollout.
- No claim that storage/hosting change alone can reduce Firestore reads.

## Testing

34 automated Node tests pass, including 7 new client-cache tests. TypeScript parser scanned 44 JS/JSX source files with zero parse errors. Full Vite build was **not** verified in this environment because `npm ci` could not complete; run `npm ci && npm run build` in your development/Vercel environment before production deploy.
