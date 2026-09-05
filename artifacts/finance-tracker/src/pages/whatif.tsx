import { useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
  ReferenceLine,
} from "recharts";
import { formatBaseMoney } from "@/lib/utils";
import { useGetDashboard, useListBudgets, useListInvestments, useGetInvestmentSummary } from "@workspace/api-client-react";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { HStack, MonoLabel, Panel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";

// ── Types ──────────────────────────────────────────────────────────────────

type TabId = "INCOME_CHANGE" | "EXPENSE_CUT" | "LUMP_SUM" | "DEBT_PAYOFF" | "INFLATION" | "PORTFOLIO_SHOCK";

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
    if (principalPayment <= 0) break;
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
  const r = aprPercent / 100 / 12;
  const interest = principal * r;
  return Math.max(interest + 1, principal * 0.01, 10);
}

// ── Shared style helpers ───────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

const formulaBlock = (children: React.ReactNode) => (
  <div style={{
    borderLeft: "1px solid var(--ft-border)",
    paddingLeft: 12,
    marginBottom: 16,
  }}>
    {children}
  </div>
);

function BigNumber({ value, label, color = "var(--ft-text)", size = 24 }: { value: string; label: string; color?: string; size?: number }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: size, fontWeight: 700, color, lineHeight: 1, letterSpacing: size >= 24 ? "-0.025em" : undefined, minWidth: 0 }}>
        <span className="pnum">{value}</span>
      </div>
      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>
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
      <HStack align="baseline" justify="between" marginBottom={6}>
        <label style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase" as const }}>
          {label}
        </label>
        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
          <span className="pnum">{display}</span>
        </span>
      </HStack>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--ft-accent)", cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 8, color: "var(--ft-border2)", marginTop: 2 }}>
        <span className="pnum">{min}</span>
        <span className="pnum">{max}</span>
      </div>
    </div>
  );
}

function CompareTable({ rows }: { rows: { label: string; before: string; after: string; diff?: string; diffColor?: string }[] }) {
  const isMobile = useIsMobile();
  const headers = isMobile ? ["", "After", "Δ Impact"] : ["", "Before", "After", "Δ Impact"];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr style={{ background: "var(--ft-raised)" }}>
          {headers.map((h) => (
            <th key={h} style={{
              ...mono, fontSize: 8, color: "var(--ft-dim)",
              letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left",
              padding: "6px 8px", borderBottom: "1px solid var(--ft-border)",
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <CompareTableRow key={i} row={row} isMobile={isMobile} />
        ))}
      </tbody>
    </table>
  );
}

// ── Compare Table Row ──────────────────────────────────────────────────────

interface CompareRowData {
  label: string;
  before: string;
  after: string;
  diff?: string;
  diffColor?: string;
}

function CompareTableRow({ row, isMobile }: { row: CompareRowData; isMobile?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", padding: "7px 8px", textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const }}>{row.label}</td>
      {!isMobile && <td style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px" }}><span className="pnum">{row.before}</span></td>}
      <td style={{ ...mono, fontSize: isMobile ? 11 : 13, fontWeight: 700, color: "var(--ft-text)", padding: "7px 8px", letterSpacing: "-0.01em" }}><span className="pnum">{row.after}</span></td>
      <td style={{ ...mono, fontSize: isMobile ? 11 : 13, fontWeight: 700, color: row.diffColor ?? "var(--ft-green)", padding: "7px 8px", letterSpacing: "-0.01em" }}><span className="pnum">{row.diff ?? ""}</span></td>
    </tr>
  );
}

// ── Inflation KPI Tile ─────────────────────────────────────────────────────

interface InflationKpiTileProps {
  label: string;
  value: string;
  color: string;
  note: string;
}

function InflationKpiTile({ label, value, color, note }: InflationKpiTileProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))"
          : "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        padding: "10px 12px",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color, lineHeight: 1, marginBottom: 3 }}><span className="pnum">{value}</span></div>
      <div className="pnum" style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{note}</div>
    </div>
  );
}

// ── Inflation Legend Item ──────────────────────────────────────────────────

function InflationLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <HStack gap={5} align="center">
      <div style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{label}</span>
    </HStack>
  );
}

// ── Scenario Button ────────────────────────────────────────────────────────

interface ScenarioButtonProps {
  label: string;
  change: number;
  isSelected: boolean;
  onClick: () => void;
}

