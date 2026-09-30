# Numeris round 2: 41 genuinely new features, ranked for build order

Written 30 Sep 2026. 50 ideas were generated (`ideas-raw.md`) and each was checked against shipping
apps with at least two web searches (`novelty-A.md` I01-I17, `novelty-B.md` I18-I34, `novelty-C.md`
I35-I50; every "exists" claim carries a URL, each marked loaded or seen-in-results).

Thomas's addendum (12:42): keep every idea that is genuinely new, rank them, and plan a roadmap that
ships many of them. So nothing below is cut for being small; only ideas that already exist are dropped.

## Verdicts

- **NEW (5):** nothing found that does the core mechanic. I25 Calibration, I37 Balance tone,
  I41 Tilt to scrub, I44 Attention price, I45 Cards from your own money.
- **NEW-TWIST (36):** parts exist; the named part is new. Each file says exactly which part.
- **EXISTS, dropped (9):** I05 Return clock (Return Track, Return.email), I06 My inflation (Grocery
  Tracker), I16 Wait list (CartPause, Holdoff, Buy or Bye), I22 Gift memory (Gift Tracker, Gift Ledger),
  I30 Desk readout (ynable.me, TRMNL YNAB recipe), I34 Ask aloud (SpotFunds via Siri), I39 True scale
  (MoneyLion "Grow Your Stack", 2017), I40 Shake to hide (Revolut), I49 Energy to pounds (Octopus app).
  I34 still appears inside prototype A as an input method; it is not claimed as special.

No idea is claimed as new beyond what the searches covered: English-language, mostly US and UK
indexes, and several citations are search snippets rather than loaded pages (marked in each file).

## Ranking

Score = 2 x impact + uniqueness + (6 - effort), each 1-5 from the novelty files. Impact counts
double because Thomas asked for features that change something, not curiosities. Effort 1 is about a
week for one developer; 3 is three to four weeks; 5 needs an OS entitlement, hardware or months.

| Rank | Id | Feature | New part | I/U/E | Score | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | I01 | Zero day | the run-out date is the headline, not a balance | 5/2/2 | 16 | none |
| 2 | I45 | Cards from your own money | finance flashcards whose answers are your own figures | 4/4/2 | 16 | answers must come from stored data (FX history) |
| 3 | I19 | The second look | next-morning review of big spends that trains a personal regret model | 4/3/2 | 15 | none |
| 4 | I43 | Money in the question bank | uncertain transactions pushed into a general question inbox | 3/3/1 | 14 | only for Atrium users (Thomas) |
| 5 | I25 | Calibration | predict your own week; scored by Brier score | 3/4/2 | 14 | points only, no stakes |
| 6 | I10 | City rates | cities compared by your own purchases | 3/4/2 | 14 | needs merchant location |
| 7 | I09 | Burn clock | allowance that drains with the time of day, on the lock screen | 4/3/3 | 14 | native ActivityKit; 8-12 h Live Activity limit |
| 8 | I37 | Balance tone | runway as a pitch you hear on open | 2/5/1 | 14 | none |
| 9 | I44 | Attention price | spending joined to app checks | 3/5/3 | 14 | only with Atrium's check log (Screen Time is sandboxed) |
| 10 | I15 | Friction dial | Screen Time shields driven by a spending budget | 4/4/4 | 14 | Apple FamilyControls entitlement approval |
| 11 | I04 | Sealed letters | unlock on your own financial data | 2/4/1 | 13 | none |
| 12 | I02 | Money weather | per-day chance of overdraft from your spending variance | 3/3/2 | 13 | none |
| 13 | I08 | Week close | a sealed week; later edits become amendments | 3/3/2 | 13 | none |
| 14 | I07 | Midnight ledger | late spending joined to Apple Health sleep | 3/4/3 | 13 | HealthKit plugin |
| 15 | I24 | Social cost forecast | calendar events priced from similar past events | 3/4/3 | 13 | calendar access |
| 16 | I26 | Ghost race | your exact cash flows replayed under a rule you did not follow | 3/3/2 | 13 | price history per holding |
| 17 | I35 | Voice tags | a spoken note matched to an existing bank row by time | 3/3/2 | 13 | none |
| 18 | I48 | Deposits as assets | deposits detected from the feed as dated assets | 3/3/2 | 13 | none |
| 19 | I50 | Warranty from payment | warranty starts from the bank payment | 3/3/2 | 13 | only known terms or the labelled legal limit |
| 20 | I46 | Deadline budgets | spending a deadline causes, forecast from history | 3/4/3 | 13 | calendar or vault deadlines |
| 21 | I47 | Owed-to-you radar | one radar over flight, rail, deposit and duplicate charges | 4/3/4 | 13 | state duplicates as facts only (FCA claims rules); legal advice before "claim" |
| 22 | I18 | Habit compounding | uses your realised portfolio return | 3/2/1 | 13 | none |
| 23 | I13 | Border mode | cards ranked by what they cost you in this country | 3/3/3 | 12 | card fee table maintained by hand |
| 24 | I21 | Hidden-amount pacts | a friend's goal seen as a percentage only | 3/3/3 | 12 | social layer |
| 25 | I23 | Fair rent by days | presence measured automatically | 3/3/3 | 12 | every flatmate's consent |
| 26 | I27 | Guess the bill | you guess before the bill lands | 2/3/1 | 12 | none |
| 27 | I28 | Market-maker mode | quote a market on your own balance | 2/4/2 | 12 | points only (gambling rules) |
| 28 | I36 | Weekly audio | a podcast episode from your own week | 2/4/2 | 12 | TTS cost |
| 29 | I38 | Price lens | price tag in days of safe-to-spend | 3/3/3 | 12 | camera OCR in the web view |
| 30 | I03 | Branches | merge a what-if and score whether it held | 3/2/3 | 11 | none |
| 31 | I29 | NFC jars | tags built into the finance app | 2/3/2 | 11 | iOS NFC in Capacitor |
| 32 | I32 | Printed month | a designed booklet of your month | 2/4/3 | 11 | print and postage per copy |
| 33 | I42 | Face-down | the phone face down arms a split | 2/4/3 | 11 | app must be open |
| 34 | I11 | Danger zones | geofences learned from your history | 3/2/4 | 10 | "Always" location |
| 35 | I14 | Walked fares | fare not paid, shown as kept | 2/3/3 | 10 | estimate must be labelled |
| 36 | I20 | Cohort mirror | university cohorts with differential privacy | 3/2/4 | 10 | needs many users per cohort |
| 37 | I41 | Tilt to scrub | the gyroscope as a time dial | 1/4/2 | 10 | motion permission |
| 38 | I31 | Morning slip | a thermal printer prints your money | 2/2/2 | 10 | hardware |
| 39 | I17 | Cost per hour | subscriptions per hour used | 3/3/5 | 10 | **blocked**: Screen Time data cannot leave Apple's sandbox |
| 40 | I33 | Wrist count | taps for days to zero | 2/3/4 | 9 | native watchOS app |
| 41 | I12 | Cap tracker | caps from card data | 2/2/3 | 9 | **blocked**: TfL posts one daily charge up to 3 days late; no journey API |

