# Evaluation — Iteration 1

## Scores

| Criterion | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Design Quality | 7.5/10 | 0.35 | 2.63 |
| Originality | 7.0/10 | 0.30 | 2.10 |
| Craft | 6.0/10 | 0.25 | 1.50 |
| Functionality | 5.0/10 | 0.10 | 0.50 |
| **TOTAL** | | | **6.73/10** |

## Verdict: FAIL (threshold: 8.0)

The design has a credible Bloomberg-terminal foundation and avoids the worst AI-slop defaults. It is not embarrassing. But it falls short of the 8.0 threshold because the craft layer has real gaps (hardcoded colors defeating the theme system, missing focus states, inline style sprawl), functionality is shallow (Settings and Profile do not exist, nav clicks do nothing), and the originality stops one idea short of being genuinely memorable.

---

## Critique Questions

**1. If you removed the financial data and replaced it with generic text, would it still look distinctive?**

Partially. The command bar breadcrumb + status strip combination is the strongest structural choice and would survive content removal. The metrics-grid-over-chart layout is competent but not unusual — any Bloomberg screenshot uses that arrangement. The spending breakdown panel with horizontal micro-bars is a nice touch. But the overall grid (2-column workspace with a full-width bottom panel) is a standard Bloomberg clone, not an original interpretation of it. Remove the financial data and you have a plausible-looking terminal with one genuinely distinctive strip at the bottom. That is not enough.

**2. Is the monospace treatment purposeful or decorative?**

Purposeful where it counts, decorative in two places. Purposeful: metric values at 22px JetBrains Mono with `-0.02em` tracking, all transaction table content in mono, status strip items, flow-item amounts and labels. Decorative: the panel-type labels (`· OVERVIEW · NET POSITION`) use `.panel-type` with `font-family: var(--font-mono)` when the dot-bullet prefixes and spaced caps convention feel like style gestures rather than information tools. The chart title (`Cash Flow · July 2026`) uses `.chart-title` which is `font-head`, not mono — inconsistent with adjacent mono data. Minor, but tells you the rule isn't fully internalized.

**3. Does the theme system feel like a first-class feature or an afterthought?**

Afterthought. The CSS variable architecture is solid: five complete themes with proper base/surface/raised/border hierarchy, distinct palettes, correct font variable inheritance. But the SVG chart hardcodes colors (`stroke="#1E2532"`, `fill="#4ADE80"`, `fill="#F87171"`, `fill="#F4A21E"`) and will display Void amber colors on every other theme including Arctic (light background). The floating dot switcher has no label, no tooltip text visible on the page, no keyboard access, and is positioned in the bottom-right gap between the status strip and the workspace — it looks like a debugging tool, not a feature. The status strip correctly reads "THEME: VOID" but this confirmation is buried at the far right in `var(--dim)` color. The theme system works but is not presented as something the product is proud of.

**4. What is the ONE element a user would describe when telling someone about this interface?**

The status strip. A continuous ticker-style bar at the bottom surfacing Net Worth, MTD Spend, Savings Rate, Upcoming bills, and Last Sync in a permanently-visible monospace readout is the most memorable single element. It behaves like a Bloomberg status bar and communicates that this is a monitoring tool, not a reporting tool. This is the concept to double down on.

---

## Critical Issues (must fix)

**1. SVG chart uses hardcoded hex colors instead of CSS variables — theme system breaks visually.**
- What is wrong: `fill="#4ADE80"`, `fill="#F87171"`, `stroke="#F4A21E"`, and grid lines `stroke="#1E2532"` are baked into the SVG markup. Switch to Arctic theme (white background) and the bars are still neon green/red on white — readable by accident, but the accent line remains amber, not `#0052CC`. Switch to Phosphor and the bars are invisible against the near-black background.
- How to fix: Replace every hardcoded color in the SVG with `currentColor` references, CSS variables via a `<style>` block inside the SVG, or use CSS custom property references in the SVG fill attributes: `fill="var(--green)"` works in inline SVG. Grid lines should use `stroke="var(--border)"`. Income bars `fill="var(--green)"`, spend bars `fill="var(--red)"`, net-worth line `stroke="var(--accent)"`. The gradient stop `stop-color="#F4A21E"` also needs to become `stop-color="var(--accent)"` — note that CSS variables in SVG gradient `stop-color` require the gradient to be defined inside a `<style>` tag using CSS, not inline XML attributes. Use a CSS class on the gradient stop: `.area-fill { stop-color: var(--accent); }`.

