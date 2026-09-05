import { useState, useEffect, useMemo } from "react";
import {
  useListAccounts,
  useGetInvestmentSummary,
  useListDebts,
} from "@workspace/api-client-react";
import { PersonaQuickStart } from "@/components/persona-quick-start";
import { loadPersonaIds, PERSONAS, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import { TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatBaseMoney } from "@/lib/utils";
import { HStack, MonoLabel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";

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

  const lastDate = new Date(entries[entries.length - 1].date);
  const projectionPoints: { date: string; projected: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + m);
    const x = n - 1 + m;
    projectionPoints.push({
      date: d.toISOString().slice(0, 10),
      projected: Math.round(a + b * x),
    });
  }
  return projectionPoints;
}

// ── Period filter ──────────────────────────────────────────────────────────

type Period = "1M" | "3M" | "6M" | "1Y" | "All";

function filterByPeriod(entries: NWEntry[], period: Period): NWEntry[] {
  if (period === "All" || entries.length === 0) return entries;
  const now = new Date();
  const months: Record<Exclude<Period, "All">, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months[period]);
  return entries.filter((e) => new Date(e.date) >= cutoff);
}

// ── Auto milestones (round number crossings) ────────────────────────────────

function computeAutoMilestones(history: NWEntry[]): { value: number; date: string }[] {
  if (history.length < 2) return [];
  const result: { value: number; date: string }[] = [];
  const STEP = 10000;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].netWorth;
    const curr = history[i].netWorth;
    const lo = Math.min(prev, curr);
    const hi = Math.max(prev, curr);
    const firstLevel = Math.ceil(lo / STEP) * STEP;
    for (let level = firstLevel; level <= hi; level += STEP) {
      if (level > lo && level !== 0) {
        if (!result.some((r) => r.value === level)) {
          result.push({ value: level, date: history[i].date });
        }
      }
    }
  }
  return result.sort((a, b) => a.value - b.value);
}

// ── Monthly stats ─────────────────────────────────────────────────────────

interface MonthlyRow {
  monthKey: string; // YYYY-MM
  label: string;
  endNW: number;
  momDelta: number | null;
  momPct: number | null;
}

function buildMonthlyStats(history: NWEntry[]): MonthlyRow[] {
  if (history.length === 0) return [];
  const byMonth = new Map<string, NWEntry>();
  for (const e of history) {
    const mk = e.date.slice(0, 7);
    const existing = byMonth.get(mk);
    if (!existing || e.date > existing.date) byMonth.set(mk, e);
  }
  const sorted = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-18); // last 18 months

  const rows: MonthlyRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [mk, entry] = sorted[i];
    const [year, month] = mk.split("-");
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
    const prev = i > 0 ? sorted[i - 1][1].netWorth : null;
    const momDelta = prev !== null ? entry.netWorth - prev : null;
    const momPct = momDelta !== null && prev !== 0 && prev !== null
      ? (momDelta / Math.abs(prev)) * 100
      : null;
    rows.push({ monthKey: mk, label, endNW: entry.netWorth, momDelta, momPct });
  }
  return rows.reverse();
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
        <Text as="div" weight={700} color="var(--ft-text)">
          Net Worth: {formatBaseMoney(d.netWorth)}
        </Text>
      )}
      {d.totalAssets !== undefined && (
        <Text as="div" color="var(--ft-green)">Assets: {formatBaseMoney(d.totalAssets)}</Text>
      )}
      {d.totalLiabilities !== undefined && d.totalLiabilities > 0 && (
        <Text as="div" color="var(--ft-red)">Liabilities: {formatBaseMoney(d.totalLiabilities)}</Text>
      )}
      {d.note && (
        <div style={{ color: "var(--ft-muted)", marginTop: 4, fontSize: 9 }}>Note: {d.note}</div>
      )}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ onAdd, isMobile }: { onAdd: () => void; isMobile: boolean }) {
  return (
    <div style={{
      border: "1px solid var(--ft-border)",
      background: "var(--ft-surface)",
      overflow: "hidden",
      minHeight: "calc(100vh - 160px)",
      display: "flex",
      flexDirection: "column",
    }}>
      <PanelHeader>No snapshots yet</PanelHeader>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "24px 16px 20px" : "48px 40px 40px",
        textAlign: "center",
        flex: 1,
      }}>
        {!isMobile && (
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 22,
            color: "var(--ft-border2)",
            lineHeight: 1.5,
            marginBottom: 24,
            userSelect: "none" as const,
            letterSpacing: "0.04em",
          }}>
            {"┌──────────────────┐"}<br />
            {"│  NET WORTH  ─────│"}<br />
            {"│  £ 0.00    ↗    │"}<br />
            {"│  ▁▂▃▄▅▆▇█  ·    │"}<br />
            {"└──────────────────┘"}
          </div>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)", marginBottom: 10, fontWeight: 600 }}>
          Start tracking your net worth over time
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 6, maxWidth: 380, lineHeight: 1.7 }}>
          Recording your net worth periodically is one of the most important habits in personal finance. It shows you whether your wealth is actually growing — not just your income.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: isMobile ? 16 : 28, maxWidth: 380, lineHeight: 1.7 }}>
          Add your first snapshot to begin. Log assets (cash, investments, property) and liabilities (mortgage, loans, cards) — the difference is your net worth.
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
            padding: "9px 28px",
            cursor: "pointer",
          }}
        >
          + Record First Snapshot
        </button>
      </div>
    </div>
  );
}

// ── Allocation Donut ───────────────────────────────────────────────────────

interface AllocationSlice {
  name: string;
  value: number;
  color: string;
}

