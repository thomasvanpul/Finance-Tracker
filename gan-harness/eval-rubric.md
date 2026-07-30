# Evaluator Rubric — Finance Tracker

Score each dimension 0–10. Apply weights. **Pass threshold: 8.0**

The evaluator's job is not to check if the design is "nice." It is to check if it is *this* design —
the one in the spec — or a compromise toward the comfortable median. Be ruthless. Generic is failure.

---

## Dimension 1: Terminal Integrity (weight: 0.35)

This dimension asks: does it feel like a real financial operating system, or a themed dashboard?

**Binary checks (each worth up to 1 point off if missing)**
- [ ] Status bar is present, pinned to bottom, always visible — not hidden, not collapsible by default
- [ ] Status bar shows connection state + last sync + context-appropriate keyboard hints
- [ ] All numeric values rendered in monospace — NET WORTH, DELTAS, AMOUNTS, TIMESTAMPS, ALL of them
- [ ] Number formatting correct: `+$12,440.22`, `–$3,110.00`, `+4.2%` (en dash, plus prefix, 2dp)
- [ ] No box-shadows on data panels or table rows (hairline borders only)
- [ ] Border radius on data containers: ≤3px
- [ ] Column/row padding follows the spec asymmetry (not uniform `p-4`)

**Qualitative (0–3 points)**
- Does removing the financial data and replacing with generic text leave a design that is still distinctive?
- Does it feel like it was designed by someone who has actually used Bloomberg, or by someone who Googled it?
- Would a quant or institutional trader see this and not be offended?

**Score this dimension 0–10.**

---

## Dimension 2: Originality (weight: 0.30)

This dimension asks: does it escape the AI median, or does it look like the average of financial UIs?

**Automatic 0 in this dimension if ANY of these are present:**
- Purple or violet accent colors
- `border-radius` above 8px on primary data containers
- Gradient background or gradient text on data elements
- An illustration or icon set used as decoration in the main dashboard
- A sidebar navigation with icon + label items
- Inter or Roboto as the primary font
- "Clean and minimal" as a coherent description of the output (clean ≠ interesting)

**Scoring questions**
- Could this layout be mistaken for Mint, YNAB, or any shadcn starter template? If yes: max 3/10.
- Is the command palette present and is it the primary navigation pattern? If no: –2 points.
- Does the theme system show 5 genuinely distinct visual personalities? "Same layout, different hue" = fail.
- Does at least one layout decision surprise you — something you didn't expect from an AI output?
- Does the design have a specific point of view that you could name in one sentence?

**Score this dimension 0–10.**

---

## Dimension 3: Craft (weight: 0.25)

This dimension asks: is it executed with precision, or are there signs of shortcut-taking?

**Binary checks**
- [ ] CSS custom properties used for EVERY color, spacing token, and font reference (no hardcoded hex in component styles)
- [ ] Theme switching is functional: 5 themes switch without layout shift
- [ ] Hover states exist on every interactive element and feel intentional (not just `opacity: 0.8`)
- [ ] Active row state: left accent border `2px solid var(--ft-accent)` + subtle background lift
- [ ] Dense tier typography (11–13px) and Hero tier (20–28px) — nothing in the 14–19px dead zone for data
- [ ] Monospace and sans-serif pairing is visually deliberate, not accidental
- [ ] Spacing is asymmetric in at least two places (row padding ≠ section padding ≠ card padding)

**Qualitative**
- Is the font pairing actually good, or just technically correct?
- Do the 5 themes feel like 5 different eras/environments, or 5 shades of the same decision?

**Score this dimension 0–10.**

---

## Dimension 4: Functionality (weight: 0.10)

This dimension asks: would a real user be able to operate this, or is it a beautiful screenshot?

**Checks**
- [ ] User can identify their net worth within 3 seconds of looking at the default view
- [ ] User can reach "Add Transaction" without a sidebar (command palette or top bar only)
- [ ] Theme switcher is accessible and shows the actual palette, not just a name
- [ ] Transaction table shows at minimum: date, merchant, amount, category — in that density
- [ ] Settings page has a Keyboard Shortcuts reference section

**Score this dimension 0–10.**

---

## Scoring Formula

```
final = (terminal_integrity × 0.35) + (originality × 0.30) + (craft × 0.25) + (functionality × 0.10)
```

Pass threshold: **8.0**

---

## The Four Questions the Evaluator Must Answer

These go in the feedback to the Generator regardless of score:

1. **The Median Test**: On a scale of 1–10, how close is this to the average AI-generated finance dashboard? 
   (1 = completely alien, 10 = indistinguishable from the median). The generator should be targeting 1–3.

2. **The Embarrassment Test**: Would showing this to the design team at Bloomberg, Refinitiv, or TradingView
   make us proud or apologetic? If apologetic: what specifically is the problem?

3. **The One-Sentence Test**: Can you describe what makes this design distinctive in one sentence that doesn't
   use any of these words: clean, modern, minimal, sleek, professional, dark, dense?

4. **The Status Bar Test**: Screenshot the bottom of the viewport. Is the status bar there? Is it informative?
   If this question is awkward to answer, the status bar is missing or wrong.

---

## Feedback Template for Generator

When scoring below 8.0, the evaluator MUST provide:

```
SCORE: [final score]
BLOCKING ISSUES: [list of binary checks that failed]
MEDIAN DRIFT: [which elements look like the AI average, specific]
PRESERVE: [what is working and must not be changed in next iteration]
DIRECTION: [one concrete visual change that would move the score most]
```

Do not give vague direction. "Make it more terminal-like" is useless.
"The status bar is missing — add it pinned to bottom at 30px, bg `var(--ft-surface)`, 
border-top `1px solid var(--ft-border)`, content: connection dot + last sync + shortcut hints"
is the expected level of specificity.
