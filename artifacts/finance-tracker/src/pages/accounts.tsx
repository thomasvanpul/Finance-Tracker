import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useGetWiseStatus,
  useSyncWiseTransactions,
  useListTransactions,
  useCreateTransaction,
  getListAccountsQueryKey,
  getListTransactionsQueryKey,
  useGetSettingsCurrency,
  useGetDashboard,
} from "@workspace/api-client-react";
import { formatGbp, formatNative, formatDate } from "@/lib/utils";
import { usePrivacy } from "@/contexts/privacy-context";
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
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Landmark,
  Link2,
  Upload,
  Wallet,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Currency =
  | "GBP"
  | "USD"
  | "EUR"
  | "MYR"
  | "CNY"
  | "JPY"
  | "AUD"
  | "CAD"
  | "SGD"
  | "HKD"
  | "THB"
  | "INR";

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
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-raised)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
};

const HISTORY_KEY = "ft-nw-history";

type NwHistoryEntry = { date: string; netWorth: number };

function loadNwHistory(): NwHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Wise status badge ────────────────────────────────────────────────────────

function WiseStatusBadge() {
  const { data: status } = useGetWiseStatus();
  if (!status) return null;

  const label = !status.configured
    ? "Wise: not configured"
    : status.connected
    ? `Wise: connected${status.profileName ? ` (${status.profileName})` : ""}`
    : `Wise: ${status.error ?? "connection error"}`;
  const color = status.connected
    ? "var(--ft-green)"
    : status.configured
    ? "var(--ft-red)"
    : "var(--ft-muted)";

  return (
    <span
      className="flex items-center gap-1"
      style={{
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 2,
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      <Link2 className="w-3 h-3" />
      {label}
    </span>
  );
}

// ─── Import redirect button ──────────────────────────────────────────────────

function ImportCsvButton() {
  const [, navigate] = useLocation();
  return (
    <Button
      size="sm"
      onClick={() => navigate("/import")}
      style={{
        background: "var(--ft-raised)",
        color: "var(--ft-text)",
        border: "1px solid var(--ft-border2)",
        borderRadius: 2,
        fontSize: 12,
      }}
    >
      <Upload className="w-3.5 h-3.5 mr-1.5" />
      Import CSV
    </Button>
  );
}

// ─── Transfer modal ───────────────────────────────────────────────────────────

interface TransferForm {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency: Currency;
  date: string;
  description: string;
}

const todayStr = new Date().toISOString().slice(0, 10);
const EMPTY_TRANSFER: TransferForm = {
  fromAccountId: "",
  toAccountId: "",
  amount: "",
  currency: "GBP",
  date: todayStr,
  description: "",
};

function TransferModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accounts } = useListAccounts();
  const createTx = useCreateTransaction();
  const [form, setForm] = useState<TransferForm>(EMPTY_TRANSFER);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) setForm(EMPTY_TRANSFER);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromAccountId || !form.toAccountId || !form.amount) return;
    if (form.fromAccountId === form.toAccountId) {
      toast({
        title: "Invalid transfer",
        description: "From and To accounts must be different.",
        variant: "destructive",
      });
      return;
    }

    const fromAccount = accounts?.find((a) => String(a.id) === form.fromAccountId);
    const toAccount = accounts?.find((a) => String(a.id) === form.toAccountId);
    if (!fromAccount || !toAccount) return;

    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a positive amount.",
        variant: "destructive",
      });
      return;
    }

    const desc = form.description.trim() || `Transfer`;

    setSubmitting(true);
    try {
      await createTx.mutateAsync({
        data: {
          date: form.date,
          description: `${desc} → ${toAccount.name}`,
          type: "transfer",
          category: "Transfer",
          accountId: fromAccount.id,
          nativeAmount: amount,
          currency: form.currency,
        },
      });
      await createTx.mutateAsync({
        data: {
          date: form.date,
          description: `${desc} ← ${fromAccount.name}`,
          type: "transfer",
          category: "Transfer",
          accountId: toAccount.id,
          nativeAmount: amount,
          currency: form.currency,
        },
      });

      await queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });

      toast({ title: "Transfer recorded successfully" });
      handleOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Transfer failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const setField = <K extends keyof TransferForm>(key: K, value: TransferForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.04em" }}
          >
            Transfer Between Accounts
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                From Account
              </Label>
              <Select
                value={form.fromAccountId}
                onValueChange={(v) => setField("fromAccountId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                To Account
              </Label>
              <Select
                value={form.toAccountId}
                onValueChange={(v) => setField("toAccountId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={String(a.id)}
                      disabled={String(a.id) === form.fromAccountId}
                    >
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <Label style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Amount
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5" style={{ width: 110 }}>
                <Label style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Currency
                </Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setField("currency", v as Currency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      ["GBP","USD","EUR","MYR","CNY","JPY","AUD","CAD","SGD","HKD","THB","INR"] as Currency[]
                    ).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Date
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label style={{ fontSize: 11, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Description (optional)
              </Label>
              <Input
                placeholder="e.g. Monthly savings sweep"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={submitting || !form.fromAccountId || !form.toAccountId || !form.amount}
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", borderRadius: 2 }}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
              {submitting ? "Processing…" : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Account detail panel ─────────────────────────────────────────────────────

interface AccountStats {
  daysSinceLast: number | null;
  isOverdraft: boolean;
  isDormant: boolean;
  isActive: boolean;
}

function computeAccountStats(
  accountName: string,
  transactions: { accountName: string; date: string }[]
): AccountStats {
  const acctTxs = transactions.filter((t) => t.accountName === accountName);
  const isOverdraft = false; // computed from balance, passed separately

  if (acctTxs.length === 0) {
    return { daysSinceLast: null, isOverdraft, isDormant: true, isActive: false };
  }

  const sorted = [...acctTxs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastDate = new Date(sorted[0].date);
  const now = new Date();
  const daysSinceLast = Math.floor(
    (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const isDormant = daysSinceLast >= 60;
  const isActive = !isDormant;

  return { daysSinceLast, isOverdraft, isDormant, isActive };
}

interface DetailPanelProps {
  accountName: string;
  accountId: number;
  balance: number;
  currency: string;
  nwHistory: { date: string; netWorth: number }[];
}

function AccountDetailPanel({ accountName, balance, currency, nwHistory }: DetailPanelProps) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const { data: monthlyTxs, isLoading: loadingMonthly } = useListTransactions({
    dateFrom: firstOfMonth,
    dateTo: lastOfMonth,
  });

  // nwHistory passed as prop from parent (written after dashData loads)

  // Filter monthly transactions for this account
  const acctMonthlyTxs = useMemo(
    () => (monthlyTxs ?? []).filter((t) => t.accountName === accountName),
    [monthlyTxs, accountName]
  );

  // Group monthly spending by category (expenses only)
  const categorySpend = useMemo(() => {
    const map = new Map<string, number>();
    acctMonthlyTxs
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const cat = t.category || "Uncategorised";
        map.set(cat, (map.get(cat) ?? 0) + Math.abs(t.gbpValue));
      });
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [acctMonthlyTxs]);

  const maxSpend = categorySpend[0]?.total ?? 1;

  // Recent transactions for this account (last 10)
  const recentTxs = useMemo(
    () =>
      [...acctMonthlyTxs]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10),
    [acctMonthlyTxs]
  );

  const panelStyle: React.CSSProperties = {
    background: "var(--ft-base)",
    borderTop: "1px solid var(--ft-raised)",
    padding: "16px 20px",
    fontFamily: "var(--font-mono)",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    color: "var(--ft-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
  };

  return (
    <div style={panelStyle}>
      {/* Header strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "1px solid var(--ft-raised)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--ft-muted)" }}>
          Detail view —
        </span>
        <span style={{ fontSize: 12, color: "var(--ft-text)", fontWeight: 700 }}>
          {accountName}
        </span>
        <span style={{ fontSize: 11, color: "var(--ft-blue)" }}>{currency}</span>
        <span
          style={{
            fontSize: 12,
            color: balance < 0 ? "var(--ft-red)" : "var(--ft-green)",
            fontWeight: 700,
            marginLeft: "auto",
          }}
        >
          {formatNative(balance, currency)}
        </span>
      </div>

      <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {/* Col 1: Balance history */}
        <div>
          <div style={sectionLabel}>Net Worth History</div>
          {nwHistory.length === 0 ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--ft-dim)",
                padding: "20px 0",
                textAlign: "center",
                border: "1px dashed var(--ft-raised)",
              }}
            >
              History builds up daily — check back tomorrow
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart
                data={nwHistory}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--ft-amber)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--ft-amber)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  hide
                />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--ft-surface)",
                    border: "1px solid var(--ft-border2)",
                    borderRadius: 2,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--ft-text)",
                  }}
                  formatter={(v: number) => [`£${v.toFixed(0)}`, "Net Worth"]}
                  labelFormatter={(label: string) =>
                    new Date(label).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  }
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="var(--ft-amber)"
                  strokeWidth={1.5}
                  fill="url(#nwGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--ft-amber)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Col 2: Monthly spending breakdown */}
        <div>
          <div style={sectionLabel}>
            Spending This Month
          </div>
          {loadingMonthly ? (
            <div style={{ fontSize: 10, color: "var(--ft-dim)" }}>Loading…</div>
          ) : categorySpend.length === 0 ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--ft-dim)",
                padding: "20px 0",
                textAlign: "center",
              }}
            >
              No expenses this month
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {categorySpend.map(({ category, total }) => (
                <div key={category}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--ft-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {category}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--ft-text)" }}>
                      {formatGbp(total)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 3,
                      background: "var(--ft-raised)",
                      borderRadius: 1,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(total / maxSpend) * 100}%`,
                        background: "var(--ft-red)",
                        borderRadius: 1,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Col 3: Recent transactions */}
        <div>
          <div style={sectionLabel}>Recent Transactions</div>
          {loadingMonthly ? (
            <div style={{ fontSize: 10, color: "var(--ft-dim)" }}>Loading…</div>
          ) : recentTxs.length === 0 ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--ft-dim)",
                padding: "20px 0",
                textAlign: "center",
              }}
            >
              No transactions this month
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentTxs.map((tx) => {
                const typeColor =
                  tx.type === "income"
                    ? "var(--ft-green)"
                    : tx.type === "transfer"
                    ? "var(--ft-blue)"
                    : "var(--ft-red)";
                return (
                  <div
                    key={tx.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "3px 0",
                      borderBottom: "1px solid var(--ft-surface)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--ft-text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tx.description}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--ft-dim)" }}>
                        {formatDate(tx.date)}
                        {tx.category ? ` · ${tx.category}` : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: typeColor,
                        fontWeight: 600,
                        marginLeft: 8,
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {tx.type === "expense" ? "-" : "+"}
                      {formatNative(Math.abs(tx.nativeAmount), tx.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Health indicator badges ──────────────────────────────────────────────────

interface HealthBadgesProps {
  accountName: string;
  balance: number;
  stats: AccountStats;
}

function HealthBadges({ accountName: _accountName, balance, stats }: HealthBadgesProps) {
  const isOverdraft = balance < 0;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      {/* Overdraft warning */}
      {isOverdraft && (
        <span
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            background: "var(--ft-red)33",
            color: "var(--ft-red)",
            border: "1px solid var(--ft-red)66",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          OVERDRAFT
        </span>
      )}

      {/* Active / Dormant */}
      {stats.isDormant ? (
        <span
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            background: "var(--ft-amber)22",
            color: "var(--ft-amber)",
            border: "1px solid var(--ft-amber)44",
            letterSpacing: "0.04em",
          }}
        >
          DORMANT
        </span>
      ) : (
        <span
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            background: "var(--ft-green)22",
            color: "var(--ft-green)",
            border: "1px solid var(--ft-green)44",
            letterSpacing: "0.04em",
          }}
        >
          ACTIVE
        </span>
      )}

      {/* Days since last transaction */}
      {stats.daysSinceLast !== null && (
        <span
          style={{
            fontSize: 9,
            color: stats.daysSinceLast > 30 ? "var(--ft-amber)" : "var(--ft-dim)",
            letterSpacing: "0.02em",
          }}
        >
          {stats.daysSinceLast === 0
            ? "txn today"
            : `${stats.daysSinceLast}d ago`}
          {stats.daysSinceLast > 30 && " ⚠"}
        </span>
      )}

      {stats.daysSinceLast === null && (
        <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>no history</span>
      )}
    </div>
  );
}

// ─── Main Accounts page ───────────────────────────────────────────────────────

export default function Accounts() {
  const { data: accounts, isLoading, isError, error } = useListAccounts();
  const { data: currencySettings } = useGetSettingsCurrency();
  const baseCurrency = currencySettings?.baseCurrency ?? "GBP";
  const { privacy } = usePrivacy();
  const privacyStyle = privacy ? { filter: "blur(5px)", userSelect: "none" as const, pointerEvents: "none" as const } : {};
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const syncWise = useSyncWiseTransactions();

  // Health data: last 90 days of transactions for all accounts
  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: healthTxs } = useListTransactions({ dateFrom: ninetyDaysAgo });
  const { data: dashData } = useGetDashboard();

  const [nwHistory, setNwHistory] = useState<{ date: string; netWorth: number }[]>(() => loadNwHistory());

  // Write daily net-worth snapshot and keep nwHistory state in sync
  useEffect(() => {
    if (!dashData) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const existing: { date: string; netWorth: number; cash?: number; portfolio?: number }[] = raw ? JSON.parse(raw) : [];
      if (existing.some(e => e.date === today)) {
        setNwHistory(existing);
        return;
      }
      const entry = { date: today, netWorth: dashData.netWorth, cash: dashData.totalCash, portfolio: dashData.portfolio.totalValueGbp };
      const updated = [...existing, entry].slice(-365);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      setNwHistory(updated);
    } catch { /* noop */ }
  }, [dashData]);

  // Per-account stats derived from health transactions
  const accountStatsMap = useMemo(() => {
    const map = new Map<string, AccountStats>();
    if (!accounts) return map;
    accounts.forEach((acct) => {
      const stats = computeAccountStats(acct.name, healthTxs ?? []);
      map.set(acct.name, stats);
    });
    return map;
  }, [accounts, healthTxs]);

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("highlight");
      return v ? parseInt(v, 10) : null;
    } catch { return null; }
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }),
    [queryClient]
  );

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Failed to add account", description: message, variant: "destructive" });
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Failed to update account", description: message, variant: "destructive" });
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Failed to delete", description: message, variant: "destructive" });
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncWise.mutateAsync();
      await invalidate();
      toast({
        title: `Sync complete — ${result.added} added, ${result.updated} updated`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedAccountId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <FtSkeleton width={160} height={16} />
          <div style={{ display: "flex", gap: 8 }}>
            <FtSkeleton width={90} height={28} />
            <FtSkeleton width={90} height={28} />
            <FtSkeleton width={100} height={28} />
          </div>
        </div>
        {/* Table skeleton */}
        <div style={{ border: "1px solid var(--ft-border)" }}>
          <div style={{ padding: "6px 12px", background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-border)" }}>
            <FtSkeleton width={280} height={10} />
          </div>
          {/* Column headers */}
          <div style={{ display: "flex", gap: 12, padding: "6px 12px", background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)" }}>
            {[160, 80, 70, 130, 110, 160, 100, 70].map((w, i) => (
              <FtSkeleton key={i} width={w} height={9} />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 12px", borderBottom: "1px solid var(--ft-raised)", alignItems: "center" }}>
              <FtSkeleton width={160} height={12} />
              <FtSkeleton width={80} height={11} />
              <FtSkeleton width={50} height={12} />
              <FtSkeleton width={110} height={12} />
              <FtSkeleton width={90} height={12} />
              <FtSkeleton width={120} height={11} />
              <FtSkeleton width={80} height={11} />
              <FtSkeleton width={50} height={11} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState message={(error as Error)?.message ?? "Could not load accounts. Check your connection and try again."} />
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
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={Wallet}
        title="Accounts"
        subtitle="Manage your cash and linked bank accounts"
        actions={
          <>
            <WiseStatusBadge />
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncWise.isPending}
              style={{
                background: "var(--ft-raised)",
                color: "var(--ft-text)",
                border: "1px solid var(--ft-border2)",
                borderRadius: 2,
                fontSize: 12,
              }}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${syncWise.isPending ? "animate-spin" : ""}`}
              />
              Sync Wise
            </Button>
            <ImportCsvButton />
            <Button
              size="sm"
              onClick={() => setTransferOpen(true)}
              style={{
                background: "var(--ft-raised)",
                color: "var(--ft-blue)",
                border: "1px solid var(--ft-blue)44",
                borderRadius: 2,
                fontSize: 12,
              }}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
              Transfer
            </Button>
            <Button
              size="sm"
              onClick={openAdd}
              style={{
                background: "var(--ft-blue)",
                color: "white",
                border: "none",
                borderRadius: 2,
                fontSize: 12,
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Account
            </Button>
          </>
        }
      />


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
                <Button type="button" variant="outline">
                  Cancel
                </Button>
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
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <TransferModal open={transferOpen} onOpenChange={setTransferOpen} />

      {/* Accounts spreadsheet table */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <div
          className="flex items-center px-3 py-1.5 text-xs font-bold border-b"
          style={{
            background: "var(--ft-green)22",
            borderColor: "var(--ft-green)44",
            color: "var(--ft-green)",
          }}
        >
          ▼ CASH ACCOUNTS — Multi-Currency ({baseCurrency} Base)
        </div>

        <div className="overflow-x-auto">
          {/* Column headers */}
          <div className="flex" style={{ marginLeft: 52 }}>
            {[
              ["ACCOUNT NAME", "1"],
              ["TYPE", "100px"],
              ["CURRENCY", "90px"],
              ["BALANCE (NATIVE)", "160px"],
              [`BALANCE (${baseCurrency})`, "130px"],
              ["HEALTH", "200px"],
              ["LAST SYNC", "120px"],
              ["ACTIONS", "90px"],
            ].map(([h, w]) => (
              <div
                key={h as string}
                style={{
                  ...TH,
                  flex: w === "1" ? 1 : undefined,
                  width: w !== "1" ? (w as string) : undefined,
                  minWidth: w !== "1" ? (w as string) : undefined,
                  textAlign: ["BALANCE (NATIVE)", `BALANCE (${baseCurrency})`, "ACTIONS"].includes(
                    h as string
                  )
                    ? "right"
                    : "left",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Account rows + detail panels */}
          {accounts?.map((account, i) => {
            const isExpanded = expandedAccountId === account.id;
            const stats = accountStatsMap.get(account.name) ?? {
              daysSinceLast: null,
              isOverdraft: account.balance < 0,
              isDormant: true,
              isActive: false,
            };

            const isHighlighted = highlightId === account.id;
            return (
              <div key={account.id}>
                {/* Main row */}
                <div
                  className="flex items-center border-b xls-row"
                  style={{
                    borderColor: "rgba(33,38,45,0.5)",
                    background: isExpanded ? "var(--ft-surface)" : "var(--ft-base)",
                    cursor: "pointer",
                    outline: isHighlighted ? "1.5px solid var(--ft-accent)" : undefined,
                    outlineOffset: isHighlighted ? "-1px" : undefined,
                  }}
                  ref={isHighlighted ? (el) => { if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => setHighlightId(null), 2000); } } : undefined}
                  onClick={() => toggleExpand(account.id)}
                >
                  {/* Row number + expand toggle */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center text-xs border-r"
                    style={{
                      width: 36,
                      color: "var(--ft-dim)",
                      borderColor: "var(--ft-border)",
                      alignSelf: "stretch",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(account.id);
                    }}
                  >
                    {i + 2}
                  </div>
                  {/* Chevron */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center border-r"
                    style={{
                      width: 16,
                      color: "var(--ft-dim)",
                      borderColor: "var(--ft-border)",
                      alignSelf: "stretch",
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" style={{ color: "var(--ft-amber)" }} />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </div>

                  {/* Name */}
                  <div
                    style={{
                      flex: 1,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Landmark
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: "var(--ft-dim)" }}
                      />
                      <span style={{ color: "var(--ft-text)", fontSize: 12 }}>
                        {account.name}
                      </span>
                      {account.isWiseLinked && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 2,
                            background: "rgba(96,165,250,0.08)",
                            color: "var(--ft-blue)",
                          }}
                        >
                          <Link2 className="w-2.5 h-2.5 inline mr-0.5" />
                          WISE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Type */}
                  <div
                    style={{
                      width: 100,
                      minWidth: 100,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: "var(--ft-muted)",
                      fontSize: 11,
                    }}
                  >
                    {account.isWiseLinked ? "Wise-linked" : "Manual"}
                  </div>

                  {/* Currency */}
                  <div
                    style={{
                      width: 90,
                      minWidth: 90,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: "var(--ft-blue)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {account.currency}
                  </div>

                  {/* Native balance */}
                  <div
                    className="pnum"
                    style={{
                      width: 160,
                      minWidth: 160,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: account.balance < 0 ? "var(--ft-red)" : "var(--ft-text)",
                      fontSize: 12,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      ...privacyStyle,
                    }}
                  >
                    {formatNative(account.balance, account.currency)}
                  </div>

                  {/* Base currency balance */}
                  <div
                    className="pnum"
                    style={{
                      width: 130,
                      minWidth: 130,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: account.gbpEquivalent < 0 ? "var(--ft-red)" : "var(--ft-green)",
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      ...privacyStyle,
                    }}
                  >
                    {formatGbp(account.gbpEquivalent)}
                  </div>

                  {/* Health column */}
                  <div
                    style={{
                      width: 200,
                      minWidth: 200,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HealthBadges
                      accountName={account.name}
                      balance={account.balance}
                      stats={stats}
                    />
                  </div>

                  {/* Last sync */}
                  <div
                    style={{
                      width: 120,
                      minWidth: 120,
                      padding: "7px 12px",
                      borderRight: "1px solid var(--ft-raised)",
                      color: "var(--ft-dim)",
                      fontSize: 11,
                    }}
                  >
                    {account.lastSyncedAt ? formatDate(account.lastSyncedAt) : "—"}
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      width: 90,
                      minWidth: 90,
                      padding: "4px 6px",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 2,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(account.id)}
                    >
                      <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDelete(account.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
                    </Button>
                  </div>
                </div>

                {/* Detail panel — rendered inline below the row */}
                {isExpanded && (
                  <AccountDetailPanel
                    accountName={account.name}
                    accountId={account.id}
                    balance={account.balance}
                    currency={account.currency}
                    nwHistory={nwHistory}
                  />
                )}
              </div>
            );
          })}

          {accounts?.length === 0 && (
            <EmptyState
              title="No accounts"
              description="No accounts yet — add one manually, sync Wise, or import a CSV."
              action={{ label: "+ Add Account", onClick: openAdd }}
            />
          )}

          {/* Total row */}
          {(accounts?.length ?? 0) > 0 && (
            <div
              className="flex items-center border-t"
              style={{ background: "rgba(63,185,80,0.04)", borderColor: "var(--ft-border2)" }}
            >
              <div style={{ width: 52, borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }} />
              <div
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  borderRight: "1px solid var(--ft-raised)",
                  color: "var(--ft-dim)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                TOTAL CASH
              </div>
              <div
                style={{
                  width: 100,
                  minWidth: 100,
                  borderRight: "1px solid var(--ft-raised)",
                }}
              />
              <div
                style={{
                  width: 90,
                  minWidth: 90,
                  borderRight: "1px solid var(--ft-raised)",
                  padding: "6px 12px",
                  color: "var(--ft-dim)",
                  fontSize: 10,
                }}
              >
                {baseCurrency}
              </div>
              <div style={{ width: 160, minWidth: 160, borderRight: "1px solid var(--ft-raised)" }} />
              <div
                className="pnum"
                style={{
                  width: 130,
                  minWidth: 130,
                  padding: "6px 12px",
                  color: "var(--ft-green)",
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  borderRight: "1px solid var(--ft-raised)",
                  ...privacyStyle,
                }}
              >
                {formatGbp(
                  accounts?.reduce((sum, a) => sum + a.gbpEquivalent, 0) ?? 0
                )}
              </div>
              <div
                style={{
                  width: 200,
                  minWidth: 200,
                  borderRight: "1px solid var(--ft-raised)",
                }}
              />
              <div
                style={{ width: 120, minWidth: 120, borderRight: "1px solid var(--ft-raised)" }}
              />
              <div style={{ width: 90, minWidth: 90 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
