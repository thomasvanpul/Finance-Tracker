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

  return (
    <WidgetShell title="Calendar" href="/transactions" linkLabel="→ Transactions" isLoading={isLoading}>
      {!isLoading && (
        <div style={{ padding: "10px 12px 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <button
              onClick={handlePrev}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ft-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                padding: "2px 6px",
                lineHeight: 1,
              }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ft-text)",
              }}
            >
              {monthLabel}
            </span>
            <button
              onClick={handleNext}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ft-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                padding: "2px 6px",
                lineHeight: 1,
              }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

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
              const inMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);
              const isSelected = selectedDay ? isSameDay(selectedDay, day) : false;
              const totals = dayMap.get(key);
              const incomeH =
                totals && maxIncome > 0 ? Math.max(2, Math.round((totals.income / maxIncome) * 14)) : 0;
              const expenseH =
                totals && maxExpense > 0 ? Math.max(2, Math.round((totals.expense / maxExpense) * 14)) : 0;

              return (
                <div
                  key={key}
                  onClick={() => handleDayClick(day)}
                  style={{
                    height: 52,
                    background: isSelected
                      ? "var(--ft-raised)"
                      : "var(--ft-surface)",
                    border: isToday
                      ? "1px solid var(--ft-accent)"
                      : isSelected
                      ? "1px solid var(--ft-border2)"
                      : "1px solid var(--ft-border)",
                    opacity: inMonth ? 1 : 0.3,
                    cursor: inMonth ? "pointer" : "default",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "4px 4px 3px",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: isToday ? "var(--ft-accent)" : "var(--ft-muted)",
                      fontWeight: isToday ? 700 : 400,
                      lineHeight: 1,
                    }}
                  >
                    {format(day, "d")}
                  </span>

                  {(incomeH > 0 || expenseH > 0) && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 2,
                        height: 14,
                      }}
                    >
                      {incomeH > 0 && (
                        <div
                          style={{
                            flex: 1,
                            height: incomeH,
                            background: "var(--ft-green)",
                            opacity: 0.75,
                            borderRadius: 1,
                          }}
                        />
                      )}
                      {expenseH > 0 && (
                        <div
                          style={{
                            flex: 1,
                            height: expenseH,
                            background: "var(--ft-red)",
                            opacity: 0.75,
                            borderRadius: 1,
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
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
              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                {selectedTotals.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      padding: "6px 10px",
                      borderBottom: "1px solid var(--ft-border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
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
      )}
    </WidgetShell>
  );
}
