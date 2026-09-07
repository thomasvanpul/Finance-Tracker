// The companion sprite manifest — character-agnostic.
//
// A companion is a sprite sheet plus a map from STATE to a row of frames.
// The engine knows only the states; it knows nothing about cats, and nothing
// about which pack a sheet came from. Adding a second character is adding a
// second manifest, not a second engine — which is the whole reason this file
// is separate from the component that draws it.
//
// ── States are named by MEANING, never by the pack's animation names ────────
// The cat pack calls its rows Sit_1, Dream, Creep_Up, R_A_Right, Dig_1. Those
// names describe what a cat is doing. What the app needs to say is "there is
// nothing left to reconcile" or "a sync is running", and the manifest is
// where one is translated into the other. A second character whose pack calls
// the same idea "snooze" or "idle_b" fills in the same key and every caller
// keeps working.
//
// ── Row indices were read off the sheet, not off the pack's tag list ────────
// The .aseprite tag list does not line up one-to-one with the exported rows
// (group tags and leaf tags are interleaved, and two names are misspelled in
// the source), so every row below was confirmed by rendering it and looking
// at it. The comment on each entry says what the frames actually show.

export interface CompanionClip {
  /** Zero-based row in the sheet. */
  row: number;
  /** Frames used from that row, left to right, starting at column 0. */
  frames: number;
  /** Milliseconds per frame. */
  frameMs: number;
  /** false = play once and hold the last frame (a pounce, a dig). */
  loop: boolean;
}

/**
 * Every state the engine can ask for. A manifest MUST supply all of them —
 * a missing state is a companion that freezes at the moment the app has
 * something to say, which is the moment it matters.
 */
export type CompanionState =
  | "sleeping"      // nothing outstanding — the reconciliation gap is zero
  | "resting"       // awake, settled, nothing to do
  | "sitting"       // settled, watching
  | "idle"          // standing, between moves
  | "walking"       // moving, unhurried — a sync is running
  | "running"       // moving fast — crossing to somewhere
  | "stalking"      // the pointer is close and slow
  | "pouncing"      // the pointer moved fast
  | "lookAround"    // an insight is waiting and has not been read
  | "eating"        // income landed
  | "digging"       // a search is running
  | "alert";        // startled — something changed under it

export interface CompanionManifest {
  id: string;
  label: string;
  /** One line, shown in settings. Where the art came from and its licence. */
  credit: string;
  /** URL under the app's publicDir. */
  sheet: string;
  /** Square frames. Both the cell size and the drawn size before scaling. */
  frameSize: number;
  /** Sheet width in frames — needed to compute background-position. */
  columns: number;
  /** Which way the art faces at rest. The engine mirrors for the other way. */
  facing: "left" | "right";
  clips: Record<CompanionState, CompanionClip>;
}

export const CAT: CompanionManifest = {
  id: "cat",
  label: "Cat",
  credit: "32×32 cat, CC0. 8 columns × 51 rows, one animation per row.",
  sheet: "/companions/cat-sheet.png",
  frameSize: 32,
  columns: 8,
  // Every frame in the sheet is drawn nose-left, tail-right.
  facing: "left",
  clips: {
    // Row 11: curled up, head tucked into the body, the whole shape rising
    // and falling. The only row in the sheet that reads as properly asleep.
    sleeping:   { row: 11, frames: 8, frameMs: 220, loop: true },
    // Row 9: lying down, head up, tail moving. Awake but settled.
    resting:    { row: 9,  frames: 4, frameMs: 260, loop: true },
    // Row 0: seated upright, tail flicking.
    sitting:    { row: 0,  frames: 8, frameMs: 190, loop: true },
    // Row 2: standing four-square, tail swaying.
    idle:       { row: 2,  frames: 8, frameMs: 170, loop: true },
    // Row 4: the full walk cycle.
    walking:    { row: 4,  frames: 8, frameMs: 110, loop: true },
    // Row 8: the short fast gait. Three frames, so it needs to be quick.
    running:    { row: 8,  frames: 3, frameMs: 80,  loop: true },
    // Row 13: belly to the ground, head forward, creeping.
    stalking:   { row: 13, frames: 4, frameMs: 160, loop: true },
    // Row 19: the leap. Plays once and holds — the engine moves the sprite.
    pouncing:   { row: 19, frames: 4, frameMs: 70,  loop: false },
    // Row 27: turns to face the reader and looks about.
    lookAround: { row: 27, frames: 4, frameMs: 200, loop: true },
    // Row 16: head down at the floor, a crumb appearing beside it.
    eating:     { row: 16, frames: 4, frameMs: 150, loop: true },
    // Row 43: front paws working, dust kicking up behind.
    digging:    { row: 43, frames: 4, frameMs: 100, loop: true },
    // Row 18: back arched, fur up. Startled, not aggressive at this size.
    alert:      { row: 18, frames: 8, frameMs: 90,  loop: true },
  },
};

/** Every character the app ships. One, deliberately — see DESIGN.md § 6. */
export const COMPANIONS: CompanionManifest[] = [CAT];

export function companionById(id: string): CompanionManifest {
  return COMPANIONS.find((c) => c.id === id) ?? CAT;
}

/**
 * The background-position for one frame, in CSS pixels at scale 1. Exported
 * so the sprite component and its test agree on the arithmetic rather than
 * each having their own copy.
 */
export function framePosition(m: CompanionManifest, clip: CompanionClip, frame: number): { x: number; y: number } {
  const col = frame % clip.frames;
  // `|| 0` normalises the negative zero that `-0 * n` produces for column or
  // row 0. It is harmless in a background-position string but makes every
  // equality check against the arithmetic surprising.
  return { x: -col * m.frameSize || 0, y: -clip.row * m.frameSize || 0 };
}

/** Full duration of one pass through a clip, in ms. */
export function clipDuration(clip: CompanionClip): number {
  return clip.frames * clip.frameMs;
}
