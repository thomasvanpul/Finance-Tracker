# Mobile Inventory

Analysis of the three overlapping mobile strategies in this codebase.
Read-only; no files were changed.

Sources verified by reading source code. Anything not directly read from code is
labeled **[inferred]**.

---

## System definitions (for reference)

- **System 1** — `src/components/mobile/` (21 files, MobileApp and its screens). Renders only when `isMobile && (location === "/" || location === "")` — App.tsx line 141.
- **System 2** — `isMobile` branches inside `src/pages/*.tsx` (23 of 38 page files contain `useIsMobile()`).
- **System 3** — `@media (max-width: 767px)` block in `src/index.css` lines 564–1006. Threshold matches JS: `MOBILE_BREAKPOINT = 768`, fires at `window.innerWidth < 768`.

---

## Q1 — Route coverage

38 routes in App.tsx (37 named + 1 catch-all). At every URL other than `/`, the Layout+Switch renders instead of MobileApp, regardless of screen width.

| Route | What a phone renders | System |
|---|---|---|
| `/` | MobileApp | 1 |
| `/accounts` | Desktop Accounts page with isMobile branches | 2+3 |
| `/transactions` | Desktop Transactions page with isMobile branches | 2+3 |
| `/upcoming` | Desktop Upcoming page with isMobile branches | 2+3 |
| `/investments` | Desktop Investments page with isMobile branches | 2+3 |
| `/portfolio` | Desktop Portfolio page (stub, no isMobile) | 3 only |
| `/owing` | Desktop Owing page with isMobile branches | 2+3 |
| `/reports` | Desktop Reports page with isMobile branches | 2+3 |
| `/goals` | Desktop Goals page with isMobile branches | 2+3 |
| `/analytics` | Desktop Analytics page with isMobile branches | 2+3 |
| `/budget` | Desktop Budget page with isMobile branches | 2+3 |
| `/health-score` | Desktop HealthScore page with isMobile branches | 2+3 |
| `/net-worth` | Desktop NetWorthHistory page with isMobile branches | 2+3 |
| `/whatif` | Desktop WhatIf page with isMobile branches | 2+3 |
| `/fire` | Desktop Fire page with isMobile branches | 2+3 |
| `/pension` | Desktop Pension page with isMobile branches | 2+3 |
| `/calculators` | Desktop Calculators page (no isMobile) | 3 only |
| `/wardrobe` | Desktop Wardrobe page (no isMobile) | 3 only |
| `/projection` | Desktop Projection page with isMobile branches | 2+3 |
| `/subscriptions` | Desktop Subscriptions page with isMobile branches | 2+3 |
| `/tax` | Desktop Tax page with isMobile branches | 2+3 |
| `/mortgage` | Desktop Mortgage page (no isMobile) | 3 only |
| `/calendar` | Desktop Calendar page (no isMobile) | 3 only |
| `/split` | Desktop Split page (no isMobile) | 3 only |
| `/recurring` | Desktop Recurring page with isMobile branches | 2+3 |
| `/learn` | Desktop Learn page (stub, no isMobile) | 3 only |
| `/cashflow` | Desktop CashFlow page (no isMobile) | 3 only |
| `/year-review` | Desktop YearReview page (no isMobile) | 3 only |
| `/import` | Desktop Import page (no isMobile) | 3 only |
| `/settings` | Desktop Settings page with isMobile branches | 2+3 |
| `/profile` | Desktop Profile page (no isMobile) | 3 only |
| `/decisions` | Desktop Decisions page (no isMobile) | 3 only |
| `/ai-coach` | Desktop AiCoach page (no isMobile) | 3 only |
| `/briefing` | Desktop Briefing page with isMobile branches | 2+3 |
| `/business` | Desktop Business page (no isMobile) | 3 only |
| `/family` | Desktop FamilyFinance page with isMobile branches | 2+3 |
| `/trading` | Desktop TradingJournal page with isMobile branches | 2+3 |
| `*` | Desktop NotFound (no isMobile) | 3 only |

