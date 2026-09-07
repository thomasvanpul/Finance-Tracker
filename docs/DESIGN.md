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
- **Per-row labels are text, not boxes.** Type, status and category —
  `INCOME` / `EXPENSE` / `TRANSFER`, `ACTIVE` / `DORMANT`, `Groceries` — as
  uppercase or mono 9px text, coloured where colour carries meaning, with no
  border, no fill and no radius. A bordered badge per row is a second frame
  competing with the panel frame, and forty of them down a ledger is the
  "outdated" look. A box is reserved for something the user can press; a
  label that only reads is drawn as a label.

## 10. Type: mono is for data, sans is for language

Two families, one question to decide between them.

**Ask: would replacing this text with different text of the same length
change how it reads against its neighbours?** If yes — because it lines up
in a column, or a reader compares it digit by digit against the row above —
it is data, and it is `var(--font-mono)`. If no, it is language, and it is
`var(--font-sans)`.

**Mono** — every number (§7 already requires this), currency, percentage,
date, time, duration, ticker, ISIN, commit sha, route path, env var name,
keyboard shortcut, and the short uppercase legend directly above or beside
a figure. Column headers over a numeric column are mono because they are
part of the column. `PanelHeader`, `MonoLabel` and `.pnum` are the three
places this is already correct; prefer them over writing the family by hand.

**Sans** — sentences, and anything read as language rather than scanned as a
value: navigation and menu items, button and tab labels, form field labels,
placeholder and help text, empty-state copy, error and validation messages,
tooltip prose, dialog body copy, section descriptions, and every name a
human wrote (account, merchant, category, goal, person).

**Why.** Monospace earns its place by making a column of digits comparable —
each glyph the same width, so the eye reads position as magnitude. Applied
to a sentence it buys nothing and costs legibility: proportional spacing is
what makes prose scannable, and monospaced prose reads as decoration, which
is exactly the "terminal cosplay" tell `AI-DESIGN-TELLS.md` warns about. The
instrument argument survives only if mono means something. When everything
is mono, nothing is.

**The failure this section was written against.** The desktop sidebar draws
its navigation labels in sans. The settings rail draws the same thing — a
vertical list of single-word destinations — in mono. Same element, same job,
two families, on two screens a user moves between in one click. The
inconsistency is the defect; the count is only how it was found.

Two things a passing glance gets wrong, so they are written down:

- **A short uppercase label is not automatically mono.** `MONTHLY SPEND`
  above a figure is mono, because it names that column. `Weekly Digest` in a
  settings menu is sans, because it names a destination.
- **A word inside a table cell is not automatically mono.** A merchant name
  in a ledger is language; the amount beside it is data. The row carries
  both families, and that is correct.

## 11. Colour: one interactive accent, and a categorical ramp that stays back

`--ft-accent` is the interactive accent, per theme, and the only colour that
means *you can press this*. Active nav item, selected tab, primary button,
focus ring, the current value in a segmented control. It is user-overridable
in Settings; every theme sets its own.

`--ft-green`, `--ft-red`, `--ft-amber`, `--ft-blue`, `--ft-cyan` are the
**semantic ramp**. Green and red carry sign. Amber carries warning. Blue and
cyan are categorical only — a series line, a type badge, an identity — and
they carry no affordance. They are ranked *below* the accent and below
gain/loss: an informational colour must not shout as loudly as a number that
tells the user they lost money.

**A categorical colour never becomes an interactive one.** If a control is
pressable, selected, or current, it is `--ft-accent`. This is the rule the
codebase broke: `/owing` and parts of `/investments` used `--ft-blue` for
primary button backgrounds, active tab underlines and selected-period
chips, which gave the product two accents — gold on most screens and a
generic blue on those. A user cannot learn "this colour means press" if the
colour changes per screen.

**Tints and hovers follow the theme.** Never write a hardcoded `rgba()` for
an accent tint or a hover wash. `rgba(244,162,30,…)` is a previous accent
that no longer matches `--ft-accent` and does not change on any of the
fourteen themes; `rgba(255,255,255,0.04)` is invisible on the four light
ones. Use the derived tokens, which are defined once from `--ft-accent` and
`--ft-text` and therefore correct on every theme:

    --ft-hover          a wash for a hovered row or button
    --ft-accent-tint    the fill behind an active or pinned item
    --ft-accent-edge    the border of that same item

