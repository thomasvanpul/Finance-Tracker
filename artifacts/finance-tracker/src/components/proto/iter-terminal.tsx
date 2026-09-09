// ── ITER 3 · TERMINAL ───────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: a Bloomberg terminal panel. Maximum density. No whitespace, no
// cards, no rounded anything; alignment and column position do all the work
// that padding and borders do elsewhere. Every value on the screen at once,
// small, aligned, and readable only because the columns are exact.
//
// The claim being tested: a person who looks at their finances every day
// does not want a page that explains itself. They want everything visible
// so they can SCAN, and they will learn the layout once. Numeris currently
// shows about 30 figures on the dashboard; this shows every figure the four
// endpoints supply, which at the dev account is a little over 200.
//
// Two things it keeps from the reference deliberately: the status strip
// across the top, which is where the terminal puts the readings you check
// without looking, and the vertical rules between columns rather than gaps.
// A gap says "these are separate"; a rule says "these are adjacent", and on
// a dense page adjacency is the whole navigational idea.
//
// What it gives up: everything. There is no hierarchy, nothing is
// emphasised, and the page never tells you what happened — a person who
// does not already know what they are looking for gets nothing from it.
// It is also the only one of the eight that would be unusable on a phone,
// and Numeris is a phone-first product, so choosing this means choosing to
// build the phone separately rather than responsively.
//
// Rules deliberately broken:
//   · DESIGN.md § 3, § 5, § 11 and the Anti-Vibe Constitution's whitespace
//     rules — all of them, comprehensively. Density is the design.
//   · The section-header treatment: headers here are 8px mono on a tinted
//     row, not the app's header rhythm, because at this density the app's
//     header costs four rows of data each time it appears.

import type { ReactNode } from "react";
import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney, formatMoney, formatNative } from "@/lib/utils";
import { useProtoData, shortDay, daysUntil, type ProtoData } from "@/components/proto/proto-data";
import { accountTransactionsHref, categoryTransactionsHref, entityHref } from "@/lib/entity-href";

const RULE = "1px solid var(--ft-border)";

function sign(v: number): string { return v >= 0 ? "var(--ft-green)" : "var(--ft-red)"; }

/** A column heading. One row tall, tinted, no margin — a header that costs
 *  more than one row of data does not belong on this page. */
function Head({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--ft-hover)", padding: "2px 6px", borderTop: RULE, borderBottom: RULE }}>
      <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-muted)">{children}</Text>
    </div>
  );
}

/** Three cells: identifier, middle reading, right figure. Fixed grid so
 *  every row in a column aligns against every other one — which is the only
 *  reason this is readable at all. */
function Row({ a, b, c, cColor, href, title }: {
  a: string; b?: string; c: string; cColor?: string; href?: string; title?: string;
}) {
  const body = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 62px 88px", alignItems: "baseline", columnGap: 6, padding: "1.5px 6px" }}>
      <Text as="span" mono size={10} color="var(--ft-muted)" truncate>{a}</Text>
      <Text as="span" mono size={9} color="var(--ft-dim)" align="right" nowrap>{b ?? ""}</Text>
      <Text as="span" numeric size={10} weight={500} color={cColor ?? "var(--ft-text)"} align="right">{c}</Text>
    </div>
  );
  if (href === undefined) return body;
  return <Drill href={href} title={title} style={{ display: "block" }}>{body}</Drill>;
}

