# Daily panel sessions: merge into the existing production Firestore rules

The uploaded project has `firestore.indexes.json`, but does not include the live `firestore.rules` file. Therefore this is an additive merge guide, not a replacement rules file. Keep existing Admin/app access, member ownership, coupons, tabs, and collection scopes.

The new Customer Search callable uses Admin SDK after validating the Marketing/Calling session. Do NOT allow global client-side reads of `users` or `mlmprofiles` for Customer Search.

## Session expiry for direct Marketing Firestore reads

Inside `match /databases/{database}/documents`, add this helper. It is called only after checking a signed-in panel identity.

```js
function dailyPanelDocumentValid(panel) {
  let s = get(/databases/$(database)/documents/_panelSessions/$(request.auth.uid)).data;
  return s.panel == panel
    && s.ownerId == request.auth.token.mteamId
    && s.revoked == false
    && s.loginDay is string
    && s.expiresAt is timestamp
    && request.time < s.expiresAt;
}

function validMarketingDailySession() {
  return request.auth != null
    && request.auth.token.panel == 'marketing'
    && request.auth.token.mteamId is string
    && exists(/databases/$(database)/documents/_panelSessions/$(request.auth.uid))
    && dailyPanelDocumentValid('marketing');
}

function validCallingDailySession() {
  return request.auth != null
    && request.auth.token.panel == 'calling'
    && request.auth.token.mteamId is string
    && exists(/databases/$(database)/documents/_panelSessions/$(request.auth.uid))
    && dailyPanelDocumentValid('calling')
    && get(/databases/$(database)/documents/_panelSessions/$(request.auth.uid)).data.callingMemberId
       == request.auth.token.callingMemberId;
}
```

Add `&& validMarketingDailySession()` to the existing Marketing-only branch of each client read/write permission (`mteam`, own `couponcode`, own `users`, own `subscription`, own `freshleads`, own lead followups, `Taskm`, and any Marketing-only company/profile rule). Preserve the rest of that branch. If a shared rule has an Admin/app OR branch, add the daily condition only to its Marketing branch.

For example, change the Marketing part of an existing rule from:

```js
existingMarketingScope()
```

to:

```js
existingMarketingScope() && validMarketingDailySession()
```

Here `existingMarketingScope` is a placeholder for the rule's existing checks; do not paste that placeholder as a new undefined helper. If all Marketing rules use one existing `signedMarketing()` helper, append `&& validMarketingDailySession()` to its return expression instead. Do not have the new helper call `signedMarketing()`; that would introduce recursion.

The Calling Panel uses callables for its data; no new direct Firestore access is needed. If existing custom Calling-only client rules exist, append `&& validCallingDailySession()` to those existing scoped branches.

`_panelSessions`, `_panelCredentials`, `_panelOtpChallenges`, and `_panelLoginLimits` must remain inaccessible to browser clients. Sessions, loginDay and expiry are written only by trusted Functions. A rule helper can `get()` a session document without granting the browser direct read access. Check that no broad recursive allow rule grants writes to these private collections; a separate `allow write: if false` does not override another allow.

## What is enforced

New server-created sessions expire at the next midnight in Asia/Kolkata. Backend callables additionally verify the session creation day, active owner/caller/subuser and revocation on each request. Direct Firestore reads use the server-written expiry above, so refreshing or changing a browser flag cannot extend access.

Legacy sessions without loginDay will require one new OTP/password login after this rule merge. Do not add a browser-write exception to preserve those old sessions.

Deploy only after merging into the actual complete production rules, retaining unrelated rules. Test one Admin, one app user, one Marketing owner, one restricted Portal User and one Calling member before production rollout.
