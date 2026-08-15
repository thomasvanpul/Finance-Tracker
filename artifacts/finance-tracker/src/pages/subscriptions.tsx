import { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useListTransactions,
  useListSubscriptions, useCreateSubscription, useUpdateSubscription, useDeleteSubscription,
  useListDismissedSubscriptions, useDismissSubscription,
  getListSubscriptionsQueryKey, getListDismissedSubscriptionsQueryKey,
  useGetDashboard,
} from "@workspace/api-client-react";
import { loadPersonaIds } from "@/lib/persona";
import { useQueryClient } from "@tanstack/react-query";
import { formatGbp } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { CreditCard, Plus, Trash2, Edit2, AlertTriangle, TrendingUp, Calendar } from "lucide-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

type SubFrequency = "weekly" | "monthly" | "quarterly" | "annual";
type SubStatus = "active" | "paused" | "cancelled";

interface Subscription {
  id: number;
  name: string;
  amount: number;
  currency: string;
  frequency: SubFrequency;
  category: string;
  nextDue?: string;
  startDate: string;
  active: boolean;
  notes?: string;
  manuallyAdded: boolean;
}

interface SubForm {
  name: string;
  amount: string;
  currency: string;
  frequency: SubFrequency;
  category: string;
  nextDue: string;
  notes: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<SubFrequency, string> = {
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  annual: "ANNUAL",
};

const FREQ_DAYS: Record<SubFrequency, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

const SUB_CATEGORIES = [
  "Streaming", "Music", "Software", "Gaming", "Cloud Storage",
  "News & Media", "Fitness", "Food Delivery", "Finance", "Productivity",
  "Security", "Education", "Shopping", "Utilities", "Other",
];

const CHART_COLORS = [
  "var(--ft-blue)", "var(--ft-green)", "var(--ft-amber)", "var(--ft-cyan)",
  "var(--ft-accent)", "#79C0FF", "#56D364", "#FF7B72", "#D2A8FF", "#E3B341",
  "#FF6E40", "#4ECDC4", "#95E1D3", "#F38181",
];

const EMPTY_FORM: SubForm = {
  name: "", amount: "", currency: "GBP", frequency: "monthly",
  category: "Streaming", nextDue: "", notes: "",
};

const TH: React.CSSProperties = {
  padding: "5px 10px", fontSize: 9, fontWeight: 600, color: "var(--ft-dim)",
  background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const,
  letterSpacing: "0.06em", whiteSpace: "nowrap" as const, fontFamily: "var(--font-mono)",
};

// ── Sub-component types (declared early for use in row components) ────────────

interface SubRowProps {
  sub: Subscription & { daysAway?: number | null };
  last?: { date: string; amount: number; prevAmount: number | null };
  deleteConfirmId: number | null;
  freqColor: Record<SubFrequency, string>;
  onEdit: (sub: Subscription) => void;
  onDelete: (id: number) => void;
  onToggleActive: (id: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMonthly(amount: number, freq: SubFrequency): number {
  switch (freq) {
    case "weekly": return amount * (52 / 12);
    case "monthly": return amount;
    case "quarterly": return amount / 3;
    case "annual": return amount / 12;
  }
}

function toAnnual(amount: number, freq: SubFrequency): number {
  switch (freq) {
    case "weekly": return amount * 52;
    case "monthly": return amount * 12;
    case "quarterly": return amount * 4;
    case "annual": return amount;
  }
}

function nextDueDate(lastDate: string, freq: SubFrequency): string {
  const d = new Date(lastDate);
  switch (freq) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "annual": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntilDate(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Days-until badge ──────────────────────────────────────────────────────────

function DaysUntilBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntilDate(dateStr);
  let color: string;
  let bg: string;
  let border: string;
  let label: string;

  if (days < 0) {
    color = "var(--ft-red)";
    bg = "rgba(255,123,114,0.12)";
    border = "1px solid rgba(255,123,114,0.3)";
    label = "OVERDUE";
  } else if (days === 0) {
    color = "var(--ft-red)";
    bg = "rgba(255,123,114,0.15)";
    border = "1px solid rgba(255,123,114,0.4)";
    label = "TODAY";
  } else if (days <= 7) {
    color = "var(--ft-red)";
    bg = "rgba(255,123,114,0.1)";
    border = "1px solid rgba(255,123,114,0.25)";
    label = `${days}d`;
  } else if (days <= 30) {
    color = "var(--ft-amber)";
    bg = "rgba(230,180,80,0.1)";
    border = "1px solid rgba(230,180,80,0.25)";
    label = `${days}d`;
  } else {
    color = "var(--ft-green)";
    bg = "rgba(86,211,100,0.08)";
    border = "1px solid rgba(86,211,100,0.2)";
    label = `${days}d`;
  }

  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: "0.05em",
      padding: "2px 5px",
      background: bg,
      border,
      color,
      whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

// ── Detection logic ───────────────────────────────────────────────────────────

interface DetectedCandidate {
  description: string;
  transactions: Array<{ date: string; gbpValue: number }>;
  avgAmount: number;
  monthCount: number;
}

function detectRecurring(
  txs: Array<{ description: string; date: string; gbpValue: number; type: string }>,
  dismissed: string[],
): DetectedCandidate[] {
  const groups = new Map<string, Array<{ date: string; gbpValue: number }>>();
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const key = tx.description.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ date: tx.date, gbpValue: tx.gbpValue });
  }

  const candidates: DetectedCandidate[] = [];

  for (const [key, entries] of groups.entries()) {
    const origDesc = txs.find(t => t.description.toLowerCase().trim() === key)?.description ?? key;
    if (dismissed.includes(origDesc)) continue;
    if (entries.length < 3) continue;
    const months = new Set(entries.map(e => e.date.slice(0, 7)));
    if (months.size < 2) continue;
    const sorted = [...entries].sort((a, b) => a.gbpValue - b.gbpValue);
    const median = sorted[Math.floor(sorted.length / 2)].gbpValue;
    if (median <= 0) continue;
    const allWithinRange = entries.every(e => Math.abs(e.gbpValue - median) / median <= 0.10);
    if (!allWithinRange) continue;
    const avgAmount = entries.reduce((s, e) => s + e.gbpValue, 0) / entries.length;
    candidates.push({
      description: origDesc,
      transactions: [...entries].sort((a, b) => b.date.localeCompare(a.date)),
      avgAmount,
      monthCount: months.size,
    });
  }

  return candidates.sort((a, b) => b.transactions.length - a.transactions.length).slice(0, 20);
}

// ── SubRow ────────────────────────────────────────────────────────────────────

function SubRow({ sub, last, deleteConfirmId, freqColor, onEdit, onDelete, onToggleActive }: SubRowProps) {
  const [hov, setHov] = useState(false);
  const isMobile = useIsMobile();
  const priceIncreased = last?.prevAmount != null && last.amount > last.prevAmount * 1.02;
  const priceDiff = priceIncreased && last?.prevAmount ? last.amount - last.prevAmount : 0;
  const pricePct = priceIncreased && last?.prevAmount ? ((last.amount - last.prevAmount) / last.prevAmount) * 100 : 0;
  const estimatedNext = last ? nextDueDate(last.date, sub.frequency) : (sub.nextDue ?? "");
  const status: SubStatus = sub.active ? "active" : "paused";
  const statusColor = status === "active" ? "var(--ft-green)" : "var(--ft-dim)";
  const statusBg = status === "active" ? "rgba(63,185,80,0.1)" : "var(--ft-raised)";
  const statusBorder = status === "active" ? "1px solid rgba(63,185,80,0.25)" : "1px solid var(--ft-border2)";
  let nextDueColor = "var(--ft-muted)";
  let nextDueWeight: number | undefined = undefined;
  if (estimatedNext) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueDate = new Date(estimatedNext); dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) { nextDueColor = "var(--ft-red)"; nextDueWeight = 700; }
    else if (diffDays <= 7) { nextDueColor = "var(--ft-red)"; nextDueWeight = 700; }
    else if (diffDays <= 30) { nextDueColor = "var(--ft-amber)"; }
  }

