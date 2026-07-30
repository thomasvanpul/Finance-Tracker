import { useEffect, useState } from "react";
import { Network } from "@capacitor/network";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

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
