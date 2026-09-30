# Numeris: which automatic bank-data route

Round-2 research, **30 Sep 2026**. Builds on `docs/research/special-2026-09/capture.md`
(round 1, same day) and `docs/OPEN-BANKING.md` (16 Aug). Web facts carry a URL. When a
page failed to load, I say so and the fact comes from a search-result snippet of that URL.
Those facts are marked *(snippet)*. Nothing was signed up for and no form was submitted.

The decision: which provider makes transactions arrive **by themselves** for 6-20 beta
testers now and about 1,000 users later. The testers are in the UK and the Netherlands.
There are also read-only Maybank (Malaysia) accounts. Numeris never holds or moves money.

---

## Answer first

- **Pick: Enable Banking, full production (paid contract).** The adapter, the consent
  routes and the sync plumbing already exist. It covers the UK and the Netherlands in one
  API. And it is the only provider that lets Thomas build and test the whole flow on his
  own real accounts today, for free, while the contract is being arranged.
- **Fallback: TrueLayer** for UK users (FCA-authorised, with a documented path for
  unregulated clients). If TrueLayer does not cover Dutch banks well enough, Enable Banking
  stays in place for NL.
- **Cost:** Enable Banking publishes **no prices**. Since April 2026 it quotes through a
  form, charges per connected account per month, and has a **monthly minimum invoice**. So
  the monthly cost at 20 and at 1,000 users is **unknown until Thomas asks for the quote**.
  The fixed costs around it are known: about £100 once and £90 a year (see "Costs").
- **Malaysia (Maybank):** no open-banking route exists in 2026. Bank Negara Malaysia's
  framework starts in 2027 at the earliest. Finverse claims to connect Maybank at US$0.50
  per account, but it is a separate contract and a separate integration. It is not
  recommended now.
- **Biggest uncertainty:** whether Enable Banking, which is registered in Finland, can
  serve **UK consumers** through an unregulated app like Numeris without Numeris being
  FCA-registered as its agent. UK rules say an app that shows people their own combined
  account data must be an AISP or an AISP's agent. TrueLayer and Yapily both document this.
  Enable Banking's public pages do not address it.

---

## 1. Why Restricted Production cannot serve testers

