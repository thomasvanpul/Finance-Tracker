import { useEffect, useRef, useState } from "react";
import type { CompanionManifest, CompanionState } from "@/lib/companion/manifest";
import { framePosition } from "@/lib/companion/manifest";

// One sprite, one clip, stepped frame by frame.
//
// The whole renderer is a background-position on a div. No canvas, no
// animation library, no per-frame React state beyond the frame index — the
// sheet is 256px wide and the browser composites it for free.
//
// Scaling is done with background-size rather than a transform, so the
// element's layout box is the drawn size. That matters because the collision
// check in lib/companion/safe-zone.ts reasons about the box the cat occupies;
// a transform-scaled sprite would report a 32px box and cover 64px of screen,
// which is exactly the failure the hard rule exists to prevent. It also makes
// mirroring free — scaleX(-1) is symmetric about the element's own centre.
//
// image-rendering: pixelated is not optional. A 32px sprite drawn at 64px
// with the default smoothing turns into a grey smudge, which is the tell
// docs/AI-DESIGN-TELLS.md warns about: pixel art resized by something that
// did not know it was pixel art.

interface SpriteActorProps {
  manifest: CompanionManifest;
  state: CompanionState;
  /** Integer multiplier. Non-integer scales break pixel alignment. */
  scale?: number;
  /** Which way the sprite should look. Mirrored when it differs from the sheet. */
  facing?: "left" | "right";
  /** Fires once when a non-looping clip reaches its last frame. */
  onClipEnd?: () => void;
  /** Stops the frame timer. Used for prefers-reduced-motion. */
  paused?: boolean;
}

export function SpriteActor({
  manifest,
  state,
  scale = 2,
  facing,
  onClipEnd,
  paused = false,
}: SpriteActorProps) {
  const clip = manifest.clips[state];
  const [frame, setFrame] = useState(0);
  const endedRef = useRef(false);
  const endRef = useRef(onClipEnd);
  endRef.current = onClipEnd;

  // Restart the clip whenever the state changes, so a pounce always plays
  // from its first frame rather than resuming wherever the last clip stopped.
  useEffect(() => {
    setFrame(0);
    endedRef.current = false;
  }, [state]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setFrame((f) => {
        const next = f + 1;
        if (next < clip.frames) return next;
        if (clip.loop) return 0;
        // Hold the last frame and report once. The caller decides what
        // happens next; the sprite does not choose its own state.
        if (!endedRef.current) {
          endedRef.current = true;
          endRef.current?.();
        }
        return clip.frames - 1;
      });
    }, clip.frameMs);
    return () => window.clearInterval(id);
  }, [clip, paused]);

  const { x, y } = framePosition(manifest, clip, frame);
  const drawn = manifest.frameSize * scale;
  const mirrored = facing !== undefined && facing !== manifest.facing;

  return (
    <div
      aria-hidden="true"
      style={{
        width: drawn,
        height: drawn,
        backgroundImage: `url(${manifest.sheet})`,
        backgroundSize: `${manifest.columns * manifest.frameSize * scale}px auto`,
        backgroundPosition: `${x * scale}px ${y * scale}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        transform: mirrored ? "scaleX(-1)" : undefined,
        pointerEvents: "none",
      }}
    />
  );
}