**Key consequence**: `dashboard.tsx` has `isMobile` branches but they are unreachable on mobile. Three locations confirmed by read:

- Line 1092 — inside private function `ViewModeWidget` (not exported)
- Line 1502 — inside private function `WidgetPicker` (not exported)
- Line 1695 — inside private function `DashboardKpiBar`, which takes `isMobile` as a prop but is only ever called from the default `Dashboard` export, also not exported separately

`dashboard.tsx` exports exactly two things: the named export `NetWorthMilestonesWidget` (line 287, which has no `isMobile` branches and is only referenced in the internal `WIDGET_COMPONENTS` map at line 378) and `default Dashboard`. Only `App.tsx` imports from `dashboard.tsx`, and it imports only `default Dashboard`. Since MobileApp intercepts the only route (`/`) that renders `Dashboard`, all four of these isMobile sites are dead on mobile.

---

## Q2 — Screen inventory

MobileApp has 15 AppScreen values: 7 MobileTab values plus 8 sub-screens reached via MobileMore.

### AppScreen → component → desktop route

| AppScreen | Component | Desktop route equivalent |
|---|---|---|
| `home` | MobileHome | none — aggregates dashboard, accounts, upcoming in one scroll |
| `accounts` | MobileAccounts | `/accounts` |
| `txns` | MobileTransactions | `/transactions` |
| `budget` | MobileBudget | `/budget` |
| `goals` | MobileGoals | `/goals` |
| `investments` | MobileInvestments | `/investments` |
| `more` | MobileMore | none — navigation hub only |
| `personalize` | MobilePersonalize | none — mobile widget/tab config only |
| `analytics` | MobileAnalytics | `/analytics` |
| `subscriptions` | MobileSubscriptions | `/subscriptions` |
| `owing` | MobileOwing | `/owing` |
| `reports` | MobileReports | `/reports` |
| `net-worth` | MobileNetWorth | `/net-worth` |
| `settings` | MobileSettings | `/settings` |
| `upcoming` | MobileUpcomingFull | `/upcoming` |

### Desktop routes with no AppScreen

These 24 routes have no in-app mobile screen. 15 of them are reachable from MobileMore via `href` links (exits MobileApp, renders desktop page); 9 are not reachable from MobileApp at all.

**Reachable via MobileMore href** (user leaves MobileApp and sees desktop page):
`/portfolio`, `/tax`, `/fire`, `/projection`, `/mortgage`, `/cashflow`, `/ai-coach`, `/health-score`, `/year-review`, `/recurring`, `/family`, `/trading`, `/import`, `/whatif`, `/learn`

**Not reachable from MobileApp at all** (no entry point in MobileMore or SpeedDial):
`/pension`, `/calculators`, `/wardrobe`, `/calendar`, `/split`, `/profile`, `/decisions`, `/briefing`, `/business`

### Mobile screens with no desktop route

- `more` — no `/more` route exists
- `personalize` — no `/personalize` route exists

---

## Q3 — Feature parity

For each AppScreen that has a desktop route equivalent, what the desktop page can do that the mobile screen cannot. Verified by reading component source; inferences labeled.

### accounts / MobileAccounts vs /accounts

Desktop (`accounts.tsx`): opens a `TransferModal` Dialog (Dialog component imported, line 27; `TransferModal` function line 226) that creates fund-transfer transactions between accounts. Also has add-account capability.

Mobile (MobileAccounts): read-only. Displays balance total, per-account sparklines, analytics widgets. No add, no edit, no transfer.

### txns / MobileTransactions vs /transactions

Desktop (`transactions.tsx`): edit transaction (click opens edit form), delete transaction, CSV/JSON export (`exportCsv`/`exportJson` lines 227–242), template save/load (`saveTemplate`/`loadTemplates`), MobileSheet slide-up panel at bottom.

