import { useEffect, useState } from "react";
import { Network } from "@capacitor/network";

export function useNetworkStatus() {
  // Initialise from navigator.onLine SYNCHRONOUSLY. A default of `true`
  // creates a race window where the auth-gate's cached-session clear
  // branch fires before the async status check completes — wiping the
  // localStorage snapshot that offline reloads depend on. navigator.onLine
  // is available on first render in every real browser.
  const [isOnline, setIsOnline] = useState<boolean>(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
  );

  useEffect(() => {
    let listenerHandle: any;

    const init = async (): Promise<void> => {
      try {
        const status = await Network.getStatus();
        setIsOnline(status.connected);
        listenerHandle = await Network.addListener("networkStatusChange", (s) => {
          setIsOnline(s.connected);
        });
      } catch {
        // Web fallback
        const update = () => setIsOnline(navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
      }
    };

    init();
    return () => { listenerHandle?.remove?.(); };
  }, []);

  return isOnline;
}
