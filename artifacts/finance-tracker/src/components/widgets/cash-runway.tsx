import { useMemo } from "react";
import { useListAccounts, useListTransactions } from "@workspace/api-client-react";
import { WidgetShell } from "./widget-shell";
import { formatBaseMoney } from "@/lib/utils";

function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nowYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function runwayColor(months: number): string {
  if (months < 2) return "var(--ft-red)";
  if (months < 4) return "var(--ft-amber)";
  return "var(--ft-green)";
}

function runwayLabel(months: number): string {
  if (months < 2) return "CRITICAL";
  if (months < 4) return "BELOW TARGET";
  if (months < 6) return "ADEQUATE";
  return "STRONG";
}

type Tx = { type: string; date: string; gbpValue: number };

export function CashRunwayWidget({ isExpanded: _ie }: { isExpanded?: boolean }) {
  const { data: accounts, isLoading: accLoading } = useListAccounts({});
  const { data: txData, isLoading: txLoading } = useListTransactions({});
  const isLoading = accLoading || txLoading;

  const result = useMemo(() => {
    const txs = (txData ?? []) as Tx[];
    const accs = accounts ?? [];

    const totalCash = accs.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);

    // Monthly expense totals for last 3 full months
    const monthExpenses: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const ym = monthsAgo(i);
      const total = txs
        .filter(t => t.type === "expense" && t.date.startsWith(ym))
        .reduce((s, t) => s + (t.gbpValue ?? 0), 0);
      monthExpenses.push(total);
    }

    const nonZero = monthExpenses.filter(v => v > 0);
    const avgBurn = nonZero.length > 0
      ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length
      : 0;

    const runway = avgBurn > 0 ? totalCash / avgBurn : null;

    // This-month vs last-month expense delta for burn rate trend
    const thisYm = nowYm();
    const lastYm = monthsAgo(1);
    const daysInMonth = new Date().getDate();
    const daysTotal = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const thisMonthSoFar = txs
      .filter(t => t.type === "expense" && t.date.startsWith(thisYm))
      .reduce((s, t) => s + (t.gbpValue ?? 0), 0);
    const thisMonthProjected = daysInMonth > 0 ? (thisMonthSoFar / daysInMonth) * daysTotal : 0;
    const lastMonthTotal = txs
      .filter(t => t.type === "expense" && t.date.startsWith(lastYm))
      .reduce((s, t) => s + (t.gbpValue ?? 0), 0);

    const burnDelta = lastMonthTotal > 0 ? thisMonthProjected - lastMonthTotal : null;
    const burnPct = lastMonthTotal > 0 ? Math.round(((thisMonthProjected - lastMonthTotal) / lastMonthTotal) * 100) : null;

    // Daily burn rate
    const dailyBurn = avgBurn / 30;

    return { totalCash, avgBurn, dailyBurn, runway, burnDelta, burnPct };
  }, [accounts, txData]);

  const { totalCash, avgBurn, dailyBurn, runway, burnPct } = result;

  const isEmpty = !isLoading && accounts?.length === 0;

  return (
    <WidgetShell
      title="Cash Runway"
      accent="var(--ft-blue)"
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No accounts linked"
      emptyAction={{ label: "Add account", href: "/accounts" }}
      href="/accounts"
      linkLabel="→ Accounts"
    >
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Primary metric */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
              RUNWAY AT CURRENT BURN
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: runway != null ? runwayColor(runway) : "var(--ft-dim)", letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {runway != null ? runway.toFixed(1) : "—"}
              </span>
              {runway != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)", fontWeight: 500 }}>months</span>
              )}
            </div>
          </div>
          {runway != null && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 8px", border: `1px solid ${runwayColor(runway)}44`, color: runwayColor(runway), letterSpacing: "0.08em", fontWeight: 700, flexShrink: 0 }}>
              {runwayLabel(runway)}
            </div>
          )}
        </div>

        {/* Progress bar to 6-month target */}
        {runway != null && (
          <>
            <div style={{ height: 5, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (runway / 6) * 100)}%`, background: runwayColor(runway) }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: -8 }}>
              <span>0</span>
              <span>6mo target</span>
            </div>
          </>
        )}

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", marginTop: 4 }}>
          {([
            ["CASH", formatBaseMoney(totalCash), "var(--ft-blue)"],
            ["AVG BURN", `${formatBaseMoney(avgBurn)}/mo`, "var(--ft-red)"],
            ["DAILY", `${formatBaseMoney(dailyBurn)}/d`, "var(--ft-dim)"],
          ] as [string, string, string][]).map(([lbl, val, col]) => (
            <div key={lbl} style={{ background: "var(--ft-surface)", padding: "7px 9px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{lbl}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Burn rate trend */}
        {burnPct != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--ft-border)", paddingTop: 8 }}>
            <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", ...(burnPct >= 0 ? { borderBottom: `6px solid var(--ft-red)` } : { borderTop: `6px solid var(--ft-green)` }), flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: burnPct >= 0 ? "var(--ft-red)" : "var(--ft-green)", fontWeight: 700 }}>
              {burnPct >= 0 ? "+" : ""}{burnPct}% vs last month
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
              ({burnPct >= 0 ? "burn accelerating" : "burn slowing"})
            </span>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
