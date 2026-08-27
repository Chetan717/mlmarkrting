# MLM LIVE Marketing Portal

This release replaces Marketing mobile/SMS OTP with registered-email OTP, supports Admin-assigned multi-level Marketing members, adds the read-only My Team portal, and keeps each member's dashboard scoped to its own coupon/users/commission.

Read `SECURITY_DEPLOY.md`, `MARKETING_EMAIL_HIERARCHY_DEPLOY.md` and `MARKETING_HIERARCHY_RULES_UPDATE.md` before production deployment. The Admin data migration must be completed before this email-only frontend is released.

## Frontend

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