## The first wave (the "8 strongest"): why each is new

1. **Zero day (I01).** Wiggle Budget, Bill Budget Calendar and PocketSmith forecast when money gets
   tight, but none makes the run-out date the headline figure you push back by spending less
   (`novelty-A.md` I01). It is already the spine of all three phone prototypes.
2. **Cards from your own money (I45).** Only generic finance flashcard decks exist (`novelty-C.md` I45).
   The learning system he already uses daily gets cards whose answers are his own FX spreads, his own
   subscription total, his own runway.
3. **The second look (I19).** Joy had happy/sad spends and a Qapital study rated purchases; nobody
   runs a next-morning review that trains a model of which purchases you regret (`novelty-B.md` I19).
4. **Money in the question bank (I43).** Copilot has an in-app review queue; nothing pushes the
   questions into the inbox where you already answer everything else (`novelty-C.md` I43). For
   Thomas that is Atrium's "Ask me" page; for others, the same queue can go to a notification.
5. **Calibration (I25).** Only classroom budget games and trivia estimation drills exist; nothing scores
   you on predicting your own real figures (`novelty-B.md` I25). It is also Optiver-style estimation
   practice on his own life.
6. **City rates (I10).** Cost-of-living tools use city indices; Monzo filters by location; nobody compares
   London and Penang through your own receipts (`novelty-A.md` I10). He lives in both.
7. **Burn clock (I09).** BudgetVault puts a daily allowance on the lock screen; nobody drains it with the
   time of day (`novelty-A.md` I09).
8. **Balance tone (I37).** Only patents and generic sonification tools; no finance app (`novelty-C.md` I37).
   A week of work, and it lets a glance happen without looking.

## Roadmap

Everything depends on data arriving by itself, so wave 0 is the bank route (`bank-route.md`) plus the
round-1 capture plan (scheduled sync, consent countdown, pending rows, auto-categorise, transfer pairing).
Weeks are solo-developer estimates from the effort scores (1 = 1 week, 2 = 2, 3 = 3.5, 4 = 6).

| Wave | When it can start | Features | Estimate |
| --- | --- | --- | --- |
| 0 | now | automatic bank data (round 1 capture plan, `capture.md`) | 3-4 weeks |
| 1 | after wave 0 | I01, I45, I19, I43, I25, I10, I09, I37 | about 15 weeks; I01, I43, I37 first (4 weeks together) |
| 2 | after I01 exists | I44, I04, I02, I08, I07, I24, I26, I35, I48, I50, I46, I18 | about 25 weeks |
| 3 | after testers are in | I15 (apply for FamilyControls in wave 1, approval takes time), I47, I13, I21, I23, I27, I28, I36, I38, I03 | about 30 weeks |
| 4 | when a dependency lands | I29, I32, I42, I11, I14, I20 (needs users), I41, I31, I33 | as dependencies allow |
| parked | data does not exist | I17 Cost per hour, I12 Cap tracker | revisit if Apple or TfL open the data |

Ordering rules used: cheap-and-new first within a wave (I43, I37, I04, I27 are about a week each);
anything needing an Apple approval gets applied for a wave early; anything social waits for testers;
anything whose figure would be an estimate ships only with the estimate labelled as such.
