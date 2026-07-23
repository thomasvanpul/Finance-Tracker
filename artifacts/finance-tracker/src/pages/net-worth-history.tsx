import { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatGbp } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface NWEntry {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note?: string;
}

interface Milestone {
  date: string;
  label: string;
  color?: string;
}

// ── localStorage helpers ───────────────────────────────────────────────────

function loadHistory(): NWEntry[] {
  try {
    const raw = localStorage.getItem("ft-nw-history");
    if (raw) return JSON.parse(raw) as NWEntry[];
  } catch {}
  return [];
}

function saveHistory(entries: NWEntry[]): void {
  try {
    localStorage.setItem("ft-nw-history", JSON.stringify(entries));
  } catch {}
}

function loadMilestones(): Milestone[] {
  try {
    const raw = localStorage.getItem("ft-nw-milestones");
    if (raw) return JSON.parse(raw) as Milestone[];
  } catch {}
  return [];
}

function saveMilestones(ms: Milestone[]): void {
  try {
    localStorage.setItem("ft-nw-milestones", JSON.stringify(ms));
  } catch {}
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

// ── Linear projection ──────────────────────────────────────────────────────

function linearProject(entries: NWEntry[]): { date: string; projected: number }[] {
  if (entries.length < 2) return [];
  const last3 = entries.slice(-3);
  if (last3.length < 2) return [];

  // Fit linear regression: y = a + bx
  const n = last3.length;
  const xs = last3.map((_, i) => i);
  const ys = last3.map((e) => e.netWorth);
  const sumX = xs.reduce((s, v) => s + v, 0);
  const sumY = ys.reduce((s, v) => s + v, 0);
  const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sumX2 = xs.reduce((s, v) => s + v * v, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return [];
  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;

  // Project 12 months forward from today
  const lastDate = new Date(entries[entries.length - 1].date);
  const projectionPoints: { date: string; projected: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + m);
    const x = n - 1 + m; // extrapolate past the last known point
    projectionPoints.push({
      date: d.toISOString().slice(0, 10),
      projected: Math.round(a + b * x),
    });
  }
  return projectionPoints;
}

// ── Period filter ──────────────────────────────────────────────────────────

type Period = "3M" | "6M" | "1Y" | "2Y" | "All";

function filterByPeriod(entries: NWEntry[], period: Period): NWEntry[] {
  if (period === "All" || entries.length === 0) return entries;
  const now = new Date();
  const months: Record<Exclude<Period, "All">, number> = { "3M": 3, "6M": 6, "1Y": 12, "2Y": 24 };
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months[period]);
  return entries.filter((e) => new Date(e.date) >= cutoff);
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  payload?: {
    date?: string;
    netWorth?: number;
    totalAssets?: number;
    totalLiabilities?: number;
    note?: string;
  };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: "var(--ft-raised)",
      border: "1px solid var(--ft-border2)",
      padding: "10px 14px",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      lineHeight: 1.8,
      minWidth: 180,
    }}>
      <div style={{ color: "var(--ft-accent)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        {d.date ? new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
      </div>
      {d.netWorth !== undefined && (
        <div style={{ color: "var(--ft-text)", fontWeight: 700 }}>
          Net Worth: {formatGbp(d.netWorth)}
        </div>
      )}
      {d.totalAssets !== undefined && (
        <div style={{ color: "var(--ft-green)" }}>Assets: {formatGbp(d.totalAssets)}</div>
      )}
      {d.totalLiabilities !== undefined && d.totalLiabilities > 0 && (
        <div style={{ color: "var(--ft-red)" }}>Liabilities: {formatGbp(d.totalLiabilities)}</div>
      )}
      {d.note && (
        <div style={{ color: "var(--ft-muted)", marginTop: 4, fontSize: 9 }}>Note: {d.note}</div>
      )}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "80px 40px",
      border: "1px dashed var(--ft-border)",
      background: "var(--ft-surface)",
      textAlign: "center",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 28,
        color: "var(--ft-border2)",
        lineHeight: 1.4,
        marginBottom: 20,
        userSelect: "none",
      }}>
        {"┌──────────────────┐"}<br />
        {"│  NET WORTH  ─────│"}<br />
        {"│  £ 0.00    ↗    │"}<br />
        {"│  ▁▂▃▄▅▆▇█  ·    │"}<br />
        {"└──────────────────┘"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-muted)", marginBottom: 8 }}>
        Start tracking your net worth over time
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 6, maxWidth: 360 }}>
        Recording your net worth periodically is one of the most important habits in personal finance. It shows you whether your wealth is actually growing — not just your income.
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 24, maxWidth: 360 }}>
        Add your first snapshot to begin. You can log assets (cash, investments, property) and liabilities (mortgage, loans, cards) — the difference is your net worth.
      </div>
      <button
        onClick={onAdd}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
          background: "var(--ft-accent)",
          color: "var(--ft-base)",
          border: "none",
          padding: "8px 24px",
          cursor: "pointer",
        }}
      >
        + Record First Snapshot
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function NetWorthHistory() {
  const [history, setHistory] = useState<NWEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [period, setPeriod] = useState<Period>("All");

  // Form state
  const [formAssets, setFormAssets] = useState("");
  const [formLiabilities, setFormLiabilities] = useState("");
  const [formNote, setFormNote] = useState("");

  // Milestone form state
  const [msDate, setMsDate] = useState(todayStr());
  const [msLabel, setMsLabel] = useState("");
  const [msColor, setMsColor] = useState("var(--ft-accent)");

  useEffect(() => {
    setHistory(loadHistory());
    setMilestones(loadMilestones());
  }, []);

  // Derived
  const filtered = useMemo(() => filterByPeriod(history, period), [history, period]);

  const chartData = useMemo(() => filtered.map((e) => ({ ...e })), [filtered]);

  const projectionPoints = useMemo(() => linearProject(history), [history]);

  const projectedIn12Months = projectionPoints.length > 0
    ? projectionPoints[projectionPoints.length - 1].projected
    : null;

  // Combined chart data: history entries + projected points
  const fullChartData = useMemo(() => {
    if (period !== "All" && period !== "1Y" && period !== "2Y") {
      return chartData.map((d) => ({ ...d, projected: undefined as number | undefined }));
    }
    const histWithNull = chartData.map((d) => ({ ...d, projected: undefined as number | undefined }));
    if (projectionPoints.length === 0) return histWithNull;
    // Anchor: last real point gets a projected value equal to its netWorth
    const lastEntry = history[history.length - 1];
    const combined = [
      ...histWithNull.map((d, i) =>
        i === histWithNull.length - 1 ? { ...d, projected: d.netWorth } : d
      ),
      ...projectionPoints.map((p) => ({
        date: p.date,
        totalAssets: 0,
        totalLiabilities: 0,
        netWorth: undefined as number | undefined,
        projected: p.projected,
        note: undefined,
      })),
    ];
    void lastEntry;
    return combined;
  }, [chartData, projectionPoints, history, period]);

  const currentNW = history.length > 0 ? history[history.length - 1].netWorth : 0;
  const firstNW = history.length > 0 ? history[0].netWorth : 0;
  const nwChange = currentNW - firstNW;
  const nwChangePct = firstNW !== 0 ? (nwChange / Math.abs(firstNW)) * 100 : 0;

  const isPositiveTrend = history.length < 2 || currentNW >= firstNW;
  const trendColor = isPositiveTrend ? "var(--ft-green)" : "var(--ft-red)";

  // Best single-month increase
  const bestMonthIncrease = useMemo(() => {
    if (history.length < 2) return 0;
    let best = 0;
    for (let i = 1; i < history.length; i++) {
      const delta = history[i].netWorth - history[i - 1].netWorth;
      if (delta > best) best = delta;
    }
    return best;
  }, [history]);

  // Handlers
  function handleSnapshot() {
    const assets = parseFloat(formAssets);
    const liabilities = parseFloat(formLiabilities) || 0;
    if (isNaN(assets) || assets < 0) return;
    const entry: NWEntry = {
      date: todayStr(),
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: assets - liabilities,
      note: formNote.trim() || undefined,
    };
    const updated = [...history, entry].sort((a, b) => a.date.localeCompare(b.date));
    setHistory(updated);
    saveHistory(updated);
    setFormAssets("");
    setFormLiabilities("");
    setFormNote("");
    setShowForm(false);
  }

  function handleAddMilestone() {
    if (!msLabel.trim() || !msDate) return;
    const ms: Milestone = { date: msDate, label: msLabel.trim(), color: msColor };
    const updated = [...milestones, ms];
    setMilestones(updated);
    saveMilestones(updated);
    setMsLabel("");
    setMsDate(todayStr());
    setShowMilestoneForm(false);
  }

  function handleDeleteEntry(date: string) {
    const updated = history.filter((e) => e.date !== date);
    setHistory(updated);
    saveHistory(updated);
  }

  // Milestone dates intersecting with chart x-axis
  const chartDates = new Set(fullChartData.map((d) => d.date));
  const visibleMilestones = milestones.filter((m) => chartDates.has(m.date));

  const inputSt: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "var(--ft-raised)",
    border: "1px solid var(--ft-border2)",
    color: "var(--ft-text)",
    padding: "6px 10px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const labelSt: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    color: "var(--ft-dim)",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 4,
  };

  const PERIODS: Period[] = ["3M", "6M", "1Y", "2Y", "All"];

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
            <span style={{ color: "var(--ft-accent)" }}>·</span> Net Worth History
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            Track wealth over time · spot trends · project the future
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowMilestoneForm((s) => !s)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              background: "transparent",
              color: showMilestoneForm ? "var(--ft-accent)" : "var(--ft-muted)",
              border: "1px solid var(--ft-border2)",
              padding: "5px 12px",
              cursor: "pointer",
            }}
          >
            {showMilestoneForm ? "Cancel" : "+ Milestone"}
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              background: showForm ? "var(--ft-raised)" : "var(--ft-accent)",
              color: showForm ? "var(--ft-text)" : "var(--ft-base)",
              border: showForm ? "1px solid var(--ft-border2)" : "none",
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            {showForm ? "Cancel" : "+ Record Snapshot"}
          </button>
        </div>
      </div>

      {/* ── Snapshot form ── */}
      {showForm && (
        <div style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          padding: 20,
          marginBottom: 16,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
            Record Today's Net Worth
          </div>
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Total Assets (£)</label>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>
                Cash + investments + property + other
              </div>
              <input
                type="number"
                placeholder="e.g. 85000"
                value={formAssets}
                onChange={(e) => setFormAssets(e.target.value)}
                style={inputSt}
              />
            </div>
            <div>
              <label style={labelSt}>Total Liabilities (£)</label>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>
                Mortgage + loans + cards + other debts
              </div>
              <input
                type="number"
                placeholder="e.g. 12000"
                value={formLiabilities}
                onChange={(e) => setFormLiabilities(e.target.value)}
                style={inputSt}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelSt}>Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. Got a raise, paid off car"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                style={inputSt}
              />
            </div>
          </div>
          {formAssets && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 12 }}>
              Net worth:{" "}
              <span style={{ fontWeight: 700, color: (parseFloat(formAssets) - (parseFloat(formLiabilities) || 0)) >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                {formatGbp(parseFloat(formAssets) - (parseFloat(formLiabilities) || 0))}
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSnapshot}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "var(--ft-green)", color: "var(--ft-base)", border: "none", padding: "7px 20px", cursor: "pointer" }}
            >
              Save Snapshot
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "7px 16px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Milestone form ── */}
      {showMilestoneForm && (
        <div style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          padding: 20,
          marginBottom: 16,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
            Add Milestone
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Date</label>
              <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Label</label>
              <input
                type="text"
                placeholder='e.g. "Paid off car loan"'
                value={msLabel}
                onChange={(e) => setMsLabel(e.target.value)}
                style={inputSt}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleAddMilestone}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", padding: "7px 20px", cursor: "pointer" }}
            >
              Add
            </button>
            <button
              onClick={() => setShowMilestoneForm(false)}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "7px 16px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {history.length === 0 && !showForm && <EmptyState onAdd={() => setShowForm(true)} />}

      {/* ── Stats panel ── */}
      {history.length > 0 && (
        <div className="ft-four-col" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}>
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Current Net Worth</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: currentNW >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
              {formatGbp(currentNW)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              as of {new Date(history[history.length - 1].date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>

          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Since First Entry</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: nwChange >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
              {nwChange >= 0 ? "+" : ""}{formatGbp(nwChange)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: nwChange >= 0 ? "var(--ft-green)" : "var(--ft-red)", marginTop: 3 }}>
              {nwChangePct >= 0 ? "+" : ""}{nwChangePct.toFixed(1)}%
            </div>
          </div>

          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Best Period Increase</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-green)" }}>
              {bestMonthIncrease > 0 ? `+${formatGbp(bestMonthIncrease)}` : "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              single period
            </div>
          </div>

          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Snapshots Recorded</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-text)" }}>
              {history.length}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              {projectedIn12Months !== null
                ? `Proj. 12m: ${formatGbp(projectedIn12Months)}`
                : "Add more to project"}
            </div>
          </div>
        </div>
      )}

      {/* ── Main chart ── */}
      {history.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "20px 20px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Net Worth Timeline
              </div>
              {projectedIn12Months !== null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
                  Projected in 12 months:{" "}
                  <span style={{ color: projectedIn12Months >= currentNW ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>
                    {formatGbp(projectedIn12Months)}
                  </span>
                </div>
              )}
            </div>
            {/* Period selector */}
            <div style={{ display: "flex", gap: 4 }}>
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    padding: "4px 10px",
                    cursor: "pointer",
                    background: period === p ? "var(--ft-accent)" : "transparent",
                    color: period === p ? "var(--ft-base)" : "var(--ft-dim)",
                    border: period === p ? "none" : "1px solid var(--ft-border2)",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={fullChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={trendColor} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="projGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ft-cyan)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--ft-cyan)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--ft-border)" }}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--ft-border2)" strokeDasharray="4 4" label={{ value: "£0", fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }} />

              {/* Milestone vertical lines */}
              {visibleMilestones.map((m) => (
                <ReferenceLine
                  key={`${m.date}-${m.label}`}
                  x={m.date}
                  stroke={m.color ?? "var(--ft-accent)"}
                  strokeDasharray="3 3"
                  label={{ value: m.label, position: "insideTopRight", fill: m.color ?? "var(--ft-accent)", fontSize: 7, fontFamily: "var(--font-mono)" }}
                />
              ))}

              {/* Net worth area */}
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke={trendColor}
                strokeWidth={2}
                fill="url(#nwGradient)"
                dot={false}
                connectNulls={false}
              />

              {/* Projection dashed line */}
              {projectionPoints.length > 0 && (
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke="var(--ft-cyan)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  fill="url(#projGradient)"
                  dot={false}
                  connectNulls={true}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: 2, background: trendColor }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Net Worth</span>
            </div>
            {projectionPoints.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 1, background: "var(--ft-cyan)", borderTop: "1px dashed var(--ft-cyan)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Projected (linear trend)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stacked assets/liabilities chart (only if 2+ entries) ── */}
      {history.length >= 2 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "20px 20px 16px", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
            Assets vs Liabilities Breakdown
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={filtered} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ft-red)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--ft-red)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--ft-border)" }}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatGbp(value),
                  name === "totalAssets" ? "Assets" : "Liabilities",
                ]}
                contentStyle={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                }}
              />
              <Area type="monotone" dataKey="totalAssets" stroke="var(--ft-green)" strokeWidth={1.5} fill="url(#assetsGrad)" dot={false} />
              <Area type="monotone" dataKey="totalLiabilities" stroke="var(--ft-red)" strokeWidth={1.5} fill="url(#liabGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 12, height: 2, background: "var(--ft-green)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Assets</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 12, height: 2, background: "var(--ft-red)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Liabilities</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Milestones list ── */}
      {milestones.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Milestones
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {milestones.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderLeft: `3px solid ${m.color ?? "var(--ft-accent)"}`,
                paddingLeft: 10,
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", minWidth: 60 }}>
                  {shortDate(m.date)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1 }}>
                  {m.label}
                </div>
                <button
                  onClick={() => {
                    const updated = milestones.filter((_, j) => j !== i);
                    setMilestones(updated);
                    saveMilestones(updated);
                  }}
                  style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1, padding: "0 4px" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-red)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Snapshot log ── */}
      {history.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "16px 20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Snapshot Log
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Date", "Assets", "Liabilities", "Net Worth", "Change", "Note", ""].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--ft-border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((e, idx, arr) => {
                  const prev = arr[idx + 1];
                  const delta = prev ? e.netWorth - prev.netWorth : null;
                  return (
                    <tr key={e.date} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px", whiteSpace: "nowrap" }}>
                        {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", padding: "7px 8px" }}>
                        {formatGbp(e.totalAssets)}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: e.totalLiabilities > 0 ? "var(--ft-red)" : "var(--ft-dim)", padding: "7px 8px" }}>
                        {e.totalLiabilities > 0 ? formatGbp(e.totalLiabilities) : "—"}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: e.netWorth >= 0 ? "var(--ft-text)" : "var(--ft-red)", padding: "7px 8px" }}>
                        {formatGbp(e.netWorth)}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: delta === null ? "var(--ft-dim)" : delta >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "7px 8px" }}>
                        {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${formatGbp(delta)}`}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", padding: "7px 8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.note ?? ""}
                      </td>
                      <td style={{ padding: "7px 8px" }}>
                        <button
                          onClick={() => handleDeleteEntry(e.date)}
                          style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1, padding: "0 4px" }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.color = "var(--ft-red)"; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.color = "var(--ft-dim)"; }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
