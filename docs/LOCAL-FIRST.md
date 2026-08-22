# Local-first — the offline strategy

Written 22 Aug 2026, from the observation that most pages are calculations over
data the user already owns.

---

## The number that decides it

A fully seeded user — 9 accounts, 46 transactions, budgets, goals, debts,
investments, subscriptions, upcoming — is **11.8 KB**.

Extrapolated to a heavy user with five years at 100 transactions/month:
**roughly 900 KB**. Less than one photo.

**So ship every user their entire dataset.** Everything else follows from that.

---

## What this actually changes

Once the browser holds all the rows, these pages need no server at all:
dashboard, analytics, reports, net worth, budget, health score, cash flow,
spending breakdown, goals, debts, subscriptions. They are derivations, not
fetches.

Three problems collapse into one solution:

| Problem | How local-first solves it |
|---|---|
| Offline unusable | nothing was fetched at read time, so nothing breaks |
| ~250ms per round trip from the far region | no round trip to be far from |
| 12 API calls on a dashboard load | zero, reads are local |

The server becomes a **sync endpoint**, not a calculation engine.

---

## Architecture

**Storage:** IndexedDB, not localStorage — structured, indexable, no 5MB cap.

**Sync:** delta only. Client sends its last-sync cursor, server returns rows
with `updatedAt` newer than that. First sync is a full pull (~1MB worst case,
once), everything after is a handful of rows.

**Computation moves to the client.** The existing server aggregation is not
wasted — it becomes the fallback path for a client with no local copy yet, and
the reference implementation the client logic is tested against. Both must
produce identical output; that is a test.

---

## The three things that genuinely cannot be local

Be honest about these rather than pretending.

**1 · Live market quotes.** A price is a fact about the world, not about the
user. Offline they are stale by definition.

*Approach:* only fetch tickers the user actually holds or has starred — not all
53 in the overview. Cache last close with its timestamp. Offline, the portfolio
shows last known prices marked "as of 14:32, 3 hours ago". The stale-serve
vocabulary from the market work already covers this.

**2 · FX rates.** Same category, but far more forgiving: rates move less than 1%
day to day. Cache the full rate table daily. Offline conversion using
yesterday's rate, labelled as such, is honest and useful — and it means a
multi-currency net worth still computes on a plane.

**3 · Shared expenses.** Another person's action reaching your screen requires a
network by definition. Offline, show the last known state and queue local
changes.

---

## The write path — where this gets dangerous

A queued write that fires twice creates a duplicate transaction. In a finance
app that is worse than losing it.

**The shape is already solved.** H5's file-import dedup used a deterministic
hash over `userId|accountId|date|description|amount|ordinal`. The same
approach applies: every offline write gets a client-generated deterministic id,
so a replayed queue is idempotent rather than duplicating.

Required answers before implementation:
- What happens if the app closes mid-queue?
- What happens if the same write is submitted twice?
- What happens when two devices edit the same row offline?

Last-write-wins is acceptable for this app's data — but it must be a decision,
recorded, not an accident.

---

## Status must be visible

Offline, syncing, synced, failed — all distinguishable. A silent queue is how
people stop trusting a finance app.

Anything served from cache carries its timestamp. Never presented as live. Same
rule as the FX nulls and the pnum invariant: **never show a number the app
cannot stand behind.**

---

## Why this is worth doing before the native apps

App Store Guideline 4.2 rejects thin web wrappers. Local-first *is* the native
capability that clears it — real offline function, not a website in a box.

It also fixes what happened on 22 Aug 2026: the API was slow and the dashboard
showed skeletons and zeros. A local-first client would have shown the last known
state instead, and the user would not have noticed.
