# Numeris — Privacy policy

> **DRAFT FOR REVIEW. NOT LEGAL ADVICE.** Written by someone who is not a
> lawyer, from the code as it stood at `45d284b` on 2026-09-11. It describes
> what the code does, not what it should do.
>
> Two kinds of marker:
>
> - `[TO CONFIRM: …]` — a fact or decision nobody has supplied yet.
> - `[BLOCKED: …]` — a statement the policy has to make but cannot make
>   truthfully until the code changes. **This draft cannot be published while
>   any `[BLOCKED]` marker remains.**
>
> Every statement is traceable to `docs/DATA-INVENTORY.md`, which cites the
> source files.

---

## 1. Who is responsible for your data

Numeris is run by one person, not a company. That person decides what happens to
your data and is responsible for it.

- Name: `[TO CONFIRM: full legal name]`
- Postal address: `[TO CONFIRM]`
- Contact for anything in this policy: `[TO CONFIRM: address on
  financetracker.work]`
- `[TO CONFIRM: whether a UK or EU representative is needed, which depends on
  where the operator is established.]`

Numeris is on the web at financetracker.work and is intended for the App Store
and Google Play. It is built for people in the UK and the European Union.

## 2. The short version

- **What you put in is stored** on a database in London, and processed by
  servers run by US companies.
- **Some features send parts of your financial position to US AI companies.**
  The chat and page insights send a summary: net worth, cash, what you hold in
  each currency, bills due in the next 30 days, budgets and goals. Automatic
  categories send your transaction descriptions and amounts. Receipt features
  send the photo, and for bill splitting, the names of the people you are
  splitting with. Section 5 has the detail.
- **There is no advertising, and no analytics or tracking tool** in the web or
  phone app.
- **You can delete your account.** Some things survive it; section 8 lists them.
- **You can download everything your account holds**, less the credentials
  that would let someone act as you; section 8 lists what is left out.

## 3. What Numeris holds

**About you**

- your name, email address and profile picture;
- your password, stored as a hash, or a sign-in link with Google, Apple or
  GitHub;
- passkeys and two-factor settings;
- for each signed-in session: your IP address, your browser or device
  description, and when it expires.

**Your money**

- accounts with their names, types, balances and currencies — for a connected
  bank account with no name, the IBAN is used as the name;
- transactions: date, description, category, amount. Transactions imported from
  a bank carry the other party's name or the payment reference;
- bills and income due, subscriptions, investments (ticker, shares, cost),
  budgets, and goals with any photo you add;
- a monthly snapshot of your net worth by type, updated whenever you open the
  dashboard, and a daily snapshot of each account's balance, taken when you open
  the dashboard or change a balance;
- notes, tags and other entries you make in features such as family budgets,
  tax records, pensions and mortgages.

**About other people** — section 9.

**For connected services** — the token or key you give Numeris for Wise, Kraken
or Alpaca, and the session for a bank connection, all **encrypted** before they
are stored.

**About how the service runs**

- For each request to the server: when, which feature, whether it worked, how
  long it took, your user id, and whether it came from a phone or a computer.
  Kept 30 days.
- Server logs, which include your email address when you ask for a password
  reset, and your user id in some sync operations. Kept by the hosting provider
  for about 7 days.

**Not kept**

- Receipt photos and imported CSV files are read and discarded.
- AI conversations are not stored on the server.

## 4. Why, and on what legal basis

`[TO CONFIRM: every basis in this table. The reading below is a starting point
for review, not a conclusion.]`

| What for | Data | Basis (proposed) |
| --- | --- | --- |
| Providing the service you signed up for | Everything in section 3 about you and your money | Contract |
| Keeping accounts secure: sessions, rate limits, passkeys, two-factor | Sign-in data, IP address | Contract; legitimate interests |
| Measuring whether the service is fast enough | Request records, kept 30 days | Legitimate interests |
| Diagnosing failures | Server logs | Legitimate interests |
| The AI features | Section 5 | `[TO CONFIRM: contract or consent. Consent cannot be the basis today: there is no way to give or refuse it (section 5.3).]` |
| Password reset and the weekly digest emails | Email address, name; digest totals | Contract |
| Recording people you owe or share costs with | Section 9 | `[TO CONFIRM: the basis for a user entering someone else's name and email, and who is responsible for it.]` |

