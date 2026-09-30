# Novelty check A: Ideas I01-I17 (30 Sep 2026)

Method: at least two web searches per idea, then the key pages loaded with a fetch where
possible. "Loaded" means the page was fetched and the quoted text came from it; "in results" means
the claim is from a search-result listing only (the page itself was not fetched or failed). A negative
finding only covers the searches listed under each idea; niche App Store listings are the most likely
place a miss could hide.

Scores are 1-5. Impact = how much it would change a student's relationship with money. Uniqueness =
after the search. Effort: 1 = about a week for one developer on the existing React/Capacitor +
Express/Postgres stack; 5 = months, or needs hardware, an OS entitlement or a licence.

---

## I01 Zero day

**Verdict: NEW-TWIST.** Forward balance projection that shows the low point, or the day money gets
tight, is common. What is new is making a single run-out date (before the next income, e.g. the next
loan instalment) the headline figure, moving live with spending, instead of a balance chart.

Scores: impact 5, uniqueness 2, effort 2.

Blockers: none technical. Needs the next income date (student loan instalment dates are known but
the user must confirm them). Must show no date when the data cannot support one (hard rule).

Evidence:
- Wiggle Budget (loaded): "computes a running balance for every day ahead and shows the highest and
  lowest points"; "the day money gets tight is visible weeks before it arrives". No bank link.
  https://wigglebudget.com/
- Bill Budget Calendar Forecast (loaded): "Real-time projected balance for every day ahead", alerts
  when cash is running low. https://apps.apple.com/us/app/bill-budget-calendar-forecast/id6742382846
- Runway by Cash Runway (in results only; Play page did not render): "predict how long your money will
  last". https://play.google.com/store/apps/details?id=com.cashrunway.app&hl=en_US
- SteadyPay blog (loaded) describes "personal runway ... how many days until there's no more cash and
  will this happen before payday?" as a feature "we haven't seen". Undated in fetch; supports that the
  date-as-headline framing is uncommon. https://steadypay.co/blog/know-your-personal-runway
- Cash Flow Calendar guide (loaded): PocketSmith and Simplifi show projected balances and low-balance
  alerts, but "doesn't explicitly state that any app displays an exact 'money runs out date'".
  https://www.cashflowcalendar.app/blog/paycheck-paycheck-budgeting-app

Searches: "budgeting app shows date money runs out before next payday forecast"; "\"runway\" days
until broke personal finance app student loan payment"; "\"money will run out\" date app student loan
instalment budget".

## I02 Money weather

**Verdict: NEW-TWIST.** Weather framing and 30-day balance forecasts both exist. A per-day
probability of overdraft computed from the variance of the user's own spending was not found in any
named shipping app.

Scores: impact 3, uniqueness 3, effort 2.

Blockers: statistical honesty. A probability computed from a short history is weak; the "never show a
figure the data did not supply" rule means the method and sample size must be visible. Centinel argues
probabilistic overdraft forecasts are unreliable (a design risk, not a blocker).

Evidence:
- Bill Budget Calendar Forecast (loaded): "Daily forecast notifications give you a quick weather-style
  summary of your financial outlook - like 'Clear Skies' when you're on track."
  https://apps.apple.com/us/app/bill-budget-calendar-forecast/id6742382846
- Centinel overdraft round-up (loaded): of Centinel, Simplifi, PocketSmith, Monarch, Brigit, Dave,
  Copilot, Rocket Money, YNAB and others, none uses probability-based overdraft prediction; all are
  deterministic. https://www.centinelmoney.com/resources/best-apps-that-predict-overdrafts
- An Alibaba "product insights" page (in results only) describes AI apps simulating "500+ cash flow
  paths" with "a 74% probability your balance dips below $0" but names no product.
  https://www.alibaba.com/product-insights/ai-powered-budgeting-app-with-predictive-cash-flow-vs-spreadsheet-forecasting-which-prevents-overdraft-surprises-more-often.html

