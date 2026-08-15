import { useState, useMemo, useCallback } from "react";
import { Home } from "lucide-react";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatGbp } from "@/lib/utils";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoanType = "repayment" | "interest-only";

interface StoredMortgage {
  id: string;
  name: string;
  principal: number;
  annualRate: number;
  termYears: number;
  startDate: string;
  type: LoanType;
  extraMonthly: number;
}

interface AmortizationRow {
  month: number;
  payment: number;
  interestPortion: number;
  principalPortion: number;
  balance: number;
}

interface AddLoanForm {
  name: string;
  principal: string;
  annualRate: string;
  termYears: string;
  startDate: string;
  type: LoanType;
  extraMonthly: string;
}

type TabId = "loans" | "affordability";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ft-mortgages";

function loadMortgages(): StoredMortgage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredMortgage[]) : [];
  } catch {
    return [];
  }
}

function saveMortgages(mortgages: StoredMortgage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mortgages));
}

function monthlyRate(annualRate: number): number {
  return annualRate / 100 / 12;
}

function monthlyPayment(principal: number, annualRate: number, termYears: number, type: LoanType): number {
  if (type === "interest-only") {
    return principal * monthlyRate(annualRate);
  }
  const r = monthlyRate(annualRate);
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function buildAmortization(
  principal: number,
  annualRate: number,
  termYears: number,
  type: LoanType,
  extra: number
): AmortizationRow[] {
  const r = monthlyRate(annualRate);
  const payment = monthlyPayment(principal, annualRate, termYears, type);
  const rows: AmortizationRow[] = [];
  let balance = principal;
  const maxMonths = termYears * 12;

  for (let m = 1; m <= maxMonths; m++) {
    if (balance <= 0.005) break;
    const interest = balance * r;
    let principalPay: number;
    if (type === "interest-only") {
      principalPay = 0;
    } else {
      principalPay = Math.min(payment - interest + extra, balance);
    }
    const actualPayment = interest + principalPay;
    balance = Math.max(0, balance - principalPay);
    rows.push({ month: m, payment: actualPayment, interestPortion: interest, principalPortion: principalPay, balance });
  }
  return rows;
}

function outstandingBalance(mortgage: StoredMortgage): number {
  const start = new Date(mortgage.startDate);
  const now = new Date();
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  );
  const rows = buildAmortization(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type, mortgage.extraMonthly ?? 0);
  if (monthsElapsed >= rows.length) return 0;
  return rows[monthsElapsed]?.balance ?? 0;
}

function monthsRemaining(mortgage: StoredMortgage): number {
  const start = new Date(mortgage.startDate);
  const now = new Date();
  const elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, mortgage.termYears * 12 - elapsed);
}

