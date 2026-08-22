import { useEffect } from "react";
import { App } from "@capacitor/app";

export function useAppResume(onResume: () => void) {
  useEffect(() => {
    let handle: { remove?: () => void } | undefined;

    const init = async (): Promise<void> => {
      try {
        handle = await App.addListener("appStateChange", ({ isActive }) => {
          // Only fire onResume when we're online — invalidating queries
          // while offline turns cached success into errored-and-empty
          // (the failed refetch wipes data with the way TanStack v5's
          // observer reports it). See offline-cache header.
          if (isActive && (typeof navigator === "undefined" || navigator.onLine)) onResume();
        });
      } catch {
        // Web fallback — visibilitychange
        const handler = () => {
          if (document.visibilityState === "visible" && (typeof navigator === "undefined" || navigator.onLine)) {
            onResume();
          }
        };
        document.addEventListener("visibilitychange", handler);
      }
    };

    init();
    return () => { handle?.remove?.(); };
  }, [onResume]);
}