Searches: "personal finance app \"chance of overdraft\" forecast probability cash flow"; "money weather
forecast app spending \"weather\" metaphor budget".

## I03 Branches

**Verdict: NEW-TWIST.** Side-by-side what-if scenarios exist, and so does comparing actual progress
against earlier projections. New: the git model as a whole: a branch that keeps projecting beside
reality from real transaction data, a diff view, an explicit "merge" when the change happens in real life,
and then scoring whether the branch's prediction held.

Scores: impact 3, uniqueness 2, effort 3.

Blockers: none external. The hard part is the scoring after a merge: it needs a frozen snapshot of the
projection.

Evidence:
- ProjectionLab what-if (loaded): "'What If' scenarios let you test adjustments to your financial plan
  and compare them to your baseline", original plan shown dashed with the adjusted plan overlaid.
  https://projectionlab.com/help/using-what-if
- ProjectionLab home (loaded): "Journal and visualize your actual progress over time and compare
  against your initial projections." https://projectionlab.com/
- PocketSmith (loaded): "create multiple scenarios for each account to model future financial
  outcomes". https://www.pocketsmith.com/tour/what-if-scenarios/
- PocketSmith help (in results): secondary scenarios model "what-if scenarios" against the forecast.
  https://learn.pocketsmith.com/article/1248-everything-you-need-to-know-about-scenarios-in-pocketsmith

Searches: "what-if scenario personal finance app compare projection with actual reality after
decision"; "ProjectionLab OR PocketSmith scenarios \"what if\" branch forecast compare".

## I04 Sealed letters

**Verdict: NEW-TWIST.** Time capsule apps that unlock by date, location or friends exist. Unlocking
on a condition in the user's own financial data (net worth crosses a threshold, loan repaid) was not
found.

Scores: impact 2, uniqueness 4, effort 1.

Blockers: none. The unlock condition must be evaluated on real data only.

Evidence:
- TimeCapsules (loaded): unlock modes "open on a specific date and time", "open only when you return
  within 100 meters", "Shared capsules that unlock together with friends".
  https://apps.apple.com/us/app/timecapsules/id6755395078
- Future Self Capsule, Time Capsule - Dear Future (in results): date-only unlock.
  https://play.google.com/store/apps/details?id=com.game.pg_timecapsule&hl=en ,
  https://apps.apple.com/us/app/time-capsule-dear-future/id6759238092
- Monzo community (in results): a request for "Saving Pots that unlock when you reach your target",
  which is about money locking, not messages.
  https://community.monzo.com/t/saving-pots-that-unlock-when-you-reach-your-target/198086

Searches: "time capsule letter to future self unlocks when savings goal reached app"; "finance app note
to future self opens when net worth milestone reached"; "savings goal app \"message\" unlock reward when
goal reached \"future you\" letter Qapital OR Monzo OR Plum".

## I05 Return clock

**Verdict: EXISTS.** Return-window trackers with live countdowns and automatic receipt capture are
shipping. The only new part is creating the countdown from a bank card transaction rather than a
receipt, plus a refund request from the countdown.

Scores: impact 2, uniqueness 1, effort 2.

Blockers: data. Under the UK Consumer Contracts Regulations the 14-day cancellation period for goods
normally runs from delivery, which card data does not show. Counting from the transaction date would
display a figure the data did not supply. Merchant or email data is needed. (The regulation detail is
from domain knowledge; it was not re-checked in this search.)

Evidence:
- Return Track (loaded): "live countdown timers", alerts "3 days before, 1 day before, and on the
  deadline", AI receipt scan; no refund-request feature.
  https://apps.apple.com/us/app/return-track/id6758237021
- Return.email (in results; Play page did not render): "keeps an eye on your return deadlines",
  receipts "captured automatically".
  https://play.google.com/store/apps/details?id=software.actually.return_app&hl=en_US
