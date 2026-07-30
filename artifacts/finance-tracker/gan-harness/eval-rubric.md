# Evaluation Rubric: Fintrack Terminal

> Evaluator agent: score each dimension 1–10, multiply by weight, sum for final score.
> A passing implementation scores ≥ 7.0 overall. Any dimension < 5 is an automatic fail regardless of total.

---

## Dimension 1: Design Quality (weight: 0.35)

**What "good" looks like for this project**

A professional analyst or trader should look at any page and recognize it as a terminal-style financial tool, not a consumer fintech app. The primary signal is information density and visual grammar — not just dark colors.

**Scoring criteria**

| Score | Description |
|---|---|
| 9–10 | Indistinguishable from a professional Bloomberg / Refinitiv screen. KPI bars on every data page. Dense panel layout. No wasted whitespace. Monospace numbers everywhere. 1px grid lines between sections. Status indicators as colored dots. |
| 7–8 | Clearly terminal-styled. Most data pages have KPI bars and panel headers with `·` prefix. Tables are compact and readable. Minor exceptions (one page still uses consumer-app card grid). |
| 5–6 | Some terminal patterns applied but inconsistently. Some pages still look like a generic fintech dashboard. |
| 3–4 | Terminal aesthetics applied as surface decoration (dark background + monospace font) but layout is still consumer-app pattern (centered hero, card grid, large padding). |
| 1–2 | No meaningful terminal design. Looks like a generic dashboard. |

**Specific checks (each worth 1 point toward score)**

- [ ] All numeric values use `font-family: var(--font-mono)` and `font-variant-numeric: tabular-nums`
- [ ] KPI bar present and functional on at least 5 of: Dashboard, Transactions, Budget, Goals, Investments, Analytics, Net Worth
- [ ] Panel headers use `· PANEL NAME` pattern with accent dot on at least 80% of panels
- [ ] No `PageHeader` icon box component on data pages
- [ ] Tables have right-aligned numeric columns
- [ ] Table column headers use `.xls-col-header` style (10px, 600, uppercase, `--ft-muted`)
- [ ] No box-shadow on any data panel, table, or card
- [ ] No `border-radius` > 2px on any data container
- [ ] Color usage is semantic (green=positive, red=negative, amber=warning, accent=interactive only)
- [ ] Information density: at a 1440px viewport, each page shows at minimum 12 data values above the fold

---

## Dimension 2: Originality (weight: 0.30)

**What "good" looks like for this project**

The app should feel like a specifically-designed financial operating system, not a generic "dark dashboard with yellow accents." Bloomberg-specific patterns should be present — not just copied visually, but functionally purposeful.

**Scoring criteria**

| Score | Description |
|---|---|
| 9–10 | Multiple Bloomberg-specific interactive patterns present and working: flash cells, heat cells, inline quote panel, ticker strip with live data. Status indicators with live pulse animation. Status bar with actionable segments. Split-panel data display. |
| 7–8 | Flash cells and at least one of: heat cells, inline quote panel, ticker strip. Status bar functional. KPI bars feel purpose-built per page (metrics chosen are relevant to that page). |
| 5–6 | KPI bars present but generic (same metrics on every page). Ticker strip is decorative only. Flash cells missing. Status bar is static text. |
| 3–4 | Only surface-level terminal styling. No Bloomberg-specific interaction patterns. |
| 1–2 | Could be any dark-themed app. No terminal-specific patterns. |

**Specific checks (each worth 1 point toward score)**

- [ ] Flash cells on Investments price table (animate green/red on value change)
- [ ] Heat cells on at least one of: Budget spent column, Spending breakdown, Analytics category table
- [ ] Ticker strip shows live market data (not static mock data)
- [ ] Investments page has inline quote panel (not a modal)
- [ ] Dashboard default view is the three-zone layout (KPI bar + panels), not the widget grid
- [ ] Goals page uses table format with status indicators, not card grid
- [ ] Budget page uses table with inline progress bars, not progress component cards
- [ ] `useFlashCell` hook is implemented and reusable
- [ ] Status bar has clickable density/theme/privacy segments
- [ ] World clock in sidebar shows market open/closed status per exchange

---

## Dimension 3: Craft (weight: 0.25)

**What "good" looks like for this project**

Terminal craft is about precision and consistency, not decoration. Every pixel decision should be deliberate. The existing Anti-Vibe Constitution and CSS token system must be respected — not worked around.

**Scoring criteria**