## 5. The AI features

### 5.1 What is sent

| Feature | When it runs | What goes to the AI provider |
| --- | --- | --- |
| **Chat** | Each message you send | A summary of your position, rebuilt on every message: net worth, total assets and liabilities, portfolio value; this month's income, spending and savings rate; how much you hold in each currency and what it is worth converted; budgets by category; your goals by the names you gave them; how much you owe and are owed and to how many people; totals due in and out over the next 30 days; your top five spending categories; your subscription count and monthly cost; your base currency and the page you are on. Plus the whole conversation so far |
| **Page insights** | On the dashboard, **automatically when the page opens** if there is no recent insight; on some other pages when you ask | The same summary |
| **Automatic categories** | When you ask for it | **Each transaction's description, amount and type**, and your category names |
| **Receipt scan** | When you photograph a receipt | **The photo**, your category names, your base currency |
| **Bill split from a receipt** | When you split a receipt | **The photo and the names of the people** you are splitting with |

The summary does **not** include account names, bank names, individual
transactions, other people's names, tickers, IBANs, your name, your email or
your user id. No request carries anything that identifies you to the provider,
but the content itself — a goal name, a transaction description, a photo of a
receipt — can.

### 5.2 Who receives it

A request goes to the first of these that answers:

1. **Groq** (US). Does not train on your data. Keeps requests for up to 30 days
   for abuse monitoring; `[TO CONFIRM: whether Zero Data Retention has been
   switched on in Groq's settings]`.
2. **Cerebras** (US and other countries). Does not train on your data and says
   it does not keep inputs or outputs. `[BLOCKED: Cerebras's terms say that for
   a customer using the service in a personal capacity it acts as an
   independent controller, not a processor, and its data processing agreement
   does not apply. The operator is an individual. This line cannot name a
   safeguard until that is resolved.]`

If neither answers, the feature shows an error. The request is not sent
anywhere else.

Transfers to the US rely on `[TO CONFIRM: the mechanism for each provider —
Groq offers EU Standard Contractual Clauses and the UK Addendum in its
processing agreement]`.

### 5.3 Your choice

`[BLOCKED: there is no way to turn the AI features off. The dashboard sends
your summary when it opens, without you asking. A policy relying on consent or
objection for AI cannot be written until a switch exists and the dashboard
respects it.]`

What AI features produce can be wrong. They are not financial advice.

## 6. Who else receives your data

### Services Numeris uses to run

| Service | What it receives | Where | Safeguard |
| --- | --- | --- | --- |
| **Vercel** | Serves the web app and **passes every request from the web app to the server**, so it handles all your data in transit and your IP address. The phone app does not go through Vercel | US and wherever its nearest region is | `[BLOCKED: Numeris is on Vercel's Hobby plan. Vercel's data processing agreement covers Pro and Enterprise only, and Hobby is for non-commercial use.]` |
| **Render** | Runs the server; processes everything; keeps logs about 7 days | Frankfurt region; Render's primary processing is in the US | Render's data processing agreement, part of its terms; EU-US Data Privacy Framework and Standard Contractual Clauses |
| **Neon** | The database | London (AWS eu-west-2) | `[TO CONFIRM: in writing from Neon, that its data processing agreement covers the Free plan]` |
| **Resend** | Password reset: your email address and a reset link. Weekly digest, sent when you press send: your name, email, and the week's income, spending, top categories and transaction count | Stored in the US | Resend's data processing agreement; Standard Contractual Clauses, UK Addendum, Data Privacy Framework |
| **Groq, Cerebras** | Section 5 | US | Section 5.2 |
| **Market data providers** — Yahoo Finance, Alpaca, Polygon, Twelve Data | Ticker symbols, including those of investments users hold. Never who holds them | — | No personal data sent |
| **Frankfurter** (European Central Bank rates) | Currency codes | — | No personal data sent |

