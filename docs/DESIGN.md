# Numeris design spec

The single normative description of how a Numeris screen is built. Written
2026-09-05, after the design language had lived for three cycles in commit
messages and task files and every session re-derived it. Each rule carries
its reasoning so it is not relitigated; a session that wants to break one
argues against the reasoning, in the PR, and updates this file in the same
commit.

Precedence:

1. The Anti-Vibe Constitution and the Mobile Amendment at the top of
   `artifacts/finance-tracker/src/index.css` are the founding bans and
   permissions. This file does not repeal any of them.
2. This file specifies what the Constitution leaves open, and resolves the
   one place they collide (ephemeral surfaces, §6). Where this file and the
   Mobile Amendment overlap, **the Mobile Amendment wins below 768px** for
   radius, elevation, typography and rhythm on phone screens; **this file
   wins at 768px and above**; and §7 (numbers) and §8 (overflow) apply at
   every width without exception.
3. `docs/AI-DESIGN-TELLS.md` is the check applied to the output. A design
   that obeys every rule here and still reads as generated fails that check,
   not this one.

Measured where it matters. Figures below marked *measured* were taken from
the repo on 2026-09-05; anything else is the rule, not a survey.

## 1. Panels

A panel is `1px solid var(--ft-border)`, `border-radius: 0`, background
`var(--ft-surface)`, at all times. Not on hover, not only in customize mode,
not only when the panel has a header.

Three implementations exist and are meant to be indistinguishable once
drawn: the `PanelBox` primitive (`components/primitives/panel-box.tsx`),
`.ft-panel`, and `.ft-widget-frame` (both in `index.css`). Use `PanelBox`
in new code. Do not add a fourth.

**Why:** the frame is what says "this is one object". For three cycles the
boxes were drawn at the wrong level — a border around the grid but not the
widget, or around the widget only when hovered — and the page read as an
undifferentiated sheet of numbers. Thomas's first positive reaction to the
desktop was to the frames landing: "the widgets are better to tell apart".
The frame is the hierarchy. Nothing else in this spec is allowed to
substitute for it.

