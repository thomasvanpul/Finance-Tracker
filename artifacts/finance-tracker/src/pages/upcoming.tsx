import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUpcoming,
  useGetUpcomingSummary,
  useCreateUpcomingItem,
  useDeleteUpcomingItem,
  useUpdateUpcomingItem,
  useCreateTransaction,
  useListAccounts,
  useListSubscriptions,
  getListUpcomingQueryKey,
  getGetUpcomingSummaryQueryKey,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
  getListTransactionsQueryKey,
} from "@workspace/api-client-react";
import { formatBaseMoney, formatNative, formatDate } from "@/lib/utils";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { HStack, MonoLabel, PanelBox, PanelHeader, Text, VStack } from "@/components/primitives";

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
  baseEquivalent: number | null;
}

function makeEmptyUpForm(): UpForm {
  return { dueDate: new Date().toISOString().slice(0, 10), description: "", category: "", type: "expense", frequency: "monthly", nativeAmount: "", currency: "GBP", accountId: "" };
}

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "1px solid var(--ft-border2)",
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
  items: Array<{ status: string; type: string; dueDate: string; baseEquivalent: number | null }>,
  days: number
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return items.reduce((sum, item) => {
    if (item.status !== "pending") return sum;
    if (item.dueDate > cutoffStr) return sum;
    // Skip items whose FX is unavailable — forecast is under-stated
    // rather than fabricated. Caveat surfaced on the summary cell.
    if (item.baseEquivalent == null) return sum;
    return sum + (item.type === "income" ? item.baseEquivalent : -item.baseEquivalent);
  }, 0);
}

// ─── Summary KPI cell ─────────────────────────────────────────────────────────

function SummaryKpiCell({
  label,
  children,
  borderRight = true,
}: {
  label: string;
  children: React.ReactNode;
  borderRight?: boolean;
}) {
  return (
    <div style={{
      padding: "10px 14px",
      background: "var(--ft-surface)",
      borderRight: borderRight ? "1px solid var(--ft-border)" : undefined,
    }}>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Forecast KPI cell ────────────────────────────────────────────────────────

function ForecastKpiCell({
  label, net, totalBalance, isLast,
}: {
  label: string; net: number; totalBalance: number; isLast: boolean;
}) {
  const projected = totalBalance + net;
  const isPositive = net >= 0;
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--ft-surface)",
      borderRight: !isLast ? "1px solid var(--ft-border)" : undefined,
    }}>
      <HStack gap={6} align="center" marginBottom={6}>
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
      </HStack>
      <div style={{ marginBottom: 2 }}>
        <MonoLabel as="span" size={10} letterSpacing="0.4px">
          Net Change
        </MonoLabel>
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        color: isPositive ? "var(--ft-green)" : "var(--ft-red)",
        marginBottom: 6,
      }}>
        <span className="pnum">{isPositive ? "+" : ""}{formatBaseMoney(net)}</span>
      </div>
      <div style={{ marginBottom: 2 }}>
        <MonoLabel as="span" size={10} letterSpacing="0.4px">
          Projected Balance
        </MonoLabel>
      </div>
      <Text as="div" mono size={12} weight={600} color={projected >= 0 ? "var(--ft-text)" : "var(--ft-red)"}>
        <span className="pnum">{formatBaseMoney(projected)}</span>
      </Text>
    </div>
  );
}

// ─── Upcoming item row ────────────────────────────────────────────────────────

interface UpcomingRowProps {
  item: {
    id: number;
    dueDate: string;
    description: string;
    category: string;
    frequency: string;
    type: string;
    baseEquivalent: number | null;
    status: string;
    nativeAmount: number;
    currency: string;
    accountId?: number | null;
  };
  index: number;
  isOverdue: boolean;
  deleteConfirmId: number | null;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: Status) => void;
}

