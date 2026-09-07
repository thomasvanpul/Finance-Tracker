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
  const [pounceUntil, setPounceUntil] = useState(0);

  const posRef = useRef<{ x: number; y: number } | null>(null);
  const targetRef = useRef<number | null>(null);
  const obstaclesRef = useRef<Obstacles>({ numbers: [], text: [] });
  const pointerRef = useRef<PointerSignals>(NO_POINTER);
  const pointerXYRef = useRef({ x: 0, y: 0 });
  const lastMoveRef = useRef({ x: 0, y: 0, t: 0 });
  const signalsRef = useRef(signals);
  signalsRef.current = signals;

  const reduced = usePrefersReducedMotion();

  // ── Where it is allowed to stand ────────────────────────────────────────
  // Two passes. The first keeps clear of every painted glyph, which is where
  // the companion looks like it is standing on the page rather than on the
  // content. The second keeps clear only of numbers — the hard rule — and is
  // reached on a dense screen where there is no true whitespace left. If
  // neither finds a spot, `place` returns null and the companion is not
  // rendered at all: it yields to the figures rather than sit on one.
  const place = useCallback(
    (preferX: number, obstacles: Obstacles): { x: number; y: number } | null => {
      const left = sidebarW + 8;
      const right = window.innerWidth - 8;
      if (right - left < SPRITE) return null;
      for (const tier of [obstacles.text, obstacles.numbers]) {
        for (const off of BAND_OFFSETS) {
          const bandY = window.innerHeight - off;
          if (bandY < 0) continue;
          const spot = firstClear(
            candidatesAlong(bandY, { w: SPRITE, h: SPRITE }, { left, right }, preferX),
            tier,
          );
          if (spot) return { x: spot.x, y: spot.y };
        }
      }
      return null;
    },
    [sidebarW],
  );

  const rescan = useCallback(() => {
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

  useEffect(() => {
    rescan();
    const id = window.setInterval(rescan, SCAN_MS);
    window.addEventListener("resize", rescan);
    window.addEventListener("scroll", rescan, { passive: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", rescan);
      window.removeEventListener("scroll", rescan);
    };
  }, [rescan]);

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

      const pointer = pointerRef.current;
      const pointerX = pointerXYRef.current.x;

      // Pick a destination.
      let target = targetRef.current;
      const chasing = pointer.present && pointer.distance < STALK_RADIUS;
      if (summoned || chasing) {
        target = clampX(pointerX - SPRITE / 2, sidebarW);
      } else if (target === null || Math.abs(target - self.x) < 2) {
        // Wander, but only to somewhere it is allowed to be.
        const spot = place(randomX(sidebarW), obstaclesRef.current);
        target = spot ? spot.x : self.x;
      }
      targetRef.current = target;

      const pouncing = now < pounceUntil;
      const speed = pouncing ? POUNCE_SPEED : chasing ? STALK_SPEED : WALK_SPEED;
      const delta = target - self.x;
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
      setState((prev) => {
        if (prev === next) return prev;
        if (next === "pouncing") setPounceUntil(now + 320);
        return next;
      });
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, summoned, sidebarW, place, pounceUntil]);

  // Reduced motion: the companion still reports state, it just does not move
  // and its clip does not run. A still cat is a legible status light.
  useEffect(() => {
    if (!reduced) return;
    setState(chooseState(signalsRef.current, NO_POINTER, false));
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
