# AI-design tells

Compiled 13 Aug 2026 from published critiques. Sources: UX Planet "How To Spot
AI-Generated Design" (Babich, May 2026 — uses Claude Design output as its worked
example), 925studios "AI Slop Web Design", AXE-WEB "Why AI Websites All Look the
Same", sikora.software "Top 10 Signs a Website Was Built by AI".

## The published tells

1. **Ultra-conventional skeleton.** First impression is "I think I've seen this
   before". Predictable hierarchy, the same structure repeated everywhere. The
   most-cited tell.
2. **Uniform padding, uniform radius, uniform card heights.** "Real design
   systems create visual hierarchy through intentional variation. When every
   element gets the same 16px border radius and 24px padding, the page feels
   flat and undifferentiated."
3. **Purple-to-blue gradient** as the default "looks professional" choice.
4. **The safe palette.** Dark text, light background, blue CTA, 5–10px radius,
   faint grey shadows. "Clean, simple and very safe."
5. **Dead interaction.** Hover states that do nothing. Buttons that snap instead
   of easing. Either no scroll animation or the same fade-in on everything.
6. **Em-dash overuse** in copy.
7. **Emoji** used as feature iconography.
8. **Stock hero imagery** — diverse group round a laptop, abstract 3D blobs,
   illustrations that are slightly too smooth and too symmetrical.
9. **Vague copy** with no specifics.

## How these apply to THIS project

Numeris has already avoided 3, 4, 7 and 8 by construction. The ones that bite,
observed in the v6 overview design:

**Uniform rhythm (tell 2).** Every row is the same height, every pane header has
identical treatment, spacing is constant top to bottom. Nothing is deliberately
oversized or undersized. The nine archetypes had literally identical silhouettes.
This is the single strongest AI signature in the work so far.

**Every pane has the same anatomy (tell 1).** Title left, meta right, hairline,
then rows. No exceptions anywhere. Real interfaces break their own pattern when
content demands it.

**The middot tic (the design equivalent of tell 6).** `WISE · 3 UNCATEGORISED`,
`MONZO · ··4471`, `LONDON · 16:35`, `SYNC 04:12 · 4 SOURCES`, `PEAK £120 · 31
JUL`. The same separator in every label at every level. A human designer varies
punctuation and layout by context.

**Relentless labelling.** Every value carries an uppercase label. Real terminals
leave things unlabelled where context makes them obvious; the over-labelling is
the visual equivalent of over-explaining.

**No states (tell 5).** Nothing has been designed for selected, pressed,
loading, error, or empty. Every frame produced so far is inert.

**Perfect balance.** No element dominates disproportionately, nothing is
cropped, nothing overlaps, nothing is off-grid. Deliberate imbalance is a human
signature.

## Rule

Variation must be intentional and content-driven. If every pane, row and label
obeys the same rule, the design reads as generated regardless of how good the
rule is.
