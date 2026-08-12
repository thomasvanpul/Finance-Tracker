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
