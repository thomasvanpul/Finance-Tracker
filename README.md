# Fintrack — Personal Finance Tracker

A full-stack personal finance tracker. GBP base currency, single-user, dark "Excel Pro" spreadsheet theme.

**Live site:** [financetracker.work](https://financetracker.work)

---

## Features

### Dashboard
- KPI cards: net worth, monthly income/expenses, total investments at live value
- 6-month bar chart (income vs expenses) powered by Recharts

### Transactions
- Full transaction log with running balance
- Client-side filters: text search, income/expense type, date range
- Inline edit dialog per row
- Category autocomplete with 25 predefined suggestions (free text also accepted)
- Delete with confirmation

### Accounts
- Manual account management (GBP, MYR, multi-currency)
- **Wise sync** — one-click import of real Wise transactions via personal API token
- **CSV import** — Revolut and Maybank statement exports, with inline error display for malformed rows and automatic deduplication (safe to re-import)

### Investments
- Portfolio positions with live prices from Yahoo Finance
- FX conversion to GBP via live rates
- P&L per position (native currency + GBP) and overall portfolio summary
- Batched price fetching (one API call per request, not one per position)

### Settings
- Password change (bcrypt-hashed)
- TOTP two-factor authentication — QR code setup + enable/disable toggle

### Security
- Session-based auth (httpOnly cookies) with rate limiting on login (5 attempts / 15 min per IP)
- 2FA via TOTP (otplib)
- Single shared `APP_PASSWORD` — adequate for personal use, not multi-user

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 24, TypeScript 5.9, pnpm workspaces |
| Frontend | React 19, Vite, Tailwind v4, shadcn/ui, Recharts |
| API | Express 5, express-session |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| API contract | OpenAPI spec → Orval codegen (typed hooks + Zod schemas) |
| Bank sync | Wise personal API token |
| Market data | yahoo-finance2 (5-min in-memory cache) |
| Auth | bcrypt, otplib, qrcode |
| Deployment | Vercel (frontend) + Render (API) + Neon (Postgres) |

---

## Repo layout

```
artifacts/
  finance-tracker/   # React + Vite frontend  →  Vercel
    vercel.json      # ← the vercel config Vercel actually reads
                     #   (project Root Directory = artifacts/finance-tracker)
  api-server/        # Express 5 API          →  Render (numeris-api.onrender.com)
lib/
  db/                # Drizzle schema (source of truth for DB shape)
  api-spec/          # openapi.yaml (source of truth for API contract)
  api-client-react/  # generated — do not hand-edit
  api-zod/           # generated — do not hand-edit
render.yaml          # Render API build/start config
vercel.json          # DEAD — see INVENTORY.md and BACKLOG § G3
Dockerfile           # unused legacy Railway build config
```

---

## Local development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev       # API on :8080
pnpm --filter @workspace/finance-tracker run dev  # Vite dev server on :5173
```

Other useful commands:

```bash
pnpm run typecheck                                 # full monorepo typecheck
pnpm run build                                     # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen      # regenerate hooks/schemas after editing openapi.yaml
pnpm --filter @workspace/db run push               # push DB schema changes (dev only)
```

---

## Environment variables

### API server (Render)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `APP_PASSWORD` | Password gate for the whole app |
| `JWT_SECRET` | Session signing secret (`openssl rand -hex 32`) |
| `SESSION_SECRET` | Express session secret |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `https://financetracker.work,capacitor://localhost`). The `capacitor://localhost` entry is required for the native iOS shell — see BACKLOG § G13. |
| `WISE_API_TOKEN` | Wise personal API token (Settings → API tokens) |
| `WISE_ENV` | `live` (default) or `sandbox` |

### Frontend (Vercel)

| Variable | Purpose |
|---|---|
| `VITE_NATIVE_API_URL` | Full URL of the Render API (e.g. `https://numeris-api.onrender.com`). ONLY consulted at runtime when the app detects it is running inside the Capacitor native shell — the web bundle ignores it (same-origin via Vercel rewrite). Baked into the native bundle at `pnpm build` time; `npx cap sync ios` then packages it. |
| `VITE_API_URL` | Legacy escape hatch. On web, the Vercel `/api/*` rewrite handles routing without needing an explicit base — leaving this unset keeps the session cookie same-origin (Safari drops cross-domain cookies as third-party). Only set this if you know why you are. |

---

## Bank connections

This app does **not** use Plaid. Here's why and what's used instead:

- **Plaid** requires the developer to be based in the US/Canada for free real-data access. Not practical for a personal project outside those regions.
- **Wise** — free personal API token, no business account needed. Automatic sync via the Accounts page.
- **Revolut** — no free API for individuals (Open Banking requires FCA registration). Use CSV export instead.
- **Maybank** — Malaysia has no open banking mandate, so no API exists. Use CSV export instead.

---

## Deployment

The app is split across three platforms:

- **Vercel** — serves the React frontend (CDN, instant cold starts). Project Root Directory set to `artifacts/finance-tracker`.
- **Render** — runs the Express API at `https://numeris-api.onrender.com` (free tier — ~60s cold start after ~15 min idle).
- **Neon** — PostgreSQL database (free tier).

### Initial setup

1. Connect the GitHub repo to a Vercel project. Set the project's **Root Directory to `artifacts/finance-tracker`** so Vercel reads the package's own `vercel.json` (which has the `/api/*` rewrite to Render). Do not set `VITE_API_URL` — leaving it unset keeps the session cookie same-origin.
2. Connect the GitHub repo to Render. `render.yaml` at the repo root specifies the service name (`numeris-api`), region (`frankfurt`), and healthcheck path (`/api/healthz`). Add API env vars in the service's Environment tab.
3. Run `pnpm --filter @workspace/db run push` once locally with `DATABASE_URL` set to initialise the schema.
