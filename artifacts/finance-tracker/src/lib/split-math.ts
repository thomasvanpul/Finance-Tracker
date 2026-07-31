export interface BalanceExpense {
  paidBy: string;
  amount: number;
  shares: Record<string, number>;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export function computeBalances(
  members: string[],
  expenses: BalanceExpense[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const m of members) balances[m] = 0;

  for (const exp of expenses) {
    if (balances[exp.paidBy] !== undefined) {
      balances[exp.paidBy] += exp.amount;
    }
    for (const [member, share] of Object.entries(exp.shares)) {
      if (balances[member] !== undefined) {
        balances[member] -= share;
      }
    }
  }
  return balances;
}

export function minimumTransfers(balances: Record<string, number>): Transfer[] {
  const transfers: Transfer[] = [];
  const pos: Array<{ name: string; amount: number }> = [];
  const neg: Array<{ name: string; amount: number }> = [];

  for (const [name, bal] of Object.entries(balances)) {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > 0.005) pos.push({ name, amount: rounded });
    else if (rounded < -0.005) neg.push({ name, amount: rounded });
  }

  pos.sort((a, b) => b.amount - a.amount);
  neg.sort((a, b) => a.amount - b.amount);

  let pi = 0;
  let ni = 0;
  while (pi < pos.length && ni < neg.length) {
    const creditor = pos[pi];
    const debtor = neg[ni];
    const transfer = Math.min(creditor.amount, Math.abs(debtor.amount));
    if (transfer > 0.005) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    creditor.amount -= transfer;
    debtor.amount += transfer;
    if (Math.abs(creditor.amount) < 0.005) pi++;
    if (Math.abs(debtor.amount) < 0.005) ni++;
  }

  return transfers;
}
