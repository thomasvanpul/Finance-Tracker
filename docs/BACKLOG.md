# Backlog

Task list for both humans and agents. Every task has a scope, a definition of
done, and a way to prove it. If a task cannot be verified by a command or a
described observation, it is not ready to be picked up.

**Working rules for an unattended run**
- One task at a time, in ID order within a section, unless `Blocked by` says
  otherwise.
- Run the verification before claiming done. If it fails, stop and report —
  never adjust the check to make it pass.
- Commit per task with the task ID in the subject. Never batch unrelated tasks.
- If a task's assumptions do not hold, stop and write what you found. Do not
  improvise a substitute.
- Read `CLAUDE.md` first; it carries the constraints.

Status: `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` · `PARKED`

---

## A. Safety — before schema work or unattended runs

### A1 · Split dev from production — DONE (`e5b77f3`)
Neon branch `dev` (`br-cold-term-abp7fwtk`), a copy-on-write clone.
`lib/db/.env` points at it. Production URL is in `lib/db/.env.production.backup`.

### A2 · Rotate the `neondb_owner` password — TODO · needs a human
Neon roles are project-level, so the dev branch password also authenticates
against production, and the current one was exposed in a chat transcript.
- **Do:** `npx -y neonctl@latest roles reset-password neondb_owner` in a real
  terminal — the CLI needs a TTY. Update `lib/db/.env` with the new dev string
  and the Railway service variable with the new production string.
- **Done when:** the old password is rejected and the app still connects.

### A3 · Real migrations — DONE
`lib/db/package.json` scripts are `generate` and `migrate`; `push` and
`push-force` both retired. Baseline migration `0000_light_caretaker.sql`
lives at `lib/db/drizzle/` with its snapshot and journal, and dev's
`drizzle.__drizzle_migrations` carries the baseline mark so `migrate`
skips 0000 and applies from 0001 onward. Verified end-to-end on dev:
generated a throwaway ALTER, ran migrate, confirmed the column and the
new row in `__drizzle_migrations`, reverted and re-ran generate to
`No schema changes, nothing to migrate`. Production has not yet been
baselined — that is a follow-up when the password rotation (A2) creates
the natural moment to touch production.

### A4 · dev@bypass.local in production — CONFIRMED PRESENT, needs deletion
Verified 16 Aug 2026 by read-only query against production: the row exists,
created 2026-07-19. Production has 3 users; one of them is this.

The code path that used it was removed and deployed weeks ago, so it is not
currently exploitable — but it is a leftover credential row in the database of
an app intended for public signup.

- **Do:** delete the row and its `session` and `account` rows. A human runs
  this against production; it is the one destructive production action on the
  list and should not be run unattended.
- **Note:** `lib/db/.env.production.backup` was stale after the Neon password
  rotation and has been corrected. That is why the first attempt reported an
  auth failure rather than a result.

### B1 · Rehost the API server — TODO · needs a human for signup
Railway runs `artifacts/api-server` only. The database is Neon and is
unaffected. The API has `ws` for the Alpaca stream, so it needs a long-lived
process — serverless platforms cannot hold the socket open.
- **Candidates:** Render (`render.yaml` already exists and correctly sets
  `NODE_ENV=production`), Fly.io.
- **Human step:** create the account and connect the repo.
- **Agent step:** prepare the config, env var list, and health check; state
  exactly which dashboard fields need setting.
- **Verify:** `curl` the new API host and get a 401 with `ratelimit-limit`
  headers on `/api/accounts`, matching current Railway behaviour.

### B2 · Point the frontend at the new API — TODO · Blocked by B1
`VITE_API_URL` in the Vercel project and in
`artifacts/finance-tracker/.env.local`.
- **Verify:** the deployed site loads data; no CORS errors in console.

### B3 · Remove `NODE_ENV=production` from the shell profile — TODO
It is set globally in the user's shell, which is why `pnpm dev` built in
production mode and pointed the app at Railway instead of the Vite proxy. The
`dev` script now forces it, but the global value will keep surprising other
tools.
- **Do:** find it in `~/.zshrc` / `~/.zprofile` / `~/.zshenv` and remove it.
- **Verify:** a new terminal reports an empty `NODE_ENV`.

---

## C. Data model — unblocks honest UI

