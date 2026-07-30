# Product Specification: Fintrack Terminal

> Generated from brief: "Create a comprehensive design spec for a full Bloomberg Terminal redesign of the Finance Tracker app."

## Vision

Fintrack Terminal is a personal financial operating system styled after professional trading terminals — specifically Bloomberg and Reuters Eikon. Every screen is a data surface, not a marketing page. Information hierarchy is achieved through scale, weight, and spatial density, not decorative color. A power user should be able to read six key metrics at a glance before their eyes fully focus.

---

## Existing Foundation (Do Not Break)

The codebase already enforces strict anti-vibe rules via the Anti-Vibe Constitution in `src/index.css`. The redesign builds on, not against, these rules. Key existing infrastructure to preserve:

- CSS variable system (`--ft-*` tokens) — all colors, spacing, and density settings are already defined
- Density system (`body.density-compact`, `body.density-comfortable`) — cell padding adjusts via CSS
- Nine theme variants (default dark, phosphor, arctic, amber, midnight, matrix, synthwave, deep-space, gilded, bloodline)
- `.ft-panel`, `.ft-panel-header`, `.ft-panel-label` primitives
- `.ft-label`, `.ft-sublabel`, `.ft-value`, `.ft-headline`, `.ft-caption` typography utilities
- Tabular-nums enforcement on `td`, `th`, `.tabular`
- World clock with market open/close status (already in layout.tsx)
- Existing nav section structure: CORE / INVEST / PLAN / INSIGHTS / TOOLS

The redesign is a visual and layout upgrade — it does not require new data models or API changes.

---

## Design Direction

- **Color palette (default theme)**: `#08090B` base, `#0F1117` surface, `#F4A21E` accent, `#4ADE80` green/positive, `#F87171` red/negative, `#CDD6F4` primary text, `#6C7A96` muted. All other themes inherit the same semantic mapping.
- **Typography**: JetBrains Mono (already `var(--font-mono)`) for all numbers and terminal labels. IBM Plex Sans (`var(--font-sans)`) for prose descriptions only. Space Grotesk (`var(--font-head)`) for page-level headings only — sparingly.
- **Layout philosophy**: Dense multi-panel grid. Every page has a fixed-height KPI bar at top, then panel rows below. No scrolling vertically on desktop for primary data — it should fit the viewport like a trading terminal. Mobile collapses to single-column.
- **Visual identity**: `· SECTION NAME` header pattern (accent dot prefix, monospace uppercase, 10px). 1px borders everywhere — no rounded corners beyond `border-radius: 2px` max. Status indicators as colored circles (●). Numbers right-aligned in all data columns. Grid lines, not shadows.
- **Inspiration**: Bloomberg Terminal (BTERM), Reuters Eikon, Refinitiv Workspace. NOT: Mint, Personal Capital, Robinhood, Copilot Money.

---

## Typography System

| Class / Use | Font | Size | Weight | Letter-spacing | Color |
|---|---|---|---|---|---|
| `.ft-caption` | mono | 8px | 400 | 0.06em | `--ft-dim` |
| `.ft-label` | mono | 9px | 600 | 0.10em | `--ft-dim`, uppercase |
| `.ft-sublabel` | mono | 10px | 400–500 | — | `--ft-muted` |
| `.ft-value` | mono | 13px | 600 | — | `--ft-text` |
| `.ft-panel-label` | mono | 10px | 500 | 0.08em | `--ft-muted`, uppercase |
| Body text (prose) | sans | 11px | 400 | — | `--ft-text` |
| KPI value | mono | 18–24px | 700 | -0.01em | `--ft-text` or semantic |
| KPI delta | mono | 11px | 600 | — | `--ft-green` or `--ft-red` |
| Page heading (rare) | head | 14px | 700 | tight | `--ft-text` |
| Section header prefix `·` | mono | 10px | 500 | — | `--ft-accent` |
| Table column header | mono | 10px | 600 | 0.04em | `--ft-muted`, uppercase |
| Table cell numeric | mono | 11–12px | 400 | — | `--ft-text`, right-aligned |

**Rule**: If a value can change (price, balance, delta, rate), it uses `font-family: var(--font-mono)` with `font-variant-numeric: tabular-nums`. No exceptions.

