# Numeris phone: why Thomas is not satisfied, and three directions to pick from

Written 30 Sep 2026. Research only: nothing in the repo or the vault was edited.
All pictures are 390x844 at DPR 2. Every figure in the new mocks is sample data and labelled "MOCK, SAMPLE FIGURES"
(the numbers reuse the 27 Sep seed snapshot so they can be compared with Spread and Map).

## 1. What he said, dated

| Date | His words, or the recorded verdict | Source |
| --- | --- | --- |
| 12 Aug | Phone direction settled "after seven rejected attempts across three tools". Round 7 was rejected as generic: "dark rounded cards, one neon accent, gradient area chart, greeting with avatar, floating pill nav with a bright centre FAB". *(The doc's summary, not his quote.)* | `docs/MOBILE-CONCEPT.md:3-25` |
| 13 Aug | After 21 rounds, **2C "extruded area"** (holdings as blocks, area = value, `1px² = £1.09`) was "the first design accepted without qualification". The approved follow-ups were a view switcher and "each home pane carries a miniature of the geometry of the page it opens". | `MOBILE-CONCEPT.md:190-262` |
| 2 Sep | "feels vibe-coded", "Bloomberg doesn't box everything"; onboarding "questionnaire feels vibe-coded". DESIGN.md records that he said **"everything is in boxes" four times** before it was measured. | `.review/archive/2026-09-02T0000-two-bugs-box-research.report.md:107,341`; `docs/DESIGN.md:189` |
| 19 Sep, 16:00 | The phone UI is **"heavily vibe coded"**, and he prefers the desktop. | `Efforts/Numeris-Roadmap.md:36`; `.review/archive/2026-09-19T1710-…task.md:20` |
| 19 Sep, evening | On phone directions A, B and C and desktop D1 and D2: **"they all look soooo bad, all so vibe coded and normal vibe coded finance appy."** The B + D1 build was cancelled. | `.review/archive/2026-09-20T1915-numeris-design-reset.task.md:10` |
| 20 Sep, picker | He liked every trading terminal and loved `01-finviz-map`. His closing picks: Numeris "is trying to be **Binance spot / Kraken Pro**"; "**dense on the Mac, calm on the phone**"; "a shape only when it says something a number cannot"; net worth should feel like "**a readout on an instrument**"; the phone is "**a glance by default, work when I tap in**"; colour: "not super sure". He marked Monzo, Revolut, Copilot, Monarch, Wise and Emma "wrong for Numeris", but that stretch of the run was tapped through too fast to count as signal. | `Efforts/Numeris-Taste.md` |
| 26–27 Sep (CEC site, filed as rules for every design) | "Feels like a Wix site" means a squeezed desktop, stacked cards and a template look. **"The phone is the primary design."** | `Atlas/Design-Taste.md` |
| 30 Sep | "Did we not push any phone changes live or didn't act on anything?" Spread and Map exist only as stills and are still waiting on his pick. | `.review/archive/2026-09-30T1000-phone-live-and-desktop-bugs.task.md`, `.report.md:7,15` |

Pictures I looked at: the live phone HOME (`.review/shots/rules-g5after2-void-home-0.png`), the rejected
19 Sep B (`.review/shots/directions-2026-09-19/B-home-void.png`), and the 27 Sep Spread and Map
(`design/directions-2026-09-27/compare.png`).

## 2. Diagnosis

**The common thread.** Every phone screen he has rejected is a **consumer-finance list**: labelled sections
stacked down the page, each holding rows with an identity glyph. The only phone design he ever accepted
(2C, 13 Aug) was **one shape filling the screen**, and that is also what his terminal references look like.
The phone keeps sliding back to the list for four reasons, and they compound.

1. **The phone's own rulebook points at the look he rejects.** The Mobile Amendment
   (`artifacts/finance-tracker/src/index.css`, top block) names "Yahoo Finance mobile, plus the modern-fintech
   reference set" as the craft target. It **requires** "an avatar, logo or glyph" on every merchant, person or
   account row. It permits gradients, violet, donuts and 16–24px radius, allows uniform list rhythm, and
   suspends "data density first". The 19 Sep B followed those rules exactly (lettered avatar squares, row
   lists, a bordered "Log a spend" button) and was called "normal vibe coded finance appy". Any session that
   follows the Amendment faithfully will draw that screen again.
2. **The skeleton never changes, only the skin.** Today's live HOME is NET WORTH, then ACCOUNTS/CLAIMED,
   then an "Alex owes you" card, then SEPTEMBER · LIQUID, then WHAT YOU HOLD, then a list. That is the
   "same anatomy everywhere" tell (AI-DESIGN-TELLS 1 and 2), his "everything is in boxes" complaint, and the
   CEC "Wix: stacked cards" verdict. Rounds that changed colour or type without changing this skeleton failed.
3. **"Vibe coded" is partly about behaviour.** The 19 Sep audit found that no row responds to touch:
   `HoverRow.tsx` handles mouse events only. UPCOMING has an Add button wired to `() => {}`. Sixteen desktop
   pages reach the phone inside a back-button wrapper, and eight routes say "desktop only"
   (`2026-09-19T1845-…report.md:228-260`). A new skin will not fix a phone that does not react.
4. **What he approves never reaches his phone.** 2C, the view switcher and the HOME/MONTH/MOVE/FIND footer
   were approved on 13 Aug. What shipped was a list. Spread and Map have been waiting since 27 Sep. On 30 Sep
   he looked and saw no change. Some of the dissatisfaction is simply that nothing he picked has appeared.

**What the Spread and Map stills get right, and where they fall short of the rules.** Both drop the list for a
single shape, which answers thread 1 and thread 2. What I found checking them against the rules:

- Both use **private palettes** (`--bg`, `--pos`, cyan `--accent` in `map.css` and `spread.css`) rather than
  `--ft-*` tokens, so neither has been shown to survive the eleven themes or `arctic`.
- Their `fx` marks are **8px** and Map's group headers are 9.5px. The Amendment's floor is 11px.
- Map's filled cyan `+` key is close to the "bright centre FAB" that failed in round 7.
- On Map's home, cash (the part that changes daily and that he acts on) gets about 5% of the area.
  Its best idea, bills cut out of the account that pays them, is hidden in the CASH drill-in.
- Spread's home has 17 rows. That is "dense" on a surface he asked to be calm.
- Both drop the per-row avatar. So do mine. That breaks an Amendment rule, and **Thomas has to agree to
  dropping it**; it should not be slipped past him.

## 3. Three directions

All three follow the same rules:
- Colour comes only from `--ft-*` tokens, copied verbatim from `index.css:511` (void) and `:592` (arctic). Each
  mock was rendered in both themes to prove it.
- Hierarchy comes from size and position. Hue carries only green for up, red for owed, amber for late, and the
  accent for what you can tap.
- A probe checked every `.pnum` for clipping, and none was clipped in any of the six renders.
- Dotted means a thing has not happened yet: bills, goals and money owed to you.
- Native currency comes first, and the converted figure follows with an `fx` mark.
- There are five tabs, all text is 11px or larger, and every tap target is at least 44px.
- There is no emoji, no gradient outside a plot, no shadow on data, no radius above 3px on data, and no
  instruction text.

Pictures:
- **New:** `A-reach-{void,arctic}.png`, `B-depth-{void,arctic}.png`, `C-ticker-{void,arctic}.png` and
  `compare-ABC.png`, all in `phone/`.
- **Existing (27 Sep, reused, not re-rendered):** `design/directions-2026-09-27/compare.png`,
  `1-spread/phone-home.png`, `2-map/phone-home.png` and `2-map/phone-cash.png`.

### A. Reach, Map refined (recommended)
**The idea.** HOME maps only the money within reach, at one area scale. Each claim (late bills, bills not yet
due, goals) is cut out of the account that will pay it. Everything held long collapses into a miniature map
that opens WORTH, where the full 27 Sep Map lives.
**What it answers:**
- "Finance appy": no list, no glyphs, one shape.
- "A glance by default": free money, and what eats it, read in one look.
- "A shape only when it says something a number cannot": that Monzo loses £1,039 to bills and Maybank
  loses 63%.
- It builds on his one "love" (finviz), on the 2C area encoding he accepted on 13 Aug, and on the approved
  "miniature of the page it opens".

**PNG:** `phone/A-reach-void.png` (and `-arctic`). **HTML:** `phone/A-reach.html`.
**Weak spots:**
- The smallest tiles lose their names (Maybank shows only `RM 1,980.00`, and the owed sliver is labelled in
  the legend instead).
- The `+` key still needs to prove it is not a FAB.

### B. Depth, Spread calmed
**The idea.** The order book turned into an exchange's depth chart:
- Claims step out to the left by how soon they fall due.
- Money steps out to the right by how fast you can reach it.
- Both sides use one scale, with an axis break for the £210k held long.
- Net worth sits where the mid-price sits, and the "spread" (reach minus claims, −£156.82) is the readout.

Under the chart, the book is cut to four levels a side instead of 17 rows.
**What it answers:**
- The "Binance spot / Kraken Pro" pick, more literally than anything else.
- "Calm on the phone", which Spread's 17 rows did not manage.
- The shape says what no single number does: whether reachable money covers what is claimed at each horizon.

**PNG:** `phone/B-depth-void.png` (and `-arctic`). **HTML:** `phone/B-depth.html`.
**Weak spots:**
- The axes (time to due, time to reach) need one reading before they click.
- Four levels a side still makes a small list.
- It is the strongest candidate for the desktop's left column.

### C. Ticker, the pair screen (new)
**The idea.** The Binance or Kraken mobile pair screen:
- Net worth is the instrument's price.
- A "within reach" line shows the last month solid and the next month dotted, stepping down at every known
  bill (the late bills show as an amber drop at today).
- A price tag sits on the right axis.
- The mock shows a scrub state, to prove the screen has states.
- Below it are a tape of recent moves and Spent/Received keys in the thumb zone.

**What it answers:**
- "A readout on an instrument", word for word.
- The dead-interaction tell, because it shows a pressed state.
- "Dotted means not yet real", used as the chart's whole future half.

**PNG:** `phone/C-ticker-void.png` (and `-arctic`). **HTML:** `phone/C-ticker.html`.
**Weak spots:** A line chart over a transaction list is the shape closest to a generic finance app, so it is
the weakest answer to "finance appy". Include it as the control.

## 4. Recommendation

**A, Reach.** It is Map, which the 27 Sep session also recommended, with the one weakness that mattered for a
glance fixed. Daily money gets the screen, and the full-wealth map moves one tap away into WORTH. It is the
only direction whose shape changes day to day in a way he would act on. It also rests on both of his strongest
positive signals, the one "love" (finviz) and the one design ever accepted (2C).

A cheap hybrid is available if he wants one: A on the phone, with B's depth chart as the desktop's left column
(it is closest to Binance spot there).

**Before any build, two things need Thomas's say-so:**
1. Dropping the Amendment's avatar-per-row rule.
2. Re-pointing the Amendment's "Yahoo Finance mobile plus modern-fintech" craft target at the terminal set.

Without the second, the next session that follows the rules will redraw the list.

Files: `phone/src/` holds the sources, `tokens.css` and `render.cjs` (rebuild with
`node src/render.cjs`; it closes its browser). No Chromium was left running.
