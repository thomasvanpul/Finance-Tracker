import { describe, it, expect } from "vitest";
import { CAT, COMPANIONS, companionById, framePosition, clipDuration } from "./manifest";
import {
  chooseState,
  facingFor,
  IDLE_SIGNALS,
  NO_POINTER,
  POUNCE_SPEED_MIN,
  STALK_RADIUS,
  type CompanionSignals,
} from "./signals";
import { overlaps, isClear, firstClear, candidatesAlong } from "./safe-zone";

const signals = (over: Partial<CompanionSignals> = {}): CompanionSignals => ({ ...IDLE_SIGNALS, ...over });

describe("companion manifest", () => {
  it("every state in the union has a clip", () => {
    // A missing clip is a companion that freezes at the moment the app has
    // something to say. TypeScript enforces this at compile time; the test
    // catches a manifest built at runtime from data.
    for (const m of COMPANIONS) {
      for (const [state, clip] of Object.entries(m.clips)) {
        expect(clip.frames, `${m.id}.${state}`).toBeGreaterThan(0);
        expect(clip.frameMs, `${m.id}.${state}`).toBeGreaterThan(0);
        expect(clip.row, `${m.id}.${state}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("no clip reads past the right edge of the sheet", () => {
    for (const m of COMPANIONS) {
      for (const [state, clip] of Object.entries(m.clips)) {
        expect(clip.frames, `${m.id}.${state}`).toBeLessThanOrEqual(m.columns);
      }
    }
  });

  it("falls back to the cat for an unknown id rather than throwing", () => {
    expect(companionById("no-such-character")).toBe(CAT);
    expect(companionById("cat")).toBe(CAT);
  });

  it("frame position walks left along the clip's own row", () => {
    const walk = CAT.clips.walking;
    expect(framePosition(CAT, walk, 0)).toEqual({ x: 0, y: -walk.row * 32 });
    expect(framePosition(CAT, walk, 3)).toEqual({ x: -96, y: -walk.row * 32 });
    // Wraps rather than running off the sheet.
    expect(framePosition(CAT, walk, walk.frames)).toEqual({ x: 0, y: -walk.row * 32 });
  });

  it("clip duration is frames times frame length", () => {
    expect(clipDuration(CAT.clips.pouncing)).toBe(CAT.clips.pouncing.frames * CAT.clips.pouncing.frameMs);
  });
});

describe("chooseState", () => {
  it("sleeps only on a MEASURED zero gap", () => {
    expect(chooseState(signals({ reconciliationGap: 0 }), NO_POINTER, false)).toBe("sleeping");
  });

  it("does not sleep when the gap is unknown", () => {
    // null means "not checked yet". Sleeping on it would be the app claiming
    // a clean set of books it has not looked at.
    expect(chooseState(signals({ reconciliationGap: null }), NO_POINTER, false)).toBe("sitting");
  });

  it("does not sleep when there is a real gap", () => {
    expect(chooseState(signals({ reconciliationGap: 4200 }), NO_POINTER, false)).toBe("resting");
    expect(chooseState(signals({ reconciliationGap: -4200 }), NO_POINTER, false)).toBe("resting");
  });

  it("wakes to look around when an insight is waiting, even on balanced books", () => {
    expect(chooseState(signals({ reconciliationGap: 0, unreadInsight: true }), NO_POINTER, false)).toBe("lookAround");
  });

  it("walks while a sync runs and digs while a search runs", () => {
    expect(chooseState(signals({ syncing: true }), NO_POINTER, false)).toBe("walking");
    expect(chooseState(signals({ searching: true }), NO_POINTER, false)).toBe("digging");
  });

  it("eats when income lands, ahead of a running sync", () => {
    // Income arriving is the rarer, more interesting event; a sync is
    // background noise that happens every thirty seconds.
    expect(chooseState(signals({ incomeLanded: true, syncing: true }), NO_POINTER, false)).toBe("eating");
  });

  it("search outranks everything else the app is doing", () => {
    const busy = signals({ searching: true, syncing: true, incomeLanded: true, unreadInsight: true });
    expect(chooseState(busy, NO_POINTER, false)).toBe("digging");
  });

  it("stalks a close, slow pointer and pounces a close, fast one", () => {
    const close = { distance: 60, speed: 10, present: true };
    expect(chooseState(signals({ syncing: true }), close, false)).toBe("stalking");
    expect(chooseState(signals({ syncing: true }), { ...close, speed: POUNCE_SPEED_MIN }, false)).toBe("pouncing");
  });

  it("ignores a pointer that is far away", () => {
    const far = { distance: STALK_RADIUS + 1, speed: 5, present: true };
    expect(chooseState(signals({ reconciliationGap: 0 }), far, false)).toBe("sleeping");
  });

  it("ignores a pointer that is not present, however close it last was", () => {
    expect(chooseState(signals({ reconciliationGap: 0 }), { distance: 1, speed: 0, present: false }, false)).toBe("sleeping");
  });

  it("walks when it is moving and the app is quiet", () => {
    expect(chooseState(signals({ reconciliationGap: 0 }), NO_POINTER, true)).toBe("walking");
  });
});

describe("facingFor", () => {
  it("turns toward a nearby pointer", () => {
    const near = { distance: 40, speed: 0, present: true };
    expect(facingFor(500, near, 400)).toBe("left");
    expect(facingFor(500, near, 600)).toBe("right");
  });

  it("returns null rather than snapping when there is nothing to look at", () => {
    expect(facingFor(500, NO_POINTER, 0)).toBeNull();
    expect(facingFor(500, { distance: STALK_RADIUS + 1, speed: 0, present: true }, 0)).toBeNull();
  });
});

describe("safe zone · never cover a number", () => {
  const figure = { x: 100, y: 100, w: 80, h: 20 };

  it("detects overlap and separation", () => {
    expect(overlaps({ x: 90, y: 95, w: 40, h: 40 }, figure, 0)).toBe(true);
    expect(overlaps({ x: 200, y: 100, w: 40, h: 40 }, figure, 0)).toBe(false);
  });

  it("clearance pushes a merely-adjacent box into overlap", () => {
    const touching = { x: 181, y: 100, w: 40, h: 20 };
    expect(overlaps(touching, figure, 0)).toBe(false);
    expect(overlaps(touching, figure, 6)).toBe(true);
  });

  it("isClear is false if ANY figure is covered, not just the first", () => {
    const obstacles = [{ x: 0, y: 0, w: 10, h: 10 }, figure];
    expect(isClear({ x: 100, y: 100, w: 10, h: 10 }, obstacles, 0)).toBe(false);
  });

  it("firstClear returns null when every candidate covers a figure", () => {
    // This is the case that must NOT fall back to "draw it anyway".
    const wall = [{ x: 0, y: 0, w: 2000, h: 2000 }];
    const spots = candidatesAlong(500, { w: 64, h: 64 }, { left: 0, right: 800 }, 400);
    expect(spots.length).toBeGreaterThan(0);
    expect(firstClear(spots, wall)).toBeNull();
  });

  it("candidates are ordered by nearness, so the cat moves as little as it can", () => {
    const spots = candidatesAlong(500, { w: 32, h: 32 }, { left: 0, right: 480 }, 240, 24);
    expect(spots[0].x).toBe(240);
    expect(Math.abs(spots[1].x - 240)).toBe(24);
  });

  it("finds the nearest gap between two figures", () => {
    const obstacles = [
      { x: 0, y: 490, w: 200, h: 40 },
      { x: 300, y: 490, w: 500, h: 40 },
    ];
    const spots = candidatesAlong(500, { w: 64, h: 32 }, { left: 0, right: 800 }, 0, 12);
    const found = firstClear(spots, obstacles, 6);
    expect(found).not.toBeNull();
    expect(found!.x).toBeGreaterThanOrEqual(206);
    expect(found!.x + 64).toBeLessThanOrEqual(294);
  });

  it("never returns a candidate that runs past the right bound", () => {
    const spots = candidatesAlong(0, { w: 64, h: 64 }, { left: 0, right: 100 }, 0, 10);
    for (const s of spots) expect(s.x + s.w).toBeLessThanOrEqual(100);
  });
});
