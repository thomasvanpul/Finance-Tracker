# Fintrack — Personal Finance Tracker

A full-stack personal finance tracker. GBP base currency, single-user, dark "Excel Pro" spreadsheet theme. Deployed on Render + Neon (both free tier).

**Live site:** check your [Render dashboard](https://dashboard.render.com) → fintrack service for the URL (format: `https://fintrack-xxxx.onrender.com`).

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
| Deployment | Render (web service) + Neon (Postgres), both free tier |

---

## Repo layout

```
artifacts/
  finance-tracker/   # React + Vite frontend
  api-server/        # Express 5 API
lib/
  db/                # Drizzle schema (source of truth for DB shape)
  api-spec/          # openapi.yaml (source of truth for API contract)
  api-client-react/  # generated — do not hand-edit
  api-zod/           # generated — do not hand-edit
render.yaml          # Render deployment config
```

---

## Local development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev       # API on :8080
pnpm --filter @workspace/finance-tracker run dev  # Vite dev server
```

Other useful commands:

```bash
pnpm run typecheck                                 # full monorepo typecheck
pnpm run build                                     # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen      # regenerate hooks/schemas after editing openapi.yaml
pnpm --filter @workspace/db run push               # push DB schema changes (dev only, no migrations file)
```

---

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `WISE_API_TOKEN` | Wise personal API token (Settings → API tokens) |
| `WISE_ENV` | `live` (default) or `sandbox` |
| `SESSION_SECRET` | Session signing secret (Render auto-generates) |
| `APP_PASSWORD` | Password gate for the whole app |

---

## Bank connections

This app does **not** use Plaid. Here's why and what's used instead:

- **Plaid** requires the developer to be based in the US/Canada for free real-data access. Not practical for a personal project outside those regions.
- **Wise** — free personal API token, no business account needed. Automatic sync via the Accounts page.
- **Revolut** — no free API for individuals (Open Banking requires FCA registration). Use CSV export instead.
- **Maybank** — Malaysia has no open banking mandate, so no API exists. Use CSV export instead.

---

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full Render + Neon setup walkthrough.

**TL;DR:** connect the GitHub repo to a new Render web service, set the four env vars, deploy, then run `pnpm --filter @workspace/db run push` once to initialise the schema.

Note: Render's free tier spins down after ~15 min of inactivity (30–60s cold start on next visit). Fine for personal use.
