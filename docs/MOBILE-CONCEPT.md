# Mobile design direction

Decided 12 Aug 2026, after seven rejected attempts across three tools.

## The direction

**Terminal DNA, reference-level craft.** The phone speaks the same language as
the desktop — a Bloomberg-style financial terminal — executed with the spacing,
alignment and type discipline of a modern consumer app.

Desktop and mobile stay one product. Desktop may drift slightly toward the
mobile execution, not the reverse.

## Why the earlier attempts failed

Two separate causes, and conflating them cost several rounds.

**Rounds 1-2 (chat mockups)** and **round 7 (Claude Design, card style)** failed
because they were *generic*. Round 7 was well crafted and still read as a
template: dark rounded cards, one neon accent, gradient area chart, greeting with
avatar, floating pill nav with a bright centre FAB. Every one of those elements
appears in the reference set that inspired it. The reference apps are
interchangeable with each other, so matching them cannot produce something
distinctive.

**Rounds 3-6 (terminal directions)** failed on *craft*, not concept:
- the `=` column landed at a different x on nearly every row
- words collided: `+2,570MTD`, `83%MO`, `RENT5D`, `+56.72IN`
- type ran at 8-11px with no hierarchy
- 40-50% of the screen was empty below the content
- the top status strip was clipped on all nine frames
- 7 nav items at 390px, below tappable size
- no primary action on any screen

None of those is an argument against a terminal. They are execution defects.

## The synthesis

A real Bloomberg terminal is dense *and* immaculately aligned, and it is full of
sparklines, heat colouring, colour-coded columns and per-row identity. The
reference apps taught spacing, type hierarchy, alignment discipline, row
identity, real charts and depth. Those lessons apply to a terminal.

Nobody ships a terminal on a phone. That is where the uniqueness comes from, not
from styling borrowed off Dribbble.

## Craft requirements, non-negotiable

- Fixed-width label columns. Values align down the screen, always.
- A real type hierarchy: primary number 28px+, not everything at 10px.
- Sparklines and micro-charts. Terminals are full of them.
- Per-row identity: account glyph, merchant mark, counterparty initial.
- The screen fills. No dead band at the bottom.
- Whitespace is permitted and wanted. Dense does not mean cramped.
- Depth only where it aids scanning.
- 44px touch targets, thumb-reachable primary action, safe areas.
- Tabular figures on every number in an aligned column.
- Must survive all 11 themes including light (`arctic`).

See the Mobile Amendment in `index.css` for the full rule set. Note the
amendment *permits* rounded corners, gradients and sans display type; this
direction largely declines them. Permission is not obligation.

## Parked

**"An installation you maintain"** — Clash of Clans' tending loop applied to
finance. Died on a fair objection: if servicing objects is the mobile loop it has
to exist on desktop too, or the platforms diverge in behaviour rather than
layout. Worth revisiting as a cross-platform feature, not as a mobile shell.

---

## Parked spines — content-level differentiation

Four ways the app could be organised that Bloomberg structurally cannot copy.
Not chosen yet; worth keeping.

**Forward time.** Bloomberg cannot know tomorrow's price. This app can: rent
leaves on the 17th, salary lands on the 28th, six subscriptions renew on known
dates. A terminal organised around a forward curve rather than a historical one.

**People as instruments.** `JM` and `PT` are already ticker-shaped. Treat
counterparties as positions held in humans — a receivables book with ageing,
exposure per person, settlement history. Every finance app buries "who owes me"
in a sub-page.

**Books and scopes.** `/business`, `/family`, `/trading` already exist, as does
the persona system. A life runs several books at once; a trader switches desks.
Scope as the top-level control rather than a setting.

**Decision surface.** The decision engine already exists. A terminal that
proposes rather than only reports — rows carrying a suggested action and its
modelled impact, so the screen argues a position instead of listing state.

---

## Product decisions — 13 Aug 2026

After nine design rounds failed to produce "feels special" or "makes me want to
come back", the diagnosis: **visual design cannot create return frequency.**

All four reference apps (Instagram, Reddit, Clash of Clans, Yahoo Finance) share
one mechanism: something changes without the user doing anything, driven by other
people or the outside world. Numeris currently changes only when its single user
logs something. That is a content problem, not a UI problem.

All three of the following are approved to build:

