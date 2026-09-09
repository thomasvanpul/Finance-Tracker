// ── ITER 8 · TIMELINE (free choice) ─────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// What this one is testing, since it has no external reference:
//
//   Is a finance dashboard actually a LOG?
//
// The other seven all answer "what is true now" and differ only in how they
// arrange the answer. This one says the question is wrong. Every figure in
// this product is the consequence of a dated event — a payment, a rate
// change, a bill that has not left yet — and a dashboard that shows the
// figures without the events is showing you an answer with the working
// thrown away. So there is one spine, time runs down it, and net worth is
// not a headline: it is a READING TAKEN AT A POINT on the spine, marked
// where the future stops and the past begins.
//
// It borrows the repo's own mobile signature rather than another product's:
// dotted means not-yet-real, solid means it happened. Above the NOW rule
// everything is dotted, including the spine. Below it everything is solid.
// That device is already in the product and nothing else on the desktop
// uses it, which is a reason to look at it here.
//
// What it gives up: comparison. There is no ranked list anywhere on this
// page, so "what do I spend most on" is unanswerable — you would have to
// read the whole log and add it up. It is also unbounded: 46 rows fit, and
// 4,600 would need a filter, at which point it stops being a dashboard and
// becomes the transactions screen with a different border.
//
// Rules deliberately broken:
//   · DESIGN.md § 3's group rhythm — the spacing here is driven by the gap
//     between DATES, not by grouping, so an idle week is a real gap.
//   · The dotted-means-provisional device is specified in the Mobile
//     Amendment for phone widths; this uses it at 1440.

import type { ReactNode } from "react";
import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney, formatMoney } from "@/lib/utils";
import { useProtoData, sumBase, shortDay, daysUntil, type ProtoData } from "@/components/proto/proto-data";
import { accountTransactionsHref, entityHref } from "@/lib/entity-href";

const GUTTER = 74;
const SPINE = 15;

/** One row on the spine. `real` picks solid or dotted for both the node and
 *  the segment of spine it owns — the device is only legible if the line
 *  and the node agree. */
function Event({ date, real, title, sub, amount, amountColor, href, hrefTitle, big = false }: {
  date: string; real: boolean; title: ReactNode; sub?: string;
  amount?: string; amountColor?: string; href?: string; hrefTitle?: string; big?: boolean;
}) {
  const stroke = real ? "var(--ft-border2)" : "var(--ft-dim)";
  const body = (
    <div style={{ display: "grid", gridTemplateColumns: `${GUTTER}px ${SPINE}px minmax(0, 1fr) 132px`, columnGap: 12, alignItems: "start", minHeight: 34 }}>
      <Text as="span" numeric size={11} color="var(--ft-dim)" align="right">{date}</Text>
      <div style={{ position: "relative", alignSelf: "stretch" }} aria-hidden="true">
        <div style={{
          position: "absolute", left: 5, top: 0, bottom: 0, width: 0,
          borderLeft: `1px ${real ? "solid" : "dashed"} ${stroke}`,
        }} />
        <div style={{
          position: "absolute", left: 1, top: 6, width: 9, height: 9,
          borderRadius: "50%",
          background: real ? "var(--ft-muted)" : "var(--ft-base)",
          border: `1px ${real ? "solid" : "dashed"} ${real ? "var(--ft-muted)" : "var(--ft-dim)"}`,
        }} />
      </div>
      <div style={{ minWidth: 0, paddingBottom: 14 }}>
        <Text as="div" size={big ? 15 : 13} weight={big ? 600 : 400} color="var(--ft-text)" truncate>{title}</Text>
        {sub !== undefined && <Text as="div" size={11} color="var(--ft-dim)" mt={2}>{sub}</Text>}
      </div>
      <Text as="span" numeric size={big ? 15 : 13} weight={big ? 600 : 500} align="right" color={amountColor ?? "var(--ft-text)"}>
        {amount ?? ""}
      </Text>
    </div>
  );
  if (href === undefined) return body;
  return <Drill href={href} title={hrefTitle} style={{ display: "block" }}>{body}</Drill>;
}

/** The reading taken at this instant. Not a headline — a marker on the
 *  spine that happens to carry the biggest figure on the page. */
