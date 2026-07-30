# Style Inventory — Numeris Finance Tracker

All counts verified by script (`grep -c`, `find … -exec grep -c`) against
`artifacts/finance-tracker/src/`. Inferences are labelled **[inferred]**.

---

## 0. Scope & Baseline

| Metric | Count |
|---|---|
| `style={{ }}` occurrences (all .tsx in src/) | **11,714** |
| `className=` occurrences | **1,850** |
| Ratio | **6.3 : 1** in favour of inline styles |
| `.tsx` files containing at least one `style={{` | **120 of ~120 files** |
| Top file by inline style count | `investments.tsx` — **717** |
| `fontFamily: "var(--font-mono)"` occurrences | **4,335** |
| `fontVariantNumeric: "tabular-nums"` occurrences | **218** |
| `.pnum` class usages (JSX) | **679** |

---

## 1. Local Style Constants — Per-File Declarations

### 1a. Panel & Header shell

All three constants below are almost byte-for-byte identical. The only variance
is `padding-left` (12 px vs 14 px) and whether the type annotation is
`React.CSSProperties` or `as const`.

| File | Constant | Properties |
|---|---|---|
| `pages/settings.tsx:236` | `PANEL_STYLE` | `background: --ft-surface`, `border: 1px solid --ft-border`, `overflow: hidden` |
| `pages/settings.tsx:238` | `HEADER_STYLE` | `background: --ft-raised`, `borderBottom: 1px solid --ft-border`, `height: 34`, `display: flex`, `alignItems: center`, `gap: 8`, `fontFamily: --font-mono`, `fontSize: 10`, `fontWeight: 600`, `letterSpacing: 0.08em`, `textTransform: uppercase`, `color: --ft-muted` |
| `pages/profile.tsx:20` | `PANEL` | same as `PANEL_STYLE` |
| `pages/profile.tsx:26` | `HEADER` | same as `HEADER_STYLE`, `padding: "0 12px"` vs `"0 14px"` |

**Duplicates:** `PANEL_STYLE` ≈ `PANEL` — 2 files, identical shape.
`HEADER_STYLE` ≈ `HEADER` — 2 files, 2 px difference in horizontal padding only.

---

### 1b. Table header (TH) constant

Declared independently in every file that renders a data table.

| File | Constant | Padding | Font | Distinguishing detail |
|---|---|---|---|---|
| `pages/accounts.tsx:100` | `TH` | `6px 12px` | 10 / dim / mono | `borderRight: 1px solid --ft-raised` |
| `pages/upcoming.tsx:86` | `TH` | `6px 12px` | 10 / dim / — | `borderRight: 1px solid --ft-raised` |
| `pages/reports.tsx:134` | `TH` | `6px 12px` | 10 / dim / mono | `borderBottom: 2px solid --ft-border2` |
| `pages/owing.tsx:141` | `TH` | `6px 12px` | 10 / dim / — | `borderRight: 1px solid --ft-border` |
| `pages/tax.tsx:328` | `TH` | `6px 12px` | 10 / dim / — | no right border |
| `pages/subscriptions.tsx:91` | `TH` | `5px 10px` | 9 / dim / mono | slightly denser |
| `pages/investments.tsx:203` | `TH` | `6px 10px` | 10 / dim / mono | — |
| `pages/transactions.tsx:152` | `TH` | `0 var(--ft-cell-px)` | 10 / muted / mono | **density-aware** ← sole user of density token |
| `pages/analytics.tsx` | `th` (local) | `var(--ft-cell-py) var(--ft-cell-px)` | 9 / muted / mono | **density-aware** |
| `components/investments/portfolio-tables.tsx:22` | `TH` | `6px 12px` | 10 / dim / — | — |
| `components/investments/orders-tab.tsx:90` | `TH` | `6px 12px` | 10 / dim / — | — |
| `components/investments/derivatives-tab.tsx:70` | `TH` | `6px 12px` | 10 / dim / mono | — |

**Verdict:** 12 independent `TH` constants for a single concept. 10 of 12 have
the same `6px 12px` / `fontSize 10` / `dim` / `border2` core. The two
analytics-family files are the only ones that forward density tokens.

---

### 1c. Table data cell (TD) constant

