// The one hard rule: the companion must never cover a number.
//
// Thomas: "It must never cover a number — that is the one hard rule; in every
// screenshot so far it sits on top of data."
//
// The old wanderer walked a floor line computed from the viewport and nothing
// else, so whether it landed on a figure was luck. This module makes it a
// constraint instead: before the companion is drawn anywhere, the candidate
// box is tested against every figure currently on screen, and if no free
// position exists the companion is not drawn at all.
//
// Not drawing is the correct failure mode. A cat that vanishes on a dense
// screen costs the user nothing; a cat sitting on "£11,371" costs them the
// figure, and CLAUDE.md is explicit that a half-visible number is the worst
// class of defect this app can ship. The companion is decoration and the
// numbers are the product, so the companion yields.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Things that are data but carry no text of their own.
 *
 * A chart is data drawn rather than typeset, and a cat standing on a
 * sparkline hides as much as one standing on a figure. `.pnum` is here as
 * belt-and-braces: an empty or still-loading figure reserves its space
 * before it has any glyphs for the text sweep below to find.
 */
export const DATA_SELECTOR = ".pnum, .ft-chart, .recharts-wrapper, canvas, svg";

/**
 * What counts as "a number" in running text.
 *
 * Two or more digits, so a lone "1" in a sentence does not fence the whole
 * page off. This deliberately catches dates, counts and percentages as well
 * as currency: the first screenshot of the working companion had it sitting
 * squarely on "09/07/2026", which is a number the user reads even though it
 * carries no `.pnum` class — no date in this app does. Marking every date
 * site by hand would be hundreds of edits and would go stale; reading what
 * is actually painted does not.
 */
export const NUMERIC_TEXT = /\d\d/;

/** Clearance kept around a figure, in CSS pixels. */
export const CLEARANCE = 6;

export function overlaps(a: Box, b: Box, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

/** True when the box clears every obstacle. Pure — the testable half. */
export function isClear(box: Box, obstacles: readonly Box[], pad = CLEARANCE): boolean {
  for (const o of obstacles) {
    if (overlaps(box, o, pad)) return false;
  }
  return true;
}

/**
 * The first candidate position that clears every obstacle, or null when none
 * does. Candidates are tried in order, so the caller expresses preference by
 * ordering them — nearest to where the companion already is, first.
 */
export function firstClear(
  candidates: readonly Box[],
  obstacles: readonly Box[],
  pad = CLEARANCE,
): Box | null {
  for (const c of candidates) {
    if (isClear(c, obstacles, pad)) return c;
  }
  return null;
}

export interface Obstacles {
  /** Numbers. The hard rule: the companion may never overlap one of these. */
  numbers: Box[];
  /** Every painted glyph, numbers included. A preference, not a rule. */
  text: Box[];
}

/**
 * Everything painted inside the viewport, in viewport coordinates, split
 * into what the companion may never cover and what it would rather not.
 *
 * Text is measured with a Range rather than by the containing element, so a
 * date inside a wide flex cell fences off the glyphs and not the whole cell.
 * That gives the companion more room than an element sweep would, while
 * still covering figures no class marks.
 *
 * The two tiers exist because the hard rule alone is not enough to look
 * right. On a dense desktop dashboard almost every clear band is clear only
 * because the text under it happens to be a merchant name — obeying the rule
 * to the letter and still reading as "the cat is standing on the table". The
 * caller places against `text` first and falls back to `numbers`, so the
 * companion sits in genuine whitespace when there is any and never on a
 * figure when there is not.
 *
 * Reads layout, so callers must batch it — once per settle, never per frame.
 * Zero-area and off-screen boxes are dropped: a figure inside a collapsed
 * accordion is not covering anything.
 */
export function collectObstacles(root: ParentNode = document): Obstacles {
  const numbers: Box[] = [];
  const text: Box[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const keep = (r: { left: number; top: number; width: number; height: number; right: number; bottom: number }) =>
    r.width > 0 && r.height > 0 && r.bottom >= 0 && r.top <= vh && r.right >= 0 && r.left <= vw;
  const box = (r: { left: number; top: number; width: number; height: number }): Box =>
    ({ x: r.left, y: r.top, w: r.width, h: r.height });

  for (const el of Array.from(root.querySelectorAll(DATA_SELECTOR))) {
    const r = el.getBoundingClientRect();
    if (!keep(r)) continue;
    numbers.push(box(r));
    text.push(box(r));
  }

  const host = (root as Document).body ?? (root as Element);
  if (host == null) return { numbers, text };
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n != null; n = walker.nextNode()) {
    const value = n.nodeValue;
    if (value == null || value.trim().length === 0) continue;
    const numeric = NUMERIC_TEXT.test(value);
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      if (!keep(r)) continue;
      const b = box(r);
      text.push(b);
      if (numeric) numbers.push(b);
    }
  }
  range.detach();
  return { numbers, text };
}

/**
 * Candidate resting places along a horizontal band, ordered by distance from
 * `preferX` so the companion moves as little as possible to get out of the
 * way. `step` is the granularity of the sweep; smaller finds more spots and
 * costs more comparisons.
 */
export function candidatesAlong(
  bandY: number,
  size: { w: number; h: number },
  bounds: { left: number; right: number },
  preferX: number,
  step = 24,
): Box[] {
  const spots: Box[] = [];
  for (let x = bounds.left; x + size.w <= bounds.right; x += step) {
    spots.push({ x, y: bandY, w: size.w, h: size.h });
  }
  spots.sort((a, b) => Math.abs(a.x - preferX) - Math.abs(b.x - preferX));
  return spots;
}
