# Numeris: market gaps and newcomer teaching

Research date: 30 Sep 2026. Web research only; nothing in the repo was read or changed.

## How to read this

- Every figure has a source next to it. **[unsourced]** means I could not find a primary source. **[secondary]** means I only saw the figure in a search-engine summary or a third-party write-up and could not open the primary.
- **What the search covered.** Reddit was **blocked for my tools** ("domains are not accessible to our user agent"), so there are **no r/UKPersonalFinance, r/ynab or r/personalfinance quotes** here. For user voice I used the MoneySavingExpert forums, the Monzo and Emma community forums, App Store (GB) reviews and Trustpilot. Which? budgeting-app ratings are behind a paywall. The Save the Student 2025 page and the Cleo blog returned 403, so figures from them are **[secondary]**.
- Evidence strength: **Strong** means an official survey or regulator source plus repeated user complaints. **Medium** means repeated user complaints or a single good study. **Weak** means anecdote, vendor blogs or unverified statistics.

---

# Part 1: What users of existing apps lack

## Context: the UK consumer-app market keeps losing products

Three UK consumer aggregators have shut down or been handed off within five years. People who relied on them lost their history and had to start again.

- **Yolt** (ING) closed its consumer app in 2021 to focus on B2B, then wound down entirely. "Yolt closed its consumer-facing personal finance management app to focus on the growth of Yolt Technology Services" ([Fintech Futures](https://www.fintechfutures.com/open-banking/ing-to-shut-down-yolt-s-open-banking-operations)).
- **Money Dashboard**: ClearScore bought it in May 2022, and "Both the web and mobile applications permanently closed to users on 31st October 2023" ([Wikipedia](https://en.wikipedia.org/wiki/Money_Dashboard)). It had "over 100,000 users" in 2015 (same source). Its closure notice said it "could not find a sustainable business model" [secondary, via [moneytothemasses](https://moneytothemasses.com/news/money-dashboard-to-close-all-accounts-from-31st-october-2023), page returned 403].
- **Moneyhub** "announced its transition to focus exclusively on enterprise clients" and moved its consumer app to WPS Advisory, with an opt-in deadline at the end of August ([Moneyhub press release](https://moneyhub.com/press-releases/continuing-service-of-the-moneyhub-app/)). Third-party sources disagree on the closure date: 14 Aug 2026 according to [Yahoo/UK news](https://uk.news.yahoo.com/major-budgeting-app-used-thousands-064743138.html), 31 Jul 2026 according to [crestcast](https://crestcast.co.uk/blog/moneyhub-is-closing-what-to-do-now). Treat the exact date as unverified.
- **Monarch and Copilot**, the best-reviewed US apps, do not serve the UK. Monarch covers the US and Canada, and Copilot supports US banks only ([Bilance](https://www.bilanceapp.com/blog/monarch-money-alternative); vendor blog, so medium reliability).

What this means for Numeris: a UK user choosing an app today has a thin field (Emma, Snoop, bank-native tools) and good reason to worry about losing their data if the app closes. A MoneySavingExpert user put it this way: "I value my historical data... Any company can double the price overnight" (RedDwarf82, [MSE forum](https://forums.moneysavingexpert.com/discussion/6476542/personal-finance-apps-was-money-dashboard-apps-closing-down)).

## Cluster A: Bank connections break, and reconnecting is a chore

**Evidence: Strong.**

- Emma's 22% "bad" Trustpilot ratings cite "problems with bank account connection" [secondary, Trustpilot summary via search; TrustScore 3.5 from 587 reviews, seen directly on [uk.trustpilot.com](https://uk.trustpilot.com/review/emma-app.com?page=2)].
- Moneyhub's negative reviews "mostly involve users complaining about the connection between Moneyhub and bank accounts". Its own status page lists sync-rate drops for named providers [secondary, [Trustpilot](https://www.trustpilot.com/review/moneyhub.com), [status page](https://moneyhub.com/status/)].
- On the Emma community forum, after a rule change, a user "had to do a full reconnect for all (was transferred to bank app/website to login and approve)", naming HSBC and Santander (o99, 24 Apr 2023, [Emma community](https://community.emma-app.com/t/90-day-reconnection-rule-end/5853/11)).
- Snoop: "Adding the banks was slooow" (RedDwarf82, [MSE](https://forums.moneysavingexpert.com/discussion/6476542/personal-finance-apps-was-money-dashboard-apps-closing-down)). An App Store reviewer complained you "can only sync two accounts when the standard used to be more" (Rafter_yellow, Feb 2025, [App Store GB, Emma](https://apps.apple.com/gb/app/emma-budget-planner-tracker/id1270062373)).
- Regulation. In the UK, FCA PS21/19 replaced the 90-day bank re-authentication with a requirement "for the PSU to reconfirm their consent with their AISP directly" ([Open Banking Ltd](https://www.openbanking.org.uk/news/fca-publishes-changes-to-90-day-reauthentication-rules/)). An AISP is an account information service provider, the kind of firm that reads your bank data. In the EU, the EBA extended the renewal period from 90 to 180 days ([EBA final report](https://www.eba.europa.eu/sites/default/files/document_library/Publications/Draft%20Technical%20Standards/2022/EBA-RTS-2022-03%20RTS%20on%20SCA&CSC/1029858/Final%20Report%20on%20the%20amendment%20of%20the%20RTS%20on%20SCA&CSC.pdf)).
- In Enable Banking, consent length is set per bank: "The maximum value you can set for valid_until is dictated by the ASPSP and is returned in the maximum_consent_validity field... For the majority of ASPSPs, this value corresponds to 180 days" [secondary, [Enable Banking docs](https://enablebanking.com/docs/api/reference/) via search summary]. At least two open-source projects shipped bugs that hard-coded 90 days instead of using the bank's own maximum ([we-promise/sure #2854](https://github.com/we-promise/sure/issues/2854), [firefly-iii #12553](https://github.com/firefly-iii/firefly-iii/issues/12553)).
- Some statistics circulate without a source: "When auto-sync breaks, 68% of users abandon rather than reconnect" and "manual logging loses users at 3x the rate of auto-sync" ([financialfitnesspassport](https://www.financialfitnesspassport.com/learn/why-budgeting-apps-fail-most-people)). **[unsourced]**: no methodology is given. Do not quote them.

## Cluster B: Typing in transactions by hand (evidence both for and against automatic capture)

**Evidence: Medium. Automatic capture has real support, and there is one credible study against it.**

Evidence for automatic capture:
- The alternatives to manual entry are spreadsheets and apps that die. MSE users who tried "spreadsheets, hyperjar, monzo, plum" ended up on YNAB (stuartp2000, [MSE](https://forums.moneysavingexpert.com/discussion/6509361/best-simple-budget-app)). YNAB itself leans on manual entry.
- Copilot's workflow shows automatic capture plus machine categorisation working in practice. Copilot categorises automatically after the user reviews 30 transactions: "you need to review 30 transactions before this is enabled" ([Copilot help](https://help.copilot.money/en/articles/8182433-copilot-intelligence-for-spending)).
- Retention: "Only 44% of budgeting-app subscribers are still paying at month 12", attributed to Alkami's panel of 400k account holders [secondary, [productgrowth.blog](https://www.productgrowth.blog/p/personal-finance-app-user-retention)]. That post warns its figures measure "three different populations on three different clocks".
- Users with accounts that don't support open banking asked for manual "Offline Sources" as a fallback: "most of my savings accounts don't use [open banking]" (janusd, [MSE](https://forums.moneysavingexpert.com/discussion/6476542/personal-finance-apps-was-money-dashboard-apps-closing-down)). Automatic capture needs a manual escape hatch.

Evidence against automatic capture:
- **Zhang (2023), Consumer Interests Annual vol. 69** ([PDF](https://www.consumerinterests.org/assets/docs/CIA/CIA2023/ZhangYilingCIA2023.pdf)) used user data from a manual-entry app plus a US survey. Quote: "Automated tracking, with automatic collection of spending data through bank accounts or financial tools, is convenient but linked to lower attention and less financial self-awareness. In contrast, active tracking through manual expense recording requires more engagement and is associated with higher financial self-awareness." The same paper finds that "financial self-awareness can induce the pain of paying" and stresses "the importance of attention to information tracked". Limits: this is a short conference abstract, the data is correlational, and the manual-entry data comes from a Chinese app.
- YNAB's philosophy, as reviewers describe it: manual entry means "you are forced to acknowledge every cent you spend in real-time" [secondary, search summary of [TechRadar](https://www.techradar.com/computing/websites-apps/ynab)].
- A claim that "NBER research shows manual recorders spend 15–20% less" appears on several vendor blogs. **[unsourced]**: I could not find the NBER paper, so treat it as probably fabricated.

**Verdict on "never type a transaction" (#1).** Keep it. The evidence against it is about attention, not about typing. Zhang's own mechanism is "attention to information tracked". The design answer is automatic capture plus a short, deliberate attention moment: a review queue like Copilot's "To Review", and a weekly look back. That keeps the awareness benefit without the data-entry cost.

## Cluster C: Several currencies in one picture

**Evidence: Medium. The need is real and unserved, but the user base is a minority.**

- YNAB: "YNAB requires every budget to use a single currency". The official workaround of separate budgets per currency "never roll[s] up into one picture of your money" [secondary, [borderlessbudget](https://borderlessbudget.com/blog/ynab-abroad-workarounds); YNAB's own guide confirms the separate-budget approach: [YNAB support](https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno)]. A community tool built to bridge the gap was shut down because of API limits ([borsboom](https://github.com/borsboom/foreign-currency-accounts-for-ynab)).
- Monzo community use cases: "I like to save in the currency I will be spending so I'm not left out of pocket if the exchange rate is rubbish" (31 Jan 2019). "I can set an X amount of USD for a US trip" (said, 31 Jan 2019) ([Monzo community](https://community.monzo.com/t/multiple-currency-support/59152)).
- The feature is often oversold: "'supports multiple currencies' is one of the most stretched phrases in app marketing. It can mean a genuine per-account currency with automatic conversion, or… one currency symbol" [secondary, [borderlessbudget](https://borderlessbudget.com/blog/best-multi-currency-budgeting-apps)].
- **Gap in this search:** I did not verify how Emma or Snoop handle EUR or MYR accounts. Revolut's and Wise's analytics cover their own accounts plus linked accounts ([Revolut help](https://help.revolut.com/en-US/help/accounts/budget-and-analytics/how-can-i-see-my-spending-and-income-analytics/)). I found no reliable source on how they convert across currencies.
- No UK figure for how many 18–25 year olds hold money in more than one currency. **[unsourced]**

## Cluster D: "How much can I actually spend?" (forecasting and safe-to-spend)

**Evidence: Strong for demand. Weak for a student-specific version.**

- Money Dashboard's most-missed feature: "One of Money Dashboard's most well-loved features was the custom spending plan it could create for users based on their balance, scheduled spend, and budget" ([Emma blog](https://emma-app.com/blog/now-that-money-dashboard-has-closed-what-are-my-budgeting-app-alternatives); a competitor's blog, but the claim cuts against its own interest). Emma also wrote a whole post on replacing Money Dashboard's forecast ([Emma blog](https://emma-app.com/blog/2023/10/18/money-dashboards-forecast-feature-alternative/)).
- MSE: "the Planner has been really useful... see what's going out, what's coming in... what our accounts will look like over the next 12 months" (ClaraSolis, [MSE](https://forums.moneysavingexpert.com/discussion/6476542/personal-finance-apps-was-money-dashboard-apps-closing-down)).
- Monzo's version covers Monzo accounts only: "how much money you've got left to spend in this period, taking into account any payments due soon" ([Monzo help](https://monzo.com/help/budgeting-overdrafts-savings/what-is-left-to-spend)).
- The Money and Mental Health Policy Institute names "budgeting platforms showing upcoming bills and safe spending amounts" as a way open banking can help ([MMHPI](https://www.moneyandmentalhealth.org/open-banking-and-mental-health/)).
- Students' income is lumpy. The Maintenance Loan "is split into 3 equal instalments… one instalment at the beginning of each term" [secondary, [UCAS/SFE](https://www.ucas.com/student-finance-england/living-costs-full-time-students)]. It falls short of living costs by "£502 per month on average", and students spend "£1,142 per month" [secondary, [Save the Student NSMS 2025](https://www.savethestudent.org/money/surveys/student-money-survey-2025-results.html), page returned 403].
- Snoop reviewer: "I'd like to see additional 'account' showing just your income… especially for people with more than one job" (JonD1492, 30 Dec 2024, [App Store GB](https://apps.apple.com/gb/app/budget-planner-l-snoop-money/id1495077102)).
- Every product in this search that shows a safe-to-spend figure assumes monthly pay. Monzo's is tied to pay cycles, and Money Dashboard's to a monthly budget. None models a term-sized income that has to last about 13 weeks. This is my inference from the products; I found no source that states it.

## Cluster E: Subscriptions and free trials

**Evidence: Strong.**

- Citizens Advice (poll of 3,000 UK adults, 26 Jan–1 Feb 2024): "over 13 million people (26% of UK adults) have accidentally taken out a subscription". Unused subscriptions "have cost consumers £688 million in the last year". Of those with accidental subscriptions, 39% took one out as a free trial and forgot to cancel ([Citizens Advice](https://www.citizensadvice.org.uk/about-us/media-centre/press-releases/consumers-spend-688-million-on-unused-subscriptions-in-the-last-year/)).
- The government estimate is higher: about 10m unwanted subscriptions costing £1.6bn a year [secondary, search summary citing [Barclays](https://home.barclays/insights/2025/10/Next-Phase-Subscription-Economy/); I did not open it].
- Emma put recurring-payment tracking behind a paywall: "They took out being able to see and manage recurring payments… charging £5/m" (Rxxhxm, 2 May 2024, [App Store GB](https://apps.apple.com/gb/app/emma-budget-planner-tracker/id1270062373)). Emma also charged a user without warning: "they'd taken £83 from my bank account for a premium annual subscription" (David CJ, 1★, 2 Sep 2026, [Trustpilot](https://uk.trustpilot.com/review/emma-app.com?page=2)).

## Cluster F: Insight that doesn't judge, and avoidance

**Evidence: Medium. The anxiety data is strong. Evidence that a different tone fixes it is weak.**

- FCA Financial Lives 2024 (17,950 adults): "22% of adults lacked confidence managing their money" and "36% had low knowledge about financial matters". 24% (13.1m) had low financial resilience ([FCA key findings PDF](https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-key-findings.pdf), text extracted and checked). A figure of **53% of 18–24s with low knowledge** appeared in a search summary, but I could not find it in the key-findings text. **[unverified]**
- Avoidance: "When I'm sent a letter about charges… I panic and hide it, and just wait for it to go away" (quote from a person with lived experience, [MMHPI](https://www.moneyandmentalhealth.org/open-banking-and-mental-health/)). The "ostrich effect": investors log in less after market falls (Karlsson, Loewenstein & Seppi 2009, [J. Risk & Uncertainty](https://link.springer.com/article/10.1007/s11166-009-9060-6)).
- Gen Z anxiety: 64% of Gen Z say their mental health has been affected by their finances, and 72% find it hard to talk about money [secondary, Cleo's own survey via search summary, [Cleo report](https://web.meetcleo.com/blog/cleos-2024-mental-health-money-report), 403]. YoungMinds: 72% of young people "often" or "always" worried about money (2021) [secondary].
- Cleo on tone: people are "almost more open to talking to an AI than they are to a friend… our tone of voice goes a really long way in helping create that sense of safety" [secondary, [Inc.](https://www.inc.com/ben-sherry/why-this-company-hires-comedy-writers-to-craft-an-edgy-ai-budget-assistant/91194888), 403].
- The PYMNTS May 2025 survey (2,040 US consumers) found that looking at your finances is "not necessarily comforting" ([PYMNTS](https://www.pymnts.com/financial-apps/2025/daily-budget-app-adoption-stalls-at-14-percent/)).

## Cluster G: Privacy, trust, upsells and lock-in

**Evidence: Medium.**

- FCA Research Note (Oct 2025): "some individuals… remain cautious about sharing financial data with third parties due to privacy concerns". It calls for "clear disclosure of how data is shared and monetised" ([FCA](https://www.fca.org.uk/publication/research-notes/open-banking-open-finance-uk.pdf), text extracted and checked).
- Snoop: "app asks for a lot of personal info… leaves a nasty taste… This kind of stuff should be opt-in, NOT opt-out" (JonD1492, [App Store GB](https://apps.apple.com/gb/app/budget-planner-l-snoop-money/id1495077102)). A Trustpilot reviewer applied for an offer, was declined, and got a hard credit search [secondary, Trustpilot summary].
- Emma upsells: "when I say 'maybe later'… does not mean in 2 minutes time upon refresh" (Connor M'sk, May 2023). And: "can't even add our own categories without paying" (Daniesaurussss, May 2024) ([App Store GB](https://apps.apple.com/gb/app/emma-budget-planner-tracker/id1270062373)).
- Open banking adoption is still a minority: 15.16m users by July 2025, "nearly one in three adults" ([Open Banking Ltd](https://www.openbanking.org.uk/news/open-banking-surges-to-15-million-uk-users-as-july-marks-record-adoption/)). "Six in 10 UK adults are unaware of open banking" [secondary, [MPA](https://www.mpamag.com/uk/mortgage-industry/technology/six-in-10-brits-are-uninformed-about-open-banking-survey-finds/508418)].

## Summary table

| Cluster | Strength | Best single source |
|---|---|---|
| A. Connections break | Strong | Trustpilot for Emma and Moneyhub; FCA PS21/19 |
| B. Manual entry (for and against) | Medium | Zhang 2023 (against); MSE and Copilot (for) |
| C. Multi-currency | Medium | YNAB single-currency limit; Monzo community |
| D. Safe-to-spend / forecast | Strong (demand) | Money Dashboard's most-missed feature; MMHPI |
| E. Subscriptions | Strong | Citizens Advice £688m / 39% free trials |
| F. Non-judgemental insight | Medium | FCA FLS 2024; MMHPI |
| G. Privacy / trust / lock-in | Medium | FCA research note; App Store reviews; three shutdowns |

## Proposed distinctive features, ranked by evidence × solo-dev feasibility

**1. Never type a transaction, and never go stale without saying so.** *(fixed #1; evidence Strong for A, Medium for B; feasibility High)*
- Automatic capture through Enable Banking.
- Request each bank's `maximum_consent_validity` instead of a hard-coded 90 days. Avoid the bug seen in [sure #2854](https://github.com/we-promise/sure/issues/2854).
- Show a consent countdown on each account ("renews in 12 days") and let the user reconnect in the app from day −14, before the connection breaks.
- Every balance carries an "as of" time. A connection that has lapsed shows its last known figure in the "not-yet-real" dotted treatment, never as live.
- A 30-second **review queue** handles the attention problem from Zhang 2023. New transactions arrive unconfirmed; one swipe confirms them or re-categorises them.
- A CSV or statement import is the escape hatch for accounts that don't support open banking (MSE janusd) and, if needed, for MYR accounts. I have not checked whether Enable Banking can reach Maybank.

**2. "Until next money-in": safe-to-spend that understands term-sized income.** *(Strong demand; feasibility Medium)*
- One figure: money available now, minus bills due before the next expected inflow, divided by the days until that inflow.
- The next inflow is detected from history: salary, SFE instalment, parental transfer.
- Show the inflow date and amount the figure rests on, so the user can see where it came from.
- Money Dashboard's most-loved feature died with it. Monzo's version is limited to Monzo accounts. No UK product in this search models income that arrives termly.

**3. One picture across GBP, EUR and MYR, native currency first.** *(Medium; feasibility Medium-High, and the conversion layer already exists in Numeris)*
- Net worth and safe-to-spend in the home currency, with each foreign line showing its native amount first and a provenance mark (rate, source, date) on the converted figure.
- YNAB forces separate budgets, and US apps don't operate in the UK. This is the clearest positioning gap.

**4. Subscription and free-trial radar.** *(Strong; feasibility High, since recurring detection is a pattern match over transactions)*
- List recurring charges with their next date and amount.
- Flag a first small or zero charge from a merchant known for trials, with the message "trial may convert on ~date".
- Keep this free. Emma paywalling it is a documented complaint.

**5. A trust stance you can check: no offers, no ads, no data resale, one-tap full export.** *(Medium; feasibility High, and it is mostly policy and copy)*
- This answers the Snoop and Emma complaints and the fear of shutdown. Three UK apps have closed or handed users off since 2021.
- A "your data" screen lists what was pulled, from which bank, when consent expires, and an "export everything (CSV/JSON)" button.

Considered and not ranked: a Cleo-style personality. The evidence that tone matters is secondary (Cleo's own survey). A comic voice would also clash with Numeris's "instrument" design stance. Adopt the non-judgemental part (Part 2) and leave the roast.

---

# Part 2: How the best finance apps teach newcomers

## Examples

**YNAB: a method first, then the software.**
- Four rules: give every dollar a job, embrace your true expenses, roll with the punches, age your money ([Experian review](https://www.experian.com/blogs/ask-experian/you-need-a-budget-app-review/)). YNAB's own page now frames this as "The YNAB Method" around the question "What's it for?" ([ynab.com](https://www.ynab.com/the-four-rules)).
- Free live workshops "cover topics like setting up your first budget, paying off debt, building an emergency fund" (Experian).
- In-app: a "six-step onboarding workflow" with "a bar at the top of the screen" that "animates to encourage users to continue". Users "can quickly return to the guide at any time". The article's conclusion: "the biggest barrier… isn't learning how to use their software; it's shifting the mindset" ([GoodUX/Appcues](https://goodux.appcues.com/blog/you-need-a-budget-ynab-s-friendly-ux-copywriting)).
- Lesson for Numeris: teach one idea at a time, keep the guide resumable, and give progress a visible shape.

**Monzo: introduce a feature at the moment it becomes relevant.**
- "If Monzo predicts that a transaction is your salary, they'll show an inline prompt onboarding you to their 'salary sorter' feature" [secondary, search summary of [Built for Mars UX bite #566](https://builtformars.com/ux-bites/onboarding-the-salary-sorter); the full text is paywalled].
- Monzo's own onboarding experiment "simplified the signup process… and focused on a core set of setup actions". It got "more customers 'through the door' and significantly improved physical card activations", but "this also reduced feature adoption" ([Monzo blog](https://monzo.com/blog/how-we-use-design-to-create-business-impact-at-monzo)). Lesson: a shorter first run raises activation, but features then need introducing later, in context.
- Built for Mars found it "took 18x longer to open an account with HSBC than it did with Monzo" [secondary, [TechCrunch](https://techcrunch.com/2020/05/21/this-ux-specialist-opened-12-uk-bank-accounts-and-logged-everything/)].

**Copilot: import history first, then a review inbox that trains the model.**
- "By importing your historic data, Copilot is able to suggest categories, create an initial budget, and identify & track your income." New transactions land in "To Review". After 30 reviews the model starts suggesting. "Keep your To Review inbox at 0!" ([Copilot quick start](https://help.copilot.money/en/articles/11157550-quick-start-guide), [Copilot Intelligence](https://help.copilot.money/en/articles/8182433-copilot-intelligence-for-spending)).
- When a guess is wrong, the top two alternatives are shown first. Lesson: the first budget is inferred, not built from a blank form.

**Cleo: tone as a safety device.**
- It speaks through chat, with a "Roast Mode" and a "Hype Mode" [secondary, [Penny Hoarder](https://www.thepennyhoarder.com/budgeting/cleo-app-review/)]. It employs comedy writers [secondary, Inc.].
- Lesson: users open up when they don't feel judged. Numeris can take that without the jokes, as neutral, specific, non-moralising copy.

**Duolingo: value before commitment, then progressive disclosure.**
- Users do a lesson before signing up, and features unlock as progress accumulates. A claimed "20% DAU lift" from delayed signup is **[secondary, unverified]**: it appears only on vendor blogs ([Appcues](https://www.appcues.com/blog/gradual-engagement-mobile-app-first-screen)). The Lenny's Newsletter write-up of Duolingo's growth says the team deliberately **de-prioritised** new-user retention in favour of retaining current users ([Lenny's](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth)).

**Sample-data modes: PocketSmith and Lunch Money.**
- PocketSmith: "try demo mode to see PocketSmith with sample data". Exiting deletes the data, and bank feeds don't work in demo ([PocketSmith](https://learn.pocketsmith.com/article/1418-using-demo-mode)).
- Lunch Money seeds "transactions, recurring items, a few accounts, and some balance history" [secondary, search summary of [Lunch Money docs](https://support.lunchmoney.app/getting-started)].
- **Tension with Numeris's hard rule** ("never show a number the API did not supply"; the MOCK_* history). A demo mode is only compatible if it is a separate, visibly labelled sandbox account that never shares a screen with real data. The recommendation below is not to build one.

## What research says about teaching money to 18–25s

- **Education fades quickly. Timing matters more than volume.** Fernandes, Lynch & Netemeyer (2014, *Management Science*, 201 studies): interventions explained "0.1% of the variance in financial behaviors studied", effects decay within months, and the authors point to "just-in-time financial education tied to a particular decision" ([RePEc](https://ideas.repec.org/a/inm/ormnsc/v60y2014i8p1861-1883.html); the just-in-time quote is [secondary via Kitces](https://www.kitces.com/blog/financial-literacy-program-effectiveness-just-in-time-training-by-financial-advisors/)).
- **Later evidence is more positive, especially for budgeting.** Kaiser, Lusardi, Menkhoff & Urban (2022, *JFE*, 76 RCTs, >160k people) find positive effects on knowledge and behaviour, "especially when it comes to budgeting, savings, and credit" ([RePEc](https://ideas.repec.org/a/eee/jfinec/v145y2022i2p255-272.html)). RCT means randomised controlled trial.
- **Reminders work when they name the goal.** Karlan, McConnell, Mullainathan & Zinman (2016, *Management Science*): reminders raised commitment-savings attainment, and "messages that mention both savings goals and financial incentives are particularly effective" ([NBER w16205](https://www.nber.org/papers/w16205)).
- **Fresh starts.** Goal pursuit rises after temporal landmarks, including "the outset of a new… semester" (Dai, Milkman & Riis 2014, [Management Science](https://pubsonline.informs.org/doi/10.1287/mnsc.2014.1901)). A "+47% gym visits at semester start" figure appears only in secondary summaries. **[secondary]**
- **Demand for teaching exists.** "71% of students said they wished they'd had better financial education before coming to university" [secondary, Save the Student NSMS 2025].

## Plan for Numeris

The principles behind every screen below:
- Teach at the moment a number first appears, not in a tour (just-in-time).
- One new idea per session.
- Never moralise.
- Every figure can explain itself.

### The first 5 minutes

1. **Screen 1: "What Numeris does and can't do" (one screen, no carousel).**
   - Three lines: reads your accounts; never moves money; you can export or delete everything.
   - One button: **Connect your main account**. A secondary link reads "How reading access works (30 sec)" and opens a sheet with the consent steps and the renewal date the bank will set.
   - This answers Cluster G before any data flows.
2. **Screen 2: Bank picker, then the Enable Banking redirect.**
   - On return, a progress row reads "Reading 14 months from Barclays…", using the real returned span, never an estimate.
   - Offer **Add another account** or **That's all for now**. Don't push for five banks up front; Monzo's experiment shows fewer setup actions raise activation.
3. **Screen 3: The first real number, with its explanation already open.**
   - HOME shows net worth with the "What does this mean" sheet (below) open once, pointing at three parts: accounts included, currency conversion, "as of" time.
   - The sheet dismisses with **Got it** and never auto-opens again.
4. **Screen 4: Two questions to calibrate (skippable).**
   - "When does money usually come in?" Numeris shows detected candidates such as "£2,891 · SFE · 23 Sep"; the user confirms, edits or chooses "not sure yet".
   - "Home currency?" is prefilled from the largest balance.
   - This is how Numeris gets the inflow date that feature #2 needs without a form. It follows Copilot's "infer first, confirm after" pattern.
5. **Screen 5: The review queue, 5 items only.**
   - "Numeris guessed these. Right?" One swipe confirms or corrects each.
   - Stop at 5 with "Done for today. The rest can wait." This introduces the queue habit without the 30-item wall Copilot uses.

**No empty home screen.** If nothing is connected yet, HOME shows one panel: what will appear here, a *connect* action, and no figures, not even zeros. A zero balance would show a number the API did not supply.

### The first week (one idea a day, each triggered by real data)

| Day | Trigger | Moment |
|---|---|---|
| 1 | The first overnight sync finishes | Push notification: "3 new transactions to check, about 20 seconds." Opens the review queue. |
| 2 | Recurring payments detected (≥2 hits on the same merchant) | UPCOMING shows its first **subscriptions card**: "We found 4 regular payments, £38.97/month." Each line says what was matched ("Spotify, 3 payments, ~12th"). A trial-like pattern gets a dotted "may start charging ~date" row. |
| 3 | The inflow date was confirmed or detected | **Safe-to-spend** appears for the first time, with its sheet: "£214 across 11 days until 23 Oct. That is £19/day." Shows the three parts: balance, bills before that date, days. |
| 4 | A foreign-currency transaction or account exists | Inline card on WORTH: "Your €420 counts as £358 here. Rate: ECB, 29 Sep. Native amount always shown first." Skipped for GBP-only users. |
| 5 | A weekday with the queue under 10 | Nothing new is taught. The day's only aim is the review habit. |
| 6–7 | End of the first week (a temporal landmark) | **Week-one look-back**: three plain facts ("spent £142, 38% on food, 2 new subscriptions") and one question ("Want a heads-up when safe-to-spend drops below £10/day?"). The alert names the goal, per Karlan et al. |
| Next term start / SFE instalment | Instalment detected | A "fresh start" card: "New term, £2,891 in. Plan how it lasts until January?" This is the one place a planning flow is offered. |

**Consent renewal is taught as a feature, not an error.** At 14 days before expiry the account row shows "renews in 14 days · renew now". The error state never appears if the user renews in time.

### In-context help

- **First-appearance tips, one per concept, never repeated.** They are anchored to the element itself: the first dotted figure ("Dotted means not yet real: expected, not happened"), the first fx mark, the first review-queue item. Each is dismissed forever by **Got it**. There is no coach-mark tour.
- **The empty state teaches the job.** Every tab's empty state names what the screen is for and the one action that fills it (e.g. SPENDING: "Spending appears after your first sync. Connect an account"). No placeholder charts and no example numbers.
- **The copy never judges.** No "overspent", "bad" or red-for-shame language. Say what happened and one option: "Food: £96 this week, £30 more than your usual week. Want to see which days?" This follows the MMHPI findings on avoidance.
- **A help sheet from the DIRECTORY tab** with 8–10 short explainers: net worth, safe-to-spend, consent renewal, exchange rates, why a transaction is pending, how to export. Each is under 120 words and ends with a "check yourself" question that has a folded answer.
- **Nothing is teachable before the data exists.** A "Numeris guessed" label on a category links to "how we guessed" (merchant name, amount, past corrections).

### The "what does this number mean" layer

Every computed figure (net worth, safe-to-spend, category totals, converted amounts, subscription totals) can be long-pressed on phone or clicked on desktop to open one **explain sheet** with the same four blocks:

1. **What it is.** One sentence, e.g. "What you can spend per day until your next money-in, after bills."
2. **How we got it.** The actual calculation, with the user's real inputs, e.g. `£612 balance − £398 bills due before 23 Oct = £214 ÷ 11 days = £19/day`. Every input is tappable to the transactions or accounts behind it.
3. **Where it came from.** Each account included, with bank, "as of" time and consent expiry. For converted figures, the rate, its source and its date (the fx provenance mark). Excluded or lapsed accounts are listed as excluded, with the reason.
4. **What would change it.** Two or three levers in plain words ("A £40 bill on 15 Oct is included. Mark it paid if it's already gone.").

Rules for the layer:
- The sheet never shows a figure the calculation didn't use.
- If an input is missing (no inflow date yet), the headline figure is not shown at all. The sheet says what is missing and offers the one action that supplies it. This matches the full-or-nothing rule for figures.

### Recommendation on a sample-data mode

**Do not build one yet.** It conflicts with the no-fabricated-figures rule, and Numeris's value is *your* accounts in one place, which sample data cannot show. If it is ever needed for App Store screenshots or a marketing site, it should be a separate seed account with a permanent, full-width "Sample data" band, never selectable from a real account.

---

## Figures I could not source

- The 53% of 18–24s with low financial knowledge (FCA). It was in a search summary but not in the key-findings text I extracted.
- The 68% who abandon when sync breaks, and the 3x abandonment for manual entry.
- NBER "manual trackers spend 15–20% less".
- Duolingo's +20% DAU from delayed signup.
- The share of UK 18–25s holding money in more than one currency.
- Whether Enable Banking covers Maybank or other MYR accounts. Not checked; check the ASPSP list.
