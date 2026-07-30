import { useListDebts, useGetDebtSummary, type Debt } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

const MOCK_DEBTS: Debt[] = [
  { id: 901, personName: "James",  description: "Dinner at Nobu",           nativeAmount: 85,  direction: "they_owe_me", status: "pending", date: "2026-07-15", gbpEquivalent: 85,  currency: "GBP", createdAt: "2026-07-15" } as unknown as Debt,
  { id: 902, personName: "Sarah",  description: "Airbnb split — Amsterdam", nativeAmount: 340, direction: "they_owe_me", status: "pending", date: "2026-07-10", gbpEquivalent: 340, currency: "GBP", createdAt: "2026-07-10" } as unknown as Debt,
  { id: 903, personName: "Tom",    description: "Concert tickets",           nativeAmount: 62,  direction: "i_owe_them",  status: "pending", date: "2026-07-20", gbpEquivalent: 62,  currency: "GBP", createdAt: "2026-07-20" } as unknown as Debt,
  { id: 904, personName: "Sarah",  description: "Train to Brighton",         nativeAmount: 24,  direction: "they_owe_me", status: "pending", date: "2026-07-18", gbpEquivalent: 24,  currency: "GBP", createdAt: "2026-07-18" } as unknown as Debt,
];

const MOCK_SETTLED = [
  { id: "s1", personName: "Alice", description: "Groceries split",    amount: 32.50,  daysAgo: 4 },
  { id: "s2", personName: "Mike",  description: "Petrol share",       amount: 45.00,  daysAgo: 11 },
  { id: "s3", personName: "Emma",  description: "Holiday deposit",    amount: 200.00, daysAgo: 18 },
];

// Net owed-to-me per week for the last 7 weeks (mock)
const MOCK_NET_HISTORY = [180, 420, 280, 390, 220, 310, 387];

const PERSON_COLORS: Record<string, string> = {
  James: "#3B82F6",
  Sarah: "#38BDF8",
  Tom:   "var(--ft-amber)",
  Alice: "#10B981",
  Mike:  "#F97316",
  Emma:  "#06B6D4",
};
const FALLBACK_COLORS = ["#3B82F6", "#F97316", "#4ADE80", "#10B981", "#F59E0B", "#06B6D4"];

