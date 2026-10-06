# Calling Login hotfix — 2026-10-06

Fixes:
- Calling Team callable CORS is explicitly limited to Vercel preview domains, `*.mlmlive.in`, localhost and 127.0.0.1.
- `callingVerifyTwoFactorOtp` and the rest of the Calling login/panel callables use the same CORS policy.
- Removed the inline theme bootstrap script that was being blocked by CSP; it is now `/theme-init.js`.
- Allowed `https://www.googletagmanager.com` in `script-src` for Firebase Analytics/gtag loading.
- “Copy Calling Login Link” now shows a visible `✓ Calling Login Link Copied` toast and has a clipboard fallback.
- Removed an accidental duplicate Member cell in the Calling Team table.

Deploy only the Calling login/panel functions listed in `CALLING_TEAM_DEPLOY_STEPS.txt`, then redeploy the Marketing frontend on Vercel.
