// Reconciliation gap — the desktop reasoning behind the phone's number.
//
// Per cash account: what the balance did, what the ledger says, and the
// difference. The phone (WorthScreen InsightSlot) shows only the total and
// an action; this panel is where the period rule and the caveats live.
//
// Three states, none of them a fabricated figure:
//   insufficient  "Not enough history yet" — no number at all
//   reconciled    every gap within half a penny — says so, in words
//   gap           the table
//
// Native first, base second, on every foreign row (Mobile Amendment
// signature device, applied here too so the two surfaces agree).

import type { CSSProperties } from "react";
import { useGetAccountsReconciliation, type ReconciliationAccount } from "@workspace/api-client-react";
import { PanelHeader, Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { entityHref, accountTransactionsHref } from "@/lib/entity-href";
import { formatMoney } from "@/lib/utils";
import { formatShortDate, reconciliationPeriodLabel, isUntracked } from "@/lib/reconciliation-insight";

const ZERO_TOLERANCE = 0.005;

const cell: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  padding: "5px 10px",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const head: CSSProperties = {
  ...cell,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontWeight: 600,
};
const num: CSSProperties = { ...cell, textAlign: "right" };
// The account name and the "N tx · notes" cell are language (§10); the three
// figure columns beside them stay mono. Same row, two families, by design.
const name: CSSProperties = { ...cell, fontFamily: "var(--font-sans)", fontSize: 11 };

function gapColour(gap: number): string {
  if (Math.abs(gap) < ZERO_TOLERANCE) return "var(--ft-dim)";
  return gap < 0 ? "var(--ft-red)" : "var(--ft-amber)";
}

function Row({ a, baseCurrency }: { a: ReconciliationAccount; baseCurrency: string }) {
  const foreign = a.currency !== baseCurrency;
  const notes: string[] = [];
  // Named first because it is a different diagnosis from the others: not a
  // row that went wrong, but an account with no rows at all behind a balance
  // that moved. See isUntracked for why this is worth saying.
  if (isUntracked(a)) notes.push("nothing recorded — balance kept by hand");
  if (a.editedSinceBaseline > 0) notes.push(`${a.editedSinceBaseline} older tx edited`);
  if (a.fxSkippedTransactions > 0) notes.push(`${a.fxSkippedTransactions} tx not converted`);
  return (
    <tr>
      {/* The name opens the account; the gap opens the rows the gap is
          measured against. Both are made of rows (DESIGN.md §14). The two
          middle columns are not: "balance moved" is a difference between two
          snapshots and "ledger says" is already the sum of what the gap
          column links to. */}
      <td style={name}><Drill href={entityHref("account", a.accountId)}>{a.name}</Drill></td>
      <td className="pnum" style={num}>{formatMoney(a.balanceChange, a.currency)}</td>
      <td className="pnum" style={num}>{formatMoney(a.ledgerChange, a.currency)}</td>
      <td className="pnum" style={{ ...num, fontWeight: 700, color: gapColour(a.gap) }}>
        <Drill
          href={accountTransactionsHref(a.accountId)}
          title={`Transactions on ${a.name}`}
        >
          {formatMoney(a.gap, a.currency)}
        </Drill>
        {foreign && (
          <span style={{ color: "var(--ft-dim)", fontWeight: 400, marginLeft: 6 }}>
            {a.gapBase == null ? "fx unavailable" : `fx ${formatMoney(a.gapBase, baseCurrency)}`}
          </span>
        )}
      </td>
      <td style={{ ...name, color: "var(--ft-dim)", fontSize: 10 }}>
        {a.transactionsCounted} tx{notes.length > 0 ? ` · ${notes.join(" · ")}` : ""}
      </td>
    </tr>
  );
}

export function ReconciliationPanel() {
  const { data: report, isLoading, isError } = useGetAccountsReconciliation();
  if (isLoading || isError || report == null) return null;

  const period = reconciliationPeriodLabel(report);
  const rule = report.periodRule === "month-to-date"
    ? "Month-to-date: every cash account has a snapshot dated the 1st."
    : "Since the first day every cash account has a snapshot; switches to month-to-date the first month that starts with one.";

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <PanelHeader
        right={report.status === "ok" ? (
          <Text as="span" mono size={9} color="var(--ft-dim)" letterSpacing="0.04em">
            {formatShortDate(report.periodFrom!)} to {formatShortDate(report.periodTo)} · {report.days}d
          </Text>
        ) : undefined}
      >
        UNACCOUNTED — {report.status === "ok" ? period.toUpperCase() : "CASH ACCOUNTS"}
      </PanelHeader>

      {report.status !== "ok" ? (
        <div style={{ padding: "12px 10px" }}>
          <Text as="div" size={11} color="var(--ft-muted)">
            Not enough history yet.
            {report.dataAvailableSince == null
              ? " No balance snapshot has been taken; the first is written the next time the dashboard loads."
              : ` First snapshot ${formatShortDate(report.dataAvailableSince)}; a gap needs a baseline from an earlier day than today.`}
          </Text>
        </div>
      ) : report.gapBase != null && Math.abs(report.gapBase) < ZERO_TOLERANCE && report.unconvertibleAccounts === 0 ? (
        <div style={{ padding: "12px 10px" }}>
          <Text as="div" size={11} color="var(--ft-muted)">
            Balances match the ledger {period}. {report.accounts.length} cash account{report.accounts.length === 1 ? "" : "s"} checked.
          </Text>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: "left" }}>Account</th>
                <th style={{ ...head, textAlign: "right" }}>Balance moved</th>
                <th style={{ ...head, textAlign: "right" }}>Ledger says</th>
                <th style={{ ...head, textAlign: "right" }}>Unaccounted</th>
                <th style={{ ...head, textAlign: "left" }}>Since baseline</th>
              </tr>
            </thead>
            <tbody>
              {report.accounts.map((a) => <Row key={a.accountId} a={a} baseCurrency={report.baseCurrency} />)}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...name, borderBottom: "none", fontWeight: 600 }} colSpan={3}>Total, {report.baseCurrency}</td>
                <td className="pnum" style={{ ...num, borderBottom: "none", fontWeight: 700, color: report.gapBase == null ? "var(--ft-dim)" : gapColour(report.gapBase) }}>
                  {report.gapBase == null ? "—" : formatMoney(report.gapBase, report.baseCurrency)}
                </td>
                <td style={{ ...name, borderBottom: "none", color: "var(--ft-dim)", fontSize: 10 }}>
                  {report.unconvertibleAccounts > 0 ? `${report.unconvertibleAccounts} account${report.unconvertibleAccounts === 1 ? "" : "s"} not in total` : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ padding: "6px 10px 8px", borderTop: "1px solid var(--ft-border)" }}>
        <Text as="div" size={11} color="var(--ft-dim)" lineHeight={1.45}>
          Balance movement minus transactions recorded since the baseline snapshot, cash accounts only; a manual balance
          correction, or an edit or deletion of an older transaction, lands here. {rule}
        </Text>
      </div>
    </div>
  );
}
