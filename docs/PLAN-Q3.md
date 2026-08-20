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

---

## The rule for all of it

Nothing ships without the check that would have caught the last defect of its
class. Eight locks exist because eight things were rediscovered by hand. The
next one should fail a test, not a screenshot.
