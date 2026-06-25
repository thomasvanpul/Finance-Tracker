import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTransactions,
  useGetTransactionSummary,
  useCreateTransaction,
  useDeleteTransaction,
  useListAccounts,
  getListTransactionsQueryKey,
  getGetTransactionSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type TxType = "income" | "expense" | "transfer";
type Currency = "GBP" | "USD" | "MYR" | "CNY";

interface TxForm {
  date: string;
  description: string;
  type: TxType;
  category: string;
  accountId: string;
  nativeAmount: string;
  currency: Currency;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: TxForm = { date: today, description: "", type: "expense", category: "", accountId: "", nativeAmount: "", currency: "GBP" };

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "#6E7681",
  background: "#161B22",
  borderBottom: "2px solid #30363D",
  borderRight: "1px solid #21262D",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
};

const TX_TYPE_COLOR: Record<TxType, string> = {
  income: "#3FB950",
  expense: "#F85149",
  transfer: "#58A6FF",
};

export default function Transactions() {
  const { data: transactions, isLoading, isError, error } = useListTransactions();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetTransactionSummary();
  const { data: accounts } = useListAccounts();
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<TxForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
  };

  const openAdd = () => {
    const first = accounts?.[0];
    setForm({ ...EMPTY_FORM, accountId: first ? String(first.id) : "", currency: (first?.currency as Currency) ?? "GBP" });
    setAddOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await createTx.mutateAsync({ data: { date: form.date, description: form.description, type: form.type, category: form.category, accountId: parseInt(form.accountId), nativeAmount: parseFloat(form.nativeAmount), currency: form.currency } });
      invalidate(); setAddOpen(false); toast({ title: "Transaction added" });
    } catch { toast({ title: "Failed to add transaction", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    try { await deleteTx.mutateAsync({ id }); invalidate(); toast({ title: "Transaction deleted" }); }
    catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const setField = <K extends keyof TxForm>(k: K, v: TxForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "#E6EDF3" }}>Transactions</h1>
          <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>Every flow of capital, tracked and categorised</p>
        </div>
        <Button onClick={openAdd} size="sm" style={{ background: "#1F6FEB", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Transaction
        </Button>
      </div>

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load transactions</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-date">Date</Label>
                  <Input id="tx-date" type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setField("type", v as TxType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-desc">Description</Label>
                <Input id="tx-desc" placeholder="e.g. Monthly Salary" value={form.description} onChange={(e) => setField("description", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-cat">Category</Label>
                <Input id="tx-cat" placeholder="e.g. Payroll, Groceries" value={form.category} onChange={(e) => setField("category", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Account</Label>
                <Select value={form.accountId} onValueChange={(v) => {
                  const acct = accounts?.find((a) => String(a.id) === v);
                  setForm((f) => ({ ...f, accountId: v, currency: (acct?.currency as Currency) ?? f.currency }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-amount">Amount</Label>
                  <Input id="tx-amount" type="number" step="0.01" min="0" placeholder="0.00" value={form.nativeAmount} onChange={(e) => setField("nativeAmount", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setField("currency", v as Currency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="MYR">MYR</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add Transaction"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Summary bar */}
      {summary && (
        <div className="flex border" style={{ borderColor: "#21262D", background: "#161B22" }}>
          {[
            { label: `Income (${summary.month})`, value: `+${formatGbp(summary.totalIncome)}`, color: "#3FB950" },
            { label: "Expenses", value: `-${formatGbp(summary.totalExpenses)}`, color: "#F85149" },
            { label: "Net", value: `${summary.netSavings > 0 ? "+" : ""}${formatGbp(summary.netSavings)}`, color: summary.netSavings >= 0 ? "#3FB950" : "#F85149" },
            { label: "Savings Rate", value: `${summary.savingsRate.toFixed(1)}%`, color: "#58A6FF" },
          ].map((s) => (
            <div key={s.label} className="flex-1 px-4 py-3 border-r" style={{ borderColor: "#21262D" }}>
              <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{s.label}</div>
              <div className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Transactions spreadsheet table */}
      <div className="border" style={{ borderColor: "#21262D" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#58A6FF22", borderColor: "#58A6FF44", color: "#58A6FF" }}>
          ▼ TRANSACTION LEDGER — All Entries
        </div>

        {/* Column headers */}
        <div className="flex" style={{ marginLeft: 36 }}>
          {[["DATE", "90px"], ["DESCRIPTION", "1"], ["CATEGORY", "120px"], ["ACCOUNT", "150px"], ["TYPE", "90px"], ["AMOUNT", "130px"], ["GBP", "110px"], ["", "52px"]].map(([h, w]) => (
            <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["AMOUNT", "GBP", ""].includes(h as string) ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {transactions?.map((tx, i) => (
          <div
            key={tx.id}
            className="flex items-center border-b xls-row"
            style={{ borderColor: "rgba(33,38,45,0.5)", background: i % 2 === 0 ? "#0D1117" : "#0D1117" }}
          >
            <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "#484F58", borderColor: "#21262D", alignSelf: "stretch" }}>
              {i + 2}
            </div>
            <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              {formatDate(tx.date)}
            </div>
            <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tx.description}
            </div>
            <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "#21262D", color: "#8B949E" }}>
                {tx.category}
              </span>
            </div>
            <div style={{ width: 150, minWidth: 150, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tx.accountName}
            </div>
            <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: TX_TYPE_COLOR[tx.type as TxType] + "22", color: TX_TYPE_COLOR[tx.type as TxType], textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {tx.type}
              </span>
            </div>
            <div style={{ width: 130, minWidth: 130, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right", color: tx.type === "income" ? "#3FB950" : "#F85149", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", background: tx.type === "income" ? "rgba(63,185,80,0.04)" : tx.type === "expense" ? "rgba(248,81,73,0.04)" : "transparent" }}>
              {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
              {formatNative(Math.abs(tx.nativeAmount), tx.currency)}
            </div>
            <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right", color: tx.type === "income" ? "#3FB950" : "#F85149", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
              {formatGbp(Math.abs(tx.gbpValue))}
            </div>
            <div style={{ width: 52, minWidth: 52, padding: "4px 4px", textAlign: "right", display: "flex", justifyContent: "flex-end" }}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(tx.id)}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#F85149" }} />
              </Button>
            </div>
          </div>
        ))}

        {transactions?.length === 0 && (
          <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
            <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
            <div className="flex-1 text-center py-8 text-xs" style={{ color: "#484F58" }}>
              No transactions yet — add one to get started.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
