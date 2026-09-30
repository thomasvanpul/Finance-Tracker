# Numeris: automatic capture audit ("never type a transaction")

Read-only audit, 30 Sep 2026, repo at `1655eae`. Nothing was run against a live
provider. Every claim is from code or docs, with its path. Paths are relative to
`~/Developer/Finance-Tracker` unless they start with `vault:` (the Obsidian vault root).

## Verdict in one paragraph

Today **no transaction reaches Numeris without a person acting**. The only automated
feed that works end-to-end is Wise (a personal API token, synced when the user presses
**Sync**). Enable Banking is written and unit-tested against a stub. No screen uses it,
no application is registered (`docs/H4-ENABLE-BANKING.md:28-33`), and it is **parked**
by decision (`docs/BACKLOG.md:1688-1711`). Nothing schedules any sync. CSV import is
broken on its main path (G54). Receipt scan exists, but it only pre-fills the manual
add form. Email forwarding, Apple Wallet/FinanceKit, Shortcuts and share-sheet capture
do not exist. So "never type" is at present a direction, not a property of the product.

---

## 1. Enable Banking

### What exists
- Adapter: `artifacts/api-server/src/adapters/enable-banking.ts`. It does RS256 app
  JWT signing (`:118-134`), `startAuth` (`:199-218`), session exchange (`:221-227`),
  `listAccounts` with a balance pick (`:273-296`) and `fetchTransactionsSince`, which
  follows `continuation_key` (`:298-333`).
- Consent routes: `artifacts/api-server/src/routes/enable-banking.ts`.
  `POST /connections/enable-banking/start` (`:62-117`) and
  `GET /connections/enable-banking/callback` (`:119-188`). Pending state is held in an
  in-process `Map` with a 30-minute TTL (`:52-60`), so a restart or a second instance
  breaks any consent in flight.
- Registered in `adapters/index.ts` and run through the shared
  `lib/connection-sync.ts::runConnectionSync`.
- Tests: `adapters/enable-banking.test.ts` (JWT, validate, listAccounts, one
  pagination case) and `routes/enable-banking.test.ts:168-213` (the two-bank upsert).
  All run against a stubbed `fetch`.

### Which banks and countries work
- **In principle:** any ASPSP (bank) in Enable Banking's pan-European catalogue. The
  caller passes `aspspName` and `aspspCountry` freely (`routes/enable-banking.ts:64-69`).
  There is no catalogue call and no `/aspsps` endpoint (`docs/H4-ENABLE-BANKING.md:109-121`).
- **In practice:** none. No EB application exists, so every call returns 401
  (`docs/H4-ENABLE-BANKING.md:28-33`). That is restated as current state in
  `vault:Efforts/Numeris-Direction-2026-09.md:120`. BACKLOG adds on 13 Sep: "the adapter
  and its routes are live server-side; no screen uses them" (`docs/BACKLOG.md:1709-1711`).
- **Restricted Production covers only accounts Thomas links himself** (`docs/OPEN-BANKING.md:31-41`).
  A tester or any other user cannot connect a bank without a contract, KYB (business
  verification) and a company, which takes 4-12 weeks (`docs/OPEN-BANKING.md:47-52`).
  BACKLOG M9 is a DECIDE on this (`docs/BACKLOG.md:2101-2106`).
- **Malaysia (Maybank, MYR) is out** regardless of provider (`docs/OPEN-BANKING.md:53-54`).
  It stays read-only per CLAUDE.md.
- **No UI entry.** `pages/settings-connections.tsx:59-84` lists only Wise, Alpaca and
  Kraken. Nothing handles the `?created=` redirect from the callback. Searched
  `artifacts/finance-tracker/src` for `enable-banking|enableBanking|aspsp` and found no
  matches.

### How sync is triggered and how often
- **Manual only.** The only trigger is `POST /connections/:id/sync`
  (`routes/connections.ts:146-190`), called from the Sync button in
  `pages/settings-connections.tsx:167` and `components/mobile/MobileSettings.tsx:488`.
