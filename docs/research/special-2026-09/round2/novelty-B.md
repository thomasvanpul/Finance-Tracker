# Novelty check B: Ideas I18-I34 (30 Sep 2026)

Method: at least two distinct web searches per idea (WebSearch), with key pages loaded (WebFetch) where
a claim hinged on detail. "Seen in results" means the claim rests on the search-result snippet for that
URL; "loaded" means the page was fetched and read. Scores are 1-5. Effort 1 = about a week for one
developer on the existing React/Capacitor + Express/Postgres stack; 5 = months, or needs hardware, OS
entitlements or a regulated licence. Numeris constraints applied: never holds or moves money, never shows
a figure the data did not supply.

Negative results are only as good as the searches listed under each idea. English-language, mostly US
search index; non-English App Store listings were not searched.

---

## I18 Habit compounding, on your own portfolio

- **Verdict: NEW-TWIST**
- **Scores:** impact 3, uniqueness 2, effort 1
- **Blockers:** none technical. Data rule: the figure only exists for users with investment holdings and
  enough history for a realised return; otherwise show nothing rather than falling back to 7%. A short or
  negative realised return makes the projection volatile or perverse (a habit that "saves" money because
  the portfolio lost).
- **What exists:** "latte factor" / opportunity-cost calculators where the user types in a return rate
  (Financial Mentor, Money Under 30, miniwebtool), an App Store "Opportunity Cost" app, and a GitHub
  purchase-opportunity-cost project. Copilot Money computes estimated returns on linked holdings but no
  source showed it pricing a spending habit forward.
- **What is new:** the rate is pulled automatically from the user's own realised portfolio return and
  the recurring purchase is detected from bank transactions, not typed in.
- **Evidence:**
  - https://www.financialmentor.com/calculator/latte-factor-calculator (seen in results: user enters return %)
  - https://www.moneyunder30.com/latte-factor-calculator (seen in results: default 8% market rate)
  - https://apps.apple.com/us/app/opportunity-cost-occ/id6752423378 (seen in results)
  - https://github.com/bpdulog/purchase-opportunity-cost (seen in results)
  - https://moneywithkatie.com/how-im-using-copilots-new-investments-feature-to-understand-my-performance/ (seen in results: Copilot estimated returns)
- **Searches:** `app "latte factor" calculator uses your actual portfolio return to project cost of habit`;
  `budgeting app shows opportunity cost of purchase invested future value recurring spending`;
  `Copilot money app "cost of" habit future value invested your returns`.

## I19 The second look

- **Verdict: NEW-TWIST**
- **Scores:** impact 4, uniqueness 3, effort 2
- **Blockers:** a personal regret model needs dozens of labelled purchases before any prediction is
  honest; until then it must show no prediction. Otherwise none.
- **What exists:** Happy Money's Joy app asked users to rate linked-account purchases as "happy spends" or
  "sad spends"; a Qapital research partnership had 20-36 year olds rate their bank-linked purchases for
  satisfaction; RegretIt logs regretted purchases manually; "Should I Buy This?" and "Skip or Buy" judge
  purchases before buying.
- **What is new:** the next-morning deferred review queue gated by a user threshold, and a model trained
  on the user's own answers that predicts regret on future transactions. No shipping product found doing
  the prediction.
- **Evidence:**
  - https://www.prnewswire.com/news-releases/happy-money-launches-joy-the-first-money-app-powered-by-psychology-300551650.html (loaded: happy/sad spends; no regret prediction or review hold mentioned)
  - https://www.scientificamerican.com/blog/observations/how-to-avoid-purchase-regret/ (seen in results: Qapital rating study)
  - https://regretit.aiappnation.com/ (seen in results: manual regret log)
  - https://apps.apple.com/us/app/should-i-buy-this-worth-it/id6766764572 (seen in results)
- **Searches:** `app asks "was this purchase worth it" review transactions regret tracking`;
  `spending app rate purchases worth it machine learning predict regret purchases`;
  `app rate each purchase happiness "was it worth it" spending joy score after purchase review`;
  `"regret" purchases prediction personal finance app learns which purchases you regret`.

## I20 Cohort mirror

- **Verdict: NEW-TWIST** (the benchmark itself exists; the university cohort and formal differential
  privacy do not appear anywhere)
