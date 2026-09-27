# Two directions, 27 Sep 2026

`compare.png` is the one to open on the phone: Spread on the left, Map on the right.

| | Phone home | Phone drill-in | Desktop |
| --- | --- | --- | --- |
| 1 Spread | `1-spread/phone-home.png` | `1-spread/phone-spending.png` | `1-spread/desktop.png` |
| 2 Map | `2-map/phone-home.png` | `2-map/phone-cash.png` (tap CASH) | `2-map/desktop.png` |

**Data.** Every figure is from the dev API for the seed account (`seed@numeris.local`,
Neon `dev`), fetched on 27 Sep with GET requests only. `data.json` holds the
snapshot and `data.js` wraps it byte for byte so the pages open from `file://`.
The pages only read, sum and lay out those figures. The one derived quantity is
a colour tint worked out from the API's own 20-day `fx-drift` deltas. No account
setting was touched.

**Rebuild:** `node render.mjs` (headless Chromium, DPR 2, closes its browser).
It also flags any `.pnum` wider than its box, and every final render came back
with none.

**Unlike the 19 Sep five.** Those five were each a list of rows with a
lettered avatar square, navy and gold, sans headings over sections. Neither
direction here has any of that. Each one is a single chart shape that fills
the screen. The Mobile Amendment asks for an avatar or glyph on every row; both
directions drop it on purpose. That is a rule change for Thomas to agree to,
not something to slip past him.

---

## 1 Spread: the order book

**Idea.** The home screen is an exchange order book. Above the centre line are
claims on your money: bills, what you owe, goals, the loan. Below it is what you
hold, running from the most liquid (Monzo) down to the least (the flat). The
centre line is the price row, and here the price is your net worth. Every row
has a depth bar showing the running total from the line out to that row. Both
sides use **one shared scale**, so you compare them by length. With the seed data
the two sides nearly mirror: claims total £11,685.08 and cash plus money owed to
you is £11,528.26. Rows that run past the end of the scale (ISA, positions,
SIPP, flat) end in an axis-break mark. Their bars are never squeezed to fit.

**Why it fits.** "Numeris is trying to be Binance spot / Kraken Pro": the order
book is the one component every liked terminal shares. "Net worth reads as a
readout on an instrument": it sits exactly where the mid-price sits.
"A shape only when it says something a number cannot": the shape here is
whether the claims above outweigh the liquid money below, which no single
number tells you. "Dense on the Mac": the desktop is Binance's own layout
(book, chart, ticket, tape, status bar).

**Every mark on the phone home, one line each**
- `SUN 27 SEP` / `GBP`: today and the base currency, the two things every figure depends on.
- A red row: a claim on your money. Its right-hand figure is in GBP.
- The left column above the line (`loan`, `30d`, `owe`, `19 Oct`, `today`, `12–21`): when the claim falls due, or what kind it is.
- The left column below the line (`GBP`, `EUR`, `MYR`, `owed`, `5 pos`): the currency the money sits in.
- A dim figure in the middle (`$20.00`, `€540.75`, `RM 1,980.00`): the native amount, shown first, before the converted one.
- `fx` superscript: the figure was converted at a computed rate.
- `cost` superscript: the positions are valued at what you paid, because there is no price feed.
- A dotted underline on a figure: not real yet (an unpaid bill, a goal not yet funded, money you are owed).
- A dotted outline in place of a bar: a claim or a promise that has not moved money yet (the goals, Alex and Hui).
- The amber `6 past due` row next to the line: bills whose date has passed and that are still unmarked.
- A tinted depth bar: the running total from the line out to that row, on the shared scale.
- `//` at the left end of a bar: the running total has gone past the scale.
- `£215,304.16`: net worth, with the pence dimmed.
- `+£2,127.34 fx since 7 Sep`: the change since the first snapshot, and all of it came from exchange rates.
- `£259.16/day free to 27 Oct`: the API's daily allowance and the end of its window.
- `− Spent` / `+ Received`: the two ways to log money, laid out like an exchange's buy and sell keys.
- The tab rail: the five tabs, with the current one lit and a bar above it.

