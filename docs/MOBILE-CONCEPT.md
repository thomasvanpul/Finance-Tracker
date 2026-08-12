# Mobile concept — an installation you maintain

Decided 12 Aug 2026. This supersedes the spreadsheet metaphor **for mobile only**.
The desktop stays a spreadsheet terminal; that identity is earned and unchanged.

## How we got here

Six design attempts across three tools were rejected. All of them were static
summary dashboards, and all of them translated the desktop spreadsheet metaphor
to a 390px screen. Nobody opens Excel on a phone. The metaphor is desktop-bound.

The unblock was naming the apps actually enjoyed: **Instagram, Reddit, Clash of
Clans, Yahoo Finance**.

Three of the four are feeds, not dashboards. In all four, actions live on the
content rather than in a separate zone. And Clash of Clans is the outlier that
mattered: it is a *place you own and tend*, not a screen you read.

## The concept

The mobile home is an **installation you maintain**. Not a village, not a
dashboard. A persistent set of objects with telemetry and state that you
service.

**The core loop: things accumulate while you are away, and you clear them.**

This is not a metaphor bolted on. It is already true of the app:

| Clash of Clans      | Numeris                                              |
| ------------------- | ---------------------------------------------------- |
| Resources fill up   | Wise syncs, salary lands, interest accrues            |
| Tap to collect      | Categorise 3 uncategorised transactions, confirm a bill paid |
| Build timers        | Rent in 5 days, budget resets in 19, ISA in ~2mo      |
| Buildings           | Accounts — Wise, Revolut, Maybank — each with balance, currency, sync freshness |
| Upgrade progress    | Debt payoff schedules, savings goals, net-worth milestones |
| Your layout         | `MobileWidgetManager`, `config.midTabs`, persona — already built, unused on mobile |

The three uncategorised Wise transactions are literally a resource pile. They
currently sit three taps deep in a transactions table. They belong on the home
screen asking to be dealt with.

## Register: terminal, not cartoon

Clash of Clans is a fantasy village. This is an installation — a machine room, a
trading floor. Objects with telemetry, things you service. Same tending rhythm,
completely different visual language. If it starts looking playful or
illustrated, it has gone wrong.

## Hard limits

- **Do not copy the compulsion loop.** CoC monetises impatience and manufactures
  urgency. Every timer here must be a real date the user already has.
- **Never reward spending.** Progression tracks maintenance and position, never
  transaction volume.
- **Do not gamify debt.** A payoff bar is a plan, not a score.

## Constraints that still apply

- The Mobile Amendment in `index.css` (below 768px): 44px touch targets,
  thumb-reachable primary action, safe areas, no large dead space, aligned
  columns, every screen offers an action.
- 11 themes including a light one (`arctic`). Hierarchy from structure and
  scale, never from colour alone.
- Banned throughout: gradients, glassmorphism, purple/pink accent, Inter,
  Roboto, decorative illustration, animating a numeric value.
- JetBrains Mono and tabular figures on every financial number.

## Open questions

- How much of the XP / theme-unlock / bot-skin system becomes the spine versus
  staying decoration (see backlog 6.7).
- Whether the installation is spatial (a fixed arrangement you return to) or
  ordered (a feed that reorders by what needs attention). The first is more
  CoC; the second is more Reddit.
