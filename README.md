# Fintrack — Personal Finance Tracker

A full-stack personal finance tracker. GBP base currency, single-user, dark "Excel Pro" spreadsheet theme.

**Live site:** [finance-tracker-api-server-one.vercel.app](https://finance-tracker-api-server-one.vercel.app/)

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
| Deployment | Vercel (frontend) + Railway (API) + Neon (Postgres) |

---

## Repo layout

```
artifacts/
  finance-tracker/   # React + Vite frontend  →  Vercel
  api-server/        # Express 5 API          →  Railway
lib/
  db/                # Drizzle schema (source of truth for DB shape)
  api-spec/          # openapi.yaml (source of truth for API contract)
  api-client-react/  # generated — do not hand-edit
  api-zod/           # generated — do not hand-edit
vercel.json          # Vercel frontend build config
Dockerfile           # Railway API build config
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

### API server (Railway)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `APP_PASSWORD` | Password gate for the whole app |
| `JWT_SECRET` | Session signing secret (`openssl rand -hex 32`) |
| `SESSION_SECRET` | Express session secret |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins (your Vercel URL) |
| `WISE_API_TOKEN` | Wise personal API token (Settings → API tokens) |
| `WISE_ENV` | `live` (default) or `sandbox` |

### Frontend (Vercel)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Full URL of your Railway API (e.g. `https://fintrack-production-ddc0.up.railway.app`) |

---

## Bank connections

This app does **not** use Plaid. Here's why and what's used instead:

- **Plaid** requires the developer to be based in the US/Canada for free real-data access. Not practical for a personal project outside those regions.
- **Wise** — free personal API token, no business account needed. Automatic sync via the Accounts page.
- **Revolut** — no free API for individuals (Open Banking requires FCA registration). Use CSV export instead.
- **Maybank** — Malaysia has no open banking mandate, so no API exists. Use CSV export instead.

---

## Deployment

The app is split across two platforms:

- **Vercel** — serves the React frontend (CDN, instant cold starts)
- **Railway** — runs the Express API (always-on, no cold starts, $5/mo free credit)
- **Neon** — PostgreSQL database (free tier)

### Initial setup

1. Connect the GitHub repo to a Vercel project. Set `VITE_API_URL` in Vercel environment variables.
2. Connect the GitHub repo to a Railway service. Railway auto-detects the `Dockerfile`. Add all API env vars in the Variables tab.
3. Run `pnpm --filter @workspace/db run push` once locally with `DATABASE_URL` set to initialise the schema.
