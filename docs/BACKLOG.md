# Backlog

Outstanding work on Numeris. Analysis lives in `STYLE-INVENTORY.md` and
`MOBILE-INVENTORY.md`; this file is the running list of what is left to do.

---

## 1. Risk — do before schema work or large refactors

### 1.1 Split the dev database from production
One `DATABASE_URL` in `lib/db/.env` serves both. The Vite proxy spoofs `Origin`
to `https://financetracker.work` and rewrites `__Secure-` cookie prefixes, so
local dev holds production session cookies and reads and writes real financial
data. Provision a second Railway Postgres, point local at it, seed it.

### 1.2 Move to real migrations
`lib/db/package.json` has only `push` and `push-force` (`drizzle-kit push
--force`). No migrations directory, no version history, no down path. Add
`drizzle-kit generate`, commit the migration files, delete `push-force`.
Take a production dump before baselining.

### 1.3 Confirm the `dev@bypass.local` account is gone
The code referencing it was removed and deployed. The row in production
Postgres was never confirmed deleted. Delete it, plus its `session` and
`account` rows, or rotate the password.

---

## 2. Mobile

See `MOBILE-INVENTORY.md` Q7 for the full plan and the three overlapping
systems it describes.

### 2.1 URL routing for MobileApp — IN PROGRESS
Steps 1 and 2 fused: `AppScreen` state replaced by wouter location, and the
`location === "/"` gate in `App.tsx` replaced by membership in an explicit
`MOBILE_ROUTES` allowlist. Uncovered routes fall through to desktop unchanged.

### 2.2 Port delete to MobileTransactions, then cover `/transactions`
`pages/transactions.tsx:1776` uses `useSwipeDelete`.
`components/mobile/MobileTransactions.tsx` has no delete of any kind. Until
delete is ported, `/transactions` stays out of `MOBILE_ROUTES` and the `txns`
tab keeps its state-machine fallback.

### 2.3 Remaining MOBILE-INVENTORY steps 3–6
Route-level component swap, removal of dead `isMobile` branches from the 12
now-unreachable desktop pages, a decision on the 11 pages with no mobile
screen, and rationalising the `@media (max-width: 767px)` block.

---

## 3. UI systems

### 3.1 The `index.css` inline-style font-size hack
`[style*="font-size: 36px"] { font-size: 22px !important; }` and siblings.
Mobile typography is a lookup table keyed on serialised inline style text,
enforced with `!important`. It beats inline styles, it is invisible from the
component, it only catches the enumerated pixel values, and it will silently
fight any primitive that sets a font size. Needs replacing with a real
responsive type scale before more primitive work lands.

### 3.2 Flex-container primitive
`STYLE-INVENTORY.md` shapes 2, 8, 9, 10 and 13 are flex row and column
variants, roughly 793 occurrences. Nothing in `components/primitives/` covers
them. Largest single remaining block of the 11,715 inline style objects.

### 3.3 Migrate remaining pages to the primitives
`pages/owing.tsx` is the only migrated page. 239 style objects to 207 there.

### 3.4 Break up the oversized pages
`investments.tsx` 306KB, `analytics.tsx` 193KB, `transactions.tsx` 168KB,
`settings.tsx` 166KB. Layout work inside files this size drifts page to page.
Do this after 1.1, so a mistake cannot reach production data.

---

## 4. Avatars — 3D redesign

Redesign the bot avatars as proper 3D models, authored in Claude Design, with
the ability to swap between them.

Where they live today:
- `src/lib/bot-skins.ts` — skin definitions
- `src/pages/settings.tsx` — `WardrobePanel`, skin labels at 1471 (Classic),
  1477 (Wanderer), 1483 (Minimal)
- `src/components/ai-wanderer.tsx`, `src/components/ai-agent.tsx` — render sites
- Unlocking is gated on XP via `src/lib/learn-xp.ts`

Open questions to settle before starting: what format ships (rendered sprite
sheets, glTF with a light WebGL renderer, or pre-rendered turnaround frames);
whether the XP unlock model carries over; and what this costs on mobile, since
a WebGL renderer for a decorative avatar is a real battery and bundle cost on a
finance app that must load fast.

---

## 5. Smaller items

- **Recharts tooltips.** `accounts.tsx:2892` and `year-review.tsx` 614, 711 use
  `<Tooltip formatter>` returning arrays, so those values get no `.pnum`
  treatment. The app already has a `MonoTooltip` component used elsewhere.
