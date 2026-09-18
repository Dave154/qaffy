# React + TypeScript + Vite

## Supabase Email OTP

The customer signup and sign-in flows use Supabase email OTP. In the Supabase dashboard, open **Authentication > Email Templates** and paste the HTML from `supabase/email-templates/otp.html` into the relevant template. It uses `{{ .Token }}` and matches the app's 8-digit OTP input. The default `{{ .ConfirmationURL }}` template sends a magic link instead of a code, which will not work with the OTP input screen.

Configure the project URL and allowed redirect URLs for the application origin. The app expects the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` variables plus the server-side `SUPABASE_URL` and `SUPABASE_ANON_KEY` variables.

Set `VITE_SITE_URL` to the canonical public origin in production so canonical links and social preview URLs use the deployed domain instead of the incoming request host.

## Customer Web Push Notifications

Customer notifications are implemented with browser Web Push. Customers can enable or disable notifications from the Overview prompt or Settings. The browser registers `public/push-sw.js`, saves the subscription through `POST /api/push-subscriptions`, and the service worker opens the relevant Qaffy page when a notification is clicked.

Apply these migrations before enabling the feature in a connected Supabase project:

- `supabase/migrations/20260918100000_push_subscriptions.sql`
- `supabase/migrations/20260918110000_notification_events.sql`

Configure these environment variables on the server and client deployment:

- `VITE_VAPID_PUBLIC_KEY` for browser subscription setup
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` for server delivery
- `CRON_SECRET` for the protected subscription reminder/expiry route

The wrapped notification service records an idempotent event before sending, removes expired browser subscriptions, and records sent/failed status. Notifications currently cover pickup, delivery, ready-for-delivery, mismatch confirmation, payment required/confirmed, wallet top-up confirmation, subscription activation, and subscription renewal/expiry. The feature requires a browser with Web Push support; the VS Code embedded browser is intentionally rejected, so use Chrome or Edge over HTTPS for deployment or a supported local origin.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