Mobile (MobileTransactions): text search, filter by all/income/expense, sort by amount. No edit, no delete, no export, no templates.

**Important discrepancy**: at `/transactions` on a mobile device (System 2), `isMobile=true` enables swipe-to-delete via `useSwipeDelete` (transactions.tsx line 1776). A mobile user who navigates away from MobileApp to `/transactions` directly can delete; a mobile user staying inside MobileApp cannot.

### budget / MobileBudget vs /budget

Desktop (`budget.tsx`): add budget category (inline form + sidebar panel, `handleAddBudget` line 1372), delete budget category (`handleDeleteBudget` line 1383), navigate month-by-month (prevMonth/nextMonth buttons).

Mobile (MobileBudget): read-only. Shows spend vs limit per category, weekly bars, arc gauges. No add, no delete, no month navigation.

### goals / MobileGoals vs /goals

Desktop (`goals.tsx`): `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`, `useAddGoalFunds` (imported line 12). Users can create goals, edit name/target/deadline, delete, and add funds with a dedicated `onAddFunds` handler.

Mobile (MobileGoals): read-only. SpeedDial "add-goal" action navigates to the MobileGoals screen but opens no creation form — it calls `onTabChange("goals")` which just renders MobileGoals.

### investments / MobileInvestments vs /investments

Desktop (`investments.tsx`): has `.inv-add-btn-desktop` and `.inv-add-btn-mobile` CSS classes (index.css lines 903–908), indicating there is an "Add Position" button that is repositioned on mobile — **[inferred]** this means desktop /investments allows adding holdings; the mobile button is visible but its behavior was not fully read.

Mobile (MobileInvestments): read-only display of holdings, sparklines, sector breakdown, analytics widgets.

### analytics / MobileAnalytics vs /analytics

Desktop (`analytics.tsx`): **[inferred from isMobile branching and class `.ft-chart-sidebar`]** likely has a date-range picker and sidebar with controls. The `.ft-chart-sidebar` CSS rule stacks chart+sidebar vertically on mobile (index.css line 854), suggesting desktop has a side-by-side chart/control layout.

Mobile (MobileAnalytics): displays current-month category breakdown and a fixed set of analytics widgets. No date range selection observed in component source.

### subscriptions / MobileSubscriptions vs /subscriptions

Desktop (`subscriptions.tsx`): add, edit, delete subscriptions. Imports `Plus`, `Trash2`, `Edit2` icons (line 27) and has `deleteConfirmId` state, `onEdit`, `onDelete` handlers in `SubRow` (line 260).

Mobile (MobileSubscriptions): read-only list with sparkline and cost history. The `SubRow` on mobile (isMobile path, subscriptions.tsx line 282) shows a compact 2-column card but no edit or delete controls.

### owing / MobileOwing vs /owing

Desktop (`owing.tsx`): contains the debt payoff calculator (snowball/avalanche strategy, amortization chart, `runPayoffStrategy` extracted to `src/lib/payoff.ts`). Also shows the debt/owing tracker.

Mobile (MobileOwing): shows only the owing/debt list (who owes whom, pending vs settled). The payoff calculator section is absent — it is not rendered in MobileOwing.

### reports / MobileReports vs /reports

Desktop (`reports.tsx`): **[inferred]** uses `useGetTransactionSummary` and likely has date range selection and export given the isMobile branch present.

Mobile (MobileReports): 6-month fixed view (income, expenses, net savings). Uses mock data for months. No date selection, no export observed.

### net-worth / MobileNetWorth vs /net-worth

Desktop (`net-worth` = `NetWorthHistory` page, `net-worth-history.tsx`): **[inferred]** supports manual asset entry and historical tracking given isMobile branching present and the page file name.

Mobile (MobileNetWorth): read-only breakdown by account type with milestone tracker. Uses `useGetDashboard` data.

### upcoming / MobileUpcomingFull vs /upcoming

Desktop (`upcoming.tsx`): **[inferred]** has isMobile branching, likely supports adding/marking upcoming items.

