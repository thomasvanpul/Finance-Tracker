# F5 · Progression — proposal and refusals

Written before code as a gate: if the refusals below cannot be stated
convincingly, the mechanic is wrong and F5 does not ship.

## Proposal (one paragraph)

Progression tracks MAINTENANCE and POSITION only. XP is earned by
actions that make the user's own data more complete, more accurate,
or more owned. There are four earning events:

1. **Completing a Learn topic** — already wired via
   `lib/learn-xp.ts` (30–120 XP per topic). No change.
2. **Creating an auto-categorisation rule** — 25 XP per rule the
   user adds, one-time per rule id. Categorising an individual
   transaction earns nothing.
3. **Reaching a savings goal the user themselves set** — 50 XP per
   goal, awarded once when `current >= target`. Deleting and
   re-creating the same goal does not re-earn.
4. **First successful sync per connection provider** — 100 XP on
   the first time a provider (Wise, Alpaca, Kraken, file, …)
   returns a successful sync. Re-adding the same provider does not
   re-earn.

Total XP determines the level (LEVELS table in `learn-xp.ts`).
Levels unlock cosmetic themes (`THEME_REWARDS.requiredXP`) and
avatar skins (existing `bot-skins.ts`, mapped to level thresholds).
Nothing else is gated. The layer is visible on
`Settings > Appearance` and `/learn` — never on the main dashboard.

## Refusals (non-negotiable)

**This XP mechanic never counts spending.** A £5 coffee earns
nothing. A £5,000 flight earns nothing. There is no XP for a
transaction of any amount, in any category, at any frequency.
Volume of spend is not tracked as a progress signal anywhere in
the code.

**Frequency of activity is not rewarded.** Logging 50 transactions
in a day earns nothing. Opening the app every day earns nothing.
There is no counter of sessions, tabs opened, or clicks — the
absence is deliberate and grepable.

**Debt is not a game.** There is no bar to complete on a credit
card, no fanfare for a settled loan, no leaderboard for who paid
off fastest. Paying down debt earns no XP; taking on debt costs
no XP; a debt is a plan, not a score.

**There is no streak.** Missing a week does not break anything.
There is no "day 7 of 30" badge, no red flag on the app icon, no
timer counting down. No mechanic works by making someone anxious
about missing a day — if it did, it would be out.

**No feature or data is gated on XP.** Every persona sees every
widget on day 0. Every page is reachable from level 0. Every
calculation runs identically at 100 XP and 10,000 XP. Levels only
unlock cosmetic themes and avatar skins the app already ships.

**A user who never earns a single XP loses nothing.** The whole
layer is opt-in-by-visibility. It appears where the user might
find it; it is never pushed onto the dashboard, never a toast,
never a modal, never a badge on any icon.

## Verdict

Refusals hold. Building.
