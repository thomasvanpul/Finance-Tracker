import type { PointerEvent as ReactPointerEvent } from "react";
import { PointerSensor } from "@dnd-kit/core";

// Controls a press must reach as a click. Links are not in the list, so a
// widget whose surface is mostly links can still be picked up.
const CONTROL_SELECTOR = 'button, input, select, textarea, [role="button"]';

/** True when the press began on a control inside the draggable, not on the
 *  draggable itself — dnd-kit's attributes give the wrapper role="button". */
function startsOnControl(event: ReactPointerEvent): boolean {
  const root = event.currentTarget as Element | null;
  let node = event.target as Element | null;
  while (node && node !== root) {
    if (node.matches(CONTROL_SELECTOR)) return true;
    node = node.parentElement;
  }
  return false;
}

/** PointerSensor for the view-mode long-press drag. Holding anywhere on a
 *  widget picks it up, but a slow press on one of its buttons stays a click. */
export class LongPressPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (...args: Parameters<(typeof PointerSensor.activators)[0]["handler"]>): boolean =>
        !startsOnControl(args[0] as ReactPointerEvent) && PointerSensor.activators[0].handler(...args),
    },
  ];
}