---

## Color Semantics (Strict Mapping)

| Variable | Semantic Use | Never Use For |
|---|---|---|
| `--ft-accent` | Interactive elements, active nav item, section dot prefix, focus ring, selected row left-border, buttons | Decorative, disabled states, non-interactive labels |
| `--ft-green` | Income, gains, positive delta, savings surplus, on-target budget, active/open status | Anything neutral or negative |
| `--ft-red` | Expense, losses, negative delta, budget over-limit, missed goal, alert/error | Warnings (use amber), neutral |
| `--ft-amber` | Warning, pending approval, approaching limit (80-99%), cautious forecast | Errors (use red), success |
| `--ft-blue` | Neutral-positive info, portfolio asset class tags, chart series 2, informational tooltips | Status indicators that should use green/red |
| `--ft-cyan` | Chart series 3, secondary portfolio data, calendar event markers | Primary status indicators |
| `--ft-text` | Primary readable text | Background, borders |
| `--ft-muted` | Labels, column headers, secondary metadata | Values that need to be read quickly |
| `--ft-dim` | Timestamps, captions, zero-value placeholders | Anything interactive |
| `--ft-surface` | Panel backgrounds | Page background |
| `--ft-raised` | Panel headers, row hover, expanded row background, input backgrounds | Page background |
| `--ft-border` | Panel borders, dividers between sections | Text, emphasis |
| `--ft-border2` | Column separators, table row lines, dense grid lines | Panel borders (too heavy) |

---

## Layout Principles

### Page Structure (all pages)

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR (220px collapsed / 52px icon-only mode)                 │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ KPI BAR — 42px fixed height, horizontal strip of key metrics ││
│ ├──────────────────────────────────────────────────────────────┤│
│ │ PAGE CONTENT — panels, tables, charts                        ││
│ │                                                              ││
│ │                                                              ││
│ ├──────────────────────────────────────────────────────────────┤│
│ │ STATUS BAR — 26px, always visible at bottom                  ││
│ └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### KPI Bar Pattern

Every page has a horizontal strip immediately below the sidebar/header line. This strip contains 4–8 key metrics in a single row. Each metric cell:

```
┌────────────────────────┐
│ LABEL            9px   │
│ VALUE           18px   │
│ DELTA           11px   │
└────────────────────────┘
```

- Cells separated by 1px vertical borders (`--ft-border`)
- Background: `--ft-surface`
- Label: `.ft-label` (9px mono uppercase, `--ft-dim`)
- Value: 18–20px mono 700, semantic color or `--ft-text`
- Delta: 11px mono, `--ft-green` or `--ft-red` with `+/-` prefix and `▲▼` directional arrow

### Panel Pattern