  if (isMobile) {
    return (
      <div>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr auto",
          alignItems: "start", gap: 0,
          background: "var(--ft-surface)",
          borderBottom: "1px solid var(--ft-border2)",
          borderLeft: `3px solid ${status === "active" ? "var(--ft-green)" : "var(--ft-border2)"}`,
          padding: "9px 10px 9px 12px",
        }}>
          <div style={{ minWidth: 0 }}>
            <HStack gap={6} align="center" marginBottom={3}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sub.name}
              </span>
            </HStack>
            <HStack gap={6} align="center" marginBottom={4}>
              <Text as="span" mono size={10} color="var(--ft-dim)">{sub.category}</Text>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "0px 4px", background: `${freqColor[sub.frequency]}18`, color: freqColor[sub.frequency], letterSpacing: "0.04em", fontWeight: 700 }}>
                {FREQ_LABELS[sub.frequency]}
              </span>
            </HStack>
            {estimatedNext && (
              <HStack gap={5} align="center">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: nextDueColor, fontWeight: nextDueWeight }}>
                  Next: {formatDateShort(estimatedNext)}
                </span>
                <DaysUntilBadge dateStr={estimatedNext} />
              </HStack>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, paddingLeft: 8, flexShrink: 0 }}>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>
              {formatGbp(toMonthly(sub.amount, sub.frequency))}<Text as="span" mono size={9} weight={400} color="var(--ft-dim)">/mo</Text>
            </span>
            <HStack gap={4} align="center">
              <button onClick={() => onToggleActive(sub.id)}
                style={{ padding: "1px 5px", fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)", background: statusBg, color: statusColor, border: statusBorder, cursor: "pointer" }}>
                {status.toUpperCase()}
              </button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(sub)}>
                <Edit2 className="w-3 h-3" style={{ color: "var(--ft-muted)" }} />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(sub.id)}
                style={deleteConfirmId === sub.id ? { background: "var(--ft-red)", color: "#fff" } : undefined}>
                {deleteConfirmId === sub.id
                  ? <Text as="span" mono size={7} weight={700}>DEL?</Text>
                  : <Trash2 className="w-3 h-3" style={{ color: "var(--ft-red)" }} />}
              </Button>
            </HStack>
          </div>
        </div>
        {priceIncreased && (
          <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: "1px solid rgba(230,162,60,0.2)", background: "rgba(230,162,60,0.06)", color: "var(--ft-amber)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span>↑ {formatGbp(last!.prevAmount!)} → {formatGbp(last!.amount)} (+{pricePct.toFixed(1)}%)</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div className="flex items-center border-b" style={{
        borderColor: "rgba(33,38,45,0.5)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-base))" : "var(--ft-base)",
        transition: "background 0.1s",
      }}>
        <div style={{ flex: 1, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</span>
          {sub.notes && <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>· {sub.notes}</span>}
        </div>
        <div style={{ width: 110, minWidth: 110, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>{sub.category}</div>
        <div style={{ width: 100, minWidth: 100, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-dim)", fontSize: 10 }}>
          <span className="pnum">{sub.currency !== "GBP" ? `${sub.currency} ` : ""}{sub.amount.toFixed(2)}</span>
        </div>
        <div style={{ width: 95, minWidth: 95, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>
          <span className="pnum">{formatGbp(toMonthly(sub.amount, sub.frequency))}</span>
        </div>
        <div style={{ width: 100, minWidth: 100, padding: "6px 10px", borderRight: "1px solid var(--ft-border)" }}>
          <span style={{ padding: "1px 4px", borderRadius: 2, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)", background: `${freqColor[sub.frequency]}18`, color: freqColor[sub.frequency], letterSpacing: "0.04em" }}>
            {FREQ_LABELS[sub.frequency]}
          </span>
        </div>
        <div style={{ width: 110, minWidth: 110, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 11, color: last ? "var(--ft-muted)" : "var(--ft-dim)" }}>
          {last ? formatDateShort(last.date) : "No data"}
        </div>
        <div style={{ width: 130, minWidth: 130, padding: "5px 8px", borderRight: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 5 }}>
          {estimatedNext ? (
            <>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: nextDueColor, fontWeight: nextDueWeight }}>
                {formatDateShort(estimatedNext)}
              </span>
              <DaysUntilBadge dateStr={estimatedNext} />
            </>
          ) : (
            <Text as="span" mono size={11} color="var(--ft-dim)">—</Text>
          )}
        </div>
        <div style={{ width: 90, minWidth: 90, padding: "6px 10px", borderRight: "1px solid var(--ft-border)" }}>
          <button
            onClick={() => onToggleActive(sub.id)}
            style={{ padding: "1px 5px", borderRadius: 2, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)", background: statusBg, color: statusColor, border: statusBorder, cursor: "pointer" }}
          >
            {status.toUpperCase()}
          </button>
        </div>
        <div style={{ width: 90, minWidth: 90, padding: "4px 6px", display: "flex", justifyContent: "flex-end", gap: 2 }}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(sub)}>
            <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => onDelete(sub.id)}
            title={deleteConfirmId === sub.id ? "Click again to confirm delete" : "Delete subscription"}
            style={deleteConfirmId === sub.id ? { background: "var(--ft-red)", color: "#fff" } : undefined}
          >
            {deleteConfirmId === sub.id
              ? <Text as="span" mono size={8} weight={700}>DEL?</Text>
              : <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />}
          </Button>
        </div>
      </div>
      {priceIncreased && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs" style={{ borderColor: "rgba(230,162,60,0.2)", background: "rgba(230,162,60,0.06)", color: "var(--ft-amber)", fontFamily: "var(--font-mono)" }}>
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>Price increased: <span className="pnum">{formatGbp(last!.prevAmount!)}</span> → <span className="pnum">{formatGbp(last!.amount)}</span> (<span className="pnum">+{pricePct.toFixed(1)}% / +{formatGbp(priceDiff)}</span>)</span>
        </div>
      )}
    </div>
  );
}

// ── RenewalRow ────────────────────────────────────────────────────────────────

function RenewalRow({ sub }: { sub: Subscription & { daysAway: number | null } }) {
  const [hov, setHov] = useState(false);
  const isMobile = useIsMobile();
  const hasDate = sub.nextDue !== undefined && sub.nextDue !== null && sub.nextDue !== "";

  if (isMobile) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderBottom: "1px solid var(--ft-border)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</div>
          <HStack gap={6} align="center" marginTop={2}>
            <Text as="span" mono size={10} color="var(--ft-muted)">
              {hasDate ? formatDateShort(sub.nextDue!) : "—"}
            </Text>
            {hasDate && <DaysUntilBadge dateStr={sub.nextDue!} />}
          </HStack>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", textAlign: "right", flexShrink: 0 }}>
          <span className="pnum">{formatGbp(sub.amount)}</span>
          <div style={{ fontSize: 9, color: "var(--ft-dim)", fontWeight: 400 }}>{FREQ_LABELS[sub.frequency]}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 130px 60px 100px",
        padding: "7px 14px", borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</div>
      <Text as="div" mono size={11} color="var(--ft-muted)">
        {hasDate ? formatDateShort(sub.nextDue!) : "—"}
      </Text>
      <div>
        {hasDate && <DaysUntilBadge dateStr={sub.nextDue!} />}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", textAlign: "right" }}>
        <span className="pnum">{formatGbp(sub.amount)}</span>{" "}
        <Text as="span" size={9} weight={400} color="var(--ft-dim)">{FREQ_LABELS[sub.frequency]}</Text>
      </div>
    </div>
  );
}

// ── ThisWeekRenewalCard ───────────────────────────────────────────────────────

interface ThisWeekRenewalCardProps {
  sub: Subscription & { daysAway: number };
  isLast: boolean;
}

function ThisWeekRenewalCard({ sub, isLast }: ThisWeekRenewalCardProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderRight: !isLast ? "1px solid rgba(255,123,114,0.15)" : "none",
        minWidth: 200,
        flex: "1 1 200px",
        background: hov ? "rgba(255,123,114,0.07)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>{formatDateShort(sub.nextDue!)}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(sub.amount)}</div>
        <DaysUntilBadge dateStr={sub.nextDue!} />
      </div>
    </div>
  );
}