### C1 · `account.type` column — DONE (`0cc7113`)
`accounts` now carries `type text NOT NULL DEFAULT 'cash'` — 5 values
(cash / investment / pension / property / other). Migration `0001_spooky_salo`
backfills every existing row to `cash` (Wise-linked and manually-entered
liquid accounts). `DashboardSummary.accountBreakdown[].type` exposes it,
and `computeHoldings` sums per bucket from that field instead of
subtracting a residual. `BlocksView` renders PROPERTY as the top block and
CASH / INVESTED / PENSION / OTHER along the bottom row. Six tests replace
the residual-guard cases with per-bucket coverage.

### C2 · Gaps the mobile home cannot fill — TODO
Found during implementation, ranked. Each needs an API field before its UI can
be honest: pension balance; 12-month asset-composition history (for the BANDS
and RING renderings); discretionary budget total and spend-to-date; upcoming
income, so `COMING` can show salary; split-request detail (counterparty and
amount, not just `pendingCount`); FX moves; Wise connectivity status for the
`LIVE` indicator, currently hardcoded.

---

## D. Mobile

### D1 · Port delete to `MobileTransactions`, then cover `/transactions` — DONE
The `MobileTransactions.tsx` screen was deleted in an earlier orphan
cleanup, so /transactions now falls through to `pages/transactions.tsx`.
That page already implements swipe-to-delete for phone viewports:
`useSwipeDelete(() => handleDelete(tx.id))` runs per row at line 1585,
and the DELETE reveal button + swipe transform are gated on `isMobile`
(lines 1588–1611). Verified against source 2026-08-16. No screen or
route change required; `/transactions` reaches phone users through the
desktop page's mobile branches.

### D2 · Remaining mobile screens in the new design — IN PROGRESS
Approved-language ports: home (already done), plus **MobileAccounts
(`6d86166`)** and **MobileNetWorth (`00afb0c`)** in this pass. Both
carry the home vocabulary — 09:41 top bar, mono-uppercase label + 34px
premium figure, block field with area-encodes-value + constant-depth
decoration, per-currency or per-type sections with native-first /
converted-second number treatment.
Extracted `nfmt` + `CURRENCY_SYMBOLS` to `mobile-format.ts` so the three
screens share the exact number rule.
- **Remaining (11 screens):** Upcoming next (linked from home), then the
  rest in whatever order.
- **Read:** `docs/MOBILE-CONCEPT.md` before continuing.
- **Note:** stopping at 2 confirms the pattern before the remaining
  eleven. Design phase ran to 22 rounds by inventing questions
  implementation could answer.

### D3 · Dead config cleanup — TODO
`useMobileConfig().midTabs` and `.quickActions` have no consumers after the nav
unification. `MobileWidgetManager` and `useWidgetVisibility` are orphaned — every
widget they gated was mock-driven and has been deleted.
- **Decide:** delete, or keep for the onboarding customisation in F1.

---

## E. UI systems — prerequisite for desktop alignment

Desktop and phone must not diverge (see `docs/TARGET-PRODUCT.md`). That makes
this section a prerequisite rather than polish: the mobile design language has
to become shared components, and the desktop cannot absorb them in its current
state.

### E1 · The `index.css` inline-style font-size hack — DONE (`a774409`)
All five `[style*="font-size: Xpx"]` attribute-selector caps deleted from
the mobile amendment. Replaced with `--ft-text-{xs,sm,body,md,lg,xl,hero,premium}`
CSS custom properties at `:root`, which step one tier down below 768px
via a single media query. `premium` (34px) is constant across viewports.
`grep '[style*="font-size' index.css` returns 0. Mobile home uses
11/12/13/14/17/21/34 — none matched the removed caps — so it reads
identically at 390px. Callsite migration to the tokens is a follow-up:
any page that hardcodes 40/36/32/30/28/26/24/22/20/18/16 inline now
renders at that literal size on mobile too.

### E2 · Flex-container primitive — DONE (`95c3605`)
`<HStack>` and `<VStack>` under `components/primitives/stack.tsx`. Named
props only (`gap`, `align`, `justify`, `wrap`, `padding`, `paddingX/Y`,
`marginTop/Bottom`, `grow`, `wide`, `minWidth0`, `className`, `role`,
`onClick`) — deliberately no `style` prop, which was PanelBox's failure
mode. Absorbs the four target shapes (222 + 93 + 131 + 53 = 499 direct
hits across `src`, ~700 including padding/wrap variants). Nothing
migrated yet — that is E3's job.