- SimplyWise (in results): return-deadline reminders based on store policies, email receipt import.
  https://apps.apple.com/us/app/simplywise-receipts-expenses/id1538521095
- Return Reminder: KeepOrReturn, RefundMyStuff (in results).
  https://apps.apple.com/us/app/return-reminder-keeporreturn/id6778575025 , https://refundmystuff.com/

Searches: "app track online purchase return window countdown reminder deadline"; "bank app return
reminder purchases \"return window\" card transaction automatic"; "return window tracker automatically
from email receipts or bank transactions app".

## I06 My inflation

**Verdict: EXISTS.** Personal grocery inflation from the user's own receipts, compared with the
official rate, is a shipping feature. Truflation offers a personal calculator against national figures.
Doing it from bank transactions is a variant, and a weaker one: card data has merchant and amount but no
item or quantity, so a merchant's spend rising is not a price rising.

Scores: impact 3, uniqueness 1, effort 3 (item-level data would need receipt scanning).

Blockers: data. Without item-level receipts the result is spend growth, not inflation. Presenting it as
inflation would break the hard rule.

Evidence:
- Grocery Tracker: Receipt Scan (loaded): "Your personal grocery inflation - from your own receipts,
  compared with the official rate". https://apps.apple.com/us/app/grocery-tracker-receipt-scan/id6753721422
- Groceries Tracker (in results): unit price history per item across stores. https://groceriestracker.com/
- Truflation personal calculator (loaded): "personalized" rate from "your spending habits" vs national
  averages; input method not stated. https://truflation.com/calculator
- Emma blog (in results): explains how to calculate a personal inflation rate. It is guidance, not a feature.
  https://emma-app.com/blog/how-to-calculate-your-personal-inflation-rate

Searches: "personal inflation rate calculator from your own transactions app"; "Emma OR Monzo OR
Moneyhub \"personal inflation\" rate feature bank data"; "app tracks grocery item prices from your
receipts over time personal price increase".

## I07 Midnight ledger

**Verdict: NEW-TWIST.** Time-of-day impulse pattern detection exists (late-night clusters). Joining
spend with sleep data from Apple Health was not found in any finance app. General correlation trackers
(Exist) do not surface money in the pages loaded.

Scores: impact 3, uniqueness 4, effort 3.

Blockers: HealthKit needs a native Capacitor plugin and a HealthKit entitlement (standard, not
approval-gated) plus App Review scrutiny of health-data use. Timestamps: card transaction times from
open banking may be posting times, not purchase times; night flags need a reliable authorisation
timestamp. Small samples make correlations fragile.

Evidence:
- HabitIt blog (loaded): its pattern detection reports "Your unplanned buys are mostly between
  10pm-midnight and spike on Fridays". https://habitit.app/blog/top-apps-to-stop-impulse-spending
- Exist.io use cases (loaded): health, mood and productivity correlations; "no information about money,
  spending". https://exist.io/blog/use-cases/
- Sleep apps with Apple Health (in results) show no finance link: https://apps.apple.com/us/app/rise-sleep-tracker/id1453884781
- Background evidence for the link (in results): surveys on late-night shopping.
  https://www.moneywellness.com/blog/sleep-deprived-and-impulse-buying-how-to-stop-spending-at-2am

Searches: "late night spending tracker app flags purchases after midnight"; "app correlates spending
with sleep data Apple Health"; "Exist.io OR Gyroscope correlation spending money sleep mood tracker
integration".

## I08 Week close

**Verdict: NEW-TWIST.** Review queues (Copilot "To Review"), weekly review screens (Weekly) and
locked reconciled transactions (YNAB) exist. New: a timed weekly ritual that ends in a sealed,
hash-locked week where later edits show as dated amendments, as in an accountant's journal. Period close
with append-only amendments exists in business accounting software, not in consumer apps found.

Scores: impact 3, uniqueness 3, effort 2.

Blockers: bank data is revised after the fact (pending to settled amounts, late postings, refunds),
so the design must route those into amendments, not reject them.