| File | Constant | Padding | Notable |
|---|---|---|---|
| `pages/reports.tsx:148` | `TD` | `7px 12px` | mono, nowrap |
| `pages/reports.tsx:157` | `TD_TOTAL` | spreads `TD` + bold | border-top variant |
| `pages/owing.tsx:154` | `TD` | `6px 10px` | no mono |
| `components/investments/portfolio-tables.tsx` | via spread | — | |
| `pages/business.tsx:1147` | `TD` (function-scope) | `6px 10px` | — |
| `pages/investments.tsx:2275` | `TD` (function-scope) | `8px 10px` | mono, tabular |
| `pages/investments.tsx:3614` | `TD` (function-scope) | `6px 10px` | mono |

---

### 1d. Input field style constant

Three pages define nearly identical input constants for their forms:

| File | Constant | Height | Bg | Notable |
|---|---|---|---|---|
| `pages/budget.tsx:168` | `INPUT_STYLE` | 28 | `--ft-raised` | mono, borderRadius 0 |
| `pages/owing.tsx:163` | `INPUT_STYLE` | 32 | `--ft-base` | no mono |
| `pages/mortgage.tsx:172` | `INPUT_STYLE` | 32 | `--ft-raised` | mono |
| `pages/split.tsx:231` | `INPUT_S` | 30 | `--ft-base` | borderRadius 2 |

---

### 1e. Ghost / Accent button style constant

`BTN_GHOST` redeclared in at least three page files with nearly identical shapes:

| File | Constant | Bg | Border | Padding |
|---|---|---|---|---|
| `pages/import.tsx:146` | `BTN_GHOST` | transparent | `--ft-border` | `8px 16px` |
| `pages/recurring.tsx:94` | `BTN_GHOST` | transparent | `--ft-border` | `4px 10px` |
| `pages/budget.tsx:195` | `BTN_GHOST` | transparent | `--ft-border2` | `6px 12px` |

`BTN_PRIMARY` / `BTN_ACCENT` similarly redeclared in `import.tsx:130`,
`budget.tsx:182`, `recurring.tsx:82`. All share: `--ft-accent` background,
`--ft-base` text, `border: none`, `borderRadius: 0`, mono uppercase.

---

### 1f. Mono label constant

| File | Constant | Properties |
|---|---|---|
| `pages/profile.tsx:42` | `MONO_LABEL` | fontSize 9, dim, letterSpacing 0.06em, uppercase |
| `pages/profile.tsx:50` | `MONO_VAL` | fontSize 12, text colour, marginTop 2 |
| `pages/dashboard.tsx:2109` | `OV_LABEL` | fontSize 8, dim, letterSpacing 0.13em, uppercase |
| `pages/dashboard.tsx:2108` | `OV_MONO` | fontFamily mono, tabular-nums |
| `pages/reports.tsx:122` | `MONO` | fontFamily mono only |
| `pages/reports.tsx:124` | `SECTION_LABEL` | fontSize 8, fontWeight 600, letterSpacing 0.12em, uppercase, dim |
| `components/widgets/compact-tiles.tsx:17` | `MONO` | fontFamily mono + tabular-nums |
| `components/widgets/compact-tiles.tsx:19` | `LABEL` | spreads MONO, fontSize 9, dim, letterSpacing 0.13em, uppercase |
| `pages/split.tsx:243` | `LABEL_S` | fontSize 9, mono, letterSpacing 0.08em, uppercase, dim |

**Note:** `OV_LABEL` (dashboard) and `LABEL` (compact-tiles) are the same object
at different font sizes (8 vs 9 px). `SECTION_LABEL` (reports) is the same
again with an added `fontWeight: 600`.

---

### 1g. Settings-page ROW

`pages/settings.tsx:245` — `ROW`: flex, space-between, wrap, gap 8,
`padding: "10px 14px"`, `borderBottom: 1px solid --ft-border`, mono 12px.

This is only used in settings.tsx but conceptually is the same "labelled row
with right control" pattern that profile.tsx, accounts.tsx, and every "settings
panel" page re-invents inline.

---

## 2. The 15 Most Frequent Inline Style Shapes

Property sets are normalised (sorted alphabetically; values stripped).
Counts are exact matches of single-line `style={{ … }}` blocks.
Multi-line blocks with the same key set are not counted here — **[inferred]**
the true count is higher by an unknown fraction.

