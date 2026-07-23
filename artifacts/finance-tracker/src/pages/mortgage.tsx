import { useState, useMemo, useCallback } from "react";
import {
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
    // Above £625k FTB relief no longer applies
    return price * 0 + (125_000 * 0.02) + (250_000 * 0.05) + (price - 375_000) * 0.1;
  }
  let tax = 0;
  if (price > 125_000) tax += Math.min(price - 125_000, 125_000) * 0.02;
  if (price > 250_000) tax += Math.min(price - 250_000, 675_000) * 0.05;
  if (price > 925_000) tax += Math.min(price - 925_000, 575_000) * 0.10;
  if (price > 1_500_000) tax += (price - 1_500_000) * 0.12;
  return tax;
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

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

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--ft-accent)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 10,
  borderBottom: "1px solid var(--ft-border)",
  paddingBottom: 6,
};

interface AmortizationTableProps {
  rows: AmortizationRow[];
  totalInterest: number;
}

function AmortizationTable({ rows, totalInterest }: AmortizationTableProps) {
  const [showAll, setShowAll] = useState(false);

  const displayed = useMemo(() => {
    if (showAll || rows.length <= 24) return rows;
    return [...rows.slice(0, 12), ...rows.slice(-12)];
  }, [rows, showAll]);

  const chartData = useMemo(
    () => rows.filter((_, i) => i % 6 === 0 || i === rows.length - 1).map((r) => ({
      month: `M${r.month}`,
      balance: Math.round(r.balance),
    })),
    [rows]
  );

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

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ height: 160, marginBottom: 14 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
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

      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ft-muted)", marginBottom: 8 }}>
        Total interest paid: <span style={{ color: "var(--ft-red)", fontWeight: 700 }}>{formatGbp(totalInterest)}</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              {["Month", "Payment", "Interest", "Principal", "Balance"].map((h, i) => (
                <th key={h} style={{ ...TH_STYLE, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, idx) => {
              const prevRow = displayed[idx - 1];
              const isGap = !showAll && rows.length > 24 && idx === 12 && prevRow && prevRow.month !== row.month - 1;
              return (
                <>
                  {isGap && (
                    <tr key={`gap-${row.month}`}>
                      <td colSpan={5} style={{ textAlign: "center", padding: "4px", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", background: "var(--ft-raised)" }}>
                        ··· {rows.length - 24} months hidden ···
                      </td>
                    </tr>
                  )}
                  <tr
                    key={row.month}
                    style={{ borderBottom: "1px solid var(--ft-border)", background: idx % 2 === 0 ? "transparent" : "var(--ft-raised)22" }}
                  >
                    <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-muted)" }}>{row.month}</td>
                    <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", textAlign: "right" }}>{formatGbp(row.payment)}</td>
                    <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-red)", textAlign: "right" }}>{formatGbp(row.interestPortion)}</td>
                    <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-green)", textAlign: "right" }}>{formatGbp(row.principalPortion)}</td>
                    <td style={{ padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", textAlign: "right", fontWeight: 600 }}>{formatGbp(row.balance)}</td>
                  </tr>
                </>
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
      <div style={SECTION_HEADER}>Overpayment Impact Calculator</div>

      <div style={{ marginBottom: 12 }}>
        <div style={LABEL_STYLE}>Extra monthly payment: <span style={{ color: "var(--ft-accent)" }}>{formatGbp(extra)}</span></div>
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
        {[
          { label: "Standard", months: standard.length, interest: stdInterest, color: "var(--ft-muted)" },
          { label: "With Overpayment", months: overpaid.length, interest: ovInterest, color: "var(--ft-accent)" },
        ].map(({ label, months, interest, color }) => (
          <div key={label} style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "10px 12px" }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color, marginBottom: 2 }}>{formatMonths(months)}</div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-red)" }}>{formatGbp(interest)} interest</div>
          </div>
        ))}
      </div>

      <div className="ft-three-col" style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px", marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <div style={LABEL_STYLE}>Months Saved</div>
          <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700, color: monthsSaved > 0 ? "var(--ft-green)" : "var(--ft-dim)" }}>{monthsSaved > 0 ? `${monthsSaved}mo` : "—"}</div>
        </div>
        <div>
          <div style={LABEL_STYLE}>Interest Saved</div>
          <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700, color: interestSaved > 0 ? "var(--ft-green)" : "var(--ft-dim)" }}>{interestSaved > 0 ? formatGbp(interestSaved) : "—"}</div>
        </div>
        <div>
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

// ─── Rate Scenario Comparison ────────────────────────────────────────────────

interface RateScenariosProps {
  mortgage: StoredMortgage;
}