// ── CandidateRow ──────────────────────────────────────────────────────────────

interface CandidateRowProps {
  c: DetectedCandidate;
  onConfirm: (c: DetectedCandidate) => void;
  onDismiss: (desc: string) => void;
}

function CandidateRow({ c, onConfirm, onDismiss }: CandidateRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-3 px-3 py-2.5"
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-cyan) 4%, var(--ft-base))" : "var(--ft-base)",
        transition: "background 0.1s",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--ft-text)" }}>{c.description}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--ft-dim)" }}>
          avg <span className="pnum">{formatGbp(c.avgAmount)}</span> · {c.transactions.length} charges · {c.monthCount} months
          {c.transactions[0] && ` · last ${formatDateShort(c.transactions[0].date)}`}
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => onConfirm(c)}
        style={{ background: "rgba(34,211,238,0.12)", color: "var(--ft-cyan)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 2, fontSize: 11, height: 26, padding: "0 10px" }}
      >
        Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onDismiss(c.description)}
        style={{ color: "var(--ft-dim)", fontSize: 11, height: 26, padding: "0 8px" }}
      >
        Dismiss
      </Button>
    </div>
  );
}

// ── CancelCandidateRow ────────────────────────────────────────────────────────

interface CancelCandidateRowProps {
  sub: Subscription;
  days: number;
  onToggleActive: (id: number) => void;
  onDelete: (id: number) => void;
}

