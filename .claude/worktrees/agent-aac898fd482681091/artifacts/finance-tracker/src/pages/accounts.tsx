import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useGetWiseStatus,
  useSyncWiseTransactions,
  useImportCsv,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
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
import { Plus, RefreshCw, Trash2, Edit2, Landmark, Link2, Upload, AlertCircle } from "lucide-react";
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

// Small badge showing whether the Wise personal API token is configured & working.
function WiseStatusBadge() {
  const { data: status } = useGetWiseStatus();
  if (!status) return null;

  const label = !status.configured
    ? "Wise: not configured"
    : status.connected
    ? `Wise: connected${status.profileName ? ` (${status.profileName})` : ""}`
    : `Wise: ${status.error ?? "connection error"}`;
  const color = status.connected ? "#3FB950" : status.configured ? "#F85149" : "#8B949E";

  return (
    <span
      className="flex items-center gap-1"
      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 2, background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      <Link2 className="w-3 h-3" />
      {label}
    </span>
  );
}

const PROVIDER_HINTS: Record<"revolut" | "maybank", string> = {
  revolut: "Export from Revolut app: Profile → Statements → select account → Export (CSV)",
  maybank: "Export from Maybank2u: Accounts → Account History → Download (CSV or Excel)",
};

interface ImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

// CSV import dialog — used for Revolut and Maybank exports (no live API for either
// that a hobby project can use for free; see accounts.tsx history for why).
function CsvImportDialog({ accounts, onImported }: { accounts: { id: number; name: string }[]; onImported: () => void }) {
  const { toast } = useToast();
  const importCsv = useImportCsv();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<"revolut" | "maybank">("revolut");
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setFile(null); setResult(null); };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const handleImport = async () => {
    if (!file || !accountId) return;
    setResult(null);
    try {
      const res = await importCsv.mutateAsync({
        params: { provider, accountId: Number(accountId) },
        data: { file },
      });
      setResult({ added: res.added, skipped: res.skipped, errors: res.errors });
      onImported();
      if (res.errors.length === 0) {
        toast({ title: `Import complete — ${res.added} added, ${res.skipped} skipped` });
        setOpen(false);
        reset();
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        style={{ background: "#21262D", color: "#C9D1D9", border: "1px solid #30363D", borderRadius: 2, fontSize: 12 }}
      >
        <Upload className="w-3.5 h-3.5 mr-1.5" />
        Import CSV
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Import transactions from CSV</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bank / Source</Label>
            <Select value={provider} onValueChange={(v) => { setProvider(v as "revolut" | "maybank"); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revolut">Revolut (Statement export)</SelectItem>
                <SelectItem value="maybank">Maybank (Transaction export)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs" style={{ color: "#6E7681" }}>{PROVIDER_HINTS[provider]}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Account to import into</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
          </div>

          {/* Result panel — shown when import finished with parse errors */}
          {result && (
            <div className="rounded-sm border p-3 space-y-2" style={{ borderColor: "#30363D", background: "#161B22" }}>
              <p className="text-xs font-semibold" style={{ color: "#3FB950" }}>
                Import complete — {result.added} added, {result.skipped} skipped
              </p>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold" style={{ color: "#F0883E" }}>
                    {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped due to parse errors:
                  </p>
                  <div
                    className="font-mono text-xs overflow-y-auto space-y-0.5"
                    style={{ maxHeight: 120, color: "#8B949E" }}
                  >
                    {result.errors.map((e, i) => (
                      <div key={i}>· {e}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <DialogClose asChild><Button type="button" variant="outline">
            {result ? "Done" : "Cancel"}
          </Button></DialogClose>
          {!result && (
            <Button type="button" disabled={!file || !accountId || importCsv.isPending} onClick={handleImport}>
              {importCsv.isPending ? "Importing…" : "Import"}
            </Button>
          )}
          {result && result.errors.length > 0 && (
            <Button type="button" onClick={() => { setResult(null); setFile(null); }}>
              Import another file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Accounts() {
  const { data: accounts, isLoading, isError, error } = useListAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const syncWise = useSyncWiseTransactions();

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
      const result = await syncWise.mutateAsync();
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
          <WiseStatusBadge />
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncWise.isPending}
            style={{ background: "#21262D", color: "#C9D1D9", border: "1px solid #30363D", borderRadius: 2, fontSize: 12 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncWise.isPending ? "animate-spin" : ""}`} />
            Sync Wise
          </Button>
          <CsvImportDialog accounts={accounts ?? []} onImported={invalidate} />
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
                {account.isWiseLinked && (
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: "#1F6FEB22", color: "#58A6FF" }}>
                    <Link2 className="w-2.5 h-2.5 inline mr-0.5" />WISE
                  </span>
                )}
              </div>
            </div>
            {/* Type */}
            <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid #21262D", color: "#8B949E", fontSize: 11 }}>
              {account.isWiseLinked ? "Wise-linked" : "Manual"}
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
              No accounts yet — add one manually, sync Wise, or import a CSV.
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