function RateScenarios({ mortgage }: RateScenariosProps) {
  const [baseRate, setBaseRate] = useState(mortgage.annualRate);
  const scenarios = [0, 0.5, 1, 2];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={SECTION_HEADER}>Interest Rate Scenarios</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={LABEL_STYLE}>Base rate (%)</div>
        <input
          type="number"
          step="0.1"
          min="0"
          value={baseRate}
          onChange={(e) => setBaseRate(Number(e.target.value))}
          style={{ ...INPUT_STYLE, width: 90 }}
        />
      </div>
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {scenarios.map((delta) => {
          const rate = baseRate + delta;
          const monthly = monthlyPayment(mortgage.principal, rate, mortgage.termYears, mortgage.type);
          return (
            <div key={delta} style={{ background: delta === 0 ? "var(--ft-raised)" : "var(--ft-surface)", border: `1px solid ${delta === 0 ? "var(--ft-accent)" : "var(--ft-border)"}`, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: delta === 0 ? "var(--ft-accent)" : "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {rate.toFixed(1)}%{delta > 0 ? ` (+${delta}%)` : ""}
              </div>
              <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ft-text)" }}>{formatGbp(monthly)}</div>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>/ month</div>
            </div>
          );
        })}
      </div>
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
      <div style={SECTION_HEADER}>Affordability Calculator</div>
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
          <div style={{ display: "flex", gap: 0 }}>
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
                  transition: "all 0.1s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {maxLoan > 0 && (
        <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Max Loan", value: formatGbp(maxLoan), color: "var(--ft-text)" },
            { label: "Max Property Value", value: formatGbp(maxPropertyValue), color: "var(--ft-accent)" },
            { label: "Stamp Duty", value: formatGbp(sdlt), color: "var(--ft-amber)" },
            { label: "Total Cost", value: formatGbp(totalCost), color: "var(--ft-text)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px" }}>
              <div style={LABEL_STYLE}>{label}</div>
              <div style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 700, color }}>{value}</div>
            </div>
          ))}

          <div style={{ background: "var(--ft-surface)", border: `1px solid ${ltvColor}`, padding: "10px 14px" }}>
            <div style={LABEL_STYLE}>LTV</div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 700, color: ltvColor }}>{ltv.toFixed(1)}%</div>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: ltvColor, marginTop: 2 }}>{ltvLabel}</div>
          </div>

          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px" }}>
            <div style={LABEL_STYLE}>Income Multiple</div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 700, color: incomeMultiple <= 4.5 ? "var(--ft-green)" : "var(--ft-red)" }}>
              {incomeMultiple > 0 ? `${incomeMultiple.toFixed(1)}x` : "—"}
            </div>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginTop: 2 }}>
              {incomeMultiple <= 4.5 ? "Within typical lender limit" : "Above 4.5x — harder to borrow"}
            </div>
          </div>
        </div>
      )}
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
  const balance = useMemo(() => outstandingBalance(mortgage), [mortgage]);
  const remaining = useMemo(() => monthsRemaining(mortgage), [mortgage]);
  const monthly = monthlyPayment(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type);
  const rows = useMemo(() => (expanded ? buildAmortization(mortgage.principal, mortgage.annualRate, mortgage.termYears, mortgage.type, mortgage.extraMonthly ?? 0) : []), [mortgage, expanded]);
  const totalInterest = rows.reduce((s, r) => s + r.interestPortion, 0);

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", marginBottom: 8 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)" }}>{mortgage.name}</span>
            <span style={{ fontSize: 9, padding: "1px 6px", background: "var(--ft-raised)", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
              {mortgage.type === "repayment" ? "Repayment" : "Interest-only"}
            </span>
          </div>
          <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              { label: "Outstanding", value: formatGbp(balance), color: "var(--ft-text)" },
              { label: "Monthly", value: formatGbp(monthly), color: "var(--ft-amber)" },
              { label: "Rate", value: `${mortgage.annualRate}%`, color: "var(--ft-muted)" },
              { label: "Remaining", value: formatMonths(remaining), color: "var(--ft-muted)" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={LABEL_STYLE}>{label}</div>
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
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
            onClick={() => { if (confirm(`Delete "${mortgage.name}"?`)) onDelete(mortgage.id); }}
            style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-red)", fontFamily: "var(--font-mono)", fontSize: 9, padding: "4px 8px", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--ft-border)", padding: "12px 14px" }}>
          <AmortizationTable rows={rows} totalInterest={totalInterest} />
          <OverpaymentImpact mortgage={mortgage} />
          <RateScenarios mortgage={mortgage} />
        </div>
      )}
    </div>
  );
}

// ─── Add Loan Form ────────────────────────────────────────────────────────────

const EMPTY_FORM: AddLoanForm = {
  name: "",
  principal: "",
  annualRate: "",
  termYears: "",
  startDate: new Date().toISOString().slice(0, 10),
  type: "repayment",
  extraMonthly: "",
};

interface AddLoanFormPanelProps {
  onAdd: (mortgage: StoredMortgage) => void;
  onCancel: () => void;
}

function AddLoanFormPanel({ onAdd, onCancel }: AddLoanFormPanelProps) {
  const [form, setForm] = useState<AddLoanForm>(EMPTY_FORM);

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
    setForm(EMPTY_FORM);
  };

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "14px 16px", marginBottom: 16 }}>
      <div style={SECTION_HEADER}>Add Loan / Mortgage</div>
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
            <div style={{ display: "flex", gap: 0 }}>
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
                    transition: "all 0.1s",
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={FIELD_STYLE}>
            <div style={LABEL_STYLE}>Extra monthly (£, optional)</div>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={form.extraMonthly} onChange={(e) => setField("extraMonthly", e.target.value)} style={INPUT_STYLE} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Cancel
          </button>
          <button type="submit" style={{ background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "6px 18px", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Add Loan
          </button>
        </div>
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
      {/* Page header */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
            <span style={{ color: "var(--ft-accent)" }}>·</span> Mortgage &amp; Loans
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>
            Mortgage &amp; Loan Calculator
          </div>
        </div>

        {activeTab === "loans" && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            + Add Loan
          </button>
        )}
      </div>

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
            <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
              No loans saved — add one to get started.
            </div>
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
