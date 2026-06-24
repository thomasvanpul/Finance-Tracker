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
import { AlertCircle } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
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
const EMPTY_FORM: TxForm = {
  date: today,
  description: "",
  type: "expense",
  category: "",
  accountId: "",
  nativeAmount: "",
  currency: "GBP",
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
    const firstAccount = accounts?.[0];
    setForm({
      ...EMPTY_FORM,
      accountId: firstAccount ? String(firstAccount.id) : "",
      currency: (firstAccount?.currency as Currency) ?? "GBP",
    });
    setAddOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createTx.mutateAsync({
        data: {
          date: form.date,
          description: form.description,
          type: form.type,
          category: form.category,
          accountId: parseInt(form.accountId),
          nativeAmount: parseFloat(form.nativeAmount),
          currency: form.currency,
        },
      });
      invalidate();
      setAddOpen(false);
      toast({ title: "Transaction added" });
    } catch {
      toast({ title: "Failed to add transaction", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await deleteTx.mutateAsync({ id });
      invalidate();
      toast({ title: "Transaction deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const setField = <K extends keyof TxForm>(k: K, v: TxForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading || isSummaryLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Transactions</h1>
          <p className="text-muted-foreground">Every flow of capital, tracked and categorised.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Transaction
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-date">Date</Label>
                  <Input
                    id="tx-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setField("date", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setField("type", v as TxType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                <Input
                  id="tx-desc"
                  placeholder="e.g. Monthly Salary"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tx-cat">Category</Label>
                <Input
                  id="tx-cat"
                  placeholder="e.g. Payroll, Groceries"
                  value={form.category}
                  onChange={(e) => setField("category", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Account</Label>
                <Select
                  value={form.accountId}
                  onValueChange={(v) => {
                    const acct = accounts?.find((a) => String(a.id) === v);
                    setForm((f) => ({
                      ...f,
                      accountId: v,
                      currency: (acct?.currency as Currency) ?? f.currency,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} ({a.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-amount">Amount</Label>
                  <Input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.nativeAmount}
                    onChange={(e) => setField("nativeAmount", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setField("currency", v as Currency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add Transaction"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {summary && (
        <div className="grid grid-cols-4 gap-4 p-4 rounded-md border border-border bg-card/50">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Income ({summary.month})</p>
            <p className="text-lg font-bold text-success">+{formatGbp(summary.totalIncome)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Expenses</p>
            <p className="text-lg font-bold text-destructive">-{formatGbp(summary.totalExpenses)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Net</p>
            <p className={`text-lg font-bold ${summary.netSavings >= 0 ? "text-success" : "text-destructive"}`}>
              {summary.netSavings > 0 ? "+" : ""}{formatGbp(summary.netSavings)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Savings Rate</p>
            <p className="text-lg font-bold">{summary.savingsRate.toFixed(1)}%</p>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">GBP</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions?.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                  {formatDate(tx.date)}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{tx.description}</p>
                </TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {tx.category}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{tx.accountName}</TableCell>
                <TableCell className={`text-right font-medium ${tx.type === "income" ? "text-success" : "text-destructive"}`}>
                  {tx.type === "income" ? "+" : "-"}{formatNative(Math.abs(tx.nativeAmount), tx.currency)}
                </TableCell>
                <TableCell className={`text-right font-medium ${tx.type === "income" ? "text-success" : "text-destructive"}`}>
                  {tx.type === "income" ? "+" : "-"}{formatGbp(Math.abs(tx.gbpValue))}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(tx.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {transactions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No transactions found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