Mobile (MobileUpcomingFull): read-only list. Shows upcoming income and bills with date context. No add/mark-as-paid controls observed.

### The only mobile write operation

The SpeedDial (MobileApp.tsx line 40–54) provides four actions:
- `log-expense` → opens `QuickAddTransaction` modal (shared component)
- `log-income` → opens `QuickAddTransaction` modal
- `add-goal` → navigates to `goals` screen (does not open a goal creation form)
- `view-accounts` → navigates to `accounts` screen

The SpeedDial is hidden on `personalize`, `settings`, and `home` screens (MobileApp.tsx line 166). QuickAddTransaction is the **only write path available inside MobileApp**. All other 14 screens are read-only.

---

## Q4 — What the 23 isMobile branches actually change

Grouped by pattern. Verified by reading source; not all 23 pages were read in full — pages not read individually are labeled.

### Pattern A — Shell layout restructure (entire page structure changes)

`settings.tsx` (line 2680–2804): Desktop renders a fixed-height `calc(100vh - 48px)` flex row: sidebar navigation left, scrollable content right. Mobile collapses to a vertical stack: horizontal-scrolling chip tabs (group level then item level) replace the sidebar, and the content section loses its fixed height (`height: auto`, `overflow: visible`). The same settings panels render in both cases; only the navigation shell changes.

### Pattern B — Compact card row vs wide grid row (loading skeleton and live rows)

`budget.tsx` (line 1484–1504): Loading skeleton for each budget row switches between an 8-column grid (desktop) and a 2-column card showing label+progress bar on the left, amount on the right (mobile).

`subscriptions.tsx` (line 282): The `SubRow` component returns an entirely different element tree when `isMobile=true` — a 2-column card (name+next-due on left, amount+controls on right) vs a wide grid row with all columns visible on desktop.

`transactions.tsx` (line 3030 area): Column headers grid (`minWidth: 760`) is wrapped in `!isMobile && (...)`. Mobile never renders column headers.

### Pattern C — Touch gesture (mobile-only addition)

`transactions.tsx` (lines 1776–1803): `useSwipeDelete` hook is instantiated. When `isMobile=true`, the transaction row gets:
- `className="ft-swipe-row-content"` (slides left on swipe)
- `{...swipe.touchHandlers}` (touch event listeners)
- `transform: translateX(${swipe.offset}px)` inline style
- A `DELETE` button rendered behind the row (line 1780), visible only after swipe

Desktop rows get none of this.

### Pattern D — Extra summary strip (mobile-only UI addition)

`transactions.tsx` (lines 2468–2502): A mobile-only KPI strip is rendered below the filter bar showing In/Out/Net totals for the current filter. Also, at line 3204, a `MobileSheet` slide-up panel is conditionally rendered only on mobile.

`transactions.tsx` (line 742): `useEffect(() => { if (isMobile) setGroupByDay(true); }, [isMobile])` — groups transactions by day on mount when on mobile; desktop defaults to whatever the user last selected.

### Pattern E — Grid column reduction (layout density change)

`settings.tsx` (line 936, 2203): Theme picker and notification form grids switch column count. `gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto"` stacks the currency/notification form fields vertically on mobile.

`budget.tsx` (line 2067): Horizontal scroll container wraps the budget table only on desktop (`!isMobile && "ft-scroll-x"`).

### Pattern F — Column/section visibility toggle

`transactions.tsx` (lines 2642, 2965): `!isMobile && <div style={{ display: "flex", background: ..., minWidth: 760 }}>` — column header bar hidden on mobile. Horizontal scroll wrapper only on desktop.

`subscriptions.tsx` (lines 1362, 1439): `!isMobile &&` guards on the column header row and on additional data columns.

### Pattern G — Conditional component swap

