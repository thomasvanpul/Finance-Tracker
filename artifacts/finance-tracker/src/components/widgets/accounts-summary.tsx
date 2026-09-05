import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { CurrencyMark } from "@/components/currency-mark";

type SortKey = "name" | "balance" | "gbp";

function formatNative(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    GBP: "£", USD: "$", EUR: "€", MYR: "RM ", SGD: "S$",
    AUD: "A$", CAD: "C$", JPY: "¥", HKD: "HK$", CHF: "CHF ",
  };
  const sym = symbols[currency] ?? `${currency} `;
  return `${sym}${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type AccountRowProps = {
  acct: { id: number | string; name: string; currency: string; balance: number; baseEquivalent: number | null };
  maxGbp: number;
  share: number;
  totalCash: number;
  isExpanded: boolean;
  isEven: boolean;
};

function AccountRow({ acct, maxGbp, share, isExpanded }: AccountRowProps) {
  const [hov, setHov] = useState(false);
  // Balance bar reads 0-width for unconvertible accounts — comparing
  // magnitude across currencies needs a GBP figure to normalise.
  const barPct = acct.baseEquivalent != null && maxGbp > 0 ? (Math.abs(acct.baseEquivalent) / maxGbp) * 100 : 0;
  const isNeg = acct.baseEquivalent != null && acct.baseEquivalent < 0;

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <td style={{ padding: "0 10px" }}>
        <div style={{ paddingTop: 6, paddingBottom: 2 }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: isExpanded ? 160 : 110,
          }}>
            {acct.name}
          </div>
        </div>
        {/* Mini balance bar */}
        <div style={{ height: 2, background: "var(--ft-border)", marginBottom: 5 }}>
          <div style={{
            height: "100%",
            width: `${barPct}%`,
            background: isNeg ? "var(--ft-red)" : "var(--ft-green)",
            transition: "width 0.12s ease",
          }} />
        </div>
      </td>
      <td style={{ padding: "7px 10px" }}>
        <span style={{ color: "var(--ft-dim)" }}>
          <CurrencyMark code={acct.currency} size={10} />
        </span>
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
        <span className="pnum">
          {acct.currency !== "GBP" ? formatNative(acct.balance, acct.currency) : "—"}
        </span>
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: acct.baseEquivalent == null ? "var(--ft-dim)" : isNeg ? "var(--ft-red)" : "var(--ft-green)" }}>
        {acct.baseEquivalent == null ? "—" : <span className="pnum">{formatBaseMoney(acct.baseEquivalent)}</span>}
      </td>
      {isExpanded && (
        <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          <span className="pnum">{share.toFixed(1)}%</span>
          {/* inline share mini-bar */}
          <div style={{ marginTop: 3, height: 2, background: "var(--ft-border)", borderRadius: 1, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(Math.abs(share), 100)}%`, background: "var(--ft-accent)", opacity: 0.6 }} />
          </div>
        </td>
      )}
    </tr>
  );
}

type OwingCellProps = { label: string; value: string; color: string; raw: number; isLast: boolean };

function OwingCell({ label, value, raw, color, isLast }: OwingCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 10px",
        borderRight: !isLast ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        transition: "background 0.1s",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: raw === 0 ? "var(--ft-dim)" : color, whiteSpace: "nowrap" }}>
        {raw === 0 ? "—" : value}
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function AccountsSummaryWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data: d, isLoading } = useGetDashboard();
  const [sort, setSort] = useState<SortKey>("gbp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const accounts = d?.accountBreakdown ?? [];
  const maxGbp = accounts.length > 0 ? Math.max(...accounts.map(a => Math.abs(a.baseEquivalent ?? 0))) : 1;

  const sorted = [...accounts].sort((a, b) => {
    let diff = 0;
    if (sort === "name") diff = a.name.localeCompare(b.name);
    else if (sort === "balance") diff = a.balance - b.balance;
    // GBP sort: unconvertible sinks to the bottom (desc) via -Infinity.
    else diff = (a.baseEquivalent ?? -Infinity) - (b.baseEquivalent ?? -Infinity);
    return sortDir === "desc" ? -diff : diff;
  });

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSort(key); setSortDir("desc"); }
  }

  const sortIcon = (key: SortKey) =>
    sort === key ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const headerCell = (label: string, key?: SortKey, align: "left" | "right" = "left") => (
    <th
      key={label}
      onClick={key ? () => toggleSort(key) : undefined}
      style={{
        padding: "5px 10px",
        textAlign: align,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        color: sort === key ? "var(--ft-accent)" : "var(--ft-dim)",
        borderBottom: "1px solid var(--ft-border)",
        cursor: key ? "pointer" : "default",
        userSelect: "none",
        whiteSpace: "nowrap",
        background: "var(--ft-raised)",
      }}
    >
      {label}{sortIcon(key ?? "name")}
    </th>
  );

  const owingItems = d ? [
    { label: "They Owe Me", value: formatBaseMoney(d.owing.totalOwedToMe), color: "var(--ft-green)", raw: d.owing.totalOwedToMe },
    { label: "I Owe",        value: formatBaseMoney(d.owing.totalIOwe),     color: "var(--ft-red)",   raw: d.owing.totalIOwe },
    {
      label: "Net Position",
      value: `${d.owing.netBase >= 0 ? "+" : ""}${formatBaseMoney(d.owing.netBase)}`,
      color: d.owing.netBase >= 0 ? "var(--ft-green)" : "var(--ft-red)",
      raw: d.owing.netBase,
    },
  ] : [];

  const tableSection = (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headerCell("Account", "name")}
            {headerCell("Ccy")}
            {headerCell("Balance", "balance", "right")}
            {headerCell("GBP", "gbp", "right")}
            {isExpanded && headerCell("Share", undefined, "right")}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "20px 10px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
                No accounts — add via Accounts
              </td>
            </tr>
          ) : (
            sorted.map((acct, i) => {
              // Share % needs a GBP figure to compute against the base total.
              const share = d!.totalCash > 0 && acct.baseEquivalent != null ? (acct.baseEquivalent / d!.totalCash) * 100 : 0;
              return (
                <AccountRow
                  key={acct.id}
                  acct={acct}
                  maxGbp={maxGbp}
                  share={share}
                  totalCash={d!.totalCash}
                  isExpanded={!!isExpanded}
                  isEven={i % 2 === 0}
                />
              );
            })
          )}

          {sorted.length > 0 && (
            <tr style={{ background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border2)" }}>
              <td colSpan={3} style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--ft-dim)", textTransform: "uppercase", fontWeight: 600 }}>
                Total Cash · {sorted.length} account{sorted.length !== 1 ? "s" : ""}
              </td>
              <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)", fontWeight: 700 }}>
                <span className="pnum">{formatBaseMoney(d!.totalCash)}</span>
              </td>
              {isExpanded && <td />}
            </tr>
          )}
        </tbody>
      </table>

      {/* Owing strip — border-as-gap pattern */}
      {d && (
        <div style={{ borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {owingItems.map((item, i) => (
            <OwingCell
              key={item.label}
              label={item.label}
              value={item.value}
              color={item.color}
              raw={item.raw}
              isLast={i === owingItems.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <WidgetShell title="Accounts" href="/accounts" linkLabel="→ Manage" isLoading={isLoading} accent="var(--ft-green)">
      {d && tableSection}
    </WidgetShell>
  );
}
