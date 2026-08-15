import { useState, useMemo, useCallback } from "react";
import {
  useListTransactions,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/page-header";
import { formatGbp } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Briefcase,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  ChevronDown,
  X,
  TrendingUp,
  TrendingDown,
  Receipt,
} from "lucide-react";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

interface Invoice {
  id: string;
  client: string;
  amount: number;
  currency: string;
  dueDate: string;
  issuedDate: string;
  status: InvoiceStatus;
  description: string;
}

interface InvoiceForm {
  client: string;
  amount: string;
  currency: string;
  dueDate: string;
  issuedDate: string;
  status: InvoiceStatus;
  description: string;
}

type VatQuarter = "Q1" | "Q2" | "Q3" | "Q4";

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_INVOICES = "ft-business-invoices";
const LS_CATEGORIES = "ft-business-categories";

const DEFAULT_BUSINESS_CATEGORIES = [
  "Freelance",
  "Consulting",
  "Client Meals",
  "Software",
  "Equipment",
  "Professional Services",
  "Marketing",
  "Travel",
];

const VAT_RATE = 0.2;

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; color: string; bg: string; border: string; Icon: typeof Clock }
> = {
  draft: {
    label: "DRAFT",
    color: "var(--ft-dim)",
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.12)",
    Icon: FileText,
  },
  sent: {
    label: "SENT",
    color: "var(--ft-blue)",
    bg: "rgba(56,139,253,0.08)",
    border: "rgba(56,139,253,0.25)",
    Icon: Clock,
  },
  paid: {
    label: "PAID",
    color: "var(--ft-green)",
    bg: "rgba(86,211,100,0.08)",
    border: "rgba(86,211,100,0.25)",
    Icon: CheckCircle,
  },
  overdue: {
    label: "OVERDUE",
    color: "var(--ft-red)",
    bg: "rgba(255,123,114,0.08)",
    border: "rgba(255,123,114,0.25)",
    Icon: AlertCircle,
  },
};

const VAT_QUARTERS: Record<VatQuarter, { months: number[]; label: string }> = {
  Q1: { months: [1, 2, 3], label: "Jan–Mar" },
  Q2: { months: [4, 5, 6], label: "Apr–Jun" },
  Q3: { months: [7, 8, 9], label: "Jul–Sep" },
  Q4: { months: [10, 11, 12], label: "Oct–Dec" },
};

const CURRENCIES = ["GBP", "USD", "EUR", "CHF", "AUD", "CAD", "SGD"];

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function loadInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(LS_INVOICES);
    return raw ? (JSON.parse(raw) as Invoice[]) : [];
  } catch {
    return [];
  }
}

function saveInvoices(invoices: Invoice[]): void {
  try {
    localStorage.setItem(LS_INVOICES, JSON.stringify(invoices));
  } catch {}
}

function loadCategories(): string[] {
  try {
    const raw = localStorage.getItem(LS_CATEGORIES);
    return raw ? (JSON.parse(raw) as string[]) : DEFAULT_BUSINESS_CATEGORIES;
  } catch {
    return DEFAULT_BUSINESS_CATEGORIES;
  }
}

