import { useState, useMemo, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useListTransactions, useGetDashboard } from "@workspace/api-client-react";
import { formatGbp, formatDate } from "@/lib/utils";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// ─── date helpers ─────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function quarterRange(q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const y = new Date().getFullYear();
  const starts = [0, 3, 6, 9];
  const start = starts[q - 1];
  const end = start + 2;
  const fromDate = new Date(y, start, 1);
  const toDate = new Date(y, end + 1, 0);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function lastYear(): { from: string; to: string } {
  const y = new Date().getFullYear() - 1;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

function formatMonthAbbr(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-GB", { month: "short" });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

interface CsvRow {
  date: string;
  description: string;
  type: string;
  category: string;
  nativeAmount: number;
  currency: string;
  gbpValue: number;
}

function exportCsv(rows: CsvRow[], reportType: string) {
  const header = ["Date", "Description", "Type", "Category", "Amount (Native)", "Currency", "Amount (GBP)"];
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.date,
        r.description,
        r.type,
        r.category,
        Math.abs(r.nativeAmount).toFixed(2),
        r.currency,
        Math.abs(r.gbpValue).toFixed(2),
      ]
        .map(escape)
        .join(",")
    ),
  ];
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const slug = reportType.toLowerCase().replace(/\s+/g, "-");
  const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── style atoms ─────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "var(--ft-dim)",
  marginBottom: 10,
};

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
  fontFamily: "var(--font-mono)",
  verticalAlign: "middle" as const,
};

const TD: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  borderBottom: "1px solid var(--ft-raised)",
  color: "var(--ft-text)",
  whiteSpace: "nowrap" as const,
};

const TD_TOTAL: React.CSSProperties = {
  ...TD,
  fontWeight: 700,
  background: "var(--ft-raised)",
  borderTop: "2px solid var(--ft-border2)",
  borderBottom: "none",
};

const PALETTE = [
  "var(--ft-accent)",
  "var(--ft-amber)",
  "var(--ft-cyan)",
  "#56D364",
  "#79C0FF",
  "#E6B450",
  "var(--ft-red)",
  "var(--ft-blue)",
];

// ─── report types ─────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { id: "income-statement", label: "Income Statement" },
  { id: "expense-report", label: "Expense Report" },
  { id: "net-worth", label: "Net Worth Report" },
  { id: "cash-flow", label: "Cash Flow Report" },
] as const;

type ReportTypeId = typeof REPORT_TYPES[number]["id"];

// ─── quick date ranges ────────────────────────────────────────────────────────

const QUICK_RANGES = [
  { label: "This month", getRange: () => ({ from: firstOfMonth(), to: today() }) },
  {
    label: "Last month",
    getRange: () => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, "0")}`;
      return { from, to };
    },
  },
  { label: "Q1", getRange: () => quarterRange(1) },
  { label: "Q2", getRange: () => quarterRange(2) },
  { label: "Q3", getRange: () => quarterRange(3) },
  { label: "Q4", getRange: () => quarterRange(4) },
  { label: "This Year", getRange: () => ({ from: firstOfYear(), to: today() }) },
  { label: "Last Year", getRange: () => lastYear() },
  { label: "Last 3M", getRange: () => ({ from: monthsAgo(3), to: today() }) },
  { label: "Last 6M", getRange: () => ({ from: monthsAgo(6), to: today() }) },
  { label: "All time", getRange: () => ({ from: "", to: "" }) },
];

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── tax year config ──────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS: number[] = (() => {
  const now = new Date();
  const taxYearStart = new Date(CURRENT_YEAR, 3, 6);
  const latestTaxYear = now >= taxYearStart ? CURRENT_YEAR : CURRENT_YEAR - 1;
  return Array.from({ length: 5 }, (_, i) => latestTaxYear - i);
})();

function formatTaxYear(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(2)}`;
}

async function downloadTaxYearCsv(year: number): Promise<void> {
  const res = await fetch(`/api/export/tax-year/${year}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error: string }).error ?? "Failed to download CSV");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tax-year-${year}-${String(year + 1).slice(2)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── tooltip components ───────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: "var(--ft-raised)",
      border: "1px solid var(--ft-border2)",
      padding: "8px 12px",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      minWidth: 160,
    }}>
      <div style={{ color: "var(--ft-muted)", marginBottom: 6, fontSize: 9 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color, marginBottom: 2 }}>
          <Text as="span" color="var(--ft-dim)">{p.name}</Text>
          <span className="pnum">{p.value < 0 ? "−" : ""}{formatGbp(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function DonutTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div style={{
      background: "var(--ft-raised)",
      border: "1px solid var(--ft-border2)",
      padding: "8px 12px",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
    }}>
      <Text as="span" color="var(--ft-muted)">{p.name}: </Text>
      <span className="pnum" style={{ color: "var(--ft-text)" }}>{formatGbp(p.value)}</span>
    </div>
  );
}

// ─── print style injector ──────────────────────────────────────────────────────

function usePrintStyles() {
  const injected = useRef(false);
  if (!injected.current && typeof document !== "undefined") {
    injected.current = true;
    const style = document.createElement("style");
    style.id = "ft-reports-print";
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #ft-reports-root, #ft-reports-root * { visibility: visible !important; }
        #ft-reports-root { position: absolute; left: 0; top: 0; width: 100%; }
        .ft-no-print { display: none !important; }
        .ft-page-header { border-bottom: 1px solid #ccc !important; }
        @page { margin: 12mm 10mm; }
      }
    `;
    if (!document.getElementById("ft-reports-print")) {
      document.head.appendChild(style);
    }
  }
}

