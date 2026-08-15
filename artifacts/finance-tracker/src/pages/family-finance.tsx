import { useState, useMemo, useCallback } from "react";
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Target,
  CalendarDays,
  TrendingUp,
  Home,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatGbp } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useGetDashboard,
  useListAccounts,
  useListTransactions,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FamilyMember {
  id: string;
  name: string;
  role: "primary" | "partner" | "dependent";
  color: string;
  incomeShare: number;
  accountIds: string[];
}

interface HouseholdBudget {
  id: string;
  category: string;
  monthlyLimit: number;
  assignedTo: string; // member id or "shared"
}

interface FamilyGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  assignedTo: string;
  emoji: string;
}

interface TimelineEntry {
  id: string;
  date: string;
  eventName: string;
  type: "goal" | "bill" | "personal";
  amount?: number;
}

// ── localStorage helpers ────────────────────────────────────────────────────────

const LS_MEMBERS = "ft-family-members";
const LS_BUDGETS = "ft-family-budgets";
const LS_GOALS = "ft-family-goals";
const LS_TIMELINE = "ft-family-timeline";

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Color helpers ──────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<FamilyMember["role"], string> = {
  primary: "var(--ft-accent)",
  partner: "var(--ft-blue)",
  dependent: "var(--ft-green)",
};

const DEPENDENT_CYCLE = [
  "var(--ft-green)",
  "var(--ft-cyan)",
  "var(--ft-amber)",
];

function roleColor(role: FamilyMember["role"], index = 0): string {
  if (role === "dependent") return DEPENDENT_CYCLE[index % DEPENDENT_CYCLE.length];
  return ROLE_COLORS[role];
}

function roleCssVar(color: string): string {
  const map: Record<string, string> = {
    "var(--ft-accent)": "#F4A21E",
    "var(--ft-blue)": "#60A5FA",
    "var(--ft-green)": "#4ADE80",
    "var(--ft-cyan)": "#22D3EE",
    "var(--ft-amber)": "#F0883E",
    "var(--ft-red)": "#F87171",
  };
  return map[color] ?? "#6C7A96";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
  label,
  accentColor,
  count,
  action,
}: {
  label: string;
  accentColor?: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--ft-border)",
        paddingBottom: 6,
        marginBottom: 12,
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
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ft-muted)",
          }}
        >
          {label}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-dim)",
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              padding: "0 5px",
              lineHeight: "16px",
            }}
          >
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = "ghost",
  size = "sm",
  disabled = false,
  style: extraStyle,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "accent" | "danger" | "muted";
  size?: "xs" | "sm";
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "1px solid var(--ft-border2)",
    borderRadius: 2,
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background 0.1s",
    fontSize: size === "xs" ? 10 : 11,
    padding: size === "xs" ? "2px 7px" : "4px 10px",
    lineHeight: 1.5,
  };

  const variantStyle: React.CSSProperties =
    variant === "accent"
      ? { background: "var(--ft-accent)", color: "var(--ft-base)", borderColor: "var(--ft-accent)" }
      : variant === "danger"
      ? { background: "transparent", color: "var(--ft-red)", borderColor: "var(--ft-red)" }
      : variant === "muted"
      ? { background: "var(--ft-raised)", color: "var(--ft-muted)", borderColor: "var(--ft-border)" }
      : { background: "transparent", color: "var(--ft-muted)", borderColor: "var(--ft-border)" };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variantStyle, ...extraStyle }}
    >
      {children}
    </button>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--ft-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function FtInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        background: "var(--ft-base)",
        border: "1px solid var(--ft-border2)",
        borderRadius: 2,
        color: "var(--ft-text)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        padding: "5px 8px",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function FtSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        background: "var(--ft-base)",
        border: "1px solid var(--ft-border2)",
        borderRadius: 2,
        color: "var(--ft-text)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        padding: "5px 8px",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function RoleBadge({ role }: { role: FamilyMember["role"] }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        border: "1px solid var(--ft-border2)",
        borderRadius: 2,
        padding: "1px 5px",
        color:
          role === "primary"
            ? "var(--ft-accent)"
            : role === "partner"
            ? "var(--ft-blue)"
            : "var(--ft-green)",
        background: "transparent",
      }}
    >
      {role}
    </span>
  );
}