function ScenarioButton({ label, change, isSelected, onClick }: ScenarioButtonProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 10,
        fontWeight: 600,
        padding: "6px 12px",
        background: isSelected
          ? (change < 0 ? "rgba(230,80,80,0.15)" : "rgba(34,197,94,0.15)")
          : hov
          ? "color-mix(in srgb, var(--ft-accent) 8%, var(--ft-raised))"
          : "var(--ft-raised)",
        border: `1px solid ${isSelected ? (change < 0 ? "var(--ft-red)" : "var(--ft-green)") : hov ? "var(--ft-border2)" : "var(--ft-border2)"}`,
        color: isSelected
          ? (change < 0 ? "var(--ft-red)" : "var(--ft-green)")
          : hov ? "var(--ft-muted)" : "var(--ft-dim)",
        cursor: "pointer",
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      {label} ({change >= 0 ? "+" : ""}<span className="pnum">{change}</span>%)
    </button>
  );
}

// ── Position Impact Row ────────────────────────────────────────────────────

interface PositionImpactRowProps {
  pos: { ticker: string; value: number; delta: number; after: number };
}

function PositionImpactRow({ pos }: PositionImpactRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      style={{
        borderBottom: "1px solid rgba(33,38,45,0.4)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ padding: "6px 12px", fontWeight: 700, color: "var(--ft-text)", ...mono }}>{pos.ticker}</td>
      <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-muted)", ...mono }}><span className="pnum">{formatBaseMoney(pos.value)}</span></td>
      <td style={{ padding: "6px 12px", textAlign: "right", color: pos.delta >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600, ...mono }}>
        <span className="pnum">{pos.delta >= 0 ? "+" : ""}{formatBaseMoney(pos.delta)}</span>
      </td>
      <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-text)", ...mono }}>
        <span className="pnum">{formatBaseMoney(pos.after)}</span>
      </td>
    </tr>
  );
}

// ── Amortization Table Row ────────────────────────────────────────────────

interface AmortRowProps {
  row: AmortRow;
  isLastRow: boolean;
}

function AmortTableRow({ row, isLastRow }: AmortRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", padding: "6px 10px", textAlign: "right" }}>
        <span className="pnum">{row.month}</span>
      </td>
      <td style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", padding: "6px 10px", textAlign: "right" }}>
        <span className="pnum">{formatBaseMoney(row.payment)}</span>
      </td>
      <td style={{ ...mono, fontSize: 10, color: "var(--ft-red)", padding: "6px 10px", textAlign: "right" }}>
        <span className="pnum">{formatBaseMoney(row.interest)}</span>
      </td>
      <td style={{ ...mono, fontSize: 10, color: "var(--ft-green)", padding: "6px 10px", textAlign: "right" }}>
        <span className="pnum">{formatBaseMoney(row.principal)}</span>
      </td>
      <td style={{ ...mono, fontSize: 10, fontWeight: isLastRow ? 700 : 400, color: isLastRow ? "var(--ft-accent)" : "var(--ft-text)", padding: "6px 10px", textAlign: "right" }}>
        <span className="pnum">{formatBaseMoney(row.balance)}</span>
      </td>
    </tr>
  );
}

// ── Time-to-target row ────────────────────────────────────────────────────

interface TimeTargetRowProps {
  target: number;
  before: number;
  after: number;
  yearsToTarget: (monthly: number, target: number) => string;
  currentSurplus: number;
  newSurplus: number;
}