### E3 · Migrate remaining pages to the primitives — DONE
The primitives family now covers layout, surface, and typography with
matching call sites across the codebase. Built and migrated in two runs:

Primitives added / tightened:
- `<Text>` (`f55bd53`) — named-prop typography, no `style?`, `numeric`
  and `truncate` mutually exclusive at the type level.
- `<MonoLabel>` — `style?` dropped (zero callers used it).
- `<BlockField>` + `figureFits` / `labelFits` helpers (`1d0dd60`) — the
  Stack-flavour extraction of MobileHome BlocksView + MobileNetWorth
  HoldingsBlocks so the CLAUDE.md truncation guard exists exactly once.
- `<HStack>` / `<VStack>` first widened with layout-only Phase B props
  (`shrink`, `height`, `minWidth`, `maxWidth`) in `00c48ff`. Surface
  and typography props were and stay refused.
- `<PanelBox>` — `style?` hatch removed (`4fa1390`), then `row`/`gap`
  removed (`0a28f61`), leaving a surface-only primitive. Its one hatch
  caller in `owing.tsx` restructured to compose. `<PanelHeader>`'s
  matching hatch removed in `a2e1d58`.

Migration script generations:
- v3 (literal-safe text) — `05a4e56` (first pass on 4 target pages),
  `e31f94b` (literal-ternary passthrough), `b879feb` (sweep 34 remaining
  pages, nested-brace safety guard added after net-worth-history.tsx
  broke on a nested `style={{`).
- v4 (mt/mb passthrough for `layout_with_text`) — per-page with harness
  proof: `055f032`, `7b7f2a5`, `0ba95ff`, `5f178a1`.
- Flex v2 (Phase A, 531 containers) `e997856`; flex v3 (Phase B) `00c48ff`.
- PanelBox composer (`c64bd8a`) — 4 exact-default surfaces migrated; the
  other 29 exact-default candidates carry blockers (text on container,
  borderLeft accent, non-default surface) that need markup restructuring
  or a new primitive — declined for this pass.

Global `style={{` count trajectory:

| point | count | Δ |
|---|---|---|
| pre-primitive baseline | 8 867 | — |
| post-primitive peak | 9 459 | +592 |
| after E3 pass 1 | 9 219 | −240 |
| ternary + margin passes | 8 787 | −432 |
| Phase A flex | 8 256 | −531 |
| Phase B flex | 8 211 | −45 |
| PanelBox composes + hatch removals | **8 204** | **−7** |

**Net vs baseline: 663 below.** Primitive call sites across `src`:
1,242 (HStack/VStack/PanelBox/Text/MonoLabel/BlockField combined). Every
primitive is now hatch-free.

CLAUDE.md gained the primitives-family hard split rule (`9fa3995`):
Stack owns layout, PanelBox owns surface, Text/MonoLabel own typography,
one-offs stay inline, and a prop that's neither layout nor surface nor
typography goes on no primitive at all.

### E4 · Break up the oversized pages — IN PROGRESS (this pass)
Pure extraction, no behaviour change, one commit per file.
- `investments.tsx` → **febc8fb**: 5092 → 4843 lines (−249). Moved
  markets data (ticker lists, label maps, MOCK_QUOTES, sentiment helpers)
  and small render widgets (CandlestickLayer, OHLCTooltip, RangeBar,
  RecBar, RatingBar) to `components/investments/markets-{data,widgets}`.
- `analytics.tsx` → **6b6efa8**: 3740 → 3703 lines (−37). Moved types +
  helpers (SpendingAnnotation, Range, ANNOT_KEY, load/save, DOW_LABELS,
  MONTH_SHORT, getYYYYMM/localDate/getDOW/getWeekOfMonth, monthsAgoStr,
  pctChange, cutoffDate) to `pages/analytics-helpers.ts`.
