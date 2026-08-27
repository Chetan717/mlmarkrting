# Production checklist: Marketing email OTP + hierarchy

Use the detailed steps in `SECURITY_DEPLOY.md`. The critical order is:

1. Deploy Admin callables/UI.
2. Configure every active Marketing member's unique email, parent and percentage in Admin.
3. Rotate the exposed Gmail App Password and set the replacement with `firebase functions:secrets:set EMAIL_PASS`.
4. Deploy the named Marketing callables so the old SMS endpoints are overwritten.
5. Deploy Marketing hosting.
6. Merge the supplied Firestore rule update; never replace the complete production rules file with the snippet.
7. Smoke-test email OTP, root/child dashboards, direct My Team visibility, percentage cap, accurate sales/users, and the server-enforced mobile/password exclusion.

Rollback is source-level: keep the previous hosting release available, but do not restore mobile OTP. If cutover is blocked, pause Marketing login while fixing member emails rather than exposing a phone/SMS fallback.
