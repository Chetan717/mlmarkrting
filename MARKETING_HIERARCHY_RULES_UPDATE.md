# Firestore rules update for Marketing hierarchy

Hierarchy, Marketing login emails, percentages and coupons are written only by trusted Admin Cloud Functions. Parent-team reporting is also returned by trusted Marketing callables as a sanitized, read-only response. Do not grant a Marketing client direct access to another `mteam` member's users.

Merge the following intent into the existing production rules instead of replacing unrelated rules. Adapt helper names if the current rules use different names.

```js
function signedMarketing() {
  return request.auth != null
    && request.auth.token.panel == 'marketing'
    && request.auth.token.mteamId is string;
}

function ownMarketingMember(memberId) {
  return signedMarketing() && request.auth.token.mteamId == memberId;
}

match /mteam/{memberId} {
  allow read: if ownMarketingMember(memberId);

  // Keeps the existing Portal Users feature, but prevents hierarchy/email/
  // percentage/coupon mutation from the Marketing browser.
  allow update: if ownMarketingMember(memberId)
    && request.auth.token.actorType == 'owner'
    && request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['team', 'updatedAt']);

  allow create, delete: if false;
}

match /couponcode/{couponId} {
  allow read: if signedMarketing()
    && resource.data.assigned_user.id == request.auth.token.mteamId;
  allow create, update, delete: if false;
}
```

Keep existing rules that scope a Marketing member's own `users`, `subscription`, `freshleads`, lead-followups and tasks by `request.auth.token.mteamId` or that member's own coupon. The parent My Team feature does not require broader rules because `marketingGetMyTeam` and `marketingGetTeamMemberLeads` use Admin SDK and enforce direct-parent scope server-side.

Admin frontend code no longer writes `mteam` or `couponcode` directly. Admin writes go through `panelUpsertMarketingMember`, `panelDeleteMarketingMember`, `panelUpsertMarketingCoupon` and `panelDeleteMarketingCoupon`.
