import { useState } from "react";
import { entityHref } from "@/lib/entity-href";
import { Drill, DrillTarget } from "@/components/drill";
import { useGetDashboard } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { CurrencyMark } from "@/components/currency-mark";
import { netAccountsTotal, signedAccountAmount } from "@/lib/account-sign";

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
  acct: { id: number | string; name: string; currency: string; balance: number; baseEquivalent: number | null; type: string };
  maxGbp: number;
  share: number | null;
  isExpanded: boolean;
  isEven: boolean;
};

function AccountRow({ acct, maxGbp, share, isExpanded }: AccountRowProps) {
  const [hov, setHov] = useState(false);
  // A liability is stored positive and signed by its type. This column used
  // to print that magnitude as-is, in green, indistinguishable from savings
  // — and the footer beneath it excluded the same row, so the column did not
  // sum to its own total. One signed figure fixes both: the row goes red and
  // negative (two carriers, never hue alone), and the footer can now add up
  // what is written above it.
  const gbp = signedAccountAmount(acct.type, acct.baseEquivalent);
  // Balance bar reads 0-width for unconvertible accounts — comparing
  // magnitude across currencies needs a GBP figure to normalise.
  const barPct = gbp != null && maxGbp > 0 ? (Math.abs(gbp) / maxGbp) * 100 : 0;
  const isNeg = gbp != null && gbp < 0;

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
          {/* The name is the row's identity, so it is the link: keyboard
              reachable and middle-clickable, unlike an onClick on the <tr>.
              It opens the account's detail surface on /accounts — a query
              parameter, not a route (lib/entity-href.ts). The hand-rolled
              hover colour this carried became `.ft-drill` when the rule was
              swept across the app; one affordance, defined once. */}
          <Drill
            href={entityHref("account", acct.id)}
            style={{
              display: "block",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: isExpanded ? 160 : 110,
            }}
          >
            {acct.name}
          </Drill>
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
      <td style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)" }}>
        <span style={{ color: "var(--ft-dim)" }}>
          <CurrencyMark code={acct.currency} size={10} />
        </span>
      </td>
      <td style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
        <span className="pnum">
          {acct.currency !== "GBP"
            ? formatNative(signedAccountAmount(acct.type, acct.balance), acct.currency)
            : "—"}
        </span>
      </td>
      <td style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: gbp == null ? "var(--ft-dim)" : isNeg ? "var(--ft-red)" : "var(--ft-green)" }}>
        {gbp == null ? "—" : <span className="pnum">{formatBaseMoney(gbp)}</span>}
      </td>
      {isExpanded && (
        <td style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
          <span className="pnum">{share == null ? "—" : `${share.toFixed(1)}%`}</span>
          {/* inline share mini-bar */}
          <div style={{ marginTop: 3, height: 2, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(Math.abs(share ?? 0), 100)}%`, background: "var(--ft-accent)", opacity: 0.6 }} />
          </div>
        </td>
      )}
    </tr>
  );
}

type OwingCellProps = { label: string; value: string; color: string; raw: number; href?: string; isLast: boolean };

function OwingCell({ label, value, raw, color, href, isLast }: OwingCellProps) {
  const [hov, setHov] = useState(false);
  const cell = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "var(--ft-widget-py) var(--ft-widget-px)",
        borderRight: !isLast ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        transition: "background 0.1s",
        // No overflow: hidden — this cell holds a .pnum, and cropping a figure
        // turns "too narrow" into "wrong number". minWidth: 0 stays so the
        // track can still shrink; if it shrinks past the figure the figure
        // overflows, visibly. Locked by pnum-clip.lock.test.ts.
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: raw === 0 ? "var(--ft-dim)" : color, whiteSpace: "nowrap" }}>
        {href && raw !== 0 ? <span className="ft-drill">{value}</span> : (raw === 0 ? "—" : value)}
      </div>
    </div>
  );
  // A zero is "—", and there is nothing behind an em dash to open.
  if (!href || raw === 0) return cell;
  return <DrillTarget href={href} title={`${label} — open what it is made of`}>{cell}</DrillTarget>;
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function AccountsSummaryWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data: d, isLoading } = useGetDashboard();
  const [sort, setSort] = useState<SortKey>("gbp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const accounts = d?.accountBreakdown ?? [];
  const maxGbp = accounts.length > 0 ? Math.max(...accounts.map(a => Math.abs(a.baseEquivalent ?? 0))) : 1;
  // What the rows above the footer actually add up to. `totalCash` is the
  // ASSET total and deliberately excludes liabilities (routes/dashboard.ts
  // keeps the terms apart so the response identity holds), so it is the
  // wrong number to put under a column that lists them.
  const netTotal = netAccountsTotal(accounts);
  const owed = accounts.reduce((s, a) => (a.type === "liability" ? s + (a.baseEquivalent ?? 0) : s), 0);

  const sorted = [...accounts].sort((a, b) => {
    let diff = 0;
    // Sort on the SIGNED figures, the ones actually printed in the column.
    // Sorting the stored magnitudes put a £6,800 loan between £8,100 and
    // £2,450 while the cell beside it read −£6,800 — a descending column
    // that visibly does not descend.
    if (sort === "name") diff = a.name.localeCompare(b.name);
    else if (sort === "balance")
      diff = signedAccountAmount(a.type, a.balance) - signedAccountAmount(b.type, b.balance);
    // GBP sort: unconvertible sinks to the bottom (desc) via -Infinity.
    else
      diff =
        (signedAccountAmount(a.type, a.baseEquivalent) ?? -Infinity) -
        (signedAccountAmount(b.type, b.baseEquivalent) ?? -Infinity);
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
        padding: "var(--ft-widget-py) var(--ft-widget-px)",
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
    { label: "They Owe Me", value: formatBaseMoney(d.owing.totalOwedToMe), color: "var(--ft-green)", raw: d.owing.totalOwedToMe, href: "/owing" },
    { label: "I Owe",        value: formatBaseMoney(d.owing.totalIOwe),     color: "var(--ft-red)",   raw: d.owing.totalIOwe, href: "/owing" },
    // Net Position is one of those two minus the other. Both halves are a
    // tap away and the difference is made of no rows of its own.
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
              <td colSpan={5} style={{ padding: "var(--ft-empty-py) var(--ft-empty-px)", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--ft-dim)" }}>
                No accounts — add via Accounts
              </td>
            </tr>
          ) : (
            sorted.map((acct, i) => {
              // Share % needs a GBP figure to compute against the base total.
              // Without one — an unconvertible account, or no cash at all —
              // the share is unknown, not 0.0%. The GBP cell already
              // em-dashes; the share column must agree with it.
              //
              // The denominator stays `totalCash`, the ASSET total, so the
              // asset rows still sum to 100%. A liability's share is
              // therefore negative — what it takes back out of the assets —
              // which is the honest reading and matches its signed figure.
              const share: number | null =
                d!.totalCash > 0 && acct.baseEquivalent != null
                  ? (signedAccountAmount(acct.type, acct.baseEquivalent)! / d!.totalCash) * 100
                  : null;
              return (
                <AccountRow
                  key={acct.id}
                  acct={acct}
                  maxGbp={maxGbp}
                  share={share}
                  isExpanded={!!isExpanded}
                  isEven={i % 2 === 0}
                />
              );
            })
          )}

          {sorted.length > 0 && (
            <tr style={{ background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border2)" }}>
              <td colSpan={3} style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--ft-dim)", textTransform: "uppercase", fontWeight: 600 }}>
                {/* `totalCash` is every non-liability account, so it counts a
                    flat, a SIPP and an ISA. "Total Cash" said otherwise.
                    The label names the netting when there is netting to
                    name — a footer that silently subtracts a debt is a
                    different figure with no way for a reader to tell. */}
                {owed !== 0 ? "Accounts, net of debt" : "Accounts"} · {sorted.length} account
                {sorted.length !== 1 ? "s" : ""}
              </td>
              <td style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: netTotal < 0 ? "var(--ft-red)" : "var(--ft-green)", fontWeight: 600 }}>
                <Drill
                  href="/accounts"
                  title={
                    owed !== 0
                      ? `Accounts — assets less ${formatBaseMoney(owed)} owed`
                      : "Account assets — every account it is the sum of"
                  }
                >
                  <span className="pnum">{formatBaseMoney(netTotal)}</span>
                </Drill>
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
              href={item.href}
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