| # | Property set | Count | Example references |
|---|---|---|---|
| 1 | `color, fontFamily, fontSize` | **550** | `components/keyboard-shortcuts.tsx:169`, `components/layout.tsx:377`, `components/ai-agent.tsx:282` |
| 2 | `alignItems, display, gap` | **331** | `components/quick-add-transaction.tsx:306`, `components/notifications-panel.tsx:479`, `pages/investments.tsx` |
| 3 | `color, fontFamily, fontSize, fontWeight` | **324** | `components/layout.tsx:376`, `components/layout.tsx:621`, `components/layout.tsx:623` |
| 4 | `color, fontFamily, fontSize, letterSpacing, marginBottom, textTransform` | **263** | `components/mobile/MobileBudget.tsx:179`, `:234`, `:238` |
| 5 | `color, fontFamily, fontSize, letterSpacing, textTransform` | **229** | `components/mobile/MobileBudget.tsx:214`, `:256`, `:266` |
| 6 | `color, fontSize` | **222** | `components/auth-gate.tsx:601`, `components/layout.tsx:1887`, `pages/accounts.tsx` |
| 7 | `color, fontFamily, fontSize, marginTop` | **165** | `components/layout.tsx:618`, `:2508`, `components/ai-agent.tsx:255` |
| 8 | `display, flexDirection, gap` | **145** | `components/mobile-fab.tsx:139`, `components/auth-gate.tsx:20`, `components/layout.tsx:1546` |
| 9 | `alignItems, display, justifyContent, marginBottom` | **143** | `components/mobile/MobileBudget.tsx:159`, `:312`, `:379` |
| 10 | `display, gap` | **97** | `components/quick-add-transaction.tsx:358`, `components/csv-import.tsx:233` |
| 11 | `color, fontFamily, fontSize, letterSpacing` | **84** | `components/layout.tsx:380`, `:640`, `:1876` |
| 12 | `color, fontWeight` | **82** | `components/layout.tsx:669`, `components/onboarding-wizard.tsx:270` |
| 13 | `alignItems, display, gap, marginBottom` | **77** | `components/ai-wanderer.tsx:529`, `components/quick-add-transaction.tsx:497` |
| 14 | `color, fontSize, fontWeight` | **71** | `components/quick-add.tsx:229`, `components/layout.tsx:1810` |
| 15 | `background, border, borderRadius, padding` | **66** | `components/mobile/MobileBudget.tsx:178`, `components/mobile/MobileHome.tsx:335` |

Shapes 1, 3, 4, 5, 7, 11 are all specialisations of the same mono-label
concept with different auxiliary keys added. Collapsed together the pattern
accounts for well over 1,000 occurrences.

Shapes 2, 8, 9, 10, 13 are flex-container variants.

---

## 3. Existing Alternatives

### Shape 1–7, 11 (mono text / mono label)

**Existing:** `.pnum` in `index.css` already sets `font-family: var(--font-mono)` and
`font-variant-numeric: tabular-nums`. The class is available to every component.

**Token coverage:** `--font-mono`, `--ft-dim`, `--ft-muted`, `--ft-text`,
`--ft-accent` cover all colour variants in these shapes. `fontSize` values
(7–12 px) are not tokenised — they appear as magic numbers throughout. The
density system defines `--ft-cell-py` and `--ft-cell-px` but not font-size
steps.

**Gap:** There is no shared CSS class for the uppercase mono label
(`textTransform: uppercase, letterSpacing: 0.1em, fontSize: 8–10, color:
--ft-dim`). This pattern appears **843 times** (measured: `textTransform uppercase
+ letterSpacing + color --ft-dim`) with no shared abstraction.

**shadcn coverage:** None of the shadcn/ui components in `src/components/ui/`
target this pattern. `label.tsx` wraps a `<label>` with Tailwind; it does not
carry mono/uppercase styles.

### Shape 2, 8, 9, 10, 13 (flex containers)

**Existing:** Tailwind utilities (`flex`, `items-center`, `gap-2`, etc.) exist
and `className=` is used in 1,850 places. However the pages that dominate
`style={{ }}` counts (`investments.tsx`, `analytics.tsx`, `settings.tsx`,
`transactions.tsx`) almost never use Tailwind — they are pure inline-style files.