- **Scores:** impact 3, uniqueness 2, effort 4
- **Blockers:** hard blocker on user count. Differential privacy at university x year x city grain needs
  many users per cell (hundreds) before the noise is smaller than the signal; with a small user base every
  cell is empty or all noise, so the feature cannot show a figure. Also UK GDPR: spending data is personal
  data; aggregation needs a lawful basis and a DPIA.
- **What exists:** Menot (EU, PSD2) compares your spending "with people like you", filtered by age,
  occupation, household, location and gender, anonymised and aggregated. Spenny shows aggregated spending
  by sex, education, age and income. Status (studied by D'Acunto et al.) put users into peer groups of
  5,000+. An older US patent covers peer-based comparison.
- **What is new:** university and course-year cohorts, and a formal differential-privacy guarantee. No
  consumer finance app found stating DP.
- **Evidence:**
  - https://menot.app/ (loaded, but the page returned only a title; feature detail is from the search snippet)
  - https://apps.apple.com/cd/app/spenny/id1599181818 (seen in results)
  - https://topcat.aeaweb.org/conference/2020/preliminary/paper/2aeniTdS (seen in results: Status peer groups)
  - https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10223754 (seen in results: peer-comparison patent)
- **Searches:** `student budgeting app compare spending with students same university anonymous benchmark`;
  `personal finance app differential privacy peer spending comparison`;
  `banking app "compare your spending" with "people like you" similar age city feature`;
  `Menot app compare spending people like you App Store`.

## I21 Hidden-amount pacts

- **Verdict: NEW-TWIST**
- **Scores:** impact 3, uniqueness 3, effort 3
- **Blockers:** needs a social layer (invites, a second account, consent), which Numeris does not have.
  A percentage plus a known target leaks the amount, so the target must also be hidden.
- **What exists:** Revolut Group Vaults (shared savings pot with friends, progress tracked in-app);
  Qapital says "You decide what's shared and what's private" for shared goals; Saving Together (shared
  target, contributions visible); Tilt savings communities; HabitShare (per-habit visibility).
- **What is new:** two people with separate goals and separate money, each seeing only the other's
  percentage, never the amount. Not found in any product; the shared products pool one pot and show amounts.
- **Evidence:**
  - https://www.revolut.com/news/revolut_launches_group_vaults_transforming_the_way_friends_and_family_save/ (seen in results)
  - https://www.qapital.com/saving/ (loaded: privacy control stated, granularity not specified)
  - https://apps.apple.com/us/app/saving-together-couple-goals/id6748008570 (seen in results: "each contribution stays visible")
- **Searches:** `savings goal app share progress percentage with friend without revealing amount`;
  `Revolut shared savings vault friends Monzo shared pot goal progress`;
  `savings app see friend's progress percent only privacy challenge Qapital Long Game social savings`;
  `savings accountability partner app friends see goal percentage complete, dollar amounts hidden`.

## I22 Gift memory

- **Verdict: EXISTS**
- **Scores:** impact 2, uniqueness 1, effort 2
- **Blockers:** none. Birthdays of other people are third-party personal data; keep them local to the user.
- **What exists:** Gift Tracker (Android) records gifts given and received with value, and is pitched as
  "remember who gave what and reciprocate". Gift Ledger (Android) organises gifts by contact with amount
  and birthday reminders. Birthday Countdown & Gift List (iOS) has per-recipient budgets and spend tracking.
- **What is left:** only linking entries to the actual card payment from bank data. A thin twist.
- **Evidence:**
  - https://play.google.com/store/apps/details?id=com.dn.gift_tracker&hl=en_US (seen in results)
  - https://play.google.com/store/apps/details?id=com.northstarstudio.giftledger.people.vault.qxz (seen in results)
  - https://apps.apple.com/us/app/birthday-countdown-gift-list/id1540668458 (seen in results)
  - https://apps.apple.com/us/app/gift-logger/id6761291763 (seen in results)
- **Searches:** `gift tracker app who gave me what reciprocity spending birthdays`;
  `gift ledger app track gifts given and received amounts budget per person`.

## I23 Fair rent by days

- **Verdict: NEW-TWIST**
- **Scores:** impact 3, uniqueness 3, effort 3
- **Blockers:** location-based presence needs iOS "Always" location permission (App Store review
  scrutiny, battery), and every flatmate must opt in, since it is their location. Calendar route needs each
  flatmate's calendar consent. Standing charges do not scale with presence, so a pure day split is itself
  arguable.
- **What exists:** pro-rata by time present is a documented rule of thumb (Flatmate Flow guide); Splitwise
  splits by shares; Supasplit applies a custom ratio automatically each month.
- **What is new:** presence measured automatically from calendars or location rather than typed in. Not
  found in any app.
- **Evidence:**
  - https://www.flatmateflow.com/blog/how-to-split-bills-with-roommates (seen in results: "utilities pro-rata for time present")
  - https://supasplit.app/blog/splitting-utilities-wfh-roommate (seen in results: custom ratio applied monthly)
  - https://en.wikipedia.org/wiki/Splitwise (seen in results: split by shares)
- **Searches:** `split bills by days present flatmates app prorated nights away household bills`;
  `roommate app split utilities by nights stayed location automatic occupancy`;
  `Splitwise split by shares nights "days present" utility bill prorate feature request`.

## I24 Social cost forecast

- **Verdict: NEW-TWIST**
- **Scores:** impact 3, uniqueness 4, effort 3
- **Blockers:** Google Calendar read scope is a sensitive scope requiring Google OAuth verification;
  iOS EventKit needs a native plugin. Matching calendar events to past transactions is fuzzy, and a
  forecast with no comparable history must show nothing.
- **What exists:** calendar-shaped budgeting (CalendarBudget, PocketSmith, CalBudget, Monarch's recurring
  calendar) that places bills on dates; a Zapier recipe that nudges a YNAB category when a Google Calendar
  event starts.
- **What is new:** reading the user's real social calendar and pricing each event from what similar past
  events cost. Not found.
- **Evidence:**
  - https://www.pocketsmith.com/tour/budget-calendar/ (seen in results)
  - https://calendarbudget.com/ (seen in results)
  - https://zapier.com/apps/google-calendar/integrations/ynab/1728608/start-budgeting-for-new-google-calendar-events-by-categorizing-them-in-you-need-a-budget (seen in results)
- **Searches:** `budgeting app reads calendar events forecast spending upcoming events`;
  `app connects Google Calendar to budget predict cost of upcoming dinner social events`;
  `AI budgeting assistant uses calendar integration anticipate spending events Cleo Monarch calendar`.

## I25 Calibration

- **Verdict: NEW** (for real personal data)
- **Scores:** impact 3, uniqueness 4, effort 2
- **Blockers:** none. Point estimates need a proper scoring rule (Brier needs probabilities; for
  quantities use interval coverage or a log score), which is a design choice, not a blocker.
- **What exists (nearest):** PersonalFinanceLab's classroom budget game asks students to guess
  "unexpected expenses" in a simulation; Tradermath has a Fermi estimation game with confidence
  intervals on trivia.
- **What is new:** predicting your own real weekly figures and being scored on calibration over time.
  Nothing found.
- **Evidence:**
  - https://www.personalfinancelab.com/blog/march-2020-budget-game-update/ (seen in results)
  - https://www.tradermath.org/market-games (seen in results)
- **Searches:** `app predict your own spending each week scored Brier score calibration personal finance`;
  `budgeting game guess your spending before reveal weekly estimate how well you know your money`.

## I26 Ghost race

- **Verdict: NEW-TWIST**
- **Scores:** impact 3, uniqueness 3, effort 2
- **Blockers:** index price history needs a data source whose licence allows display; a savings ghost
  needs historical rates. Numeris shows only supplied figures, so a ghost is honest only if every input
  price is real.
- **What exists:** Sharesight benchmarks a portfolio against any stock, ETF or fund, "assumes a common
  investment amount and start date"; Portfolio Performance (open source) benchmarks too; DCA calculators
  (TipRanks, Trading Digits) run hypothetical DCA on typed-in parameters.
- **What is new:** the ghost replays the user's exact cash flows under a rule they did not follow
  (DCA, never sell), including on savings, shown as a race. The benchmark tools found use a common start
  amount, not the user's own flows.
- **Evidence:**
  - https://www.sharesight.com/blog/benchmark-your-portfolio-against-any-stock-etf-or-fund/ (loaded: "assumes a common investment amount and start date")
  - https://help.portfolio-performance.info/en/how-to/benchmarking/ (seen in results)
  - https://www.tipranks.com/personal-finance/investing-and-retirement/dollar-cost-averaging (seen in results)
- **Searches:** `portfolio tracker compare actual performance vs if you had just bought index "what if" your own trades`;
  `"if you had" dollar cost averaged instead app compares your actual investing history versus DCA strategy`.

## I27 Guess the bill

- **Verdict: NEW-TWIST**
- **Scores:** impact 2, uniqueness 3, effort 1
- **Blockers:** none. Only works for variable bills (energy, phone overage); fixed subscriptions make it trivial.
- **What exists:** BillWise forecasts future bills itself and awards XP and streaks for paying on time;
  utility meter apps forecast bills from readings.
- **What is new:** the user guesses before the bill lands and is scored on closeness. Not found.
- **Evidence:**
  - https://apps.apple.com/us/app/billwise-bill-payment-tracker/id6761624748 (loaded: app forecasts; XP for on-time payment, not for guessing)
  - https://play.google.com/store/apps/details?id=com.trendmobile.metering&hl=en_US (seen in results)
- **Searches:** `app guess your bill before it arrives game streak utilities`;
  `gamified bill prediction guess electricity bill amount app`.

## I28 Market-maker mode

- **Verdict: NEW-TWIST**
- **Scores:** impact 2, uniqueness 4, effort 2
- **Blockers:** must stay points-only. Any real-money or prize stake on an uncertain outcome risks being
  betting under the UK Gambling Act 2005. Niche audience.
- **What exists:** "Make me a market" drills on trivia and Fermi questions (TradingInterview.com, over 550
  facts), Tradermath, Anazac.
- **What is new:** the underlying is the user's own month-end balance, marked to the real outcome.
- **Evidence:**
  - https://www.tradinginterview.com/courses/market-making/quizzes/market-making-game/ (seen in results)
  - https://www.tradermath.org/knowledge-base/make-me-a-market-guide (seen in results)
  - https://anazac.io/market-making (seen in results)
- **Searches:** `app quote bid ask market making game on personal predictions trading interview practice`;
  `"market making" game own life estimates confidence interval app Jane Street style practice`.

## I29 NFC jars

- **Verdict: NEW-TWIST**
- **Scores:** impact 2, uniqueness 3, effort 2
- **Blockers:** iOS reads NDEF URL tags in the background and can open a universal link without an
  entitlement, but in-app tag writing needs the Core NFC entitlement and a native Capacitor plugin. Cheap
  stickers (about 15 USD per the Finny guide). Opening a pot cannot move money.
- **What exists:** a DIY guide to logging expenses by tapping an NFC sticker that triggers an iOS Shortcut;
  Cash App Tags (NFC accessories for paying).
- **What is new:** a finance app that ships tags as first-class objects: one opens a pot, one logs a cash
  spend, one shows a single figure.
- **Evidence:**
  - https://getfinny.app/blog/nfc-expense-tracker-iphone-shortcut-2026 (loaded: DIY Shortcuts method; Finny itself does not support tags)
  - https://cash.app/tags (seen in results)
- **Searches:** `NFC tag savings jar app tap phone log cash expense`;
  `budgeting app NFC tag open savings pot envelope show balance tap sticker`.

## I30 Desk readout

- **Verdict: EXISTS**
- **Scores:** impact 2, uniqueness 1, effort 2
- **Blockers:** hardware (TRMNL device or a spare laptop). The API endpoint that feeds it must be
  authenticated without leaking a long-lived token onto a device.
- **What exists:** ynable.me puts a YNAB budget dashboard on a TRMNL e-ink screen, "always visible... no
  phone required", with balance and split layouts; a TRMNL "YNAB Monthly Budget" recipe; InkyPi and Inkycal
  for general e-paper dashboards.
- **What is left:** showing Numeris's own safe-to-spend or zero-day figure is a TRMNL plugin, not a new idea.
- **Evidence:**
  - https://ynable.me/ (loaded)
  - https://trmnl.com/recipes/13998 (seen in results)
  - https://github.com/fatihak/InkyPi (seen in results)
- **Searches:** `e-ink display bank balance budget dashboard YNAB TRMNL plugin`;
  `e-paper desk display shows daily budget safe to spend github`.

## I31 Morning slip

- **Verdict: NEW-TWIST**
- **Scores:** impact 2, uniqueness 2, effort 2
- **Blockers:** hardware (a thermal printer plus a Raspberry Pi or a networked ESC/POS printer).
  A printed balance left on a printer is a privacy exposure in a shared flat.
- **What exists:** Briefer (Raspberry Pi Zero + thermal printer, open source daily briefing); 9999years
  daily-report (receipt-printer briefing incl. stock indices, no personal finance); aaron64 rpi receipt printer.
- **What is new:** the slip carries the user's own money figures. Small twist on a well-trodden maker project.
- **Evidence:**
  - https://daily.dev/posts/this-maker-built-a-daily-briefing-printer-with-a-raspberry-pi-zero-and-the-code-is-open-source-abgdp7bds (seen in results)
  - https://github.com/9999years/daily-report (loaded: stock prices only, no bank balances or budgets)
  - https://github.com/aaron64/rpi-reciept-printer (seen in results)
- **Searches:** `thermal receipt printer morning daily briefing prints budget finances`;
  `Little Printer daily receipt printer personal finance balance github`.

## I32 Printed month

- **Verdict: NEW-TWIST**
- **Scores:** impact 2, uniqueness 4, effort 3
- **Blockers:** per-copy print and postage cost (Lulu/Prodigi-type print-on-demand API); holding a postal
  address; mailing financial data is a data-protection and interception risk. Designing print-grade maps is
  the bulk of the work.
- **What exists:** paper bank statements by post (lists of transactions); Etsy printable monthly finance
  review templates (blank); print-on-demand services able to print one copy.
- **What is new:** an automatically generated, designed booklet of the user's own month, posted. Not found.
- **Evidence:**
  - https://www.seattletimes.com/business/dont-write-off-paper-bank-statements-just-yet/ (seen in results)
  - https://www.etsy.com/listing/1398622168/monthly-financial-review-printable (seen in results)
  - https://blog.lulu.com/magazine-printing/ (seen in results)
- **Searches:** `printed monthly personal finance report booklet mailed to you spending summary print`;
  `print your year in spending book personal data printed annual report service`;
  `personal data printed monthly magazine from your own data mailed print-on-demand zine app`;
  `bank sends printed paper spending report monthly post infographic statement customers`.

## I33 Wrist count

- **Verdict: NEW-TWIST**
- **Scores:** impact 2, uniqueness 3, effort 4
- **Blockers:** needs a native watchOS app (Swift, WatchConnectivity); Capacitor does not build for
  watchOS. N taps for N days is unusable past about 15; needs an encoding like Taptic Time's long/short taps.
- **What exists:** Apple's Taptic Time tells the time as wrist taps (long taps for tens, short for units,
  or Morse); haptic timer apps.
