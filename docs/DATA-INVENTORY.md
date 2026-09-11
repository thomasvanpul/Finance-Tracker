# Data inventory

What Numeris holds about people, where it sits, why, for how long, what
removes it, and who else receives it.

**Audited from source at `45d284b` on 2026-09-11.** Not legal advice. Every
row cites the file that establishes it. Where something could only be read
from code and not measured, or depends on configuration that lives outside the
repo (the Render dashboard, a provider's terms), the row says so.
`docs/PRIVACY.md` is derived from this file; if the two disagree, this one is
checked against source first.

Re-audit this file whenever a table is added, an outbound host is added, or
`artifacts/api-server/src/lib/ai-context.ts` changes.

Path prefixes: `S/` = `lib/db/src/schema/`, `A/` = `artifacts/api-server/src/`,
`F/` = `artifacts/finance-tracker/src/`.

---

## 0. Who is responsible

The operator is an individual, not a company (Apple Developer enrolment is as an
Individual). Name, postal address and contact address: `[TO CONFIRM]`.

---

## 1. What account deletion does

Everything below refers back to this.

`POST /api/account/delete` (`A/routes/account.ts:16-34`) calls
`deleteUserAccount` (`A/lib/account-deletion.ts:77-122`). In one database
transaction it:

1. deletes the `user` row, and Postgres removes every row in every table whose
   foreign key to `user.id` is `ON DELETE CASCADE`. The list of such tables is
   derived from the schema at runtime, not written by hand (`:55-69`);
2. deletes `verification` rows matching the user's email or id (`:103-113`);
3. sets `request_metrics.user_id` to null for the user's rows (`:97-101`). The
   rows themselves stay until the 30-day prune (§6).

It does not touch:

- rows in **another** user's tables that name this person, including debts
  mirrored into another account (§2.4);
- server logs (§3.1) and server memory (§3.2);
- the IndexedDB copy of the user's data on any device, including the one they
  deleted from (§3.4);
- any grant at a third party. Wise, Kraken and Alpaca tokens and the Google or
  GitHub sign-in grant are destroyed locally and not revoked at the provider,
  and the delete screen says so (`A/routes/account.ts:8-15`,
  `F/pages/profile.tsx:1488-1490`). The Enable Banking bank consent is not
  revoked either — the adapter has no revoke call
  (`A/adapters/enable-banking.ts:154,206,221`) — and the delete screen names
  neither Enable Banking nor Apple sign-in;
- anything already sent to the AI providers or Resend (§4, §5);
- the Neon `dev` branch, a copy-on-write clone of production carrying real data
  (`CLAUDE.md`, "Local development points at the Neon branch `dev`").
  Production backups and point-in-time restore are not described anywhere in
  the repo; Neon's plans page gives the Free plan a 6-hour restore window, so a
  deleted account is recoverable by the operator for up to 6 hours.

There is no password or second-factor check before deletion — the user types
the account email, checked against the session (`A/routes/account.ts:16-24`) —
and no grace period.

One defect in the verification cleanup: `like '%<email>'`
(`A/lib/account-deletion.ts:108`) also matches any other address ending in the
deleted one (deleting `a@b.com` removes pending tokens for `xa@b.com`), and `_`
in an address is not escaped.

---

## 2. Personal data in the database

The database is Neon Postgres, AWS `eu-west-2` (London).

### 2.1 Identity and sign-in

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Name, email, email-verified flag, 2FA flag, profile image | `user` — `S/auth.ts:5-9` | The account. Email is the sign-in identifier and the recipient of reset and digest emails (`A/lib/better-auth.ts:85`, `A/routes/digest.ts:157`) | Life of the account | Account deletion |
| Password hash | `account.password` — `S/auth.ts:36` | Email and password sign-in (`A/lib/better-auth.ts:53-55`) | Life of the account | Cascade |
| OAuth access, refresh and ID tokens; provider account id | `account` — `S/auth.ts:27-35` | Google, Apple or GitHub sign-in, each active only when its credentials are configured (`A/lib/better-auth.ts:112-141`). Only the Google pair is declared in `render.yaml:56-59` | Life of the account. **Not encrypted by application code**; no encryption option found in `A/lib/better-auth.ts:17-222` (code-reading) | Cascade |
| Session token, **IP address, user agent**, expiry | `session` — `S/auth.ts:14-22` | Issued by better-auth, which fills IP and user agent from request headers. No application code reads either column | Sessions expire after 30 days, refreshed daily (`A/lib/better-auth.ts:20-21`). **Expired rows are never deleted** — no cleanup found in the app or in better-auth 1.6.23 | Cascade |
| Passkeys, TOTP secret, 2FA backup codes | `passkey`, `totp_credential`, `two_factor` — `S/auth.ts:57-82` | Second factor | Life of the account | Cascade |
| Verification tokens (identifier is an email) | `verification` — `S/auth.ts:41-44` | Password reset. The email says the link expires in 1 hour (`A/lib/better-auth.ts:87`) | **No cleanup found** | Explicit delete on account deletion |

### 2.2 Settings and free text the user types

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Base currency, persona, theme, onboarding time | `app_settings` — `S/app-settings.ts:17-54` | Presentation | Life of the account | Cascade |
| Key/value preferences, each up to 262,144 characters (`A/lib/user-preferences-db.ts:19`). Keys include transaction notes and tags, **family members**, bill splits, the user's own name for splits, tax disposals, ISA contributions, tax country, pension and mortgages (`F/lib/account-storage-keys.ts:29,49-52`) | `user_preferences` — `S/user-preferences.ts:19-24` | Sync of client-side features across devices | Life of the account | Cascade |

### 2.3 Money

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Accounts: name, type, balance, currency, Wise profile and balance ids, external id. A bank-connected account is named from the bank, **falling back to the IBAN** when the bank supplies no name (`A/adapters/enable-banking.ts:279`) | `accounts` — `S/accounts.ts:6-50` | Net worth, cash, allocation | Life of the account | Cascade. Deleting a single account leaves its transactions: `A/routes/accounts.ts:346-362` removes only the account row and `transactions.account_id` has no foreign key (`S/transactions.ts:31`) |
| Transactions: date, description, category, amount, native amount, external id. For bank-imported rows the description is the counterparty's name or the payment reference (`A/adapters/enable-banking.ts:318-328`) | `transactions` — `S/transactions.ts:24-35` | Spending, budgets, categorisation | Life of the account | Cascade |
| Upcoming bills and income; subscriptions and dismissed subscription descriptions; recurring patterns (merchant display name, expected amount, last occurrence) | `upcoming`, `subscriptions`, `dismissed_subscriptions`, `recurring_patterns` — `S/upcoming.ts:8-29`, `S/subscriptions.ts:4-24`, `S/recurring-patterns.ts:4-12` | Forward cash flow | Life of the account | Cascade |
| Investments: ticker, name, buy date, shares, cost | `investments` — `S/investments.ts:6-13` | Portfolio valuation | Life of the account | Cascade |
| Budgets: category, monthly limit | `budgets` — `S/budgets.ts:6-10` | Budgeting | Life of the account | Cascade |
| Goals: name, target, current, history, and **a photo** the user picks, stored as a JPEG data URL | `goals` — `S/goals.ts:9-20`; written from `F/pages/goals.tsx:1034` | Savings goals | Life of the account | Cascade |

Nine of these tables allow a null `user_id` (accounts, transactions, upcoming,
investments, debts, budgets, goals, subscriptions, dismissed_subscriptions). A
row with no owner is reached by no deletion. Whether any such rows exist in
production was **not measured** — no database client was available to this
audit.

### 2.4 People who are not the user

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Debts: the other person's name, their email if linked, description, notes, amount | `debts` — `S/debts.ts:9-20` | Who owes whom | Life of the **user's** account | The user's cascade. The named person has no route to see, correct or remove it. If they hold a Numeris account and delete it, only the link goes; their name and email stay in the other user's row (`A/lib/account-deletion.ts:19-22`, `S/debts.ts:20` `set null`) |
| Shared expenses: each participant's name and email if linked, share amount; settlement notes | `shared_expenses`, `shared_expense_participants`, `shared_expense_settlements` — `S/shared-expenses.ts:24-114` | Splitting costs | Life of the user's account | As above (`S/shared-expenses.ts:73` `set null`). When a linked participant deletes their account, **their settlement rows on the payer's expense are deleted** (`S/shared-expenses.ts:110` `cascade`), so the payer's record of who paid changes |
| **A debt written into someone else's account.** When a user records a debt with an email that matches a registered user, a mirror debt carrying the creator's description and notes is inserted into that other person's account, without their action | `debts` — `A/routes/debts.ts:144-172` | Two-sided debts | Life of the **recipient's** account | The recipient's cascade only. The creator deleting their account does not remove it |
| Family members, bill-split names | `user_preferences` (§2.2) | Client features | Life of the user's account | Cascade |
| Names of people splitting a receipt | Not stored; **sent to the AI providers** (§4) | Receipt split | — | — |

### 2.5 History that accumulates

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Monthly net-worth snapshot: cash, investment, pension, property, other totals. One row per user per month, upserted on every dashboard read (`A/routes/dashboard.ts:636-656`) | `nw_snapshots` — `S/nw-snapshots.ts:26-39` | Net worth over time | **Never pruned** | Cascade |
| Daily per-account balance: balance, currency, FX rate, captured time. Written once per account per day, on dashboard read and on balance edit (`A/lib/account-snapshots.ts:63-68`, `A/routes/dashboard.ts:660`, `A/routes/accounts.ts:339-341`) | `account_balance_snapshots` — `S/account-balance-snapshots.ts:44-71` | Balance history, allocation drift | **Never pruned** | Cascade from the user and from the account |

### 2.6 Credentials for connected services

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Wise API token, Kraken key pair, Alpaca key pair, Enable Banking session id and expiry. **Encrypted** with AES-256-GCM, random 12-byte IV and auth tag (`A/lib/crypto.ts:18-69`). The key is loaded on first use, not checked at boot (`A/lib/crypto.ts:42-47`; nothing in `A/index.ts` references it), so `docs/CREDENTIAL-ENCRYPTION.md:18-19`'s "refuses to boot" is not what the code does | `connections.credential_ciphertext` — `S/connections.ts:36-37` | Syncing balances and transactions | Until the connection or the account is removed | Cascade. What happens at the provider: §5 |
| Connection label, last error text, institution — **plaintext** | `connections` — `S/connections.ts:25-46` | Display, diagnostics | Same | Cascade |

### 2.7 Operational

| What | Where | Why | How long | Removed by |
| --- | --- | --- | --- | --- |
| Per request: time, route template (for an unmatched route, the literal path without query string), method, status, duration, **user id**, phone/desktop class derived from the user agent. No IP, no user agent, no body (`S/request-metrics.ts:65-89`, `A/lib/request-metrics.ts:52-122`). Recorded for every `/api` request except `/api/healthz`, including sign-in routes | `request_metrics` — `S/request-metrics.ts:62-89`, written from `A/app.ts:61` | Latency measurement (`docs/OPERATIONS.md:243-245`) | **30 days**: pruned at boot and every 24 hours (`A/lib/request-metrics.ts:132-141`, `A/index.ts:73-91`) | User id nulled on account deletion; row removed by the prune |

---

## 3. Personal data outside the database

### 3.1 Server logs

pino writes to stdout and Render keeps it (`A/lib/logger.ts`). Retention is
Render's rolling log: about 7 days per `docs/OPERATIONS.md:277`, and 7 days for
Hobby workspaces per Render's logging documentation (checked 2026-09-11). Where
Render stores logs is not established.

- **Redacted:** authorization header, cookies, set-cookie, and any field named
  credential, token, apiKey or secret (`A/lib/logger.ts:20-36`).
- **Not redacted, and logged:**
  - the user's **email address** on every password-reset outcome
    (`A/lib/better-auth.ts:73,95,98,100`);
  - user ids in sync and snapshot paths (`A/routes/connections.ts:118,142`,
    `A/lib/balance.ts:84`, `A/lib/account-snapshots.ts:76`,
    `A/lib/subscription-upcoming.ts:90`);
  - up to 200 characters of a model's reply when a receipt parse fails
    (`A/routes/receipt.ts:101`), and up to 200–1,000 characters of a malformed
    stream chunk or provider error body
    (`A/lib/ai-providers/openai-compat.ts:191,240,343`).
- **Request log:** request id, method and path without query string
  (`A/app.ts:44-51`). No IP.

Account deletion cannot reach logs.

### 3.2 Server memory

Lost on restart.

- Rate-limit counters keyed by IP, and by user id on `/api/ai/*`
  (`A/app.ts:108-148`); better-auth's own limiter, in memory by default.
- Enable Banking consent in progress: user id, bank name, country, for 30
  minutes (`A/routes/enable-banking.ts:42-59`).

### 3.3 Files

Receipt images and CSV imports are processed in memory and **not stored**
(`A/routes/receipt.ts:25-64`, `A/routes/import.ts:19-116`). Imported rows become
transactions. Goal photos are the exception and are stored (§2.3).

AI chat messages and responses are **not stored on the server**: there is no
table for them and `A/routes/ai.ts` performs no database writes.

### 3.4 On the user's device

| What | Where | How long | Cleared by |
| --- | --- | --- | --- |
| **A copy of the user's financial data**: every API query response except market, AI and auth — balances, transactions, debts | IndexedDB via `idb-keyval`, prefix `numeris-query-v1` (`F/lib/offline-cache.ts:55,77,87-99,226-243`) | Up to 30 days (`GC_TIME_MS`, `:77`) | **No code found that deletes it** on sign-out or account deletion. Both call `queryClient.clear()`; whether that removes persisted entries is not established from repo code, so assume it survives |
| Writes queued while offline, with their request bodies | IndexedDB `NumerisOutbox` (`F/lib/outbox-db.ts:13-33`) | Until sent | No code found that deletes it |
| Account-level settings and feature data (`ft-*`, `nr-*` keys) | localStorage (`F/lib/account-storage-keys.ts:27-80`) | Until cleared | Sign-out removes account-level keys after syncing them, and leaves them if the sync fails (`F/lib/account-storage.ts:295-310`, `F/components/layout.tsx:1421-1433`). Account deletion removes every `ft-`, `nr-`, `numeris` and `ix-companion` key (`F/pages/profile.tsx:650-658`) |
| Last signed-in user id; sign-in history (time and device type) | localStorage (`F/components/auth-gate.tsx:228-241`, `F/pages/profile.tsx:473-486`) | Until cleared | Login history is device-local and survives sign-out (`F/lib/account-storage-keys.ts:69`) |
| Crypto wallet addresses the user adds | localStorage (`F/pages/settings.tsx:1861-1862`) | Until cleared | As above |
| AI coach transcript; AI insight caches | sessionStorage (`F/pages/ai-coach.tsx:372-389`, `F/lib/account-storage-keys.ts:78-80`); briefing output in localStorage (`F/pages/briefing.tsx:51-62`) | The browser session | No explicit clear found |
| Sign-in token on iOS | `@capacitor/preferences` (`F/lib/native-auth.ts:28,72`) — UserDefaults, not the Keychain | Until sign-out | Cleared on sign-out and deletion |

The service worker caches static assets and Google Fonts only, never API
responses (`artifacts/finance-tracker/vite.config.ts:49-58`).

---

## 4. The AI features

This is the most significant disclosure in the policy.

### 4.1 Who receives it

Two providers, tried in order until one answers (`A/lib/ai-providers/chain.ts:54`).
If neither answers, the request fails and the feature shows an error; nothing
else is tried (`A/lib/ai-providers/chain.test.ts`, "Groq and Cerebras both fail").

| Order | Provider | Host | Models (defaults) |
| --- | --- | --- | --- |
| 1 | Groq | `api.groq.com/openai/v1` (`groq.ts:24`) | `openai/gpt-oss-120b` chat, `openai/gpt-oss-20b` categorise, `qwen/qwen3.6-27b` vision (`groq.ts:31-39`) |
| 2 | Cerebras | `api.cerebras.ai/v1` (`cerebras.ts:26`) | `gpt-oss-120b` chat and categorise, `gemma-4-31b` vision (`cerebras.ts:33-37`) |

- Every model can be overridden by an environment variable; production values
  live in the Render dashboard, not the repo.
- Free-tier models are refused in code. `A/lib/ai-providers/model-policy.ts`
  rejects any model id ending `:free`, and the `openrouter/free` router, before
  a request is sent and at boot verification.
  `model-policy.lock.test.ts` fails if such an id appears anywhere in the
  server source.
- Calls are server-side only. The web and phone apps never contact a model
  provider directly.
- Keys are Numeris's own. No user supplies a key.

**What the providers do with it.** Researched from each provider's published
documents on 2026-09-11; none of this is in the repo. Quotes and URLs are in
the `.review/` report of that date. Three quotes came from PDFs read directly;
the rest came through a page-summarising fetch and must be re-read on the live
page before the policy relies on them.

| Provider | Keeps prompts by default? | Trains on them? | Where | DPA for an individual operator? |
| --- | --- | --- | --- | --- |
| Groq | Up to 30 days, for reliability and abuse monitoring only. A self-serve Zero Data Retention switch exists in Data Controls | No (Services Agreement, updated 22 Jun 2026) | Stored in the US (GCP) | Yes, built into the Services Agreement; Groq is processor. EU SCCs and UK Addendum |
| Cerebras | States it does not retain inputs or outputs; its Inference Terms and DPA word this differently | No | US "and other applicable countries" | **Not for personal-capacity use**: its Inference Terms say Cerebras then acts as an independent controller |
| OpenRouter itself (removed 2026-09-11) | No, unless the account opts in to logging; keeps metadata | No | US; EU routing needs a Business plan | Not established for an individual |
| **OpenRouter free: NVIDIA** (both Nemotron models formerly in the chain) | **Yes — all prompts and outputs logged** | **Yes**, to improve NVIDIA's models | Not established | None. NVIDIA's API Trial Terms §2.6(a) forbid sending personal data and §1.2 forbid production use |
| **OpenRouter free: Google AI Studio** (Gemma vision, formerly in the chain) | Human reviewers may read input and output | **Yes** under Google's Unpaid Services terms | Not established | None. Google's terms say only Paid Services may be offered to users in the EEA, Switzerland or the UK |

**Consequence, and the change of 2026-09-11.** Until that date a third lane,
OpenRouter, followed Cerebras. It used the free models:
- `nvidia/nemotron-3-super-120b-a12b:free` for chat;
- `nvidia/nemotron-nano-9b-v2:free` for categorising;
- `google/gemma-4-31b-it:free` for vision.

Whenever Groq and Cerebras both failed, users' financial data and receipt photos
went to endpoints whose own terms forbid it. A configured key was enough for
that lane to serve. The chain's health check reads the key and the circuit
breaker, not whether the models passed boot verification.

The lane was removed on 2026-09-11. A leftover `OPENROUTER_API_KEY` is now
ignored. The OpenRouter rows above are kept as the record of why.

Two things were not checked:
- whether the production OpenRouter account had free-endpoint logging enabled,
  which the free models require;
- whether any production request reached it.

### 4.2 What is sent, per feature

| Feature | Route | Sent to the provider |
| --- | --- | --- |
| Chat and page insights | `POST /api/ai/chat` (`A/routes/ai.ts:144`) | A system prompt with a **context block rebuilt from the database on every message** (`ai.ts:195`), capped at 10,000 characters (`A/lib/ai-context.ts:76`), plus the whole conversation so far — up to 20 messages of up to 4,000 characters each (`lib/api-zod/src/ai-chat.ts:37-51`) |
| Categorise transactions | `POST /api/ai/batch-categorize` (`ai.ts:514-556`) | **Each transaction's description (merchant), amount and type**, plus the user's category names |
| Receipt scan | `POST /api/ai/receipt-scan` (`ai.ts:410`), `POST /api/receipt/parse` (`A/routes/receipt.ts:24`) | **The receipt photo**, the user's category names, base currency |
| Receipt split | `POST /api/ai/receipt-split` (`ai.ts:278-303`) | **The receipt photo and the names of up to 20 people** the bill is split between |

The chat context block (`A/lib/ai-context.ts:242-773`) contains:

- net worth, total assets, total liabilities, portfolio value;
- this month's income, expenses, net and savings rate;
- **per-currency exposure**: amount held, base-currency equivalent, FX rate,
  and upcoming outgoings in that currency;
- budgets by category name, spent against limit;
- goals, **including the name the user gave each goal**, with target, progress,
  deadline and monthly contribution;
- debts as totals each way, the number of people, and the largest single amount;
- **upcoming obligations** for the next 30 days as committed-out and
  expected-in totals;
- the top five spending categories with totals;
- subscription count and approximate monthly total;
- base currency and the current page path.

It does **not** contain account or institution names, per-account balances,
transaction descriptions, names of other people, tickers, IBANs, tokens, or the
user's name, email or id. `A/lib/ai-context.test.ts:94-210` asserts those
exclusions; note its fixture contains no people's names, so the protection for
names is that the debt data passed in carries no name field
(`ai-context.ts:583-592`).

No request carries a user identifier, and none sets a no-storage or
zero-retention option: the body is model, messages, max tokens, temperature,
and optionally stream and response format; headers are content type,
authorization and accept (`callOpenAICompat` and `callOpenAICompatStream` in `A/lib/ai-providers/openai-compat.ts`).

### 4.3 Whether the user chose it

- **There is no opt-in.** AI is available to every signed-in user whenever a
  provider key is configured on the server (`ai.ts:79-81,145-148`).
- **Four pages send the context without being asked**, each only when nothing
  is cached for the session:
  - the dashboard, 500 ms after loading (`F/pages/dashboard.tsx:942`);
  - budget and goals, after 300 ms (`F/pages/budget.tsx:503`, `F/pages/goals.tsx:907`);
  - investments, after 400 ms (`F/pages/investments.tsx:885`).
- What the user is told today:
  - Settings, "What the AI is sent" (`F/pages/settings.tsx:1517-1539`), says:
    - what the summary contains;
    - what each feature sends;
    - that Groq, then Cerebras, receives it.

    Until 2026-09-11 it said only "Current page name sent with every
    message", which understated what is sent;
  - chat panel: "I read your accounts, budgets and goals server-side."
    (`F/components/ai-agent.tsx:370`);
  - coach page: names Groq and Cerebras
    (`F/pages/ai-coach.tsx:893`);
  - the batch-categorise confirmation does not mention a third party
    (`F/pages/transactions.tsx:1908-1931`).
- Rate limit: 30 requests a minute per user on `/api/ai/*` (`A/app.ts:131-145`).
  `/api/receipt/parse` sits outside that path and gets only the per-IP limit.

---

## 5. Third parties

"From" says whose machine makes the call. A call from the user's browser or
phone shows that host the user's IP address.

| Service | Receives | Personal data | From | Location | Evidence |
| --- | --- | --- | --- | --- | --- |
| **Vercel** | Serves the web app, and **proxies every web `/api` request** to Render, so it handles request and response bodies, cookies and IPs. The iOS app calls Render directly (`F/lib/api-fetch.ts:28-35`) | Yes, all of it in transit | Browser | US primary and "anywhere else in the world" (Vercel DPA); TLS is terminated at the Vercel compute region nearest the user. **Vercel's DPA covers Pro and Enterprise only, so on Hobby there is no processing agreement**, and Hobby is restricted to non-commercial use | `artifacts/finance-tracker/vercel.json:6-9` |
| **Render** | Runs the API; processes everything; holds logs (§3.1) | Yes | — | Service region Frankfurt. Render's DPA, part of its terms on every plan, says its primary processing is in the US; it does not promise EU residency. DPF and SCCs | `render.yaml:6` |
| **Neon** | The database | Yes | Server | AWS eu-west-2, London. Neon (now Databricks) DPA appears to cover the Free plan but no document says so outright; ask Neon. Free-plan restore window 6 hours | `CLAUDE.md`; region in the `DATABASE_URL` host |
| **Resend** | Password reset: the email address and a reset link. Weekly digest, sent only when the user presses send in settings (`F/pages/settings.tsx:1773`): **name, email, the week's income, expenses, top categories and transaction count** | Yes, including financial | Server | **US**, whatever sending region is chosen. DPA binding on accepting its terms; SCCs, UK Addendum, DPF. The digest's sender is hard-coded as `digest@numeris.app` (`A/routes/digest.ts:156`), a domain not among those held | `A/lib/better-auth.ts:70-103`, `A/routes/digest.ts:85-163` |
| **Groq, Cerebras** | §4 | Yes, including financial and other people's names | Server | US; see §4.1 for each provider's terms | §4 |
| **Google, Apple, GitHub** sign-in | That the user is signing in to Numeris; returns name, email, avatar and tokens | Yes | Browser redirect | — | `A/lib/better-auth.ts:112-141` |
| **Enable Banking** | The user's bank and country, a consent request. Returns account names, **IBANs**, balances, and transactions including counterparty names and payment references | Yes | Server, and a browser redirect to Enable Banking and the bank | `[TO CONFIRM]` | `A/adapters/enable-banking.ts:48-330`. No `ENABLE_BANKING_*` variable is declared in `render.yaml`, so whether it is live in production is unknown |
| **Wise** | The user's own API token. Returns profile, balances, statements | Yes | Server | — | `A/adapters/wise.ts:18-115` |
| **Kraken** | The user's API key pair. Returns crypto balances | Yes | Server | — | `A/adapters/kraken.ts:32-201` |
| **Alpaca** (the user's broker account) | The user's key pair. Returns account number, cash, activity | Yes | Server | — | `A/adapters/alpaca.ts:28-142` |
| **Yahoo Finance, Alpaca market data, Polygon, Twelve Data** | Ticker symbols, including those of users' holdings and one news request per held ticker. No user id; one shared price cache | Low: the tickers reflect what users hold but are not tied to a person | Server | — | `A/lib/market.ts:11,108,148,503,1009,1166-1239`, `A/lib/market-adapters.ts:39,81,232,352`, `A/lib/alpaca-stream.ts:76` |
| **Frankfurter** (ECB reference rates) | Currency codes | No | Server | — | `A/lib/market.ts:148` |
| **Google Fonts** | Font requests: the user's IP and browser details. The service worker caches the font CSS for a year | Yes (IP) | Browser, and the phone app's bundled page | Google. LG München I, 20 Jan 2022 (3 O 17493/20): passing a visitor's IP to Google Fonts without consent was unlawful, €100 damages | `artifacts/finance-tracker/index.html:22-24`, `artifacts/finance-tracker/vite.config.ts:52-57` |
| **Etherscan, Blockstream** | **The crypto wallet address the user enters**, with their IP. The wallet list stays in browser storage | Yes | Browser | — | `F/pages/settings.tsx:1861-1892` |
| **cron-job.org** | Calls `/api/healthz` every minute | No | — | — | `docs/OPERATIONS.md:11-29` |
| **Healthchecks.io** | A ping with no data. Not yet configured (`A/routes/health.ts:21-23`) | No | Server | — | `A/routes/health.ts:24,40` |
| **GitHub API** | A request for the latest commit, admin page only | No | Server | — | `A/lib/deploy-truth.ts:50-68` |

**Searched and not found:** analytics (PostHog, Mixpanel, Plausible, Segment,
gtag), crash reporting (Sentry — `docs/OPERATIONS.md:277` says not built), push
notifications (Firebase, APNs), payment processors (Stripe), other email
providers, Plaid, TrueLayer, GoCardless (comments only). Capacitor plugins are
all on-device.

**Configuration the repo cannot show:** which of the optional integrations
above have keys set in the Render dashboard. `render.yaml` declares none of
the Groq, Cerebras, Twelve Data, Enable Banking, Apple or GitHub
variables, and still declares an unused `GEMINI_API_KEY` (`render.yaml:71`).

---

## 6. Rights, consent and security as the code stands

| Right or duty | What exists | What does not | Evidence |
| --- | --- | --- | --- |
| **Access and portability** | `GET /api/export/backup`: a JSON file of 8 tables — accounts, transactions, investments, upcoming, debts, budgets, goals, subscriptions. `GET /api/export/tax-year/:year`: transactions as CSV. Reachable from Settings → Export & Backup and from the delete flow, on desktop and phone | The export omits the user's profile (name, email), sessions with IP and user agent, linked sign-in providers, passkeys and 2FA, connections, both snapshot tables, recurring patterns, dismissed subscriptions, app settings, `user_preferences` (family members, tax, pension, mortgages, notes), all shared-expense data, and request metrics | `A/routes/export.ts:13-122`, `F/pages/settings.tsx:2522`, `F/pages/profile.tsx:631` |
| **Erasure** | §1 | §1 "does not touch" | §1 |
| **Rectification** | Name and avatar (`F/pages/profile.tsx:510,524`), password (`:687`), and every finance record through its PATCH or PUT route | **Email cannot be changed** — no `changeEmail` anywhere. Snapshots, recurring patterns, request metrics and session data have no write route. A record another user holds about you cannot be corrected by you | `rg changeEmail` over both apps: no match |
| **Restriction and objection** | Removing a connection stops bank sync (`A/routes/connections.ts:122-145`); accounts it imported stay | **No switch for AI** (§4.3). The weekly-digest "enable" toggle is stored only in the browser and no scheduler exists; the digest email says "you enabled weekly digest" and its Unsubscribe link is `href="#"`. The "Privacy" tab blurs figures on screen and restricts no processing | `F/pages/settings.tsx:1761-1767`, `A/routes/digest.ts:78`, `F/pages/profile.tsx:445-457` |
| **People who are not users** | Nothing is ever sent to them | No route for a non-user to see, correct or remove what a user recorded about them; every route except health, sign-in and provider status requires sign-in | `A/app.ts:170-239`; §2.4 |
| **Consent and notice at signup** | — | Signup sends email, password and name only. No terms or privacy link, no acceptance control, no stored acceptance time or version, no cookie or consent banner | `F/components/auth-gate.tsx:450`; `S/auth.ts:3-12`, `S/app-settings.ts:18-55` |
| **Age** | — | No age check anywhere | `rg` for date of birth and minimum-age patterns across the SPA: no match |
| **Breach response** | — | No procedure; listed as not done | `docs/BACKLOG.md:1200-1202` (I4) |

**Security measures that exist.**

- Encrypted connection credentials (§2.6).
- Cookies `Secure` and `SameSite=Lax` (`A/lib/better-auth.ts:218-221`).
- A CORS allowlist that fails closed (`A/app.ts:63-89`).
- Rate limits on sign-in (20 per 15 minutes), the API (300 per minute) and AI
  (30 per minute per user) (`A/app.ts:107-173`), all skipped when
  `NODE_ENV=development`.
- Passkeys and two-factor available (`S/auth.ts:57-82`).
- Helmet's default headers, including HSTS, on API responses.

**Security measures that do not.**

- **No Content Security Policy anywhere.** Helmet's is switched off with a
  comment that the frontend CDN manages it (`A/app.ts:32-39`), and neither
  `artifacts/finance-tracker/vercel.json` nor `index.html` sets one.
- OAuth tokens stored unencrypted (§2.1).
- The iOS sign-in token in UserDefaults rather than the Keychain (§3.4).
- In-memory rate-limit stores that reset on every restart.

**Who can see other users' data.** An allowlisted admin overview returns every
user's email and per-table row counts (`A/routes/admin.ts:65-89`,
`A/lib/admin-gate.ts:39-57`).

---

## 7. Retention: what the code enforces and what it does not

**Enforced in code**

| Data | Period | Evidence |
| --- | --- | --- |
| `request_metrics` rows | 30 days | `A/lib/request-metrics.ts:132-141`, `A/index.ts:73-91` |
| Session validity (the row stays) | 30 days | `A/lib/better-auth.ts:20` |
| Enable Banking consent in progress (memory) | 30 minutes | `A/routes/enable-banking.ts:52-59` |
| Rate-limit windows (memory) | 1–15 minutes | `A/app.ts:108,132,148` |

**Not enforced anywhere.** Everything else is kept until the user deletes it or
deletes the account: transactions, snapshots, goal photos, debts and shared
expenses naming other people, connection credentials, expired sessions and
used verification tokens. Logs are kept for as long as Render keeps them.

No data-retention period is documented anywhere in the repo.
`docs/RETENTION.md` is about user churn, not data retention.
`docs/BACKLOG.md:1191-1194` (I2) lists the privacy policy and its retention
period as not done.