function UpcomingRow({
  item, index, isOverdue, deleteConfirmId, onEdit, onDelete, onStatusChange,
}: UpcomingRowProps) {
  const [hov, setHov] = useState(false);
  const isMobile = useIsMobile();
  const sc = STATUS_COLORS[item.status as Status] ?? STATUS_COLORS.pending;

  if (isMobile) {
    const accentColor = isOverdue ? "var(--ft-red)" : item.type === "income" ? "var(--ft-green)" : "var(--ft-red)";
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto",
        alignItems: "start",
        background: item.status === "skipped" ? "var(--ft-raised)" : "var(--ft-surface)",
        borderBottom: "1px solid var(--ft-border2)",
        padding: "9px 10px",
        opacity: item.status === "skipped" ? 0.5 : 1,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
            <span className={item.status === "skipped" ? "line-through" : ""}>{item.description}</span>
          </div>
          <HStack gap={6} align="center" wrap marginBottom={4}>
            <Text as="span" mono size={10} weight={isOverdue ? 700 : 400} color={isOverdue ? "var(--ft-red)" : "var(--ft-muted)"}>
              {formatDate(item.dueDate)}{isOverdue ? " · OVERDUE" : ""}
            </Text>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "0 4px", background: "var(--ft-raised)", color: "var(--ft-muted)" }}>{item.category}</span>
            {item.frequency !== "once" && <Text as="span" mono size={9} color="var(--ft-dim)">{item.frequency}</Text>}
          </HStack>
          <HStack gap={4}>
            <Select value={item.status} onValueChange={(v) => onStatusChange(item.id, v as Status)}>
              <SelectTrigger className="h-6 text-xs" style={{ width: 100, background: sc.bg, border: "none", color: sc.text, borderRadius: 2 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </HStack>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingLeft: 8, flexShrink: 0 }}>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: item.baseEquivalent == null ? "var(--ft-dim)" : item.type === "income" ? "var(--ft-green)" : "var(--ft-red)" }}>
            {item.baseEquivalent == null
              ? formatNative(Math.abs(item.nativeAmount), item.currency)
              : `${item.type === "income" ? "+" : "-"}${formatBaseMoney(Math.abs(item.baseEquivalent))}`}
          </span>
          <HStack gap={2}>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(item.id)}>
              <Edit2 className="w-3 h-3" style={{ color: "var(--ft-muted)" }} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(item.id)}
              style={deleteConfirmId === item.id ? { background: "var(--ft-red)", color: "#fff" } : undefined}>
              {deleteConfirmId === item.id
                ? <Text as="span" mono size={7} weight={700}>DEL?</Text>
                : <Trash2 className="w-3 h-3" style={{ color: "var(--ft-red)" }} />}
            </Button>
          </HStack>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center border-b xls-row upcoming-row"
      style={{
        borderColor: "rgba(33,38,45,0.5)",
        opacity: item.status === "skipped" ? 0.5 : 1,
        background: hov ? "rgba(255,255,255,0.025)" : undefined,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div className="flex-shrink-0 flex items-center justify-center text-xs border-r" style={{ width: 36, color: "var(--ft-dim)", borderColor: "var(--ft-border)", alignSelf: "stretch" }}>
        {index + 2}
      </div>
      <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", fontSize: 11, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
        {/* The OVERDUE badge never fit the 100px date column and drew over
            the date. The state lives on the date itself now: red and bold. */}
        <Text as="span" weight={isOverdue ? 700 : 400} color={isOverdue ? "var(--ft-red)" : "var(--ft-muted)"}>
          {formatDate(item.dueDate)}
        </Text>
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
      <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", textAlign: "right", color: item.baseEquivalent == null ? "var(--ft-dim)" : item.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {item.baseEquivalent == null
          ? <span>{formatNative(Math.abs(item.nativeAmount), item.currency)}</span>
          : <span className="pnum">{item.type === "income" ? "+" : "-"}{formatBaseMoney(Math.abs(item.baseEquivalent))}</span>}
      </div>
      <div style={{ width: 120, minWidth: 120, padding: "5px 12px", borderRight: "1px solid var(--ft-raised)" }}>
        <Select value={item.status} onValueChange={(v) => onStatusChange(item.id, v as Status)}>
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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item.id)}>
          <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onDelete(item.id)}
          title={deleteConfirmId === item.id ? "Click again to confirm delete" : "Delete item"}
          style={deleteConfirmId === item.id ? { background: "var(--ft-red)", color: "#fff" } : undefined}
        >
          {deleteConfirmId === item.id
            ? <Text as="span" mono size={8} weight={700}>DEL?</Text>
            : <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />}
        </Button>
      </div>
    </div>
  );
}