**Drill-in (Spending).** The months run along the top as a segmented control,
each showing that month's total spend. Below is a ladder with one rung per
budget: the dotted outline is the limit, solid red is what has been spent, the
grey tick is last month and the small triangle is where even pacing would put
you today. A Rent rung that is still at zero carries `13 Sep unmarked`. The
month's transactions run underneath as a tape.

**Motion**

| Name | What it tells you | Duration, easing |
| --- | --- | --- |
| Fill | A bill marked paid slides into the centre line and disappears, and the paying account's depth bar shortens by the same length. A claim was met from cash. | 200ms, `cubic-bezier(.2,0,0,1)` |
| Cross | At midnight, a bill whose date has passed steps down into the amber past-due row. Its due date has gone by. | 150ms, linear, one step with no easing, so it reads as a clock tick |
| Tick | When a value changes, only the digits that moved flash green (up) or red (down) behind them. The number itself swaps instantly and is never animated. | 120ms on, 150ms off, `ease-out` |
| Drag the line | Hold and drag the centre line up: each claim you pass is taken off the bids, and the net-worth readout shows what would be left. It is a hidden "what if these all went out". | follows the finger; settles back in 140ms `ease-out` |
| Open a side | Tap anywhere on the claims or the holdings and that side fills the screen (it becomes Upcoming or Worth), while the other side shrinks to one line. | 240ms, `cubic-bezier(.3,0,0,1)` |

**Cost to build** (rough, one person)
- `components/mobile/MobileHome.tsx`: replace the body with a new `OrderBook` component (book, centre band, keys). About 2 days.
- A new `components/book/` folder: pure row-building logic from the dashboard, upcoming, allocation, debts and investments queries, plus a lock test on the shared scale and the break mark. About 1 day.
- `MobileBudget.tsx`, or the spending tab: the ladder. About 1 day.
- `pages/dashboard.tsx`, desktop: the four-column terminal. The flow chart (hand-drawn SVG or recharts), the tape and the ticket are new; the status bar already exists. About 3 to 4 days.
- `index.css`: new tokens, and IBM Plex Sans Condensed (the same family as the current Plex, so no new family). About 0.5 day.
- Motion: Fill, Tick and Open are CSS or FLIP; Drag the line needs a gesture handler. About 1.5 days.
- **About 9 to 10 days.** It uses only queries that already exist, with no API change.

---

## 2 Map: money as area

**Idea.** The finviz map, the one board image he loved, applied to everything
he holds. Every tile's area is its value in GBP, and one square pixel is the
same amount of money anywhere on the screen (the desktop status bar says so:
`1px² = £0.27`). Colour carries exactly one thing, the 20-day move: grey did
not move, green rose, red fell. The seed account says in one glance what no
figure says on its own: 70.9% of it is a single flat in Kuala Lumpur, priced in
ringgit, and the whole month's gain is that flat's exchange rate. Debts sit
under the map as a hatched band drawn to the same scale. Tap a group and the
map zooms into it.

**Why it fits.** 01-finviz-map was the only "love" on the board. "A shape only
when it says something a number cannot": area is the only honest way to show
share of the whole. "Calm on the phone": the phone home is one big quiet tile
plus a strip. "Value encoded by length or area, never depth": the design is
literally area. "Hidden touch interactions over explanations": you move
between levels by pinching or tapping, with no instructions on screen.

**Every mark on the phone home, one line each**
- `£215,304.16`: net worth, with the pence dimmed.
- `+£2,127.34 fx since 7 Sep, all exchange rate`: the 20-day change and where it came from.
- Group headers (`PROPERTY 70.9%`, `PENSION 12.4%`, `INVESTED 11.5%`, `CASH`): the group's name and its share of what you hold. A group too small for its percentage shows its name only.
- Tile area: the value, on one fixed px²-per-pound scale.
- Green tile fill: the tile rose over 20 days, and a deeper green means a bigger rise.
- Grey tile fill: the tile did not move.
- A hatched grey tile (VUSA, VWRL, MSFT, AAPL, BTC): valued at cost, with no live price.
- Tile text: the name, then the native value, then the GBP value with `fx`, then the 20-day percentage. A line is shown whole or not at all, so small tiles show fewer lines.
- The red hatched band: the loan plus what you owe, as area on the same scale.
- `£1,229.71 6 unpaid`: the total of bills past their date.
- `£259.16 a day`: the daily allowance.
- The horizon strip: every pending bill on a date axis. Tick height is the amount, amber means past its date, grey dotted means ahead. Each tick has a 6px minimum so that a £2.99 bill is still visible, and the rent tick is at true scale.
- The cyan line `27 Sep`: today.
- The five tabs and the cyan `+` key: navigation, and logging a transaction.