// ─── chart section header ─────────────────────────────────────────────────────

function SectionHeader({ title, right, accentColor = "var(--ft-accent)" }: {
  title: string;
  right?: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <div style={{
      padding: "8px 16px 8px 13px",
      borderBottom: "1px solid var(--ft-border)",
      borderLeft: `3px solid ${accentColor}`,
      background: "var(--ft-surface)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <Text as="span" mono upper size={8} weight={700} color="var(--ft-dim)" letterSpacing="0.12em">
        {title}
      </Text>
      {right && <HStack gap={6} align="center">{right}</HStack>}
    </div>
  );
}

// ─── income statement table ───────────────────────────────────────────────────

interface MonthlyRow {
  month: string;
  income: number;
  expenses: number;
  netSavings: number;
}

// ─── income statement row ─────────────────────────────────────────────────────

interface IncomeStatementRowProps {
  m: MonthlyRow;
  rowIdx: number;
}

function IncomeStatementRow({ m, rowIdx }: IncomeStatementRowProps) {
  const [hov, setHov] = useState(false);
  const margin = m.income > 0 ? ((m.income - m.expenses) / m.income) * 100 : 0;
  const isNeg = m.netSavings < 0;
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : rowIdx % 2 === 0 ? "var(--ft-surface)" : "var(--ft-base)",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...TD, borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)" }}>{formatMonthLabel(m.month)}</td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: m.income > 0 ? "var(--ft-green)" : "var(--ft-muted)" }}>
        <span className="pnum">+{formatGbp(m.income)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: m.expenses > 0 ? "var(--ft-red)" : "var(--ft-muted)" }}>
        <span className="pnum">−{formatGbp(m.expenses)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", fontWeight: 700, color: m.netSavings !== 0 ? (isNeg ? "var(--ft-red)" : "var(--ft-green)") : "var(--ft-muted)" }}>
        <span className="pnum">{m.netSavings >= 0 ? "+" : ""}{formatGbp(m.netSavings)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", color: margin < 0 ? "var(--ft-red)" : margin >= 20 ? "var(--ft-green)" : "var(--ft-amber)" }}>
        <span className="pnum">{m.income > 0 ? `${margin.toFixed(1)}%` : "—"}</span>
      </td>
    </tr>
  );
}

function IncomeStatementTable({ rows }: { rows: MonthlyRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({ income: acc.income + r.income, expenses: acc.expenses + r.expenses, net: acc.net + r.netSavings }),
    { income: 0, expenses: 0, net: 0 }
  );

  return (
    <div className="ft-scroll-x">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Period", "Revenue", "Expenses", "Net Income", "Margin"].map((h) => (
              <th key={h} style={{ ...TH, textAlign: h === "Period" ? "left" : "right", borderRight: "1px solid var(--ft-raised)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((m, rowIdx) => (
            <IncomeStatementRow key={m.month} m={m} rowIdx={rowIdx} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...TD_TOTAL, color: "var(--ft-dim)" }}>TOTAL</td>
            <td style={{ ...TD_TOTAL, textAlign: "right", color: totals.income > 0 ? "var(--ft-green)" : "var(--ft-muted)" }}>
              <span className="pnum">+{formatGbp(totals.income)}</span>
            </td>
            <td style={{ ...TD_TOTAL, textAlign: "right", color: totals.expenses > 0 ? "var(--ft-red)" : "var(--ft-muted)" }}>
              <span className="pnum">−{formatGbp(totals.expenses)}</span>
            </td>
            <td style={{ ...TD_TOTAL, textAlign: "right", color: totals.net !== 0 ? (totals.net >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)" }}>
              <span className="pnum">{totals.net >= 0 ? "+" : ""}{formatGbp(totals.net)}</span>
            </td>
            <td style={{ ...TD_TOTAL, textAlign: "right", color: "var(--ft-muted)" }}>
              <span className="pnum">{totals.income > 0 ? `${(((totals.income - totals.expenses) / totals.income) * 100).toFixed(1)}%` : "—"}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── expense report row ───────────────────────────────────────────────────────

interface ExpenseReportRowProps {
  cat: string;
  amount: number;
  i: number;
  totalExpenses: number;
}

function ExpenseReportRow({ cat, amount, i, totalExpenses }: ExpenseReportRowProps) {
  const [hov, setHov] = useState(false);
  const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
  const color = PALETTE[i % PALETTE.length];
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : i % 2 === 0 ? "var(--ft-surface)" : "var(--ft-base)",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...TD, borderRight: "1px solid var(--ft-raised)" }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 8, verticalAlign: "middle" }} />
        {cat}
      </td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color }}>
        <span className="pnum">−{formatGbp(amount)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)" }}>
        <span className="pnum">{pct.toFixed(1)}%</span>
      </td>
      <td style={{ ...TD, paddingRight: 16 }}>
        <div style={{ height: 3, background: "var(--ft-border)", width: 120 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.25s ease" }} />
        </div>
      </td>
    </tr>
  );
}

// ─── expense report table ─────────────────────────────────────────────────────

function ExpenseReportTable({ categories, totalExpenses }: {
  categories: Array<[string, number]>;
  totalExpenses: number;
}) {
  return (
    <div className="ft-scroll-x">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Category", "Amount", "% of Total", "Share"].map((h) => (
              <th key={h} style={{ ...TH, textAlign: h === "Category" ? "left" : h === "Share" ? "left" : "right", borderRight: "1px solid var(--ft-raised)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map(([cat, amount], i) => (
            <ExpenseReportRow key={cat} cat={cat} amount={amount} i={i} totalExpenses={totalExpenses} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...TD_TOTAL }}>TOTAL EXPENSES</td>
            <td style={{ ...TD_TOTAL, textAlign: "right", color: totalExpenses > 0 ? "var(--ft-red)" : "var(--ft-muted)" }}>
              <span className="pnum">−{formatGbp(totalExpenses)}</span>
            </td>
            <td style={{ ...TD_TOTAL, textAlign: "right", color: "var(--ft-muted)" }}>
              <span className="pnum">100%</span>
            </td>
            <td style={{ ...TD_TOTAL }} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── cash flow row ────────────────────────────────────────────────────────────

interface CashFlowRowProps {
  m: MonthlyRow & { balance: number };
  rowIdx: number;
}

function CashFlowRow({ m, rowIdx }: CashFlowRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : rowIdx % 2 === 0 ? "var(--ft-surface)" : "var(--ft-base)",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...TD, borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)" }}>{formatMonthLabel(m.month)}</td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-green)" }}>
        <span className="pnum">+{formatGbp(m.income)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-red)" }}>
        <span className="pnum">−{formatGbp(m.expenses)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", borderRight: "1px solid var(--ft-raised)", fontWeight: 600, color: m.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
        <span className="pnum">{m.netSavings >= 0 ? "+" : ""}{formatGbp(m.netSavings)}</span>
      </td>
      <td style={{ ...TD, textAlign: "right", color: m.balance >= 0 ? "var(--ft-cyan)" : "var(--ft-red)" }}>
        <span className="pnum">{m.balance >= 0 ? "+" : ""}{formatGbp(m.balance)}</span>
      </td>
    </tr>
  );
}

