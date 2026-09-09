// ── ITER 2 · STRIPE ─────────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: the Stripe Dashboard. Its organising idea is that the primary
// surface of a financial product is a TABLE, and everything else — the stat
// row at the top, the sparklines — is a summary of a table you can open. It
// is neutral to the point of being grey; colour appears only as status, and
// a figure is always right-aligned against the figure above it.
//
// So this page is two tables and a rail. No hero. The largest figure on it
// is 22px, and net worth is a cell in a stat row rather than the subject of
// the page — which is the actual claim being tested: is the dashboard a
// summary of records, or a statement about a number?
//
// Sparklines appear ONLY on income and spend, because those are the only
// two series the API supplies a history for. There is no net-worth history
// endpoint, and drawing a plausible line for it is exactly the fabrication
// this repo locks against — so those two cells carry a mark and the other
// two do not, and the inconsistency is the honest reading.
//
// What it gives up: the page never says anything. It shows you where to
// look and refuses to draw a conclusion — the opposite of iteration 5.
//
// Rules deliberately broken: none of DESIGN.md's, notably. This is the one
// of the eight that sits closest to the existing language, which is itself
// a finding: Numeris's table treatment is already near this reference, and
// what it lacks is the discipline to make tables the WHOLE page.

import type { ReactNode } from "react";
import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney, formatNative } from "@/lib/utils";
import { Spark, ShareBar } from "@/components/proto/proto-marks";
import { useProtoData, shortDay, type ProtoData } from "@/components/proto/proto-data";
import { accountTransactionsHref, categoryTransactionsHref, entityHref } from "@/lib/entity-href";

const ROW_BORDER = "1px solid var(--ft-border)";

function Th({ children, align = "left", width }: { children: ReactNode; align?: "left" | "right"; width?: number | string }) {
  return (
    <th style={{ textAlign: align, padding: "0 14px 8px", width, borderBottom: ROW_BORDER }}>
      <Text as="span" mono size={9} upper letterSpacing="0.11em" color="var(--ft-dim)">{children}</Text>
    </th>
  );
}

/** `clip` wraps the cell in a block box so a truncating span actually
 *  truncates — `overflow` does nothing on a non-replaced inline element, so
 *  the rail's descriptions ran straight into the figure beside them. It is
 *  passed ONLY on identifier columns. A figure column never gets it: a
 *  clipped figure that reads as a different plausible number is the one
 *  defect this repo will not ship (CLAUDE.md). */
function Td({ children, align = "left", width, clip = false }: {
  children: ReactNode; align?: "left" | "right"; width?: number | string; clip?: boolean;
}) {
  return (
    <td style={{ textAlign: align, padding: "9px 14px", borderBottom: ROW_BORDER, width, verticalAlign: "middle" }}>
      {clip ? <div style={{ overflow: "hidden", minWidth: 0 }}>{children}</div> : children}
    </td>
  );
}

/** The four cells above the tables. A summary of a table, in the reference's
 *  terms — so each one opens the rows it summarises. */