- **Dead root `vercel.json`.** Vercel's project root directory is
  `artifacts/finance-tracker`, so the repo-root `vercel.json` is never read,
  including its `/api` rewrite. Confirm no second Vercel project points at the
  repo root before removing it.
- **Extend motion.** `--ft-motion-fast/base/slow`, `--ft-ease` and
  `--ft-theme-transition` exist in `index.css` and are currently used only by
  the five primitives. Press states, sheet and drawer transitions and tab
  changes can use them. Never animate a numeric value or delay data.
- **`mockup-sandbox` still declares `framer-motion`.** Harmless, no deploy
  target, worth removing if the sandbox stops needing it.

---

## 6. Mobile UX — persona-driven home

Reference points: Wise (one dominant balance, two or three large actions,
everything else behind navigation) and Yahoo Finance (one line per item, large
tap targets, detail on tap). Phone is for efficiency: read fast, act, leave.
Desktop carries the complexity.

**The system already exists.** `src/lib/persona.ts` defines five personas —
`market`, `budget`, `wealth`, `social`, `full` — each with an `enabled` /
`order` / `spans` widget config. The desktop dashboard honours it.
`components/mobile/MobileHome.tsx` is 1,020 lines and references persona
**zero** times. Every user gets the same hardcoded phone screen.

### 6.1 Wire MobileHome to persona
Read the active persona and render its widget set instead of the fixed layout.

### 6.2 Give mobile its own widget budget — DO THIS BEFORE 6.1
`market` enables 5 widgets, `wealth` 10, `budget` 12, `full` 23. Those are
desktop counts. Phone should show 3–4, with the rest behind a "More" affordance.

Critical: persona is shared between desktop and mobile (decided), so a `full`
user gets no benefit from 6.1 alone — they would get all 23 widgets instead of
the current hardcoded set. And `full` is defined as
`enabled: [...ALL_WIDGET_IDS], order: [...ALL_WIDGET_IDS]`, so its order is
just declaration order and carries no priority signal at all.

The cap therefore cannot derive from `enabled`. Add an explicit
`MOBILE_PRIORITY` ordering that applies across all personas, intersected with
whatever that persona enables. `full` then gets the top 4 by global priority.

### 6.7 "Since you last looked" strip — build this first
The retention hook and the most efficient possible screen at the same time,
because it is the only content that cannot be stale. One strip at the top of
MobileHome: which balances moved (Wise auto-sync), what is due soon, what
crossed a threshold. Everything else on the phone is a dashboard the user
could have checked yesterday; this is the only part that rewards reopening.

Note the tension being resolved here: "efficient" means minimising time in the
app, "encouraging to come back" means the opposite. They only reconcile if
something is genuinely new on each open.

Related open question: the XP system (theme unlocks, bot skins via
`lib/learn-xp.ts`) is the existing engagement layer. Decide whether it is
pulling weight or competing for the same attention as this.

### 6.8 Custom personas and onboarding questionnaire — PARKED
Five personas is broad coverage and none of them work well on a phone yet.
Make the existing five excellent on mobile first; that will define what a
custom persona would need to configure. Building the configurator first is
guessing.

### 6.3 Mobile variants of the widgets
Persona picks *which* widgets, not how dense each one is. Financial Health
renders a score plus five progress bars; Wealth Milestones renders four rows of
three figures. Both are sit-and-study desktop widgets. Each needs a phone
variant: one number, one action, tap through for the full version.

### 6.4 Primary action per persona
The Wise lesson via the existing architecture. `social` opens on settle up or
request; `budget` on log expense; `market` on watchlist or quote lookup.
Currently SpeedDial is the same floating button for everyone.

### 6.5 Make alerts actionable
"SHOPPING Budget 99% used this month" is a sentence. It should be a row that
taps through to somewhere the user can change it. Every object on screen should
be somewhere you can manage or clear the thing it describes.

### 6.6 Phone type and spacing scale
Depends on 3.1 being fixed first — the `[style*="font-size"]` `!important`
hack is the current mobile type scale and it has to go before a real one can
land.

---

## 7. Bugs

- ~~**Nested anchors.**~~ DONE (`df93246`). All 4 sites collapsed to the
  wouter v3 pattern.
- ~~**`pnpm dev` builds in production mode.**~~ DONE (`df93246`).
  `NODE_ENV=development` is now baked into the `dev` script. Note the repo
  still needs `PORT=4321 BASE_PATH=/` since `PORT` defaults to 3000 and
  `strictPort: true`, and Obsidian holds 3000.