**Token coverage:** `--ft-row-gap` in index.css defines the density-sensitive
gap value (`4px / 8px / 14px` for compact/normal/comfortable). None of the 331
`{display, alignItems, gap}` occurrences use `--ft-row-gap`; they all hardcode
`gap: 8` or `gap: 6`.

### Shape 15 (`background, border, borderRadius, padding`)

**Existing:** shadcn `card.tsx` exists. It uses `className` with
`rounded-xl border bg-card shadow`. The Numeris panels use `borderRadius: 0`
(squared) and `--ft-surface` / `--ft-border` tokens, which `bg-card` does not
resolve to without additional Tailwind config. **shadcn Card is not a drop-in.**

The panel shape (`background: --ft-surface, border: 1px solid --ft-border,
overflow: hidden`) appears **366 times** (surface + border on same line). The
token pair exists; there is no shared component or CSS class encapsulating it.

---

## 4. Table and Row Rendering

Files that render tabular layouts: `accounts.tsx`, `analytics.tsx`,
`business.tsx`, `cashflow.tsx`, `fire.tsx`, `health-score.tsx`, `import.tsx`,
`investments.tsx`, `mortgage.tsx`, `net-worth-history.tsx`, `owing.tsx`,
`pension.tsx`, `recurring.tsx`, `reports.tsx`, `settings.tsx`,
`trading-journal.tsx`, `whatif.tsx`, plus investment sub-components
(`portfolio-tables.tsx`, `orders-tab.tsx`, `derivatives-tab.tsx`).

**shadcn `Table` component exists (`src/components/ui/table.tsx`) but is not
imported by any page or component.** Zero usage found.

### Row height and cell padding by file

| File | Row height | Cell padding | Number alignment | Implementation |
|---|---|---|---|---|
| `transactions.tsx` | 28 px (flex div) | `0 var(--ft-cell-px)` | right via `textAlign: right` | virtualised flex rows, not `<table>` |
| `analytics.tsx` | — | `var(--ft-cell-py) var(--ft-cell-px)` | right | `<table>` with density-aware padding |
| `accounts.tsx` | — | `6px 12px` (hardcoded) | right | `<table>` |
| `reports.tsx` | — | `7px 12px` (hardcoded) | right | `<table>` |
| `owing.tsx` | 28 px (flex div) | `6px 12px` (hardcoded) | right | hybrid: `<table>` for main, flex for mobile |
| `upcoming.tsx` | — | `6px 12px` (hardcoded) | right | `<table>` |
| `subscriptions.tsx` | — | `5px 10px` (hardcoded) | right | `<table>` |
| `tax.tsx` | — | `6px 12px` (hardcoded) | right | `<table>` |
| `investments.tsx` | varies (28, 32, 36 px) | `8px 10px` (hardcoded) | right | `<table>` + flex |
| `mortgage.tsx` | — | hardcoded | right | `<table>` |
| `business.tsx` | — | `6px 10px` (hardcoded) | right | function-scoped `TH`/`TD`, `<table>` |
| `whatif.tsx` | — | `6px 12px` (hardcoded) | right | `<table>` |
| `settings.tsx` | — | flex rows, `10px 14px` | — | flex, no `<table>` |

### Density mode: respected vs ignored

`index.css` defines three density levels via body class:

```
normal:      --ft-cell-py: 7px;  --ft-cell-px: 12px;  --ft-row-gap: 8px;
compact:     --ft-cell-py: 3px;  --ft-cell-px: 10px;  --ft-row-gap: 4px;
comfortable: --ft-cell-py: 12px; --ft-cell-px: 16px;  --ft-row-gap: 14px;
```

**Density-aware (use the vars):** `transactions.tsx` (cell-px only),
`analytics.tsx` (cell-py + cell-px).

**Density-ignored (hardcode pixels):** `accounts.tsx`, `reports.tsx`,
`owing.tsx`, `upcoming.tsx`, `subscriptions.tsx`, `tax.tsx`,
`investments.tsx`, `mortgage.tsx`, `business.tsx`, `whatif.tsx`, all
investment sub-tables. This is the vast majority.

The density setting is wired (App.tsx applies the body class; Settings lets the
user switch it) but only 2 of ~18 table-rendering files respond to it.

---

## 5. Numeric Formatting

### 5a. Infrastructure

