# Numeris desktop — what is wrong, screen by screen

Audit date: 2026-10-05. Diagnose only; no code was changed.

Thomas, 5 Oct: *"we got lots and lots to do still everywhere ... idk the finance
and stocks and tickers, and ai coach bad, and dashboard top part not the
widgets, and lots of other stuff idk man"*. This document is the list he could
not name.

## How this was captured

- All **37 desktop routes**, read from the router itself (`scripts/src/app-routes.ts`
  → `knownRoutes("desktop")`), at **1440** and **1280** wide, in **void** (dark
  default) and **arctic** (the light theme). 148 captures, 0 failures.
- Below-fold content captured as additional viewport-stepped frames on the
  1440/void pass (the app scrolls inside `<main class="ft-main">`,
  `components/layout.tsx:2269`, so Playwright's `fullPage` sees only the first
  viewport — same approach as `scripts/src/below-fold-shot.ts`).
- Screenshots: `.review/shots/desktop-audit-2026-10-05/` (185 PNGs + `manifest.json`
  carrying each route's full `innerText`, console errors and page errors).
- Signed in as the seed account (`seed@numeris.local`, persona **ANL·05 Full
  Analyst**) against the Neon **dev** branch. Both servers restarted at HEAD
  (`3944b86`) first.
- The shipped `scripts/src/screenshot.ts` is fixed at 1440×900 and writes to
  `scripts/screenshots`, and this task forbids code changes, so the sweep ran
  from a scratchpad driver reusing its exported helpers (`signInSeedUser`,
  `openAccountPrefs`, `assertRendered`). The driver was deleted afterwards.

### The deployment state this was judged in

`GET /api/market/providers` → `{"marketDataEnabled":false,"providers":[]}`.
Market data is **off**, locally and in production (BACKLOG J28/L4). That is the
state a tester sees, so it is the state judged here. Several findings below
exist *only* because the flag is off — they are marked **[flag-off]**. They are
still defects: the flag is off on the deployment testers will use.

### What was checked and found NOT to be a defect

Three apparent "missing space" bugs (`£3.85deficit`, `goalsGBP`,
`(2026/27)£0.00`) are artifacts of `innerText` concatenating adjacent inline
elements. Measured in the DOM: the `deficit` span carries `marginLeft: 4px`
(`pages/goals.tsx:1358`) and the `/tax` pair renders an 8px gap. They look
correct on screen. Not reported.

---

# Part 1 — the three areas Thomas named

## 1.1 Markets: finance, stocks, tickers

**Verdict: `/portfolio` needs redesigning for the no-prices state, not patching.**
Five of its seven panels are built on a price feed that does not exist here.

| # | What Thomas sees | Cause | Rule | Severity |
|---|---|---|---|---|
| M1 | **Two large panels render as empty boxes.** `PORTFOLIO ALLOCATION` and `UNREALISED P&L` draw a title, a meta label and ~330px of nothing. | `pages/investments.tsx:2263` gates the pair on `hasPositions` (`:1777`, true — 5 positions), but the charts are fed by `pieData`/`plData` (`:1783`, `:1788`), both derived from `pricedInvs` (`:1782` — `filter(inv => inv.priceAvailable === true)`), which is **empty** when the flag is off. Recharts renders an empty 160px `PieChart` and 200px `BarChart`. | AI-DESIGN-TELLS "No states (tell 5)" — no empty state was designed | **broken** [flag-off] |
| M2 | **`PORTFOLIO HEAT MAP` is a header over nothing**, ~40px tall. | `investments.tsx:2307` gates on `hasPositions && length>=2 && summaryTotal>0` — `summaryTotal` is the *cost-basis* total (£11,427.87, non-zero), so the panel renders, then maps `pricedInvs` (empty). The G10 comment at `:2309` explains omitting *an* unpriced ticker; nobody considered *all* of them being unpriced. | same | **broken** [flag-off] |
| M3 | **The positions table is titled `POSITIONS — LIVE MARKET DATA (GBP)`** while every `CURRENT`, `VALUE`, `P&L`, `P&L %` and `WEIGHT` cell reads `—`. | `investments.tsx` positions table header. | BACKLOG **L4** is marked DONE with "nothing on `/portfolio` names a price source"; this header names live market data. L4 is **not** closed. | **broken** |
| M4 | **4 of 6 KPI cells are `—`**: `TOTAL P&L —` (with a second `—` stacked under it), `PORTFOLIO BETA —`, `EST. ANNUAL DIV —` "no quotes", `LARGEST POSITION —`. | `investments.tsx:1859-1866`. | DESIGN.md numbers | **rough** [flag-off] |
| M5 | **`PORTFOLIO ANALYTICS` repeats the same four unknowns** already shown in the KPI strip 900px above — Portfolio Beta, Largest Position, Asset Classes, Est. Annual Dividends, all `—` again. | Two renders of one metric set on one screen. | AI-DESIGN-TELLS tell 1 (same anatomy everywhere) | **ugly** |
| M6 | **`ASSET CLASSES 1` + red `UNDER-DIVERSIFIED`** scolds the user for a classification the missing price feed informs. | `investments.tsx:1859`. | — | **rough** [flag-off] |
| M7 | **`TAX LOTS · FIFO ANALYSIS`**: all 5 rows show `LIVE/SH —`, `MARKET VALUE —`, `UNREALIZED G/L —`. A tax table that cannot compute tax. | same price dependency | **rough** [flag-off] |
| M8 | **52 em-dashes on one screen** (measured, shared chrome excluded), 14 of them lines that are nothing but a dash. | aggregate of M1–M7 | AI-DESIGN-TELLS tell 6 | **ugly** |
| M9 | `/investments` is **one paragraph** — 664 characters including the whole sidebar. The entire route is the gate text. Its breadcrumb also reads `NUMERIS › DASHBOARD`, not Markets or Investments. | the market-data gate; breadcrumb not set for this route | CLAUDE.md route rule — a route with no job | **rough** |
| M10 | `/calendar` shows **`THIS WEEK IN MARKETS — No events — enable feeds via Sources`** above a 7-day row where every day is `—`. Another surface promising market feeds. | `pages/calendar.tsx` | BACKLOG L4 (same class) | **rough** [flag-off] |
| M11 | `/projection` labels its return slider **`S&P avg ~10%`**. | `pages/projection.tsx` | L4's "nothing names an index" | **rough** |
| M12 | `/trading` is **10 KPI cells all `—`** plus a 12-month grid reading "No trades" twelve times, plus **three stacked empty states**: `[ NO TRADES MATCH ]`, an ASCII box `┌─ JOURNAL EMPTY ─┐`, and `NO TRADES LOGGED`. | `pages/trading-journal.tsx` | AI-DESIGN-TELLS tell 5; ASCII art as illustration | **ugly** |

Not a defect: `VUSA.L — Vanguard S&P 500 UCITS` contains "S&P" because that is
the fund's name. A holding's own name is fine; M11 is a benchmark claim and is
not.

## 1.2 AI Coach

**Verdict: the page never admits the feature is off, and truncates the answers
it does give.**

| # | What Thomas sees | Cause | Rule | Severity |
|---|---|---|---|---|
| A1 | **The subtitle reads "Focused on the complete bloomberg experience."** — a competitor's trademark, lower-cased, in the product's own voice. | `pages/ai-coach.tsx:655` interpolates `primaryPersona.tagline.toLowerCase()`; `lib/persona.ts:172` sets that tagline to `"The complete Bloomberg experience"`. `.toLowerCase()` destroys the proper noun. Only persona ANL·05 is affected. | AI-DESIGN-TELLS "vague copy"; it is also simply wrong | **broken** |
| A2 | **The dashboard says "AI is off for this account" while `/ai-coach` presents as fully live** — "Your AI Financial Coach", a `CONTEXT LOADED` panel, 10 clickable questions, and a green **`AI ONLINE`** badge. | `lib/ai-enabled.ts` is consumed by `pages/dashboard.tsx` and `pages/settings.tsx` **only**. `ai-coach.tsx` never calls `isAiEnabled()`. | CLAUDE.md "never show a number the API did not supply" — same class, for state | **broken** |
| A3 | **You only learn AI is off by clicking.** Probed live: click a question → 625ms → `✕ ERROR — AI is off for this account.` rendered *underneath a green `AI ONLINE` badge on the same screen*. No `/api/ai` request leaves the page. | `lib/api-fetch.ts` consults `isAiEnabled()` and returns the synthetic 403 from `aiOffResponse()` (`ai-enabled.ts`). The page renders the refusal as a chat error. | — | **broken** |
| A4 | **With AI on, the answer stops mid-sentence**: "…Reducing even a single £10" — no terminator, no indication it was cut. Measured: 2084ms, `POST /api/ai/chat` 200. | `routes/ai.ts:353` sets `maxTokens: 1024`. `lib/ai-providers/openai-compat.ts:303` yields `{kind:"done", finishReason}` and `:301` throws only when the stream is **empty** — a truncated-but-non-empty stream passes silently. `ai-coach.tsx` has **0** references to `finishReason`. There is already a 3 Oct finding (`327b63a2c792`) about this cap. | CLAUDE.md "a financial figure is shown in full or not at all" — the same argument applies to advice that stops mid-clause | **broken** |
| A5 | **The left ~500px of the content area is empty** at 1440. The column is centred and narrow; the answer occupies the top quarter and ~480px of void sits between it and the composer. | `ai-coach.tsx` layout | DESIGN.md rhythm | **ugly** |
| A6 | **`CONTEXT LOADED` is a 3-cell grid with 2 cells filled** — INCOME, SPENT, and one blank. | `ai-coach.tsx` | — | **ugly** |
| A7 | **10 prompt buttons in two near-duplicate lists.** `COMMON QUESTIONS` has "Am I on pace for my goals?"; `PERSONA PICKS` has "Am I on track for my goals?". Also "How am I doing this month?" vs "Spending trends this month". | `ai-coach.tsx` + `lib/persona.ts` prompt sets | AI-DESIGN-TELLS tell 2 (uniform rhythm — 10 identical rounded rows) | **rough** |
| A8 | **The vendor is named twice**: "Complete financial analysis powered by Groq" in the header, "Streamed from Groq" in the footer. `/briefing` adds `POWERED BY GROQ`. | `ai-coach.tsx`, `pages/briefing.tsx` | — | **rough** |
| A9 | The composer placeholder still reads **"Ask a follow-up (queued while replying)…"** after the reply has finished. | `ai-coach.tsx` | — | **rough** |
| A10 | `/briefing` and `/goals` both offer AI actions (`GENERATE REPORT`, an AI COACH panel with a `RETRY` button) that cannot succeed while the switch is off. `/goals` and `/budget` *do* print the off-message; `/briefing` does not. | `briefing.tsx` not in `ai-enabled.ts` consumers | — | **rough** |

**What the model actually says is good.** Asked "How am I doing this month?",
it correctly reported no recorded income, £3.85 of expenses, and said the
savings rate is **unknown** rather than inventing a zero — which is more honest
than three of the app's own screens (see W1/W2). It named the £40 coffee budget,
the £1,232.95 of committed outflows and the 4 subscriptions at ~£41.12/mo, all
correct against the data. The quality problem is truncation (A4) and typography:
the answer renders as prose with **bold** markdown in the sans face, inside an
app that is otherwise a monospace instrument. It reads as pasted in from
somewhere else.

## 1.3 Dashboard top part (above the widgets)

| # | What Thomas sees | Cause | Rule | Severity |
|---|---|---|---|---|
| D1 | **The KPI strip has no hierarchy.** `NET WORTH £215,447.22` is set at the same size and weight as `MONTHLY SPEND -£3.85`. The app's headline number does not dominate. | `pages/dashboard.tsx` KPI bar; related open finding `6a5fafd8550e` (401 of 484 fontSize sites in the 8–11px band) and `8983cab824f5` (fontWeight 700 is 74% of declarations) | AI-DESIGN-TELLS "Perfect balance" / tell 2 | **ugly** |
| D2 | **`PORTFOLIO OVERVIEW` occupies the first cell of the KPI strip** — a title sitting in the ruled grid as though it were a metric. | same strip | DESIGN.md section headers | **ugly** |
| D3 | **2 of 5 metrics are `—`** (`MONTHLY INCOME`, `SAVINGS RATE`) on day 5 of the month. | income arrives later in the month; nothing says so | — | **rough** |
| D4 | **`MOM SPEND -92.6%`, in green.** A 92.6% "improvement" computed from £3.85 against a full prior month. The strip says `MTD vs BY 5 SEP`, but the green reads as praise for an artifact. | `dashboard.tsx` MoM cell | CLAUDE.md "a number that reads as a different, plausible number" | **wrong numbers** |
| D5 | **Four full-width one-line bands stack before any widget**: the KPI strip, `WHAT CHANGED · Nothing moved`, `SAFE TO SPEND · 1 of 7 days of history`, and the AI banner. ~290px of the first viewport is spent saying very little. | `dashboard.tsx` top region | AI-DESIGN-TELLS tell 2 (uniform rhythm) | **ugly** |
| D6 | **The AI banner is red**, the colour this app uses for losses and errors, for what is a settings prompt. | `dashboard.tsx` + `AI_OFF_MESSAGE` | DESIGN.md colour | **rough** |
| D7 | **`SAFE TO SPEND` — the feature with the most prominent band — has no value**, only "1 of 7 days of history — your allowance appears on the 11th". | `components/.../top-region.tsx` | — | **rough** |
| D8 | **`NET WORTH HISTORY` draws a solid slab.** `1M` is selected with 2 days of data (4–5 Oct); the filled area renders as a block pinned to the top of a £0–£220k axis. | `dashboard.tsx` history widget | DESIGN.md charts — value encoded by length/area | **ugly** |
| D9 | **The `BALANCE` column is `—` for 5 of 8 accounts.** Those are the GBP accounts, whose value sits in the `GBP` column instead. A column named BALANCE reading `—` looks like missing data. | accounts panel: native-currency column vs base column | CLAUDE.md "a financial figure is shown in full or not at all" | **rough** |
| D10 | **`+18 MORE WIDGETS`** is a large dashed-border box in a widget slot. Dotted is this product's signature for *not yet real*; here it marks a working control. | `dashboard.tsx` widget grid | DESIGN.md "dotted means not-yet-real" | **rough** |
| D11 | **The bottom `INSIGHTS` strip is generated from one transaction**: "Spent 74% less on Coffee this month vs last (-£3.85 vs -£15.06)", "Biggest spend day this month: 2 Oct — -£3.85". | insights strip | — | **rough** |
| D12 | The market persona has **no differentiating widget** on this dashboard. | BACKLOG **L6**, already open and DECIDE | — | **rough** [flag-off] |

---

# Part 2 — defects that cross every screen

| # | What Thomas sees | Cause | Rule | Severity |
|---|---|---|---|---|
| **X1** | **Four different answers to "what is my monthly income"**, all for October 2026: `/` says `—` and `+£0.00`; `/analytics` says **£937.50**; `/cashflow` says **£1,250.00/mo in**; `/whatif` says **£3,000.00**. Nine other screens say `£0.00`. | different windows (this month / 6-month avg / 3-month avg) presented with the same label and no qualifier; `/whatif` is fabricated (W1) | CLAUDE.md "never show a number the API did not supply" | **wrong numbers** |
| **X2** | **Three different answers to "how healthy am I"**, one click apart: dashboard widget **50/100 "MODERATE"**; `/health-score` **48/100 "GRADE F — Needs attention"**; `/budget` **HEALTH SCORE 99 "healthy"**. | two unrelated models: `components/widgets/financial-health.tsx:58` sums 4 pillars (savings 30 / liquidity 25 / portfolio 20 / cash buffer 25); `/health-score` uses 6 pillars at 25/20/15/15/15/10. `/budget` computes a third. | — | **wrong numbers** |
| **X3** | **Four different answers to "what is my savings rate"**: `—` (dashboard, `/reports`, `/family`, `/accounts`), **`-9% this month`** and **`2.4%`** (both on `/analytics`), **`0`** scored as fact (`/health-score`). | as X1/X2 | — | **wrong numbers** |
| **X4** | **Unknown data is scored as zero and then graded.** 50 of the dashboard's 100 health points are unscorable and both are rendered 0: savings rate (no income yet) and portfolio (no prices). | `financial-health.tsx:36` — `(d.thisMonth.savingsRate ?? 0) * 1.5`; `:47-51` — a null portfolio total "scores like an empty portfolio". The file's **own comment at `:28-35`** states the defect: *"a user with no income recorded reads as 'scored zero on saving' rather than 'not scorable yet' … the pre-existing behaviour is preserved until that call is made."* | CLAUDE.md hard constraint — this is the `MOCK_*` class, reintroduced | **wrong numbers** |
| **X5** | **A `RENDER · TLS 1.3 · … · localhost` status bar sits on all 37 screens.** The hosting provider, a TLS version and the hostname, permanently, as chrome. | `components/layout.tsx` status bar | AI-DESIGN-TELLS "relentless labelling"; infra cosmetics | **ugly** |
| **X6** | **174 em-dashes across the 37 screens** (measured, shared chrome excluded), and **133 middots**. | aggregate | AI-DESIGN-TELLS tell 6 and "the middot tic" — named as *the* signature for this project | **ugly** |
| **X7** | **Three routes do one job.** `/owing` ("Track who owes who — split bills, IOUs, shared expenses"), `/split` ("Group Expenses · Split bills, track shared costs") and `/shared` ("Shared Expenses · Bills split with other people"). `/owing` links out to `→ GROUP SPLIT`. | three routes | CLAUDE.md route rule — "40 routes on the phone, 30 of which cannot be found" | **rough** |
| **X8** | **Two more routes do one job**: `/recurring` ("auto-detect and categorize recurring transactions", 5 patterns, £997.27/mo) and `/subscriptions` ("Auto-detected recurring charges", 4 subs, £45.97/mo). Different totals for overlapping sets. | two routes | same | **rough** |
| **X9** | **`/calculators` is a menu of other routes.** Four cards that `LAUNCH →` `/fire`, `/mortgage`, `/pension` and one more — duplicating the sidebar. A route whose only content is navigation. | `pages/calculators.tsx` | CLAUDE.md "chrome doesn't get a URL" | **rough** |
| **X10** | **ASCII box-drawing used as illustration** in two empty states: `/split` draws `┌───┐ │ A │ └─┬─┘` and `A ──pays──► shared`; `/trading` draws `┌─ JOURNAL EMPTY ─┐`. | `pages/group-split.tsx`, `pages/trading-journal.tsx` | AI-DESIGN-TELLS tell 8 (stock illustration, in this product's idiom) | **ugly** |

---

# Part 3 — every other desktop route

Severity key: **broken** · **wrong numbers** · **ugly** · **rough**.

| Route | Finding | Cause | Severity |
|---|---|---|---|
| `/analytics` | **`RUNWAY 0.0m`, badged red `LOW`, with "Runway is below 3 months. Prioritise cutting discretionary spend."** The user holds £11,377.34 in cash against a stated £915/mo burn — ~12.4 months. | `pages/analytics.tsx:2991` — `runwayMonths: recentBurn > 0 ? netSavings / recentBurn : Infinity`. Runway is **net savings** over burn, not **cash reserves** over burn. `netSavings` is £0.00 this month. | **wrong numbers** |
| `/analytics` | Three savings rates on one screen (`—`, `2.4%`, `-9%`); `MO. INCOME £937.50` contradicts the dashboard's `—`. | X1/X3 | **wrong numbers** |
| `/analytics` | `BEST MONTH Oct 2026 £3.85` — "best" = lowest spend, so the 5-day-old current month always wins. | `analytics.tsx` | **rough** |
| `/analytics` | React **duplicate-key warning** in console: *"Encountered two children with the same key"*. Only route in the sweep with one. | unkeyed/duplicate list key | **rough** |
| `/analytics` | `YOY CHANGE N/A` — the only `N/A` in the app; everywhere else unknown is `—`. | inconsistent unknown token | **rough** |
| `/decisions` | **The headline `ANNUAL OPPORTUNITY COST £17,941.23/yr` double-counts the same money.** A CRITICAL item claims £8,970.75/yr on "£203,921.21 sitting in accounts", then three MEDIUM items re-bill the same cash account by account (£7,093.97 + £1,237.50 + £639.00). 8,970.75 + 7,093.97 + 1,237.50 + 639.00 = **17,941.22** — the headline is the sum of an item and its own breakdown. | `pages/decisions.tsx` opportunity-cost aggregation | **wrong numbers** |
| `/decisions` | **Materially wrong advice.** It tells the user to move an **Aviva SIPP** (a pension) and a **Vanguard ISA** into "high-yield savings", and treats **"Flat, Kuala Lumpur"** — a property — as idle cash earning no yield. | account-type not consulted before the HYSA rule | **wrong numbers** |
| `/upcoming` | **30D, 60D and 90D all show the identical `NET CHANGE -£1,232.95`.** Monthly bills do not recur into the later horizons. | horizon projection does not repeat recurrences | **wrong numbers** |
| `/cashflow` | **Subscriptions are double-booked.** `8 Oct Spotify (sub) -£11.99` *and* `9 Oct Spotify -£11.99`; `11 Oct ChatGPT Plus (sub) -£20.00` *and* `12 Oct ChatGPT Plus -£15.15` — the same service twice, at two different amounts. Inflates projected outgoings. | scheduled-events merge counts a subscription and its matching recurring pattern as separate events | **wrong numbers** |
| `/calendar` | **`NET £3.85` labelled "deficit"** when income is £0.00 and expenses £3.85 — the sign is dropped. `/year-review` renders the same quantity correctly as `-£3.85`. | `pages/calendar.tsx` net cell | **wrong numbers** |
| `/calendar` | A 7-day strip where all 7 days are `—`, under a market-feed promise (M10). | | **rough** |
| `/health-score` | **GRADE F** for a user with £215,447 net worth, all bills paid on time (100 A+), all budgets within limit (100 A+), 68% emergency fund — because savings rate scores 0/25 and debt load is unmeasurable. The page itself admits it: *"£194.14 pending — no income recorded to measure it against."* | 6-pillar model scoring nulls as zero; see X4 | **wrong numbers** |
| `/health-score` | `SCORE TREND (7D) —` under the claim "updated in real time". Three ACHIEVEMENTS all awarded today on first load. | | **rough** |
| `/whatif` | **Every number on the screen descends from a fabricated £3,000.** With no recorded income the simulator substitutes a literal: `MONTHLY INCOME £3,000.00`, `MONTHLY SURPLUS £2,996.15`, `ANNUAL SAVING £35,953.80`, `£100,000 in 2.6 yrs`. | `pages/whatif.tsx:430` — `useState(Math.round(baseIncome) \|\| 3000)` | **wrong numbers** — direct breach of the CLAUDE.md `MOCK_*` constraint |
| `/tax` | **`EST. INCOME TAX £4,486.00 on £35,000.00 gross`** — the user's recorded income is £3,750 YTD. £35,000 is a placeholder salary presented as an estimate of theirs. | default salary in `pages/tax.tsx` | **wrong numbers** |
| `/tax` | Panel titled **`UK INCOME TAX ESTIMATOR (2024/25)`** sits directly above **`UK TAX YEAR 2026/27 — OVERVIEW`**. Two tax years on one screen. | hardcoded year string | **rough** |
| `/fire` | **`PORTFOLIO £215,447.00`** labelled "Total invested assets (ISA, pension, brokerage)" — that is net worth, including the Kuala Lumpur flat and current accounts. The real portfolio is £11,427.87. The FI number, 36% progress and "14.8 yrs" all rest on it. | `pages/fire.tsx` uses net worth where it says portfolio | **wrong numbers** |
| `/pension` | **Three panels are instructions where the numbers belong**: *"Enter your current age in the form on the right and this row fills in…"*, *"Enter your age and retirement age to see projection"*, *"enter current age to see years-to-retirement"*. The app already knows about the £27,500 Aviva SIPP and does not use it. | `pages/pension.tsx` — no data binding to existing accounts | **broken** |
| `/net-worth` | `ALL-TIME HIGH` and `BEST SINGLE MONTH` both read £215,447.22 — "best single month" should be a change, not a level. `Projected 12m: £215,447.00 (linear trend)` projects a flat line from 2 days of history. `MTD CHANGE —`, `YTD CHANGE —`. "last **1 months**". | 1 month of history, no guard | **rough** |
| `/net-worth` | At 1280 the axis label `Sept 27` is dropped (only content difference between the two widths in the whole sweep). | chart tick density | **rough** |
| `/goals` | `FEASIBILITY SHORTFALL £2,910.92/mo short` sits beside `MONTHLY NEEDED £2,907.07` — two near-identical figures £3.85 apart, unexplained. `68% — almost there!` breaks the instrument voice. An `AI COACH` panel offers `RETRY` for something no retry can fix. | `pages/goals.tsx` | **rough** |
| `/budget` | `% USED 0%` "all within limits" while the Coffee row shows `10%`. The Coffee row prints the `UNDER` badge **twice**. Six categories show a `VS LAST MO` delta despite £0.00 spent. | `pages/budget.tsx` | **rough** |
| `/recurring` | `RECURRING SPEND TREND · LAST YEAR £0.00 → THIS YEAR £3,843.10 · ↑ recurring costs rising` — "rising" against a year with no data. `ACTIVE RULES 0` printed twice in one panel. | `pages/recurring.tsx` | **rough** |
| `/subscriptions` | `LAST CHARGE: No data` on every row, beside confident `NEXT DUE` dates. | | **rough** |
| `/profile` | **`Settings — 12 keys`** surfaces a count of browser `localStorage` keys as a profile statistic. It read 12, 16 and 17 across three captures minutes apart. | `pages/profile.tsx:402` — `Object.keys(localStorage).filter(k => k.startsWith("ft-")).length`, rendered at `:946` and `:1454` | **rough** |
| `/profile` | `TOP CATEGORY Groceries` contradicts `/analytics`'s `HIGHEST CATEGORY Rent / Mortgage £2,670.00`. | different windows, same label | **wrong numbers** |
| `/profile` | `> export.json()` and `> auth.logout()` as button labels; `MEMBER 0d`; a truncated `uid:MQZLO4w1gcv7…` on screen. | terminal cosplay | **rough** |
| `/business` | A full P&L, VAT and invoicing surface for a student, populated from one personal £76.11 travel expense: `Travel 100.0% of all expenses`, `TAX ESTIMATE (20%) £0.00 Corp. tax on profit`. | `pages/business.tsx` | **rough** |
| `/family` | **Five empty states stacked** on one screen: members, income allocation, spending by member, household goals, household budget. | `pages/family.tsx` | **ugly** |
| `/reports` | `I/E SPLIT —`, `MARGIN —`; `SPENDING BY DAY OF WEEK` with 6 of 7 days at £0.00; `£36.60 spend vs prior` with no direction. | | **rough** |
| `/year-review` | `MONTHLY SPEND HEATMAP` with 7 of 12 months `—`; `Q1 No data`, `Q2 No data`; "your financial year — wrapped" + `PLAY WRAPPED`. | `pages/year-review.tsx` | **rough** |
| `/briefing` | `CLASSIFICATION: PERSONAL · POWERED BY GROQ`. `GENERATE REPORT` cannot succeed while AI is off and does not say so (A10). | `pages/briefing.tsx` | **rough** |
| `/admin` | Reachable from the desktop router by a non-admin; renders "This page is not available for your account / HTTP 403 Forbidden: Not an admin" and logs a 403 to console. | route not gated before render | **rough** |
| `/shared`, `/split`, `/mortgage`, `/import` | Honest, well-made empty states. **No defects found.** | | — |
| `/accounts`, `/transactions`, `/settings`, `/owing` | Densest and most convincing screens in the app. `/transactions` (405 content lines) and `/accounts` (231) are what the product should feel like. **No defects found.** | | — |

### Light theme and 1280

Both are **sound**. Content is byte-identical between 1440 and 1280 and between
void and arctic on all 37 routes (the only differences in the whole sweep are
the clock, `/net-worth`'s dropped tick, and `/profile`'s volatile key count).
Arctic holds contrast and structure well. Two notes: `SAVINGS RATE —` renders
amber in arctic, reading as a warning for what is merely unknown; and the
FINANCIAL HEALTH gauge goes muddy orange-brown.

The dashboard's void capture is missing the `ANL·05` persona chip that arctic
shows. It was the first route captured in the run, so this is most likely a
first-paint hydration race rather than a theme bug — **unverified**, worth one
probe before anyone acts on it.

---

# Part 4 — proposed fix tasks, in the order a first tester hits them

Each is independently shippable. Gate for all of them is this repo's gate,
`pnpm -r test && pnpm run typecheck`; where that gate does not cover the change,
the extra check is named.

**T1 — Stop showing fabricated and contradictory money. (wrong numbers)**
W1 `/whatif`'s £3,000 literal, `/tax`'s £35,000 salary, X4's nulls-scored-as-zero,
`/analytics`'s runway divisor, `/fire`'s net-worth-as-portfolio, `/decisions`'s
double-count and its SIPP/ISA/property advice, `/cashflow`'s doubled
subscriptions, `/upcoming`'s non-recurring horizons, `/calendar`'s dropped sign.
*This is the task that matters.* Every item is a number a user could act on.
Gate: the repo gate **plus** a new lock test asserting that each of these
surfaces renders a stated unknown rather than a substituted number when its
input is null — the existing `fabricated-zeros.ts` harness in `scripts/src` is
the obvious place to extend. Note the gate has no `git diff -- '*test*'` guard,
so adding that test is allowed.

**T2 — Make the AI switch honest. (broken)**
A2/A3/A10: have `ai-coach.tsx` and `briefing.tsx` consult `isAiEnabled()`;
render the off-state *before* the user clicks; remove the `AI ONLINE` badge
while the switch is off. A4: surface `finishReason === "length"` and either
raise the cap or mark the answer as cut. A1: fix the `lib/persona.ts:172`
tagline and the `.toLowerCase()` at `ai-coach.tsx:655`.
Gate: repo gate; A1 is also worth a lock test on the rendered string.

**T3 — Pick one health score. (wrong numbers)**
X2 — three models, three grades, one click apart. This needs a decision about
which pillars are real before any code moves, and X4 (what an unscorable pillar
does to the composite) is the same decision. `financial-health.tsx:28-35`
already states the three honest options and says the call has not been made.
**This one is Thomas's to make, not a session's** — see the park below.

**T4 — Redesign `/portfolio` for the state it actually ships in. (broken)**
M1/M2/M3/M5/M7. Not patchable: three panels, a tax table and a KPI strip are all
built on a price feed that is off. The screen needs a no-prices design — what a
holdings-and-cost-basis view looks like when it is the product, not a
degraded mode. Closes the part of BACKLOG **L4** that is marked DONE but is not
(M3). Overlaps the open **L5** (over-gating) and **L6**.
Gate: repo gate + a capture at 1440/1280 in both themes.

**T5 — Fix the dashboard top part. (ugly)**
D1/D2/D5/D8: give the strip a hierarchy so net worth dominates, take the title
out of the metric grid, collapse four one-line bands into one, and stop drawing
a 1-month chart from 2 days of data. D4's green −92.6% belongs in T1.
Gate: repo gate + capture. Related open findings `6a5fafd8550e`,
`8983cab824f5`, `97e33319602e` cover the type and padding ladders this sits on
— fold them in rather than re-deriving.

**T6 — Collapse the duplicate routes. (rough)**
X7 (`/owing` + `/split` + `/shared`), X8 (`/recurring` + `/subscriptions`),
X9 (`/calculators`). Five routes become two. Each removal must answer the
CLAUDE.md route questions in the PR body.

**T7 — Remove the infra chrome and the terminal cosplay. (ugly)**
X5 (`RENDER · TLS 1.3 · localhost` on all 37 screens), X10 (ASCII illustration),
`/profile`'s `> export.json()` and its localStorage key count.

**T8 — The em-dash and middot sweep. (ugly)**
X6 — 174 and 133. Mostly resolves itself once T1 and T4 land; re-measure after,
do not pre-emptively delete call sites.

### Where a whole surface needs redesigning, not patching

- **`/portfolio`** — T4 above. Five of seven panels have no content source.
- **`/pension`** — three panels are instructions standing in for data, and it
  ignores the SIPP the app already holds.
- **`/health-score`** — the model, not the rendering, is what is wrong.
- **`/trading`** and **`/family`** — 10 dashed KPIs + 3 empty states, and 5
  stacked empty states respectively. Both are screens with no job for this user;
  the CLAUDE.md route rule and the Mobile Amendment's "at least one thing the
  user can do" both apply.

### What is genuinely good, and should not be touched

`/transactions`, `/accounts`, `/settings` and `/owing` are dense, legible and
convincing. The arctic theme is well-executed. The live AI answer was accurate
and correctly refused to invent a savings rate — it is more honest than three of
the app's own screens. `/shared`, `/mortgage` and `/import` have clean, honest
empty states and are the model the other empty screens should copy.