function saveCategories(cats: string[]): void {
  try {
    localStorage.setItem(LS_CATEGORIES, JSON.stringify(cats));
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function currentYear(): number {
  return new Date().getFullYear();
}

function txMonth(dateStr: string): number {
  return new Date(dateStr).getMonth() + 1;
}

function txYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  accentColor,
  children,
}: {
  title: string;
  accentColor?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--ft-border)",
        paddingBottom: 8,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 3,
            height: 14,
            background: accentColor ?? "var(--ft-accent)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--ft-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </div>
      {children && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── KPI strip cell (border-as-gap pattern) ────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  valueColor,
  accentColor,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  accentColor?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div
      style={{
        background: "var(--ft-surface)",
        padding: "12px 16px",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        borderTop: `2px solid ${accentColor ?? "var(--ft-border2)"}`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--ft-dim)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            fontWeight: 700,
            color: valueColor ?? "var(--ft-text)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }}
        >
          {value}
        </div>
        {trend === "up" && <TrendingUp size={11} color="var(--ft-green)" style={{ flexShrink: 0 }} />}
        {trend === "down" && <TrendingDown size={11} color="var(--ft-red)" style={{ flexShrink: 0 }} />}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Hover row hook pattern ────────────────────────────────────────────────────

function useHover(): [boolean, React.MouseEventHandler, React.MouseEventHandler, React.TouchEventHandler, React.TouchEventHandler] {
  const [hovered, setHovered] = useState(false);
  return [
    hovered,
    () => setHovered(true),
    () => setHovered(false),
    () => setHovered(true),
    () => setHovered(false),
  ];
}

// ─── Invoice row with hover ────────────────────────────────────────────────────

function InvoiceRow({
  inv,
  TD,
  onMarkPaid,
  onDelete,
}: {
  inv: Invoice;
  TD: React.CSSProperties;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, onMouseEnter, onMouseLeave, onTouchStart, onTouchEnd] = useHover();
  const cfg = STATUS_CONFIG[inv.status];
  const StatusIcon = cfg.Icon;

  return (
    <tr
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ ...TD, fontWeight: 600, color: "var(--ft-text)" }}>
        {inv.client}
      </td>
      <td style={{ ...TD, color: "var(--ft-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {inv.description || "—"}
      </td>
      <td
        className="pnum"
        style={{
          ...TD,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          color: "var(--ft-text)",
        }}
      >
        {inv.currency !== "GBP"
          ? `${inv.currency} ${inv.amount.toFixed(2)}`
          : formatGbp(inv.amount)}
      </td>
      <td style={{ ...TD, color: "var(--ft-dim)" }}>
        {formatDateShort(inv.issuedDate)}
      </td>
      <td
        style={{
          ...TD,
          color: inv.status === "overdue" ? "var(--ft-red)" : "var(--ft-dim)",
        }}
      >
        {formatDateShort(inv.dueDate)}
      </td>
      <td style={TD}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: cfg.bg,
            color: cfg.color,
            padding: "2px 7px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            border: `1px solid ${cfg.border}`,
          }}
        >
          <StatusIcon size={9} />
          {cfg.label}
        </span>
      </td>
      <td
        style={{
          ...TD,
          borderRight: "none",
          textAlign: "right",
        }}
      >
        <HStack gap={4} justify="end">
          {inv.status !== "paid" && (
            <button
              onClick={() => onMarkPaid(inv.id)}
              title="Mark as paid"
              style={{
                background: hovered ? "rgba(86,211,100,0.14)" : "rgba(86,211,100,0.08)",
                border: "1px solid rgba(86,211,100,0.2)",
                color: "var(--ft-green)",
                padding: "3px 7px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                transition: "background 0.1s",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <CheckCircle size={10} />
              PAID
            </button>
          )}
          <button
            onClick={() => onDelete(inv.id)}
            title="Delete"
            style={{
              background: "transparent",
              border: "1px solid transparent",
              color: hovered ? "var(--ft-red)" : "var(--ft-dim)",
              padding: "3px 6px",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              transition: "color 0.1s",
            }}
          >
            <Trash2 size={10} />
          </button>
        </HStack>
      </td>
    </tr>
  );
}

// ─── Expense breakdown row with hover ─────────────────────────────────────────

function ExpenseRow({
  name,
  value,
  share,
  total,
  TD,
}: {
  name: string;
  value: number;
  share: number;
  total: number;
  TD: React.CSSProperties;
}) {
  const [hovered, onMouseEnter, onMouseLeave, onTouchStart, onTouchEnd] = useHover();
  const barColor = share > 40 ? "var(--ft-red)" : share > 20 ? "var(--ft-amber)" : "var(--ft-dim)";

  return (
    <tr
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={TD}>{name}</td>
      <td
        className="pnum"
        style={{
          ...TD,
          textAlign: "right",
          color: "var(--ft-red)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatGbp(value)}
      </td>
      <td
        className="pnum"
        style={{
          ...TD,
          textAlign: "right",
          color: share > 30 ? "var(--ft-amber)" : "var(--ft-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {share.toFixed(1)}%
      </td>
      <td style={{ ...TD, borderRight: "none", width: 140 }}>
        <div
          style={{
            height: 4,
            background: "var(--ft-border)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${share}%`,
              background: barColor,
              opacity: hovered ? 1 : 0.7,
              transition: "opacity 0.12s, width 0.12s ease",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            marginTop: 3,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.1s",
          }}
        >
          {((value / total) * 100).toFixed(1)}% of all expenses
        </div>
      </td>
    </tr>
  );
}

// ─── VAT quarter option row ────────────────────────────────────────────────────

function VatQuarterOption({
  q,
  isActive,
  onClick,
}: {
  q: VatQuarter;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, onMouseEnter, onMouseLeave, onTouchStart, onTouchEnd] = useHover();
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: isActive
          ? "var(--ft-surface)"
          : hovered
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))"
          : "none",
        border: "none",
        color: isActive ? "var(--ft-accent)" : "var(--ft-text)",
        padding: "7px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      {q} · {VAT_QUARTERS[q].label}
    </button>
  );
}

// ─── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border2)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      }}
    >
      <div style={{ color: "var(--ft-muted)", marginBottom: 6, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      {payload.map((p) => (
        <div
          key={p.name}
          style={{
            color: p.color,
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <span style={{ color: "var(--ft-dim)" }}>{p.name}</span>
          <span className="pnum">{formatGbp(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Receipt;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        padding: "36px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "1px solid var(--ft-border2)",
          background: "var(--ft-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        <Icon size={16} color="var(--ft-dim)" />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ft-muted)",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-dim)",
          maxWidth: 360,
          lineHeight: 1.6,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

// ─── Category chip with hover ─────────────────────────────────────────────────

function CategoryChip({
  cat,
  onRemove,
}: {
  cat: string;
  onRemove: (cat: string) => void;
}) {
  const [hovered, onMouseEnter, onMouseLeave, onTouchStart, onTouchEnd] = useHover();

  return (
    <span
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 18%, var(--ft-surface))"
          : "rgba(244,162,30,0.10)",
        border: "1px solid rgba(244,162,30,0.25)",
        color: "var(--ft-accent)",
        padding: "3px 9px 3px 9px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        transition: "background 0.1s",
      }}
    >
      {cat}
      <button
        onClick={() => onRemove(cat)}
        style={{
          background: "none",
          border: "none",
          color: "var(--ft-accent)",
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          opacity: 0.7,
        }}
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ─── Category toggle button ───────────────────────────────────────────────────

function CategoryToggleButton({
  cat,
  active,
  onToggle,
}: {
  cat: string;
  active: boolean;
  onToggle: (cat: string) => void;
}) {
  const [hovered, onMouseEnter, onMouseLeave, onTouchStart, onTouchEnd] = useHover();
  return (
    <button
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClick={() => onToggle(cat)}
      style={{
        background: active
          ? "rgba(244,162,30,0.12)"
          : hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-surface)",
        border: active
          ? "1px solid rgba(244,162,30,0.35)"
          : "1px solid var(--ft-border)",
        color: active ? "var(--ft-accent)" : hovered ? "var(--ft-text)" : "var(--ft-muted)",
        padding: "3px 9px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
        transition: "background 0.1s, color 0.1s, border-color 0.1s",
        letterSpacing: "0.04em",
      }}
    >
      {active && <span style={{ marginRight: 4, opacity: 0.7 }}>✓</span>}
      {cat}
    </button>
  );
}

// ─── Empty invoice form ────────────────────────────────────────────────────────

function emptyInvoiceForm(): InvoiceForm {
  const issued = todayStr();
  const due = new Date();
  due.setDate(due.getDate() + 30);
  return {
    client: "",
    amount: "",
    currency: "GBP",
    dueDate: due.toISOString().slice(0, 10),
    issuedDate: issued,
    status: "draft",
    description: "",
  };
}

// ─── VAT cell shared styles ───────────────────────────────────────────────────

const vatLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  color: "var(--ft-dim)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const vatValue: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 22,
  fontWeight: 700,
  color: "var(--ft-text)",
  fontVariantNumeric: "tabular-nums",
  marginBottom: 4,
  lineHeight: 1.1,
};

const vatSub: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--ft-dim)",
  lineHeight: 1.4,
};

// ─── Shared input styles (defined outside component to avoid re-creation) ────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  padding: "5px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  padding: "5px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  outline: "none",
  cursor: "pointer",
};

const fieldLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  color: "var(--ft-dim)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  marginBottom: 4,
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function Business() {
  // ─── Remote data ────────────────────────────────────────────────────────────
  const { data: txData } = useListTransactions();
  const transactions = useMemo(() => txData ?? [], [txData]);

  // ─── Local state — invoices ──────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>(loadInvoices);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);
  const [invoiceFormError, setInvoiceFormError] = useState<string | null>(null);

  // ─── Local state — business categories ──────────────────────────────────────
  const [businessCategories, setBusinessCategories] = useState<string[]>(
    loadCategories
  );
  const [newCatInput, setNewCatInput] = useState("");

  // ─── Local state — VAT quarter ───────────────────────────────────────────────
  const [vatQuarter, setVatQuarter] = useState<VatQuarter>("Q1");
  const [vatQuarterOpen, setVatQuarterOpen] = useState(false);

  // ─── Derived: all unique transaction categories ───────────────────────────────
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const tx of transactions) {
      if (tx.category) cats.add(tx.category);
    }
    return Array.from(cats).sort();
  }, [transactions]);

  // ─── Derived: business transactions ──────────────────────────────────────────
  const businessTxs = useMemo(
    () =>
      transactions.filter((tx) => businessCategories.includes(tx.category ?? "")),
    [transactions, businessCategories]
  );

  const businessIncome = useMemo(
    () =>
      businessTxs
        .filter((tx) => tx.type === "income")
        .reduce((sum, tx) => sum + (tx.gbpValue ?? 0), 0),
    [businessTxs]
  );

  const businessExpenses = useMemo(
    () =>
      businessTxs
        .filter((tx) => tx.type === "expense")
        .reduce((sum, tx) => sum + (tx.gbpValue ?? 0), 0),
    [businessTxs]
  );

  const grossProfit = businessIncome - businessExpenses;
  const profitMargin =
    businessIncome > 0 ? (grossProfit / businessIncome) * 100 : 0;

  // ─── Derived: YTD figures ─────────────────────────────────────────────────────
  const yr = currentYear();

  const ytdIncomeTxs = useMemo(
    () => businessTxs.filter((tx) => tx.type === "income" && txYear(tx.date) === yr),
    [businessTxs, yr]
  );
  const ytdExpenseTxs = useMemo(
    () => businessTxs.filter((tx) => tx.type === "expense" && txYear(tx.date) === yr),
    [businessTxs, yr]
  );

  const ytdIncome = useMemo(
    () => ytdIncomeTxs.reduce((sum, tx) => sum + (tx.gbpValue ?? 0), 0),
    [ytdIncomeTxs]
  );
  const ytdExpenses = useMemo(
    () => ytdExpenseTxs.reduce((sum, tx) => sum + (tx.gbpValue ?? 0), 0),
    [ytdExpenseTxs]
  );

  const ytdProfit = ytdIncome - ytdExpenses;
  const ytdMargin =
    ytdIncome > 0 ? (ytdProfit / ytdIncome) * 100 : 0;
  const taxEstimate = ytdProfit > 0 ? ytdProfit * 0.2 : 0;

  // ─── Derived: operating expense breakdown ─────────────────────────────────────
  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of businessTxs) {
      if (tx.type !== "expense") continue;
      const cat = tx.category ?? "Other";
      map.set(cat, (map.get(cat) ?? 0) + (tx.gbpValue ?? 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [businessTxs]);

  // ─── Derived: monthly P&L for chart ──────────────────────────────────────────
  const monthlyPnl = useMemo(() => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return months.map((name, idx) => {
      const month = idx + 1;
      const revenue = businessTxs
        .filter(
          (tx) => tx.type === "income" && txYear(tx.date) === yr && txMonth(tx.date) === month
        )
        .reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);
      const expenses = businessTxs
        .filter(
          (tx) => tx.type === "expense" && txYear(tx.date) === yr && txMonth(tx.date) === month
        )
        .reduce((s, tx) => s + (tx.gbpValue ?? 0), 0);
      return { name, revenue, expenses, profit: revenue - expenses };
    });
  }, [businessTxs, yr]);

  // ─── Derived: VAT position ────────────────────────────────────────────────────
  const vatData = useMemo(() => {
    const qMonths = VAT_QUARTERS[vatQuarter].months;
    const qTxs = businessTxs.filter((tx) => {
      const m = txMonth(tx.date);
      const y = txYear(tx.date);
      return y === yr && qMonths.includes(m);
    });
    const vatCollected = qTxs
      .filter((tx) => tx.type === "income")
      .reduce((s, tx) => s + (tx.gbpValue ?? 0) * VAT_RATE, 0);
    const vatReclaimable = qTxs
      .filter((tx) => tx.type === "expense")
      .reduce((s, tx) => s + (tx.gbpValue ?? 0) * VAT_RATE, 0);
    const netVat = vatCollected - vatReclaimable;
    return { vatCollected, vatReclaimable, netVat };
  }, [businessTxs, vatQuarter, yr]);

  // ─── Derived: invoice stats ───────────────────────────────────────────────────
  const invoiceStats = useMemo(() => {
    const outstanding = invoices
      .filter((inv) => inv.status === "sent" || inv.status === "overdue")
      .reduce((s, inv) => s + inv.amount, 0);
    const paid = invoices
      .filter((inv) => inv.status === "paid")
      .reduce((s, inv) => s + inv.amount, 0);
    const overdue = invoices
      .filter((inv) => inv.status === "overdue")
      .reduce((s, inv) => s + inv.amount, 0);
    const draftCount = invoices.filter((inv) => inv.status === "draft").length;
    return { outstanding, paid, overdue, draftCount };
  }, [invoices]);

  // ─── Callbacks: invoices ─────────────────────────────────────────────────────

  const handleInvoiceFormChange = useCallback(
    (field: keyof InvoiceForm, value: string) => {
      setInvoiceForm((prev) => ({ ...prev, [field]: value }));
      setInvoiceFormError(null);
    },
    []
  );

  const handleAddInvoice = useCallback(() => {
    if (!invoiceForm.client.trim()) {
      setInvoiceFormError("Client name is required.");
      return;
    }
    const amount = parseFloat(invoiceForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setInvoiceFormError("Enter a valid amount.");
      return;
    }
    if (!invoiceForm.dueDate) {
      setInvoiceFormError("Due date is required.");
      return;
    }
    const newInvoice: Invoice = {
      id: nanoid(),
      client: invoiceForm.client.trim(),
      amount,
      currency: invoiceForm.currency,
      dueDate: invoiceForm.dueDate,
      issuedDate: invoiceForm.issuedDate,
      status: invoiceForm.status,
      description: invoiceForm.description.trim(),
    };
    const updated = [newInvoice, ...invoices];
    setInvoices(updated);
    saveInvoices(updated);
    setShowInvoiceForm(false);
    setInvoiceForm(emptyInvoiceForm());
    setInvoiceFormError(null);
  }, [invoiceForm, invoices]);

  const handleMarkPaid = useCallback(
    (id: string) => {
      const updated = invoices.map((inv) =>
        inv.id === id ? { ...inv, status: "paid" as InvoiceStatus } : inv
      );
      setInvoices(updated);
      saveInvoices(updated);
    },
    [invoices]
  );

  const handleDeleteInvoice = useCallback(
    (id: string) => {
      const updated = invoices.filter((inv) => inv.id !== id);
      setInvoices(updated);
      saveInvoices(updated);
    },
    [invoices]
  );

  // ─── Callbacks: business categories ──────────────────────────────────────────

  const toggleCategory = useCallback(
    (cat: string) => {
      const next = businessCategories.includes(cat)
        ? businessCategories.filter((c) => c !== cat)
        : [...businessCategories, cat];
      setBusinessCategories(next);
      saveCategories(next);
    },
    [businessCategories]
  );

  const handleAddCategory = useCallback(() => {
    const trimmed = newCatInput.trim();
    if (!trimmed || businessCategories.includes(trimmed)) return;
    const next = [...businessCategories, trimmed];
    setBusinessCategories(next);
    saveCategories(next);
    setNewCatInput("");
  }, [newCatInput, businessCategories]);

  const handleRemoveCategory = useCallback(
    (cat: string) => {
      const next = businessCategories.filter((c) => c !== cat);
      setBusinessCategories(next);
      saveCategories(next);
    },
    [businessCategories]
  );

  // ─── Table styles ─────────────────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: 9,
    fontWeight: 700,
    color: "var(--ft-dim)",
    background: "var(--ft-base)",
    borderBottom: "1px solid var(--ft-border2)",
    borderRight: "1px solid var(--ft-border)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    whiteSpace: "nowrap" as const,
    fontFamily: "var(--font-mono)",
    textAlign: "left" as const,
  };

  const TD: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 11,
    borderBottom: "1px solid var(--ft-border)",
    borderRight: "1px solid var(--ft-border)",
    fontFamily: "var(--font-mono)",
    color: "var(--ft-text)",
    verticalAlign: "middle" as const,
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 48px 0" }}>
      <PageHeader
        icon={Briefcase}
        title="Business Finance"
        subtitle="P&L · Invoicing · VAT · YTD summary"
      />

      {/* ─── YTD KPI Strip (border-as-gap) ─── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={`${yr} Year-to-Date`} accentColor="var(--ft-green)" />
        <div
          className="ft-kpi-bar"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 1,
            background: "var(--ft-border)",
          }}
        >
          <KpiCell
            label="Revenue YTD"
            value={formatGbp(ytdIncome)}
            sub={`${ytdIncomeTxs.length} income tx`}
            valueColor="var(--ft-green)"
            accentColor="var(--ft-green)"
            trend="up"
          />
          <KpiCell
            label="Expenses YTD"
            value={formatGbp(ytdExpenses)}
            sub={`${ytdExpenseTxs.length} expense tx`}
            valueColor="var(--ft-red)"
            accentColor="var(--ft-red)"
          />
          <KpiCell
            label="Net Profit"
            value={formatGbp(ytdProfit)}
            sub={ytdMargin > 0 ? `${ytdMargin.toFixed(1)}% margin` : undefined}
            valueColor={ytdProfit >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            accentColor={ytdProfit >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            trend={ytdProfit >= 0 ? "up" : "down"}
          />
          <KpiCell
            label="Profit Margin"
            value={`${ytdMargin.toFixed(1)}%`}
            sub={ytdMargin >= 20 ? "Healthy" : ytdMargin >= 5 ? "Below target" : "At risk"}
            valueColor={
              ytdMargin >= 20
                ? "var(--ft-green)"
                : ytdMargin >= 5
                ? "var(--ft-amber)"
                : "var(--ft-red)"
            }
            accentColor={
              ytdMargin >= 20
                ? "var(--ft-green)"
                : ytdMargin >= 5
                ? "var(--ft-amber)"
                : "var(--ft-red)"
            }
          />
          <KpiCell
            label="Tax Estimate (20%)"
            value={formatGbp(taxEstimate)}
            sub="Corp. tax on profit"
            valueColor="var(--ft-amber)"
            accentColor="var(--ft-amber)"
          />
        </div>
      </div>

      {/* ─── P&L Section ─── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Profit & Loss" accentColor="var(--ft-cyan)">
          <Text as="span" mono size={9} color="var(--ft-dim)">
            All time
          </Text>
        </SectionHeader>

        {/* P&L KPI strip */}
        <div
          className="ft-kpi-bar"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--ft-border)",
            marginBottom: 16,
          }}
        >
          <KpiCell
            label="Total Revenue"
            value={formatGbp(businessIncome)}
            valueColor="var(--ft-green)"
            accentColor="var(--ft-green)"
          />
          <KpiCell
            label="Total Expenses"
            value={formatGbp(businessExpenses)}
            valueColor="var(--ft-red)"
            accentColor="var(--ft-red)"
          />
          <KpiCell
            label="Gross Profit"
            value={formatGbp(grossProfit)}
            valueColor={grossProfit >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            accentColor={grossProfit >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            trend={grossProfit >= 0 ? "up" : "down"}
          />
          <KpiCell
            label="Net Margin"
            value={`${profitMargin.toFixed(1)}%`}
            valueColor={
              profitMargin >= 20
                ? "var(--ft-green)"
                : profitMargin >= 5
                ? "var(--ft-amber)"
                : "var(--ft-red)"
            }
            accentColor={
              profitMargin >= 20
                ? "var(--ft-green)"
                : profitMargin >= 5
                ? "var(--ft-amber)"
                : "var(--ft-red)"
            }
          />
        </div>

        {/* Monthly P&L chart */}
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            padding: "14px 12px 8px 4px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingLeft: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Monthly Revenue vs Expenses — {yr}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 8 }}>
              <HStack gap={4} align="center">
                <div style={{ width: 8, height: 8, background: "var(--ft-green)", opacity: 0.8 }} />
                <Text as="span" mono size={9} color="var(--ft-dim)">Revenue</Text>
              </HStack>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, background: "var(--ft-red)", opacity: 0.7 }} />
                <Text as="span" mono size={9} color="var(--ft-dim)">Expenses</Text>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={monthlyPnl}
              barCategoryGap="30%"
              barGap={2}
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="var(--ft-border)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fill: "var(--ft-dim)",
                }}
                tickLine={false}
                axisLine={{ stroke: "var(--ft-border)" }}
              />
              <YAxis
                tick={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fill: "var(--ft-dim)",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
                width={44}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="var(--ft-green)"
                opacity={0.8}
                radius={[1, 1, 0, 0]}
              />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill="var(--ft-red)"
                opacity={0.7}
                radius={[1, 1, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Operating expense breakdown */}
        {expenseBreakdown.length > 0 ? (
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--ft-dim)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Operating Expense Breakdown
            </div>
            <div
              style={{
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-border)",
                overflow: "hidden",
              }}
            >
              <div className="ft-scroll-x">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: "44%" }}>Category</th>
                    <th style={{ ...TH, textAlign: "right" as const }}>Amount</th>
                    <th style={{ ...TH, textAlign: "right" as const }}>Share</th>
                    <th style={{ ...TH, borderRight: "none", width: 140 }}>Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseBreakdown.map((row) => {
                    const share =
                      businessExpenses > 0
                        ? (row.value / businessExpenses) * 100
                        : 0;
                    return (
                      <ExpenseRow
                        key={row.name}
                        name={row.name}
                        value={row.value}
                        share={share}
                        total={businessExpenses}
                        TD={TD}
                      />
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={TrendingDown}
            title="No expense data"
            subtitle="Configure business categories below to start tracking operating expenses and see a full breakdown here."
          />
        )}
      </div>

      {/* ─── Invoice / Billable Tracking ─── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Invoice Tracker" accentColor="var(--ft-blue)">
          <button
            onClick={() => {
              setInvoiceForm(emptyInvoiceForm());
              setInvoiceFormError(null);
              setShowInvoiceForm(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "var(--ft-accent)",
              color: "var(--ft-base)",
              border: "none",
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "opacity 0.1s",
            }}
          >
            <Plus size={11} />
            NEW INVOICE
          </button>
        </SectionHeader>

        {/* Invoice KPI strip */}
        <div
          className="ft-kpi-bar"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--ft-border)",
            marginBottom: 16,
          }}
        >
          <KpiCell
            label="Outstanding"
            value={formatGbp(invoiceStats.outstanding)}
            sub="Sent · awaiting payment"
            valueColor="var(--ft-blue)"
            accentColor="var(--ft-blue)"
          />
          <KpiCell
            label="Overdue"
            value={formatGbp(invoiceStats.overdue)}
            sub={invoiceStats.overdue > 0 ? "Action required" : "All clear"}
            valueColor={
              invoiceStats.overdue > 0 ? "var(--ft-red)" : "var(--ft-dim)"
            }
            accentColor={invoiceStats.overdue > 0 ? "var(--ft-red)" : "var(--ft-border2)"}
          />
          <KpiCell
            label="Collected"
            value={formatGbp(invoiceStats.paid)}
            valueColor="var(--ft-green)"
            accentColor="var(--ft-green)"
          />
          <KpiCell
            label="Total Invoices"
            value={String(invoices.length)}
            sub={invoiceStats.draftCount > 0 ? `${invoiceStats.draftCount} draft` : undefined}
            valueColor="var(--ft-text)"
          />
        </div>

        {/* Add invoice form */}
        {showInvoiceForm && (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderLeft: "2px solid var(--ft-accent)",
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--ft-muted)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                }}
              >
                New Invoice
              </span>
              <button
                onClick={() => setShowInvoiceForm(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ft-dim)",
                  cursor: "pointer",
                  padding: 2,
                }}
              >
                <X size={13} />
              </button>
            </div>

            {invoiceFormError && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ft-red)",
                  marginBottom: 10,
                  padding: "6px 10px",
                  background: "rgba(255,123,114,0.08)",
                  border: "1px solid rgba(255,123,114,0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AlertCircle size={11} />
                {invoiceFormError}
              </div>
            )}

            <div
              className="ft-three-col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div>
                <div style={fieldLabel}>Client</div>
                <input
                  style={inputStyle}
                  value={invoiceForm.client}
                  onChange={(e) =>
                    handleInvoiceFormChange("client", e.target.value)
                  }
                  placeholder="Client name"
                />
              </div>
              <div>
                <div style={fieldLabel}>Amount</div>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceForm.amount}
                  onChange={(e) =>
                    handleInvoiceFormChange("amount", e.target.value)
                  }
                  placeholder="0.00"
                />
              </div>
              <div>
                <div style={fieldLabel}>Currency</div>
                <select
                  style={selectStyle}
                  value={invoiceForm.currency}
                  onChange={(e) =>
                    handleInvoiceFormChange("currency", e.target.value)
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={fieldLabel}>Issued Date</div>
                <input
                  style={inputStyle}
                  type="date"
                  value={invoiceForm.issuedDate}
                  onChange={(e) =>
                    handleInvoiceFormChange("issuedDate", e.target.value)
                  }
                />
              </div>
              <div>
                <div style={fieldLabel}>Due Date</div>
                <input
                  style={inputStyle}
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(e) =>
                    handleInvoiceFormChange("dueDate", e.target.value)
                  }
                />
              </div>
              <div>
                <div style={fieldLabel}>Status</div>
                <select
                  style={selectStyle}
                  value={invoiceForm.status}
                  onChange={(e) =>
                    handleInvoiceFormChange(
                      "status",
                      e.target.value as InvoiceStatus
                    )
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabel}>Description (optional)</div>
              <input
                style={inputStyle}
                value={invoiceForm.description}
                onChange={(e) =>
                  handleInvoiceFormChange("description", e.target.value)
                }
                placeholder="Project or service description"
              />
            </div>

            <HStack gap={8}>
              <button
                onClick={handleAddInvoice}
                style={{
                  background: "var(--ft-accent)",
                  color: "var(--ft-base)",
                  border: "none",
                  padding: "6px 14px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  transition: "opacity 0.1s",
                }}
              >
                ADD INVOICE
              </button>
              <button
                onClick={() => {
                  setShowInvoiceForm(false);
                  setInvoiceFormError(null);
                }}
                style={{
                  background: "none",
                  color: "var(--ft-muted)",
                  border: "1px solid var(--ft-border)",
                  padding: "6px 14px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                CANCEL
              </button>
            </HStack>
          </div>
        )}

        {/* Invoices table */}
        {invoices.length > 0 ? (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              overflow: "hidden",
            }}
          >
            <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={TH}>Client</th>
                  <th style={TH}>Description</th>
                  <th style={{ ...TH, textAlign: "right" as const }}>Amount</th>
                  <th style={TH}>Issued</th>
                  <th style={TH}>Due</th>
                  <th style={TH}>Status</th>
                  <th
                    style={{
                      ...TH,
                      borderRight: "none",
                      textAlign: "right" as const,
                      width: 100,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    TD={TD}
                    onMarkPaid={handleMarkPaid}
                    onDelete={handleDeleteInvoice}
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            subtitle="Create your first invoice to start tracking billable work, monitor payment status, and see outstanding amounts at a glance."
          />
        )}
      </div>

      {/* ─── VAT Tracker ─── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="VAT Position" accentColor="var(--ft-amber)">
          {/* Quarter selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setVatQuarterOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-border2)",
                color: "var(--ft-text)",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.1s",
              }}
            >
              {vatQuarter} · {VAT_QUARTERS[vatQuarter].label}
              <ChevronDown size={10} />
            </button>
            {vatQuarterOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 2px)",
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border2)",
                  zIndex: 20,
                  minWidth: 140,
                }}
              >
                {(Object.keys(VAT_QUARTERS) as VatQuarter[]).map((q) => (
                  <VatQuarterOption
                    key={q}
                    q={q}
                    isActive={vatQuarter === q}
                    onClick={() => {
                      setVatQuarter(q);
                      setVatQuarterOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </SectionHeader>

        {/* VAT grid — border-as-gap */}
        <div
          style={{
            border: "1px solid var(--ft-border)",
            overflow: "hidden",
          }}
        >
          <div
            className="ft-kpi-bar"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "var(--ft-border)",
            }}
          >
            {/* VAT collected */}
            <div style={{ background: "var(--ft-surface)", padding: "16px 20px", borderTop: "2px solid var(--ft-blue)" }}>
              <div style={vatLabel}>VAT Collected on Income</div>
              <div className="pnum" style={vatValue}>
                {formatGbp(vatData.vatCollected)}
              </div>
              <div style={vatSub}>@ 20% standard rate</div>
            </div>

            {/* VAT reclaimable */}
            <div style={{ background: "var(--ft-surface)", padding: "16px 20px", borderTop: "2px solid var(--ft-green)" }}>
              <div style={vatLabel}>VAT Reclaimable on Expenses</div>
              <div className="pnum" style={{ ...vatValue, color: "var(--ft-green)" }}>
                {formatGbp(vatData.vatReclaimable)}
              </div>
              <div style={vatSub}>Input tax credit</div>
            </div>

            {/* Net VAT */}
            <div style={{
              background: "var(--ft-surface)",
              padding: "16px 20px",
              borderTop: `2px solid ${vatData.netVat > 0 ? "var(--ft-red)" : vatData.netVat < 0 ? "var(--ft-green)" : "var(--ft-border2)"}`,
            }}>
              <div style={vatLabel}>Net VAT Position</div>
              <div
                className="pnum"
                style={{
                  ...vatValue,
                  color:
                    vatData.netVat > 0
                      ? "var(--ft-red)"
                      : vatData.netVat < 0
                      ? "var(--ft-green)"
                      : "var(--ft-dim)",
                }}
              >
                {formatGbp(Math.abs(vatData.netVat))}
              </div>
              <div
                style={{
                  ...vatSub,
                  color:
                    vatData.netVat > 0
                      ? "var(--ft-red)"
                      : vatData.netVat < 0
                      ? "var(--ft-green)"
                      : "var(--ft-dim)",
                }}
              >
                {vatData.netVat > 0
                  ? "Due to HMRC"
                  : vatData.netVat < 0
                  ? "Refund from HMRC"
                  : "Neutral position"}
              </div>
            </div>
          </div>

          {/* VAT disclaimer */}
          <div
            style={{
              borderTop: "1px solid var(--ft-border)",
              padding: "8px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-dim)",
              background: "var(--ft-surface)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: "var(--ft-amber)", fontWeight: 700 }}>⚠</span>
            Approximate figures only. Applies 20% standard rate to all business
            category transactions in {vatQuarter} ({VAT_QUARTERS[vatQuarter].label}{" "}
            {yr}). Consult a qualified accountant.
          </div>
        </div>
      </div>

      {/* ─── Business Categories ─── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Business Categories" accentColor="var(--ft-accent)" />

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            marginBottom: 12,
            lineHeight: 1.6,
          }}
        >
          Select which transaction categories count as business activity. Active
          categories are used for all P&L, VAT, and YTD calculations above.
        </div>

        {/* Active category chips */}
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}
        >
          {businessCategories.map((cat) => (
            <CategoryChip
              key={cat}
              cat={cat}
              onRemove={handleRemoveCategory}
            />
          ))}
          {businessCategories.length === 0 && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-dim)",
              }}
            >
              No categories selected. Add one below.
            </span>
          )}
        </div>

        {/* Toggle from existing transaction categories */}
        {allCategories.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--ft-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Categories in your transactions
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {allCategories.map((cat) => {
                const active = businessCategories.includes(cat);
                return (
                  <CategoryToggleButton
                    key={cat}
                    cat={cat}
                    active={active}
                    onToggle={toggleCategory}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Add custom category */}
        <HStack gap={8} align="center">
          <input
            style={{
              ...inputStyle,
              maxWidth: 240,
              flex: "0 0 auto",
            }}
            value={newCatInput}
            onChange={(e) => setNewCatInput(e.target.value)}
            placeholder="Add custom category..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCategory();
            }}
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCatInput.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: newCatInput.trim()
                ? "var(--ft-accent)"
                : "transparent",
              border: newCatInput.trim()
                ? "1px solid var(--ft-accent)"
                : "1px solid var(--ft-border)",
              color: newCatInput.trim()
                ? "var(--ft-base)"
                : "var(--ft-dim)",
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: newCatInput.trim() ? "pointer" : "not-allowed",
              transition: "background 0.1s, color 0.1s",
              letterSpacing: "0.06em",
            }}
          >
            <Plus size={11} />
            ADD
          </button>
        </HStack>
      </div>

      {/* ─── Data source note ─── */}
      <div
        style={{
          borderTop: "1px solid var(--ft-border)",
          paddingTop: 12,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-dim)",
          lineHeight: 1.6,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <span style={{ color: "var(--ft-muted)", fontWeight: 700, flexShrink: 0 }}>
          DATA SOURCE
        </span>
        <span>
          All figures derived from imported transactions filtered by
          business categories. VAT and tax estimates are approximate and for
          planning purposes only. Invoice amounts are stored locally in your
          browser only.
        </span>
      </div>
    </div>
  );
}
