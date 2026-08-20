# Numeris — systematic plan, from the 20 Aug review

Ordered by dependency, not by appeal. Each phase is independently shippable.
Nothing here is started until the phase above it is done.

---

## Phase 0 · Stop the bleeding (hours, not days)

**0.1 — Kill the cold starts.** Render gives 750 instance-hours/month; a 31-day
month running 24/7 is 744. A keep-alive ping every 10 minutes to `/api/healthz`
keeps the service permanently warm *within the free allowance*. This removes the
50-second waits entirely. Caveats that remain: bandwidth is billable above 5GB,
and 0.1 CPU is still slow under real load.

**0.2 — The three real bugs.**
- Portfolio: "diversified" header overlaps content to its right.
- Markets: figures do not load.
- Compact widths: layout breaks when the window is dragged narrow.

**0.3 — Measure before optimising.** With the service warm, time the real
authenticated endpoints. Slowness after 0.1 is a query problem, not a hosting
one, and must be measured rather than assumed.

---

## Phase 1 · Design direction (decide, then apply everywhere)

The palette review found the split plainly:

| Chosen deliberately | Chosen by vibe |
|---|---|
| `parchment #7A1F30`, `slate #0E5766`, `linen #5A4610`, `arctic #0052CC` | `midnight #4D9FFF`, `phosphor #7FFF00`, `matrix #00FF41`, `synthwave #FF007A` |

The right-hand column is pure saturated RGB — the exact tell being complained
about. The left-hand column was built against a contrast table and looks nothing
like it.

**1.1** Re-derive the four vibe-picked accents the same way the light themes were
built: a stated contrast target, computed ratios, no eyeballing. Keep each
theme's identity (matrix is still green, synthwave still hot) but at a chosen
chroma rather than maximum.

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
- **Unlimited AI.** Every call bills Gemini. "Unlimited" is an unbounded bill and
  removes the only protection against one user emptying the account. Raise the
  ceiling; do not remove it. Revisit when there is a billing model.
- **iPad and iPhone app polish.** After Phase 1, so it is done once.

---

## The rule for all of it

Nothing ships without the check that would have caught the last defect of its
class. Eight locks exist because eight things were rediscovered by hand. The
next one should fail a test, not a screenshot.
