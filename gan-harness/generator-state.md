# Generator State — Iteration 2

## What Was Built

Complete redesign of iteration-1.html addressing all 8 required fixes from the evaluator.

Single-file HTML/CSS/JS prototype at `/Users/TvpPro/Documents/GitHub/Finance-Tracker/gan-harness/iteration-2.html`.

## What Changed This Iteration

### Fix #1 — SVG colors: all CSS variables, zero hardcoded hex
- Removed all `fill="#4ADE80"`, `fill="#F87171"`, `stroke="#F4A21E"`, `stroke="#1E2532"` from SVG markup
- Income bars: `fill="var(--green)"` with opacity
- Spend bars: `fill="var(--red)"` with opacity
- Net worth line: `stroke="var(--accent)"`
- Grid lines: `stroke="var(--border)"`
- Y-axis labels: `fill="var(--dim)"`
- SVG gradient stop-color defined via `<style>` block inside the SVG using `.svg-grad-top` and `.svg-grad-bottom` classes — picks up `var(--accent)` correctly in all themes including Arctic (light)
- `preserveAspectRatio` changed from `none` to `xMidYMid meet` (fixes bar distortion at different heights)

### Fix #2 — Settings panel built from scratch
- "Settings" nav item added as `<button data-view="settings">`
- Full settings workspace (sidebar nav + content area) with 5 tabs: Appearance, Density, Layout, Shortcuts, About
- Appearance tab: 5 large named theme tiles (not dots) with hardcoded palette preview showing accent bar + color swatches, theme name, and personality subtitle. Each tile is a `<button>` with `aria-pressed` and `aria-label`.
- Density tab: Compact / Comfortable / Dense toggle buttons (full-width, monospace) applying via `[data-density]` attribute on `<html>`
- Layout tab: Panel manager with toggle switches for each panel (Overview, Spend, TX, Investments, Debts)
- Shortcuts tab: Full 2-column monospace table with `<kbd-key>` styled shortcut chips and action descriptions
- About tab: Build info block
- Floating colored dots removed entirely

### Fix #3 — Profile panel built from scratch
- Avatar "T" button in command bar navigates to profile view via `data-view="profile"`
- Profile card sections: Identity (name, email, user ID, last login, plan), Auth Providers, Session Management, Danger Zone
- Auth providers as terminal chips with pulsing green dot: GOOGLE, EMAIL / PASSWORD
- `> auth.logout()` terminal-style button with accent color and terminal border treatment
- Danger zone section in red tint background with `!` warning prefix, descriptive text, and two buttons: "Revoke All Sessions" and "Delete Account"

### Fix #4 — focus-visible accessibility
- Global `*:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }` rule
- Global `*:focus { outline: none; }` removes browser default ring
- All theme tiles converted to `<button>` with `aria-pressed` and `aria-label`
- All `div.cmd-nav-item` converted to `<button data-view="...">` with `aria-label` and `aria-current`
- TX rows have `tabindex="0"`, `role="row"`, `aria-selected`, `onkeydown` handler for Arrow keys + Enter + Escape
- Profile avatar converted from `<div>` to `<button>` with `aria-label`

### Fix #5 — Second surface depth layer inside panels
- Metric cells: `background: var(--raised)` — sits above the chart area
- Chart area: `background: var(--surface)` — one level below metric cells
- Panel headers: `background: var(--raised)` — above the panel body
- Budget footer (spending panel): `background: var(--raised)` — above the flow list
- Transaction header: `background: var(--raised)` (sticky table header)
- Creates clear foreground/background depth relationship within every panel

### Fix #6 — Live indicator pulse + Bloomberg market data rail
- Added `@keyframes live-pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }` — 2s infinite ease-in-out on `.panel-dot.live`
- Auth badge dots also get pulse animation for terminal authenticity
- Status strip market data segment added: FTSE 8,241 ▲0.3% | SPX 5,890 ▼0.1% | BTC 67,420 ▲1.2% | GBP/USD 1.2743 ▲0.04%
- Visual separator (`.strip-sep`) between personal data and market data rail using accent-tinted 1px vertical line

### Fix #7 — Budget targets per spending row
- Each flow-item now shows `£spent / £budget` text right-aligned in monospace
- Progress bar fills by `(spent/budget) * 100%`
- UTILITIES is over-budget (£165 / £150 = 110%): bar is `var(--red)` with `.over-budget` class, text shows `!` suffix in red
- All inline styles from budget footer removed — proper CSS classes: `.budget-footer`, `.budget-footer-header`, `.budget-footer-bar`, `.budget-footer-fill`, `.budget-footer-values`, `.budget-footer-val`
- Flow items restructured: `.flow-item-top` row + `.flow-bar-track` / `.flow-bar-fill` underneath

### Fix #8 — TX row selection + panel collapse
- `.tx-row.selected`: `background: var(--raised)` + `border-left: 2px solid var(--accent)`
- `.tx-row:focus-visible`: same left border treatment (no outer outline — cleaner)
- `selectTxRow()` function: deselects all rows in same table, then selects clicked row
- `txRowKey()` handler: Enter/Space selects, ArrowUp/Down navigates rows, Escape deselects
- `.panel-collapse-btn` (∧) button in each panel header toggles `.collapsed` class on panel
- Collapsed panels: `.panel.collapsed .panel-body { display: none }` — shows only the panel header
- Button text flips ∧ → ∨ on collapse. `aria-label` updates accordingly.
- `data-active-view` on `<html>` element (not body) — cleaner semantic target

### Additional improvements
- Minor fix #11: `document.documentElement.removeAttribute('data-theme')` for Void theme instead of setting empty string
- Minor fix #8 (clock): clock now shows BST timezone label
- `data-active-view` moved from `body` to `<html>` element
- Full keyboard shortcut system: G+D/T/S/P chord navigation, T cycles themes, 1-5 selects theme by number, ? opens shortcuts tab
- Transactions view has filter tag bar (ALL / INCOME / EXPENSES / PENDING / THIS MONTH / FOOD / TRANSPORT / UTILITIES)

## Known Issues

- Panel collapse does not yet reflow the grid (the adjacent panel doesn't expand into vacated space — would require JS grid manipulation). The header is visible and `∧/∨` toggles correctly.
- Chart bars are SVG with hardcoded x positions — not responsive to viewport width changes (preserveAspectRatio handles scale but not repositioning).
- Market data in status strip is static — no live feed.

## File
- `/Users/TvpPro/Documents/GitHub/Finance-Tracker/gan-harness/iteration-2.html`
- Single-file, no build step required
- Open directly in browser
