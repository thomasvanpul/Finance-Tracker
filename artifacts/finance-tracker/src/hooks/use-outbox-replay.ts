import { useEffect, useRef } from "react";
import { useNetworkStatus } from "./use-network-status";
import { replayOutbox } from "@/lib/outbox-db";

export function useOutboxReplay(
  onSuccess: (count: number) => void,
  onPermFailure: () => void,
): void {
  const isOnline = useNetworkStatus();
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    // Replay when transitioning from offline to online, and once on
    // mount if already online (catches queued items from a prior session).
    const wasOffline = !prevOnline.current;
    prevOnline.current = isOnline;

    if (isOnline && (wasOffline || prevOnline.current === undefined)) {
      replayOutbox(onSuccess, onPermFailure).catch(() => {
        // Replay errors are silent — transient failures stay in queue.
      });
    }
  }, [isOnline, onSuccess, onPermFailure]);

  // On first mount: replay whatever is in the queue.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      replayOutbox(onSuccess, onPermFailure).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
