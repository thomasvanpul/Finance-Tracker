# Monorepo Inventory

Root: `/Developer/Finance-Tracker`  
Package manager: pnpm 11.12.0 with workspaces  
Workspace glob: `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`

---

## 1. Workspace Packages

### `artifacts/api-server` — `@workspace/api-server`

**What it does:** Express 5 REST API server. Handles auth (via `better-auth`), all CRUD routes for the domain (accounts, transactions, upcoming, investments, debts, budgets, goals, subscriptions), market data (FX rates, stock prices via `yahoo-finance2`), Wise bank sync, CSV import, real-time stock streaming (Alpaca WebSocket in `lib/alpaca-stream.ts`), an AI digest/receipt-reading endpoint, and a `/healthz` check. Built with esbuild (`build.mjs`) into `dist/index.mjs`.

**Status:** Live and active. This is the primary backend. The live deployment is on Railway at `https://fintrack-production-ddc0.up.railway.app` — that URL is hardcoded in the root `vercel.json` rewrites and in `artifacts/finance-tracker/.env.local`.

Key files:
- `src/app.ts` — Express setup, CORS, Helmet, rate-limiting, pino logging
- `src/index.ts` — entry point, starts HTTP server, connects Alpaca stream
- `src/routes/` — one file per domain area (accounts, transactions, investments, debts, budgets, goals, subscriptions, upcoming, market, wise, import, ai, digest, settings, export, receipt, market-live)
- `src/lib/` — better-auth config, Wise client, market data logic, logger, merchant normalizer, Alpaca stream client

---

### `artifacts/finance-tracker` — `@workspace/finance-tracker`

**What it does:** The web + mobile frontend. A Vite/React SPA named "Numeris". Serves as the user-facing app for all finance features. Also contains Tauri configuration (for desktop .dmg/.exe) and Capacitor configuration (for iOS/Android native). The mobile path is rendered at runtime via a `useIsMobile()` hook in `App.tsx` — `<MobileApp>` vs. the full desktop layout.

**Status:** Live and active. Deployed on Vercel (frontend) and proxies `/api/*` to the Railway backend. The PWA manifest and service worker are configured via `vite-plugin-pwa`.

Key files:
- `src/App.tsx` — wouter router, all page imports, `MobileApp` vs desktop branching
- `src/pages/` — ~38 page files (dashboard, transactions, accounts, investments, owing, analytics, budgets, goals, subscriptions, settings, profile, split, tax, mortgage, calendar, ai-coach, fire, pension, etc.)
- `src/components/layout.tsx` — primary desktop shell
- `src/components/mobile/` — 19 `Mobile*.tsx` files implementing the full mobile tab UI
- `src/components/widgets/` — 20 draggable dashboard widgets
- `src/components/ui/` — shadcn/ui "new-york" variant components, extended with custom inputs (`field.tsx`, `item.tsx`, `kbd.tsx`, `input-group.tsx`, `button-group.tsx`, `empty.tsx`)
- `src/index.css` — design-system token layer (`--ft-*` CSS variables, three density modes, font stack: IBM Plex Sans / JetBrains Mono / Space Grotesk)
- `capacitor.config.ts` — app ID `com.thomasvp.numeris`, appName `Numeris`, webDir `dist`
- `src-tauri/tauri.conf.json` — productName `Numeris`, devUrl `http://localhost:4321`, Tauri 2.x
- `vercel.json` (inside this package) — SPA rewrite only; a separate root-level `vercel.json` handles the full monorepo deploy with API proxy rewrites

---

### `artifacts/mockup-sandbox` — `@workspace/mockup-sandbox`

**What it does:** A local design scratchpad / component preview tool. It auto-discovers mockup components from `src/components/mockups/` via a Vite plugin (`mockupPreviewPlugin.ts`), generates an index in `src/.generated/mockup-components.ts`, and renders them in a picker UI. Also has a `src/components/terminal/` subdirectory (unseen but listed).

**Status:** Development/tooling only. No deploy target. Not imported by any other package. Used for iterating on new UI before it lands in `finance-tracker`.

Key files:
- `mockupPreviewPlugin.ts` — custom Vite plugin for component discovery and hot reload
- `src/App.tsx` — dynamic importer/renderer for mockup components
- `src/components/mockups/` — unseen contents; presumably WIP component sketches
- `components.json` — shadcn config pointing to this package's own `ui/` copies

---

### `lib/db` — `@workspace/db`

**What it does:** Drizzle ORM layer. Exports `db` (a `drizzle(pool, {schema})` instance using `pg.Pool`) and all schema types. The schema lives in `src/schema/`.