**1. Market, FX and news.** Alpaca is already wired; the app already holds
multi-currency positions across Wise, Revolut and Maybank. Markets, FX and rates
move daily and genuinely affect the position. The market and news panes in the v7
design are the only elements on that screen that will differ tomorrow morning.

**2. Other people.** Split and owing is currently a ledger. Make it social:
request, settle, add a shared expense. Then another person's action puts
something on the user's screen without the user doing anything.

**3. Progression.** XP, theme unlocks and bot skins already exist
(`lib/learn-xp.ts`) and are decoration. Make the layer mean something.

Constraint carried from earlier: never reward spending, never manufacture
urgency, every countdown is a real date.

**Design status:** v7 approved on craft. Design exploration continues in breadth
rather than depth — many divergent takes at once rather than further refinement
of one screen.

---

## The Numeris signature — 13 Aug 2026

A UI is recognisable because of one device repeated everywhere until it becomes
the product's mark, not because of a whole system. Bloomberg's amber-on-black.
Monzo's coral card. Robinhood's scrubbing line.

The v7 design had no such device — mark tiles, sparklines, hairline column
headers and the type ladder are all borrowed. That is why it read as Bloomberg.

Three signature devices, all drawn from things structurally true about this app
rather than invented. They occupy different jobs and do not conflict.

### 1. Dotted means not-yet-real
Solid means it happened. Dotted means it has not yet. Applies to projected
balances, the chart tail past today, pending transfers, uncategorised amounts,
scheduled rows, forecast values. One rule, on every screen, immediately legible.

No other finance app can do this consistently because no other finance app knows
its own future — rent, salary and subscriptions have known dates here.

**Dotted is about existence, not about completion.** A debt IS a real thing
regardless of whether it has been settled. An expense IS a real thing whether or
not the money has cleared. The mark says "this event has not happened yet in the
world" (a future rent payment, a projected balance, an upcoming subscription
renewal) — never "this happened but is not resolved yet". Reach for dotted on
"unsettled" and you have picked the wrong signature. Use the appropriate status
tag (SETTLED / PENDING / OPEN etc.) for completion state.

### 1a. Zero and loading are not the same reading
A row with a genuinely-zero value (`£0.00`, `0%`, a bar with no fill) must not
share its rendering with the loading state (skeleton, spinner, absence). The
zero is real information; the loading is temporary absence. On the dotted
signature specifically, a bar at 0% shows an all-dotted rule (the whole tail is
not-yet-real), and its numeric label reads `£0.00` explicitly — not a blank, not
an em-dash, not the skeleton bar. Loading state renders the row shape but
replaces the value with a skeleton block, so the eye reads "still coming" rather
than "zero".

Rule: any screen using the dotted signature at zero must handle both states
distinctly, and the distinction is the same everywhere — literal zero in the
label + all-dotted bar for zero; skeleton block + no dotted rule for loading.

### 2. Every value carries its native currency
Positions span GBP, MYR and EUR across Wise, Revolut and Maybank. Foreign values
render as a permanent two-part treatment (native, then converted), everywhere,
not just in the Atlas. UK finance apps do not do this because they are
single-currency.

### 3. The formula mark
The sign-in screen speaks `fx =NUMERIS.SIGN_IN()`. It is the only genuinely
original element in the product. Used as a *provenance device* rather than as an
organising metaphor: the formula bar states where a figure came from, in the
app's own syntax. "Show the working" under £289 is literally
`=SPEND.SAFE(TO 17 AUG)`.

A full spreadsheet metaphor fails on a phone. A single formula line as the
product's mark is a different proposition and survives.

---

## Resolution — 13 Aug 2026

After fourteen design rounds, the structure settled:

**The home screen is v7** — the dense Bloomberg-lineage terminal. Not replaced.
Perfected. Density may come down slightly but the character stays.

**The geometric explorations become detail pages, not the home.** Each maps to
an existing route:

| Design       | Idea                                                    | Route |
| ------------ | ------------------------------------------------------- | ----- |
| The Level    | Money as a column; committed sediment, waterline is free | `/budget` / safe-to-spend |
| The Horizon  | Terrain ahead; elevation is balance, dips are bills      | `/cashflow` |
| The Balance  | Two pans; owned against claimed, tilt is the net         | `/net-worth` |
| The Dial     | The month as a ring; angle says when                     | month view |
| The Deck     | One question per full-bleed card, swiped                 | `/year-review`, month-so-far |

