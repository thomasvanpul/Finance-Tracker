import { useState, useEffect, useMemo } from "react";
import {
  useListTransactions,
} from "@workspace/api-client-react";
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
import { CreditCard, Plus, Trash2, Edit2, AlertTriangle, TrendingDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type SubFrequency = "weekly" | "monthly" | "quarterly" | "annual";
type SubStatus = "active" | "paused" | "cancelled";

interface Subscription {
  id: string;
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

const LS_SUBS_KEY = "ft-subscriptions";
const LS_DISMISSED_KEY = "ft-subscriptions-dismissed";

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
  padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "var(--ft-dim)",
  background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const,
  letterSpacing: "0.4px", whiteSpace: "nowrap" as const,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadSubs(): Subscription[] {
  try {
    const raw = localStorage.getItem(LS_SUBS_KEY);
    return raw ? (JSON.parse(raw) as Subscription[]) : [];
  } catch { return []; }
}

function saveSubs(subs: Subscription[]): void {
  try { localStorage.setItem(LS_SUBS_KEY, JSON.stringify(subs)); } catch { /* noop */ }
}

function loadDismissed(): string[] {
  try {
    const raw = localStorage.getItem(LS_DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function saveDismissed(list: string[]): void {
  try { localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

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

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  // Group expenses by description (case-insensitive)
  const groups = new Map<string, Array<{ date: string; gbpValue: number }>>();
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const key = tx.description.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ date: tx.date, gbpValue: tx.gbpValue });
  }

  const candidates: DetectedCandidate[] = [];

  for (const [key, entries] of groups.entries()) {
    // Original description (from first entry)
    const origDesc = txs.find(t => t.description.toLowerCase().trim() === key)?.description ?? key;

    if (dismissed.includes(origDesc)) continue;
    if (entries.length < 3) continue;

    // Require at least 2 different calendar months
    const months = new Set(entries.map(e => e.date.slice(0, 7)));
    if (months.size < 2) continue;

    // Amounts within 10% of each other (use median as reference)
    const sorted = [...entries].sort((a, b) => a.gbpValue - b.gbpValue);
    const median = sorted[Math.floor(sorted.length / 2)].gbpValue;
    const allWithinRange = entries.every(e =>
      Math.abs(e.gbpValue - median) / median <= 0.10,
    );
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const { data: txs } = useListTransactions({});

  const [subs, setSubs] = useState<Subscription[]>(() => loadSubs());
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed());
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SubForm>(EMPTY_FORM);

  useEffect(() => { saveSubs(subs); }, [subs]);
  useEffect(() => { saveDismissed(dismissed); }, [dismissed]);

  // ── Detection ──
  const detected = useMemo((): DetectedCandidate[] => {
    if (!txs) return [];
    return detectRecurring(
      txs.map(t => ({ description: t.description, date: t.date, gbpValue: t.gbpValue, type: t.type })),
      dismissed,
    );
  }, [txs, dismissed]);

  // Filter out already-confirmed subs from detected
  const confirmedNames = new Set(subs.map(s => s.name.toLowerCase().trim()));
  const unconfirmedCandidates = detected.filter(
    d => !confirmedNames.has(d.description.toLowerCase().trim()),
  );

  // ── Last transaction per sub ──
  const lastTxByName = useMemo(() => {
    const map = new Map<string, { date: string; amount: number; prevAmount: number | null }>();
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

  // "Could save": active subs with last tx > 60 days ago
  const couldSave = useMemo(() => {
    return activeSubs
      .filter(s => {
        const last = lastTxByName.get(s.id);
        if (!last) return false;
        return daysSince(last.date) > 60;
      })
      .reduce((sum, s) => sum + toMonthly(s.amount, s.frequency), 0);
  }, [activeSubs, lastTxByName]);

  // Cancel recommendations: last tx > 45 days
  const cancelCandidates = useMemo(() => {
    return activeSubs.filter(s => {
      const last = lastTxByName.get(s.id);
      if (!last) return false;
      return daysSince(last.date) > 45;
    });
  }, [activeSubs, lastTxByName]);

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

  // ── CRUD helpers ──
  const setField = <K extends keyof SubForm>(k: K, v: SubForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newSub: Subscription = {
      id: nanoid(),
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
    };
    setSubs(p => [...p, newSub]);
    setAddOpen(false);
    setForm(EMPTY_FORM);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSubs(p => p.map(s => s.id !== editId ? s : {
      ...s,
      name: form.name,
      amount: parseFloat(form.amount),
      currency: form.currency,
      frequency: form.frequency,
      category: form.category,
      nextDue: form.nextDue || undefined,
      notes: form.notes || undefined,
    }));
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

  const deleteSub = (id: string) => {
    if (!confirm("Delete this subscription?")) return;
    setSubs(p => p.filter(s => s.id !== id));
  };

  const toggleActive = (id: string) =>
    setSubs(p => p.map(s => s.id !== id ? s : { ...s, active: !s.active }));

  const confirmCandidate = (candidate: DetectedCandidate) => {
    const newSub: Subscription = {
      id: nanoid(),
      name: candidate.description,
      amount: Math.round(candidate.avgAmount * 100) / 100,
      currency: "GBP",
      frequency: "monthly",
      category: "Other",
      startDate: candidate.transactions[candidate.transactions.length - 1]?.date ?? new Date().toISOString().slice(0, 10),
      active: true,
      manuallyAdded: false,
    };
    setSubs(p => [...p, newSub]);
  };

  const dismissCandidate = (desc: string) =>
    setDismissed(p => [...p, desc]);

  const FormFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
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
      <div className="grid grid-cols-3 gap-4">
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
      <div className="grid grid-cols-2 gap-4">
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

  const freqColor: Record<SubFrequency, string> = {
    weekly: "var(--ft-cyan)",
    monthly: "var(--ft-blue)",
    quarterly: "var(--ft-amber)",
    annual: "var(--ft-accent)",
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={CreditCard}
        title="Subscriptions & Recurring"
        subtitle="Auto-detected recurring charges · manage and track ongoing costs"
        actions={
          <Button
            onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}
            size="sm"
            style={{ background: "var(--ft-blue)", color: "white", border: "none", borderRadius: 2, fontSize: 12 }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add Subscription
          </Button>
        }
      />

      {/* ── Summary panel ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
        {[
          { label: "Monthly Cost", value: formatGbp(totalMonthly), color: "var(--ft-blue)" },
          { label: "Annual Cost", value: formatGbp(totalAnnual), color: "var(--ft-accent)" },
          { label: "Active Subs", value: String(activeSubs.length), color: "var(--ft-text)" },
          { label: "Could Save / mo", value: formatGbp(couldSave), color: couldSave > 0 ? "var(--ft-amber)" : "var(--ft-green)", tooltip: "Subs with last charge >60 days ago" },
        ].map((s, i) => (
          <div key={s.label} className="px-4 py-3 border-r border-b sm:border-b-0" style={{ borderColor: "var(--ft-border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>{s.label}</div>
            <div className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            {i === 3 && couldSave > 0 && (
              <div className="text-xs mt-0.5" style={{ color: "var(--ft-dim)" }}>inactive &gt;60d</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Auto-detected candidates ─────────────────────────────────────── */}
      {unconfirmedCandidates.length > 0 && (
        <div className="border" style={{ borderColor: "var(--ft-border)" }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: "rgba(34,211,238,0.07)", borderColor: "rgba(34,211,238,0.2)" }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--ft-cyan)", fontFamily: "var(--font-mono)" }}>
              ▼ DETECTED RECURRING — {unconfirmedCandidates.length} candidate{unconfirmedCandidates.length !== 1 ? "s" : ""}
            </span>
            <span className="text-xs" style={{ color: "var(--ft-dim)" }}>appeared 3+ times across 2+ months with consistent amounts</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--ft-border)" }}>
            {unconfirmedCandidates.map(c => (
              <div key={c.description} className="flex items-center gap-3 px-3 py-2.5" style={{ background: "var(--ft-base)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--ft-text)" }}>{c.description}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--ft-dim)" }}>
                    avg {formatGbp(c.avgAmount)} · {c.transactions.length} charges · {c.monthCount} months
                    {c.transactions[0] && ` · last ${formatDateShort(c.transactions[0].date)}`}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => confirmCandidate(c)}
                  style={{ background: "rgba(34,211,238,0.12)", color: "var(--ft-cyan)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 2, fontSize: 11, height: 26, padding: "0 10px" }}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissCandidate(c.description)}
                  style={{ color: "var(--ft-dim)", fontSize: 11, height: 26, padding: "0 8px" }}
                >
                  Dismiss
                </Button>
              </div>
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
                <div key={sub.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1">
                    <span className="text-sm font-medium" style={{ color: "var(--ft-text)" }}>{sub.name}</span>
                    <span className="ml-3 text-xs" style={{ color: "var(--ft-amber)" }}>
                      Last used {days}d ago — consider cancelling
                    </span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: "var(--ft-muted)" }}>{formatGbp(toMonthly(sub.amount, sub.frequency))}/mo</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Subscription list ─────────────────────────────────────────────── */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(88,166,255,0.07)", borderColor: "rgba(88,166,255,0.18)", color: "var(--ft-blue)" }}>
          ▼ SUBSCRIPTION LIST — {subs.length} total
        </div>
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="flex" style={{ marginLeft: 0 }}>
            {[
              ["NAME", "1"], ["CATEGORY", "120px"], ["AMOUNT", "110px"], ["/MONTH", "100px"],
              ["FREQUENCY", "100px"], ["LAST CHARGE", "120px"], ["NEXT DUE", "120px"],
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
          </div>

          {subs.length === 0 && (
            <div className="text-center py-10 text-xs" style={{ color: "var(--ft-dim)" }}>
              No subscriptions yet — confirm detected candidates above or add manually.
            </div>
          )}

          {subs.map((sub) => {
            const last = lastTxByName.get(sub.id);
            const priceIncreased = last?.prevAmount != null && last.amount > last.prevAmount * 1.02;
            const priceDiff = priceIncreased && last?.prevAmount ? last.amount - last.prevAmount : 0;
            const pricePct = priceIncreased && last?.prevAmount ? ((last.amount - last.prevAmount) / last.prevAmount) * 100 : 0;
            const estimatedNext = last ? nextDueDate(last.date, sub.frequency) : (sub.nextDue ?? "—");
            const status: SubStatus = sub.active ? "active" : "paused";
            const statusColor = status === "active" ? "var(--ft-green)" : "var(--ft-dim)";
            const statusBg = status === "active" ? "rgba(63,185,80,0.12)" : "rgba(139,148,158,0.12)";

            return (
              <div key={sub.id}>
                <div className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)", background: "var(--ft-base)" }}>
                  <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sub.name}
                    {sub.notes && <span className="ml-2 text-xs" style={{ color: "var(--ft-dim)" }}>· {sub.notes}</span>}
                  </div>
                  <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-muted)" }}>{sub.category}</div>
                  <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-text)" }}>
                    {sub.currency !== "GBP" ? `${sub.currency} ` : ""}{sub.amount.toFixed(2)}
                  </div>
                  <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-blue)" }}>
                    {formatGbp(toMonthly(sub.amount, sub.frequency))}
                  </div>
                  <div style={{ width: 100, minWidth: 100, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 10 }}>
                    <span style={{ padding: "2px 6px", borderRadius: 2, fontWeight: 700, fontFamily: "var(--font-mono)", background: `${freqColor[sub.frequency]}18`, color: freqColor[sub.frequency], letterSpacing: "0.04em" }}>
                      {FREQ_LABELS[sub.frequency]}
                    </span>
                  </div>
                  <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: last ? "var(--ft-muted)" : "var(--ft-dim)" }}>
                    {last ? formatDateShort(last.date) : "No data"}
                  </div>
                  <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-muted)" }}>
                    {estimatedNext !== "—" ? formatDateShort(estimatedNext) : "—"}
                  </div>
                  <div style={{ width: 90, minWidth: 90, padding: "7px 12px", borderRight: "1px solid var(--ft-border)" }}>
                    <button
                      onClick={() => toggleActive(sub.id)}
                      style={{ padding: "2px 7px", borderRadius: 2, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: statusBg, color: statusColor, border: `1px solid ${statusColor}40`, cursor: "pointer" }}
                    >
                      {status.toUpperCase()}
                    </button>
                  </div>
                  <div style={{ width: 90, minWidth: 90, padding: "4px 6px", display: "flex", justifyContent: "flex-end", gap: 2 }}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sub)}>
                      <Edit2 className="w-3.5 h-3.5" style={{ color: "var(--ft-muted)" }} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteSub(sub.id)}>
                      <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
                    </Button>
                  </div>
                </div>

                {/* Price increase alert inline */}
                {priceIncreased && (
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b text-xs" style={{ borderColor: "rgba(230,162,60,0.2)", background: "rgba(230,162,60,0.06)", color: "var(--ft-amber)" }}>
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    Price increased: {formatGbp(last!.prevAmount!)} → {formatGbp(last!.amount)} (+{pricePct.toFixed(1)}% / +{formatGbp(priceDiff)})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {activeSubs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pie by category */}
          <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
            <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-blue)" }}>Spend by Category</div>
            <div className="text-xs mb-3" style={{ color: "var(--ft-dim)" }}>Monthly equivalent · active subscriptions</div>
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
                    <div key={i} className="flex items-center gap-1 text-xs" style={{ color: "var(--ft-muted)" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Projected 12-month area chart */}
          <div className="border p-4" style={{ background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
            <div className="text-xs font-bold mb-0.5 uppercase tracking-wide" style={{ color: "var(--ft-green)" }}>Projected Monthly Cost</div>
            <div className="text-xs mb-3" style={{ color: "var(--ft-dim)" }}>Next 12 months · annual charges spike in their renewal month</div>
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
              <Button type="submit" style={{ background: "var(--ft-blue)", color: "white", border: "none" }}>Add</Button>
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
              <Button type="submit" style={{ background: "var(--ft-blue)", color: "white", border: "none" }}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* unused var elimination */}
      {FREQ_DAYS.weekly && null}
    </div>
  );
}