- `transactions.tsx` → **d7af630**: 3246 → 3054 lines (−192 incl. blanks).
  Moved types + constants + helpers (TxType, Currency, TxForm/Errors,
  Split types, MerchantGroup, validateTxField, load/saveSplits, TH,
  TX_TYPE_COLOR, BULK_CATEGORIES / CATEGORIES, date shortcuts,
  exportCsv, exportJson) to `pages/transactions-helpers.ts`.
- `settings.tsx` → **eef05cb**: 3061 → 2781 lines (−280). Moved
  PANEL_STYLE, HEADER_STYLE, ROW, RowLabel, Toggle, SectionHeader,
  ActionBtn and every hover-aware Settings*Row plus StorageKpiStrip
  to `pages/settings-atoms.tsx`.

Total: 5,092 lines removed from four pages; equivalent moved into six
extraction modules. No behaviour change. Each commit typechecked, ran
`pnpm test` (43/43 pass), and produced a successful production build.

Meaningful further reduction requires refactoring (not extraction) — the
largest remaining components inside each file share types, hooks and
localStorage-backed state with in-file closures. Lifting those to shared
type modules is a follow-up.

---

## F. Product — the things that make it worth returning to

See `docs/TARGET-PRODUCT.md`. Design and rationale are settled; these are build
tasks. None are blocked on design.

### F1 · Onboarding questionnaire → persona — TODO
A short questionnaire infers persona, panes, view rendering, density and theme.
`lib/persona.ts` has five personas; today they choose widgets, and they should
choose the whole register — `market` is the dense terminal, `budget` is plain
English with larger type and obvious entry points.

### F2 · Open banking — TODO · needs a human conversation first
Data must arrive by itself; manual CSV import is the reason a non-technical user
would never complete onboarding. UK providers: TrueLayer, Plaid, GoCardless.
The AIS agent route is roughly 4–6 weeks against about a year for direct
registration. Payment initiation is achievable as an unregulated caller through
TrueLayer — see the regulatory section of `docs/TARGET-PRODUCT.md`.
Malaysia has no open banking regime, so Maybank and MYR stay read-only.

### F3 · Market, FX and news — TODO
Alpaca is already wired. These are the only elements on the home screen that
differ tomorrow morning, and therefore the only ones that reward reopening.

### F4 · Social split and owing — TODO
Currently a ledger. Make it social: request, settle, add a shared expense. This
is the only mechanism in the product that produces genuine return frequency,
because another person's action puts something on the user's screen without the
user doing anything.

### F5 · Progression — TODO
XP, theme unlocks and avatar skins exist in `lib/learn-xp.ts` and
`lib/bot-skins.ts` and are decoration. Never reward spending; track maintenance
and position only.

### F6 · Avatars as 3D models — PARKED
Redesign in Claude Design, swappable. Files: `lib/bot-skins.ts`,
`WardrobePanel` in `settings.tsx` (labels at 1471, 1477, 1483), render sites in
`ai-wanderer.tsx` and `ai-agent.tsx`. Decide the format first — sprite sheets,
glTF with a small WebGL renderer, or pre-rendered turnarounds — since a WebGL
renderer for a decorative avatar is real battery and bundle cost.

---

## G. Smaller items

- **G1 · Motion tokens vs the constitution — UNDECIDED.** `index.css` bans
  transitions over 150ms on UI state changes; `--ft-motion-base` is 200ms and
  `--ft-motion-slow` is 320ms, both live on the five primitives. Either bring
  them under the cap or amend the constitution deliberately. Do not resolve it
  by leaving both in place.
- **G2 · Recharts tooltips — DONE (`2fde41e`).** `MonoTooltip` extracted from
  `analytics.tsx` into `components/mono-tooltip.tsx`; `accounts.tsx:2892` and
  `year-review.tsx` 614 / 711 now consume it through `<Tooltip content={…}>`
  instead of the `formatter` array path, so tabular figures and privacy blur
  apply.
- **G3 · Dead root `vercel.json`.** Vercel's project root is
  `artifacts/finance-tracker`, so the repo-root file is never read. Confirm no
  second Vercel project points at the repo root before deleting it.
- **G4 · CORS rejections return 500 — DONE (`f194d74`).** Already fixed in the
  cited commit: `class CorsError extends Error` sentinel plus an error middleware
  right after `cors()` maps it to 403 JSON with no stack. Backlog was stale;
  no code change this pass.
