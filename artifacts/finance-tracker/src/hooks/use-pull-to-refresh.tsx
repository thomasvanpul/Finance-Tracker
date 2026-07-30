import { useRef, useState, useCallback } from "react";
import { haptic } from "@/lib/haptics";

const PULL_THRESHOLD = 60;
const MAX_PULL = 90;

export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only pull if already scrolled to top
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    triggered.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null || isRefreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPullY(0); return; }
    const clamped = Math.min(MAX_PULL, dy * 0.5);
    setPullY(clamped);
    if (clamped >= PULL_THRESHOLD && !triggered.current) {
      triggered.current = true;
      haptic.medium();
    }
  }, [isRefreshing]);

  const onTouchEnd = useCallback(async () => {
    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullY(PULL_THRESHOLD);
      try {
        await onRefresh();
      } finally {
        haptic.light();
        setIsRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
    startY.current = null;
  }, [pullY, isRefreshing, onRefresh]);

  return {
    pullY,
    isRefreshing,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