- **No scheduler, no sync on open, no webhook.** Searched `artifacts/api-server/src` for
  `node-cron|cron.|setInterval(|schedule`. The only interval is the request-metrics prune
  (`src/index.ts:87`). The one workflow is `.github/workflows/keep-alive.yml` (healthz
  only). Searched the frontend for `useSyncConnection`; it appears only in the two
  settings screens.
- Window: a fixed 90 days back on every sync (`lib/connection-sync.ts:11-13`), with no
  incremental cursor.

### Consent expiry and re-consent
- Consent start sets `valid_until` to 180 days by default, clamped to 1-180
  (`routes/enable-banking.ts:66-75`). The bank's `maximum_consent_validity` can shorten
  it. **The 90-day figure does not appear in the code.** UK banks that still cap at 90
  days would simply return a shorter `valid_until`.
- `validUntil` is stored in the encrypted credential (`routes/enable-banking.ts:136-139`),
  but **nothing reads it**. There is no warning before expiry and no "renew in N days".
- After expiry the next manual sync gets a 401 or 403, which becomes `AdapterError("auth")`
  (`adapters/enable-banking.ts:159-161`). The route then sets `status = "revoked"`
  (`routes/connections.ts:178-181`). Any per-account 401 also flips the whole connection,
  which is the failure Sure's code comment warns about (`docs/research/sure-study.md:363-368`).
- Re-consent means running the start flow again. The 29 Sep fix makes that overwrite the
  same bank's row (see §2). There is no one-tap "Reconnect" anywhere. RETENTION §2 wants
  it "one tap from wherever the staleness is visible" (`docs/RETENTION.md:49-61`).
- Nothing calls a revoke endpoint when the user deletes their account (M10,
  `docs/BACKLOG.md:2107-2111`).

### Categorisation of imported rows
- **Every synced row is written as `category: "Other"`** (`lib/connection-sync.ts:99`).
  The description is the raw counterparty name or remittance text
  (`adapters/enable-banking.ts:318-323`). `normalizeMerchant` is **not** applied; only the
  CSV route uses it (`routes/import.ts:14,108`).
- `type` comes from the amount's sign alone, income or expense
  (`lib/connection-sync.ts:73-74`). The schema supports `transfer`
  (`lib/db/src/schema/transactions.ts:29`), but sync never produces it, so moving money
  between your own accounts shows up as both spending and income.
- The only way to categorise these rows is the **manual** "auto-categorise" button, which
  sends batches to `POST /api/ai/batch-categorize` (`pages/transactions.tsx:1369`,
  `routes/ai.ts:515`). The client-side rules in `lib/auto-cat.ts` (`applyAutoCategory`,
  stored in localStorage) run only on the client import paths, not on server sync.
- Synced rows carry no `nativeToBaseRate` or `rateAsOf`. The insert at
  `lib/connection-sync.ts:93-104` omits them, so foreign-currency rows convert at the
  live rate forever (see the schema comment at `transactions.ts:36-42`).

---

## 2. The 29 Sep upsert fix (`ceb28ad`)

`git log --since=2026-09-28 --until=2026-10-01` shows one relevant commit:
`ceb28ad fix(connections): key Enable Banking upsert by institution, not just provider`.

**The bug it fixed.** The connections unique index was `(userId, provider)`, and for
Enable Banking `provider` is the aggregator, not the bank. A second bank consent
silently overwrote the first bank's connection row and credential. The fix adds
`connections.external_id` (not null, default `""`), a new unique index on
`(user_id, provider, external_id)` in `lib/db/drizzle/0023_loud_nova.sql`, and sets
`externalId = "<aspspName>:<aspspCountry>"` lowercased (`routes/enable-banking.ts:143-146`).
It also updates the `POST /connections` target (`routes/connections.ts:106`). Two new
tests cover it (`routes/enable-banking.test.ts:168-213`). This is item #1 from the Sure
study (`docs/research/sure-study.md:411`).

**Is it complete?** It is complete for the *connection* row. It fixes none of the
*transaction* behaviour the question asks about, because that code is untouched
(`git log --since=2026-09-01 -- lib/connection-sync.ts` shows no commits).

