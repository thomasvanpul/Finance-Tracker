import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAT, type CompanionManifest, type CompanionState } from "@/lib/companion/manifest";
import {
  chooseState,
  facingFor,
  IDLE_SIGNALS,
  NO_POINTER,
  STALK_RADIUS,
  type CompanionSignals,
  type PointerSignals,
} from "@/lib/companion/signals";
import {
  candidatesAlong,
  collectObstacles,
  firstClear,
  isClear,
  type Obstacles,
} from "@/lib/companion/safe-zone";
import { SpriteActor } from "./sprite-actor";

// The companion: one character, roaming, that never covers a number.
//
// Three responsibilities, kept apart:
//   · lib/companion/manifest.ts — what the character looks like
//   · lib/companion/signals.ts  — what it should be doing, given the app
//   · lib/companion/safe-zone.ts — where it is allowed to be
// This file is the loop that joins them and the DOM it writes to. It holds
// no opinions about cats.

const SCALE = 2;
const SPRITE = 32 * SCALE;

/** Walking speed, CSS px per second. */
const WALK_SPEED = 62;
/** Creeping up on the pointer is deliberately slower than walking. */
const STALK_SPEED = 26;
/** A pounce is a burst, not a walk. */
const POUNCE_SPEED = 620;

/**
 * Bands the companion may stand on, as distances from the bottom of the
 * viewport to the TOP of the sprite. Tried in order: it prefers the floor and
 * only climbs when the floor is covered in figures.
 */
const BAND_OFFSETS = [96, 168, 240, 312];

/** How often the layout is re-read. Reading rects is the expensive part. */
const SCAN_MS = 700;

/**
 * How long after the last scroll event the companion waits before placing
 * itself again. Long enough that a flick does not put it back mid-glide,
 * short enough that it is there when the user stops reading and looks.
 */
const SCROLL_SETTLE_MS = 200;

/** How long a pounce lasts, in ms. */
const POUNCE_MS = 320;

interface CompanionProps {
  /** Clicking the companion opens the assistant, as the wanderer did. */
  onOpen: (x?: number, y?: number) => void;
  /** The assistant asked for it — come to the pointer and sit. */
  summoned?: boolean;
  /** Changes on navigation, so the companion re-scans the new page. */
  locationKey?: string;
  /** Left wall. The desktop sidebar is not somewhere to walk. */
  sidebarW?: number;
  /** What the app is doing. See lib/companion/signals.ts. */
  signals?: CompanionSignals;
  manifest?: CompanionManifest;
}

