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

### A2 · Rotate the `neondb_owner` password — DONE
Neon roles are project-level, so the dev branch password also authenticates
against production. The compromised password was rotated by hand (the
neonctl CLI needs a TTY); `lib/db/.env` and the Railway service variable
now carry the new string. Old password no longer authenticates, app still
connects — verified out-of-band, no repo evidence.

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

### A4 · dev@bypass.local in production — DONE (16 Aug 2026)
Deleted by Thomas; verified absent by read-only query. It had 319 live session
rows. **The safety list is now clear.**

### A4-old · superseded
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

### B1 · Rehost the API server — DONE (18 Aug 2026)
Live at `https://numeris-api.onrender.com`, Render free tier, Frankfurt.
Verified externally: `/api/healthz` 200, `/api/accounts` 401 with
`ratelimit-limit: 300`.

Four failures on the way, worth recording so they are not rediscovered:
1. `corepack enable` cannot write to `/usr/bin` on Render (EROFS). Use
   `npx --yes pnpm@<version>` instead.
2. `ERR_PNPM_IGNORED_BUILDS` on esbuild. **pnpm 11 removed
   `onlyBuiltDependencies` and `ignoredBuiltDependencies` and replaced both with
   `allowBuilds`**, a dictionary. The old keys are silently ignored and
   `strictDepBuilds` now defaults true. Invisible on macOS because esbuild's
   postinstall only triggers on Linux.
3. `package.json#pnpm` is no longer read by pnpm at all.
4. The health check pointed at `/api/accounts`, which sits behind `requireAuth`
   and returns 401 — Render read that as unhealthy and timed out while the
   server was up and answering. `/api/healthz` already existed, mounted before
   `requireAuth`.

Free tier caveats: spins down after ~15 min idle (measured 62s cold start), and
bandwidth is billable above 5 GB/month at $0.15/GB even on free.
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

### C2 · Gaps the mobile home cannot fill — DONE
Three of four were already satisfiable from existing data and needed wiring only:
pension, upcoming income, split detail. Only asset-composition history needed a
table (nw_snapshots); past months without a snapshot render dotted rather than
backfilled from current values.
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

### D2 · Remaining mobile screens in the new design — DONE (12 ports + normalise + fixes)
All 12 numbered mobile ports landed:
`ca7bee9` (UpcomingFull) · `9535f09` (Budget) · `b509cbe` (Subscriptions) ·
`5bfd41c` (Owing) · `04bc379` (Goals) · `bb9a649` (Investments) ·
`7437453` (Reports) · `ebc0893` (Analytics) · `6ed7c76` (More) ·
`2bc7f7b` (Settings) · `5fea894` (Personalize) plus the earlier
UpcomingFull follow-ups. Three primitives-normalise passes brought
Home / Accounts / NetWorth onto HStack/VStack/Text/MonoLabel
(`4fdb6f4`, `007255a`, `132e061`). `nfmt` + `CURRENCY_SYMBOLS` live
shared in `mobile-format.ts`.

### D3 · Dead config cleanup — DONE (`be54cb7`)
`useMobileConfig().midTabs` / `.quickActions`, `MobileWidgetManager`,
and `useWidgetVisibility` all deleted; every consumer was another
dead file in the same cluster.

### D4 · Full iPhone-native mobile redesign — SCOPING (26 Aug 2026)
Thomas dropped the mid-September App Store date on 26 Aug 2026 with
"ship it right rather than ship it soon" and chose a full iPhone-
native mobile redesign. The earlier phased plan (ship the current
mobile ports behind the tab bar and iterate later) is SUPERSEDED.

**Scope decision (open):** which routes get a dedicated `Mobile*`
shell versus which stay desktop-only-on-mobile versus which merge.
Instinct from Thomas: `/upcoming` + `/subscriptions` + `/recurring`
may collapse into one surface. Independent analysis pending in the
session note. Do NOT start any redesign work until the tab structure
is agreed — it's a product decision, not a build decision.

**Blocking bug fixed (26 Aug 2026):** `safe-area-inset-top` was
used in exactly ONE place (`components/mobile/MobileApp.tsx:75`)
while `safe-area-inset-bottom` was used in 22. Every mobile-reachable
surface that renders top chrome outside `MobileApp`'s padded wrapper
had the iOS status-bar clock drawing directly over it. Fixed by
adding safe-area-top to three root containers:
  - `components/layout.tsx:1898` — `.ft-header`, fixes all 25
    desktop-fallthrough routes at once
  - `components/onboarding.tsx:120` — first-run persona questionnaire
  - `components/auth-gate.tsx:783` — sign-in / sign-up screen
Verified: typecheck clean, 160/160 tests green. Onboarding-wizard
(centered modal, not top chrome) intentionally not touched.

### D5 · Lock: every mobile-nav route resolves to a `Mobile*` component — PROPOSED
Class of bug this prevents: adding a route to `MOBILE_ROUTES` (in
`components/mobile/MobileApp.tsx`) without adding the matching
`AppScreen` render branch, or removing a `Mobile*` render branch
without dropping the path from `MOBILE_ROUTES` — either produces a
route that resolves to the fallback `screen === "home"` and silently
serves MobileHome under a wrong URL. See D5 in the session note for
the AST design and the honest "what it can't catch" section.

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

