# Target product

The state Numeris is being designed *toward*, not what exists today. Design work
should assume all of this and not be limited by current capability. Decided
13 Aug 2026.

Audience: a real product strangers sign up for. The schema is already
multi-tenant — every table carries `userId`.

---

## 1. Data arrives by itself

Open banking replaces manual entry. Connect once, transactions and balances flow
in continuously. UK providers: TrueLayer, Plaid, GoCardless. Malaysia has no open
banking API, so Maybank stays on import until one exists.

**Design consequence, important:** "3 uncategorised transfers need a category" is
an artifact of half-formed data. With automatic ingest and auto-categorisation
that pane disappears, and whatever currently occupies the primary action slot has
to be re-earned. Do not design around manual entry.

## 2. The world moves on the screen

Alpaca is wired. Positions span GBP, MYR and EUR. Markets, FX and central bank
rates move daily and genuinely change the user's position. News filtered to
holdings only — never a general feed.

## 3. Other people

Split and owing becomes social rather than a ledger: request, settle, add a
shared expense, shared household accounts. Another person's action puts something
on the user's screen without the user doing anything. This is the only mechanism
in the product that produces genuine return frequency.

## 4. Progression

XP, unlockable themes, avatar skins — already in `lib/learn-xp.ts` and
`lib/bot-skins.ts`, currently decoration. Avatars to be redesigned as 3D models
(see backlog §4). Never rewards spending; tracks maintenance and position only.

## 5. Personas control density and language, not just widgets

`lib/persona.ts` has five personas. Today they choose widgets. They should
choose the whole register:
- `market` — the dense terminal. Four-letter labels, `POSNS / FLOWS`, mono,
  expert. This is the v8 design.
- `budget` — plain English, larger type, fewer things, a grid of obvious entry
  points. The version a non-technical parent could use.

Onboarding asks one question and picks a persona. Custom personas are a later
consideration, not a first build.

## 6. Detail pages carry their own geometry

Level = safe-to-spend, Horizon = cashflow, Balance = net worth, Dial = month
view, Deck = month-so-far summary. Each home pane carries a miniature of the
geometry of the page it opens.

## 7. Scheduled overview

The overview can be delivered as a digest at a chosen time of day, not only
pulled. The user chooses what it contains.

## 8. Navigation for 37 routes

Four nav tabs cannot address 37 destinations, and consumer users navigate by
hunting rather than by knowing. Unresolved: a command palette (on-metaphor for
the terminal persona, since Bloomberg navigates by typing) versus a conventional
grid of entry points (correct for the budget persona). Possibly both, chosen by
persona.

---

## Known unknowns

Never shown to a single non-technical person. Every design decision so far has
been made against an imagined user. Five observed sessions would be worth more
than another month of design.

---

## Payments — the regulatory position

Researched 13 Aug 2026. Not legal advice; confirm with TrueLayer and take
proper advice before building.

**The app can initiate payments without its own FCA authorisation.** TrueLayer
is an authorised PISP and supports unregulated callers: you supply payment
service user details in the request and include TrueLayer's exact wording
stating that TrueLayer is initiating the payment. The app never holds or touches
funds — it constructs a payment and the user authorises it in their own bank's
interface.

This is the "one level under moving money" model. `SETTLE £24.50` on a debt to a
person, paying a bill, and moving between the user's own accounts are all
achievable this way.

**Doing it directly is not viable.** FCA authorisation as a PISP requires a
minimum of €50,000 initial capital plus professional indemnity insurance, and
registration takes up to a year.

**Reading account data is much lighter.** The AIS agent route runs through a
Third Party Provider who assumes PSD2 compliance responsibility; agents
typically get access in four to six weeks against roughly a year for direct
registration.

**Scope limit:** UK only. Malaysia has no open banking regime, so Maybank and
MYR stay read-only and manual.

**Design consequence:** the v11 action row was premature but not fake. Actions
that are genuinely achievable: settle a debt to a person, pay a bill, move
between own accounts. Currency conversion is a different service and would need
separate permissions — do not design it in.