function StatRow({ data }: { data: ProtoData }) {
  const spendSeries = data.months.map((m) => m.expenses);
  const incomeSeries = data.months.map((m) => m.income);
  const cells: { label: string; value: string; href: string; series: number[] | null; color: string }[] = [
    { label: "Net worth", value: data.netWorth === null ? "—" : formatBaseMoney(data.netWorth), href: "/net-worth", series: null, color: "var(--ft-text)" },
    { label: "Cash", value: data.totalCash === null ? "—" : formatBaseMoney(data.totalCash), href: "/accounts", series: null, color: "var(--ft-text)" },
    { label: `Income · ${data.months.length} mo`, value: formatBaseMoney(incomeSeries.reduce((s, v) => s + v, 0)), href: "/transactions?type=income", series: incomeSeries, color: "var(--ft-green)" },
    { label: `Spend · ${data.months.length} mo`, value: formatBaseMoney(spendSeries.reduce((s, v) => s + v, 0)), href: "/transactions?type=expense", series: spendSeries, color: "var(--ft-red)" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: ROW_BORDER, background: "var(--ft-surface)" }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ padding: "16px 20px 14px", borderLeft: i === 0 ? undefined : ROW_BORDER, display: "grid", gap: 9 }}>
          <Text as="span" size={11} color="var(--ft-dim)">{c.label}</Text>
          <Drill href={c.href} title={`Open the rows behind ${c.label.toLowerCase()}`}>
            <Text as="span" numeric size={22} weight={600} letterSpacing="-0.02em" color="var(--ft-text)">{c.value}</Text>
          </Drill>
          <div style={{ height: 22, display: "flex", alignItems: "flex-end" }}>
            {c.series !== null && <Spark values={c.series} width={150} height={22} color={c.color} fill />}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableFrame({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div style={{ border: ROW_BORDER, background: "var(--ft-surface)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "13px 14px 12px", borderBottom: ROW_BORDER }}>
        <Text as="span" size={13} weight={600} color="var(--ft-text)">{title}</Text>
        {note !== undefined && <Text as="span" mono size={10} color="var(--ft-dim)">{note}</Text>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>{children}</table>
    </div>
  );
}

export function StripeDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const rows = data.txns.slice(0, 12);

  return (
    <div style={{ paddingBottom: 60, display: "grid", gap: 22 }}>
      <StatRow data={data} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 22, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 22 }}>
          <TableFrame title="Accounts" note={`${data.accounts.length} · share of ${data.baseCurrency ?? ""} value`}>
            <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 140 }} /><col style={{ width: 132 }} /><col style={{ width: 140 }} /></colgroup>
            <thead><tr>
              <Th>Account</Th><Th>Type</Th><Th align="right">Native</Th><Th>Share</Th><Th align="right">Base</Th>
            </tr></thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <Td clip>
                    <Drill href={entityHref("account", a.id)} title={`Open ${a.name}`}>
                      <Text as="span" size={13} color="var(--ft-text)" truncate>{a.name}</Text>
                    </Drill>
                  </Td>
                  <Td><Text as="span" mono size={10} upper letterSpacing="0.07em" color="var(--ft-dim)">{a.type}</Text></Td>
                  <Td align="right">
                    <Text as="span" numeric size={12} color={a.currency === data.baseCurrency ? "var(--ft-dim)" : "var(--ft-muted)"}>
                      {formatNative(a.balance, a.currency)}
                    </Text>
                  </Td>
                  <Td>{a.share !== null && <ShareBar share={a.share} width="100%" height={4} color="var(--ft-muted)" />}</Td>
                  <Td align="right">
                    <Text as="span" numeric size={13} weight={600} color="var(--ft-text)">
                      {a.baseEquivalent === null ? "—" : formatBaseMoney(a.baseEquivalent)}
                    </Text>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>

          <TableFrame title="Transactions" note={`latest ${rows.length} of ${data.txns.length}`}>
            <colgroup><col style={{ width: 76 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 132 }} /></colgroup>
            <thead><tr>
              <Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Account</Th><Th align="right">Amount</Th>
            </tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <Td><Text as="span" numeric size={11} color="var(--ft-dim)">{shortDay(t.date)}</Text></Td>
                  <Td clip><Text as="span" size={13} color="var(--ft-text)" truncate>{t.description}</Text></Td>
                  <Td clip>
                    <Drill href={categoryTransactionsHref(t.category)} title={`Every ${t.category} row`}>
                      <Text as="span" size={11} color="var(--ft-muted)" truncate>{t.category}</Text>
                    </Drill>
                  </Td>
                  <Td clip>
                    <Drill href={accountTransactionsHref(t.accountId)} title={`Every row on ${t.accountName}`}>
                      <Text as="span" size={11} color="var(--ft-dim)" truncate>{t.accountName}</Text>
                    </Drill>
                  </Td>
                  <Td align="right">
                    <Text as="span" numeric size={13} weight={600} color={t.type === "income" ? "var(--ft-green)" : "var(--ft-text)"}>
                      {t.baseEquivalent === null ? "—" : formatBaseMoney(t.baseEquivalent)}
                    </Text>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </div>

        {/* The rail. Two more tables, narrower — not a different species of
            surface. A card here would say "this is a different kind of
            thing", and it is not: it is the same rows, fewer columns. */}
        <div style={{ display: "grid", gap: 22 }}>
          <TableFrame title="Upcoming" note={data.upcomingTotal === null ? undefined : formatBaseMoney(data.upcomingTotal)}>
            <colgroup><col style={{ width: 66 }} /><col /><col style={{ width: 92 }} /></colgroup>
            <tbody>
              {data.upcoming.map((u) => (
                <tr key={u.id}>
                  <Td><Text as="span" numeric size={11} color="var(--ft-dim)">{shortDay(u.dueDate)}</Text></Td>
                  <Td clip><Text as="span" size={12} color="var(--ft-text)" truncate>{u.description}</Text></Td>
                  <Td align="right">
                    <Text as="span" numeric size={12} weight={600} color="var(--ft-text)">
                      {u.baseEquivalent === null ? "—" : formatBaseMoney(u.baseEquivalent)}
                    </Text>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>

          <TableFrame title="Top spend" note={`${data.categories.length} categories`}>
            <colgroup><col /><col style={{ width: 74 }} /><col style={{ width: 96 }} /></colgroup>
            <tbody>
              {data.categories.slice(0, 7).map((c) => (
                <tr key={c.name}>
                  <Td clip>
                    <Drill href={categoryTransactionsHref(c.name)} title={`Every ${c.name} row`}>
                      <Text as="span" size={12} color="var(--ft-text)" truncate>{c.name}</Text>
                    </Drill>
                  </Td>
                  <Td><ShareBar share={c.share} width="100%" height={4} color="var(--ft-muted)" /></Td>
                  <Td align="right"><Text as="span" numeric size={12} color="var(--ft-muted)">{formatBaseMoney(c.total)}</Text></Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </div>
      </div>
    </div>
  );
}
