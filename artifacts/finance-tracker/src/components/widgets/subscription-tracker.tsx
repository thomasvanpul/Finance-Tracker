import { useState } from "react";
import { useListUpcoming } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

// ─── Constants ────────────────────────────────────────────────────────────────

const RECURRING = ["weekly", "monthly", "quarterly", "yearly"] as const;
type RecurringFreq = (typeof RECURRING)[number];

const FREQ_LABEL: Record<string, string> = {
  weekly: "wk",
  monthly: "mo",
  quarterly: "qtr",
  yearly: "yr",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthly(amount: number, freq: string): number {
  if (freq === "weekly") return (amount * 52) / 12;
  if (freq === "monthly") return amount;
  if (freq === "quarterly") return amount / 3;
  if (freq === "yearly") return amount / 12;
  return amount;
}

function urgencyColor(daysUntil: number): string {
  if (daysUntil <= 7) return "var(--ft-red)";
  if (daysUntil <= 30) return "var(--ft-amber)";
  return "var(--ft-dim)";
}

function urgencyBg(daysUntil: number): string {
  if (daysUntil <= 7) return "rgba(248,81,73,0.12)";
  if (daysUntil <= 30) return "rgba(240,160,48,0.10)";
  return "transparent";
}

function formatDaysLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "TODAY";
  if (daysUntil === 1) return "1d";
  return `${daysUntil}d`;
}

function formatRenewalDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type DaysBadgeProps = { daysUntil: number };
function DaysBadge({ daysUntil }: DaysBadgeProps) {
  const color = urgencyColor(daysUntil);
  const bg = urgencyBg(daysUntil);
  const label = formatDaysLabel(daysUntil);

  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 5px",
        background: bg,
        color,
        border: daysUntil <= 30 ? `1px solid ${color}40` : "1px solid transparent",
        flexShrink: 0,
        textAlign: "center",
        minWidth: 30,
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySubscriptions() {
  return (
    <div
      style={{
        padding: "28px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 24,
          color: "var(--ft-border)",
          letterSpacing: "-0.02em",
          fontWeight: 700,
        }}
      >
        —
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        No recurring subscriptions found
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          textAlign: "center",
          maxWidth: 200,
          lineHeight: 1.5,
        }}
      >
        Add recurring transactions via the Upcoming tab to track them here.
      </div>
    </div>
  );
}

type SubscriptionRowItem = {
  id: number;
  description: string;
  dueDate: string;
  frequency: string;
  baseEquivalent: number | null;
  status?: string;
};

type SubscriptionRowProps = {
  item: SubscriptionRowItem;
  monthlyTotal: number;
};

