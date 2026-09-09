// ── ITER 4 · LINEAR ─────────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: Linear. Dark-first, one accent colour, strict contrast, three
// type sizes for the entire product, rows 34px tall, and no ornament of any
// kind — no bars, no sparklines, no charts, no icons that are not a state.
//
// The discipline being tested is subtraction. Every other iteration here
// adds a mark to say something; this one asks whether a finance dashboard
// can say it with text, alignment and exactly one colour. The accent is
// used TWICE on the whole page — on the concentration warning and on the
// nearest due date — and if a third use ever appears the design has failed
// on its own terms.
//
// Structure follows Linear's issue view rather than its board: a list on
// the left that is the subject, and a properties rail on the right that is
// metadata about the subject. So net worth is a PROPERTY here, not a hero —
// the subject of the page is the accounts, and the totals describe them.
//
// What it gives up: every magnitude comparison. Without a bar or a chart,
// "£154,478 vs £27,500" is two strings the reader has to compare
// numerically, and the 67% concentration that iterations 5, 6 and 7 make
// visible is here a sentence you have to read. That is the cost of the
// restraint, and it is a real one for a page about proportions.
//
// Rules deliberately broken:
//   · DESIGN.md § 11 restricts the accent; this page uses it as a pure
//     attention mark on two non-adjacent things, which is a narrower reading
//     than the file's, not a wider one.
//   · Row height is 34px throughout, which flattens the app's density
//     ladder — every row on the page is the same importance by construction.

import type { ReactNode } from "react";
import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney, formatNative } from "@/lib/utils";
import { useProtoData, shortDay, daysUntil, type ProtoData } from "@/components/proto/proto-data";
import { accountTransactionsHref, entityHref } from "@/lib/entity-href";

// Three sizes. That is the whole ladder.
const LG = 20, MD = 13, SM = 11;
const ROW_H = 34;

/** A 5px ring. The only glyph on the page, and it carries state — filled
 *  accent for the one thing that needs attention, hollow for everything
 *  else. Drawn rather than typed so it cannot be an emoji. */
function Ring({ on }: { on: boolean }) {
  return (
    <svg width={7} height={7} viewBox="0 0 7 7" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <circle cx={3.5} cy={3.5} r={2.5} fill={on ? "var(--ft-accent)" : "none"} stroke={on ? "var(--ft-accent)" : "var(--ft-border2)"} strokeWidth={1} />
    </svg>
  );
}

function ListRow({ ring, left, sub, right, href, title }: {
  ring: boolean; left: string; sub?: string; right: ReactNode; href?: string; title?: string;
}) {
  const body = (
    <div style={{ display: "flex", alignItems: "center", gap: 11, height: ROW_H, borderBottom: "1px solid var(--ft-border)" }}>
      <Ring on={ring} />
      <Text as="span" size={MD} color="var(--ft-text)" truncate>{left}</Text>
      {sub !== undefined && <Text as="span" size={SM} color="var(--ft-dim)" nowrap>{sub}</Text>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
  if (href === undefined) return body;
  return <Drill href={href} title={title} style={{ display: "block" }}>{body}</Drill>;
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: ROW_H }}>
        <Text as="span" size={SM} weight={500} color="var(--ft-muted)">{title}</Text>
        <Text as="span" numeric size={SM} color="var(--ft-dim)">{count}</Text>
      </div>
      {children}
    </div>
  );
}

/** The rail. Label left, value right, one row each — Linear's property
 *  panel exactly, including that it never emphasises any of them. */
function Prop({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, height: ROW_H }}>
      <Text as="span" size={SM} color="var(--ft-dim)">{label}</Text>
      <Text as="span" numeric size={MD} color={color ?? "var(--ft-text)"}>{value}</Text>
    </div>
  );
}

function concentration(data: ProtoData): { account: string; pct: number } | null {
  const top = data.accounts[0];
  if (top === undefined || top.share === null) return null;
  return { account: top.name, pct: Math.round(top.share * 100) };
}

