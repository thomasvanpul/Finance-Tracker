# Fintrack — Personal Finance Tracker

A full-stack personal finance tracker with Wise bank sync, CSV import (Revolut, Maybank), Yahoo Finance live market data, and multi-currency support. GBP base currency, single-user, dark "Excel Pro" spreadsheet theme.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (generates typed hooks + Zod schemas from the OpenAPI spec)
- Bank sync: Wise personal API token (real-time, automatic)
- CSV import: Revolut and Maybank statement exports (manual upload, automatic parsing)
- Market data: yahoo-finance2 (live prices)

## Where things live

- `artifacts/finance-tracker/` — React+Vite frontend
- `artifacts/api-server/` — Express 5 API
- `lib/db/` — Drizzle schema
- `lib/api-spec/openapi.yaml` — source of truth for the API contract
- `lib/api-client-react/`, `lib/api-zod/` — generated from the spec, don't hand-edit

## Local development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev     # API on :8080
pnpm --filter @workspace/finance-tracker run dev # frontend (Vite)
```

Other useful commands:

```bash
pnpm run typecheck                                  # full monorepo typecheck
pnpm run build                                      # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen       # regenerate API hooks/schemas after editing openapi.yaml
pnpm --filter @workspace/db run push                # push DB schema changes (dev only, no migrations)
```

## Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `WISE_API_TOKEN` | Wise personal API token (Wise → Settings → API tokens) |
| `WISE_ENV` | `live` (default) or `sandbox` for testing |
| `SESSION_SECRET` | Session signing secret |
| `APP_PASSWORD` | Password gate for the whole app (see below) |

## Bank connections

This app does **not** use Plaid. Here's why, and what's used instead:

- **Plaid** requires the *developer* (not the bank) to be based in the US or Canada to get free real-data access; outside that, it's a paid/sales-driven process. Not worth it for a personal project.
- **Wise** — has its own free personal API token, no business account needed. Fully automatic sync via `/wise/sync`.
- **Revolut** — no free API for individuals (their Open Banking API requires FCA registration as a regulated third party). Use CSV export instead.
- **Maybank** — Malaysia has no open banking mandate, so there's no API at all. Use CSV export instead.

### CSV import

Export a statement from Revolut or Maybank, then use the "Import CSV" button in the Accounts page. Transactions are deduplicated automatically (re-importing the same file is safe).

## Security note

This is a single-user app with **no per-request authentication on API routes** — access is controlled by a single shared password gate in front of the whole app (see `APP_PASSWORD`). This is adequate for personal use behind a private URL, but do not extend this app to handle other people's data without adding real authentication first.

## Deployment

See `DEPLOYMENT.md` for the free-tier Render + Neon setup.
