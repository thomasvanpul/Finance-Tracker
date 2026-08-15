import { useListTransactions } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt } from "./mobile-format";

// Category totals + income/expense split for the current month.
//
// Design signature devices applied:
//   - Premium-tier 34px SPEND · £ · MTD headline over an income/spend
//     mini-bar (single row, two segments, area = share).
//   - Two-level column header CATEGORY / SHARE / £ per section.
//   - Per-row proportional bar (area = share of section total); largest
//     category reads first.
//   - Zero rows can't appear here (they wouldn't be in the aggregation)
//     but the loading state renders skeleton figures rather than "£0.00".
//   - Native currency stays hidden — the aggregation is GBP-equivalent
//     for cross-currency roll-up. Per-transaction rendering keeps native
//     in the transactions view.

const BAR_H = 3;
const AMOUNT_COL_W = 108;

export function MobileAnalytics({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const dateTo = now.toISOString().slice(0, 10);
  const { data: txns = [], isLoading } = useListTransactions({ dateFrom, dateTo });

  if (!isLoading && txns.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Analytics" onBack={onBack} />
        <MobileEmptyState
          label="NO TRANSACTIONS"
          title="No analytics yet."
          description="Log or import transactions and Analytics fills in — spend by category, income vs expense, month-over-month."
          ctaLabel="Import transactions"
          onCta={() => navigate("/import")}
        />
      </div>
    );
  }

  const expenses = txns.filter((t) => t.type === "expense");
  const incomes = txns.filter((t) => t.type === "income");
  const totalSpend = expenses.reduce((s, t) => s + Math.abs(t.gbpValue), 0);
  const totalIncome = incomes.reduce((s, t) => s + t.gbpValue, 0);
  const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase();
  const net = totalIncome - totalSpend;

  function byCat(list: typeof txns) {
    const map = new Map<string, number>();
    for (const t of list) {
      const k = t.category || "Uncategorised";
      map.set(k, (map.get(k) ?? 0) + Math.abs(t.gbpValue));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => ({ cat, amount }));
  }
  const spendRows = byCat(expenses);
  const incomeRows = byCat(incomes);

  // For the mini bar: two segments (income green, spend red) with widths
  // proportional to the larger of the two so both fit on the same rule.
  const scale = Math.max(totalIncome, totalSpend, 1);
  const inPct = (totalIncome / scale) * 100;
  const outPct = (totalSpend / scale) * 100;

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
      }}
    >
      <MobileScreenHeader title="Analytics" onBack={onBack} />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">{monthLabel} · MTD</MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">NET · £ · MONTH TO DATE</MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text
            as="span"
            size={34}
            weight={600}
            letterSpacing="-0.035em"
            color={net >= 0 ? "var(--ft-text)" : "var(--ft-red)"}
            numeric
          >
            {net < 0 ? "−" : ""}{nfmt(Math.abs(net), { decimals: 2 })}
          </Text>
        </HStack>
        {/* Mini in/out bar */}
        <VStack marginTop={10} gap={4}>
          <div style={{ position: "relative", height: BAR_H }}>
            <div style={{ position: "absolute", inset: 0, background: "var(--ft-border)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, height: BAR_H, width: `${inPct}%`, background: "var(--ft-green)" }} />
          </div>
          <div style={{ position: "relative", height: BAR_H }}>
            <div style={{ position: "absolute", inset: 0, background: "var(--ft-border)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, height: BAR_H, width: `${outPct}%`, background: "var(--ft-red)" }} />
          </div>
        </VStack>
        <HStack gap={14} marginTop={6} align="baseline">
          <HStack gap={4} align="baseline">
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">IN</Text>
            <Text as="span" mono size={12} weight={600} color="var(--ft-green)" numeric>
              +£{nfmt(totalIncome, { decimals: 2 })}
            </Text>
          </HStack>
          <HStack gap={4} align="baseline">
            <Text as="span" mono size={10} letterSpacing="0.1em" color="var(--ft-dim)">OUT</Text>
            <Text as="span" mono size={12} weight={600} color="var(--ft-red)" numeric>
              −£{nfmt(totalSpend, { decimals: 2 })}
            </Text>
          </HStack>
        </HStack>
      </VStack>

      <Section title="SPEND BY CATEGORY" rows={spendRows} total={totalSpend} accent="var(--ft-red)" />
      <Section title="INCOME BY CATEGORY" rows={incomeRows} total={totalIncome} accent="var(--ft-green)" />
    </div>
  );
}

interface SectionProps {
  title: string;
  rows: Array<{ cat: string; amount: number }>;
  total: number;
  accent: string;
}

function Section({ title, rows, total, accent }: SectionProps) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <MonoLabel as="span" size={9}>{title}</MonoLabel>
        <div style={{ flex: 1 }} />
        <MonoLabel as="span" size={9}>SHARE · £</MonoLabel>
      </div>
      {rows.map((r) => {
        const pct = total > 0 ? (r.amount / total) * 100 : 0;
        return (
          <div
            key={r.cat}
            style={{
              padding: "10px 18px",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <HStack justify="between" align="baseline" gap={10}>
              <Text as="span" size={14}>{r.cat}</Text>
              <HStack gap={10} align="baseline">
                <Text as="span" mono size={10} letterSpacing="0.06em" color="var(--ft-dim)" numeric>
                  {nfmt(pct, { decimals: 0 })}%
                </Text>
                <div style={{ width: AMOUNT_COL_W, textAlign: "right" }}>
                  <Text as="span" mono size={13} weight={600} numeric>
                    £{nfmt(r.amount, { decimals: 2 })}
                  </Text>
                </div>
              </HStack>
            </HStack>
            <div style={{ marginTop: 6, position: "relative", height: 2 }}>
              <div style={{ position: "absolute", inset: 0, background: "var(--ft-border)" }} />
              <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, pct)}%`, background: accent }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
