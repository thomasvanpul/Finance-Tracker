import { usePendingCount } from "@/hooks/use-pending-count";

// Dot indicator shown in the header when there are writes queued for
// replay. Invisible when the queue is empty — zero cost when online.
export function SyncBadge() {
  const count = usePendingCount();
  if (count === 0) return null;
  return (
    <span
      title={`${count} pending change${count === 1 ? "" : "s"} — will sync when connected`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        background: "var(--ft-accent)",
        color: "var(--ft-base)",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        padding: "0 4px",
        letterSpacing: "0.04em",
        cursor: "default",
      }}
    >
      {count}
    </span>
  );
}
