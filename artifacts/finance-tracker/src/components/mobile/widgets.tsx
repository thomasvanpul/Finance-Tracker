import { useMemo } from "react";
import { useGetDashboard, useListTransactions, useListAccounts, useListGoals, useListUpcoming, useListBudgets } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { usePrivacy } from "@/contexts/privacy-context";

function today() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - new Date(today()).getTime();
  return Math.ceil(diff / 86400000);
}

const CARD_COLORS = ["#3B82F6", "#F97316", "#4ADE80", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

function ProgressRing({ pct, size = 48, stroke = 5 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct >= 100 ? "var(--ft-green)" : pct >= 70 ? "var(--ft-accent)" : "var(--ft-accent)";
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ft-raised)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(pct / 100, 1))}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.1s ease" }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle"
        style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, fill: "var(--ft-text)" }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function NetWorthWidget() {
  const { privacy } = usePrivacy();
  const { data: dash } = useGetDashboard();
  const netWorth  = dash?.netWorth ?? 0;
  const netSavings = dash?.thisMonth?.netSavings ?? 0;
  const positive   = netSavings >= 0;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, padding: "20px 20px 16px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
        Net Worth
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {privacy ? "••••••" : formatGbp(netWorth)}
      </div>
      {netSavings !== 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 12, color: positive ? "var(--ft-green)" : "var(--ft-red)" }}>
          {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          <span>{positive ? "+" : ""}{privacy ? "••••" : formatGbp(netSavings)} this month</span>
        </div>
      )}
    </div>
  );
}

