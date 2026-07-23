import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUpcoming,
  useGetUpcomingSummary,
  useCreateUpcomingItem,
  useDeleteUpcomingItem,
  useUpdateUpcomingItem,
  useCreateTransaction,
  useListAccounts,
  getListUpcomingQueryKey,
  getGetUpcomingSummaryQueryKey,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus, Trash2, Edit2, CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
type Currency = "GBP" | "USD" | "EUR" | "MYR" | "CNY" | "JPY" | "AUD" | "CAD" | "SGD" | "HKD" | "THB" | "INR";
type Status = "pending" | "paid" | "skipped";

interface UpForm {
  dueDate: string;
  description: string;
  category: string;
  type: UpType;
  frequency: Freq;
  nativeAmount: string;
  currency: Currency;
  accountId: string;
}

interface MarkPaidItem {
  id: number;
  description: string;
  category: string;
  type: UpType;
  nativeAmount: number;
  currency: string;
  accountId: number | null | undefined;
  gbpEquivalent: number;
}

const TODAY = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: UpForm = { dueDate: TODAY, description: "", category: "", type: "expense", frequency: "monthly", nativeAmount: "", currency: "GBP", accountId: "" };

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-raised)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
};

const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  pending: { bg: "var(--ft-blue)22", text: "var(--ft-blue)" },
  paid: { bg: "var(--ft-green)22", text: "var(--ft-green)" },
  skipped: { bg: "#6E767122", text: "var(--ft-dim)" },
};

function computeForecast(
  items: Array<{ status: string; type: string; dueDate: string; gbpEquivalent: number }>,
  days: number
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return items.reduce((sum, item) => {
    if (item.status !== "pending") return sum;
    if (item.dueDate > cutoffStr) return sum;
    return sum + (item.type === "income" ? item.gbpEquivalent : -item.gbpEquivalent);
  }, 0);
}