| Score | Description |
|---|---|
| 9–10 | Zero constitution violations. All CSS uses `var(--ft-*)` tokens, zero hardcoded colors. Typography scale strictly followed. All three density modes work correctly with the new components. All theme variants render correctly without breaking. |
| 7–8 | One or two minor violations (e.g., one hardcoded color, one `border-radius: 4px` on a non-critical element). All density modes work. Most themes render correctly. |
| 5–6 | Several violations but no catastrophic breakage. Some hardcoded values. A theme or density mode breaks one component. |
| 3–4 | Multiple anti-vibe constitution violations. Box-shadows on data panels, gradient text, or animations > 150ms. CSS not using the token system. |
| 1–2 | Systematic constitution violations. Looks vibe-coded. |

**Specific checks (each worth 1 point toward score)**

- [ ] No `box-shadow` on any data container (`ft-panel`, table, KPI cell)
- [ ] No `backdrop-filter` on any element
- [ ] No CSS transitions > 150ms except flash-cell color transition (600ms, color property only — explicitly permitted by spec)
- [ ] No `border-radius` > 2px on panels, tables, KPI cells, or form inputs
- [ ] All new components use `var(--ft-*)` for every color (grep for hardcoded hex in new files)
- [ ] Density compact mode: all new components respect `var(--ft-cell-py)` and `var(--ft-cell-px)` for padding
- [ ] Density comfortable mode: same
- [ ] All 10 theme variants render the new KPI bar without white text on white background or other contrast failure
- [ ] Empty states show zero-row table, not an illustration or centered artwork
- [ ] Loading states use static placeholder blocks, no shimmer keyframe animations

---

## Dimension 4: Functionality (weight: 0.10)

**What "good" looks like for this project**

All data displayed in the terminal redesign must remain accurate and come from the same data sources as before. No regression in data display. Interactive elements must work.

**Scoring criteria**

| Score | Description |
|---|---|
| 9–10 | All critical flows work. No data regressions. KPI values match the underlying data. Sort, filter, and row selection functional. |
| 7–8 | Critical flows work. One or two minor data display issues (e.g., a delta not computing correctly). |
| 5–6 | Some features broken or returning wrong values. Sort or filter partially broken. |
| 3–4 | Multiple broken pages. Data not loading in new components. |
| 1–2 | Application does not load or critical pages are blank. |

**Critical user flows to test**

1. Navigate to Dashboard → KPI bar shows Net Worth, Monthly Net, Savings Rate with correct values
2. Navigate to Transactions → filter by date range → table shows filtered results → totals in KPI bar update
3. Navigate to Investments → click a position row → inline quote panel appears with that instrument's data
4. Navigate to Budget → KPI bar shows Total Budgeted and Total Spent → table shows all categories with correct % used
5. Navigate to Goals → table shows all goals with correct progress % and status indicators
6. Toggle density mode (via status bar click) → all pages re-layout correctly without visual breakage
7. Toggle privacy mode → all KPI values and table amounts are blurred
8. Switch theme from default to `phosphor` → all new components render in green phosphor palette

---

## Scoring Calculation

```
Final Score = (Design Quality × 0.35) + (Originality × 0.30) + (Craft × 0.25) + (Functionality × 0.10)
```

**Example passing score**: Design=8, Originality=7, Craft=8, Functionality=9
```
(8 × 0.35) + (7 × 0.30) + (8 × 0.25) + (9 × 0.10)
= 2.80 + 2.10 + 2.00 + 0.90
= 7.80  ✓ PASS
```

**Example failing score**: Design=9, Originality=8, Craft=4, Functionality=8
```
(9 × 0.35) + (8 × 0.30) + (4 × 0.25) + (8 × 0.10)
= 3.15 + 2.40 + 1.00 + 0.80
= 7.35  ✗ FAIL (Craft < 5 → automatic fail)
```

---

## Quick Disqualifiers (Automatic Score = 1 on any dimension where these appear)

These are constitution violations so severe they indicate the implementation ignored the design rules:

- Any `box-shadow` on a data panel, table, or KPI cell
- Any `backdrop-filter` on any element
- Any gradient background outside of chart plot area fill
- PageHeader icon boxes present on data pages (Dashboard, Transactions, Analytics, Investments, Budget, Goals)
- Hard-coded color values in any new component file (hex or rgb)
- Any new CSS animation > 150ms on layout, opacity, or transform (flash-cell color animation is the only exception)
- Empty states using illustrations, SVGs, or artwork
- Progress circles/rings on Budget or Goals pages (spec requires table + inline bars)