```
┌──────────────────────────────────────────────────────┐
│ · PANEL TITLE         [filter] [sort] [export]  34px │ ← .ft-panel-header
├──────────────────────────────────────────────────────┤
│                                                      │ ← .ft-panel content
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Panel header height: `var(--ft-panel-header-h)` (34px default, 28px compact, 42px comfortable)
- Accent dot `·` in `--ft-accent` before panel title text
- Background: `--ft-surface` with `border: 1px solid var(--ft-border)`
- `border-radius: 2px` maximum — effectively sharp
- NO: box-shadow, backdrop-filter, gradient backgrounds

### Split Panel Pattern (two-column data display)

```
┌───────────────────┬───────────────────┐
│ LABEL         9px │ VALUE        12px │
│ ─────────────     │ ─────────────     │
│ Net Worth         │ £142,450.00       │
│ Total Assets      │ £168,220.00       │
│ Total Liabilities │ £25,770.00        │
└───────────────────┴───────────────────┘
```

- Left column: `.ft-label` style, 40% width
- Right column: `.ft-value` style, right-aligned, 60% width
- Row dividers: 1px `--ft-border`
- Alternating rows: every odd row background `--ft-raised` at 40% opacity (use `color-mix(in srgb, var(--ft-raised) 40%, transparent)`)

### Data Table Pattern

```
┌─────┬──────────────┬───────────┬──────────┬───────────┐
│ DATE│ DESCRIPTION  │ CATEGORY  │ ACCOUNT  │    AMOUNT │
├─────┼──────────────┼───────────┼──────────┼───────────┤
│     │              │           │          │           │
│     │              │           │          │           │
└─────┴──────────────┴───────────┴──────────┴───────────┘
```

- Column headers: `.xls-col-header` (already defined — 10px, 600, uppercase, `--ft-muted`)
- Row padding: `var(--ft-cell-py)` × `var(--ft-cell-px)`
- Numeric columns: right-aligned, mono, tabular-nums
- Text columns: left-aligned, truncated with `text-overflow: ellipsis`
- Alternating row backgrounds: odd rows `--ft-surface`, even rows `--ft-raised` at 30% opacity
- Row hover: `--ft-raised` background (already `.xls-row:hover`)
- Selected row: left-border `2px solid var(--ft-accent)` (already `.ft-tx-row.selected`)
- Row height: compact=28px, default=36px, comfortable=44px

---

## Component Patterns (Bloomberg-Specific)

### 1. Flash Cell

A number cell that briefly changes background color when its value updates. Used in markets tables, live net worth, portfolio positions.

- On value increase: background flashes `color-mix(in srgb, var(--ft-green) 20%, transparent)` for 600ms then fades
- On value decrease: background flashes `color-mix(in srgb, var(--ft-red) 20%, transparent)` for 600ms then fades
- CSS: `transition: background-color 600ms ease-out` (acceptable — applies to color only, not layout)
- Keyframe name: `ft-flash-up` / `ft-flash-down`
- Implementation: React `useEffect` comparing previous value, toggling a class for one animation cycle

```css
@keyframes ft-flash-up {
  0%   { background-color: color-mix(in srgb, var(--ft-green) 22%, transparent); }
  100% { background-color: transparent; }
}
@keyframes ft-flash-down {
  0%   { background-color: color-mix(in srgb, var(--ft-red) 22%, transparent); }
  100% { background-color: transparent; }
}
.ft-flash-up   { animation: ft-flash-up   600ms ease-out forwards; }
.ft-flash-down { animation: ft-flash-down 600ms ease-out forwards; }
```

### 2. Heat Cell

A table cell whose background opacity scales with value magnitude relative to column max. Used in budget deviation tables, spending breakdown, calendar heatmap.

- Formula: `opacity = Math.abs(value) / columnMax * 0.35` (capped at 0.35 to keep text readable)
- Positive values: `color-mix(in srgb, var(--ft-green) {opacity*100}%, transparent)`
- Negative values: `color-mix(in srgb, var(--ft-red) {opacity*100}%, transparent)`
- Applied as inline `style` via React, not CSS class (value is dynamic)

### 3. Ticker Strip

A horizontal scrolling strip of market prices. Already partially present in layout.tsx as `.ft-header-ticker-strip`. Full pattern:

- Height: 28px
- Background: `--ft-raised`
- Border-bottom: `1px solid var(--ft-border)`
- Content: symbol (10px mono, `--ft-muted`) + price (11px mono, `--ft-text`) + delta (10px mono, semantic color) + separator (`·` in `--ft-dim`)
- Animation: CSS `translateX` marquee, `60s linear infinite`, pauseable on hover
- `will-change: transform` on the inner strip element only — remove after mount
- Separator between instruments: `  ·  ` (two spaces, dot, two spaces) in `--ft-dim`

### 4. Status Indicator

A colored circle + text label. Used for market open/closed, budget status, account sync state.

```
● OPEN     (--ft-green, pulsing ft-pulse animation)
● CLOSED   (--ft-red, static)
● PRE      (--ft-amber, static)
● PENDING  (--ft-amber, static)
● SYNCED   (--ft-green, static)
● ERROR    (--ft-red, static)
```

- Circle: 6px × 6px, `border-radius: 50%` (circles are acceptable for status dots — this is the one exception to the no-rounded-corners rule)
- `.ft-live-dot` already exists for the pulsing green dot
- Text: 10px mono, `--ft-muted`

### 5. KPI Bar (Page-Level)

A horizontal strip of 4–8 key metrics displayed at the very top of a page's content area.

```
┌─────────────┬────────────────┬──────────────┬──────────────┐
│ NET WORTH   │ MONTHLY INCOME │ MONTHLY SPEND│ SAVINGS RATE │
│ £142,450    │ £4,200         │ £2,840       │ 32.4%        │
│ +£1,200 ▲  │ +£150 ▲        │ -£240 ▼      │ +2.1% ▲      │
└─────────────┴────────────────┴──────────────┴──────────────┘
```

- Uses CSS class `.ft-kpi-grid` (already defined for responsive collapse)
- Default: `grid-template-columns: repeat(N, 1fr)` where N = metric count
- Each cell: `background: --ft-surface`, `border: 1px solid var(--ft-border)`, `padding: 10px 12px`
- Privacy mode: values with `.pnum` class are blurred when `body.privacy-mode` is active (already implemented)

### 6. Section Header Pattern

Every panel and major content section uses a terminal-style header:

```
· RECENT TRANSACTIONS                              [EXPORT] [FILTER]
```

- Dot prefix `·` in `var(--ft-accent)`, rendered as a `<span>` sibling to the label text
- Label: `.ft-panel-label` (10px mono, 500, 0.08em letter-spacing, uppercase, `--ft-muted`)
- Right side: compact action buttons (ghost style, `--ft-muted` text, `--ft-border` border)
- Do NOT use `<h2>`, `<h3>` for panel headers — use `<div>` with `.ft-panel-label`
- Page-level headers only: use the existing `PageHeader` component — but see redesign note below

### 7. PageHeader Redesign

The current `PageHeader` component uses a rounded icon container (`borderRadius: 4`) and "text-base" sizing. For the terminal redesign:

- Remove the icon box entirely — icon is placed inline left of the title with no container
- Icon size: 14px, color `--ft-accent`
- Title: 13px mono, 700, `--ft-text` — NOT `font-head`
- Subtitle: 10px mono, `--ft-dim`
- The entire PageHeader row is replaced by the KPI bar for most pages
- PageHeader is only shown on settings, profile, and utility pages that lack a KPI bar

---

## Page-by-Page Redesign Notes

### Dashboard (`/`)

**Current state**: A draggable two-column widget grid with 20 widget types. Flexible but visually sparse between widgets.

**Target state**: A Bloomberg-style overview screen. Three zones:

1. **KPI Bar** (top strip, always visible): Net Worth · Monthly Net · Savings Rate · Portfolio Value · Budget Used · Health Score. Six cells in one row.
2. **Primary panel row** (two columns, 60/40 split):
   - Left (60%): Account summary as a split-panel table — account name, type, balance, 30d delta. No cards. Compact rows.
   - Right (40%): Recent transactions as a dense table — date (8px), description (truncated), amount (right-aligned, colored). 10–15 rows visible without scroll.
3. **Secondary panel row** (three columns, equal):
   - Cash flow panel: a small bar chart (income vs expense by month, last 6 months) — no chart title, just the bars and month labels
   - Spending breakdown: compact list of top 5 categories with heat cells showing magnitude
   - Smart alerts: plain text list, `--ft-red` for high-priority, `--ft-amber` for warnings, `--ft-dim` for info

**What to remove from current design**:
- Widget drag-and-drop on the main default view (keep as optional "lab" mode via toggle)
- Onboarding wizard overlay (move to settings)
- Large animated KPI cells with count-up animations — keep count-up but reduce cell padding
- Excessive whitespace between widget rows (reduce from ~10px gap to 6px)

**Market strip**: The ticker strip from the layout header moves to be the very first row of the dashboard page — not the layout. It sits between the KPI bar and the primary panels on the dashboard only.

### Transactions (`/transactions`)

**Current state**: Unknown in detail, but standard pattern.

**Target state**: Full-page data table, Bloomberg equity screen style.

1. **KPI bar** (4 cells): Total In · Total Out · Net · Transaction Count
2. **Filter bar** (single row below KPI bar): date range selector, category multi-select, account multi-select, search input, amount range. All compact inline controls. No floating filter panels.
3. **Table** (fills remaining height):
   - Columns: Date (70px) · Description (flex-grow) · Category (100px) · Account (100px) · Amount (90px, right-aligned)
   - Column headers: `.xls-col-header` style
   - Sortable columns: clicking header toggles asc/desc, shows `▲` or `▼` next to header label
   - Amount cell: monospace, right-aligned, `--ft-green` for income, `--ft-red` for expense
   - Row selection: click to select, `Shift+click` for range, `Ctrl/Cmd+click` for multi
   - Bulk actions appear in a bar above the table when rows are selected (not a floating panel)

**Empty state**: Zero-row table with headers still visible. A single `.ft-sublabel` row: `No transactions match the current filter.`

### Analytics (`/analytics`)

**Current state**: Charts with typical financial visualization.

**Target state**: Data-dense charting dashboard.

1. **KPI bar** (6 cells): Average Monthly Spend · Highest Category · YoY Change · Volatility · Streak · Best Month
2. **Chart layout**: Two-column grid where each chart panel has:
   - `.ft-panel-header` with title and date-range control inline
   - Chart fills panel to edge (no internal card padding around chart area)
   - Chart background: `--ft-base` (darkest) so it recedes behind the surface background
   - Grid lines: `--ft-border` at 1px
   - Axis labels: 9px mono, `--ft-dim`
   - Series colors: `--ft-accent` (primary), `--ft-blue` (secondary), `--ft-cyan` (tertiary)
3. **Annotation layer**: When hovering a chart, a tooltip in terminal style — `--ft-raised` background, `1px solid --ft-border`, monospace text, NO rounded corners

**What to remove**: Generic chart card shadows, large chart padding, legend boxes that take up chart space (use inline legends at the series line endpoints instead).

### Investments / Markets (`/investments`)

**Current state**: Market data with quote display.

**Target state**: Closest to a real Bloomberg equity screen.

1. **KPI bar** (5 cells): Portfolio Value · Day P&L · Total Return % · Beta · Sharpe Ratio (if calculable)
2. **Positions table** (top half): Full-width, dense rows.
   - Columns: Symbol (60px, `--ft-accent`) · Name (flex) · Price (80px) · Day Chg (70px) · Day Chg% (70px) · Cost (80px) · Value (90px) · Return (80px) · Return% (80px) · Weight (60px)
   - Flash cells on all price/change columns
   - Symbol column: monospace, bold, accent color (like Bloomberg yellow on black)
   - Change columns: colored by sign, with flash cells
3. **Quote panel** (bottom half, activated by clicking a position row):
   - Two-column split panel showing extended quote data for selected instrument
   - Left column: labels. Right column: values.
   - Fields: Open · High · Low · Volume · Avg Volume · 52W High · 52W Low · P/E · Mkt Cap · Div Yield
   - This replaces any modal or slide-in panel — it lives inline below the table

**What to remove**: Any card layout for individual holdings. All holdings data lives in the table, not in cards.

### Budget (`/budget`)

**Current state**: Budget categories with progress visualization.

**Target state**: Terminal-style budget monitor.

1. **KPI bar** (5 cells): Total Budgeted · Total Spent · Remaining · % Used · Days Left in Period
2. **Budget table**: One row per category.
   - Columns: Category · Budgeted (right-aligned) · Spent (right-aligned, colored) · Remaining (right-aligned) · % Used · Bar
   - Bar column: an inline progress bar (not a separate progress component) — 80px wide, 4px tall, `--ft-border` background, colored fill (`--ft-green` < 80%, `--ft-amber` 80-99%, `--ft-red` >= 100%)
   - Heat cells on the Spent and Remaining columns
   - Rows sorted by `% Used` descending by default
3. **No allocation cards**, no donut charts on this page — a simple spend summary donut is acceptable in a small panel at the right side if space allows, but the table is the primary view

### Goals (`/goals`)

**Current state**: Progress visualization (likely card grid).

**Target state**: Goals as a data table, not a card grid.

1. **KPI bar** (4 cells): Active Goals · On Track · At Risk · Total Target Amount
2. **Goals table**: One row per goal.
   - Columns: Name · Target Date · Target Amount · Saved · Remaining · Progress % · Status
   - Status column: status indicator pattern (● ON TRACK green, ● AT RISK amber, ● BEHIND red, ● COMPLETED green static)
   - Progress %: displayed as a number AND a tiny inline bar (same pattern as budget)
   - Row click expands an inline detail row showing contribution history as a sparkline + notes field

**What to remove**: Card grid layout, large circular progress indicators, decorative icons per goal.

### Net Worth (`/net-worth`)

**Target state**: Historical net worth panel + asset/liability breakdown.

1. **KPI bar** (5 cells): Net Worth · Assets · Liabilities · D/E Ratio · YoY Change
2. **Chart panel** (top, 60% height): Area chart of net worth over time. X-axis: months. Fill: `color-mix(in srgb, var(--ft-accent) 12%, transparent)`. Line: `--ft-accent`. 1px grid lines.
3. **Breakdown panels** (bottom, two columns):
   - Left: Assets split panel table (account name, type, current value, % of total)
   - Right: Liabilities split panel table (account name, type, balance, % of total)

### AI Coach (`/ai-coach`)

**Target state**: Terminal-style chat interface.

1. No chat bubbles with rounded corners. Messages are flat text blocks separated by 1px borders.
2. User messages: `--ft-raised` background, left-aligned, `.ft-sublabel` for timestamp
3. AI messages: `--ft-surface` background, left-aligned, plain text (NOT markdown rendered in styled HTML — use a monospace block)
4. Input area: single-line input with `border: 1px solid var(--ft-border)`, `background: --ft-raised`, monospace font. No rounded corners. Send is a text button `[SEND]` not an icon.

### Settings (`/settings`)

**Target state**: Terminal settings panel. Keep the existing persona matrix. Changes:

1. Section headers use the `· SECTION NAME` pattern
2. Theme selector: a grid of labeled color swatches (12px × 12px square patches, not rounded) — symbol name + color dot + label
3. No decorative cards or large padding sections — all settings are compact form rows with a label column and input column

---

## Features (Prioritized)

### Must-Have (Sprint 1-2)

1. **KPI Bar Component** (`KpiBar`): A reusable horizontal strip component accepting an array of `{label, value, delta, deltaSign}` objects. Renders as a flex row of cells separated by 1px borders. Accepts a `cols` prop (defaults to count). Integrates with privacy mode (values wrapped in `PrivNum`). Acceptance: appears on Dashboard, Transactions, Budget, Goals, Investments pages.

2. **Panel Component Upgrade**: The existing `.ft-panel` + `.ft-panel-header` CSS classes are correct. Audit every page to ensure panel headers use the `·` dot prefix pattern with `.accent-dot` span. Acceptance: every panel header on every page has `<span className="accent-dot">·</span>` before its label text.

3. **Compact Data Table**: A `DataTable` component using the existing `.xls-row`, `.xls-col-header` CSS. Adds: sort indicator arrows in headers, click-to-sort, configurable column alignment (left/right), optional flash-cell support, right-click context menu. Acceptance: Transactions and Investments pages use this component.

4. **Dashboard KPI + Panel Layout**: Restructure Dashboard from widget-grid to the three-zone layout (KPI bar + two-column primary row + three-column secondary row). Widget customization stays as an opt-in lab mode. Acceptance: default dashboard view matches the specified layout with zero widget-grid UI.

5. **Flash Cell Hook** (`useFlashCell`): A custom React hook that returns a `flashClass` string (`'ft-flash-up' | 'ft-flash-down' | ''`) by comparing current vs previous value. Acceptance: used on Investments prices table, net worth KPI, and dashboard net worth cell.

6. **Budget Table View**: Replace budget card/progress layout with the specified table + inline bar pattern. Acceptance: all budget categories visible in a single table, sortable by % Used.

7. **Goals Table View**: Replace goals card grid with the specified table. Acceptance: all goals in a table with status indicators, inline progress bars, and expandable detail rows.

8. **PageHeader Deprecation for Data Pages**: Remove `PageHeader` from all data pages (Dashboard, Transactions, Analytics, Investments, Budget, Goals, Net Worth, Portfolio, Accounts). PageHeader is retained only for Settings, Profile, Import, Learn, Calculators. Acceptance: no data page has the icon-box-plus-heading PageHeader — the KPI bar replaces it.

### Should-Have (Sprint 3-4)

9. **Heat Cell Component** (`HeatCell`): A `<td>` wrapper that accepts `value` and `max` props and computes the background color intensity inline. Acceptance: used in budget spent column, spending breakdown list, and analytics category table.

10. **Split Panel Component** (`SplitPanel`): A two-column data display component with label/value rows. Accepts a `rows` array `{label, value, color?}`. Acceptance: used on Net Worth breakdown, Investments quote panel, Account detail view.

11. **Ticker Strip Redesign**: The existing layout ticker strip gains full implementation — real price data from `useGetMarketQuotes`, flash cells on price updates, market status indicators per exchange. Moves to be visible in the layout header on all pages (not just dashboard). Acceptance: strip shows at minimum 6 instruments, pauses on hover, shows colored deltas.

12. **Investments Quote Panel**: Clicking a position row in the investments table opens an inline quote panel below the table (not a modal). Acceptance: panel shows 10+ data fields in split-panel format, closes when another row is clicked.

13. **Analytics Chart Density**: All charts on the analytics page have their internal padding reduced, legends moved inline, and grid line colors updated to `--ft-border`. Acceptance: each chart shows 20% more data in the same pixel area vs current.

14. **Transactions Filter Bar**: Replace any floating/modal filter UI with an inline single-row filter bar below the KPI bar. Acceptance: all filter controls visible simultaneously, no scroll or dropdown to reach filters.

15. **Status Bar Content**: The existing bottom status bar receives structured content. Format: `[USER] · [DENSITY MODE] · [THEME] · [LAST SYNC] · [PRIVACY: ON/OFF]`. Each segment is a clickable action (clicking DENSITY cycles through modes, clicking THEME opens theme picker, clicking PRIVACY toggles). Acceptance: all five segments functional.

16. **World Clock in Sidebar**: The existing world clock infrastructure in layout.tsx (already fully implemented) gets a proper inline panel at the bottom of the sidebar above Settings. Acceptance: shows 3 cities by default with live time and market status dots.

### Nice-to-Have (Sprint 5+)

17. **AI Coach Terminal Interface**: Redesign AI coach chat to the flat terminal message format (no chat bubbles). Acceptance: messages are flat bordered rows, input is a monospace terminal-style field.

18. **Keyboard Navigation for Tables**: Arrow keys navigate focused table rows. Enter opens/expands a row. Escape collapses. Acceptance: full keyboard navigation works on Transactions and Investments tables.

19. **Column Resize**: Data table columns are resizable by dragging the column separator in the header. Acceptance: column width persists in localStorage per-table.

20. **Print/PDF Export Hardening**: The existing print media query becomes a proper report layout. Acceptance: printing any page produces a clean, paginated data printout with page numbers and a header showing the page name and date.

21. **Screener View for Investments**: A filter panel for the investments table allowing filter by asset class, return%, market cap range. Acceptance: screener reduces visible rows to matching instruments in real-time.

---

## Technical Stack

- Frontend: React 18 + TypeScript + Wouter (routing) + TanStack Query
- Styling: Tailwind v4 + CSS custom properties (`--ft-*` tokens) — NO new utility classes that bypass the token system
- Charts: (existing charting library — do not change, only restyle colors/grid)
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable` (keep for widget lab mode)
- Key constraints: ALL new components must use `var(--ft-*)` tokens, never hardcoded hex values. ALL numeric values must use `font-family: var(--font-mono)` and `font-variant-numeric: tabular-nums`.