export function LinearDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const conc = concentration(data);
  const soonest = data.upcoming[0] ?? null;
  const p = data.portfolio;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 268px", gap: 44, alignItems: "start", paddingBottom: 60, maxWidth: 1180 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 18 }}>
          <Text as="h1" size={LG} weight={500} letterSpacing="-0.015em" color="var(--ft-text)">Overview</Text>
          <Text as="span" size={SM} color="var(--ft-dim)">
            {data.baseCurrency ?? ""} · {data.accounts.length} accounts · {data.txns.length} transactions
          </Text>
        </div>

        {/* Accent use 1 of 2. A sentence, not a banner — the reference does
            not have banners, and adding one to carry this would be
            borrowing from a different product. */}
        {conc !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, height: ROW_H, borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
            <Ring on />
            <Text as="span" size={MD} color="var(--ft-text)">
              {`${conc.pct}% of everything you own is ${conc.account}`}
            </Text>
          </div>
        )}

        <Section title="Accounts" count={data.accounts.length}>
          {data.accounts.map((a) => (
            <ListRow key={a.id} ring={false} left={a.name}
              sub={a.currency === data.baseCurrency ? undefined : formatNative(a.balance, a.currency)}
              href={entityHref("account", a.id)} title={`Open ${a.name}`}
              right={<Text as="span" numeric size={MD} color="var(--ft-text)">{a.baseEquivalent === null ? "—" : formatBaseMoney(a.baseEquivalent)}</Text>} />
          ))}
        </Section>

        <Section title="Due" count={data.upcoming.length}>
          {data.upcoming.map((u) => (
            <ListRow key={u.id} ring={soonest !== null && u.id === soonest.id} left={u.description}
              sub={`${shortDay(u.dueDate)} · in ${daysUntil(u.dueDate)} days`}
              right={<Text as="span" numeric size={MD} color="var(--ft-text)">{u.baseEquivalent === null ? "—" : formatBaseMoney(u.baseEquivalent)}</Text>} />
          ))}
        </Section>

        <Section title="Activity" count={data.txns.length}>
          {data.txns.slice(0, 10).map((t) => (
            <ListRow key={t.id} ring={false} left={t.description} sub={`${shortDay(t.date)} · ${t.category}`}
              href={accountTransactionsHref(t.accountId)} title={`Every row on ${t.accountName}`}
              right={<Text as="span" numeric size={MD} color={t.type === "income" ? "var(--ft-green)" : "var(--ft-muted)"}>
                {t.baseEquivalent === null ? "—" : formatBaseMoney(t.baseEquivalent)}
              </Text>} />
          ))}
        </Section>
      </div>

      <div style={{ position: "sticky", top: 16 }}>
        <div style={{ height: ROW_H, display: "flex", alignItems: "center" }}>
          <Text as="span" size={SM} weight={500} color="var(--ft-muted)">Totals</Text>
        </div>
        <div style={{ borderTop: "1px solid var(--ft-border)" }}>
          <Prop label="Net worth" value={data.netWorth === null ? "—" : formatBaseMoney(data.netWorth)} />
          <Prop label="Liquid" value={data.netLiquidity === null ? "—" : formatBaseMoney(data.netLiquidity)} />
          <Prop label="Cash" value={data.totalCash === null ? "—" : formatBaseMoney(data.totalCash)} />
          <Prop label="Portfolio" value={p === null ? "—" : formatBaseMoney(p.totalValueBase)} />
          <Prop label="Return" value={p?.totalPlPercent == null ? "—" : `${p.totalPlPercent >= 0 ? "+" : ""}${p.totalPlPercent.toFixed(2)}%`}
            color={p?.totalPlPercent == null ? "var(--ft-dim)" : p.totalPlPercent >= 0 ? "var(--ft-green)" : "var(--ft-red)"} />
          <Prop label="Spent this month" value={data.thisMonth === null ? "—" : formatBaseMoney(data.thisMonth.expenses)} />
          <Prop label="Owed to you" value={data.owing === null ? "—" : formatBaseMoney(data.owing.totalOwedToMe)} />
          <Prop label="You owe" value={data.owing === null ? "—" : formatBaseMoney(data.owing.totalIOwe)} />
        </div>

        <div style={{ height: ROW_H, display: "flex", alignItems: "center", marginTop: 14 }}>
          <Text as="span" size={SM} weight={500} color="var(--ft-muted)">Exposure</Text>
        </div>
        <div style={{ borderTop: "1px solid var(--ft-border)" }}>
          {data.exposure.map((g) => (
            <Prop key={g.key} label={g.key} value={`${(g.share * 100).toFixed(1)}%`}
              color={g.key === data.baseCurrency ? "var(--ft-muted)" : "var(--ft-text)"} />
          ))}
        </div>
      </div>
    </div>
  );
}
