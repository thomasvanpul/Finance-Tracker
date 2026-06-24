import { useListTransactions, useGetTransactionSummary, useDeleteTransaction, getListTransactionsQueryKey, getGetTransactionSummaryQueryKey } from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Edit2, Link } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Transactions() {
  const { data: transactions, isLoading } = useListTransactions();
  const { data: summary, isLoading: isSummaryLoading } = useGetTransactionSummary();
  const deleteTx = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      try {
        await deleteTx.mutateAsync({ id });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
        toast({ title: "Transaction deleted" });
      } catch (error) {
        toast({ title: "Failed to delete", variant: "destructive" });
      }
    }
  };

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
        <div className="flex items-center gap-3">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

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
            <p className={`text-lg font-bold ${summary.netSavings >= 0 ? 'text-success' : 'text-destructive'}`}>
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
              <TableHead className="text-right">Amount (Native)</TableHead>
              <TableHead className="text-right">Amount (GBP)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions?.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tx.description}</span>
                    {tx.source === 'plaid' && <Link className="w-3 h-3 text-muted-foreground" />}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                    {tx.category}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{tx.accountName}</TableCell>
                <TableCell className={`text-right font-medium ${tx.type === 'income' ? 'text-success' : tx.type === 'expense' ? 'text-destructive' : ''}`}>
                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                  {formatNative(tx.nativeAmount, tx.currency)}
                </TableCell>
                <TableCell className={`text-right font-bold ${tx.type === 'income' ? 'text-success' : tx.type === 'expense' ? 'text-destructive' : ''}`}>
                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                  {formatGbp(tx.gbpValue)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(tx.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {transactions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