function StatusStrip({ data }: { data: ProtoData }) {
  const attr = data.attribution !== null && data.attribution.status === "ok" ? data.attribution : null;
  const p = data.portfolio;
  const readings: { k: string; v: string; color?: string }[] = [
    { k: "NAV", v: data.netWorth === null ? "—" : formatBaseMoney(data.netWorth) },
    { k: "LIQ", v: data.netLiquidity === null ? "—" : formatBaseMoney(data.netLiquidity) },
    { k: "CASH", v: data.totalCash === null ? "—" : formatBaseMoney(data.totalCash) },
    { k: "PORT", v: p === null ? "—" : formatBaseMoney(p.totalValueBase) },
    { k: "P/L", v: p === null ? "—" : `${p.totalPlBase >= 0 ? "+" : ""}${formatBaseMoney(p.totalPlBase)}`, color: p === null ? undefined : sign(p.totalPlBase) },
    { k: "24H", v: p?.dayChangeBase == null ? "—" : `${p.dayChangeBase >= 0 ? "+" : ""}${formatBaseMoney(p.dayChangeBase)}`, color: p?.dayChangeBase == null ? "var(--ft-dim)" : sign(p.dayChangeBase) },
    { k: "DELTA", v: attr === null ? "—" : `${attr.totalBase >= 0 ? "+" : ""}${formatMoney(attr.totalBase, data.baseCurrency)}`, color: attr === null ? undefined : sign(attr.totalBase) },
    { k: "MTD", v: data.thisMonth === null ? "—" : formatBaseMoney(data.thisMonth.expenses), color: "var(--ft-red)" },
    { k: "DUE", v: data.upcomingTotal === null ? "—" : formatBaseMoney(data.upcomingTotal), color: "var(--ft-amber)" },
    { k: "NET OWED", v: data.owing === null ? "—" : formatBaseMoney(data.owing.netBase), color: data.owing === null ? undefined : sign(data.owing.netBase) },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", border: RULE, background: "var(--ft-surface)" }}>
      {readings.map((r, i) => (
        <div key={r.k} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 12px", borderLeft: i === 0 ? undefined : RULE }}>
          <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-dim)">{r.k}</Text>
          <Text as="span" numeric size={12} weight={600} color={r.color ?? "var(--ft-text)"}>{r.v}</Text>
        </div>
      ))}
    </div>
  );
}

