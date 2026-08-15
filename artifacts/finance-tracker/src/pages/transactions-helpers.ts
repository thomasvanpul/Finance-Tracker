// Types, constants, and helpers for the Transactions page.
// Extracted from pages/transactions.tsx. No behaviour change.

export type TxType = "income" | "expense" | "transfer";
export type Currency = "GBP" | "USD" | "EUR" | "MYR" | "CNY" | "JPY" | "AUD" | "CAD" | "SGD" | "HKD" | "THB" | "INR";

export interface TxForm {
  date: string;
  description: string;
  type: TxType;
  category: string;
  accountId: string;
  nativeAmount: string;
  currency: Currency;
}

export interface TxFormErrors {
  date?: string;
  description?: string;
  category?: string;
  accountId?: string;
  nativeAmount?: string;
}

export const EMPTY_ERRORS: TxFormErrors = {};

export function validateTxField(field: keyof TxFormErrors, value: string, isEdit: boolean): string | undefined {
  switch (field) {
    case "date":
      if (!value) return "Date is required";
      return undefined;
    case "description":
      if (!value.trim()) return "Description is required";
      return undefined;
    case "category":
      if (!value.trim()) return "Category is required";
      return undefined;
    case "accountId":
      if (!isEdit && !value) return "Account is required";
      return undefined;
    case "nativeAmount": {
      if (!value) return "Amount is required";
      const n = parseFloat(value);
      if (isNaN(n) || n <= 0) return "Enter a positive amount";
      return undefined;
    }
    default:
      return undefined;
  }
}

export interface SplitLine {
  id: string;
  category: string;
  amount: string;
}

// ── localStorage split entries ────────────────────────────────────────────────

export interface SplitEntry {
  category: string;
  amount: number; // in GBP, positive
  note?: string;
}

export const SPLITS_KEY = "ft-tx-splits";

export function loadSplits(): Record<string, SplitEntry[]> {
  try {
    const raw = localStorage.getItem(SPLITS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SplitEntry[]>) : {};
  } catch { return {}; }
}

export function saveSplits(splits: Record<string, SplitEntry[]>): void {
  try { localStorage.setItem(SPLITS_KEY, JSON.stringify(splits)); } catch { /* quota exceeded — non-fatal */ }
}

export interface MerchantGroup {
  description: string;
  count: number;
  total: number;
  txIds: number[];
  expanded: boolean;
}

export function makeEmptyForm(): TxForm {
  return {
    date: new Date().toISOString().slice(0, 10),
    description: "", type: "expense", category: "",
    accountId: "", nativeAmount: "", currency: "GBP",
  };
}

export const BULK_CATEGORIES = [
  "Food & Drink", "Transport", "Shopping", "Bills & Utilities",
  "Entertainment", "Health", "Travel", "Income", "Transfer", "Other",
];

export const CATEGORIES = [
  "Salary", "Freelance", "Investment Income", "Gift",
  "Rent / Mortgage", "Groceries", "Eating Out", "Coffee",
  "Transport", "Fuel", "Flights", "Accommodation",
  "Utilities", "Subscriptions", "Healthcare", "Insurance",
  "Shopping", "Electronics", "Clothing",
  "Entertainment", "Sport", "Education",
  "Transfer", "Savings", "Tax",
  "Other",
];

export const TX_TYPE_COLOR: Record<TxType, string> = {
  income: "var(--ft-green)",
  expense: "var(--ft-red)",
  transfer: "var(--ft-blue)",
};

export function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getMonthStart(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toISOString().slice(0, 10);
}

export function getMonthEnd(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return d.toISOString().slice(0, 10);
}

export function get3MonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// ── CSV / JSON export ───────────────────────────────────────────────────────

export function exportCsv(rows: Array<{
  date: string;
  description: string;
  category: string;
  type: string;
  nativeAmount: number;
  currency: string;
  accountName: string;
  gbpValue?: number;
}>) {
  const header = ["Date", "Description", "Category", "Type", "Amount", "Currency", "Account", "GBP Value"];
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.date, r.description, r.category, r.type, Math.abs(r.nativeAmount), r.currency, r.accountName, r.gbpValue != null ? Math.abs(r.gbpValue).toFixed(2) : ""]
        .map(escape)
        .join(",")
    ),
  ];
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportJson(rows: Array<{ date: string; description: string; category: string; type: string; nativeAmount: number; currency: string; gbpValue: number; accountName: string }>) {
  const data = rows.map((r) => ({ date: r.date, description: r.description, category: r.category, type: r.type, amount: Math.abs(r.nativeAmount), currency: r.currency, gbpValue: Math.abs(r.gbpValue), account: r.accountName }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `transactions-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ── Table header cell style ─────────────────────────────────────────────────

export const TH: React.CSSProperties = {
  padding: "0 var(--ft-cell-px)",
  height: 28,
  fontSize: 10,
  fontWeight: 600,
  fontFamily: "var(--font-mono)",
  color: "var(--ft-muted)",
  background: "var(--ft-raised)",
  borderBottom: "1px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap" as const,
  display: "flex",
  alignItems: "center",
};