**Status:** Live. Used by `api-server`. No migration directory exists — schema is pushed via `drizzle-kit push` (destructive sync), not `drizzle-kit generate`/`migrate`. The `post-merge.sh` script runs `pnpm --filter db push` automatically after a git pull.

Key files:
- `drizzle.config.ts` — dialect `postgresql`, reads `DATABASE_URL`
- `src/index.ts` — exports `db`, `pool`, and re-exports all schema
- `src/schema/` — one file per domain table (see section 4 below)

---

### `lib/api-spec` — `@workspace/api-spec`

**What it does:** Holds the single source of truth OpenAPI spec (`openapi.yaml`, 1,982 lines) and the `orval` codegen configuration that generates both `lib/api-client-react` and `lib/api-zod` from it. Not a runtime package; codegen only.

**Status:** Active. The spec covers all 40+ API paths. Run `pnpm codegen` to regenerate clients.

Key files:
- `openapi.yaml` — OpenAPI 3.1 spec
- `orval.config.ts` — generates `react-query` hooks into `api-client-react` and Zod schemas into `api-zod`

---

### `lib/api-client-react` — `@workspace/api-client-react`

**What it does:** Generated TanStack Query React hooks for every API endpoint. Output of `orval` codegen from `lib/api-spec`. Also contains a handwritten `custom-fetch.ts` (fetch wrapper used as the orval mutator) and `feature-stubs.ts`.

**Status:** Active. Consumed by `artifacts/finance-tracker`.

Key files:
- `src/generated/api.ts` — all generated query/mutation hooks
- `src/generated/api.schemas.ts` — generated TypeScript types
- `src/custom-fetch.ts` — custom fetch mutator (handles credentials, base path)
- `src/feature-stubs.ts` — stubs for features not yet wired to a real endpoint

---

### `lib/api-zod` — `@workspace/api-zod`

**What it does:** Generated Zod validation schemas for every request/response type in the OpenAPI spec. Output of `orval` codegen from `lib/api-spec`.

**Status:** Active. Consumed by `artifacts/api-server` for request validation.

Key files:
- `src/generated/api.ts` — top-level Zod schemas
- `src/generated/types/` — ~60+ individual type files

---

### `lib/integrations/` (workspace glob declared, directory absent)

**Status:** The `pnpm-workspace.yaml` declares `lib/integrations/*` as a workspace path, but the directory does not exist on disk. No packages live there. This is an empty slot reserved for future integration packages (e.g., a future Wise, Stripe, or Plaid integration library).

---

### `scripts` — `@workspace/scripts`

**What it does:** Workspace-level utility scripts. Currently contains only one file.

**Status:** Minimal / placeholder. The only script is `src/hello.ts` which prints `"Hello from @workspace/scripts"`. Also has `post-merge.sh` (runs `pnpm install --frozen-lockfile && pnpm --filter db push`) which is referenced by `.replit` as a post-merge hook, but this shell script lives at the package root, not in `src/`.

Key files:
- `src/hello.ts` — stub
- `post-merge.sh` — schema push after merge (used by Replit)

---

## 2. Expo: Real or Vestigial?

**Expo is vestigial scaffolding with one leftover trace — it is not in use.**

Evidence:
- No `app.json`, `app.config.ts`, `app.config.js`, or `eas.json` anywhere in the repo.
- No `ios/`, `android/`, or `expo/` directories.
- No TypeScript file imports from `'expo'`, `'expo-router'`, or any `expo-*` package.
- `@workspace/finance-tracker/package.json` has no Expo dependency.
- The only Expo-named entries in the repo are:
  - A comment in `pnpm-workspace.yaml` (`# Must be this exact version because expo requires it`) next to `react: 19.1.0` and `react-dom: 19.1.0`.
  - Platform override stanzas in `pnpm-workspace.yaml` for `@expo/ngrok-bin>*` (these are binary overrides to exclude ngrok binaries for non-applicable platforms — `@expo/ngrok-bin` is a transitive dependency that arrived indirectly, likely through `better-auth` or another package).
  - A few lines in the lockfile matching `expo-sqlite` as a peer dependency of a transitive package.

The React 19.1.0 pin comment referencing "expo" is misleading: the app is not an Expo project. React 19.1.0 is pinned across the catalog but the reason is almost certainly that this was written when Expo 52/53 required that exact version, and the comment was carried over from an earlier iteration. The actual mobile surface is implemented with **Capacitor** (for iOS/Android) and **Tauri** (for desktop), both wrapping the same Vite/React build. Expo plays no role.

---

## 3. Deploy Targets

Four deploy configs exist. Two are live/real. Two are dormant.

### Vercel — **live, frontend only**

