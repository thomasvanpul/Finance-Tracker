import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useCreatePlaidLinkToken,
  useExchangePlaidToken,
  useSyncPlaidTransactions,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { usePlaidLink } from "react-plaid-link";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Plus, RefreshCw, Trash2, Edit2, Landmark, Link2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Currency = "GBP" | "USD" | "MYR" | "CNY";

interface AccountForm {
  name: string;
  currency: Currency;
  balance: string;
}

const EMPTY_FORM: AccountForm = { name: "", currency: "GBP", balance: "" };

// Plaid Link button — fetches a link token and opens Plaid Link UI
function PlaidLinkButton({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const createToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [institutionName, setInstitutionName] = useState("My Bank");

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      const institution = metadata.institution?.name ?? "My Bank";
      setInstitutionName(institution);
      try {
        await exchangeToken.mutateAsync({
          data: { publicToken, institutionName: institution },
        });
        toast({ title: `${institution} connected successfully` });
        onSuccess();
      } catch (err: any) {
        const detail = err?.response?.data?.details?.error_message ?? err?.message ?? "Unknown error";
        toast({
          title: "Failed to link bank account",
          description: detail,
          variant: "destructive",
        });
      }
    },
    onExit: (err) => {
      if (err) {
        toast({
          title: "Plaid Link exited with error",
          description: err.display_message ?? err.error_message ?? "Unknown error",
          variant: "destructive",
        });
      }
    },
  });

  const handleClick = async () => {
    setFetchingToken(true);
    try {
      const result = await createToken.mutateAsync();
      setLinkToken(result.linkToken);
      // usePlaidLink opens automatically once token is set and ready
      // We call open() after a tick to let the token propagate
      setTimeout(() => open(), 100);
    } catch (err: any) {
      const detail = err?.response?.data?.error ?? err?.message ?? "Unable to create link token";
      toast({
        title: "Could not start bank connection",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setFetchingToken(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleClick} disabled={fetchingToken || exchangeToken.isPending}>
      <Link2 className={`w-4 h-4 mr-2 ${fetchingToken ? "animate-spin" : ""}`} />
      {fetchingToken ? "Connecting…" : "Link Bank (Plaid)"}
    </Button>
  );
}

export default function Accounts() {
  const { data: accounts, isLoading, isError, error } = useListAccounts();
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

  const invalidate = useCallback(() =>
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }),
    [queryClient]
  );

  const openAdd = () => { setForm(EMPTY_FORM); setAddOpen(true); };

  const openEdit = (id: number) => {
    const acct = accounts?.find((a) => a.id === id);
    if (!acct) return;
    setForm({ name: acct.name, currency: acct.currency as Currency, balance: String(acct.balance) });
    setEditId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAccount.mutateAsync({
        data: { name: form.name, currency: form.currency, balance: parseFloat(form.balance) },
      });
      await invalidate();
      setAddOpen(false);
      toast({ title: "Account added" });
    } catch (err: any) {
      toast({ title: "Failed to add account", description: err?.message, variant: "destructive" });
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
        data: { name: form.name, currency: form.currency, balance: parseFloat(form.balance) },
      });
      await invalidate();
      setEditId(null);
      toast({ title: "Account updated" });
    } catch (err: any) {
      toast({ title: "Failed to update account", description: err?.message, variant: "destructive" });
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
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err?.message, variant: "destructive" });
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncPlaid.mutateAsync();
      await invalidate();
      toast({ title: `Sync complete — ${result.added} added, ${result.updated} updated` });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err?.message, variant: "destructive" });
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
        <Input id="acc-name" placeholder="e.g. HSBC Current Account"
          value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
      </div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
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
        <Input id="acc-balance" type="number" step="0.01" placeholder="0.00"
          value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} required />
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
        <div className="flex items-center gap-3 flex-wrap">
          <PlaidLinkButton onSuccess={invalidate} />
          <Button variant="outline" onClick={handleSync} disabled={syncPlaid.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncPlaid.isPending ? "animate-spin" : ""}`} />
            Sync Transactions
          </Button>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load accounts</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Unknown error"}</AlertDescription>
        </Alert>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd}>
            {AccountFormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add Account"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit}>
            {AccountFormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
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
                        <p className="text-xs text-primary flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          Plaid synced {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{formatNative(account.balance, account.currency)}</TableCell>
                <TableCell className="text-right font-medium">{formatGbp(account.gbpEquivalent)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(account.id)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(account.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {accounts?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No accounts found. Add one manually or link via Plaid.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