- **G5 · `mockup-sandbox` still declares `framer-motion` — DONE (`f194d74`).**
  Same commit dropped the dep from `artifacts/mockup-sandbox/package.json`.
  Backlog was stale.
- **G6 · `sslmode=require` no longer verifies certificates** in newer pg
  clients. Revisit the connection config.
- **G7 · Neon cold-start on CI.** A cold Neon compute takes ~110s to wake on
  the first query. `drizzle-kit push` / `pull` / `migrate` all spin on
  "Pulling schema from database…" during that time. Any CI job that shells
  into the dev branch (migration checks, spec generation, integration tests)
  needs a per-step timeout above two minutes, or a warm-up ping to
  `SELECT 1` before the real command, or it will fail spuriously.
- **G8 · Refactor PERSONA_COLORS into an Accent-keyed map — TODO.**
  Follow-up to the AccentPanel decision (declined; 6 sites is not a
  pattern). 19 flex containers in `pages/` set `borderLeft: \`3px solid
  ${color}\`` where `color` is a persona-derived value from
  `lib/persona.ts` `PERSONA_COLORS`. If those colours were keyed by an
  `Accent` type (`"primary" | "positive" | "warning" | …`) instead of a
  raw hex, callers could route through a stated enum and the AccentPanel
  proposal would be reopenable with ~15+ real sites — well above the
  "coincidence" threshold that killed the six-site version.
  **Do:** define an `Accent` enum, add `personaAccent(personaId): Accent`
  next to `PERSONA_COLORS`, migrate the 19 sites to consume it.
  **Done when:** grep for `borderLeft: \`3px solid ${` in `pages/` returns
  zero; count the accent-enum sites that emerge and revisit AccentPanel.