export function ThisMonthWidget() {
  const { privacy } = usePrivacy();
  const { data: dash } = useGetDashboard();
  const income     = dash?.thisMonth?.income ?? 0;
  const expenses   = dash?.thisMonth?.expenses ?? 0;
  const netSavings = dash?.thisMonth?.netSavings ?? 0;
  const savingsRate = dash?.thisMonth?.savingsRate ?? 0;
  const spendRatio  = income > 0 ? Math.min(expenses / income, 1) : 0;
  const positive    = netSavings >= 0;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 14 }}>
        This Month
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "var(--ft-dim)" }}>Income</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-green)" }}>
            +{privacy ? "••••" : formatGbp(income)}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--ft-dim)" }}>Spent</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: spendRatio > 0.9 ? "var(--ft-red)" : spendRatio > 0.7 ? "var(--ft-amber)" : "var(--ft-text)" }}>
              −{privacy ? "••••" : formatGbp(expenses)}
            </span>
          </div>
          {income > 0 && (
            <div style={{ height: 4, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, width: `${spendRatio * 100}%`, background: spendRatio > 0.9 ? "var(--ft-red)" : spendRatio > 0.7 ? "var(--ft-amber)" : "var(--ft-accent)" }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid var(--ft-border)" }}>
          <span style={{ fontSize: 13, color: "var(--ft-dim)" }}>Saved</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>{Math.round(savingsRate)}%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: positive ? "var(--ft-green)" : "var(--ft-red)" }}>
              {positive ? "+" : "−"}{privacy ? "••••" : formatGbp(Math.abs(netSavings))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountsWidget() {
  const { privacy } = usePrivacy();
  const { data: accounts = [] } = useListAccounts();
  if (accounts.length === 0) return null;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 8px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
        Accounts
      </div>
      <div style={{ display: "flex", overflowX: "auto", gap: 10, padding: "0 16px 16px", scrollbarWidth: "none" }}>
        {accounts.map((acc, i) => (
          <div key={acc.id} style={{
            minWidth: 140, borderRadius: 10, padding: "14px 14px 12px",
            background: CARD_COLORS[i % CARD_COLORS.length] + "22",
            border: `1px solid ${CARD_COLORS[i % CARD_COLORS.length]}44`,
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, color: "var(--ft-dim)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: acc.gbpEquivalent == null ? "var(--ft-dim)" : "var(--ft-text)" }}>
              {privacy ? "••••" : acc.gbpEquivalent == null ? "—" : formatGbp(acc.gbpEquivalent)}
            </div>
            {acc.currency !== "GBP" && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginTop: 2 }}>
                {acc.currency} {privacy ? "••••" : acc.balance.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoalsWidget() {
  const { data: goals = [] } = useListGoals();
  if (goals.length === 0) return null;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 8px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
        Goals
      </div>
      <div style={{ display: "flex", overflowX: "auto", gap: 10, padding: "0 16px 16px", scrollbarWidth: "none" }}>
        {goals.map(goal => {
          const pct = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
          return (
            <div key={goal.id} style={{ minWidth: 100, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <ProgressRing pct={pct} />
              <div style={{ fontSize: 11, color: "var(--ft-text)", textAlign: "center", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {goal.emoji ? `${goal.emoji} ` : ""}{goal.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UpcomingWidget() {
  const { data: items = [] } = useListUpcoming();
  const next = useMemo(() => {
    const t = today();
    return [...items]
      .filter(it => it.dueDate >= t && it.status !== "paid")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [items]);
  if (next.length === 0) return null;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 4px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
        Upcoming
      </div>
      {next.map((it, i) => {
        const days = daysUntil(it.dueDate);
        const isLast = i === next.length - 1;
        const isIncome = it.type === "income";
        return (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
            <div style={{ minWidth: 36, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: days <= 3 ? "var(--ft-red)" : "var(--ft-text)", lineHeight: 1 }}>
                {days === 0 ? "!" : days}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" }}>
                {days === 0 ? "today" : "days"}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.description}</div>
              <div style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "capitalize" }}>{it.category}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: it.gbpEquivalent == null ? "var(--ft-dim)" : isIncome ? "var(--ft-green)" : "var(--ft-text)", flexShrink: 0 }}>
              {it.gbpEquivalent == null
                ? "—"
                : `${isIncome ? "+" : "−"}${formatGbp(it.gbpEquivalent)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RecentTxnsWidget({ onViewAll }: { onViewAll: () => void }) {
  const { data: txns = [] } = useListTransactions({ dateFrom: firstOfMonth(), dateTo: today() });
  const recent = useMemo(() => txns.slice(0, 6), [txns]);
  if (recent.length === 0) return null;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 4px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Recent</div>
        <button onClick={onViewAll} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--ft-accent)", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase" }}>
          See all →
        </button>
      </div>
      {recent.map((tx, i) => {
        const isIncome = tx.type === "income";
        const isLast = i === recent.length - 1;
        return (
          <div key={tx.id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: isIncome ? "color-mix(in srgb, var(--ft-green) 12%, transparent)" : "var(--ft-raised)", border: `1px solid ${isIncome ? "color-mix(in srgb, var(--ft-green) 20%, transparent)" : "var(--ft-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: isIncome ? "var(--ft-green)" : "var(--ft-dim)", flexShrink: 0 }}>
              {(tx.category?.[0] ?? tx.description?.[0] ?? "·").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description || tx.category || "Transaction"}</div>
              <div style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "capitalize" }}>{tx.category || "Uncategorised"}</div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: tx.gbpValue == null ? "var(--ft-dim)" : isIncome ? "var(--ft-green)" : "var(--ft-text)", flexShrink: 0 }}>
              {tx.gbpValue == null ? "—" : `${isIncome ? "+" : "−"}${formatGbp(tx.gbpValue)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BudgetWidget() {
  const { data: rawBudgets = [] } = useListBudgets();
  const { data: txns = [] } = useListTransactions({ dateFrom: firstOfMonth(), dateTo: today() });
  const budgets = useMemo(() => rawBudgets.map(b => ({
    id: b.id,
    category: b.category ?? "",
    limit: (b as any).monthlyLimit ?? 0,
  })), [rawBudgets]);
  const spendByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of txns) {
      if (tx.type === "expense") {
        const cat = (tx.category ?? "Uncategorised").toLowerCase();
        map[cat] = (map[cat] ?? 0) + (tx.gbpValue ?? 0);
      }
    }
    return map;
  }, [txns]);
  if (budgets.length === 0) return null;
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 4px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Budget</div>
      {budgets.slice(0, 5).map((b, i) => {
        const spent = spendByCategory[b.category.toLowerCase()] ?? 0;
        const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
        const color = pct >= 100 ? "var(--ft-red)" : pct >= 80 ? "var(--ft-amber)" : "var(--ft-green)";
        const isLast = i === Math.min(budgets.length, 5) - 1;
        return (
          <div key={b.id} style={{ padding: "10px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--ft-text)", textTransform: "capitalize" }}>{b.category}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color }}>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(pct, 100)}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