function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}yr`;
  return `${y}yr ${m}mo`;
}

function addMonthsToDate(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function stampDuty(price: number, firstTimeBuyer: boolean): number {
  if (firstTimeBuyer) {
    if (price <= 425_000) return 0;
    if (price <= 625_000) return (price - 425_000) * 0.05;
    return price * 0 + (125_000 * 0.02) + (250_000 * 0.05) + (price - 375_000) * 0.1;
  }
  let tax = 0;
  if (price > 125_000) tax += Math.min(price - 125_000, 125_000) * 0.02;
  if (price > 250_000) tax += Math.min(price - 250_000, 675_000) * 0.05;
  if (price > 925_000) tax += Math.min(price - 925_000, 575_000) * 0.10;
  if (price > 1_500_000) tax += (price - 1_500_000) * 0.12;
  return tax;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border)",
  color: "var(--ft-text)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "6px 10px",
  outline: "none",
};

const FIELD_STYLE: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

// ─── Section header with left accent bar ─────────────────────────────────────

interface SectionHeaderProps {
  children: React.ReactNode;
  accentColor?: string;
}

function SectionHeader({ children, accentColor = "var(--ft-accent)" }: SectionHeaderProps) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        color: accentColor,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 10,
        borderLeft: `3px solid ${accentColor}`,
        paddingLeft: 8,
        paddingBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

// ─── Amortization helpers ────────────────────────────────────────────────────

interface AmortizationTableProps {
  rows: AmortizationRow[];
  totalInterest: number;
  principal: number;
}

interface YearRow {
  year: number;
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
  endBalance: number;
}

function buildYearRows(rows: AmortizationRow[]): YearRow[] {
  const byYear: Map<number, YearRow> = new Map();
  for (const row of rows) {
    const year = Math.ceil(row.month / 12);
    const existing = byYear.get(year);
    if (existing) {
      existing.totalPayment += row.payment;
      existing.totalInterest += row.interestPortion;
      existing.totalPrincipal += row.principalPortion;
      existing.endBalance = row.balance;
    } else {
      byYear.set(year, {
        year,
        totalPayment: row.payment,
        totalInterest: row.interestPortion,
        totalPrincipal: row.principalPortion,
        endBalance: row.balance,
      });
    }
  }
  return Array.from(byYear.values());
}

// ─── AmortTable sub-rows ─────────────────────────────────────────────────────

interface YearTableRowProps {
  row: YearRow;
}

function YearTableRow({ row }: YearTableRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        cursor: "default",
      }}
    >
      <td style={{ padding: "5px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: hov ? "var(--ft-accent)" : "var(--ft-muted)", fontWeight: hov ? 700 : 400, transition: "color 0.1s" }}>
        Yr {row.year}
      </td>
      <td style={{ padding: "5px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", textAlign: "right" }}>
        <span className="pnum">{formatGbp(row.totalPayment)}</span>
      </td>
      <td style={{ padding: "5px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-red)", textAlign: "right" }}>
        <span className="pnum">{formatGbp(row.totalInterest)}</span>
      </td>
      <td style={{ padding: "5px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-green)", textAlign: "right" }}>
        <span className="pnum">{formatGbp(row.totalPrincipal)}</span>
      </td>
      <td style={{ padding: "5px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", textAlign: "right", fontWeight: 600 }}>
        <span className="pnum">{formatGbp(row.endBalance)}</span>
      </td>
    </tr>
  );
}

interface MonthTableRowProps {
  row: AmortizationRow;
  isGapAbove: boolean;
  totalHidden: number;
}

function MonthTableRow({ row, isGapAbove, totalHidden }: MonthTableRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <>
      {isGapAbove && (
        <tr>
          <td colSpan={5} style={{ textAlign: "center", padding: "4px", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", background: "var(--ft-raised)" }}>
            ··· {totalHidden} months hidden ···
          </td>
        </tr>
      )}
      <tr
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          borderBottom: "1px solid var(--ft-border)",
          background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
          transition: "background 0.1s",
          cursor: "default",
        }}
      >
        <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: hov ? "var(--ft-accent)" : "var(--ft-muted)", fontWeight: hov ? 700 : 400, transition: "color 0.1s" }}>
          {row.month}
        </td>
        <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", textAlign: "right" }}>
          <span className="pnum">{formatGbp(row.payment)}</span>
        </td>
        <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-red)", textAlign: "right" }}>
          <span className="pnum">{formatGbp(row.interestPortion)}</span>
        </td>
        <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-green)", textAlign: "right" }}>
          <span className="pnum">{formatGbp(row.principalPortion)}</span>
        </td>
        <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", textAlign: "right", fontWeight: 600 }}>
          <span className="pnum">{formatGbp(row.balance)}</span>
        </td>
      </tr>
    </>
  );
}

// ─── Amortization Table ───────────────────────────────────────────────────────

function AmortizationTable({ rows, totalInterest, principal }: AmortizationTableProps) {
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("yearly");

  const yearRows = useMemo(() => buildYearRows(rows), [rows]);

  const displayedMonthly = useMemo(() => {
    if (showAll || rows.length <= 24) return rows;
    return [...rows.slice(0, 12), ...rows.slice(-12)];
  }, [rows, showAll]);

  const areaChartData = useMemo(() => {
    const step = Math.max(1, Math.floor(rows.length / 60));
    return rows
      .filter((_, i) => i % step === 0 || i === rows.length - 1)
      .map((r) => ({
        month: `M${r.month}`,
        principal: Math.round(r.principalPortion),
        interest: Math.round(r.interestPortion),
        balance: Math.round(r.balance),
      }));
  }, [rows]);

  const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
  const interestRatio = totalPaid > 0 ? (totalInterest / totalPaid) * 100 : 0;

  const TH_STYLE: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: 9,
    fontFamily: "var(--font-mono)",
    color: "var(--ft-dim)",
    background: "var(--ft-surface)",
    borderBottom: "1px solid var(--ft-border2)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    textAlign: "right",
    whiteSpace: "nowrap",
  };

  const TOGGLE_BTN = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    fontSize: 9,
    fontFamily: "var(--font-mono)",
    background: active ? "var(--ft-accent)" : "var(--ft-raised)",
    border: `1px solid ${active ? "var(--ft-accent)" : "var(--ft-border)"}`,
    color: active ? "var(--ft-base)" : "var(--ft-dim)",
    cursor: "pointer",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  });

  return (
    <div style={{ marginTop: 16 }}>
      {/* Border-as-gap KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", marginBottom: 14 }}>
        <div style={{ background: "var(--ft-surface)", padding: "10px 12px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>Total Repaid</div>
          <Text as="div" mono size={16} weight={700} color="var(--ft-text)" letterSpacing="-0.02em" lineHeight={1}>
            <span className="pnum">{formatGbp(totalPaid)}</span>
          </Text>
        </div>
        <div style={{ background: "var(--ft-surface)", borderLeft: "3px solid var(--ft-red)", padding: "10px 12px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>Total Interest</div>
          <Text as="div" mono size={16} weight={700} color="var(--ft-red)" letterSpacing="-0.02em" lineHeight={1}>
            <span className="pnum">{formatGbp(totalInterest)}</span>
          </Text>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", marginTop: 3 }}>
            <span className="pnum">{interestRatio.toFixed(1)}</span>% of total repaid
          </div>
        </div>
        <div style={{ background: "var(--ft-surface)", borderLeft: "3px solid var(--ft-green)", padding: "10px 12px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>Principal</div>
          <Text as="div" mono size={16} weight={700} color="var(--ft-green)" letterSpacing="-0.02em" lineHeight={1}>
            <span className="pnum">{formatGbp(principal)}</span>
          </Text>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", marginTop: 3 }}>
            <span className="pnum">{(100 - interestRatio).toFixed(1)}</span>% of total repaid
          </div>
        </div>
      </div>

      {/* Principal vs Interest AreaChart */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          Monthly Breakdown — Principal vs. Interest
        </div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="gradPrincipal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradInterest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ft-red)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--ft-red)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--ft-dim)" }} />
              <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--ft-dim)" }} />
              <Tooltip
                contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                formatter={(v: number, name: string) => [formatGbp(v), name === "principal" ? "Principal" : "Interest"]}
              />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono)" }} formatter={(value: string) => value === "principal" ? "Principal" : "Interest"} />
              <Area type="monotone" dataKey="interest" stackId="1" stroke="var(--ft-red)" fill="url(#gradInterest)" strokeWidth={1.5} dot={false} name="interest" />
              <Area type="monotone" dataKey="principal" stackId="1" stroke="var(--ft-green)" fill="url(#gradPrincipal)" strokeWidth={1.5} dot={false} name="principal" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Balance over time line chart */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          Outstanding Balance
        </div>
        <div style={{ height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={areaChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--ft-dim)" }} />
              <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--ft-dim)" }} />
              <Tooltip
                contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                formatter={(v: number) => [formatGbp(v), "Balance"]}
              />
              <Line type="monotone" dataKey="balance" stroke="var(--ft-accent)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table view toggle */}
      <HStack align="center" justify="between" marginBottom={8}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Amortization Schedule</div>
        <HStack gap={0}>
          <button onClick={() => setViewMode("yearly")} style={TOGGLE_BTN(viewMode === "yearly")}>Year</button>
          <button onClick={() => setViewMode("monthly")} style={TOGGLE_BTN(viewMode === "monthly")}>Month</button>
        </HStack>
      </HStack>

      {viewMode === "yearly" ? (
        <div className="ft-scroll-x">
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {["Year", "Total Paid", "Interest", "Principal", "End Balance"].map((h, i) => (
                  <th key={h} style={{ ...TH_STYLE, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearRows.map((row) => (
                <YearTableRow key={row.year} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  {["Month", "Payment", "Interest", "Principal", "Balance"].map((h, i) => (
                    <th key={h} style={{ ...TH_STYLE, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedMonthly.map((row, idx) => {
                  const prevRow = displayedMonthly[idx - 1];
                  const isGapAbove = !showAll && rows.length > 24 && idx === 12 && prevRow != null && prevRow.month !== row.month - 1;
                  return (
                    <MonthTableRow
                      key={row.month}
                      row={row}
                      isGapAbove={isGapAbove}
                      totalHidden={rows.length - 24}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 24 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              style={{ marginTop: 8, background: "none", border: "1px dashed var(--ft-border2)", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 12px", cursor: "pointer", width: "100%" }}
            >
              {showAll ? "Show less" : `Show all ${rows.length} months`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Overpayment Scenario Card ────────────────────────────────────────────────

interface OverpaymentScenarioCardProps {
  label: string;
  months: number;
  interest: number;
  color: string;
}

function OverpaymentScenarioCard({ label, months, interest, color }: OverpaymentScenarioCardProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        padding: "10px 12px",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color, marginBottom: 2 }}>{formatMonths(months)}</div>
      <Text as="div" mono size={10} color="var(--ft-red)">
        <span className="pnum">{formatGbp(interest)}</span> interest
      </Text>
    </div>
  );
}

// ─── Overpayment Impact ───────────────────────────────────────────────────────

interface OverpaymentProps {
  mortgage: StoredMortgage;
}

function OverpaymentImpact({ mortgage }: OverpaymentProps) {
  const [extra, setExtra] = useState(mortgage.extraMonthly ?? 0);

  const standard = useMemo(
    () => buildAmortization(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type, 0),
    [mortgage]
  );
  const overpaid = useMemo(
    () => buildAmortization(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type, extra),
    [mortgage, extra]
  );

  const stdInterest = standard.reduce((s, r) => s + r.interestPortion, 0);
  const ovInterest = overpaid.reduce((s, r) => s + r.interestPortion, 0);
  const monthsSaved = standard.length - overpaid.length;
  const interestSaved = stdInterest - ovInterest;
  const newPayoffDate = addMonthsToDate(mortgage.startDate, overpaid.length);

  const chartData = useMemo(() => {
    const maxLen = Math.max(standard.length, overpaid.length);
    return Array.from({ length: Math.ceil(maxLen / 6) }, (_, i) => {
      const m = i * 6;
      return {
        month: `M${m + 1}`,
        standard: standard[m]?.balance ?? 0,
        overpayment: overpaid[m]?.balance ?? 0,
      };
    });
  }, [standard, overpaid]);

  return (
    <div style={{ marginTop: 16 }}>
      <SectionHeader>Overpayment Impact Calculator</SectionHeader>

      <div style={{ marginBottom: 12 }}>
        <div style={LABEL_STYLE}>Extra monthly payment: <span style={{ color: "var(--ft-accent)" }}><span className="pnum">{formatGbp(extra)}</span></span></div>
        <input
          type="range"
          min={0}
          max={2000}
          step={25}
          value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--ft-accent)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>
          <span>£0</span><span>£2,000</span>
        </div>
      </div>

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <OverpaymentScenarioCard label="Standard" months={standard.length} interest={stdInterest} color="var(--ft-muted)" />
        <OverpaymentScenarioCard label="With Overpayment" months={overpaid.length} interest={ovInterest} color="var(--ft-accent)" />
      </div>

      {/* Border-as-gap savings summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", marginBottom: 14 }}>
        <div style={{ background: "var(--ft-surface)", padding: "10px 14px" }}>
          <div style={LABEL_STYLE}>Months Saved</div>
          <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700, color: monthsSaved > 0 ? "var(--ft-green)" : "var(--ft-dim)" }}>
            {monthsSaved > 0 ? `${monthsSaved}mo` : "—"}
          </div>
        </div>
        <div style={{ background: "var(--ft-surface)", borderLeft: "3px solid var(--ft-green)", padding: "10px 14px" }}>
          <div style={LABEL_STYLE}>Interest Saved</div>
          <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700, color: interestSaved > 0 ? "var(--ft-green)" : "var(--ft-dim)" }}>
            <span className="pnum">{interestSaved > 0 ? formatGbp(interestSaved) : "—"}</span>
          </div>
        </div>
        <div style={{ background: "var(--ft-surface)", padding: "10px 14px" }}>
          <div style={LABEL_STYLE}>New Payoff</div>
          <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ft-text)" }}>{newPayoffDate}</div>
        </div>
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" />
            <XAxis dataKey="month" tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--ft-dim)" }} />
            <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "var(--ft-dim)" }} />
            <Tooltip
              contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11 }}
              formatter={(v: number) => [formatGbp(v)]}
            />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono)" }} />
            <Line type="monotone" dataKey="standard" stroke="var(--ft-muted)" strokeWidth={1.5} dot={false} name="Standard" />
            <Line type="monotone" dataKey="overpayment" stroke="var(--ft-accent)" strokeWidth={1.5} dot={false} name="With Overpayment" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Rate Scenario Card ───────────────────────────────────────────────────────

interface RateScenarioCardProps {
  rate: number;
  delta: number;
  principal: number;
  termYears: number;
  type: LoanType;
}

function RateScenarioCard({ rate, delta, principal, termYears, type }: RateScenarioCardProps) {
  const [hov, setHov] = useState(false);
  const monthly = monthlyPayment(principal, rate, termYears, type);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: delta === 0 ? "var(--ft-raised)" : hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        border: `1px solid ${delta === 0 ? "var(--ft-accent)" : "var(--ft-border)"}`,
        padding: "10px 12px",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: delta === 0 ? "var(--ft-accent)" : "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        <span className="pnum">{rate.toFixed(1)}</span>%{delta > 0 ? ` (+${delta}%)` : ""}
      </div>
      <Text as="div" mono size={13} weight={700} color="var(--ft-text)">
        <span className="pnum">{formatGbp(monthly)}</span>
      </Text>
      <Text as="div" mono size={9} color="var(--ft-dim)">/ month</Text>
    </div>
  );
}

// ─── Rate Scenario Comparison ────────────────────────────────────────────────

interface RateScenariosProps {
  mortgage: StoredMortgage;
}

function RateScenarios({ mortgage }: RateScenariosProps) {
  const [baseRate, setBaseRate] = useState(mortgage.annualRate);
  const scenarios = [0, 0.5, 1, 2];

  return (
    <div style={{ marginTop: 16 }}>
      <SectionHeader accentColor="var(--ft-blue)">Interest Rate Scenarios</SectionHeader>
      <HStack gap={8} align="center" marginBottom={12}>
        <div style={LABEL_STYLE}>Base rate (%)</div>
        <input
          type="number"
          step="0.1"
          min="0"
          value={baseRate}
          onChange={(e) => setBaseRate(Number(e.target.value))}
          style={{ ...INPUT_STYLE, width: 90 }}
        />
      </HStack>
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {scenarios.map((delta) => (
          <RateScenarioCard
            key={delta}
            rate={baseRate + delta}
            delta={delta}
            principal={mortgage.principal}
            termYears={mortgage.termYears}
            type={mortgage.type}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Affordability Result Card ────────────────────────────────────────────────

interface AffordabilityKpiCardProps {
  label: string;
  value: string;
  color: string;
  sub?: string;
  borderColor?: string;
}

function AffordabilityKpiCard({ label, value, color, sub, borderColor }: AffordabilityKpiCardProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        border: `1px solid ${borderColor ?? "var(--ft-border)"}`,
        padding: "10px 14px",
        transition: "background 0.1s",
      }}
    >
      <div style={LABEL_STYLE}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 700, color }}>
        <span className="pnum">{value}</span>
      </div>
      {sub && (
        <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Affordability Tab ────────────────────────────────────────────────────────

function AffordabilityTab() {
  const [annualIncome, setAnnualIncome] = useState("");
  const [deposit, setDeposit] = useState("");
  const [desiredMonthly, setDesiredMonthly] = useState("");
  const [rate, setRate] = useState("4.5");
  const [termYears, setTermYears] = useState("25");
  const [isFtb, setIsFtb] = useState(true);

  const r = parseFloat(rate) / 100 / 12;
  const n = parseFloat(termYears) * 12;
  const monthly = parseFloat(desiredMonthly) || 0;
  const depositVal = parseFloat(deposit) || 0;
  const incomeVal = parseFloat(annualIncome) || 0;

  const maxLoan = useMemo(() => {
    if (!monthly || !r || !n) return 0;
    return (monthly * (1 - Math.pow(1 + r, -n))) / r;
  }, [monthly, r, n]);

  const maxPropertyValue = maxLoan + depositVal;
  const ltv = maxPropertyValue > 0 ? (maxLoan / maxPropertyValue) * 100 : 0;
  const incomeMultiple = incomeVal > 0 ? maxLoan / incomeVal : 0;
  const sdlt = maxPropertyValue > 0 ? stampDuty(maxPropertyValue, isFtb) : 0;
  const totalCost = maxPropertyValue + sdlt;

  const ltvColor = ltv < 60 ? "var(--ft-green)" : ltv < 75 ? "var(--ft-accent)" : ltv < 90 ? "var(--ft-amber)" : "var(--ft-red)";
  const ltvLabel = ltv < 60 ? "Excellent (best rates)" : ltv < 75 ? "Good" : ltv < 90 ? "Standard" : "High risk";

  return (
    <div>
      <SectionHeader>Affordability Calculator</SectionHeader>
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={FIELD_STYLE}>
          <div style={LABEL_STYLE}>Annual income (£)</div>
          <input type="number" placeholder="e.g. 60000" value={annualIncome} onChange={(e) => setAnnualIncome(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div style={FIELD_STYLE}>
          <div style={LABEL_STYLE}>Deposit (£)</div>
          <input type="number" placeholder="e.g. 50000" value={deposit} onChange={(e) => setDeposit(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div style={FIELD_STYLE}>
          <div style={LABEL_STYLE}>Desired monthly payment (£)</div>
          <input type="number" placeholder="e.g. 1200" value={desiredMonthly} onChange={(e) => setDesiredMonthly(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div style={FIELD_STYLE}>
          <div style={LABEL_STYLE}>Interest rate (%)</div>
          <input type="number" step="0.1" placeholder="4.5" value={rate} onChange={(e) => setRate(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div style={FIELD_STYLE}>
          <div style={LABEL_STYLE}>Term (years)</div>
          <input type="number" placeholder="25" value={termYears} onChange={(e) => setTermYears(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div style={FIELD_STYLE}>
          <div style={LABEL_STYLE}>Buyer type</div>
          <HStack gap={0}>
            {[{ label: "First-time buyer", value: true }, { label: "Other", value: false }].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setIsFtb(value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  background: isFtb === value ? "var(--ft-accent)" : "var(--ft-raised)",
                  border: `1px solid ${isFtb === value ? "var(--ft-accent)" : "var(--ft-border)"}`,
                  color: isFtb === value ? "var(--ft-base)" : "var(--ft-dim)",
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s, border-color 0.1s",
                }}
              >
                {label}
              </button>
            ))}
          </HStack>
        </div>
      </div>

      {maxLoan > 0 && (
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <AffordabilityKpiCard label="Max Loan" value={formatGbp(maxLoan)} color="var(--ft-text)" />
          <AffordabilityKpiCard label="Max Property Value" value={formatGbp(maxPropertyValue)} color="var(--ft-accent)" />
          <AffordabilityKpiCard label="Stamp Duty" value={formatGbp(sdlt)} color="var(--ft-amber)" />
          <AffordabilityKpiCard label="Total Cost" value={formatGbp(totalCost)} color="var(--ft-text)" />
          <AffordabilityKpiCard
            label="LTV"
            value={`${ltv.toFixed(1)}%`}
            color={ltvColor}
            sub={ltvLabel}
            borderColor={ltvColor}
          />
          <AffordabilityKpiCard
            label="Income Multiple"
            value={incomeMultiple > 0 ? `${incomeMultiple.toFixed(1)}x` : "—"}
            color={incomeMultiple <= 4.5 ? "var(--ft-green)" : "var(--ft-red)"}
            sub={incomeMultiple <= 4.5 ? "Within typical lender limit" : "Above 4.5x — harder to borrow"}
          />
        </div>
      )}
    </div>
  );
}

// ─── Page KPI Strip ──────────────────────────────────────────────────────────

interface PageKpiStripProps {
  mortgages: StoredMortgage[];
}

function PageKpiStrip({ mortgages }: PageKpiStripProps) {
  const items = useMemo(() => {
    if (mortgages.length === 0) return null;

    const totalMonthly = mortgages.reduce((s, m) => s + monthlyPayment(m.principal, m.annualRate, m.termYears, m.type), 0);
    const totalOutstanding = mortgages.reduce((s, m) => s + outstandingBalance(m), 0);
    const totalPrincipal = mortgages.reduce((s, m) => s + m.principal, 0);
    const totalInterest = mortgages.reduce((s, m) => {
      const rows = buildAmortization(m.principal, m.annualRate, m.termYears, m.type, m.extraMonthly ?? 0);
      return s + rows.reduce((si, r) => si + r.interestPortion, 0);
    }, 0);
    const avgLtv = totalPrincipal > 0 ? (totalOutstanding / totalPrincipal) * 100 : 0;
    const shortestRemaining = Math.min(...mortgages.map((m) => monthsRemaining(m)));

    return { totalMonthly, totalOutstanding, totalInterest, avgLtv, shortestRemaining };
  }, [mortgages]);

  if (!items) return null;

  const ltvColor = items.avgLtv < 60 ? "var(--ft-green)" : items.avgLtv < 75 ? "var(--ft-accent)" : items.avgLtv < 90 ? "var(--ft-amber)" : "var(--ft-red)";

  const kpis = [
    { label: "Monthly Payment", value: formatGbp(items.totalMonthly), color: "var(--ft-amber)", accent: "var(--ft-amber)" },
    { label: "Total Interest", value: formatGbp(items.totalInterest), color: "var(--ft-red)", accent: "var(--ft-red)" },
    { label: "LTV", value: `${items.avgLtv.toFixed(1)}%`, color: ltvColor, accent: ltvColor },
    { label: "Remaining Term", value: formatMonths(items.shortestRemaining), color: "var(--ft-muted)", accent: "var(--ft-border)" },
  ];

  return (
    <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--ft-border)", marginBottom: 16 }}>
      {kpis.map(({ label, value, color, accent }) => (
        <div
          key={label}
          style={{
            padding: "12px 16px",
            background: "var(--ft-surface)",
            borderLeft: `3px solid ${accent}`,
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.025em" }}>
            <span className="pnum">{value}</span>
          </div>
          {label === "Monthly Payment" && mortgages.length > 1 && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>{mortgages.length} loans combined</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Loan Card ────────────────────────────────────────────────────────────────

interface LoanCardProps {
  mortgage: StoredMortgage;
  onDelete: (id: string) => void;
}

function LoanCard({ mortgage, onDelete }: LoanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const balance = useMemo(() => outstandingBalance(mortgage), [mortgage]);
  const remaining = useMemo(() => monthsRemaining(mortgage), [mortgage]);
  const monthly = monthlyPayment(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type);

  const allRows = useMemo(
    () => buildAmortization(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type, mortgage.extraMonthly ?? 0),
    [mortgage]
  );
  const rows = useMemo(() => (expanded ? allRows : []), [allRows, expanded]);
  const totalInterest = useMemo(() => allRows.reduce((s, r) => s + r.interestPortion, 0), [allRows]);

  const ltv = mortgage.principal > 0 ? (balance / mortgage.principal) * 100 : 0;
  const ltvColor = ltv < 60 ? "var(--ft-green)" : ltv < 75 ? "var(--ft-accent)" : ltv < 90 ? "var(--ft-amber)" : "var(--ft-red)";

  const totalMonths = mortgage.termYears * 12;
  const elapsedMonths = Math.max(0, totalMonths - remaining);
  const termProgressPct = totalMonths > 0 ? (elapsedMonths / totalMonths) * 100 : 0;

  return (
    <div style={{ border: "1px solid var(--ft-border)", borderLeft: `3px solid ${ltvColor}`, background: "var(--ft-surface)", marginBottom: 8 }}>
      <HStack gap={16} align="start" padding="14px 16px">
        <div style={{ flex: 1 }}>
          <HStack gap={8} align="center" marginBottom={12}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{mortgage.name}</span>
            <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {mortgage.type === "repayment" ? "Repayment" : "Interest-only"}
            </span>
            <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 2, background: "var(--ft-raised)", color: ltvColor, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", border: `1px solid ${ltvColor}33` }}>
              LTV <span className="pnum">{ltv.toFixed(1)}</span>%
            </span>
          </HStack>
          {/* Hero stats row */}
          <HStack gap={24} align="end" wrap marginBottom={14}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Monthly Payment</div>
              <Text as="div" mono size={28} weight={700} color="var(--ft-amber)" letterSpacing="-0.025em" lineHeight={1}>
                <span className="pnum">{formatGbp(monthly)}</span>
              </Text>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Outstanding</div>
              <Text as="div" mono size={18} weight={700} color="var(--ft-text)" letterSpacing="-0.02em" lineHeight={1}>
                <span className="pnum">{formatGbp(balance)}</span>
              </Text>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Total Interest</div>
              <Text as="div" mono size={18} weight={700} color="var(--ft-red)" letterSpacing="-0.02em" lineHeight={1}>
                <span className="pnum">{formatGbp(totalInterest)}</span>
              </Text>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Rate</div>
              <Text as="div" mono size={18} weight={700} color="var(--ft-muted)" lineHeight={1}>
                <span className="pnum">{mortgage.annualRate}</span>%
              </Text>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4 }}>Remaining</div>
              <Text as="div" mono size={18} weight={700} color="var(--ft-muted)" lineHeight={1}>
                {formatMonths(remaining)}
              </Text>
            </div>
          </HStack>
          {/* LTV progress bar */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, letterSpacing: "0.06em" }}>
              <span>LTV — <span style={{ color: ltvColor, fontWeight: 700 }}><span className="pnum">{ltv.toFixed(1)}</span>%</span></span>
              <span style={{ color: "var(--ft-dim)" }}>Principal: <span className="pnum">{formatGbp(mortgage.principal)}</span></span>
            </div>
            <div style={{ height: 5, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, ltv)}%`, background: ltvColor, transition: "width 0.25s ease" }} />
            </div>
          </div>
          {/* Term progress bar */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, letterSpacing: "0.06em" }}>
              <span>Term — <span style={{ color: "var(--ft-cyan)", fontWeight: 700 }}><span className="pnum">{termProgressPct.toFixed(1)}</span>% elapsed</span></span>
              <span style={{ color: "var(--ft-dim)" }}>{formatMonths(elapsedMonths)} of {mortgage.termYears}yr</span>
            </div>
            <div style={{ height: 5, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, termProgressPct)}%`, background: "var(--ft-cyan)", transition: "width 0.25s ease" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", cursor: "pointer" }}
          >
            {expanded ? "▲ Hide" : "▼ Details"}
          </button>
          <button
            onClick={() => {
              if (deleteConfirm) { onDelete(mortgage.id); }
              else { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 3000); }
            }}
            style={{
              background: deleteConfirm ? "var(--ft-red)" : "none",
              border: `1px solid ${deleteConfirm ? "var(--ft-red)" : "var(--ft-border)"}`,
              color: deleteConfirm ? "#fff" : "var(--ft-red)",
              fontFamily: "var(--font-mono)",
              fontSize: deleteConfirm ? 8 : 9,
              fontWeight: deleteConfirm ? 700 : undefined,
              padding: "4px 8px",
              cursor: "pointer",
              borderRadius: 2,
            }}
            title={deleteConfirm ? "Click again to confirm delete" : `Delete "${mortgage.name}"`}
          >
            {deleteConfirm ? "DEL?" : "×"}
          </button>
        </div>
      </HStack>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--ft-border)", padding: "12px 14px" }}>
          <AmortizationTable rows={rows} totalInterest={totalInterest} principal={mortgage.principal} />
          <OverpaymentImpact mortgage={mortgage} />
          <RateScenarios mortgage={mortgage} />
        </div>
      )}
    </div>
  );
}

// ─── Add Loan Form ────────────────────────────────────────────────────────────

function makeEmptyLoanForm(): AddLoanForm {
  return {
    name: "",
    principal: "",
    annualRate: "",
    termYears: "",
    startDate: new Date().toISOString().slice(0, 10),
    type: "repayment",
    extraMonthly: "",
  };
}

interface AddLoanFormPanelProps {
  onAdd: (mortgage: StoredMortgage) => void;
  onCancel: () => void;
}

function AddLoanFormPanel({ onAdd, onCancel }: AddLoanFormPanelProps) {
  const [form, setForm] = useState<AddLoanForm>(makeEmptyLoanForm);

  const setField = useCallback(<K extends keyof AddLoanForm>(k: K, v: AddLoanForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mortgage: StoredMortgage = {
      id: `${Date.now()}`,
      name: form.name,
      principal: parseFloat(form.principal),
      annualRate: parseFloat(form.annualRate),
      termYears: parseInt(form.termYears, 10),
      startDate: form.startDate,
      type: form.type,
      extraMonthly: form.extraMonthly ? parseFloat(form.extraMonthly) : 0,
    };
    onAdd(mortgage);
    setForm(makeEmptyLoanForm());
  };

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "14px 16px", marginBottom: 16 }}>
      <SectionHeader>Add Loan / Mortgage</SectionHeader>
      <form onSubmit={handleSubmit}>
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ ...FIELD_STYLE, gridColumn: "1 / -1" }}>
            <div style={LABEL_STYLE}>Name</div>
            <input type="text" required placeholder="e.g. Home mortgage" value={form.name} onChange={(e) => setField("name", e.target.value)} style={INPUT_STYLE} />
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Principal (£)</div>
            <input type="number" required step="0.01" min="1" placeholder="250000" value={form.principal} onChange={(e) => setField("principal", e.target.value)} style={INPUT_STYLE} />
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Annual rate (%)</div>
            <input type="number" required step="0.01" min="0" placeholder="4.5" value={form.annualRate} onChange={(e) => setField("annualRate", e.target.value)} style={INPUT_STYLE} />
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Term (years)</div>
            <input type="number" required min="1" max="40" placeholder="25" value={form.termYears} onChange={(e) => setField("termYears", e.target.value)} style={INPUT_STYLE} />
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Start date</div>
            <input type="date" required value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} style={INPUT_STYLE} />
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Type</div>
            <HStack gap={0}>
              {(["repayment", "interest-only"] as LoanType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField("type", t)}
                  style={{
                    flex: 1,
                    padding: "6px 4px",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    background: form.type === t ? "var(--ft-accent)" : "var(--ft-raised)",
                    border: `1px solid ${form.type === t ? "var(--ft-accent)" : "var(--ft-border)"}`,
                    color: form.type === t ? "var(--ft-base)" : "var(--ft-dim)",
                    cursor: "pointer",
                    transition: "background 0.1s, color 0.1s, border-color 0.1s",
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </HStack>
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Extra monthly (£, optional)</div>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={form.extraMonthly} onChange={(e) => setField("extraMonthly", e.target.value)} style={INPUT_STYLE} />
          </div>
        </div>
        <HStack gap={8} justify="end">
          <button type="button" onClick={onCancel} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Cancel
          </button>
          <button type="submit" style={{ background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "6px 18px", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Add Loan
          </button>
        </HStack>
      </form>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MortgagePage() {
  const [mortgages, setMortgages] = useState<StoredMortgage[]>(() => loadMortgages());
  const [activeTab, setActiveTab] = useState<TabId>("loans");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = (m: StoredMortgage) => {
    const updated = [...mortgages, m];
    setMortgages(updated);
    saveMortgages(updated);
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    const updated = mortgages.filter((m) => m.id !== id);
    setMortgages(updated);
    saveMortgages(updated);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <PageHeader
        icon={Home}
        title="MORTGAGE & LOANS"
        subtitle="Repayment schedules · overpayment impact · affordability"
        actions={activeTab === "loans" && !showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            + Add Loan
          </button>
        ) : undefined}
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const msgs: Record<string, string | null> = {
          wealth:  "Track all mortgage balances here — the outstanding principal is a liability that reduces your true net worth. Overpaying reduces total interest paid and accelerates equity.",
          budget:  "Monthly mortgage payments are typically your largest fixed cost. Use the Affordability tab to stress-test repayments at different rates before committing.",
          market:  null,
          social:  null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--ft-border)", marginBottom: 16 }}>
        {(["loans", "affordability"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab ? "var(--ft-accent)" : "transparent"}`,
              color: activeTab === tab ? "var(--ft-accent)" : "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "8px 16px",
              cursor: "pointer",
              transition: "color 0.1s",
            }}
          >
            {tab === "loans" ? "My Loans" : "Affordability"}
          </button>
        ))}
      </div>

      {activeTab === "loans" && (
        <div>
          {showAddForm && (
            <AddLoanFormPanel onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
          )}

          {mortgages.length === 0 && !showAddForm && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 16, textAlign: "center", minHeight: "calc(100vh - 160px)" }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.25 }}>
                <rect x="6" y="20" width="36" height="22" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 22L24 6L46 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="18" y="30" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em" }}>NO LOANS TRACKED</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.7, maxWidth: 280 }}>
                Add a mortgage or loan to track repayments, model overpayments, and calculate total interest cost.
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "12px 24px", cursor: "pointer", marginTop: 4 }}
              >
                + ADD LOAN
              </button>
            </div>
          )}

          {mortgages.length > 0 && !showAddForm && (
            <PageKpiStrip mortgages={mortgages} />
          )}

          {mortgages.map((m) => (
            <LoanCard key={m.id} mortgage={m} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {activeTab === "affordability" && <AffordabilityTab />}
    </div>
  );
}