### Services you connect yourself

When you connect one of these, you are also using that service under its own
terms and policy.

| Service | What it receives from Numeris | What Numeris receives |
| --- | --- | --- |
| Google, Apple, GitHub sign-in | That you are signing in to Numeris | Your name, email, profile picture and sign-in tokens |
| Enable Banking and your bank | Your choice of bank and country, and a request for your consent | Account names, IBANs, balances, and transactions including the other party's name and payment reference |
| Wise | Your API token | Your profile, balances and statements |
| Kraken | Your API key | Your crypto balances |
| Alpaca | Your API key | Your account number, cash and activity |

### Called directly from your device

| Service | What it receives |
| --- | --- |
| **Google Fonts** | Your IP address and browser details, each time the app loads its fonts |
| **Etherscan, Blockstream** | A crypto wallet address you add in settings, with your IP address |

`[TO CONFIRM: Google Fonts. A German court held in 2022 that sending a visitor's
IP address to Google Fonts without consent was unlawful. Serving the fonts from
Numeris's own server would remove this row.]`

Nothing is sold. Nothing is shared with anyone not named in this section.

## 7. How long things are kept

| What | How long |
| --- | --- |
| Request records | 30 days, then deleted automatically |
| Server logs | About 7 days, by the hosting provider |
| Sessions | Valid for 30 days; the record stays until your account is deleted |
| Everything else you enter or that is imported for you, and every snapshot | Until you delete it or delete your account |
| Database backups | `[TO CONFIRM: Neon's Free plan keeps a 6-hour restore window. Confirm the plan and the window.]` |
| A copy on your device | Until you sign out or delete your account, and at most 30 days — section 10 |

`[TO CONFIRM: whether to set a retention limit for inactive accounts. None
exists.]`

## 8. Your rights, and what the app can and cannot do for you yet

You have the right to see, correct, take away and delete your data, to restrict
or object to how it is used, and to complain. Write to
`[TO CONFIRM: contact address]` for anything the app cannot do itself.
`[TO CONFIRM: that requests will be answered within one month.]`

**See and take away your data.** Settings → Export & Backup downloads one file
of everything your account holds: your name, email and picture; your sessions
with IP addresses and devices; your sign-in methods, passkeys and whether
two-factor sign-in is set up; your connections; your accounts, transactions,
investments, bills, debts, budgets, goals and subscriptions; both snapshot
histories; your settings and notes (including family, tax, pension and mortgage
entries); your shared expenses with their participants and settlements, and
the settlement actions you took on other people's; detected recurring payments;
and your request records. There is also a tax-year file of transactions.

The file leaves out credentials, because anyone holding them could act as you:
session tokens, tokens from Google, Apple and GitHub, your password (stored
only as a hash, which is also left out), two-factor secrets and backup codes,
the encrypted tokens for your connections, and one-time codes such as password
reset links. The file lists what it left out and why. Records that other users
keep about you are theirs and are not in your file (section 9).

**Correct it.** You can change your name, picture, password and every financial
record in the app.
`[BLOCKED: you cannot change your email address in the app.]`

**Delete it.** Profile → Delete account. You confirm by typing your email
address. Deletion is immediate and removes everything listed in section 3,
except:

- request records stay for up to 30 days with your user id removed;
- server logs stay for about 7 days;
- debts you recorded in another person's account through a linked email stay in
  **their** account;
- if you are named in someone else's debts or shared expenses, your name and
  email stay in **their** records;
- your settlement history on other people's shared expenses is deleted from
  **their** records;
- the database restore window `[TO CONFIRM: 6 hours]`;
- anything already sent to the services in sections 5 and 6;
- tokens and sign-in grants you gave to Wise, Kraken, Alpaca, Google, Apple,
  GitHub or your bank — revoke those in each service;