- **What is new:** encoding a money figure (days to zero) as taps. Not found.
- **Evidence:**
  - https://support.apple.com/guide/watch/tell-time-with-haptic-feedback-apd2c755c294/watchos (seen in results)
  - https://www.cultofmac.com/how-to/apple-watch-taptic-time (seen in results)
  - https://apps.apple.com/us/app/haptic-pulse-timer/id6760047473 (seen in results)
- **Searches:** `Apple Watch haptic taps count days tell time without looking Taptic Time budget`;
  `watch app haptic vibration number pattern countdown days remaining no screen`.

## I34 Ask aloud

- **Verdict: EXISTS**
- **Scores:** impact 4, uniqueness 2, effort 3
- **Blockers:** Siri needs App Intents in a native Swift extension (Capacitor plugin work). A spoken
  answer must only use supplied figures. IRIS path is local and falls under the IRIS corpus rule.
- **What exists:** SpotFunds: "Hey Siri, ask SpotFunds if I can do happy hour Friday", answered from its
  Ready-to-Spend figure, but from manual logging with no bank connection. YNAB exposes category balances
  to Siri and Spotlight.
- **What is left:** answering from bank-synced safe-to-spend plus upcoming bills, and through IRIS as well
  as Siri. An execution difference, not a new mechanic.
- **Evidence:**
  - https://apps.apple.com/us/app/spotfunds-spending-budget/id908020085 (loaded: Siri question quoted; no bank connection)
  - https://apps.apple.com/us/app/safe-to-spend/id6758524287 (seen in results)
  - https://getfinny.app/blog/ask-siri-about-spending-ios-27 (seen in results)
- **Searches:** `Siri "can I afford" budgeting app voice ask safe to spend`; plus the SpotFunds listing fetch.
  Only one distinct search query was run for this idea; the second check was loading the listing.

---

## URLs that failed to load

- https://www.revolut.com/blog/post/hit-savings-goals-faster-with-group-vaults/ (HTTP 403)
- https://menot.app/ (loaded but returned only the page title; no feature content)
