# Generator State — Iteration 006

## What Was Built

Comprehensive mobile UI audit and fix pass across all 11 pages of the Finance Tracker app. All changes are surgical layout/styling edits only — no data logic was touched.

## What Changed This Iteration

### Fixed: upcoming.tsx
- Added `ft-kpi-bar` to 4-col summary KPI bar (was using only inline gridTemplateColumns)
- Added `ft-kpi-bar` to 3-col forecast KPI bar (same issue)

### Fixed: subscriptions.tsx
- Replaced inline isMobile ternary for KPI bar grid columns with `ft-kpi-bar` class
- Simplified gridTemplateColumns to desktop-only value (CSS class handles mobile collapse)

### Fixed: goals.tsx
- Added `ft-kpi-bar` to loading skeleton's 6-col KPI bar

### Fixed: pension.tsx (6 edits)
- Added `ft-kpi-bar` to projected vs target income 2-col grid
- Added `ft-kpi-bar` to shortfall analysis 3-col grid
- Added `ft-kpi-bar` to state pension cells 3-col grid
- Added `ft-kpi-bar` to annual allowance cells 3-col grid
- Added `ft-kpi-bar` to tax relief cells 3-col grid
- Added `ft-kpi-bar` to ISA cells 3-col grid

### Fixed: fire.tsx
- Added `ft-two-col` to Survival+Coast 2-col grid (collapses to 1-col on mobile)

### Fixed: business.tsx (4 edits)
- Wrapped operating expense breakdown table in `ft-scroll-x` (was `overflow: "hidden"` — clips on mobile)
- Wrapped invoices table in `ft-scroll-x`
- Added `ft-three-col` to invoice form 3-col input grid
- Added `ft-kpi-bar` to VAT grid

### Fixed: budget.tsx (3 edits)
- Added `ft-kpi-bar` to loading skeleton's 6-col KPI bar
- Added `ft-hide-mobile` to Budget Health Summary header legend
- Added `ft-hide-mobile` to Month-End Forecast header stats row

### Verified (no changes needed):
- accounts.tsx — already uses ft-hide-mobile, ft-acct-metrics-row, ft-acct-table-row, ft-two-col/three-col/four-col
- reports.tsx — main KPI bar had ft-kpi-bar; all tables in ft-scroll-x
- owing.tsx — summary strip uses ft-three-col; amortization in ft-scroll-x; controls use flexWrap: "wrap"
- split.tsx — uses inline <style> block with @media (max-width: 720px) rules; no changes needed

## Known Issues
- None identified. TypeScript check passed clean: `npx tsc --noEmit` returns no errors.

## Dev Server
- URL: http://localhost:4321
- Status: running
- Command: PORT=4321 npm run dev
