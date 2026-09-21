# Numeris reference board

Screens from outside the generic fintech template, gathered 19 Sep 2026 after
Thomas rejected all five rendered directions as "vibe coded finance appy".
Each is one image here, numbered as below, and one screen in the picker
(`python3 tools/picker/serve.py`), where he taps love / like / neutral / wrong
for Numeris. His answers land in the vault at `Efforts/Numeris-Taste.md`.

The `why` line is the reason the screen is on the board, written before the
capture and checked against it. Captured headless at 1600x1000 by
`scripts/src/reference-board-capture.ts`; the four Tron frames are copied from
`Atlas/Projects/Atrium/References/` in the vault. `status.json` records every
outcome, including the ones that failed.

## terminals

1. **Finviz S&P 500 map** — The whole market as one treemap: area is size, colour is the day, no chrome. The densest useful single screen in finance, and a replacement for the Bloomberg Terminal page, which refuses headless browsers.  
    `01-finviz-map.jpg` · https://finviz.com/map.ashx
2. **TradingView chart** — The chart is the whole page and the chrome collapses to thin rails; the one finance UI most people have actually chosen to look at for hours.  
    `02-tradingview-chart.jpg` · https://www.tradingview.com/chart/?symbol=NASDAQ%3AAAPL
3. **Kraken Pro** — Order book, depth and ladder as a single dense instrument; it commits to being a workbench rather than a brochure.  
    `03-kraken-pro.jpg` · https://pro.kraken.com/app/trade/btc-usd
4. **Binance spot** — The maximal case: six live panes, red and green only where they mean direction, everything else grey. Included to find where density stops being useful.  
    `04-binance-spot.jpg` · https://www.binance.com/en/trade/BTC_USDT?type=spot
5. **Hyperliquid** — A newer terminal that kept the density and dropped the clutter: monospace figures, hairline grid, one accent.  
    `05-hyperliquid.jpg` · https://app.hyperliquid.xyz/trade
6. **Koyfin** — Bloomberg's information layout rebuilt for a browser; dashboards of small multiples, tables that are actually tables.  
    `06-koyfin.jpg` · https://www.koyfin.com/
7. **OpenBB** — The open-source terminal: a command line that draws charts, which is closer to Claude Code than to a fintech app.  
    `07-openbb.jpg` · https://openbb.co/products/workspace/
8. **Interactive Brokers TWS** — Ugly on purpose and trusted for it: no rounded corners, no marketing, a grid of numbers professionals refuse to give up.  
    `08-ibkr-tws.jpg` · https://www.interactivebrokers.co.uk/en/trading/tws.php
9. **FT markets data tearsheet** — A newspaper's data desk doing a terminal: serif headings over tabular numerals, salmon ground, no card in sight.  
    `09-markets-ft.jpg` · https://markets.ft.com/data/equities/tearsheet/summary?s=AAPL:NSQ
10. **Robinhood Legend** — A consumer brand building a desktop terminal; shows what the generic fintech look becomes when it tries to be serious.  
    `10-robinhood-legend.jpg` · https://robinhood.com/legend/
11. **Ghostfolio (open-source wealth tracker, live demo)** — The closest open-source cousin to Numeris: a real portfolio app, dark, chart-led, and a useful test of whether that already reads as template.  
    `11-ghostfolio-demo.jpg` · https://ghostfol.io/en/demo
12. **Linear** — The benchmark for product UI that is dense, keyboard-first and still calm; the standard 'Linear-grade' refers to.  
    `12-linear.jpg` · https://linear.app/

## editorial data

13. **FRED (St. Louis Fed) series page** — Institutional and plain: one blue line, grey recession bands, the source and the units printed under the chart. Trust without styling.  
    `13-fred-cpi.jpg` · https://fred.stlouisfed.org/series/CPIAUCSL
14. **Our World in Data grapher** — A chart component with an opinion: labels on the lines instead of a legend, the table one tab away, download always visible.  
    `14-owid-grapher.jpg` · https://ourworldindata.org/grapher/gdp-per-capita-worldbank
15. **FT visual and data journalism** — The FT chart doctrine at scale: pink ground, one highlight colour, annotations written as sentences on the chart itself.  
    `15-ft-visual.jpg` · https://www.ft.com/visual-and-data-journalism