## 12. The sidebar

The desktop sidebar is a navigation list, so §10 applies to it directly:
labels are sans, the section headings (`CORE`, `INVEST`, `PLAN`) are mono
uppercase because they are legends, and the net-worth figure in the footer
is `.pnum`.

Beyond that it follows the same rules as any other surface, with two it is
especially prone to breaking:

- **The active item is `--ft-accent-tint` with an `--ft-accent-edge`
  border** (§11), not a hardcoded gold. Hover is `--ft-hover`, not white
  alpha. Both must be visible on `arctic`, `linen`, `parchment` and `slate`.
- **No coloured left edge on the active item** (§4). The tint and the label
  weight carry the state. A 3px accent bar down the side of a nav item is
  the single most cited AI-design tell.

The collapsed rail shows icons only and keeps the same tint rules; the
width is user-set and persisted, so nothing may assume a fixed value.

## 13. Checklist before shipping a screen

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
- Every run of words is sans and every value is mono (§10). No sentence
  is monospaced.
- Nothing pressable is `--ft-blue`; nothing informational is `--ft-accent`
  (§11). No hardcoded `rgba()` tint or hover anywhere.
- Every figure the screen computed from rows opens those rows, and does it
  through `Drill` / `entityHref` (§14). Every figure that is not made of
  rows is flat.
- Every control on the screen changes what is on the screen (§16). Tick it,
  type in it, pick from it — if the pixels do not move, it does not ship.

## 14. A figure computed from rows is a button

**A number the app worked out by adding up rows is a way into those rows.**
Pressing `TOTAL CASH` opens the accounts it is the sum of. Pressing a
category on a transaction opens that category's transactions. Pressing a
merchant opens that merchant's history. Pressing an account name anywhere in
the product opens the same account detail.

This is the difference between a report and an instrument. A report states a
figure and stops; an instrument lets you take the figure apart. The question
a user has when they see a total they did not expect is always the same —
*what is this made of* — and every screen should be able to answer it
without a search box.

**Where a figure is not made of rows, it is not a button.** An FX rate, a
market quote, a projection, a percentage of a whole, a user-entered setting,
a count of days — pressing those has nothing to open, and drawing them as
pressable is worse than leaving them flat, because it teaches the user that
the affordance means nothing.

### The mechanism

One convention, three files, no second implementation:

- `lib/entity-href.ts` — `entityHref(kind, id)` for an entity's detail, and
  `transactionSearchHref(query)` for a query over rows. Every destination
  goes through here so a parameter name lives in one place.
- `components/detail-surface.tsx` — `DetailSurface` opens that detail from
  the query parameter, on the entity's own list screen rather than a new
  route (CLAUDE.md: a new URL is a claim that this is one of the ~20 things
  a user looks up by name).
- `components/drill.tsx` — `Drill` (navigates, renders an `<a>`) and
  `DrillButton` (opens a surface on the current screen, only where there is
  genuinely no href).

### The affordance

`.ft-drill`, and only `.ft-drill`.

- **At rest**: a 1px underline in `--ft-border2`, 3px clear of the baseline.
- **Hover and keyboard focus**: text and underline both `--ft-accent` (§11 —
  the accent is the only colour that means *you can press this*).
- **No box, no chip, no fill.** §9 reserves a box for a control the user
  presses in place; forty boxes down a ledger is the "outdated" look. A
  drill is a route into rows, not a control.
- **Solid, never dotted.** Dotted is this product's mark for a figure that
  has not happened yet. A drillable number is as real as any other, and
  reusing the mark makes both unreadable.
- **Visible at rest, not hover-only.** A phone has no hover. An affordance
  that only announces itself to a mouse is a secret on half the app's
  surfaces.
- On a phone the class adds vertical padding with a cancelling negative
  margin, so the hit area reaches 44px without moving the line box.

A drill inside a pressable row stops the click reaching the row. The drill is
the more specific target: pressing a category inside a transaction row means
"show me this category", not "open this transaction".

### Charts are excluded, deliberately

A bar, a pie slice, a Sankey node and a plotted point are all figures
computed from rows, and none of them takes a drill. `Drill` renders an
anchor; an anchor is not valid inside `<svg>`, and the workaround —
an `onClick` on the shape — produces a target with no underline, no focus
ring, no keyboard route and nothing in the status bar. That is precisely the
secret button this section exists to prevent: pressable to a mouse that
happens to try it, invisible to everyone else.