**The connecting idea: each home pane carries a miniature of the geometry of the
page it opens.** The budget pane holds a small Level, the cashflow pane a small
Horizon, the net worth pane a small Balance. Same density, same terminal
discipline, but panes stop being interchangeable — which was the strongest
AI-tell in the design — because each pane's shape now means something, and
tapping it expands the shape already being looked at.

The Dial's failure is worth keeping in mind for all of them: two concentric
rings doing unrelated jobs, labels radiating at four angles with no reading
order, and a circle with no natural start. **One shape, one meaning.** If a
shape needs a legend it has failed.

---

## Approved direction — 2C, extruded area

Decided 13 Aug 2026 after 21 rounds. The first design accepted without
qualification.

**Extruded area.** Holdings drawn as proportional blocks — area encodes value,
`1px² = £1.09` — with a constant 10px decorative depth on every block. Depth is
styling and encodes nothing.

This came from correcting the earlier isometric version, which used depth to
encode value and was unreliable for five reasons: tall solids occlude short ones
so an account can vanish; volume cannot be compared by eye and perspective
shrinks distant objects, so the encoding lies; at true proportion a £102 account
next to a £94,600 flat is an unlabellable sliver; negative value has no volume,
so liabilities cannot be solids; and isometric shading needs three face tones
surviving eleven themes including a light one.

The fix, and the rule going forward: **dimensionality is styling, never data.**
Value is encoded by length or area — flat, measurable, honest. The look is
retained, the failure modes are not.

Liabilities are outlined with no depth — a claim is not material you hold.
Cells narrower than 24px cannot carry a label and collapse into a `+n` cell.

### Next: the view switcher

The user chooses how their wealth is drawn — blocks, charts, graphs, 3D models.
This is a real feature, not a preference toggle, and it gives the earlier
geometric explorations (Level, Horizon, Balance, Dial) a home as alternative
renderings of the same data rather than as separate pages. It also connects to
`MobileWidgetManager`, personas and the eleven themes, all of which already
exist and are unused on mobile.

### Also outstanding on this design
- Footer redesign. The current HOME / FLOW / HOLD / PAY / ALL 37 is wrong, and
  "ALL 37" should not be a footer item.
- Proper routes to the other tools from the home screen.
- Formatting pass across the whole screen.
- Port to desktop once the phone version is settled.

---

## Approved — 13 Aug 2026, second pass

**View switcher.** BLOCKS / BANDS / RING as user-selectable renderings of the
same position. 1B (full-bleed month field), 2A (extruded field) and 2B (side
elevation) are kept as further options rather than discarded. All renderings
encode value by length or area only; depth is always decorative.

**Footer.** HOME / MONTH / MOVE / FIND. Four slots, each a thing you *do*
rather than somewhere you read. ALL 37 is gone — a directory is not a
destination. FIND is the door to everything else; its empty state is the full
list, grouped, so a stranger reaches any of the 37 in two taps and a regular
types three letters.

**Routes.** Every section header links to its tool (Holdings, Cashflow, Budget,
Accounts, Month, Split). The home scroll ends in a short named list —
Investments, Goals, Subscriptions, Currency — carrying live values, so it reads
as news rather than a grid of tiles.

**Number rule.** Separators always. Two decimals when the figure is a fact you
could reconcile (balances, transactions, claims, the headline). No decimals when
the figure is a shape (labels inside a graphic, axis ticks). Negatives take a
true minus before the symbol, never brackets, never colour alone. Foreign
holdings read native first, converted second, never converted alone. In aligned
columns the symbol is dropped and stated once in the column header; figures are
tabular and right-aligned.

**Customisation.** Onboarding selects the starting configuration and it stays
changeable. Scope of what onboarding sets is still open — see below.

**Desktop.** Must be brought in line. Not yet specified.

---

## Desktop port — what carries and what does not (16 Aug 2026)

Recorded after the two-page pilot on `pages/investments.tsx` and
`pages/analytics.tsx`. The `desktop and phone are one product` rule in
TARGET-PRODUCT.md means the mobile language must ship on desktop too;
this section is the specification for how each device translates so the
next port doesn't rediscover the same friction.

### Ports directly