function personColor(name: string, idx: number) {
  return PERSON_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function urgencyInfo(daysSince: number): { label: string; color: string } {
  if (daysSince > 30) return { label: "AGED", color: "var(--ft-red)" };
  if (daysSince > 14) return { label: "AGING", color: "var(--ft-accent)" };
  return { label: "", color: "var(--ft-green)" };
}

function SparkNetLine({ data, h = 32 }: { data: number[]; h?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(max - min, 1);
  const w = 100;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  const fill = `${pts} ${w},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="ow-ng" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ft-green)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--ft-green)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#ow-ng)" />
      <polyline points={pts} fill="none" stroke="var(--ft-green)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const OWING_WIDGETS = [
  { id: "signals",             label: "Owing signals" },
  { id: "aging",               label: "Debt age distribution" },
  { id: "dti",                 label: "Debt-to-income ratio" },
  { id: "peer-reliability",    label: "Peer reliability scoreboard" },
  { id: "settlement-forecast", label: "Settlement velocity forecast" },
  { id: "debt-timeline",       label: "Outstanding debt timeline" },
  { id: "owed-section",        label: "Owed to me" },
  { id: "i-owe-section",       label: "I owe" },
  { id: "person-exposure",     label: "Exposure by person" },
];

export function MobileOwing({ onBack }: { onBack?: () => void }) {
  const { data: debts = [], isLoading } = useListDebts();
  const { data: summary } = useGetDebtSummary();

  const realPending  = debts.filter(d => d.status === "pending");
  const hasMockData  = realPending.length === 0 && !isLoading;
  const pending      = hasMockData ? MOCK_DEBTS : realPending;
  const owedToMe     = pending.filter(d => d.direction === "they_owe_me");
  const iOwe         = pending.filter(d => d.direction === "i_owe_them");
  const toMe         = hasMockData ? owedToMe.reduce((s, d) => s + d.nativeAmount, 0) : (summary?.totalOwedToMe ?? 0);
  const byMe         = hasMockData ? iOwe.reduce((s, d) => s + d.nativeAmount, 0) : (summary?.totalIOwe ?? 0);
  const net          = toMe - byMe;

  // Group by person for exposure summary
  const byPerson: Record<string, { total: number; direction: string; color: string; count: number }> = {};
  pending.forEach((d, i) => {
    const n = d.personName;
    if (!byPerson[n]) byPerson[n] = { total: 0, direction: d.direction, color: personColor(n, i), count: 0 };
    byPerson[n].total += d.nativeAmount;
    byPerson[n].count += 1;
  });
  const personEntries = Object.entries(byPerson).sort((a, b) => b[1].total - a[1].total);
  const maxPersonTotal = Math.max(...personEntries.map(e => e[1].total), 1);
  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("owing", OWING_WIDGETS);

  // Aging buckets
  const now = Date.now();
  const ageBuckets = { fresh: 0, aging: 0, aged: 0 };
  pending.forEach(d => {
    const days = Math.floor((now - new Date(d.date).getTime()) / 86400000);
    if (days > 14) ageBuckets.aged++;
    else if (days > 7) ageBuckets.aging++;
    else ageBuckets.fresh++;
  });
  const totalDebts = pending.length || 1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 0", marginBottom: 12, flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", display: "flex", padding: 12, marginLeft: -12 }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          Owing
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {pending.length} open{hasMockData && " · preview"}
          </div>
          <WidgetManagerButton widgets={OWING_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: hasMockData ? 0.85 : 1 }}>

          {/* Hero card */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            {/* Net position */}
            <div style={{ padding: "18px 18px 12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
                Net position
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(22px, 7.5vw, 32px)", fontWeight: 700, color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {net >= 0 ? "+" : "−"}{formatGbp(Math.abs(net))}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  net
                </div>
              </div>
              {/* Sparkline — net owed to me over 7 weeks */}
              {hasMockData && (
                <div style={{ marginBottom: 10, borderRadius: 4, overflow: "hidden" }}>
                  <SparkNetLine data={MOCK_NET_HISTORY} h={32} />
                </div>
              )}
              {/* 3 stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>Owed to me</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(toMe)}</div>
                </div>
                <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>I owe</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(byMe)}</div>
                </div>
                <div style={{ borderLeft: "1px solid var(--ft-border)", paddingLeft: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>People</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>{personEntries.length}</div>
                </div>
              </div>
            </div>
            {/* Two-sided balance bar */}
            {(toMe + byMe) > 0 && (
              <div style={{ padding: "0 18px 14px" }}>
                <div style={{ display: "flex", gap: 1, height: 4, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ flex: toMe, background: "var(--ft-green)", minWidth: toMe > 0 ? 4 : 0 }} />
                  <div style={{ flex: byMe, background: "var(--ft-red)", minWidth: byMe > 0 ? 4 : 0 }} />
                </div>
              </div>
            )}
          </div>

          {/* Owing signals */}
          {isVisible("signals") && (() => {
            const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];
            const agedDebts = pending.filter(d => {
              const days = Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000);
              return days > 14 && d.direction === "they_owe_me";
            });
            const myAgedDebts = pending.filter(d => {
              const days = Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000);
              return days > 7 && d.direction === "i_owe_them";
            });
            if (agedDebts.length > 0) {
              const agedTotal = agedDebts.reduce((s, d) => s + d.nativeAmount, 0);
              const worstDays = Math.max(...agedDebts.map(d => Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000)));
              signals.push({ level: "red", headline: `${agedDebts.length} aged debt${agedDebts.length > 1 ? "s" : ""} overdue — ${formatGbp(agedTotal)}`, detail: `Oldest: ${worstDays}d outstanding · follow up recommended` });
            }
            if (myAgedDebts.length > 0) {
              const myTotal = myAgedDebts.reduce((s, d) => s + d.nativeAmount, 0);
              signals.push({ level: "amber", headline: `You owe ${formatGbp(myTotal)} · unpaid >7d`, detail: myAgedDebts.map(d => `${d.personName} (${formatGbp(d.nativeAmount)})`).join(", ") });
            }
            if (net > 0) {
              const weekChange = hasMockData ? MOCK_NET_HISTORY[MOCK_NET_HISTORY.length - 1] - MOCK_NET_HISTORY[MOCK_NET_HISTORY.length - 2] : 0;
              signals.push({ level: "green", headline: `Net receivable +${formatGbp(net)}`, detail: weekChange >= 0 ? `Up ${formatGbp(weekChange)} from last week` : `Down ${formatGbp(Math.abs(weekChange))} from last week` });
            }
            if (signals.length === 0) return null;
            const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Signals</span>
                </div>
                {signals.map((sig, i) => {
                  const col = levelColors[sig.level];
                  return (
                    <div key={i} style={{ padding: "8px 14px", borderBottom: i < signals.length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0, marginTop: 3 }} />
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: col }}>{sig.headline}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>{sig.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Aging breakdown */}
          {isVisible("aging") && <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
              Debt age distribution
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Fresh", sub: "< 7d",  count: ageBuckets.fresh, color: "var(--ft-green)" },
                { label: "Aging", sub: "7–14d", count: ageBuckets.aging, color: "var(--ft-accent)" },
                { label: "Aged",  sub: "> 14d", count: ageBuckets.aged,  color: "var(--ft-red)" },
              ].map(b => (
                <div key={b.label} style={{ textAlign: "center" }}>
                  <div style={{
                    height: 28,
                    background: `color-mix(in srgb, ${b.color} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${b.color} 30%, transparent)`,
                    borderRadius: 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 4,
                  }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: b.color }}>
                      {b.count}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: b.color }}>{b.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{b.sub}</div>
                </div>
              ))}
            </div>
            {/* Aging distribution bar */}
            <div style={{ marginTop: 10, display: "flex", height: 3, borderRadius: 2, overflow: "hidden", gap: 1 }}>
              {ageBuckets.fresh > 0 && <div style={{ flex: ageBuckets.fresh / totalDebts, background: "var(--ft-green)" }} />}
              {ageBuckets.aging > 0 && <div style={{ flex: ageBuckets.aging / totalDebts, background: "var(--ft-accent)" }} />}
              {ageBuckets.aged  > 0 && <div style={{ flex: ageBuckets.aged  / totalDebts, background: "var(--ft-red)" }} />}
            </div>
          </div>}

          {/* Debt-to-income ratio */}
          {isVisible("dti") && hasMockData && (() => {
            const INCOME = 3200;
            const recPct = Math.round(toMe / INCOME * 100);
            const debtPct = Math.round(byMe / INCOME * 100);
            const netPct = recPct - debtPct;
            const debtColor = debtPct > 15 ? "var(--ft-red)" : debtPct > 5 ? "var(--ft-accent)" : "var(--ft-green)";
            const recColor = recPct > 20 ? "var(--ft-accent)" : "var(--ft-green)";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Debt-to-income</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: netPct >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>net {netPct > 0 ? "+" : ""}{netPct}%</span>
                </div>
                {[
                  { label: "Receivables", amt: toMe, pct: recPct, col: recColor },
                  { label: "Obligations", amt: byMe, pct: debtPct, col: debtColor },
                ].map(r => (
                  <div key={r.label} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{r.label} · {formatGbp(r.amt)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: r.col, fontVariantNumeric: "tabular-nums" }}>{r.pct}%</span>
                    </div>
                    <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(r.pct * 4, 100)}%`, background: r.col, borderRadius: 2, opacity: 0.75 }} />
                    </div>
                  </div>
                ))}
                <div style={{ paddingTop: 7, borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 6 }}>
                  {[
                    { label: "Very low", range: "< 5%", color: "var(--ft-green)" },
                    { label: "Manageable", range: "5–15%", color: "var(--ft-accent)" },
                    { label: "Concern",    range: "> 15%", color: "var(--ft-red)" },
                  ].map(t => (
                    <div key={t.label} style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, color: t.color }}>{t.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{t.range}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>vs. gross monthly income £{INCOME.toLocaleString()} · personal IOU exposure</div>
              </div>
            );
          })()}

          {/* Collection stats */}
          {hasMockData && (() => {
            const avgDays = Math.round(MOCK_SETTLED.reduce((s, x) => s + x.daysAgo, 0) / MOCK_SETTLED.length);
            const settledTotal = MOCK_SETTLED.reduce((s, x) => s + x.amount, 0);
            const topRec = personEntries.find(([, info]) => info.direction === "they_owe_me");
            const topConc = topRec && toMe > 0 ? Math.round((topRec[1].total / toMe) * 100) : 0;
            const items = [
              { label: "Avg settle",      value: `${avgDays}d`,            color: avgDays <= 14 ? "var(--ft-green)" : "var(--ft-accent)" },
              { label: "Settled/mo",      value: formatGbp(settledTotal),   color: "var(--ft-green)" },
              { label: "Open debts",      value: String(pending.length),    color: "var(--ft-text)" },
              { label: "Top exposure",    value: `${topConc}%`,             color: topConc > 60 ? "var(--ft-accent)" : "var(--ft-green)" },
            ];
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Collection metrics</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                  {items.map((item, i) => (
                    <div key={item.label} style={{ padding: "9px 6px 7px", borderLeft: i > 0 ? "1px solid var(--ft-border)" : "none", textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 3, lineHeight: 1 }}>{item.value}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.3 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Peer reliability scoreboard */}
          {isVisible("peer-reliability") && hasMockData && (() => {
            const settledMap: Record<string, number[]> = {};
            for (const s of MOCK_SETTLED) {
              if (!settledMap[s.personName]) settledMap[s.personName] = [];
              settledMap[s.personName].push(s.daysAgo);
            }
            const pendingMaxAge: Record<string, number> = {};
            for (const d of pending) {
              if (d.direction === "they_owe_me") {
                const days = Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000);
                pendingMaxAge[d.personName] = Math.max(pendingMaxAge[d.personName] ?? 0, days);
              }
            }
            const allPeople = Array.from(new Set([...Object.keys(settledMap), ...Object.keys(pendingMaxAge)]));
            const scores = allPeople.map(name => {
              const hist = settledMap[name] ?? [];
              const avgDays = hist.length > 0 ? hist.reduce((s, d) => s + d, 0) / hist.length : null;
              let score = avgDays !== null ? Math.max(20, 100 - avgDays * 2.5) : 60;
              const maxAge = pendingMaxAge[name] ?? 0;
              if (maxAge > 14) score -= 30;
              else if (maxAge > 7) score -= 15;
              score = Math.max(10, Math.min(99, Math.round(score)));
              const tier = score >= 75 ? "Reliable" : score >= 50 ? "Variable" : "At-Risk";
              const tierColor = score >= 75 ? "var(--ft-green)" : score >= 50 ? "var(--ft-accent)" : "var(--ft-red)";
              return { name, score, tier, tierColor, avgDays: avgDays ?? maxAge };
            }).sort((a, b) => b.score - a.score);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Peer reliability</span>
                </div>
                {scores.map((s, i) => (
                  <div key={s.name} style={{ padding: "8px 14px", borderBottom: i < scores.length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 14, textAlign: "center", flexShrink: 0 }}>#{i + 1}</div>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: `color-mix(in srgb, ${s.tierColor} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${s.tierColor} 30%, transparent)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: s.tierColor }}>{s.score}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)" }}>{s.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: s.tierColor, letterSpacing: "0.05em" }}>{s.tier} · {s.avgDays > 0 ? `${Math.round(s.avgDays)}d avg` : "no history"}</div>
                    </div>
                    <div style={{ width: 64 }}>
                      <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${s.score}%`, background: s.tierColor, borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "6px 14px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 14 }}>
                  {[
                    { label: "Reliable", color: "var(--ft-green)", range: "≥75" },
                    { label: "Variable", color: "var(--ft-accent)", range: "50–74" },
                    { label: "At-Risk",  color: "var(--ft-red)",   range: "<50" },
                  ].map(t => (
                    <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{t.label} {t.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Settlement velocity forecast — 4W */}
          {isVisible("settlement-forecast") && hasMockData && (() => {
            const avgSettle = Math.round(MOCK_SETTLED.reduce((s, x) => s + x.daysAgo, 0) / MOCK_SETTLED.length);
            const forecastWeeks = [0, 0, 0, 0];
            const owedDebts = pending.filter(d => d.direction === "they_owe_me");
            for (const d of owedDebts) {
              const daysOpen = Math.floor((Date.now() - new Date(d.date).getTime()) / 86400000);
              const remaining = Math.max(0, avgSettle - daysOpen);
              const weekIdx = Math.min(3, Math.floor(remaining / 7));
              forecastWeeks[weekIdx] += d.nativeAmount;
            }
            const maxBar = Math.max(...forecastWeeks, 1);
            const totalForecast = forecastWeeks.reduce((s, v) => s + v, 0);
            const weekLabels = ["This wk", "Wk 2", "Wk 3", "Wk 4+"];

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Settlement forecast · 4W</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(totalForecast)} expected</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 56 }}>
                  {forecastWeeks.map((v, i) => {
                    const barH = v > 0 ? Math.max(8, (v / maxBar) * 48) : 2;
                    const col = i === 0 ? "var(--ft-green)" : v > 0 ? "var(--ft-accent)" : "var(--ft-raised)";
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, height: "100%" }}>
                        {v > 0 && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: col, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                            {formatGbp(v)}
                          </div>
                        )}
                        <div style={{ width: "100%", height: barH, background: col, borderRadius: "2px 2px 0 0", opacity: i === 0 ? 0.9 : 0.65 }} />
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                  {weekLabels.map((label, i) => (
                    <div key={label} style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 7, color: i === 0 ? "var(--ft-text)" : "var(--ft-dim)" }}>
                      {label}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                  Based on {avgSettle}d historical avg · projections only
                </div>
              </div>
            );
          })()}

          {/* Outstanding debt timeline — Gantt-style */}
          {isVisible("debt-timeline") && pending.length > 0 && (() => {
            const windowDays = 30;
            const today = Date.now();
            const rows = [...pending]
              .map(d => {
                const daysSince = Math.floor((today - new Date(d.date).getTime()) / 86400000);
                const { color } = urgencyInfo(daysSince);
                return { name: d.personName, amount: d.nativeAmount, daysSince, color, owed: d.direction === "they_owe_me" };
              })
              .sort((a, b) => b.daysSince - a.daysSince);

            const W = 300, rowH = 22, PX = 76, PAD = 5;
            const H = rows.length * (rowH + PAD) + 10;
            const xOf = (daysAgo: number) =>
              PX + Math.max(0, Math.min(1, (windowDays - daysAgo) / windowDays)) * (W - PX);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                  Outstanding timeline · 30D
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
                  {/* Grid lines at 7 / 14 / 21 days ago */}
                  {[7, 14, 21].map(d => {
                    const gx = xOf(d);
                    return (
                      <g key={d}>
                        <line x1={gx} y1={0} x2={gx} y2={H - 8} stroke="var(--ft-border)" strokeWidth="0.5" />
                        <text x={gx} y={H - 1} fontFamily="monospace" fontSize="6" fill="var(--ft-dim)" textAnchor="middle" dominantBaseline="auto" opacity="0.6">
                          {d}d
                        </text>
                      </g>
                    );
                  })}
                  {/* "Now" right edge */}
                  <line x1={W} y1={0} x2={W} y2={H - 8} stroke="var(--ft-dim)" strokeWidth="0.7" opacity="0.3" />
                  <text x={W} y={H - 1} fontFamily="monospace" fontSize="6" fill="var(--ft-accent)" textAnchor="end" dominantBaseline="auto" fontWeight="700">now</text>
                  {/* Debt rows */}
                  {rows.map((r, i) => {
                    const y = i * (rowH + PAD);
                    const barX = xOf(r.daysSince);
                    const barW = Math.max(3, W - barX);
                    return (
                      <g key={i}>
                        {/* Name */}
                        <text x={0} y={y + rowH * 0.38} fontFamily="monospace" fontSize="8.5" fill="var(--ft-text)" dominantBaseline="hanging">
                          {r.name}
                        </text>
                        {/* Amount */}
                        <text x={0} y={y + rowH * 0.65} fontFamily="monospace" fontSize="7.5" fill={r.color} dominantBaseline="hanging" fontWeight="700">
                          {r.owed ? "+" : "−"}{formatGbp(r.amount)}
                        </text>
                        {/* Track */}
                        <rect x={PX} y={y + rowH * 0.3} width={W - PX} height={rowH * 0.4} rx="2" fill="var(--ft-raised)" />
                        {/* Bar */}
                        <rect x={barX} y={y + rowH * 0.18} width={barW} height={rowH * 0.64} rx="2.5" fill={r.color} opacity="0.65" />
                        {/* Days label inside bar if wide enough */}
                        {barW > 28 && (
                          <text x={barX + 4} y={y + rowH / 2} fontFamily="monospace" fontSize="7" fill="#fff" dominantBaseline="middle" opacity="0.8">
                            {r.daysSince}d
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  {[
                    { color: "var(--ft-green)",  label: "FRESH < 7d" },
                    { color: "var(--ft-accent)", label: "AGING 7–14d" },
                    { color: "var(--ft-red)",    label: "AGED > 14d" },
                  ].map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 12, height: 5, borderRadius: 2, background: l.color, opacity: 0.7 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {isLoading ? (
            <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 32 }}>Loading…</div>
          ) : (
            <>
              {/* Owed to me section */}
              {isVisible("owed-section") && owedToMe.length > 0 && (
                <Section label="Owed to me" total={toMe}>
                  {owedToMe.map((d, i) => (
                    <DebtRow key={d.id} debt={d} isLast={i === owedToMe.length - 1} color="var(--ft-green)" />
                  ))}
                </Section>
              )}

              {/* I owe section */}
              {isVisible("i-owe-section") && iOwe.length > 0 && (
                <Section label="I owe" total={byMe} red>
                  {iOwe.map((d, i) => (
                    <DebtRow key={d.id} debt={d} isLast={i === iOwe.length - 1} color="var(--ft-red)" />
                  ))}
                </Section>
              )}

              {/* Person exposure breakdown */}
              {isVisible("person-exposure") && personEntries.length > 0 && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "11px 14px 0", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
                    Exposure by person
                  </div>
                  {personEntries.map(([name, info], i) => {
                    const isLast = i === personEntries.length - 1;
                    const pct = (info.total / maxPersonTotal) * 100;
                    return (
                      <div key={name} style={{ padding: "8px 14px", borderTop: "1px solid var(--ft-border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 12,
                            background: `color-mix(in srgb, ${info.color} 15%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${info.color} 25%, transparent)`,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: info.color }}>
                              {name.charAt(0)}
                            </span>
                          </div>
                          <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)" }}>{name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                            {info.count} debt{info.count !== 1 ? "s" : ""}
                          </div>
                          <div style={{
                            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                            color: info.direction === "they_owe_me" ? "var(--ft-green)" : "var(--ft-red)",
                          }}>
                            {formatGbp(info.total)}
                          </div>
                        </div>
                        <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: info.color, borderRadius: 2, opacity: 0.7 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Debt concentration risk */}
              {hasMockData && (() => {
                const totalOutstanding = toMe + byMe;
                if (totalOutstanding === 0 || personEntries.length < 2) return null;

                // Herfindahl-Hirschman Index — sum of squared weight shares
                const hhi = personEntries.reduce((s, [, info]) => {
                  const w = info.total / totalOutstanding;
                  return s + w * w;
                }, 0);
                const hhiPct = hhi * 100;
                const top = personEntries[0];
                const topShare = top ? (top[1].total / totalOutstanding) * 100 : 0;

                const riskLevel = hhiPct > 60 ? "high" : hhiPct > 35 ? "moderate" : "diversified";
                const riskColor = riskLevel === "high" ? "var(--ft-red)" : riskLevel === "moderate" ? "var(--ft-accent)" : "var(--ft-green)";

                return (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${riskColor}`, borderRadius: 3, padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: riskColor }}>
                        Concentration risk
                      </span>
                      <div style={{
                        fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, padding: "2px 6px",
                        background: `color-mix(in srgb, ${riskColor} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${riskColor} 25%, transparent)`,
                        color: riskColor, borderRadius: 3, letterSpacing: "0.06em", textTransform: "uppercase",
                      }}>
                        {riskLevel}
                      </div>
                    </div>

                    {/* Stacked concentration bar */}
                    <div style={{ height: 6, background: "var(--ft-raised)", borderRadius: 3, overflow: "hidden", display: "flex", marginBottom: 10 }}>
                      {personEntries.map(([name, info]) => {
                        const w = (info.total / totalOutstanding) * 100;
                        const color = info.color;
                        return <div key={name} style={{ width: `${w}%`, background: color, opacity: 0.8 }} />;
                      })}
                    </div>

                    {/* Stats */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Counterparties</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{personEntries.length}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Top exposure</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: riskColor }}>{topShare.toFixed(0)}%</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>HHI score</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: riskColor }}>{hhiPct.toFixed(0)}</div>
                      </div>
                    </div>

                    <div style={{ paddingTop: 8, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                      {top ? `${top[0]} holds ${topShare.toFixed(0)}% of outstanding · ` : ""}
                      HHI &gt; 60 = single-party risk
                    </div>
                  </div>
                );
              })()}

              {/* Recently settled (mock only) */}
              {hasMockData && (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Recently settled
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                      {MOCK_SETTLED.length} this month
                    </div>
                  </div>
                  {MOCK_SETTLED.map((s, i) => (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                      borderBottom: i < MOCK_SETTLED.length - 1 ? "1px solid var(--ft-border)" : "none",
                    }}>
                      {/* Checkmark circle */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 2, flexShrink: 0,
                        background: "color-mix(in srgb, var(--ft-green) 12%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--ft-green) 20%, transparent)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="var(--ft-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)" }}>{s.personName}</div>
                        <div style={{ fontSize: 10, color: "var(--ft-dim)" }}>{s.description}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(s.amount)}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{s.daysAgo}d ago</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <a href="/owing" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Manage owing</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ label, total, red, children }: { label: string; total: number; red?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>{label}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: red ? "var(--ft-red)" : "var(--ft-green)" }}>{formatGbp(total)}</div>
      </div>
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function DebtRow({ debt, isLast, color }: { debt: Debt; isLast: boolean; color: string }) {
  const date      = new Date(debt.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const daysSince = Math.floor((Date.now() - new Date(debt.date).getTime()) / 86400000);
  const urgency   = urgencyInfo(daysSince);

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
      {/* Top urgency bar */}
      <div style={{ height: 2, background: urgency.color, opacity: 0.6 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 20, flexShrink: 0,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color }}>
            {debt.personName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ft-text)" }}>{debt.personName}</div>
            {urgency.label && (
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700,
                color: urgency.color, letterSpacing: "0.1em",
                padding: "1px 4px", borderRadius: 3,
                background: `color-mix(in srgb, ${urgency.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${urgency.color} 25%, transparent)`,
              }}>
                {urgency.label}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {debt.description}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color }}>{formatGbp(debt.nativeAmount)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            {date} · <span style={{ color: urgency.color }}>{daysSince}d ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}