function TimeTargetRow({ target, before, after, yearsToTarget, currentSurplus, newSurplus }: TimeTargetRowProps) {
  const [hov, setHov] = useState(false);
  const saved = isFinite(before) && isFinite(after) ? before - after : null;
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ ...mono, fontSize: 10, color: "var(--ft-accent)", fontWeight: 700, padding: "7px 8px" }}>
        <span className="pnum">{formatBaseMoney(target)}</span>
      </td>
      <td style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px" }}>
        <span className="pnum">{yearsToTarget(Math.max(currentSurplus, 0), target)}</span>
      </td>
      <td style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-text)", padding: "7px 8px" }}>
        <span className="pnum">{yearsToTarget(Math.max(newSurplus, 0), target)}</span>
      </td>
      <td style={{ ...mono, fontSize: 9, color: "var(--ft-green)", padding: "7px 8px" }}>
        <span className="pnum">
          {saved !== null && saved > 0 ? `-${saved.toFixed(1)} yrs` : saved !== null && saved < 0 ? `+${Math.abs(saved).toFixed(1)} yrs` : "—"}
        </span>
      </td>
    </tr>
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
    <div className="space-y-1.5">
      <Panel title="Income Change Simulator" padding="12px 16px">

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
        <div>
          <SliderRow
            label="Current Monthly Income"
            value={currentIncome}
            min={0}
            max={20000}
            step={50}
            onChange={setCurrentIncome}
            display={formatBaseMoney(currentIncome)}
          />
          <SliderRow
            label="New Monthly Income"
            value={newIncome}
            min={0}
            max={25000}
            step={50}
            onChange={setNewIncome}
            display={formatBaseMoney(newIncome)}
          />
        </div>

        <div>
          {formulaBlock(
            <>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Surplus Impact</div>
              <HStack gap={20} wrap>
                <BigNumber
                  value={`${monthlySurplusDelta >= 0 ? "+" : ""}${formatBaseMoney(monthlySurplusDelta)}`}
                  label="Monthly Surplus Change"
                  color={monthlySurplusDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
                  size={20}
                />
                <BigNumber
                  value={`${annualSavingDelta >= 0 ? "+" : ""}${formatBaseMoney(annualSavingDelta)}`}
                  label="Annual Saving Change"
                  color={annualSavingDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
                  size={20}
                />
              </HStack>
            </>
          )}
        </div>
      </div>

      <CompareTable rows={[
        {
          label: "Monthly Income",
          before: formatBaseMoney(currentIncome),
          after: formatBaseMoney(newIncome),
          diff: `${newIncome >= currentIncome ? "+" : ""}${formatBaseMoney(newIncome - currentIncome)}`,
          diffColor: newIncome >= currentIncome ? "var(--ft-green)" : "var(--ft-red)",
        },
        {
          label: "Monthly Surplus",
          before: formatBaseMoney(currentSurplus),
          after: formatBaseMoney(newSurplus),
          diff: `${newSurplus >= currentSurplus ? "+" : ""}${formatBaseMoney(newSurplus - currentSurplus)}`,
          diffColor: newSurplus >= currentSurplus ? "var(--ft-green)" : "var(--ft-red)",
        },
        {
          label: "Annual Saving",
          before: formatBaseMoney(Math.max(currentSurplus, 0) * 12),
          after: formatBaseMoney(Math.max(newSurplus, 0) * 12),
          diff: `${annualSavingDelta >= 0 ? "+" : ""}${formatBaseMoney(annualSavingDelta)}`,
          diffColor: annualSavingDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)",
        },
      ]} />
      </Panel>

      {/* Time-to-target comparison */}
      <Panel title="Time to Wealth Target at 6% Compound Growth" padding="12px 16px">
        <div className="ft-scroll-x">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Target", "Before", "After", "Time Saved"].map((h) => (
                  <th key={h} style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--ft-border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const before = yearsToMillion(Math.max(currentSurplus, 0), RATE, t);
                const after = yearsToMillion(Math.max(newSurplus, 0), RATE, t);
                return (
                  <TimeTargetRow
                    key={t}
                    target={t}
                    before={before}
                    after={after}
                    yearsToTarget={yearsToTarget}
                    currentSurplus={currentSurplus}
                    newSurplus={newSurplus}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ── Tab: Expense Cut ───────────────────────────────────────────────────────

interface CategorySlider {
  label: string;
  base: number;
  cut: number;
}

// ── Expense Category Row ───────────────────────────────────────────────────

interface ExpenseCategoryRowProps {
  c: CategorySlider;
  i: number;
  onCutChange: (i: number, val: number) => void;
}

function ExpenseCategoryRow({ c, i, onCutChange }: ExpenseCategoryRowProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <HStack align="baseline" justify="between" marginBottom={4}>
        <label style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
          {c.label}
        </label>
        <div style={{ ...mono, fontSize: 10 }}>
          <span style={{ color: "var(--ft-muted)" }}><span className="pnum">{formatBaseMoney(c.base)}</span></span>
          {c.cut > 0 && (
            <>
              <span style={{ color: "var(--ft-dim)", margin: "0 4px" }}>→</span>
              <span style={{ color: "var(--ft-green)", fontWeight: 700 }}>
                <span className="pnum">{formatBaseMoney(c.base * (1 - c.cut / 100))}</span>
              </span>
              <span style={{ color: "var(--ft-green)", fontSize: 8, marginLeft: 4 }}>
                (-<span className="pnum">{c.cut}</span>%)
              </span>
            </>
          )}
        </div>
      </HStack>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={c.cut}
        onChange={(e) => onCutChange(i, Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--ft-green)", cursor: "pointer" }}
      />
    </div>
  );
}

function ExpenseCutTab({ baseExpenses }: { baseExpenses: number }) {
  const { data: apiBudgets = [] } = useListBudgets();

  const defaultCategories: CategorySlider[] = useMemo(() => {
    if (apiBudgets.length > 0) {
      return apiBudgets.map((b) => ({ label: b.category, base: b.monthlyLimit, cut: 0 }));
    }
    // Without a real budget or a real expense baseline, the sliders would
    // sit on a fabricated £2500/month split that reads as the user's own.
    if (baseExpenses <= 0) {
      return [];
    }
    const share = baseExpenses;
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
  }, [apiBudgets, baseExpenses]);

  const [categories, setCategories] = useState<CategorySlider[]>(defaultCategories);

  useEffect(() => {
    setCategories(defaultCategories);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBudgets]);

  const totalMonthlySaving = categories.reduce((s, c) => s + c.base * (c.cut / 100), 0);
  const annualSaving = totalMonthlySaving * 12;
  const tenYearWealth = futureValue(annualSaving * 10, 0.06, 0) + (annualSaving * ((Math.pow(1.06, 10) - 1) / 0.06));

  function setCut(i: number, val: number) {
    setCategories((prev) => prev.map((c, j) => j === i ? { ...c, cut: val } : c));
  }

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

  if (categories.length === 0) {
    return (
      <Panel title="Expense Cut Calculator" padding="12px 16px">
        <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", padding: "20px 16px", lineHeight: 1.7, letterSpacing: "0.02em" }}>
          Add a budget or import transactions to model expense cuts. The sliders need a baseline monthly figure to work against.
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Expense Cut Calculator" padding="12px 16px">

      {/* Quick scenarios */}
      <HStack gap={8} wrap marginBottom={20}>
        {QUICK_SCENARIOS.map((s) => (
          <button
            key={s.label}
            onClick={() => setCategories((prev) => s.apply(prev))}
            style={{
              ...mono,
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
          style={{ ...mono, fontSize: 9, letterSpacing: "0.05em", padding: "5px 12px", background: "transparent", color: "var(--ft-dim)", border: "1px solid var(--ft-border2)", cursor: "pointer" }}
        >
          Reset all
        </button>
      </HStack>

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Sliders */}
        <div>
          {categories.map((c, i) => (
            <ExpenseCategoryRow key={c.label} c={c} i={i} onCutChange={setCut} />
          ))}
        </div>

        {/* Impact panel */}
        <div>
          {formulaBlock(
            <>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 10 }}>IMPACT SUMMARY</div>
              <VStack gap={12}>
                <BigNumber value={formatBaseMoney(totalMonthlySaving)} label="Monthly Saving" color="var(--ft-green)" size={28} />
                <BigNumber value={formatBaseMoney(annualSaving)} label="Annual Saving" color="var(--ft-green)" size={20} />
                <BigNumber value={formatBaseMoney(tenYearWealth)} label="10-Year Wealth at 6%" color="var(--ft-accent)" size={18} />
              </VStack>
            </>
          )}

          {/* Bar chart of cuts */}
          {totalMonthlySaving > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
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
                  <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)", className: "pnum" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `£${v}`} width={40} />
                  <Tooltip formatter={(v: number) => [formatBaseMoney(v), "Monthly saving"]} contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }} />
                  <Bar dataKey="saving" fill="var(--ft-green)" radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </Panel>
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
    <div className="space-y-1.5">
      <Panel title="Lump Sum Investment Calculator" padding="12px 16px">

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <SliderRow label="Lump Sum Amount" value={principal} min={100} max={100000} step={100} onChange={setPrincipal} display={formatBaseMoney(principal)} />
          <SliderRow label="Annual Return Rate" value={annualRate} min={1} max={20} step={0.5} onChange={setAnnualRate} display={`${annualRate}%`} />
          <SliderRow label="Investment Horizon (years)" value={years} min={1} max={40} step={1} onChange={setYears} display={`${years} yrs`} />
        </div>

        <div>
          {formulaBlock(
            <>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>
                FV = P × (1 + r)^n
              </div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-border2)", marginBottom: 14 }}>
                P=<span className="pnum">{formatBaseMoney(principal)}</span>, r=<span className="pnum">{annualRate}%</span>, n=<span className="pnum">{years}</span>yr
              </div>
              <VStack gap={12}>
                <BigNumber value={formatBaseMoney(Math.round(fv))} label="Future Value" color="var(--ft-accent)" size={28} />
                <BigNumber value={`+${formatBaseMoney(Math.abs(Math.round(interestEarned)))}`} label="Total Interest Earned" color="var(--ft-green)" size={20} />
                <BigNumber value={formatBaseMoney(Math.round(monthlyEq))} label="Monthly Equivalent" color="var(--ft-cyan)" size={16} />
              </VStack>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", marginTop: 6 }}>
                Monthly equivalent = what you'd need to invest monthly at the same rate to get the same result
              </div>
            </>
          )}
        </div>
      </div>
      </Panel>

      {/* Chart */}
      <Panel title="Growth Breakdown by Year" padding="12px 16px">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)", className: "pnum" }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              formatter={(v: number, name: string) => [formatBaseMoney(v), name === "principal" ? "Principal" : "Interest"]}
              contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", fontFamily: "var(--font-mono)", fontSize: 10 }}
            />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }} />
            <Bar dataKey="principal" stackId="a" fill="var(--ft-raised)" stroke="var(--ft-border2)" strokeWidth={1} />
            <Bar dataKey="interest" stackId="a" fill="var(--ft-green)" radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
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

  const maxMonths = Math.min(baseMonths, 120);
  const lineData = useMemo(() => {
    return Array.from({ length: maxMonths }, (_, i) => ({
      month: i + 1,
      baseBalance: baseSchedule[i]?.balance ?? 0,
      extraBalance: extraSchedule[i]?.balance ?? 0,
    }));
  }, [baseSchedule, extraSchedule, maxMonths]);

  const tableRows = baseSchedule.slice(0, 24);

  return (
    <div className="space-y-1.5">
      <Panel title="Debt Payoff Calculator" padding="12px 16px">

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <SliderRow label="Loan Amount" value={loanAmount} min={500} max={100000} step={500} onChange={setLoanAmount} display={formatBaseMoney(loanAmount)} />
          <SliderRow label="Interest Rate (APR %)" value={apr} min={0.5} max={40} step={0.5} onChange={setApr} display={`${apr}%`} />
          <SliderRow label="Monthly Payment" value={monthlyPayment} min={minPay} max={Math.max(loanAmount / 6, minPay + 500)} step={10} onChange={setMonthlyPayment} display={formatBaseMoney(effectivePayment)} />
          <SliderRow label="Extra Payment /month" value={extraPayment} min={0} max={2000} step={10} onChange={setExtraPayment} display={extraPayment > 0 ? `+${formatBaseMoney(Math.abs(extraPayment))}` : "£0"} />
        </div>

        <div>
          {formulaBlock(
            <>
              <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 12 }}>MINIMUM PAYMENT</div>
              <div style={{ ...mono, fontSize: 11, color: "var(--ft-amber)", marginBottom: 12 }}>
                <span className="pnum">{formatBaseMoney(minPay)}</span>/mo min to cover interest
              </div>
              <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <BigNumber value={`${baseMonths} mo`} label="Months to Payoff" color="var(--ft-text)" size={22} />
                <BigNumber value={formatBaseMoney(Math.round(baseTotalInterest))} label="Total Interest" color="var(--ft-red)" size={22} />
              </div>
              {extraPayment > 0 && (
                <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
                  <div style={{ ...mono, fontSize: 9, color: "var(--ft-green)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                    With +<span className="pnum">{formatBaseMoney(extraPayment)}</span>/mo
                  </div>
                  <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <BigNumber value={`-${monthsSaved} mo`} label="Months Saved" color="var(--ft-green)" />
                    <BigNumber value={`-${formatBaseMoney(Math.abs(Math.round(interestSaved)))}`} label="Interest Saved" color="var(--ft-green)" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </Panel>

      {/* Balance over time chart */}
      {lineData.length > 0 && (
        <Panel title="Balance Over Time" padding="12px 16px">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }} axisLine={false} tickLine={false} label={{ value: "Month", position: "insideBottomRight", fill: "var(--ft-dim)", fontSize: 8, fontFamily: "var(--font-mono)" }} />
              <YAxis tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)", className: "pnum" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                formatter={(v: number, name: string) => [formatBaseMoney(v), name === "baseBalance" ? "Min payment" : `+${formatBaseMoney(Math.abs(extraPayment))}/mo`]}
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
              <HStack gap={5} align="center">
                <div style={{ width: 16, height: 2, background: "var(--ft-red)" }} />
                <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>Minimum payment</span>
              </HStack>
              <HStack gap={5} align="center">
                <div style={{ width: 16, height: 2, background: "var(--ft-green)", borderTop: "1px dashed var(--ft-green)" }} />
                <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>With extra payment</span>
              </HStack>
            </div>
          )}
        </Panel>
      )}

      {/* Amortization table */}
      {tableRows.length > 0 && (
        <Panel title="Amortization Schedule (first 24 months)" padding="12px 16px">
          <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Month", "Payment", "Interest", "Principal", "Balance"].map((h) => (
                    <th key={h} style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "right", padding: "4px 10px", borderBottom: "1px solid var(--ft-border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <AmortTableRow key={row.month} row={row} isLastRow={row.month === baseMonths} />
                ))}
                {baseMonths > 24 && (
                  <tr>
                    <td colSpan={5} style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", padding: "6px 10px", textAlign: "center" }}>
                      + <span className="pnum">{baseMonths - 24}</span> more months not shown
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Tab: Inflation Impact ───────────────────────────────────────────────────

// ── Inflation Year Row ────────────────────────────────────────────────────

interface InflationYearRowProps {
  y: number;
  row: { realValue: number; futureNeeded: number; investedValue: number; investedReal: number };
  amount: number;
}

function InflationYearRow({ y, row, amount }: InflationYearRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr 1fr 1fr 1fr",
        padding: "4px 0",
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, transparent)"
          : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)" }}><span className="pnum">{y}</span></div>
      <div style={{ ...mono, fontSize: 10, color: "var(--ft-red)", textAlign: "right" }}><span className="pnum">{formatBaseMoney(row.realValue)}</span></div>
      <div style={{ ...mono, fontSize: 10, color: "var(--ft-amber)", textAlign: "right" }}><span className="pnum">{formatBaseMoney(row.futureNeeded)}</span></div>
      <div style={{ ...mono, fontSize: 10, color: "var(--ft-green)", textAlign: "right" }}><span className="pnum">{formatBaseMoney(row.investedValue)}</span></div>
      <div style={{ ...mono, fontSize: 10, color: row.investedReal > amount ? "var(--ft-cyan)" : "var(--ft-red)", textAlign: "right" }}><span className="pnum">{formatBaseMoney(row.investedReal)}</span></div>
    </div>
  );
}

