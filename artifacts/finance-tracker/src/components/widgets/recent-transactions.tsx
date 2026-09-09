import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { Drill, DrillTarget } from "@/components/drill";
import { categoryTransactionsHref, ledgerHref, merchantTransactionsHref } from "@/lib/entity-href";
import { formatBaseMoney, formatDate } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { Search, X } from "lucide-react";

const TYPE_COLOR: Record<string, string> = {
  income: "var(--ft-green)",
  expense: "var(--ft-red)",
  transfer: "var(--ft-amber)",
};
const TYPE_PREFIX: Record<string, string> = {
  income: "+",
  expense: "−",
  transfer: "↔",
};
const CATEGORY_CHIPS: Record<string, string> = {
  food: "#E6B450",
  groceries: "#E6B450",
  transport: "var(--ft-blue)",
  salary: "var(--ft-green)",
  income: "var(--ft-green)",
  utilities: "#79C0FF",
  entertainment: "var(--ft-amber)",
  shopping: "var(--ft-text)",
  health: "#56D364",
  rent: "var(--ft-red)",
  subscriptions: "var(--ft-cyan)",
};
function categoryColor(cat: string): string {
  return CATEGORY_CHIPS[cat.toLowerCase()] ?? "var(--ft-muted)";
}

type TxType = "all" | "income" | "expense" | "transfer";
const TYPE_FILTERS: TxType[] = ["all", "income", "expense", "transfer"];

type TxRecord = { id: number; type: string; date: string; description: string; category: string; baseEquivalent: number | null; accountName: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

// Three things on this row stand for a set: the description (this merchant,
// across accounts), the account name, and the category. The date and the
// amount are properties of this one transaction, not sums, so they stay flat.
// DESIGN.md §14.
function TxRow({ tx, isExpanded }: { tx: TxRecord; isExpanded?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", padding: "var(--ft-widget-py) var(--ft-widget-px)",
        borderBottom: "1px solid var(--ft-border)", gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-raised))" : "transparent",
        transition: "background 0.1s",
        // No overflow: hidden on the row — the description Drill inside it
        // already ellipsises itself, and the amount at the end is a figure.
        minWidth: 0,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: TYPE_COLOR[tx.type] ?? "var(--ft-muted)", width: 14, flexShrink: 0, textAlign: "center" }}>
        {TYPE_PREFIX[tx.type] ?? "·"}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", flexShrink: 0, width: 68 }}>
        {formatDate(tx.date)}
      </span>
      <Drill href={merchantTransactionsHref(tx.description)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tx.description}
      </Drill>
      {isExpanded && (
        // TxRecord carries accountName but no accountId, so this cannot open
        // the account's detail surface the way every other account name in
        // the app does. `ledgerHref({ account })` needs the id. Left flat
        // rather than pointed at a substring search that would also match a
        // description — a drill that lands on the wrong rows is worse than
        // no drill.
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--ft-muted)", flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.accountName}
        </span>
      )}
      {/* The category colour goes on the wrapper, not on the Drill:
          `.ft-drill` takes `color: inherit`, so it wears the category colour
          at rest and the hover rule still wins on hover. Putting the colour
          on the anchor itself would make the inline style beat `:hover` and
          the affordance would half-work here and nowhere else. */}
      <span style={{ color: categoryColor(tx.category), flexShrink: 0, maxWidth: 90, overflow: "hidden" }}>
        <Drill href={categoryTransactionsHref(tx.category)} style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.category}
        </Drill>
      </span>
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: tx.baseEquivalent == null ? "var(--ft-dim)" : TYPE_COLOR[tx.type] ?? "var(--ft-muted)", flexShrink: 0, width: 72, textAlign: "right" }}>
        {tx.baseEquivalent == null ? "—" : `${TYPE_PREFIX[tx.type]}${formatBaseMoney(Math.abs(tx.baseEquivalent))}`}
      </span>
    </div>
  );
}

type TxSummaryCardProps = {
  type: "income" | "expense" | "transfer";
  count: number;
  total: number;
};

