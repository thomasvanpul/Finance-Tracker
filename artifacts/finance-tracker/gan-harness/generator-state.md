# Generator State — Iteration 005

## What Was Built

Bloomberg Terminal redesign of `/src/pages/investments.tsx` — the portfolio tracking page. This is a visual-only redesign; all existing data hooks and functionality are fully preserved.

## What Changed This Iteration

### Removed: PageHeader
- Eliminated `PageHeader` import and usage
- The Bloomberg KPI bar replaces it as the top-of-page element

### Added: Bloomberg KPI Bar (6 cells)
- Component: `InvKpiBar` with `KpiCell` interface
- 6 metrics: PORTFOLIO VALUE · TOTAL P&L · PORTFOLIO BETA · ASSET CLASSES · EST. ANNUAL DIV · LARGEST POSITION
- Values: 18px mono 700, `font-variant-numeric: tabular-nums`
- Delta labels: `--ft-green` / `--ft-red` / `--ft-muted` per semantic meaning
- ADD POSITION button absolutely positioned at far right of KPI bar
- CSS class: `.ft-kpi-bar` + `.ft-kpi-bar-cell` (added to `index.css`)

### Added: Flash Cell Animations
- `@keyframes ft-flash-up` / `ft-flash-down` in `index.css`
- 600ms on `background-color` only — explicitly allowed by spec
- `useFlashCell(value)` hook: tracks prev value via ref, fires flash class for 650ms
- `FlashCell` component: wraps `<td>` with flash class + mono font

### Added: Terminal Tab Bar
- Replaces generic shadcn Tabs
- 1px border-bottom separator, active tab with `--ft-accent` 2px bottom underline
- All labels uppercase mono 700, 10px, 0.08em letter-spacing
- Transitions: 100ms color only (within 150ms spec limit)

### Added: PortfolioPositionsTable
- Full Bloomberg equity screen: TICKER | NAME | SHARES | AVG COST | CURRENT | VALUE | P&L | P&L % | WEIGHT
- TICKER: 12px mono 700 in `--ft-accent`
- P&L %: directional `▲`/`▼` symbols with `--ft-green` / `--ft-red`
- WEIGHT: right-aligned with inline proportional bar
- FlashCell on CURRENT PRICE column
- Row zebra striping using `color-mix(in srgb, var(--ft-raised) 30%, transparent)`
- Inline filter input (ticker/name search)

### Converted: All Panel Headers
All sections now use `.ft-panel-header` + `.ft-panel-label` + `.accent-dot` (`· SECTION NAME`) pattern:
- Portfolio Allocation chart
- Unrealised P&L chart
- Portfolio Heat Map
- Asset Class Allocation
- Portfolio Analytics (metrics grid)
- Upcoming Earnings
- Tax Lots (FIFO analysis)
- Price Alerts (in Rebalance tab)

### Fixed: Anti-Vibe Violations
- Removed all `rgba(...)` hardcoded backgrounds from panel headers (was: `rgba(96,165,250,0.06)`, `rgba(163,113,247,0.07)`, `rgba(245,158,11,0.07)`, `rgba(99,110,123,0.07)`)
- Replaced with `.ft-panel-header` CSS class (uses `--ft-surface` + `--ft-border` bottom)
- Heat map tile border: `rgba(0,0,0,0.18)` → `var(--ft-border)`
- Tax lot alternating rows: `rgba(99,110,123,0.03)` → `var(--ft-raised)`
- Earnings badge / holding period badge: rgba backgrounds → transparent with `1px solid var(--ft-*)` border
- Price alert row background: `rgba(63,185,80,0.03)` → `var(--ft-base)`
- Rebalance tab wrapper: `space-y-6` → `gap: var(--ft-row-gap)` flex column
- `className="border p-4"` → `style={{ border: "1px solid var(--ft-border)" }}` on chart panels

### Preserved (no regressions)
- All data hooks: `useListInvestments`, `useGetInvestmentSummary`, `useGetMarketQuotes`, `useGetMarketHistory`, `useGetMarketDetail`, `useGetOptionsChain`
- All tab content: portfolio, orders, derivatives, markets, rebalance
- MarketsTab, PositionDetailModal, PriceAlertPopover, RebalanceTab, AiPortfolioCommentary
- FundamentalsTable, DividendTracker
- All existing state: tickerFilter, activeTab, deleteConfirmId, priceAlerts, quoteMap, etc.
- All routing and exports

## Known Issues
- Heat map tiles still use computed rgba color scale (green/red gradient for P&L visualization) — this is semantic data visualization and cannot easily be expressed via CSS tokens; left as-is per spec intent
- The MarketsTab (separate large component) was not redesigned in this iteration — it has its own rgba usages but is a separate visual surface

## Dev Server
- URL: http://localhost:4321
- Status: running
- Command: PORT=4321 npm run dev