### E4 · Break up the oversized pages — PARTIAL
investments.tsx 4,874 -> 2,743 via the MarketsTab extraction. The other three
(analytics, transactions, settings) had only pure-extraction passes; their large
components share closures and need real refactoring, not moves.
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

### F1 · Onboarding questionnaire → persona — DONE
Server-side persistence in `66f72e9` (F1a: `app_settings.persona`
column + `/settings/persona` route + tests). Three-question
inferring questionnaire in `9bbe0c2` (F1b: `inferPersona`
table + skip=full + `persona-sync` server hydration). Persona-
gated providers and empty state in `2952676` (F1c). Persona
consequences shipped across items 1-10:
- Item 1 (`51fb1de`)  desktop empty state + provider filter
- Item 2 (`209cc8f`)  sidebar/consumers reactive
- Item 3 (`b643385`)  default landing page reactive
- Item 4 (`a382290`)  KPI bar contents by persona
- Item 5 (`bb7aa0d`)  notification alerts filtered
- Item 6 (`dc9ef02`)  decision-engine + AI coach
- Item 7 (`a4b146f`)  command palette scope
- Item 8 (`da26e7c`)  quick-add defaults
- Item 9 (`d409192`)  MobileHome hero for market
- Item 10 (`092496f`) mobile bottom-nav labels
- Item 11 (`5192550`) sync-now button label by persona
- Item 12 (`59db4f0`) onboarding follow-up destination
- Item 13 (`ccdbe0f`) widget catalogue sort + tag by persona
- Item 14 (`e91cdfd`) CSV preset order by persona

Item 15 (strings layer) is a proposal, still not built. Recounted
after items 11-14 shipped: **100 persona-varied user-visible strings**
against a 300-string break-even. Distribution:

- `lib/persona.ts` — 75 strings
  - `PERSONAS[]` (label + tagline + description + 4 highlights, × 5): 35
  - `PERSONA_INSIGHT_PREVIEWS` (3 previews × page+msg, × 5): 30
  - `PERSONA_FOCUS`: 5
  - `syncCta()` (item 11): 5 return paths
- `components/kpi-bar.tsx` — 20 (4 labels × 5 personas)
- `components/mobile/MobileNav.tsx` — 4 (slot-2 tab labels)
- `pages/settings-atoms.tsx` — 1 (item 13 "For your persona" tag)

Not counted: persona filter tables that return `Set<Kind>` (decision
kinds, alert kinds, command-palette section IDs). Those are routing
identifiers, not strings the user reads.

Break-even is 200 strings away. To triple the count and get near it
we'd need to touch every persona-conditional feature with new copy
— roughly every mobile screen's empty state, every export preset,
every AI coach prompt template. That work isn't on the roadmap.
Verdict unchanged: don't build the strings layer.

### F2 · Open banking — PARKED (see H4)
Superseded by the H series: connection model + Wise/Alpaca/Kraken
adapters. H4 (Enable Banking) is code-complete and parked because
Restricted Production only covers accounts the developer personally
links; see `docs/OPEN-BANKING.md` and `docs/H4-ENABLE-BANKING.md`.

### F3 · Market, FX and news — DONE (`57091ab`, news commit)
MarketPane ships position-relevant prices and FX. News built and filtered to held
tickers and currencies. **Measured survival on a real 47-item Yahoo pull: 0% for a
budget persona, 2.1% market, 6.4% full analyst.** The filter works; a general feed
is near-worthless once it is applied, and per-ticker fetching is already 100%
relevant by construction. Ringgit-anchored news needs a Malaysian source
(Bernama, The Star, Bank Negara) — not built.
Mobile home MarketPane ships live prices for tickers the user
already holds and FX pairs for held foreign currencies. News feed
is not built.

### F4 · Social split and owing — DONE
Shared expense as a first-class object landed across five commits:
- F4-1a (`21f502c`) schema + migration for shared_expenses,
  shared_expense_participants, shared_expense_settlements
- F4-1b (`869fd2e`) split-rule pure logic (equal / exact / shares) with
  the remainder-pence rule and 26 tests