Round 1 found that Restricted Production covers only accounts Thomas links himself. The
terms make this explicit. They were last updated 9 Jan 2026 (https://enablebanking.com/terms/):

- "Use of the API in the Production Environment is limited to Linked Accounts and is
  available solely for evaluation purposes or for the personal use of private individuals."
- It grants no right to access "account information that does not belong to the Control
  Panel user who associated the Linked Accounts", or to use the API "for any commercial
  purpose whatsoever".
- "You shall not ... make accessible to any third party ... the Control Panel and the API."

This also rules out a **"bring your own app"** workaround, where each tester makes their
own Enable Banking app and gives Numeris its key. That is the model self-hosted tools such
as Actual Budget use (https://actualbudget.org/docs/advanced/bank-sync/enable-banking/).
Handing the key to Numeris's server makes the API "accessible to a third party". So
Restricted Production is for **Thomas's own accounts and for building**, and nothing more.

---

## 2. Comparison

Legend. **Cost** means the provider's fee only. It excludes company and ICO costs, which
are covered in section 4. "n/p" means not published. The account counts assume about 2 bank
accounts per user, so 20 users is about 40 accounts and 1,000 users is about 2,000
accounts. **That ratio is an assumption, not a measurement.**

| Provider | Taking new clients? | Company / licence needed | Cost, 20 users | Cost, 1,000 users | Consent length | UK | NL | Malaysia | Sign-up path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Enable Banking** | Yes | Contract + KYB "for your company"; its own licence (FIN-FSA) is used | n/p; monthly minimum applies | n/p; per account per month | 180 days for most banks | Yes (e.g. Barclays GB, Revolut GB); UK regulatory position unclear | Yes: ABN AMRO, ING, Rabobank, de Volksbank, Triodos | No | Control panel (free, sandbox + restricted) → "Get a Quote" form → contract + KYB |
| **GoCardless Bank Account Data** (Nordigen) | **No**. Sign-ups disabled since July 2025 | – | – | – | 90 days (historic) | – | – | No | Closed |
| **TrueLayer Data API** | Yes | KYB on a business entity; UK "AIS agent" route or unregulated "Joint Agreement" | n/p (sales-gated) | n/p | 90 days, then in-app reconfirm (UK) | Yes (FCA-authorised, FRN 901096) | EU coverage claimed, unverified per bank | No | Console sandbox → sales → KYB → agreement |
| **Yapily** (Yapily Connect) | Yes | Company; UK: FCA-registered agent of Yapily Connect Ltd | n/p | n/p | 90-day reconfirm (UK) | Yes | Yes (EU via Yapily Connect UAB) | No | Sales → agency agreement → FCA agent registration |
| **Plaid** (UK/EU) | Yes | UK/EU: only **Custom** plans; agent route needs the "Scale" plan and a later own licence | n/p | n/p | 90-day reconfirm (UK) | Yes | Yes | No | Sales only for UK/EU |
| **Tink** (Visa) | Yes | Company; agent of Tink, or Tink serves the user directly | €0.50/user/mo "Standard" *(third-party claim)* → ~£9/mo | ~€500/mo *(same claim)* | 90-day reconfirm (UK) | Yes (FCA-authorised) | Yes | No | Sandbox → sales |
| **Salt Edge** (Partner Program) | Yes | "Sign the agreement"; uses Salt Edge's licence (FCA AISP) | n/p (a free plan with 100 live connections is claimed, unverified) | n/p ("$500/mo Growth" claimed, unverified) | n/p | Yes | Yes (EU 2,500+ banks) | "1 connection" claimed *(snippet)*, bank unnamed | Sign-up → demo → agreement |
| **Finexer** | Yes | Company (UK B2B focus) | "from £100/month" *(snippet)* | n/p | 90-day reconfirm (UK) | Yes (claims 99% of UK banks) | No evidence | No | Sales |
| **Moneyhub API** | Yes | Enterprise sales; FCA AISP | n/p | n/p | 90-day reconfirm (UK) | Yes | No evidence | No | Sales |
| **open-banking.io** (resells Enable Banking) | Yes | None for personal use; "resell or white-label" needs a written agreement | €3/mo per person for 1 account, +€1 per extra account, **paid by each tester** | Not permitted without an agreement | EB's | **Not in its bank list** | Yes: ABN AMRO, ING, Rabobank, bunq | No | Self-serve per person |
| **Finverse** (APAC) | Yes | Company likely; not stated | US$0.50/account/mo **plus an undisclosed monthly minimum** | same | n/p | No | No | **Yes, Maybank** (plus 8 other MY institutions) | Dashboard sign-up, free trial |
| **Brankas** | Yes | Enterprise | n/p | n/p | – | No | No | No live MY data product found | Sales |
| **Brick** (onebrick.io) | Yes | Business | n/p | n/p | – | No | No | No. Indonesia-first | Dashboard |

### Sources for the table

- Enable Banking: licence "Registered Account Information Service Provider regulated by
  Finnish Financial Supervisory Authority (FIN-FSA)", with 2,700+ banks in 30 European
  countries (https://enablebanking.com/). Pricing: "volume based ... number of accounts
  accessed", "There is a minimum invoicing per month which includes a certain amount of
  accounts and payments". Activation needs a signed contract plus "the KYB process for your
  company". Consent is 180 days "for the majority of ASPSPs"
  (https://enablebanking.com/docs/faq/). The quote form arrived in the March 2026
  changelog, which also added Barclays (GB)
  (https://enablebanking.com/blog/2026/04/08/enable-banking-changelogmarch-2026). The default
  consent moved from 90 to 180 days
  (https://enablebanking.com/blog/2025/11/05/enable-banking-changelog-october-2025).
  Revolut GB is integrated *(snippet)* (https://enablebanking.com/open-banking-apis/LT304580906).
  Dutch banks are listed at https://enablebanking.com/docs/markets/nl/, which also notes
  that ABN AMRO credit cards are out of PSD2 scope. The UK directory lists EB as "registered
  in Finland" and shows no FCA number
  (https://www.openbanking.org.uk/regulated-providers/enable-banking-oy/).
- GoCardless: "New signups for Bank Account Data are currently disabled"
  (https://bankaccountdata.gocardless.com/new-signups-disabled). Closed since July 2025,
  and the old free tier was 50 connections a month
  (https://actualbudget.org/docs/advanced/bank-sync/gocardless/, *snippet*).
- TrueLayer: FCA-authorised (https://truelayer.com/data/). Consent with `offline_access`
  lasts 90 days. Unregulated clients must name TrueLayer on the consent screen, and agents
  must show a regulatory disclosure (https://docs.truelayer.com/docs/collect-user-consent).
  The agent route takes "four to six weeks"
  (https://truelayer.com/blog/compliance-and-regulation/ais-to-register-or-not/). For
  unregulated non-agents, "KYB check on the business entity ... After signing the Joint
  Agreement" *(snippet from the Codat FAQ, which returned 403)*. A "Develop tier $0, 100
  Active Connected Accounts" and "Scale $261/mo" appear only in search snippets from
  third-party sites. **Not verified.**
- Yapily: to show data to UK customers, "your company must have first been approved ...
  by Yapily Connect Ltd and by the FCA and must appear on the FCA's register as Yapily
  Connect Ltd's agent". Agency is not needed if you show only name, account number and sort
  code *(snippet; page https://www.yapily.com/legal/compliance-and-regulatory-information
  rendered only partly)*. No prices are published (https://www.yapily.com/pricing).
- Plaid: "For customers based in the EU or UK ... only Custom plans are offered" *(snippet,
  https://support.plaid.com/hc/en-us/articles/16110502116887)*. The agent route needs the
  Scale plan and a commitment to your own registration later
  (https://plaid.com/blog/fca-registration-and-how-plaid-can-help/).
- Tink: €0.50/user/month Standard *(third-party snippet, e.g.
  https://www.xpay.sh/saas-pricing/tink/, not verified on tink.com)*. The agent model, or
  Tink offering the service directly under its End-User Terms *(snippet,
  https://tink.com/legal/faq/)*.
- Salt Edge: Partner Program with "No PSD2 licence? ... Go live in 15 minutes", and you
  "sign the agreement"
  (https://www.saltedge.com/products/account_information/partner_program). It holds an FCA
  AISP licence
  (https://www.retailbankerinternational.com/news/salt-edge-secures-aisp-licence-from-uks-fca/,
  *snippet*). The free, Growth and Malaysia figures are search snippets only.
- Finexer: "from £100 per month" *(snippet, https://www.capterra.com/p/10025923/Finexer/)*.
- Moneyhub: FCA AISP/PISP, enterprise sales *(snippet, https://moneyhub.com/products/data-aggregation/)*.
- open-banking.io: prices at https://open-banking.io/en. Banks: UK absent, NL present
  (https://open-banking.io/en/banks). Terms dated 17 Jul 2026 forbid resale or white-label
  without agreement (https://open-banking.io/en/terms).
- Finverse: "US$0.5 per connected account", a "transparent monthly minimum" (amount not
  shown), and Malaysia 9 institutions (https://www.finverse.com/bank-data-api,
  https://www.finverse.com/banks/maybank-malaysia).
- Malaysia open finance: no live consumer data sharing in 2026, with a phased rollout from
  2027 (https://fintechnews.my/60450/personal-finance-mgt-pfm/open-finance-malaysia-epf-savings-brankas-report/).
  From this I **infer**, without confirmation, that any Maybank feed today works by logging
  in with the customer's bank credentials, not through an official API.
- Brick: Indonesia-first *(snippet, https://docs.onebrick.io/introduction/what-is-brick)*.
  Brankas: Indonesia, Philippines, Vietnam *(snippet, https://blog.brankas.com/)*.

### Can a sole developer without a company use any of them?

- **Only through Restricted Production (Enable Banking), and only for his own accounts.**
  Every provider that serves other people asks for a contract and a KYB (business
  verification) check on a *company*. Examples: Enable Banking's FAQ ("KYB process for your
  company"), TrueLayer ("KYB check on the business entity") and Yapily ("your company
  must..."). None of them says a sole trader is refused. None says one is accepted either.
  **Ask Enable Banking directly.**
- **FCA AISP-agent route.** The regulations define an agent as "a person", so an individual
  is not excluded in law. But the principal must carry professional indemnity insurance
  that covers its agents, and it takes on responsibility for them
  (https://www.fca.org.uk/firms/agency-models-under-psd2). In practice TrueLayer's agent
  process asks for KYB, fit-and-proper checks, systems and controls, policy documents, and
  PII and cyber insurance *(snippet from the Codat FAQ)*. That is a company-shaped process.
  Timeline: FCA review of an agent registration can take "up to two months"
  (https://plaid.com/blog/fca-registration-and-how-plaid-can-help/).
- **Using the provider's licence without being an agent.** The FCA says a business that
  "does not provide AIS to that consumer" does not need registration
  (https://www.fca.org.uk/firms/agency-models-under-psd2). A personal finance app shows
  people their combined account data, which is the core of AIS. So for UK users the safe
  reading is **agent or equivalent arrangement required**. TrueLayer's "Joint Agreement"
  for unregulated clients, where TrueLayer is named on the consent screen, is the one
  documented path that looks like it avoids agency. Confirm this in writing.
- **Your own AISP registration:** 6-12 months, plus eIDAS certificates and legal fees. Not
  realistic now (https://truelayer.com/blog/compliance-and-regulation/ais-to-register-or-not/).

### The 90 / 180 day question

- **EU (NL):** consent lasts up to 180 days at most banks. After that the user
  re-authenticates at the bank (https://enablebanking.com/docs/faq/).
- **UK:** since the FCA's SCA-RTS change (in force 26 Mar 2022, widely adopted by 30 Sep
  2022), the user no longer re-authenticates at the bank every 90 days. Instead the AISP
  must get the user to **reconfirm consent with it at least every 90 days**, and that can
  be done in the app
  (https://www.openbanking.org.uk/news/fca-publishes-changes-to-90-day-reauthentication-rules/,
  https://docs.yapily.com/data/financial-data-resources/uk-data-consent-changes).
  **How Enable Banking exposes this for GB banks is not documented publicly.** The GB market
  page returned 404. Plan a "Keep sharing?" screen every 90 days for UK connections, then
  confirm whether Enable Banking needs an API call for it.

---

## 3. The pick

**Enable Banking, full production, one contract covering GB and NL.**

Why this one, and not TrueLayer or Yapily:

1. **The code exists.** It has JWT signing, consent start, callback, session exchange,
   account listing with balances, paginated transactions, the per-bank upsert fix
   (`ceb28ad`) and encrypted credential storage. TrueLayer or Yapily would mean a new
   adapter, new consent routes, and new tests.
2. **It can be finished before the contract exists.** Thomas can register a production app
   now, link his own accounts in restricted mode, and run the real API end to end. When the
   contract is signed, the same application moves from restricted to full production
   (https://enablebanking.com/docs/api/linked-accounts/). No other provider offers real data
   before paying.
3. **It covers both countries in one API.** NL is well covered. UK has at least Barclays
   and Revolut named, and Monzo is reported by Actual Budget users *(snippet)*.
4. **Consent lasts 180 days in the EU**, against 90 days of reconfirmation on UK-only
   providers.

**Fallback: TrueLayer**, triggered by any one of these:
- (a) Enable Banking says UK end users need Numeris to be an FCA agent and will not
  arrange it.
- (b) Its monthly minimum is out of reach.
- (c) It will not contract with an individual, and Thomas does not want to form a company.
  Note that TrueLayer also does KYB on "the business entity", so (c) may not be solved by
  TrueLayer either.

With TrueLayer, the UK goes through it. NL stays on Enable Banking only if Enable Banking
will contract for NL alone. The work would be a second adapter behind the same
`ProviderAdapter` interface.

**Not recommended now:**
- Plaid: sales-only for the UK and EU, and the agent route needs a later licence.
- Yapily, Tink, Moneyhub, Finexer: sales-led with no price anchor, and the same company
  and agent requirements, with no code already written.
- GoCardless: closed.
- open-banking.io: no UK coverage, each tester would pay, and it forbids resale.
- Finverse, for now: Malaysia only, a second contract, and a minimum that is not published.

---

## 4. Costs

### Provider fee (Enable Banking)

**Not known.** Published facts: charged per connected account per month, with a monthly
minimum invoice that includes a set number of accounts (https://enablebanking.com/docs/faq/).
No figure is public (quote form since April 2026). A vendor blog claims "€0.05–€0.15 per
call" (https://dev.to/johnfrandsen/five-ways-to-access-european-bank-data-in-2026-and-what-each-actually-costs-130d).
That contradicts EB's own FAQ, which bills per account rather than per call, and it comes
from a competitor, so I discarded it.

How to read the quote when it arrives:
monthly fee = max(minimum invoice, connected accounts × per-account price).
- 20 users ≈ 40 accounts. **Almost certainly the minimum invoice alone.**
- 1,000 users ≈ 2,000 accounts. The per-account price dominates.

For scale only, these are other per-account prices in this market. **None of them is
Enable Banking's price.**
- Tink Standard: €0.50 per user per month (third-party claim).
- Finverse: US$0.50 per account per month (published).
- finAPI: €60 a month flat for up to 200 users, but it needs your own licence
  (https://www.finapi.io/en/prices/).

If Enable Banking came in near those, 1,000 users would cost roughly €500-1,000 a month.
**That is an illustration, not a quote.**

### Fixed costs, if a company is needed

| Item | Cost | Source |
| --- | --- | --- |
| UK private limited company, online incorporation | £100 once (from 1 Feb 2026) | https://www.1stformations.co.uk/blog/companies-house-filing-fees-increase/ *(snippet)* |
| Confirmation statement | £50/year | same *(snippet)* |
| ICO data protection fee, tier 1 micro | £40/year | https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/ *(snippet)* |
| Render, Neon, cron-job.org | unchanged (existing) | `CLAUDE.md` |

The ICO fee probably applies whether or not there is a company, because Numeris processes
other people's financial data. Confirm with the ICO's self-assessment.

---

## 5. What Thomas must do (only he can)

1. **Register the production application in restricted mode now.** Sign in at
   enablebanking.com, create a Production app with an RSA key, set the redirect URL to the
   API's `/api/connections/enable-banking/callback`, and link his own Wise, Revolut or UK
   bank accounts. Put `ENABLE_BANKING_APP_ID` and the private key into Render's environment.
   It is free, needs no company, and unblocks the build.
2. **Fill in the "Get a Quote" form**, reached from the Enable Banking site. Say:
   - countries GB and NL;
   - about 40 accounts now and about 2,000 in 12-18 months;
   - no payments;
   - no own licence (use Enable Banking's).
3. **Ask these questions in writing** (email to info@enablebanking.com or sales@, as the FAQ
   says). The answers decide pick versus fallback:
   1. Can you contract with an individual or sole trader, or must it be a registered company?
   2. What is the minimum monthly invoice, and how many accounts does it include?
   3. For UK end users, do you act as the AISP towards them directly? Does Numeris need to
      be registered with the FCA as your agent?
   4. For GB banks, how is the 90-day consent reconfirmation handled?
   5. Is `identification_hash` stable across re-consents? (This decides whether reconnecting
      duplicates accounts; see round 1, gap 16.)
4. **If a company is required:** incorporate a UK Ltd online (£100), complete Companies
   House identity verification as director, and open a business bank account if Enable
   Banking's billing needs one. Also check that running a company fits his own
   circumstances, including any visa conditions. I do not know his status: **TODO, Thomas
   to confirm.**
5. **Sign the contract and complete KYB.** Expect company documents, director ID, and
   possibly a description of the data flow.
6. **Publish a privacy policy, terms of service and a data-protection contact email.**
   Enable Banking requires all three before full activation (https://enablebanking.com/docs/faq/).
   `docs/PRIVACY.md` and `docs/TERMS.md` exist in the repo. They need checking against the
   bank-data use, and it must be clear who the regulated provider is.
7. **Pay the ICO fee** (£40) and the monthly invoice.

---

## 6. What the code needs

### Reusable as-is

About the whole server-side consent-and-fetch layer:
- `artifacts/api-server/src/adapters/enable-banking.ts`: JWT signing, `startAuth`,
  `exchangeCodeForSession`, `getSession`, `listAccounts`, `fetchTransactionsSince`.
- `artifacts/api-server/src/routes/enable-banking.ts`: start and callback routes, and the
  upsert keyed by bank (`ceb28ad`).
- `lib/connection-sync.ts`, `routes/connections.ts` (`/connections/:id/sync`), credential
  encryption, and the adapter registry.

Roughly: **the plumbing that talks to Enable Banking is done. Everything a user touches, and
everything that runs without a user, is not.** Line references are in round 1 (`capture.md`
section 1). The build steps below follow its gap numbers.

### Build steps, in order

1. **Persist pending consents** in a table instead of the in-memory `Map`, so a Render
   restart mid-consent does not break it (gap 17). Size S.
2. **Bank picker.** Server route caching `GET /aspsps` per country (GB, NL). UI: country,
   then bank, then "Connect at your bank". Handle the `?created=` return on both desktop
   (`pages/settings-connections.tsx`) and phone (gap 2). Size M. The home rule in CLAUDE.md
   applies: this is a section inside the existing Connections settings, not a new route.
3. **Sync by itself.** An authenticated `/internal/sync-all` hit by cron-job.org, which is
   already used for keep-alive, 2-4 times a day. Add a throttled sync when the app comes
   to the foreground. Use an incremental window of last sync minus 7 days (gap 3). Size M.
4. **Pending versus booked.** Read the transaction status, store it, render pending rows
   dotted, reconcile them when they book, and drop pending rows that never book (gap 5).
   Size M.
5. **Dedup and account identity.** Build the fallback id from a content hash plus an ordinal
   (gap 6). Upsert accounts on `identification_hash` once the answer to question 3.5 arrives
   (gap 16). Add a page cap on pagination. Size S.
6. **Categorise on import.** Run `normalizeMerchant`, then user rules, then AI in sync.
   Add a `userModified` flag so re-sync never overwrites the user's edits (gap 7). Size S-M.
7. **Transfers.** Pair equal and opposite rows across the user's own accounts (gap 8). Size M.
8. **Consent lifecycle.** Read `validUntil`. Show a banner 7 days out and a one-tap
   Reconnect where staleness shows. For UK connections, add an in-app "Keep sharing?"
   reconfirm every 90 days, done the way Enable Banking specifies. Keep a "reconnect"
   status separate from "error" (gap 4). Size S-M.
9. **Revoke on account deletion.** Call Enable Banking's session delete when a user deletes
   their Numeris account (BACKLOG M10). Size S.
10. **FX snapshot on synced rows** (gap 18). Size S.
11. **Consent-screen wording.** Name Enable Banking as the regulated provider, and add the
    agent disclosure in the footer if question 3.3 says agency is required.

Steps 1-10 can all be built and tested **now**, against Thomas's own accounts in restricted
mode. Round 1 estimated 3-4 weeks for this list.

---

## 7. "Testers open when bank data arrives by itself", in plain words

The phrase means: **do not invite testers until connecting a bank is a one-time action and
their spending then shows up without them doing anything.** If testers arrive earlier, they
have to type transactions or upload CSVs. You ruled that out, and it would teach them the
app is a chore. So the invite date is set by two things: the contract being signed, and
build steps 1-8 being finished. It is not set by the app looking ready.

What a tester actually experiences, once it is open:

- **Day 1, about two minutes.** The tester signs up and opens Settings, then Connections. They tap
  **Connect a bank**, pick "United Kingdom", then "Monzo". Numeris sends them to Monzo's own
  app, where they approve sharing. That approval is Monzo's screen, not ours, and it names
  Enable Banking. They land back in Numeris. Within about a minute their Monzo account
  appears with its balance and roughly the last 90 days of transactions, already sorted
  into categories. They have typed nothing except their Numeris sign-up.
- **Day 2, zero effort.** Overnight and again during the day, the server fetched their new
  transactions on its own. They buy a coffee at 9:00. When they open Numeris at lunch the
  coffee is there. It may show as **dotted** (pending) until the bank settles it, then it
  turns solid. They did not press Sync. If they moved £50 from Monzo to their Wise account, it
  shows once as a transfer, not as £50 spent plus £50 earned.
- **Days 3-89.** The same thing, every day. The only reason to open Connections is to add
  another bank.
- **Day 90, UK only, about five seconds.** Numeris shows "Keep sharing your Monzo data with
  Numeris?" with one button. They tap it. No bank login is needed. This is the UK rule
  since 2022. A Dutch tester with ING does not see this at day 90.
- **About day 173 (7 days before the bank consent ends, usually at 180 days).** A banner
  says "Your ING connection ends in 7 days - Reconnect". Tapping it repeats the Day 1 bank
  approval, about 30 seconds. If they ignore it, their data stops updating on day 180, and
  the app says so plainly rather than silently showing stale numbers.

Maybank is **not** in this experience. Malaysian accounts stay manual (CSV, or the
email-alert route from round 1, gap 11) until a Malaysian route is chosen separately.

---

## 8. URLs that failed to load

| URL | Result |
| --- | --- |
| https://enablebanking.com/pricing | 404 |
| https://enablebanking.com/apply-now | 404 (the site's "Get started" target) |
| https://enablebanking.com/docs/markets/gb/ | 404 (the NL page exists) |
| https://api.enablebanking.com/aspsps?country=GB | 401 (needs an app JWT, as expected) |
| https://enablebanking.com/open-banking-apis/LT304580906 | Loaded, but empty (client-rendered) |
| https://www.openbankingtracker.com/guides/free-open-banking-apis | 429 |
| https://www.openbankingtracker.com/enablebanking | 429 |
| https://www.openbankingtracker.com/api-aggregators/salt-edge | 429 |
| https://www.openbankingtracker.com/api-aggregators/open-banking-io | 429 |
| https://www.saltedge.com/pricing | 404 |
| https://www.saltedge.com/products/account_information/coverage | Loaded, no per-country data |
| https://www.f6s.com/software/salt-edge | Bot wall |
| https://www.g2.com/products/enable-banking/pricing | 403 |
| https://support.truelayer.com/hc/en-us/articles/4419320680465 | 403 |
| https://codat.zendesk.com/hc/en-gb/articles/360016733257-TrueLayer-Onboarding-FAQ | 403 |
| https://omr.com/en/reviews/product/truelayer/pricing | Loaded, no prices (last updated 2022) |
| https://www.yapily.com/legal/compliance-and-regulatory-information | Loaded only partly |
| https://docs.yapily.com/tools-and-services/yapily-connect/overview | Loaded, no agency rules |

Not checked live: the FCA Financial Services Register entry, if any, for Enable Banking Oy.
The register is client-rendered and search engines returned no FRN.
