# I2 answer sheet: every open marker in PRIVACY and TERMS

Written 2026-10-04 for one sitting. **This is not legal advice.** It sorts what
the code, the docs, the hosts' public terms and the vault already answer from
what only Thomas can decide. Where a lawyer's view would matter, the item says
so.

Neither `docs/PRIVACY.md` nor `docs/TERMS.md` was edited. Line numbers are as
of `865df33`.

## The count, measured

`rg -o '\[TO CONFIRM'` and `rg -o '\[BLOCKED'`, then the legend lines removed
by reading them:

| File | `[TO CONFIRM` raw | legend | **open** | `[BLOCKED` raw | legend | **open** |
| --- | --- | --- | --- | --- | --- | --- |
| PRIVACY.md | 22 | 1 (line 9) | **21** | 8 | 2 (lines 10, 11) | **6** |
| TERMS.md | 12 | 1 (line 5) | **11** | 0 | — | 0 |

The 3 Oct figure "21 + 8 + 12" counted the legend lines. Since then the
push-and-deploy task (`865df33`) removed two `[BLOCKED]` statements (no AI
switch, §5.3 and §8) and added one `[TO CONFIRM: support address]` (§9). So
**38 open markers**: 21 + 6 in PRIVACY, 11 in TERMS. `DATA-INVENTORY.md:24`
carries one more (name, postal and contact address) and is answered by the same
item as PRIVACY §1.

Of the 38, **11 collapse into the numbered questions at the end**. The rest are
already answered by a source, or are build work rather than questions.

## What the 4 Oct answers and the push-and-deploy task already settled

| Marker | Status | Source |
| --- | --- | --- |
| AI on/off (old BLOCKED, PRIVACY §5.3 and §8) | **Settled and removed.** Opt-in, off by default, switch in Settings → AI Coach | I7, `9a12b84`, `92ef685`; text fixed in `865df33` |
| PRIVACY:107, the AI basis "contract or consent" | **Settled: consent.** The marker text is now stale, because it still says consent "cannot be the basis today" | Thomas 3 Oct (BACKLOG I7); `api-server/src/lib/ai-consent.ts:21` |
| TERMS:60, "whether the AI features stay on by default" | **Settled: off by default.** TERMS still says "available to every signed-in user with no opt-in", which is stale, and its source row at TERMS:140 is stale too | as above |
| PRIVACY:291, I9 non-user route | **Process settled** (an email address, handled by hand). **The address is still open**: see Q2 | Settled.md 4 Oct 00:25; BACKLOG I9 |
| PRIVACY:264, BLOCKED dev DB copy (I10) | **Decided** (seed-only data) but **not done**. The marker stays until Thomas runs the Neon reset | `.review/archive/2026-10-04T0035-push-and-deploy-for-testers.report.md` §3 |
| PRIVACY:166, BLOCKED Vercel Hobby (I11) | **Decided** 3 Oct: a free Render static site. **Not cut over.** The push confirmed that Vercel still serves numeris.page and `vercel.json` still proxies `/api` | BACKLOG I11; `render.yaml:100`; `artifacts/finance-tracker/vercel.json:6-9` |

Settled earlier, on 24 Sep, and then not carried into the drafts. Thomas
answered "Accept all" to: "Accept the recommended privacy-policy answers: 18+,
England and Wales law, the Ltd as controller?" (vault
`Efforts/Master-Plan/receipt.json` id `a-bdac0f`, from question bank
`numeris-privacy-facts`). That answers three markers outright: minimum age,
governing law, and the lawful-basis table as proposed in
`Efforts/Numeris-Decisions.md` brief 9. It leaves one gap. **No company exists
yet as far as the vault records it.** `Efforts/Life-Admin.md:24` lists "Start
the company" as `open`, and `Atlas/Settled.md` (26 Sep) says "No company or KYB
for now". Q1 covers that gap.

---

## A. Identity and contact

### A1 · Who the controller is: PRIVACY:24, TERMS:13, DATA-INVENTORY:24
*Asked:* whose legal name goes on the policy as the person responsible.
*Already settled:* the Ltd, once it exists (24 Sep, above). It does not exist
yet. Until it does, the controller is Thomas as an individual. PRIVACY §1
already says "run by one person, not a company".
*Open:* his **full legal name exactly as on his passport**. The vault has no
legal-name row in `Atlas/Verified-Claims.md`. His Imperial ID `tkv25` suggests
a middle initial, but that is not a source, so the name is not guessed here.
→ **Q1.**

