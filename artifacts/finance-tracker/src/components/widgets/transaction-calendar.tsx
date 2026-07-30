import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

type Transaction = {
  id: number;
  date: string;
  description: string;
  type: "income" | "expense" | "transfer";
  category: string;
  gbpValue: number;
  nativeAmount: number;
  currency: string;
  accountName: string;
};

type DayTotals = {
  income: number;
  expense: number;
  transactions: Transaction[];
};

const DOW_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_COLORS: Record<string, string> = {
  income: "var(--ft-green)",
  expense: "var(--ft-red)",
  transfer: "var(--ft-accent)",
};

function buildDayMap(transactions: Transaction[]): Map<string, DayTotals> {
  const map = new Map<string, DayTotals>();
  for (const tx of transactions) {
    const key = tx.date;
    const existing = map.get(key) ?? { income: 0, expense: 0, transactions: [] };
    const updated: DayTotals = {
      income: tx.type === "income" ? existing.income + tx.gbpValue : existing.income,
      expense: tx.type === "expense" ? existing.expense + tx.gbpValue : existing.expense,
      transactions: [...existing.transactions, tx],
    };
    map.set(key, updated);
  }
  return map;
}

function getMonthMaxes(
  days: Date[],
  dayMap: Map<string, DayTotals>,
  currentMonth: Date,
): { maxIncome: number; maxExpense: number } {
  let maxIncome = 0;
  let maxExpense = 0;
  for (const day of days) {
    if (!isSameMonth(day, currentMonth)) continue;
    const key = format(day, "yyyy-MM-dd");
    const totals = dayMap.get(key);
    if (!totals) continue;
    if (totals.income > maxIncome) maxIncome = totals.income;
    if (totals.expense > maxExpense) maxExpense = totals.expense;
  }
  return { maxIncome, maxExpense };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type CalendarDayCellProps = {
  day: Date;
  currentMonth: Date;
  today: Date;
  isSelected: boolean;
  totals: DayTotals | undefined;
  maxIncome: number;
  maxExpense: number;
  onClick: (day: Date) => void;
};

function CalendarDayCell({
  day,
  currentMonth,
  today,
  isSelected,
  totals,
  maxIncome,
  maxExpense,
  onClick,
}: CalendarDayCellProps) {
  const [hov, setHov] = useState(false);
  const key = format(day, "yyyy-MM-dd");
  const inMonth = isSameMonth(day, currentMonth);
  const isToday = isSameDay(day, today);

  const incomeH =
    totals && maxIncome > 0 ? Math.max(2, Math.round((totals.income / maxIncome) * 14)) : 0;
  const expenseH =
    totals && maxExpense > 0 ? Math.max(2, Math.round((totals.expense / maxExpense) * 14)) : 0;

  const hasActivity = incomeH > 0 || expenseH > 0;
  const netDay = totals ? totals.income - totals.expense : 0;
  const txCount = totals?.transactions.length ?? 0;

  return (
    <div
      key={key}
      onClick={() => onClick(day)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 48,
        background: isSelected
          ? "color-mix(in srgb, var(--ft-accent) 10%, var(--ft-raised))"
          : hov && inMonth
            ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
            : hasActivity
              ? "color-mix(in srgb, var(--ft-border) 60%, var(--ft-surface))"
              : "var(--ft-surface)",
        border: isToday
          ? "1px solid var(--ft-accent)"
          : isSelected
            ? "1px solid var(--ft-accent)"
            : "1px solid var(--ft-border)",
        opacity: inMonth ? 1 : 0.25,
        cursor: inMonth ? "pointer" : "default",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "3px 3px 2px",
        boxSizing: "border-box",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: isToday ? "var(--ft-accent)" : inMonth ? "var(--ft-muted)" : "var(--ft-dim)",
          fontWeight: isToday ? 700 : 400,
          lineHeight: 1,
        }}>
          {format(day, "d")}
        </span>
        {txCount > 1 && inMonth && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 7,
            color: "var(--ft-dim)",
            lineHeight: 1,
          }}>
            {txCount}
          </span>
        )}
      </div>

      {hasActivity && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 12 }}>
          {incomeH > 0 && (
            <div style={{ flex: 1, height: incomeH, background: "var(--ft-green)", opacity: 0.8, borderRadius: 1 }} />
          )}
          {expenseH > 0 && (
            <div style={{ flex: 1, height: expenseH, background: "var(--ft-red)", opacity: 0.8, borderRadius: 1 }} />
          )}
        </div>
      )}

      {hasActivity && netDay !== 0 && (
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 7,
          color: netDay >= 0 ? "var(--ft-green)" : "var(--ft-red)",
          lineHeight: 1,
          textAlign: "right",
          opacity: 0.8,
        }}>
          {netDay >= 0 ? "+" : "−"}{Math.abs(netDay) >= 1000 ? `${(Math.abs(netDay) / 1000).toFixed(1)}k` : Math.abs(netDay).toFixed(0)}
        </div>
      )}
    </div>
  );
}

type DayDetailRowProps = {
  tx: Transaction;
};

