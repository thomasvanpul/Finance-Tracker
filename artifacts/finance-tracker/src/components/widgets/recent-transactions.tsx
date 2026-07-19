import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp, formatDate } from "@/lib/utils";
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
    <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", gap: 6, alignItems: "center" }}>
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
            fontFamily: "var(--font-mono)",
            fontSize: 10,
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
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "2px 5px",
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
        <div style={{ padding: "16px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
          {search || typeFilter !== "all" ? "No matching transactions" : "No transactions yet"}
        </div>
      )}
      {filtered.map(tx => (
        <div key={tx.id} style={{ display: "flex", alignItems: "center", padding: "7px 12px", borderBottom: "1px solid var(--ft-border)", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: TYPE_COLOR[tx.type] ?? "var(--ft-muted)", width: 14, flexShrink: 0, textAlign: "center" }}>
            {TYPE_PREFIX[tx.type] ?? "·"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", flexShrink: 0, width: 68 }}>
            {formatDate(tx.date)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tx.description}
          </span>
          {isExpanded && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tx.accountName}
            </span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", padding: "1px 5px", border: `1px solid ${categoryColor(tx.category)}40`, color: categoryColor(tx.category), flexShrink: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tx.category}
          </span>
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: TYPE_COLOR[tx.type] ?? "var(--ft-muted)", flexShrink: 0, width: 72, textAlign: "right" }}>
            {TYPE_PREFIX[tx.type]}{formatGbp(tx.gbpValue)}
          </span>
        </div>
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
          <div style={{ padding: "14px 12px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 12 }}>
              Transaction Summary
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {(["income", "expense", "transfer"] as const).map(type => {
                const count = typeCounts[type] ?? 0;
                const color = type === "income" ? "var(--ft-green)" : type === "expense" ? "var(--ft-red)" : "var(--ft-amber)";
                const total = allTransactions.filter(t => t.type === type).reduce((s, t) => s + t.gbpValue, 0);
                return (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--ft-raised)", border: "1px solid var(--ft-border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color, width: 16, flexShrink: 0, textAlign: "center" }}>
                      {TYPE_PREFIX[type]}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ft-dim)" }}>
                        {type}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginTop: 1 }}>
                        {count} transaction{count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color }}>
                      {TYPE_PREFIX[type]}{formatGbp(total)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", color: "var(--ft-dim)", marginBottom: 6, textTransform: "uppercase" }}>
              Showing {filtered.length} of {allTransactions.length} total
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
