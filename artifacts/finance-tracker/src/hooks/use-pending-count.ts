import { useLiveQuery } from "dexie-react-hooks";
import { outboxDb } from "@/lib/outbox-db";

export function usePendingCount(): number {
  return useLiveQuery(() => outboxDb.outbox.count(), [], 0);
}