| Case | Today | Evidence |
| --- | --- | --- |
| Two banks via EB | **Fixed** | `ceb28ad` |
| Same bank, two logins (e.g. personal and joint), or the same bank named differently between consents | Still collide or duplicate. The key is the bank name, not the login or consent. A missing `session.aspsp` on one consent gives a different key and a second row. | `routes/enable-banking.ts:140-146` |
| Duplicate transactions on re-sync | Mostly avoided **when the bank supplies `transaction_id` or `entry_reference`** | `adapters/enable-banking.ts:325` |
| Fallback id when both are missing | `${booking_date}-${desc}-${amount}`. Two identical same-day purchases share one id, so the second is **treated as an update of the first and lost**. A pending row has no `booking_date`, so its id starts `undefined-…` and changes when it books. | `adapters/enable-banking.ts:325` |
| Pending → booked | **Not handled.** No `transaction_status` or `status` is read, there is no `BOOK`/`PDNG` request parameter, and there is no pending column. A pending row whose id changes on booking becomes a **duplicate**. A pending row that never settles (a hotel or fuel pre-auth) **stays forever**, because sync never deletes. | `adapters/enable-banking.ts:80-93,302-332`; `transactions.ts` has no pending field |
| Amount changes | Partial. An existing row's `nativeAmount` and `type` are overwritten, but **date and description are not**, the FX rate is not re-snapshotted, and a user's edits are overwritten because there is no user-modified flag. | `lib/connection-sync.ts:84-94` |
| Dedup scope | The lookup is `(externalId, userId)` only, not account or source. The UPDATE hits every matching row, so two providers or accounts that issue the same id overwrite each other. | `lib/connection-sync.ts:75-94` |
| Re-consent account identity | Accounts are upserted on the EB account `uid` (`connection-sync.ts:61`). **Unverified, from EB's API model:** `uid` is session-scoped and `identification_hash` is the stable key. If so, every re-consent creates a **second copy of every account**. Check against the live API before relying on it. | `adapters/enable-banking.ts:280` |
| Pagination | `do…while(cont)` with no page cap and no guard against a repeated `continuation_key`. Sure found an ASPSP that loops forever. | `adapters/enable-banking.ts:309-315`; `docs/research/sure-study.md:356` |
| Atomicity | The per-row loop is not in a DB transaction, and there is no sync-run record. | `docs/research/sure-study.md:408` |
| CSV then bank | CSV rows (`csv:<hash>`) and bank rows never match, so a user who imports history and then connects gets doubles. | `routes/import.ts:93`; sure-study item 8 |

---

## 3. Receipts into Numeris (27 Sep idea)

**What was proposed.** It was one line in the Atrium brainstorm at 18:25 on 27 Sep:
"receipt and photo capture into Numeris" (`vault:Atlas/Projects/Atrium/Handoff-current.md:523`).
Thomas approved all 9 ideas at 18:30, with receipts seventh in the order (`:528`).
**No spec, design or task body exists beyond that line.** I searched the vault for
`receipt` across all `*.md` and `*.json`, including `Efforts/Numeris-*.md`,
`Atlas/Decisions-Log.md`, `Atlas/Inbox.md` and `hot.md`. `Decisions-Log.md`,
`Inbox.md`, `Numeris-Roadmap.md` and `Numeris-Direction-2026-09.md` have **no** receipt
entry. `hot.md` mentions receipts only as the unrelated "asks receipt" (`:661`).
Related, older items:
- G47 / G23: the receipt vision quota is unmeasured; the task is to measure one week of
  Groq vision cost first (`vault:Efforts/Numeris-Decisions.md:597`,
  `vault:Atlas/Projects/Numeris-Register.md:139`).
- RETENTION ranks receipt capture as churn loophole **b**, behind email forwarding
  (`docs/RETENTION.md:30-31`).

