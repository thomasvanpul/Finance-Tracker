import { useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

const DELETE_THRESHOLD = 72;
const MAX_PULL = 80;

export function useSwipeDelete(onDelete: () => void) {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isDragging = useRef(false);
  const isLocked = useRef(false);
  const hapticFired = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (isLocked.current) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = false;
    hapticFired.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null || isLocked.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (!isDragging.current) {
      if (Math.abs(dy) > Math.abs(dx) + 4) { startX.current = null; return; }
      if (Math.abs(dx) > 6) isDragging.current = true;
      else return;
    }

    // Left swipe only, with rubber-band resistance past MAX_PULL
    if (dx > 0 && !revealed) { setOffset(0); return; }
    const base = revealed ? -MAX_PULL : 0;
    const raw = base + Math.min(0, dx);
    const clamped = Math.max(-MAX_PULL - 12, raw); // 12px overshoot then resist
    setOffset(clamped);

    if (clamped < -DELETE_THRESHOLD && !hapticFired.current) {
      hapticFired.current = true;
      haptic.medium();
    } else if (clamped > -DELETE_THRESHOLD) {
      hapticFired.current = false;
    }
  };

  const onTouchEnd = () => {
    if (!isDragging.current && startX.current !== null) { startX.current = null; return; }
    startX.current = null;

    if (offset < -DELETE_THRESHOLD) {
      setRevealed(true);
      setOffset(-MAX_PULL);
    } else {
      setRevealed(false);
      setOffset(0);
    }
  };

  const close = () => { setOffset(0); setRevealed(false); isLocked.current = false; };

  const handleDelete = () => {
    isLocked.current = true;
    haptic.error();
    setOffset(-window.innerWidth);
    setTimeout(() => { onDelete(); close(); }, 220);
  };

  return {
    offset,
    revealed,
    close,
    handleDelete,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