So a chart's *legend*, *summary strip* and *table beside it* carry the
drills, and the plotted geometry stays inert. Where a chart is the only
place a figure appears, add the row it summarises rather than making the
shape clickable. Revisit this only if the drill affordance gains a form that
survives inside SVG.

### Two rules the first full sweep produced

**A drill that lands where you already are is a dead affordance.** The same
figure can be drillable on one screen and flat on another, and that is
correct, not an inconsistency. `TOTAL CASH` on the dashboard's accounts
widget opens `/accounts`, because the accounts are not on the dashboard. The
same `TOTAL CASH` on `/accounts` stays flat, because the rows it sums are
already on screen under it. Likewise the `WORTH` headline and its section
subtotals on the phone, the header totals on `/transactions`, and a
calendar day's net — pressing the cell already reveals that day's list.
Applying §14 mechanically to every total produces buttons that reload the
screen you are standing on, which teaches the affordance means nothing just
as surely as putting it on a percentage does.

**Where the rows may not exist, no drill.** A subscription is a record the
user typed, not a figure the app computed, and "Netflix" need not match the
ledger's `NETFLIX.COM 1234`. `/subscriptions` therefore drills a
subscription's name only where the page has already found charges matching
it, and leaves it flat otherwise. The test is not "could this plausibly have
rows" but "has this screen already proved they exist". A drill that opens an
empty list is a promise the product did not keep.

**A figure of zero is the same case, and it is easy to miss.** Zero is a real
sum — it prints, and it is not an em dash — but it means the ledger holds no
rows for that window, so the figure stays flat. This was live on four screens
before it was looked for: `/briefing`'s MONTHLY INCOME, the dashboard cash-flow
strip's INCOME, three cells on `/reports` and one on `/calendar` all offered a
drill into an empty September. Null, zero and non-zero are three states, not
two: null prints `—` and takes no drill, zero prints the figure and takes no
drill, non-zero opens its rows. `pages/reports.tsx`'s `FigureCell` is the
shape.

### The affordance has one mechanical trap

A `text-decoration` is painted only on text in the decorating box's own inline
flow. It is **not** painted on the contents of an atomic inline-level
descendant — and `span.pnum`, which nearly every figure in this app is wrapped
in, is `display: inline-block` so the number honours `max-width` and sits on
the baseline. So `<Drill><span className="pnum">£230,800.21</span></Drill>`
draws no underline at all: the drill is wired, it navigates, and it is
invisible.

Measured across nine desktop routes on 2026-09-07, before the rule below
existed: **21 of 268 drills drew nothing**, and they were the headline figures
— all five on `/briefing`, the `WORTH` total, five of fifteen on `/reports`,
four of twenty on `/accounts`. The affordance was most absent exactly where it
mattered most, and it is invisible to code review because the markup is
correct.

`index.css` closes it with `.ft-drill > *` re-declaring
`text-decoration-line/-color/-thickness` as `inherit`, so the hover and focus
rules still reach the child through the parent's computed value. Direct
children only, and that is measured safe rather than assumed: across the same
268 drills there was no in-flow inline child whose font-size differs from its
drill, which is the one case where a second underline would sit at a different
offset and step. **A drill that mixes type sizes on one line needs this
checked again.**

The general lesson is not about CSS. **An affordance that is wired is not an
affordance that is visible, and only a screenshot tells you which you have.**

## 15. The insight slot says one thing, and only if the user can act on it

The slot is `components/phone/InsightSlot.tsx`; the selection contract is
`lib/spending-insights.ts`. One insight or nothing — every producer returns
`Insight | null`, all non-null results are ranked by priority, and the top one
renders. Empty is the common case and it is correct, not a failure.

### An insight the user cannot act on is not an insight

This is the rule, and it has now been derived three times, so it lives here.

It killed the big-day spending alert: *"you spent more on Saturday than any
other day"* is true, is a real statistical fact about the rows, and there is
nothing to do about it — Saturday has already happened.

It killed *"an account with a balance but no transactions, so it cannot be
reconciled"* (2026-09-07). Also true. It fires forever on exactly the accounts
where it is correct and unfixable — a pension, a property, a loan. In the
current data set that is 85% of net worth, triggering on day one and every day
after, about a state the user cannot change.

