export type StrategyMode = "snowball" | "avalanche";

export interface StrategyDebt {
  id: number;
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
}

export interface AmortRow {
  month: number;
  [key: string]: number;
  total: number;
}

export interface PayoffResult {
  months: number;
  totalInterest: number;
  payoffOrder: { id: number; name: string; month: number; interestPaid: number }[];
  chart: { month: number; total: number }[];
  amortization: AmortRow[];
}

export function runPayoffStrategy(
  debts: StrategyDebt[],
  monthlyBudget: number,
  mode: StrategyMode
): PayoffResult {
  const MAX_MONTHS = 360;

  const state = debts.map(d => ({
    ...d,
    remaining: d.balance,
    interestAccrued: 0,
    paidOffMonth: null as number | null,
  }));

  const payoffOrder: PayoffResult["payoffOrder"] = [];
  const chart: PayoffResult["chart"] = [];
  const amortRows: AmortRow[] = [];

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const alive = state.filter(d => d.remaining > 0);
    if (alive.length === 0) break;

    for (const d of alive) {
      const monthlyRate = d.apr / 100 / 12;
      const interest = d.remaining * monthlyRate;
      d.remaining += interest;
      d.interestAccrued += interest;
    }

    let budgetLeft = monthlyBudget;
    for (const d of alive) {
      const minPay = Math.min(d.minimumPayment, d.remaining);
      d.remaining -= minPay;
      d.remaining = Math.max(d.remaining, 0);
      budgetLeft -= minPay;
    }

    if (budgetLeft > 0) {
      const stillAlive = state.filter(d => d.remaining > 0);
      let target: typeof state[number] | undefined;
      if (mode === "snowball") {
        target = stillAlive.slice().sort((a, b) => a.remaining - b.remaining)[0];
      } else {
        target = stillAlive.slice().sort((a, b) => b.apr - a.apr)[0];
      }
      if (target) {
        const extra = Math.min(budgetLeft, target.remaining);
        target.remaining -= extra;
        target.remaining = Math.max(target.remaining, 0);
      }
    }

    for (const d of state) {
      if (d.remaining <= 0.005 && d.paidOffMonth === null) {
        d.remaining = 0;
        d.paidOffMonth = month;
        payoffOrder.push({ id: d.id, name: d.name, month, interestPaid: d.interestAccrued });
      }
    }

    const totalRemaining = state.reduce((s, d) => s + d.remaining, 0);
    chart.push({ month, total: Math.round(totalRemaining * 100) / 100 });

    if (month <= 12) {
      const row: AmortRow = { month, total: Math.round(totalRemaining * 100) / 100 };
      for (const d of state) {
        row[d.id] = Math.round(d.remaining * 100) / 100;
      }
      amortRows.push(row);
    }
  }

  for (const d of state) {
    if (d.paidOffMonth === null && d.remaining <= 0.005) {
      d.paidOffMonth = MAX_MONTHS;
      payoffOrder.push({ id: d.id, name: d.name, month: MAX_MONTHS, interestPaid: d.interestAccrued });
    }
  }

  const totalMonths = payoffOrder.length > 0
    ? Math.max(...payoffOrder.map(p => p.month))
    : MAX_MONTHS;

  const totalInterest = state.reduce((s, d) => s + d.interestAccrued, 0);

  return {
    months: totalMonths,
    totalInterest,
    payoffOrder: [...payoffOrder].sort((a, b) => a.month - b.month),
    chart,
    amortization: amortRows,
  };
}