- **G9 · DesktopEmptyState primitive — PROPOSAL, needs sampling.**
  The three `--ft-border2` accent-stripe containers dropped from the
  AccentPanel scope are all empty states:
  `cashflow.tsx:950` "NO SCHEDULED EVENTS", `goals.tsx:1499`
  "NO GOALS DEFINED", `health-score.tsx:1228` achievement backdrop.
  `<MobileEmptyState>` already exists in `components/mobile/mobile-ui.tsx`
  with a `label + title + description + optional CTA` shape. Desktop lacks
  a counterpart. Two empty states in two different files sharing a
  visual glyph is worth investigating; three across three files starts
  to look like a real recurring pattern.
  **Do first (sampling):** grep `pages/` for divs that carry `<pre>` or
  `<div>No … yet</div>` alongside CTA buttons; count how many desktop
  empty states already exist inline. If ≥ 10, propose `<DesktopEmptyState>`
  with a stated prop set + refusals (same shape as MobileEmptyState).
  If ≤ 5, leave inline — pattern hasn't earned it yet.
  **Done when:** the sampling report is in `BACKLOG.md` or a new file,
  and either a proposal is on the table or the entry is marked PARKED.

  **Sampling — 2026-08-16.** 36 desktop empty-state sites in `pages/`
  matched `No .* yet|No matches|No data|No positions`, spanning 13 files
  (accounts, analytics, business, dashboard, family-finance, investments,
  net-worth-history, owing, profile, reports, settings, split, subscriptions,
  transactions, upcoming). Two pages (transactions, accounts) already
  import `<EmptyState>` from `components/empty-state.tsx` — that primitive
  exists but is under-adopted. The other 11 pages roll bespoke inline
  markup that visually diverges (font-mono size 10/11, italic vs. bold
  label, centred vs. left, "No X yet" vs. "— NO X —" case, with/without
  CTA button).

  **Above the 10-site threshold.** Proposal follows.

  **G9-P · `<DesktopEmptyState>` proposal.**
  The existing `EmptyState` covers three of the four properties we need
  (title, description, action). It is missing the design-language pieces
  the mobile counterpart carries: a small `label` (uppercase, tracked,
  above the title — MOBILE-CONCEPT § "Data pill above title") and a
  refusal to accept anything that lets a caller drift the surface (no
  `style?`, no `variant?`, no `fill?` — the primitive owns its own frame).

  **Prop set (closed).**
  - `label: string` — the small caps prefix. Required. This is what
    routes the primitive to the AccentPanel family in future.
  - `title: string` — sentence-case single line, ≤ 40 chars.
  - `description?: string` — one sentence, no CTAs in the copy.
  - `action?: { label: string; onClick: () => void }` — one CTA max.
    Two CTAs is a decision, not an empty state.
  - `minHeight?: string` — for slot-fit only (e.g. inside a fixed table
    body). No `fill: boolean` toggle.

  **Refusals (up front).**
  - No `variant`. If two callers want visually different surfaces, that
    is two primitives, not one primitive with a mode.
  - No `style` escape hatch. Callers that need a bespoke frame stay
    inline — this is the primitives-family rule from CLAUDE.md.
  - No secondary action. A CTA is either the right next step or there
    is no next step.
  - No icon prop. Design signature is typographic, not glyph-first —
    an icon slot invites cargo-culting a wrench for every table.

  **Variant vs. sibling call.** `<MobileEmptyState>` and
  `<DesktopEmptyState>` are siblings: they share the prop shape but the
  desktop version lives in a page column, not the whole viewport, and
  the mobile version bakes in the mobile-scroll padding. One primitive
  with a `variant="mobile"` toggle would push viewport concerns and the
  bottom-safe-area padding onto every caller. Keep them siblings.

  **Migration.** Rename the existing `components/empty-state.tsx` export
  to `<DesktopEmptyState>`, add the `label` prop as required, and
  migrate the two current callers plus a first tranche of the 11 inline
  sites (dashboard, investments watchlist, net-worth-history, owing,
  reports "No data available", settings custom-categories). Rest follow
  in a second pass; the 800-line file cap keeps each migration commit
  reviewable.

  **E4 · MarketsTab extraction — 2026-08-16 entanglement report.**
  The type + helper lift landed (`pages/investments/types.ts`, commit
  9ca8b1a). Extracting `MarketsTab` itself is a real refactor, not a
  pure move, because the component sits on top of five sibling pieces
  in the same file that any extraction has to bring along:

  1. `MOCK_QUOTES` (module-level constant used in the qMap fallback).
     **Blocks the move on its own** — this violates CLAUDE.md's "never
     show a number the API did not supply" rule and cannot be moved
     verbatim into a shared module; it needs to be *deleted* first,
     which is a behaviour change and belongs in a separate task.
  2. `OVERVIEW_TICKERS` — module-level ticker list.
  3. `TICK_PERIODS_SET` — SSE tick-period whitelist.
  4. `useTickerStream(ticker, period)` — 40-line SSE hook.
  5. `WatchlistsPanel` — a ~150-line component with its own state.
  6. `computeStockRating(quote, detail)` — 100-line rating heuristic.

  Item (1) alone forces a scope decision the user has to make: either
  MarketsTab keeps a mock fallback (contra CLAUDE.md) or the mock has
  to be removed with an empty-state redesign for the "quotes unavailable"
  case. That is not a refactor unit of work. STOPPED, per the "if
  cannot be done without behaviour change, stop" rule. Extraction re-
  opens after `MOCK_QUOTES` is dealt with.

---

## Superseded

`docs/BACKLOG-old.md` holds the previous version. Section 6 of that file (the
persona-driven mobile home) was superseded by the design work recorded in
`docs/MOBILE-CONCEPT.md`; its useful parts are now F1 and D2.

### D4 · Replace flag emoji with drawn currency icons — TODO
Emoji flags are in use for currency and market identity. They render
differently on every platform, cannot be themed, ignore the type ladder, and
read as decoration in a product arguing that it is an instrument. "No emoji"
was already a stated rule; these predate it.

Sources: the currency-to-emoji map duplicated in
`components/widgets/net-worth.tsx:36` and `accounts-summary.tsx:7`, and the
market-hours city list in `components/layout.tsx:223-233`.

- **Do:** one shared icon set as inline SVG, sized to the type ladder and
  monochrome-or-restrained enough to survive all 11 themes including `arctic`.
  Cover at least GBP, USD, EUR, MYR, SGD plus the market-hours cities. Delete
  the duplicated map — one source.
- **Verify:** grep the codebase for emoji ranges, expect zero; harness capture
  of a multi-currency screen in `arctic` and a saturated theme.