Evidence:
- Copilot Money help (in results): "The To Review section ... displays all new transactions that have
  been imported but have not been marked as reviewed". https://help.copilot.money/en/articles/6045480-dashboard-tab-overview
- YNAB (in results): "Once transactions have been reconciled in YNAB, they are locked and marked with a
  green lock icon." https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys
- Weekly app (in results; App Store fetch returned HTTP 429; homepage loaded says "Review day-to-day
  purchases to stay on track"). https://weeklybudgeting.com/
- Actual Budget open issue "[Feature] Reconcilliation to Lock Transactions" (in results).
  https://github.com/actualbudget/actual/issues/558
- Business accounting (in results): locked periods, append-only corrections that reference the original.
  https://rexi.finance/blog/payment-reconciliation-software/audit-trails-in-financial-reconciliation-software

Searches: "weekly money review ritual app \"weekly review\" budget close week lock transactions";
"personal finance app reconcile lock period prevent edits audit trail amendments"; "YNAB reconciled
transactions locked icon edit warning"; "Copilot Money \"to review\" transactions queue".

## I09 Burn clock

**Verdict: NEW-TWIST.** Lock Screen Live Activities showing a daily allowance exist. A figure that
drains continuously with the clock (today's share prorated by time of day) was not found.

Scores: impact 4, uniqueness 3, effort 3.

Blockers: ActivityKit is native Swift (a widget extension, not a Capacitor web view). A Live Activity
lasts up to 8 hours active (reported as 12 hours in newer iOS), plus up to 4 hours on the Lock Screen,
so it cannot cover a whole day without restarting (push-to-start). A prorated share is a derived figure,
not a balance; it must be labelled as such under the hard rule.

Evidence:
- BudgetVault (loaded): "Lock Screen Live Activity for at-a-glance daily allowance".
  https://apps.apple.com/us/app/budgetvault-smart-budgeting/id6760205012
- Finny blog (loaded): Live Activity support in finance apps "remains limited"; no app offering a
  daily allowance that depletes with time. https://getfinny.app/blog/live-activities-budget-tracking-iphone-2026
- Weekly safe-to-spend widget (in results): a static home screen widget.
  https://weeklybudgeting.com/the-safe-to-spend-widget/
- Wishlist (GitHub, loaded): an allowance that "accrues continuously" is the inverse mechanic (it grows),
  in a self-hosted project. https://github.com/armanckeser/wishlist
- Live Activity duration (in results): up to 8 h active plus 4 h on the Lock Screen.
  https://infinum.com/blog/live-activities-in-ios-apps/

Searches: "Live Activity lock screen daily budget remaining spending app iOS"; "\"safe to spend\" today
allowance decreases through the day hourly widget app"; "ActivityKit Live Activity maximum duration".

## I10 City rates

**Verdict: NEW-TWIST.** Cost-of-living comparisons exist, but they use city price indices, not the
user's own purchases. Filtering spend by location exists (Monzo). No product found computes an exchange
rate between cities from one person's own receipts ("one London lunch = 3.4 Penang lunches").

Scores: impact 3, uniqueness 4, effort 2.

Blockers: needs enough comparable purchases in each city (category plus merchant-type matching);
otherwise no figure. Location metadata quality varies by bank (MYR/Maybank data is read-only and may lack
location).

Evidence:
- Expatistan (in results): city comparison from "prices of 52 products and services".
  https://www.expatistan.com/cost-of-living
- Expatriation.io budget calculator (in results): estimates for 20 cities from cost indices.
  https://app.expatriation.io/budget-calculator
- Monzo community (loaded; an older thread): search by location gives spend totals per place, "you get a
  list of locations". https://community.monzo.com/t/tracking-spending-by-geographical-location/36630
- Countrywise PPP app (in results): World Bank PPP, not personal data.
  https://tallyroot.com/blog/best-budget-app-for-expats/

Searches: "compare cost of living between cities using your own spending purchases app"; "expat budget
app spending per city location breakdown multi-country purchasing power own receipts"; "spending by city
breakdown app \"spending by location\" map travel Revolut OR Monzo OR Emma".

## I11 Danger zones

**Verdict: NEW-TWIST (close to existing).** A student final-year project on GitHub already does the
core mechanic: it detects a user at a known shopping venue and sends "Shopping budget: RM80 left, you
usually spend RM180 here". It is not a shipping product. New: learning the zones from one's own
history, and showing the figure silently on the lock screen rather than as a notification.

Scores: impact 3, uniqueness 2, effort 4.

Blockers: iOS "Always" location permission and background geofencing (region monitoring is capped at 20
regions per app); App Review scrutiny for background location. iOS gives no silent lock-screen surface
except a Live Activity or a notification. Starting a Live Activity from the background needs
push-to-start from the server. Card transaction locations are merchant addresses, which vary in
precision.

Evidence:
- SmartSpend (GitHub, loaded): "app checks shopping budget -> budget is low -> Gemini generates a short
  contextual warning", example "you usually spend RM180 here"; a final-year project, not a published app.
  https://github.com/Wx926/Smartspend
- Asper blog (in results) claims "cutting-edge apps" send alerts on entering a store with a limit; it
  names no product. https://asper.app/budgeting-alerts-for-specific-stores-2026-guide/
- Generic location reminders (in results): Geo Alert, AnyList. They are not linked to money.
  https://apps.apple.com/us/app/geo-alert-location-reminders/id6756478131

Searches: "geofence spending alert app when you enter store you overspend at location-based budget
reminder"; "location based budget notification near shop \"location\" alert remaining budget app iOS";
"budgeting app geofencing \"overspend\" warn when near shops you usually spend at".

## I12 Cap tracker

**Verdict: NEW-TWIST.** TfL's own TfL Go app (May 2026 update) shows when a daily or weekly cap has
been reached and which daily cap is likely to apply. Not found: "your next N journeys are free" or
"walk and avoid breaking the cap", and nothing does it from bank data.

Scores: impact 2 (London only), uniqueness 2, effort 3.

Blockers: data. TfL aggregates a day's contactless journeys into one charge that reaches the bank
"within three days of travel", so card data cannot track a cap during the day. There is no public API
for an individual's journey history; the only route is the emailed weekly CSV. Real-time cap tracking
from card data is therefore impossible; only after-the-fact weekly-cap reasoning is possible.

Evidence:
- ianVisits, 6 May 2026 (loaded): users "can now see in the app when they have reached a daily or weekly
  fare cap" and "which daily fare cap is likely to apply ... based on their recent travel history".
  https://www.ianvisits.co.uk/articles/tfl-go-app-update-adds-live-bus-tracking-and-fare-cap-alerts-89468/
- Barclays (loaded): "You'll only see one charge for each day you travel because TfL add up all the
  journeys that day into one fare"; "within three days of travel".
  https://www.barclays.co.uk/help/cards/contactless/when-charged/
- TfL tech forum (loaded): no API for individual journey history; email CSV statements only.
  https://techforum.tfl.gov.uk/t/is-there-any-api-for-accessing-individual-tfl-customer-daily-journey-with-details/371

Searches: "TfL contactless cap tracker app daily weekly cap progress"; "TfL Go app \"capping\" how close
to cap journeys free"; "TfL contactless journey history API third party developers open data"; "TfL
contactless charge appears on bank statement next day aggregated daily charge".

## I13 Border mode

**Verdict: NEW-TWIST.** Arrival-in-country detection exists (Revolut welcome message). Card routing by
rule exists (Curve Smart Rules), but only by merchant category or amount, per the loaded page. Ranking the
user's own cards by what they will cost in this country (FX margin, fees) and saying "tap this one" was
not found. Credit card comparison sites rank cards generically.

Scores: impact 3, uniqueness 3, effort 3.

Blockers: needs a maintained fee table per card product (FX margin, ATM and non-sterling fees), which
banks do not expose via open banking. The app cannot route the payment (it cannot move money), so it can
only advise.

Evidence:
- Curve Smart Rules (loaded): "Create rules by merchant category ... by transaction amount"; no
  location, currency or country condition. https://www.curve.com/smart-rules/
- Revolut / Monzo (in results): "Revolut sends a welcome SMS when you arrive in a new country".
  https://community.monzo.com/t/notifications-and-travelling-abroad-with-monzo/24873
- Curve blog (in results): route any card through Curve to avoid FX fees (a product, not a ranking).
  https://www.curve.com/blog/travel/how-to-use-your-credit-cards-abroad-without-paying-fees/

Searches: "app recommends which card to use abroad lowest FX fee when you travel detects country"; "\"best
card to use\" abroad app ranks your cards by foreign transaction fee location"; "Curve Smart Rules
automatically choose card foreign currency transactions"; "Curve Smart Rules location rule country card".

## I14 Walked fares

**Verdict: NEW-TWIST.** Citymapper has shown money saved by walking since 2011, but against driving or
taxis and per planned trip. Pay-to-walk apps reward steps with points. Not found: detecting that you
walked a route you usually ride and showing the specific fare not paid.

Scores: impact 2, uniqueness 3, effort 3.

Blockers: inference risk. Pedometer (CoreMotion) or HealthKit steps plus location are needed to know the
route. "The fare you did not pay" is a counterfactual, not a number the bank data supplied; it conflicts
with the hard rule unless it is clearly marked as an estimate from the user's own past fares.

Evidence:
- Londonist, 2011 (in results): "CityMapper Shows Quickest Routes, Costs And Calories".
  https://londonist.com/2011/10/citymapper-shows-quickest-routes-costs-and-calories
- Search-result summary (in results): Citymapper tracks "calories burned, trees preserved, and money
  saved". https://www.pilotplans.com/blog/citymapper-review
- Sweatcoin, WeWard, Walkify (in results): steps turned into rewards, not into avoided fares.
  https://apps.apple.com/us/app/sweatcoin-walking-step-counter/id971023427

Searches: "app suggests walking instead of bus to save fare money saved by walking tracker"; "\"walk\"
steps converted to money saved on transport fares app"; "steps walked instead of taking transit money
saved app HealthKit commute"; "Citymapper walking route shows money saved fare vs walk calories".

## I15 Friction dial

**Verdict: NEW-TWIST.** Screen Time API app blockers that target shopping exist, but they are driven
by time windows (Shop Locked) or habits (Habit Doom). Blocking apps automatically when a real
spending category's budget runs out was not found. Finny recommends setting up Screen Time limits by hand.

Scores: impact 4, uniqueness 4, effort 4.

Blockers: FamilyControls (Distribution) entitlement needs a separate Apple application per bundle ID
and extension; approval takes days to weeks, with reported stuck requests. Apple wants a
"parental-control or digital-wellbeing use case". Needs native Swift (ManagedSettings shields) outside
Capacitor. Budget state must reach the device (silent push) to re-shield promptly.

Evidence:
- Shop Locked (loaded): "Set your shopping window ... Outside that window? They're blocked." No budget
  or bank link. https://apps.apple.com/us/app/shop-locked-shopping-lock/id6758680339
- Finny blog (loaded): no automatic blocking; advice is "Give online shopping its own monthly limit" in
  Screen Time. https://getfinny.app/blog/focus-mode-stop-impulse-spending
- Habit Doom, Opal (in results): OS-level blocks via FamilyControls, not linked to money.
  https://habitdoom.com/blog/screen-time-ios-alternatives-2026
- Entitlement process (in results): https://newly.app/how-to/family-controls-entitlement ,
  https://developer.apple.com/forums/thread/809208

Searches: "budget app Screen Time FamilyControls block shopping app when budget exceeded"; "app blocks
Uber Eats Deliveroo when food delivery budget spent bank linked"; "iOS app locks shopping apps until
payday budget spending blocker Screen Time API 2026"; "Apple Family Controls entitlement request
distribution approval developer".

## I16 Wait list

**Verdict: EXISTS.** Several shipping apps do the core mechanic of sharing a link and waiting 72
hours, and some add price tracking. The only new part is showing the item's effect on the zero day
(I01) at the end of the wait.

Scores: impact 3, uniqueness 1, effort 2.

Blockers: price tracking requires scraping retailer pages (anti-bot measures, terms of service).

Evidence:
- CartPause (loaded): share items "from any store" to start "a customizable timer - 24, 48, or 72
  hours", then an AI coach asks reflection questions. https://cartpause.com/
- Buy or Bye, Holdoff (in results): 72-hour cooling-off.
  https://apps.apple.com/us/app/buy-or-bye-end-impulse-buying/id6756450547 ,
  https://apps.apple.com/us/app/holdoff-impulse-buy-blocker/id6762249977
- Wishlist (GitHub, loaded): per-item cooling-off, "monitors price changes daily", and a 7-day budget
  freeze penalty. https://github.com/armanckeser/wishlist
- Spence (in results): combines affordability, price history and buy-or-wait in iMessage.
  https://www.aibuyorwait.com/

Searches: "wishlist cooling off period app price tracking 30 day rule impulse purchase wait"; "wishlist
impulse wait price history \"can I afford\" budget impact app"; "Spence app pre-purchase affordability
cost-per-use return window price history".

## I17 Cost per hour

**Verdict: NEW-TWIST.** Cost-per-hour and cost-per-use calculators exist (manual hours). Nothing
found fills in usage automatically from Screen Time.

Scores: impact 3, uniqueness 3, effort 5.

Blockers: severe. The DeviceActivityReport extension is sandboxed, so Screen Time usage cannot be
passed to the host app or a server. The figure could only be rendered inside the extension's own view,
so it cannot be stored, trended, or joined server-side. FamilyControls entitlement needed as in I15. Gym
visits are not Screen Time data at all (they would need location or manual check-ins). Spotify
listening on other devices is invisible.

Evidence:
- Subscription True Cost Calculator (in results): "cost per hour of actual use", manual entry.
  https://www.calcscope.com/finance/planning/subscription-true-cost/
- Skip or Buy: Cost Per Use (in results). https://apps.apple.com/us/app/skip-or-buy-cost-per-use/id6759465475
- DeviceActivityReport sandboxing (in results): "intentionally sandboxed so Screen Time data cannot be
  exported to the containing app". https://developer.apple.com/documentation/deviceactivity/deviceactivityreportextension ,
  https://letvar.medium.com/time-after-screen-time-part-2-the-device-activity-report-extension-10eeeb595fbd

Searches: "subscription cost per hour of use app Screen Time cost per use calculator"; "subscription
tracker app uses screen time usage data to show cost per hour automatically"; "Apple
DeviceActivityReport extension cannot export usage data to app server privacy restriction".

---

## URLs that failed to load

- https://play.google.com/store/apps/details?id=com.cashrunway.app&hl=en_US (content truncated, not rendered)
- https://play.google.com/store/apps/details?id=software.actually.return_app&hl=en_US (content truncated)
- https://apps.apple.com/us/app/weekly-budget-planner-app/id1460038809 (HTTP 429)
- https://help.curve.com/en_gb/smart-rules-B1NGA5g5 (heading only, no body)
- Partial: https://truflation.com/calculator (loaded, but the input method was not stated);
  https://www.pocketsmith.com/tour/what-if-scenarios/ (loaded, marketing text only)

Side finding: a search result states Moneyhub has announced closure
(https://moneytothemasses.com/news/best-moneyhub-alternatives). It was not loaded or verified.