16. **The Pudding** — Data stories that scroll like essays; every chart is bespoke to its argument and none of them could be a dashboard widget.  
    `16-pudding.jpg` · https://pudding.cool/
17. **Reuters Graphics** — Wire-service restraint: black, white, one colour, large type, and maps and charts that carry the whole story.  
    `17-reuters-graphics.jpg` · https://www.reuters.com/graphics/
18. **Sherwood (formerly Chartr)** — Chartr's newsletter charts grown into a newsroom: one colour per story and a headline written on the chart itself. Stands in for The Economist's Graphic detail, which returns 403 headless.  
    `18-sherwood.jpg` · https://sherwood.news/
19. **D3 gallery on Observable** — Two hundred chart forms in one grid; the reminder that a figure can be a shape other than a bar, a ring or a line.  
    `19-d3-gallery.jpg` · https://observablehq.com/@d3/gallery
20. **FlowingData** — Personal data drawn by one person with a point of view; the charts are about a life, which is what a net worth chart is.  
    `20-flowingdata.jpg` · https://flowingdata.com/
21. **Datawrapper blog** — The working notes of a chart tool that refuses decoration: every post is a rule about colour, labels or annotation with a before and after.  
    `21-datawrapper-blog.jpg` · https://blog.datawrapper.de/

## instruments and HUD

22. **GMUNK, Tron: Legacy boardroom** — The interfaces Thomas rated love on the Atrium run: dense, layered, luminous, every element on an axis, nothing hidden behind a hover.  
    `22-gmunk-tron.jpg` · https://gmunk.com/TRON-Legacy
23. **GMUNK, Oblivion GFX** — The lighter sibling: white ground, thin rules, radar and telemetry as a calm instrument rather than a glowing one.  
    `23-gmunk-oblivion.jpg` · https://gmunk.com/OBLIVION-GFX
24. **HUDS+GUIS, the screen-interface archive** — The archive of fictional interfaces from film and games, one frame per entry: the fastest way to see what reads as an instrument and what reads as decoration. Replaces Territory Studio, whose Blade Runner 2049 page is Vimeo-driven and never finishes loading headless.  
    `24-hudsandguis.jpg` · https://www.hudsandguis.com/
25. **Teenage Engineering OP-1 field** — A screen the size of a stamp that shows one thing beautifully; hardware and UI designed as one object, no chrome at all.  
    `25-teenage-engineering-op1.jpg` · https://teenage.engineering/products/op-1
26. **Nothing** — Dot-matrix type and monochrome as a whole identity; proof that a product UI can have a typeface as its personality.  
    `26-nothing.jpg` · https://nothing.tech/
27. **Vitsœ, Dieter Rams** — The ten principles and the objects that earned them; the source of 'as little design as possible' that fintech quotes and does not do.  
    `27-vitsoe-rams.jpg` · https://www.vitsoe.com/gb/about/dieter-rams
28. **Garmin G1000 NXi flight deck** — A real cockpit display: attitude, tape gauges and a map on one screen, every number sized by how fast it kills you if misread.  
    `28-garmin-g1000.jpg` · https://www.garmin.com/en-US/p/6420
29. **SpaceX Dragon** — The crew touchscreens: black, thin white lines, a few large figures; a HUD built by people who could not afford decoration.  
    `29-spacex-dragon.jpg` · https://www.spacex.com/vehicles/dragon/
30. **Flightradar24** — A live instrument on a map: thousands of moving things and it still reads at a glance, because the map is the layout.  
    `30-flightradar24.jpg` · https://www.flightradar24.com/51.5,-0.1/8
31. **Windy** — Data as a landscape you move through; the wind field is the interface, controls are a thin strip at the edge.  
    `31-windy.jpg` · https://www.windy.com/?51.5,-0.1,6
32. **Tron: Ares, GMUNK CPU vision (loved on the Atrium run)** — Rated love for Atrium; on the board so the same eye can say whether it is also right for money.  
    `32-tron-cpu-vision-01c.jpg` · vault: Atlas/Projects/Atrium/References/tron-ares_gmunk_cpu-vision.01c.jpg
33. **Tron: Ares, GMUNK process (loved on the Atrium run)** — Rated love for Atrium, has an axis; the densest of the frames he kept.  
    `33-tron-process-050.jpg` · vault: Atlas/Projects/Atrium/References/tron-ares_gmunk_process.050.jpg
