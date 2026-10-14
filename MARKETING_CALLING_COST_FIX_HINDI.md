# MLM LIVE Marketing — Calling Company Name + Firestore Reads Optimization

यह Patch `mlmarkrting(1).zip` (14 Oct 2026) से बनाया गया है। कोई Live Firebase/Firestore account इस environment से access नहीं किया गया; यह source-level audit और local test है।

## Root causes

1. Calling Team के दो screens में `companyName` server response से आता था। `functions/index.js` में पुराना resolver सिर्फ `profile.companyName` या `subscription.company` देखता था, और अनेक MLM Profiles एक mobile से जुड़ी होने पर पहली profile चुन लेता था — कभी company खाली।
2. `callingLeadsBundle` हर request पर 5,000 तक Calling users, सभी owner-coupon subscriptions, उनकी MLM profiles और follow-up documents fetch करता था, plus an extra aggregation count। यही Calling views की प्रमुख repeat read cost है।
3. `FreshLead` tab खुलने पर `FRESHLEADS` के 2,000 तक documents fetch करता था। `MonthWiseReport` tab खुलने पर successful subscriptions फिर पढ़ता था।

## Implemented

- `functions/callingCompany.js`: legacy `companyName`, `company_name`, `CompanyName`, `company.name` support; multiple profiles में company-filled profile को प्राथमिकता; profile न हो तो matching subscription/user से fallback। **किसी नए Firestore collection पर query नहीं।** यदि company कहीं stored ही नहीं है तो `—` दिखेगा; guessed name नहीं।
- `functions/callingReadCache.js`: bounded, in-memory, per-instance cache; in-flight duplicate requests merge; failed queries never cached। 60-second Calling Lead cache (at most 500 leads), 90-second owner+coupon subscription cache (at most 5,000 subscriptions)। Callers/owners अलग keys में; original secure authentication/authorization checks पहले होते हैं। Cached data may be ~60–90 seconds old. Restart/multiple instances means no cache guarantee.
- Calling users 5,000 से कम हों तो unnecessary `.count()` query हटाई। अगर 5,000 पूरे मिलें, `.count()` अभी भी उपयोग होती है ताकि truncated/totalUsers का सही result रहे।
- Follow-up save होने पर संबंधित Calling Lead cache invalidate। Calling Panel का manual Refresh server cache bypass करता है।
- Marketing Calling Member Analysis बार-बार खुले तो वही protected short cache उपयोग करता है। `Fetch Team` remains on-demand.
- Marketing `FreshLead` tab: same Firebase signed-in UID + marketing member ID के लिए 90-second memory cache; add/edit/delete/toggle पर cache invalidate; explicit Refresh हमेशा server से fresh।
- Marketing `MonthWiseReport`: उसी signed-in UID + coupon के लिए 120-second successful-subscription cache। **Refresh Report** button force-fetch करता है, ताकि commission/sales live check किए जा सकें।
- Functions `package.json` और lockfile runtime Node 24 ताकि targeted deploy के लिए current Firebase supported runtime configure हो। बाकी Firebase Functions का code और names नहीं हटाए।

## Direct Copy-Paste (No BAT)

Patch ZIP के अंदर मौजूद `functions`, `src`, और `tests` folders अपने existing **Marketing project root** में उसी path पर copy/replace करें। हमेशा existing project की copy/backup लें। आपका existing `.env`, secret values, and config untouched रखें।

**Functions सबसे पहले deploy करें:** Marketing Project के root में PowerShell खोलें:

```powershell
cd functions
npm ci
cd ..
firebase deploy --only "functions:callingGetDashboard,functions:marketingGetCallingMemberAnalysis" --project mlmbooster-a4887
```

दोनों के successful update होने पर Marketing frontend को Vercel Preview पर redeploy करें। मौजूदा Vercel env values को बनाए रखें।

**किसी भी DELETE prompt को approve न करें।** `firebase deploy --only functions` या `firebase deploy` बिना explicit filter के न चलाएँ। Existing Admin/WebApp/Marketing functions नहीं हटाएँ।

## Manual test checklist

1. Marketing Calling Team → Fetch Team → Analysis → Company column, company dropdown।
2. Calling Portal → Fetch My Users → Company column → Refresh → latest data।
3. User जिसने MLM profile में Company Name भरी है: वह दिखनी चाहिए। Duplicate profile में पहली blank और दूसरी named हो तो named choose होनी चाहिए।
4. Caller's saved Follow-up → status update और अगली manual Refresh पर latest status।
5. Marketing Fresh Leads → खोलें, दूसरे Tab पर जाएँ, 90 सेकंड के भीतर वापस आएँ: duplicate Firestore document fetch skip होना चाहिए; Refresh दबाने पर fresh fetch।
6. Month Wise Report → दूसरे Tab पर जाकर वापस आएँ: 120 sec में subscriptions फिर नहीं पढ़नी चाहिए; Refresh Report दबाने पर fresh।
7. WebApp Signup, login, referral, commission, R2/CDN unaffected; उनके Functions को redeploy नहीं किया।

## Limitations / further cost cuts

**Exact bill saving estimate अभी नहीं दिया जा सकता।** Firebase usage/billing and live read traces मिलने पर before/after comparison होगा। Cache only lowers repeated reads on warm instances; first cold fetch still incurs reads. Calling pages with 500+ leads are deliberately not cached in full (memory safety), but their owner subscription scan is still cached. Heavy `MainTeam`, `LeadManagement`, `MarketingTeam`, `MonthWiseReport` initial first loads and wide Firestore queries still incur reads. Full elimination would require server-side cursor pagination, indexes, pre-aggregated counters, and verified account-scoped query changes. Do not delete Cloud Functions to cut billed Firestore document reads; hosting shift alone does not change those reads.

## Tests

27 / 27 local Node tests pass; all modified JSX parsed without syntax errors using TypeScript JSX parser; `functions/index.js` Node syntax valid. No live login or production test was performed here.