function CancelCandidateRow({ sub, days, onToggleActive, onDelete }: CancelCandidateRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-3 px-3 py-1.5"
      style={{
        background: hov ? "rgba(230,162,60,0.08)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div className="flex-1 min-w-0">
        <HStack gap={6} align="center" minWidth0>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{sub.name}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", whiteSpace: "nowrap", flexShrink: 0 }}>
            Last used {days}d ago
          </span>
        </HStack>
      </div>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", flexShrink: 0, whiteSpace: "nowrap" }}>{formatGbp(toMonthly(sub.amount, sub.frequency))}/mo</span>
      <button
        onClick={() => onToggleActive(sub.id)}
        style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", padding: "2px 8px", background: "transparent", color: "var(--ft-red)", border: "1px solid var(--ft-red)", cursor: "pointer", flexShrink: 0 }}
      >
        PAUSE
      </button>
      <button
        onClick={() => onDelete(sub.id)}
        style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", padding: "2px 8px", background: "var(--ft-red)", color: "#fff", border: "none", cursor: "pointer", flexShrink: 0 }}
      >
        CANCEL
      </button>
    </div>
  );
}

// ── OpportunityCostCell ───────────────────────────────────────────────────────

interface OpportunityCostCellProps {
  label: string;
  val: number;
  deposited: number;
  gain: number;
}

function OpportunityCostCell({ label, val, deposited, gain }: OpportunityCostCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="px-5 py-4 text-center"
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-green) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div className="text-xs mb-2" style={{ color: "var(--ft-dim)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>{label}</div>
      <div className="pnum font-mono font-bold" style={{ fontSize: 20, color: "var(--ft-green)", lineHeight: 1 }}>
        {formatGbp(Math.round(val))}
      </div>
      <div className="pnum text-xs mt-1.5" style={{ color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>
        +{formatGbp(Math.round(gain))} growth
      </div>
      <div className="pnum text-xs mt-0.5" style={{ color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
        {formatGbp(Math.round(deposited))} deposited
      </div>
    </div>
  );
}

// ── PieLegendItem ─────────────────────────────────────────────────────────────

interface PieLegendItemProps {
  name: string;
  colorIndex: number;
}

function PieLegendItem({ name, colorIndex }: PieLegendItemProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-1 text-xs"
      style={{
        color: hov ? "var(--ft-text)" : "var(--ft-muted)",
        transition: "color 0.1s",
        cursor: "default",
      }}
    >
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[colorIndex % CHART_COLORS.length], flexShrink: 0 }} />
      {name}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const queryClient = useQueryClient();
  const { data: txs } = useListTransactions({});
  const { data: dashData } = useGetDashboard();

  const { data: rawSubs = [] } = useListSubscriptions();
  const subs: Subscription[] = rawSubs.map(s => ({
    id: s.id,
    name: s.name,
    amount: s.amount,
    currency: s.currency,
    frequency: s.frequency as SubFrequency,
    category: s.category,
    nextDue: s.nextDue ?? undefined,
    startDate: s.startDate,
    active: s.active,
    notes: s.notes ?? undefined,
    manuallyAdded: s.manuallyAdded,
  }));

  const { data: dismissed = [] } = useListDismissedSubscriptions();
  const createSubMutation = useCreateSubscription();
  const updateSubMutation = useUpdateSubscription();
  const deleteSubMutation = useDeleteSubscription();
  const dismissMutation = useDismissSubscription();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SubForm>(EMPTY_FORM);
  const [searchText, setSearchText] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");
  const [sortSubs, setSortSubs] = useState<"name" | "monthly-high" | "monthly-low" | "next-due">("next-due");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const isMobile = useIsMobile();

  // ── Detection ──
  const detected = useMemo((): DetectedCandidate[] => {
    if (!txs) return [];
    return detectRecurring(
      txs.map(t => ({ description: t.description, date: t.date, gbpValue: t.gbpValue, type: t.type })),
      dismissed,
    );
  }, [txs, dismissed]);

  const confirmedNames = new Set(subs.map(s => s.name.toLowerCase().trim()));
  const unconfirmedCandidates = detected.filter(
    d => !confirmedNames.has(d.description.toLowerCase().trim()),
  );

  // ── Last transaction per sub ──
  const lastTxByName = useMemo(() => {
    const map = new Map<number, { date: string; amount: number; prevAmount: number | null }>();
    if (!txs) return map;
    for (const sub of subs) {
      const matches = txs
        .filter(t => t.description.toLowerCase().includes(sub.name.toLowerCase()) && t.type === "expense")
        .sort((a, b) => b.date.localeCompare(a.date));
      if (matches.length > 0) {
        map.set(sub.id, {
          date: matches[0].date,
          amount: matches[0].gbpValue,
          prevAmount: matches.length > 1 ? matches[1].gbpValue : null,
        });
      }
    }
    return map;
  }, [txs, subs]);

  // ── Summary numbers ──
  const activeSubs = useMemo(() => subs.filter(s => s.active), [subs]);
  const totalMonthly = useMemo(
    () => activeSubs.reduce((s, sub) => s + toMonthly(sub.amount, sub.frequency), 0),
    [activeSubs],
  );
  const totalAnnual = useMemo(
    () => activeSubs.reduce((s, sub) => s + toAnnual(sub.amount, sub.frequency), 0),
    [activeSubs],
  );

  const couldSave = useMemo(() => {
    return activeSubs
      .filter(s => {
        const last = lastTxByName.get(s.id);
        if (!last) return false;
        return daysSince(last.date) > 60;
      })
      .reduce((sum, s) => sum + toMonthly(s.amount, s.frequency), 0);
  }, [activeSubs, lastTxByName]);

  const cancelCandidates = useMemo(() => {
    return activeSubs.filter(s => {
      const last = lastTxByName.get(s.id);
      if (!last) return false;
      return daysSince(last.date) > 45;
    });
  }, [activeSubs, lastTxByName]);

  // ── Renewals in next 7 days ──
  const renewingThisWeek = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(today.getDate() + 7);
    const todayStr = today.toISOString().slice(0, 10);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return activeSubs
      .filter(s => s.nextDue && s.nextDue >= todayStr && s.nextDue <= cutoffStr)
      .sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""))
      .map(s => ({
        ...s,
        daysAway: Math.round((new Date(s.nextDue!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      }));
  }, [activeSubs]);

  // ── Renewals in next 30 days ──
  const upcomingRenewals = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(today.getDate() + 30);
    const todayStr = today.toISOString().slice(0, 10);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return activeSubs
      .filter(s => s.nextDue && s.nextDue >= todayStr && s.nextDue <= cutoffStr)
      .sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""))
      .map(s => {
        const daysAway = Math.round((new Date(s.nextDue!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...s, daysAway };
      });
  }, [activeSubs]);

  // ── Pie chart data ──
  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    for (const sub of activeSubs) {
      const val = toMonthly(sub.amount, sub.frequency);
      map.set(sub.category, (map.get(sub.category) ?? 0) + val);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [activeSubs]);

  // ── Projected 12-month stacked area ──
  const projectedData = useMemo(() => {
    const months: Array<{ month: string; cost: number }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
      let cost = 0;
      for (const sub of activeSubs) {
        switch (sub.frequency) {
          case "weekly": cost += sub.amount * (52 / 12); break;
          case "monthly": cost += sub.amount; break;
          case "quarterly":
            if (i % 3 === 0) cost += sub.amount; break;
          case "annual":
            if (i === 0) cost += sub.amount; break;
        }
      }
      months.push({ month: label, cost: Math.round(cost * 100) / 100 });
    }
    return months;
  }, [activeSubs]);

  // ── Group subscriptions by renewal bucket ──
  const subsByRenewalGroup = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const groups: Array<{ label: string; color: string; subs: (Subscription & { daysAway: number | null })[] }> = [
      { label: "This Week", color: "var(--ft-red)", subs: [] },
      { label: "This Month", color: "var(--ft-amber)", subs: [] },
      { label: "Later", color: "var(--ft-green)", subs: [] },
      { label: "No Date Set", color: "var(--ft-dim)", subs: [] },
    ];

    for (const sub of activeSubs) {
      const withDays = { ...sub, daysAway: null as number | null };
      if (!sub.nextDue) {
        groups[3].subs.push(withDays);
        continue;
      }
      const daysAway = Math.round((new Date(sub.nextDue).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      withDays.daysAway = daysAway;
      if (daysAway <= 7) groups[0].subs.push(withDays);
      else if (daysAway <= 30) groups[1].subs.push(withDays);
      else groups[2].subs.push(withDays);
    }

    for (const g of groups) {
      g.subs.sort((a, b) => (a.daysAway ?? 9999) - (b.daysAway ?? 9999));
    }

    return groups.filter(g => g.subs.length > 0);
  }, [activeSubs]);

  // ── CRUD helpers ──
  const setField = <K extends keyof SubForm>(k: K, v: SubForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListDismissedSubscriptionsQueryKey() });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSubMutation.mutateAsync({
      data: {
        name: form.name,
        amount: parseFloat(form.amount),
        currency: form.currency,
        frequency: form.frequency,
        category: form.category,
        nextDue: form.nextDue || undefined,
        startDate: new Date().toISOString().slice(0, 10),
        active: true,
        notes: form.notes || undefined,
        manuallyAdded: true,
      },
    });
    invalidate();
    setAddOpen(false);
    setForm(EMPTY_FORM);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    await updateSubMutation.mutateAsync({
      id: editId,
      data: {
        name: form.name,
        amount: parseFloat(form.amount),
        currency: form.currency,
        frequency: form.frequency,
        category: form.category,
        nextDue: form.nextDue || null,
        notes: form.notes || null,
      },
    });
    invalidate();
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const openEdit = (sub: Subscription) => {
    setForm({
      name: sub.name,
      amount: String(sub.amount),
      currency: sub.currency,
      frequency: sub.frequency,
      category: sub.category,
      nextDue: sub.nextDue ?? "",
      notes: sub.notes ?? "",
    });
    setEditId(sub.id);
  };

  const deleteSub = async (id: number) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    setDeleteConfirmId(null);
    await deleteSubMutation.mutateAsync({ id });
    invalidate();
  };

  const toggleActive = async (id: number) => {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;
    await updateSubMutation.mutateAsync({ id, data: { active: !sub.active } });
    invalidate();
  };

  const confirmCandidate = async (candidate: DetectedCandidate) => {
    await createSubMutation.mutateAsync({
      data: {
        name: candidate.description,
        amount: Math.round(candidate.avgAmount * 100) / 100,
        currency: "GBP",
        frequency: "monthly",
        category: "Other",
        startDate: candidate.transactions[candidate.transactions.length - 1]?.date ?? new Date().toISOString().slice(0, 10),
        active: true,
        manuallyAdded: false,
      },
    });
    invalidate();
  };

  const dismissCandidate = async (desc: string) => {
    await dismissMutation.mutateAsync({ data: { description: desc } });
    invalidate();
  };

  const FormFields = (
    <div className="space-y-4">
      <div className="ft-two-col grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sub-name">Name</Label>
          <Input id="sub-name" placeholder="Netflix" value={form.name} onChange={e => setField("name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-cat">Category</Label>
          <Select value={form.category} onValueChange={v => setField("category", v)}>
            <SelectTrigger id="sub-cat" style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
              {SUB_CATEGORIES.map(c => <SelectItem key={c} value={c} style={{ color: "var(--ft-text)", fontSize: 12 }}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="ft-three-col grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sub-amount">Amount</Label>
          <Input id="sub-amount" type="number" step="0.01" min="0" placeholder="9.99" value={form.amount} onChange={e => setField("amount", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-cur">Currency</Label>
          <Select value={form.currency} onValueChange={v => setField("currency", v)}>
            <SelectTrigger id="sub-cur" style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
              {["GBP", "USD", "EUR"].map(c => <SelectItem key={c} value={c} style={{ color: "var(--ft-text)", fontSize: 12 }}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-freq">Frequency</Label>
          <Select value={form.frequency} onValueChange={v => setField("frequency", v as SubFrequency)}>
            <SelectTrigger id="sub-freq" style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)" }}>
              {(["weekly", "monthly", "quarterly", "annual"] as SubFrequency[]).map(f => (
                <SelectItem key={f} value={f} style={{ color: "var(--ft-text)", fontSize: 12 }}>{FREQ_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="ft-two-col grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sub-next">Next Due Date (optional)</Label>
          <Input id="sub-next" type="date" value={form.nextDue} onChange={e => setField("nextDue", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-notes">Notes (optional)</Label>
          <Input id="sub-notes" placeholder="e.g. family plan" value={form.notes} onChange={e => setField("notes", e.target.value)} />
        </div>
      </div>
    </div>
  );

  const allCategories = useMemo(() => [...new Set(subs.map(s => s.category))].sort(), [subs]);

  const filteredSubs = useMemo(() => {
    let result = [...subs];
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q));
    }
    if (filterCategory !== "all") result = result.filter(s => s.category === filterCategory);
    if (filterStatus === "active") result = result.filter(s => s.active);
    if (filterStatus === "paused") result = result.filter(s => !s.active);
    switch (sortSubs) {
      case "name": result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "monthly-high": result.sort((a, b) => toMonthly(b.amount, b.frequency) - toMonthly(a.amount, a.frequency)); break;
      case "monthly-low": result.sort((a, b) => toMonthly(a.amount, a.frequency) - toMonthly(b.amount, b.frequency)); break;
      case "next-due": result.sort((a, b) => (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999")); break;
    }
    return result;
  }, [subs, searchText, filterCategory, filterStatus, sortSubs]);

  const hasListFilters = searchText.trim() !== "" || filterCategory !== "all" || filterStatus !== "all" || sortSubs !== "next-due";

  function exportSubsCSV() {
    const header = ["Name", "Category", "Amount", "Currency", "Frequency", "Monthly (GBP)", "Status", "Next Due", "Notes"];
    const rows = subs.map(s => [
      s.name, s.category, s.amount.toFixed(2), s.currency, s.frequency,
      toMonthly(s.amount, s.frequency).toFixed(2),
      s.active ? "Active" : "Paused",
      s.nextDue ?? "",
      s.notes ?? "",
    ].map(v => { const str = String(v); return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str; }).join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "subscriptions.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const freqColor: Record<SubFrequency, string> = {
    weekly: "var(--ft-cyan)",
    monthly: "var(--ft-blue)",
    quarterly: "var(--ft-amber)",
    annual: "var(--ft-accent)",
  };

  const handleOpenEdit = useCallback((sub: Subscription) => openEdit(sub), []);
  const handleToggle = useCallback((id: number) => toggleActive(id), [subs]);
  const handleDeleteSub = useCallback((id: number) => deleteSub(id), [deleteConfirmId]);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={CreditCard}
        title="Subscriptions & Recurring"
        subtitle="Auto-detected recurring charges · manage and track ongoing costs"
        actions={
          <HStack gap={6} align="center">
            <a href="/upcoming" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-muted)", textDecoration: "none", padding: "4px 8px", border: "1px solid var(--ft-border)", background: "transparent" }}>
              → Upcoming
            </a>
            <a href="/calendar" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-muted)", textDecoration: "none", padding: "4px 8px", border: "1px solid var(--ft-border)", background: "transparent" }}>
              → Calendar
            </a>
            <Button
              onClick={exportSubsCSV}
              size="sm"
              variant="ghost"
              style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-cyan)", border: "1px solid var(--ft-cyan)", borderRadius: 2, padding: "0 10px" }}
            >
              ↓ CSV
            </Button>
            <Button
              onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
              size="sm"
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 12 }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />Add Subscription
            </Button>
          </HStack>
        }
        mobileActions={
          <HStack gap={6} align="center">
            <Button
              onClick={exportSubsCSV}
              size="sm"
              variant="ghost"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-cyan)", border: "1px solid var(--ft-cyan)", borderRadius: 2, padding: "0 8px" }}
            >
              ↓ CSV
            </Button>
            <Button
              onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
              size="sm"
              style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 11 }}
            >
              <Plus className="w-3 h-3 mr-1" />+ Add
            </Button>
          </HStack>
        }
      />

      {/* ── Persona context strip ─────────────────────────────────────────── */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const income = (dashData as { thisMonth?: { income?: number } } | undefined)?.thisMonth?.income;
        const pct = income && income > 0 ? Math.round((totalMonthly / income) * 100) : null;
        const msgs: Record<string, string> = {
          market:  `Subscriptions burn £${totalMonthly.toFixed(0)}/mo — cash that could be deployed into positions.`,
          budget:  pct != null ? `Recurring costs are ${pct}% of monthly income — target under 15% for healthy budgets.` : `Track every subscription to reveal your true fixed cost base.`,
          wealth:  `At 7% CAGR, £${totalMonthly.toFixed(0)}/mo in subs foregoes £${(totalMonthly * 12 * 10 * 0.7).toFixed(0)} over 10 years in potential growth.`,
          social:  `Shared subscriptions splitting fairly can cut this £${totalMonthly.toFixed(0)}/mo significantly — log them in Bill Split.`,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", border: "1px solid var(--ft-amber)", background: "color-mix(in srgb, var(--ft-amber) 5%, transparent)", padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "var(--ft-amber)", fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0 }}>INSIGHT</span>
            <Text as="span" color="var(--ft-dim)">{msg}</Text>
            {couldSave > 0 && (
              <span className="pnum" style={{ marginLeft: "auto", flexShrink: 0, color: "var(--ft-green)", fontSize: 9, border: "1px solid var(--ft-green)", padding: "1px 8px" }}>
                £{couldSave.toFixed(0)}/mo cancellable
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Cost Summary KPI Bar — border-as-gap grid ────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "2fr 1fr 1fr 1fr 1fr",
        gap: 1,
        background: "var(--ft-border)",
        border: "1px solid var(--ft-border)",
      }}>
        <div style={{ background: "var(--ft-surface)", padding: "12px 20px", borderTop: "2px solid var(--ft-blue)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Monthly Cost</div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "var(--ft-blue)", lineHeight: 1 }}>{formatGbp(totalMonthly)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>{activeSubs.length} active subscription{activeSubs.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ background: "var(--ft-surface)", padding: "12px 16px", borderTop: "2px solid var(--ft-accent)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Annual Cost</div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-accent)", lineHeight: 1 }}>{formatGbp(totalAnnual)}</div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>{formatGbp(totalMonthly * 12)} projected</div>
        </div>
        <div style={{ background: "var(--ft-surface)", padding: "12px 16px", borderTop: `2px solid ${couldSave > 0 ? "var(--ft-amber)" : "var(--ft-green)"}` }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Could Save / mo</div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: couldSave > 0 ? "var(--ft-amber)" : "var(--ft-green)", lineHeight: 1 }}>{formatGbp(couldSave)}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            {couldSave > 0 ? `${cancelCandidates.length} inactive >60d` : "all subs active"}
          </div>
        </div>
        <div style={{ background: "var(--ft-surface)", padding: "12px 16px", borderTop: `2px solid ${renewingThisWeek.length > 0 ? "var(--ft-red)" : "var(--ft-border2)"}` }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Renewing This Week</div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: renewingThisWeek.length > 0 ? "var(--ft-red)" : "var(--ft-text)", lineHeight: 1 }}>
            {renewingThisWeek.length}
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            {renewingThisWeek.length > 0
              ? formatGbp(renewingThisWeek.reduce((s, sub) => s + sub.amount, 0)) + " due"
              : "nothing due"}
          </div>
        </div>
        <div style={{ background: "var(--ft-surface)", padding: "12px 16px", borderTop: "2px solid var(--ft-border2)", ...(isMobile ? { gridColumn: "span 2" } : {}) }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Renewals (30d)</div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>
            {upcomingRenewals.length}
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 4 }}>
            {formatGbp(upcomingRenewals.reduce((s, sub) => s + sub.amount, 0))} total
          </div>
        </div>
      </div>

      {/* ── Coming Up This Week ─────────────────────────────────────────────── */}
      {renewingThisWeek.length > 0 && (
        <div style={{ border: "1px solid rgba(255,123,114,0.35)", borderTop: "2px solid var(--ft-red)", background: "rgba(255,123,114,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid rgba(255,123,114,0.2)" }}>
            <Calendar size={12} style={{ color: "var(--ft-red)", flexShrink: 0 }} />
            <Text as="span" mono upper size={10} weight={700} color="var(--ft-red)" letterSpacing="0.08em">
              COMING UP THIS WEEK — {renewingThisWeek.length} renewal{renewingThisWeek.length !== 1 ? "s" : ""}
            </Text>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: "auto" }}>
              {formatGbp(renewingThisWeek.reduce((s, sub) => s + sub.amount, 0))} due
            </span>
          </div>
          <HStack gap={0} wrap>
            {renewingThisWeek.map((sub, i) => (
              <ThisWeekRenewalCard
                key={sub.id}
                sub={sub}
                isLast={i === renewingThisWeek.length - 1}
              />
            ))}
          </HStack>
        </div>
      )}

      {/* ── Auto-detected candidates ─────────────────────────────────────── */}
      {unconfirmedCandidates.length > 0 && (
        <div className="border" style={{ borderColor: "var(--ft-border)" }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: "rgba(34,211,238,0.07)", borderColor: "rgba(34,211,238,0.2)", overflow: "hidden" }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ flexShrink: 0, color: "var(--ft-cyan)", fontFamily: "var(--font-mono)" }}>
              ▼ DETECTED RECURRING — {unconfirmedCandidates.length} candidate{unconfirmedCandidates.length !== 1 ? "s" : ""}
            </span>
            <span className="text-xs" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ft-dim)" }}>appeared 3+ times, consistent amounts</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--ft-border)" }}>
            {unconfirmedCandidates.map(c => (
              <CandidateRow
                key={c.description}
                c={c}
                onConfirm={confirmCandidate}
                onDismiss={dismissCandidate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Cancel recommendations ─────────────────────────────────────────── */}
      {cancelCandidates.length > 0 && (
        <div className="border" style={{ borderColor: "var(--ft-amber)", background: "rgba(230,162,60,0.04)" }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "rgba(230,162,60,0.3)" }}>
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--ft-amber)" }} />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--ft-amber)", fontFamily: "var(--font-mono)" }}>
              CONSIDER CANCELLING — {cancelCandidates.length} sub{cancelCandidates.length !== 1 ? "s" : ""} unused &gt;45 days
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(230,162,60,0.15)" }}>
            {cancelCandidates.map(sub => {
              const last = lastTxByName.get(sub.id);
              const days = last ? daysSince(last.date) : 0;
              return (
                <CancelCandidateRow
                  key={sub.id}
                  sub={sub}
                  days={days}
                  onToggleActive={toggleActive}
                  onDelete={deleteSub}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Opportunity cost of inaction ──────────────────────────────────── */}
      {couldSave > 0 && (() => {
        const r = 0.07 / 12;
        const fv = (months: number) => couldSave * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
        const horizons = [
          { label: "5 yr", months: 60 },
          { label: "10 yr", months: 120 },
          { label: "20 yr", months: 240 },
        ];
        return (
          <div className="border" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-raised)" }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--ft-green)" }} />
              <span className="text-xs font-bold uppercase tracking-wide font-mono" style={{ color: "var(--ft-green)" }}>
                Opportunity Cost — invest <span className="pnum">{formatGbp(Math.round(couldSave * 100) / 100)}</span>/mo instead
              </span>
              <span className="text-xs" style={{ color: "var(--ft-dim)" }}>at 7% annual growth</span>
            </div>
            <div className="ft-three-col grid grid-cols-3 divide-x" style={{ borderColor: "var(--ft-border)" }}>
              {horizons.map(({ label, months }) => {
                const val = fv(months);
                const deposited = couldSave * months;
                const gain = val - deposited;
                return (
                  <OpportunityCostCell key={label} label={label} val={val} deposited={deposited} gain={gain} />
                );
              })}
            </div>
            <div className="px-4 py-2 border-t text-xs" style={{ borderColor: "var(--ft-border)", color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              Based on {cancelCandidates.length} subscription{cancelCandidates.length !== 1 ? "s" : ""} unused &gt;45 days · 7% annualised · compounded monthly · illustrative only
            </div>
          </div>
        );
      })()}

      {/* ── Subscription list grouped by renewal date ──────────────────────── */}
      <div style={{ border: "1px solid var(--ft-border)" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "6px 12px 6px 10px", background: "rgba(88,166,255,0.07)", borderBottom: "1px solid rgba(88,166,255,0.18)", gap: 8, borderLeft: "3px solid var(--ft-blue)" }}>
          <Text as="span" mono upper size={10} weight={700} color="var(--ft-blue)" letterSpacing="0.06em">
            ▼ SUBSCRIPTION LIST — {filteredSubs.length}{filteredSubs.length !== subs.length ? ` of ${subs.length}` : ""} total
          </Text>
        </div>

        {/* Filter bar */}
        <div className="ft-filter-bar" style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search subscriptions…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", outline: "none", minWidth: 180 }}
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", cursor: "pointer" }}
          >
            <option value="all">All Categories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as "all" | "active" | "paused")}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", cursor: "pointer" }}
          >
            <option value="all">All Status</option>
            <option value="active">Active only</option>
            <option value="paused">Paused only</option>
          </select>
          <select
            value={sortSubs}
            onChange={e => setSortSubs(e.target.value as typeof sortSubs)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", cursor: "pointer" }}
          >
            <option value="next-due">Sort: Next due</option>
            <option value="monthly-high">Sort: Highest cost</option>
            <option value="monthly-low">Sort: Lowest cost</option>
            <option value="name">Sort: Name A→Z</option>
          </select>
          {hasListFilters && (
            <button
              onClick={() => { setSearchText(""); setFilterCategory("all"); setFilterStatus("all"); setSortSubs("next-due"); }}
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", background: "transparent", border: "1px solid var(--ft-accent)", padding: "3px 8px", cursor: "pointer" }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        <div className={isMobile ? undefined : "overflow-x-auto"}>
          {/* Header */}
          {!isMobile && <div className="flex" style={{ marginLeft: 0 }}>
            {[
              ["NAME", "1"], ["CATEGORY", "110px"], ["AMOUNT", "100px"], ["/MONTH", "95px"],
              ["FREQUENCY", "100px"], ["LAST CHARGE", "110px"], ["NEXT DUE", "130px"],
              ["STATUS", "90px"], ["ACTIONS", "90px"],
            ].map(([h, w]) => (
              <div key={h} style={{
                ...TH,
                flex: w === "1" ? 1 : undefined,
                width: w !== "1" ? w : undefined,
                minWidth: w !== "1" ? w : undefined,
                textAlign: ["AMOUNT", "/MONTH", "ACTIONS"].includes(h as string) ? "right" : "left",
              }}>{h}</div>
            ))}
          </div>}

          {/* Empty states */}
          {subs.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 8 }}>
                NO SUBSCRIPTIONS TRACKED
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", marginBottom: 4 }}>
                Add subscriptions manually or confirm auto-detected candidates above.
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 20, lineHeight: 1.6 }}>
                Tracking recurring charges helps you spot unused services and understand your fixed monthly cost.
              </div>
              <button
                onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
                style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", padding: "8px 24px", cursor: "pointer" }}
              >
                + Add First Subscription
              </button>
            </div>
          )}

          {subs.length > 0 && filteredSubs.length === 0 && (
            <div className="text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>
              No subscriptions match the current filters.
            </div>
          )}

          {filteredSubs.map((sub) => (
            <SubRow
              key={sub.id}
              sub={sub}
              last={lastTxByName.get(sub.id)}
              deleteConfirmId={deleteConfirmId}
              freqColor={freqColor}
              onEdit={handleOpenEdit}
              onDelete={handleDeleteSub}
              onToggleActive={handleToggle}
            />
          ))}
        </div>
      </div>

      {/* ── Renewals grouped by date bucket ─────────────────────────────────── */}
      {subsByRenewalGroup.length > 0 && (
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 8px 11px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", borderLeft: "3px solid var(--ft-accent)" }}>
            <Calendar size={12} style={{ color: "var(--ft-accent)" }} />
            <Text as="span" mono upper size={10} weight={700} color="var(--ft-accent)" letterSpacing="0.08em">
              Renewal Schedule
            </Text>
          </div>
          {subsByRenewalGroup.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px 5px 11px", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)", borderTop: "1px solid var(--ft-border)", borderLeft: `3px solid ${group.color}` }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: group.color }}>{group.label}</span>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                  {group.subs.length} sub{group.subs.length !== 1 ? "s" : ""} · {formatGbp(group.subs.reduce((s, sub) => s + sub.amount, 0))} total
                </span>
              </div>
              {/* Column headers — desktop only */}
              {!isMobile && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 60px 100px", borderBottom: "1px solid var(--ft-border)", padding: "3px 14px" }}>
                  {["Subscription", "Renews", "In", "Amount"].map((h, i) => (
                    <div key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: i === 3 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
              )}
              {group.subs.map((sub) => (
                <RenewalRow key={sub.id} sub={sub} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {activeSubs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pie by category */}
          <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
            <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-blue)", fontFamily: "var(--font-mono)", borderLeft: "3px solid var(--ft-blue)", paddingLeft: 8 }}>Spend by Category</div>
            <div className="text-xs mb-3 pl-3" style={{ color: "var(--ft-dim)" }}>Monthly equivalent · active subscriptions</div>
            {pieData.length === 0 ? (
              <div className="text-center py-6 text-xs" style={{ color: "var(--ft-dim)" }}>No data</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={70} paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [formatGbp(v), "Monthly"]}
                      contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {pieData.map((d, i) => (
                    <PieLegendItem key={i} name={d.name} colorIndex={i} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Projected 12-month area chart */}
          <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
            <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-green)", fontFamily: "var(--font-mono)", borderLeft: "3px solid var(--ft-green)", paddingLeft: 8 }}>Projected Monthly Cost</div>
            <div className="text-xs mb-3 pl-3" style={{ color: "var(--ft-dim)" }}>Next 12 months · annual charges spike in their renewal month</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={projectedData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                <defs>
                  <linearGradient id="subAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--ft-green)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--ft-green)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `£${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`} width={44} />
                <Tooltip
                  formatter={(v: number) => [formatGbp(v), "Cost"]}
                  contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="cost" stroke="var(--ft-green)" strokeWidth={2} fill="url(#subAreaGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Add / Edit dialogs ─────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--ft-text)" }}>Add Subscription</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd}>
            {FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none" }}>Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editId !== null} onOpenChange={open => !open && setEditId(null)}>
        <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--ft-text)" }}>Edit Subscription</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit}>
            {FormFields}
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none" }}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* unused var elimination */}
      {FREQ_DAYS.weekly && null}
    </div>
  );
}