export function Companion({
  onOpen,
  summoned = false,
  locationKey,
  sidebarW = 0,
  signals = IDLE_SIGNALS,
  manifest = CAT,
}: CompanionProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [facing, setFacing] = useState<"left" | "right">(manifest.facing);
  const [state, setState] = useState<CompanionState>("sitting");

  const posRef = useRef<{ x: number; y: number } | null>(null);
  const targetRef = useRef<number | null>(null);
  const obstaclesRef = useRef<Obstacles>({ numbers: [], text: [] });
  const pointerRef = useRef<PointerSignals>(NO_POINTER);
  const pointerXYRef = useRef({ x: 0, y: 0 });
  const lastMoveRef = useRef({ x: 0, y: 0, t: 0 });
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  // Both of these used to be React state read back inside the animation
  // loop. `pounceUntil` was written from inside a setState updater — a side
  // effect in a function React is allowed to call twice — and it was in the
  // loop effect's dependency array, so starting a pounce tore the loop down
  // and rebuilt it mid-pounce. Refs are the right shape for a value the loop
  // both writes and reads within one frame.
  const pounceUntilRef = useRef(0);
  const stateRef = useRef<CompanionState>("sitting");

  const reduced = usePrefersReducedMotion();

  // ── Where it is allowed to stand ────────────────────────────────────────
  // Two passes. The first keeps clear of every painted glyph, which is where
  // the companion looks like it is standing on the page rather than on the
  // content. The second keeps clear only of numbers — the hard rule — and is
  // reached on a dense screen where there is no true whitespace left. If
  // neither finds a spot, `place` returns null and the companion is not
  // rendered at all: it yields to the figures rather than sit on one.
  const placeOnBand = useCallback(
    (preferX: number, bandY: number, obstacles: Obstacles): { x: number; y: number } | null => {
      const left = sidebarW + 8;
      const right = window.innerWidth - 8;
      if (right - left < SPRITE || bandY < 0) return null;
      for (const tier of [obstacles.text, obstacles.numbers]) {
        const spot = firstClear(
          candidatesAlong(bandY, { w: SPRITE, h: SPRITE }, { left, right }, preferX),
          tier,
        );
        if (spot) return { x: spot.x, y: spot.y };
      }
      return null;
    },
    [sidebarW],
  );

  const place = useCallback(
    (preferX: number, obstacles: Obstacles): { x: number; y: number } | null => {
      for (const off of BAND_OFFSETS) {
        const spot = placeOnBand(preferX, window.innerHeight - off, obstacles);
        if (spot) return spot;
      }
      return null;
    },
    [placeOnBand],
  );

  // True between the first scroll event and the settle below. Held as a ref
  // rather than state so the interval and the listener agree within a frame.
  const scrollingRef = useRef(false);

  const rescan = useCallback(() => {
    // The periodic scan must not re-seat the companion while the page is
    // still moving: the withdrawal below and a 700ms interval that puts it
    // back produced a blink, measured at fourteen appearances in thirty
    // seconds of continuous scrolling. One scan, once the page settles.
    if (scrollingRef.current) return;
    const obstacles = collectObstacles();
    obstaclesRef.current = obstacles;
    const current = posRef.current;
    // Stay put while the current spot is still clear of numbers — a
    // companion that re-seats itself on every scan is a twitch, not a
    // character, so the softer text preference is not re-applied here.
    if (current && isClear({ ...current, w: SPRITE, h: SPRITE }, obstacles.numbers)) return;
    const next = place(current?.x ?? window.innerWidth * 0.6, obstacles);
    posRef.current = next;
    targetRef.current = null;
    setPos(next);
  }, [place]);

  // Withdraw. Used while the page is scrolling: see the note below.
  const hide = useCallback(() => {
    if (posRef.current === null) return;
    posRef.current = null;
    targetRef.current = null;
    setPos(null);
  }, []);

  useEffect(() => {
    rescan();
    const id = window.setInterval(rescan, SCAN_MS);
    window.addEventListener("resize", rescan);

    // Scroll does not bubble, and this app scrolls inside `main.ft-main`
    // rather than the window — so the window-level listener that used to be
    // here never fired once. The only thing that noticed a scroll was the
    // 700ms interval, by which point the companion had been standing on a
    // figure for up to 700ms, and the interval's re-place read as a
    // teleport: measured on the dashboard on 2026-09-08, twenty jumps in
    // thirty seconds of scrolling, up to 320px sideways and across three
    // bands. Capture catches every scroller, inner ones included.
    //
    // While a scroll is in progress the companion is withdrawn rather than
    // re-seated. Re-seating it against content that is moving under it is
    // the jumping; withdrawing is the failure mode lib/companion/safe-zone.ts
    // already argues for, and it also closes the window in which the sprite
    // is sitting on a number nobody has re-measured.
    let settle = 0;
    const onScroll = () => {
      scrollingRef.current = true;
      hide();
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        scrollingRef.current = false;
        rescan();
      }, SCROLL_SETTLE_MS);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });

    return () => {
      window.clearInterval(id);
      window.clearTimeout(settle);
      scrollingRef.current = false;
      window.removeEventListener("resize", rescan);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [rescan, hide]);

  // A new page is a new set of figures. Re-read immediately rather than
  // waiting out the interval on top of whatever just rendered.
  useEffect(() => {
    const t = window.setTimeout(rescan, 120);
    return () => window.clearTimeout(t);
  }, [locationKey, rescan]);

  // ── The pointer ─────────────────────────────────────────────────────────
  useEffect(() => {
    let idle = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      const last = lastMoveRef.current;
      const dt = Math.max(now - last.t, 1) / 1000;
      const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
      lastMoveRef.current = { x: e.clientX, y: e.clientY, t: now };
      pointerXYRef.current = { x: e.clientX, y: e.clientY };
      const self = posRef.current;
      pointerRef.current = {
        distance: self
          ? Math.hypot(e.clientX - (self.x + SPRITE / 2), e.clientY - (self.y + SPRITE / 2))
          : Infinity,
        speed: last.t === 0 ? 0 : dist / dt,
        present: true,
      };
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        // The pointer stopping is not the pointer leaving, but a stationary
        // pointer is no longer something to chase.
        pointerRef.current = { ...pointerRef.current, speed: 0 };
      }, 140);
    };
    const onLeave = () => {
      pointerRef.current = NO_POINTER;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // ── The loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const self = posRef.current;
      if (!self) return;

      // Distance is measured here, against where the companion actually is
      // on this frame. It used to be computed only inside the mousemove
      // handler, from the position the companion held at that instant, so
      // `chasing` stayed latched to a distance the cat had already walked
      // out of and only corrected itself when the user moved the mouse.
      const pointerXY = pointerXYRef.current;
      const raw = pointerRef.current;
      const pointer = raw.present
        ? {
            ...raw,
            distance: Math.hypot(
              pointerXY.x - (self.x + SPRITE / 2),
              pointerXY.y - (self.y + SPRITE / 2),
            ),
          }
        : raw;
      const pointerX = pointerXY.x;

      // Pick a destination.
      //
      // An idle companion stands still. It used to wander on a timer, which
      // measured on the dashboard as motion in 99.9% of frames — 3,716px
      // walked in sixty seconds inside a 214px corridor, because `place`
      // returns the clear candidate nearest the preferred x and only that
      // corridor was ever clear. A cat pacing the same eight inches forever
      // is the "berserk" reading, and it also empties `walking` of meaning:
      // STATE_TITLE says walking means "Syncing", which cannot be true of a
      // state the companion is in all the time.
      //
      // So it moves for a reason or not at all: the user's pointer, an
      // explicit summons, a sync actually in flight, or its own spot having
      // stopped being safe (which `rescan` handles, not this).
      let target = targetRef.current;
      const chasing = pointer.present && pointer.distance < STALK_RADIUS;
      const roaming = signalsRef.current.syncing;
      if (summoned || chasing) {
        target = clampX(pointerX - SPRITE / 2, sidebarW);
      } else if (!roaming) {
        target = null;
      } else if (target === null || Math.abs(target - self.x) < 2) {
        // Wander, but only along the band it is standing on. Taking just the
        // x of a spot cleared on a different band sent it walking towards
        // somewhere it could not stand, where it stalled and re-randomised
        // its target every frame.
        const spot = placeOnBand(randomX(sidebarW), self.y, obstaclesRef.current);
        target = spot ? spot.x : self.x;
      }
      targetRef.current = target;

      const pouncing = now < pounceUntilRef.current;
      const speed = pouncing ? POUNCE_SPEED : chasing ? STALK_SPEED : WALK_SPEED;
      const delta = (target ?? self.x) - self.x;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), speed * dt);
      const moving = Math.abs(delta) > 1.5;

      if (moving) {
        const nextX = self.x + step;
        const candidate = { x: nextX, y: self.y, w: SPRITE, h: SPRITE };
        // Movement is subject to the same rule as placement. Rather than
        // walking across a figure it stops at the edge of one.
        if (isClear(candidate, obstaclesRef.current.numbers)) {
          posRef.current = { x: nextX, y: self.y };
          setPos(posRef.current);
          setFacing(step < 0 ? "left" : "right");
        } else {
          targetRef.current = null;
        }
      }

      // Look at the pointer even when standing still.
      const look = facingFor(self.x + SPRITE / 2, pointer, pointerX);
      if (look && !moving) setFacing(look);

      const next = chooseState(signalsRef.current, pointer, moving && !chasing);
      if (next !== stateRef.current) {
        if (next === "pouncing") pounceUntilRef.current = now + POUNCE_MS;
        stateRef.current = next;
        setState(next);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, summoned, sidebarW, placeOnBand]);

  // Reduced motion: the companion still reports state, it just does not move
  // and its clip does not run. A still cat is a legible status light.
  useEffect(() => {
    if (!reduced) return;
    const next = chooseState(signalsRef.current, NO_POINTER, false);
    stateRef.current = next;
    setState(next);
  }, [reduced, signals]);

  const title = useMemo(() => STATE_TITLE[state], [state]);

  if (!pos) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: SPRITE,
        height: SPRITE,
        zIndex: 40,
        cursor: "pointer",
      }}
      role="button"
      tabIndex={0}
      aria-label={`Assistant · ${title}`}
      title={title}
      onClick={() => onOpen(pos.x, pos.y)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(pos.x, pos.y);
        }
      }}
    >
      <SpriteActor
        manifest={manifest}
        state={state}
        scale={SCALE}
        facing={facing}
        paused={reduced}
      />
    </div>
  );
}

/** What each state is actually reporting, for the tooltip and the label. */
export const STATE_TITLE: Record<CompanionState, string> = {
  sleeping: "Nothing to reconcile",
  resting: "Resting",
  sitting: "Waiting",
  idle: "Waiting",
  walking: "Syncing",
  running: "Syncing",
  stalking: "Watching the cursor",
  pouncing: "Pouncing",
  lookAround: "An insight is waiting",
  eating: "Income landed",
  digging: "Searching",
  alert: "Something changed",
};

function clampX(x: number, sidebarW: number): number {
  return Math.max(sidebarW + 8, Math.min(window.innerWidth - SPRITE - 8, x));
}

function randomX(sidebarW: number): number {
  const left = sidebarW + 8;
  return left + Math.random() * Math.max(window.innerWidth - SPRITE - 16 - left, 0);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
