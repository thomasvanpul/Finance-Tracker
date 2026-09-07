# /transactions — a structure, proposed before rebuilding

Thomas has called this page "still weird, could be made and designed much
better" three times. It has never been structurally addressed; each round
moved things inside the shape rather than changing it. This document is the
proposal the fourth round asked for, written against what the page measurably
is on 2026-09-07 rather than against an impression of it.

`pages/transactions.tsx` is 3,124 lines. `docs/DESIGN.md` is the normative
spec and nothing here overrides it.

---

## 1 · What is actually wrong

Measured on the rendered page at 1440×900 (void theme, seed user, 46
transactions), and by reading the file — not inferred.

**Three boxes of chrome before a single transaction.** KPI strip, filter bar,
ledger panel header. The first row lands roughly 400px down a 900px viewport.
Every one of the three earns *something*; none of them earns being third.

**The same number, printed twice, on every row.** The AMOUNT column shows
`−42.18 GBP` and the GBP column shows `−£42.18`. For a GBP account these are
the same figure in two notations, and every account but two in the dev data is
GBP. The column exists for the foreign rows, and it pays for them by repeating
itself on all the others.

**Two chips labelled ALL, in the same bar, meaning different things.** One is
type=all, one is period=all. In the screenshot the second is lit and the first
is not, which reads as a contradiction rather than as two axes.

**Six unlabelled icon controls per row**, in a 128px action column: note, tag,
split, SL, edit, delete. Two of those six are *two different split
mechanisms* sitting adjacent — `⊕` (transactions.tsx:1806) creates real
transactions through the API; `SL` (:1809) writes a localStorage annotation
that no other surface reads. A user cannot tell them apart, and one of them
does not really exist.

**Two full filter UIs over one set of state.** The desktop bar (2510–2711) and
the mobile sheet (2426–2506) drive the same nine variables through two
separate clear-all handlers (2617, 2433). `hasFilters` (593) and
`activeFilterCount` (596) count different sets, so the CLR button and the
count badge can disagree about whether the page is filtered.

**The list is unbounded and every operation is client-side.**
`useListTransactions()` is called with no arguments; filtering (610–647),
sorting (649–652), grouping (736–786) and pagination (789–805) all run in the
browser over the whole list, with `PAGE_SIZE = 75`, a LOAD MORE button and no
virtualisation. The generated client already accepts a
`ListTransactionsParams` filter object. Nothing passes one.

**`TxRow` is declared inside the component body** (1603) and calls `useState`
and `useSwipeDelete`, so it is a new component type on every parent render and
every row remounts whenever any filter changes.

**The phone version of this route is better.** `/transactions` on a phone
resolves to the SPENDING tab: a spend hero, a comparison against the same
point last month, three category cells, then day-grouped rows with day totals.
That is the same data, structured. The content model is not the problem — the
desktop layout is.

---

## 2 · The structure

Four moves. They are independent; each is worth doing alone.

### A · The filter state is the page's address

One filter object, one component rendering it, and the URL as its storage.

The URL half **landed this session** (`lib/ledger-query.ts` + the sync effect
in transactions.tsx): the six filters `lib/entity-href.ts` already spells now
round-trip, so a filtered ledger can be refreshed, bookmarked and sent. Before
this, the §14 drills added in `5a1099a` took you to a view whose address
survived until the next click.

What remains is the deduplication: collapse the desktop bar and the mobile
sheet into one `<LedgerFilters>` over one state object, so there is one
clear-all and `hasFilters` is `activeFilterCount > 0` by construction rather
than by coincidence. Two chips labelled ALL become one type control and one
period control that cannot both claim the word.

### B · Five columns, and the row itself is the affordance

Drop the duplicated GBP column. Render the native figure and, only when it
differs, the converted one beneath it — the app's existing "native currency
first, converted second" signature, already used on phone. DATE ·
DESCRIPTION · CATEGORY · ACCOUNT · AMOUNT is the table; TYPE is already
carried by the sign and the colour.

Retire the 128px action column. The row opens a detail surface (§14 already
applies here); note, tag, split, edit and delete belong in that surface where
they can carry words instead of glyphs. `SL` goes away entirely — a split
mechanism that writes to localStorage and is read by nothing is not a second
option, it is a bug with a button.

This is 8 columns → 5 and 128px of per-row chrome → 0, without removing a
single capability.

### C · Day is the grouping, not a checkbox

Phone forces `groupByDay` (551) and never resets it. Desktop offers DAY and
MERCHANT as toggles that persist nothing across a reload. Make day grouping
the default on both, with the day total the phone already prints, and keep
MERCHANT as a lens the user switches to — not a second checkbox that can be
on at the same time.

### D · Server-side filtering, when the list stops being small

Not now. At 46 rows the client-side pass is free and the round trip would be
slower. The threshold worth naming: when a user's ledger passes roughly 2,000
rows, `LOAD MORE` over an unbounded fetch stops being viable and the
`ListTransactionsParams` the client already accepts should carry the filter
object from §A. Because §A makes that object explicit and serialisable, this
becomes a change of transport rather than a rewrite.

Fixing `TxRow`'s declaration site (move it to module scope, pass what it needs
as props) is a prerequisite and is worth doing on its own — it is the
difference between re-rendering rows and remounting them.

---

## 3 · What is *not* wrong

The KPI strip. It summarises the filtered set and updates with it — 6 of 46,
£211.98 out, £35.33 average — which is exactly the thing a ledger should tell
you and the desktop page does better than the phone. It should keep its six
cells and lose the four action buttons (`+ ADD`, `↓ CSV`, `↑ CSV`, `AI CAT`)
currently crammed into the DATE RANGE cell, which are page actions wearing a
KPI's clothes.

---

## 4 · Order

1. `TxRow` to module scope. Mechanical, no visual change, unblocks everything.
2. §B — the columns and the action column. The largest visible win.
3. §A remainder — one filter component. Removes the duplicated UI.
4. §C — day grouping by default.
5. §D — only when a real ledger gets large.

Each is one commit. None of them needs the others to have happened first,
except that §D wants §A.
