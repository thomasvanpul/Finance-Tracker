# Numeris round 2: the raw idea list (before novelty checks)

Written 30 Sep 2026. 50 ideas, grouped by the lens that produced them. Each one is written so a
checker can search for it. Novelty verdicts and citations live in `novelty-*.md`; the ranked list
is in `ideas.md`. Two hard constraints still apply to every idea even with the design rules dropped:
the app never holds or moves money (it can only start a payment the user approves in their bank),
and it never shows a figure the data did not supply.

## Time

- **I01 Zero day.** A single date, always visible: the day the money runs out before the next income
  arrives (for a student, the next loan instalment). It moves later when you spend less and earlier when
  you spend more, like a doomsday clock you can push back. It is a date, not a balance.
- **I02 Money weather.** The next 30 days shown as a forecast: bill clusters as fronts, the balance as
  pressure, a "chance of overdraft" per day computed from the variance of your own past spending.
- **I03 Branches.** Git for money: fork your finances into a "what if" branch (move to Penang for a
  term, take the Optiver internship, cancel three subscriptions). The branch keeps projecting beside
  reality, with a diff view; if you make the change in real life, you merge it and the app tracks
  whether the branch's prediction held.
- **I04 Sealed letters.** A note to your future self, sealed until a condition on your real data is
  met (net worth crosses £10k, the loan is repaid, a date passes). The app opens it when the data says so.
- **I05 Return clock.** Every online purchase starts a countdown to the end of its 14-day return
  window (UK Consumer Contracts Regulations), shown until it expires. Ask for a refund from the countdown.
- **I06 My inflation.** Your personal inflation rate, from what you actually rebuy: the same merchant
  and item category over time. "Your groceries went up 11% in a year; CPI food says 4%."
- **I07 Midnight ledger.** Spending between 23:00 and 04:00 is flagged separately and compared with
  sleep data from Apple Health: how much you spend on nights you sleep badly.
- **I08 Week close.** A 3-minute Sunday ritual borrowed from a trading desk's end of day: clear the
  review queue, then the week is sealed (a hash, locked; later edits show as amendments, like an
  accountant's journal).
- **I09 Burn clock.** A Live Activity on the lock screen showing today's safe-to-spend draining
  continuously through the day, so the figure at 18:00 is what is left of today's share, not a static number.

## Place

- **I10 City rates.** Each city you live in (Penang, London, home in the Netherlands) is its own
  economy, priced from your own purchases: "one London lunch = 3.4 Penang lunches, by your own receipts."
- **I11 Danger zones.** Geofences learned from your own history: when you walk into a place where you
  historically overspend, the lock screen shows this week's remaining figure. No notification sound; just the figure.
- **I12 Cap tracker.** TfL daily and weekly contactless caps tracked from card data: "your next
  three journeys today are free", "walk 20 minutes and you save the £1.90 that breaks the cap".
- **I13 Border mode.** When the phone lands in another country (time zone, locale), the app switches
  its home currency and ranks your cards by what they will cost you here (FX margin, fees), "tap this one".
- **I14 Walked fares.** Steps counted by the phone on a route you usually ride: the fare you did not
  pay is shown as money kept, without pretending it was saved into anything.

## Habits and friction

- **I15 Friction dial.** Link a spending category to apps via Screen Time (FamilyControls): when the
  takeaway budget is spent, Deliveroo is shielded until Monday. The budget enforces itself on the phone, not in a bank.
- **I16 Wait list.** Paste a link to something you want; it waits 72 hours while the app watches the
  price, then asks again, showing the price history and what it would do to your zero day.
- **I17 Cost per hour.** Subscriptions divided by the hours you actually use them, from Screen Time:
  "Spotify £0.09 an hour; the gym £14 a visit; Disney+ £11 an hour this month."
- **I18 Habit compounding, on your own portfolio.** A repeated purchase priced forward using your own
  realised portfolio return, not a textbook 7%.
- **I19 The second look.** Transactions above a threshold you set wait in a 24-hour "are you sure it
  was worth it" review the next morning; answers train a personal regret model that predicts which
  purchases you will regret.

## Social

- **I20 Cohort mirror.** Anonymous benchmarks against people like you (same university, year, city),
  computed with differential privacy across Numeris users so no single user's figure can be recovered.
- **I21 Hidden-amount pacts.** A shared goal with a friend where each sees the other's progress as a
  percentage, never the amount.
- **I22 Gift memory.** A ledger of reciprocity: who gave you what, what you spent on them, their
  birthdays, so gifts stay fair and nobody is forgotten.
- **I23 Fair rent by days.** Household bills split by the days each flatmate was actually present,
  from shared calendars or location, not a flat split.
- **I24 Social cost forecast.** Reads the calendar (society socials, dinners, flights) and forecasts
  the spend of next week's events from what similar events cost you before.

## Games

- **I25 Calibration.** Before the week's figures are revealed, you predict them (spend, number of
  coffees, balance on Friday). The app scores you with a Brier score over time: how well do you know
  your own money? Built like a trading-firm estimation drill.