function InflationTab() {
  const [amount, setAmount] = useState(10000);
  const [inflationRate, setInflationRate] = useState(2.5);
  const [investReturn, setInvestReturn] = useState(7);
  const [years, setYears] = useState(20);

  const data = useMemo(() => {
    return Array.from({ length: years + 1 }, (_, y) => {
      const realValue = amount * Math.pow(1 - inflationRate / 100, y);
      const futureNeeded = amount * Math.pow(1 + inflationRate / 100, y);
      const investedValue = amount * Math.pow(1 + investReturn / 100, y);
      const investedReal = investedValue / Math.pow(1 + inflationRate / 100, y);
      return {
        year: y,
        realValue: Math.round(realValue),
        futureNeeded: Math.round(futureNeeded),
        investedValue: Math.round(investedValue),
        investedReal: Math.round(investedReal),
      };
    });
  }, [amount, inflationRate, investReturn, years]);

  const finalReal = data[years]?.realValue ?? 0;
  const finalNeeded = data[years]?.futureNeeded ?? 0;
  const finalInvested = data[years]?.investedValue ?? 0;
  const finalInvestedReal = data[years]?.investedReal ?? 0;
  const realReturn = investReturn - inflationRate;

  return (
    <div className="space-y-1.5">
      <Panel title="Inflation Impact Calculator" padding="12px 16px">
      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <div>
          <SliderRow label="Lump Sum Today" value={amount} min={1000} max={500000} step={1000} onChange={setAmount} display={formatBaseMoney(amount)} />
          <SliderRow label="Inflation Rate (%/yr)" value={inflationRate} min={0} max={15} step={0.1} onChange={setInflationRate} display={`${inflationRate.toFixed(1)}%`} />
          <SliderRow label="Investment Return (%/yr)" value={investReturn} min={0} max={20} step={0.1} onChange={setInvestReturn} display={`${investReturn.toFixed(1)}%`} />
          <SliderRow label="Time Horizon (yrs)" value={years} min={1} max={50} step={1} onChange={setYears} display={`${years} yrs`} />

          {/* KPI tiles */}
          <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
            <InflationKpiTile
              label="Real value of cash in hand"
              value={formatBaseMoney(finalReal)}
              color="var(--ft-red)"
              note={`Lost ${formatBaseMoney(amount - finalReal)} to inflation`}
            />
            <InflationKpiTile
              label="$ needed for same purchasing power"
              value={formatBaseMoney(finalNeeded)}
              color="var(--ft-amber)"
              note={`${inflationRate.toFixed(1)}%/yr price rise`}
            />
            <InflationKpiTile
              label="Invested (nominal)"
              value={formatBaseMoney(finalInvested)}
              color="var(--ft-green)"
              note={`${investReturn.toFixed(1)}%/yr gross return`}
            />
            <InflationKpiTile
              label="Invested (real, inflation-adj)"
              value={formatBaseMoney(finalInvestedReal)}
              color={finalInvestedReal > amount ? "var(--ft-cyan)" : "var(--ft-red)"}
              note={`Real return: ${realReturn.toFixed(1)}%/yr`}
            />
          </div>
        </div>

        <Panel title="Purchasing Power Over Time" padding="12px 16px">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `Yr ${v}`}
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)", className: "pnum" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
                width={46}
              />
              <Tooltip
                contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                formatter={(v: number, name: string) => [formatBaseMoney(v), name]}
              />
              <Line type="monotone" dataKey="realValue" name="Real value (cash)" stroke="var(--ft-red)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="investedValue" name="Invested (nominal)" stroke="var(--ft-green)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="investedReal" name="Invested (real)" stroke="var(--ft-cyan)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
          <HStack gap={16} wrap marginTop={8}>
            <InflationLegendItem color="var(--ft-red)" label="Real value of cash" />
            <InflationLegendItem color="var(--ft-green)" label="Invested (nominal)" />
            <InflationLegendItem color="var(--ft-cyan)" label="Invested (real)" />
          </HStack>
        </Panel>
      </div>
      </Panel>

      {/* Year-by-year snapshot */}
      <Panel title="Year-by-Year Snapshot" padding="14px 16px">
        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr", borderBottom: "1px solid var(--ft-border)", paddingBottom: 6, marginBottom: 4 }}>
          {["Year", "Cash real value", "Future equiv.", "Invested", "Invested (real)"].map((h, i) => (
            <div key={h} style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" as const, textAlign: i > 0 ? "right" : "left" }}>{h}</div>
          ))}
        </div>
        {[1, 2, 3, 5, 10, 15, 20, 25, 30].filter(y => y <= years).map(y => {
          const row = data[y];
          if (!row) return null;
          return (
            <InflationYearRow key={y} y={y} row={row} amount={amount} />
          );
        })}
      </Panel>
    </div>
  );
}