**An insight the user can never resolve is a permanent nag, and a slot that
nags stops being read.** Once it stops being read, every future insight in it
is wasted, including the ones that were worth saying. That is why the bar is
this high for a surface this small.

The test, in order:

1. **Is it true?** Not "is the arithmetic right" — is the claim honest given
   what the app actually knows. If the figure needs a baseline the app does not
   hold, the answer is silence, never a synthesised one.
2. **Can the user do something about it?** If not, it does not go in the slot.
   It may still belong on a screen as a fact.
3. **Will it stop?** An insight that re-fires every month on an unchanged
   situation is the same nag arriving by instalments. Either it needs a
   recurrence gate, a permanent dismissal, or it is not an insight.
4. **Would you say it out loud?** A slot is a sentence a product says to a
   person. "Your Saturday spend is 18% above your Wednesday spend" is not a
   sentence anyone says.

A producer that cannot answer all four is a panel that fires on trivia, and a
panel that fires on trivia is the insight slot crying wolf.

### The slot is one line each, and it does not wrap

`InsightSlot` renders the headline and the body with `white-space: nowrap`
and `text-overflow: ellipsis`. Nothing wraps and nothing grows — an overlong
sentence is cut mid-word, and the reader is left with a half-claim. Measured
on the rendered phone screen at 390px, 2026-09-07: **about 32 characters for
the headline, about 45 for the body**.

Three producers were written past that and truncated in place — *"3 accounts
up £798.64 since 8 Aug without y…"*. Two consequences, both design rather
than styling:

- **The direction belongs in the headline.** *"£798.64 of the move was the
  rate"* reads identically whether the rate rose or fell, which is the one
  thing the sentence exists to settle. *"The rate added £798.64"* does not.
- **The body carries the where and the when, not a second sentence.** If a
  producer needs two sentences it is saying two things, and §15's first rule
  is that the slot says one.

### Silence is a statement

Where a producer's data is missing rather than uninteresting, it returns null
and the slot renders nothing. It does **not** say "not enough data yet" — the
screen that owns the subject says that, in the place where the limitation
matters. `lib/reconciliation-insight.ts` is the worked example: below the
minimum history it is silent, and the desktop `/accounts` panel is where *"No
balance snapshot has been taken"* is said.

The same applies to a zero result. A reconciled ledger is not an insight; the
slot exists for what Numeris does not know, and a gap of zero is not that.

## 16. A control that does nothing is a lie

**A control that does not change what the user sees is a lie, and shipping
one costs more trust than the feature was worth.**

This is not a style rule. A checkbox, a field, or a toggle is a promise that
the app is listening. When it is not, the user does not conclude "that one
control is unfinished" — they conclude the app is a picture of a finance
tracker rather than a finance tracker, and they are right to, because they
have no way to tell which of the other controls are real. One dead control
discredits every live one on the same screen.

It has happened three times here:

- **The onboarding bank question.** Asked which bank the user was with,
  stored the answer, and nothing ever read it. No connection was attempted,
  no default was set, no copy changed.
- **The category emoji field.** Accepted an emoji per category and saved it.
  Nothing rendered it — correctly, since §10 and the no-emoji constraint in
  `CLAUDE.md` forbid it — so the field was asking for something the design
  had already ruled out.
- **`SL` on the transaction row.** A per-row split control writing to
  `ft-tx-splits` in `localStorage`. The split amounts reached no total, no
  category, no export and no server. Only the presence badge rendered, so
  the row could say a split existed while the split itself did nothing.

The shape is always the same: a write with no read. That is what makes it
findable — grep for every `localStorage.setItem` key and ask which read path
consumes it. A key that is only ever written is a control that only ever
pretends.

### The two honest endings

A control in this state has exactly two futures, and "leave it, someone will
wire it up" is not one of them:

1. **Make it real.** The read path lands in the same change as the write. Not
   the next PR — the same one, because a half-landed feature is
   indistinguishable from this defect from the outside.
2. **Take it out.** Remove the control, the writer, and the key. Removing a
   dead control is not a regression and does not need a deprecation path;
   nothing downstream can depend on a value nothing reads.

Deleting is the default. A feature worth finishing will be asked for again;
a lie on the screen is charged for every time the screen is opened.

### What this does not cover

A control whose effect is real but currently empty is not this. A filter that
matches nothing still moved the list to nothing, and the empty state says so.
The test is whether the screen responded, not whether the response was
interesting.