export default function Upcoming() {
  const { data: upcoming, isLoading, isError, error } = useListUpcoming();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetUpcomingSummary();
  const createItem = useCreateUpcomingItem();
  const deleteItem = useDeleteUpcomingItem();
  const updateItem = useUpdateUpcomingItem();
  const createTransaction = useCreateTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UpForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Mark as Paid modal state
  const [markPaidItem, setMarkPaidItem] = useState<MarkPaidItem | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState<string>(TODAY);
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);

  // Cash flow forecast toggle
  const [forecastOpen, setForecastOpen] = useState(true);

  const { data: accounts } = useListAccounts();

  const totalBalance = useMemo(
    () => accounts?.reduce((sum, a) => sum + (a.gbpEquivalent ?? 0), 0) ?? 0,
    [accounts]
  );

  const forecast30 = useMemo(() => computeForecast(upcoming ?? [], 30), [upcoming]);
  const forecast60 = useMemo(() => computeForecast(upcoming ?? [], 60), [upcoming]);
  const forecast90 = useMemo(() => computeForecast(upcoming ?? [], 90), [upcoming]);

  // Overdue detection
  const overdueIds = useMemo(
    () => new Set(
      (upcoming ?? [])
        .filter((i) => i.status === "pending" && i.dueDate < TODAY)
        .map((i) => i.id)
    ),
    [upcoming]
  );
  const overdueCount = overdueIds.size;

  // Sort: overdue pending items to top, then by dueDate ascending
  const sortedItems = useMemo(() => {
    if (!upcoming) return [];
    return [...upcoming].sort((a, b) => {
      const aOverdue = overdueIds.has(a.id) ? 0 : 1;
      const bOverdue = overdueIds.has(b.id) ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [upcoming, overdueIds]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  };

  const openAdd = () => { setForm(EMPTY_FORM); setAddOpen(true); };
  const openEdit = (id: number) => {
    const item = upcoming?.find((i) => i.id === id);
    if (!item) return;
    setForm({ dueDate: item.dueDate, description: item.description, category: item.category, type: item.type as UpType, frequency: item.frequency as Freq, nativeAmount: String(item.nativeAmount), currency: item.currency as Currency, accountId: item.accountId ? String(item.accountId) : "" });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await createItem.mutateAsync({ data: { dueDate: form.dueDate, description: form.description, category: form.category, type: form.type, frequency: form.frequency, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency, accountId: form.accountId ? parseInt(form.accountId) : undefined } });
      invalidate(); setAddOpen(false); toast({ title: "Item added" });
    } catch { toast({ title: "Failed to add item", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      await updateItem.mutateAsync({ id: editId, data: { dueDate: form.dueDate, description: form.description, category: form.category, type: form.type, frequency: form.frequency, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency, accountId: form.accountId ? parseInt(form.accountId) : undefined } });
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
    if (status === "paid") {
      const item = upcoming?.find((i) => i.id === id);
      if (item) {
        setMarkPaidItem({
          id: item.id,
          description: item.description,
          category: item.category,
          type: item.type as UpType,
          nativeAmount: item.nativeAmount,
          currency: item.currency,
          accountId: item.accountId,
          gbpEquivalent: item.gbpEquivalent,
        });
        setMarkPaidDate(TODAY);
        return;
      }
    }
    try { await updateItem.mutateAsync({ id, data: { status } }); invalidate(); toast({ title: "Status updated" }); }
    catch { toast({ title: "Failed to update status", variant: "destructive" }); }
  };

  const handleMarkPaidConfirm = async () => {
    if (!markPaidItem) return;
    setMarkPaidSubmitting(true);
    try {
      // Only create transaction if item has a linked account (required field)
      if (markPaidItem.accountId) {
        await createTransaction.mutateAsync({
          data: {
            date: markPaidDate,
            description: markPaidItem.description,
            type: markPaidItem.type === "income" ? "income" : "expense",
            category: markPaidItem.category,
            accountId: markPaidItem.accountId,
            nativeAmount: markPaidItem.nativeAmount,
            currency: markPaidItem.currency,
          },
        });
      }
      await updateItem.mutateAsync({ id: markPaidItem.id, data: { status: "paid" } });
      invalidate();
      toast({ title: markPaidItem.accountId ? "Marked paid — transaction created" : "Marked paid" });
      setMarkPaidItem(null);
    } catch {
      toast({ title: "Failed to mark as paid", variant: "destructive" });
    } finally {
      setMarkPaidSubmitting(false);
    }
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
      <div className="space-y-1.5">
        <Label>Account <span className="text-xs" style={{ color: "var(--ft-dim)" }}>(optional)</span></Label>
        <Select
          value={form.accountId || "__none__"}
          onValueChange={(v) => {
            const acct = accounts?.find((a) => String(a.id) === v);
            setForm((f) => ({ ...f, accountId: v === "__none__" ? "" : v, currency: acct ? (acct.currency as Currency) : f.currency }));
          }}
        >
          <SelectTrigger><SelectValue placeholder="No account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No account linked</SelectItem>
            {accounts?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>)}
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
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="MYR">MYR</SelectItem>
              <SelectItem value="CNY">CNY</SelectItem>
              <SelectItem value="JPY">JPY</SelectItem>
              <SelectItem value="AUD">AUD</SelectItem>
              <SelectItem value="CAD">CAD</SelectItem>
              <SelectItem value="SGD">SGD</SelectItem>
              <SelectItem value="HKD">HKD</SelectItem>
              <SelectItem value="THB">THB</SelectItem>
              <SelectItem value="INR">INR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={CalendarClock}
        title="Upcoming"
        subtitle="Scheduled flows and expected liquidity needs"
        actions={
          <Button onClick={openAdd} size="sm" style={{ background: "var(--ft-blue)", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Item
          </Button>
        }
      />

      {(isError || isSummaryError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load upcoming items</AlertTitle>
          <AlertDescription>{(error as Error)?.message ?? "Could not reach the server."}</AlertDescription>
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

      {/* Mark as Paid Dialog */}
      <Dialog open={markPaidItem !== null} onOpenChange={(o) => !o && setMarkPaidItem(null)}>
        <DialogContent style={{ maxWidth: 420 }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
              Mark as Paid
            </DialogTitle>
          </DialogHeader>
          {markPaidItem && (
            <div className="space-y-4">
              {/* Item summary */}
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--ft-dim)", marginBottom: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Item details
                </div>
                <div style={{ fontSize: 13, color: "var(--ft-text)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                  {markPaidItem.description}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: markPaidItem.type === "income" ? "var(--ft-green)22" : "var(--ft-red)22", color: markPaidItem.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
                    {markPaidItem.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>
                    {markPaidItem.category}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: markPaidItem.type === "income" ? "var(--ft-green)" : "var(--ft-red)", marginLeft: "auto" }}>
                    {markPaidItem.type === "income" ? "+" : "-"}{formatGbp(markPaidItem.gbpEquivalent)}
                  </span>
                </div>
                {!markPaidItem.accountId && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "#E3B341", fontFamily: "var(--font-mono)" }}>
                    No account linked — transaction will not be recorded
                  </div>
                )}
              </div>

              {/* Date selector */}
              <div className="space-y-1.5">
                <Label htmlFor="paid-date" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ft-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Transaction Date
                </Label>
                <Input
                  id="paid-date"
                  type="date"
                  value={markPaidDate}
                  onChange={(e) => setMarkPaidDate(e.target.value)}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={markPaidSubmitting}
              onClick={handleMarkPaidConfirm}
              style={{ background: "var(--ft-green)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700 }}
            >
              {markPaidSubmitting ? "Confirming…" : "Confirm Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary bar */}
      {summary && (
        <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-raised)" }}>
            <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 3, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>30-Day Outgoings</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-red)" }}>-{formatGbp(summary.committedOutgoings30d)}</div>
          </div>
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-raised)" }}>
            <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 3, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>30-Day Income</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-green)" }}>+{formatGbp(summary.expectedIncome30d)}</div>
          </div>
          <div style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 3, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Overdue</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {overdueCount > 0 ? (
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-red)" }}>
                  {overdueCount} item{overdueCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-green)" }}>
                  None
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash Flow Forecast Strip */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
        <button
          type="button"
          onClick={() => setForecastOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            background: "var(--ft-muted)22",
            border: "none",
            borderBottom: forecastOpen ? "1px solid var(--ft-muted)44" : "none",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--ft-muted)",
            letterSpacing: "0.4px",
            textTransform: "uppercase",
          }}
        >
          <span>Cash Flow Forecast — Projected Net Change from Pending Items</span>
          {forecastOpen
            ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)", flexShrink: 0 }} />
            : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)", flexShrink: 0 }} />
          }
        </button>

        {forecastOpen && (
          <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {([
              { label: "30d", net: forecast30 },
              { label: "60d", net: forecast60 },
              { label: "90d", net: forecast90 },
            ] as const).map(({ label, net }, idx) => {
              const projected = totalBalance + net;
              const isPositive = net >= 0;
              return (
                <div
                  key={label}
                  style={{
                    padding: "12px 14px",
                    borderRight: idx < 2 ? "1px solid var(--ft-raised)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-dim)",
                      background: "var(--ft-raised)",
                      padding: "1px 6px",
                      borderRadius: 2,
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                    }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10,
                      color: "var(--ft-dim)",
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                    }}>
                      Net Change
                    </span>
                  </div>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: isPositive ? "var(--ft-green)" : "var(--ft-red)",
                    marginBottom: 6,
                  }}>
                    {isPositive ? "+" : ""}{formatGbp(net)}
                  </div>
                  <div style={{ marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10,
                      color: "var(--ft-dim)",
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                    }}>
                      Projected Balance
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: projected >= 0 ? "var(--ft-text)" : "var(--ft-red)",
                  }}>
                    {formatGbp(projected)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming spreadsheet table */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "var(--ft-muted)22", borderColor: "var(--ft-muted)44", color: "var(--ft-muted)" }}>
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
        {sortedItems.map((item, i) => {
          const sc = STATUS_COLORS[item.status as Status] ?? STATUS_COLORS.pending;
          const isOverdue = overdueIds.has(item.id);
          return (
            <div
              key={item.id}
              className="flex items-center border-b xls-row"
              style={{
                borderColor: "rgba(33,38,45,0.5)",
                opacity: item.status === "skipped" ? 0.5 : 1,
                borderLeft: isOverdue ? "3px solid var(--ft-red)" : undefined,
              }}
            >
              <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: isOverdue ? 33 : 36, color: "var(--ft-dim)", borderColor: "var(--ft-border)", alignSelf: "stretch" }}>
                {i + 2}
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", fontSize: 11, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
                <span style={{ color: "var(--ft-muted)" }}>{formatDate(item.dueDate)}</span>
                {isOverdue && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ft-red)",
                    background: "var(--ft-red)22",
                    padding: "1px 4px",
                    borderRadius: 2,
                    letterSpacing: "0.4px",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}>
                    OVERDUE
                  </span>
                )}
              </div>
              <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span className={item.status === "skipped" ? "line-through" : ""}>{item.description}</span>
              </div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)" }}>{item.category}</span>
              </div>
              <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)", fontSize: 11, textTransform: "capitalize" }}>
                {item.frequency}
              </div>
              <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: item.type === "income" ? "var(--ft-green)22" : "var(--ft-red)22", color: item.type === "income" ? "var(--ft-green)" : "var(--ft-red)" }}>
                  {item.type.toUpperCase()}
                </span>
              </div>
              <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", textAlign: "right", color: item.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {item.type === "income" ? "+" : "-"}{formatGbp(item.gbpEquivalent)}
              </div>
              <div style={{ width: 120, minWidth: 120, padding: "5px 12px", borderRight: "1px solid var(--ft-raised)" }}>
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
                  <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
                </Button>
              </div>
            </div>
          );
        })}

        {sortedItems.length === 0 && (
          <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
            <div style={{ width: 36, borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }} />
            <div className="flex-1 text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>
              No upcoming items — add one to plan your future cash flows.
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