// ── Portfolio Shock Tab ────────────────────────────────────────────────────

const MARKET_SCENARIOS = [
  { label: "2008 GFC", change: -56.8 },
  { label: "COVID Crash", change: -33.9 },
  { label: "2022 Bear", change: -25.4 },
  { label: "10% Pullback", change: -10 },
  { label: "20% Correction", change: -20 },
  { label: "+10% Rally", change: 10 },
  { label: "+20% Bull", change: 20 },
];

// ── Portfolio KPI Tile ─────────────────────────────────────────────────────

interface PortfolioKpiTileProps {
  label: string;
  value: string;
  color: string;
  /** Last tile in the strip: no right rule (the frame closes it). */
  isLast?: boolean;
  sub?: string;
}

function PortfolioKpiTile({ label, value, color, isLast = false, sub }: PortfolioKpiTileProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "var(--ft-surface)",
        borderRight: isLast ? "none" : "1px solid var(--ft-border)",
        padding: 14,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1 }}>
        <span className="pnum">{value}</span>
      </div>
      {sub && <div className="pnum" style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PortfolioShockTab() {
  const { data: investments } = useListInvestments();
  const { data: summary } = useGetInvestmentSummary();
  const [customPct, setCustomPct] = useState("0");
  const [selected, setSelected] = useState<number | null>(null);

  const totalValue = (summary as { totalValueBase?: number } | undefined)?.totalValueBase ?? 0;

  const scenarios = useMemo(() => {
    const pct = parseFloat(customPct);
    const custom = !isNaN(pct) && pct !== 0 ? [{ label: `Custom (${pct >= 0 ? "+" : ""}${pct}%)`, change: pct }] : [];
    return [...MARKET_SCENARIOS, ...custom];
  }, [customPct]);

  const scenarioImpact = useMemo(() => {
    if (!investments || totalValue <= 0) return [];
    return scenarios.map((s) => {
      const delta = totalValue * (s.change / 100);
      return { ...s, delta, after: totalValue + delta };
    });
  }, [scenarios, investments, totalValue]);

  const byPosition = useMemo(() => {
    if (!investments || totalValue <= 0) return [];
    const chg = selected != null ? (scenarioImpact[selected]?.change ?? 0) : 0;
    const byTicker = new Map<string, { ticker: string; value: number; delta: number; after: number }>();
    for (const inv of investments as Array<{ ticker: string; baseEquivalent: number }>) {
      const prev = byTicker.get(inv.ticker) ?? { ticker: inv.ticker, value: 0, delta: 0, after: 0 };
      const d = inv.baseEquivalent * (chg / 100);
      byTicker.set(inv.ticker, { ticker: inv.ticker, value: prev.value + inv.baseEquivalent, delta: prev.delta + d, after: prev.after + inv.baseEquivalent + d });
    }
    return [...byTicker.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [investments, totalValue, scenarioImpact, selected]);

  const activeScenario = selected != null ? scenarioImpact[selected] : null;

  if (totalValue === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <div style={{ ...mono, fontSize: 11, color: "var(--ft-border2)", marginBottom: 12, letterSpacing: "0.06em" }}>
          {`┌─────────────────────────────┐`}
          <br />
          {`│   PORTFOLIO  EMPTY          │`}
          <br />
          {`│   NO POSITIONS LOADED       │`}
          <br />
          {`└─────────────────────────────┘`}
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          No positions found
        </div>
        <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", maxWidth: 320, margin: "0 auto" }}>
          Add positions in the Portfolio tab to use this simulator.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Panel title={<>Current Portfolio: <span className="pnum">{formatBaseMoney(totalValue)}</span> · Select a scenario</>} padding={16}>
        <HStack gap={8} wrap marginBottom={12}>
          {MARKET_SCENARIOS.map((s, i) => (
            <ScenarioButton
              key={s.label}
              label={s.label}
              change={s.change}
              isSelected={selected === i}
              onClick={() => setSelected(selected === i ? null : i)}
            />
          ))}
        </HStack>
        <HStack gap={8} align="center">
          <span style={{ ...mono, fontSize: 10, color: "var(--ft-dim)" }}>Custom change %:</span>
          <input
            type="number"
            value={customPct}
            onChange={(e) => { setCustomPct(e.target.value); setSelected(scenarioImpact.length - 1); }}
            step="0.1"
            style={{ width: 80, height: 28, fontSize: 11, ...mono, background: "var(--ft-base)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "0 8px" }}
          />
        </HStack>
      </Panel>

      {activeScenario && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <PortfolioKpiTile
            label="Portfolio Before"
            value={formatBaseMoney(totalValue)}
            color="var(--ft-text)"
          />
          <PortfolioKpiTile
            label={`Delta — ${activeScenario.label}`}
            value={`${activeScenario.delta >= 0 ? "+" : ""}${formatBaseMoney(activeScenario.delta)}`}
            color={activeScenario.delta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            sub={`${activeScenario.change >= 0 ? "+" : ""}${activeScenario.change}%`}
          />
          <PortfolioKpiTile
            label="Portfolio After"
            value={formatBaseMoney(activeScenario.after)}
            color={activeScenario.after >= totalValue ? "var(--ft-green)" : "var(--ft-red)"}
            isLast
          />
        </div>
      )}

      {activeScenario && byPosition.length > 0 && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)" }}>
          <PanelHeader>Impact by Position — {activeScenario.label}</PanelHeader>
          <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, ...mono }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ft-border)" }}>
                  {["Ticker", "Current Value", "Change", "After"].map((h) => (
                    <th key={h} style={{ padding: "5px 12px", textAlign: h === "Ticker" ? "left" : "right", fontSize: 9, color: "var(--ft-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPosition.map((pos) => (
                  <PositionImpactRow key={pos.ticker} pos={pos} />
                ))}
              </tbody>
            </table>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byPosition} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,110,123,0.15)" />
              <XAxis dataKey="ticker" tick={{ fontSize: 10, fill: "var(--ft-dim)" }} />
              <YAxis tick={{ fontSize: 9, fill: "var(--ft-dim)" }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} width={48} />
              <ReferenceLine y={0} stroke="rgba(99,110,123,0.4)" />
              <Tooltip contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontSize: 10, fontFamily: "var(--font-mono)" }} formatter={(v: number) => [`${v >= 0 ? "+" : ""}${formatBaseMoney(v)}`, "Impact"]} />
              <Bar dataKey="delta" fill="var(--ft-blue)" radius={[1, 1, 0, 0]}
                label={false}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                isAnimationActive={false} {...{ fill: "var(--ft-blue)" } as any}
              />
            </BarChart>
          </ResponsiveContainer>
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
    { id: "INFLATION", label: "Inflation Impact" },
    { id: "PORTFOLIO_SHOCK", label: "Portfolio Shock" },
  ];

  return (
    <div>
      <PageHeader
        icon={FlaskConical}
        title="What-If Simulator"
        subtitle="Model scenarios · project outcomes · make informed decisions"
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const msgs: Record<string, string | null> = {
          market:  "Model income growth and lump sum investment scenarios to project how much additional capital you could deploy into positions.",
          budget:  "Use Expense Cut to identify categories where a small reduction delivers the biggest monthly cash-flow improvement.",
          wealth:  "Lump Sum and Portfolio Shock tabs model how one-off events and market downturns affect your FIRE trajectory over time.",
          social:  null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 12px", marginBottom: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--ft-border)",
        marginBottom: 28,
        gap: 0,
        overflowX: "auto",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...mono,
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
              padding: "10px 14px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--ft-accent)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--ft-accent)" : "var(--ft-dim)",
              cursor: "pointer",
              whiteSpace: "nowrap" as const,
              flexShrink: 0,
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
      {activeTab === "INFLATION" && (
        <InflationTab />
      )}
      {activeTab === "PORTFOLIO_SHOCK" && (
        <PortfolioShockTab />
      )}
    </div>
  );
}