function SubscriptionRow({ item, monthlyTotal }: SubscriptionRowProps) {
  const [hov, setHov] = useState(false);
  const monthly = item.baseEquivalent == null ? null : toMonthly(item.baseEquivalent, item.frequency);
  const daysUntil = Math.ceil(
    (new Date(item.dueDate).getTime() - Date.now()) / 86400000
  );
  const sharePct = monthly != null && monthlyTotal > 0 ? (monthly / monthlyTotal) * 100 : 0;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-cyan) 5%, var(--ft-surface))"
          : daysUntil <= 7
            ? "rgba(248,81,73,0.03)"
            : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          alignItems: "center",
          padding: "8px 12px",
          gap: 8,
        }}
      >
        {/* Urgency dot */}
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: urgencyColor(daysUntil),
            flexShrink: 0,
          }}
        />

        {/* Name + renewal date */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {item.description}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--ft-dim)",
              marginTop: 1,
            }}
          >
            renews {formatRenewalDate(item.dueDate)}
          </div>
        </div>

        {/* Frequency badge */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            padding: "1px 5px",
            border: "1px solid var(--ft-cyan)40",
            color: "var(--ft-cyan)",
            flexShrink: 0,
          }}
        >
          {FREQ_LABEL[item.frequency] ?? item.frequency}
        </span>

        {/* Days badge */}
        <DaysBadge daysUntil={daysUntil} />

        {/* Amount + share */}
        <div
          style={{
            textAlign: "right",
            flexShrink: 0,
            minWidth: 64,
          }}
        >
          <div>
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                color: monthly == null ? "var(--ft-dim)" : "var(--ft-cyan)",
              }}
            >
              {monthly == null ? "—" : `−${formatBaseMoney(Math.abs(monthly))}`}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--ft-dim)",
              }}
            >
              /mo
            </span>
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
            {monthly == null ? "no FX" : `${sharePct.toFixed(0)}% of total`}
          </div>
        </div>
      </div>
      {/* Mini share bar */}
      <div style={{ height: 2, background: "var(--ft-border)", marginLeft: 12, marginRight: 12, marginBottom: 2, borderRadius: 1, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${sharePct}%`, background: urgencyColor(daysUntil), opacity: 0.6, borderRadius: 1, transition: "width 0.12s ease" }} />
      </div>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function SubscriptionTrackerWidget() {
  const { data, isLoading } = useListUpcoming({});

  const subs = (data ?? []).filter(
    (item) =>
      item.type === "expense" &&
      RECURRING.includes(item.frequency as RecurringFreq)
  );

  // Sort by days until renewal (soonest first)
  const sorted = [...subs].sort((a, b) => {
    const da = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400000);
    const db = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000);
    return da - db;
  });

  const monthlyTotal = subs.reduce(
    (s, item) => s + toMonthly(item.baseEquivalent ?? 0, item.frequency),
    0
  );
  const yearlyTotal = monthlyTotal * 12;
  const subsWithoutFx = subs.filter((item) => item.baseEquivalent == null).length;

  // Count urgencies
  const urgentCount = subs.filter((item) => {
    const d = Math.ceil((new Date(item.dueDate).getTime() - Date.now()) / 86400000);
    return d <= 7;
  }).length;
  const warningCount = subs.filter((item) => {
    const d = Math.ceil((new Date(item.dueDate).getTime() - Date.now()) / 86400000);
    return d > 7 && d <= 30;
  }).length;

  return (
    <WidgetShell
      title="Subscriptions"
      href="/upcoming"
      linkLabel="→ Manage"
      isLoading={isLoading}
      accent="var(--ft-cyan)"
    >
      {!isLoading && (
        <>
          {/* ── Summary: monthly + annual cost ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderRight: "1px solid var(--ft-border)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                  marginBottom: 3,
                }}
              >
                Monthly Cost
              </div>
              <div
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--ft-cyan)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                −{formatBaseMoney(Math.abs(monthlyTotal))}
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--ft-dim)",
                }}
              >
                {subs.length} subscription{subs.length !== 1 ? "s" : ""}
                {subsWithoutFx > 0 && (
                  <span style={{ color: "var(--ft-amber)" }}> · {subsWithoutFx} no FX</span>
                )}
              </div>
            </div>

            <div style={{ padding: "10px 12px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                  marginBottom: 3,
                }}
              >
                Annual Cost
              </div>
              <div
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--ft-muted)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                −{formatBaseMoney(Math.abs(yearlyTotal))}
              </div>
              {/* Urgency indicators */}
              <div
                style={{
                  marginTop: 5,
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                {urgentCount > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--ft-red)",
                      background: "rgba(248,81,73,0.12)",
                      padding: "1px 5px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {urgentCount} due &lt;7d
                  </span>
                )}
                {warningCount > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--ft-amber)",
                      background: "rgba(240,160,48,0.10)",
                      padding: "1px 5px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {warningCount} due &lt;30d
                  </span>
                )}
                {urgentCount === 0 && warningCount === 0 && subs.length > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--ft-dim)",
                    }}
                  >
                    all clear
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Subscription list ── */}
          {sorted.length === 0 ? (
            <EmptySubscriptions />
          ) : (
            sorted.map((item) => (
              <SubscriptionRow key={item.id} item={item} monthlyTotal={monthlyTotal} />
            ))
          )}
        </>
      )}
    </WidgetShell>
  );
}