| Mechanism | What it does | Where defined |
|---|---|---|
| `formatGbp()` | Formats a number to `£X,XXX.XX` | `src/lib/utils.ts` |
| `.pnum` CSS class | Sets `font-family: --font-mono` + `font-variant-numeric: tabular-nums` + overflow guards | `src/index.css:1248` |
| `fontFamily: "var(--font-mono)"` inline | Sets mono face without tabular alignment | everywhere |
| `fontVariantNumeric: "tabular-nums"` inline | Rarely, and never without also setting fontFamily | 218 occurrences |

`formatGbp` / `toLocaleString` / `.toFixed` appear **2,050 times** across src.
Only **218 lines** have `fontVariantNumeric: tabular-nums`. The `.pnum` class
(679 usages) bridges most of the gap — it provides both mono and tabular-nums
in a single className — but it is not used uniformly.

### 5b. Per-page coverage

Pages are classified by whether `tabular-nums` (inline) **or** `.pnum` (class)
appears anywhere in the file.

| Page | Currency calls | Has mono | Has tabular-nums or .pnum | Verdict |
|---|---|---|---|---|
| `transactions.tsx` | 30 | YES (155) | YES (tabular + pnum) | Consistent |
| `investments.tsx` | 226 | YES (287) | YES (tabular + pnum) | Consistent |
| `accounts.tsx` | 46 | YES (78) | YES (tabular) | Consistent |
| `analytics.tsx` | 110 | YES (98) | YES (tabular) | Consistent |
| `reports.tsx` | 45 | YES (57) | YES (tabular) | Consistent |
| `tax.tsx` | 4 | YES (86) | YES (tabular + 23 pnum) | Consistent |
| `trading-journal.tsx` | 26 | YES (8) | YES (tabular) | Consistent |
| `budget.tsx` | 38 | YES (60) | YES (tabular) | Consistent |
| `year-review.tsx` | 55 | YES (32) | YES (tabular) | Consistent |
| `calendar.tsx` | 15 | YES (68) | YES (tabular) | Consistent |
| `whatif.tsx` | 72 | YES (via `mono` spread) | YES (.pnum class) | Mixed — mono spread + pnum, no tabular inline |
| `dashboard.tsx` | 38 | YES (98) | YES (OV_MONO has tabular) | Mostly consistent |
| `family-finance.tsx` | 18 | YES (51) | YES (tabular) | Consistent |
| `import.tsx` | 2 | YES (10) | YES (tabular) | n/a (low volume) |
| **`mortgage.tsx`** | **41** | YES (81) | **NO** | **Gap** |
| **`fire.tsx`** | **40** | YES (71) | **NO** | **Gap** |
| **`pension.tsx`** | **55** | YES (85) | **NO** | **Gap** |
| **`net-worth-history.tsx`** | **56** | YES (109) | **NO** | **Gap** |
| **`goals.tsx`** | **33** | YES (105) | **NO** | **Gap** |
| **`owing.tsx`** | **41** | YES (80) | **NO** | **Gap** |
| **`subscriptions.tsx`** | **39** | YES (83) | **NO** | **Gap** |
| **`split.tsx`** | **38** | YES (85) | **NO** | **Gap** |
| **`health-score.tsx`** | **14** | YES (56) | **NO** | **Gap** |
| **`projection.tsx`** | **20** | YES (17) | **NO** | **Gap** |
| **`decisions.tsx`** | **33** | YES (17) | **NO** | **Gap** |
| **`briefing.tsx`** | **34** | YES (52) | **NO** | **Gap** |
| **`cashflow.tsx`** | **22** | YES (9) | **NO** | **Gap** |
| **`ai-coach.tsx`** | **24** | YES (40) | **NO** | **Gap** |
| **`recurring.tsx`** | **18** | YES (5) | **NO** | **Gap** |
| `settings.tsx` | 6 | YES (174) | NO | Low-volume, no financial display |
| `profile.tsx` | 6 | YES (92) | NO | Low-volume |

**Summary:** 20 of 34 page files that render currency values have no
`tabular-nums` anywhere. These files use `fontFamily: --font-mono` — which
sets the typeface — but do not request tabular figure alignment. The result is
proportionally-spaced JetBrains Mono, which is better than a proportional
serif but still allows columns to drift when digits have different widths.

