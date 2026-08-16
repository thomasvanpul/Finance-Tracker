import { useListBudgets, useListTransactions } from "@workspace/api-client-react";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt } from "./mobile-format";

// Per-category budget vs actual for the current month.
//
// Design signature devices applied:
//   - Premium-tier headline (34px): SPENT · £ · MONTH TO DATE, with an
//     overall proportional bar underneath.
//   - Every row is a horizontal proportional bar (area = share used).
//   - Dotted extension past the fill when the row is under budget —
//     dotted = not-yet-real (the unspent tail).
//   - Over-budget rows use both a solid --ft-red fill AND the true
//     minus U+2212 in the label — never colour alone.
//   - Two-level column header (CATEGORY / SPENT · OF).

const BAR_H = 4;

function firstOfMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MobileBudget() {
  const { data: budgets = [], isLoading } = useListBudgets();
  // isLoading here matters — see the zero-vs-loading rule in
  // docs/MOBILE-CONCEPT.md. A row must not render "0% used" when the
  // transactions query hasn't returned yet, or "nothing spent" reads the
  // same as "still fetching".
  const { data: txns = [], isLoading: txLoading } = useListTransactions({ dateFrom: firstOfMonth(), dateTo: today() });

  if (!isLoading && budgets.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Budget" />
        <MobileEmptyState
          label="NO BUDGETS"
          title="Nothing to track yet."
          description="Set a monthly limit for any category and this screen shows how it's doing."
        />
      </div>
    );
  }

  const spendByCat = new Map<string, number>();
  let unconvertibleExpenses = 0;
  for (const t of txns) {
    if (t.type !== "expense") continue;
    if (t.gbpValue == null) { unconvertibleExpenses += 1; continue; }
    const k = (t.category || "Uncategorised").toLowerCase();
    spendByCat.set(k, (spendByCat.get(k) ?? 0) + Math.abs(t.gbpValue));
  }

  type Row = { id: number | string; category: string; spent: number; limit: number; pct: number; over: boolean };
  const rows: Row[] = budgets.map((b, i) => {
    const spent = spendByCat.get((b.category ?? "").toLowerCase()) ?? 0;
    const limit = parseFloat(String(b.monthlyLimit ?? 0)) || 0;
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    return { id: b.id ?? i, category: b.category, spent, limit, pct, over: spent > limit && limit > 0 };
  });

  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const overallPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
  const overallOver = totalSpent > totalLimit;

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
      <MobileScreenHeader title="Budget" />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {budgets.length} {budgets.length === 1 ? "BUDGET" : "BUDGETS"}
        </MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          SPENT · £ · MONTH TO DATE
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text
            as="span"
            size={34}
            weight={600}
            letterSpacing="-0.035em"
            color={overallOver ? "var(--ft-red)" : "var(--ft-text)"}
            numeric
          >
            {nfmt(totalSpent, { decimals: 2 })}
          </Text>
          <Text as="span" mono size={13} color="var(--ft-dim)" numeric>
            / £{nfmt(totalLimit, { decimals: 2 })}
          </Text>
        </HStack>
        {unconvertibleExpenses > 0 && (
          <Text as="div" mono size={10} mt={4} color="var(--ft-amber)" letterSpacing="0.06em">
            {unconvertibleExpenses} expense{unconvertibleExpenses !== 1 ? "s" : ""} no FX — not in total
          </Text>
        )}
        <div style={{ marginTop: 10, height: BAR_H, background: "var(--ft-border)", position: "relative", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, overallPct)}%`,
              height: "100%",
              background: overallOver ? "var(--ft-red)" : overallPct > 80 ? "var(--ft-amber)" : "var(--ft-accent)",
            }}
          />
        </div>
      </VStack>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <MonoLabel as="span" size={9}>CATEGORY</MonoLabel>
        <div style={{ flex: 1 }} />
        <MonoLabel as="span" size={9}>SPENT · OF</MonoLabel>
      </div>

      {rows.map((r) => {
        const displayPct = Math.min(100, r.pct);
        const isZero = r.spent === 0;
        const fillColor = r.over ? "var(--ft-red)" : r.pct > 80 ? "var(--ft-amber)" : "var(--ft-accent)";
        return (
          <div
            key={r.id}
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <HStack justify="between" align="baseline" gap={10}>
              <Text as="span" size={14}>{r.category}</Text>
              {txLoading ? (
                // Loading state: skeleton block. Never "£0.00" while fetching.
                <div style={{ width: 90, height: 14, background: "var(--ft-raised)" }} />
              ) : (
                <HStack gap={4} align="baseline">
                  <Text
                    as="span"
                    mono
                    size={13}
                    weight={600}
                    color={r.over ? "var(--ft-red)" : "var(--ft-text)"}
                    numeric
                  >
                    {r.over ? "−" : ""}£{nfmt(r.over ? r.spent - r.limit : r.spent, { decimals: 2 })}
                  </Text>
                  <Text as="span" mono size={11} color="var(--ft-dim)" numeric>
                    / £{nfmt(r.limit, { decimals: 0 })}
                  </Text>
                </HStack>
              )}
            </HStack>
            <div style={{ marginTop: 8, position: "relative", height: BAR_H }}>
              {txLoading ? (
                // Loading bar: solid raised block, no dotted rule.
                <div style={{ position: "absolute", inset: 0, background: "var(--ft-raised)" }} />
              ) : isZero ? (
                // Zero: no baseline, all-dotted the full width. Distinct from
                // loading; distinct from a small non-zero fill. See MOBILE-
                // CONCEPT § "Zero and loading are not the same reading".
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: BAR_H,
                    borderTop: "1px dotted var(--ft-dim)",
                  }}
                />
              ) : (
                <>
                  <div style={{ position: "absolute", inset: 0, background: "var(--ft-border)" }} />
                  <div style={{ position: "absolute", inset: 0, width: `${displayPct}%`, background: fillColor }} />
                  {!r.over && r.pct < 100 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${displayPct}%`,
                        right: 0,
                        height: BAR_H,
                        borderTop: "1px dotted var(--ft-dim)",
                      }}
                    />
                  )}
                </>
              )}
            </div>
            <HStack justify="between" align="baseline" marginTop={4}>
              <Text as="span" mono size={9} letterSpacing="0.1em" color="var(--ft-dim)">
                {txLoading ? "…" : `${Math.round(r.pct)}%`}
              </Text>
              {r.over && (
                <Text as="span" mono size={9} letterSpacing="0.1em" color="var(--ft-red)">
                  OVER
                </Text>
              )}
            </HStack>
          </div>
        );
      })}
    </div>
  );
}
