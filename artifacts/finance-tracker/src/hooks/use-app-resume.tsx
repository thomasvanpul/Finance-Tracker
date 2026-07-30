import { useEffect } from "react";
import { App } from "@capacitor/app";

export function useAppResume(onResume: () => void) {
  useEffect(() => {
    let handle: any;

    const init = async (): Promise<void> => {
      try {
        handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) onResume();
        });
      } catch {
        // Web fallback — visibilitychange
        const handler = () => { if (document.visibilityState === "visible") onResume(); };
        document.addEventListener("visibilitychange", handler);
      }
    };

    init();
    return () => { handle?.remove?.(); };
  }, [onResume]);
}
