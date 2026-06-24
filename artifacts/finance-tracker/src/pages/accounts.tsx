import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useSyncPlaidTransactions,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
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
import { Plus, RefreshCw, Trash2, Edit2, Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Currency = "GBP" | "USD" | "MYR" | "CNY";

interface AccountForm {
  name: string;
  currency: Currency;
  balance: string;
}

const EMPTY_FORM: AccountForm = { name: "", currency: "GBP", balance: "" };

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const syncPlaid = useSyncPlaidTransactions();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setAddOpen(true);
  };

  const openEdit = (id: number) => {
    const acct = accounts?.find((a) => a.id === id);
    if (!acct) return;
    setForm({
      name: acct.name,
      currency: acct.currency as Currency,
      balance: String(acct.balance),
    });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAccount.mutateAsync({
        data: {
          name: form.name,
          currency: form.currency,
          balance: parseFloat(form.balance),
        },
      });
      await invalidate();
      setAddOpen(false);
      toast({ title: "Account added" });
    } catch {
      toast({ title: "Failed to add account", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    setSubmitting(true);
    try {
      await updateAccount.mutateAsync({
        id: editId,
        data: {
          name: form.name,
          currency: form.currency,
          balance: parseFloat(form.balance),
        },
      });
      await invalidate();
      setEditId(null);
      toast({ title: "Account updated" });
    } catch {
      toast({ title: "Failed to update account", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this account?")) return;
    try {
      await deleteAccount.mutateAsync({ id });
      await invalidate();
      toast({ title: "Account deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleSync = async () => {
    try {
      await syncPlaid.mutateAsync();
      await invalidate();
      toast({ title: "Accounts synced" });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const AccountFormFields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Account Name</Label>
        <Input
          id="acc-name"
          placeholder="e.g. HSBC Current Account"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select
          value={form.currency}
          onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GBP">GBP — British Pound</SelectItem>
            <SelectItem value="USD">USD — US Dollar</SelectItem>
            <SelectItem value="MYR">MYR — Malaysian Ringgit</SelectItem>
            <SelectItem value="CNY">CNY — Chinese Yuan</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-balance">Balance</Label>
        <Input
          id="acc-balance"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={form.balance}
          onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
          required
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Accounts</h1>
          <p className="text-muted-foreground">Manage your cash and linked bank accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSync} disabled={syncPlaid.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncPlaid.isPending ? "animate-spin" : ""}`} />
            Sync Bank
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {AccountFormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {AccountFormFields}
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

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Account</TableHead>
              <TableHead>Balance (Native)</TableHead>
              <TableHead className="text-right">Balance (GBP)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts?.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Landmark className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{account.name}</p>
                      {account.isPlaidLinked && (
                        <p className="text-xs text-muted-foreground">
                          Synced: {formatDate(account.lastSyncedAt || "")}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{formatNative(account.balance, account.currency)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatGbp(account.gbpEquivalent)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(account.id)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {accounts?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No accounts found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