// ─── cash flow table ──────────────────────────────────────────────────────────

function CashFlowTable({ rows }: { rows: MonthlyRow[] }) {
  let runningBalance = 0;
  const withBalance = [...rows].reverse().map((r) => {
    runningBalance += r.netSavings;
    return { ...r, balance: runningBalance };
  });

  return (
    <div className="ft-scroll-x">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Period", "Inflow", "Outflow", "Net", "Cumulative"].map((h) => (
              <th key={h} style={{ ...TH, textAlign: h === "Period" ? "left" : "right", borderRight: "1px solid var(--ft-raised)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {withBalance.map((m, rowIdx) => (
            <CashFlowRow key={m.month} m={m} rowIdx={rowIdx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── net worth table row ──────────────────────────────────────────────────────

interface NetWorthRowItem {
  label: string;
  value: number | null;
  color: string;
  prefix?: string;
  isPct?: boolean;
}

interface NetWorthTableRowProps {
  r: NetWorthRowItem;
  i: number;
}

function NetWorthTableRow({ r, i }: NetWorthTableRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : i % 2 === 0 ? "var(--ft-surface)" : "var(--ft-base)",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...TD, borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)" }}>{r.label}</td>
      <td style={{ ...TD, textAlign: "right", color: r.color, fontWeight: 700 }}>
        <span className="pnum">
          {r.value === null ? "—" : r.isPct ? `${(r.value as number).toFixed(1)}%` : `${r.prefix ?? ""}${formatGbp(r.value as number)}`}
        </span>
      </td>
    </tr>
  );
}

// ─── net worth placeholder ────────────────────────────────────────────────────

function NetWorthTable({ income, expenses, netSavings, savingsRate }: {
  income: number;
  expenses: number;
  netSavings: number;
  savingsRate: number | null;
}) {
  const rows: NetWorthRowItem[] = [
    { label: "Total Income (period)", value: income, color: income > 0 ? "var(--ft-green)" : "var(--ft-muted)", prefix: "+" },
    { label: "Total Expenses (period)", value: expenses, color: expenses > 0 ? "var(--ft-red)" : "var(--ft-muted)", prefix: "−" },
    { label: "Net Savings (period)", value: netSavings, color: netSavings !== 0 ? (netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", prefix: netSavings >= 0 ? "+" : "" },
    { label: "Savings Rate", value: savingsRate !== null ? savingsRate : null, color: savingsRate !== null && savingsRate >= 20 ? "var(--ft-green)" : savingsRate !== null && savingsRate >= 0 ? "var(--ft-amber)" : "var(--ft-red)", isPct: true },
  ];
  return (
    <div className="ft-scroll-x">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: "left", borderRight: "1px solid var(--ft-raised)" }}>Metric</th>
            <th style={{ ...TH, textAlign: "right" }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <NetWorthTableRow key={r.label} r={r} i={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── waterfall chart (income vs expenses breakdown) ───────────────────────────

function WaterfallChart({ income, expenses, categories }: {
  income: number;
  expenses: number;
  categories: Array<[string, number]>;
}) {
  const data = [
    { name: "Income", value: income, fill: "var(--ft-green)", base: 0 },
    ...categories.slice(0, 6).map(([cat, amt]) => ({
      name: cat.length > 12 ? cat.slice(0, 11) + "…" : cat,
      value: amt,
      fill: "var(--ft-red)",
      base: 0,
    })),
    { name: "Net", value: Math.max(income - expenses, 0), fill: income >= expenses ? "var(--ft-cyan)" : "var(--ft-red)", base: 0 },
  ];

  const maxVal = Math.max(income, expenses, 1);

  return (
    <div style={{ padding: "12px 0 4px" }}>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -4 }}>
          <XAxis
            dataKey="name"
            tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
            tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
            axisLine={false}
            tickLine={false}
            width={36}
            domain={[0, maxVal * 1.1]}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const val = payload[0]?.value as number;
              return (
                <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 10 }}>
                  <div style={{ color: "var(--ft-dim)", fontSize: 9, marginBottom: 3 }}>{label}</div>
                  <div className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700 }}>{formatGbp(val)}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 0, 0, 0]} maxBarSize={32}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} opacity={0.85} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── category sparkline row ───────────────────────────────────────────────────

interface CategorySparklineRowProps {
  cat: string;
  amount: number;
  i: number;
  totalExpenses: number;
  sparkVals: number[];
  last3Months: Array<{ month: string }>;
}

function CategorySparklineRow({ cat, amount, i, totalExpenses, sparkVals, last3Months }: CategorySparklineRowProps) {
  const [hov, setHov] = useState(false);
  const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
  const color = PALETTE[i % PALETTE.length];
  const sparkMax = Math.max(...sparkVals, 1);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        marginBottom: 10,
        padding: "4px 2px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        borderRadius: 2,
      }}
    >
      <HStack align="center" justify="between" marginBottom={3}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{cat}</span>
        <HStack gap={10} align="center">
          {sparkVals.length > 0 && (
            <HStack gap={2} align="end" height={16}>
              {sparkVals.map((v, si) => (
                <div key={si} title={`${last3Months[si]?.month ?? ""}: ${formatGbp(v)}`}
                  style={{ width: 5, height: sparkMax > 0 ? `${Math.max(2, (v / sparkMax) * 16)}px` : "2px", background: color, opacity: 0.5 + (si / sparkVals.length) * 0.5, borderRadius: 1 }}
                />
              ))}
            </HStack>
          )}
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>{pct.toFixed(1)}%</span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color }}> −{formatGbp(amount)}</span>
        </HStack>
      </HStack>
      <div style={{ height: 3, background: "var(--ft-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.25s ease" }} />
      </div>
    </div>
  );
}