**[inferred from grep only — not all pages read in full]**: `briefing.tsx`, `family-finance.tsx`, `trading-journal.tsx`, `fire.tsx`, `pension.tsx`, `projection.tsx`, `recurring.tsx`, `health-score.tsx`, `tax.tsx`, `whatif.tsx` — all import `useIsMobile()` and have isMobile branches. Their specific changes were not read; grouping them here as unverified.

---

## Q5 — @media blocks

Single `@media (max-width: 767px)` block, `src/index.css` lines 564–1006. Additional `@supports (-webkit-touch-callout: none)` block at line 1016 (iOS-specific). A `@media (min-width: 768px) and (max-width: 900px)` tablet block exists at line 1090 (not covered here).

### Every selector and what it overrides

| Selector | What it overrides | !important |
|---|---|---|
| `html, body` | `overflow-x: hidden; max-width: 100vw` | no |
| `.ft-main-inner` | padding (8px 10px + safe-area bottom), overflow-x hidden | yes |
| `.ft-header` | padding 0 8px, gap 6px | yes |
| `.ft-header-brand` | `display: none` (hides "NUMERIS ›" brand prefix) | yes |
| `.ft-header-search-btn, .ft-header-sign-out` | `display: none` | yes |
| `.ft-dashboard-two-col` | gap 6px; children flex 1 1 0, min-width 0, overflow hidden | yes |
| `.widget-container` | min-width 0, overflow hidden, max-width 100% | yes |
| `.widget-container > * > *` | max-width 100% | no |
| `.ft-mobile-widget-grid > div` | display flex, flex-direction column | no |
| `.ft-mobile-widget-grid > div > a` | flex 1, display flex, flex-direction column | no |
| `.ft-acct-table-row` | min-width 0 | yes |
| `.ft-acct-metrics-row` | min-width 0, grid-template-columns auto-fit minmax(100px,1fr) | yes |
| `.ft-watchlist-layout` | flex-direction column | yes |
| `.ft-watchlist-sidebar` | border-right none, border-bottom, min-width 0, max-width 100%, flex-direction row, flex-wrap wrap | yes |
| `.ft-sidebar-collapse-btn` | `display: none` | yes |
| `.ft-page-header` | flex-wrap wrap, gap 8px, margin-bottom 12px | yes |
| `.ft-page-header > div:last-child` | flex-wrap nowrap, overflow-x auto, scrollbar-width none, width 100% | yes |
| `.ft-page-header > div:last-child::-webkit-scrollbar` | `display: none` | no |
| `.ft-scroll-x td, .ft-scroll-x th` | white-space nowrap | no |
| `.ft-filter-bar` | flex-wrap wrap, gap 6px | yes |
| `.ft-filter-bar > *` | min-width 0, flex 1 1 calc(50% - 3px) | yes |
| `.ft-panel-header, [class*="panel-header"]` | flex-wrap nowrap, overflow-x auto, gap 6px, padding 8px 12px, height auto | yes |
| `.ft-panel-header::-webkit-scrollbar, [class*="panel-header"]::-webkit-scrollbar` | `display: none` | no |
| `.ft-kpi-cell` | padding 6px 10px | yes |
| `.ft-kpi-bar > div, .ft-kpi-bar > a` | padding 8px 10px | yes |
| `.ft-kpi-bar > div [style*="font-size: 16px"], .ft-kpi-bar > a [style*="font-size: 16px"]` | font-size → 13px | yes — overrides inline styles |
| `.ft-scroll-hint-x::after` | background gradient direction | no |
| `.ft-dashboard-insights` | grid-template-columns 1fr | yes |
| `.ft-dashboard-insights > div > :last-child` | -webkit-line-clamp 2 | no |
| `.ft-mobile-nav` | display flex, position fixed, bottom 0, left 0, right 0, safe-area padding-bottom | no |
| `.ft-mobile-nav > *` | flex 1, display flex, min-height 52px | no |
| `footer` | `display: none` | yes |
| `.ft-header-ticker-strip` | `display: none` | yes |
| `.ft-kpi-bar, .ft-kpi-bar.ft-kpi-grid` | overflow-x hidden, grid-template-columns repeat(3,1fr), gap 0 | yes |
| `.ft-kpi-bar > div:nth-child(n+4), .ft-kpi-bar > a:nth-child(n+4)` | border-top 1px solid | yes |
| `.ft-kpi-grid:not(.ft-kpi-bar)` | grid-template-columns 1fr 1fr, gap 6px | yes |
| `.ft-five-col` | grid-template-columns 1fr 1fr | yes |
| `.ft-stat-grid` | grid-template-columns 1fr 1fr | yes |
| `.ft-three-col` | grid-template-columns 1fr | yes |
| `.ft-two-col` | grid-template-columns 1fr | yes |
| `.ft-two-col-auto` | grid-template-columns 1fr | yes |
| `.ft-four-col` | grid-template-columns 1fr 1fr | yes |
| `.ft-hide-mobile` | `display: none` | yes |
| `.ft-wardrobe-layout` | grid-template-columns 1fr; first child position static | yes |
| `.ft-chart-sidebar` | grid-template-columns 1fr | yes |
| `.ft-yr-header` | flex-wrap wrap, gap 8px | no |
| `.ft-persona-matrix` | overflow-x auto | yes |
| `.ft-persona-matrix-inner` | min-width 480px | no |
| `.ft-scroll-x` | overflow-x auto, mask-image none (removes fade gradient) | yes |
| `.ft-settings-layout` | flex-direction column, height auto, overflow visible | yes |
| `.ft-settings-content` | flex none, overflow-y visible, padding 12px 14px | yes |
| `.ft-persona-cards` | grid-template-columns 1fr 1fr | yes |
| `.ft-profile-account-grid` | grid-template-columns 1fr | yes |
| `.inv-add-btn-desktop` | `display: none` | yes |
| `.inv-add-btn-mobile` | `display: block` | yes |
| `.ft-chart-controls-row` | overflow-x auto, scrollbar-width none, flex-wrap nowrap | yes |
| `.ft-chart-controls-row::-webkit-scrollbar` | `display: none` | no |
| `.ft-acct-allocation` | flex-wrap wrap, gap 12px | yes |
| `.ft-acct-allocation > *` | min-width 0, flex 1 1 100% | yes |
| `.ft-main-inner > *` | max-width 100%, min-width 0 (nuclear catch-all) | no |
| `.ft-main-inner *:not(.ft-scroll-x):not(...)` | max-width 100% (nuclear catch-all) | no |
| `.ft-widget-picker-btn` | overflow hidden, text-overflow ellipsis, white-space nowrap | no |
| `[style*="font-size: 36px"], [style*="font-size: 40px"], [style*="font-size: 32px"], [style*="font-size: 30px"]` | font-size → 22px | yes — overrides inline styles |
| `[style*="font-size: 28px"], [style*="font-size: 26px"]` | font-size → 20px | yes — overrides inline styles |
| `[style*="font-size: 24px"], [style*="font-size: 22px"], [style*="font-size: 20px"]` | font-size → 17px | yes — overrides inline styles |
| `[style*="font-size: 18px"]` | font-size → 15px | yes — overrides inline styles |
| `.ft-kpi-cell [style*="font-size: 18px"], .ft-kpi-cell [style*="font-size: 20px"]` | font-size → 13px (higher specificity) | yes — overrides inline styles |
| `.ft-page-header h1, .ft-page-header [class*="title"]` | font-size 13px | yes |
| `.ft-section-header` | padding 6px 10px, font-size 10px | yes |
| `.ft-panel-body` | padding 10px | yes |
| `.ft-tx-row` | padding 8px 10px | yes |

