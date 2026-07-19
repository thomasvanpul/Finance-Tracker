import { useListUpcoming } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

const RECURRING = ["weekly", "monthly", "quarterly", "yearly"] as const;

const FREQ_LABEL: Record<string, string> = {
  weekly: "wk",
  monthly: "mo",
  quarterly: "qtr",
  yearly: "yr",
};

function toMonthly(amount: number, freq: string): number {
  if (freq === "weekly") return amount * 52 / 12;
  if (freq === "monthly") return amount;
  if (freq === "quarterly") return amount / 3;
  if (freq === "yearly") return amount / 12;
  return amount;
}

export function SubscriptionTrackerWidget() {
  const { data, isLoading } = useListUpcoming({});

  const subs = (data ?? []).filter(
    item => item.type === "expense" && RECURRING.includes(item.frequency as (typeof RECURRING)[number])
  );

  const monthlyTotal = subs.reduce((s, item) => s + toMonthly(item.gbpEquivalent, item.frequency), 0);
  const yearlyTotal = monthlyTotal * 12;

  return (
    <WidgetShell title="Subscriptions" href="/upcoming" linkLabel="→ Manage" isLoading={isLoading} accent="var(--ft-cyan)">
      {!isLoading && (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--ft-border)" }}>
            <div style={{ padding: "10px 12px", borderRight: "1px solid var(--ft-border)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
                Monthly
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-cyan)" }}>
                −{formatGbp(monthlyTotal)}
              </div>
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
                Annually
              </div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--ft-muted)" }}>
                −{formatGbp(yearlyTotal)}
              </div>
            </div>
          </div>

          {/* List */}
          {subs.length === 0 ? (
            <div style={{ padding: "20px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
              No recurring expenses found
            </div>
          ) : (
            subs.map(item => {
              const monthly = toMonthly(item.gbpEquivalent, item.frequency);
              const nextDue = new Date(item.dueDate);
              const daysUntil = Math.ceil((nextDue.getTime() - Date.now()) / 86400000);

              return (
                <div key={item.id} style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--ft-border)",
                  gap: 10,
                }}>
                  {/* Purple bullet */}
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ft-cyan)", flexShrink: 0 }} />

                  {/* Name */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ft-text)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {item.description}
                  </span>

                  {/* Freq badge */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    border: "1px solid var(--ft-cyan)40",
                    color: "var(--ft-cyan)",
                    flexShrink: 0,
                  }}>
                    {FREQ_LABEL[item.frequency] ?? item.frequency}
                  </span>

                  {/* Next due */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: daysUntil <= 7 ? "var(--ft-amber)" : "var(--ft-dim)",
                    flexShrink: 0,
                    width: 44,
                    textAlign: "right",
                  }}>
                    {daysUntil <= 0 ? "due" : `${daysUntil}d`}
                  </span>

                  {/* Amount */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ft-cyan)",
                    flexShrink: 0,
                    width: 68,
                    textAlign: "right",
                  }}>
                    <span className="pnum">−{formatGbp(monthly)}</span><span style={{ color: "var(--ft-dim)", fontSize: 8 }}>/mo</span>
                  </span>
                </div>
              );
            })
          )}
        </>
      )}
    </WidgetShell>
  );
}