// Both the count and the total are sums over one type's rows, and the card
// stands for exactly the ledger filter `?type=` applies. DESIGN.md §14.
function TxSummaryCard({ type, count, total }: TxSummaryCardProps) {
  const [hov, setHov] = useState(false);
  const color = type === "income" ? "var(--ft-green)" : type === "expense" ? "var(--ft-red)" : "var(--ft-amber)";
  const card = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "var(--ft-widget-py) var(--ft-widget-px)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color, width: 16, flexShrink: 0, textAlign: "center" }}>
        {TYPE_PREFIX[type]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {type}
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--ft-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)" }}>{count}</span> transaction{count !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color, flexShrink: 0, whiteSpace: "nowrap" }}>
        <span className="ft-drill">{TYPE_PREFIX[type]}{formatBaseMoney(Math.abs(total))}</span>
      </div>
    </div>
  );
  return (
    <DrillTarget href={ledgerHref({ type })} title={`${type} — every transaction`}>
      {card}
    </DrillTarget>
  );
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export function RecentTransactionsWidget({ isExpanded }: { isExpanded?: boolean }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TxType>("all");

  const { data, isLoading } = useListTransactions({});

  const allTransactions = data ?? [];

  const rowLimit = isExpanded ? 30 : 15;

  const filtered = allTransactions
    .filter(tx => typeFilter === "all" || tx.type === typeFilter)
    .filter(tx => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return tx.description.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q);
    })
    .slice(0, rowLimit);

  const typeCounts = allTransactions.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.type] = (acc[tx.type] ?? 0) + 1;
    return acc;
  }, {});

  const filterBar = (
    <div style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", borderBottom: "1px solid var(--ft-border)", display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
        <Search size={10} style={{ position: "absolute", left: 6, color: "var(--ft-dim)", pointerEvents: "none" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            width: "100%",
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border2)",
            color: "var(--ft-text)",
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            height: 24,
            paddingLeft: 22,
            paddingRight: search ? 22 : 6,
            outline: "none",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ position: "absolute", right: 4, background: "none", border: "none", color: "var(--ft-dim)", lineHeight: 1, padding: 0 }}
          >
            <X size={10} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        {TYPE_FILTERS.map(t => {
          const active = typeFilter === t;
          const color = t === "income" ? "var(--ft-green)" : t === "expense" ? "var(--ft-red)" : t === "transfer" ? "var(--ft-amber)" : "var(--ft-accent)";
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "var(--ft-badge-py) var(--ft-badge-px)",
                background: active ? color : "transparent",
                color: active ? "var(--ft-base)" : "var(--ft-dim)",
                border: `1px solid ${active ? color : "var(--ft-border2)"}`,
                transition: "all 0.1s",
              }}
            >
              {t === "all" ? "ALL" : t[0].toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );

  const txRows = (
    <div>
      {filtered.length === 0 && !isLoading && (
        <div style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--ft-dim)", textAlign: "center" }}>
          {search || typeFilter !== "all" ? "No matching transactions" : "No transactions yet"}
        </div>
      )}
      {filtered.map(tx => (
        <TxRow key={tx.id} tx={tx} isExpanded={isExpanded} />
      ))}
    </div>
  );

  return (
    <WidgetShell title="Recent Transactions" href="/transactions" linkLabel="→ All" isLoading={isLoading} accent="var(--ft-accent)">
      {isExpanded ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, height: "100%" }}>
          <div style={{ borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column" }}>
            {filterBar}
            {txRows}
          </div>
          <div style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)" }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ft-dim)",
              marginBottom: 12,
            }}>
              Transaction Summary
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {(["income", "expense", "transfer"] as const).map(type => {
                const count = typeCounts[type] ?? 0;
                const total = allTransactions.filter(t => t.type === type).reduce((s, t) => s + (t.baseEquivalent ?? 0), 0);
                return (
                  <TxSummaryCard key={type} type={type} count={count} total={total} />
                );
              })}
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--ft-dim)", marginBottom: 6 }}>
              Showing <span className="pnum" style={{ fontFamily: "var(--font-mono)" }}>{filtered.length}</span> of <span className="pnum" style={{ fontFamily: "var(--font-mono)" }}>{allTransactions.length}</span> total
            </div>
          </div>
        </div>
      ) : (
        <>
          {filterBar}
          {txRows}
        </>
      )}
    </WidgetShell>
  );
}