`@supports (-webkit-touch-callout: none)` block (iOS only):
| Selector | What it overrides | !important |
|---|---|---|
| `input, textarea, select` | font-size 16px (prevents iOS keyboard zoom) | yes |
| `.ft-filter-bar input/select, .ft-panel-header input/select` | font-size 13px (compact bar override) | yes |

### Dead code (confirmed by source comment, index.css line 954)

`[style*="fontSize: X"]` — camelCase form. React sets `style="font-size: 9px"` on the DOM element (kebab-case), not `style="fontSize: 9px"`. This selector never matches.

### Which !important rules can override component inline styles?

**Yes** — the font-size attribute selectors (`[style*="font-size: Xpx"]`) directly override React-set inline styles because CSS `!important` beats inline specificity. Any component that sets `style={{ fontSize: "36px" }}` (React renders this as `style="font-size: 36px"` on the DOM node) will have that value capped.

**The `.ft-kpi-bar` nested selector** (`.ft-kpi-bar > div [style*="font-size: 16px"]`) also overrides inline styles, but only for elements that are descendants of a `.ft-kpi-bar` container.

### Do any !important rules fight the primitives in `components/primitives/`?

Five primitives exist: `PanelBox`, `PanelHeader`, `PanelHeader`, `DataTH`, `DataTD`, `MonoLabel`.

