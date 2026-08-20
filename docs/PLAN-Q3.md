# Numeris — systematic plan, from the 20 Aug review

Ordered by dependency, not by appeal. Each phase is independently shippable.
Nothing here is started until the phase above it is done.

---

## Phase 0 · Stop the bleeding (hours, not days)

**0.1 — Kill the cold starts.** Render gives 750 instance-hours/month; a 31-day
month running 24/7 is 744. A keep-alive ping every 10 minutes to `/api/healthz`
keeps the service permanently warm *within the free allowance*.

Instance hours measure **uptime, not traffic** — 744 hours whether there is one
user or a hundred thousand, so this works at any scale. The ceilings that do
bite are elsewhere: 5GB bandwidth (~100 users at 50MB each; 1000 users is about
$7 of overage) and, first and hardest, **0.1 CPU with 512MB**, which will feel
broken at tens of concurrent users regardless of everything else.

So: free is correct now, and the signal to move is latency under load, not a
bill.

**0.2 — The three real bugs.**
- Portfolio: "diversified" header overlaps content to its right.
- Markets: figures do not load.
- Compact widths: layout breaks when the window is dragged narrow.

**0.3 — Measure before optimising.** With the service warm, time the real
authenticated endpoints. Slowness after 0.1 is a query problem, not a hosting
one, and must be measured rather than assumed.

---

## Phase 1 · Design direction (decide, then apply everywhere)

Corrected after review — the first pass was wrong.

`matrix #00FF41` is *the* Matrix green, `phosphor #7FFF00` is P1 CRT phosphor,
and `synthwave #FF007A` is the genre's own palette. Those three are deliberate
references and their saturation is the point. Calling them vibe-coded was a
misread.

The real offender is **`midnight #4D9FFF`** — generic "AI startup blue",
referencing nothing, and the colour actually being reacted to.

**1.1** Re-derive `midnight` only. Keep it a blue, but choose it against a
contrast target the way `arctic`, `slate`, `parchment` and `linen` were chosen,
rather than at maximum saturation. Report the computed ratios.

Leave `matrix`, `phosphor` and `synthwave` alone. A theme that references
something specific is allowed to be loud.

**1.2** Then the wider look: spacing rhythm, type ladder, and the interactive
polish — world clock on hover, currency and country marks, header behaviour.

---

## Phase 2 · Integration (the biggest real complaint)

Pages currently stand alone. They should not.

**2.1 — Net worth must compute, not require a snapshot.** The user has already
entered accounts, investments and debts; asking for a snapshot is asking for data
the app can derive. Compute from what exists, and ask only for what genuinely
cannot be derived.

**2.2 — Audit every page for the same fault.** Where does the app demand input it
could calculate? Report before changing.

**2.3 — Cross-page links.** A figure on one page should reach its source on
another.

---

## Phase 3 · Settings and onboarding

**3.1** Settings expansion: more toggles, grouped, each with an info mark
explaining what it does — the pattern already used in Markets.

**3.2** New-user default state. An empty account currently looks broken rather
than new. Empty states should say what to do next.

**3.3** Onboarding and the customise-everything flow.

**3.4** Move wardrobe under the AI assistant.

---

## Phase 3.5 · Legal, before anyone else signs up

Hard prerequisite for inviting friends or classmates. Not optional, not
technical debt — the app stores other people's bank balances, salaries and
debts, and UK GDPR does not care that you know them personally.

**3.5.1 — Privacy policy and terms.** What is collected, lawful basis, retention
period, every processor it is shared with (Neon, Render, Vercel, Yahoo, Alpaca,
Polygon, Twelve Data, whichever AI provider), and the subject-access route.

**3.5.2 — Consent at sign-up, not at the door.** Do NOT gate the site behind an
agree-or-leave wall. Consent must be freely given and specific under UK GDPR,
and a blanket page-load gate is the pattern regulators dislike — it is also bad
UX for anyone who just wants to see what the product is. Capture agreement at
account creation, link the documents plainly, and keep separate opt-ins for
anything genuinely optional.

**3.5.3 — Account deletion that works.** Cascades already exist; the
user-facing route does not.

**3.5.4 — Breach process.** ICO notification within 72 hours. Write down who
does what before it is needed.

---