function NowRule({ data }: { data: ProtoData }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${GUTTER}px ${SPINE}px minmax(0, 1fr) 132px`, columnGap: 12, alignItems: "center", padding: "18px 0 22px" }}>
      <Text as="span" mono size={10} upper letterSpacing="0.14em" color="var(--ft-text)" align="right">Now</Text>
      <div style={{ position: "relative", alignSelf: "stretch" }} aria-hidden="true">
        <div style={{ position: "absolute", left: 1, top: "50%", width: 9, height: 9, marginTop: -4.5, background: "var(--ft-text)", borderRadius: "50%" }} />
      </div>
      <div style={{ borderTop: "1px solid var(--ft-text)", paddingTop: 12 }}>
        <Text as="div" size={12} color="var(--ft-dim)" mb={4}>Net worth, this instant</Text>
        <Drill href="/net-worth" title="Everything this is the total of">
          <Text as="span" numeric size={38} weight={600} letterSpacing="-0.03em" color="var(--ft-text)">
            {data.netWorth === null ? "—" : formatBaseMoney(data.netWorth)}
          </Text>
        </Drill>
      </div>
      <div style={{ borderTop: "1px solid var(--ft-text)", paddingTop: 12, display: "grid", gap: 3, justifyItems: "end" }}>
        <Text as="span" size={11} color="var(--ft-dim)">Liquid</Text>
        <Text as="span" numeric size={13} color="var(--ft-muted)">{data.netLiquidity === null ? "—" : formatBaseMoney(data.netLiquidity)}</Text>
      </div>
    </div>
  );
}

interface DayGroup { date: string; rows: ProtoData["txns"] }

function groupByDay(txns: ProtoData["txns"]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const t of txns) {
    const last = out[out.length - 1];
    if (last !== undefined && last.date === t.date) last.rows.push(t);
    else out.push({ date: t.date, rows: [t] });
  }
  return out;
}

export function TimelineDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const attr = data.attribution !== null && data.attribution.status === "ok" ? data.attribution : null;
  // Furthest future at the top, so reading down travels forward-to-now and
  // then on into the past. A reversed future column reads as two lists.
  const future = [...data.upcoming].reverse();
  const days = groupByDay(data.txns).slice(0, 14);
  // The attribution window ends now — the view carries its label but not
  // its end date, and the end date is today by construction.
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div style={{ maxWidth: 860, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingBottom: 22 }}>
        <Text as="h1" size={15} weight={600} color="var(--ft-text)">Everything, in order</Text>
        <Text as="span" size={11} color="var(--ft-dim)">
          {`${data.upcoming.length} ahead · ${data.txns.length} behind`}
        </Text>
      </div>

      {future.map((u) => (
        <Event key={`u-${u.id}`} date={shortDay(u.dueDate)} real={false}
          title={u.description}
          sub={`${u.category} · in ${daysUntil(u.dueDate)} days · ${u.accountName ?? ""}`}
          amount={u.baseEquivalent === null ? "—" : formatBaseMoney(u.baseEquivalent)}
          amountColor="var(--ft-dim)" />
      ))}

      <NowRule data={data} />

      {/* The rate move is an event, not a statistic. Putting it on the same
          spine as a coffee is the whole argument: both changed the figure
          above, and only one of them was a decision. */}
      {attr !== null && attr.rows.map((r) => (
        <Event key={`a-${r.kind}`} date={shortDay(todayIso)} real
          big
          title={data.finding?.lead ?? r.label}
          sub={`${r.detail} · ${attr.windowLabel}`}
          amount={`${r.amountBase >= 0 ? "+" : ""}${formatMoney(r.amountBase, data.baseCurrency)}`}
          amountColor={r.amountBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          href={r.drillHref} hrefTitle="Open the rows behind this" />
      ))}
      {attr !== null && attr.rows.flatMap((r) => r.breakdown).map((b) => (
        <Event key={`ab-${b.label}`} date="" real title={b.label}
          amount={`${b.amountBase >= 0 ? "+" : ""}${formatMoney(b.amountBase, data.baseCurrency)}`}
          amountColor="var(--ft-dim)" href={b.drillHref} hrefTitle="Open this account" />
      ))}

      {days.map((day) => {
        // baseEquivalent arrives ALREADY signed — an expense row is
        // negative — so the day total is a plain sum. Re-deriving the sign
        // from t.type here inverted every spend into income, which the
        // first screenshot showed as "+£3.85" above a row reading "-£3.85".
        // Null if any row in the day is unconvertible: a day total that
        // silently drops a row is worse than no day total.
        const total = sumBase(day.rows.map((t) => t.baseEquivalent));
        return (
          <div key={day.date}>
            <Event date={shortDay(day.date)} real
              title={<Text as="span" mono size={10} upper letterSpacing="0.13em" color="var(--ft-muted)">{`${day.rows.length} ${day.rows.length === 1 ? "entry" : "entries"}`}</Text>}
              amount={total === null ? "—" : `${total >= 0 ? "+" : ""}${formatBaseMoney(total)}`}
              amountColor={total === null ? "var(--ft-dim)" : total >= 0 ? "var(--ft-green)" : "var(--ft-muted)"} />
            {day.rows.map((t) => (
              <Event key={t.id} date="" real title={t.description} sub={`${t.category} · ${t.accountName}`}
                amount={t.baseEquivalent === null ? "—" : formatBaseMoney(t.baseEquivalent)}
                amountColor={t.type === "income" ? "var(--ft-green)" : "var(--ft-muted)"}
                href={accountTransactionsHref(t.accountId)} hrefTitle={`Every row on ${t.accountName}`} />
            ))}
          </div>
        );
      })}

      <div style={{ display: "grid", gridTemplateColumns: `${GUTTER}px ${SPINE}px minmax(0, 1fr)`, columnGap: 12, paddingTop: 4 }}>
        <span /><span />
        <Drill href={entityHref("account", data.accounts[0]?.id ?? 0)} title="Open the largest account">
          <Text as="span" size={11} color="var(--ft-dim)">{`${data.txns.length - days.reduce((s, d) => s + d.rows.length, 0)} older entries`}</Text>
        </Drill>
      </div>
    </div>
  );
}