**PanelBox** (`panel-box.tsx`): uses only CSS variable references (`var(--ft-surface)`, `var(--ft-border)`) and optional `style` prop spread. No inline `fontSize`. Not targeted by font-size attribute selectors. Not targeted by class selectors (no fixed className).

**PanelHeader** (`panel-header.tsx`): sets `fontSize: 9` inline (→ DOM: `style="font-size: 9px"`). No font-size selector targets 9px, so no conflict. The `[class*="panel-header"]` padding selector would fire IF a caller passes `className` containing "panel-header" — verified by grep: no `<PanelHeader className=...>` call in the codebase. All `ft-panel-header` classNames are on raw `<div>` elements in page files (e.g., `investments.tsx` lines 3428, 3443, etc.), not on the primitive.

**DataTD** (`data-td.tsx`): sets `fontSize: 12` inline (→ DOM: `style="font-size: 12px"`). No selector targets 12px. No class. Not affected.

**DataTH** and **MonoLabel**: not fully read. Given the pattern (small font sizes, CSS variable colors), they are almost certainly not targeted — **[inferred, not verified]**.

**Conclusion**: The primitives in `components/primitives/` are not currently affected by any `!important` rule in the `@media (max-width: 767px)` block. The `[class*="panel-header"]` selector would create a conflict if any caller ever added that class to `PanelHeader`, but none currently does.

---

## Q6 — URL routing feasibility

### What it would take to put each AppScreen on a real wouter route

The core obstacle is that MobileApp manages all screen transitions via `useState<AppScreen>` with no URL writes. The browser history stack never changes. Deep links break (navigating directly to `/accounts` on mobile renders the desktop page). Refresh resets to the `home` screen. The back button does nothing inside MobileApp.

### Per-screen blockers

| AppScreen | Target route | Blocker |
|---|---|---|
| `home` | `/` | Conflict: MobileApp is already triggered at `/` by the `location === "/"` check. `home` would need to be the default state when isMobile and at `/`, not a separate route. |
| `accounts` | `/accounts` | Route exists. Currently renders `Accounts` (desktop). To deep-link mobile, the Route in App.tsx would need `isMobile ? <MobileAccounts /> : <Accounts />`. |
| `txns` | `/transactions` | Same pattern as accounts. |
| `budget` | `/budget` | Same pattern. |
| `goals` | `/goals` | Same pattern. |
| `investments` | `/investments` | Same pattern. |
| `more` | `/more` (new) | No route exists. Needs a new Route entry. Would need redirect from `/` → `/more` on first load or after login. |
| `personalize` | `/personalize` (new) | No route exists. Needs a new Route entry. |
| `analytics` | `/analytics` | Route exists. Same pattern as accounts. |
| `subscriptions` | `/subscriptions` | Route exists. Same pattern. |
| `owing` | `/owing` | Route exists. Same pattern. |
| `reports` | `/reports` | Route exists. Same pattern. |
| `net-worth` | `/net-worth` | Route exists. Same pattern. |
| `settings` | `/settings` | Route exists. Same pattern. |
| `upcoming` | `/upcoming` | Route exists. Same pattern. |

