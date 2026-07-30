import { useListSubscriptions, type Subscription } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useWidgetVisibility } from "@/hooks/use-widget-visibility";
import { WidgetManagerButton } from "./MobileWidgetManager";

function toMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly":    return (amount * 52) / 12;
    case "quarterly": return amount / 3;
    case "annual":    return amount / 12;
    default:          return amount;
  }
}

const FREQ_LABEL: Record<string, string> = {
  weekly: "wk", monthly: "mo", quarterly: "qtr", annual: "yr",
};

function subColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("netflix"))                         return "#E50914";
  if (n.includes("spotify"))                         return "#1DB954";
  if (n.includes("apple") || n.includes("icloud"))   return "#555555";
  if (n.includes("chatgpt") || n.includes("openai")) return "#10A37F";
  if (n.includes("adobe"))                           return "#FF0000";
  if (n.includes("amazon") || n.includes("prime"))   return "#FF9900";
  if (n.includes("google") || n.includes("youtube")) return "#4285F4";
  if (n.includes("disney"))                          return "#113CCF";
  if (n.includes("microsoft") || n.includes("xbox")) return "#00A4EF";
  const palette = ["#60A5FA", "#0EA5E9", "#FACC15", "#34D399", "#FBBF24", "#38BDF8", "#F97316"];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % palette.length;
  return palette[hash];
}

const MOCK_SUBS: Subscription[] = [
  { id: 801, name: "Netflix",      category: "Entertainment", amount: 15.99, frequency: "monthly", active: true, nextDue: "2026-08-03", currency: "GBP", startDate: "2024-01-01", manuallyAdded: true },
  { id: 802, name: "Spotify",      category: "Entertainment", amount:  9.99, frequency: "monthly", active: true, nextDue: "2026-08-10", currency: "GBP", startDate: "2024-01-01", manuallyAdded: true },
  { id: 803, name: "iCloud+",      category: "Storage",       amount:  2.99, frequency: "monthly", active: true, nextDue: "2026-08-15", currency: "GBP", startDate: "2024-01-01", manuallyAdded: true },
  { id: 804, name: "ChatGPT Plus", category: "Productivity",  amount: 16.70, frequency: "monthly", active: true, nextDue: "2026-08-07", currency: "GBP", startDate: "2024-01-01", manuallyAdded: true },
  { id: 805, name: "Adobe CC",     category: "Creative",      amount: 52.99, frequency: "monthly", active: true, nextDue: "2026-08-20", currency: "GBP", startDate: "2024-01-01", manuallyAdded: true },
] as unknown as Subscription[];

// 6-month subscription cost history (mock — reflects adding Adobe CC in month 4)
const MOCK_COST_HISTORY = [45.67, 45.67, 45.67, 98.66, 98.66, 98.66];

// Mock usage score out of 10 for each sub (for cancellation suggestions)
const MOCK_USAGE: Record<string, number> = {
  Netflix: 9, Spotify: 10, "iCloud+": 9, "ChatGPT Plus": 8, "Adobe CC": 3,
};

