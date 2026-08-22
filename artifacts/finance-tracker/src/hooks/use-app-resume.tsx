// Fires onResume when the app REALLY comes back from background —
// not on every focus change.
//
// ── Why the threshold exists ────────────────────────────────────────────────
// Layout wires refreshAll (queryClient.invalidateQueries) into onResume so
// the user sees fresh data when they open the app again. Without a
// threshold, every macOS Space swap, browser tab switch, or
// alt-tab-to-another-window fires visibilitychange → refreshAll → the
// whole cache invalidates → visible re-fetches. On a desktop where the
// user hops between the browser, terminal, and editor every few seconds,
// the app feels like it "reloads" on every glance back.
//
// A "resume" that matters is one where enough time passed that the data
// might be stale. Ten minutes captures the plausible cases: coming back
// from a meeting, from a lunch break, from another app on iPad. Under
// that, we assume the cache is still good enough — TanStack Query's own
// staleTime already covers the shorter cadence.
//
// The threshold applies to BOTH the Capacitor appStateChange path (which
// on iOS/Android already means a real resume, but the OS may fire it for
// task-switcher previews too) and the web visibilitychange fallback
// (which fires on every tab/desktop switch).
//
// Also: refuses to fire when offline — invalidating queries while
// offline turns cached success into errored-and-empty as the refetch
// fails. See offline-cache.ts header.

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";

const RESUME_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function useAppResume(onResume: () => void) {
  // Ref rather than state so the mtime doesn't force a re-run of the
  // effect on every hidden→visible cycle.
  const lastHiddenAt = useRef<number | null>(null);

  useEffect(() => {
    let handle: { remove?: () => void } | undefined;
    let webHandler: (() => void) | null = null;

    function shouldFire(): boolean {
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      if (lastHiddenAt.current === null) return false; // never been hidden
      const gap = Date.now() - lastHiddenAt.current;
      return gap >= RESUME_THRESHOLD_MS;
    }

    const init = async (): Promise<void> => {
      try {
        handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            lastHiddenAt.current = Date.now();
            return;
          }
          if (shouldFire()) {
            lastHiddenAt.current = null;
            onResume();
          }
        });
      } catch {
        // Web fallback — visibilitychange fires on tab/desktop
        // switch, browser minimise, everything. The threshold check
        // filters those out; only a genuine return-from-background
        // that stayed hidden ≥ 10 min triggers the refresh.
        webHandler = () => {
          if (document.visibilityState === "hidden") {
            lastHiddenAt.current = Date.now();
            return;
          }
          if (document.visibilityState === "visible" && shouldFire()) {
            lastHiddenAt.current = null;
            onResume();
          }
        };
        document.addEventListener("visibilitychange", webHandler);
      }
    };

    init();
    return () => {
      handle?.remove?.();
      if (webHandler) document.removeEventListener("visibilitychange", webHandler);
    };
  }, [onResume]);
}