## Phase 4 · Deferred deliberately

- **3D AI assistant renders.** Wants Phase 1 settled first — render style follows
  the design language, not the reverse.
- **Unlimited AI.** "Unlimited for the user" is fine; "unlimited against the
  provider" is not. Switching provider changes who bills you, it does not remove
  the ceiling. Investigate free tiers that cap by daily quota rather than
  per-call billing (Groq, Cerebras, and Gemini's own free tier — check which tier
  the current key is on before assuming it costs anything). Then rate-limit per
  user generously and let the provider's free quota be the real ceiling. The
  limiter stays either way.
- **iPad and iPhone app polish.** After Phase 1, so it is done once.

- **Consistent AI quality across providers.** When the app routes between
  vendors, the user should not feel the switch: route by task rather than by
  availability alone, keep system prompts and tone consistent, and never send
  reasoning work to a small model just because it has quota left. Note that
  these are third-party APIs — they cannot be trained or fine-tuned here, so
  consistency is a routing and prompting problem, not a training one.

- **Cost efficiency audit.** Once there are real users and real numbers: review
  every subscription and host choice against measured usage. Cheapest wins first
  — payload reduction and caching beat tier upgrades and cost nothing monthly.
  Do this with data, not projections.

---

## Phase 5 · Charging money — a different kind of project

Not a feature. The moment money changes hands this stops being a personal
project and becomes a business holding other people's financial data.

Involves: a payment processor, VAT in both the UK and Malaysia, refund and
cancellation terms, dunning, and a materially larger set of obligations than
free software carries. Adding Stripe is the easy part.

Worth doing eventually. Worth doing deliberately, with the Phase 3.5 documents
already in place and real usage data showing what people would pay for.

**Do not start this before there are users who would miss the product if it
disappeared.**

---

## The rule for all of it

Nothing ships without the check that would have caught the last defect of its
class. Eight locks exist because eight things were rediscovered by hand. The
next one should fail a test, not a screenshot.


---

## Appendix A · The scaling ladder

Upgrade when the symptom appears, not before. Each step is triggered by
something observable.

| Users | Symptom you will see | What to do | Cost |
|---|---|---|---|
| 1–20 | none | Render free + keep-alive | £0 |
| 20–100 | requests queue at peak; latency climbs under concurrent use | Render Starter — 0.5 CPU, no sleep | ~$7/mo |
| 100–500 | bandwidth passes 5GB; CPU saturates | Render Standard + review API payload sizes | ~$25/mo |
| 500+ | single instance saturates regardless | Horizontal scaling, CDN for assets, Neon connection pooling | varies |

**The signal to move is always latency under load, never a projection.** Measure
before upgrading; the 0.1 CPU ceiling arrives long before the bandwidth bill.

**Cheapest wins first, at every step:** shrink API payloads, cache aggressively,
and stop re-fetching unchanged data. A 50% payload reduction is worth more than
a tier upgrade and costs nothing per month.

---

## Appendix B · AI provider strategy

Free tiers are **shared across all users**, which is the number that matters:

| Provider / model | Daily cap | At 100 users |
|---|---|---|
| Gemini Flash-Lite | 1,000 req/day | 10 messages each |
| Groq llama-3.3-70b | 1,000 req/day | 10 messages each |
| Groq 8B models | 14,400 req/day | 144 messages each |
| OpenRouter free | 50/day (1,000 after $10 spend) | — |

**Verified June–July 2026. These rot fast** — one provider pruned its free
catalogue from twelve models to two overnight on 31 May 2026 and silently broke
a running app. Gemini has already cut its free tier once. Re-verify before
relying on any figure here.

**The design that follows:**
1. **Stack providers.** Each quota is independent, so routing across two or three
   multiplies free capacity.
2. **Route by task.** Cheap classification to a fast 8B model with a 14,400/day
   ceiling; genuine reasoning to a larger one.
3. **Fall back on exhaustion**, and treat a provider vanishing as expected rather
   than exceptional.
4. **Per-user daily budget, generous but finite.** Users should feel unlimited;
   the provider quota must never be the thing that runs out, because when it does
   it fails for everyone at once.
5. **Alert when a lane dies.** The failure mode above was silent for forty-seven
   consecutive calls.