---

## Anti-AI-Slop Directives (Additions to Existing Constitution)

The `src/index.css` Anti-Vibe Constitution already bans the most common offenders. These are additional directives for this redesign specifically:

- No `PageHeader` icon boxes on data pages — the terminal doesn't use decorative headers
- No empty-state illustrations — if there is no data, show a zero-row table and a single `.ft-sublabel` text message
- No modal/slide-in panels for data that should be inline (quote panel, filter panel, goal detail) — inline expansion only
- No chart legends in boxes — use inline labels at line endpoints or a simple color key inside the `.ft-panel-header` right side
- No "loading skeleton" shimmer animations — show a `--ft-dim` colored placeholder row or `[LOADING...]` text in monospace
- No progress circles/rings for budget or goal tracking — use inline bars and numeric percentages
- No gradient fills on charts except the area fill (which must be <15% opacity of the series color)
- No rounded pill chips for category labels — use `2px border-radius` rect chips with `--ft-border` border and mono text
- No toast notifications for routine actions — show state change inline; toasts only for errors and confirmations of destructive actions

---

## Edge Cases & State Handling

### Empty States
- Zero-row table: headers remain, single row with `.ft-sublabel` centered text
- Zero-value KPI: show `–` (en-dash) in `--ft-dim`, not `£0.00`
- No market data: show `N/A` in `--ft-dim` for all price cells
- Portfolio with no holdings: KPI bar shows all dashes, table shows empty state row