function ProgressBar({
  pct,
  color,
  height = 4,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  const clamped = Math.min(pct, 1);
  return (
    <div
      style={{
        width: "100%",
        height,
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped * 100}%`,
          height: "100%",
          background: pct >= 1 ? "var(--ft-green)" : color,
        }}
      />
    </div>
  );
}

function EmptyPanel({
  text,
  subtext,
  cta,
  onCta,
  icon: Icon,
}: {
  text: string;
  subtext?: string;
  cta: string;
  onCta: () => void;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "32px 20px",
        border: "1px dashed var(--ft-border2)",
        borderRadius: 2,
        textAlign: "center",
        background: "var(--ft-surface)",
      }}
    >
      {Icon && <Icon size={22} style={{ color: "var(--ft-border2)", marginBottom: 2 }} />}
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-muted)",
          margin: 0,
        }}
      >
        {text}
      </p>
      {subtext && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", margin: 0 }}>
          {subtext}
        </p>
      )}
      <Btn variant="accent" onClick={onCta} style={{ marginTop: 4 }}>
        <Plus size={11} />
        {cta}
      </Btn>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  color,
  accentColor,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  accentColor?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "10px 14px",
        background: "var(--ft-surface)",
        borderTop: `2px solid ${accentColor ?? "var(--ft-border2)"}`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--ft-muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 700,
          color: color ?? "var(--ft-text)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-dim)",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Income Legend Item ────────────────────────────────────────────────────────

function IncomeLegendItem({
  name,
  gbp,
  pct,
  color,
}: {
  name: string;
  gbp: number;
  pct: number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 8,
          height: 8,
          background: roleCssVar(color),
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-text)",
        }}
      >
        {name}
      </span>
      <span
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatGbp(gbp)} ({pct}%)
      </span>
    </div>
  );
}

// ── Stacked Bar Segment ────────────────────────────────────────────────────────

function StackedBarSegment({
  name,
  pct,
  color,
}: {
  name: string;
  pct: number;
  color: string;
}) {
  return (
    <div
      title={`${name}: ${pct}%`}
      style={{
        width: `${pct}%`,
        background: roleCssVar(color),
        transition: "width 0.1s",
      }}
    />
  );
}

// ── Spending Legend Row ───────────────────────────────────────────────────────

function SpendingLegendRow({
  id,
  name,
  value,
  color,
  total,
}: {
  id: string;
  name: string;
  value: number;
  color: string;
  total: number;
}) {
  const pct = Math.round((value / total) * 100);
  return (
    <div key={id}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 3,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              background: roleCssVar(color),
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-text)",
            }}
          >
            {name}
          </span>
        </div>
        <span
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatGbp(value)} · {pct}%
        </span>
      </div>
      <ProgressBar pct={value / total} color={roleCssVar(color)} height={3} />
    </div>
  );
}

// ── Timeline Row ──────────────────────────────────────────────────────────────

function TimelineRow({
  entry,
  idx,
  total,
  onDelete,
}: {
  entry: TimelineEntry;
  idx: number;
  total: number;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const isPast = new Date(entry.date) < new Date(new Date().toDateString());
  const typeColor =
    entry.type === "goal"
      ? "var(--ft-accent)"
      : entry.type === "bill"
      ? "var(--ft-red)"
      : "var(--ft-blue)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      onTouchCancel={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Timeline spine */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 24,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isPast ? "var(--ft-dim)" : typeColor,
            flexShrink: 0,
            marginTop: 10,
            border: `1px solid ${isPast ? "var(--ft-border2)" : typeColor}`,
          }}
        />
        {idx < total - 1 && (
          <div
            style={{
              flex: 1,
              width: 1,
              background: "var(--ft-border)",
              minHeight: 8,
            }}
          />
        )}
      </div>

      {/* Entry content */}
      <div
        style={{
          flex: 1,
          paddingBottom: 12,
          paddingLeft: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingTop: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: isPast ? "var(--ft-dim)" : "var(--ft-muted)",
              flexShrink: 0,
              minWidth: 80,
            }}
          >
            {new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "1px 5px",
              border: `1px solid ${typeColor}`,
              borderRadius: 2,
              color: typeColor,
              flexShrink: 0,
              opacity: isPast ? 0.5 : 1,
            }}
          >
            {entry.type}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: isPast ? "var(--ft-dim)" : "var(--ft-text)",
              flex: 1,
            }}
          >
            {entry.eventName}
          </span>
          {entry.amount !== undefined && (
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: isPast ? "var(--ft-dim)" : "var(--ft-text)",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {formatGbp(entry.amount)}
            </span>
          )}
          <button
            onClick={() => onDelete(entry.id)}
            style={{
              background: "transparent",
              border: "none",
              color: hovered ? "var(--ft-red)" : "var(--ft-dim)",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              transition: "color 0.1s",
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget table header cell ───────────────────────────────────────────────────

function BudgetHeaderCell({ label }: { label: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--ft-muted)",
        padding: "6px 12px",
      }}
    >
      {label}
    </div>
  );
}

// ── Account toggle button ─────────────────────────────────────────────────────

function AccountToggleButton({
  account,
  checked,
  onToggle,
}: {
  account: { id: number; name: string };
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onToggle(String(account.id), checked)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        padding: "2px 8px",
        border: `1px solid ${checked ? "var(--ft-accent)" : "var(--ft-border2)"}`,
        borderRadius: 2,
        background: checked
          ? "color-mix(in srgb, var(--ft-accent) 12%, transparent)"
          : hovered
          ? "color-mix(in srgb, var(--ft-accent) 5%, transparent)"
          : "transparent",
        color: checked ? "var(--ft-accent)" : hovered ? "var(--ft-text)" : "var(--ft-muted)",
        cursor: "pointer",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {account.name}
    </button>
  );
}

// ── Budget Row ────────────────────────────────────────────────────────────────

function BudgetRow({
  b, idx, budgetsLength, actual, pct, barCol, members, onDelete, onUpdateAssignment,
}: {
  b: HouseholdBudget;
  idx: number;
  budgetsLength: number;
  actual: number;
  pct: number;
  barCol: string;
  members: FamilyMember[];
  onDelete: () => void;
  onUpdateAssignment: (val: string) => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      onTouchCancel={() => setHovered(false)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 100px 120px 90px 200px", gap: 0,
        minWidth: 560,
        borderBottom: idx < budgetsLength - 1 ? "1px solid var(--ft-border)" : "none",
        background: hovered ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)" }}>{b.category}</span>
        <button onClick={onDelete} style={{ background: "transparent", border: "none", color: "var(--ft-red)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", opacity: hovered ? 0.7 : 0, transition: "opacity 0.1s" }}>
          <Trash2 size={10} />
        </button>
      </div>
      <div style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center" }}>
        <span className="pnum">{formatGbp(b.monthlyLimit)}</span>
      </div>
      <div style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: pct >= 1 ? "var(--ft-red)" : pct >= 0.8 ? "var(--ft-amber)" : "var(--ft-text)", fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center" }}>
        <span className="pnum">{formatGbp(actual)}</span>
      </div>
      <HStack align="center" padding="8px 12px">
        <div style={{ width: "100%" }}>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: pct >= 1 ? "var(--ft-red)" : pct >= 0.8 ? "var(--ft-amber)" : "var(--ft-muted)", marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(pct * 100)}%
          </div>
          <ProgressBar pct={pct} color={barCol} height={3} />
        </div>
      </HStack>
      <HStack align="center" padding="6px 12px">
        <FtSelect value={b.assignedTo} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdateAssignment(e.target.value)} style={{ fontSize: 10, padding: "2px 6px" }}>
          <option value="shared">Shared</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </FtSelect>
      </HStack>
    </div>
  );
}

// ── Goal Row ───────────────────────────────────────────────────────────────────

type GoalFormState = { name: string; targetAmount: number; currentAmount: number; deadline: string; assignedTo: string; emoji: string };

function GoalRow({
  g, pct, isExpanded, assignedColor, daysLeft, gIdx, goalsLength,
  goalForm, setGoalForm, editGoalId, members, memberName,
  onToggle, onSave, onCancel, onDelete,
}: {
  g: FamilyGoal;
  pct: number;
  isExpanded: boolean;
  assignedColor: string;
  daysLeft: number | null;
  gIdx: number;
  goalsLength: number;
  goalForm: GoalFormState;
  setGoalForm: React.Dispatch<React.SetStateAction<GoalFormState>>;
  editGoalId: string | null;
  members: FamilyMember[];
  memberName: (id: string) => string;
  onToggle: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        borderBottom: gIdx < goalsLength - 1 ? "1px solid var(--ft-border)" : "none",
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          background: hovered && !isExpanded
            ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
            : isExpanded
            ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))"
            : "transparent",
          transition: "background 0.1s",
        }}
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={() => setHovered(true)}
        onTouchEnd={() => setHovered(false)}
        onTouchCancel={() => setHovered(false)}
      >
        <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{g.emoji}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <HStack gap={8} align="center" marginBottom={5}>
            <Text as="span" mono size={12} weight={600} color="var(--ft-text)">
              {g.name}
            </Text>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9,
              padding: "1px 5px",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              color: assignedColor,
            }}>
              {memberName(g.assignedTo)}
            </span>
            {daysLeft !== null && (
              <Text as="span" mono size={9} weight={daysLeft < 0 ? 700 : 400} color={daysLeft < 0 ? "var(--ft-red)" : daysLeft < 30 ? "var(--ft-amber)" : "var(--ft-dim)"}>
                {daysLeft < 0 ? "OVERDUE" : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
              </Text>
            )}
            {pct >= 1 && (
              <Text as="span" mono size={9} weight={700} color="var(--ft-green)">
                COMPLETE
              </Text>
            )}
          </HStack>
          <ProgressBar pct={pct} color={roleCssVar(assignedColor)} height={4} />
        </div>

        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 130 }}>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: pct >= 1 ? "var(--ft-green)" : "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>
            {formatGbp(g.currentAmount)} / {formatGbp(g.targetAmount)}
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(pct * 100)}% funded
          </div>
        </div>

        <div style={{ flexShrink: 0, color: "var(--ft-muted)" }}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Inline edit form */}
      {isExpanded && editGoalId === g.id && (
        <div
          style={{ borderTop: "1px solid var(--ft-border)", padding: "12px 14px", background: "var(--ft-raised)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
            <FieldRow label="Name">
              <FtInput value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} />
            </FieldRow>
            <FieldRow label="Target (£)">
              <FtInput type="number" min={0} value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: parseFloat(e.target.value) || 0 })} />
            </FieldRow>
            <FieldRow label="Current (£)">
              <FtInput type="number" min={0} value={goalForm.currentAmount} onChange={(e) => setGoalForm({ ...goalForm, currentAmount: parseFloat(e.target.value) || 0 })} />
            </FieldRow>
            <FieldRow label="Deadline">
              <FtInput type="date" value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
            </FieldRow>
            <FieldRow label="Assigned To">
              <FtSelect value={goalForm.assignedTo} onChange={(e) => setGoalForm({ ...goalForm, assignedTo: e.target.value })}>
                <option value="shared">Shared</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </FtSelect>
            </FieldRow>
            <FieldRow label="Emoji">
              <FtInput value={goalForm.emoji} onChange={(e) => setGoalForm({ ...goalForm, emoji: e.target.value })} placeholder="🏠" style={{ width: 60 }} />
            </FieldRow>
          </div>
          <HStack gap={8}>
            <Btn variant="accent" onClick={onSave}><Check size={11} />Save</Btn>
            <Btn variant="ghost" onClick={onCancel}><X size={11} />Cancel</Btn>
            <Btn variant="danger" onClick={onDelete} style={{ marginLeft: "auto" }}><Trash2 size={11} />Delete</Btn>
          </HStack>
        </div>
      )}
    </div>
  );
}

// ── Member Card ───────────────────────────────────────────────────────────────

function MemberCard({
  member,
  accounts,
  monthlyIncome,
  onEdit,
  onDelete,
}: {
  member: FamilyMember;
  accounts: { id: number; name: string; currency: string; balance: number; gbpEquivalent: number }[];
  monthlyIncome: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);
  const linkedAccounts = accounts.filter((a) => member.accountIds.includes(String(a.id)));
  const memberIncome = (member.incomeShare / 100) * monthlyIncome;
  const linkedBalance = linkedAccounts.reduce((s, a) => s + a.gbpEquivalent, 0);
  const accentHex = roleCssVar(member.color);

  const statRow = (label: string, value: React.ReactNode) => (
    <HStack gap={8} align="center" justify="between">
      <Text as="span" mono size={10} color="var(--ft-muted)">{label}</Text>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</span>
    </HStack>
  );

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      onTouchCancel={() => setHovered(false)}
      style={{
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))"
          : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderRadius: 2,
        padding: "12px 14px",
        borderLeft: `3px solid ${accentHex}`,
        transition: "background 0.1s",
      }}
    >
      <HStack align="start" justify="between" marginBottom={10}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 5 }}>
            {member.name}
          </div>
          <RoleBadge role={member.role} />
        </div>
        <div style={{ display: "flex", gap: 4, opacity: hovered ? 1 : 0.5, transition: "opacity 0.1s" }}>
          <Btn variant="ghost" size="xs" onClick={onEdit}>
            <Edit2 size={10} />
          </Btn>
          <Btn variant="danger" size="xs" onClick={onDelete}>
            <Trash2 size={10} />
          </Btn>
        </div>
      </HStack>

      {/* Thin accent divider */}
      <div style={{ height: 1, background: `${accentHex}33`, marginBottom: 8 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {statRow("Income share", (
          <span className="pnum">{member.incomeShare}% · {formatGbp(memberIncome)}/mo</span>
        ))}
        {linkedBalance > 0 && statRow("Balance", (
          <span className="pnum" style={{ color: linkedBalance >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
            {formatGbp(linkedBalance)}
          </span>
        ))}
        {statRow("Accounts", (
          linkedAccounts.length > 0
            ? linkedAccounts.map((a) => a.name).join(", ")
            : <Text as="span" color="var(--ft-dim)">None linked</Text>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FamilyFinance() {
  const isMobile = useIsMobile();
  // ── Remote data ──────────────────────────────────────────────────────────────
  const { data: dashboard } = useGetDashboard();
  const { data: accounts = [] } = useListAccounts();
  const { data: transactions = [] } = useListTransactions();

  // ── Local state: members ─────────────────────────────────────────────────────
  const [members, setMembers] = useState<FamilyMember[]>(() =>
    loadLS<FamilyMember[]>(LS_MEMBERS, [])
  );

  const saveMembers = useCallback((next: FamilyMember[]) => {
    setMembers(next);
    saveLS(LS_MEMBERS, next);
  }, []);

  // ── Local state: household budgets ───────────────────────────────────────────
  const [budgets, setBudgets] = useState<HouseholdBudget[]>(() =>
    loadLS<HouseholdBudget[]>(LS_BUDGETS, [])
  );

  const saveBudgets = useCallback((next: HouseholdBudget[]) => {
    setBudgets(next);
    saveLS(LS_BUDGETS, next);
  }, []);

  // ── Local state: family goals ────────────────────────────────────────────────
  const [goals, setGoals] = useState<FamilyGoal[]>(() =>
    loadLS<FamilyGoal[]>(LS_GOALS, [])
  );

  const saveGoals = useCallback((next: FamilyGoal[]) => {
    setGoals(next);
    saveLS(LS_GOALS, next);
  }, []);

  // ── Local state: timeline ────────────────────────────────────────────────────
  const [timeline, setTimeline] = useState<TimelineEntry[]>(() =>
    loadLS<TimelineEntry[]>(LS_TIMELINE, [])
  );

  const saveTimeline = useCallback((next: TimelineEntry[]) => {
    setTimeline(next);
    saveLS(LS_TIMELINE, next);
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showAddMember, setShowAddMember] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddTimeline, setShowAddTimeline] = useState(false);

  // ── Household KPIs ───────────────────────────────────────────────────────────
  const netWorth = dashboard?.netWorth ?? 0;
  const monthlyIncome = dashboard?.thisMonth?.income ?? 0;
  const monthlyExpenses = dashboard?.thisMonth?.expenses ?? 0;
  const savingsRate =
    monthlyIncome > 0
      ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100
      : 0;

  // ── Income allocation chart data ──────────────────────────────────────────────
  const incomeChartData = useMemo(() => {
    if (members.length === 0) return [];
    const total = members.reduce((s, m) => s + m.incomeShare, 0) || 1;
    return members.map((m) => ({
      name: m.name,
      pct: Math.round((m.incomeShare / total) * 100),
      gbp: (m.incomeShare / 100) * monthlyIncome,
      color: m.color,
    }));
  }, [members, monthlyIncome]);

  // ── Spending by member (category → member mapping) ────────────────────────────
  const memberCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    budgets.forEach((b) => {
      map[b.category.toLowerCase()] = b.assignedTo;
    });
    return map;
  }, [budgets]);

  const spendingByMember = useMemo(() => {
    const tally: Record<string, number> = { shared: 0 };
    members.forEach((m) => {
      tally[m.id] = 0;
    });

    const thisMonthStr = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();

    transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const month = t.date?.slice(0, 7) ?? "";
        return month === thisMonthStr;
      })
      .forEach((t) => {
        const cat = (t.category ?? "").toLowerCase();
        const assignedTo = memberCategoryMap[cat] ?? "shared";
        if (tally[assignedTo] !== undefined) {
          tally[assignedTo] += t.gbpValue ?? 0;
        } else {
          tally["shared"] += t.gbpValue ?? 0;
        }
      });

    const entries = Object.entries(tally)
      .filter(([, v]) => v > 0)
      .map(([id, value]) => {
        if (id === "shared") {
          return { name: "Shared", value, color: "var(--ft-dim)", id: "shared" };
        }
        const m = members.find((x) => x.id === id);
        return { name: m?.name ?? id, value, color: m?.color ?? "var(--ft-dim)", id };
      });

    return entries;
  }, [transactions, memberCategoryMap, members]);

  // ── Current-month actual spending per budget category ────────────────────────
  const actualSpendByCategory = useMemo(() => {
    const tally: Record<string, number> = {};
    const thisMonthStr = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();
    transactions
      .filter((t) => t.type === "expense" && (t.date ?? "").slice(0, 7) === thisMonthStr)
      .forEach((t) => {
        const cat = (t.category ?? "Uncategorised").toLowerCase();
        tally[cat] = (tally[cat] ?? 0) + (t.gbpValue ?? 0);
      });
    return tally;
  }, [transactions]);

  // ── Add member form ───────────────────────────────────────────────────────────
  const emptyMemberForm = {
    name: "",
    role: "partner" as FamilyMember["role"],
    incomeShare: 50,
    accountIds: [] as string[],
  };
  const [memberForm, setMemberForm] = useState(emptyMemberForm);

  function openAddMember() {
    setMemberForm(emptyMemberForm);
    setEditMemberId(null);
    setShowAddMember(true);
  }

  function openEditMember(m: FamilyMember) {
    setMemberForm({
      name: m.name,
      role: m.role,
      incomeShare: m.incomeShare,
      accountIds: m.accountIds,
    });
    setEditMemberId(m.id);
    setShowAddMember(true);
  }

  function submitMemberForm() {
    if (!memberForm.name.trim()) return;
    if (editMemberId) {
      const next = members.map((m) =>
        m.id === editMemberId
          ? { ...m, name: memberForm.name, role: memberForm.role, incomeShare: memberForm.incomeShare, accountIds: memberForm.accountIds }
          : m
      );
      saveMembers(next);
    } else {
      const depCount = members.filter((m) => m.role === "dependent").length;
      const color = roleColor(memberForm.role, depCount);
      const newMember: FamilyMember = {
        id: uid(),
        name: memberForm.name.trim(),
        role: memberForm.role,
        color,
        incomeShare: memberForm.incomeShare,
        accountIds: memberForm.accountIds,
      };
      saveMembers([...members, newMember]);
    }
    setShowAddMember(false);
    setEditMemberId(null);
  }

  function deleteMember(id: string) {
    saveMembers(members.filter((m) => m.id !== id));
  }

  // ── Add budget form ───────────────────────────────────────────────────────────
  const emptyBudgetForm = { category: "", monthlyLimit: 0, assignedTo: "shared" };
  const [budgetForm, setBudgetForm] = useState(emptyBudgetForm);

  function submitBudgetForm() {
    if (!budgetForm.category.trim() || budgetForm.monthlyLimit <= 0) return;
    const next: HouseholdBudget = {
      id: uid(),
      category: budgetForm.category.trim(),
      monthlyLimit: budgetForm.monthlyLimit,
      assignedTo: budgetForm.assignedTo,
    };
    saveBudgets([...budgets, next]);
    setBudgetForm(emptyBudgetForm);
    setShowAddBudget(false);
  }

  function deleteBudget(id: string) {
    saveBudgets(budgets.filter((b) => b.id !== id));
  }

  function updateBudgetAssignment(id: string, assignedTo: string) {
    saveBudgets(budgets.map((b) => (b.id === id ? { ...b, assignedTo } : b)));
  }

  // ── Add goal form ─────────────────────────────────────────────────────────────
  const emptyGoalForm = {
    name: "",
    targetAmount: 0,
    currentAmount: 0,
    deadline: "",
    assignedTo: "shared",
    emoji: "🏠",
  };
  const [goalForm, setGoalForm] = useState(emptyGoalForm);
  const [editGoalId, setEditGoalId] = useState<string | null>(null);

  function openAddGoal() {
    setGoalForm(emptyGoalForm);
    setEditGoalId(null);
    setShowAddGoal(true);
    setExpandedGoalId(null);
  }

  function openEditGoal(g: FamilyGoal) {
    setGoalForm({
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      deadline: g.deadline ?? "",
      assignedTo: g.assignedTo,
      emoji: g.emoji,
    });
    setEditGoalId(g.id);
    setExpandedGoalId(g.id);
    setShowAddGoal(false);
  }

  function submitGoalForm() {
    if (!goalForm.name.trim() || goalForm.targetAmount <= 0) return;
    if (editGoalId) {
      saveGoals(
        goals.map((g) =>
          g.id === editGoalId
            ? {
                ...g,
                name: goalForm.name,
                targetAmount: goalForm.targetAmount,
                currentAmount: goalForm.currentAmount,
                deadline: goalForm.deadline || undefined,
                assignedTo: goalForm.assignedTo,
                emoji: goalForm.emoji,
              }
            : g
        )
      );
      setExpandedGoalId(null);
    } else {
      const newGoal: FamilyGoal = {
        id: uid(),
        name: goalForm.name.trim(),
        targetAmount: goalForm.targetAmount,
        currentAmount: goalForm.currentAmount,
        deadline: goalForm.deadline || undefined,
        assignedTo: goalForm.assignedTo,
        emoji: goalForm.emoji,
      };
      saveGoals([...goals, newGoal]);
      setShowAddGoal(false);
    }
    setEditGoalId(null);
    setGoalForm(emptyGoalForm);
  }

  function deleteGoal(id: string) {
    saveGoals(goals.filter((g) => g.id !== id));
    if (expandedGoalId === id) setExpandedGoalId(null);
  }

  // ── Add timeline form ─────────────────────────────────────────────────────────
  const emptyTimelineForm = {
    date: "",
    eventName: "",
    type: "personal" as TimelineEntry["type"],
    amount: "" as string,
  };
  const [timelineForm, setTimelineForm] = useState(emptyTimelineForm);

  function submitTimelineForm() {
    if (!timelineForm.date || !timelineForm.eventName.trim()) return;
    const entry: TimelineEntry = {
      id: uid(),
      date: timelineForm.date,
      eventName: timelineForm.eventName.trim(),
      type: timelineForm.type,
      amount: timelineForm.amount ? parseFloat(timelineForm.amount) : undefined,
    };
    saveTimeline([...timeline, entry].sort((a, b) => a.date.localeCompare(b.date)));
    setTimelineForm(emptyTimelineForm);
    setShowAddTimeline(false);
  }

  function deleteTimelineEntry(id: string) {
    saveTimeline(timeline.filter((e) => e.id !== id));
  }

  // ── Utility: member name by id ─────────────────────────────────────────────────
  function memberName(id: string): string {
    if (id === "shared") return "Shared";
    return members.find((m) => m.id === id)?.name ?? id;
  }

  function memberColor(id: string): string {
    if (id === "shared") return "var(--ft-dim)";
    return members.find((m) => m.id === id)?.color ?? "var(--ft-dim)";
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        icon={Home}
        title="Family Finance"
        subtitle="Household overview, members, goals & budget"
      />

      {/* ── 1. HOUSEHOLD OVERVIEW ───────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader label="Household Overview" accentColor="var(--ft-accent)" />
        {/* border-as-gap KPI strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
            gap: 1,
            background: "var(--ft-border)",
            border: "1px solid var(--ft-border)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <KpiCell
            label="Net Worth"
            value={formatGbp(netWorth)}
            sub={netWorth >= 0 ? "positive equity" : "net deficit"}
            color={netWorth >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            accentColor={netWorth >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          />
          <KpiCell
            label="Monthly Income"
            value={formatGbp(monthlyIncome)}
            sub="this month"
            color="var(--ft-text)"
            accentColor="var(--ft-cyan)"
          />
          <KpiCell
            label="Monthly Expenses"
            value={formatGbp(monthlyExpenses)}
            sub="this month"
            color="var(--ft-red)"
            accentColor="var(--ft-red)"
          />
          <KpiCell
            label="Savings Rate"
            value={`${savingsRate.toFixed(1)}%`}
            sub={`${formatGbp(monthlyIncome - monthlyExpenses)} saved/mo`}
            color={
              savingsRate >= 20
                ? "var(--ft-green)"
                : savingsRate >= 10
                ? "var(--ft-amber)"
                : "var(--ft-red)"
            }
            accentColor={
              savingsRate >= 20
                ? "var(--ft-green)"
                : savingsRate >= 10
                ? "var(--ft-amber)"
                : "var(--ft-red)"
            }
          />
          <div
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "var(--ft-surface)",
              borderTop: "2px solid var(--ft-blue)",
              ...(isMobile ? { gridColumn: "span 2" } : {}),
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--ft-muted)",
                marginBottom: 4,
              }}
            >
              Household
            </div>
            <div
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--ft-text)",
                lineHeight: 1.1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {members.length}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-dim)",
                marginTop: 2,
              }}
            >
              member{members.length !== 1 ? "s" : ""} · {accounts.length} account{accounts.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. MEMBERS PANEL ──────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader
          label="Members"
          accentColor="var(--ft-accent)"
          count={members.length}
          action={
            <Btn variant="accent" size="xs" onClick={openAddMember}>
              <Plus size={10} />
              Add Member
            </Btn>
          }
        />

        {members.length === 0 && !showAddMember ? (
          <EmptyPanel
            icon={Users}
            text="No family members added yet."
            subtext="Add household members to track income shares, linked accounts, and spending."
            cta="Add First Member"
            onCta={openAddMember}
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 8,
            }}
          >
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                accounts={accounts}
                monthlyIncome={monthlyIncome}
                onEdit={() => openEditMember(m)}
                onDelete={() => deleteMember(m.id)}
              />
            ))}
          </div>
        )}

        {/* Inline add/edit form */}
        {showAddMember && (
          <div
            style={{
              marginTop: 10,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--ft-muted)",
                letterSpacing: "0.06em",
                marginBottom: 12,
              }}
            >
              {editMemberId ? "Edit Member" : "New Member"}
            </div>
            <div
              className="ft-three-col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <FieldRow label="Name">
                <FtInput
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                  placeholder="e.g. Sarah"
                />
              </FieldRow>
              <FieldRow label="Role">
                <FtSelect
                  value={memberForm.role}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      role: e.target.value as FamilyMember["role"],
                    })
                  }
                >
                  <option value="primary">Primary</option>
                  <option value="partner">Partner</option>
                  <option value="dependent">Dependent</option>
                </FtSelect>
              </FieldRow>
              <FieldRow label="Income Share (%)">
                <FtInput
                  type="number"
                  min={0}
                  max={100}
                  value={memberForm.incomeShare}
                  onChange={(e) =>
                    setMemberForm({ ...memberForm, incomeShare: parseFloat(e.target.value) || 0 })
                  }
                />
              </FieldRow>
            </div>
            <FieldRow label="Linked Accounts">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {accounts.map((a) => {
                  const checked = memberForm.accountIds.includes(String(a.id));
                  return (
                    <AccountToggleButton
                      key={a.id}
                      account={a}
                      checked={checked}
                      onToggle={(id, wasChecked) => {
                        setMemberForm((prev) => ({
                          ...prev,
                          accountIds: wasChecked
                            ? prev.accountIds.filter((x) => x !== id)
                            : [...prev.accountIds, id],
                        }));
                      }}
                    />
                  );
                })}
                {accounts.length === 0 && (
                  <Text as="span" mono size={11} color="var(--ft-dim)">
                    No accounts available
                  </Text>
                )}
              </div>
            </FieldRow>
            <HStack gap={8} marginTop={14}>
              <Btn variant="accent" onClick={submitMemberForm} disabled={!memberForm.name.trim()}>
                <Check size={11} />
                {editMemberId ? "Save" : "Add Member"}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setShowAddMember(false);
                  setEditMemberId(null);
                }}
              >
                <X size={11} />
                Cancel
              </Btn>
            </HStack>
          </div>
        )}
      </section>

      {/* ── 3. INCOME ALLOCATION ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader label="Income Allocation" accentColor="var(--ft-green)" />
        {members.length === 0 ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
              padding: "12px 0",
            }}
          >
            Add members to see income allocation.
          </div>
        ) : (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderRadius: 2,
              padding: "14px 16px",
            }}
          >
            {/* legend row */}
            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              {incomeChartData.map((d) => (
                <IncomeLegendItem
                  key={d.name}
                  name={d.name}
                  gbp={d.gbp}
                  pct={d.pct}
                  color={d.color}
                />
              ))}
            </div>

            {/* stacked horizontal bar */}
            <div
              style={{
                display: "flex",
                height: 20,
                width: "100%",
                border: "1px solid var(--ft-border)",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              {incomeChartData.map((d) => (
                <StackedBarSegment
                  key={d.name}
                  name={d.name}
                  pct={d.pct}
                  color={d.color}
                />
              ))}
            </div>

            <div
              style={{
                marginTop: 16,
                height: 120,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={incomeChartData}
                  layout="vertical"
                  margin={{ left: 4, right: 12, top: 2, bottom: 2 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "#6C7A96" }}
                    tickFormatter={(v) => formatGbp(v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={60}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "#CDD6F4" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ft-raised)",
                      border: "1px solid var(--ft-border2)",
                      borderRadius: 2,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ft-text)",
                    }}
                    formatter={(v: number) => [formatGbp(v), "Income"]}
                  />
                  <Bar dataKey="gbp" radius={0}>
                    {incomeChartData.map((entry) => (
                      <Cell key={entry.name} fill={roleCssVar(entry.color)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* ── 4. SPENDING BY MEMBER ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader label="Spending by Member — This Month" accentColor="var(--ft-red)" />
        {members.length === 0 ? (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
              padding: "12px 0",
            }}
          >
            Add members and assign budget categories to see spending breakdown.
          </div>
        ) : (
          <div
            className="ft-two-col"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderRadius: 2,
              padding: "14px 16px",
            }}
          >
            {/* Pie chart */}
            <div>
              {spendingByMember.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={spendingByMember}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {spendingByMember.map((entry) => (
                        <Cell key={entry.id} fill={roleCssVar(entry.color)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--ft-raised)",
                        border: "1px solid var(--ft-border2)",
                        borderRadius: 2,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ft-text)",
                      }}
                      formatter={(v: number) => [formatGbp(v), "Spent"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 200,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ft-dim)",
                  }}
                >
                  No expense data this month
                </div>
              )}
            </div>

            {/* Legend + values */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                justifyContent: "center",
              }}
            >
              {spendingByMember.length > 0 ? (() => {
                const total = spendingByMember.reduce((s, e) => s + e.value, 0) || 1;
                return spendingByMember.map((entry) => (
                  <SpendingLegendRow
                    key={entry.id}
                    id={entry.id}
                    name={entry.name}
                    value={entry.value}
                    color={entry.color}
                    total={total}
                  />
                ));
              })() : (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ft-dim)",
                  }}
                >
                  Assign categories in the Household Budget section below, then spending will appear here.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 5. HOUSEHOLD GOALS ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader
          label="Household Goals"
          accentColor="var(--ft-amber)"
          count={goals.length}
          action={
            <Btn variant="accent" size="xs" onClick={openAddGoal}>
              <Plus size={10} />
              Add Goal
            </Btn>
          }
        />

        {goals.length === 0 && !showAddGoal ? (
          <EmptyPanel
            icon={Target}
            text="No household goals yet."
            subtext="Set savings targets for house deposits, holidays, or emergency funds."
            cta="Add Goal"
            onCta={openAddGoal}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              border: "1px solid var(--ft-border)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            {goals.map((g, gIdx) => {
              const pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
              const isExpanded = expandedGoalId === g.id;
              const assignedColor = g.assignedTo === "shared" ? "var(--ft-dim)" : memberColor(g.assignedTo);
              const daysLeft = g.deadline
                ? Math.round(
                    (new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  )
                : null;

              return (
                <GoalRow
                  key={g.id}
                  g={g}
                  pct={pct}
                  isExpanded={isExpanded}
                  assignedColor={assignedColor}
                  daysLeft={daysLeft}
                  gIdx={gIdx}
                  goalsLength={goals.length}
                  goalForm={goalForm}
                  setGoalForm={setGoalForm}
                  editGoalId={editGoalId}
                  members={members}
                  memberName={memberName}
                  onToggle={() => {
                    if (isExpanded) { setExpandedGoalId(null); setEditGoalId(null); }
                    else { openEditGoal(g); }
                  }}
                  onSave={submitGoalForm}
                  onCancel={() => { setExpandedGoalId(null); setEditGoalId(null); }}
                  onDelete={() => deleteGoal(g.id)}
                />
              );
            })}
          </div>
        )}

        {/* Inline add goal form */}
        {showAddGoal && (
          <div
            style={{
              marginTop: 10,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--ft-muted)",
                letterSpacing: "0.06em",
                marginBottom: 12,
              }}
            >
              New Goal
            </div>
            <div
              className="ft-three-col"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <FieldRow label="Name">
                <FtInput
                  value={goalForm.name}
                  onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                  placeholder="e.g. Family Holiday"
                />
              </FieldRow>
              <FieldRow label="Target (£)">
                <FtInput
                  type="number"
                  min={0}
                  value={goalForm.targetAmount || ""}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, targetAmount: parseFloat(e.target.value) || 0 })
                  }
                />
              </FieldRow>
              <FieldRow label="Current (£)">
                <FtInput
                  type="number"
                  min={0}
                  value={goalForm.currentAmount || ""}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, currentAmount: parseFloat(e.target.value) || 0 })
                  }
                />
              </FieldRow>
              <FieldRow label="Deadline">
                <FtInput
                  type="date"
                  value={goalForm.deadline}
                  onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="Assigned To">
                <FtSelect
                  value={goalForm.assignedTo}
                  onChange={(e) => setGoalForm({ ...goalForm, assignedTo: e.target.value })}
                >
                  <option value="shared">Shared</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </FtSelect>
              </FieldRow>
              <FieldRow label="Emoji">
                <FtInput
                  value={goalForm.emoji}
                  onChange={(e) => setGoalForm({ ...goalForm, emoji: e.target.value })}
                  placeholder="🏠"
                  style={{ width: 60 }}
                />
              </FieldRow>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                variant="accent"
                onClick={submitGoalForm}
                disabled={!goalForm.name.trim() || goalForm.targetAmount <= 0}
              >
                <Check size={11} />
                Add Goal
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setShowAddGoal(false);
                  setGoalForm(emptyGoalForm);
                }}
              >
                <X size={11} />
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </section>

      {/* ── 6. HOUSEHOLD BUDGET ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader
          label="Household Budget"
          accentColor="var(--ft-blue)"
          count={budgets.length}
          action={
            <Btn variant="accent" size="xs" onClick={() => setShowAddBudget(true)}>
              <Plus size={10} />
              Add Category
            </Btn>
          }
        />

        {budgets.length === 0 && !showAddBudget ? (
          <EmptyPanel
            icon={TrendingUp}
            text="No budget categories defined."
            subtext="Add categories like Groceries or Rent, assign them to members, and track monthly spend vs. limit."
            cta="Add Budget Category"
            onCta={() => setShowAddBudget(true)}
          />
        ) : (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div className="ft-scroll-x">
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 120px 90px 200px",
                gap: 0,
                borderBottom: "2px solid var(--ft-border2)",
                background: "var(--ft-raised)",
                minWidth: 560,
              }}
            >
              {["Category", "Budget", "Spent", "Used", "Assigned To"].map((h) => (
                <BudgetHeaderCell key={h} label={h} />
              ))}
            </div>

            {budgets.map((b, idx) => {
              const catKey = b.category.toLowerCase();
              const actual = actualSpendByCategory[catKey] ?? 0;
              const pct = b.monthlyLimit > 0 ? actual / b.monthlyLimit : 0;
              const barCol = pct >= 1 ? "var(--ft-red)" : pct >= 0.8 ? "var(--ft-amber)" : "var(--ft-green)";
              return (
                <BudgetRow
                  key={b.id}
                  b={b}
                  idx={idx}
                  budgetsLength={budgets.length}
                  actual={actual}
                  pct={pct}
                  barCol={barCol}
                  members={members}
                  onDelete={() => deleteBudget(b.id)}
                  onUpdateAssignment={(val) => updateBudgetAssignment(b.id, val)}
                />
              );
            })}
            </div>{/* /ft-scroll-x */}
          </div>
        )}

        {/* Add budget form */}
        {showAddBudget && (
          <div
            style={{
              marginTop: 10,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--ft-muted)",
                letterSpacing: "0.06em",
                marginBottom: 12,
              }}
            >
              New Budget Category
            </div>
            <div
              className="ft-three-col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <FieldRow label="Category">
                <FtInput
                  value={budgetForm.category}
                  onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}
                  placeholder="e.g. Groceries"
                />
              </FieldRow>
              <FieldRow label="Monthly Limit (£)">
                <FtInput
                  type="number"
                  min={0}
                  value={budgetForm.monthlyLimit || ""}
                  onChange={(e) =>
                    setBudgetForm({ ...budgetForm, monthlyLimit: parseFloat(e.target.value) || 0 })
                  }
                />
              </FieldRow>
              <FieldRow label="Assigned To">
                <FtSelect
                  value={budgetForm.assignedTo}
                  onChange={(e) => setBudgetForm({ ...budgetForm, assignedTo: e.target.value })}
                >
                  <option value="shared">Shared</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </FtSelect>
              </FieldRow>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                variant="accent"
                onClick={submitBudgetForm}
                disabled={!budgetForm.category.trim() || budgetForm.monthlyLimit <= 0}
              >
                <Check size={11} />
                Add Budget
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setShowAddBudget(false);
                  setBudgetForm(emptyBudgetForm);
                }}
              >
                <X size={11} />
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </section>

      {/* ── 7. FAMILY TIMELINE ───────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHeader
          label="Family Timeline"
          accentColor="var(--ft-cyan)"
          count={timeline.length}
          action={
            <Btn variant="accent" size="xs" onClick={() => setShowAddTimeline(true)}>
              <Plus size={10} />
              Add Entry
            </Btn>
          }
        />

        {timeline.length === 0 && !showAddTimeline ? (
          <EmptyPanel
            icon={CalendarDays}
            text="No upcoming events."
            subtext="Track goal deadlines, bill renewal dates, and household milestones in one timeline."
            cta="Add Timeline Entry"
            onCta={() => setShowAddTimeline(true)}
          />
        ) : (
          <VStack gap={0}>
            {timeline.map((entry, idx) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                idx={idx}
                total={timeline.length}
                onDelete={deleteTimelineEntry}
              />
            ))}
          </VStack>
        )}

        {/* Add timeline form */}
        {showAddTimeline && (
          <div
            style={{
              marginTop: 10,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--ft-muted)",
                letterSpacing: "0.06em",
                marginBottom: 12,
              }}
            >
              New Timeline Entry
            </div>
            <div
              className="ft-four-col"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <FieldRow label="Date">
                <FtInput
                  type="date"
                  value={timelineForm.date}
                  onChange={(e) => setTimelineForm({ ...timelineForm, date: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="Event Name">
                <FtInput
                  value={timelineForm.eventName}
                  onChange={(e) =>
                    setTimelineForm({ ...timelineForm, eventName: e.target.value })
                  }
                  placeholder="e.g. Mortgage renewal"
                />
              </FieldRow>
              <FieldRow label="Type">
                <FtSelect
                  value={timelineForm.type}
                  onChange={(e) =>
                    setTimelineForm({
                      ...timelineForm,
                      type: e.target.value as TimelineEntry["type"],
                    })
                  }
                >
                  <option value="personal">Personal</option>
                  <option value="goal">Goal</option>
                  <option value="bill">Bill</option>
                </FtSelect>
              </FieldRow>
              <FieldRow label="Amount (£) — optional">
                <FtInput
                  type="number"
                  min={0}
                  value={timelineForm.amount}
                  onChange={(e) =>
                    setTimelineForm({ ...timelineForm, amount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </FieldRow>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                variant="accent"
                onClick={submitTimelineForm}
                disabled={!timelineForm.date || !timelineForm.eventName.trim()}
              >
                <Check size={11} />
                Add Entry
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setShowAddTimeline(false);
                  setTimelineForm(emptyTimelineForm);
                }}
              >
                <X size={11} />
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