### 5c. Percentage values

The same gap exists for percentages. `mortgage.tsx`, `fire.tsx`, `pension.tsx`,
`projection.tsx`, `whatif.tsx`, and `health-score.tsx` all render percentage
output. None declare `fontVariantNumeric: tabular-nums` inline;
`whatif.tsx` partially compensates via `.pnum` class on individual spans.

### 5d. The `.pnum` class — correct but underused

`.pnum` is the idiomatic solution (defined once, applies mono + tabular-nums +
overflow guards). It has 679 usages but is concentrated in `investments.tsx`,
`whatif.tsx`, and a few components. The 20 gap-pages above do not use it.

---

## 6. Proposed Primitive Set

Components ranked by (estimated call-sites eliminated) ÷ (implementation effort).

### P1. `<MonoLabel>` — uppercase section label

**Replaces:** shape-4/5 from §2 (263 + 229 = 492 inline shapes), all
`SECTION_LABEL`, `LABEL_S`, `OV_LABEL`, `MONO_LABEL` constants, and every
local `SectionHeader` with a label-only prop.

**Shape it encodes:**
```
fontFamily: var(--font-mono)
fontSize: <token or prop, default 9>
color: var(--ft-dim)            // or prop
letterSpacing: 0.1em
textTransform: uppercase
```

**Estimated call sites:** **843** (measured: uppercase + letterSpacing + dim
colour on same line). Conservative after deduplication: **~600 direct
replacements**.

**shadcn equivalent:** None. Tailwind can express it but not once per
occurrence without a component.

---

### P2. `<PanelBox>` — surface container

**Replaces:** `PANEL_STYLE` / `PANEL` constants (2 files) and all 366
occurrences of the `background: --ft-surface, border: 1px solid --ft-border`
inline pattern.

**Shape it encodes:**
```
background: var(--ft-surface)
border: 1px solid var(--ft-border)
overflow: hidden
```

**Estimated call sites:** **366** (measured).

**shadcn Card is not a substitute** — it uses `rounded-xl` (the design uses
`borderRadius: 0`) and its colours do not map without Tailwind config changes.
A thin local component avoids the mismatch.

---

### P3. `<PanelHeader>` — raised 34 px header bar with mono label

**Replaces:** `HEADER_STYLE` / `HEADER` constants, the 5 local `PanelHeader`
functions (fire, net-worth-history, pension, analytics, budget), and the 9
local `SectionHeader` functions (settings, dashboard, reports, business,
family-finance, mortgage, tax, recurring, briefing).

**Shape it encodes:**
```
background: var(--ft-raised)
borderBottom: 1px solid var(--ft-border)
padding: 0 var(--ft-cell-px)   // density-sensitive
height: var(--ft-panel-header-h)  // already tokenised: 28/34/42 px
display: flex; alignItems: center; gap: 8
fontFamily: var(--font-mono)
fontSize: 10; fontWeight: 600
letterSpacing: 0.08em; textTransform: uppercase
color: var(--ft-muted)
```

**Estimated call sites:** 14 (`PanelHeader`) + 73 (`SectionHeader` + variants)
= **~87 component call-sites** across the codebase. The existing component
redefinitions alone total 9 + 5 = **14 functions to delete**.

---

### P4. `<FtRow>` — settings-style label + control row

**Replaces:** `ROW` constant and all inline flex/space-between rows in settings
panels across settings.tsx, profile.tsx, and any other page with a list of
toggle rows.

**Shape it encodes:**
```
display: flex; alignItems: center; justifyContent: space-between
flexWrap: wrap; gap: var(--ft-row-gap)  // density-sensitive
padding: var(--ft-metric-py) var(--ft-cell-px)  // density-sensitive
borderBottom: 1px solid var(--ft-border)
fontFamily: var(--font-mono); fontSize: 12
```

**Estimated call sites:** **~150** [inferred from settings.tsx alone having 459
`style={{ }}` and the ROW constant used heavily; precise count would require
tracing usage].

**Note:** Uses `--ft-row-gap` and `--ft-metric-py` tokens that already exist
in index.css but are not referenced by any TSX file today.

---

### P5. `<KpiCell>` — metric tile