- F4-2 + F4-3 (`276814f`) CRUD + settlement handshake API +
  predicate-aware multi-tenancy test (10 cases prove user A cannot
  read or mutate user B's expenses beyond the specific shared object)
- F4-4 (`767c4b5`) notifications wired (shared-expense AlertKind,
  persona filter: social + budget + full see them, market + wealth
  do not; social floats them to the top of each level bucket)
- F4-5 (`a6f4205`) minimal UI at `/shared` for create + list + settle

Bank-payment initiation (TrueLayer, F4's "one level under moving
money") is deliberately NOT built here. That is a separate decision
gated on FCA-related work; see `docs/TARGET-PRODUCT.md` § Payments.

### F5 · Progression — DONE
Four earning events, all maintenance or position. Locked by 35 assertions that grep
the XP module for banned concepts and require every amount to be a named XP_*
constant. Refusals: never spending, never frequency, never debt, no streaks, no
feature or data gating, cosmetic unlocks only.
`lib/learn-xp.ts` and `lib/bot-skins.ts` still decoration; no
event stream wires user actions to XP.

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
  clients. Revisit the connection config. Status 2026-08-17:
  `lib/db/.env` still uses `sslmode=require&channel_binding=require`;
  no change committed. Move to `verify-full` explicitly (or
  document why `require` is acceptable for the dev branch).
- **G7 · Neon cold-start on CI.** A cold Neon compute takes ~110s to wake on
  the first query. `drizzle-kit push` / `pull` / `migrate` all spin on
  "Pulling schema from database…" during that time. Any CI job that shells
  into the dev branch (migration checks, spec generation, integration tests)
  needs a per-step timeout above two minutes, or a warm-up ping to
  `SELECT 1` before the real command, or it will fail spuriously.
- **G8 · Refactor PERSONA_COLORS into an Accent-keyed map — DONE (`e214506`).**
  `PERSONA_ACCENT` (persona → accent slug) and `ACCENTS` (closed
  enum) landed; `PERSONA_COLORS` derives from both so persona
  colour and accent token can no longer drift. Below is the
  original proposal, kept for context.

  ~~Original TODO description:~~
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

  **Above the 10-site threshold.** Proposal follows. Status
  2026-08-17: proposal only — the primitive has NOT been built
  and no migrations landed. Whoever picks up G9 next should
  implement the prop set below, migrate the existing two
  `<EmptyState>` callers first, then work through the 11 inline
  sites listed.

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

  **E4 · MarketsTab extraction — DONE (`a88f5d0`).** The
  MOCK_QUOTES blocker was resolved (the constant no longer exists;
  only a stale comment reference remains in
  `chart-analysis-modal.tsx:239`). `pages/investments/markets-tab.tsx`
  now holds the MarketsTab component with its five sibling pieces.
  `investments.tsx` is 2,753 lines (was 5,092 at the start of E4);
  `markets-tab.tsx` is 2,047 lines.

- **G10 · api-server suite intermittently loses ~5 tests — INVESTIGATE
  after mobile.** Observed once in ~8 runs: 5 failed / 294 passed for
  `pnpm --filter @workspace/api-server test --run`, all from a single
  test file whose name I could not identify in that run because the
  output scrolled. Every run prints
  `ERR_ERL_KEY_GEN_IPV6` warnings from `express-rate-limit` in
  `app.rate-limit.test.ts` (21 tests) and `app.ai-limiter.test.ts`,
  both timing-dependent and the obvious first suspects. Suite is fine
  in seven of eight runs. A suite that fails one run in eight is a
  suite that will start being ignored — kill the flake before that
  happens, but do not chase it now.
  **Done when:** the failure is reproduced with `--reporter=verbose`,
  the specific test names named here, and either fixed or explicitly
  marked flaky with a stated cause. If it turns out to be a real bug
  the description is upgraded.

- **G12 · Sign-in screen is the FIRST thing App Review opens — needs its
  own pass + a demo account in App Store Connect review-notes.** A
  reviewer who cannot sign in files a rejection without opening
  anything else, so the login/signup surface is the highest-blast-
  radius screen in the whole submission. Thomas's own description
  after touching it on device: "always been a big damn mess" — he
  cannot tell which account to use, and if the person paying for the
  app cannot, a reviewer with two minutes and a checklist certainly
  cannot.
  **Two separable problems, both required:**
    (1) The screen. Sign-in vs sign-up affordance, passkey vs email
        clarity, error rendering, forgot-password discoverability.
        Currently mixes all four flows in one form and the primary
        action changes label based on hidden state.
    (2) The reviewer path. App Store Connect review-notes must carry
        a working demo email + password, an explanation of what to
        click to sign in with it, and any 2FA test codes. Missing
        credentials in review-notes is a Guideline 2.1 rejection on
        its own.
  **Done when:** (a) the sign-in/up screen has been redesigned and
  shipped with the primary path visible in five seconds by someone
  who has never seen it, and (b) App Store Connect submission
  includes a demo account whose credentials the reviewer can copy-
  paste, with review-notes text that says exactly what to do.
  **Blocked by:** G13 (native auth architecture — resolves what
  "signing in" even means on native). Design pass on the screen can
  proceed in parallel; the demo account cannot be created until we
  know whether native auth uses bearer tokens or session cookies,
  because the fixtures differ.

- **G13 · Native auth architecture — DONE (26 Aug 2026).** Device
  test passed on real iPhone; sign-in, session persistence, and
  authenticated calls all wire the bearer token as designed.
  Historical context below is retained because the checklist is the
  reference for any future native-auth regression. Decision: option 3 (better-
  auth `bearer` plugin) over CapacitorHttp because the AI-chat SSE
  stream depends on `Response.body` streaming which CapacitorHttp
  does not support (the streaming Coach and floating assistant are
  headline features and can't break silently on native). Landed
  across five commits:
    1/5 · server: `bearer()` plugin + twoFactor issuer 'Fintrack' → 'Numeris'
    2/5 · client: `lib/native-auth.ts` + `setAuthTokenGetter` wiring
    3/5 · retrofit 10 direct `/api` fetch sites through `apiFetch`
    4/5 · hide passkey in native + auth-errors correctness fix
          (no more "Something went wrong on our end" for requests
          that never left the device)
    5/5 · lock #17 (no raw `fetch("/api/…")` outside `apiFetch`) +
          this manual checklist
  Locked at the source-scan level by lock #17 in
  `artifacts/finance-tracker/src/lib/api-fetch.lock.test.ts` (a new
  raw /api fetch fails a test naming file:line before it can ship
  and silently break native).

  **Environment (Render):** set `ALLOWED_ORIGINS` to include
  `capacitor://localhost` so the CORS middleware doesn't reject
  requests from the native shell. Existing web origin unchanged.

  **Environment (native build):** set `VITE_NATIVE_API_URL` at
  build time to the production API URL (e.g. `https://finance-
  tracker-api.onrender.com`). Only used when
  `Capacitor.isNativePlatform()` is true; web bundle ignores it.

  **Runtime verification checklist — must be walked on device.** The
  automated tests cover shape (types, source patterns, hit lists).
  They cannot cover "does bearer flow actually work on iOS". Every
  step below is a real device / simulator interaction. A mocked
  version would pass against broken code and is worse than no test:

    [ ] `npx cap sync ios && npx cap open ios` builds without error
    [ ] App launches on iOS Simulator; blank page or launch fail
        means the webDir bundle isn't packaged (see 726c01f)
    [ ] Sign-up POST /api/auth/sign-up/email visible in Xcode
        network inspector, target = the VITE_NATIVE_API_URL host,
        response is HTTP 200
    [ ] Sign-up response carries header `set-auth-token: <opaque>`
        (better-auth's bearer plugin — see G13 · 1/5)
    [ ] IMMEDIATELY after that POST returns, the very next request
        (typically GET /api/auth/get-session fired by useSession)
        carries `Authorization: Bearer <same token as set-auth-
        token above>`. THIS IS THE STEP THAT CAUGHT THE 28-Aug
        FAILURE — token capture was wired, token SENDING via
        authClient's own $fetch pipeline was not. If the header is
        absent, the session flip never happens and the app is stuck
        on the auth gate. Do not accept "sign-up worked, session
        will follow" — the get-session request must show the header
        outbound on the wire, or the fix is not landed.
    [ ] get-session response body has a non-null `user` object.
        Null is the failure signature of the previous checkbox
        (server got no auth, returned unauthenticated).
    [ ] Auth gate disappears; app shell is visible with the signed-
        in user's email at the top-right
    [ ] Any authenticated non-auth call (e.g. Dashboard load —
        GET /api/dashboard) — Xcode shows the request carries
        `Authorization: Bearer <same token>`. Two headers cover two
        separate code paths (auth-client's own $fetch vs api-client-
        react's customFetch); a bug on either half breaks half the
        app, not all of it.
    [ ] Kill and relaunch app — still signed in. If sign-in screen
        appears, the token did not persist to Preferences
    [ ] AI Coach / floating assistant streams tokens (not a wait-
        then-dump). Confirms SSE works via WebView native fetch
        rather than CapacitorHttp
    [ ] Sign out — subsequent authenticated call fails 401
    [ ] Sign in as a different user — first request carries the
        NEW token, not the previous one (clearNativeAuthToken did
        its job)
    [ ] Passkey button is HIDDEN on native (visible on web);
        clicking is not possible so it cannot silently fail
    [ ] With airplane mode on, sign-in shows "Your device is offline"
        NOT "Something went wrong on our end"
    [ ] With airplane mode off but VITE_NATIVE_API_URL pointing at
        a bad host, sign-in shows "Could not reach the server" NOT
        "The server responded with an error"

  **Why the checklist expanded 28-Aug.** Original step ordering said
  "Sign-up form submits and returns to a logged-in shell" — a
  behavioural check that lumps three separate wire events into one
  observation. When the operator ran it, sign-up succeeded on the
  server but the shell never appeared. That single ambiguous
  checkbox couldn't isolate whether (a) the POST failed, (b) the
  set-auth-token header was missing, (c) the token wasn't captured,
  (d) the next request lacked the Authorization header, or (e) the
  session response was unauthenticated. It was (d) — token capture
  worked, token sending in authClient's own $fetch pipeline didn't.
  The rewrite above breaks the single "returns to a logged-in shell"
  step into six wire-observable checkboxes so the next equivalent
  bug is isolated by which specific checkbox is the first to fail.

  **Why no CI runtime test.** Every step above needs the real
  Capacitor shell, real WKWebView, real @capacitor/preferences (which
  is UserDefaults on iOS, not a JS mock), and a real HTTPS response
  with the `set-auth-token` header set by the real better-auth server.
  A CI test that mocks any of those would pass against broken code —
  a mocked Preferences that always succeeds would pass whether the
  real Preferences works or not; a mocked Capacitor detection that
  returns true would pass whether isNativePlatform detects correctly
  or not. The operator's rule: a test that cannot fail against broken
  code is worse than no test. This checklist is the honest version.

  **G13 closes when:** every checkbox above ticks on a real device
  or simulator, recorded in a session note with commit SHA. Not on
  green CI alone.

- **G11 · Pension `growthRate ?? 7` — RESOLVED via disclosure contract
  (path b).** The 7% default is a conventional pension-model
  assumption, not a personal fact. Operator's decision: legitimate IF
  the user can see the value at the point the projection renders and
  change it in one interaction. Implemented in three places, all
  locked by `pension-growth-rate-disclosure.test.ts`: the "assumes
  N%/yr growth" clickable pill on the Projected Pot caption in
  KpiBar, the "Assumes N%/yr growth to retirement" footer in
  PensionHealthBlock, and the onFocusGrowthRate handler that scrolls
  + focuses the growth-rate input (`GROWTH_RATE_INPUT_ID`). The
  allowlist entry at `pension.tsx:108` in
  `demo-fabrication.lock.test.ts` restates the disclosure contract
  as its reason and points at this backlog item so the record is
  visible from either direction.
  **Reasoning to reuse:** currentAge and targetMonthlyIncome are facts
  ABOUT THE USER that the app cannot know and must never invent. A
  growth rate is a MODEL PARAMETER that every pension calculator must
  pick and a user has no basis to answer on a blank form. The rule is
  not "is it a number we made up", it is "are we presenting it as the
  user's data or as our assumption".

- **G18 · MarketPane's GBP-as-base assumption — LOGGED, not fixed.**
  The FX disagreement on MobileHome (defect #1, 27 Aug session) was
  fixed in commit `af8c785` by routing the FX rate through
  `useGetFxRates` instead of `useGetMarketQuotes`. That fixed the
  visible contradiction (rate = "—" while balance-sheet used 5.49)
  but preserved the client-side GBP-as-base assumption because a
  wider redesign is how these become permanent. Five specific sites
  in `src/components/mobile/MarketPane.tsx` still hardcode GBP:

  1. **:36–48** — `FX_PAIR_TICKERS` map keys foreign currencies to
     `GBP${ccy}=X` tickers only. For an MYR-baseline user with USD
     holdings, the ticker should be `MYR${ccy}=X` (or an inverted
     `${ccy}MYR=X`), not GBP-rooted. Yahoo's FX pair coverage is
     asymmetric; needs verification before flipping.
  2. **:88** — `if (a.currency === "GBP") continue;` skips accounts
     whose currency is GBP, assuming they don't need conversion. For
     an MYR-baseline user, GBP accounts DO need conversion — they're
     as foreign as USD or EUR. Fix: `if (a.currency ===
     getBaseCurrency()) continue;`
  3. **:303** — FX row label reads `GBP/{ccy}`. For an MYR-baseline
     user this labels the rate direction wrong. Fix: `{baseCurrency}/{ccy}`.
  4. **:307** — Rate rendering assumes GBP-per-foreign semantics; if
     the client fetched a native-base rate table (see #1) the direction
     would be inverted and the caption ("your RM N ≈ £X") wouldn't
     hold either.
  5. **:315** — The relevance caption `your {sym}{nfmt(nativeSum)} ≈
     {formatMoney(baseEquivalent, getBaseCurrency())}` uses
     `getBaseCurrency()` correctly for the ≈ conversion — that one
     is already dynamic. But it depends on `baseEquivalent =
     nativeSum / rate` where `rate` is the GBP-rooted rate. When the
     ticker scheme changes (see #1) the arithmetic direction inverts.

  **Why not fix in the same commit as the FX-source rename:** each of
  the five sites depends on the other four. Flipping the ticker scheme
  without flipping the label reads as a bug; flipping labels without
  the tickers renders the wrong rate. A single reviewable diff needs
  all five together plus a re-verification that useGetFxRates on the
  MYR-base path returns a rate the client can interpret in the new
  direction.

  **Same defect class as the raw-£ purge (26 Aug).** Track this here
  so it doesn't become "the wider redesign" and stay unfixed for
  months.

- **G19 · Calculators unification, desktop side — LOGGED (27 Aug).**
  Thomas approved splitting-by-depth. Unify `/whatif`, `/fire`,
  `/projection` and `/calculators` (misc bucket) into a single
  `/calculators` shell with a segment control for the mode. Keep
  `/pension`, `/mortgage` and `/tax` as their own routes — each is
  1300-1500 lines and deep enough (Pension has sub-calculators for
  state / private / drawdown / annuity that would nest inside the
  segment control at two levels, which doesn't survive).

  **Sidebar impact:** 7 calculator entries collapse to 4.
  **Phone impact:** the 7-item Calculators sub-picker (shipped in Part 1,
  commit `d6c1cfd`) collapses to 4 items automatically because the sub-
  picker is derived from a list. WRAPPED_ROUTES baseline drops further:
  15 → 12 (four calc routes remain wrapped: /calculators, /pension,
  /mortgage, /tax).

  **Not built yet.** Desktop work, phone is priority. When it lands,
  update the sub-picker's Calculators list and re-run Lock #18.

- **G20 · localStorage: 26 account-level keys migrate to a
  user_preferences table (27 Aug).** Two-migration sequence, ordered
  per the report from the 27 Aug session:

  **A — Offline write queue.** TanStack Query mutation cache + IndexedDB
  persister; retry on `online` event. Fixes: writes disappearing offline
  (real bug — `docs/LOCAL-FIRST.md` claims local-first, half of it is
  true; grep `mutationCache|resumePausedMutations|pausedMutations` in
  `artifacts/finance-tracker/src` returns zero). No server change.
  Estimated 1-2 days.

  **B — user_preferences table + client sync.** Schema + `PATCH
  /api/settings/preferences` + client sync logic. On sign-in, hydrate;
  on write, PATCH server AND update in-memory + localStorage cache
  (localStorage stays as the fast-read cache; server is truth). Move
  26 keys. Migration script runs once per device on first authenticated
  request. Estimated 4-6 days.

  **The 26 account-level keys** (each is user data that should sync
  across devices — a tag on the laptop should appear on the phone):

    ft-tx-notes, ft-tx-tags, nr-debt-aprs, ft-cal-events, ft-cal-feeds,
    ft-cal-imported, nr-custom-categories, ft-nw-target, ft-nw-milestones,
    nr-fx-overrides, ft-tickers, ft-widgets, ft-nw-history, ft-achievements,
    ft-login-history, nr-alert-rules, nr-accent-override, nr-hide-from-print,
    nr-digest-enabled, ft-digest-enabled, ft-persona, nr-default-page,
    nr-show-nw-strip, nr-onboarding-complete, ft-onboarding-complete,
    ft-onboarding-dismissed, ft-acct-onboarding-dismissed, nr-sidebar-more.

  **The 18 device-local keys stay** — chrome sizing, privacy blur,
  accessibility scale, tour-dismissal flags. These SHOULD differ per
  device.

  **The four onboarding-flag lookalikes** (`nr-onboarding-complete`,
  `ft-onboarding-complete`, `ft-onboarding-dismissed`,
  `ft-acct-onboarding-dismissed`) look like historical duplicates worth
  a sweep during migration. Consolidate to one canonical
  `onboarding_complete` field on the user_preferences row.

- **G21 · Context filter for /business /family /trading — LOGGED,
  sequenced AFTER G20 (27 Aug).** Adds one more account-level
  preference (`nr-active-context`) under Migration B. `accounts.context`
  and `transactions.context` columns; every list-based screen filters
  by active context; three mini-apps collapse into per-context lenses.
  Deletes ~6,400 lines. **NOT built.** Depends on G20/B shipping so the
  context preference has a home; also unblocks the localStorage
  persistence-fix side effect on the three mini-apps.

- **G22 · Logo mark craft follow-ups (27 Aug).** Four findings from the
  logo craft pass (commits `09706de` + `5ce48db`) that were verified
  but deliberately not fixed:

  **G22.1 · Cap overlap at the two junctions.** The three strokes meet at
  (6, 23) and (22, 5). Rounded caps on each stroke extend 1.0 units
  past each endpoint (now that STROKE_VERT = STROKE_DIAG = 2.0), and
  because the caps are drawn in the stroke's own colour (verticals in
  `--nr-mark-vert`, diagonal in `--ft-accent`) the caps overlap as a
  small colour discontinuity at each junction. At (22, 5) the peak dot
  (r=2.4 at rest, 3 on hover, `--ft-accent`) partly hides it; at (6, 23)
  it's exposed.
  **Fix option:** rewrite the three strokes as a single `<path>` with
  `strokeLinejoin="round"` and geometric joins instead of overlapping
  caps. Disrupts the per-stroke draw classes (each currently has its
  own class for the sequential hover animation), so the animation
  wiring becomes a `<path>`-with-`stroke-dashoffset` pattern per
  segment. Feasible; not urgent. **Verdict:** leave as-is until the
  overlap becomes visible in a specific context (higher zoom, light
  theme). Log so it isn't rediscovered.

  **G22.2 · Optical centring — mark sits ~0.5 units low in the 28-box.**
  Mark bounding box (verticals + baseline + cap extension): x centre
  ≈ 14 (matches viewBox centre 14), y centre ≈ 14.65 (vs viewBox
  centre 14). Combined with the diagonal-heavy composition (peak dot
  and rings pull attention to upper-right), the visual centre reads
  low.
  **Fix:** `transform="translate(0, -0.5)"` on the SVG root would
  optically centre it. **This is a design change to positioning, not a
  craft edit.** Not applied per Thomas's "don't redesign" instruction.
  Logged so it can be a deliberate design decision if the mark ever
  moves to a hero placement where optical alignment reads more
  strongly than in the header.

  **G22.3 · Sub-20px sizes need distinct heavier-stroke variants.** At
  20 px the 2.0 stroke renders as 1.43 px — sub-2px, aggressively
  anti-aliased regardless of coordinate choice. At 16 px it's 1.14 px
  — sub-pixel. No amount of coordinate maths on the current SVG makes
  these sharp; the fix is a purpose-built SVG per small size, with
  heavier strokes and simpler geometry (drop the baseline and rings at
  16 px; drop the ring at 20 px).
  **Existing state:** `public/favicon.svg` ships a heavier variant
  (stroke 2.6, viewBox 0 0 32 32, hardcoded `void` theme colours,
  inline background rect, no baseline opacity). It's visually
  consistent with the header mark — same three-stroke shape, same peak
  dot, same baseline treatment — but doesn't share code with
  `logo.tsx`. Acceptable for a browser favicon (favicons are static
  and don't need theme responsiveness). Same coordinate imprecision as
  the header (2.6 stroke on integer endpoint at 32 px = still
  anti-aliased), but at 32 px the effective render is more forgiving.
  **Follow-up:** if a tab-bar-size mark ever ships (currently the tab
  bar uses text labels, no mark), it needs a purpose-built SVG at
  ~20 px. Not urgent.

  **G22.4 · iOS AppIcon.appiconset is one PNG — App Store rejection
  bait.** Confirmed inventory:
    ios/App/App/Assets.xcassets/AppIcon.appiconset/
      AppIcon-512@2x.png  (single 1024×1024 asset)
      Contents.json       (218 bytes)
  A different problem from the in-app mark: **static raster** (PNG per
  size, not SVG), **no transparency** (Apple validates the alpha
  channel is opaque), **no baked corners** (iOS applies the ~22% radius
  mask), **legible at 40px** (Spotlight), **survives iOS masking**
  (corner content gets cropped). Deliverables:
    - dedicated app-icon SVG source, heavier strokes, no baseline text,
      background fill, mark centred with corner-mask safe zone
    - automated PNG gen from that source at every required size (20@2x,
      20@3x, 29@2x, 29@3x, 40@2x, 40@3x, 60@2x, 60@3x + iPad 20@1x
      through 83.5@2x + 1024@1x marketing)
    - full Contents.json mapping every idiom + scale
    - App Store Connect marketing icon (1024×1024, opaque, no alpha)
  **Submission critical path.** Own project, own conversation. Not
  scheduled here; blocking App Store review whenever it's attempted.

- **G23 · `getFxRates()` blocks up to 12s offline — write path cannot
  wait this long.** Discovered while wiring FX-at-write (30 Aug 2026).
  Under complete network failure, `getFxRates()` in
  `artifacts/api-server/src/lib/market.ts:146` tries Yahoo first
  (6s `AbortSignal.timeout`), catches, then tries Frankfurter
  (6s), catches, then returns an empty rates map. Serial timeouts
  compound to ~12 seconds on the first call after the 5-minute cache
  expires. Within the cache window it's instant.

  It does NOT throw or hang beyond the 12s — the caller's `rate`
  comes back null cleanly, and the FX-at-write write path stores
  null and lets the backfill catch it later. That's fine for a
  *desktop* write with a network waiting to time out.

  It is NOT fine for the G20/A offline write queue: a write path
  blocking for 12 seconds is exactly what the offline queue exists
  to avoid — the user is offline BY DEFINITION when the queue is in
  play, so the timeout always fires. Every queued write would
  eat 12s of wall time before it commits, in a UI that thinks it's
  operating offline-first.

  **Design requirement for G20/A** (not a fix here):
    - `snapshotFxRate` needs a path that either short-timeouts on
      the FX call (say, 500ms) or reads the last cached
      `FxRatesData` even when past TTL (serve-stale). Storing a
      stale rate on an offline write is better than blocking for
      12s and then storing null.
    - Alternative: don't call `snapshotFxRate` at all on the
      offline path — write null, let the online replay + a periodic
      backfill fill later. Simplest, and matches how CSV imports
      already work (they leave null intentionally).

  Documented at the helper site in `market.ts` alongside the
  degradation note. Logged here because "serve-stale or short-
  timeout on the write path" is a design requirement for the
  offline queue, not a note the queue's author might find.

---

## Superseded

`docs/BACKLOG-old.md` holds the previous version. Section 6 of that file (the
persona-driven mobile home) was superseded by the design work recorded in
`docs/MOBILE-CONCEPT.md`; its useful parts are now F1 and D2.

### D4 · Replace flag emoji with drawn currency icons — DONE (`568bb63`)
Shared `<CurrencyMark>` / `<CountryMark>` inline-SVG components under
`components/currency-mark.tsx`, sized to the type ladder and using
`currentColor` so they inherit the active theme (all 11, `arctic`
included). GBP, USD, EUR, MYR, SGD plus a `COUNTRY_FOR_CITY` map that
migrates the market-hours cities. Duplicated emoji map deleted from
`net-worth.tsx` and `accounts-summary.tsx`; market-hours city list in
`layout.tsx` migrated with a legacy-`flag` → `country` reader.

Source-level lock: `lib/no-emoji.test.ts` walks `src/**/*.{ts,tsx}`
and fails on any codepoint in the emoji ranges (flag pairs, emoticons,
pictographs, transport, supplemental, extended-A, variation selector).
Grep for those ranges in source: 0 matches.

---

## H. Connection layer — how data actually gets in

The finding that reframed F2: `WISE_API_TOKEN` is a **server env var, not a
per-user field**. The one working auto-sync in the app syncs Thomas's own Wise
account for every user. It is a personal integration wearing the product's
clothes, and no stranger can ever connect their own.

Of three acquisition paths, only CSV import is genuinely multi-tenant.

A personal finance app spanning Wise, Revolut, a Malaysian bank and a broker
will never have one acquisition method. The architecture should stop pretending
otherwise: one connection model, several adapters, each user connecting whatever
their institution supports.

### H1 · Connection model + encrypted credential storage — DONE (`d4515e8`)
`connections` table with AES-256-GCM credential blob. Adapter
interface (`validateCredential` / `listAccounts` /
`fetchTransactionsSince`). `POST/DELETE /connections` + credential-
never-leaves-the-server test (`routes/connections.test.ts` asserts
on serialised body). Migration `0002_faulty_hobgoblin`.

### H2 · Wise adapter, per-user — DONE (`901b6d2`)
Moved Wise behind the adapter registry; env fallback dropped. UI
in `settings-connections.tsx` (desktop) and `MobileSettings.tsx`
(mobile) landed with items 1 + 1c.

### H3 · Further token adapters — DONE (`7a87fbd`)
Alpaca + Kraken adapters land with `provider-agnostic` account
identity (migration `0003_bent_richard_fisk`). Revolut skipped
(no personal API), IBKR skipped (gateway model), Coinbase
deferred (ES256 JWT signing worth its own commit).

### H4 · Open banking as one adapter — PARKED (decided 16 Aug 2026)
Code-complete and unit-tested against a stub; see `docs/H4-ENABLE-BANKING.md`.
**Parked deliberately, not abandoned.**

Reason: Restricted Production covers only accounts the developer personally
links, so it cannot onboard a single user. Full production needs a contract,
KYB, a company and 4-12 weeks with bank certification on the critical path.
Signing up would have removed Thomas's own CSV burden and validated the adapter
against the real API, but that is personal convenience plus code validation, not
product progress.

**What replaced it:** the persona work. A market-persona user types in a few
holdings, needs no bank connection at all, and their screen still changes
overnight because prices come from the market. That is the onboarding path for
non-technical users, and it exists today.

Bank connections are a power-user feature until there is a business reason to
pay for KYB. Revive this when public signup has a reason to exist — the adapter
will be waiting, though it will need testing against the live API at that point
since it has only ever run against a stub.
Enable Banking behind the same interface. See `docs/OPEN-BANKING.md`.

### H5 · File import as a first-class connection — DONE (`836faf2`)
Dedup is sha256 over userId|accountId|date|description|signedAmount|ordinal, where
ordinal is the position within the group of otherwise-identical rows in that
import. Four reissue cases tested including row-removal, which leaves one stale
row rather than duplicating or dropping history.
Already handles Revolut, Monzo and Maybank. The only path that will ever work
for Malaysia, so it is permanent, not a stopgap.

---

## I. Legal, privacy and governance — prerequisites for public signup

Unwritten as of 20 Aug 2026. These are not optional extras: the app stores
other people's bank balances, salaries, debts and counterparties.

### I1 · No admin role that can read user financial data — DECIDED
An admin who can browse any user's finances is a privacy problem, not a feature.
Access is defensible only if it is necessary, minimal, logged and disclosed, and
"I want to look around" is none of those.

What is defensible instead:
- **Aggregate metrics** with no personal data — user count, connection count,
  error rates, sync failures. This covers almost all real need.
- **Support actions that do not read data** — reset a password, delete an
  account, revoke a connection.
- **Impersonation only with explicit user consent and an audit trail**, if ever.

Nothing in the app is gated by role today: every persona sees every widget, XP
unlocks only cosmetics, and the F5 refusals forbid gating features or data. So
an admin role would unlock nothing that is currently locked.

### I2 · Privacy policy and terms — TODO, blocks public signup
Needs: what is collected, lawful basis under UK GDPR, retention period, who it
is shared with (Neon, Render, Vercel, Yahoo, Alpaca, and any open-banking
provider), and the subject access and deletion routes.

### I3 · Account deletion that actually deletes — TODO
Every table cascades from `user.id`, so the mechanism exists. Needs a
user-facing route, a confirmation, and a stated retention window.

### I4 · Breach process — TODO
UK GDPR requires notifying the ICO within 72 hours of becoming aware of a
qualifying breach. Write down who does what before it is needed.

### I5 · Data minimisation review — TODO
Currently stored: balances, transactions with merchant strings, debts naming
counterparties, and encrypted provider credentials. Review whether each is
needed, and how long it is kept.
