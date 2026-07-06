import { useState, useCallback, useEffect } from "react";
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
import { Plus, RefreshCw, Trash2, Edit2, Landmark, Link2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Currency = "GBP" | "USD" | "EUR" | "MYR" | "CNY" | "JPY" | "AUD" | "CAD" | "SGD" | "HKD" | "THB" | "INR";

interface AccountForm {
  name: string;
  currency: Currency;
  balance: string;
}

const EMPTY_FORM: AccountForm = { name: "", currency: "GBP", balance: "" };

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

// Plaid Link button — unchanged logic, updated style
function PlaidLinkButton({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const createToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      const institution = metadata.institution?.name ?? "My Bank";
      try {
        await exchangeToken.mutateAsync({ data: { publicToken, institutionName: institution } });
        toast({ title: `${institution} connected successfully` });
        onSuccess();
      } catch (err: any) {
        const detail = err?.response?.data?.details?.error_message ?? err?.message ?? "Unknown error";
        toast({ title: "Failed to link bank account", description: detail, variant: "destructive" });
      }
      setLinkToken(null);
      setPendingOpen(false);
    },
    onExit: (err) => {
      setLinkToken(null);
      setPendingOpen(false);
      if (err) {
        toast({ title: "Plaid Link exited with error", description: err.display_message ?? err.error_message ?? "Unknown error", variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    if (pendingOpen && ready) open();
  }, [pendingOpen, ready, open]);

  const handleClick = async () => {
    setFetchingToken(true);
    try {
      const result = await createToken.mutateAsync();
      setLinkToken(result.linkToken);
      setPendingOpen(true);
    } catch (err: any) {
      const detail = err?.response?.data?.error ?? err?.message ?? "Unable to create link token";
      toast({ title: "Could not start bank connection", description: detail, variant: "destructive" });
    } finally {
      setFetchingToken(false);
    }
  };

  const busy = fetchingToken || exchangeToken.isPending || pendingOpen;

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={busy}
      style={{ background: "#21262D", color: "#C9D1D9", border: "1px solid #30363D", borderRadius: 2, fontSize: 12 }}
    >
      <Link2 className={`w-3.5 h-3.5 mr-1.5 ${(fetchingToken || pendingOpen) ? "animate-spin" : ""}`} />
      {fetchingToken ? "Fetching token…" : pendingOpen ? "Opening…" : "Link Bank (Plaid)"}
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
    e.preventDefault(); setSubmitting(true);
    try {
      await createAccount.mutateAsync({ data: { name: form.name, currency: form.currency, balance: parseFloat(form.balance) } });
      await invalidate(); setAddOpen(false); toast({ title: "Account added" });
    } catch (err: any) {
      toast({ title: "Failed to add account", description: err?.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    try {
      await updateAccount.mutateAsync({ id: editId, data: { name: form.name, currency: form.currency, balance: parseFloat(form.balance) } });
      await invalidate(); setEditId(null); toast({ title: "Account updated" });
    } catch (err: any) {
      toast({ title: "Failed to update account", description: err?.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this account?")) return;
    try { await deleteAccount.mutateAsync({ id }); await invalidate(); toast({ title: "Account deleted" }); }
    catch (err: any) { toast({ title: "Failed to delete", description: err?.message, variant: "destructive" }); }
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
    return <div className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  const AccountFormFields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Account Name</Label>
        <Input id="acc-name" placeholder="e.g. HSBC Current Account" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
      </div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v as Currency }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GBP">GBP — British Pound</SelectItem>
            <SelectItem value="USD">USD — US Dollar</SelectItem>
            <SelectItem value="EUR">EUR — Euro</SelectItem>
            <SelectItem value="MYR">MYR — Malaysian Ringgit</SelectItem>
            <SelectItem value="CNY">CNY — Chinese Yuan</SelectItem>
            <SelectItem value="JPY">JPY — Japanese Yen</SelectItem>
            <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
            <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
            <SelectItem value="SGD">SGD — Singapore Dollar</SelectItem>
            <SelectItem value="HKD">HKD — Hong Kong Dollar</SelectItem>
            <SelectItem value="THB">THB — Thai Baht</SelectItem>
            <SelectItem value="INR">INR — Indian Rupee</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="acc-balance">Balance</Label>
        <Input id="acc-balance" type="number" step="0.01" placeholder="0.00" value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} required />
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "#E6EDF3" }}>Accounts</h1>
          <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>Manage your cash and linked bank accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PlaidLinkButton onSuccess={invalidate} />
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncPlaid.isPending}
            style={{ background: "#21262D", color: "#C9D1D9", border: "1px solid #30363D", borderRadius: 2, fontSize: 12 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncPlaid.isPending ? "animate-spin" : ""}`} />
            Sync Plaid
          </Button>
          <Button
            size="sm"
            onClick={openAdd}
            style={{ background: "#1F6FEB", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
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
          <form onSubmit={handleAdd}>{AccountFormFields}
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
          <form onSubmit={handleEdit}>{AccountFormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Accounts spreadsheet table */}
      <div className="border" style={{ borderColor: "#21262D" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "#3FB95022", borderColor: "#3FB95044", color: "#3FB950" }}>
          ▼ CASH ACCOUNTS — Multi-Currency (GBP Base)
        </div>

        <div className="overflow-x-auto">
        {/* Column headers */}
        <div className="flex" style={{ marginLeft: 36 }}>
          {[["ACCOUNT NAME", "1"], ["TYPE", "100px"], ["CURRENCY", "90px"], ["BALANCE (NATIVE)", "160px"], ["BALANCE (GBP)", "130px"], ["LAST SYNC", "120px"], ["ACTIONS", "90px"]].map(([h, w]) => (
            <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["BALANCE (NATIVE)", "BALANCE (GBP)", "ACTIONS"].includes(h as string) ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Account rows */}
        {accounts?.map((account, i) => (
          <div
            key={account.id}
            className="flex items-center border-b xls-row"
            style={{ borderColor: "rgba(33,38,45,0.5)", background: i % 2 === 0 ? "#0D1117" : "#0D1117" }}
          >
            <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "#484F58", borderColor: "#21262D", alignSelf: "stretch" }}>
              {i + 2}
            </div>
            {/* Name */}
            <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid #21262D" }}>
              <div className="flex items-center gap-2">
                <Landmark className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#484F58" }} />
                <span style={{ color: "#E6EDF3", fontSize: 12 }}>{account.name}</span>
                {account.isPlaidLinked && (
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: "#1F6FEB22", color: "#58A6FF" }}>
                    <Link2 className="w-2.5 h-2.5 inline mr-0.5" />PLAID
                  </span>
                )}
              </div>
            </div>
            {/* Type */}
            <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11 }}>
              {account.isPlaidLinked ? "Plaid-linked" : "Manual"}
            </div>
            {/* Currency */}
            <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#58A6FF", fontSize: 12, fontWeight: 700 }}>
              {account.currency}
            </div>
            {/* Native balance */}
            <div style={{ width: 160, minWidth: 160, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#C9D1D9", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {formatNative(account.balance, account.currency)}
            </div>
            {/* GBP balance */}
            <div style={{ width: 130, minWidth: 130, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#3FB950", fontSize: 12, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {formatGbp(account.gbpEquivalent)}
            </div>
            {/* Last sync */}
            <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#484F58", fontSize: 11 }}>
              {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : "—"}
            </div>
            {/* Actions */}
            <div style={{ width: 90, minWidth: 90, padding: "4px 6px", display: "flex", justifyContent: "flex-end", gap: 2 }}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(account.id)}>
                <Edit2 className="w-3.5 h-3.5" style={{ color: "#8B949E" }} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(account.id)}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#F85149" }} />
              </Button>
            </div>
          </div>
        ))}

        {accounts?.length === 0 && (
          <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
            <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
            <div className="flex-1 text-center py-8 text-xs" style={{ color: "#484F58" }}>
              No accounts yet — add one manually or link via Plaid.
            </div>
          </div>
        )}

        {/* Total row */}
        {(accounts?.length ?? 0) > 0 && (
          <div className="flex items-center border-t" style={{ background: "rgba(63,185,80,0.04)", borderColor: "#30363D" }}>
            <div style={{ width: 36, borderRight: "1px solid #21262D", alignSelf: "stretch" }} />
            <div style={{ flex: 1, padding: "6px 12px", borderRight: "1px solid #21262D", color: "#6E7681", fontSize: 10, fontWeight: 700 }}>TOTAL CASH</div>
            <div style={{ width: 100, minWidth: 100, borderRight: "1px solid #21262D" }} />
            <div style={{ width: 90, minWidth: 90, borderRight: "1px solid #21262D", padding: "6px 12px", color: "#484F58", fontSize: 10 }}>GBP</div>
            <div style={{ width: 160, minWidth: 160, borderRight: "1px solid #21262D" }} />
            <div style={{ width: 130, minWidth: 130, padding: "6px 12px", color: "#3FB950", fontSize: 12, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", borderRight: "1px solid #21262D" }}>
              {formatGbp(accounts?.reduce((sum, a) => sum + a.gbpEquivalent, 0) ?? 0)}
            </div>
            <div style={{ width: 120, minWidth: 120, borderRight: "1px solid #21262D" }} />
            <div style={{ width: 90, minWidth: 90 }} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