`vercel.json` (root):
```json
{
  "buildCommand": "pnpm --filter @workspace/finance-tracker run build",
  "outputDirectory": "artifacts/finance-tracker/public",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://fintrack-production-ddc0.up.railway.app/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
Vercel hosts only the SPA static build. All `/api/*` requests are rewritten to Railway. The `VITE_API_URL` in `artifacts/finance-tracker/.env.local` is `https://fintrack-production-ddc0.up.railway.app` confirming Railway is the active backend host.

### Railway — **live, backend only**

`railway.toml` builds and starts `@workspace/api-server`. The live URL `https://fintrack-production-ddc0.up.railway.app` is embedded in both the root `vercel.json` and the frontend's `.env.local`. This is the confirmed active API host.

### Render — **dormant / fallback doc only**

`render.yaml` specifies the same `api-server` build/start commands and is a valid config, but `DEPLOYMENT.md` describes it as the primary deploy target for a free-tier setup. The presence of a live Railway URL in `.env.local` and `vercel.json` indicates Railway has superseded the Render setup. Render is not currently serving traffic.

### Replit — **dev environment only**

`.replit` configures Replit as a dev runtime (pnpm workspace agent mode, postMerge hook, run button). The Replit plugins (`@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`) are conditionally enabled only when `REPL_ID` is set and `NODE_ENV !== 'production'`. Replit is not a production deployment target.

### Dockerfile — **matches Railway/Render, not separately deployed**

The `Dockerfile` builds only `api-server`. It is consistent with what Railway does. No Docker Compose file exists. Whether the Dockerfile is used by Railway or was written for manual deployment is unclear — Railway can auto-detect Dockerfiles but `railway.toml` also specifies explicit build/start commands directly. The Dockerfile may be there for local testing or as a Render alternative.

### `nixpacks.toml` — **Render/Railway artifact**

Specifies the same api-server build. Both Railway and Render support nixpacks. This is a companion to the deploy configs, not a standalone target.

---

## 4. Database Layer

**ORM:** Drizzle ORM 0.45.x  
**Driver:** `node-postgres` (`pg`) via `Pool`  
**Dialect:** PostgreSQL  
**Schema location:** `lib/db/src/schema/`  
**Config:** `lib/db/drizzle.config.ts`  

### Tables

| Table name | File | Purpose |
|---|---|---|
| `user` | `auth.ts` | better-auth users (id, name, email, emailVerified, twoFactorEnabled) |
| `session` | `auth.ts` | better-auth sessions |
| `account` | `auth.ts` | better-auth OAuth accounts |
| `verification` | `auth.ts` | better-auth email verification tokens |
| `passkey` | `auth.ts` | WebAuthn passkeys |
| `totp_credential` | `auth.ts` | TOTP 2FA credentials |
| `two_factor` | `auth.ts` | 2FA config per user |
| `accounts` | `accounts.ts` | User financial accounts (bank accounts, wallets); Wise-linked fields |
| `transactions` | `transactions.ts` | Income/expense/transfer entries; supports manual, Wise, and CSV sources |
| `upcoming` | `upcoming.ts` | Scheduled future income/expenses with frequency and status |
| `investments` | `investments.ts` | Stock holdings (ticker, shares, cost basis, buy date) |
| `debts` | `debts.ts` | IOU tracker — amounts owed to/from named contacts; linked IOU support |
| `budgets` | `budgets.ts` | Per-category monthly spending limits |
| `goals` | `goals.ts` | Savings goals with target, current amount, history (JSON array) |
| `subscriptions` | `subscriptions.ts` | Recurring subscription tracking |
| `dismissed_subscriptions` | `subscriptions.ts` | Suppression list for auto-detected subscriptions |
| `app_settings` | `app-settings.ts` | Per-user settings (base currency); one row per user |

**Migration strategy:** `drizzle-kit push` only — no migration files are generated or tracked. The `lib/db/package.json` scripts are `push` and `push-force`. There is no `generate` or `migrate` script. Schema changes are applied destructively (push syncs the schema to the live database). `DEPLOYMENT.md` instructs running `pnpm --filter @workspace/db run push` once after initial deploy.

---

## 5. UI Layer

**Package:** `artifacts/finance-tracker` (`@workspace/finance-tracker`)  
**Build tool:** Vite 7  
**Router:** `wouter` 3.3.x (lightweight client-side router)  
**Component library:** shadcn/ui "new-york" style, installed into `src/components/ui/`  
**Data fetching:** TanStack Query 5 via generated hooks from `@workspace/api-client-react`  
**Charts:** Recharts 2  
**Forms:** React Hook Form + Zod via `@hookform/resolvers`  
**Drag and drop:** @dnd-kit/core + @dnd-kit/sortable  
**Animation:** Framer Motion (permitted for specific cases despite the "anti-vibe" constitution banning spring/inertia on layout changes)

**Design system:**  
A fully custom token layer in `src/index.css`. All tokens are prefixed `--ft-*` (e.g., `--ft-base`, `--ft-surface`, `--ft-raised`, `--ft-text`, `--ft-muted`, `--ft-border`, `--ft-accent`, `--ft-green`, `--ft-red`). shadcn's `--color-*` tokens are mapped to `--ft-*` variables via Tailwind v4's `@theme inline`. Three density modes (compact / normal / comfortable) control cell padding. No external design token file (Figma tokens, Style Dictionary, etc.) — the tokens live entirely in the CSS file.

**Fonts:**  
- `IBM Plex Sans` — UI sans-serif  
- `JetBrains Mono` — all numeric values (enforced by the anti-vibe constitution)  
- `Space Grotesk` — headings

**Page count:** ~38 route-level pages covering: Dashboard, Accounts, Transactions, Upcoming, Investments, Portfolio, Owing (IOU), Settings, Profile, Reports, Goals, Analytics, Budget, Health Score, Net Worth History, What If, Subscriptions, Tax, Mortgage, Calendar, Split, Cash Flow, Year Review, Import, Recurring, Learn (stub, 223 bytes), AI Coach, Decisions, Fire, Pension, Calculators, Wardrobe, Projection, Briefing, Business, Family Finance, Trading Journal.

**Mobile surface:** Detected at runtime via `useIsMobile()`. When true, renders `<MobileApp>` — a separate component tree with 19 `Mobile*.tsx` page components and a bottom-tab `MobileNav`. This is implemented in React, compiled to web, and deployed via Capacitor to iOS/Android. It is not a separate build target.

---

## 6. Broken, Half-Finished, or Contradictory Items

**`learn.tsx` is an empty stub** (`223 bytes`). The file exists and is registered as a route, but contains no meaningful implementation.

**`portfolio.tsx` is also near-empty** (`131 bytes`). Same situation — it is imported and routed in `App.tsx` but has no real content.

**`lib/integrations/` is declared but absent.** `pnpm-workspace.yaml` includes `lib/integrations/*` as a workspace glob but the directory does not exist. pnpm silently ignores missing glob directories, so this causes no build failure, but it is dead scaffolding.

**`scripts/src/hello.ts` is a placeholder.** The `@workspace/scripts` package has a `package.json` with a `typecheck` script (which runs and works), but the only actual script is a `console.log` stub. The real automation (`post-merge.sh`) lives in the package root and is a shell script, not a TypeScript module.

**The Expo comment is misleading.** The comment `# Must be this exact version because expo requires it` in `pnpm-workspace.yaml` next to the React 19.1.0 pin does not reflect reality — there is no Expo app. The pin may be correct for other reasons (peer dep compatibility) but the comment is wrong.

**Render vs. Railway conflict.** `DEPLOYMENT.md` describes Render as the intended deploy target and gives step-by-step Render instructions. The actual live deploy is on Railway. The Render config is syntactically valid but not in use. The two configs are not contradictory in content (both build/start `api-server`) but the documentation and live reality are misaligned.

**No migration history.** The use of `drizzle-kit push` means there is no version-controlled migration trail. Any schema change that has been pushed is unrecoverable from source code alone. If the database is dropped, the current schema can be reproduced from code, but the data and the history of how the schema evolved cannot.

**`gan-harness/` inside `artifacts/finance-tracker/`** (`eval-rubric.md`, `generator-state.md`, `spec.md`). These are GAN design-loop artifacts from an earlier iteration session. They are not part of the application and serve no runtime purpose. They are not in `.gitignore` (unseen but likely not excluded).

**Tauri and Capacitor both present, neither fully wired for CI.** There is no CI/CD pipeline (no `.github/workflows/`) for building Tauri `.dmg`/`.exe` or Capacitor iOS/Android artifacts. Both configs exist and appear structurally correct, but there is no automated release process for the native targets.

**`alpacaStream.connect()` fires unconditionally on server start** (`src/index.ts`). If `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` are absent (common in dev or fresh deploys), the connection will fail silently or error on startup. There is no conditional check visible in the entry point.

**Two `vercel.json` files.** The root `vercel.json` is the actual Vercel project config (with API proxy rewrites pointing to Railway). `artifacts/finance-tracker/vercel.json` is a different, simpler config (SPA rewrite only, no API proxy). These are not identical and could cause confusion — the root one is what Vercel uses.
