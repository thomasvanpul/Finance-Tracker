// What the companion is doing, decided from what the app is doing.
//
// Pure. No DOM, no React, no timers — so the mapping can be tested without
// rendering a sprite, and so the rule "the cat is asleep because there is
// nothing to reconcile" is a readable line of code rather than an emergent
// property of four effects.
//
// The point of wiring states to real signals rather than to a random walk is
// that the companion then carries information. A cat that sleeps when the
// books balance and wakes to look around when an insight is waiting is a
// status light with a tail. A cat that cycles through poses on a timer is
// decoration, and decoration on a finance screen is noise.

import type { CompanionState } from "./manifest";

/** Everything the engine is allowed to know about the app. */
export interface CompanionSignals {
  /**
   * Base-currency size of the unexplained balance movement — the same figure
   * the reconciliation panel shows. Zero means every penny is accounted for.
   * null means the app does not know yet, which is NOT the same as zero and
   * must not put the cat to sleep.
   */
  reconciliationGap: number | null;
  /** An insight has been produced and the user has not dismissed or opened it. */
  unreadInsight: boolean;
  /** A sync / refetch is in flight. */
  syncing: boolean;
  /** The user is typing in a search field. */
  searching: boolean;
  /** Income has landed since the last time the companion acknowledged it. */
  incomeLanded: boolean;
}

export const IDLE_SIGNALS: CompanionSignals = {
  reconciliationGap: null,
  unreadInsight: false,
  syncing: false,
  searching: false,
  incomeLanded: false,
};

/** How the pointer is behaving, in the companion's own coordinate space. */
export interface PointerSignals {
  /** Distance from the companion to the pointer, in CSS pixels. */
  distance: number;
  /** Pointer speed, CSS pixels per second. */
  speed: number;
  /** False when the pointer has not moved for a while, or has left. */
  present: boolean;
}

export const NO_POINTER: PointerSignals = { distance: Infinity, speed: 0, present: false };

/** Within this many pixels the cat takes an interest. */
export const STALK_RADIUS = 220;
/** Below this speed the pointer is "slow" and worth creeping up on. */
export const STALK_SPEED_MAX = 90;
/** Above this speed it is worth pouncing at. */
export const POUNCE_SPEED_MIN = 900;
/** A pounce only makes sense at close range. */
export const POUNCE_RADIUS = 320;

/**
 * The one place a state is chosen.
 *
 * Order is priority, and the order is an argument:
 *
 *  1. The pointer wins, because it is the user's own hand and a companion
 *     that ignores it feels like a video rather than a thing in the room.
 *  2. Then the companion's own feet. `moving` is not a preference, it is a
 *     fact about the pixels: the sprite is sliding sideways this frame, and
 *     every clip below except `walking` is drawn standing still. Measured on
 *     the dashboard on 2026-09-08, the companion was in motion in 99.9% of
 *     frames while `unreadInsight` held it on `lookAround` for 60 seconds
 *     out of 60 — a stationary look-around animation moonwalking across the
 *     page. A clip that contradicts the motion is not a status light, it is
 *     a glitch, so locomotion outranks everything the app has to say.
 *  3. Then work in flight — searching, syncing — because those are the
 *     moments the user is waiting and wants to see that something is happening.
 *  4. Then things waiting to be read.
 *  5. Then rest, and only at the bottom sleep, which requires a MEASURED
 *     zero. A null gap means "not known", and the cat stays awake for it:
 *     sleeping on unknown data would be the app claiming a clean set of books
 *     it has not checked.
 */
export function chooseState(app: CompanionSignals, pointer: PointerSignals, moving: boolean): CompanionState {
  if (pointer.present && pointer.distance < POUNCE_RADIUS && pointer.speed >= POUNCE_SPEED_MIN) return "pouncing";
  if (pointer.present && pointer.distance < STALK_RADIUS && pointer.speed <= STALK_SPEED_MAX) return "stalking";

  if (moving) return "walking";

  if (app.searching) return "digging";
  if (app.incomeLanded) return "eating";
  if (app.syncing) return "walking";
  if (app.unreadInsight) return "lookAround";

  if (app.reconciliationGap === 0) return "sleeping";
  if (app.reconciliationGap === null) return "sitting";
  return "resting";
}

/**
 * Which way the companion should face, given where it is and where the
 * pointer is. Returns null when there is no reason to turn — the caller
 * keeps the current facing rather than snapping to a default, because a
 * sprite that flips every time the pointer leaves reads as a twitch.
 */
export function facingFor(selfX: number, pointer: PointerSignals, pointerX: number): "left" | "right" | null {
  if (!pointer.present || pointer.distance > STALK_RADIUS) return null;
  return pointerX < selfX ? "left" : "right";
}
