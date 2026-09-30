# Novelty check C: Ideas I35-I50 (30 Sep 2026)

Method: at least two distinct web searches per idea (WebSearch), with the key product pages loaded
(WebFetch) where a claim rests on one. "Loaded" means the page was fetched and read; "search result"
means the claim comes from the search engine's result listing and summary only. Failed loads are
listed at the end. Scores are 1-5: impact (how much it changes a student's relationship with money),
uniqueness (after the search), effort (1 = about a week on the existing React/Capacitor + Express/Postgres
stack; 5 = months, hardware, OS entitlements or a regulated licence).

Summary table

| Id | Verdict | Impact | Unique | Effort |
| --- | --- | --- | --- | --- |
| I35 Voice tags | NEW-TWIST | 3 | 3 | 2 |
| I36 Weekly audio | NEW-TWIST | 2 | 4 | 2 |
| I37 Balance tone | NEW | 2 | 5 | 1 |
| I38 Price lens | NEW-TWIST | 3 | 3 | 3 |
| I39 True scale | EXISTS | 2 | 1 | 4 |
| I40 Shake to hide | EXISTS | 2 | 1 | 1 |
| I41 Tilt to scrub | NEW | 1 | 4 | 2 |
| I42 Face-down | NEW-TWIST | 2 | 4 | 3 |
| I43 Money in the question bank | NEW-TWIST | 3 | 3 | 1 |
| I44 Attention price | NEW | 3 | 5 | 3 (him) / 5 (general iOS) |
| I45 Cards from your own money | NEW | 4 | 4 | 2 |
| I46 Deadline budgets | NEW-TWIST | 3 | 4 | 3 |
| I47 Owed-to-you radar | NEW-TWIST | 4 | 3 | 4 |
| I48 Deposits as assets | NEW-TWIST | 3 | 3 | 2 |
| I49 Energy to pounds | EXISTS | 2 | 2 | 3 |
| I50 Warranty from payment | NEW-TWIST | 3 | 3 | 2 |

---

## I35 Voice tags

Verdict: **NEW-TWIST**. Voice expense entry is a crowded category, but every product found creates a
new manual entry from speech. None found matches a spoken note to an existing bank-feed transaction by
time and writes it back as that transaction's note and category.

Scores: impact 3, uniqueness 3, effort 2.

Blockers: open-banking transactions can arrive hours after the payment, so matching has to be deferred
(hold the note, match when the feed lands) rather than done at recording time. Speech capture in a
Capacitor web view needs a native speech plugin or a server-side Whisper call. If two payments fall
within the matching window, the app has to ask which one rather than guess.

Evidence:
- MonAi: log expenses by speaking, with automatic category detection (search result): https://get-monai.app/ and https://apps.apple.com/us/app/expense-tracker-monai/id6447112647
- Vocash, moneasy, SpendVoice: speak an expense, AI fills amount, category, store and date (search results): https://apps.apple.com/us/app/vocash-ai-expense-tracker/id6752502696 , https://apps.apple.com/us/app/moneasy-ai-expense-tracker/id6742516728 , https://apps.apple.com/us/app/spendvoice-ai-expense-tracker/id6760256014
- Loaded https://apps.apple.com/us/app/ledgy-voice-expense-tracker/id6761738170. The page it returned was titled "Manilo", not Ledgy. It does voice dictation of new entries plus Apple Wallet auto-logging, and has no matching of voice notes to bank transactions.
- Monarch: notes on a transaction are typed in the transaction detail view (search result): https://help.monarch.com/hc/en-us/articles/360056422791-Adding-Notes-and-Attachments-to-a-Transaction
- Monzo: notes and #tags on transactions are typed. The old Siri payments integration was removed (search results): https://monzo.com/blog/monzo-business-how-to-add-information-to-transactions , https://www.pymnts.com/news/mobile-payments/2016/monzo-adds-siri-to-app/

Searches run: "budgeting app voice note tag transaction after payment matched automatically"; "voice
expense tracker app speak transaction category note AI app store"; "add note to bank transaction by
voice Siri shortcut Monzo OR Copilot OR Monarch"; "Copilot Money OR Monarch Money voice note transaction
AI assistant add note by talking".

## I36 Weekly audio

Verdict: **NEW-TWIST**. Weekly written recaps exist (Monarch, Erica), a finance assistant speaks in
conversation (Cleo), and generic "turn any content into a private podcast on RSS" tools exist. None
found produces a spoken weekly briefing from the user's own transactions, delivered as an episode in
their podcast app.

Scores: impact 2, uniqueness 4, effort 2.

Blockers: a podcast RSS feed carrying personal financial audio needs an unguessable, per-user,
revocable URL. Some podcast apps fetch feeds through their own servers (not verified in this search),
so the audio may leave the device. The script must be templated from data the API supplied, never
free-generated, to respect the "never show a figure the data did not supply" rule.

Evidence:
- Monarch uses LLMs for "an AI assistant, AI-powered insights, weekly recap..." (search result summary of https://help.monarch.com/hc/en-us/articles/37526856682260-AI-in-Monarch ; the direct load returned 403).
- Erica gives "a weekly snapshot of their month-to-date spending" (search result): https://info.bankofamerica.com/en/digital-banking/erica
- Cleo Voice Mode: "speak naturally with their financial assistant", i.e. conversational and not a scheduled briefing (loaded): https://elevenlabs.io/blog/cleo
- personalized-podcast: "Turn any content into a personalized AI podcast... Listen in Apple Podcasts, Spotify, or any podcast app", with an optional RSS feed. Generic, not finance (loaded): https://github.com/zarazhangrui/personalized-podcast
- A search for bank or budgeting apps (Monzo, Revolut, Emma) with audio recaps returned nothing.

Searches run: "finance app weekly spending summary podcast audio briefing generated from your
transactions"; "AI generated personal podcast from your own data weekly finances text-to-speech RSS
feed"; "Cleo OR Erica audio spoken weekly spending recap voice briefing"; "bank app spending audio
summary listen Wrapped OR recap podcast Monzo Revolut Emma".

## I37 Balance tone

Verdict: **NEW**. No consumer finance app was found that sonifies a balance or runway. Only
financial-data sonification patents and generic data-to-sound tools turned up.

Scores: impact 2, uniqueness 5, effort 1.

Blockers: none technical (Web Audio works in the web view). It must respect the iOS silent switch and
have an off switch. A pitch scale has to be learned before it means anything, so it needs a reference
tone or a short legend.

Evidence:
- US patents "System and method for musical sonification of data" (applied to financial models) and a "Personal audio assistant" patent that maps stock prices to pitch (search results): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7138575 , https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11450331
- TwoTone, a general data-sonification tool, is not finance-specific (search result): https://medium.com/@smfrogers/sonification-make-beautiful-music-with-your-data-d8fd59b84f3f
- A search for "personal finance sonification balance sound tone app" found only apps with button sounds (for example https://apps.apple.com/us/app/financial-sound-calculator/id1278557464).

Searches run: "personal finance sonification balance sound tone app"; "sonification bank account OR
budget OR net worth hear your finances".

## I38 Price lens

Verdict: **NEW-TWIST**. Pointing a camera at a price tag for live currency conversion is common, and
so is converting a scanned price into hours of work. Two parts were not found anywhere: expressing the
price in days of the user's own safe-to-spend, and showing what the user last paid for that item.

Scores: impact 3, uniqueness 3, effort 3.

Blockers: live OCR needs a native plugin (Apple Vision or ML Kit), because Capacitor's web view camera
is not suited to real-time text recognition. "What you last paid" needs item-level data, which bank
transactions do not carry (they are merchant-level), so it only works for items captured by receipt
scanning. Otherwise that line must be absent, not estimated.

Evidence:
- Price Cam: "point your camera at a price tag, menu, or bill" and see it converted (search result): https://apps.apple.com/us/app/price-cam-currency-converter/id6458732233
- The iOS Camera and Live Text built-in currency conversion (search result): https://www.macrumors.com/how-to/convert-currencies-with-iphone-camera-photos/
- ConvertPad+ and Video Currency Converter do live price-tag OCR on Android (search results): https://play.google.com/store/apps/details?id=com.convertpad.plus&hl=en_US , https://play.google.com/store/apps/details?id=cz.mobilecity.videocurrencyconverter&hl=en_US
- WorthIt: Time Cost Calculator has an "Instant Price Scanner" that converts a price tag into hours of work from the user's income. This is the closest prior art to "days of safe-to-spend" (search result): https://play.google.com/store/apps/details?id=com.price.worthit&hl=en

Searches run: "camera currency converter app point at price tag live conversion"; "scan price tag app
shows price in hours of work OR cost in hours camera".

## I39 True scale

Verdict: **EXISTS**. MoneyLion shipped "Grow Your Stack" in 2017 on ARKit, showing the customer's
account balance as stacks of cash in the real world. Web 3D cash visualisers also exist. Debt shown the
same way is a small variant.

Scores: impact 2, uniqueness 1, effort 4.

Blockers: iOS WebKit has no WebXR, so a Capacitor web view cannot do true AR. The options are a native
ARKit plugin or AR Quick Look with a generated USDZ file, which runs outside the app's UI.

Evidence:
- MoneyLion "Grow Your Stack": "a visual representation of their account balance as stacks of cash projected over the customer's view of the real world", launched with iOS 11 (search result summaries): https://digiday.com/marketing/personal-finance-app-moneylion-experimenting-augmented-reality/ , https://tearsheet.co/modern-banking-experience/personal-finance-app-moneylion-is-experimenting-with-augmented-reality/ (tearsheet loaded, but the body is paywalled; the loaded page confirms "MoneyLion is using iOS 11's ARKit technology to offer an augmented reality feature called Grow Your Stack" and "visualizing account balances"). Also https://bankautomationnews.com/uncategorized/moneylions-new-augumented-reality-feature-on-the-new-iphone-video/
- Money Visualiser shows any amount as 3D bill stacks at physical dimensions, on the web and not in AR (search result): https://moneyvisualiser.com/tools/what-does-x-look-like
- Safari lacks WebXR (search result): https://9to5mac.com/2022/05/09/apple-targeted-for-safari-lacking-webxr-support-despite-companys-ar-vr-ambitions/ ; Capacitor with AR Quick Look: https://ionic.io/blog/augmented-reality-with-capacitor-ar-quick-look

Searches run: "AR app visualize money stack of cash real scale net worth augmented reality"; "ARKit app
million dollars stack of cash augmented reality see how much money looks like"; "MoneyLion augmented
reality Grow Your Stack iOS 11"; "Capacitor WebView ARKit plugin WebXR iOS Safari support augmented
reality".

## I40 Shake to hide

Verdict: **EXISTS**. Revolut blurs balances on a shake or flip, on by default. Spendee and Delta ship
shake-to-hide too.

Scores: impact 2, uniqueness 1, effort 1.

Blockers: none. The iOS shake event and DeviceMotion are available to the web view (DeviceMotion needs
a permission call, not verified here).

Evidence:
- Revolut: "turns your balance blurry any time you quickly shake or flip your phone", setting "Hide balances with a flip gesture", on by default (search result): https://help.revolut.com/help/profile-and-plan/security-and-personal-data/why-is-my-balance-blurry/
- Spendee: "you can quickly hide your balances and transaction amounts with just a shake of your phone" (loaded): https://help.spendee.com/article/250-hide-amounts-on-shake
- Delta: "Shake to enable % holdings" (search result): https://support.delta.app/en/articles/1467773-how-to-hide-your-balances

Searches run: "banking app shake phone to hide balance privacy mode"; "Revolut OR Monzo hide balance
gesture privacy mode swipe tap hide amounts".

## I41 Tilt to scrub

Verdict: **NEW** (in finance). No finance or charting app was found that uses the gyroscope to move
through time. Generic tilt-to-scroll exists (a rooted-Android utility) and parallax tilt is a common UI
technique, so the interaction itself is known. Its use as a time dial on a finance chart is not.

Scores: impact 1, uniqueness 4, effort 2.

Blockers: iOS requires a user-gesture permission for DeviceMotion in the web view (not verified in
this search). It also needs a non-motion alternative for accessibility, and it is easy to trigger by
accident while walking.

Evidence:
- Tilt Scroll: "scroll in many application by just tilting the device", Android and root only (loaded): https://www.xda-developers.com/tilt-scroll/
- Accelerometer-driven parallax and scroll animation as a general technique (search result): https://docs.pandasuite.com/tutorials/how-to/parallax-animations-with-accelerometer/
- The search for gyroscope or tilt scrubbing in stock or finance charts returned only ordinary touch-scrub chart apps (for example https://apps.apple.com/us/app/finance-chart-stock-market/id1537229744).

Searches run: "app gyroscope tilt phone to scrub chart timeline finance OR stock chart"; "tilt to
scroll OR tilt to scrub motion gesture timeline app iOS accelerometer".

## I42 Face-down

Verdict: **NEW-TWIST**. Pre-arming a split so that the next card payment is split exists (Cino), and
post-hoc "split this bill" on a transaction exists (Monzo, Revolut). "Phone face down at the table" is
a known social ritual (phone stacking). Using the face-down posture as the trigger that arms the split
offer was not found.

Scores: impact 2, uniqueness 4, effort 3.

Blockers: iOS does not deliver motion sensors to a backgrounded web view, so the app has to be open
when the phone is put down. The feed can lag, so the offer may come after the table has left. Within
the hard constraint the app can only send payment requests and never move money, which suits a split
request.

Evidence:
- Monzo: split is manual. "Tap on the relevant payment... you should see Split this bill" (loaded): https://monzo.com/help/monzo-with-friends/split-bill
- Cino: set up before paying, and "When you pay with your QuickSplit card, everyone's share will come out of their own personal bank cards" (loaded): https://www.getcino.com/post/split-bill-restaurant
- Phone stacking: phones face down at dinner, and the first to flip pays (search result): https://techcrunch.com/2012/02/04/the-phone-stacking-game-lets-make-this-a-thing/

Searches run: "app phone face down on table triggers mode restaurant bill split OR phone stacking
game"; "banking app suggests split bill after restaurant card payment automatic prompt Monzo Revolut";
"bill splitting app detects restaurant payment and prompts to split automatically notification".

## I43 Money in the question bank

Verdict: **NEW-TWIST**. A review queue for uncertain transactions exists inside finance apps (Copilot
"To Review"). Finance inside a general assistant exists: ChatGPT connects bank accounts via Plaid, but
it is reactive (the user asks). Finance bots post into general channels (YNAB Slack bot), and some apps
expose transactions to AI assistants over MCP. None found pushes the app's own uncertainties, one at a
time, into a general personal question inbox alongside non-finance questions.

Scores: impact 3, uniqueness 3, effort 1 (an endpoint that emits questions and accepts answers; his
system already has the inbox).

Blockers: none technical. Answers must write back idempotently. Stale questions have to be withdrawn
if the user fixes the transaction in the app first.

Evidence:
- Copilot "To Review": "displays all new transactions that have been imported but have not been marked as reviewed" (search result): https://help.copilot.money/en/articles/6045480-dashboard-tab-overview
- ChatGPT personal finance with Plaid: loaded TechCrunch, which says users initiate queries and it "does not indicate proactive alerts or Pulse-style notifications": https://techcrunch.com/2026/05/15/openai-launches-chatgpt-for-personal-finance-will-let-you-connect-bank-accounts/
- YNAB Slack bot posts daily budget updates (search result): https://github.com/joshmenden/ynasb
- The "Ledgy" listing claims MCP access so users can "log, query, and edit transactions from inside your AI" (search result snippet; the loaded page showed a different app name, see failures): https://apps.apple.com/us/app/ledgy-voice-expense-tracker/id6761738170

Searches run: "budgeting app categorize transactions via SMS text message reply or Slack bot one at a
time"; "Copilot Money to review transactions queue swipe categorize"; "ChatGPT connect bank accounts
personal finance Plaid 2026 asks you about transactions".

## I44 Attention price

Verdict: **NEW**. Screen-time blockers exist and so do finance apps, but no product was found that
joins app-check events to card spending and prices the gap. The research link exists: screen time
correlates with impulsivity and delay discounting.

Scores: impact 3, uniqueness 5, effort 3 for his own system (Atrium already has the check log) and 5
for a general iOS product.

Blockers: **iOS Screen Time data cannot leave the DeviceActivityReport extension**. It is sandboxed
with no network access and no shared containers, so a general iOS app cannot compute this. The Family
Controls entitlement is also needed. The result is an association, not a cause, and must be labelled
that way.

Evidence:
- The DeviceActivity sandbox: "Moving Device Activity data outside of your extension's sandbox is not possible" (search result summary): https://developer.apple.com/forums/thread/727958 , https://letvar.medium.com/time-after-screen-time-part-2-the-device-activity-report-extension-10eeeb595fbd
- Screen-time products (ScrollBank, Opal, one sec) do not touch bank data (search results): https://play.google.com/store/apps/details?id=app.scrollbank&hl=en , https://apps.apple.com/us/app/opal-screen-time-control/id1497465230 , https://one-sec.app/
- The PLOS ONE study: smartphone screen time is correlated with choosing smaller immediate rewards (search result): https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0241383
- A blog post on using iPhone Focus and Screen Time against impulse buys (advice, not a measurement product): https://getfinny.app/blog/focus-mode-stop-impulse-spending

Searches run: "screen time app usage correlated with spending study app opens impulse purchase within
minutes"; "app combines Screen Time data with spending bank transactions doomscrolling cost";
"DeviceActivityReport extension cannot send data out sandbox Screen Time API export usage data".

## I45 Cards from your own money

Verdict: **NEW**. Finance flashcard decks exist, but they are generic (Brainscape, Quizlet, an FSRS
finance-terms repo). Finance-literacy apps personalise by level, not by the user's transactions. The
nearest is a classroom lesson titled "What Your Spending Data Says About You", which is not spaced
repetition over the learner's own numbers. No tool was found that generates spaced-repetition cards
from a user's transactions.

Scores: impact 4, uniqueness 4, effort 2.

Blockers: every card answer must come from supplied data. An "FX spread you paid" card needs a
reference mid-rate for that date, so only generate it where the app holds historical rates. Card
generation must be deterministic templates, or an LLM checked against the stored value.

Evidence:
- Financial terminology flashcards with FSRS, generic terms (search result): https://github.com/gjcourt/flashcards
- Brainscape personal-finance decks, user-made and generic (search result): https://www.brainscape.com/subjects/banking-and-finance
- PersonalFinanceLab, lesson "What Your Spending Data Says About You" (search result): https://www.personalfinancelab.com/
- Purpose and Goalsetter: personalised paths by knowledge level (search results): https://play.google.com/store/apps/details?id=com.finApppurpose&hl=en , https://goalsetter.co/

Searches run: "spaced repetition flashcards personal finance generated from your own transactions
Anki"; "financial literacy app quizzes using your own spending data personalized lessons"; "flashcards
generated from bank transactions OR your own spending learn finance concepts app".

## I46 Deadline budgets

Verdict: **NEW-TWIST**. Calendar-triggered budgeting exists as a Zapier recipe: a Google Calendar
event budgets to a YNAB category. Calendar-shaped cash-flow forecasting exists (CalendarBudget), and so
do event budgets for weddings and trips. Forecasting the spending a deadline causes (takeaways, taxis)
from the user's own history around past deadlines was not found.

Scores: impact 3, uniqueness 4, effort 3.

Blockers: a student has few past deadlines, so the forecast sample is small. It must show the basis
(n past deadlines) and not show a figure when there is too little history.

Evidence:
- Zapier: trigger "When a specified amount of time before an event starts" in Google Calendar, action "Budgets to a category in the current month" in YNAB (loaded): https://zapier.com/apps/google-calendar/integrations/ynab/1728608/start-budgeting-for-new-google-calendar-events-by-categorizing-them-in-you-need-a-budget
- CalendarBudget, day-by-day balance forecasting on a calendar (search result): https://calendarbudget.com/
- Event Budget Tracker, a manual per-event budget (search result): https://play.google.com/store/apps/details?id=com.ngoctd.event_budget_tracker&hl=en_US

Searches run: "budget app calendar integration exam week spending forecast event-based budget from
calendar events"; "budgeting app predicts spending spike around calendar events Google Calendar
integration finance app calendar spending insights".

## I47 Owed-to-you radar

Verdict: **NEW-TWIST**. Every component exists separately:
- flight claims found by scanning email (AirHelp) or watching flights (ClaimBox);
- rail Delay Repay detected from forwarded tickets (Railed, which keeps a 10% fee) or automatically by operators for contactless or smartcard users;
- duplicate-charge alerts (Rocket Money, Snoop).

Not found: one radar driven by the user's own bank transactions that covers all of these, shows each
claim's deadline, and points to the free route.

Scores: impact 4, uniqueness 3, effort 4.

Blockers:
- **Data:** a card payment to an airline or train operator does not carry flight number, date of
  travel or journey times. Detection needs a second source (the booking email, a ticket) or the
  user's confirmation, and the delay itself needs external flight or rail data.
- **Regulation:** FCA-regulated claims management covers six categories only: personal injury,
  financial services or financial product claims, housing disrepair, specified benefits, criminal
  injury, and employment. Flight delay (UK261), rail Delay Repay and a tenancy-deposit return are
  not among them, so detecting and signposting those looks out of scope.
- **Duplicate charges are the exception.** A claim against a bank or card issuer is a financial
  services claim, and the regulated activity explicitly includes "identifying a claim or potential
  claim". Presenting a duplicate as a fact ("two identical payments") and linking to the bank's own
  dispute function, as Rocket Money and Snoop do, is the conservative framing. Take legal advice
  before framing it as a "claim". Whether the "by way of business" test applies to a free personal
  app was not confirmed in this search.

Evidence:
- AirHelp: sync Gmail or calendar, then "AirHelp will automatically add your flight details", and past flights are checked for eligibility (search result): https://www.airhelp.com/en/blog/how-to-find-700-in-your-inbox/ , https://news.ycombinator.com/item?id=16175814
- ClaimBox: "Add a flight and ClaimBox tracks it on live data". It watches EU261, UK261 and US DOT thresholds and builds a claim the user sends themselves (loaded; flight entry method not stated): https://claimbox.eighty32.com/
- Railed: "share an email address so Railed can detect ticket purchases and journeys", files Delay Repay and keeps 10% (search result): https://gotrailed.co.uk/
- Operator Auto Delay Repay for Key Smartcard or contactless users (search results): https://www.thameslinkrailway.com/help-and-support/delay-repay/auto-delay-repay , https://www.nfcw.com/2017/07/13/353935/contactless-travel-card-offers-automatic-repayments-delayed-trains/
- Rocket Money alerts on "duplicate charges"; Snoop is "built specifically to spot waste - price hikes, duplicate charges" (search results): https://www.rocketmoney.com/learn/personal-finance/tracking-expenses-with-rocket-money , https://play.google.com/store/apps/details?id=app.snoop&hl=en_US
- The FCA glossary for article 89G, "seeking out, referrals and identification of claims", with its six claim categories (loaded): https://handbook.fca.org.uk/glossary/G4596s
- FSMA s.419A: "claims management services" means "advice or other services in relation to the making of a claim" (loaded): https://www.legislation.gov.uk/ukpga/2000/8/section/419A
- The PERG 8.7A excerpt, loaded but not conclusive on self-help tools: https://handbook.fca.org.uk/handbook/perg8/perg8s43

Searches run: "app scans bank transactions to find flight delay compensation automatically UK261
claim"; "app detects train journeys from contactless payments automatic Delay Repay claim"; "budgeting
app duplicate charge detection alert double charged Rocket Money OR Emma OR Snoop"; "AirHelp scan email
inbox find past flights eligible compensation"; "Railed app Delay Repay automatically watches train
journeys how it works tickets"; "FCA claims management regulated activity seeking out referrals
exclusion signposting free compensation scheme".

## I48 Deposits as assets

Verdict: **NEW-TWIST**. Standalone IOU and lend-tracker apps have due dates and reminders. Net-worth
apps (Monarch, Kubera, Empower) accept arbitrary manual assets. Not found: detecting a deposit or loan
payment from the bank feed and carrying it on the balance sheet as a dated receivable with a chase
reminder.

Scores: impact 3, uniqueness 3, effort 2.

Blockers: whether an outgoing payment is a deposit or a loan cannot be read from the transaction, so
it needs one tap from the user. The expected return date is user-supplied and must be shown as such.

Evidence:
- Debt Tracker - Loan Reminder, "reminders before due dates" (search result): https://apps.apple.com/us/app/debt-tracker-loan-reminder/id6470035317
- IOU: "reminders before due dates" (search result): https://apps.apple.com/us/app/iou-due-lend-tracker/id6765759698
- LendPal, lend tracking with reminders (search result): https://apps.apple.com/us/app/lendpal-borrow-lend-money-items-to-friends/id894350470
- Monarch, Copilot and Kubera support manual assets and accounts (search result): https://financeradar.com/blog/empower-vs-monarch-vs-copilot-vs-kubera-net-worth , https://www.kubera.com/wealth-tracker

Searches run: "budgeting app tenancy deposit tracker money lent IOU as asset expected return
reminder"; "app track money lent to friends reminders debts owed to you lent app store"; "net worth
tracker manual asset loan to a friend OR security deposit Kubera OR Monarch OR Empower".

## I49 Energy to pounds

Verdict: **EXISTS** (core mechanic). The Octopus app already shows cost in pounds by day and
half-hour, and third-party dashboards (Octopus Compare, octospy, Bright via n3rgy or Glowmarkt) do the
same. The only new part is attaching that breakdown to the bank payment inside a finance app. That is
thin, because most UK customers pay a fixed direct debit, not "this bill".

Scores: impact 2, uniqueness 2, effort 3.

Blockers: the Octopus API uses a per-customer API key the user must paste in. n3rgy needs the in-home
display MAC and consent. The Octopus app's pound figures exclude VAT and standing charges. Many
students have energy included in rent or halls, which limits reach.

Evidence:
- Octopus: toggle kWh or pounds; "a snapshot of your energy costs excluding VAT and daily standing charges"; 30-minute data (loaded): https://octopus.energy/blog/track-my-energy-use/
- Octopus app: "charts of monthly, daily, and half-hourly cost in pounds per period" (search result): https://www.guylipman.com/octopus/octopus_guide.html
- Octopus Compare, with half-hourly, daily and monthly breakdowns (search result): https://play.google.com/store/apps/details?id=com.m4consulting.octopus_comparison&hl=en_GB ; octospy dashboard: https://octospy.co.uk/
- n3rgy consumer access and the Bright app (search results): https://www.smartme.co.uk/meter-data , https://github.com/odaniel1/n3Rgy

Searches run: "Octopus Energy app half-hourly consumption cost breakdown which days hours bill"; "n3rgy
consumer API smart meter data app bill breakdown third party UK Bright app".

## I50 Warranty from payment

Verdict: **NEW-TWIST**. Many warranty trackers compute expiry and remind the user, but all start from
a photographed or emailed receipt. Klarna builds purchase history from confirmation emails but tracks
deliveries, not warranties. Card "extended warranty" benefits cover eligible purchases automatically
but do not track them for the user. Not found: auto-creating a warranty entry from the bank payment
itself, with the payment as proof of purchase.

Scores: impact 3, uniqueness 3, effort 2.

Blockers: bank transactions carry the merchant, not the product or category. The item has to come from
receipt scanning or the user, so "computed from retailer and product category" risks inventing an
expiry the data did not supply (a hard constraint). The safe version shows only a known manufacturer
term, or the UK Consumer Rights Act position labelled as a legal time limit (up to 6 years to bring a
claim in England, Wales and Northern Ireland; the burden of proof shifts after 6 months). It must not
call that a warranty.

Evidence:
- WarrantyVault: "AI autofill captures the product, store, date, and price from photographed receipts", with expiry reminders (search result): https://www.appbrain.com/app/warrantyvault-receipt-tracker/com.vizaxis.warrantyvault
- Warranty Tracker: Bill Manager, "expiry date auto-calculation", receipt photo or emailed PDF (search result): https://play.google.com/store/apps/details?id=com.primeapps.warrentytracker&hl=en_US
- Vault accepts emailed receipts and warranties (search result): https://vault.techmanpat.com/
- Klarna, automatic purchase history and delivery tracking from order emails (search result): https://www.klarna.com/international/press/klarna-extends-all-in-one-shopping-app-with-automatic-purchase-history-and-delivery-tracking-for-all-online-orders/
- Card extended warranty is automatic on eligible purchases, with optional registration (search result): https://www.capitalone.com/learn-grow/money-management/extended-product-warranties/
- Consumer Rights Act six-year limit vs warranty (search result): https://www.which.co.uk/consumer-rights/regulation/consumer-rights-act-aKJYx8n5KiSl , https://www.whitegoodshelp.co.uk/faulty-appliances-consumer-rights-act/

Searches run: "warranty tracker app automatically from purchases bank card transactions email receipts
expiry reminder"; "credit card extended warranty tracking feature app purchase protection
automatically tracks eligible purchases"; "warranty feature bank app OR budgeting app linked to card
transaction automatically warranty expiry Klarna OR Curve OR Revolut OR Emma"; "UK Consumer Rights Act
2015 six years claim faulty goods statutory rights period vs manufacturer warranty".

---

## URLs that failed to load or returned no usable content

- https://www.businesswire.com/news/home/20250729690058/en/Cleo-Becomes-the-First-AI-Money-Coach-That-Speaks-Thinks-and-Remembers returned 403 (used https://elevenlabs.io/blog/cleo instead)
- https://finteknews.com/augmented-reality-meets-finance-new-moneylion-app returned 404
- https://tearsheet.co/modern-banking-experience/personal-finance-app-moneylion-is-experimenting-with-augmented-reality/ loaded, but the body is paywalled; only the lead paragraph was available
- https://openai.com/index/personal-finance-chatgpt/ returned 403 (used TechCrunch instead)
- https://help.monarch.com/hc/en-us/articles/37526856682260-AI-in-Monarch returned 403 (the weekly-recap claim rests on the search summary only)
- https://app.gotrailed.co.uk/ loaded with a title only and no content (the Railed claims rest on search summaries of gotrailed.co.uk)
- https://claimbox.eighty32.com/ loaded, but does not state how flights are entered
- https://apps.apple.com/us/app/ledgy-voice-expense-tracker/id6761738170 loaded, but the page described an app named "Manilo". The Ledgy MCP claim rests on the search snippet only.
