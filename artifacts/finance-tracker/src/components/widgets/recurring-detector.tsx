import { useState } from "react";
import {
  useListTransactions,
  useCreateUpcomingItem,
  useListUpcoming,
  getListUpcomingQueryKey,
  getGetUpcomingSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

interface Transaction {
  id: number;
  date: string;
  description: string;
  type: "income" | "expense" | "transfer";
  category: string;
  accountId: number;
  accountName: string;
  nativeAmount: number;
  currency: string;
  gbpValue: number;
}

interface RecurringCandidate {
  key: string;
  description: string;
  category: string;
  avgGbpValue: number;
  frequency: "monthly" | "weekly";
  lastDate: string;
  accountId: number;
  currency: string;
  accountName: string;
}

const STRIP_WORDS = new Set([
  "payment", "purchase", "transaction", "charge", "fee", "debit", "credit",
  "online", "contactless", "pos", "direct", "debit",
]);

function normalizeDescription(raw: string): string {
  const stripped = raw
    .toLowerCase()
    .replace(/\d+/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STRIP_WORDS.has(w));
  return stripped.slice(0, 4).join(" ").trim();
}

function nextMonthDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function detectCandidates(
  transactions: Transaction[],
  existingDescriptions: string[],
): RecurringCandidate[] {
  const expenses = transactions.filter((t) => t.type === "expense");

  const groups = new Map<
    string,
    { transactions: Transaction[] }
  >();

  for (const tx of expenses) {
    const key = normalizeDescription(tx.description);
    if (!key) continue;
    const group = groups.get(key);
    if (group) {
      group.transactions.push(tx);
    } else {
      groups.set(key, { transactions: [tx] });
    }
  }

  const normalizedExisting = new Set(
    existingDescriptions.map((d) => normalizeDescription(d)),
  );

  const candidates: RecurringCandidate[] = [];

  for (const [key, { transactions: txs }] of groups) {
    if (txs.length < 2) continue;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff =
        (new Date(sorted[i].date).getTime() -
          new Date(sorted[i - 1].date).getTime()) /
        86400000;
      intervals.push(diff);
    }

    const avgInterval =
      intervals.reduce((s, v) => s + v, 0) / intervals.length;

    let frequency: "monthly" | "weekly" | null = null;
    if (avgInterval >= 25 && avgInterval <= 35) frequency = "monthly";
    else if (avgInterval >= 6 && avgInterval <= 8) frequency = "weekly";

    if (!frequency) continue;
    if (frequency !== "monthly") continue;

    if (normalizedExisting.has(key)) continue;

    const descCounts = new Map<string, number>();
    for (const tx of txs) {
      descCounts.set(tx.description, (descCounts.get(tx.description) ?? 0) + 1);
    }
    let mostCommonDesc = txs[0].description;
    let maxCount = 0;
    for (const [desc, count] of descCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonDesc = desc;
      }
    }

    const avgGbpValue =
      txs.reduce((s, tx) => s + Math.abs(tx.gbpValue), 0) / txs.length;

    const lastTx = sorted[sorted.length - 1];

    candidates.push({
      key,
      description: mostCommonDesc,
      category: lastTx.category,
      avgGbpValue,
      frequency,
      lastDate: lastTx.date,
      accountId: lastTx.accountId,
      currency: lastTx.currency,
      accountName: lastTx.accountName,
    });
  }

  return candidates
    .sort((a, b) => b.avgGbpValue - a.avgGbpValue)
    .slice(0, 8);
}

const ACCENT = "var(--ft-cyan)";

// ─── Sub-components ───────────────────────────────────────────────────────────

type StatsKpiCellProps = {
  label: string;
  value: React.ReactNode;
};