// ─── DOW bar item ─────────────────────────────────────────────────────────────

interface DowBarItemProps {
  label: string;
  val: number;
  dowMax: number;
  isWeekend: boolean;
  isHighest: boolean;
}

function DowBarItem({ label, val, dowMax, isWeekend, isHighest }: DowBarItemProps) {
  const [hov, setHov] = useState(false);
  const barHeight = dowMax > 0 ? Math.max(4, (val / dowMax) * 64) : 4;
  const barColor = isWeekend ? "var(--ft-amber)" : "var(--ft-accent)";
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "4px 2px",
        borderRadius: 2,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 2, opacity: val > 0 ? 1 : 0.4 }}>
        {formatGbp(val)}
      </div>
      <HStack align="end" justify="center" wide height={64}>
        <div style={{ width: "70%", height: barHeight, background: isHighest ? barColor : `${barColor}99`, borderRadius: "2px 2px 0 0" }} />
      </HStack>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: isHighest ? 700 : 400, color: isHighest ? barColor : "var(--ft-muted)", letterSpacing: "0.04em" }}>
        {label}
      </div>
    </div>
  );
}

// ─── biggest transaction row ──────────────────────────────────────────────────

interface BiggestTxRowProps {
  tx: {
    id: string | number;
    date: string;
    description: string;
    category: string;
    type: string;
    gbpValue: number;
  };
  rowIdx: number;
}