- **I26 Ghost race.** Your real portfolio or savings race a "ghost": the same money under a rule you
  did not follow (monthly DCA, never selling, the index). Like a racing game's ghost car, on your real history.
- **I27 Guess the bill.** When a recurring bill is due, guess it before it arrives; streaks for close guesses.
- **I28 Market-maker mode.** Quote a bid and ask on your own month-end balance; the app fills you and
  marks you to the real outcome. Practice for a trading interview on your own life.

## Physical objects

- **I29 NFC jars.** Stickers on physical objects (a jar, a wallet, the fridge) that open a pot, log a
  cash spend or show one figure when the phone touches them.
- **I30 Desk readout.** A small e-ink display (or an old laptop) at home that shows one number,
  refreshed hourly: safe-to-spend or zero day. The instrument as an object.
- **I31 Morning slip.** A thermal receipt printer that prints a 5-line money slip each morning.
- **I32 Printed month.** A printed A5 booklet of the month posted to you: the maps, not the lists.
- **I33 Wrist count.** The watch taps your wrist N times for N days until zero day, on request, with
  no screen.

## Voice

- **I34 Ask aloud.** "Can I afford this?" asked in a shop; one spoken sentence back, grounded in
  safe-to-spend and the next bills. Through IRIS on his machines and Siri on the phone.
- **I35 Voice tags.** Say "that was Anna's birthday present" after paying; the voice note is matched to the
  transaction by time and becomes its note and category.
- **I36 Weekly audio.** A 90-second spoken briefing on your week, generated from your data, as a podcast episode in your podcast app.
- **I37 Balance tone.** Sonification: one short tone when the app opens whose pitch is the runway,
  so you can hear whether things are fine before reading anything.

## Camera, AR and sensors

- **I38 Price lens.** Point the camera at a price tag: it shows the price in your other currencies,
  in days of safe-to-spend, and what you last paid for it.
- **I39 True scale.** AR: your net worth or your debt as a physical stack of notes on the desk at real scale.
- **I40 Shake to hide.** Shake the phone to blur every figure instantly (in public, on a train).
- **I41 Tilt to scrub.** Tilt the phone to move through time on any chart; the gyroscope is the time dial.
- **I42 Face-down.** The phone face down on a table at a restaurant starts "dinner mode": the next
  card payment is automatically offered as a split.

## Atrium (his own system)

- **I43 Money in the question bank.** Uncertain transactions arrive one at a time in Atrium's
  existing "Ask me" page, alongside every other question, instead of in a finance app he has to open.
- **I44 Attention price.** Atrium already measures how often he checks apps; Numeris puts a price on
  it: spending that happened within 10 minutes of an app check versus without.
- **I45 Cards from your own money.** The learning system's spaced-repetition cards generated from
  his own transactions ("What FX spread did you pay on your Malaysian card in September?"),
  so finance concepts are learned on his own numbers.
- **I46 Deadline budgets.** Efforts with a deadline (an assessment, exam week) get an automatic
  budget envelope and a forecast of the spending the deadline causes (takeaways, taxis).

## Recovery and rights

- **I47 Owed-to-you radar.** Detect money you are legally owed from your own transactions: flight
  delay compensation (UK261), rail Delay Repay, double charges, deposits never returned. Show the
  claim with its deadline.
- **I48 Deposits as assets.** Tenancy deposits, returnable deposits and money lent are shown as assets
  with an expected return date and a chase reminder.
- **I49 Energy to pounds.** The smart-meter feed (Octopus API or n3rgy) matched to the bill: which
  days and which hours made this bill larger.
- **I50 Warranty from payment.** Every purchase of an item over £50 becomes a warranty entry, with
  its expiry computed from the retailer and product category, linked to the card payment as proof.
