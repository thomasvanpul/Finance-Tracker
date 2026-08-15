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

### A4 · Confirm `dev@bypass.local` is gone from production — TODO
Code referencing it was removed and deployed; the row was never confirmed.
- **Verify:** query the production `user` table for that email, expect zero
  rows. If present, delete it and its `session` and `account` rows.

---

## B. Hosting — the Railway subscription is ending

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

### C1 · `account.type` column — TODO
The mobile home screen derives a residual (`netWorth − cash − portfolio`) and can
only label it `OTHER`, because nothing in the schema says whether an account is
property, pension, cash or investment. This is the one remaining compromise on
the approved design.
- **Do:** add a typed column to `accounts`, backfill existing rows, expose it in
  `DashboardSummary.accountBreakdown`, then have `computeHoldings` categorise
  from it instead of subtracting.
- **Done when:** `computeHoldings` no longer computes a residual.
- **Verify:** `pnpm --filter @workspace/finance-tracker test` — extend
  `mobile-home.test.ts`, which already covers the residual cases.

### C2 · Gaps the mobile home cannot fill — TODO
Found during implementation, ranked. Each needs an API field before its UI can
be honest: pension balance; 12-month asset-composition history (for the BANDS
and RING renderings); discretionary budget total and spend-to-date; upcoming
income, so `COMING` can show salary; split-request detail (counterparty and
amount, not just `pendingCount`); FX moves; Wise connectivity status for the
`LIVE` indicator, currently hardcoded.

---

## D. Mobile

### D1 · Port delete to `MobileTransactions`, then cover `/transactions` — TODO
`pages/transactions.tsx` has `useSwipeDelete`; the mobile screen has no delete
at all, which is why `/transactions` is deliberately excluded from
`MOBILE_ROUTES`.
- **Done when:** delete works on the mobile screen and `/transactions` is in the
  route map.
- **Verify:** open `/transactions` on a phone viewport and delete a row.

### D2 · Remaining mobile screens in the new design — TODO
Only the home screen uses the approved language. The other 14 are stripped to
real-data-only but still carry the old visual treatment, which is visible and
jarring next to Home.
- **Order:** Accounts, Net Worth, Upcoming first — they are reachable from the
  home screen's own links.
- **Read:** `docs/MOBILE-CONCEPT.md` before starting.
- **Note:** build two or three before designing all fourteen. The design phase
  ran to twenty-two rounds partly by answering questions only implementation
  could answer.

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

### E1 · The `index.css` inline-style font-size hack — TODO
`[style*="font-size: 36px"] { font-size: 22px !important }` and siblings. Mobile
typography is a lookup table keyed on serialised inline style text, enforced
with `!important`. It beats inline styles, is invisible from the component, and
only catches enumerated pixel values.
- **Done when:** a real responsive type scale replaces it and the selectors are
  gone.
- **Verify:** grep `index.css` for `[style*="font-size` — expect zero.

### E2 · Flex-container primitive — TODO
`docs/STYLE-INVENTORY.md` shapes 2, 8, 9, 10 and 13 are flex row and column
variants, roughly 793 occurrences. Nothing in `components/primitives/` covers
them; it is the largest remaining block of the 11,715 inline style objects.
- **Verify:** report the `style={{` count in `src` before and after.

### E3 · Migrate remaining pages to the primitives — TODO · Blocked by E2
`pages/owing.tsx` is the only migrated page (239 → 207 style objects).

### E4 · Break up the oversized pages — TODO
`investments.tsx` 306KB, `analytics.tsx` 193KB, `transactions.tsx` 168KB,
`settings.tsx` 166KB. Layout work inside files this size drifts page to page.

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
- **G2 · Recharts tooltips.** `accounts.tsx:2892` and `year-review.tsx` 614, 711
  return arrays from `<Tooltip formatter>`, so those values get no `.pnum`
  treatment. A `MonoTooltip` component already exists elsewhere.
- **G3 · Dead root `vercel.json`.** Vercel's project root is
  `artifacts/finance-tracker`, so the repo-root file is never read. Confirm no
  second Vercel project points at the repo root before deleting it.
- **G4 · CORS rejections return 500.** A denied origin is a client error and
  should be 403; currently every denial looks like a server fault in monitoring.
- **G5 · `mockup-sandbox` still declares `framer-motion`.** No deploy target, so
  harmless, but removable.
- **G6 · `sslmode=require` no longer verifies certificates** in newer pg
  clients. Revisit the connection config.
- **G7 · Neon cold-start on CI.** A cold Neon compute takes ~110s to wake on
  the first query. `drizzle-kit push` / `pull` / `migrate` all spin on
  "Pulling schema from database…" during that time. Any CI job that shells
  into the dev branch (migration checks, spec generation, integration tests)
  needs a per-step timeout above two minutes, or a warm-up ping to
  `SELECT 1` before the real command, or it will fail spuriously.

---

## Superseded

`docs/BACKLOG-old.md` holds the previous version. Section 6 of that file (the
persona-driven mobile home) was superseded by the design work recorded in
`docs/MOBILE-CONCEPT.md`; its useful parts are now F1 and D2.