function SubSparkline({ data, color = "var(--ft-accent)" }: { data: number[]; color?: string }) {
  const W = 100; const H = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(max - min, 0.01);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`).join(" ");
  const area = `${pts} ${W},${H} 0,${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="sub-sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sub-sg)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const SUBSCRIPTIONS_WIDGETS = [
  { id: "category",    label: "Category breakdown" },
  { id: "signals",     label: "Subscription signals" },
  { id: "cost-trend",  label: "Cost trend & cancellations" },
  { id: "cost-per-use", label: "Cost per use" },
  { id: "opportunity", label: "Opportunity cost" },
  { id: "overlap",     label: "Overlap detector" },
  { id: "billing-cal", label: "Billing calendar" },
  { id: "lifetime",    label: "Lifetime spend" },
];

export function MobileSubscriptions({ onBack }: { onBack?: () => void }) {
  const { data: subs = [], isLoading } = useListSubscriptions();

  const realActive   = subs.filter(s => s.active);
  const hasMockData  = realActive.length === 0 && !isLoading;
  const active       = hasMockData ? MOCK_SUBS : realActive;
  const totalMonthly = active.reduce((s, sub) => s + toMonthly(sub.amount, sub.frequency), 0);
  const totalAnnual  = totalMonthly * 12;
  const maxMonthly   = active.reduce((m, s) => Math.max(m, toMonthly(s.amount, s.frequency)), 0.01);

  const byCategory: Record<string, typeof active> = {};
  for (const sub of active) {
    const cat = sub.category || "Other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(sub);
  }
  const categories = Object.entries(byCategory).sort(([, a], [, b]) => {
    const aT = a.reduce((s, x) => s + toMonthly(x.amount, x.frequency), 0);
    const bT = b.reduce((s, x) => s + toMonthly(x.amount, x.frequency), 0);
    return bT - aT;
  });

  const { isVisible, toggle, resetAll, visible, hiddenCount } = useWidgetVisibility("subscriptions", SUBSCRIPTIONS_WIDGETS);

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
          Subscriptions
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {active.length} active{hasMockData && " · preview"}
          </div>
          <WidgetManagerButton widgets={SUBSCRIPTIONS_WIDGETS} visible={visible} onToggle={toggle} onReset={resetAll} hiddenCount={hiddenCount} />
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: hasMockData ? 0.85 : 1 }}>

          {/* Summary hero card */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              <Stat label="Monthly" value={formatGbp(totalMonthly)} />
              <Stat label="Annual"  value={formatGbp(totalAnnual)}  border />
              <Stat label="Active"  value={String(active.length)}   border accent />
            </div>
            {totalMonthly > 0 && (
              <div style={{ padding: "0 16px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Daily cost</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{formatGbp(totalAnnual / 365)}/day</span>
                </div>
                <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (totalMonthly / 500) * 100)}%`, background: "var(--ft-accent)", borderRadius: 2 }} />
                </div>
              </div>
            )}
          </div>

          {/* Category breakdown */}
          {isVisible("category") && active.length > 0 && (() => {
            const catTotals: Record<string, number> = {};
            const catColors: Record<string, string> = {};
            for (const sub of active) {
              const cat = sub.category || "Other";
              catTotals[cat] = (catTotals[cat] ?? 0) + toMonthly(sub.amount, sub.frequency);
              catColors[cat] = subColor(sub.name);
            }
            const sorted = Object.entries(catTotals).sort(([, a], [, b]) => b - a);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Cost breakdown
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>
                    {sorted.length} categories
                  </span>
                </div>
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
                  {sorted.map(([cat, amount]) => {
                    const pct   = (amount / totalMonthly) * 100;
                    const color = catColors[cat] ?? "var(--ft-accent)";
                    return (
                      <div key={cat}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 5, height: 5, borderRadius: 3, background: color, flexShrink: 0 }} />
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-text)" }}>{cat}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(amount)}/mo</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", width: 26, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, opacity: 0.8 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Subscription signals */}
          {isVisible("signals") && hasMockData && (() => {
            const levelColors: Record<string, string> = { red: "var(--ft-red)", amber: "var(--ft-accent)", green: "var(--ft-green)" };
            const signals: Array<{ level: "red" | "amber" | "green"; headline: string; detail: string }> = [];

            const cancelList = active
              .map(s => ({ ...s, usage: MOCK_USAGE[s.name] ?? 5, monthly: toMonthly(s.amount, s.frequency) }))
              .filter(s => s.usage < 5);

            if (cancelList.length > 0) {
              const annualSaving = cancelList.reduce((sum, s) => sum + s.monthly * 12, 0);
              const usageScore = MOCK_USAGE[cancelList[0].name] ?? 0;
              signals.push({
                level: "red",
                headline: `${cancelList.map(s => s.name).join(", ")} — low usage (${usageScore}/10)`,
                detail: `Cancelling saves ${formatGbp(annualSaving)}/yr`,
              });
            }

            const first = MOCK_COST_HISTORY[0];
            const last = MOCK_COST_HISTORY[MOCK_COST_HISTORY.length - 1];
            const spikePct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
            if (spikePct > 20) {
              signals.push({
                level: "amber",
                headline: `Subscription spend up ${spikePct}% in 6 months`,
                detail: `${formatGbp(first)} → ${formatGbp(last)}/mo — new subscription added month 4`,
              });
            }

            const upcoming = active
              .filter(s => s.nextDue)
              .map(s => ({ ...s, daysLeft: Math.ceil((new Date(s.nextDue! + "T12:00:00").getTime() - Date.now()) / 86400000) }))
              .filter(s => s.daysLeft >= 0 && s.daysLeft <= 7)
              .sort((a, b) => a.daysLeft - b.daysLeft);

            if (upcoming.length > 0) {
              const u = upcoming[0];
              const dueLabel = new Date(u.nextDue! + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              signals.push({
                level: "amber",
                headline: `${u.name} renews in ${u.daysLeft}d — ${formatGbp(u.amount)}`,
                detail: `Due ${dueLabel} · ${upcoming.length} charge${upcoming.length > 1 ? "s" : ""} due this week`,
              });
            } else {
              const top = [...active].sort((a, b) => toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency))[0];
              if (top) {
                signals.push({
                  level: "green",
                  headline: `${top.name} is your largest subscription`,
                  detail: `${formatGbp(toMonthly(top.amount, top.frequency))}/mo · ${formatGbp(toMonthly(top.amount, top.frequency) * 12)}/yr annual cost`,
                });
              }
            }

            if (signals.length === 0) return null;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                  Signals
                </div>
                {signals.slice(0, 3).map((s, i) => (
                  <div key={i} style={{ padding: "9px 14px", borderBottom: i < signals.slice(0, 3).length - 1 ? "1px solid var(--ft-border)" : "none", display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: levelColors[s.level], flexShrink: 0, marginTop: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: levelColors[s.level], lineHeight: 1.3 }}>{s.headline}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2, lineHeight: 1.4 }}>{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Cost trend + cancellation suggestions (mock only) */}
          {isVisible("cost-trend") && hasMockData && (() => {
            const momChange = MOCK_COST_HISTORY[MOCK_COST_HISTORY.length - 1] - MOCK_COST_HISTORY[MOCK_COST_HISTORY.length - 2];
            const momPct = MOCK_COST_HISTORY[MOCK_COST_HISTORY.length - 2] > 0
              ? ((momChange / MOCK_COST_HISTORY[MOCK_COST_HISTORY.length - 2]) * 100).toFixed(0)
              : "0";
            const cancelCandidates = MOCK_SUBS
              .map(s => ({ ...s, usage: MOCK_USAGE[s.name] ?? 5, monthly: toMonthly(s.amount, s.frequency) }))
              .filter(s => s.usage <= 4)
              .sort((a, b) => b.monthly - a.monthly);
            const cancelSaving = cancelCandidates.reduce((s, c) => s + c.monthly, 0);
            return (
              <>
                {/* 6-month cost trend */}
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Subscription cost · 6M
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: momChange > 0 ? "var(--ft-red)" : "var(--ft-green)", fontWeight: 700 }}>
                      {momChange > 0 ? "+" : ""}{momPct}% MoM
                    </div>
                  </div>
                  <SubSparkline data={MOCK_COST_HISTORY} color={momChange > 0 ? "var(--ft-red)" : "var(--ft-green)"} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                      {formatGbp(MOCK_COST_HISTORY[0])}/mo
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>now</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--ft-text)" }}>
                      {formatGbp(MOCK_COST_HISTORY[MOCK_COST_HISTORY.length - 1])}/mo
                    </span>
                  </div>
                </div>

                {/* Cancellation suggestions */}
                {cancelCandidates.length > 0 && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                        Consider cancelling
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-green)" }}>
                        save {formatGbp(cancelSaving * 12)}/yr
                      </div>
                    </div>
                    {cancelCandidates.map((s, i) => {
                      const color = subColor(s.name);
                      const isLast = i === cancelCandidates.length - 1;
                      const usageBars = Array.from({ length: 10 }, (_, j) => j < s.usage);
                      return (
                        <div key={s.id} style={{ padding: "10px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 2, flexShrink: 0,
                            background: color, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#fff" }}>{s.name.charAt(0)}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)", marginBottom: 3 }}>{s.name}</div>
                            <div style={{ display: "flex", gap: 2 }}>
                              {usageBars.map((filled, j) => (
                                <div key={j} style={{
                                  width: 5, height: 5, borderRadius: 1,
                                  background: filled ? color : "var(--ft-raised)",
                                  opacity: filled ? 0.8 : 1,
                                }} />
                              ))}
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginLeft: 4 }}>
                                {s.usage}/10 usage
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-red)" }}>
                              {formatGbp(s.monthly)}/mo
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                              {formatGbp(s.monthly * 12)}/yr
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Cost per use — actual pence/session for each subscription */}
          {isVisible("cost-per-use") && hasMockData && (() => {
            const MOCK_SESSIONS: Record<string, number> = {
              Netflix: 18, Spotify: 45, "iCloud+": 0, "ChatGPT Plus": 30, "Adobe CC": 2,
            };
            const ALWAYS_ON = new Set(["iCloud+"]);
            const withCpu = MOCK_SUBS.map(s => {
              const monthly  = toMonthly(s.amount, s.frequency);
              const sessions = MOCK_SESSIONS[s.name] ?? 1;
              const alwaysOn = ALWAYS_ON.has(s.name);
              const cpu      = !alwaysOn && sessions > 0 ? monthly / sessions : null;
              return { ...s, monthly, sessions, cpu, alwaysOn };
            }).sort((a, b) => {
              if (a.cpu === null) return 1;
              if (b.cpu === null) return -1;
              return a.cpu - b.cpu;
            });
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Cost per use
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>est. sessions/mo</span>
                </div>
                {withCpu.map((s, i) => {
                  const cpuColor = s.alwaysOn
                    ? "var(--ft-dim)"
                    : s.cpu! < 0.6  ? "var(--ft-green)"
                    : s.cpu! < 5    ? "var(--ft-accent)"
                    : "var(--ft-red)";
                  const cpuLabel = s.alwaysOn
                    ? "N/A"
                    : s.cpu !== null
                      ? s.cpu < 1 ? `${Math.round(s.cpu * 100)}p` : `£${s.cpu.toFixed(2)}`
                      : "—";
                  const isLast = i === withCpu.length - 1;
                  return (
                    <div key={s.id} style={{ padding: "9px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: cpuColor, opacity: 0.9 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>
                          {s.alwaysOn
                            ? `${formatGbp(s.monthly)}/mo · always-on storage`
                            : `${s.sessions} sessions · ${formatGbp(s.monthly)}/mo`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: cpuColor, fontVariantNumeric: "tabular-nums" }}>
                          {cpuLabel}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>per session</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Opportunity cost — what subscriptions cost if invested instead */}
          {isVisible("opportunity") && hasMockData && (() => {
            const annualCost = totalMonthly * 12;
            const APY = 0.07;
            const scenarios = [5, 10, 20].map(years => ({
              years,
              fv: annualCost * ((Math.pow(1 + APY, years) - 1) / APY),
            }));
            const W = 300, H = 44, PX = 6, PY = 6;
            const maxYears = 20;
            const vals = Array.from({ length: maxYears + 1 }, (_, y) =>
              y === 0 ? 0 : annualCost * ((Math.pow(1 + APY, y) - 1) / APY)
            );
            const yMax = vals[maxYears];
            const xOf = (i: number) => PX + (i / maxYears) * (W - 2 * PX);
            const yOf = (v: number) => PY + (1 - v / yMax) * (H - 2 * PY);
            const linePts = vals.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
            const areaPts = `${linePts} ${xOf(maxYears).toFixed(1)},${H} ${xOf(0).toFixed(1)},${H}`;
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "12px 14px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Opportunity cost · 7% S&P
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                    {formatGbp(annualCost)}/yr
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {scenarios.map(s => (
                    <div key={s.years} style={{ background: "var(--ft-raised)", borderRadius: 2, padding: "8px 10px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{s.years}Y</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(Math.round(s.fv))}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 1 }}>if invested</div>
                    </div>
                  ))}
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="opp-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ft-green)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--ft-green)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={areaPts} fill="url(#opp-grad)" />
                  <polyline points={linePts} fill="none" stroke="var(--ft-green)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Scenario markers */}
                  {scenarios.map(s => (
                    <circle key={s.years} cx={xOf(s.years)} cy={yOf(s.fv)} r="2.5" fill="var(--ft-green)" opacity="0.7" />
                  ))}
                  {/* X labels */}
                  <text x={xOf(0)} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="start" dominantBaseline="hanging">now</text>
                  <text x={xOf(10)} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="middle" dominantBaseline="hanging">10Y</text>
                  <text x={xOf(20)} y={H + 1} fontFamily="monospace" fontSize="7" fill="var(--ft-dim)" textAnchor="end" dominantBaseline="hanging">20Y</text>
                </svg>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 8 }}>
                  Compound annual contributions at S&P 500 historical avg
                </div>
              </div>
            );
          })()}

          {/* Subscription Overlap Detector */}
          {isVisible("overlap") && active.length > 0 && (() => {
            const overlapping = Object.entries(byCategory).filter(([, items]) => items.length >= 2);
            const overlapCount = overlapping.length;

            if (overlapCount === 0) {
              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Overlap detector</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-green)" }}>0 overlaps · {active.length} distinct categories</span>
                </div>
              );
            }

            const redundantAnnual = overlapping.reduce((total, [, items]) => {
              const sorted = [...items].sort((a, b) =>
                hasMockData
                  ? (MOCK_USAGE[a.name] ?? 5) - (MOCK_USAGE[b.name] ?? 5)
                  : toMonthly(a.amount, a.frequency) - toMonthly(b.amount, b.frequency)
              );
              return total + toMonthly(sorted[0].amount, sorted[0].frequency) * 12;
            }, 0);

            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Overlap detector
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)" }}>
                      {overlapCount} overlap{overlapCount > 1 ? "s" : ""}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                      save {formatGbp(redundantAnnual)}/yr
                    </span>
                  </div>
                </div>
                {overlapping.map(([cat, items], gi) => {
                  const sortedItems = [...items].sort((a, b) =>
                    hasMockData
                      ? (MOCK_USAGE[b.name] ?? 5) - (MOCK_USAGE[a.name] ?? 5)
                      : toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency)
                  );
                  const isLastGroup = gi === overlapping.length - 1;
                  return (
                    <div key={cat} style={{ padding: "9px 14px", borderBottom: isLastGroup ? "none" : "1px solid var(--ft-border)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)", marginBottom: 7 }}>
                        {cat} · {items.length} services
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {sortedItems.map((sub, si) => {
                          const monthly = toMonthly(sub.amount, sub.frequency);
                          const usage = hasMockData ? (MOCK_USAGE[sub.name] ?? 5) : null;
                          const isLowestUsage = si === sortedItems.length - 1;
                          return (
                            <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 5, height: 5, borderRadius: 2.5, background: isLowestUsage ? "var(--ft-red)" : "var(--ft-green)", flexShrink: 0 }} />
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isLowestUsage ? "var(--ft-dim)" : "var(--ft-text)", flex: 1 }}>{sub.name}</span>
                              {usage !== null && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{usage}/10</span>
                              )}
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: isLowestUsage ? "var(--ft-red)" : "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>
                                {formatGbp(monthly)}/mo
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div style={{ padding: "5px 14px 6px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
                  {hasMockData ? "sorted by usage · red = lowest-usage, consider cancelling" : "sorted by cost · review lowest-spend duplicates"}
                </div>
              </div>
            );
          })()}

          {isLoading ? (
            <div style={{ textAlign: "center", color: "var(--ft-dim)", fontSize: 13, padding: 32 }}>Loading…</div>
          ) : (<>

            {/* Billing calendar */}
            {isVisible("billing-cal") && (() => {
              const now = new Date();
              const todayDay  = now.getDate();
              const calYear   = now.getFullYear();
              const calMonth  = now.getMonth();
              const nextMonthNum  = (calMonth + 1) % 12;
              const nextMonthYear = calMonth === 11 ? calYear + 1 : calYear;

              const hasBillsNow = active.some(s => {
                if (!s.nextDue) return false;
                const d = new Date(s.nextDue + "T12:00:00");
                return d.getFullYear() === calYear && d.getMonth() === calMonth;
              });
              const dispYear  = hasBillsNow ? calYear : nextMonthYear;
              const dispMonth = hasBillsNow ? calMonth : nextMonthNum;

              const daysInMonth = new Date(dispYear, dispMonth + 1, 0).getDate();
              const firstDow    = new Date(dispYear, dispMonth, 1).getDay();
              const startOffset = (firstDow + 6) % 7; // Mon-first
              const isCurrentMonth = dispYear === calYear && dispMonth === calMonth;
              const monthName = new Date(dispYear, dispMonth, 1).toLocaleString("default", { month: "long", year: "numeric" });

              const dueDays: Record<number, Array<{ color: string; name: string; amount: number }>> = {};
              for (const sub of active) {
                if (!sub.nextDue) continue;
                const d = new Date(sub.nextDue + "T12:00:00");
                if (d.getFullYear() === dispYear && d.getMonth() === dispMonth) {
                  const day = d.getDate();
                  if (!dueDays[day]) dueDays[day] = [];
                  dueDays[day].push({ color: subColor(sub.name), name: sub.name, amount: sub.amount });
                }
              }

              const totalCells = startOffset + daysInMonth;
              const rows  = Math.ceil(totalCells / 7);
              const cells = Array.from({ length: rows * 7 }, (_, i) => {
                const dayNum = i - startOffset + 1;
                return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
              });

              const billDays    = Object.keys(dueDays).length;
              const billTotal   = Object.values(dueDays).flat().reduce((s, b) => s + b.amount, 0);
              const billingSubs = active.filter(s => {
                if (!s.nextDue) return false;
                const d = new Date(s.nextDue + "T12:00:00");
                return d.getFullYear() === dispYear && d.getMonth() === dispMonth;
              });

              return (
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "14px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                      Billing calendar · {monthName}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)" }}>
                        {billDays} charge{billDays !== 1 ? "s" : ""}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                        {formatGbp(billTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Day headers Mon–Sun */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
                    {["M","T","W","T","F","S","S"].map((d, i) => (
                      <div key={i} style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", paddingBottom: 2 }}>{d}</div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                    {cells.map((day, i) => {
                      if (day === null) return <div key={i} />;
                      const daySubs = dueDays[day] ?? [];
                      const isToday = isCurrentMonth && day === todayDay;
                      const isPast  = isCurrentMonth && day < todayDay;
                      return (
                        <div key={i} style={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          padding: "3px 0 2px", borderRadius: 4,
                          background: isToday
                            ? "color-mix(in srgb, var(--ft-accent) 16%, transparent)"
                            : daySubs.length > 0 && !isPast
                              ? "color-mix(in srgb, var(--ft-red) 8%, transparent)"
                              : "transparent",
                        }}>
                          <div style={{
                            fontFamily: "var(--font-mono)", fontSize: 9,
                            fontWeight: isToday || daySubs.length > 0 ? 700 : 400,
                            color: isToday ? "var(--ft-accent)" : isPast ? "var(--ft-border)" : daySubs.length > 0 ? "var(--ft-text)" : "var(--ft-dim)",
                            lineHeight: 1, marginBottom: daySubs.length > 0 && !isPast ? 2 : 0,
                          }}>{day}</div>
                          {daySubs.length > 0 && !isPast && (
                            <div style={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                              {daySubs.slice(0, 2).map((s, si) => (
                                <div key={si} style={{ width: 4, height: 4, borderRadius: 2, background: s.color }} />
                              ))}
                              {daySubs.length > 2 && <div style={{ width: 4, height: 4, borderRadius: 2, background: "var(--ft-dim)" }} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  {billingSubs.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: "1px solid var(--ft-border)", paddingTop: 8, display: "flex", flexWrap: "wrap", gap: "5px 10px" }}>
                      {billingSubs.map(sub => (
                        <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 5, height: 5, borderRadius: 3, background: subColor(sub.name), flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>
                            {sub.name.split(" ")[0]} {new Date(sub.nextDue! + "T12:00:00").getDate()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {categories.map(([cat, items]) => {
              const catMonthly = items.reduce((s, x) => s + toMonthly(x.amount, x.frequency), 0);
              return (
                <div key={cat}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>{cat}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{formatGbp(catMonthly)}/mo</div>
                  </div>
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                    {items.map((sub, i) => {
                      const monthly  = toMonthly(sub.amount, sub.frequency);
                      const sharePct = (monthly / maxMonthly) * 100;
                      const isLast   = i === items.length - 1;
                      const nextDue  = sub.nextDue ? new Date(sub.nextDue).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
                      const daysLeft = sub.nextDue ? Math.ceil((new Date(sub.nextDue).getTime() - Date.now()) / 86400000) : null;
                      return (
                        <div key={sub.id} style={{ padding: "11px 14px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 20, background: subColor(sub.name), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                                {sub.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                                {nextDue ? `due ${nextDue}${daysLeft !== null && daysLeft <= 7 ? ` · ${daysLeft}d` : ""}` : FREQ_LABEL[sub.frequency] ?? sub.frequency}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
                                {formatGbp(sub.amount)}<span style={{ fontSize: 9, color: "var(--ft-dim)", fontWeight: 400 }}>/{FREQ_LABEL[sub.frequency] ?? sub.frequency}</span>
                              </div>
                              {sub.frequency !== "monthly" && (
                                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>{formatGbp(monthly)}/mo</div>
                              )}
                            </div>
                          </div>
                          <div style={{ marginTop: 7, height: 2, background: "var(--ft-raised)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${sharePct}%`, background: subColor(sub.name), opacity: 0.7, borderRadius: 1 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>)}

          {/* Lifetime spend analysis */}
          {isVisible("lifetime") && hasMockData && (() => {
            const MONTHS = 18; // mock: all subs since Jan 2024
            const rows = active.map(sub => {
              const monthly = toMonthly(sub.amount, sub.frequency);
              const lifetime = Math.round(monthly * MONTHS);
              return { name: sub.name, monthly, lifetime };
            }).sort((a, b) => b.lifetime - a.lifetime);
            const totalLifetime = rows.reduce((s, r) => s + r.lifetime, 0);
            const maxLifetime = Math.max(...rows.map(r => r.lifetime), 1);
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Lifetime spend · {MONTHS}mo</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(totalLifetime)}</span>
                </div>
                {rows.map((r, i) => (
                  <div key={r.name} style={{ padding: "7px 14px", borderBottom: i < rows.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", fontWeight: 500 }}>{r.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{formatGbp(r.lifetime)}</span>
                    </div>
                    <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(r.lifetime / maxLifetime) * 100}%`, background: subColor(r.name), borderRadius: 2, opacity: 0.7 }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", marginTop: 2 }}>{formatGbp(r.monthly)}/mo × {MONTHS}mo</div>
                  </div>
                ))}
                <div style={{ padding: "5px 14px 7px", borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                  total spent since Jan 2024 · mock estimate
                </div>
              </div>
            );
          })()}

          <a href="/subscriptions" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", textDecoration: "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Manage subscriptions</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)" }}>→</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, border, accent }: { label: string; value: string; border?: boolean; accent?: boolean }) {
  return (
    <div style={{ padding: "14px 16px", borderLeft: border ? "1px solid var(--ft-border)" : "none" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: accent ? "var(--ft-accent)" : "var(--ft-text)", letterSpacing: "-0.01em" }}>{value}</div>
    </div>
  );
}
