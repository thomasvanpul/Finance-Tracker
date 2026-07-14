# Fintrack — Personal Finance Tracker

A full-stack personal finance tracker with Wise bank sync, CSV import (Revolut, Maybank), Yahoo Finance live market data, and multi-currency support. GBP base currency with USD, MYR, and CNY accounts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/finance-tracker run dev` — run the frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `WISE_API_TOKEN`, `SESSION_SECRET`, `APP_PASSWORD`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Bank sync: Wise personal API token (real accounts, free, no business account needed)
- CSV import: Revolut + Maybank statement exports (no free API exists for either for an individual)
- Market data: yahoo-finance2 (live prices)

## Where things live

- `artifacts/finance-tracker/` — React+Vite frontend
- `artifacts/api-server/` — Express 5 API
- `lib/db/` — Drizzle schema + migrations
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — Orval-generated React Query hooks

## Architecture decisions

- Single-user app, password-gated (no per-user auth) — see `APP_PASSWORD`
- All monetary values stored in GBP-equivalent; multi-currency displayed via live FX
- Plaid was removed: their free tier requires the developer to be US/Canada-based, which
  doesn't fit this user. Wise has its own free personal API token instead; Revolut and
  Maybank have no viable free API for individuals, so those go through CSV import.
- Yahoo Finance: `const YahooFinance = require("yahoo-finance2").default; const yf = new YahooFinance()`

## Product

Five sections:
1. **Overview** — Net worth, portfolio value, cash, monthly P&L spreadsheet grid
2. **Accounts** — Multi-currency cash accounts, Wise auto-sync, CSV import for Revolut/Maybank
3. **Transactions** — Income/expense ledger with category tagging
4. **Upcoming** — Scheduled flows with frequency, status (pending/paid/skipped)
5. **Investments** — Portfolio positions with live Yahoo Finance prices and P&L

## Design

**Excel Pro** theme — dark spreadsheet aesthetic:
- Background `#0D1117`, panel `#161B22`, borders `#21262D`
- Accent blue `#1F6FEB` / `#58A6FF`, green `#3FB950`, red `#F85149`
- Ribbon top bar + formula bar + row number gutter
- Spreadsheet-style column-header tables across all pages
- Tabular numbers throughout

## User preferences

_Populate as you build._

## Gotchas

- Yahoo Finance requires the constructor pattern, not a direct import default call
- Layout component is at `artifacts/finance-tracker/src/components/layout.tsx` (not in `pages/`)
- Maybank CSV export format isn't fully standardized — if a specific export doesn't parse,
  check `artifacts/api-server/src/lib/csv-import/maybank.ts`'s HEADER_ALIASES first

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