**2. Settings and Profile surfaces are completely absent — two of five required screens do not exist.**
- What is wrong: The spec requires a Settings page (tabbed, comprehensive, includes theme picker and layout controls) and a Profile section (user info, auth providers, account management). Neither is implemented. The nav bar lists Overview, Transactions, Budget, Investments, Debts, Upcoming — Settings and Profile are not even nav items. The profile avatar ("T") in the command bar has a cursor pointer but clicking it does nothing.
- How to fix: Add "Settings" and "Profile" as cmd-nav-item entries. Implement a settings panel surface that replaces the workspace on nav click: tabbed layout with tabs for Appearance (theme picker moved here from floating dots), Density, Layout, Keyboard Shortcuts, Notifications. Implement a profile panel with user name, email, auth provider badges, session management, and a danger zone section (delete account). The theme picker in Settings should be a full named-tile grid (Void, Phosphor, Arctic, Amber, Midnight) with a preview swatch and description, not just colored dots.

**3. Zero focus states — keyboard navigation is inaccessible and undesigned.**
- What is wrong: There is no `:focus-visible` rule anywhere in the stylesheet. Tab-navigating through the interface reveals the browser's default outline or nothing, depending on the browser. This is both an accessibility failure and a craft failure — for a product targeting power users who "want keyboard shortcuts," this is contradictory.
- How to fix: Add a global `:focus-visible` rule: `outline: 1px solid var(--accent); outline-offset: 2px;` and remove the default outline with `outline: none` on interactive elements when `:focus-visible` is not active. Specifically style `.cmd-nav-item:focus-visible`, `.chart-ctrl:focus-visible`, `.theme-btn:focus-visible`, and `.tx-row:focus-visible`. The status strip should show an active keyboard focus indicator: "KB FOCUS · TX-ROW-3" as a live readout would reinforce the terminal character.

---

## Major Issues (should fix)

**4. Theme switcher is a floating debug widget, not a designed feature.**
- What is wrong: Five 16px dots floating in the bottom-right corner at `position: fixed; bottom: 36px; right: 16px` have no label, no tooltip visible without hover, no keyboard access (they are `div` elements, not `button`), and are visually disconnected from the product chrome. The active state (scale 1.3 + border change) is a minor CSS toggle, not a designed affordance. A power user seeing this for the first time would not know what it is.
- How to fix: Move the theme switcher into the Settings panel (see Critical Issue 2). In its current position, replace it with a keyboard shortcut indicator or remove it entirely. If it must stay as a quick-access element, convert to `button` elements, add `aria-label="Switch to Phosphor theme"`, add `title` attributes, and give it a visible label: a small `THEME` label in `var(--font-mono)` above the dots.

**5. Inline styles throughout the spending panel and transaction header break CSS variable discipline.**
- What is wrong: The budget progress section at the bottom of the right panel uses 9 separate `style="..."` attributes with inline font, color, and layout rules that duplicate existing class patterns. The transaction panel header uses `style="margin-left:auto;display:flex;gap:6px;align-items:center;"` and the filter/export/add buttons reuse `.chart-ctrl` — fine — but the panel-level layout is ad-hoc. This creates two maintenance surfaces and makes theme overrides unreliable.
- How to fix: Extract the budget section into `.budget-footer` with child classes `.budget-label`, `.budget-bar`, `.budget-values`. Move all inline styles to the stylesheet. The budget bar already has an equivalent pattern in `.flow-bar-wrap` / `.flow-bar` — use the same classes or create a shared `.mini-bar` component class.

**6. Spending category bars have no per-category color differentiation and the amounts have no budget context.**
- What is wrong: All category bars are `var(--accent)` except SUBSCRIPT which gets `var(--cyan)`. This is arbitrary — there is no system. The category panel shows amounts but no budget ceiling per category, so a user cannot tell if £960 on HOUSING is 100% of their housing budget or 80%. The bars show proportional spend relative to the largest category, not budget utilization.
- How to fix: Assign semantic colors: HOUSING and UTILITIES in a neutral blue (`var(--blue)`), FOOD in green-adjacent, TRANSPORT and ENTERTAIN in the accent family, HEALTH in cyan. Add a second lighter bar behind each amount showing the budget ceiling: the filled bar represents actual spend, the track represents the category budget. Add a per-row text like `88% / £1,090` where £1,090 is the category budget. This makes the panel genuinely useful instead of decorative.

**7. The chart SVG uses `preserveAspectRatio="none"` — bars deform at different viewport heights.**
- What is wrong: `preserveAspectRatio="none"` causes the 160px-tall viewBox to stretch to fill available space. On a tall monitor, bars and the net-worth line become distorted; on a short monitor or when the bottom panel is tall, the chart is compressed to unreadability. The bars are also hardcoded at pixel positions (x="40", x="80", etc.) with no responsive distribution.
- How to fix: Use `preserveAspectRatio="xMidYMid meet"` or restructure as a CSS-driven chart using `display: flex` and `align-items: flex-end` for the bars with variable height percentages. A flexbox bar chart with `height: calc(var(--pct) * 1%)` is more maintainable and responsive than a hardcoded SVG. Alternatively, keep SVG but set a fixed `height` on `.chart-svg-wrap` rather than letting it flex, so the viewBox scale remains stable.

---

## Minor Issues (nice to fix)