### Error States
- API error: show a `· ERROR` panel header variant with `--ft-red` dot, panel content shows error message as `.ft-sublabel` text
- Partial data: cells with unknown values show `?` in `--ft-dim`
- Network offline: status bar segment shows `● OFFLINE` in `--ft-red`

### Loading States
- KPI bar cells loading: show a 40px × 8px `--ft-border` colored block (no shimmer animation)
- Table loading: show 8–12 skeleton rows with cells filled by `--ft-border` blocks (static, no animation)
- Chart loading: panel shows `[LOADING CHART DATA]` as `.ft-sublabel` centered text

### Responsive Behavior
- Mobile (≤ 640px): KPI bar collapses to 2×2 grid (existing `.ft-kpi-grid` CSS handles this). All tables get horizontal scroll wrapper. Split panels become single column. Sidebar hidden, bottom nav shown (already implemented).
- Tablet (641–900px): KPI bar stays single row but reduces to 3–4 cells visible. Remaining cells accessible via right scroll. Two-column panel layouts become single column.
- Desktop (≥ 1440px): All layouts use the full panel grid. Sidebar can expand to show labels (already implemented).

---

## Sprint Plan

### Sprint 1: Foundation (Core Layout Patterns)

**Goals**: Establish KPI bar, panel header dot prefix, and remove PageHeader from data pages.

