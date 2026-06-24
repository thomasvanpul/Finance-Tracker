import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvestments,
  useGetInvestmentSummary,
  useCreateInvestment,
  useUpdateInvestment,
  useDeleteInvestment,
  getListInvestmentsQueryKey,
  getGetInvestmentSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
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

interface InvForm {
  ticker: string;
  name: string;
  buyDate: string;
  shares: string;
  costPricePerShare: string;
}

const today = new Date().toISOString().slice(0, 10);
const EMPTY_FORM: InvForm = {
  ticker: "",
  name: "",
  buyDate: today,
  shares: "",
  costPricePerShare: "",
};

export default function Investments() {
  const { data: investments, isLoading, isError, error } = useListInvestments();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetInvestmentSummary();
  const createInv = useCreateInvestment();
  const updateInv = useUpdateInvestment();
  const deleteInv = useDeleteInvestment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<InvForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetInvestmentSummaryQueryKey() });
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setAddOpen(true);
  };

  const openEdit = (id: number) => {
    const inv = investments?.find((i) => i.id === id);
    if (!inv) return;
    setForm({
      ticker: inv.ticker,
      name: inv.name,
      buyDate: inv.buyDate,
      shares: String(inv.shares),
      costPricePerShare: String(inv.costPricePerShare),
    });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createInv.mutateAsync({
        data: {
          ticker: form.ticker.toUpperCase(),
          name: form.name,
          buyDate: form.buyDate,
          shares: parseFloat(form.shares),
          costPricePerShare: parseFloat(form.costPricePerShare),
        },
      });
      invalidate();
      setAddOpen(false);
      toast({ title: "Investment added" });
    } catch {
      toast({ title: "Failed to add investment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    setSubmitting(true);
    try {
      await updateInv.mutateAsync({
        id: editId,
        data: {
          ticker: form.ticker.toUpperCase(),
          name: form.name,
          buyDate: form.buyDate,
          shares: parseFloat(form.shares),
          costPricePerShare: parseFloat(form.costPricePerShare),
        },
      });
      invalidate();
      setEditId(null);
      toast({ title: "Investment updated" });
    } catch {
      toast({ title: "Failed to update investment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this investment?")) return;
    try {
      await deleteInv.mutateAsync({ id });
      invalidate();
      toast({ title: "Investment deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const setField = <K extends keyof InvForm>(k: K, v: InvForm[K]) =>
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
          <Label htmlFor="inv-ticker">Ticker Symbol</Label>
          <Input
            id="inv-ticker"
            placeholder="e.g. VOO"
            value={form.ticker}
            onChange={(e) => setField("ticker", e.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-date">Buy Date</Label>
          <Input
            id="inv-date"
            type="date"
            value={form.buyDate}
            onChange={(e) => setField("buyDate", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-name">Company / Fund Name</Label>
        <Input
          id="inv-name"
          placeholder="e.g. Vanguard S&P 500 ETF"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-shares">Shares</Label>
          <Input
            id="inv-shares"
            type="number"
            step="0.0001"
            min="0"
            placeholder="10"
            value={form.shares}
            onChange={(e) => setField("shares", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-cost">Cost Price per Share (USD)</Label>
          <Input
            id="inv-cost"
            type="number"
            step="0.01"
            min="0"
            placeholder="420.50"
            value={form.costPricePerShare}
            onChange={(e) => setField("costPricePerShare", e.target.value)}
            required
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Investments</h1>
          <p className="text-muted-foreground">Portfolio tracking and market exposure.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Position
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Investment Position</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add Position"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Investment Position</DialogTitle>
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
        <div className="grid grid-cols-3 gap-4 p-4 rounded-md border border-border bg-card/50">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">{formatGbp(summary.totalValueGbp)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total P&L</p>
            <p className={`text-2xl font-bold ${summary.totalPlGbp >= 0 ? "text-success" : "text-destructive"}`}>
              {summary.totalPlGbp > 0 ? "+" : ""}{formatGbp(summary.totalPlGbp)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">P&L %</p>
            <p className={`text-2xl font-bold ${summary.totalPlPercent >= 0 ? "text-success" : "text-destructive"}`}>
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
                <TableCell className={`text-right font-medium ${inv.plPercent >= 0 ? "text-success" : "text-destructive"}`}>
                  {inv.plGbp > 0 ? "+" : ""}{formatGbp(inv.plGbp)}<br />
                  <span className="text-xs">({inv.plPercent > 0 ? "+" : ""}{formatPercent(inv.plPercent)})</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(inv.id)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(inv.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {investments?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No investments found. Add a position to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