export function TerminalDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const attr = data.attribution !== null && data.attribution.status === "ok" ? data.attribution : null;

  return (
    <div style={{ display: "grid", gap: 6, paddingBottom: 24 }}>
      <StatusStrip data={data} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", border: RULE, background: "var(--ft-surface)" }}>
        {/* 1 · POSITIONS */}
        <div style={{ minWidth: 0 }}>
          <Head>Positions · {data.accounts.length}</Head>
          {data.accounts.map((a) => (
            <Row key={a.id} a={a.name} b={a.currency}
              c={a.baseEquivalent === null ? "—" : formatBaseMoney(a.baseEquivalent)}
              href={entityHref("account", a.id)} title={`Open ${a.name}`} />
          ))}
          <Head>Native</Head>
          {data.accounts.filter((a) => a.currency !== data.baseCurrency).map((a) => (
            <Row key={a.id} a={a.name} b={a.currency} c={formatNative(a.balance, a.currency)} cColor="var(--ft-muted)" />
          ))}
          <Head>Composition</Head>
          {data.composition.map((g) => (
            <Row key={g.key} a={g.key} b={`${(g.share * 100).toFixed(1)}%`} c={formatBaseMoney(g.base)} />
          ))}
          <Head>Currency exposure</Head>
          {data.exposure.map((g) => (
            <Row key={g.key} a={g.key} b={`${(g.share * 100).toFixed(1)}%`} c={formatBaseMoney(g.base)}
              cColor={g.key === data.baseCurrency ? "var(--ft-muted)" : "var(--ft-amber)"} />
          ))}
        </div>

        {/* 2 · ATTRIBUTION */}
        <div style={{ minWidth: 0, borderLeft: RULE }}>
          <Head>Change · {attr?.windowLabel ?? "no window"}</Head>
          {attr !== null && (
            <>
              <Row a="TOTAL" c={`${attr.totalBase >= 0 ? "+" : ""}${formatMoney(attr.totalBase, data.baseCurrency)}`} cColor={sign(attr.totalBase)} />
              {attr.rows.map((r) => (
                <Row key={r.kind} a={r.label} b={r.detail.slice(0, 12)} c={`${r.amountBase >= 0 ? "+" : ""}${formatMoney(r.amountBase, data.baseCurrency)}`}
                  cColor={sign(r.amountBase)} href={r.drillHref} title="Open the rows behind this" />
              ))}
              {attr.rows.flatMap((r) => r.breakdown).map((b) => (
                <Row key={b.label} a={`  ${b.label}`} c={`${b.amountBase >= 0 ? "+" : ""}${formatMoney(b.amountBase, data.baseCurrency)}`}
                  cColor="var(--ft-dim)" href={b.drillHref} title="Open this account" />
              ))}
            </>
          )}
          <Head>Monthly · {data.months.length}</Head>
          {data.months.map((m) => (
            <Row key={m.month} a={m.month} b={formatBaseMoney(m.income)} c={formatBaseMoney(m.expenses)} cColor="var(--ft-red)" />
          ))}
          <Head>Net by month</Head>
          {data.months.map((m) => (
            <Row key={m.month} a={m.short} c={`${m.netSavings >= 0 ? "+" : ""}${formatBaseMoney(m.netSavings)}`} cColor={sign(m.netSavings)} />
          ))}
          <Head>Portfolio</Head>
          {data.portfolio !== null && (
            <>
              <Row a="Value" c={formatBaseMoney(data.portfolio.totalValueBase)} />
              <Row a="P/L" b={data.portfolio.totalPlPercent === null ? "—" : `${data.portfolio.totalPlPercent.toFixed(2)}%`}
                c={`${data.portfolio.totalPlBase >= 0 ? "+" : ""}${formatBaseMoney(data.portfolio.totalPlBase)}`} cColor={sign(data.portfolio.totalPlBase)} />
              <Row a="Day" b={data.portfolio.dayChangePercent === null ? "—" : `${data.portfolio.dayChangePercent.toFixed(2)}%`}
                c={data.portfolio.dayChangeBase === null ? "—" : `${data.portfolio.dayChangeBase >= 0 ? "+" : ""}${formatBaseMoney(data.portfolio.dayChangeBase)}`}
                cColor={data.portfolio.dayChangeBase === null ? "var(--ft-dim)" : sign(data.portfolio.dayChangeBase)} />
            </>
          )}
        </div>

        {/* 3 · LEDGER */}
        <div style={{ minWidth: 0, borderLeft: RULE }}>
          <Head>Ledger · {data.txns.length}</Head>
          {data.txns.slice(0, 26).map((t) => (
            <Row key={t.id} a={t.description} b={shortDay(t.date)}
              c={t.baseEquivalent === null ? "—" : formatBaseMoney(t.baseEquivalent)}
              cColor={t.type === "income" ? "var(--ft-green)" : "var(--ft-text)"}
              href={accountTransactionsHref(t.accountId)} title={`Every row on ${t.accountName}`} />
          ))}
        </div>

        {/* 4 · RANKS */}
        <div style={{ minWidth: 0, borderLeft: RULE }}>
          <Head>Categories · {data.categories.length}</Head>
          {data.categories.map((c) => (
            <Row key={c.name} a={c.name} b={`${c.count}×`} c={formatBaseMoney(c.total)}
              href={categoryTransactionsHref(c.name)} title={`Every ${c.name} row`} />
          ))}
          <Head>Merchants · top 10</Head>
          {data.merchants.slice(0, 10).map((m) => (
            <Row key={m.name} a={m.name} b={`${m.count}×`} c={formatBaseMoney(m.total)} cColor="var(--ft-muted)" />
          ))}
          <Head>Due</Head>
          {data.upcoming.map((u) => (
            <Row key={u.id} a={u.description} b={`${daysUntil(u.dueDate)}d`}
              c={u.baseEquivalent === null ? "—" : formatBaseMoney(u.baseEquivalent)} cColor="var(--ft-amber)" />
          ))}
          <Head>Owed</Head>
          {(data.owing?.topPending ?? []).map((p) => (
            <Row key={p.name} a={p.name} b={p.daysOutstanding === undefined ? "" : `${p.daysOutstanding}d`}
              c={formatBaseMoney(p.amountBase)}
              cColor={p.direction === "they_owe_me" ? "var(--ft-green)" : "var(--ft-red)"} />
          ))}
        </div>
      </div>
    </div>
  );
}
