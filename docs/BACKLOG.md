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

Status: `TODO` · `IN PROGRESS` · `PARTIAL` · `DONE` · `DECIDE` (needs Thomas) ·
`PROPOSED` · `IDEA` (not yet agreed) · `PARKED` · `DEFERRED` (threshold recorded) ·
closed: `DONE` · `SUPERSEDED` · `DROPPED` · `ADOPTED` (a principle, not a build).

Priority tier, taken from the vault roadmap (`Efforts/Numeris-Roadmap.md`):
`NOW` blocks public signup and is capped at ten — a new NOW item displaces one ·
`NEXT` starts the day signup opens · `NOT YET` is dated by the blocking step
(`.review/BLOCKER.md`), not rejected. Items the roadmap does not name default to
`NOT YET`. Closed items carry no tier.

**This file is the one backlog.** Merged 13 Sep 2026 with the vault register
(`Atlas/Projects/Numeris-Register.md`), the roadmap, and commitments from
`PLAN-Q3.md`, `TARGET-PRODUCT.md`, `MOBILE-CONCEPT.md`, `LOCAL-FIRST.md` and
`BACKLOG-old.md`. The vault keeps narrative and points here; the planning docs
keep reasoning. Do not start a second list — add a row here and an entry in its
section. Every status in the index was checked against source at `788463c` on
13 Sep 2026; the evidence is in each entry.