### A2 · Postal address: PRIVACY:25, TERMS:14
*Asked:* whether the policy must print a postal address.
*What the sources say:*
- UK GDPR Art 13(1)(a) requires "the identity and the contact details of the
  controller". The ICO asks only "Say who you are and how individuals can
  contact you" and names no postal address
  ([ICO, what privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/)).
  An email address meets that text.
- The E-Commerce Regulations 2002, reg 6(1)(b), require "the geographic address
  at which the service provider is established" from providers of
  "information society services", defined as services "normally provided for
  remuneration" ([reg 2](https://www.legislation.gov.uk/uksi/2002/2013/regulation/2),
  [reg 6](https://www.legislation.gov.uk/uksi/2002/2013/regulation/6)).
  "Normally" tests the type of service, not whether this one is paid, so a free
  app is **not clearly outside it**. **A lawyer's view matters here**, and only
  for the period while Numeris runs as an individual.
- **Once the Ltd exists, an address is mandatory but it need not be his home.**
  A company's website must show its registered number and "the address of the
  company's registered office"
  ([SI 2015/17 reg 25](https://www.legislation.gov.uk/uksi/2015/17/regulation/25)).
  A formation agent's registered-office service is allowed; a PO Box is not
  ([Companies House blog](https://companieshouse.blog.gov.uk/2021/10/05/how-to-choose-or-change-your-companys-registered-office-address/)).
- On the app stores, Apple publishes an address only for EU "traders", and lists
  "Hobbyist who developed an app with no commercialization intent" as unlikely
  to be one ([Apple DSA](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)).
  Google shows a full address only for accounts that monetise
  ([Play help](https://support.google.com/googleplay/android-developer/answer/13634081)).
*Recommendation:* **no postal address while Numeris is an individual's free
tester app. Never his home address.** When the Ltd forms, use a formation
agent's registered-office address (roughly £20–£50 a year). Paying for that is
a money call that belongs with the company decision, not with this sheet.
→ **Q3** (accept the reasoning).

### A3 · Contact address: PRIVACY:26, :218, :291; TERMS:15
Four markers ask for the same thing. No address exists anywhere in the repo:
the 4 Oct task searched for `support@|hello@|contact@|@numeris.page`, and this
task re-checked with `rg '[a-z]+@(numeris\.page|financetracker\.work)'`.
`numeris.page` is his domain, on Cloudflare (`Atlas/Settled.md`, 19 Sep).
*Options:*
- **a. `privacy@numeris.page`, forwarded by Cloudflare Email Routing (free) to
  his own inbox, used in all four places. Recommended.** It costs nothing. It
  says what the address is for, so rights requests are easy to find. It never
  shows his personal Gmail.
- b. Two addresses, `privacy@` for rights requests and `support@` for
  everything else. Cleaner later, but one person reads both today.
- c. His personal Gmail. Free and immediate, but it publishes his personal
  address.

Setting up the forward means adding MX and TXT records in Cloudflare, which is
his account. → **Q2.**

### A4 · UK or EU representative: PRIVACY:28
*Asked:* whether a representative must be appointed, which depends on where the
operator is "established".
*Facts:* Thomas is a Dutch national, resident in Penang on MM2H, studying in
London in term time (`Atlas/Verified-Claims.md`, Nationality section). The
planned Ltd is a UK company.
*What the sources say:* a controller outside the EU that offers services to
people in the EU needs an EU representative (GDPR Art 27). The exception is
processing that is "occasional … and is unlikely to result in a risk"
([Art 27](https://www.legislation.gov.uk/eur/2016/679/article/27);
[ICO, EU representatives](https://ico.org.uk/for-organisations/data-protection-and-the-eu/)).
A finance app that keeps accounts continuously is probably not "occasional".
*Reading:* if Numeris is treated as established in the UK, which a UK Ltd
settles, then no UK representative is needed. An **EU representative probably
is** needed while the app is offered to EU users. Paid representative services
exist (money). **This is the item where a lawyer's view matters most,** because
an individual with homes in two countries, neither of them in the EU, is
exactly the hard case.
*Options:*
- **a. Offer the tester round to the UK only. Drop "and the European Union"
  from PRIVACY:33 and TERMS:19 until the Ltd exists and the EU question has a
  lawyer's answer. Recommended:** no cost, and nothing is promised that is not
  in place.
- b. Keep the EU and appoint a paid EU representative.
- c. Keep the EU and rely on the "occasional" exemption (not recommended).
→ **Q4.**

### A5 · Lead authority: PRIVACY:277
*Settled by the A4 reading:* the **ICO**. A UK-established controller with no
EU establishment has no EU lead authority. The one-stop-shop needs an EU
establishment. If Q4 goes to (b), EU users still complain to their own
authority, which PRIVACY:276 already says.
*Adjacent, and not a marker:* the ICO data protection fee. Tier 1 is £52. The
exemptions include "Not-for-profit purposes" and "Personal, family or household
affairs" ([ICO fee](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/),
[exemptions](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/exemptions/)).
Whether a free app run by an individual qualifies is not clear. The ICO's
self-assessment answers it in five minutes. → **Q5** (money).

---

## B. Lawful bases

### B1 · The whole table: PRIVACY:98
*Settled 24 Sep* ("Accept all" on brief 9): **contract** for the core service;
**consent** for anything sent to an AI provider; **legitimate interests** for
security logs, rate limits, performance records and server logs. The proposed
table at PRIVACY:101-109 already matches, except for the two rows below.

### B2 · The AI row: PRIVACY:107
*Settled: consent* (I7). The marker text should be replaced by "Consent
(section 5.3)". No question.

### B3 · People recorded by a user: PRIVACY:109
*Asked:* the lawful basis for a user typing someone else's name and email, and
who is responsible for it.
*Reading:* the user's own record-keeping may fall under the household exemption,
but Numeris storing it does not. Numeris is the controller of what it stores.
The usual basis is **legitimate interests**: the user's interest in tracking
who owes what, balanced by keeping only name, optional email, amount and notes,
plus the I9 route for the person named. TERMS §6 already tells users to record
only what they need.
*Recommendation:* legitimate interests, with Numeris as controller. Splitwise is
the comparable, and is reported in `Numeris-Decisions` brief 9 as "memory,
unverified". A lawyer should confirm this one too. → **Q6.**

---

## C. Processors and transfers

### C1 · Groq Zero Data Retention: PRIVACY:134
*What Groq says:* by default it does not retain inference data, but may keep
logs for up to 30 days for reliability and abuse checks. "All customers may
enable Zero Data Retention (ZDR)" in Data Controls
([Groq, your data](https://console.groq.com/docs/your-data)). It is a setting
in his Groq console, which this session cannot see.
*Recommendation:* switch ZDR on, then the line reads "Zero Data Retention is
on". → **Q7.**

### C2 · Cerebras: PRIVACY:137, BLOCKED (I13)
*What Cerebras says:* "If you use the Services in a personal capacity …
provisions applicable solely to business entities (e.g., … data processing
agreement …) do not apply. Cerebras will process your personal data as an
independent controller" (Cerebras Inference Terms, fetched 4 Oct). So the
blocker is real.
*Additional fact:* Cerebras is not serving at all. The vault's hot.md (3 Oct
02:30) records "Cerebras fallback still 402 payment_required".
*Options:*
- **a. Take Cerebras out of the AI chain and the policy. Recommended.** It is
  answering nothing today, and removing it deletes the blocker.
- b. Keep it and wait for the Ltd. Its DPA then applies, but nothing is gained
  while it returns 402.

This is a technical call and is taken here as (a), to be built as I13 rather
than asked. It is listed in the questions only so he can overrule it.

### C3 · Transfer mechanism: PRIVACY:146
*Settled by the hosts' terms; no question.*
- Groq: SCCs plus the UK International Data Transfer Addendum, DPA §8.3, part
  of the Services Agreement ([Groq DPA](https://console.groq.com/docs/legal/customer-data-processing-addendum)).
- Render: the Data Privacy Framework, or the SCCs or UK SCCs where the
  framework does not apply, DPA §6.2, binding through the ToS
  ([Render DPA](https://render.com/dpa)).
- Resend: EU SCCs, UK SCCs, and the DPF with its UK Extension
  ([Resend DPA](https://resend.com/legal/dpa)).

PRIVACY:167 and :169 already say this.

### C4 · Neon DPA on the Free plan: PRIVACY:168
*What Neon says:* the DPA "forms an integral part of the Agreement", but is
"effective … as of the date it is executed by the last signing Party", and does
not say whether it covers the Free plan
([Neon DPA](https://neon.com/pdf/DPA.pdf)). Transfers rely on the DPF, with SCCs
and the UK Addendum as fallback. The data stays in London (eu-west-2) anyway.
*Recommendation:* one email to Neon support asking "does your DPA apply to
Free-plan customers, and do I need to sign it?" Only he can send it. → **Q8.**

### C5 · Vercel: PRIVACY:166, BLOCKED (I11)
*Confirmed:* "This Addendum applies … for Customers who are on Enterprise and
Pro plans" ([Vercel DPA](https://vercel.com/legal/dpa)), and "Hobby teams are
restricted to non-commercial personal use only"
([fair use](https://vercel.com/docs/limits/fair-use-guidelines)).
*Already decided* (3 Oct): move to a free Render static site. The remaining
steps are his: create the `numeris-web` service, then point numeris.page DNS
at it. After that, delete `vercel.json` and rewrite this row. No new question;
the blocker clears when the cutover lands.

### C6 · Google Fonts: PRIVACY:194 (I12)
*Confirmed:* LG München I, 20 Jan 2022, 3 O 17493/20, ordered a site operator
to stop passing visitors' IP addresses to Google through embedded Fonts without
consent, and noted that the fonts can be self-hosted
([gesetze-bayern.de](https://www.gesetze-bayern.de/Content/Document/Y-300-Z-BECKRS-B-2022-N-612)).
The app still loads them from Google in `artifacts/finance-tracker/index.html:22-24`.
*Recommendation:* self-host the three families (JetBrains Mono, Space Grotesk,
IBM Plex Sans) and delete the row. This is a build task, not a question.

---

## D. Retention

### D1 · Database backups: PRIVACY:208, :254
*Confirmed:* Neon Free has a "6-hour limit" on restore history
([Neon plans](https://neon.com/docs/introduction/plans)). CLAUDE.md says the
database is on the Neon free tier.
*Recommendation:* write "6 hours" in both places. That is only right if he is
still on Free, which he can see in the Neon console, so it is folded into
**Q8**.

### D2 · Inactive accounts: PRIVACY:211
*Asked:* whether accounts nobody uses are ever deleted. None are today.
*Options:*
- a. **No limit for the tester round; set one before public signup.
  Recommended:** testers are known people, and an automatic deletion job is
  build work with its own risk.
- b. Delete after 24 months without a sign-in, with an email warning 30 days
  before.
- c. Never, stated plainly.

UK GDPR's storage-limitation principle argues against (c) at public launch.
→ **Q9.**

### D3 · Dev database copy: PRIVACY:264, BLOCKED (I10)
Decided on 4 Oct: seed-only data. The commands are in the push-and-deploy
report. The blocker clears when he runs them. No question.

---

## E. Rights

### E1 · One-month response: PRIVACY:219
*This is the law, not a choice:* "at the latest within one month of receipt",
extendable by two months if a request is complex
([ICO, responding to a SAR](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/)).
The sentence can state it as a fact. No question.

### E2 · Email change: PRIVACY:240, BLOCKED (I6)
Build work. `rg -i 'changeEmail|change-email|updateEmail'` over `artifacts` and
`lib` finds nothing. No question.

### E3 · Dead unsubscribe link: PRIVACY:272, BLOCKED (I8)
Build work. The link is `href="#"` at `artifacts/api-server/src/routes/digest.ts:78`.
No question.

### E4 · Breach process: PRIVACY:335, BLOCKED (I4)
Build work: a runbook in `docs/`. The rule is "without undue delay, but not
later than 72 hours after becoming aware of it"
([ICO, breaches](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/)).
The only thing it needs from him is to be named as the person who decides and
reports, which A1 already gives. No question.

---

## F. Minors, changes, and the rest of TERMS

### F1 · Minimum age: PRIVACY:340, TERMS:78
*Settled 24 Sep: 18.* Context: the UK digital age of consent is 13 (UK GDPR Art 8), and
the Children's Code applies to services "likely to be accessed by" under-18s
([ICO, ISS and consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr-old/what-are-the-rules-about-an-iss-and-consent/);
[Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/about-this-code/)).
An 18+ rule keeps Numeris away from both.
*Open, but build work:* nothing checks age. Recommend an "I am 18 or over" box
inside the I16 sign-up consent. I16 is NOW, and `auth-gate.tsx` has zero
mentions of "privacy" or "terms" today.

### F2 · Telling users about changes: PRIVACY:344, TERMS:109
*Recommendation:* email every user at least **30 days** before a change that
reduces their rights or adds a new recipient of their data. Other changes take
effect when published, with the date at the top. → **Q10.**

### F3 · Publication date: PRIVACY:346
Filled in on the day it is published. No question.

### F4 · AI default: TERMS:60
*Settled* (I7, above). The TERMS text needs correcting.

### F5 · More acceptable-use rules: TERMS:98
*Recommendation:* add three. Do not use Numeris for anything unlawful. Do not
scrape it or load it automatically. Do not record more about another person
than tracking the money needs (this repeats §6). Technical call, taken; listed
in Q11 to overrule.

### F6 · Shutdown notice: TERMS:106
*Recommendation:* at least **30 days**' notice by email, with a reminder to use
Settings → Export & Backup. Grouped with **Q10.**

### F7 · Limitation of liability: TERMS:117
**Needs a lawyer.** UK consumer law restricts what a business can exclude, and
§9 already says consumer rights are not taken away. Nothing to answer in this
sitting. Leave it marked until someone qualified has read it, as TERMS:5-7
already requires.

### F8 · Governing law: TERMS:120
*Settled 24 Sep: England and Wales.* A consumer elsewhere in the UK or in the
EU keeps the protections of where they live, and §9 already says so.

### F9 · App Store and Play licence: TERMS:122
*Recommendation:* Apple's standard EULA applies, with these terms on top. Play
has no default licence, so these terms apply alone. It matters only at Phase 6,
when there is a store build. Technical call, taken.

---

## Questions only Thomas can answer

The recommended answer is filled in for each. Accept it, or write a different
one.

1. **Your full legal name, exactly as on your passport, for the controller line
   until the Ltd exists?** → `TODO: name` (no default: the vault does not hold
   it)
2. **Contact address for PRIVACY §1, §8, §9 and TERMS §1?** →
   `privacy@numeris.page`, forwarded to your inbox by Cloudflare Email Routing,
   which you set up in your Cloudflare account.
3. **No postal address while Numeris is your individual free app, and a
   formation agent's registered-office address once the Ltd exists, never
   your home?** → Yes.
4. **Testers in the UK only for now, dropping "and the European Union" until a
   lawyer has answered the EU-representative question?** → Yes.
5. **Run the ICO data-protection-fee self-assessment, and pay £52 if it says
   you owe it?** → Yes, run it this week.
6. **People recorded in debts and splits: legitimate interests as the basis,
   with Numeris as controller?** → Yes, flagged for a lawyer to confirm.
7. **Switch on Zero Data Retention in the Groq console (Data Controls)?** →
   Yes.
8. **Confirm Neon is still on the Free plan (6-hour restore window), and email
   Neon support to ask whether its DPA covers Free-plan customers?** → Yes to
   both.
9. **Inactive accounts: no limit during the tester round, a limit decided
   before public signup?** → Yes.
10. **Changes and shutdown: at least 30 days' notice by email for any change
    that cuts your users' rights or adds a recipient, and for a shutdown, with
    an export reminder?** → Yes.
11. **Overrule any technical call taken here?** Cerebras removed from the AI
    chain (C2); Google Fonts self-hosted (C6); three acceptable-use rules
    (F5); Apple EULA plus these terms (F9). → No.

Not in this list because a lawyer has to answer them: limitation of liability
(F7), the EU representative (A4), and confirming the basis in Q6.

## Two things found while checking

- **TERMS still says AI is on by default** (TERMS:60 and its source row :140),
  although I7 made it opt-in. PRIVACY was fixed in `865df33`; TERMS was not.
- **The weekly digest is sent from `digest@numeris.app`**
  (`artifacts/api-server/src/routes/digest.ts:156`). That is a domain nobody
  here owns: Numeris's domain is `numeris.page`. Resend rejects a sender
  domain that has not been verified, so the digest probably cannot send.
  Delivery was not tested in this session.