function AllocationDonut({ slices }: { slices: AllocationSlice[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) return null;

  return (
    <HStack gap={24} align="center">
      <PieChart width={120} height={120}>
        <Pie
          data={slices}
          cx={55}
          cy={55}
          innerRadius={34}
          outerRadius={55}
          dataKey="value"
          strokeWidth={0}
        >
          {slices.map((sl, i) => (
            <Cell key={`cell-${i}`} fill={sl.color} />
          ))}
        </Pie>
      </PieChart>
      <VStack gap={5}>
        {slices.map((sl) => {
          const pct = ((sl.value / total) * 100).toFixed(1);
          return (
            <div key={sl.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, background: sl.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", minWidth: 70 }}>
                {sl.name}
              </span>
              <Text as="span" mono size={10} weight={600} color="var(--ft-text)">
                {formatBaseMoney(sl.value)}
              </Text>
              <Text as="span" mono size={9} color="var(--ft-muted)">
                {pct}%
              </Text>
            </div>
          );
        })}
      </VStack>
    </HStack>
  );
}

// ── Hoverable sub-rows ─────────────────────────────────────────────────────

function MilestoneRow({ m, isHit, currentNW }: { m: { value: number; date: string }; isHit: boolean; currentNW: number }) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 0",
        borderBottom: "1px solid var(--ft-border)",
        opacity: isHit ? 1 : 0.45,
        background: hovered ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        marginLeft: -16,
        marginRight: -16,
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div style={{
        width: 8, height: 8,
        background: isHit ? "var(--ft-green)" : "var(--ft-border2)",
        flexShrink: 0,
      }} />
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: isHit ? "var(--ft-text)" : "var(--ft-muted)", minWidth: 80, flexShrink: 0, whiteSpace: "nowrap" }}>
        {formatBaseMoney(m.value)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", flex: 1, whiteSpace: "nowrap", minWidth: 0 }}>
        {isHit ? `Reached ${shortDate(m.date)}` : "Not yet reached"}
      </div>
      {isHit && (
        <Text as="span" mono size={9} color="var(--ft-green)">✓</Text>
      )}
    </div>
  );
}