**8. The live clock displays local timezone but has no timezone indicator.**
- The clock shows `THU 16 JUL · 21:14:09` with no TZ label. For a financial terminal, `UTC` or the user's timezone abbreviation should appear. Add `GMT` or `(UTC+1)` suffix: `THU 16 JUL · 21:14:09 BST`.

**9. Transaction rows have no selected/active state — clicking does nothing visible.**
- `.tx-row:hover` exists but clicking a row does not select it, highlight it, or open a detail view. Add a `.tx-row.selected` class with `background: var(--raised); border-left: 2px solid var(--accent)` and toggle it on click. Even without a detail panel, selection feedback is a basic interaction contract.

**10. Panel resize and drag controls are missing — spec requires modular panels.**
- The spec says "panels the user can toggle, resize, reorder." Currently the grid is hardcoded at `grid-template-columns: 1fr 320px; grid-template-rows: 1fr 240px`. Add resize handles (a 4px draggable `::after` pseudo-element on panel borders with `cursor: col-resize` / `row-resize`) or at minimum a toggle button per panel to collapse/expand it. This is a spec requirement, not a polish item.

**11. `setTheme(this, '')` sets `data-theme=""` on body — remove the attribute instead.**
- `document.body.setAttribute('data-theme', '')` leaves a `data-theme=""` attribute on the body. While it does not break the theme (no rule matches `[data-theme=""]`), it is semantically incorrect and would confuse devtools inspection. Fix: `document.body.removeAttribute('data-theme')` for the Void (default) theme case.

---

## What Improved Since Last Iteration

This is iteration 1, so there is no prior baseline to compare against. Noted for iteration 2 reference.

---

## Specific Suggestions for Next Iteration

1. **Fix the SVG theme integration first.** Replace all hardcoded SVG colors with CSS variable references. Add a `<style>` block inside the SVG for gradient stop colors. This is a one-hour fix that unblocks all theme testing — every theme currently shows the wrong chart.

2. **Add a Settings panel as a proper workspace swap.** When "Settings" is clicked in the nav, the workspace grid should be replaced by a settings surface. Minimum viable: Appearance tab with the named theme picker (tiles, not dots), a density toggle (Compact/Comfortable/Spacious), and a keyboard shortcut reference table. The theme switcher dots should be removed from their floating position and live only in Settings.

3. **Implement the Profile panel.** Profile avatar click in the command bar should open a slide-in panel or workspace swap. Include: user display name and email in monospace, auth provider badges, "Last login" timestamp, a "Sign out" button styled as a terminal command (`> auth.logout()`), and a danger zone (Delete Account) in red with confirmation step.

4. **Add `:focus-visible` styles before calling this keyboard-friendly.** A terminal for power users with no keyboard focus treatment is not a terminal — it is a mockup that avoided a hard problem. Add `outline: 1px solid var(--accent); outline-offset: 2px` globally for `:focus-visible` and ensure all interactive elements are actual `button` or `a` tags (the theme dots are `div` elements — fix this).

5. **Add a second data surface layer inside panels.** Currently every panel is a single `var(--surface)` color with a `var(--raised)` header. Add `var(--raised)` as a background for data rows, nested sub-sections, or metric cells — creating genuine depth. The metric cells specifically should sit on `var(--raised)` with the chart area on `var(--surface)`, establishing a foreground/background relationship within the panel.

6. **Push the status strip further — this is the signature element.** Add a scrolling/marquee behavior to the strip when content overflows (like a real financial ticker). Add a market index display (even static): `S&P500 5,642 +0.4%` and `GBP/USD 1.2743` to make it feel like a Bloomberg data feed. Add a pulsing animation to the "LIVE" dot in the panel header — it currently has a static green glow but should pulse with a CSS keyframe animation.

7. **Budget section in the spending panel needs its own CSS classes.** Extract all 9 inline styles into a `.budget-footer` block. While there, add a budget-vs-actual context to each category row: a small right-aligned text showing `£960 / £1,090` so power users can see both actuals and ceilings at a glance.

8. **Implement panel collapsing.** The right spending panel at 320px fixed width is wasted space when a user wants full-width transactions. Add a `^` collapse toggle button in each panel header (right side) that collapses the panel to its header only, redistributing the grid space. Store state in `localStorage`. This is the minimum viable version of the "modular panels" spec requirement.

---

## Screenshots

No browser session was available for live rendering. Evaluation was conducted against the full HTML source (868 lines). Key observations from code review:

- The theme architecture (CSS variables, five complete definitions) is the strongest technical decision in the file.
- The SVG chart at lines 605-651 is the most fragile section — hardcoded colors will visually break on Arctic (light) and Phosphor (full-green) themes.
- The status strip (lines 803-810) is the most distinctive visual element and should be the design's signature. It currently undersells itself.
- The Settings and Profile surfaces are entirely absent despite being required by the spec — this is the most significant gap between spec and delivery.
- The floating theme dots (lines 813-819) are `div` elements with `onclick` attributes — not accessible and not designed.