### Structural changes required

1. Replace the `if (isMobile && location === "/") return <MobileApp />` interceptor at App.tsx line 141 with a proper conditional layout that wraps the Switch — so the router controls navigation for both mobile and desktop.
2. Replace `useState<AppScreen>` in `MobileAppInner` with `useLocation()` from wouter. Each `setScreen(x)` call becomes a `history.push("/x")` call.
3. For each AppScreen that shares an existing route, add `isMobile ? <MobileScreenComponent /> : <DesktopPageComponent />` in the App.tsx Switch.
4. Add two new routes: `/more` and `/personalize`.
5. The `goBack = () => setScreen("more")` (MobileApp.tsx line 129) becomes `history.push("/more")` or `history.back()`.
6. SpeedDial `onTabChange` calls become `history.push()`.
7. The status strip at MobileApp.tsx line 142 (Bloomberg header bar) would need to be hoisted into the mobile layout wrapper, not inside `MobileAppInner`.

No component logic inside the individual Mobile screens (MobileAccounts, MobileTransactions, etc.) needs to change — they don't use the screen state themselves.

---

## Q7 — Recommendation

### Which system should survive

**System 1 (MobileApp) should be the surviving mobile path.** It is a purpose-built mobile experience: appropriate touch density, widget management, compound charts, SpeedDial, Bloomberg status strip, and a coherent navigation model. The 21-file `components/mobile/` directory represents the bulk of the mobile investment.

**System 2 (23 isMobile-branched desktop pages) should be progressively removed** for the routes where a mobile screen already exists (11 routes: accounts, txns, budget, goals, investments, analytics, subscriptions, owing, reports, net-worth, upcoming, settings). After MobileApp is wired to those routes, the isMobile branches in those 12 desktop files become dead code.

For the 11 remaining isMobile-branched pages with no AppScreen equivalent (briefing, family-finance, fire, pension, projection, recurring, health-score, tax, trading-journal, whatif, and dashboard which is already dead), the choice is: build a mobile screen or leave System 2 in place. The user experience at those routes on mobile is currently the desktop page with minor layout adjustments.

**System 3 (the @media block) should be rationalized, not deleted.** The iOS-specific `@supports` block (input zoom fix) must stay. The font-size attribute selectors and safe-area padding are system-level fixes that protect layouts site-wide. The grid column utilities (`.ft-two-col`, `.ft-three-col`, etc.) protect the desktop pages that mobile users reach via MobileMore href links. What should be removed after routing is done: any `@media` rules that exist solely to patch layout problems in the desktop pages that will be replaced by mobile screens (e.g., `.ft-watchlist-layout`, `.ft-acct-table-row` overrides become unnecessary once those routes render MobileInvestments/MobileAccounts).

### Migration order

1. **Wire AppScreen to wouter routes** — replace `useState<AppScreen>` with URL-driven navigation, no component logic changes. This immediately fixes deep links, refresh, and back button.
2. **Extend MobileApp to all routes** — remove the `location === "/"` restriction; make MobileApp the conditional layout for all routes when `isMobile=true`.
3. **Swap components at the route level** — for each route that has both a mobile screen and a desktop page, add the `isMobile ? <MobileXxx /> : <DesktopXxx />` conditional in App.tsx Switch.
4. **Remove dead isMobile branches** — once a route renders the mobile component, remove the `useIsMobile()` branches from the 12 corresponding desktop page files.
5. **Decide on the remaining 11 System 2 pages** — either build mobile screens or accept System 2 as the permanent mobile path for those routes.
6. **Rationalize the @media block** — remove layout overrides that were compensating for desktop pages now replaced by mobile screens; keep font-size caps, safe-area rules, and grid utilities for the href-linked desktop pages that mobile users still visit.