- **Hairline structure** (1px `--ft-border` grid lines between KPI cells,
  between rows, at panel edges). Reads correctly at 1440px because the
  hairline is a structural device, not a proportional one.
- **The number rule** — separators, tabular figures, two decimals for
  facts, no decimals for shapes, true minus, native-first — is width-
  independent and carries across without change.
- **Primitives** — HStack / VStack / Text / MonoLabel — carry across.
  The same `<HStack align="baseline" justify="between">` used on
  MobileHome works for the KPI header on `/portfolio`.
- **Type ladder as a *shape*** — one primary figure per pane, plus
  secondary rows — carries. The mobile home has one 34px NET WORTH,
  everything else at 11–14px; the desktop equivalent needs one
  primary cell (Portfolio Value on `/portfolio`) and the rest at
  secondary weight. Before the pilot, all six KPI cells ran at
  `clamp(13px, 1.4vw, 18px)` — no ladder, nothing to fix on.
- **The "no fabricated number" invariant** — no truncation, no
  ellipsised figures, no synthesised zeros — is a shared constraint,
  not a language choice, and applies identically on both viewports.
  The pilot found live truncation violations on both pages
  (`.ft-kpi-bar-cell-value` in index.css; `AnalyticsKpiCell` value
  span in `pages/analytics.tsx`). Both fixed in the same pass.

### Ports with `min(vw, cap)` scaling

- **The premium tier figure.** Mobile fixes NET WORTH at 34px against a
  390px column; that same 34px on a 240px-wide KPI cell inside a 1200px
  content area reads *smaller* than it does on the phone. Use
  `clamp(24px, 3.2vw, 34px)` for the primary tier so a 1440px desktop
  gets 46px worth of screen and mobile stays at 34px. Do not carry
  absolute pixel sizes across viewports without a clamp.
- **Column widths on aligned tables.** Mobile fixes them because it
  knows the container; desktop tables live inside a page column of
  variable width. Use `minmax()` on grid tracks or explicit `min-width`
  on the label / percentage / figure columns so the layout can't crush
  a currency figure below its readable width.

### Does NOT port

- **Two-level column headers** — the mobile pattern of stacking
  `SPEND BY CATEGORY` above a `SHARE · £` sub-header row works because a
  phone table has three columns of known meaning. The desktop
  positions table has ten (TICKER, NAME, SHARES, AVG COST, CURRENT,
  VALUE, P&L, P&L %, WEIGHT, ACTIONS). Stacking a `native · converted`
  header under every currency-bearing column fragments the horizontal
  read. Two-level headers stay a phone-only device unless the desktop
  table has ≤4 columns.
- **Block fields sized for a phone.** `BlockField` in
  `components/primitives/block-field.tsx` fixes `AVAILABLE_W = 354` and
  `FIELD_H = 132` — numbers chosen for 390px. Dropping the same block
  field into a 1200px column either stretches every tile into a hero
  card or leaves 850px of empty gutter on the right. Two paths for
  desktop: (a) add a `preferredWidth` prop that lets each caller choose,
  or (b) build a desktop-only block field that composes over a wider
  grid. Do not ship the mobile component into a desktop pane unchanged.
- **`READING THE DATA` and its cousins.** The amber-tinted onboarding
  banner on `/investments` (`◈ Portfolio — Reading the data` at line
  ~2221) exists because desktop distrusts the reader. Mobile does not
  carry these. Delete on port; do not add new ones. Tone divergence
  isn't fixable via the primitives family — it lives in copy.
- **Rainbow-coloured KPI accent stripes.** `AnalyticsKpiCell.accentColor`
  was a per-cell red/amber/blue/muted stripe — the constitution's
  "rainbow ratings" pattern. Colour was not encoding rank. Deleted in
  the pilot; do not reintroduce. Colour on desktop is semantic
  (`--ft-green` for positive P&L, `--ft-red` for negative) or absent.

### Test-lock on the invariants

The three shared constraints — no truncation on financial figures, no
fabricated zero, no ellipsised numbers — apply on both viewports. When
`components/primitives/*` grows a new primitive, add a regression test
that renders it at both 390px and 1440px and asserts no `overflow:
hidden + text-overflow: ellipsis` on a `.pnum` descendant. The pilot
found the truncation defects by reading CSS; the next one should be
caught by tests.