34. **Tron: Ares, GMUNK interface (loved on the Atrium run)** — Rated love for Atrium; the one that is most nearly a screen someone could use.  
    `34-tron-interface-022.jpg` · vault: Atlas/Projects/Atrium/References/tron-ares_gmunk_interface.022.jpg
35. **Tron: Ares, GMUNK LCC0570 (loved on the Atrium run)** — Rated love for Atrium, has an axis; included as the control for 'dimensions and orbit'.  
    `35-tron-lcc0570.jpg` · vault: Atlas/Projects/Atrium/References/LCC0570_comp_000000_GMK_v0021-01052.jpg

## personal data with a point of view

36. **Obsidian** — The graph view Thomas named as the interface he enjoys: your own data as a structure you can see, not a list.  
    `36-obsidian.jpg` · https://obsidian.md/
37. **Claude Code** — The terminal look he named alongside Obsidian: monospace, one accent, everything visible, nothing hidden behind a hover.  
    `37-claude-code.jpg` · https://code.claude.com/docs/en/overview
38. **Warp terminal** — A terminal rebuilt as a product: blocks, monospace, dense, and still a terminal. The look 'Claude Code' points at, productised.  
    `38-warp.jpg` · https://www.warp.dev/
39. **WHOOP** — Personal data with a strong opinion: strain, recovery and sleep as three figures, black ground, no charts you did not ask for.  
    `39-whoop.jpg` · https://www.whoop.com/
40. **Oura** — The calm end of personal data: three scores, soft type, a single ring. Included as the opposite pole to WHOOP.  
    `40-oura.jpg` · https://ouraring.com/
41. **Gyroscope** — A life as a dashboard, designed to be looked at rather than used: the closest existing thing to 'how should net worth feel'.  
    `41-gyroscope.jpg` · https://gyrosco.pe/
42. **Exist** — Correlations across everything you track, drawn as plain charts by two people with a point of view; no gamification.  
    `42-exist.jpg` · https://exist.io/
43. **Strava** — The one personal-data app people open daily for years; the map and the figures are the design, the chrome is orange and gone.  
    `43-strava.jpg` · https://www.strava.com/
44. **Raycast** — Mac product UI at its most disciplined: one input, dense lists, keyboard first, dark by design rather than by default.  
    `44-raycast.jpg` · https://www.raycast.com/
45. **Things 3** — The counter-example to density: white, wide, one typeface, and it is still one of the most liked Mac apps ever made.  
    `45-things.jpg` · https://culturedcode.com/things/

## consumer finance (control)

46. **Monzo** — Control: the UK consumer bank that defined the friendly coral look every fintech then copied.  
    `46-monzo.jpg` · https://monzo.com/
47. **Revolut** — Control: black, glossy, motion-heavy; the 'premium fintech' template at full strength.  
    `47-revolut.jpg` · https://www.revolut.com/
48. **Copilot Money** — Control: the best-reviewed US personal finance app; rounded cards on a gradient, exactly the tells list, done well.  
    `48-copilot-money.jpg` · https://copilot.money/
49. **Monarch** — Control: the Mint successor; a net worth chart, a budget, a card per account. The template Numeris currently resembles.  
    `49-monarch.jpg` · https://www.monarchmoney.com/
50. **Mercury** — Control: business banking with real typographic taste; the one fintech designers cite. Test of whether taste alone escapes the template.  
    `50-mercury.jpg` · https://mercury.com/
51. **Wise** — Control: multi-currency, which Numeris is; bright green, big type, and the native-first, converted-second figure done at scale.  
    `51-wise.jpg` · https://wise.com/
52. **Emma** — Control: UK aggregator with a mascot; the far end of 'friendly' and a useful floor.  
    `52-emma.jpg` · https://emma-app.com/
53. **Actual Budget (live demo)** — Control from the other side: open-source envelope budgeting that looks like a spreadsheet and is loved for it.  
    `53-actual-budget.jpg` · https://demo.actualbudget.org/
54. **Firefly III (live demo)** — Control: the self-hosted finance manager; Bootstrap admin-template finance, so the board has the generic case on it by name.  
    `54-firefly-iii.jpg` · https://demo.firefly-iii.org/

54 screens captured, 0 not, of 54 listed.