**What code exists.**
- `POST /api/receipt/parse` (`artifacts/api-server/src/routes/receipt.ts`, 108 lines)
  takes a base64 image, runs it through `chainVision` (Groq → Cerebras), and returns
  `{description, amount, date, type, category}` using the user's category vocabulary.
  It sits under `aiLimiter` at 30/min (G47).
- The UI is the **Scan Receipt** button in `components/quick-add-transaction.tsx:315-351`.
  It **pre-fills the manual add form** (`:159-166`), and the user still picks the account
  and presses save. The component is mounted from `layout.tsx`, `phone/SpendingScreen.tsx`
  and `phone/WorthScreen.tsx`.
- Split bills: `pages/split.tsx` has a receipt upload zone and line-item analysis
  (`/ai/receipt-split`, `routes/ai.ts`).
- **Missing:** the image is not stored against a transaction, a receipt is never matched
  to an existing bank row (the scan always creates a new row, so bank plus receipt gives
  a double), and there is no share-sheet, Shortcut, photo-library or email-in route to
  the parser.

---

## 4. Other capture paths

| Path | State | Evidence |
| --- | --- | --- |
| **Wise API** | Works. Per-user token, statements for 90 days, manual Sync button. Only FX-account users benefit. **Unverified risk:** Wise restricts `balance-statements` for UK/EEA personal tokens behind SCA (strong customer authentication). Confirm on a live token. | `adapters/wise.ts:99-115`; vault `Atlas/Projects/Finance-Tracker.md:33` "confirmed" |
| **CSV (server, `/import/csv`)** | **Broken on the modal path.** `csv-import.tsx:185` sends `accountId: 0`, which 404s on the ownership check. Parsers exist for Revolut, Maybank, Monzo, HSBC, Wise and Chase. The dedup hash `(account, date, desc, amount)` drops a real second identical same-day purchase. | `routes/import.ts:35-60,31-33`; G54 `docs/BACKLOG.md:1609` |
| **H5 file connection (`/connections/:id/import`)** | Correct dedup: ordinal within identical groups, `ON CONFLICT DO NOTHING`. **No caller** in the UI. | `routes/connections.ts:192-300`; G54 |
| **OFX/QIF (client)** | Works, but creates rows one at a time with **`currency: "GBP"` hardcoded** and no dedup in the modal. The `/import` page has a date-and-amount duplicate hint for OFX only and also hardcodes GBP. | `components/csv-import.tsx:155-167`; `pages/import.tsx:1435,1569` |
| **Email forwarding** | **Not built.** It is ranked #1 in RETENTION and is absent from the backlog. I searched `artifacts/`, `lib/` and `docs/` for `inbound|postmark|mailgun|cloudmailin|forwarding|imap`; the only code hits are unrelated market files, and the doc hits are `docs/RETENTION.md:23-27,132`. | `vault:Efforts/Numeris-Direction-2026-09.md:127,575` |
| **Apple Pay / Wallet / FinanceKit** | **Not built.** I searched `artifacts/`, `lib/`, `scripts/` and `docs/` for `financekit|apple ?pay|PassKit|share ?extension|AppIntent|siri`. The hits are only `merchant-normalizer.ts:11` (a descriptor rule) and `docs/research/sure-study.md` (Sure has a FinanceKit publisher API). The iOS target `artifacts/finance-tracker/ios/App/App/` has only AppDelegate, SceneDelegate and Info.plist, with no extension. | |
| **Shortcuts / share sheet** | **Not built.** There is no scoped API key for a Shortcut (`docs/research/sure-study.md:1135-1136`). The share-sheet extension is RETENTION loophole **c**, pending the Capacitor shell. | `docs/RETENTION.md:32-35` |
| **Maybank / MYR** | CSV parser only (`lib/csv-import/maybank.ts`, `currency: "MYR"` at `:121`), reached through the broken CSV path. No open banking exists for Malaysia. The planned route is email alerts (not built). Read-only per CLAUDE.md. | `docs/OPEN-BANKING.md:53` |
| **Cash** | Manual entry only (quick-add, or receipt pre-fill). | `components/quick-add-transaction.tsx` |
| **Investments** | Alpaca: a single account holding the **cash** figure; FILL and DIV activities are imported as transactions, so **a share purchase lands as an "expense"** (`adapters/alpaca.ts:130-183`, sign-derived type in `connection-sync.ts:74`). Kraken is similar. Holdings are entered by hand by design (`docs/TARGET-PRODUCT.md:156-159`). | |
| **Recurring detection** | Server detector: expenses only, 3+ occurrences, ±7 days, ±20% (`lib/recurring-detector-server.ts:41`, `routes/recurring.ts`). It **detects**; it never posts an expected transaction or reconciles one. `recurring_patterns` has no reader (G44, "retire it", `vault:Efforts/Numeris-Decisions.md:590`). | |
| **Split bills** | `shared_expenses` has **no link to a transaction** (schema `lib/db/src/schema/shared-expenses.ts:24-110`, no `transactionId`), so a split is always typed in again, separately from the bank row. | |

