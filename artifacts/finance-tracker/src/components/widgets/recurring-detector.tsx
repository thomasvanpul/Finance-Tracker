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
import { formatGbp } from "@/lib/utils";
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
      toast({
        title: "Added to upcoming",
        description: candidate.description,
      });
    } catch {
      toast({
        title: "Failed to add",
        description: "Could not add recurring item.",
        variant: "destructive",
      });
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
            <div
              style={{
                padding: "20px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-dim)",
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              No recurring patterns detected — add more transactions to analyse
            </div>
          ) : (
            candidates.map((candidate) => {
              const isAdding = adding.has(candidate.key);
              return (
                <div
                  key={candidate.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--ft-border)",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: ACCENT,
                      flexShrink: 0,
                    }}
                  />

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ft-text)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {candidate.description}
                  </span>

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "1px 5px",
                      border: "1px solid var(--ft-border2)",
                      color: "var(--ft-muted)",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {candidate.category}
                  </span>

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "1px 5px",
                      border: `1px solid ${ACCENT}40`,
                      color: ACCENT,
                      flexShrink: 0,
                    }}
                  >
                    {candidate.frequency}
                  </span>

                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--ft-red)",
                      flexShrink: 0,
                      width: 64,
                      textAlign: "right",
                    }}
                  >
                    −{formatGbp(candidate.avgGbpValue)}
                  </span>

                  <button
                    type="button"
                    disabled={isAdding}
                    onClick={() => handleAdd(candidate)}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      padding: "3px 8px",
                      border: `1px solid ${ACCENT}60`,
                      background: "transparent",
                      color: isAdding ? "var(--ft-dim)" : ACCENT,
                      cursor: isAdding ? "default" : "pointer",
                      flexShrink: 0,
                      transition: "opacity 150ms",
                      opacity: isAdding ? 0.5 : 1,
                    }}
                  >
                    {isAdding ? "…" : "+ Add"}
                  </button>
                </div>
              );
            })
          )}
        </>
      )}
    </WidgetShell>
  );
}
