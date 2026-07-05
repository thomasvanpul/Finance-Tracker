# Fintrack — Personal Finance Tracker

A full-stack personal finance tracker with Plaid bank sync, Yahoo Finance live market data, and multi-currency support. GBP base currency with USD, MYR, and CNY accounts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/finance-tracker run dev` — run the frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Bank sync: Plaid (sandbox, GB+US country codes only)
- Market data: yahoo-finance2 (live prices)

## Where things live

- `artifacts/finance-tracker/` — React+Vite frontend
- `artifacts/api-server/` — Express 5 API
- `lib/db/` — Drizzle schema + migrations
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — Orval-generated React Query hooks

## Architecture decisions

- Single-user app, no authentication
- All monetary values stored in GBP-equivalent; multi-currency displayed via live FX
- Plaid sandbox only supports GB and US country codes
- Yahoo Finance: `const YahooFinance = require("yahoo-finance2").default; const yf = new YahooFinance()`
- Plaid Link: uses `useEffect + ready` flag pattern (not setTimeout) to open the modal reliably

## Product

Five sections:
1. **Overview** — Net worth, portfolio value, cash, monthly P&L spreadsheet grid
2. **Accounts** — Multi-currency cash accounts with Plaid bank linking
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

- Do NOT run `pnpm dev` at workspace root — use workflow restart tools
- Plaid sandbox: only GB and US institutions work
- Yahoo Finance requires the constructor pattern, not a direct import default call
- Layout component is at `artifacts/finance-tracker/src/components/layout.tsx` (not in `pages/`)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
