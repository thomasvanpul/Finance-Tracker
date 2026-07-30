import { useLocation } from "wouter";
import { haptic } from "@/lib/haptics";

// Ordered sequence for swipe navigation
const PAGE_SEQUENCE = [
  "/",
  "/accounts",
  "/transactions",
  "/analytics",
  "/budget",
  "/goals",
  "/portfolio",
  "/investments",
  "/net-worth",
  "/owing",
  "/upcoming",
  "/subscriptions",
  "/learn",
];

export function usePageSwipe() {
  const [loc, setLoc] = useLocation();

  const currentIdx = PAGE_SEQUENCE.findIndex(p =>
    p === "/" ? loc === "/" : loc === p || loc.startsWith(p + "/")
  );

  const navigatePrev = () => {
    if (currentIdx > 0) {
      haptic.light();
      setLoc(PAGE_SEQUENCE[currentIdx - 1]);
    }
  };

  const navigateNext = () => {
    if (currentIdx < PAGE_SEQUENCE.length - 1 && currentIdx !== -1) {
      haptic.light();
      setLoc(PAGE_SEQUENCE[currentIdx + 1]);
    }
  };

  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx !== -1 && currentIdx < PAGE_SEQUENCE.length - 1;

  return { navigatePrev, navigateNext, hasPrev, hasNext, currentIdx };
}