**Drill-in (Cash zoom).** Top left, a thumbnail of the whole map with the cash
outlined in cyan: you can see where you are, and how small cash is. Below that,
the four cash accounts as tiles. Each account's unpaid past-due bills are cut
out of its tile by area as a dashed amber block. Monzo loses £960.00 of its
£2,450.30. Maybank loses £231.64 (RM 1,250.00) of £366.92, which is 63% of the
wallet. The list underneath gives the same bills per account, native currency
first.

**Motion**

| Name | What it tells you | Duration, easing |
| --- | --- | --- |
| Zoom | Tapping a group grows it to fill the screen, and the rest of the map shrinks into the thumbnail frame. Labels appear only once the zoom settles. You went down one level. | 240ms, `cubic-bezier(.2,0,0,1)` |
| Re-tile | When a sync or a rate change alters values, the tile edges slide to the new areas. The numbers swap instantly and are never tweened. The proportions changed. | 150ms, linear |
| Pay down | Marking a bill paid shrinks its amber cut-out to nothing, and the horizon tick turns from dotted to solid and slides to the left of the today line. It happened. | 180ms, `ease-out` |
| Hold to price | Press and hold any tile to show its native amount, the rate and the source of the rate (the `fx` provenance), even when the tile is too small for text. | 90ms fade in; hides on release |
| Colour step | At a sync, a tile's tint steps to its new 20-day bucket, one step per bucket and never a smooth fade, so a change of colour always means a change of bucket. | 150ms, `steps(1)` |

**Cost to build** (rough, one person)
- A new `components/map/` folder: squarified layout (about 60 lines, already written in `lib.js`), tile text-fit rules, the group layout, a lock test for "a line is shown whole or dropped whole". About 2 days.
- `MobileHome.tsx`: the readout, map, debt band and horizon. About 1.5 days.
- `MobileNetWorth.tsx` or `MobileAccounts.tsx`: the zoom levels, the thumbnail, and the cut-outs joined from `/upcoming` by `accountId`. About 2 days.
- `pages/dashboard.tsx`, desktop: the map plus the right column (budget map, horizon, tape). About 2.5 days.
- A new face, Archivo (variable width), for tile names: a font decision that needs Thomas's sign-off. The Constitution bans only Inter and Roboto. About 0.5 day.
- Motion: Zoom and Re-tile need FLIP on absolutely positioned tiles; Hold needs a long-press. About 2 days.
- **About 10 to 11 days.** It uses the existing queries and `/accounts/fx-drift` for the tint, with no API change.

---

## Both directions, checked against the rules

- **Clipped figures:** none. The render probe reported no overflowing `.pnum` on all six screens. Where a figure does not fit, it is dropped whole (small tiles, Maybank's balance in the cash zoom).
- **Emoji and flags:** none. Currencies are shown as ISO codes and symbols.
- **Instruction text:** none.
- **Gradients:** only the hatching on tiles and the debt band, inside the chart's own plot area.
- **Shadows and blur:** none.
- **Uniform-card anatomy:** neither screen is made of cards.
- **Known deviations:** (a) no avatar glyph per row, deliberately (see the top of this file). (b) Spread's individual book rows are 30px tall; the tap target is the whole side (Open a side), because no single row is tappable on the glance. (c) The Map horizon floors ticks at 6px.

## Recommendation (the pick is Thomas's)

**Recommended: 2 Map.** Its home screen carries the most important fact about
this account in one glance with no reading (almost everything is one flat in
another currency, and that currency is what moved the month). It is the only
direction built on the one reference he *loved* rather than liked, and it
stays calm on the phone. Spread is closer to "Binance spot" word for word and
is the stronger desktop. But its phone home is 17 rows, which leans towards
dense, and that is the harder sell for "a glance by default".

A hybrid is cheap if he wants one: Map on the phone, with Spread's book as
the desktop's left column.