**Features**: #1 (KPI Bar), #2 (Panel header audit), #8 (PageHeader removal from data pages)

**Definition of done**:
- `KpiBar` component exists with full TypeScript types, privacy mode support, and responsive collapse
- Every panel header on Dashboard, Transactions, Budget, Goals, Investments, Analytics, Net Worth has the `·` prefix
- Data pages render without `PageHeader` — the KPI bar fills the top of the content area

### Sprint 2: Data Tables (Transactions + Investments)

**Goals**: Both primary data table pages use the new compact table pattern with proper column alignment.

**Features**: #3 (DataTable), #5 (flash cell hook), #6 (Budget table), #7 (Goals table), #14 (Transactions filter bar)

**Definition of done**:
- Transactions page: KPI bar + inline filter bar + compact table with sort, colored amounts, row selection
- Investments page: KPI bar + positions table with flash cells + inline quote panel
- Budget page: KPI bar + table with inline bars and heat cells
- Goals page: KPI bar + table with status indicators

### Sprint 3: Components + Dashboard Restructure

**Goals**: Dashboard restructured to three-zone layout. Shared components hardened.

**Features**: #4 (Dashboard layout), #9 (HeatCell), #10 (SplitPanel), #15 (Status bar content)

**Definition of done**:
- Dashboard default view is the three-zone layout (KPI + two-col primary + three-col secondary)
- Widget lab mode accessible via a `[CUSTOMIZE]` button in the dashboard KPI bar right side
- HeatCell and SplitPanel components used across all relevant pages
- Status bar shows all five segments with click actions

### Sprint 4: Market Data + Polish

**Goals**: Ticker strip full implementation, analytics chart density, world clock panel.

**Features**: #11 (Ticker strip), #12 (Quote panel), #13 (Analytics density), #16 (World clock)

**Definition of done**:
- Ticker strip shows live market data in the layout header on all pages
- Analytics charts use terminal-appropriate colors and reduced padding
- World clock panel in sidebar bottom shows live times + market status
- All chart grid lines and axis labels match the `--ft-border` / `--ft-dim` token system
