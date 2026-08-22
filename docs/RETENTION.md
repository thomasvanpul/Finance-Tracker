# Retention — solutions to the known failure modes

Written 22 Aug 2026, from published research on why finance apps get abandoned.

**The numbers:** Day-30 retention averages 38%. Top-10 apps lose 71% of daily
actives between Day 1 and Day 30. 67% of people who tried a budgeting app rated
it "not helpful" or "too much effort to maintain."

**The organising principle:** abandonment happens when motivation fades but the
app's demands stay constant. So the app must be useful *when the user does
nothing*. Every idea below is judged against that.

---

## 1 · Manual entry — the biggest single churn driver

Apps requiring manual entry lose users at **3× the rate** of auto-sync apps.
Malaysian banks have no open banking, so `.KL` users type. This is our largest
structural risk.

**Loopholes, cheapest first:**

**a · Email forwarding.** Malaysian banks all send transaction alert emails.
Give each user a unique forwarding address; parse incoming alerts into
transactions. Works on every platform, needs no permissions, no app store
review implications. Probably the highest value-per-effort item in this
document.

**b · Receipt capture.** The route already exists (fixed 20 Aug after being
dead since creation). Photo → parsed transaction. Two taps instead of six.

**c · Share-sheet extension.** Native share target: a payment confirmation
from a banking app or email gets shared into Numeris and parsed. Requires the
Capacitor shell, so it lands with Phase 4.5.

**d · Learned repeats.** Most spending is repetitive. "Coffee, same place,
most weekday mornings" → one tap to log rather than a form. Uses data the app
already holds.

**e · Batch review.** Rather than logging as you go, one weekly three-minute
pass with smart suggestions. Reframes the task from constant to occasional.

**Not viable:** reading bank SMS/push notifications. Impossible on iOS,
requires sensitive permissions on Android, and would be a bad look for an app
holding financial data.

---

## 2 · Broken sync — 68% quit rather than reconnect

34% of bank connections need re-authorisation within 90 days. The insight is
that people do not quit because sync broke; they quit because **the app became
useless while it was broken** and reconnecting felt like a chore.

**Solutions:**
- Degrade to last-known state, never to an empty one. Local-first covers this.
- Manual and file-import paths must stay fully first-class so a broken
  connection is an inconvenience, not a dead end. H5 already made file import a
  proper connection rather than a fallback.
- Re-auth should be one tap from wherever the staleness is visible, not buried
  in settings.

---

## 3 · The guilt cycle

Green-under / red-over creates a punishing loop. The average household exceeds
at least one category monthly; two or three months of red dashboards lead people
to self-categorise as "bad at budgeting" and disengage. Apps track failure well
and rarely celebrate anything.

**Already solved, by accident.** The F5 refusal list — never reward spending,
never gamify debt, no streaks that break, no manufactured urgency — is a direct
answer to this and was written on instinct before the research was read.

**Go further:**
- Over-budget is *information*, not failure. "This month is unusual because of
  the flight" beats a red bar.
- Graceful recovery: when a budget breaks, offer a re-plan rather than a
  scolding. A broken budget currently reads as permanent failure, and the
  psychology is that once a category is perceived as blown it resets to
  unconstrained — "already over on food, may as well order the expensive thing."
- Notice and say the good things. The maintenance-only XP events are the right
  shape; surface them.

---

## 4 · Autopsy → intervention

"A pie chart of last month's damage is an autopsy, not an intervention."
Knowing you spent £340 on delivery does not stop order fifteen.

**What we can do that most cannot:** the app already holds upcoming bills,
recurring subscriptions and income dates. That is enough to project forward
rather than only report backward.

- **"At this rate"** — you will be £340 short by the 28th, based on committed
  outgoings versus expected income. Actionable, and computable from existing
  data.
- **"Can I afford this?"** — a quick pre-purchase check against upcoming
  commitments. An intervention rather than a record.
- **Surface the leak, not the total.** Forgotten subscriptions average ~$32/mo.
  We already track subscriptions; flagging one that has not been used or has
  silently risen in price is a concrete save.

---

## 5 · The wedge — who this is actually for

Existing apps are built for people whose money lives in one country. The
research shows people tracking across countries specifically praise a unified
view that keeps transactions in their original currency while converting
totals — which is exactly the native-first display already built.

**Numeris' real audience: people whose money lives in two places.**
International students, expats, families split across countries, anyone paid in
one currency and spending in another.

That group is underserved, has a genuinely harder problem, and is exactly who
is around this project already — a UK university with a Malaysian family.

This is a sharper identity than "another budgeting app", and most of the
differentiating work is already done: native-currency-first, FX provenance
marks, multi-currency net worth, cross-currency shared expenses.

---

## What to build first

Judged by churn-impact per unit of effort:

1. **Email forwarding capture** — attacks the 3× churn driver, works everywhere,
   no platform dependency
2. **Forward-looking projection** — turns the autopsy into an intervention using
   data already held
3. **Graceful budget recovery** — cheap, and addresses the documented
   psychological failure
4. **Subscription leak detection** — a concrete, provable saving

Deliberately *not* first: more charts, more categories, more dashboard. The
research is unanimous that better reporting of the past does not retain anyone.

---

## Passive value — what the app can notice on its own

The organising idea: **the app should reach out when something real has
happened, rather than wait to be opened.** Constrained by the F5 refusals — only
when there is genuinely something to say, never manufactured urgency. That
constraint is itself the differentiator: a finance app that pings you only when
it matters is one people leave notifications enabled for.

### Prerequisite: two small history tables

Currently only *current* values are stored. Almost every useful observation is a
comparison over time, so:

- `fx_rate_history` — daily snapshot of the rate table. Tiny; one row per
  currency pair per day.
- price history on `subscriptions` — currently a single `amount`. Without
  history, a price rise is invisible.

Neither is expensive. Both unlock most of what follows.

### The standout: FX transfer timing

Unique to the multi-currency wedge, saves real money, needs zero user action.

> GBP/MYR is 4.8% above its 90-day average. Moving the £2,000 you have sitting
> in GBP now rather than at the average rate is worth about £96.

Nobody in personal finance does this well, because most apps are single-country.
For someone paid in one currency and spending in another — the exact audience —
it is the most valuable thing the app could tell them, and it requires only rate
history plus balances already held.

Must respect the number rule: state the rate, the comparison window, and the
assumption. Never imply a prediction about where rates go next.

### The rest, ranked by concrete value

**Subscription price rises.** "Spotify went from £9.99 to £12.99 in March."
Silent price increases are among the most common quiet leaks, and the data is
already tracked — it just is not compared over time.

**Zombie subscriptions.** Paying for something with no matching activity, or two
services that do the same thing.

**Annual renewals before they hit.** The £89 charge people forget is coming.
Upcoming already models this; it needs to arrive as a notice, not a page.

**Runway.** "At current burn, your current account covers 23 days." Simple,
computed from data held, and more actionable than any pie chart.

**Income anomaly.** Paid late, or paid less than usual. For anyone on variable
or freelance income this is the thing they actually worry about.

**Unusual charge.** Materially larger than typical for that merchant. Adjacent
to fraud detection without claiming to be it.

**Bill drift.** Rent, energy or insurance rising over time — visible only with
history.

### Delivery

The `briefing` page and the weekly digest route already exist. The digest was
404ing since creation until 20 Aug, which means this surface has never actually
been used.

A weekly digest that says three true, specific things beats a daily one that
says something generic. The test for including anything: **would this sentence
be worth a push notification on its own?** If not, it does not belong in the
digest either.
