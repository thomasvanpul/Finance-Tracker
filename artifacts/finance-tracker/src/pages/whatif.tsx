import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import { formatGbp } from "@/lib/utils";
import { useGetDashboard } from "@workspace/api-client-react";

// ── Types ──────────────────────────────────────────────────────────────────

type TabId = "INCOME_CHANGE" | "EXPENSE_CUT" | "LUMP_SUM" | "DEBT_PAYOFF";

interface AmortRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function yearsToMillion(monthlySaving: number, annualRate: number, target: number): number {
  if (monthlySaving <= 0) return Infinity;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(target / monthlySaving) / 12;
  // FV = PMT * ((1+r)^n - 1)/r   => solve for n
  // n = log(1 + FV*r/PMT) / log(1+r)
  const n = Math.log(1 + (target * r) / monthlySaving) / Math.log(1 + r);
  return n / 12;
}

function futureValue(principal: number, annualRate: number, years: number): number {
  return principal * Math.pow(1 + annualRate, years);
}

function monthlyEquivalent(fv: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return fv / n;
  return (fv * r) / (Math.pow(1 + r, n) - 1);
}

function calcAmortization(
  principal: number,
  aprPercent: number,
  monthlyPayment: number
): AmortRow[] {
  const r = aprPercent / 100 / 12;
  const rows: AmortRow[] = [];
  let balance = principal;
  let month = 1;
  while (balance > 0.01 && month <= 600) {
    const interestCharge = balance * r;
    const principalPayment = Math.min(monthlyPayment - interestCharge, balance);
    if (principalPayment <= 0) break; // payment doesn't cover interest
    balance -= principalPayment;
    rows.push({
      month,
      payment: monthlyPayment,
      interest: interestCharge,
      principal: principalPayment,
      balance: Math.max(balance, 0),
    });
    month++;
  }
  return rows;
}

function minPayment(principal: number, aprPercent: number): number {
  // approximate: max(1% of balance, interest+1)
  const r = aprPercent / 100 / 12;
  const interest = principal * r;
  return Math.max(interest + 1, principal * 0.01, 10);
}

// ── Shared style helpers ───────────────────────────────────────────────────

const sectionTitle = (label: string) => (
  <div style={{
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--ft-dim)",
    borderBottom: "1px solid var(--ft-border)",
    paddingBottom: 6,
    marginBottom: 14,
  }}>
    {label}
  </div>
);

const formulaBlock = (children: React.ReactNode) => (
  <div style={{
    borderLeft: "3px solid var(--ft-accent)",
    paddingLeft: 12,
    marginBottom: 16,
  }}>
    {children}
  </div>
);