**Amended 19 Sep 2026, after the market-data withdrawal (`3d8d8e4`).** Market
data is off by default on every deployment (`api-server/src/lib/market-flag.ts`),
and production answers `{"marketDataEnabled":false}`. Twenty-four items were
triaged against that: 2 retired, 12 reworked, 10 kept behind the flag, and a
12-item watch list of items that look market-related and are not (FX, cost
basis, the user's own broker positions). Two new sections were added: **L**
carries the defects the withdrawal created, **M** carries store submission.
Do not retire an item for touching `lib/market.ts`; FX lives there too.

## Index

206 items · 154 open · 52 closed. Open by tier: NOW 28 · NEXT 20 · NOT YET 106.
Update the counts when a row changes.

**Counts recounted 19 Sep 2026, and the old line was wrong before this session
touched it.** The committed line read `174 items · 123 open · 51 closed. NOW 10
· NEXT 8 · NOT YET 105`. Counting the index rows of that same commit gives 171
items, 50 closed, 121 open, NOW 14, NEXT 13, NOT YET 94, so the header had
drifted from its own table and the drift was in the direction that made NOW look
smaller than it was. The numbers above are the measured ones. Reproduce them
with the row regex `^\| ([A-Z]\d+) \| (.*?) \| (.*?) \| (.*?) \|$` and count
column 4; a row whose tier is `—` is a closed row.

This session added 33 rows (L1 to L7, M1 to M12, N1 to N14), dropped J26 and
J27, and re-tiered G41, G42 and J1. NOW now holds 27 items. The roadmap's cap of
ten is broken, which is a decision for Thomas and not a drafting error; the
ordered route in `Efforts/Numeris-Roadmap.md` groups those 27 into phases so the
cap can be re-imposed per phase rather than across the whole tier.

| id | item | status | tier |
| --- | --- | --- | --- |
| A1 | Split dev from production | DONE | — |
| A2 | Rotate the neondb_owner password | DONE | — |
| A3 | Real migrations | DONE | — |
| A4 | dev@bypass.local removed from production | DONE | — |
| A5 | Account ownership checked on every money write | DONE | — |
| B1 | Rehost the API server on Render | DONE | — |
| B2 | Point the frontend at the new API | DONE | — |
| B3 | Remove NODE_ENV=production from the shell profile | DONE | — |
| B4 | Hosting payment, and the free tier that sleeps | DECIDE | NOW |
| B5 | core.hooksPath is global; pre-push hook does not run | TODO | NOT YET |
| B6 | Cost efficiency audit | TODO | NOT YET |
| B7 | Measure authenticated endpoints and record it | PARTIAL | NOT YET |
| C1 | account.type column | DONE | — |
| C2 | Gaps the mobile home cannot fill (LIVE indicator) | PARTIAL | NOT YET |
| C3 | Net worth subtracts what you owe | DONE | — |
| C4 | liability account type | DONE | — |
| C5 | Subscriptions as a recurrence rule | DONE | — |
| C6 | netLiquidity is cash; one today; drift floor | DONE | — |
| C7 | Account-sign sweep and lock | DONE | — |
| D1 | Swipe-delete on /transactions for phone | DONE | — |
| D2 | Remaining mobile screens in the new design | SUPERSEDED | — |
| D3 | Dead config cleanup | DONE | — |
| D4 | Full iPhone-native mobile redesign | IN PROGRESS | NOW |
| D5 | Lock: phone routes resolve to a screen | DONE | — |
| D6 | Delete the twelve unreachable Mobile* screens | TODO | NOW |
| D7 | Native integration for guideline 4.2 | TODO | NEXT |
| D8 | Store releases: App Store and Google Play | TODO | NEXT |
| D9 | Tauri desktop shell | TODO | NEXT |
| D10 | Clipped-figure render test at 390 and 1440 | TODO | NOW |
| D11 | Geometry previews on home panes | TODO | NOT YET |
| E1 | index.css font-size hack | DONE | — |
| E2 | Flex-container primitive | DONE | — |
| E3 | Migrate pages to the primitives | DONE | — |
| E4 | Break up the oversized pages | PARTIAL | NOT YET |
| E5 | /transactions structural rebuild, A-C | DONE | — |
| E5-D | /transactions server-side filtering | DEFERRED | NOT YET |
| E6 | Drawn currency icons replace flag emoji | DONE | — |
| E7 | Re-derive the midnight theme accent | TODO | NOT YET |
| E8 | BlockField desktop width | TODO | NOT YET |
| E9 | Settings info marks | PARTIAL | NOT YET |
| E10 | Extend motion | PARTIAL | NOT YET |
| F1 | Onboarding questionnaire to persona | DONE | — |
| F2 | Open banking | PARKED | NOT YET |
| F3 | Market, FX and news | DONE | — |
| F4 | Social split and owing | DONE | — |
| F5 | Progression | DROPPED | — |
| F6 | Avatars as 3D models | DROPPED | — |
| F7 | D1 allocation engine | DONE | — |
| F8 | Allocation UI | DONE | — |
| F9 | Safe to Spend visual weight | DECIDE | NEXT |
| F10 | Completeness figure | TODO | NEXT |
| F11 | DCC detection | IDEA | NOT YET |
| F12 | Materiality threshold | IDEA | NOT YET |
| F13 | /net-worth still asks for a snapshot | PARTIAL | NOT YET |
| F14 | Audit pages for derivable input | TODO | NOT YET |
| F15 | Scheduled digest | TODO | NOT YET |
| F16 | Since-you-last-looked strip | PARTIAL | NOT YET |
| F17 | Charging money | TODO | NOT YET |
| F18 | Watch non-technical users use it | TODO | NOT YET |
| G1 | Motion tokens vs the 150ms cap | DECIDE | NOT YET |
| G2 | Recharts MonoTooltip | DONE | — |
| G3 | Dead root vercel.json | DONE | — |
| G4 | CORS rejections return 403 | DONE | — |
| G5 | mockup-sandbox framer-motion | DONE | — |
| G6 | sslmode=require does not verify certificates | TODO | NOT YET |
| G7 | Neon cold start on CI | PARKED | NOT YET |
| G8 | PERSONA_ACCENT map | DONE | — |
| G9 | DesktopEmptyState primitive | PROPOSED | NOT YET |
| G10 | api-server suite flake | PARTIAL | NOT YET |
| G11 | Pension growth-rate disclosure | DONE | — |
| G12 | Sign-in screen and App Review demo account | TODO | NOT YET |
| G13 | Native auth, device checklist unrecorded | PARTIAL | NEXT |
| G14 | Alert rules key | DONE | — |
| G15 | Print blur does not survive a reload | TODO | NOT YET |
| G16 | learn-xp.ts dead code | DONE | — |
| G17 | Five alert thresholds unread | DONE | — |
| G18 | first-run-flow-shot leaked users | DONE | — |
| G19 | Calculators unification, desktop | TODO | NOT YET |
| G20 | localStorage to user_preferences, offline queue | DONE | — |
| G21 | Context filter for business/family/trading | TODO | NOT YET |
| G22.1 | Logo cap overlap | DONE | — |
| G22.2 | Logo optical centring | DECIDE | NOT YET |
| G22.3 | Favicon and PWA icons diverged from the mark | TODO | NOT YET |
| G22.4 | iOS app icon small-size legibility | TODO | NOT YET |
| G23 | getFxRates has no short-timeout path | PARTIAL | NOT YET |
| G24 | MarketPane GBP-as-base | TODO | NOT YET |
| G25 | Dashboard: eight defects found by looking | TODO | NOW |
| G26 | Transactions written with accountId 0 | TODO | NOT YET |
| G27 | upcoming.ts debits accounts[0] by position | TODO | NOT YET |
| G28 | Settling a null-account debt jumps net worth | TODO | NOT YET |
| G29 | Dashboard drops unconvertible debts silently | TODO | NOT YET |
| G30 | Two FX helpers total the month differently | TODO | NOT YET |
| G31 | accounts.id 1 has no user_id | TODO | NOT YET |
| G32 | Unconvertible cash counts 0 in netLiquidity | TODO | NOT YET |
| G33 | /market/detail refuses indices by shape only | TODO | NOT YET |
| G34 | No-caret index caught only while Yahoo answers | TODO | NOT YET |
| G35 | Mixed quote request drops index rows silently | TODO | NOT YET |
| G36 | Markets TLDR and scan error states unseen | TODO | NOT YET |
| G37 | components/proto prints unsigned figures | TODO | NOT YET |
| G38 | kpi-bar and MobileAccounts ship to nobody | DECIDE | NOT YET |
| G39 | compact-tiles sums every asset type | DECIDE | NOT YET |
| G40 | Owed label merges loans and overdrafts | TODO | NOT YET |
| G41 | ETF cards carry index trademarks | DECIDE | NOW |
| G42 | ai-coach invites index comparisons | TODO | NOW |
| G43 | nw_snapshots has no liability bucket | DECIDE | NOT YET |
| G44 | recurring_patterns has no consumer | DECIDE | NOT YET |
| G45 | /api/ai/status never tests a completion | TODO | NOT YET |
| G46 | Credential key boot refusal claimed, not real | TODO | NOT YET |
| G47 | Receipt scan AI budget economics | DECIDE | NOT YET |
| G48 | Offline wipe unverified in iOS WebView | TODO | NEXT |
| G49 | Unsendable queued writes discarded at sign-out | DECIDE | NOT YET |
| G50 | 2fa-attempts row survives deletion | DONE | — |
| G51 | Settings "all local state" copy | DONE | — |
| G52 | Export built in memory per request | DONE | — |
| G53 | Offline replay has no idempotency key | TODO | NOT YET |
| G54 | Dedup import unreachable; CSV path drops real duplicates | TODO | NOT YET |
| G55 | Settings still asks for WISE_API_TOKEN | TODO | NOT YET |
| G56 | DATA-INVENTORY offline-wipe text stale | TODO | NOT YET |
| G57 | first-run-flow-shot can still leak accounts | TODO | NOT YET |
| G58 | Local-first as LOCAL-FIRST.md describes | TODO | NOT YET |
| G59 | CLAUDE.md misstates phone tabs and theme count | TODO | NOT YET |
| G60 | Consolidate onboarding-flag lookalikes | TODO | NOT YET |
| G61 | drizzle meta missing snapshots 0015-0017 | TODO | NOT YET |
| H1 | Connection model and encrypted credentials | DONE | — |
| H2 | Wise adapter, per user | DONE | — |
| H3 | Alpaca and Kraken adapters | DONE | — |
| H4 | Open banking adapter | PARKED | NOT YET |
| H5 | File import as a connection | PARTIAL | NOT YET |
| I1 | No admin role that can read user data | DECIDE | NOT YET |
| I2 | Privacy policy and terms | IN PROGRESS | NOW |
| I3 | Account deletion that actually deletes | DONE | — |
| I4 | Breach process | TODO | NOT YET |
| I5 | Data minimisation review | IN PROGRESS | NOT YET |
| I6 | Email address cannot be changed | TODO | NOW |
| I7 | No AI on/off switch | TODO | NOW |
| I8 | Digest unsubscribe link is dead | TODO | NOW |
| I9 | Non-users have no data-rights route | DECIDE | NOW |
| I10 | Neon dev clone never reached by deletion | DECIDE | NOW |
| I11 | Vercel Hobby: no DPA, proxies /api | DECIDE | NOW |
| I12 | Google Fonts from Google's CDN | TODO | NOT YET |
| I13 | Cerebras controller position | TODO | NOT YET |
| I14 | Export covers the whole account | DONE | — |
| I15 | Settings states what the AI is sent | DONE | — |
| I16 | Consent captured at sign-up | TODO | NOT YET |
| J1 | Market data vendor decision | DECIDE | NOT YET |
| J2 | Alpaca licensing, revisit Mar 2027 | PARKED | NOT YET |
| J3 | Index levels refused server-side | DONE | — |
| J28 | `fxRatesFromYahoo` is not behind `ENABLE_MARKET_DATA` | TODO | NOW |
| J29 | Background EOD valuation job and snapshot tables | TODO | NOT YET |
| J4 | Attribution: market, currency, money added | TODO | NEXT |
| J5 | Dividends as dated income into D1 | TODO | NEXT |
| J6 | Cost of ownership measured | TODO | NOT YET |
| J7 | While you slept | TODO | NEXT |
| J8 | Timing vs holding | TODO | NOT YET |
| J9 | Dividends meeting goals | TODO | NEXT |
| J10 | Per-holding FX split | TODO | NOT YET |
| J11 | Provenance on prices | TODO | NOT YET |
| J12 | Balances are ground truth | TODO | NOT YET |
| J13 | Confidence on every figure | TODO | NEXT |
| J14 | You stopped logging on the 3rd | TODO | NEXT |
| J15 | Quiet mode | TODO | NOT YET |
| J16 | Inferred transactions | IDEA | NOT YET |
| J17 | One question a day | IDEA | NOT YET |
| J18 | Decision journal | IDEA | NOT YET |
| J19 | What breaks first | IDEA | NOT YET |
| J20 | Household as a first-class unit | IDEA | NOT YET |
| J21 | Local inference for categorisation | IDEA | NOT YET |
| J22 | The app grades its own predictions | IDEA | NOT YET |
| J23 | Double-entry substrate | IDEA | NOT YET |
| J24 | Currency as a life position | IDEA | NOT YET |
| J25 | Permission instead of restriction | ADOPTED | — |
| J26 | Valuation without display: EOD only, aggregate figures, never a per-security price | DROPPED | — |
| J27 | Phone HOME shows per-security live prices (AAPL/BTC/MSFT/VUSA.L with % change, under a LIVE badge) — contradicts J26 and Alpaca's refusal | DROPPED | — |
| K1 | AI chain Groq to Cerebras, failures visible | DONE | — |
| K2 | Receipt scan counts against the AI limit | DONE | — |
| K3 | Per-user daily AI budget | TODO | NOT YET |
| K4 | Operator alert when a provider lane dies | TODO | NOT YET |
| K5 | Consistent AI quality across providers | PARTIAL | NOT YET |
| L1 | Phone HOME prints `PORTFOLIO £0` for a market-persona user with holdings | TODO | NOW |
| L2 | Net worth silently omits the whole portfolio when market data is off | TODO | NOW |
| L3 | Onboarding still sells live prices, portfolio P&L and an earnings calendar | TODO | NOW |
| L4 | `/portfolio` empty state and benchmark panel still promise prices and an S&P line | TODO | NOW |
| L5 | `MarketPane` took the FX rows and the holdings list down with it | TODO | NEXT |
| L6 | The market persona has no differentiating widget left on the desktop dashboard | DECIDE | NEXT |
| L7 | Restate what Numeris is, in product copy, without market data | DECIDE | NEXT |
| M1 | Apple 5.1.1(ix): a finance app should be submitted by a legal entity, not an individual | DECIDE | NOW |
| M2 | Apple 4.8: Sign in with Apple is required beside Google Sign-In | TODO | NOW |
| M3 | Apple 5.1.2(i): explicit permission before personal data reaches a third-party AI | TODO | NOW |
| M4 | No camera usage-description string, while three screens use `capture="environment"` | TODO | NOT YET |
| M5 | No privacy manifest (`PrivacyInfo.xcprivacy`) anywhere in the iOS project | TODO | NOT YET |
| M6 | No public web URL for privacy, terms, support or account deletion | TODO | NOT YET |
| M7 | Reviewer demo account for a login-gated app | TODO | NOT YET |
| M8 | Screenshots, age rating, review notes, export compliance | TODO | NOT YET |
| M9 | Enable Banking is on a Restricted Production tier that a public app does not fit | DECIDE | NOT YET |
| M10 | Account deletion does not revoke the Enable Banking consent | DONE | 7d02175 |
| M11 | Android platform does not exist | DECIDE | NOT YET |
| M12 | `docs/DATA-INVENTORY.md` is stale on the deletion LIKE bug | TODO | NOT YET |
| N1 | Phone UPCOMING's Add CTA is wired to a no-op, and no add path exists on phone | TODO | NOW |
| N2 | No press feedback on any phone row (`HoverRow` is hover-only) | TODO | NOW |
| N3 | No phone settings screen; `MobileSettings.tsx` was built and never wired | TODO | NOW |
| N4 | Eight phone routes render a desktop-only dead end | DECIDE | NOW |
| N5 | Phone HOME has no error or loading state | TODO | NOW |
| N6 | Sub-44px tap targets on WORTH and UPCOMING | TODO | NEXT |
| N7 | Phone paints the desktop shell first on every load | TODO | NEXT |
| N8 | The phone's shape: four tabs, one persona slot, three docs disagreeing | DECIDE | NEXT |
| N9 | 16 of 31 phone destinations are desktop pages in a back-button wrapper | DECIDE | NEXT |
| N10 | 644 hardcoded `rgba()` bypass the `--ft-*` tokens the eleven themes need | TODO | NOT YET |
| N11 | Four implementations of "a panel"; DESIGN.md sanctions three | DECIDE | NOT YET |
| N12 | 28 sidebar entries against CLAUDE.md's own ~20 rule | DECIDE | NOT YET |
| N13 | `docs/STYLE-INVENTORY.md` is stale by 34% | TODO | NOT YET |
| N14 | `CLAUDE.md` and `MOBILE-CONCEPT.md` both describe a phone shell that does not exist | TODO | NOW |

---

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
`push-force` both retired. **Verified 13 Sep 2026:** the production caveat below
is stale — `e1ade15` (23 Aug) applies migrations and verifies the schema at
boot, refusing to serve on mismatch, and records production as baselined by
hand; production is serving. Separate defect: `lib/db/drizzle/meta` has no
snapshots for 0015–0017 (G61). Baseline migration `0000_light_caretaker.sql`
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

### A5 · Account ownership checked on every money write — DONE (`b46bce3`, 10 Sep 2026)
Seven call sites and ten route gates. Merged from the vault register (A2).

### A4-old · superseded — not an item, kept as the record of A4
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
*The rest of this entry is the pre-migration task text, kept for the record;
Railway no longer exists.*
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

### B2 · Point the frontend at the new API — DONE (`d1ef48a`, 18 Aug 2026)
**Corrected 13 Sep 2026 from TODO.** Done by a different route than the one
written: `artifacts/finance-tracker/vercel.json` rewrites `/api/*` to
`numeris-api.onrender.com`, and `VITE_API_URL` is deliberately unset in
production (`auth-client.ts:14`, `main.tsx:31`). `curl -D-
https://financetracker.work/api/auth/get-session` → 200 with `server: Vercel`
and `x-render-origin-server: Render`. The console-CORS check was not run.

Original text: `VITE_API_URL` in the Vercel project and in
`artifacts/finance-tracker/.env.local`.
- **Verify:** the deployed site loads data; no CORS errors in console.

### B3 · Remove `NODE_ENV=production` from the shell profile — DONE
**Corrected 13 Sep 2026 from TODO.** No `NODE_ENV` in `~/.zshrc`, `~/.zprofile`,
`~/.zshenv`, `~/.profile` or `~/.bash_profile`; a fresh login shell reports it
empty. Files sourced from elsewhere (e.g. `~/.config`) were not searched.
It is set globally in the user's shell, which is why `pnpm dev` built in
production mode and pointed the app at Railway instead of the Vite proxy. The
`dev` script now forces it, but the global value will keep surprising other
tools.
- **Do:** find it in `~/.zshrc` / `~/.zprofile` / `~/.zshenv` and remove it.
- **Verify:** a new terminal reports an empty `NODE_ENV`.

### B4–B7 · merged 13 Sep 2026

- **B4 · Hosting payment, and the free tier that sleeps — DECIDE (Thomas) · NOW.**
  Render free sleeps and the app is found down by email; the Wise card declined
  a $7 Render charge. Revolut into Render, or Hetzner (~€4/mo, SEPA, no Stripe)
  if it declines. `BLOCKER.md` falsifier 1 notes a card already cleared Apple's
  enrolment. Register H1 + H2, roadmap N1.
- **B5 · `core.hooksPath` is global, so this repo's `.git/hooks` pre-push hook
  does not run — TODO · NOT YET.** Register H7. `CLAUDE.md` describes a pre-push
  typecheck+build that therefore may never fire.
- **B6 · Cost efficiency audit against measured usage — TODO · NOT YET.**
  `PLAN-Q3.md:159`. Only meaningful once there are users.
- **B7 · Measure the authenticated endpoints and record it — PARTIAL · NOT YET.**
  `PLAN-Q3.md:28`. `cb3aa80` parallelised the dashboard and `OPERATIONS.md`
  carries p95 thresholds; no measurement report exists.

---

## C. Data model — unblocks honest UI

### C1 · `account.type` column — DONE (`0cc7113`)
*13 Sep 2026: six values now — `liability` was added (C4).*
`accounts` now carries `type text NOT NULL DEFAULT 'cash'` — 5 values
(cash / investment / pension / property / other). Migration `0001_spooky_salo`
backfills every existing row to `cash` (Wise-linked and manually-entered
liquid accounts). `DashboardSummary.accountBreakdown[].type` exposes it,
and `computeHoldings` sums per bucket from that field instead of
subtracting a residual. `BlocksView` renders PROPERTY as the top block and
CASH / INVESTED / PENSION / OTHER along the bottom row. Six tests replace
the residual-guard cases with per-bucket coverage.

### C2 · Gaps the mobile home cannot fill — PARTIAL · NOT YET
**Corrected 13 Sep 2026 from DONE.** Snapshots, pension, upcoming income and
split detail are wired. The `LIVE` indicator is still literal text beside an
account count at `components/mobile/MobileHome.tsx:269`, not connection status.
Moves when it reads connection state or is removed.
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

### C3–C7 · merged 13 Sep 2026 from the vault register (shipped 10–11 Sep)

- **C3 · Net worth subtracts what you owe, both computation sites — DONE (`c29c366`).** Register A1.
- **C4 · `liability` account type, balance positive, type negates — DONE (`4d0aa9a`, with `2697c1b`, `9941b6d`).** Register A6.
- **C5 · Subscriptions became a recurrence rule generating upcoming rows — DONE (`04c84e5`).** Register A3.
- **C6 · `netLiquidity` narrowed to cash; one "today" across 11 sites; drift floor of 7 days — DONE (`95c1b68`, `34860fe`, `c5c42c2`).** Register A5.
- **C7 · Account-sign sweep, 23 sites, lock with allowlist — DONE (`bcba259`).** Register A8.

---

## D. Mobile

### D1 · Port delete to `MobileTransactions`, then cover `/transactions` — DONE
*Re-verified 13 Sep 2026: status holds, location moved.* Phone swipe-delete now
lives in `components/phone/SpendingScreen.tsx:922` on `useDeleteTransaction`;
`pages/transactions.tsx` no longer loads on a phone (comment at `:581`).
The `MobileTransactions.tsx` screen was deleted in an earlier orphan
cleanup, so /transactions now falls through to `pages/transactions.tsx`.
That page already implements swipe-to-delete for phone viewports:
`useSwipeDelete(() => handleDelete(tx.id))` runs per row at line 1585,
and the DELETE reveal button + swipe transform are gated on `isMobile`
(lines 1588–1611). Verified against source 2026-08-16. No screen or
route change required; `/transactions` reaches phone users through the
desktop page's mobile branches.

### D2 · Remaining mobile screens in the new design — SUPERSEDED (was DONE)
**Corrected 13 Sep 2026.** The work landed, then D4's `PhoneShell` (`6dfafd9`)
replaced it. Twelve of these screens plus `widgets.tsx` — 3,735 lines —
now have no importer outside tests: Accounts, Analytics, Budget, Charts, Goals,
Investments, NetWorth, Owing, Reports, Settings, Subscriptions, UpcomingFull.
Only `MobileHome`, `MarketPane` and `NewsPane` are reachable. Deleting them is D6.
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

### D4 · Full iPhone-native mobile redesign — IN PROGRESS · NOT YET (was SCOPING)
**Corrected 13 Sep 2026.** The tab structure was agreed and largely built from
27 Aug: `PhoneShell` (`6dfafd9`) owns phone routing (`App.tsx:214`), `MobileApp`
removed (`f05fcab`), screens DIRECTORY `0da3067`, SPENDING `f24d2ea`, WORTH
`e176bf8`, UPCOMING `842070f`, server-persisted tab slot `c3dca7b`. The shape is
four positions — HOME · WORTH · one chosen slot (SPENDING / MARKETS / UPCOMING)
· DIRECTORY (`lib/tab-slot.ts:88-94`) — not the five fixed tabs `CLAUDE.md`
states (G59). **Moves when** `WRAPPED_ROUTES` reaches zero or an agreed floor,
and the not-yet-available Owing and Watchlist slot choices ship or are dropped.
The scoping text below is the 26 Aug record.

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

### D5 · Lock: every mobile-nav route resolves to a `Mobile*` component — DONE (`8020514`, 27 Aug 2026)
**Corrected 13 Sep 2026 from PROPOSED.** Built as
`components/phone/wrapped-routes.lock.test.ts` ("Lock #18 · D5 ratchet") against
`PhoneShell`'s route lists; `MOBILE_ROUTES` no longer exists.
Class of bug this prevents: adding a route to `MOBILE_ROUTES` (in
`components/mobile/MobileApp.tsx`) without adding the matching
`AppScreen` render branch, or removing a `Mobile*` render branch
without dropping the path from `MOBILE_ROUTES` — either produces a
route that resolves to the fallback `screen === "home"` and silently
serves MobileHome under a wrong URL. See D5 in the session note for
the AST design and the honest "what it can't catch" section.

### D6–D11 · added 13 Sep 2026

- **D6 · Delete the twelve unreachable `components/mobile/Mobile*` screens and
  `widgets.tsx` — TODO · NOT YET.** Found verifying D2. Two locks still name
  some of them (`lib/fabricated-zero-lock.test.ts:101,109`,
  `lib/account-sign.lock.test.ts:308`), so the locks change in the same commit.
- **D7 · Native integration for App Store guideline 4.2 — TODO · NOT YET.**
  `PLAN-Q3.md:185-188`: biometric unlock (passkeys are hidden on native, `c4d2d7e`,
  so "largely there" is false), push notifications for shared-expense requests,
  home-screen widgets. `lib/local-notifications.ts` exists with no importer.
  `BLOCKER.md` falsifier 3.
- **D8 · Store releases: App Store and Google Play — TODO · NOT YET.** The goal
  in `BLOCKER.md`. No Android target exists in any plan (`PLAN-Q3.md:170` lists
  web, iOS, Mac/Windows only). Apple enrolment paid 10 Sep 2026; Google Play
  $25 not yet. Depends on G12 and D7.
- **D9 · Tauri desktop shell — TODO · NOT YET.** `PLAN-Q3.md:174`. Only the
  Jul/Aug scaffold exists.
- **D10 · Clipped-figure render test at 390px and 1440px — TODO · NOT YET.**
  `MOBILE-CONCEPT.md:392`. No test renders at 1440.
- **D11 · Geometry previews on home panes — TODO · NOT YET.**
  `TARGET-PRODUCT.md:58`, `MOBILE-CONCEPT.md:194-213`. Probably overtaken by D4;
  drop it or keep it deliberately.

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

### E4 · Break up the oversized pages — PARTIAL · NOT YET
*Re-measured 13 Sep 2026 (`wc -l`):* investments 2,578 · analytics 3,616 ·
transactions 2,616 · settings 2,979 (grew 198 since this entry) ·
`investments/markets-tab.tsx` 2,066. **Moves when** a target line count is agreed
so PARTIAL has an end, then analytics and settings get the real refactor.
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

### E5 · /transactions — structural rebuild — A/B/C DONE (7 Sep 2026), D DEFERRED
Thomas has called this page "still weird, could be made and designed much
better" three times. `docs/TRANSACTIONS-STRUCTURE.md` is the proposal: what is
measurably wrong, four independent moves (URL-addressable filter state, five
columns with the row as the affordance, day grouping by default, server-side
filtering when the list gets large), and the order.

A, B and C all landed 7 Sep. A · one `LedgerFilters` object behind one
`patchFilters`, so `hasFilters` is `activeFilterCount > 0` by construction and
ten chips became one type control and one period control (`202d885`). B ·
eight columns to five, the 128px action column retired into a detail dialog
the row opens, `SL` and its dead `ft-tx-splits` writer removed (`cb24e26`).
C · one exclusive grouping lens defaulting to DAY, replacing two booleans that
could both be true at once (`4bb1ea3`).

**D stays deferred** with its threshold recorded: server-side filtering earns
its complexity somewhere around 2,000 rows. The dev dataset is 46.
Tracked as **E5-D · DEFERRED · NOT YET** — moves when a real account passes
~2,000 rows. Re-verified 13 Sep: `LedgerFilters`, `patchFilters` and the DAY
default lens exist.

### E6 · Replace flag emoji with drawn currency icons — DONE (`568bb63`)
Renumbered 13 Sep 2026: this shipped as "D4", which collided with the redesign.
Full entry under **Superseded** below; `components/currency-mark.tsx` and
`lib/no-emoji.test.ts` exist.

### E7–E10 · added 13 Sep 2026 from the planning docs

- **E7 · Re-derive the `midnight` theme accent against a contrast target — TODO · NOT YET.**
  `PLAN-Q3.md:71`. Still `#4D9FFF` (`index.css:728`, `theme-context.tsx:29`);
  `105291f` changed only its `--ft-blue`.
- **E8 · `BlockField` desktop width — TODO · NOT YET.** `MOBILE-CONCEPT.md:353`;
  `block-field.tsx:34` still fixes 354.
- **E9 · Settings rows carry the Markets-style info mark — PARTIAL · NOT YET.**
  `PLAN-Q3.md:102`. Rows have subtitles, not the info mark.
- **E10 · Extend motion beyond phone tab transitions — PARTIAL · NOT YET.**
  `BACKLOG-old.md:106`; only `bf4cbd8` landed. Bound by G1's motion cap.

---

## F. Product — the things that make it worth returning to

See `docs/TARGET-PRODUCT.md`. Design and rationale are settled; these are build
tasks. None are blocked on design.

### F1 · Onboarding questionnaire → persona — DONE
*Re-verified 13 Sep 2026: holds. `MobileNav.tsx` cited in item 10 and below no
longer exists (phone nav is `PhoneTabBar.tsx`).*
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
**Moves with H4** — Enable Banking access covering accounts other than the
developer's own.

### F3 · Market, FX and news — DONE (`57091ab`, news commit)
MarketPane ships position-relevant prices and FX. News built and filtered to held
tickers and currencies. **Measured survival on a real 47-item Yahoo pull: 0% for a
budget persona, 2.1% market, 6.4% full analyst.** The filter works; a general feed
is near-worthless once it is applied, and per-ticker fetching is already 100%
relevant by construction. Ringgit-anchored news needs a Malaysian source
(Bernama, The Star, Bank Negara) — not built.
Mobile home MarketPane ships live prices for tickers the user
already holds and FX pairs for held foreign currencies. ~~News feed
is not built.~~ **Corrected 13 Sep 2026:** that sentence was the false half.
News is built — `/market/news` and `/market/news/for-user` (`routes/market.ts:99,110`),
rendered by `NewsPane` in `MarketScreen` and `MobileHome`.

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

### F5 · Progression — DROPPED (was DONE)
**Corrected 13 Sep 2026.** The code does not exist. `334d5ba` "Remove · XP
mechanic" (30 Aug) and `9537ef3` (7 Sep) deleted `lib/learn-xp.ts` and the
35-assertion lock `lib/f5-refusals.test.ts`; `XP_` now appears only in this
file. `docs/F5-PROGRESSION.md:3` already says "NOT BUILT. Code removed 7 Sep
2026". The refusals below remain the constraint if progression is ever revived.
The text below is the pre-removal record.
Four earning events, all maintenance or position. Locked by 35 assertions that grep
the XP module for banned concepts and require every amount to be a named XP_*
constant. Refusals: never spending, never frequency, never debt, no streaks, no
feature or data gating, cosmetic unlocks only.
`lib/learn-xp.ts` and `lib/bot-skins.ts` still decoration; no
event stream wires user actions to XP.

### F6 · Avatars as 3D models — DROPPED (was PARKED)
**Corrected 13 Sep 2026.** What it would redesign is gone: `lib/bot-skins.ts`
and `components/ai-wanderer.tsx` deleted in `0715b8f` (7 Sep), `WardrobePanel`
has zero matches and `settings.tsx` now carries `CompanionPanel`. Only
`ai-agent.tsx` remains. Revive only as a new item written against
`CompanionPanel`. Original text:
Redesign in Claude Design, swappable. Files: `lib/bot-skins.ts`,
`WardrobePanel` in `settings.tsx` (labels at 1471, 1477, 1483), render sites in
`ai-wanderer.tsx` and `ai-agent.tsx`. Decide the format first — sprite sheets,
glTF with a small WebGL renderer, or pre-rendered turnarounds — since a WebGL
renderer for a decorative avatar is real battery and bundle cost.

### F7–F18 · merged 13 Sep 2026

From the vault register and roadmap:

- **F7 · D1 allocation engine — `GET /api/allocation`, drift term proved on real rows — DONE (`8d1b90c`, `57fd3d4`).** Register A4 / D1.
- **F8 · Allocation UI, blocker state first; "Accounts" label fix; OWED section — DONE (`968fb1f`).** Register A7.
- **F9 · Safe to Spend gets the visual weight of the product's main number — DECIDE (Thomas, design) · NEXT.**
  Register B3, roadmap NEXT 1. Renders as the fourth band of the dashboard top
  region (`components/dashboard/top-region.tsx:425`) and on the phone in
  `phone/SpendingScreen.tsx:609`.
- **F10 · Completeness figure — TODO · NEXT.** Register D5, roadmap NEXT 2.
  Unblocked by C5. Nothing named completeness exists in source.
- **F11 · DCC detection — IDEA · NOT YET.** Register D2.
- **F12 · Materiality threshold — IDEA · NOT YET.** Register D3.

From the planning docs:

- **F13 · `/net-worth` page still asks for a snapshot when it could compute — PARTIAL · NOT YET.**
  `PLAN-Q3.md:87`. The dashboard computes (`dashboard.ts:773`); the page still
  shows "No snapshots yet… Record First Snapshot" when assets ≤ 0.
- **F14 · Audit every page for input the app could derive — TODO · NOT YET.**
  `PLAN-Q3.md:92`. "Report before changing"; no report exists.
- **F15 · Scheduled digest — TODO · NOT YET.** `TARGET-PRODUCT.md:64`. The
  digest sends only on a button press (`digest.ts:84`). Its dead unsubscribe
  link is I8.
- **F16 · "Since you last looked" strip — PARTIAL · NOT YET.**
  `BACKLOG-old.md:145` (6.7). Partly covered by WHAT CHANGED (`5c71776`).
- **F17 · Charging money — TODO · NOT YET.** `PLAN-Q3.md:212`. Deliberately
  last: "not before there are users who would miss the product".
- **F18 · Watch non-technical users use it — TODO · NOT YET.**
  `TARGET-PRODUCT.md:79`. Needs the blocking step closed first.

---

## G. Smaller items

- **G14 · Alert rules are saved to a key nothing reads — FIXED 7 Sep 2026 (`e71e77e`).**
  Migrated rather than deleted: settings now writes `nr-alert-rules`, reads
  `ft-alert-rules` once when the new key is absent to carry an existing
  configuration across, and leaves the old key in place. Both consumers fall
  back to the legacy key on read so a device that has not opened settings is
  not blind in the meantime. The `enabled` master switch is now honoured by
  both engines. Verified in the browser: seeded the legacy key alone with
  {12, 37, 44, 5, 9} and the panel renders 12 · 44 · 37 · 5 · 9 with the new
  key written. **Five thresholds remain inert — see G17.** The record of the
  defect follows.
- **G14 (original finding) · CONFIRMED 7 Sep 2026.**
  `pages/settings.tsx:45` writes `ft-alert-rules`; the two consumers,
  `components/notifications-panel.tsx:104` and
  `components/widgets/smart-alerts.tsx:73`, both read `nr-alert-rules`. Seven
  thresholds — smart-alerts on/off, large-transaction amount, category-spike
  percentage, budget-warning percentage, overspend warning, goal-behind months,
  bill-reminder days — are entered, saved, and reach nothing. The Settings
  screen reads its own key back at `:235` to repopulate the form, so the
  control looks alive from inside the screen that owns it, which is why a
  write-vs-read sweep does not catch it. This is `DESIGN.md` §16.
  **Needs a decision, not a rename:** aligning the key would silently activate
  every rule a user has already saved. Either migrate deliberately, or delete
  the panel.
- **G16 · `lib/learn-xp.ts` is dead, and its keys say so — DONE (`9537ef3`, 7 Sep 2026).**
  **Corrected 13 Sep 2026 from CONFIRMED:** the module and its test were deleted
  (the commit message does not say so, which is why it was missed; recorded in
  `docs/F5-PROGRESSION.md`). `docs/MOBILE-CONCEPT.md:119` still cites it.
  Original finding:
  Found by `lib/storage-key-lock.test.ts`, which flags `nr-learn-progress` and
  `nr-cat-rules` as read by nothing that writes them. Both reads are in
  `learn-xp.ts`. `nr-learn-progress` (`:147`) is written nowhere at all;
  `nr-cat-rules` (`:169`) carries the comment *"Reads the same localStorage key
  auto-cat.ts writes to"* while `auto-cat.ts` writes `ft-cat-rules` — a prefix
  twin, the same shape as G14. The module exports `getLearnXP`,
  `getCatRulesXP`, `getMaintenanceLocalXP` and three XP constants, and **no
  non-test file imports any of them**; ten tests in `learn-xp.test.ts` keep it
  alive. Its own comment points at `hooks/use-total-xp.ts`, which does not
  exist. One decision — wire it up or delete the module, its tests and both
  keys — not two key fixes. Both keys are allowlisted in the lock test until
  it is made.
- **G17 · Five of the seven alert thresholds still reach nothing — DONE (`9537ef3`).**
  **Corrected 13 Sep 2026 from CONFIRMED:** both engines now read
  `budgetHardStop` and `billReminderDays` (`notifications-panel.tsx:178,218`,
  `smart-alerts.tsx:241,279`); the other three fields were removed. Original
  finding: After the G14 migration the two alert engines read
  `largeTxThreshold` and `budgetWarningPct` and nothing else. `savingsRateMin`,
  `categorySpikeAlertPct`, `budgetHardStop`, `goalBehindMonths` and
  `billReminderDays` are still entered, saved and unread — `DESIGN.md` §16
  applies to a field of a stored object exactly as it does to a key, and the
  storage-key lock cannot see this because it works at key granularity. Each
  needs a decision about what it should mean in the alert engine, not a
  rename; the engines already compute savings rate, category spikes, budget
  overspend, goal pace and bill dates, so the thresholds have somewhere
  obvious to land. Deleting the five controls is the other honest ending.
- **G18 · `first-run-flow-shot.ts` leaked a user per pass — FIXED 7 Sep 2026.**
  *13 Sep 2026: one leak path remains — see G57.*
  The screenshot harness signs up four fresh accounts per run (tags a, b, c, m)
  and had no cleanup of any kind. Thirty-three `firstrun-*@numeris.local`
  accounts were found on the Neon dev branch from runs on 6 Sep between 17:22
  and 17:55, and removed through the app's own `POST /api/account/delete`
  rather than by SQL, so the real cascade ran. The script now records every
  address it creates and deletes them at the end and on `uncaughtException` /
  `unhandledRejection`; `authed()` throws instead of calling `process.exit(1)`
  so an auth failure no longer skips cleanup. Note for the record: the
  account-deletion integration test was suspected and is not the cause — it
  cleans up correctly and left no rows.
- **G15 · Print blur does not survive a reload — CONFIRMED 7 Sep 2026 · TODO · NOT YET.**
  *Re-verified 13 Sep 2026, and worse:* `nr-hide-from-print` now syncs across
  devices (G20/B), so a second device shows the toggle ON without blurring either.
  "Hide amounts when printing" injects `<style id="nr-print-style">` inside its
  click handler only (`pages/settings.tsx:1105`, `pages/profile.tsx:775`).
  `nr-hide-from-print` is read on mount to set the toggle's *appearance*
  (`settings.tsx:1094`, `profile.tsx:456`) but nothing re-injects the style, so
  after a reload the toggle reads ON and printing is not blurred. Also
  `DESIGN.md` §16: the control states a fact about the app that is not true.
  Fix is a mount effect that applies the stored value, in one place both pages
  call rather than the two copies that exist now.
- **G1 · Motion tokens vs the constitution — UNDECIDED.** `index.css` bans
  transitions over 150ms on UI state changes; `--ft-motion-base` is 200ms and
  `--ft-motion-slow` is 320ms, both live on the five primitives. Either bring
  them under the cap or amend the constitution deliberately. Do not resolve it
  by leaving both in place.
  *13 Sep 2026:* `--ft-motion-slow` is now unused; `--ft-motion-base` (200ms)
  drives the theme-change colour fade on the primitives; a new
  `--ft-motion-screen` (240ms) was added. Still undecided.
- **G2 · Recharts tooltips — DONE (`2fde41e`).** `MonoTooltip` extracted from
  `analytics.tsx` into `components/mono-tooltip.tsx`; `accounts.tsx:2892` and
  `year-review.tsx` 614 / 711 now consume it through `<Tooltip content={…}>`
  instead of the `formatter` array path, so tabular figures and privacy blur
  apply.
- **G3 · Dead root `vercel.json` — DONE (2026-09-30).** Vercel's project root
  is `artifacts/finance-tracker`, so the repo-root file was never read for
  git-triggered deploys. The "second Vercel project" check resolves clean:
  the gitignored `.vercel/project.json` at the repo root and the one in
  `artifacts/finance-tracker` link the identical `projectId`
  (`prj_0iJOwdCm3xIfuyOJrlvZDvEvScxM`, `finance-tracker-api-server`) — one
  project, not two, so there was no second project to conflict with. Deleted
  the repo-root `vercel.json` outright rather than leaving it as a manual-CLI
  footgun (a `vercel deploy` run from the repo root would have read it and
  pushed the dead Railway rewrite to the live project).
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
  **PARKED (13 Sep 2026).** No CI job touches the database; the only workflow is
  the deprecated `keep-alive.yml`. Moves when one is added.
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

  *(Misfiled note belonging to E4, not a G item. Line counts are stale: 2,578
  and 2,066 on 13 Sep 2026.)*
  **E4 · MarketsTab extraction — DONE (`a88f5d0`).** The
  MOCK_QUOTES blocker was resolved (the constant no longer exists;
  only a stale comment reference remains in
  `chart-analysis-modal.tsx:239`). `pages/investments/markets-tab.tsx`
  now holds the MarketsTab component with its five sibling pieces.
  `investments.tsx` is 2,753 lines (was 5,092 at the start of E4);
  `markets-tab.tsx` is 2,047 lines.

- **G10 · api-server suite intermittently loses ~5 tests — INVESTIGATE
  after mobile.** **PARTIAL (13 Sep 2026):** `675dcaf` raised the HTTP test
  timeouts and `605016c` fixed `ERR_ERL_KEY_GEN_IPV6` in the real limiter;
  `app.ai-limiter.test.ts:65` still keys on bare `req.ip`, and no reproduction
  of the flake is recorded, so the done-when below is unmet. Observed once in ~8 runs: 5 failed / 294 passed for
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

- **G13 · Native auth architecture — PARTIAL · NOT YET (was DONE).**
  **Corrected 13 Sep 2026.** Implemented, but this entry's own close condition
  ("every checkbox ticks … recorded in a session note with commit SHA") is not
  met in the repo: all 15 boxes below are unticked and no such note exists in
  the repo or `.review/` (the vault was not searched). Moves when the device
  walk is recorded. Device
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

- **G24 · MarketPane's GBP-as-base assumption — TODO · NOT YET.**
  *Renumbered 13 Sep 2026 from a second "G18". Re-verified: the GBP sites are
  still in `MarketPane.tsx`, now at :41-51, :92, :368.*
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

- **G20 · localStorage: account-level keys migrate to a
  user_preferences table (27 Aug) — DONE, differently from planned.**
  **Measured 1 Oct 2026.** The source of truth is the registry
  `artifacts/finance-tracker/src/lib/account-storage-keys.ts`, which a lock
  test keeps equal to the call sites: 112 exact keys plus 4 prefixes;
  75 account-level (synced), 24 device-local, 4 server-cache, 3 local-cache,
  6 onboarding. The "26 account-level / 18 device-local" figures in the
  plan text below are the 27 Aug estimate, kept as history; the "~70" below
  was the 13 Sep count. Re-measure from the registry, not from this entry.
  **Corrected 13 Sep 2026.** A shipped as `19bddb7` — a Dexie outbox
  (`lib/outbox-db.ts`), not the TanStack mutation cache below, covering
  transaction writes only. B shipped as `71a1142` (table, migration 0018),
  `4ba1998` (GET/PATCH `/settings/preferences`), `dc3a0a7` (client sync), syncing
  ~70 keys, not 26. Residue: the onboarding-flag consolidation was deliberately
  excluded (G60), and replay has no idempotency key (G53). Plan text: Two-migration sequence, ordered
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
  Deletes ~6,400 lines. **NOT built. TODO · NOT YET — unblocked 13 Sep 2026,**
  G20/B has shipped; no `context` column or `nr-active-context` key exists. Depends on G20/B shipping so the
  context preference has a home; also unblocks the localStorage
  persistence-fix side effect on the three mini-apps.

- **G22 · Logo mark craft follow-ups (27 Aug).** Four findings from the
  logo craft pass (commits `09706de` + `5ce48db`) that were verified
  but deliberately not fixed:

  **G22.1 · Cap overlap at the two junctions — DONE (`e0ec42c`,
  30 Aug 2026).** Fixed via draw-order + endpoint-shift, not via
  the single-path/single-colour rewrite the original entry proposed
  — that route is impossible for a two-tone mark (SVG only offers
  real `strokeLinejoin` mitres within a single `<path>` with a
  single colour). Actual fix: diagonal endpoints pulled one unit
  inward along the diagonal ((6,23)→(7,22), (22,5)→(21,6)), draw
  order reversed so verticals paint over the diagonal's round caps
  at the corners, verticals switched to `strokeLinecap="butt"` so
  no cap domes protrude past the mark's y=5/y=23 bounds. Sequential
  three-stroke animation preserved. `DIAG_LEN` updated 24.2 → 21.3.
  Trade-off documented at the commit: diagonal visibly stops one
  unit short of the corners in raw geometry, but the vertical
  covers those pixels — normal-viewing users see a clean corner;
  only high-zoom inspection reveals the endpoint. This is a "clean
  deterministic edge," not a true mitre.

  **G22.2 · Optical centring — mark sits low in the 28-box.**
  Numbers updated 30 Aug after `e0ec42c` (butt-cap verticals) and
  `6f787ad` (rings removed) changed the geometric bounding box.
  New geometric bbox (verticals + baseline, excluding the peak dot
  since it's a small element that reads as an accent, not extent):
  top y=5 (no more cap extension — butt caps land flush), bottom
  y ≈ 25.4 (baseline midline y=25, half-stroke 0.4). Centre y ≈
  15.2. viewBox centre is y=14. So the geometric centre is now
  ~1.2 units LOW rather than the 0.65 units the original entry
  cited — butt caps removed the extension that used to pull the
  geometric top up.
  Optical reading is unchanged, and arguably slightly worse. The
  ring removal took away one of the two upper-right accents (peak
  dot + rings) that pulled attention up; only the peak dot remains
  now. Without the ring's outward pull, the visual weight of the
  mark's lower half (the diagonal base + the baseline) reads more
  strongly, and the whole mark still sits low relative to the box.
  **Fix (unchanged):** `transform="translate(0, -0.5)"` — or,
  updated for the new geometry, `translate(0, -1)` — on the SVG
  root would optically centre it. Still a design change, still not
  applied. Logged so it can be a deliberate decision if the mark
  ever moves to a hero placement.

  **G22.3 · Sub-20px sizes need distinct heavier-stroke variants
  — still open, and now the favicon + PWA icons have DIVERGED from
  the header mark (30 Aug).** At 20 px the 2.0 stroke renders as
  1.43 px — sub-2px, aggressively anti-aliased regardless of
  coordinate choice. At 16 px it's 1.14 px — sub-pixel. No amount
  of coordinate maths on the current SVG makes these sharp; the fix
  is a purpose-built SVG per small size, with heavier strokes and
  simpler geometry (drop the baseline at 16 px).
  **Path correction 13 Sep 2026:** the sources are in `static/` (Vite's
  publicDir). `public/` is the build outDir; edits there are overwritten.
  **Existing static-SVG assets, all in `artifacts/finance-tracker/public/`:**
    - `favicon.svg` (viewBox 32×32, stroke 2.6, colours #CDD6F4 / #F4A21E / #08090B)
    - `icons/apple-touch-icon.svg` (viewBox 180×180, stroke 13, #E6EDF3 / #F4A21E / #0D1117)
    - `icons/icon-192.svg` (viewBox 192×192, stroke 14, same colours as 180)
    - `icons/icon-512.svg` (viewBox 512×512, stroke 36, same)
    - `icons/icon-maskable-512.svg` (viewBox 512×512, stroke 30, same, 80px safe-zone inset)
  **Divergence — introduced 30 Aug by `e0ec42c` + `6f787ad`:** all
  five files still exhibit the G22.1 cap-collision defect that the
  header mark just fixed. Each uses three separate `<line>` elements
  with `stroke-linecap="round"` meeting corner-to-corner, and none
  has the diagonal-inward + verticals-drawn-last + butt-cap
  correction. At favicon size (32 px browser tab) the effect is
  usually below the pixel threshold; at 180+ px (installed PWA
  icon, apple-touch-icon on the home screen) it's visible.
  **Additional inconsistencies, unrelated to Change 1:** favicon
  uses colour hex #CDD6F4 for verticals while the other four use
  #E6EDF3 — two different "text on dark" values with no theme-
  token source. Header uses `var(--nr-mark-vert)` at rest and
  `var(--ft-text)` on hover, resolving to different actual colours
  depending on the active `--ft-*` theme. No shared source: five
  hand-maintained SVGs will drift on every mark change.
  **What it would take to bring them in line:**
    1. Apply the cap-collision fix to each file: pull diagonal
       endpoints one unit inward along the diagonal, reorder JSX so
       verticals draw after diagonal, switch verticals to
       `stroke-linecap="butt"`. ~15 lines edited per file, no
       structural change. Half an hour for all five.
    2. Unify the colour hexes across the four PWA icons and the
       favicon. Pick one "verticals" colour and one "accent"; drop
       the two variants (#CDD6F4 vs #E6EDF3). Ten minutes.
    3. (Optional, larger) — extract a shared SVG generator so a
       future change to the mark ships across all size variants
       automatically. `scripts/src/render-icons.ts` reading a single
       geometry-and-colour source and writing all five files. Half
       a day; worth it once mark iteration outpaces manual edits.
  **Follow-up (unchanged from before):** if a tab-bar-size mark
  ever ships (currently the tab bar uses text labels, no mark), it
  needs a purpose-built SVG at ~20 px with heavier strokes.

  **G22.4 · iOS AppIcon.appiconset is one PNG — App Store rejection
  bait.** **Corrected 13 Sep 2026: the rejection claim is overstated.** A single
  opaque 1024×1024 PNG is Xcode 14+'s standard single-size app icon format;
  Xcode derives the rest. What remains is design (legibility at small sizes).
  Path is `artifacts/finance-tracker/ios/...`, not a root `ios/`. Confirmed inventory:
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
  wait this long.** **PARTIAL · NOT YET (13 Sep 2026).** Mostly moot: the
  shipped outbox stores writes without an FX rate and replays online, so an
  offline device never waits. Remaining: no short-timeout or serve-stale path on
  the server, and the "6s + 6s" below is wrong — the Yahoo FX call
  (`market.ts:102-108`) has no timeout of its own, only a circuit breaker;
  Frankfurter has 6s (`:149`). Discovered while wiring FX-at-write (30 Aug 2026).
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

### G25–G61 · merged 13 Sep 2026

**From the vault register and roadmap.** Register ids are kept in brackets
because they collided with existing G ids. Every claim below was re-checked
against source at `788463c` on 13 Sep; none was found fixed. "Unverifiable"
means it needs a database query, a browser, or infra access. Line numbers are as
of that check.

- **G25 · Dashboard: eight defects found by looking — TODO (staged) · NOW.** [B2, roadmap N4]
  One desktop screenshot of `/` at 1440, void theme: (1) currency bars sum to
  103%; (2) EUR reads 0% while holding €540.75; (3) savings rate shown twice,
  once as a currency amount; (4) net-worth history x-axis out of order;
  (5) "Recent transactions" shows June–July on 13 Sep; (6) the Net Worth card
  repeats ACCOUNTS/PORTFOLIO; (7) half the Portfolio Overview strip is dead;
  (8) "the rate moved -£985.41". Full task text in the vault at
  `Dev/staged-dashboard-defects-2026-09-13.md`. Verification is a before/after
  screenshot, not a test.
- **G26 · Transactions written with `accountId: 0` — TODO · NOT YET.** [G1] `split.tsx:2451`, and a second site at `components/csv-import.tsx:185`.
- **G27 · `upcoming.ts:220` debits `accounts[0]` by position when nothing is linked — TODO · NOT YET.** [G2]
- **G28 · Settling a null-`accountId` debt jumps net worth by the full amount — TODO · NOT YET.** [G3]
- **G29 · Dashboard silently drops FX-unconvertible debts; accounts have a counter, debts do not — TODO · NOT YET.** [G4]
- **G30 · Two FX helpers total the current month differently (`txToBase` vs `toBase`) — TODO · NOT YET.** [G5]
- **G31 · `accounts.id = 1` has `user_id IS NULL` — TODO, unverifiable from source · NOT YET.** [G6] The schema permits it: `user_id` is nullable on accounts, debts, goals, budgets, transactions, investments, upcoming and subscriptions since migration 0000.
- **G32 · Unconvertible cash contributes 0 to `netLiquidity` instead of unknown — TODO · NOT YET.** [G7]
- **G33 · `/market/detail` refuses index symbols by shape only — TODO · NOT YET.** [G8]
- **G34 · A no-caret index is caught only while Yahoo answers — TODO · NOT YET.** [G9]
- **G35 · A mixed quote request drops index rows with no notice in the body — TODO · NOT YET.** [G10]
- **G36 · Markets TLDR and quick-add scan error states never seen rendered — TODO, needs a browser · NOT YET.** [G11] Code exists at `markets-tab.tsx:558-609,1488` and `quick-add-transaction.tsx:90-171,353`.
- **G37 · `components/proto/` prints unsigned figures — TODO · NOT YET.** [G12] Not shipped (screenshot harness only); sites found were not exactly five.
- **G38 · `kpi-bar.tsx` and `MobileAccounts.tsx` ship to nobody — DECIDE (delete?) · NOT YET.** [G13] Overlaps D6.
- **G39 · `compact-tiles` "emergency fund" and "total cash" sum every asset type — DECIDE (semantics) · NOT YET.** [G14]
- **G40 · Balance sheet "owed" side merges loans and overdrafts in its label — TODO · NOT YET.** [G15] A comment at `accounts.tsx:3015-3020` says the merge was deliberate; the label is the defect.
- **G41 · ETF cards labelled "S&P 500", "NASDAQ 100", "Dow Jones" — index trademarks — DECIDE · NOW.** [G16] Re-tiered 19 Sep 2026: with prices gone these strings are the surviving market surface a tester still reads.
- **G42 · `ai-coach` prompt copy invites comparisons against an index it can no longer source — TODO · NOW.** [G17] Re-tiered 19 Sep 2026. `pages/ai-coach.tsx:63` still offers "What's my alpha? … vs S&P 500" while `lib/ai-context.ts:319` correctly tells the model the portfolio total is unknown, so the chip invites a question the app has already decided it cannot answer.
- **G43 · `nw_snapshots` has no liability bucket — DECIDE (design) · NOT YET.** [G18]
- **G44 · `recurring_patterns` has no client consumer — DECIDE (retire, or Confirm/Dismiss) · NOT YET.** [G19]
- **G45 · `/api/ai/status` reports available without testing a completion — TODO · NOT YET.** [G20]
- **G46 · `docs/CREDENTIAL-ENCRYPTION.md` claims a boot refusal that does not happen — TODO · NOT YET.** [G21] Same false claim in the comment at `lib/crypto.ts:7`: the key is read on first use, so the server boots without `CREDENTIAL_ENCRYPTION_KEY`.
- **G47 · Receipt photo spends the same 30/min AI budget as a one-line chat message — DECIDE · NOT YET.** [G23] Kept deliberately in `cc64e4d`; economics unmeasured.
- **G48 · Offline wipe verified in Chromium only, not the iOS WebView — TODO · NOT YET.** [G24] `7ed1426` says Chromium; no iOS evidence in the repo.
- **G49 · Queued offline writes unsendable at sign-out are discarded — DECIDE · NOT YET.** [G25] Already disclosed at `docs/PRIVACY.md:295-297`; the decision is whether to tell the user in the moment.
- **G50 · `2fa-attempts-*` counter row survives account deletion — DONE in `bbc4c19`.** [G26] Reached through the user's own challenge row, exact identifier; integration-tested on Neon dev.
- **G51 · Settings copy "Includes all local state stored by this app" is loosely worded — DONE.** [G27] The sentence now says what each button downloads: the server account less credentials, or this device's local settings only (2026-10-02).
- **G52 · The export file is built in memory per request (busiest user 18,019 request-metric rows) — DONE in `eb7ff92`** (streams a section and a page at a time); this line was left stale. [G28]

*Register G22 (I3 shown as TODO though shipped) is resolved by this edit — see I3 — and is not carried as an item.*

**Found while verifying, or carried from the planning docs:**

- **G53 · Offline replay has no idempotency key, and the conflict rules were never written — TODO · NOT YET.**
  `LOCAL-FIRST.md:82-93` claims "idempotent replay" is solved. The outbox id is
  a local auto-increment (`outbox-db.ts:29`) and replay sends no key (`:82-86`),
  so a retried replay can duplicate a transaction.
- **G54 · H5's dedup import is reachable by no screen, and the CSV path that is used drops real duplicates — TODO · NOT YET.**
  `/connections/:id/import` is absent from `openapi.yaml` and has no frontend
  caller. `/import` (`import.tsx:1551-1580`) creates rows with no dedup;
  `CsvImportModal` uses legacy `/import/csv` (`routes/import.ts:31,93`), whose dedup
  silently drops a second identical same-day purchase — the case H5 was built for.
- **G55 · Settings tells users to "Add WISE_API_TOKEN to your server environment" — TODO · NOT YET.**
  `settings.tsx:1661` and `openapi.yaml:3255`. No server code reads it since H2.
- **G56 · `docs/DATA-INVENTORY.md:194-195` says nothing deletes the offline cache or outbox — TODO · NOT YET.** Stale since `7ed1426`.
- **G57 · `first-run-flow-shot.ts` can still leak accounts — TODO · NOT YET.**
  `scripts/src/first-run-flow-shot.ts:356` calls `process.exit(1)` on a failed
  mobile sign-up, skipping cleanup; the summary always reports "deleted N of N"
  because the list is cleared before counting.
- **G58 · Local-first as described in `LOCAL-FIRST.md` — TODO · NOT YET.**
  `LOCAL-FIRST.md:16,43,47`: full dataset on device, delta sync, client-side
  computation. What shipped is a persisted response cache (`7d24d55`) plus the
  outbox; the server still computes. Build it or rewrite the doc's claim.
- **G59 · `CLAUDE.md` misstates the phone tabs and the theme count — TODO · NOT YET.**
  Four positions, not five fixed tabs (`lib/tab-slot.ts:88-94`); 14 themes, not 11.
- **G60 · Consolidate the four onboarding-flag lookalikes — TODO · NOT YET.**
  Deliberately left out of G20/B.
- **G61 · `lib/db/drizzle/meta` has no snapshots for migrations 0015–0017 — TODO · NOT YET.**
  The next `generate` diffs against a stale snapshot.

---

## Superseded

`docs/BACKLOG-old.md` holds the previous version. Section 6 of that file (the
persona-driven mobile home) was superseded by the design work recorded in
`docs/MOBILE-CONCEPT.md`; its useful parts are now F1 and D2.

### E6 (shipped as "D4") · Replace flag emoji with drawn currency icons — DONE (`568bb63`)
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
**Moves when** public signup has a business reason to pay for KYB and full
production, then testing against the live API. *13 Sep 2026: the adapter and its
routes are live server-side; no screen uses them.*

### H5 · File import as a first-class connection — PARTIAL · NOT YET (was DONE)
**Corrected 13 Sep 2026.** The server side is built and tested; no screen calls
it, and both import paths users actually reach bypass it. Detail and the
data-loss consequence in G54. Moves when the UI imports through
`/connections/:id/import`.
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

### I1 · No admin role that can read user financial data — DECIDE (was DECIDED) · NOT YET
**Corrected 13 Sep 2026.** Source now contradicts the decision in part:
`routes/admin.ts` (`f2112cd`, 6 Sep) is allowlist-gated and fails closed, and
returns every user's email plus per-table row counts. Not balances or
transactions, but personal data, not "aggregate metrics with no personal data".
**Moves when** the overview is reduced to aggregates, or this entry records the
exception and `PRIVACY.md` discloses it.
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

### I2 · Privacy policy and terms — IN PROGRESS (was TODO) · NOW, blocks public signup
**Corrected 13 Sep 2026.** Drafted from source: `docs/PRIVACY.md`,
`docs/TERMS.md`, `docs/DATA-INVENTORY.md` (`8407256` 11 Sep, `a68ee72`, `b2b9dbe`).
Not publishable: **35 `[TO CONFIRM` markers** (PRIVACY 21, TERMS 12,
DATA-INVENTORY 2) and 10 `[BLOCKED` in PRIVACY. The register and roadmap say "26
questions" (register C12, roadmap N2) — on 11 Sep that was the subset of 33
markers only Thomas can answer; the marker count has since moved, so recount
before treating 26 as current. No privacy or terms page in the app yet.
The processor list below is incomplete: Groq, Cerebras, Resend, Frankfurter,
Polygon and Twelve Data are missing.
**Moves when** Thomas answers the questions (legal name, address, lawful basis,
minimum age, governing law) and the pages are served.
Needs: what is collected, lawful basis under UK GDPR, retention period, who it
is shared with (Neon, Render, Vercel, Yahoo, Alpaca, and any open-banking
provider), and the subject access and deletion routes.

### I3 · Account deletion that actually deletes — DONE (was TODO; shipped 5 Sep 2026)
**Corrected 13 Sep 2026 — stale for eight days.** `POST /account/delete`
(`1e490d6`, 5 Sep); typed-email confirmation in `pages/profile.tsx` on desktop and
phone (`064def6`); follow-ups `d1b4ce6` (verification rows by exact match, not
`LIKE` — it over-matched other users), `7ed1426` (sign-out and deletion wipe the
device's IndexedDB cache and outbox), `e5f3ace`. Merged register C2, C3 here.
Residue, tracked elsewhere: backup retention is unstated on the screen
(PRIVACY `[TO CONFIRM]`, I2); deletion never reaches the Neon `dev` clone (I10);
`2fa-attempts-*` survives (G50); iOS WebView wipe unverified (G48).
Original text: Every table cascades from `user.id`, so the mechanism exists. Needs a
user-facing route, a confirmation, and a stated retention window.

### I4 · Breach process — TODO · NOT YET
*Re-verified 13 Sep 2026: nothing in `docs/`; DATA-INVENTORY and PRIVACY both
say there is none. The roadmap does not name it, so it defaults to NOT YET —
which conflicts with this section being signup prerequisites. Needs a call.*
UK GDPR requires notifying the ICO within 72 hours of becoming aware of a
qualifying breach. Write down who does what before it is needed.

### I5 · Data minimisation review — IN PROGRESS (was TODO) · NOT YET
**Corrected 13 Sep 2026.** `docs/DATA-INVENTORY.md` records what is held, why,
and for how long per class — the input to the review. No keep-or-drop decisions
are recorded; that is what moves it.
Currently stored: balances, transactions with merchant strings, debts naming
counterparties, and encrypted provider credentials. Review whether each is
needed, and how long it is kept.

### I6–I16 · merged 13 Sep 2026

From the vault register (section C) and roadmap. Re-checked against source on
13 Sep; none fixed.

- **I6 · Email address cannot be changed at all — TODO · NOW.** [C5, N5]
- **I7 · No AI on/off switch — TODO · NOW.** [C6, N6]
- **I8 · Digest unsubscribe link is `href="#"` — TODO · NOW.** [C7, N7] `digest.ts:78`.
- **I9 · People who are not users, named in debts, shared expenses and receipts, have no route to access, correction or erasure — DECIDE (product) · NOW.** [C8, N8]
- **I10 · Neon `dev` branch is a live clone of production that deletion never reaches — DECIDE (Thomas, infra) · NOW.** [C4, N9] Infra, unverifiable from source; `DATA-INVENTORY.md:58-59` lists it, no decision recorded.
- **I11 · Vercel Hobby has no DPA and is non-commercial, yet proxies every `/api` request — DECIDE (cost) · NOW.** [C9, N10] The rewrite is in `artifacts/finance-tracker/vercel.json`; the plan tier is stated only in PRIVACY:164.
- **I12 · Google Fonts loaded from Google's CDN (LG München I, 3 O 17493/20) — TODO · NOT YET.** [C10] Also cached by the service worker (`vite.config.ts:54`). The roadmap puts it "just below the line".
- **I13 · Cerebras treats a personal-capacity customer as an independent controller — TODO · NOT YET.** [C11] Just below the line, as I12.
- **I14 · Export covers the whole account, less credentials — DONE (`e5f3ace`, `788463c`).** [C1] 25 of 26 tables, 10 credential fields withheld with reasons.
- **I15 · Settings states what the AI is actually sent — DONE (`a68ee72`).** [A12]
- **I16 · Consent captured at sign-up, documents linked — TODO · NOT YET.**
  `PLAN-Q3.md:124`. Nothing in `auth-gate.tsx` links terms or privacy, and no
  consent column exists. Not named in the roadmap, so NOT YET by default — but it
  is the step that makes I2 bind anyone. Needs a call.

---

## J. Markets, portfolio and the thesis

Merged 13 Sep 2026 from the vault register (sections E, F, H) and roadmap.
Reasoning, including the regulatory perimeter on recommendations, lives in the
vault at `Atlas/Projects/Numeris-Markets-Ideas.md` and is not copied here.
**Perimeter:** everything here describes money the user already holds; ranking
what they *should* hold is a regulated activity and is ruled out.

**Data and licensing**

- **J1 · Market data vendor decision — DECIDE (Thomas) · NOT YET.** [H3, H4, N3]
  Twelve Data Venture from $149/mo with external display rights (less 20%
  student, 17% annual). Ask the three numbered questions in writing before
  paying. `BLOCKER.md` falsifier 2: Alpaca's terms are personal and
  non-commercial.
  **Re-tiered NOT YET, 19 Sep 2026.** The body said NOW while the index row
  said NOT YET; the index was right and the drift is corrected here. The
  withdrawal in `3d8d8e4` answers the question a different way: no vendor is
  paid for, `ENABLE_MARKET_DATA` is off, and nothing in NOW depends on a quote
  any more. A tester round and a store submission both complete without this.
  It returns to NOW only when Thomas decides markets are back in the product,
  and the £/$ cost is then a paid subscription against an app with no revenue.
  **Licence read per provider, 19 Sep 2026 evening** (every clause quoted with
  URL in `.review/archive/2026-09-19T*-markets-legal-form*.report.md`
  appendix A, and in the vault at `Atlas/Projects/Finance-Tracker/Market-Data-Providers.md`).
  The "$149/mo" above is wrong: Twelve Data Business Venture reads **$499/mo
  ($414 annual)** today and is the cheapest written display grant found. Three
  legal tiers: (0) none, cost basis only, today; (1) **background valuation,
  Tiingo Commercial $50/mo** (ToS §1.6(b) persistence on paid plans, §1.6(c)
  Derived Products naming "percentage returns" and "aggregated statistics",
  §7.3 internal consumption only), screens show portfolio total, allocation and
  portfolio return only, never a price or a per-position value, guarded for the
  one-holding case where the aggregate collapses to the price; (2) **display,
  Twelve Data Venture $499/mo**, prices and per-position values. Crypto on any
  tier: CoinGecko Basic $35/mo with "Data provided by CoinGecko" attribution.
  FX stays ECB via Frankfurter, cite ECB. LSE holdings need LSE's own Schedule B
  §3.3.6 written waiver whatever the vendor. Rejected with the clause: Massive
  individual tiers ("solely for your own personal, non-commercial, and
  non-business purposes"; Business $2,499/mo US-only), Finnhub, EODHD published
  tiers, Alpha Vantage, FMP, Nasdaq Data Link (Order Form), Stooq, Marketstack
  (no display clause in the binding agreement), Databento (best language,
  $199/mo, US-only, terms unreadable). Recommendation: tier 1 when markets
  return, after Tiingo's LSE/EU coverage and the LSE waiver are confirmed in
  writing. Decision is Thomas's; see the roadmap's decision 4.
- **J2 · Alpaca commercial licensing — revisit ~Mar 2027 — PARKED · NOT YET.** [H5]
- **J3 · Index levels refused server-side, by shape and provider type — DONE (`45d284b`).** [A9]
- **J28 · `fxRatesFromYahoo` is not behind `ENABLE_MARKET_DATA` — PARTLY DONE (`bb8edf6`).**
  Done 2 Oct: with the flag off the Yahoo lane is skipped and every rate is the
  ECB fixing via Frankfurter. Still open: the `fx_rates` table and "ECB" in the
  `fx` provenance mark.
  `api-server/src/routes/market.ts:103-130` still scrapes Yahoo for FX on a
  cache miss (in-process, 5-minute TTL) while the product says markets are off
  and Yahoo is out (scraping, `Atlas/Settled.md`). Found 19 Sep by the code
  map for the markets plan. Fix: route FX through the ECB/Frankfurter path
  only, persist rates in an `fx_rates` table (date, base, quote, rate,
  provider `ecb`), and put "ECB" in the `fx` provenance mark. Independent of
  J1; do it now.
- **J29 · Background EOD valuation job and snapshot tables — TODO · NOT YET, behind J1.**
  The repo has no scheduler: no cron, no Render cron job, no timer.
  `eod_prices` (`lib/market-eod.ts`; not tenanted) fills lazily on request;
  `nw_snapshots` is a monthly lazy upsert; `account_balance_snapshots` a daily
  lazy one. When J1 picks tier 1: a Render cron at 03:00 UK hitting an
  authenticated internal route that (a) fetches one close per distinct held
  ticker into `eod_prices` (provider `tiingo`, crypto `coingecko`), (b) writes a
  tenanted `portfolio_snapshots` row per user (total, class subtotals,
  allocation, portfolio-level day change; per-position values computed and
  never serialised), (c) makes `nw_snapshots` daily with `positionsAtCost` = 0
  and `valuationAsOfSession` set. Screens read snapshots and never trigger a
  fetch; if the job has not run they fall back to cost basis with the
  `positionsAtCost` copy, as today. Full plan in the 19 Sep report §1.2.

**Markets features — approved by Thomas 13 Sep 2026**

- **J4 · Attribution: market vs currency vs money added — TODO · NEXT.** [E1]
- **J5 · Dividends as dated income into D1 — TODO · NEXT.** [E2]
- **J6 · Cost of ownership measured: basis, FX spread, fees, dividends — TODO · NOT YET.** [E3]
- **J7 · "While you slept" — the overnight US session summary — TODO · NEXT.** [E4]
- **J8 · Timing vs holding — money-weighted against time-weighted — TODO · NOT YET.** [E5]
- **J9 · Dividends meeting goals — TODO · NEXT.** [E6]
- **J10 · Per-holding FX split — TODO · NOT YET.** [E7]
- **J11 · Provenance on prices — "Friday's close, last known at…" — TODO · NOT YET.** [E8]

**Thesis — honest under incomplete data**

- **J12 · Balances are ground truth; transactions are a story about them — TODO · NOT YET.** [F1]
- **J13 · Confidence as a property of every figure — TODO · NEXT.** [F2]
- **J14 · "You stopped logging on the 3rd" — TODO · NEXT.** [F3] F10 with a voice.
- **J15 · Quiet mode — works from balances alone, never nags — TODO · NOT YET.** [F4]
- **J16 · Inferred transactions from balance deltas, labelled as inference — IDEA · NOT YET.** [F5]
- **J17 · One question a day — IDEA · NOT YET.** [F6]
- **J18 · Decision journal (not recommendations) — IDEA · NOT YET.** [F7]
- **J19 · "What breaks first" — dated per-obligation stress — IDEA · NOT YET.** [F8]
- **J20 · Household as a first-class unit — IDEA · NOT YET.** [F9] Same commitment as `TARGET-PRODUCT.md:34` (shared household accounts), merged here.
- **J21 · Local inference for categorisation — IDEA · NOT YET.** [F10]
- **J22 · The app grades its own predictions — IDEA · NOT YET.** [F11] Needs months of its own history first.
- **J23 · Double-entry substrate plus incomplete-records technique — IDEA · NOT YET.** [F12] A substrate rewrite.
- **J24 · Currency as a life position — IDEA · NOT YET.** [F13]
- **J25 · Permission instead of restriction — ADOPTED as a copy principle, not a build item.** [F14] The roadmap says it governs every line of copy from now on. Counted, but has no tier.

**Retired 19 Sep 2026 by the market-data withdrawal**

Both had index rows and no body entry, which is how they survived the 13 Sep
reconciliation unexamined. Written out here at the moment they are dropped, so
the record says what was retired rather than only that something was.

- **J26 · Valuation without display: EOD only, aggregate figures, never a per-security price — DROPPED.**
  It was the compromise position: value a holding from a completed session
  close and never show the price itself. `lib/market-flag.ts:9-12` overrules it
  in writing — "a price on a screen is a price on a screen, whatever its age" —
  so an EOD close that values a holding is inside the flag like any other quote.
  The idea is not wrong; it is unreachable without a licence, which is J1.
- **J27 · Phone HOME shows per-security live prices under a LIVE badge — DROPPED.**
  Fixed by `MarketPane`'s retitling to WHAT YOU HOLD on 16 Sep, then made moot
  by the flag, which hides the pane entirely. Nothing to do.

---

## K. AI

- **K1 · AI chain cut to Groq → Cerebras; `:free` models refused in code; every feature fails visibly — DONE (`f923471`, `17564bc`).** [register A10]
- **K2 · Receipt scan counts against the AI rate limit — DONE (`cc64e4d`).** [register B1] The economics question is G47.
- **K3 · Per-user daily AI budget — TODO · NOT YET.** `PLAN-Q3.md:282`. Only 30/min per user exists (`app.ts:131-134`).
- **K4 · Operator alert when a provider lane dies — TODO · NOT YET.** `PLAN-Q3.md:285`. Users see a reduced-capacity state; nobody is alerted.
- **K5 · Consistent AI quality across providers — PARTIAL · NOT YET.** `PLAN-Q3.md:152`. Per-task Groq models exist (`lib/ai-providers/groq.ts:31-39`); the chain order is the same for every task (`chain.ts:13`).

*Not merged: register H6 (`vault-backup.sh` reports writes it did not make) is
machine-side, not Numeris, and stays in the vault.*

---

## L. What the market-data withdrawal broke

Added 19 Sep 2026. The switch in `3d8d8e4` is correct and the server is safe.
These are the places the product does not yet tell the truth about the absence.
L1 to L4 are tester-visible today.

- **L1 · Phone HOME prints `PORTFOLIO £0` for a market-persona user with holdings — DONE (`c83b349`, `2abb90b`, `52c3b8d`).**
  Chain: `lib/market-eod.ts:350-352` returns an empty price map when the flag is
  off; `routes/dashboard.ts:230-232` returns all-null for an unpriced position
  and `:268` skips it, so `portfolioValueBase` stays 0; `:819` serialises
  `totalValueBase: 0`; `components/mobile/MobileHome.tsx:358` tests `!= null`,
  which 0 passes, and renders `£0` under a `—` day change.
  `lib/ai-context.ts:316-325` does the right thing for the same fact, setting
  the total to `null` with the reason "market data is off on this deployment",
  and its comment claims it is doing "the same null-propagation the dashboard
  uses". It is not. Fix the server to return `null`, then let the screens say
  they do not know.
  Done when: a user with holdings and the flag off sees a stated unknown rather
  than a number, on phone HOME, phone WORTH and the desktop dashboard.
- **L2 · Net worth silently omits the whole portfolio — DONE (`c83b349` lock, `9dfba29`).**
  `9dfba29` closed the two client-side sums (`/accounts` wealth strip,
  `/net-worth-history` live strip, auto-fill and auto snapshot).
  `routes/dashboard.ts:798` computes net worth from `portfolioValueBase`, which
  is 0 for every position. `pages/investments.tsx:1817-1824` and
  `pages/dashboard.tsx:3558` do caption `unavailablePositions`; the two phone
  headlines do not — `components/mobile/MobileHome.tsx:382` and
  `components/phone/WorthScreen.tsx:582` render `dashboard.netWorth` bare.
  No test covers net worth with the flag off: grepped every file containing
  `ENABLE_MARKET_DATA` under `artifacts/api-server/src` and
  `artifacts/finance-tracker/src`, zero `netWorth` references in any of them.
  This is the defect class `CLAUDE.md` names as the worst a finance app ships.
  Done when: a lock test asserts the behaviour under both flag states, and no
  surface shows a net-worth figure that excludes a position without saying so.
- **L3 · Onboarding still sells market data — DONE (`fdb5f53`).**
  `components/onboarding.tsx:64` offers "Investments and market prices / Live
  prices, portfolio P&L, earnings calendar" as the first of four tracks. Neither
  `onboarding.tsx` nor `components/persona-quick-start.tsx` contains
  `useMarketDataEnabled` (grep count 0 in both). Picking it sets persona
  `market` (`onboarding.tsx:41-42`), whose default slot is `markets`
  (`lib/tab-slot.ts:111`), which `resolveSlotId` then rewrites to `upcoming`.
  A user who said investments are what they care about is given an UPCOMING tab.
  Done when: the first screen a tester sees offers nothing the deployment
  cannot serve, and the market persona either goes behind the flag or is
  re-described around holdings and cost.
- **L4 · `/portfolio` empty state and benchmark panel still promise prices — DONE (`40fc2ad`).**
  `pages/investments.tsx:2075` prints "vs S&P 500 ± 0.00%" inside the ASCII
  terminal a brand-new user meets; `:2093-2096` lists "Live prices via Yahoo
  Finance", "Portfolio vs S&P 500 benchmark" and "Dividend tracker + earnings
  calendar" as what they will get; `:2162` titles a panel "Portfolio vs S&P 500"
  while the SPY series it names is disabled at `:1564`. Overlaps G41 and G42,
  which are re-tiered to NOW alongside this.
  Done when: nothing on `/portfolio` names a price source or an index.
- **L5 · `MarketPane` took the FX rows and the holdings list down with it — TODO · NEXT.**
  `lib/market-flag.ts:22-33` keeps FX and cost basis outside the flag on purpose,
  and `components/mobile/MarketPane.tsx:48-52` says the same in its own comment.
  The pane is titled WHAT YOU HOLD (`:241`) and carries the user's tickers,
  quantities and the FX rows, all of which survive the licensing decision, and
  all of which are hidden because the whole pane is gated. That over-reaches
  the stated policy. G24's five cited sites are all FX rows inside this pane.
- **L6 · The market persona has no differentiating widget left — DECIDE · NEXT.**
  `market-snapshot` was first and full-width for the `market` persona
  (`lib/persona.ts:45,50`) and one of five enabled at first run (`:44`).
  `pages/dashboard.tsx:3383-3387` drops it from both `enabledIds` and
  `disabledIds`, so the grid closes up cleanly and the persona is left with the
  four `FIRST_RUN_CORE_WIDGETS` everyone else gets (`persona.ts:56-59`).
  The decision is what fills the full-width slot. Candidates already in this
  backlog, ranked: F9 (Safe to Spend at main-number weight, already rendering at
  `top-region.tsx:425`), F10 (completeness), J19 ("what breaks first"), J6 (cost
  of ownership), G44 (recurring confirm/dismiss).
- **L7 · Restate what Numeris is, without market data — DECIDE · NEXT.**
  `docs/TARGET-PRODUCT.md:25-29` ("the world moves on the screen") and
  `:152-178` (persona resolves finance-app vs stock-tracker) both rest on prices
  arriving by themselves. `:167-170` states the retention thesis outright: "a
  budget shows the same numbers tomorrow, a portfolio moves overnight without
  the user touching it." The portfolio no longer moves. What still moves
  overnight is FX, which is real for a Malaysian household holding US and UK
  assets and is exactly what J4 (attribution) and J7 ("while you slept") were
  going to measure. Either TARGET-PRODUCT is amended to say so or the goal is
  narrowed. This is `BLOCKER.md` falsifier 2 asking its question, and the
  answer is Thomas's.

---

## M. Store submission — App Store and Google Play

Added 19 Sep 2026. Rules checked against Apple's live guidelines page and Play
Console help, fetched 2026-09-19; Apple's page renders no revision date and no
Play help page fetched rendered one, so every rule here is "current as fetched"
rather than dated. Apple Developer Program membership is paid and enrolled as
an **Individual** (`Atlas/Settled.md`, 26 Aug 2026). Google Play registration
($25) is unpaid. Ship v1 free, so the Free Apps Agreement applies and no
banking or tax form is needed.

What already holds: account deletion exists in-app and deletes records rather
than deactivating (`routes/account.ts:16-34`, `lib/account-deletion.ts:96`, UI
at `pages/profile.tsx:1485-1548`), which satisfies Apple 5.1.1(v) and Play's
in-app limb. The UIScene migration is coherent and locked
(`src/lib/ios-scene-adoption.lock.test.ts`). No payment-initiation code ships:
grep for `payment.?initiat|initiatePayment|/payments|PISP` across
`artifacts/api-server/src` returns zero hits, so Numeris is account-information
only today, which keeps it clear of Apple 3.1.3 and of PIS licensing.

- **M1 · Apple 5.1.1(ix): a legal entity, not an individual developer — DECIDE (Thomas) · NOW.**
  Apple's text, quoted verbatim from the guidelines page on 19 Sep 2026: "Apps
  that provide services in highly regulated fields (such as banking and
  financial services, healthcare, gambling, legal cannabis use, air travel and
  crypto exchanges) or that require sensitive user information should be
  submitted by a legal entity that provides the services, and not by an
  individual developer." Numeris holds bank account data.
  `docs/PRIVACY.md:20-21` says the service is "run by one person, not a
  company", and the Individual enrolment is a settled decision from 26 Aug.
  Three routes, none of them free: form an entity and re-enrol; ship Android
  plus an iOS PWA and drop the App Store; or narrow the product so it holds no
  bank connection, which costs the H section. No code change resolves this.
- **M2 · Apple 4.8: Sign in with Apple beside Google — TODO · NOW.**
  4.8 binds because Google Sign-In is offered and none of its five exemptions
  applies. The code is already there and only the credentials are missing:
  `routes/auth-providers.ts:43` and `lib/better-auth.ts:237` wire Apple,
  `components/auth-gate.tsx:55,70` renders the button, and production returns
  only `["google","github"]` because `APPLE_CLIENT_ID` and
  `APPLE_CLIENT_SECRET` are unset. There is also no `.entitlements` file
  anywhere in the iOS project. Roughly a day, mostly portal work.
- **M3 · Apple 5.1.2(i): explicit permission before a third-party AI sees personal data — TODO · NOW.**
  Apple's text, verbatim: "You must clearly disclose where personal data will be
  shared with third parties, including with third-party AI, and obtain explicit
  permission before doing so." `docs/DATA-INVENTORY.md:305-312` records that
  there is no opt-in and that four pages send the financial position to Groq or
  Cerebras on a timer (`pages/dashboard.tsx:942`, `budget.tsx:503`,
  `goals.tsx:907`, `investments.tsx:885`). Same work as N6 in the roadmap and
  the same `[BLOCKED]` markers at `docs/PRIVACY.md:152` and `:265`; doing it
  once clears a store rule and a GDPR obligation together.
- **M4 · No camera usage-description string — TODO · NOT YET.**
  `artifacts/finance-tracker/ios/App/App/Info.plist` is 70 lines and contains
  zero `UsageDescription` keys, while `components/quick-add-transaction.tsx:320`
  and `pages/split.tsx:291,319` use `capture="environment"`. On a device that is
  a crash in front of a reviewer, not a warning. An hour.
- **M5 · No privacy manifest — TODO · NOT YET.**
  No `*.xcprivacy` exists anywhere in the repo outside `node_modules`. Missing
  required-reason declarations are an automated rejection before a human sees
  the build. Two to four hours.
- **M6 · No public web URL for privacy, terms, support or deletion — TODO · NOT YET.**
  Play requires both an in-app deletion path and a **web** URL where deletion
  can be requested. Numeris has the first and not the second. None of the routes
  in `src/App.tsx` is `/privacy`, `/terms` or `/support`, and
  `artifacts/finance-tracker/vercel.json` rewrites everything to `index.html`,
  so `numeris.page/privacy` returns the SPA shell. One deliverable clears the
  privacy-policy URL, the support URL and the deletion URL at once, and it is
  gated by the 8 `[BLOCKED]` and 21 `TO CONFIRM` markers in `docs/PRIVACY.md`,
  whose own header forbids publication while any remain. One to two days after
  those are answered.
- **M7 · Reviewer demo account — TODO · NOT YET.** The app is login-gated, so
  both stores need working credentials in the review notes, on an account
  carrying enough data that the reviewer sees a product rather than an empty
  state. One to two days, and it interacts with L1 to L4: the demo account is
  the first place a `£0` portfolio would be read as a broken app.
- **M8 · Screenshots, age rating, review notes, export compliance — TODO · NOT YET.**
  Mechanical, but none of it exists. Export compliance is a 30-minute flag.
- **M9 · Enable Banking tier — DECIDE (Thomas) · NOT YET.**
  `adapters/enable-banking.ts:1-7` states the current tier in its own header:
  "Restricted Production tier fits this project's shape exactly today: one user,
  own accounts, real data, no company, no cost." A listed app is none of those
  four. Ask Enable Banking in writing what a public app needs, the same way the
  Alpaca question was asked. Two hours to send, and the answer could change M1.
- **M10 · Deletion does not revoke the bank consent — DONE · 7d02175 (1 Oct).**
  Fixed: account deletion and connection deletion now call
  `DELETE /sessions/{id}` first (`lib/bank-consents.ts`); a provider failure
  returns 502 and deletes nothing. Not yet exercised against the live Enable
  Banking API. Original finding: no `revoke` call existed in
  `adapters/enable-banking.ts`, so deleting an account left a live consent at
  the provider. Not a store rule. It is a
  GDPR one, and it is the kind of thing that reads badly next to a deletion
  feature the store listing advertises. A day.
- **M11 · Android does not exist — DECIDE · NOT YET.**
  No `android/` directory, `@capacitor/android` is not a dependency, and only a
  dead `cap:android` script remains at
  `artifacts/finance-tracker/package.json:16`. One to two days to a
  device-installable build. The long pole is policy: a new personal Play
  account needs testers opted in continuously for fourteen days before
  production access, and the current target-API deadline has already passed,
  so the API level must be checked against Play Console before building.

- **M12 · `docs/DATA-INVENTORY.md` is stale on the deletion LIKE bug — TODO · NOT YET.**
  `DATA-INVENTORY.md:71-74` still describes `identifier LIKE '%<email>'` in the
  account-deletion path as a live defect. It was fixed on 13 Sep:
  `lib/account-deletion.ts:83-88` now uses two `eq()` comparisons, and the
  comment above it at `:72-82` records the suffix-match and `_`-wildcard
  reasoning in full. A store-readiness sweep on 19 Sep read the doc rather than
  the code and reported the bug as open, which is the cost of leaving it. Check
  the rest of `DATA-INVENTORY.md` against the code in the same pass.

---

## N. The UI/UX overhaul

Added 19 Sep 2026 from a full audit of every screen against `docs/DESIGN.md`,
the Anti-Vibe Constitution and Mobile Amendment in
`artifacts/finance-tracker/src/index.css`, `docs/AI-DESIGN-TELLS.md` and the
vault's `Atlas/Style-AI-Slop-Tells.md`. Measured shape: 41 phone URLs of which
40 are live, 5 purpose-built phone screens, 16 desktop pages rendered inside a
back-button wrapper, 8 dead ends, 4 tab positions; 37 desktop routes against 28
sidebar entries, 9 of them with no sidebar entry at all. Phone first, because
it is where the audit found every blocker.

The rule for this section: **a design iteration is shown before anything is
built** for N8, N9 and the HOME and UPCOMING work. Thomas picks. The
corrections in N1 to N7 need no design input and can go first.

**Blocks the tester round**

- **N1 · The Add CTA on phone UPCOMING does nothing — TODO · NOW.**
  `components/phone/UpcomingScreen.tsx:528` is `onCta={() => {}}`, under copy at
  `:525` reading "Tap + to add a bill, subscription, or income item." There is
  no `+`. There is no way to create a bill, a subscription or an income item
  anywhere on the phone. `DESIGN.md` §16 says a control that does nothing is a
  lie. The root cause is worth recording: `components/mobile-ui.tsx:56-72` makes
  `ctaLabel` and `onCta` required at the type level for `scope="screen"`, to
  enforce the Amendment's "one thing the user can do" rule, and the guard
  produced the exact defect it exists to prevent. One of 11 `onCta=` sites is a
  no-op; this one.
- **N2 · No press feedback on any phone row — TODO · NOW.**
  `components/phone/HoverRow.tsx:18-19` handles `onMouseEnter` and
  `onMouseLeave` only, and its own header calls itself a no-op on phone. It
  wraps `PhoneEntityRow.tsx:196` and `StatGrid.tsx:47`, which is every row on
  WORTH, SPENDING and UPCOMING. One file, and the cheapest fix in the audit.
- **N3 · No phone settings screen — TODO · NOW.** `components/mobile/MobileSettings.tsx`
  is 772 lines and is imported by nothing. A phone tester meets the 2,984-line
  desktop `pages/settings.tsx` in a wrapper. First deliverable is a measured
  diff of what the desktop page does that the mobile one does not, so
  revive-versus-rewrite is decided on evidence.
- **N4 · Eight phone routes are dead ends — DECIDE · NOW.**
  `components/phone/PhoneShell.tsx:72-80`. A route that renders "desktop only"
  is a route that should not be reachable from the phone directory.
- **N5 · Phone HOME has no error or loading state — TODO · NOW.**
- **N14 · The docs describe a phone that does not exist — TODO · NOW.**
  `CLAUDE.md` says five tabs (HOME, WORTH, SPENDING, UPCOMING, DIRECTORY).
  `docs/MOBILE-CONCEPT.md` says four with different names (HOME, MONTH, MOVE,
  FIND). The code has four positions with one persona-driven slot:
  `lib/tab-slot.ts:88-93` and `components/phone/PhoneTabBar.tsx:41-45`. SPENDING
  and UPCOMING are two options for the same slot and are never both on screen,
  so UPCOMING has no tab of its own. Flagged in `Atlas/Inbox.md` on 16 Sep and
  never corrected. Correct `CLAUDE.md` first: every "where does this live"
  argument is currently being made against a shell that is not there.

**Needs a design iteration before any code**

- **N8 · The phone's shape — DECIDE · NEXT.** Three alternatives, drawn at 390px
  in `void` and `arctic`, tab bar and directory only, no screen content:
  (A) five fixed tabs and the slot dies; (B) four tabs with UPCOMING as a lens
  on SPENDING; (C) four tabs with DIRECTORY promoted to a real second surface.
  Everything else on the phone depends on the answer, so this goes first.
  **Rendered 19 Sep 2026**, from the seed account's live API responses with the
  flag off, at 390×844 @2x in `void` and `arctic`, HOME plus one detail screen
  each, not bar-only: `.review/shots/directions-2026-09-19/{A,B,C}-*.png` (HTML
  beside them). A "the ledger": five tabs, ruled HOME, UPCOMING with an inline
  add row. B "allowance first": four tabs, SPENDING carries a This month /
  Upcoming lens, HOME's fixed thumb-zone band is £258.90 a day in 44px with a
  free/goals/bills bar by length and "Log a spend". C "jobs, then the index":
  four tabs, HOME is "Needs you" sentences with a verb each, DIRECTORY carries a
  live figure on every row. Session recommendation B (it is F9 taken
  literally); Thomas picks. Detail in the 19 Sep report §3.
- **N9 · The 16 wrapped desktop pages — DECIDE · NEXT.**
  `PhoneShell.tsx:82-86` already admits it: "Every wrapping is a live iPad-audit
  defect." 24,779 lines, 2,061 inline styles and 69 hover-only affordances reach
  the phone this way. The decision is which of the 16 become phone screens,
  which become sheets, and which stop being reachable on the phone at all.
- **HOME, after N8.** Four things to draw before building: what its one action
  is; populated, loading and failed side by side; row identity with and without
  glyphs; and a version with its 18 middots removed.
- **UPCOMING, after N1.** Two add affordances drawn against the real screen, a
  FAB matching SPENDING against an inline add row, each with its empty state.

**Corrections, no design input needed**

- **N6 · Sub-44px tap targets — TODO · NEXT.** The Mobile Amendment
  (`index.css:82`) says 44px with no exceptions. `InsightSlot.tsx:96` is 32px,
  reachable through `reconciliation-insight.ts:77` and `WorthScreen.tsx:360,481`;
  `UpcomingScreen.tsx:287-306` lens filters are about 28px.
- **N7 · Phone paints the desktop shell first — TODO · NEXT.**
  `hooks/use-mobile.tsx:6` initialises to `undefined`, so `!!undefined` is false
  and `App.tsx:214` renders `<Layout>` before the effect corrects it.
- **N10 · 644 hardcoded `rgba()` in `artifacts/finance-tracker/src` — TODO · NOT YET.**
  Measured with `grep -ro "rgba(" | wc -l`. They bypass the `--ft-*` tokens that
  make eleven themes possible, `arctic` included. Mechanical, and the highest
  leverage desktop cleanup.
- **N11 · Four implementations of a panel — DECIDE · NOT YET.** `DESIGN.md` §1
  sanctions three. The fourth is `PANEL_STYLE`/`HEADER_STYLE` at
  `components/settings-atoms.tsx:6-13` with 15+ call sites. Separately,
  `PanelBox` is imported and never rendered in 10 files, and `pages/portfolio.tsx`
  is six lines of which five imports are dead.
- **N12 · 28 sidebar entries — DECIDE · NOT YET.** Two desktop directions rendered 19 Sep at 1440×900 in both themes, `.review/shots/directions-2026-09-19/D{1,2}-dashboard-*.png`: D1 "report", a six-entry rail with the read side ruled and the operate side framed; D2 "terminal", a twelve-entry grouped sidebar with a KPI strip and ruled tiles. Session recommendation D1. Against `CLAUDE.md`'s own
  ~20 rule. The sidebar's own styling is §12-compliant on every point; the
  problem is the count, not the treatment.
- **N13 · `docs/STYLE-INVENTORY.md` is stale by 34% — TODO · NOT YET.**
  It records 11,714 `style={{`; the measured count on 19 Sep is 7,710.
  `pages/investments.tsx` alone went 717 to 264 in `b282d63`, which landed
  after the doc was written.

**Verified clean, with the coverage stated.** Zero emoji in
`artifacts/finance-tracker/src`: 137 dingbat hits, all on the `no-emoji.test.ts`
allowlist, none in the flag or pictograph ranges. The currency-flag maps
`CLAUDE.md` names in `net-worth.tsx` and `accounts-summary.tsx` are gone, and
`layout.tsx:245-250` uses country codes. No empty-state artwork, no gradients,
no transition over 150ms in `pages/`, and no `localStorage` write without a
reader across 99 sites. Not covered by this sweep: `artifacts/api-server`,
`artifacts/finance-tracker/ios`, and `static/`. Nothing was rendered: this is a
source audit, and the 13 screenshot scripts in `scripts/` were not run.

