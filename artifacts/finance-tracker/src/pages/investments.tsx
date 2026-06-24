import { useListInvestments, useGetInvestmentSummary, useDeleteInvestment, getListInvestmentsQueryKey, getGetInvestmentSummaryQueryKey } from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Investments() {
  const { data: investments, isLoading } = useListInvestments();
  const { data: summary, isLoading: isSummaryLoading } = useGetInvestmentSummary();
  const deleteInv = useDeleteInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (confirm("Delete this investment?")) {
      try {
        await deleteInv.mutateAsync({ id });
        queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetInvestmentSummaryQueryKey() });
        toast({ title: "Investment deleted" });
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Investments</h1>
          <p className="text-muted-foreground">Portfolio tracking and market exposure.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Position
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4 p-4 rounded-md border border-border bg-card/50">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">{formatGbp(summary.totalValueGbp)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total P&L</p>
            <p className={`text-2xl font-bold ${summary.totalPlGbp >= 0 ? 'text-success' : 'text-destructive'}`}>
              {summary.totalPlGbp > 0 ? "+" : ""}{formatGbp(summary.totalPlGbp)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">P&L %</p>
            <p className={`text-2xl font-bold ${summary.totalPlPercent >= 0 ? 'text-success' : 'text-destructive'}`}>
              {summary.totalPlPercent > 0 ? "+" : ""}{formatPercent(summary.totalPlPercent)}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Ticker</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Cost Price</TableHead>
              <TableHead className="text-right">Live Price</TableHead>
              <TableHead className="text-right">Value (GBP)</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {investments?.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold">{inv.ticker}</span>
                    <span className="text-xs text-muted-foreground">{inv.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{inv.shares}</TableCell>
                <TableCell className="text-right">{inv.costPricePerShare.toFixed(2)} {inv.currency}</TableCell>
                <TableCell className="text-right">{inv.livePrice.toFixed(2)} {inv.currency}</TableCell>
                <TableCell className="text-right font-medium">{formatGbp(inv.gbpValue)}</TableCell>
                <TableCell className={`text-right font-medium ${inv.plPercent >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {inv.plGbp > 0 ? "+" : ""}{formatGbp(inv.plGbp)}<br/>
                  <span className="text-xs">({inv.plPercent > 0 ? "+" : ""}{formatPercent(inv.plPercent)})</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(inv.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {investments?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No investments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