function BigNumber({ value, label, color = "var(--ft-text)" }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, onChange, display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase" as const }}>
          {label}
        </label>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--ft-accent)", cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-border2)", marginTop: 2 }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function CompareTable({ rows }: { rows: { label: string; before: string; after: string; diff?: string; diffColor?: string }[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr>
          {["", "Before", "After", "Δ"].map((h) => (
            <th key={h} style={{
              fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)",
              letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left",
              padding: "4px 8px", borderBottom: "1px solid var(--ft-border)",
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--ft-border)" }}>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", padding: "7px 8px" }}>{row.label}</td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "7px 8px" }}>{row.before}</td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", padding: "7px 8px" }}>{row.after}</td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: row.diffColor ?? "var(--ft-green)", padding: "7px 8px" }}>{row.diff ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Tab: Income Change ─────────────────────────────────────────────────────

function IncomeChangeTab({ baseIncome, baseExpenses }: { baseIncome: number; baseExpenses: number }) {
  const [currentIncome, setCurrentIncome] = useState(Math.round(baseIncome) || 3000);
  const [newIncome, setNewIncome] = useState(Math.round(baseIncome) + 500 || 3500);

  const currentSurplus = currentIncome - baseExpenses;
  const newSurplus = newIncome - baseExpenses;
  const monthlySurplusDelta = newSurplus - currentSurplus;
  const annualSavingDelta = monthlySurplusDelta * 12;

  const RATE = 0.06;
  function yearsToTarget(monthly: number, target: number): string {
    const y = yearsToMillion(monthly, RATE, target);
    if (!isFinite(y) || y <= 0) return "N/A";
    if (y > 100) return ">100 yrs";
    return `${y.toFixed(1)} yrs`;
  }

  const targets = [100_000, 500_000, 1_000_000];

  return (
    <div>
      {sectionTitle("Income Change Simulator")}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
        <div>
          <SliderRow
            label="Current Monthly Income"
            value={currentIncome}
            min={0}
            max={20000}
            step={50}
            onChange={setCurrentIncome}
            display={formatGbp(currentIncome)}
          />
          <SliderRow
            label="New Monthly Income"
            value={newIncome}
            min={0}
            max={25000}
            step={50}
            onChange={setNewIncome}
            display={formatGbp(newIncome)}
          />
        </div>

        <div>
          {formulaBlock(
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 8 }}>SURPLUS IMPACT</div>
              <div style={{ display: "flex", gap: 20 }}>
                <BigNumber
                  value={`${monthlySurplusDelta >= 0 ? "+" : ""}${formatGbp(monthlySurplusDelta)}`}
                  label="Monthly Surplus Change"
                  color={monthlySurplusDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
                />
                <BigNumber
                  value={`${annualSavingDelta >= 0 ? "+" : ""}${formatGbp(annualSavingDelta)}`}
                  label="Annual Saving Change"
                  color={annualSavingDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <CompareTable rows={[
        {
          label: "Monthly Income",
          before: formatGbp(currentIncome),
          after: formatGbp(newIncome),
          diff: `${newIncome >= currentIncome ? "+" : ""}${formatGbp(newIncome - currentIncome)}`,
          diffColor: newIncome >= currentIncome ? "var(--ft-green)" : "var(--ft-red)",
        },
        {
          label: "Monthly Surplus",
          before: formatGbp(currentSurplus),
          after: formatGbp(newSurplus),
          diff: `${newSurplus >= currentSurplus ? "+" : ""}${formatGbp(newSurplus - currentSurplus)}`,
          diffColor: newSurplus >= currentSurplus ? "var(--ft-green)" : "var(--ft-red)",
        },
        {
          label: "Annual Saving",
          before: formatGbp(Math.max(currentSurplus, 0) * 12),
          after: formatGbp(Math.max(newSurplus, 0) * 12),
          diff: `${annualSavingDelta >= 0 ? "+" : ""}${formatGbp(annualSavingDelta * 12)}`,
          diffColor: annualSavingDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)",
        },
      ]} />

      {/* Time-to-target comparison */}
      <div style={{ marginTop: 20 }}>
        {sectionTitle("Time to Wealth Target at 6% Compound Growth")}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Target", "Before", "After", "Time Saved"].map((h) => (
                  <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--ft-border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const before = yearsToMillion(Math.max(currentSurplus, 0), RATE, t);
                const after = yearsToMillion(Math.max(newSurplus, 0), RATE, t);
                const saved = isFinite(before) && isFinite(after) ? before - after : null;
                return (
                  <tr key={t} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", fontWeight: 700, padding: "7px 8px" }}>{formatGbp(t)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px" }}>{yearsToTarget(Math.max(currentSurplus, 0), t)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)", padding: "7px 8px" }}>{yearsToTarget(Math.max(newSurplus, 0), t)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", padding: "7px 8px" }}>
                      {saved !== null && saved > 0 ? `-${saved.toFixed(1)} yrs` : saved !== null && saved < 0 ? `+${Math.abs(saved).toFixed(1)} yrs` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Expense Cut ───────────────────────────────────────────────────────

interface CategorySlider {
  label: string;
  base: number;
  cut: number;
}

function ExpenseCutTab({ baseExpenses }: { baseExpenses: number }) {
  const defaultCategories: CategorySlider[] = useMemo(() => {
    // Try reading from ft-budgets, fall back to generic allocation
    try {
      const raw = localStorage.getItem("ft-budgets");
      if (raw) {
        const budgets = JSON.parse(raw) as Array<{ category: string; amount: number }>;
        if (Array.isArray(budgets) && budgets.length > 0) {
          return budgets.map((b) => ({ label: b.category, base: b.amount, cut: 0 }));
        }
      }
    } catch {}
    // Generic allocation
    const share = baseExpenses > 0 ? baseExpenses : 2500;
    return [
      { label: "Housing", base: Math.round(share * 0.35), cut: 0 },
      { label: "Food & Groceries", base: Math.round(share * 0.15), cut: 0 },
      { label: "Transport", base: Math.round(share * 0.1), cut: 0 },
      { label: "Subscriptions", base: Math.round(share * 0.05), cut: 0 },
      { label: "Dining Out", base: Math.round(share * 0.1), cut: 0 },
      { label: "Entertainment", base: Math.round(share * 0.07), cut: 0 },
      { label: "Clothing", base: Math.round(share * 0.05), cut: 0 },
      { label: "Other", base: Math.round(share * 0.13), cut: 0 },
    ];
  }, [baseExpenses]);

  const [categories, setCategories] = useState<CategorySlider[]>(defaultCategories);

  const totalMonthlySaving = categories.reduce((s, c) => s + c.base * (c.cut / 100), 0);
  const annualSaving = totalMonthlySaving * 12;
  const tenYearWealth = futureValue(annualSaving * 10, 0.06, 0) + (annualSaving * ((Math.pow(1.06, 10) - 1) / 0.06));

  function setCut(i: number, val: number) {
    setCategories((prev) => prev.map((c, j) => j === i ? { ...c, cut: val } : c));
  }

  // Quick scenarios
  const QUICK_SCENARIOS: { label: string; apply: (cats: CategorySlider[]) => CategorySlider[] }[] = [
    {
      label: "Cut coffee £5/day",
      apply: (cats) => cats.map((c) => c.label === "Dining Out" ? { ...c, cut: Math.min(100, c.cut + Math.round((150 / c.base) * 100)) } : c),
    },
    {
      label: "Cancel subscriptions",
      apply: (cats) => cats.map((c) => c.label === "Subscriptions" ? { ...c, cut: 100 } : c),
    },
    {
      label: "Meal prep (-30% food)",
      apply: (cats) => cats.map((c) => c.label === "Food & Groceries" ? { ...c, cut: 30 } : c),
    },
    {
      label: "WFH (-50% transport)",
      apply: (cats) => cats.map((c) => c.label === "Transport" ? { ...c, cut: 50 } : c),
    },
  ];

  return (
    <div>
      {sectionTitle("Expense Cut Calculator")}

      {/* Quick scenarios */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 20 }}>
        {QUICK_SCENARIOS.map((s) => (
          <button
            key={s.label}
            onClick={() => setCategories((prev) => s.apply(prev))}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.05em",
              padding: "5px 12px",
              background: "transparent",
              color: "var(--ft-cyan)",
              border: "1px solid var(--ft-cyan)",
              cursor: "pointer",
              opacity: 0.85,
              transition: "opacity 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(86,211,212,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.background = "transparent"; }}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setCategories((prev) => prev.map((c) => ({ ...c, cut: 0 })))}
          style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.05em", padding: "5px 12px", background: "transparent", color: "var(--ft-dim)", border: "1px solid var(--ft-border2)", cursor: "pointer" }}
        >
          Reset all
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Sliders */}
        <div>
          {categories.map((c, i) => (
            <div key={c.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                  {c.label}
                </label>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                  <span style={{ color: "var(--ft-muted)" }}>{formatGbp(c.base)}</span>
                  {c.cut > 0 && (
                    <>
                      <span style={{ color: "var(--ft-dim)", margin: "0 4px" }}>→</span>
                      <span style={{ color: "var(--ft-green)", fontWeight: 700 }}>
                        {formatGbp(c.base * (1 - c.cut / 100))}
                      </span>
                      <span style={{ color: "var(--ft-green)", fontSize: 8, marginLeft: 4 }}>(-{c.cut}%)</span>
                    </>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={c.cut}
                onChange={(e) => setCut(i, Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--ft-green)", cursor: "pointer" }}
              />
            </div>
          ))}
        </div>

        {/* Impact panel */}
        <div>
          {formulaBlock(
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 10 }}>IMPACT SUMMARY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <BigNumber value={formatGbp(totalMonthlySaving)} label="Monthly Saving" color="var(--ft-green)" />
                <BigNumber value={formatGbp(annualSaving)} label="Annual Saving" color="var(--ft-green)" />
                <BigNumber value={formatGbp(tenYearWealth)} label="10-Year Wealth at 6%" color="var(--ft-accent)" />
              </div>
            </>
          )}

          {/* Bar chart of cuts */}
          {totalMonthlySaving > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                Savings by Category
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={categories.filter((c) => c.cut > 0).map((c) => ({
                    name: c.label.slice(0, 8),
                    saving: Math.round(c.base * (c.cut / 100)),
                  }))}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `£${v}`} width={40} />
                  <Tooltip formatter={(v: number) => [formatGbp(v), "Monthly saving"]} contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }} />
                  <Bar dataKey="saving" fill="var(--ft-green)" radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Invest Lump Sum ───────────────────────────────────────────────────

function LumpSumTab() {
  const [principal, setPrincipal] = useState(10000);
  const [annualRate, setAnnualRate] = useState(7);
  const [years, setYears] = useState(10);

  const fv = useMemo(() => futureValue(principal, annualRate / 100, years), [principal, annualRate, years]);
  const interestEarned = fv - principal;
  const monthlyEq = useMemo(() => monthlyEquivalent(fv, annualRate / 100, years), [fv, annualRate, years]);

  // Bar chart: principal vs interest per year
  const barData = useMemo(() => {
    return Array.from({ length: years }, (_, i) => {
      const yr = i + 1;
      const fvYr = futureValue(principal, annualRate / 100, yr);
      return {
        year: `Y${yr}`,
        principal,
        interest: Math.round(fvYr - principal),
      };
    });
  }, [principal, annualRate, years]);

  return (
    <div>
      {sectionTitle("Lump Sum Investment Calculator")}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <SliderRow label="Lump Sum Amount" value={principal} min={100} max={100000} step={100} onChange={setPrincipal} display={formatGbp(principal)} />
          <SliderRow label="Annual Return Rate" value={annualRate} min={1} max={20} step={0.5} onChange={setAnnualRate} display={`${annualRate}%`} />
          <SliderRow label="Investment Horizon (years)" value={years} min={1} max={40} step={1} onChange={setYears} display={`${years} yrs`} />
        </div>

        <div>
          {formulaBlock(
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>
                FV = P × (1 + r)^n
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-border2)", marginBottom: 14 }}>
                P={formatGbp(principal)}, r={annualRate}%, n={years}yr
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <BigNumber value={formatGbp(Math.round(fv))} label="Future Value" color="var(--ft-accent)" />
                <BigNumber value={`+${formatGbp(Math.round(interestEarned))}`} label="Total Interest Earned" color="var(--ft-green)" />
                <BigNumber value={formatGbp(Math.round(monthlyEq))} label="Monthly Equivalent" color="var(--ft-cyan)" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 6 }}>
                Monthly equivalent = what you'd need to invest monthly at the same rate to get the same result
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginTop: 20 }}>
        {sectionTitle("Growth Breakdown by Year")}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              formatter={(v: number, name: string) => [formatGbp(v), name === "principal" ? "Principal" : "Interest"]}
              contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
            />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }} />
            <Bar dataKey="principal" stackId="a" fill="var(--ft-raised)" stroke="var(--ft-border2)" strokeWidth={1} />
            <Bar dataKey="interest" stackId="a" fill="var(--ft-green)" radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Tab: Debt Payoff ───────────────────────────────────────────────────────

function DebtPayoffTab() {
  const [loanAmount, setLoanAmount] = useState(15000);
  const [apr, setApr] = useState(8);
  const [monthlyPayment, setMonthlyPayment] = useState(300);
  const [extraPayment, setExtraPayment] = useState(0);

  const minPay = useMemo(() => Math.ceil(minPayment(loanAmount, apr)), [loanAmount, apr]);
  const effectivePayment = Math.max(monthlyPayment, minPay);

  const baseSchedule = useMemo(() => calcAmortization(loanAmount, apr, effectivePayment), [loanAmount, apr, effectivePayment]);
  const extraSchedule = useMemo(() => calcAmortization(loanAmount, apr, effectivePayment + extraPayment), [loanAmount, apr, effectivePayment, extraPayment]);

  const baseMonths = baseSchedule.length;
  const extraMonths = extraSchedule.length;
  const baseTotalInterest = baseSchedule.reduce((s, r) => s + r.interest, 0);
  const extraTotalInterest = extraSchedule.reduce((s, r) => s + r.interest, 0);
  const monthsSaved = baseMonths - extraMonths;
  const interestSaved = baseTotalInterest - extraTotalInterest;

  // Line chart: balance over time for both scenarios
  const maxMonths = Math.min(baseMonths, 120);
  const lineData = useMemo(() => {
    return Array.from({ length: maxMonths }, (_, i) => ({
      month: i + 1,
      baseBalance: baseSchedule[i]?.balance ?? 0,
      extraBalance: extraSchedule[i]?.balance ?? 0,
    }));
  }, [baseSchedule, extraSchedule, maxMonths]);

  // Amortization table (first 24 rows)
  const tableRows = baseSchedule.slice(0, 24);

  return (
    <div>
      {sectionTitle("Debt Payoff Calculator")}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <SliderRow label="Loan Amount" value={loanAmount} min={500} max={100000} step={500} onChange={setLoanAmount} display={formatGbp(loanAmount)} />
          <SliderRow label="Interest Rate (APR %)" value={apr} min={0.5} max={40} step={0.5} onChange={setApr} display={`${apr}%`} />
          <SliderRow label="Monthly Payment" value={monthlyPayment} min={minPay} max={Math.max(loanAmount / 6, minPay + 500)} step={10} onChange={setMonthlyPayment} display={formatGbp(effectivePayment)} />
          <SliderRow label="Extra Payment /month" value={extraPayment} min={0} max={2000} step={10} onChange={setExtraPayment} display={extraPayment > 0 ? `+${formatGbp(extraPayment)}` : "£0"} />
        </div>

        <div>
          {formulaBlock(
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginBottom: 12 }}>MINIMUM PAYMENT</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-amber)", marginBottom: 12 }}>
                {formatGbp(minPay)}/mo min to cover interest
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <BigNumber value={`${baseMonths} mo`} label="Months to Payoff" color="var(--ft-text)" />
                <BigNumber value={formatGbp(Math.round(baseTotalInterest))} label="Total Interest" color="var(--ft-red)" />
              </div>
              {extraPayment > 0 && (
                <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                    With +{formatGbp(extraPayment)}/mo
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <BigNumber value={`-${monthsSaved} mo`} label="Months Saved" color="var(--ft-green)" />
                    <BigNumber value={`-${formatGbp(Math.round(interestSaved))}`} label="Interest Saved" color="var(--ft-green)" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Balance over time chart */}
      {lineData.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {sectionTitle("Balance Over Time")}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} label={{ value: "Month", position: "insideBottomRight", fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }} />
              <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                formatter={(v: number, name: string) => [formatGbp(v), name === "baseBalance" ? "Min payment" : `+${formatGbp(extraPayment)}/mo`]}
                contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
              />
              <Line type="monotone" dataKey="baseBalance" stroke="var(--ft-red)" strokeWidth={1.5} dot={false} name="baseBalance" />
              {extraPayment > 0 && (
                <Line type="monotone" dataKey="extraBalance" stroke="var(--ft-green)" strokeWidth={1.5} dot={false} name="extraBalance" strokeDasharray="5 3" />
              )}
            </LineChart>
          </ResponsiveContainer>
          {extraPayment > 0 && (
            <div style={{ display: "flex", gap: 16, paddingLeft: 44, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "var(--ft-red)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>Minimum payment</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: "var(--ft-green)", borderTop: "1px dashed var(--ft-green)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>With extra payment</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Amortization table */}
      {tableRows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {sectionTitle("Amortization Schedule (first 24 months)")}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Month", "Payment", "Interest", "Principal", "Balance"].map((h) => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "right", padding: "4px 10px", borderBottom: "1px solid var(--ft-border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.month} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", padding: "6px 10px", textAlign: "right" }}>{row.month}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "6px 10px", textAlign: "right" }}>{formatGbp(row.payment)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-red)", padding: "6px 10px", textAlign: "right" }}>{formatGbp(row.interest)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-green)", padding: "6px 10px", textAlign: "right" }}>{formatGbp(row.principal)}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: row.month === baseMonths ? 700 : 400, color: row.month === baseMonths ? "var(--ft-accent)" : "var(--ft-text)", padding: "6px 10px", textAlign: "right" }}>{formatGbp(row.balance)}</td>
                  </tr>
                ))}
                {baseMonths > 24 && (
                  <tr>
                    <td colSpan={5} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", padding: "6px 10px", textAlign: "center" }}>
                      + {baseMonths - 24} more months not shown
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function WhatIf() {
  const [activeTab, setActiveTab] = useState<TabId>("INCOME_CHANGE");
  const { data: dashData } = useGetDashboard();

  const baseIncome = dashData?.thisMonth?.income ?? 0;
  const baseExpenses = dashData?.thisMonth?.expenses ?? 0;

  const tabs: { id: TabId; label: string }[] = [
    { id: "INCOME_CHANGE", label: "Income Change" },
    { id: "EXPENSE_CUT", label: "Expense Cut" },
    { id: "LUMP_SUM", label: "Invest Lump Sum" },
    { id: "DEBT_PAYOFF", label: "Debt Payoff" },
  ];

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          <span style={{ color: "var(--ft-accent)" }}>·</span> What-If Simulator
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          Model scenarios · project outcomes · make informed decisions
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--ft-border)",
        marginBottom: 28,
        gap: 0,
        overflowX: "auto",
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
              padding: "10px 18px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--ft-accent)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--ft-accent)" : "var(--ft-dim)",
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
              marginBottom: -1,
              transition: "color 0.1s",
            }}
            onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = "var(--ft-muted)"; }}
            onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = "var(--ft-dim)"; }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "INCOME_CHANGE" && (
        <IncomeChangeTab baseIncome={baseIncome} baseExpenses={baseExpenses} />
      )}
      {activeTab === "EXPENSE_CUT" && (
        <ExpenseCutTab baseExpenses={baseExpenses} />
      )}
      {activeTab === "LUMP_SUM" && (
        <LumpSumTab />
      )}
      {activeTab === "DEBT_PAYOFF" && (
        <DebtPayoffTab />
      )}
    </div>
  );
}