---

## 5. Gaps between today and "never type a transaction"

Size: S = up to a day, M = 2-5 days, L = a week or more (or blocked outside code).
"How common" is a judgement for a UK student user with a Malaysian side, the target
in `vault:Efforts/Numeris-Direction-2026-09.md`. It is not a measurement.

| # | Gap | User situation that forces typing | How common | Fix | Size |
| --- | --- | --- | --- | --- | --- |
| 1 | **No bank feed for anyone but Thomas** | Any tester with Monzo, Barclays or HSBC | **Every user, every transaction** | Decide M9: ask EB in writing what a listed app needs, then contract and KYB, or an agent model under TrueLayer or EB. Meanwhile, register Restricted Production for Thomas so the adapter meets the live API. | L (blocked on a business decision) |
| 2 | **EB has no UI** | Even Thomas cannot connect | 100% of EB use | Bank picker (cached `/aspsps`), "Connect at bank" button, `?created=` landing, per-connection status | M |
| 3 | **Sync only on button press** | The user opens the app and sees stale data until they go to Settings | Daily | A cron-job.org hit to an authenticated `/internal/sync-all` (Render has no worker), incremental window last-sync − 7 days, plus a sync-on-foreground call throttled to 1 per 6 hours | M |
| 4 | **Consent lapse is silent** | At 90-180 days sync starts failing, the row goes `revoked`, and data freezes | Every connection, 2-4 times a year | Read `validUntil`: a banner 7 days out, a one-tap Reconnect wherever staleness shows, and a "reconnect" status separate from "error" (session-level 401 only) | S-M |
| 5 | **Pending not modelled** | A card spend shows days late, or twice (pending then booked), or a pre-auth never clears | Weekly (card spend), monthly (pre-auths) | Read `transaction_status` and fetch BOOK then PDNG. Add a `pending` column rendered dotted (the design rule). Reconcile on same id, else exact amount with pending date ≤ booked date. Delete pending rows not returned after N days. | M |
| 6 | **Fallback id collisions** | Two identical coffees in a day at a bank with no transaction_id: one is lost | Occasional, bank-dependent | Content hash including remittance, parties and direction, plus an ordinal within identical groups (reuse `lib/file-dedup.ts`). Scope the lookup to `(userId, accountId, externalId)`. | S |
| 7 | **Everything imports as "Other"** | The user must categorise every row or press the AI button | Every row | Run `normalizeMerchant`, then user rules, then `chainCategorize` in sync after insert. Add a `userModified` flag so re-sync never overwrites edits. | S-M |
| 8 | **Transfers read as spend and income** | Moving £200 Monzo → Wise doubles spending and income | Weekly for multi-account users | Pair opposite-sign, equal-amount rows across the user's own accounts within ±3 days into `transferGroupId` legs (the columns exist, `transactions.ts:52-60`) | M |
| 9 | **Brokerage buys show as expenses** | Buying £100 of an ETF counts as £100 spent | Monthly for investors | Map Alpaca and Kraken FILL rows to `transfer`, or keep them out of the ledger | S |
| 10 | **CSV import broken (G54)** | The one fallback for uncovered banks fails with a 404, and OFX forces GBP | Every user without a feed | Wire the modal to an account picker and to `/connections/:id/import` (the dedup-safe path), and use the account's currency | S-M |
| 11 | **Malaysia / Maybank** | Every MYR spend is typed or CSV'd | Every MYR transaction | Per-user inbound address (Postmark or Cloudflare Email Routing), a Maybank alert parser, rows written as provisional and dotted, reconciled later against a CSV | M |
| 12 | **Cash** | Paying cash | Low for UK students, higher in MY | Receipt photo → provisional row. An ATM withdrawal becomes a cash-account transfer so cash spend is "unassigned cash", not a missing row. | S (ATM transfer) + existing scan |
| 13 | **Receipt creates a duplicate, not a match** | Scanning a receipt for a card purchase the bank will also import | Whenever used | Match the scan against bank rows by amount ±1% and date ±3 days, and attach the image and line items instead of creating a row. Only create one when nothing matches (cash). | M |
| 14 | **Split bills retyped** | Paid £60 for dinner for 4 | Weekly in shared houses | Start a split from a bank transaction ("split this"). Add `shared_expenses.transactionId`. | S-M |
| 15 | **Banks EB never covers / no Apple Wallet** | Apple Card is not UK. UK Wallet transactions reach FinanceKit only for some issuers. Any small card issuer. | Minority | FinanceKit client in the Capacitor shell posting to a write-only scoped key (Sure's publisher model) | L |
| 16 | **Re-consent may duplicate accounts** (unverified) | After a reconnect every account appears twice | Every re-consent, if `uid` is session-scoped | Upsert accounts on `identification_hash` (or IBAN hash), falling back to `uid`. Verify on the live API first. | S |
| 17 | **Consent state in memory** | A deploy or Render restart mid-consent gives "expired or unknown" | Rare, but certain on deploys | A `pending_consents` table | S |
| 18 | **No FX snapshot on synced rows** | Foreign-currency spend changes value over time | Every non-base row | Call `snapshotFxRate` in the sync insert, as manual rows do | S |

**Minimum path to "never type" for Thomas alone**, with no business decision needed:
register Restricted Production, then #2, #3, #4, #5, #6, #7, #8, then #11 for Maybank.
Roughly three to four weeks. **For any other user** it stays blocked on #1 whatever is
built. Until then the realistic promise is "type rarely" (CSV, email alerts and receipt
photos), not "never type".

---

## Scope of negative searches

- Scheduler: `rg "node-cron|cron\.|setInterval\(|schedule"` over `artifacts/api-server/src`,
  plus `ls .github/workflows`. The frontend was checked only for `useSyncConnection`
  (settings screens) and `sync-badge.tsx` (outbox count, not bank sync).
- EB UI: `rg "enable-banking|enableBanking|aspsp"` over `artifacts/finance-tracker/src`
  (excluding tests). No matches.
- Email capture: `rg -i "inbound|postmark|mailgun|cloudmailin|forwarding address|imap"`
  over `artifacts/` and `lib/`, plus `email.?forward|forwarding|inbound email|alert email`
  over `docs/` and `artifacts/`.
- Apple, Shortcuts, share: `rg -i "financekit|apple ?pay|PassKit|share ?extension|AppIntent|siri|ios shortcut"`
  over `artifacts/`, `lib/`, `scripts/` and `docs/`, plus `ls artifacts/finance-tracker/ios/App/App`.
  Xcode project internals beyond that directory listing were not searched.
- Pending: read `adapters/enable-banking.ts` and `lib/db/src/schema/transactions.ts` in
  full for status fields.
- Vault receipts: `rg -i receipt` across the whole vault (`*.md`, `*.json`) and
  `receipt.*numeris|numeris.*receipt`. The Master-Plan queue files outside the vault
  (`master-plan` repo) were **not** searched, so a task body for the 27 Sep idea may
  exist there.
- Not verified live: the Wise SCA restriction, EB `uid` stability across sessions, and the
  real EB behaviour of any bank. The adapter has never run against the live API
  (`docs/BACKLOG.md:1705-1707`).