function StatsKpiCell({ label, value }: StatsKpiCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 12px",
        background: hov ? "color-mix(in srgb, var(--ft-cyan) 4%, var(--ft-raised))" : "var(--ft-raised)",
        transition: "background 0.1s",
        borderTop: `2px solid ${ACCENT}`,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function CandidateRow({
  candidate,
  isAdding,
  maxCost,
  rank,
  onAdd,
}: {
  candidate: RecurringCandidate;
  isAdding: boolean;
  maxCost: number;
  rank: number;
  onAdd: () => void;
}) {
  const [hov, setHov] = useState(false);
  const barW = maxCost > 0 ? (candidate.avgGbpValue / maxCost) * 100 : 0;
  const annualCost = candidate.avgGbpValue * 12;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-cyan) 4%, var(--ft-raised))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-border2)", fontWeight: 700, flexShrink: 0, minWidth: 12, textAlign: "right" }}>
          {rank}
        </span>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT, flexShrink: 0 }} />

        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-text)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}>
          {candidate.description}
        </span>

        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "1px 4px",
          border: "1px solid var(--ft-border2)",
          color: "var(--ft-dim)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {candidate.category}
        </span>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-red)", lineHeight: 1 }}>
            −{formatBaseMoney(candidate.avgGbpValue)}
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", lineHeight: 1.4 }}>
            {formatBaseMoney(annualCost)}/yr
          </div>
        </div>

        <button
          type="button"
          disabled={isAdding}
          onClick={onAdd}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.06em",
            padding: "3px 8px",
            border: `1px solid ${isAdding ? "var(--ft-border2)" : "var(--ft-cyan)"}`,
            background: isAdding ? "transparent" : "color-mix(in srgb, var(--ft-cyan) 10%, transparent)",
            color: isAdding ? "var(--ft-dim)" : ACCENT,
            cursor: isAdding ? "default" : "pointer",
            flexShrink: 0,
            transition: "all 0.15s",
            opacity: isAdding ? 0.5 : 1,
            minWidth: 46,
          }}
        >
          {isAdding ? "…" : "+ Track"}
        </button>
      </div>

      <div style={{ marginLeft: 25, height: 3, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barW}%`, background: "var(--ft-cyan)", opacity: 0.5, borderRadius: 2, transition: "width 0.12s ease" }} />
      </div>
    </div>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function RecurringDetectorWidget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState<Set<string>>(new Set());

  const { data: transactions, isLoading } = useListTransactions({});
  const { data: upcomingItems } = useListUpcoming({});
  const createUpcoming = useCreateUpcomingItem();

  const existingDescriptions = (upcomingItems ?? []).map((u) => u.description);
  const allTransactions = (transactions ?? []) as Transaction[];
  const candidates = isLoading
    ? []
    : detectCandidates(allTransactions, existingDescriptions);

  const totalMonthly = candidates.reduce((s, c) => s + c.avgGbpValue, 0);
  const maxCost = candidates[0]?.avgGbpValue ?? 0;

  async function handleAdd(candidate: RecurringCandidate) {
    setAdding((prev) => new Set(prev).add(candidate.key));
    try {
      await createUpcoming.mutateAsync({
        data: {
          description: candidate.description,
          dueDate: nextMonthDateStr(),
          category: candidate.category,
          type: "expense",
          frequency: "monthly",
          nativeAmount: candidate.avgGbpValue,
          currency: "GBP",
          accountId: candidate.accountId,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListUpcomingQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() }),
      ]);
      toast({ title: "Added to upcoming", description: candidate.description });
    } catch {
      toast({ title: "Failed to add", description: "Could not add recurring item.", variant: "destructive" });
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(candidate.key);
        return next;
      });
    }
  }

  return (
    <WidgetShell title="Detected Recurring" accent={ACCENT} isLoading={isLoading}>
      {!isLoading && (
        <>
          {candidates.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--ft-border2)", marginBottom: 8 }}>◎</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 4 }}>No patterns detected yet</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>Add more transactions to surface recurring charges</div>
            </div>
          ) : (
            <>
              {/* Border-as-gap KPI strip */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
                <StatsKpiCell
                  label="Found"
                  value={<div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>{candidates.length}</div>}
                />
                <StatsKpiCell
                  label="Monthly"
                  value={<div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-red)", lineHeight: 1 }}>{formatBaseMoney(totalMonthly)}</div>}
                />
                <StatsKpiCell
                  label="Annual"
                  value={<div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-red)", lineHeight: 1 }}>{formatBaseMoney(totalMonthly * 12)}</div>}
                />
              </div>

              {candidates.map((candidate, i) => (
                <CandidateRow
                  key={candidate.key}
                  candidate={candidate}
                  isAdding={adding.has(candidate.key)}
                  maxCost={maxCost}
                  rank={i + 1}
                  onAdd={() => handleAdd(candidate)}
                />
              ))}
            </>
          )}
        </>
      )}
    </WidgetShell>
  );
}