function BiggestTxRow({ tx, rowIdx }: BiggestTxRowProps) {
  const [hov, setHov] = useState(false);
  const typeColor = tx.type === "income" ? "var(--ft-green)" : tx.type === "expense" ? "var(--ft-red)" : "var(--ft-blue)";
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : rowIdx % 2 === 0 ? "var(--ft-surface)" : "var(--ft-base)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)", fontSize: 11, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
        {formatDate(tx.date)}
      </div>
      <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-text)", fontSize: 12, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tx.description}
      </div>
      <div style={{ width: 130, minWidth: 130, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)" }}>
          {tx.category}
        </span>
      </div>
      <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "1px 6px", borderRadius: 2, background: typeColor + "22", color: typeColor, textTransform: "uppercase" as const, letterSpacing: "0.3px" }}>
          {tx.type}
        </span>
      </div>
      <div style={{ width: 140, minWidth: 140, padding: "7px 12px", textAlign: "right", color: typeColor, fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
        <span className="pnum">
          {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
          {formatGbp(Math.abs(tx.gbpValue))}
        </span>
      </div>
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTile {
  label: string;
  value: string;
  color: string;
  delta: number | null;
  deltaFmt: (d: number) => string;
  deltaGoodDir: number;
}

interface KpiTileProps {
  tile: KpiTile;
  isLoading: boolean;
}

function KpiTileCell({ tile, isLoading }: KpiTileProps) {
  return (
    <div
      style={{
        background: "var(--ft-surface)",
        borderTop: `2px solid ${tile.color}`,
        padding: "10px 14px",
        minWidth: 0,
      }}
    >
      <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>{tile.label}</div>
      {isLoading ? (
        <div style={{ height: 24, width: 80, background: "var(--ft-raised)", borderRadius: 2 }} />
      ) : (
        <>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: tile.color, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {tile.value}
          </div>
          {tile.delta !== null && (
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginTop: 4, color: (tile.delta * tile.deltaGoodDir) >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
              {tile.deltaFmt(tile.delta)} vs prior
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Reports() {
  usePrintStyles();
  const isMobile = useIsMobile();

  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [activeQuick, setActiveQuick] = useState("This month");
  const [reportType, setReportType] = useState<ReportTypeId>("income-statement");
  const [selectedTaxYear, setSelectedTaxYear] = useState<number>(TAX_YEARS[0] ?? CURRENT_YEAR - 1);
  const [taxYearDownloading, setTaxYearDownloading] = useState(false);
  const [taxYearError, setTaxYearError] = useState<string | null>(null);

  const handleTaxYearDownload = async () => {
    setTaxYearDownloading(true);
    setTaxYearError(null);
    try {
      await downloadTaxYearCsv(selectedTaxYear);
    } catch (err: unknown) {
      setTaxYearError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setTaxYearDownloading(false);
    }
  };

  const applyQuick = (qr: typeof QUICK_RANGES[number]) => {
    const { from, to } = qr.getRange();
    setDateFrom(from);
    setDateTo(to);
    setActiveQuick(qr.label);
  };

  const apiParams = useMemo(() => {
    const p: { dateFrom?: string; dateTo?: string } = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [dateFrom, dateTo]);

  const priorApiParams = useMemo((): { dateFrom?: string; dateTo?: string } | null => {
    if (!dateFrom || !dateTo) return null;
    const DAY = 24 * 60 * 60 * 1000;
    const fromMs = new Date(dateFrom).getTime();
    const toMs = new Date(dateTo).getTime();
    const spanMs = toMs - fromMs + DAY;
    const priorTo = new Date(fromMs - DAY);
    const priorFrom = new Date(priorTo.getTime() - spanMs + DAY);
    return {
      dateFrom: priorFrom.toISOString().slice(0, 10),
      dateTo: priorTo.toISOString().slice(0, 10),
    };
  }, [dateFrom, dateTo]);

  const { data: transactions, isLoading } = useListTransactions(apiParams);
  const { data: priorTxData } = useListTransactions(priorApiParams ?? {});
  const { data: dashboard } = useGetDashboard();

  const { income, expenses, txList } = useMemo(() => {
    const list = transactions ?? [];
    let inc = 0;
    let exp = 0;
    for (const tx of list) {
      if (tx.type === "income") inc += tx.gbpValue;
      else if (tx.type === "expense") exp += tx.gbpValue;
    }
    return { income: inc, expenses: exp, txList: list };
  }, [transactions]);

  const { priorIncome, priorExpenses } = useMemo(() => {
    if (!priorApiParams) return { priorIncome: null, priorExpenses: null };
    const list = priorTxData ?? [];
    let inc = 0, exp = 0;
    for (const tx of list) {
      if (tx.type === "income") inc += tx.gbpValue;
      else if (tx.type === "expense") exp += tx.gbpValue;
    }
    return { priorIncome: inc, priorExpenses: exp };
  }, [priorTxData, priorApiParams]);

  const netSavings = income - expenses;
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : null;
  const priorSavingsRate = priorIncome !== null && priorIncome > 0
    ? ((priorIncome - (priorExpenses ?? 0)) / priorIncome) * 100
    : null;

  const topCategories = useMemo(() => {
    const expenseTxs = txList.filter((tx) => tx.type === "expense");
    const totals: Record<string, number> = {};
    for (const tx of expenseTxs) {
      const cat = tx.category || "Other";
      totals[cat] = (totals[cat] ?? 0) + tx.gbpValue;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [txList]);

  const totalExpenses = topCategories.reduce((s, [, v]) => s + v, 0);

  const monthlyHistory = useMemo(() => {
    const all = dashboard?.monthlyHistory ?? [];
    if (!dateFrom && !dateTo) return all;
    return all.filter((m) => {
      if (dateFrom && m.month < dateFrom.slice(0, 7)) return false;
      if (dateTo && m.month > dateTo.slice(0, 7)) return false;
      return true;
    });
  }, [dashboard, dateFrom, dateTo]);

  const biggestTxs = useMemo(() => {
    return [...txList].sort((a, b) => b.gbpValue - a.gbpValue).slice(0, 10);
  }, [txList]);

  const kpiTiles: KpiTile[] = [
    {
      label: "Total Income",
      value: `+${formatGbp(income)}`,
      color: income > 0 ? "var(--ft-green)" : "var(--ft-muted)",
      delta: priorIncome !== null ? income - priorIncome : null,
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${formatGbp(Math.abs(d))}`,
      deltaGoodDir: 1,
    },
    {
      label: "Total Expenses",
      value: `-${formatGbp(expenses)}`,
      color: expenses > 0 ? "var(--ft-red)" : "var(--ft-muted)",
      delta: priorExpenses !== null ? expenses - priorExpenses : null,
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${formatGbp(Math.abs(d))} spend`,
      deltaGoodDir: -1,
    },
    {
      label: "Net Savings",
      value: `${netSavings >= 0 ? "+" : ""}${formatGbp(netSavings)}`,
      color: netSavings !== 0 ? (netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)",
      delta: priorIncome !== null && priorExpenses !== null ? netSavings - (priorIncome - priorExpenses) : null,
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${formatGbp(Math.abs(d))}`,
      deltaGoodDir: 1,
    },
    {
      label: "Savings Rate",
      value: savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "—",
      color: savingsRate !== null && savingsRate >= 20
        ? "var(--ft-green)"
        : savingsRate !== null && savingsRate >= 0
          ? "var(--ft-amber)"
          : "var(--ft-red)",
      delta: priorSavingsRate !== null && savingsRate !== null ? savingsRate - priorSavingsRate : null,
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`,
      deltaGoodDir: 1,
    },
    {
      label: "Transactions",
      value: String(txList.length),
      color: "var(--ft-text)",
      delta: null,
      deltaFmt: (d: number) => `${d >= 0 ? "+" : ""}${d}`,
      deltaGoodDir: 1,
    },
  ];

  const trendChartData = useMemo(() => {
    return monthlyHistory.map((m) => ({
      month: formatMonthAbbr(m.month),
      income: m.income,
      expenses: m.expenses,
      net: m.netSavings,
    }));
  }, [monthlyHistory]);

  const donutData = useMemo(() => [
    { name: "Income", value: income },
    { name: "Expenses", value: expenses },
  ], [income, expenses]);

  const dowSpend = useMemo(() => {
    const sums = [0, 0, 0, 0, 0, 0, 0];
    for (const tx of txList) {
      if (tx.type !== "expense") continue;
      const d = new Date(tx.date);
      let dow = d.getDay();
      dow = dow === 0 ? 6 : dow - 1;
      sums[dow] += tx.gbpValue;
    }
    return sums;
  }, [txList]);

  const dowMax = Math.max(...dowSpend, 1);
  const dowHighestIdx = dowSpend.indexOf(Math.max(...dowSpend));

  const last3Months = useMemo(() => {
    const all = dashboard?.monthlyHistory ?? [];
    return all.slice(-3);
  }, [dashboard]);

  const categorySparklines = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const [cat] of topCategories) {
      result[cat] = last3Months.map((m) => {
        let sum = 0;
        for (const tx of txList) {
          if (tx.type !== "expense") continue;
          if ((tx.category || "Other") !== cat) continue;
          if (tx.date.slice(0, 7) !== m.month) continue;
          sum += tx.gbpValue;
        }
        return sum;
      });
    }
    return result;
  }, [topCategories, last3Months, txList]);

  const currentReportLabel = REPORT_TYPES.find((r) => r.id === reportType)?.label ?? "Report";

  return (
    <div id="ft-reports-root" style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ── */}
      <div className="ft-page-header ft-no-print" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "10px 16px" : "12px 20px",
        borderBottom: "1px solid var(--ft-border)",
        background: "var(--ft-surface)",
        flexWrap: isMobile ? "nowrap" : "wrap",
        gap: 8,
      }}>
        <HStack gap={12} align="baseline" shrink={false} minWidth0>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ft-text)", flexShrink: 0 }}>
            REPORTS
          </span>
          {!isMobile && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              income · expenses · trends
            </span>
          )}
        </HStack>
        <div className="ft-filter-bar" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", minWidth: 0, flex: isMobile ? "1 1 0" : "none" }}>
          {/* Quick range buttons — scrollable on mobile */}
          <div style={{ display: "flex", gap: 2, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", flexShrink: 0 }}>
            {QUICK_RANGES.map((qr) => (
              <button
                key={qr.label}
                onClick={() => applyQuick(qr)}
                style={{
                  padding: isMobile ? "4px 7px" : "3px 8px",
                  minHeight: isMobile ? 32 : undefined,
                  fontSize: isMobile ? 9 : 10,
                  fontFamily: "var(--font-mono)",
                  background: activeQuick === qr.label ? "var(--ft-raised)" : "transparent",
                  color: activeQuick === qr.label ? "var(--ft-text)" : "var(--ft-dim)",
                  border: activeQuick === qr.label ? "1px solid var(--ft-border2)" : "1px solid var(--ft-border)",
                  borderRadius: 2,
                  cursor: "pointer",
                  fontWeight: activeQuick === qr.label ? 700 : 400,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {qr.label}
              </button>
            ))}
          </div>
          {!isMobile && <div style={{ width: 1, height: 20, background: "var(--ft-border2)", margin: "0 2px" }} />}
          {/* Custom date range — hidden on mobile to save space */}
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Text as="span" mono size={10} color="var(--ft-dim)">From</Text>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setActiveQuick("Custom"); }}
                style={{ height: 26, padding: "0 6px", fontSize: 11, fontFamily: "var(--font-mono)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", outline: "none" }}
              />
              <Text as="span" mono size={10} color="var(--ft-dim)">To</Text>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setActiveQuick("Custom"); }}
                style={{ height: 26, padding: "0 6px", fontSize: 11, fontFamily: "var(--font-mono)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", outline: "none" }}
              />
            </div>
          )}
          {!isMobile && <div style={{ width: 1, height: 20, background: "var(--ft-border2)", margin: "0 2px" }} />}
          <button
            onClick={() => exportCsv(txList as CsvRow[], currentReportLabel)}
            title="Export transactions to CSV"
            style={{ background: "var(--ft-raised)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", borderRadius: 2, fontSize: 11, fontFamily: "var(--font-mono)", padding: isMobile ? "6px 10px" : "4px 10px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            ↓ CSV
          </button>
          {!isMobile && (
            <button
              onClick={() => window.print()}
              title="Print / save as PDF"
              style={{ background: "var(--ft-raised)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", borderRadius: 2, fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 10px", cursor: "pointer" }}
            >
              ⎙ Print
            </button>
          )}
        </div>
      </div>

      {/* ── Report type selector ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--ft-border)",
        background: "var(--ft-surface)",
        padding: "0 20px",
        gap: 0,
        overflowX: "auto",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch" as const,
      } as React.CSSProperties}>
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.id}
            onClick={() => setReportType(rt.id)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: reportType === rt.id ? 700 : 400,
              color: reportType === rt.id ? "var(--ft-text)" : "var(--ft-dim)",
              background: "none",
              border: "none",
              borderBottom: reportType === rt.id ? "2px solid var(--ft-accent)" : "2px solid transparent",
              padding: "10px 16px 9px",
              cursor: "pointer",
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap" as const,
              flexShrink: 0,
            }}
            tabIndex={0}
            aria-selected={reportType === rt.id}
            role="tab"
          >
            {rt.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", padding: "0 0 0 16px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : dateFrom ? `from ${dateFrom}` : "All time"}
        </div>
      </div>

      {/* ── Persona context strip ── */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const sr = savingsRate;
        const msgs: Record<string, string> = {
          market: sr !== null ? `Savings rate ${sr.toFixed(1)}% — surplus beyond expenses is your investable capital.` : `Track income vs expenses to identify your investment contribution capacity.`,
          budget: `Run this report monthly to spot category drift before it erodes your budget targets.`,
          wealth: sr !== null && sr >= 20 ? `${sr.toFixed(1)}% savings rate — on track for wealth accumulation goals. Optimise tax efficiency next.` : `Increase savings rate toward 20%+ to accelerate wealth building trajectory.`,
          social: `Reviewing this period shows how much social / shared spending has impacted your bottom line.`,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* ── KPI summary bar — border-as-gap grid ── */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--ft-border)", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
            gap: 1,
            background: "var(--ft-border)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {kpiTiles.map((tile, i) => {
            const isLastOdd = isMobile && i === kpiTiles.length - 1 && kpiTiles.length % 2 === 1;
            return isLastOdd
              ? <div key={tile.label} style={{ gridColumn: "span 2" }}><KpiTileCell tile={tile} isLoading={isLoading} /></div>
              : <KpiTileCell key={tile.label} tile={tile} isLoading={isLoading} />;
          })}
        </div>

        {/* Donut chart — hidden on mobile to save vertical space */}
        {!isMobile && (
          <div style={{ width: 180, minWidth: 140, borderLeft: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 0", background: "var(--ft-surface)", position: "relative", flexShrink: 0 }}>
            <div style={{ ...SECTION_LABEL, position: "absolute", top: 10, left: 12, marginBottom: 0 }}>I/E Split</div>
            <PieChart width={160} height={130}>
              <Pie data={donutData} cx={78} cy={62} innerRadius={38} outerRadius={54} dataKey="value" strokeWidth={0}>
                <Cell fill="var(--ft-green)" fillOpacity={0.85} />
                <Cell fill="var(--ft-red)" fillOpacity={0.85} />
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none", marginTop: 6 }}>
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: savingsRate !== null && savingsRate >= 20 ? "var(--ft-green)" : savingsRate !== null && savingsRate >= 0 ? "var(--ft-amber)" : "var(--ft-red)", lineHeight: 1 }}>
                {savingsRate !== null ? `${savingsRate.toFixed(0)}%` : "—"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>SAVED</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Report-specific content ── */}
      {reportType === "income-statement" && (
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minWidth: 0 }}>
          <div style={{ borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Income Statement" accentColor="var(--ft-green)" right={<Text as="span" mono size={9} color="var(--ft-dim)">monthly breakdown</Text>} />
            <IncomeStatementTable rows={monthlyHistory} />
          </div>
          <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Monthly Trend" accentColor="var(--ft-accent)" />
            {trendChartData.length > 0 && (
              <div style={{ padding: "10px 8px 0" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={trendChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-red)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--ft-red)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<TrendTooltip />} />
                    <Area type="monotone" dataKey="income" name="Income" stroke="var(--ft-green)" strokeWidth={1.5} fill="url(#incomeGrad)" />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="var(--ft-red)" strokeWidth={1.5} fill="url(#expenseGrad)" />
                    <Line type="monotone" dataKey="net" name="Net" stroke="var(--ft-accent)" strokeWidth={2} dot={false} />
                    {income > 0 && (
                      <ReferenceLine y={income / Math.max(trendChartData.length, 1)} stroke="var(--ft-accent)" strokeDasharray="4 3" strokeWidth={1} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {monthlyHistory.length === 0 && (
              <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>No monthly data available</div>
            )}
          </div>
        </div>
      )}

      {reportType === "expense-report" && (
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minWidth: 0 }}>
          <div style={{ borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Expense Breakdown by Category" accentColor="var(--ft-red)" right={
              <button
                onClick={() => exportCsv(txList.filter((t) => t.type === "expense") as CsvRow[], "Expense Report")}
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "transparent", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", padding: "2px 7px", cursor: "pointer", borderRadius: 2 }}
              >↓ CSV</button>
            } />
            <ExpenseReportTable categories={topCategories} totalExpenses={totalExpenses} />
          </div>
          <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Breakdown Chart" accentColor="var(--ft-amber)" />
            <WaterfallChart income={income} expenses={expenses} categories={topCategories} />
            {/* Category sparklines */}
            <div style={{ padding: "0 16px 16px" }}>
              {topCategories.map(([cat, amount], i) => (
                <CategorySparklineRow
                  key={cat}
                  cat={cat}
                  amount={amount}
                  i={i}
                  totalExpenses={totalExpenses}
                  sparkVals={categorySparklines[cat] ?? []}
                  last3Months={last3Months}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {reportType === "net-worth" && (
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minWidth: 0 }}>
          <div style={{ borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Net Worth Summary" accentColor="var(--ft-cyan)" />
            <NetWorthTable income={income} expenses={expenses} netSavings={netSavings} savingsRate={savingsRate} />
          </div>
          <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Savings Trend" accentColor="var(--ft-cyan)" />
            {trendChartData.length > 0 ? (
              <div style={{ padding: "10px 8px 0" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={trendChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<TrendTooltip />} />
                    <Area type="monotone" dataKey="net" name="Net Savings" stroke="var(--ft-cyan)" strokeWidth={2} fill="var(--ft-cyan)" fillOpacity={0.08} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>No data available</div>
            )}
          </div>
        </div>
      )}

      {reportType === "cash-flow" && (
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minWidth: 0 }}>
          <div style={{ borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Cash Flow Statement" accentColor="var(--ft-blue)" />
            <CashFlowTable rows={monthlyHistory} />
          </div>
          <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
            <SectionHeader title="Cumulative Flow" accentColor="var(--ft-cyan)" />
            {trendChartData.length > 0 ? (
              <div style={{ padding: "10px 8px 0" }}>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={trendChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-cyan)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--ft-cyan)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<TrendTooltip />} />
                    <Area type="monotone" dataKey="income" name="Inflow" stroke="var(--ft-green)" strokeWidth={1.5} fill="url(#incomeGrad)" />
                    <Area type="monotone" dataKey="expenses" name="Outflow" stroke="var(--ft-red)" strokeWidth={1.5} fill="url(#expenseGrad)" />
                    <Line type="monotone" dataKey="net" name="Net" stroke="var(--ft-cyan)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ padding: 20, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>No data available</div>
            )}
          </div>
        </div>
      )}

      {/* ── Spending by day of week ── */}
      <div style={{ borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
        <SectionHeader title="Spending by Day of Week" accentColor="var(--ft-amber)" />
        <div style={{ padding: "14px 20px" }}>
          <HStack gap={8} align="end" height={80}>
            {DOW_LABELS.map((label, i) => (
              <DowBarItem
                key={label}
                label={label}
                val={dowSpend[i]}
                dowMax={dowMax}
                isWeekend={i >= 5}
                isHighest={i === dowHighestIdx && dowSpend[i] > 0}
              />
            ))}
          </HStack>
        </div>
      </div>

      {/* ── Biggest transactions table ── */}
      <div style={{ borderTop: "1px solid var(--ft-border)" }}>
        <SectionHeader title="Biggest Transactions" accentColor="var(--ft-accent)" right={
          <HStack gap={6}>
            <Text as="span" mono size={9} color="var(--ft-dim)">Top 10 by GBP value</Text>
            <button
              onClick={() => exportCsv(biggestTxs as CsvRow[], "Biggest Transactions")}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "transparent", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", padding: "1px 6px", cursor: "pointer", borderRadius: 2 }}
            >↓ CSV</button>
          </HStack>
        } />
        <div className="ft-scroll-x">
          <div style={{ minWidth: 580 }}>
            <HStack>
              {[["Date","100px"],["Description","1"],["Category","130px"],["Type","90px"],["Amount (GBP)","140px"]].map(([h, w]) => (
                <div key={h} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w : undefined, minWidth: w !== "1" ? w : undefined, textAlign: h === "Amount (GBP)" ? "right" : "left", borderRight: "1px solid var(--ft-raised)" }}>
                  {h}
                </div>
              ))}
            </HStack>

            {isLoading ? (
              <div style={{ padding: 20, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>Loading…</div>
            ) : biggestTxs.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>No transactions in this range</div>
            ) : (
              biggestTxs.map((tx, rowIdx) => (
                <BiggestTxRow key={tx.id} tx={tx} rowIdx={rowIdx} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Tax Year Export ── */}
      <div style={{ borderTop: "1px solid var(--ft-border)" }}>
        <SectionHeader title="Tax Year Export" accentColor="var(--ft-amber)" />
        <div className="ft-filter-bar" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, background: "var(--ft-surface)", flexWrap: "wrap" }}>
          <HStack gap={8} align="center">
            <Text as="span" mono size={10} color="var(--ft-dim)" letterSpacing="0.04em">TAX YEAR</Text>
            <select
              value={selectedTaxYear}
              onChange={(e) => { setSelectedTaxYear(Number(e.target.value)); setTaxYearError(null); }}
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", padding: "4px 8px", height: 28, outline: "none", cursor: "pointer" }}
            >
              {TAX_YEARS.map((yr) => <option key={yr} value={yr}>{formatTaxYear(yr)}</option>)}
            </select>
          </HStack>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", padding: "4px 10px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderRadius: 2 }}>
            UK Tax Year: 6 April {selectedTaxYear} – 5 April {selectedTaxYear + 1}
          </div>
          <button
            onClick={handleTaxYearDownload}
            disabled={taxYearDownloading}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", color: taxYearDownloading ? "var(--ft-dim)" : "var(--ft-text)", border: `1px solid ${taxYearDownloading ? "var(--ft-border)" : "var(--ft-border2)"}`, borderRadius: 2, padding: "5px 12px", cursor: taxYearDownloading ? "not-allowed" : "pointer" }}
          >
            {taxYearDownloading ? "Downloading…" : `↓ Download CSV (${formatTaxYear(selectedTaxYear)})`}
          </button>
          {taxYearError && (
            <Text as="span" mono size={11} color="var(--ft-red)">{taxYearError}</Text>
          )}
          <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
            Columns: Date · Description · Amount · Type · Category · Account · Notes
          </div>
        </div>
      </div>
    </div>
  );
}
