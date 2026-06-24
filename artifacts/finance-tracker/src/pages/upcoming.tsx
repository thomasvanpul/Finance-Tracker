import { useListUpcoming, useGetUpcomingSummary, useDeleteUpcomingItem, useUpdateUpcomingItem, getListUpcomingQueryKey, getGetUpcomingSummaryQueryKey } from "@workspace/api-client-react";
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
import { Plus, Trash2, Edit2, SplitSquareHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Upcoming() {
  const { data: upcoming, isLoading } = useListUpcoming();
  const { data: summary, isLoading: isSummaryLoading } = useGetUpcomingSummary();
  const deleteItem = useDeleteUpcomingItem();
  const updateItem = useUpdateUpcomingItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (confirm("Delete this upcoming item?")) {
      try {
        await deleteItem.mutateAsync({ id });
        queryClient.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() });
        toast({ title: "Item deleted" });
      } catch (error) {
        toast({ title: "Failed to delete", variant: "destructive" });
      }
    }
  };

  const handleStatusChange = async (id: number, status: "pending" | "paid" | "skipped") => {
    try {
      await updateItem.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
      toast({ title: "Status updated" });
    } catch (error) {
      toast({ title: "Failed to update", variant: "destructive" });
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Upcoming</h1>
          <p className="text-muted-foreground">Scheduled flows and expected liquidity needs.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <SplitSquareHorizontal className="w-4 h-4 mr-2" />
            Split Installment
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 p-4 rounded-md border border-border bg-card/50">
          <div>
            <p className="text-sm font-medium text-muted-foreground">30-Day Committed Outgoings</p>
            <p className="text-2xl font-bold text-destructive">{formatGbp(summary.committedOutgoings30d)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">30-Day Expected Income</p>
            <p className="text-2xl font-bold text-success">{formatGbp(summary.expectedIncome30d)}</p>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Due Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcoming?.map((item) => (
              <TableRow key={item.id} className={item.status === 'skipped' ? 'opacity-50' : ''}>
                <TableCell className="whitespace-nowrap">{formatDate(item.dueDate)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className={`font-medium ${item.status === 'skipped' ? 'line-through' : ''}`}>
                      {item.description}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                  </div>
                </TableCell>
                <TableCell className="capitalize">{item.frequency}</TableCell>
                <TableCell className={`text-right font-medium ${item.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                  {item.type === 'income' ? '+' : '-'}{formatGbp(item.gbpEquivalent)}
                </TableCell>
                <TableCell className="text-right">
                  <Select value={item.status} onValueChange={(v: any) => handleStatusChange(item.id, v)}>
                    <SelectTrigger className="w-[110px] h-8 ml-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="skipped">Skipped</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {upcoming?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No upcoming items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