Panel surfaces own surface and nothing else. Layout goes inside via
`HStack`/`VStack`; typography via `Text`/`MonoLabel`. No primitive carries a
`style?` escape hatch (see CLAUDE.md, "The primitives family has a hard
split").

## 2. Section headers

One component: `PanelHeader` (`components/primitives/panel-header.tsx`). It
sits **inside** the frame as the frame's first internal rule.

- Title: `.ft-panel-label` — `var(--font-head)` (Plex Sans), 12px, weight
  600, `letter-spacing: 0.07em`, uppercase, `var(--ft-text)`.
- A 1px `var(--ft-border)` hairline beneath, full width of the panel.
- Height `var(--ft-panel-header-h)` (density-aware).
- An optional right-hand slot for controls and meta.
- **No bullet glyph, no accent dot, no coloured stripe, no raised
  background** in front of or behind the title.

The weight is 600, not 700: the label moved from JetBrains Mono to Plex Sans
and Sans at 700 sits heavier on the page than Mono at 700 did. The register
comes from the case and the tracking, not from the weight.

**The title is the title.** A header label carries the section's name and
nothing else. Meta — the base currency, a count, a date range, a subtitle —
goes in the right slot as dim 9–10px mono, or is dropped. `CASH ACCOUNTS —
Multi-Currency (GBP Base)` is the counter-example: a header doing three jobs
in one string, and the only one on the page doing so. Headers that do
something no other header does are the first thing to remove.

**Why no glyph:** a leading `·` or `◆` in the label was the accent-bar
substituting for hierarchy at a smaller scale. The frame already says "this
is a section"; the glyph restates it and, because it appears in front of
every title, becomes the middot tic `AI-DESIGN-TELLS.md` names.

A header outside a frame — a dim mono label floating above unframed cards —
is not a section header. Either frame the content and use `PanelHeader`, or
accept that the group has no header.

## 3. Rhythm

- ~16px between groups (panel to panel, section to section).
- ~6px within a group (cell to cell, row of tiles to row of tiles).
- Row padding ≠ cell padding ≠ page padding (Constitution: asymmetric
  padding).

**Why:** the asymmetry *is* the structure. A page with one gap value
everywhere has to fall back on colour or weight to show grouping, and both
are banned for that job. Uniform rhythm is also the single strongest
AI-design tell observed in this product (`AI-DESIGN-TELLS.md`, tell 2).

## 4. No coloured stripes on any edge

No left stripe, no top rule, no bottom bar, no coloured border on any side
of a panel, tile, row or card to signal category, status or hierarchy. The
tell is the coloured accent bar substituting for hierarchy, not the edge it
sits on — moving it from left to top does not fix it. Fourteen coloured and
neutral top rules and four conditional left stripes were removed on
2026-09-05 (`aa8e3e4`, `29b77ac`).

Where colour carries meaning (positive/negative, status), it belongs on the
text or on a leading glyph inside the content, never on the frame.

One-off surface treatments that a screen genuinely needs (an alert
background, an accent-tinted border on a dismissable onboarding card) stay
as inline styles at the call site. They are exceptions argued for in place,
not folded into a primitive.

## 5. Tables and grids of cells

`gap: 1px` over a `var(--ft-border)` background to fake cell rules is
banned. Where cells are columns of one table, draw explicit column rules:
`border-right: 1px solid var(--ft-border)` on each cell but the last, and a
`border-bottom` on each row.

**Why:** the gap trick paints border colour through every gap including the
outer edge, doubles up against the panel frame, and breaks the moment one
cell has a different background. Explicit rules are the same pixel count and
survive every theme.

Table header and total rules are 1px, not 2px (`cc81351`).

## 6. Ephemeral and permanent surfaces

Two kinds of surface, and they must look like two kinds.

**Permanent** — anything that *is* the page: panels, tables, tiles, rows,
the shell. Flat, square, `1px var(--ft-border)`, `var(--ft-surface)`. §1.

**Ephemeral** — anything that floats above the page and will leave: toasts,
the undo banner, the install prompt, the AI insight card, popovers, menus,
confirmation sheets. These get **elevation and radius**:

```
.ft-float {
  background:    var(--ft-raised);
  border:        1px solid var(--ft-border2);
  border-radius: var(--ft-float-radius);   /* 6px */
  box-shadow:    var(--ft-float-shadow);
}
```

Plus a dismiss affordance (`×` or a swipe) and, where the surface carries a
message, the message in `var(--font-head)` at 12–13px — prose, not a figure.
A figure inside an ephemeral surface still obeys §7.

This is the one place this spec touches the Constitution's bans. The
Constitution bans radius and shadow "on data containers" and "on any element
that displays financial data"; both bans were written to stop panels and
tiles going soft, and they succeeded. They were not written about a toast
that says "Net worth has crossed £100K" and leaves four seconds later. The
Mobile Amendment already permits elevation on floating surfaces below 768px;
§6 extends the same permission to desktop, and only to surfaces that float
and leave. A panel that adopts `.ft-float` to look important is a violation
of §1, not an exception under §6.

**Why:** Thomas, on the AI insights card: "should be seen as a widget more
like something temporary that popped in, so we gotta make it look like
that." He raised the same point about toasts and the install prompt weeks
earlier. Until 2026-09-05 all four were drawn exactly like the panels around
them, so a reader could not tell what would still be there after a reload.

## 7. Numbers

- Every numeric value is `.pnum`: `var(--font-mono)`, `tabular-nums`,
  `white-space: nowrap`. No exception for percentages, dates in a column,
  or counts.
- **A financial figure is shown in full or not at all.** No ellipsis, no
  `overflow: hidden` crop, no CSS clip on a number. `£11,371` clipped to
  `£1…` reads as £1. Below a width threshold, render the label alone or the
  value alone — never a half-visible figure. (CLAUDE.md, hard constraint.)
- **Never prefix a sign glyph to a value the formatter already signed.**
  `formatSignedMoney(-42)` yields `-£42.00`; writing `-{formatSignedMoney(
  -42)}` yields `--£42.00`. Every glyph-prefixed formatter argument is a
  magnitude (`Math.abs`). Lock #19 (`lib/sign-glyph.lock.test.ts`) enforces
  this.
- Native currency first, converted second, on every foreign value; the
  converted figure is smaller and dimmer and carries the `fx` provenance
  mark where the rate came from a computed source.
- A missing value renders as `—`. A number the API did not supply is never
  shown (CLAUDE.md: no fallback data in any form).
- Colour is semantic only: green positive, red negative, accent
  interactive. Gain/loss legibility never depends on hue alone — the sign or
  the glyph carries it too.

## 8. Overflow

Overflow is a class of defect with one rule, not a list of bugs.

Two kinds of content, two behaviours:

**Names may give.** Account names, merchant strings, category labels,
descriptions: `.ft-truncate` (single line, ellipsis, `min-width: 0`) inside
a flex or grid cell. A name that truncates has lost nothing a user cannot
recover by hovering or opening the row.

**Numbers may not give.** A `.pnum` in a cell gets `flex-shrink: 0` and a
slot that is guaranteed to hold the widest value the screen can show. The
slot gives, the digits do not. Concretely, in priority order:

1. **Reserve the width.** Size a numeric column from its content
   (`grid-template-columns: … auto` or `minmax(<widest>, auto)`), or give
   the number `flex-shrink: 0` and put the `min-width: 0` on the *name*
   beside it so the name yields first.
2. **Wrap the container, not the number.** A tile with label and value
   stacks them; a row with name and value lets the name truncate; a KPI
   row lets tiles wrap to a second line before any tile shrinks below its
   value's width.
3. **Drop the label, keep the value.** Below a width threshold the tile
   shows the figure alone (the label is recoverable from position and
   context; the figure is not).
4. **Drop the value.** If even the figure cannot fit, render nothing in that
   slot — never a fragment.

Fixed pixel widths on a numeric column are allowed only when the widest
value the column can carry has been checked against them. `width: 130px`
holds `£1,234,567.89` at 12px mono; it does not hold `RM 12,345,678.90`
with a converted line beneath. The 7-figure balance and the 5-character
currency code are the test cases, not the 4-figure ones the seed data
happens to contain.

The shared protection already in `index.css` (`.ft-truncate`, `min-width:
0` on flex/grid children, `.pnum { max-width: 100%; white-space: nowrap }`)
stops bleed-out; it does not by itself stop collision. The call site does
that with the four steps above.

## 9. Accounts and transactions, specifically

The two densest pages follow every rule above with two additions:

- A table row carries **one number per numeric column**. A native balance
  cell holds the native balance; an age, a sparkline, a health flag each get
  their own column or leave the row. Stacking a caption under a figure
  inside a right-aligned numeric cell is what made the accounts table
  "messy and hard to read".
- **Type and status are text, not boxes.** `INCOME` / `EXPENSE` /
  `TRANSFER` as coloured uppercase 9px mono, no border, no fill. A bordered
  coloured badge per row is a second frame competing with the panel frame,
  and forty of them in a ledger is the "outdated" look.

## 10. Checklist before shipping a screen

- Every group is inside a 1px square frame (§1) with at most one
  `PanelHeader` (§2), title only, no glyph.
- Gaps are 16 between groups and 6 within (§3). Nothing else.
- No coloured edge anywhere (§4). No `gap: 1` over border (§5).
- Anything that will leave the page has `.ft-float` and a dismiss (§6).
  Anything that will not, does not.
- Every number is `.pnum`, unsigned magnitude behind any glyph, `—` when
  missing (§7).
- Widen the seed data in your head to a 7-figure balance and a 5-letter
  currency code; nothing collides (§8).
- Read `AI-DESIGN-TELLS.md` once more against the screenshot, not the code.