- the copy on your device (section 10).

`[BLOCKED: a copy of the production database, carrying real data, is kept as a
development database that account deletion does not reach. It must be removed
or anonymised before this policy can promise deletion.]`

**Restrict or object.** Removing a connection stops it syncing; the accounts
it imported stay until you delete them.
`[BLOCKED: there is no way to object to the AI features (section 5.3). The
weekly digest email offers an Unsubscribe link that does nothing.]`

**Complain.** You can complain to the Information Commissioner's Office in the
UK, or to the data protection authority where you live in the EU.
`[TO CONFIRM: the operator's lead authority.]`

## 9. If someone has recorded you in Numeris

A user can record a debt or a shared expense with another person. That stores
the other person's name, and their email address if the user adds it, along
with the amount, a description and notes. If a receipt is used to split a bill,
the names of the people splitting it are sent to the AI providers in section 5.

Nothing is sent to you. If you have a Numeris account and a user enters your
email address, a matching debt with their description and notes is created in
your account.

`[BLOCKED: there is no way for someone who is not a user to find out whether
they are recorded, or to have it corrected or removed. Write the route —
even if it is "write to the operator, who will search by name and email" —
before publishing, and confirm the operator can actually do that search.]`

## 10. On your device

To keep working offline, the web and phone app keep a copy of your recent data
in the browser's or app's storage for up to 30 days, along with any changes
waiting to be sent.

Signing out and deleting your account both remove that copy from the device:
the stored data, the changes waiting to be sent, and the AI commentary kept for
the current visit. When you sign out, changes waiting to be sent are sent first
if you are online; if you are offline, or sending fails, they are discarded
rather than left for whoever signs in next. Deleting your account discards
them, because there is no account left to send them to.

Signing out also removes your settings from the device once they have been
saved to the server; if saving fails, they stay. What stays on the device after
signing out: display choices that belong to the device rather than to you
(such as density, and whether figures are masked); your base currency, theme and
chosen layout, kept so the app opens in the right shape before it has reached
the server; whether this device has been through the first-run introduction;
and a list of when, and on what kind of device, you signed in. None of these is
a figure from your accounts.

On iPhone, your sign-in token is kept in the app's preferences, not the
Keychain.

## 11. Security

- Tokens and keys for connected services are encrypted with AES-256-GCM before
  they are stored.
- Sign-in cookies are sent only over secure connections.
- Web browsers can call the server only from Numeris's own web addresses.
- Sign-in attempts, requests and AI use are rate-limited.
- Passkeys and two-factor authentication are available.

What is not yet in place:

- tokens from Google, Apple and GitHub sign-in are stored unencrypted;
- there is no Content Security Policy on the web app.

`[BLOCKED: there is no process for detecting, recording or reporting a breach.
The law requires one before the policy can describe it.]`

## 12. Age

`[TO CONFIRM: minimum age. The app does not check anyone's age today.]`

## 13. Changes to this policy

`[TO CONFIRM: how, and how far in advance, users will be told.]`

This version: `[TO CONFIRM: date of publication]`.

---

## Where each section comes from

| Section | Source in `docs/DATA-INVENTORY.md` |
| --- | --- |
| 1 | §0; the commissioning task (individual operator, stores, UK and EU) |
| 2 | §2, §4, §5 "Searched and not found", §1, §6 |
| 3 | §2.1–§2.7, §3.1, §3.3 |
| 4 | Purposes from §2 "Why" columns; bases are proposals, not sourced |
| 5 | §4.2, §4.3, §4.1 provider table |
| 6 | §5, and §4.1 for the AI providers |
| 7 | §7, §1 (restore window), §3.4 |
| 8 | §6, §1 |
| 9 | §2.4, §4.2, §6 |
| 10 | §3.4 |
| 11 | §2.6, §6 security lists, §2.1, §3.4 |