// ─── Subscription renewal row ─────────────────────────────────────────────────

interface SubRenewalRowProps {
  sub: {
    id: number;
    name: string;
    amount: number;
    currency: string;
    frequency: string;
    nextDue?: string;
    active: boolean;
    category: string;
  };
}

function SubRenewalRow({ sub }: SubRenewalRowProps) {
  const [hov, setHov] = useState(false);
  const daysUntil = Math.round((new Date(sub.nextDue!).getTime() - Date.now()) / 86400000);
  return (
    <div
      className="flex items-center border-b upcoming-row"
      style={{
        borderColor: "rgba(33,38,45,0.5)",
        background: hov ? "rgba(255,255,255,0.025)" : undefined,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", fontSize: 11, fontVariantNumeric: "tabular-nums", color: "var(--ft-muted)" }}>
        {formatDate(sub.nextDue!)}
        {daysUntil <= 7 && (
          <span style={{ marginLeft: 5, fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-amber)", background: "var(--ft-amber)22", padding: "1px 4px" }}>
            {daysUntil === 0 ? "TODAY" : `+${daysUntil}d`}
          </span>
        )}
      </div>
      <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sub.name}
      </div>
      <div className="ft-hide-mobile" style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)" }}>
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)" }}>{sub.category}</span>
      </div>
      <div className="ft-hide-mobile" style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-raised)", color: "var(--ft-muted)", fontSize: 11, textTransform: "capitalize" }}>
        {sub.frequency}
      </div>
      <div style={{ width: 120, minWidth: 120, padding: "7px 12px", textAlign: "right", color: "var(--ft-red)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        <span className="pnum">-{formatBaseMoney(sub.amount)}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [form, setForm] = useState<UpForm>(makeEmptyUpForm);
  const [submitting, setSubmitting] = useState(false);

  const [markPaidItem, setMarkPaidItem] = useState<MarkPaidItem | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);

  const [forecastOpen, setForecastOpen] = useState(true);
  const isMobile = useIsMobile();

  const { data: accounts } = useListAccounts();
  const { data: rawSubs = [] } = useListSubscriptions();

  const upcomingSubs = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 90);
    const todayStr = today.toISOString().slice(0, 10);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return (rawSubs as Array<{ id: number; name: string; amount: number; currency: string; frequency: string; nextDue?: string; active: boolean; category: string }>)
      .filter((s) => s.active && s.nextDue && s.nextDue >= todayStr && s.nextDue <= cutoffStr)
      .sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));
  }, [rawSubs]);

  const totalBalance = useMemo(
    () => accounts?.reduce((sum, a) => sum + (a.baseEquivalent ?? 0), 0) ?? 0,
    [accounts]
  );

  const forecast30 = useMemo(() => computeForecast(upcoming ?? [], 30), [upcoming]);
  const forecast60 = useMemo(() => computeForecast(upcoming ?? [], 60), [upcoming]);
  const forecast90 = useMemo(() => computeForecast(upcoming ?? [], 90), [upcoming]);

  const cashflowChartData = useMemo(() => {
    const items = (upcoming ?? []).filter((i) => i.status === "pending");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const points: Array<{ label: string; balance: number; dayOffset: number }> = [];
    let running = totalBalance;
    points.push({ label: "Today", balance: Math.round(running), dayOffset: 0 });
    for (let d = 1; d <= 90; d++) {
      const day = new Date(today); day.setDate(day.getDate() + d);
      const dayStr = day.toISOString().slice(0, 10);
      const dayItems = items.filter((i) => i.dueDate === dayStr);
      if (dayItems.length > 0) {
        dayItems.forEach((item) => {
          // Cashflow projection skips unconvertible items — a
          // fabricated 0 would still fire the chart bend where none
          // exists. The bend disappears; the line continues.
          if (item.baseEquivalent == null) return;
          running += item.type === "income" ? item.baseEquivalent : -item.baseEquivalent;
        });
        const label = d <= 7 ? `+${d}d` : d <= 30 ? `W${Math.ceil(d / 7)}` : `M${d <= 60 ? 2 : 3}`;
        points.push({ label, balance: Math.round(running), dayOffset: d });
      }
    }
    if (points[points.length - 1].dayOffset < 90) {
      points.push({ label: "+90d", balance: Math.round(running), dayOffset: 90 });
    }
    return points;
  }, [upcoming, totalBalance]);

  const overdueIds = useMemo(
    () => new Set(
      (upcoming ?? [])
        .filter((i) => i.status === "pending" && i.dueDate < new Date().toISOString().slice(0, 10))
        .map((i) => i.id)
    ),
    [upcoming]
  );
  const overdueCount = overdueIds.size;

  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState<"all" | UpType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | Status>("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const sortedItems = useMemo(() => {
    if (!upcoming) return [];
    return [...upcoming].sort((a, b) => {
      const aOverdue = overdueIds.has(a.id) ? 0 : 1;
      const bOverdue = overdueIds.has(b.id) ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [upcoming, overdueIds]);

  const filteredItems = useMemo(() => {
    return sortedItems.filter((item) => {
      if (searchText && !item.description.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      return true;
    });
  }, [sortedItems, searchText, filterType, filterStatus]);

  const hasFilters = searchText !== "" || filterType !== "all" || filterStatus !== "all";

  function exportUpcomingCSV() {
    const header = ["Due Date", "Description", "Category", "Frequency", "Type", "Amount (GBP)", "Status"].join(",");
    const rows = filteredItems.map((item) => [
      item.dueDate,
      `"${item.description.replace(/"/g, '""')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      item.frequency,
      item.type,
      // Empty cell (not "0.00") when FX unavailable — downstream
      // spreadsheet won't sum unconvertible items into totals.
      item.baseEquivalent == null ? "" : item.baseEquivalent.toFixed(2),
      item.status,
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `upcoming-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  };

  const openAdd = () => { setForm(makeEmptyUpForm()); setAddOpen(true); };
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
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    setDeleteConfirmId(null);
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
          baseEquivalent: item.baseEquivalent,
        });
        setMarkPaidDate(new Date().toISOString().slice(0, 10));
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

  // Compute 30d net for the summary bar
  const net30 = summary ? summary.expectedIncome30d - summary.committedOutgoings30d : 0;
  const isNet30Pos = net30 >= 0;

  return (
    <div className="space-y-1.5 animate-in fade-in duration-300">
      <PageHeader
        icon={CalendarClock}
        title="Upcoming"
        subtitle="Scheduled flows and expected liquidity needs"
        actions={
          <HStack gap={6} align="center">
            {sortedItems.length > 0 && (
              <Button onClick={exportUpcomingCSV} variant="ghost" size="sm" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 2, padding: "4px 10px" }}>
                ↓ CSV
              </Button>
            )}
            <Button onClick={openAdd} size="sm" style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 12 }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Item
            </Button>
          </HStack>
        }
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const outflow30d = summary?.committedOutgoings30d ?? 0;
        const msgs: Record<string, string | null> = {
          budget:  outflow30d > 0 ? `${formatBaseMoney(outflow30d)} in committed outgoings next 30 days — reconcile against your budget limits.` : `Log expected bills here so your budget forecast stays accurate.`,
          wealth:  outflow30d > 0 ? `${formatBaseMoney(outflow30d)} outgoing next 30 days — plan cash reserves before deploying to long-term investments.` : null,
          market:  outflow30d > 0 ? `${formatBaseMoney(outflow30d)} in scheduled outflows — ensure sufficient cash so you don't need to liquidate positions.` : null,
          social:  `Track group trip deposits, shared bills, and advance payments here to stay ahead of shared expenses.`,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

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
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--ft-dim)", marginBottom: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Item details
                </div>
                <div style={{ fontSize: 13, color: "var(--ft-text)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                  {markPaidItem.description}
                </div>
                <HStack gap={8} align="center" wrap>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: markPaidItem.type === "income" ? "var(--ft-green)22" : "var(--ft-red)22", color: markPaidItem.type === "income" ? "var(--ft-green)" : "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
                    {markPaidItem.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>
                    {markPaidItem.category}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: markPaidItem.baseEquivalent == null ? "var(--ft-dim)" : markPaidItem.type === "income" ? "var(--ft-green)" : "var(--ft-red)", marginLeft: "auto" }}>
                    {markPaidItem.baseEquivalent == null
                      ? <span>{formatNative(Math.abs(markPaidItem.nativeAmount), markPaidItem.currency)}</span>
                      : <span className="pnum">{markPaidItem.type === "income" ? "+" : "-"}{formatBaseMoney(markPaidItem.baseEquivalent)}</span>}
                  </span>
                </HStack>
                {!markPaidItem.accountId && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--ft-amber)", fontFamily: "var(--font-mono)" }}>
                    No account linked — transaction will not be recorded
                  </div>
                )}
              </div>

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

      {/* Summary bar — border-as-gap grid */}
      {summary && (
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <SummaryKpiCell label="30d Outgoings">
            <Text as="div" mono size={14} weight={700} color="var(--ft-red)" lineHeight={1}>
              <span className="pnum">-{formatBaseMoney(summary.committedOutgoings30d)}</span>
            </Text>
          </SummaryKpiCell>
          <SummaryKpiCell label="30d Income">
            <Text as="div" mono size={14} weight={700} color="var(--ft-green)" lineHeight={1}>
              <span className="pnum">+{formatBaseMoney(summary.expectedIncome30d)}</span>
            </Text>
          </SummaryKpiCell>
          <SummaryKpiCell label="30d Net">
            <Text as="div" mono size={14} weight={700} color={isNet30Pos ? "var(--ft-green)" : "var(--ft-red)"} lineHeight={1}>
              <span className="pnum">{isNet30Pos ? "+" : ""}{formatBaseMoney(net30)}</span>
            </Text>
          </SummaryKpiCell>
          <SummaryKpiCell label="Overdue" borderRight={false}>
            <HStack gap={6} align="center">
              {overdueCount > 0 ? (
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ft-red)", lineHeight: 1 }}>
                  {overdueCount} item{overdueCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <Text as="span" mono size={14} weight={700} color="var(--ft-green)" lineHeight={1}>
                  None
                </Text>
              )}
            </HStack>
          </SummaryKpiCell>
        </div>
      )}

      {/* Cash Flow Forecast Strip */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <button
          type="button"
          onClick={() => setForecastOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: "var(--ft-panel-header-h)",
            padding: "0 12px",
            background: "transparent",
            border: "none",
            borderBottom: forecastOpen ? "1px solid var(--ft-border)" : "none",
            cursor: "pointer",
          }}
        >
          <span className="ft-panel-label">Cash Flow Forecast — Projected Net Change from Pending Items</span>
          {forecastOpen
            ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)", flexShrink: 0 }} />
            : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)", flexShrink: 0 }} />
          }
        </button>

        {forecastOpen && (
          <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: "none" }}>
            <ForecastKpiCell label="30d" net={forecast30} totalBalance={totalBalance} isLast={false} />
            <ForecastKpiCell label="60d" net={forecast60} totalBalance={totalBalance} isLast={false} />
            <ForecastKpiCell label="90d" net={forecast90} totalBalance={totalBalance} isLast={true} />
          </div>
        )}
      </div>

      {/* 90-day running balance chart */}
      {cashflowChartData.length >= 2 && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <PanelHeader>90-Day Balance Projection — Running Total incl. Pending Items</PanelHeader>
          <div style={{ padding: "12px 4px 8px 0" }}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={cashflowChartData} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--ft-cyan)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--ft-cyan)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ft-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
                  tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  contentStyle={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                  formatter={(v: number) => [formatBaseMoney(v), "Projected balance"]}
                />
                <ReferenceLine y={0} stroke="var(--ft-red)" strokeDasharray="4 2" strokeOpacity={0.5} />
                <Area
                  type="stepAfter"
                  dataKey="balance"
                  stroke="var(--ft-cyan)"
                  strokeWidth={2}
                  fill="url(#cfGrad)"
                  dot={{ r: 3, fill: "var(--ft-cyan)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter bar */}
      {sortedItems.length > 0 && (
        <div className="ft-filter-bar" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search description…"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-text)",
              padding: "5px 10px",
              outline: "none",
              flex: "1 1 160px",
              minWidth: 120,
            }}
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "all" | UpType)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 10px", cursor: "pointer", outline: "none" }}
          >
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | Status)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-surface)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "5px 10px", cursor: "pointer", outline: "none" }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="skipped">Skipped</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearchText(""); setFilterType("all"); setFilterStatus("all"); }}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", padding: "5px 10px", border: "1px solid var(--ft-border)", background: "transparent", color: "var(--ft-muted)", cursor: "pointer" }}
            >
              Clear
            </button>
          )}
          {hasFilters && (
            <Text as="span" mono size={9} color="var(--ft-dim)" letterSpacing="0.06em">
              {filteredItems.length} of {sortedItems.length}
            </Text>
          )}
        </div>
      )}

      {/* Upcoming spreadsheet table */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <PanelHeader>Upcoming Schedule — Committed & Expected Flows</PanelHeader>

        <div className={isMobile ? undefined : "ft-scroll-x"}>
        <div style={isMobile ? undefined : { minWidth: 700 }}>
        {/* Column headers — desktop only */}
        {!isMobile && <div className="flex" style={{ marginLeft: 36 }}>
          {[["DUE DATE", "100px"], ["DESCRIPTION", "1"], ["CATEGORY", "110px"], ["FREQUENCY", "100px"], ["TYPE", "90px"], ["AMOUNT (GBP)", "120px"], ["STATUS", "120px"], ["ACTIONS", "80px"]].map(([h, w]) => (
            <div key={h as string} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, textAlign: ["AMOUNT (GBP)"].includes(h as string) ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>}

        {/* Rows */}
        {filteredItems.map((item, i) => (
          <UpcomingRow
            key={item.id}
            item={item}
            index={i}
            isOverdue={overdueIds.has(item.id)}
            deleteConfirmId={deleteConfirmId}
            onEdit={openEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        ))}

        {filteredItems.length === 0 && (
          <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)" }}>
            <div style={{ width: 36, borderRight: "1px solid var(--ft-raised)", alignSelf: "stretch" }} />
            <div className="flex-1 text-center" style={{ padding: "28px 16px" }}>
              {hasFilters ? (
                <Text as="span" mono size={11} color="var(--ft-dim)">No items match the current filters.</Text>
              ) : (
                <VStack gap={10} align="center">
                  <pre style={{ fontSize: 9, lineHeight: 1.4, color: "var(--ft-raised)", fontFamily: "var(--font-mono)", textAlign: "left" }}>{
`  DATE     FLOW        TYPE     AMOUNT
  ───────  ──────────  ───────  ──────
  +30d     ???         EXPENSE  £?.??
  +60d     ???         INCOME   £?.??`
                  }</pre>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>No scheduled flows yet</div>
                  <Text as="div" mono size={10} color="var(--ft-dim)">Add bills and income to forecast your cash position.</Text>
                </VStack>
              )}
            </div>
          </div>
        )}
        </div>
        </div>
      </div>

      {/* Subscription renewals — read-only */}
      {upcomingSubs.length > 0 && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <PanelHeader right={<span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>read-only</span>}>
            Subscription Renewals — Next 90 days
          </PanelHeader>
          <div>
            <div>
            <div className="flex">
              {[["DUE DATE", "100px"], ["NAME", "1"], ["CATEGORY", "110px"], ["FREQUENCY", "100px"], ["AMOUNT", "120px"]].map(([h, w]) => (
                <div key={h as string} className={["CATEGORY", "FREQUENCY"].includes(h as string) ? "ft-hide-mobile" : undefined} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: ["AMOUNT"].includes(h as string) ? "right" : "left", flex: w === "1" ? 1 : undefined, width: w !== "1" ? w as string : undefined, minWidth: w !== "1" ? w as string : undefined, padding: "4px 12px", borderBottom: "1px solid var(--ft-raised)", fontWeight: 400 }}>
                  {h}
                </div>
              ))}
            </div>
            {upcomingSubs.map((sub) => (
              <SubRenewalRow key={sub.id} sub={sub} />
            ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
