import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  useGetFxRates,
  useGetTransactionSummary,
} from "@workspace/api-client-react";
import { formatBaseMoney, formatNative, formatDate } from "@/lib/utils";
import { StaleAsOf } from "@/components/StaleAsOf";
import { AXIS_TICK } from "@/lib/chart-tokens";
import { MonoTooltip, type TooltipEntry } from "@/components/mono-tooltip";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
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
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
} from "recharts";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

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
const ACCT_META_KEY = "ft-acct-meta";

type NwHistoryEntry = { date: string; netWorth: number };

interface AccountMeta {
  notes: string;
  targetBalance: number | null;
  apy: number | null;
  lowBalanceThreshold: number | null;
}

function loadAccountMeta(): Record<string, AccountMeta> {
  try {
    const raw = localStorage.getItem(ACCT_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAccountMeta(meta: Record<string, AccountMeta>) {
  try { localStorage.setItem(ACCT_META_KEY, JSON.stringify(meta)); } catch { /* noop */ }
}

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

function makeEmptyTransfer(): TransferForm {
  return {
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    currency: "GBP",
    date: new Date().toISOString().slice(0, 10),
    description: "",
  };
}

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
  const [form, setForm] = useState<TransferForm>(makeEmptyTransfer);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) setForm(makeEmptyTransfer());
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
  meta: AccountMeta;
  onMetaChange: (patch: Partial<AccountMeta>) => void;
}

function AccountDetailPanel({ accountName, balance, currency, nwHistory, meta, onMetaChange }: DetailPanelProps) {
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
        // Transactions whose FX conversion is unavailable are excluded
        // from category totals — a fabricated 0 would silently under-
        // report the category, worse than omitting the row.
        if (t.baseEquivalent == null) return;
        const cat = t.category || "Uncategorised";
        map.set(cat, (map.get(cat) ?? 0) + Math.abs(t.baseEquivalent));
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
        <Text as="span" size={11} color="var(--ft-muted)">
          Detail view —
        </Text>
        <Text as="span" size={12} weight={700} color="var(--ft-text)">
          {accountName}
        </Text>
        <Text as="span" size={11} color="var(--ft-blue)">{currency}</Text>
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

      <div className="ft-four-col" style={{ display: "grid", gap: 20 }}>
        {/* Col 1: Balance history */}
        <div>
          <div style={sectionLabel}>Net Worth History</div>
          {nwHistory.length === 0 ? (
            <div
              style={{
                fontSize: 9,
                color: "var(--ft-dim)",
                padding: "20px 0",
                textAlign: "center",
                border: "1px solid var(--ft-raised)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
                textTransform: "uppercase" as const,
              }}
            >
              NO HISTORY — BUILDS DAILY
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
                <MonthSpendingRow
                  key={category}
                  category={category}
                  total={total}
                  maxSpend={maxSpend}
                />
              ))}
            </div>
          )}
        </div>

        {/* Col 3: Recent transactions */}
        <div>
          <div style={sectionLabel}>Recent Transactions</div>
          {loadingMonthly ? (
            <Text as="div" size={10} color="var(--ft-dim)">Loading…</Text>
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
              {recentTxs.map((tx) => (
                <RecentTxRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </div>

        {/* Col 4: Notes, target balance, APY */}
        {(() => {
          const targetPct =
            meta.targetBalance && meta.targetBalance > 0
              ? Math.min(100, (balance / meta.targetBalance) * 100)
              : null;
          const monthlyInterest =
            meta.apy && meta.apy > 0 && balance > 0
              ? (balance * (meta.apy / 100)) / 12
              : null;
          const annualInterest =
            meta.apy && meta.apy > 0 && balance > 0
              ? balance * (meta.apy / 100)
              : null;

          const inputStyle: React.CSSProperties = {
            width: "100%",
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-raised)",
            borderRadius: 2,
            color: "var(--ft-text)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            padding: "4px 6px",
            outline: "none",
            boxSizing: "border-box",
          };

          return (
            <VStack gap={14}>
              {/* Notes */}
              <div>
                <div style={sectionLabel}>Notes</div>
                <textarea
                  value={meta.notes}
                  onChange={(e) => onMetaChange({ notes: e.target.value })}
                  placeholder="Add notes about this account…"
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Target balance */}
              <div>
                <div style={sectionLabel}>Target Balance</div>
                <input
                  type="number"
                  value={meta.targetBalance ?? ""}
                  onChange={(e) =>
                    onMetaChange({
                      targetBalance: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder={`e.g. 5000 ${currency}`}
                  style={inputStyle}
                />
                {targetPct !== null && (
                  <div style={{ marginTop: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>
                        {formatNative(balance, currency)} /&nbsp;
                        {formatNative(meta.targetBalance!, currency)}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color:
                            targetPct >= 100
                              ? "var(--ft-green)"
                              : targetPct >= 60
                              ? "var(--ft-amber)"
                              : "var(--ft-red)",
                          fontWeight: 700,
                        }}
                      >
                        {targetPct.toFixed(0)}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "var(--ft-raised)",
                        borderRadius: 0,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${targetPct}%`,
                          background:
                            targetPct >= 100
                              ? "var(--ft-green)"
                              : targetPct >= 60
                              ? "var(--ft-amber)"
                              : "var(--ft-red)",
                          borderRadius: 0,
                          transition: "none",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Low balance threshold */}
              <div>
                <div style={sectionLabel}>Low Balance Alert</div>
                <input
                  type="number"
                  value={meta.lowBalanceThreshold ?? ""}
                  onChange={(e) =>
                    onMetaChange({
                      lowBalanceThreshold: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder={`Alert below e.g. 500 ${currency}`}
                  style={inputStyle}
                />
                {meta.lowBalanceThreshold !== null && (
                  <div style={{ marginTop: 4, fontSize: 9, color: balance < meta.lowBalanceThreshold ? "var(--ft-red)" : "var(--ft-green)" }}>
                    {balance < meta.lowBalanceThreshold
                      ? `⚠ Below threshold by ${formatNative(meta.lowBalanceThreshold - balance, currency)}`
                      : `✓ ${formatNative(balance - meta.lowBalanceThreshold, currency)} above threshold`}
                  </div>
                )}
              </div>

              {/* APY */}
              <div>
                <div style={sectionLabel}>APY (%)</div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={meta.apy ?? ""}
                  onChange={(e) =>
                    onMetaChange({
                      apy: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="e.g. 4.5"
                  style={inputStyle}
                />
                {monthlyInterest !== null && annualInterest !== null && (
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>Monthly</span>
                      <Text as="span" size={9} weight={700} color="var(--ft-green)">
                        +{formatNative(monthlyInterest, currency)}
                      </Text>
                    </div>
                    <HStack justify="between">
                      <Text as="span" size={9} color="var(--ft-dim)">Annual</Text>
                      <Text as="span" size={9} weight={700} color="var(--ft-green)">
                        +{formatNative(annualInterest, currency)}
                      </Text>
                    </HStack>
                  </div>
                )}
              </div>
            </VStack>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Recent transaction row (account detail panel) ───────────────────────────

interface RecentTxRowProps {
  tx: {
    id: number;
    date: string;
    description: string;
    type: string;
    category: string;
    nativeAmount: number;
    currency: string;
    baseEquivalent: number | null;
  };
}

function RecentTxRow({ tx }: RecentTxRowProps) {
  const [hov, setHov] = React.useState(false);
  const typeColor =
    tx.type === "income"
      ? "var(--ft-green)"
      : tx.type === "transfer"
      ? "var(--ft-blue)"
      : "var(--ft-red)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "3px 0",
        borderBottom: "1px solid var(--ft-surface)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--ft-text)", whiteSpace: "nowrap" }}>
          {tx.description}
        </div>
        <Text as="div" size={9} color="var(--ft-dim)">
          {formatDate(tx.date)}
          {tx.category ? ` · ${tx.category}` : ""}
        </Text>
      </div>
      <div
        className="pnum"
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
}

// ─── Month spending category row sub-component ────────────────────────────────

interface MonthSpendingRowProps {
  category: string;
  total: number;
  maxSpend: number;
}

function MonthSpendingRow({ category, total, maxSpend }: MonthSpendingRowProps) {
  const [hov, setHov] = React.useState(false);
  const pct = maxSpend > 0 ? (total / maxSpend) * 100 : 0;
  return (
    <div
      key={category}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        padding: "3px 0",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <HStack justify="between" marginBottom={2}>
        <span style={{ fontSize: 10, color: "var(--ft-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{category}</span>
        <span className="pnum" style={{ fontSize: 10, color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", flexShrink: 0, whiteSpace: "nowrap", marginLeft: 4 }}>{formatBaseMoney(total)}</span>
      </HStack>
      <div style={{ height: 3, background: "var(--ft-raised)", borderRadius: 1 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--ft-red)", borderRadius: 1 }} />
      </div>
    </div>
  );
}

// ─── Currency exposure row sub-component ──────────────────────────────────────

interface CurrencyExposureRowProps {
  currency: string;
  total: number | null;
  totalCash: number;
  acctCount: number;
  colorIndex: number;
}

const ACCT_COLORS = ["var(--ft-blue)", "var(--ft-green)", "var(--ft-amber)", "var(--ft-cyan)", "var(--ft-red)", "var(--ft-muted)"];
const ACCT_EXPOSURE_COLORS = ACCT_COLORS;

function CurrencyExposureRow({ currency, total, totalCash, acctCount, colorIndex }: CurrencyExposureRowProps) {
  const [hov, setHov] = React.useState(false);
  const pct = total != null && totalCash > 0 ? (total / totalCash) * 100 : 0;
  const color = ACCT_EXPOSURE_COLORS[colorIndex % ACCT_EXPOSURE_COLORS.length];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        padding: "1px 0",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "var(--font-mono)", width: 32, flexShrink: 0 }}>
        {currency}
      </span>
      {/* No overflow:hidden + text-overflow:ellipsis on a .pnum —
          clips digits. If the currency total is very long the row
          wraps to the next column of the auto-fill grid or the
          share-percentage on the right slides; either is honest.
          A clipped £11,371→£1… is not. */}
      <span className="pnum" style={{ fontSize: 10, color: total == null ? "var(--ft-dim)" : "var(--ft-text)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {total == null ? "—" : formatBaseMoney(total)}
      </span>
      <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", marginLeft: "auto", flexShrink: 0, whiteSpace: "nowrap" }}>
        {total == null ? `no FX · ${acctCount}a` : `${pct.toFixed(0)}% · ${acctCount}a`}
      </span>
    </div>
  );
}

// ─── Account allocation legend row sub-component ──────────────────────────────

interface AccountAllocationRowProps {
  name: string;
  pct: number;
  colorIndex: number;
}

const ACCT_ALLOC_COLORS = ["var(--ft-blue)", "var(--ft-green)", "var(--ft-amber)", "var(--ft-cyan)", "var(--ft-red)", "var(--ft-muted)"];

function AccountAllocationRow({ name, pct, colorIndex }: AccountAllocationRowProps) {
  const [hov, setHov] = React.useState(false);
  const color = ACCT_ALLOC_COLORS[colorIndex % ACCT_ALLOC_COLORS.length];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
        padding: "1px 0",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--ft-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", maxWidth: 120 }}>
        {name}
      </span>
      <span className="pnum" style={{ fontSize: 10, color: "var(--ft-text)", fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Onboarding step card sub-component ──────────────────────────────────────

interface OnboardingStepProps {
  step: string;
  title: string;
  desc: string;
  action: string;
  onClick: () => void;
  color: string;
}

function OnboardingStep({ step, title, desc, action, onClick, color }: OnboardingStepProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        border: `1px solid ${color}33`,
        borderRadius: 3,
        padding: "16px 18px",
        background: hov ? `${color}12` : `${color}08`,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color, fontWeight: 700, marginBottom: 6, letterSpacing: "0.1em" }}>STEP {step}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>
      <button
        onClick={onClick}
        style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "4px 10px", border: `1px solid ${color}66`, background: `${color}22`, color, cursor: "pointer", borderRadius: 2, fontWeight: 600 }}
      >
        {action} →
      </button>
    </div>
  );
}

// ─── Health indicator badges ──────────────────────────────────────────────────

interface HealthBadgesProps {
  accountName: string;
  balance: number;
  stats: AccountStats;
  lowBalanceThreshold?: number | null;
}

function HealthBadges({ accountName: _accountName, balance, stats, lowBalanceThreshold }: HealthBadgesProps) {
  const isOverdraft = balance < 0;
  const isLowBalance = lowBalanceThreshold != null && balance >= 0 && balance < lowBalanceThreshold;

  return (
    <HStack gap={4} align="center" wrap>
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

      {/* Low balance warning */}
      {isLowBalance && (
        <span
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 2,
            background: "var(--ft-amber)22",
            color: "var(--ft-amber)",
            border: "1px solid var(--ft-amber)55",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          LOW
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
    </HStack>
  );
}

// ─── KPI cell sub-component ──────────────────────────────────────────────────

interface KpiCellProps {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  accent: string;
  icon: React.ReactNode;
  isFinancial?: boolean;
}

function KpiCell({ label, value, sub, accent: _accent, icon, isFinancial = false }: KpiCellProps) {
  // The `accent` prop is deliberately ignored (renamed `_accent`).
  // Rainbow per-cell colour was decoration; per docs/MOBILE-CONCEPT.md
  // § Desktop port, colour is semantic or absent. Icon renders in
  // --ft-dim across every KPI cell so the row reads as a single
  // strip, not five coloured tiles.
  const [hov, setHov] = React.useState(false);
  return (
    <div
      className="ft-kpi-cell"
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        flex: 1,
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <HStack gap={6} align="center">
        <span style={{ color: "var(--ft-dim)", display: "flex" }}>{icon}</span>
        <Text as="span" mono upper size={9} weight={700} color="var(--ft-dim)" letterSpacing="0.08em">{label}</Text>
      </HStack>
      {/* No overflow:hidden + text-overflow:ellipsis on the .pnum
          value — "A financial figure is shown in full or not at all"
          (CLAUDE.md). Font-size clamp allows shrink instead of clip
          when the figure is very wide. */}
      <div
        className={isFinancial ? "pnum" : undefined}
        style={{ fontSize: "clamp(14px, 1.3vw, 18px)", fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", lineHeight: 1, whiteSpace: "nowrap", minWidth: 0 }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--ft-muted)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

// ─── Account table row sub-component ─────────────────────────────────────────

interface AccountRowProps {
  account: {
    id: number;
    name: string;
    currency: string;
    balance: number;
    baseEquivalent: number | null;
    isWiseLinked: boolean;
    lastSyncedAt?: string | null;
  };
  rowIndex: number;
  isExpanded: boolean;
  isHighlighted: boolean;
  stats: AccountStats;
  deleteConfirmId: number | null;
  baseCurrency: string;
  privacyStyle: React.CSSProperties;
  accountMeta: Record<string, AccountMeta>;
  healthTxs: { accountName: string; date: string; type: string; baseEquivalent: number; nativeAmount: number; currency: string; category: string; description: string; id: number }[] | undefined;
  onToggleExpand: (id: number) => void;
  onHighlightRef: (el: HTMLDivElement | null) => void;
  onOpenEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

function AccountTableRow({
  account,
  rowIndex,
  isExpanded,
  isHighlighted,
  stats,
  deleteConfirmId,
  baseCurrency,
  privacyStyle,
  accountMeta,
  healthTxs,
  onToggleExpand,
  onHighlightRef,
  onOpenEdit,
  onDelete,
}: AccountRowProps) {
  const [hov, setHov] = React.useState(false);
  const isMobile = useIsMobile();

  const syncLabel = account.lastSyncedAt
    ? (() => {
        const diff = Date.now() - new Date(account.lastSyncedAt!).getTime();
        if (diff < 60_000) return "Synced just now";
        if (diff < 3_600_000) return `Synced ${Math.floor(diff / 60_000)}m ago`;
        if (diff < 86_400_000) return `Synced ${Math.floor(diff / 3_600_000)}h ago`;
        return `Synced ${Math.floor(diff / 86_400_000)}d ago`;
      })()
    : null;

  // Mini trend sparkbars
  const sparkBars = React.useMemo(() => {
    const acctTxs = (healthTxs ?? []).filter((t) => t.accountName === account.name);
    if (acctTxs.length < 2) return null;
    const monthMap = new Map<string, number>();
    acctTxs.forEach((t) => {
      const m = t.date.slice(0, 7);
      const sign = t.type === "income" ? 1 : t.type === "expense" ? -1 : 0;
      monthMap.set(m, (monthMap.get(m) ?? 0) + sign * Math.abs(t.baseEquivalent));
    });
    const bars = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-4)
      .map(([, v]) => v);
    if (bars.length === 0) return null;
    const maxAbs = Math.max(...bars.map(Math.abs), 1);
    return { bars, maxAbs };
  }, [healthTxs, account.name]);

  return (
    <div key={account.id}>
      <div
        className="flex items-center border-b xls-row ft-acct-table-row"
        style={{
          borderColor: "rgba(33,38,45,0.5)",
          background: hov
            ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
            : isExpanded
            ? "var(--ft-surface)"
            : "var(--ft-base)",
          transition: "background 0.1s",
          cursor: "pointer",
          outline: isHighlighted ? "1.5px solid var(--ft-accent)" : undefined,
          outlineOffset: isHighlighted ? "-1px" : undefined,
        }}
        ref={isHighlighted ? onHighlightRef : undefined}
        onClick={() => onToggleExpand(account.id)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onTouchStart={() => setHov(true)}
        onTouchEnd={() => setHov(false)}
        onTouchCancel={() => setHov(false)}
      >
        {/* Row number */}
        <div
          className="flex-shrink-0 flex items-center justify-center text-xs border-r ft-hide-mobile"
          style={{ width: 36, color: "var(--ft-dim)", borderColor: "var(--ft-border)", alignSelf: "stretch" }}
          onClick={(e) => { e.stopPropagation(); onToggleExpand(account.id); }}
        >
          {rowIndex + 2}
        </div>
        {/* Chevron */}
        <div
          className="flex-shrink-0 flex items-center justify-center border-r"
          style={{ width: 16, color: "var(--ft-dim)", borderColor: "var(--ft-border)", alignSelf: "stretch" }}
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
            padding: isMobile ? "10px 12px" : "7px 12px",
            borderRight: "1px solid var(--ft-raised)",
            borderLeft: account.isWiseLinked ? "3px solid var(--ft-blue)" : "3px solid var(--ft-accent)",
          }}
        >
          {isMobile ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--ft-text)", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                {account.name}
              </div>
              <HStack gap={5} align="center" marginTop={3}>
                <Text as="span" mono size={10} weight={700} color="var(--ft-blue)" letterSpacing="0.04em">{account.currency}</Text>
                <Text as="span" size={10} color="var(--ft-border2)">·</Text>
                <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, background: "var(--ft-raised)", color: account.isWiseLinked ? "var(--ft-blue)" : "var(--ft-dim)", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.08em" }}>
                  {account.isWiseLinked ? "WISE" : "MANUAL"}
                </span>
              </HStack>
            </div>
          ) : (
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <Landmark className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--ft-dim)" }} />
              <span style={{ color: "var(--ft-text)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", minWidth: 0 }}>
                {account.name}
              </span>
              {account.isWiseLinked && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, flexShrink: 0 }}>
                  WISE
                </span>
              )}
            </div>
          )}
        </div>

        {/* Type */}
        <div
          className="ft-hide-mobile"
          style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-dim)", fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const }}
        >
          <span style={{ padding: "1px 5px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-dim)" }}>
            {account.isWiseLinked ? "WISE-LINKED" : "MANUAL"}
          </span>
        </div>

        {/* Currency */}
        <div
          className="ft-hide-mobile"
          style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-blue)", fontSize: 12, fontWeight: 700 }}
        >
          {account.currency}
        </div>

        {/* Native balance */}
        <div
          className="pnum ft-hide-mobile"
          style={{ width: 160, minWidth: 160, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", fontFamily: "var(--font-mono)", textAlign: "right" }}
        >
          <div style={{ color: account.balance < 0 ? "var(--ft-red)" : "var(--ft-text)", fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", ...privacyStyle }}>
            {formatNative(account.balance, account.currency)}
          </div>
          {sparkBars && (
            <HStack gap={1} align="end" justify="end" marginTop={3} height={14}>
              {sparkBars.bars.map((v, bi) => {
                const h = Math.max(2, (Math.abs(v) / sparkBars.maxAbs) * 12);
                return (
                  <div key={bi} title={`${v >= 0 ? "+" : ""}${formatBaseMoney(v)}`} style={{ width: 4, height: h, background: v >= 0 ? "var(--ft-green)" : "var(--ft-red)", opacity: 0.75 }} />
                );
              })}
            </HStack>
          )}
          {stats.daysSinceLast !== null && (
            <div style={{ fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>
              {stats.daysSinceLast === 0 ? "txn today" : `${stats.daysSinceLast}d ago`}
            </div>
          )}
        </div>

        {/* Base currency balance — "—" (not £0) when FX is missing.
            The native balance column above still shows the honest
            figure in the account's own currency. */}
        <div
          className="pnum"
          style={{ width: isMobile ? undefined : 130, minWidth: isMobile ? undefined : 130, padding: isMobile ? "10px 10px" : "7px 12px", borderRight: "1px solid var(--ft-raised)", color: account.baseEquivalent == null ? "var(--ft-dim)" : account.baseEquivalent < 0 ? "var(--ft-red)" : "var(--ft-green)", fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "-0.02em", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...privacyStyle }}
        >
          {account.baseEquivalent == null ? "—" : formatBaseMoney(account.baseEquivalent)}
        </div>

        {/* Health */}
        <div
          className="ft-hide-mobile"
          style={{ width: 200, minWidth: 200, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <HealthBadges
            accountName={account.name}
            balance={account.balance}
            stats={stats}
            lowBalanceThreshold={accountMeta[account.name]?.lowBalanceThreshold ?? null}
          />
        </div>

        {/* Last sync */}
        <div
          className="ft-hide-mobile"
          style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)", fontSize: 8, fontFamily: "var(--font-mono)" }}
        >
          {syncLabel ?? <Text as="span" color="var(--ft-dim)">manual</Text>}
        </div>

        {/* Actions */}
        <div
          style={{ width: isMobile ? 44 : 90, minWidth: isMobile ? 44 : 90, padding: "4px 6px", display: "flex", justifyContent: "flex-end", gap: 2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenEdit(account.id)}>
            <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
          </Button>
          {!isMobile && <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDelete(account.id)}
            title={deleteConfirmId === account.id ? "Click again to confirm delete" : "Delete account"}
            style={deleteConfirmId === account.id ? { background: "var(--ft-red)", color: "#fff" } : {}}
          >
            {deleteConfirmId === account.id
              ? <Text as="span" mono size={9} letterSpacing="0.06em">DEL?</Text>
              : <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
            }
          </Button>}
        </div>
      </div>
    </div>
  );
}

// ─── FX Rate cell sub-component ───────────────────────────────────────────────

interface FxRateCellProps {
  ccy: string;
  rate: number;
}

function FxRateCell({ ccy, rate }: FxRateCellProps) {
  const [hov, setHov] = React.useState(false);
  const isHighValue = rate >= 100;
  const precision = isHighValue ? 2 : 4;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRight: "1px solid var(--ft-border)",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <Text as="span" mono size={9} weight={700} color="var(--ft-cyan)" letterSpacing="0.08em">GBP/{ccy}</Text>
      </div>
      <div className="pnum" style={{ fontSize: 16, color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
        {rate.toFixed(precision)}
      </div>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginTop: 4, fontFamily: "var(--font-mono)", display: "flex", justifyContent: "space-between" }}>
        <span>1 {ccy}</span>
        <span className="pnum" style={{ color: "var(--ft-muted)" }}>{(1 / rate).toFixed(4)} GBP</span>
      </div>
    </div>
  );
}

// ─── Monthly summary KPI cell ──────────────────────────────────────────────────

interface MonthlySummaryCellProps {
  label: string;
  value: string;
  color: string;
}

function MonthlySummaryCell({ label, value, color }: MonthlySummaryCellProps) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      style={{
        padding: "8px 10px",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-base))" : "var(--ft-base)",
        border: "1px solid var(--ft-raised)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div className="pnum" style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ─── CSV export ──────────────────────────────────────────────────────────────

function exportAccountsCSV(
  accounts: { name: string; currency: string; balance: number; baseEquivalent: number | null; isWiseLinked: boolean }[],
  meta: Record<string, AccountMeta>
) {
  const rows = [
    ["Name", "Currency", "Balance", "GBP Equivalent", "Source", "Target Balance", "APY (%)", "Low Balance Alert", "Notes"],
    ...accounts.map((a) => {
      const m = meta[a.name];
      return [
        a.name,
        a.currency,
        a.balance.toFixed(2),
        // Empty cell — not "0.00" — when the FX conversion was not
        // available. A downstream spreadsheet reading "0.00" would sum
        // it into user totals; blank keeps the accounting honest.
        a.baseEquivalent == null ? "" : a.baseEquivalent.toFixed(2),
        a.isWiseLinked ? "Wise" : "Manual",
        m?.targetBalance != null ? m.targetBalance.toFixed(2) : "",
        m?.apy != null ? m.apy.toFixed(2) : "",
        m?.lowBalanceThreshold != null ? m.lowBalanceThreshold.toFixed(2) : "",
        (m?.notes ?? "").replace(/"/g, '""'),
      ];
    }),
  ];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Accounts page ───────────────────────────────────────────────────────

export default function Accounts() {
  // dataUpdatedAt + isStale power the StaleAsOf badge next to the KPI
  // bar so a cached total is legible as cached, not presented as live.
  const {
    data: accounts, isLoading, isError, error,
    dataUpdatedAt: accountsUpdatedAt, isStale: accountsIsStale,
  } = useListAccounts();
  const { data: currencySettings } = useGetSettingsCurrency();
  const baseCurrency = currencySettings?.baseCurrency ?? "GBP";
  const isMobile = useIsMobile();
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
  const [accountMeta, setAccountMeta] = useState<Record<string, AccountMeta>>(() => loadAccountMeta());
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => !!localStorage.getItem("ft-acct-onboarding-dismissed"));

  const updateAccountMeta = useCallback((accountName: string, patch: Partial<AccountMeta>) => {
    setAccountMeta((prev) => {
      const defaults: AccountMeta = { notes: "", targetBalance: null, apy: null, lowBalanceThreshold: null };
      const next = { ...prev, [accountName]: { ...defaults, ...prev[accountName], ...patch } };
      saveAccountMeta(next);
      return next;
    });
  }, []);

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
      const entry = { date: today, netWorth: dashData.netWorth, cash: dashData.totalCash, portfolio: dashData.portfolio.totalValueBase };
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

  // Monthly cash flow: last 6 months from healthTxs
  const monthlyFlow = useMemo(() => {
    const monthMap = new Map<string, { income: number; expense: number }>();
    (healthTxs ?? []).forEach((tx) => {
      // Skip FX-unavailable transactions from the monthly cash-flow
      // roll-up; a fabricated 0 would silently under-report the month.
      if (tx.baseEquivalent == null) return;
      const month = tx.date.slice(0, 7);
      const cur = monthMap.get(month) ?? { income: 0, expense: 0 };
      if (tx.type === "income") cur.income += tx.baseEquivalent;
      else if (tx.type === "expense") cur.expense += Math.abs(tx.baseEquivalent);
      monthMap.set(month, cur);
    });
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, { income, expense }]) => ({
        month: month.slice(5), // "MM"
        income,
        expense,
        net: income - expense,
      }));
  }, [healthTxs]);

  // Category spending this month
  const monthSpending = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const map = new Map<string, number>();
    (healthTxs ?? [])
      .filter((tx) => tx.type === "expense" && tx.date.startsWith(thisMonth))
      .forEach((tx) => {
        if (tx.baseEquivalent == null) return;
        const cat = tx.category || "Other";
        map.set(cat, (map.get(cat) ?? 0) + Math.abs(tx.baseEquivalent));
      });
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [healthTxs]);

  // FX rates
  const { data: fxRates } = useGetFxRates();

  // This month's summary
  const thisMonth = new Date().toISOString().slice(0, 7);
  const { data: monthlySummary } = useGetTransactionSummary({ month: thisMonth });

  // Account filter / search / sort state
  const [accountFilter, setAccountFilter] = useState<"all" | "wise" | "manual">("all");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountSort, setAccountSort] = useState<"default" | "balance-high" | "balance-low" | "name-az" | "name-za" | "currency">("default");

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    let list = accounts;
    if (accountFilter === "wise") list = list.filter((a) => a.isWiseLinked);
    else if (accountFilter === "manual") list = list.filter((a) => !a.isWiseLinked);
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.currency.toLowerCase().includes(q));
    }
    // Sort by GBP equivalent — unconvertible accounts sink to the
    // bottom of a descending sort, top of an ascending one, so a
    // rate-outage doesn't shuffle real balances.
    if (accountSort === "balance-high") list = [...list].sort((a, b) => (b.baseEquivalent ?? -Infinity) - (a.baseEquivalent ?? -Infinity));
    else if (accountSort === "balance-low") list = [...list].sort((a, b) => (a.baseEquivalent ?? Infinity) - (b.baseEquivalent ?? Infinity));
    else if (accountSort === "name-az") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (accountSort === "name-za") list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    else if (accountSort === "currency") list = [...list].sort((a, b) => a.currency.localeCompare(b.currency));
    return list;
  }, [accounts, accountFilter, accountSearch, accountSort]);

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

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [qaForm, setQaForm] = useState({ name: "", currency: "GBP" as Currency, balance: "" });
  const [qaSubmitting, setQaSubmitting] = useState(false);

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
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    setDeleteConfirmId(null);
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

  const handleQuickAdd = async () => {
    if (!qaForm.name.trim() || !qaForm.balance) return;
    setQaSubmitting(true);
    try {
      await createAccount.mutateAsync({
        data: {
          name: qaForm.name.trim(),
          currency: qaForm.currency,
          balance: parseFloat(qaForm.balance),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      toast({ title: "Account added" });
      setQaForm({ name: "", currency: "GBP", balance: "" });
      setQaOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Failed to add account", description: message, variant: "destructive" });
    } finally {
      setQaSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <VStack gap={12}>
        {/* Header skeleton */}
        <HStack gap={8} align="center" justify="between" wrap>
          <FtSkeleton width={160} height={16} />
          <HStack gap={8} wrap>
            <FtSkeleton width={90} height={28} />
            <FtSkeleton width={90} height={28} />
            <FtSkeleton width={100} height={28} />
          </HStack>
        </HStack>
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
      </VStack>
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
        mobileActions={
          <>
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
                color: "var(--ft-base)",
                border: "none",
                borderRadius: 2,
                fontSize: 12,
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add
            </Button>
          </>
        }
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
            {accounts && accounts.length > 0 && (
              <Button
                size="sm"
                onClick={() => exportAccountsCSV(accounts, accountMeta)}
                style={{
                  background: "var(--ft-raised)",
                  color: "var(--ft-dim)",
                  border: "1px solid var(--ft-border2)",
                  borderRadius: 2,
                  fontSize: 12,
                }}
              >
                ↓ CSV
              </Button>
            )}
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
                color: "var(--ft-base)",
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

      {/* ── Persona context strip ─────────────────────────────────────────── */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        // Persona strip totals skip unconvertible accounts; message
        // just reads a slightly lower figure rather than lying via 0.
        const totalCash = (accounts ?? []).reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);
        const portfolio = (dashData as { portfolio?: { totalValueBase?: number } } | undefined)?.portfolio?.totalValueBase ?? 0;
        const msgs: Record<string, string | null> = {
          market:  totalCash > 0 ? `${formatBaseMoney(totalCash)} cash available — allocate surplus to investment positions via Portfolio.` : null,
          budget:  `Your accounts are the source of truth for your budget — reconcile against your budget limits monthly.`,
          wealth:  `Cash + portfolio = ${formatBaseMoney(totalCash + portfolio)}. Ensure cash earns yield (HYSA/money market) while idle.`,
          social:  totalCash > 0 ? `${formatBaseMoney(totalCash)} liquid — keep enough buffer for group trip deposits and shared expenses.` : null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "var(--ft-accent)", fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0 }}>·</span>
            <span className="pnum">{msg}</span>
          </div>
        );
      })()}

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

      {/* ── KPI Bar ─────────────────────────────────────────────── */}
      {(accounts?.length ?? 0) > 0 && (() => {
        // KPI bar total: skip unconvertible accounts. If any exist,
        // the KPI cell below appends " · N NO FX" so the total isn't
        // silently lower than the underlying holdings.
        const totalCash = accounts!.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);
        const unconvertibleCount = accounts!.filter(a => a.baseEquivalent == null).length;
        const currencies = [...new Set(accounts!.map(a => a.currency))] as string[];
        const lastSync = accounts!
          .map(a => a.lastSyncedAt)
          .filter(Boolean)
          .sort()
          .at(-1);
        const lastSyncLabel = lastSync
          ? (() => {
              const diff = Date.now() - new Date(lastSync).getTime();
              if (diff < 60_000) return "just now";
              if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
              if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
              return `${Math.floor(diff / 86_400_000)}d ago`;
            })()
          : "never";

        // Net-worth delta from nwHistory
        const prevNw = nwHistory.length > 1 ? nwHistory[nwHistory.length - 2].netWorth : null;
        const currNw = nwHistory.length > 0 ? nwHistory[nwHistory.length - 1].netWorth : null;
        const nwDelta = prevNw !== null && currNw !== null ? currNw - prevNw : null;

        // Portfolio from dash data
        const portfolioVal = (dashData as { portfolio?: { totalValueBase?: number } } | undefined)?.portfolio?.totalValueBase ?? 0;
        const netWorth = totalCash + portfolioVal;

        // Most recently active account
        const mostRecentAccount = (() => {
          const withTx = accounts!
            .map(a => {
              const txs = (healthTxs ?? []).filter(t => t.accountName === a.name);
              if (txs.length === 0) return null;
              const sorted = [...txs].sort((x, y) => y.date.localeCompare(x.date));
              return { account: a, lastTxDate: sorted[0].date };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
          if (withTx.length === 0) return null;
          return withTx.sort((a, b) => b.lastTxDate.localeCompare(a.lastTxDate))[0];
        })();

        // Currency breakdown for allocation bar — per-currency sum
        // skips unconvertible entries. A bar segment that's short
        // because its rate is missing is a truer picture than one
        // that appears zero-width.
        const currencyTotals = currencies.map(c => {
          const rows = accounts!.filter(a => a.currency === c);
          const allNull = rows.length > 0 && rows.every(a => a.baseEquivalent == null);
          const total = allNull ? null : rows.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);
          return { currency: c, total };
        }).sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));

        return (
          <div style={{ border: "1px solid var(--ft-border)" }}>
            {/* KPI row — border-as-gap grid */}
            <div className="ft-scroll-x" style={{ borderBottom: "1px solid var(--ft-border)", minWidth: 0 }}>
              <div
                className="ft-acct-metrics-row"
                style={{ display: "grid", gap: 1, background: "var(--ft-border)", gridTemplateColumns: "repeat(4, 1fr)" }}
              >
              <KpiCell
                label="Total Cash"
                value={<span className="pnum" style={{ color: totalCash < 0 ? "var(--ft-red)" : "var(--ft-green)" }}>{formatBaseMoney(totalCash)}</span>}
                sub={
                  unconvertibleCount > 0
                    ? <span style={{ color: "var(--ft-amber)" }}>{unconvertibleCount} account{unconvertibleCount !== 1 ? "s" : ""} without FX — not in total</span>
                    : nwDelta !== null
                      ? <span style={{ color: nwDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {nwDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span className="pnum">{nwDelta >= 0 ? "+" : ""}{formatBaseMoney(nwDelta)}</span> vs yesterday
                        </span>
                      : <span style={{ color: "var(--ft-dim)" }}>{accounts!.length} account{accounts!.length !== 1 ? "s" : ""}</span>
                }
                accent="var(--ft-green)"
                icon={<DollarSign className="w-3.5 h-3.5" />}
                isFinancial
              />
              <KpiCell
                label="Total Portfolio"
                value={<span className="pnum" style={{ color: "var(--ft-cyan)" }}>{formatBaseMoney(portfolioVal)}</span>}
                sub="investments (GBP)"
                accent="var(--ft-cyan)"
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                isFinancial
              />
              <KpiCell
                label="Net Worth"
                value={<span className="pnum" style={{ color: netWorth >= 0 ? "var(--ft-amber)" : "var(--ft-red)" }}>{formatBaseMoney(netWorth)}</span>}
                // Net worth inherits Total Cash's `?? 0` shortfall
                // when any account has a null baseEquivalent — the
                // Total Cash cell already announces the count, but
                // the Net Worth headline is the one a user reads
                // first, so it needs the same caveat inline. Amber
                // matches the mobile / net-worth widget treatment.
                sub={
                  unconvertibleCount > 0
                    ? <span style={{ color: "var(--ft-amber)" }}>{unconvertibleCount} account{unconvertibleCount !== 1 ? "s" : ""} without FX — not in total</span>
                    : "cash + portfolio"
                }
                accent="var(--ft-amber)"
                icon={<Activity className="w-3.5 h-3.5" />}
                isFinancial
              />
              <KpiCell
                label="Most Active"
                value={<span style={{ fontSize: 13, color: "var(--ft-text)", whiteSpace: "nowrap", display: "block", minWidth: 0 }}>{mostRecentAccount ? mostRecentAccount.account.name.split(" ").slice(0, 2).join(" ") : "—"}</span>}
                sub={mostRecentAccount ? `last txn ${mostRecentAccount.lastTxDate}` : "no transactions"}
                accent="var(--ft-blue)"
                icon={<Landmark className="w-3.5 h-3.5" />}
              />
              </div>
            </div>

            {/* Stale-as-of badge — only renders when the query is
                past its fresh window or a refetch is in flight after
                failure (i.e. offline). Reads dataUpdatedAt from
                useListAccounts, never re-stamped. See StaleAsOf
                header for the "never presented as live" rule. */}
            {accountsIsStale && (
              <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--ft-border)", textAlign: "right" }}>
                <StaleAsOf ts={accountsUpdatedAt} isFresh={false} />
              </div>
            )}

            {/* Currency exposure section */}
            {currencies.length > 1 && (
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--ft-border)" }}>
                <HStack align="center" justify="between" marginBottom={8}>
                  <Text as="span" mono upper size={9} weight={700} color="var(--ft-dim)" letterSpacing="0.08em">
                    CURRENCY EXPOSURE — {currencies.length} currencies
                  </Text>
                  <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
                    {baseCurrency} base · <span className="pnum">{formatBaseMoney(totalCash)}</span> total
                  </span>
                </HStack>
                {/* Stacked bar */}
                <div style={{ display: "flex", height: 6, overflow: "hidden", gap: 1, marginBottom: 8 }}>
                  {currencyTotals.map(({ currency, total }, i) => {
                    const pct = total != null && totalCash > 0 ? (total / totalCash) * 100 : 0;
                    return (
                      <div
                        key={currency}
                        style={{ width: `${pct}%`, background: ACCT_COLORS[i % ACCT_COLORS.length], minWidth: pct > 1 ? 3 : 0 }}
                        title={total == null ? `${currency}: no FX` : `${currency}: ${pct.toFixed(1)}% · ${formatBaseMoney(total)}`}
                      />
                    );
                  })}
                </div>
                {/* Currency rows */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "4px 16px" }}>
                  {currencyTotals.map(({ currency, total }, i) => (
                    <CurrencyExposureRow
                      key={currency}
                      currency={currency}
                      total={total}
                      totalCash={totalCash}
                      acctCount={accounts!.filter(a => a.currency === currency).length}
                      colorIndex={i}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Accounts KPI second row */}
            <div className="ft-scroll-x" style={{ borderBottom: "1px solid var(--ft-border)", minWidth: 0 }}>
              <div
                className="ft-acct-metrics-row"
                style={{ display: "grid", gap: 1, background: "var(--ft-border)", gridTemplateColumns: "repeat(3, 1fr)" }}
              >
              <KpiCell
                label="Accounts"
                value={<span style={{ color: "var(--ft-text)" }}>{accounts!.length}</span>}
                sub={accounts!.filter((a) => a.isWiseLinked).length > 0 ? `${accounts!.filter((a) => a.isWiseLinked).length} Wise-linked` : "all manual"}
                accent="var(--ft-blue)"
                icon={<Landmark className="w-3.5 h-3.5" />}
              />
              <KpiCell
                label="Currencies"
                value={<Text as="span" color="var(--ft-cyan)">{currencies.length}</Text>}
                sub={currencies.join(" · ")}
                accent="var(--ft-cyan)"
                icon={<Activity className="w-3.5 h-3.5" />}
              />
              <KpiCell
                label="Last Sync"
                value={<Text as="span" color="var(--ft-text)">{lastSyncLabel}</Text>}
                sub={accounts!.filter((a) => !a.lastSyncedAt).length > 0 ? `${accounts!.filter((a) => !a.lastSyncedAt).length} manual` : "all synced"}
                accent="var(--ft-amber)"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              />
              </div>
            </div>

            {/* Account allocation bar + interest projection */}
            {accounts!.length > 1 && (
              <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--ft-border)" }}>
                {/* Two-panel row */}
                <div className="ft-acct-allocation" style={{ display: "flex", gap: 32 }}>
                  {/* Account allocation */}
                  <div style={{ flex: 2, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                      Account Allocation
                    </div>
                    {/* Allocation bar and list — unconvertible accounts
                        omitted from the visualisation; they can't be
                        expressed as a % of a GBP total they don't have
                        a rate for. The KPI cell above surfaces the count. */}
                    <div style={{ display: "flex", height: 4, borderRadius: 0, overflow: "hidden", gap: 1, marginBottom: 5 }}>
                      {[...accounts!]
                        .filter((a): a is typeof a & { baseEquivalent: number } => a.baseEquivalent != null)
                        .sort((a, b) => b.baseEquivalent - a.baseEquivalent)
                        .map((a, i) => {
                          const pct = totalCash > 0 ? (a.baseEquivalent / totalCash) * 100 : 0;
                          return (
                            <div key={a.id} style={{ width: `${pct}%`, background: ACCT_ALLOC_COLORS[i % ACCT_ALLOC_COLORS.length], minWidth: pct > 0.5 ? 2 : 0 }} title={`${a.name}: ${pct.toFixed(1)}%`} />
                          );
                        })}
                    </div>
                    <VStack gap={2}>
                      {[...accounts!]
                        .filter((a): a is typeof a & { baseEquivalent: number } => a.baseEquivalent != null)
                        .sort((a, b) => b.baseEquivalent - a.baseEquivalent)
                        .slice(0, 5)
                        .map((a, i) => {
                          const pct = totalCash > 0 ? (a.baseEquivalent / totalCash) * 100 : 0;
                          return (
                            <AccountAllocationRow
                              key={a.id}
                              name={a.name}
                              pct={pct}
                              colorIndex={i}
                            />
                          );
                        })}
                      {accounts!.length > 5 && (
                        <Text as="span" mono size={9} color="var(--ft-dim)">
                          +{accounts!.length - 5} more
                        </Text>
                      )}
                    </VStack>
                  </div>

                  {/* Interest projection — needs GBP figures to
                      project. An account whose FX is missing is
                      excluded rather than projected as £0/month. */}
                  {(() => {
                    const apyAccounts = accounts!.filter((a): a is typeof a & { baseEquivalent: number } => {
                      const m = accountMeta[a.name];
                      return !!(m?.apy && m.apy > 0 && a.baseEquivalent != null && a.baseEquivalent > 0);
                    });
                    if (apyAccounts.length === 0) return null;
                    const totalMonthly = apyAccounts.reduce((s, a) => {
                      const apy = accountMeta[a.name]?.apy ?? 0;
                      return s + (a.baseEquivalent * (apy / 100)) / 12;
                    }, 0);
                    const totalAnnual = totalMonthly * 12;
                    return (
                      <div style={{ flex: 1, minWidth: 100, borderLeft: "1px solid var(--ft-raised)", paddingLeft: 16 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                          Interest Projection
                        </div>
                        <VStack gap={4}>
                          <div>
                            <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>Monthly</div>
                            <div className="pnum" style={{ fontSize: 14, fontWeight: 700, color: "var(--ft-green)", fontFamily: "var(--font-mono)" }}>+{formatBaseMoney(totalMonthly)}</div>
                          </div>
                          <div>
                            <Text as="div" mono size={9} color="var(--ft-dim)">Annual</Text>
                            <div className="pnum" style={{ fontSize: 14, fontWeight: 700, color: "var(--ft-green)", fontFamily: "var(--font-mono)" }}>+{formatBaseMoney(totalAnnual)}</div>
                          </div>
                          <Text as="div" mono size={9} color="var(--ft-dim)">
                            {apyAccounts.length} account{apyAccounts.length !== 1 ? "s" : ""} with APY
                          </Text>
                        </VStack>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* NW trend sparkline */}
            {nwHistory.length > 2 && (
              <div style={{ padding: "8px 14px" }}>
                <HStack align="center" justify="between" marginBottom={4}>
                  <Text as="span" mono upper size={9} weight={700} color="var(--ft-dim)" letterSpacing="0.08em">Net Worth Trend</Text>
                  <Text as="span" mono size={10} color="var(--ft-muted)">
                    {nwHistory.length} days · {nwHistory[0]?.date?.slice(0, 7)} → {nwHistory.at(-1)?.date?.slice(0, 7)}
                  </Text>
                </HStack>
                <ResponsiveContainer width="100%" height={52}>
                  <AreaChart data={nwHistory} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="acctNwGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-text)", borderRadius: 2 }}
                      formatter={(v: number) => [`${baseCurrency === "GBP" ? "£" : "$"}${v.toFixed(0)}`, "Net Worth"]}
                      labelFormatter={(l: string) => new Date(l).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    />
                    <Area type="monotone" dataKey="netWorth" stroke="var(--ft-green)" strokeWidth={1.5} fill="url(#acctNwGrad)" dot={false} activeDot={{ r: 3, fill: "var(--ft-green)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Onboarding panel (shown only when no accounts, unless dismissed) ─── */}
      {(accounts?.length ?? 0) === 0 && !onboardingDismissed && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: isMobile ? "14px 16px" : "20px 24px", position: "relative" }}>
          <button
            onClick={() => { localStorage.setItem("ft-acct-onboarding-dismissed", "1"); setOnboardingDismissed(true); }}
            title="Dismiss"
            style={{ position: "absolute", top: 10, right: 12, background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", fontSize: 14, lineHeight: 1, padding: "2px 4px" }}
          >
            ✕
          </button>
          <div style={{ fontSize: 11, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: isMobile ? 12 : 16 }}>
            Get started — connect your accounts
          </div>
          {isMobile ? (
            /* Mobile: compact row of action buttons */
            <VStack gap={8}>
              {[
                { title: "Add manually", action: "Add Account", onClick: openAdd, color: "var(--ft-blue)" },
                { title: "Sync Wise", action: "Configure", onClick: handleSync, color: "var(--ft-green)" },
                { title: "Import CSV", action: "Import", onClick: () => {}, color: "var(--ft-amber)" },
              ].map(({ title, action, onClick, color }) => (
                <button
                  key={title}
                  onClick={onClick}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: `${color}0A`, border: `1px solid ${color}33`, cursor: "pointer", fontFamily: "var(--font-mono)" }}
                >
                  <Text as="span" size={11} weight={600} color="var(--ft-text)">{title}</Text>
                  <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: "0.04em" }}>{action} →</span>
                </button>
              ))}
            </VStack>
          ) : (
            <div className="ft-three-col" style={{ display: "grid", gap: 12 }}>
              {[
                { step: "01", title: "Add manually", desc: "Enter account name, currency and opening balance. Balance updates manually each time.", action: "Add Account", onClick: openAdd, color: "var(--ft-blue)" },
                { step: "02", title: "Sync Wise", desc: "Connect your Wise account API key to auto-import all your Wise currency balances.", action: "Configure Wise", onClick: handleSync, color: "var(--ft-green)" },
                { step: "03", title: "Import CSV", desc: "Import a bank CSV export to bulk-create transactions and set account balance.", action: "Import CSV", onClick: () => {}, color: "var(--ft-amber)" },
              ].map(({ step, title, desc, action, onClick, color }) => (
                <OnboardingStep key={step} step={step} title={title} desc={desc} action={action} onClick={onClick} color={color} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accounts spreadsheet table */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        {/* Section title — no controls, never wraps */}
        <div
          className="px-3 py-1.5 text-xs font-bold border-b"
          style={{
            background: "var(--ft-green)22",
            borderColor: "var(--ft-green)44",
            borderLeft: "3px solid var(--ft-green)",
            color: "var(--ft-green)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          ▼ CASH ACCOUNTS — Multi-Currency ({baseCurrency} Base)
        </div>
        {/* Filter bar — separate row, wraps fine */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search…"
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            className="ft-filter-input"
            style={{
              fontSize: 10, fontFamily: "var(--font-mono)", padding: "3px 8px",
              background: "var(--ft-base)", border: "1px solid var(--ft-border2)",
              color: "var(--ft-text)", outline: "none", width: 130, borderRadius: 2,
            }}
          />
          <select
            value={accountSort}
            onChange={(e) => setAccountSort(e.target.value as typeof accountSort)}
            className="ft-filter-input"
            style={{
              fontSize: 10, fontFamily: "var(--font-mono)", padding: "3px 6px",
              background: "var(--ft-base)", border: "1px solid var(--ft-border2)",
              color: "var(--ft-dim)", outline: "none", cursor: "pointer", borderRadius: 2,
            }}
          >
            <option value="default">Sort: Default</option>
            <option value="balance-high">Balance ↓</option>
            <option value="balance-low">Balance ↑</option>
            <option value="name-az">Name A→Z</option>
            <option value="name-za">Name Z→A</option>
            <option value="currency">Currency</option>
          </select>
          <HStack gap={3} wrap>
            {(["all", "wise", "manual"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setAccountFilter(f)}
                style={{
                  fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  padding: "3px 8px", borderRadius: 2, cursor: "pointer",
                  border: accountFilter === f ? "1px solid var(--ft-green)88" : "1px solid var(--ft-border2)",
                  background: accountFilter === f ? "var(--ft-green)22" : "transparent",
                  color: accountFilter === f ? "var(--ft-green)" : "var(--ft-dim)",
                }}
              >
                {f === "all" ? `All (${accounts?.length ?? 0})` : f === "wise" ? `Wise (${accounts?.filter(a => a.isWiseLinked).length ?? 0})` : `Manual (${accounts?.filter(a => !a.isWiseLinked).length ?? 0})`}
              </button>
            ))}
          </HStack>
        </div>

        {/* ── Inline quick-add row ─────────────────────────────── */}
        {qaOpen ? (
          <div style={{
            display: "flex", gap: 6, alignItems: "center", padding: "6px 10px",
            borderBottom: "1px solid var(--ft-border)", background: "var(--ft-accent)06",
            borderTop: "1px solid var(--ft-accent)33", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ft-accent)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
              + Quick Add
            </span>
            <input
              autoFocus
              value={qaForm.name}
              onChange={(e) => setQaForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Account name"
              style={{ flex: 2, minWidth: 120, fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 8px", background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", outline: "none" }}
            />
            <select
              value={qaForm.currency}
              onChange={(e) => setQaForm(f => ({ ...f, currency: e.target.value as Currency }))}
              style={{ fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 6px", background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", outline: "none", width: 70 }}
            >
              {(["GBP","USD","EUR","MYR","CNY","JPY","AUD","CAD","SGD","HKD","THB","INR"] as Currency[]).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              value={qaForm.balance}
              onChange={(e) => setQaForm(f => ({ ...f, balance: e.target.value }))}
              placeholder="Balance"
              step="0.01"
              style={{ width: 110, fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 8px", background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", outline: "none" }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleQuickAdd(); if (e.key === "Escape") setQaOpen(false); }}
            />
            <button
              onClick={() => void handleQuickAdd()}
              disabled={!qaForm.name.trim() || !qaForm.balance || qaSubmitting}
              style={{ fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", padding: "4px 10px", background: "var(--ft-accent)", color: "var(--ft-base)", border: "none", cursor: "pointer", opacity: (!qaForm.name.trim() || !qaForm.balance) ? 0.5 : 1 }}
            >
              {qaSubmitting ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => setQaOpen(false)}
              style={{ fontSize: 9, fontFamily: "var(--font-mono)", padding: "4px 8px", background: "transparent", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ borderBottom: "1px solid var(--ft-border)", padding: "4px 10px" }}>
            <button
              onClick={() => setQaOpen(true)}
              style={{ fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "3px 10px", background: "var(--ft-accent)18", border: "1px solid var(--ft-accent)44", color: "var(--ft-accent)", cursor: "pointer" }}
            >
              + Quick Add Account
            </button>
          </div>
        )}

        <div className="ft-scroll-x">
          {/* Column headers */}
          <div className="flex ft-acct-table-row">
            {/* Placeholder for row-number (36px) + chevron (16px) to match data rows */}
            <div className="ft-hide-mobile" style={{ ...TH, width: 36, minWidth: 36, flexShrink: 0, padding: "6px 0" }} />
            <div style={{ ...TH, width: 16, minWidth: 16, flexShrink: 0, padding: "6px 0" }} />
            {([
              ["ACCOUNT NAME", "1", ""],
              ["TYPE", "100px", "ft-hide-mobile"],
              ["CURRENCY", "90px", "ft-hide-mobile"],
              ["BALANCE (NATIVE)", "160px", "ft-hide-mobile"],
              [`BALANCE (${baseCurrency})`, "130px", ""],
              ["HEALTH", "200px", "ft-hide-mobile"],
              ["LAST SYNC", "120px", "ft-hide-mobile"],
              ["ACTIONS", "90px", ""],
            ] as [string, string, string][]).map(([h, w, extraClass]) => (
              <div
                key={h}
                className={extraClass || undefined}
                style={{
                  ...TH,
                  flex: w === "1" ? 1 : undefined,
                  width: w !== "1" ? w : undefined,
                  minWidth: w !== "1" ? w : undefined,
                  textAlign: ["BALANCE (NATIVE)", `BALANCE (${baseCurrency})`, "ACTIONS"].includes(h)
                    ? "right" as const
                    : "left" as const,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Account rows + detail panels */}
          {filteredAccounts.map((account, i) => {
            const isExpanded = expandedAccountId === account.id;
            const stats = accountStatsMap.get(account.name) ?? {
              daysSinceLast: null,
              isOverdraft: account.balance < 0,
              isDormant: true,
              isActive: false,
            };
            const isHighlighted = highlightId === account.id;

            return (
              <React.Fragment key={account.id}>
                <AccountTableRow
                  account={account}
                  rowIndex={i}
                  isExpanded={isExpanded}
                  isHighlighted={isHighlighted}
                  stats={stats}
                  deleteConfirmId={deleteConfirmId}
                  baseCurrency={baseCurrency}
                  privacyStyle={privacyStyle}
                  accountMeta={accountMeta}
                  healthTxs={healthTxs as AccountRowProps["healthTxs"]}
                  onToggleExpand={toggleExpand}
                  onHighlightRef={(el) => { if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => setHighlightId(null), 2000); } }}
                  onOpenEdit={openEdit}
                  onDelete={handleDelete}
                />
                {isExpanded && (
                  <AccountDetailPanel
                    accountName={account.name}
                    accountId={account.id}
                    balance={account.balance}
                    currency={account.currency}
                    nwHistory={nwHistory}
                    meta={accountMeta[account.name] ?? { notes: "", targetBalance: null, apy: null, lowBalanceThreshold: null }}
                    onMetaChange={(patch) => updateAccountMeta(account.name, patch)}
                  />
                )}
              </React.Fragment>
            );
          })}

          {accounts?.length === 0 && (
            <EmptyState
              title="No accounts"
              description="No accounts yet — add one manually, sync Wise, or import a CSV."
              action={{ label: "+ Add Account", onClick: openAdd }}
            />
          )}

          {accounts && accounts.length > 0 && filteredAccounts.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--ft-dim)", fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
              NO {accountFilter.toUpperCase()} ACCOUNTS MATCH — <Text as="span" color="var(--ft-accent)">clear filter to show all</Text>
            </div>
          )}

          {/* Total row */}
          {filteredAccounts.length > 0 && (
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
                className="ft-hide-mobile"
                style={{
                  width: 100,
                  minWidth: 100,
                  borderRight: "1px solid var(--ft-raised)",
                }}
              />
              <div
                className="ft-hide-mobile"
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
              <div className="ft-hide-mobile" style={{ width: 160, minWidth: 160, borderRight: "1px solid var(--ft-raised)" }} />
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
                {/* Table footer total: skips unconvertible entries. */}
                {formatBaseMoney(
                  filteredAccounts.reduce((sum, a) => sum + (a.baseEquivalent ?? 0), 0)
                )}
              </div>
              <div
                className="ft-hide-mobile"
                style={{
                  width: 200,
                  minWidth: 200,
                  borderRight: "1px solid var(--ft-raised)",
                }}
              />
              <div
                className="ft-hide-mobile"
                style={{ width: 120, minWidth: 120, borderRight: "1px solid var(--ft-raised)" }}
              />
              <div style={{ width: 90, minWidth: 90 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Net Owing Strip ─────────────────────────────────────── */}
      {(accounts?.length ?? 0) > 0 && (() => {
        // Balance sheet: sign requires a GBP value, so unconvertible
        // accounts fall into neither the overdraft nor the assets side
        // of this strip. The KPI cell above surfaces the count.
        const overdraftAccounts = accounts!.filter((a): a is typeof a & { baseEquivalent: number } => a.baseEquivalent != null && a.baseEquivalent < 0);
        const positiveAccounts = accounts!.filter((a): a is typeof a & { baseEquivalent: number } => a.baseEquivalent != null && a.baseEquivalent >= 0);
        const totalOwed = overdraftAccounts.reduce((s, a) => s + Math.abs(a.baseEquivalent), 0);
        const totalAssets = positiveAccounts.reduce((s, a) => s + a.baseEquivalent, 0);
        return (
          <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "8px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
              Balance Sheet
            </span>
            <HStack gap={4} grow minWidth={100} height={6}>
              <div style={{ flex: totalAssets, background: "var(--ft-green)", opacity: 0.8 }} title={`Assets: ${formatBaseMoney(totalAssets)}`} />
              {totalOwed > 0 && <div style={{ flex: totalOwed, background: "var(--ft-red)", opacity: 0.8 }} title={`Liabilities: ${formatBaseMoney(totalOwed)}`} />}
            </HStack>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <HStack gap={5} align="center">
                <div style={{ width: 8, height: 8, background: "var(--ft-green)" }} />
                <span className="pnum" style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-green)" }}>
                  {formatBaseMoney(totalAssets)}
                </span>
                <Text as="span" mono size={9} color="var(--ft-dim)">assets</Text>
              </HStack>
              {totalOwed > 0 && (
                <>
                  <HStack gap={5} align="center">
                    <div style={{ width: 8, height: 8, background: "var(--ft-red)" }} />
                    <span className="pnum" style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-red)" }}>
                      -{formatBaseMoney(totalOwed)}
                    </span>
                    <Text as="span" mono size={9} color="var(--ft-dim)">
                      {overdraftAccounts.length} overdraft acct{overdraftAccounts.length !== 1 ? "s" : ""}
                    </Text>
                  </HStack>
                  <HStack gap={5} align="center">
                    <Text as="span" mono size={9} color="var(--ft-dim)">net</Text>
                    <span className="pnum" style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: (totalAssets - totalOwed) >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
                      {formatBaseMoney(totalAssets - totalOwed)}
                    </span>
                  </HStack>
                </>
              )}
              {totalOwed === 0 && (
                <Text as="span" mono size={9} color="var(--ft-green)">
                  no overdrafts — all accounts positive
                </Text>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── FX Rates Strip ───────────────────────────────────────── */}
      {fxRates && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(34,211,238,0.05)", borderColor: "rgba(34,211,238,0.18)", borderLeft: "3px solid var(--ft-cyan)", color: "var(--ft-cyan)", overflow: "hidden" }}>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap" }}>▼ FX RATES — Live · GBP Base</span>
            <span style={{ marginLeft: 8, flexShrink: 0, fontSize: 9, fontWeight: 400, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
              {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 1, background: "var(--ft-border)" }}>
            {Object.entries(fxRates.rates ?? {})
              .filter(([ccy]) => ["USD", "EUR", "MYR", "JPY", "CNY", "AUD", "SGD", "HKD", "CAD", "CHF", "INR", "THB"].includes(ccy))
              .sort(([a], [b]) => {
                const priority = ["USD", "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "CNY", "HKD", "MYR", "SGD", "THB", "INR"];
                return priority.indexOf(a) - priority.indexOf(b);
              })
              .filter(([, rate]) => typeof rate === "number")
              .map(([ccy, rate]) => (
                <FxRateCell key={ccy} ccy={ccy} rate={rate as number} />
              ))}
          </div>
        </div>
      )}

      {/* ── Cash Flow + Category Grid ─────────────────────────────── */}
      <div className="ft-two-col" style={{ display: "grid", gap: 0, border: "1px solid var(--ft-border)" }}>
        {/* Monthly Cash Flow Chart */}
        <div style={{ borderRight: "1px solid var(--ft-border)", minWidth: 0 }}>
          <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(34,197,94,0.05)", borderColor: "rgba(34,197,94,0.2)", borderLeft: "3px solid var(--ft-green)", color: "var(--ft-green)", overflow: "hidden", whiteSpace: "nowrap" }}>
            ▼ MONTHLY CASH FLOW — Last 6 Months
          </div>
          {monthlyFlow.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ft-dim)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
              NO TRANSACTION HISTORY — <Text as="span" size={10} color="var(--ft-accent)">import or add transactions to begin</Text>
            </div>
          ) : (
            <div style={{ padding: "12px 0 0" }}>
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={monthlyFlow} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={4}>
                  <XAxis dataKey="month" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ ...AXIS_TICK, fontSize: 9, className: "pnum" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `£${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}`} width={44} />
                  <Tooltip
                    content={(p) => (
                      <MonoTooltip
                        active={p.active}
                        payload={p.payload as TooltipEntry[]}
                        label={String(p.label ?? "")}
                        formatter={(v, name) => [formatBaseMoney(v), name === "income" ? "Income" : name === "expense" ? "Expenses" : "Net"]}
                      />
                    )}
                  />
                  <ReferenceLine y={0} stroke="var(--ft-border2)" />
                  <Bar dataKey="income" fill="var(--ft-green)" opacity={0.8} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--ft-red)" opacity={0.7} radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="net" stroke="var(--ft-amber)" strokeWidth={1.5} dot={{ r: 2, fill: "var(--ft-amber)" }} />
                </ComposedChart>
              </ResponsiveContainer>
              <HStack gap={16} justify="center" padding="4px 16px 10px">
                {[["var(--ft-green)", "Income"], ["var(--ft-red)", "Expenses"], ["var(--ft-amber)", "Net"]].map(([color, label]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                    <Text as="span" mono size={10} color="var(--ft-dim)">{label}</Text>
                  </div>
                ))}
              </HStack>
            </div>
          )}
        </div>

        {/* This Month Summary */}
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.2)", borderLeft: "3px solid var(--ft-amber)", color: "var(--ft-amber)", overflow: "hidden", whiteSpace: "nowrap" }}>
            ▼ THIS MONTH — {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase()}
          </div>
          {monthlySummary ? (
            <VStack gap={10} padding="12px 16px">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <MonthlySummaryCell label="INCOME" value={formatBaseMoney(monthlySummary.totalIncome)} color="var(--ft-green)" />
                <MonthlySummaryCell label="EXPENSES" value={formatBaseMoney(monthlySummary.totalExpenses)} color="var(--ft-red)" />
                <MonthlySummaryCell label="NET SAVINGS" value={formatBaseMoney(monthlySummary.netSavings)} color={monthlySummary.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)"} />
                <MonthlySummaryCell label="SAVINGS RATE" value={`${monthlySummary.savingsRate.toFixed(1)}%`} color={monthlySummary.savingsRate >= 20 ? "var(--ft-green)" : monthlySummary.savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)"} />
              </div>
              {monthSpending.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>Top Spending Categories</div>
                  <VStack gap={4}>
                    {monthSpending.slice(0, 5).map(({ category, total }) => (
                      <MonthSpendingRow
                        key={category}
                        category={category}
                        total={total}
                        maxSpend={monthSpending[0].total}
                      />
                    ))}
                  </VStack>
                </div>
              )}
            </VStack>
          ) : (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ft-dim)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
              NO DATA FOR THIS MONTH — <Text as="span" size={10} color="var(--ft-accent)">transactions will appear here when recorded</Text>
            </div>
          )}
        </div>
      </div>

      {/* ── Currency Converter ─────────────────────────────────────── */}
      {fxRates && <CurrencyConverter fxRates={fxRates.rates ?? {}} baseCurrency={baseCurrency} />}

    </div>
  );
}

// ─── Currency Converter Widget ────────────────────────────────────────────────

function CurrencyConverter({ fxRates, baseCurrency }: { fxRates: Record<string, number>; baseCurrency: string }) {
  const allCurrencies = ["GBP", ...Object.keys(fxRates).sort()];
  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState(baseCurrency);
  const [to, setTo] = useState(baseCurrency === "GBP" ? "USD" : "GBP");
  const [fromInput, setFromInput] = useState(baseCurrency);
  const [toInput, setToInput] = useState(baseCurrency === "GBP" ? "USD" : "GBP");

  const rates: Record<string, number> = { GBP: 1, ...fxRates };
  const fromValid = !!rates[from];
  const toValid = !!rates[to];

  const convert = (amt: number, fromCcy: string, toCcy: string): number => {
    const gbpAmt = amt / (rates[fromCcy] ?? 1);
    return gbpAmt * (rates[toCcy] ?? 1);
  };

  const result = fromValid && toValid ? convert(parseFloat(amount) || 0, from, to) : null;
  const unitRate = fromValid && toValid ? convert(1, from, to) : null;

  const ccyInputStyle: React.CSSProperties = {
    width: 68, padding: "6px 8px", background: "var(--ft-base)", border: "1px solid var(--ft-border2)",
    color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none",
    textTransform: "uppercase" as const, fontWeight: 700, letterSpacing: "0.05em",
  };

  const handleFromBlur = () => {
    const v = fromInput.toUpperCase().trim();
    if (rates[v]) setFrom(v);
    setFromInput(from);
  };
  const handleToBlur = () => {
    const v = toInput.toUpperCase().trim();
    if (rates[v]) setTo(v);
    setToInput(to);
  };

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <datalist id="ft-ccy-list">
        {allCurrencies.map((c) => <option key={c} value={c} />)}
      </datalist>
      <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(96,165,250,0.05)", borderColor: "rgba(96,165,250,0.2)", borderLeft: "3px solid var(--ft-blue)", color: "var(--ft-blue)", overflow: "hidden", whiteSpace: "nowrap" }}>
        ▼ CURRENCY CONVERTER
        <span style={{ marginLeft: 8, flexShrink: 0, fontSize: 9, fontWeight: 400, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
          — type any currency code
        </span>
      </div>
      <HStack gap={10} align="center" wrap padding="14px 16px">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: 130, padding: "6px 10px", background: "var(--ft-base)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, outline: "none", fontVariantNumeric: "tabular-nums" }}
        />
        <input
          list="ft-ccy-list"
          value={fromInput}
          onChange={(e) => setFromInput(e.target.value.toUpperCase())}
          onBlur={handleFromBlur}
          onKeyDown={(e) => e.key === "Enter" && handleFromBlur()}
          maxLength={6}
          style={{ ...ccyInputStyle, borderColor: fromValid ? "var(--ft-border2)" : "var(--ft-red)" }}
        />
        <button
          onClick={() => { setFrom(to); setTo(from); setFromInput(to); setToInput(from); }}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ft-dim)", fontSize: 16, padding: "0 2px" }}
          title="Swap currencies"
        >
          ⇄
        </button>
        <input
          list="ft-ccy-list"
          value={toInput}
          onChange={(e) => setToInput(e.target.value.toUpperCase())}
          onBlur={handleToBlur}
          onKeyDown={(e) => e.key === "Enter" && handleToBlur()}
          maxLength={6}
          style={{ ...ccyInputStyle, borderColor: toValid ? "var(--ft-border2)" : "var(--ft-red)" }}
        />
        <Text as="span" size={18} weight={300} color="var(--ft-dim)">=</Text>
        <span style={{ fontSize: 18, fontFamily: "var(--font-mono)", fontWeight: 700, color: result !== null ? "var(--ft-green)" : "var(--ft-dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {result !== null
            ? result.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
            : "—"}
          <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 6, color: "var(--ft-muted)" }}>{to}</span>
        </span>
        {unitRate !== null && (
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <Text as="span" mono size={10} color="var(--ft-dim)">
              1 {from} = {unitRate.toFixed(4)} {to}
            </Text>
            <Text as="span" mono size={10} color="var(--ft-dim)">
              1 {to} = {(1 / unitRate).toFixed(4)} {from}
            </Text>
          </div>
        )}
        {(!fromValid || !toValid) && (
          <Text as="span" mono size={10} color="var(--ft-red)">
            {!fromValid ? `Unknown: ${from}` : `Unknown: ${to}`}
          </Text>
        )}
      </HStack>
    </div>
  );
}
