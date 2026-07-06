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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2 } from "lucide-react";
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
const EMPTY_FORM: UpForm = { dueDate: today, description: "", category: "", type: "expense", frequency: "monthly", nativeAmount: "", currency: "GBP" };

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

const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  pending: { bg: "#58A6FF22", text: "#58A6FF" },
  paid: { bg: "#3FB95022", text: "#3FB950" },
  skipped: { bg: "#6E767122", text: "#6E7681" },
};

export default function Upcoming() {
  const { data: upcoming, isLoading, isError, error } = useListUpcoming();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetUpcomingSummary();
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

  const openAdd = () => { setForm(EMPTY_FORM); setAddOpen(true); };
  const openEdit = (id: number) => {
    const item = upcoming?.find((i) => i.id === id);
    if (!item) return;
    setForm({ dueDate: item.dueDate, description: item.description, category: item.category, type: item.type as UpType, frequency: item.frequency as Freq, nativeAmount: String(item.nativeAmount), currency: item.currency as Currency });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await createItem.mutateAsync({ data: { dueDate: form.dueDate, description: form.description, category: form.category, type: form.type, frequency: form.frequency, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency } });
      invalidate(); setAddOpen(false); toast({ title: "Item added" });
    } catch { toast({ title: "Failed to add item", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      await updateItem.mutateAsync({ id: editId, data: { dueDate: form.dueDate, description: form.description, category: form.category, type: form.type, frequency: form.frequency, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency } });
      invalidate(); setEditId(null); toast({ title: "Item updated" });
    } catch { toast({ title: "Failed to update item", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this item?")) return;
    try { await deleteItem.mutateAsync({ id }); invalidate(); toast({ title: "Item deleted" }); }
    catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const handleStatusChange = async (id: number, status: Status) => {
    try { await updateItem.mutateAsync({ id, data: { status } }); invalidate(); toast({ title: "Status updated" }); }
    catch { toast({ title: "Failed to update status", variant: "destructive" }); }
  };

  const setField = <K extends keyof UpForm>(k: K, v: UpForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading || isSummaryLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const FormFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="up-date">Due Date</Label>
          <Input id="up-date" type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setField("type", v as UpType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-desc">Description</Label>
        <Input id="up-desc" placeholder="e.g. Monthly Rent" value={form.description} onChange={(e) => setField("description", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-cat">Category</Label>
        <Input id="up-cat" placeholder="e.g. Housing, Utilities" value={form.category} onChange={(e) => setField("category", e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Frequency</Label>
        <Select value={form.frequency} onValueChange={(v) => setField("frequency", v as Freq)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Input id="up-amount" type="number" step="0.01" min="0" placeholder="0.00" value={form.nativeAmount} onChange={(e) => setField("nativeAmount", e.target.value)} required />
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
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "#E6EDF3" }}>Upcoming</h1>
          <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>Scheduled flows and expected liquidity needs</p>
        </div>
        <Button onClick={openAdd} size="sm" style={{ background: "#1F6FEB", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Item
        </Button>
      </div>

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load upcoming items</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Could not reach the server."}</AlertDescription>
        </Alert>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Upcoming Item</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd}>{FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add Item"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Upcoming Item</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit}>{FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-2 border" style={{ borderColor: "#21262D", background: "#161B22" }}>
          <div className="px-3 sm:px-4 py-3 border-r" style={{ borderColor: "#21262D" }}>
            <div className="text-xs mb-1" style={{ color: "#6E7681" }}>30-Day Outgoings</div>
            <div className="text-sm font-bold font-mono" style={{ color: "#F85149" }}>-{formatGbp(summary.committedOutgoings30d)}</div>
          </div>
          <div className="px-3 sm:px-4 py-3">
            <div className="text-xs mb-1" style={{ color: "#6E7681" }}>30-Day Income</div>
            <div className="text-sm font-bold font-mono" style={{ color: "#3FB950" }}>+{formatGbp(summary.expectedIncome30d)}</div>
          </div>
        </div>
      )}

      {/* Upcoming spreadsheet table */}
      <div className="border" style={{ borderColor: "#21262D" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#8B949E22", borderColor: "#8B949E44", color: "#8B949E" }}>
          ▼ UPCOMING SCHEDULE — Committed & Expected Flows
        </div>

        <div className="overflow-x-auto">
        {/* Column headers */}
        <div className="flex" style={{ marginLeft: 36 }}>
          {[["DUE DATE", "100px"], ["DESCRIPTION", "1"], ["CATEGORY", "110px"], ["FREQUENCY", "100px"], ["TYPE", "90px"], ["AMOUNT (GBP)", "120px"], ["STATUS", "120px"], ["ACTIONS", "80px"]].map(([h, w]) => (
            <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["AMOUNT (GBP)"].includes(h as string) ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {upcoming?.map((item, i) => {
          const sc = STATUS_COLORS[item.status as Status] ?? STATUS_COLORS.pending;
          return (
            <div
              key={item.id}
              className="flex items-center border-b xls-row"
              style={{ borderColor: "rgba(33,38,45,0.5)", opacity: item.status === "skipped" ? 0.5 : 1 }}
            >
              <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "#484F58", borderColor: "#21262D", alignSelf: "stretch" }}>
                {i + 2}
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                {formatDate(item.dueDate)}
              </div>
              <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span className={item.status === "skipped" ? "line-through" : ""}>{item.description}</span>
              </div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "#21262D", color: "#8B949E" }}>{item.category}</span>
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11, textTransform: "capitalize" }}>
                {item.frequency}
              </div>
              <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: item.type === "income" ? "#3FB95022" : "#F8514922", color: item.type === "income" ? "#3FB950" : "#F85149" }}>
                  {item.type.toUpperCase()}
                </span>
              </div>
              <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid #21262D", textAlign: "right", color: item.type === "income" ? "#3FB950" : "#F85149", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {item.type === "income" ? "+" : "-"}{formatGbp(item.gbpEquivalent)}
              </div>
              <div style={{ width: 120, minWidth: 120, padding: "5px 12px", borderRight: "1px solid #21262D" }}>
                <Select value={item.status} onValueChange={(v) => handleStatusChange(item.id, v as Status)}>
                  <SelectTrigger className="h-6 text-xs w-full" style={{ background: sc.bg, border: "none", color: sc.text, borderRadius: 2 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div style={{ width: 80, minWidth: 80, padding: "4px 4px", display: "flex", justifyContent: "flex-end", gap: 2 }}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item.id)}>
                  <Edit2 className="w-3.5 h-3.5" style={{ color: "#8B949E" }} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: "#F85149" }} />
                </Button>
              </div>
            </div>
          );
        })}

        {upcoming?.length === 0 && (
          <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
            <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
            <div className="flex-1 text-center py-8 text-xs" style={{ color: "#484F58" }}>
              No upcoming items — add one to plan your future cash flows.
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