**Replaces:** 9 local `KpiCell` / `MetricTile` / `GapMetricCell` function
definitions across goals, profile, fire, business, family-finance, projection,
accounts, trading-journal, and net-worth widget.

**Core shape:**
```
background: var(--ft-surface)
borderTop: 2px solid <accent>
padding: var(--ft-metric-py) var(--ft-cell-px)
[label] MonoLabel + [value] mono large + optional sub-label
```

**Estimated call sites:** **47** `<KpiCell` measured. The 9 function
definitions to delete.

---

### P6. `<DataTH>` and `<DataTD>` — table cell primitives

**Replaces:** 12 `TH` constants and 7 `TD` constants across table-rendering
pages, and would force density-awareness through the default `padding:
var(--ft-cell-py) var(--ft-cell-px)`.

**Estimated call sites:** [inferred] ~200 `<th>` and `<td>` elements across
the 18 table files. The shadcn `Table` component exists but does not carry
`--ft-*` tokens; these primitives would wrap or replace it.

---

### P7. `.pnum` class adoption

Not a new component — just applying the existing `.pnum` CSS class to the 20
gap-pages identified in §5.

**Sites to fix:** ~400 `formatGbp()` / `.toFixed()` render sites across the 20
gap-pages.

---

### Ranking (occurrences-eliminated per primitive)

| Rank | Primitive | Estimated sites eliminated |
|---|---|---|
| 1 | `<MonoLabel>` | ~600 |
| 2 | `<PanelBox>` | ~366 |
| 3 | `.pnum` adoption | ~400 (class, not component) |
| 4 | `<FtRow>` | ~150 [inferred] |
| 5 | `<PanelHeader>` | ~87 call-sites + 14 function deletions |
| 6 | `<DataTH>` / `<DataTD>` | ~200 [inferred] |
| 7 | `<KpiCell>` | 47 |

P1 (`MonoLabel`) and P3 (`.pnum` adoption) together address the single
largest quality gap: finance values displayed without consistent tabular
figure alignment.

---

## 7. Recommended Proof-of-Concept Page

### Recommendation: `pages/owing.tsx` *(selected; migration complete)*

**Why owing.tsx instead of tax.tsx:**

tax.tsx was initially considered but is one of the best-covered pages: it has
only 4 currency renders (not 17 as previously recorded), 13 inline
`fontVariantNumeric: tabular-nums` occurrences, and 23 `.pnum` usages. Its
typography gap is close to zero. Using it as a POC would demonstrate mostly
`<DataTH>` adoption and little else.

**Data behind the owing.tsx selection:**

| Metric | Value |
|---|---|
| `style={{ }}` occurrences | **239** |
| Local constants to delete | `TH`, `TD`, `INPUT_STYLE` |
| Tables | 2 (`<table>` in received-IOUs, amortization) |
| `fontFamily: --font-mono` inline | **76** |
| Currency renders (`formatGbp` / `formatNative`) | **25** |
| `.pnum` usages before migration | **0** |
| `fontVariantNumeric: tabular-nums` | **0** |

**Why owing.tsx:**

1. **Typography gap is the largest.** 25 currency renders, 76 mono-font usages,
   zero tabular-nums — this page will produce the highest-signal before/after
   for numeric alignment and privacy-mode blur, both of which are visible to
   the user.

2. **Has all five target primitives.** owns `TH`, `TD`, and `INPUT_STYLE` local
   constants (§1b, §1c, §1d); section-header divs matching `<PanelHeader>`;
   surface containers matching `<PanelBox>`; and many uppercase mono labels
   matching `<MonoLabel>`.

3. **Self-contained.** All constants and local patterns are file-local; no
   cross-file ripple when they are deleted.

4. **Medium size.** 239 occurrences and ~2414 lines — large enough to be a
   real stress test, small enough to review in a single PR.

5. **Density mode gap.** Both tables ignore `--ft-cell-py` / `--ft-cell-px`;
   `<DataTH>` / `<DataTD>` introduce the density-token path naturally.

**What the migration proves:** that `<MonoLabel>`, `<PanelBox>`, `<PanelHeader>`,
`<DataTH>`, `<DataTD>`, and `.pnum` can be introduced without changing the visual
output (except numeric alignment and privacy blur), and that the approach is safe
to extend to larger files such as `accounts.tsx`, `reports.tsx`, and eventually
`investments.tsx`.