function SnapshotRow({ e, prev, onDelete, deleteConfirmDate }: {
  e: { date: string; totalAssets: number; totalLiabilities: number; netWorth: number; note?: string };
  prev?: { netWorth: number };
  onDelete: (date: string) => void;
  deleteConfirmDate: string | null;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const delta = prev ? e.netWorth - prev.netWorth : null;
  const deltaPct = (delta !== null && prev && prev.netWorth !== 0)
    ? (delta / Math.abs(prev.netWorth)) * 100
    : null;
  const isConfirming = deleteConfirmDate === e.date;
  const rowBg = isConfirming
    ? "color-mix(in srgb, var(--ft-red) 8%, var(--ft-surface))"
    : hovered
    ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
    : "transparent";

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: "1px solid var(--ft-border)", background: rowBg, transition: "background 0.1s" }}
    >
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px", whiteSpace: "nowrap" }}>
        {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", padding: "7px 8px" }}>{formatBaseMoney(e.totalAssets)}</td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: e.totalLiabilities > 0 ? "var(--ft-red)" : "var(--ft-dim)", padding: "7px 8px" }}>{e.totalLiabilities > 0 ? formatBaseMoney(e.totalLiabilities) : "—"}</td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: e.netWorth >= 0 ? "var(--ft-text)" : "var(--ft-red)", padding: "7px 8px" }}>{formatBaseMoney(e.netWorth)}</td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: delta === null ? "var(--ft-dim)" : delta >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "7px 8px" }}>
        {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${formatBaseMoney(delta)}`}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: deltaPct === null ? "var(--ft-dim)" : deltaPct >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "7px 8px" }}>
        {deltaPct === null ? "—" : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", padding: "7px 8px", maxWidth: 160, whiteSpace: "nowrap" }}>{e.note ?? ""}</td>
      <td style={{ padding: "7px 8px" }}>
        <button
          onClick={() => onDelete(e.date)}
          style={{
            background: isConfirming ? "var(--ft-red)" : "none",
            border: "none",
            color: isConfirming ? "#fff" : "var(--ft-dim)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: isConfirming ? 8 : 12,
            fontWeight: isConfirming ? 700 : undefined,
            lineHeight: 1,
            padding: isConfirming ? "2px 5px" : "0 4px",
            borderRadius: 2,
          }}
          title={isConfirming ? "Click again to confirm delete" : "Delete entry"}
        >
          {isConfirming ? "DEL?" : "×"}
        </button>
      </td>
    </tr>
  );
}

function MonthlyStatsRow({ row, isLatest, athDiff }: {
  row: MonthlyRow;
  isLatest: boolean;
  athDiff: number | null;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const rowBg = isLatest
    ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
    : hovered
    ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
    : "transparent";
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: "1px solid var(--ft-border)", background: rowBg, transition: "background 0.1s" }}
    >
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isLatest ? "var(--ft-text)" : "var(--ft-muted)", padding: "7px 12px", fontWeight: isLatest ? 700 : 400, whiteSpace: "nowrap" }}>
        {row.label}{isLatest ? " ←" : ""}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: row.endNW >= 0 ? "var(--ft-text)" : "var(--ft-red)", padding: "7px 12px" }}>
        {formatBaseMoney(row.endNW)}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: row.momDelta === null ? "var(--ft-dim)" : row.momDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "7px 12px" }}>
        {row.momDelta === null ? "—" : `${row.momDelta >= 0 ? "+" : ""}${formatBaseMoney(row.momDelta)}`}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: row.momPct === null ? "var(--ft-dim)" : row.momPct >= 0 ? "var(--ft-green)" : "var(--ft-red)", padding: "7px 12px" }}>
        {row.momPct === null ? "—" : `${row.momPct >= 0 ? "+" : ""}${row.momPct.toFixed(1)}%`}
      </td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: athDiff === null ? "var(--ft-dim)" : athDiff >= 0 ? "var(--ft-cyan)" : "var(--ft-red)", padding: "7px 12px" }}>
        {athDiff === null ? "—" : athDiff >= 0 ? "ATH" : formatBaseMoney(athDiff)}
      </td>
    </tr>
  );
}

function TargetRateRow({ r, yrs, nw10, nw20, isCagr, currentNW, targetNw, arrivalYear }: {
  r: number; yrs: number | null; nw10: number; nw20: number;
  isCagr: boolean; currentNW: number; targetNw: number;
  arrivalYear: (r: number) => string;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const rowBg = isCagr
    ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
    : hovered
    ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
    : "transparent";
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderLeft: isCagr ? "2px solid var(--ft-accent)" : "2px solid transparent", background: rowBg, transition: "background 0.1s" }}
    >
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isCagr ? "var(--ft-accent)" : "var(--ft-text)", padding: "5px 10px", borderBottom: "1px solid var(--ft-border)" }}>{r}%{isCagr ? " ←" : ""}</td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "5px 10px", borderBottom: "1px solid var(--ft-border)" }}>{yrs !== null ? `${yrs.toFixed(1)} yrs` : currentNW >= targetNw ? "Already reached" : "—"}</td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "5px 10px", borderBottom: "1px solid var(--ft-border)" }}>{arrivalYear(r)}</td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "5px 10px", borderBottom: "1px solid var(--ft-border)" }}>{formatBaseMoney(Math.round(nw10))}</td>
      <td className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "5px 10px", borderBottom: "1px solid var(--ft-border)" }}>{formatBaseMoney(Math.round(nw20))}</td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function NetWorthHistory() {
  const isMobile = useIsMobile();
  const [history, setHistory] = useState<NWEntry[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [period, setPeriod] = useState<Period>("All");
  const [targetNw, setTargetNw] = useState<number>(() => {
    try { const r = localStorage.getItem("ft-nw-target"); return r ? parseFloat(r) : 0; } catch { return 0; }
  });
  const [targetInput, setTargetInput] = useState<string>(() => {
    try { const r = localStorage.getItem("ft-nw-target"); return r && parseFloat(r) > 0 ? String(parseFloat(r)) : ""; } catch { return ""; }
  });

  // Form state
  const [formAssets, setFormAssets] = useState("");
  const [formLiabilities, setFormLiabilities] = useState("");
  const [formNote, setFormNote] = useState("");

  // Milestone form state
  const [msDate, setMsDate] = useState(todayStr());
  const [msLabel, setMsLabel] = useState("");
  const [msColor, setMsColor] = useState("var(--ft-accent)");
  const [deleteConfirmDate, setDeleteConfirmDate] = useState<string | null>(null);

  // Live data for auto-fill
  const { data: rawAccounts = [] } = useListAccounts();
  const { data: invSummary } = useGetInvestmentSummary();
  const { data: rawDebts = [] } = useListDebts();

  const liveAssets = useMemo(() => {
    const accountTotal = (rawAccounts as Array<{ baseEquivalent?: number }>)
      .reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);
    const investTotal = (invSummary as { totalValueBase?: number } | undefined)?.totalValueBase ?? 0;
    return Math.round((accountTotal + investTotal) * 100) / 100;
  }, [rawAccounts, invSummary]);

  const liveLiabilities = useMemo(() => {
    return Math.round(
      (rawDebts as Array<{ direction?: string; baseEquivalent?: number; status?: string }>)
        .filter((d) => d.direction === "i_owe_them" && d.status === "pending")
        .reduce((s, d) => s + (d.baseEquivalent ?? 0), 0)
      * 100
    ) / 100;
  }, [rawDebts]);

  function autoFillFromLiveData() {
    setFormAssets(liveAssets > 0 ? String(liveAssets) : "");
    setFormLiabilities(liveLiabilities > 0 ? String(liveLiabilities) : "");
    if (!showForm) setShowForm(true);
  }

  useEffect(() => {
    setHistory(loadHistory());
    setMilestones(loadMilestones());
  }, []);

  // Auto-snapshot: save today's NW from live data if no entry exists for today
  useEffect(() => {
    if (liveAssets <= 0) return;
    const today = todayStr();
    const existing = loadHistory();
    if (existing.some((e) => e.date === today)) return;
    const entry: NWEntry = {
      date: today,
      totalAssets: liveAssets,
      totalLiabilities: liveLiabilities,
      netWorth: liveAssets - liveLiabilities,
      note: "auto",
    };
    const updated = [...existing, entry].sort((a, b) => a.date.localeCompare(b.date));
    saveHistory(updated);
    setHistory(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAssets, liveLiabilities]);

  // Derived
  const filtered = useMemo(() => filterByPeriod(history, period), [history, period]);
  const chartData = useMemo(() => filtered.map((e) => ({ ...e })), [filtered]);
  const projectionPoints = useMemo(() => linearProject(history), [history]);

  const projectedIn12Months = projectionPoints.length > 0
    ? projectionPoints[projectionPoints.length - 1].projected
    : null;

  // Combined chart data: history entries + projected points
  const fullChartData = useMemo(() => {
    if (period !== "All" && period !== "1Y") {
      return chartData.map((d) => ({ ...d, projected: undefined as number | undefined }));
    }
    const histWithNull = chartData.map((d) => ({ ...d, projected: undefined as number | undefined }));
    if (projectionPoints.length === 0) return histWithNull;
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
    return combined;
  }, [chartData, projectionPoints, period]);

  const currentNW = history.length > 0 ? history[history.length - 1].netWorth : 0;
  const firstNW = history.length > 0 ? history[0].netWorth : 0;
  const nwChange = currentNW - firstNW;
  const nwChangePct = firstNW !== 0 ? (nwChange / Math.abs(firstNW)) * 100 : 0;

  const isPositiveTrend = history.length < 2 || currentNW >= firstNW;
  const trendColor = isPositiveTrend ? "var(--ft-green)" : "var(--ft-red)";

  // All-time high and low
  const allTimeHigh = useMemo(() => {
    if (history.length === 0) return null;
    return history.reduce((max, e) => e.netWorth > max.netWorth ? e : max, history[0]);
  }, [history]);

  const allTimeLow = useMemo(() => {
    if (history.length === 0) return null;
    return history.reduce((min, e) => e.netWorth < min.netWorth ? e : min, history[0]);
  }, [history]);

  // MTD change
  const mtdChange = useMemo(() => {
    if (history.length === 0) return null;
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthStart = [...history].reverse().find((e) => e.date < firstOfMonth);
    if (!monthStart) return null;
    return currentNW - monthStart.netWorth;
  }, [history, currentNW]);

  // YTD change
  const ytdChange = useMemo(() => {
    if (history.length === 0) return null;
    const firstOfYear = `${new Date().getFullYear()}-01-01`;
    const yearStart = [...history].reverse().find((e) => e.date < firstOfYear);
    if (!yearStart) return null;
    return currentNW - yearStart.netWorth;
  }, [history, currentNW]);

  // CAGR
  const cagr = useMemo(() => {
    if (history.length < 2 || firstNW <= 0 || currentNW <= 0) return null;
    const firstDate = new Date(history[0].date).getTime();
    const lastDate = new Date(history[history.length - 1].date).getTime();
    const years = (lastDate - firstDate) / (365.25 * 24 * 3600 * 1000);
    if (years < 0.08) return null;
    return (Math.pow(currentNW / firstNW, 1 / years) - 1) * 100;
  }, [history, firstNW, currentNW]);

  // Best single-period increase
  const bestMonthIncrease = useMemo(() => {
    if (history.length < 2) return 0;
    let best = 0;
    for (let i = 1; i < history.length; i++) {
      const delta = history[i].netWorth - history[i - 1].netWorth;
      if (delta > best) best = delta;
    }
    return best;
  }, [history]);

  // Auto milestones
  const autoMilestones = useMemo(() => computeAutoMilestones(history), [history]);

  // Monthly stats table
  const monthlyStats = useMemo(() => buildMonthlyStats(history), [history]);

  // Allocation donut: assets vs liabilities
  const latestEntry = history.length > 0 ? history[history.length - 1] : null;
  const allocationSlices: AllocationSlice[] = useMemo(() => {
    if (!latestEntry || latestEntry.totalAssets <= 0) return [];
    const slices: AllocationSlice[] = [
      { name: "Net Worth", value: Math.max(0, latestEntry.netWorth), color: "var(--ft-green)" },
    ];
    if (latestEntry.totalLiabilities > 0) {
      slices.push({ name: "Liabilities", value: latestEntry.totalLiabilities, color: "var(--ft-red)" });
    }
    return slices;
  }, [latestEntry]);

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
    if (deleteConfirmDate !== date) {
      setDeleteConfirmDate(date);
      setTimeout(() => setDeleteConfirmDate(null), 3000);
      return;
    }
    setDeleteConfirmDate(null);
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

  const PERIODS: Period[] = ["1M", "3M", "6M", "1Y", "All"];

  return (
    <div>
      {/* Persona quick-start */}
      {(() => { const ids = loadPersonaIds(); return ids[0] === "wealth"; })() && <PersonaQuickStart />}

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid) return null;
        const msgs: Record<string, string | null> = {
          wealth: "Net worth history is the foundation of Wealth Architect — log snapshots regularly to track your trajectory and model future milestones.",
          market: "Track total net worth alongside your portfolio value to see how investment gains compound relative to your broader balance sheet.",
          budget: "Your net worth = assets − liabilities. Even small monthly surpluses compound significantly over time — this chart shows that in action.",
          social: null,
          full: null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const persona = PERSONAS.find(p => p.id === pid);
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            {persona && <span style={{ color: "var(--ft-dim)", flexShrink: 0, fontSize: 9 }}>{persona.code}</span>}
            <span>{msg}</span>
          </div>
        );
      })()}

      <PageHeader
        icon={TrendingUp}
        title="Net Worth History"
        subtitle="track wealth over time · spot trends · project the future"
        actions={
          <HStack gap={8}>
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
          </HStack>
        }
      />

      {/* ── KPI Bar ── */}
      {history.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 6 }}>
          {/* Current Net Worth — hero number */}
          <div style={{ padding: "14px 18px", background: "var(--ft-surface)", borderRight: "1px solid var(--ft-border)", borderBottom: isMobile ? "1px solid var(--ft-border)" : "none" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Net Worth</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: currentNW >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1, whiteSpace: "nowrap" }}>
              {formatBaseMoney(currentNW)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
              {cagr !== null ? <Text as="span" color="var(--ft-cyan)">{cagr >= 0 ? "+" : ""}{cagr.toFixed(1)}% CAGR</Text> : "as of today"}
            </div>
          </div>

          {/* MTD */}
          <div style={{ padding: "14px 18px", background: "var(--ft-surface)", borderRight: isMobile ? "none" : "1px solid var(--ft-border)", borderBottom: isMobile ? "1px solid var(--ft-border)" : "none" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>MTD Change</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: mtdChange === null ? "var(--ft-muted)" : mtdChange >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1 }}>
              {mtdChange === null ? "—" : `${mtdChange >= 0 ? "+" : ""}${formatBaseMoney(mtdChange)}`}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>month to date</div>
          </div>

          {/* YTD */}
          <div style={{ padding: "14px 18px", background: "var(--ft-surface)", borderRight: "1px solid var(--ft-border)", borderBottom: isMobile ? "1px solid var(--ft-border)" : "none" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>YTD Change</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: ytdChange === null ? "var(--ft-muted)" : ytdChange >= 0 ? "var(--ft-green)" : "var(--ft-red)", lineHeight: 1 }}>
              {ytdChange === null ? "—" : `${ytdChange >= 0 ? "+" : ""}${formatBaseMoney(ytdChange)}`}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>year to date</div>
          </div>

          {/* All-time high */}
          <div style={{ padding: "14px 18px", background: "var(--ft-surface)", borderRight: isMobile ? "none" : "1px solid var(--ft-border)", borderBottom: isMobile ? "1px solid var(--ft-border)" : "none" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>All-Time High</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-cyan)", lineHeight: 1 }}>
              {allTimeHigh ? formatBaseMoney(allTimeHigh.netWorth) : "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
              {allTimeHigh ? shortDate(allTimeHigh.date) : ""}
            </div>
          </div>

          {/* All-time low */}
          <div style={{ padding: "14px 18px", background: "var(--ft-surface)", borderRight: "none", borderBottom: "none", ...(isMobile ? { gridColumn: "span 2" } : {}) }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Best Single Month</div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-amber)", lineHeight: 1 }}>
              {bestMonthIncrease > 0 ? `+${formatBaseMoney(bestMonthIncrease)}` : (allTimeLow ? formatBaseMoney(allTimeLow.netWorth) : "—")}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
              {bestMonthIncrease > 0 ? "largest single gain" : (allTimeLow ? shortDate(allTimeLow.date) : "")}
            </div>
          </div>
        </div>
      )}

      {/* ── Live data mini strip (only if no history yet) ── */}
      {liveAssets > 0 && history.length === 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 6 }}>
          {[
            { label: "Live Assets", value: formatBaseMoney(liveAssets), color: "var(--ft-green)" },
            { label: "Live Liabilities", value: formatBaseMoney(liveLiabilities), color: "var(--ft-red)" },
            { label: "Current Net Worth", value: formatBaseMoney(liveAssets - liveLiabilities), color: (liveAssets - liveLiabilities) >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
          ].map((cell, i) => (
            <div key={cell.label} style={{ padding: "12px 16px", borderRight: i < 2 ? "1px solid var(--ft-border)" : "none" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{cell.label}</div>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: i === 2 ? 18 : 14, fontWeight: 700, color: cell.color, lineHeight: 1, whiteSpace: "nowrap" }}>{cell.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Snapshot form ── */}
      {showForm && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <div style={{
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 12px",
            minHeight: "var(--ft-panel-header-h)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span className="ft-panel-label">
              Record Today&apos;s Net Worth
            </span>
            {liveAssets > 0 && (
              <button
                onClick={autoFillFromLiveData}
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const, padding: "3px 10px", border: "1px solid color-mix(in srgb, var(--ft-blue) 40%, transparent)", background: "color-mix(in srgb, var(--ft-blue) 8%, transparent)", color: "var(--ft-blue)", cursor: "pointer" }}
                title={`Auto-fill: Assets £${liveAssets.toLocaleString()} · Liabilities £${liveLiabilities.toLocaleString()}`}
              >
                ↻ Auto-fill ({formatBaseMoney(liveAssets - liveLiabilities)} net)
              </button>
            )}
          </div>
          <div style={{ padding: "16px 20px" }}>
            <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelSt}>Total Assets (£)</label>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>Cash + investments + property + other</div>
                <input type="number" placeholder="e.g. 85000" value={formAssets} onChange={(e) => setFormAssets(e.target.value)} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Total Liabilities (£)</label>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>Mortgage + loans + cards + other debts</div>
                <input type="number" placeholder="e.g. 12000" value={formLiabilities} onChange={(e) => setFormLiabilities(e.target.value)} style={inputSt} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Note (optional)</label>
                <input type="text" placeholder='e.g. Got a raise, paid off car' value={formNote} onChange={(e) => setFormNote(e.target.value)} style={inputSt} />
              </div>
            </div>
            {formAssets && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 12 }}>
                Net worth:{" "}
                <span className="pnum" style={{ fontWeight: 700, color: (parseFloat(formAssets) - (parseFloat(formLiabilities) || 0)) >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {formatBaseMoney(parseFloat(formAssets) - (parseFloat(formLiabilities) || 0))}
                </span>
              </div>
            )}
            <HStack gap={8}>
              <button onClick={handleSnapshot} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "var(--ft-green)", color: "var(--ft-base)", border: "none", padding: "7px 20px", cursor: "pointer" }}>
                Save Snapshot
              </button>
              <button onClick={() => setShowForm(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "7px 16px", cursor: "pointer" }}>
                Cancel
              </button>
            </HStack>
          </div>
        </div>
      )}

      {/* ── Milestone form ── */}
      {showMilestoneForm && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <PanelHeader>Add Milestone</PanelHeader>
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelSt}>Date</label>
                <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Label</label>
                <input type="text" placeholder='"Paid off car loan"' value={msLabel} onChange={(e) => setMsLabel(e.target.value)} style={inputSt} />
              </div>
            </div>
            <HStack gap={8}>
              <button onClick={handleAddMilestone} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", padding: "7px 20px", cursor: "pointer" }}>
                Add
              </button>
              <button onClick={() => setShowMilestoneForm(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "7px 16px", cursor: "pointer" }}>
                Cancel
              </button>
            </HStack>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {history.length === 0 && !showForm && <EmptyState onAdd={() => setShowForm(true)} isMobile={isMobile} />}

      {/* ── Main chart ── */}
      {history.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <div style={{
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 12px",
            minHeight: "var(--ft-panel-header-h)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <HStack gap={16} align="center">
              <span className="ft-panel-label">
                Net Worth Timeline
              </span>
              {projectedIn12Months !== null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                  Projected 12m:{" "}
                  <span className="pnum" style={{ color: projectedIn12Months >= currentNW ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>
                    {formatBaseMoney(projectedIn12Months)}
                  </span>
                  {" "}
                  <Text as="span" size={8} color="var(--ft-dim)">(linear trend)</Text>
                </span>
              )}
            </HStack>
            {/* Period selector */}
            <div style={{ display: "flex", gap: 0, border: "1px solid var(--ft-border)", flexShrink: 0 }}>
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.06em",
                    padding: "5px 11px",
                    cursor: "pointer",
                    background: period === p ? "var(--ft-accent)" : "transparent",
                    color: period === p ? "var(--ft-base)" : "var(--ft-dim)",
                    border: "none",
                    borderRight: p !== "All" ? "1px solid var(--ft-border)" : "none",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "16px 20px 12px" }}>

          <ResponsiveContainer width="100%" height={300}>
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

              {/* User milestones */}
              {visibleMilestones.map((m) => (
                <ReferenceLine
                  key={`${m.date}-${m.label}`}
                  x={m.date}
                  stroke={m.color ?? "var(--ft-accent)"}
                  strokeDasharray="3 3"
                  label={{ value: m.label, position: "insideTopRight", fill: m.color ?? "var(--ft-accent)", fontSize: 7, fontFamily: "var(--font-mono)" }}
                />
              ))}

              <Area type="monotone" dataKey="netWorth" stroke={trendColor} strokeWidth={2} fill="url(#nwGradient)" dot={false} connectNulls={false} />
              {projectionPoints.length > 0 && (
                <Area type="monotone" dataKey="projected" stroke="var(--ft-cyan)" strokeWidth={1.5} strokeDasharray="5 4" fill="url(#projGradient)" dot={false} connectNulls={true} />
              )}
            </AreaChart>
          </ResponsiveContainer>

          <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 52 }}>
            <HStack gap={5} align="center">
              <div style={{ width: 16, height: 2, background: trendColor }} />
              <Text as="span" mono size={8} color="var(--ft-dim)">Net Worth</Text>
            </HStack>
            {projectionPoints.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 1, background: "var(--ft-cyan)", borderTop: "1px dashed var(--ft-cyan)" }} />
                <Text as="span" mono size={8} color="var(--ft-dim)">Projected</Text>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* ── Stacked assets/liabilities chart ── */}
      {history.length >= 2 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <PanelHeader>Assets vs Liabilities</PanelHeader>
          <div style={{ padding: "16px 20px 12px" }}>
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
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickLine={false} axisLine={{ stroke: "var(--ft-border)" }} minTickGap={40} />
              <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                formatter={(value: number, name: string) => [formatBaseMoney(value), name === "totalAssets" ? "Assets" : "Liabilities"]}
                contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
              />
              <Area type="monotone" dataKey="totalAssets" stroke="var(--ft-green)" strokeWidth={1.5} fill="url(#assetsGrad)" dot={false} />
              <Area type="monotone" dataKey="totalLiabilities" stroke="var(--ft-red)" strokeWidth={1.5} fill="url(#liabGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 52 }}>
            <HStack gap={5} align="center">
              <div style={{ width: 12, height: 2, background: "var(--ft-green)" }} />
              <Text as="span" mono size={8} color="var(--ft-dim)">Assets</Text>
            </HStack>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 12, height: 2, background: "var(--ft-red)" }} />
              <Text as="span" mono size={8} color="var(--ft-dim)">Liabilities</Text>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ── Auto Milestones + Allocation split ── */}
      {history.length > 0 && (autoMilestones.length > 0 || allocationSlices.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: allocationSlices.length > 0 ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 16 }}>

          {/* Auto milestones */}
          {autoMilestones.length > 0 && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
              <PanelHeader>Wealth Milestones</PanelHeader>
              <div style={{ padding: "0 16px 12px" }}>
                {autoMilestones.slice(0, 10).map((m) => {
                  const isHit = currentNW >= m.value;
                  return (
                    <MilestoneRow key={m.value} m={m} isHit={isHit} currentNW={currentNW} />
                  );
                })}
                {currentNW > 0 && (() => {
                  const nextLevel = Math.ceil(currentNW / 10000) * 10000;
                  const remaining = nextLevel - currentNW;
                  const pct = ((currentNW % 10000) / 10000) * 100;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 5 }}>
                        Next: <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 600 }}>{formatBaseMoney(nextLevel)}</span>
                        {" — "}<span className="pnum" style={{ color: "var(--ft-cyan)" }}>{formatBaseMoney(remaining)} to go</span>
                      </div>
                      <div style={{ height: 4, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "var(--ft-accent)" }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Allocation donut */}
          {allocationSlices.length > 0 && latestEntry && (
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
              <PanelHeader>Allocation Breakdown</PanelHeader>
              <div style={{ padding: "16px 16px 12px" }}>
                <AllocationDonut slices={allocationSlices} />
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--ft-border)" }}>
                  <div style={{ padding: "8px 12px", borderRight: "1px solid var(--ft-border)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 3 }}>Total Assets</div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>{formatBaseMoney(latestEntry.totalAssets)}</div>
                  </div>
                  <div style={{ padding: "8px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 3 }}>Total Liabilities</div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: latestEntry.totalLiabilities > 0 ? "var(--ft-red)" : "var(--ft-dim)" }}>
                      {latestEntry.totalLiabilities > 0 ? formatBaseMoney(latestEntry.totalLiabilities) : "£0"}
                    </div>
                  </div>
                </div>
                {latestEntry.totalAssets > 0 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 8 }}>
                    Leverage ratio: <Text as="span" color="var(--ft-text)">
                      {latestEntry.totalLiabilities > 0
                        ? `${((latestEntry.totalLiabilities / latestEntry.totalAssets) * 100).toFixed(1)}% of assets are financed`
                        : "Debt-free"}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Monthly stats table ── */}
      {monthlyStats.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <div style={{
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 12px",
            minHeight: "var(--ft-panel-header-h)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span className="ft-panel-label">
              Monthly Breakdown
            </span>
            <Text as="span" mono size={9} color="var(--ft-dim)">
              End-of-month · last {monthlyStats.length} months
            </Text>
          </div>
          {isMobile ? (
            <div>
              {monthlyStats.map((row, idx) => {
                const isLatest = idx === 0;
                return (
                  <div
                    key={row.monthKey}
                    style={{
                      borderBottom: "1px solid var(--ft-border)",
                      padding: "8px 14px",
                      background: isLatest ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
                    }}
                  >
                    <HStack align="baseline" justify="between" marginBottom={3}>
                      <Text as="span" mono size={10} weight={isLatest ? 700 : 400} color={isLatest ? "var(--ft-text)" : "var(--ft-muted)"}>
                        {row.label}{isLatest ? " ←" : ""}
                      </Text>
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: row.endNW >= 0 ? "var(--ft-text)" : "var(--ft-red)" }}>
                        {formatBaseMoney(row.endNW)}
                      </span>
                    </HStack>
                    <HStack gap={12}>
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: row.momDelta === null ? "var(--ft-dim)" : row.momDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                        {row.momDelta === null ? "—" : `${row.momDelta >= 0 ? "+" : ""}${formatBaseMoney(row.momDelta)}`}
                      </span>
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: row.momPct === null ? "var(--ft-dim)" : row.momPct >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                        {row.momPct === null ? "—" : `${row.momPct >= 0 ? "+" : ""}${row.momPct.toFixed(1)}%`}
                      </span>
                    </HStack>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 460, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Month", "Net Worth", "MoM Change", "MoM %", "vs ATH"].map((h) => (
                      <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "4px 12px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyStats.map((row, idx) => {
                    const athDiff = allTimeHigh ? row.endNW - allTimeHigh.netWorth : null;
                    const isLatest = idx === 0;
                    return (
                      <MonthlyStatsRow
                        key={row.monthKey}
                        row={row}
                        isLatest={isLatest}
                        athDiff={athDiff}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Target Net Worth Calculator ── */}
      {history.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <div style={{
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 12px",
            minHeight: "var(--ft-panel-header-h)",
            display: "flex",
            flexWrap: isMobile ? "wrap" : "nowrap",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: isMobile ? 6 : 0,
          }}>
            <HStack gap={10} align="center">
              <span className="ft-panel-label">
                Target Net Worth
              </span>
              {targetNw > 0 && currentNW > 0 && (
                <Text as="span" mono size={9} color="var(--ft-dim)">
                  — {Math.min(100, (currentNW / targetNw) * 100).toFixed(1)}% reached
                </Text>
              )}
            </HStack>
            <HStack gap={8} align="center">
              <input
                type="number"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(targetInput);
                  if (!isNaN(v) && v > 0) {
                    setTargetNw(v);
                    try { localStorage.setItem("ft-nw-target", String(v)); } catch { /* noop */ }
                  } else {
                    setTargetNw(0);
                    try { localStorage.removeItem("ft-nw-target"); } catch { /* noop */ }
                  }
                }}
                placeholder="e.g. 500000"
                className="ft-filter-input"
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "5px 10px", width: isMobile ? "100%" : 140, outline: "none" }}
              />
            </HStack>
          </div>
          {targetNw > 0 && (() => {
            const pct = Math.min(100, (currentNW / targetNw) * 100);
            const remaining = Math.max(0, targetNw - currentNW);
            const RATES = [5, 8, 10, 12];
            const yearsToReach = (r: number) => {
              if (r <= 0 || currentNW <= 0) return null;
              const yrs = Math.log(targetNw / currentNW) / Math.log(1 + r / 100);
              return yrs > 0 && yrs < 200 ? yrs : null;
            };
            const arrivalYear = (r: number) => {
              const yrs = yearsToReach(r);
              if (yrs === null) return "—";
              const yr = new Date().getFullYear() + Math.ceil(yrs);
              return String(yr);
            };
            const cagrYears = cagr !== null ? yearsToReach(cagr) : null;
            return (
              <div>
                <div style={{ padding: "12px 16px 0" }}>
                  <HStack gap={4} justify="between" wrap marginBottom={6}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>Current: <span className="pnum">{formatBaseMoney(currentNW)}</span></span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>Remaining: <span className="pnum">{formatBaseMoney(remaining)}</span></span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>Target: <span className="pnum">{formatBaseMoney(targetNw)}</span></span>
                  </HStack>
                  <div style={{ height: 6, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: pct >= 100 ? "var(--ft-green)" : "var(--ft-accent)", transition: "width 0.25s ease" }} />
                  </div>
                  {cagr !== null && cagrYears !== null && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 6 }}>
                      At your historical CAGR of {cagr.toFixed(1)}% → target in <span style={{ color: "var(--ft-text)" }}>{cagrYears.toFixed(1)} yrs</span> ({arrivalYear(cagr)})
                    </div>
                  )}
                </div>
                <div className="ft-scroll-x" style={{ overflowX: "auto", padding: "12px 16px 14px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Growth Rate", "Years to Target", "Arrival Year", "NW in 10 yrs", "NW in 20 yrs"].map((h) => (
                          <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "3px 10px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {RATES.map((r) => {
                        const yrs = yearsToReach(r);
                        const nw10 = currentNW * Math.pow(1 + r / 100, 10);
                        const nw20 = currentNW * Math.pow(1 + r / 100, 20);
                        const isCagr = cagr !== null && Math.abs(r - cagr) < 0.5;
                        return (
                          <TargetRateRow
                            key={r}
                            r={r}
                            yrs={yrs}
                            nw10={nw10}
                            nw20={nw20}
                            isCagr={isCagr}
                            currentNW={currentNW}
                            targetNw={targetNw}
                            arrivalYear={arrivalYear}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          {targetNw === 0 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", padding: "12px 16px", textAlign: "center" }}>
              Enter a target net worth to see projections and time-to-reach scenarios.
            </div>
          )}
        </div>
      )}

      {/* ── User Milestones list ── */}
      {milestones.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", marginBottom: 6, overflow: "hidden" }}>
          <PanelHeader>Custom Milestones</PanelHeader>
          <VStack gap={0} padding="8px 16px 12px">
            {milestones.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--ft-border)" }}>
                <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: m.color ?? "var(--ft-accent)", flexShrink: 0 }}>■</span>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", minWidth: 60, flexShrink: 0, whiteSpace: "nowrap" }}>{shortDate(m.date)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1, whiteSpace: "nowrap", minWidth: 0 }}>{m.label}</div>
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
          </VStack>
        </div>
      )}

      {/* ── Snapshot log ── */}
      {history.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
          <PanelHeader>Snapshot Log — {history.length} entries</PanelHeader>
          {isMobile ? (
            <div>
              {[...history].reverse().map((e, idx, arr) => {
                const prev = arr[idx + 1];
                const delta = prev ? e.netWorth - prev.netWorth : null;
                const deltaPct = (delta !== null && prev && prev.netWorth !== 0)
                  ? (delta / Math.abs(prev.netWorth)) * 100
                  : null;
                const isConfirming = deleteConfirmDate === e.date;
                return (
                  <div
                    key={e.date}
                    style={{
                      borderBottom: "1px solid var(--ft-border)",
                      padding: "8px 14px",
                      background: isConfirming ? "color-mix(in srgb, var(--ft-red) 8%, var(--ft-surface))" : "transparent",
                    }}
                  >
                    <HStack align="baseline" justify="between" marginBottom={3}>
                      <Text as="span" mono size={9} color="var(--ft-muted)">
                        {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                      <HStack gap={8} align="center">
                        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: e.netWorth >= 0 ? "var(--ft-text)" : "var(--ft-red)" }}>
                          {formatBaseMoney(e.netWorth)}
                        </span>
                        <button
                          onClick={() => handleDeleteEntry(e.date)}
                          style={{
                            background: isConfirming ? "var(--ft-red)" : "none",
                            border: "none",
                            color: isConfirming ? "#fff" : "var(--ft-dim)",
                            cursor: "pointer",
                            fontFamily: "var(--font-mono)",
                            fontSize: isConfirming ? 8 : 12,
                            fontWeight: isConfirming ? 700 : undefined,
                            lineHeight: 1,
                            padding: isConfirming ? "2px 5px" : "0 4px",
                            borderRadius: 2,
                          }}
                        >
                          {isConfirming ? "DEL?" : "×"}
                        </button>
                      </HStack>
                    </HStack>
                    <HStack gap={10} wrap>
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                        A: {formatBaseMoney(e.totalAssets)}
                      </span>
                      {e.totalLiabilities > 0 && (
                        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)" }}>
                          L: {formatBaseMoney(e.totalLiabilities)}
                        </span>
                      )}
                      {delta !== null && (
                        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: delta >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                          {delta >= 0 ? "+" : ""}{formatBaseMoney(delta)}
                          {deltaPct !== null && ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}
                        </span>
                      )}
                      {e.note && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", whiteSpace: "nowrap", maxWidth: 140 }}>
                          {e.note}
                        </span>
                      )}
                    </HStack>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ft-scroll-x" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Date", "Assets", "Liabilities", "Net Worth", "Change", "% Chg", "Note", ""].map((h) => (
                      <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((e, idx, arr) => {
                    const prev = arr[idx + 1];
                    return (
                      <SnapshotRow
                        key={e.date}
                        e={e}
                        prev={prev}
                        onDelete={handleDeleteEntry}
                        deleteConfirmDate={deleteConfirmDate}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
