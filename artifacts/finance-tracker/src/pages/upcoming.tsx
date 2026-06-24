import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUpcoming,
  useGetUpcomingSummary,
  useCreateUpcomingItem,
  useDeleteUpcomingItem,
  useUpdateUpcomingItem,
  getListUpcomingQueryKey,
  getGetUpcomingSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Edit2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type UpType = "income" | "expense";
type Freq = "one-time" | "weekly" | "monthly" | "quarterly" | "yearly";
type Currency = "GBP" | "USD" | "MYR" | "CNY";
type Status = "pending" | "paid" | "skipped";

interface UpForm {
  dueDate: string;
  description: string;
  category: string;
  type: UpType;
  frequency: Freq;
  nativeAmount: string;
  currency: Currency;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: UpForm = {
  dueDate: today,
  description: "",
  category: "",
  type: "expense",
  frequency: "monthly",
  nativeAmount: "",
  currency: "GBP",
};

export default function Upcoming() {
  const { data: upcoming, isLoading } = useListUpcoming();
  const { data: summary, isLoading: isSummaryLoading } = useGetUpcomingSummary();
  const createItem = useCreateUpcomingItem();
  const deleteItem = useDeleteUpcomingItem();
  const updateItem = useUpdateUpcomingItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UpForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() });
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setAddOpen(true);
  };

  const openEdit = (id: number) => {
    const item = upcoming?.find((i) => i.id === id);
    if (!item) return;
    setForm({
      dueDate: item.dueDate,
      description: item.description,
      category: item.category,
      type: item.type as UpType,
      frequency: item.frequency as Freq,
      nativeAmount: String(item.nativeAmount),
      currency: item.currency as Currency,
    });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createItem.mutateAsync({
        data: {
          dueDate: form.dueDate,
          description: form.description,
          category: form.category,
          type: form.type,
          frequency: form.frequency,
          nativeAmount: parseFloat(form.nativeAmount),
          currency: form.currency,
        },
      });
      invalidate();
      setAddOpen(false);
      toast({ title: "Item added" });
    } catch {
      toast({ title: "Failed to add item", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    setSubmitting(true);
    try {
      await updateItem.mutateAsync({
        id: editId,
        data: {
          dueDate: form.dueDate,
          description: form.description,
          category: form.category,
          type: form.type,
          frequency: form.frequency,
          nativeAmount: parseFloat(form.nativeAmount),
          currency: form.currency,
        },
      });
      invalidate();
      setEditId(null);
      toast({ title: "Item updated" });
    } catch {
      toast({ title: "Failed to update item", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this upcoming item?")) return;
    try {
      await deleteItem.mutateAsync({ id });
      invalidate();
      toast({ title: "Item deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: number, status: Status) => {
    try {
      await updateItem.mutateAsync({ id, data: { status } });
      invalidate();
      toast({ title: "Status updated" });
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const setField = <K extends keyof UpForm>(k: K, v: UpForm[K]) =>
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

  const FormFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="up-date">Due Date</Label>
          <Input
            id="up-date"
            type="date"
            value={form.dueDate}
            onChange={(e) => setField("dueDate", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setField("type", v as UpType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="up-desc">Description</Label>
        <Input
          id="up-desc"
          placeholder="e.g. Monthly Rent"
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="up-cat">Category</Label>
        <Input
          id="up-cat"
          placeholder="e.g. Housing, Utilities"
          value={form.category}
          onChange={(e) => setField("category", e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Frequency</Label>
        <Select value={form.frequency} onValueChange={(v) => setField("frequency", v as Freq)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one-time">One-time</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="up-amount">Amount</Label>
          <Input
            id="up-amount"
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
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Upcoming</h1>
          <p className="text-muted-foreground">Scheduled flows and expected liquidity needs.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Upcoming Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Upcoming Item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <TableHead className="text-right">Amount (GBP)</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcoming?.map((item) => (
              <TableRow key={item.id} className={item.status === "skipped" ? "opacity-50" : ""}>
                <TableCell className="whitespace-nowrap">{formatDate(item.dueDate)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className={`font-medium ${item.status === "skipped" ? "line-through" : ""}`}>
                      {item.description}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                  </div>
                </TableCell>
                <TableCell className="capitalize">{item.frequency}</TableCell>
                <TableCell className={`text-right font-medium ${item.type === "income" ? "text-success" : "text-destructive"}`}>
                  {item.type === "income" ? "+" : "-"}{formatGbp(item.gbpEquivalent)}
                </TableCell>
                <TableCell className="text-right">
                  <Select
                    value={item.status}
                    onValueChange={(v) => handleStatusChange(item.id, v as Status)}
                  >
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(item.id)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(item.id)}
                  >
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