function DayDetailRow({ tx }: DayDetailRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "6px 10px",
        borderBottom: "1px solid var(--ft-border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: TYPE_COLORS[tx.type] ?? "var(--ft-dim)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-text)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tx.description}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--ft-dim)",
          flexShrink: 0,
        }}
      >
        {tx.category}
      </span>
      <span
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: TYPE_COLORS[tx.type] ?? "var(--ft-muted)",
          flexShrink: 0,
          fontWeight: 600,
        }}
      >
        {tx.type === "expense" ? "−" : "+"}
        {formatGbp(tx.gbpValue)}
      </span>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function TransactionCalendarWidget() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const dateFrom = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const dateTo = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data, isLoading } = useListTransactions({ dateFrom, dateTo });

  const transactions = (data ?? []) as unknown as Transaction[];
  const dayMap = buildDayMap(transactions);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = startOfWeek(monthEnd, { weekStartsOn: 1 });
  const gridEndFull = new Date(gridEnd);
  gridEndFull.setDate(gridEnd.getDate() + 6);

  const days = eachDayOfInterval({ start: gridStart, end: gridEndFull });
  const { maxIncome, maxExpense } = getMonthMaxes(days, dayMap, currentMonth);

  const today = new Date();
  const monthLabel = format(currentMonth, "MMM yyyy");

  function handlePrev() {
    setCurrentMonth((m) => subMonths(m, 1));
    setSelectedDay(null);
  }

  function handleNext() {
    setCurrentMonth((m) => addMonths(m, 1));
    setSelectedDay(null);
  }

  function handleDayClick(day: Date) {
    if (!isSameMonth(day, currentMonth)) return;
    setSelectedDay((prev) => (prev && isSameDay(prev, day) ? null : day));
  }

  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedTotals = selectedKey ? dayMap.get(selectedKey) : undefined;

  const monthIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
  const monthExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
  const monthNet = monthIncome - monthExpenses;
  const activeDays = [...dayMap.keys()].filter(k => {
    const d = new Date(k);
    return isSameMonth(d, currentMonth);
  }).length;
  const avgDailySpend = activeDays > 0 ? monthExpenses / activeDays : 0;

  return (
    <WidgetShell title="Calendar" href="/transactions" linkLabel="→ Transactions" isLoading={isLoading} accent="var(--ft-accent)">
      {!isLoading && (
        <div>
          {/* Month nav + summary */}
          <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 6px" }}>
              <button
                onClick={handlePrev}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 13, padding: "2px 6px", lineHeight: 1 }}
                aria-label="Previous month"
              >
                ‹
              </button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-text)" }}>
                {monthLabel}
              </span>
              <button
                onClick={handleNext}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 13, padding: "2px 6px", lineHeight: 1 }}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            {transactions.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", borderTop: "1px solid var(--ft-border)" }}>
                {[
                  { label: "INCOME", value: `+${formatGbp(monthIncome)}`, color: "var(--ft-green)" },
                  { label: "SPEND",  value: `-${formatGbp(monthExpenses)}`, color: "var(--ft-red)" },
                  { label: "NET",    value: `${monthNet >= 0 ? "+" : ""}${formatGbp(monthNet)}`, color: monthNet >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
                  { label: "DAYS",   value: String(activeDays), color: "var(--ft-accent)" },
                  { label: "AVG/D",  value: `-${formatGbp(avgDailySpend)}`, color: "var(--ft-amber)" },
                ].map((item, i) => (
                  <div key={item.label} style={{ padding: "6px 10px", borderRight: i < 4 ? "1px solid var(--ft-border)" : undefined }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", marginBottom: 2 }}>
                      {item.label}
                    </div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: item.color }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: "10px 12px 12px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 2,
                marginBottom: 2,
              }}
            >
              {DOW_HEADERS.map((h) => (
                <div
                  key={h}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: "var(--ft-dim)",
                    textAlign: "center",
                    paddingBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 2,
              }}
            >
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const isSelected = selectedDay ? isSameDay(selectedDay, day) : false;
                const totals = dayMap.get(key);

                return (
                  <CalendarDayCell
                    key={key}
                    day={day}
                    currentMonth={currentMonth}
                    today={today}
                    isSelected={isSelected}
                    totals={totals}
                    maxIncome={maxIncome}
                    maxExpense={maxExpense}
                    onClick={handleDayClick}
                  />
                );
              })}
            </div>

            {selectedDay && selectedTotals && (
              <div
                style={{
                  marginTop: 10,
                  border: "1px solid var(--ft-border)",
                  background: "var(--ft-raised)",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid var(--ft-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ft-dim)",
                    }}
                  >
                    {format(selectedDay, "d MMM yyyy")}
                  </span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {selectedTotals.income > 0 && (
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>
                        +{formatGbp(selectedTotals.income)}
                      </span>
                    )}
                    {selectedTotals.expense > 0 && (
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)" }}>
                        −{formatGbp(selectedTotals.expense)}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--ft-dim)",
                      }}
                    >
                      {selectedTotals.transactions.length} txn
                      {selectedTotals.transactions.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div style={{ maxHeight: 180, overflowY: "auto" }}>
                  {selectedTotals.transactions.map((tx) => (
                    <DayDetailRow key={tx.id} tx={tx} />
                  ))}
                </div>
              </div>
            )}

            {selectedDay && !selectedTotals && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--ft-border)",
                  background: "var(--ft-raised)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ft-dim)",
                  textAlign: "center",
                }}
              >
                No transactions on {format(selectedDay, "d MMM")}
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
