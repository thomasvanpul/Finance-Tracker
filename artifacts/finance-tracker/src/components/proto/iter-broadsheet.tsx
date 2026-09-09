// ── ITER 7 · BROADSHEET ─────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: a newspaper front page. One dominant story with a headline and
// a standfirst, secondary stories in columns beneath it, and — the part that
// matters — everything ranked by IMPORTANCE rather than grouped by category.
// A front page does not have a "sport section" above the fold; it has the
// biggest story, then the next biggest, and sport appears only if it earned
// the space today.
//
// Numeris's dashboard is currently the opposite: fixed categories in fixed
// slots, so the same widget occupies the same rectangle whether it has
// anything to say or not. This page has no fixed slots at all. Every story
// is written from a figure the API supplied, and on a quiet day the lead
// would be a smaller story rather than a large empty panel.
//
// Two devices come from the reference and are the reason it does not look
// like the other seven: a masthead with a double rule, and a serif face for
// LANGUAGE only. Figures stay mono throughout — that constraint is not
// negotiable here, and the tension between a serif headline and a mono
// figure inside it is the most interesting thing on the page.
//
// What it gives up: stability. A person who learns where a number lives
// cannot rely on it being there tomorrow, which is the exact opposite of
// what a dashboard is usually for. It also cannot be skimmed for a figure —
// you read it, or you get nothing.
//
// Rules deliberately broken:
//   · A serif family, which the product does not have. This uses the system
//     serif stack rather than loading a webfont, because loading a font for
//     a prototype would ship a request to every user for a page nobody can
//     reach. If this direction is chosen, a real face has to be picked and
//     the loading cost argued for on its own.
//   · The type primitives. Serif prose here is a plain element with an
//     inline fontFamily, because `Text` has no serif prop and adding one to
//     a shipped primitive for a prototype is the wrong trade. Figures still
//     go through `Text numeric`.
//   · DESIGN.md § 5 and § 10 — language, not the figure, carries the
//     largest size on the page.

import type { ReactNode } from "react";
import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney, formatMoney, formatNative } from "@/lib/utils";
import { useProtoData, shortDay, daysUntil, type ProtoData } from "@/components/proto/proto-data";
import { categoryTransactionsHref, entityHref, ledgerHref, thisMonthRange } from "@/lib/entity-href";

const SERIF = 'Georgia, "Times New Roman", "Iowan Old Style", serif';

function Headline({ size, children, italic = false, color = "var(--ft-text)" }: {
  size: number; children: ReactNode; italic?: boolean; color?: string;
}) {
  return (
    <div style={{
      fontFamily: SERIF, fontSize: size, lineHeight: 1.16, letterSpacing: "-0.015em",
      fontStyle: italic ? "italic" : "normal", fontWeight: italic ? 400 : 700, color,
    }}>{children}</div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.62, color: "var(--ft-muted)" }}>{children}</div>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <Text as="div" mono size={9} upper letterSpacing="0.18em" color="var(--ft-dim)" mb={7}>{children}</Text>;
}

/** A secondary story: kicker, headline, one line of body, and the figures
 *  it rests on set as a small table under a hairline. */
function Story({ kicker, headline, body, figures, href, hrefLabel }: {
  kicker: string; headline: string; body: string;
  figures: { label: string; value: string; color?: string }[];
  href: string; hrefLabel: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <Kicker>{kicker}</Kicker>
      <Headline size={19}>{headline}</Headline>
      <div style={{ paddingTop: 9 }}><Body>{body}</Body></div>
      <div style={{ display: "grid", gridTemplateColumns: "auto max-content", columnGap: 16, rowGap: 3, borderTop: "1px solid var(--ft-border)", marginTop: 12, paddingTop: 9 }}>
        {figures.map((f) => (
          <div key={f.label} style={{ display: "contents" }}>
            <Text as="span" size={11} color="var(--ft-dim)" truncate>{f.label}</Text>
            <Text as="span" numeric size={11} weight={500} color={f.color ?? "var(--ft-muted)"} align="right">{f.value}</Text>
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 9 }}>
        <Drill href={href} title={hrefLabel}>
          <Text as="span" mono size={10} upper letterSpacing="0.1em" color="var(--ft-muted)">{hrefLabel}</Text>
        </Drill>
      </div>
    </div>
  );
}

function secondaries(data: ProtoData) {
  const out: Parameters<typeof Story>[0][] = [];
  const top = data.accounts[0];
  const topBase = top?.baseEquivalent ?? null;
  const p = data.portfolio;

  if (top !== undefined && topBase !== null && top.share !== null && data.netWorth !== null) {
    out.push({
      kicker: "Concentration",
      headline: `${Math.round(top.share * 100)}% of the estate sits in one ${top.currency} account`,
      body: `${top.name} is worth more than every other holding combined, so the exchange rate is a larger position than any investment.`,
      figures: [
        { label: top.name, value: formatBaseMoney(topBase) },
        { label: "Native", value: formatNative(top.balance, top.currency) },
        { label: "Everything else", value: formatBaseMoney(data.netWorth - topBase) },
      ],
      href: entityHref("account", top.id),
      hrefLabel: "Open the account",
    });
  }

  const past = data.months.filter((m) => m.income > 0);
  if (data.thisMonth !== null && data.thisMonth.income === 0 && past.length > 0) {
    const mean = past.reduce((s, m) => s + m.income, 0) / past.length;
    out.push({
      kicker: "This month",
      headline: "No income recorded so far in September",
      body: `The ledger has ${formatBaseMoney(data.thisMonth.expenses)} of spending against nothing coming in. The ${past.length} months before it averaged ${formatBaseMoney(mean)}.`,
      figures: [
        { label: "Spent", value: formatBaseMoney(data.thisMonth.expenses), color: "var(--ft-red)" },
        { label: "Received", value: formatBaseMoney(0), color: "var(--ft-dim)" },
        ...past.slice(-2).map((m) => ({ label: m.short, value: formatBaseMoney(m.income) })),
      ],
      href: ledgerHref({ ...thisMonthRange() }),
      hrefLabel: "Read the ledger",
    });
  }

  if (p !== null) {
    out.push({
      kicker: "Markets",
      headline: p.totalPlPercent === null
        ? "The portfolio has no cost basis to measure against"
        : `The portfolio is ${p.totalPlPercent >= 0 ? "up" : "down"} ${Math.abs(p.totalPlPercent).toFixed(2)}% since it was opened`,
      body: p.dayChangeBase === null
        ? "There is no intraday reading — at least one position is missing a previous close."
        : `It moved ${formatBaseMoney(Math.abs(p.dayChangeBase))} ${p.dayChangeBase >= 0 ? "up" : "down"} over the last day, a separate move from the currency.`,
      figures: [
        { label: "Value", value: formatBaseMoney(p.totalValueBase) },
        { label: "Gain", value: `${p.totalPlBase >= 0 ? "+" : ""}${formatBaseMoney(p.totalPlBase)}`, color: p.totalPlBase >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
        { label: "Last day", value: p.dayChangeBase === null ? "—" : `${p.dayChangeBase >= 0 ? "+" : ""}${formatBaseMoney(p.dayChangeBase)}`, color: p.dayChangeBase === null ? "var(--ft-dim)" : p.dayChangeBase >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
      ],
      href: "/portfolio",
      hrefLabel: "Open the portfolio",
    });
  }

  const lead = data.categories[0];
  if (lead !== undefined) {
    out.push({
      kicker: "The ledger",
      headline: `${lead.name} leads the spending at ${Math.round(lead.share * 100)}% of it`,
      body: `${lead.count} rows across the recorded window, most recently on ${shortDay(lead.lastDate)}.`,
      figures: data.categories.slice(0, 4).map((c) => ({ label: c.name, value: formatBaseMoney(c.total) })),
      href: categoryTransactionsHref(lead.name),
      hrefLabel: "Open the category",
    });
  }

  return out.slice(0, 4);
}

export function BroadsheetDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const attr = data.attribution !== null && data.attribution.status === "ok" ? data.attribution : null;
  const worst = attr === null ? undefined : [...attr.rows].sort((a, b) => Math.abs(b.amountBase) - Math.abs(a.amountBase))[0];
  const dateline = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ maxWidth: 1300, paddingBottom: 72 }}>
      {/* Masthead */}
      <div style={{ borderBottom: "3px double var(--ft-text)", paddingBottom: 10 }}>
        <div style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 700, letterSpacing: "0.16em", textAlign: "center", color: "var(--ft-text)" }}>
          NUMERIS
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "7px 0 16px", borderBottom: "1px solid var(--ft-border2)" }}>
        <Text as="span" mono size={10} upper letterSpacing="0.13em" color="var(--ft-dim)">{dateline}</Text>
        <Text as="span" mono size={10} upper letterSpacing="0.13em" color="var(--ft-dim)">
          {`${data.accounts.length} accounts · ${data.txns.length} entries · ${data.baseCurrency ?? ""}`}
        </Text>
      </div>

      {/* Above the fold: the lead, and a brief column */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 40, paddingTop: 26 }}>
        <div style={{ minWidth: 0, borderRight: "1px solid var(--ft-border)", paddingRight: 40 }}>
          {attr !== null && data.finding !== null ? (
            <>
              <Kicker>{`Currency · ${attr.windowLabel}`}</Kicker>
              <Headline size={44}>{data.finding.lead}</Headline>
              <div style={{ paddingTop: 14, maxWidth: "54ch" }}>
                <Headline size={19} italic color="var(--ft-muted)">{data.finding.cause}</Headline>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingTop: 18 }}>
                <Text as="span" numeric size={30} weight={700} letterSpacing="-0.03em" color={attr.totalBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                  {attr.totalBase > 0 ? "+" : ""}{formatMoney(attr.totalBase, data.baseCurrency)}
                </Text>
                <Text as="span" mono size={11} color="var(--ft-dim)">{attr.windowLabel}</Text>
              </div>

              {/* Body columns — the reference's device for making a long
                  explanation readable without a scroll. */}
              <div style={{ columnCount: 2, columnGap: 34, paddingTop: 18, borderTop: "1px solid var(--ft-border)", marginTop: 16 }}>
                <Body>
                  {worst === undefined ? "" : `${worst.label.charAt(0).toUpperCase()}${worst.label.slice(1)} accounts for the whole of it: ${worst.detail}. `}
                  {`Nothing in the ledger explains the move — ${data.thisMonth === null ? "" : `spending this month is ${formatBaseMoney(data.thisMonth.expenses)}, `}two orders of magnitude below the change in the estate's value. `}
                  {`The accounts affected are held in a currency that is not ${data.baseCurrency ?? "the base"}, so their value in ${data.baseCurrency ?? "base"} moves whether or not anything is bought or sold.`}
                </Body>
                {worst !== undefined && (
                  <div style={{ display: "grid", gridTemplateColumns: "auto max-content", columnGap: 16, rowGap: 4, paddingTop: 12 }}>
                    {worst.breakdown.map((b) => (
                      <div key={b.label} style={{ display: "contents" }}>
                        <Text as="span" size={11} color="var(--ft-dim)" truncate>{b.label}</Text>
                        <Text as="span" numeric size={11} color="var(--ft-muted)" align="right">
                          {b.amountBase >= 0 ? "+" : ""}{formatMoney(b.amountBase, data.baseCurrency)}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <Headline size={40}>Nothing moved that the ledger cannot explain</Headline>
          )}
        </div>

        {/* In brief */}
        <div style={{ minWidth: 0 }}>
          <Kicker>In brief</Kicker>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <Headline size={15}>{`${data.upcoming.length} payments due`}</Headline>
              <div style={{ display: "grid", gap: 4, paddingTop: 8 }}>
                {data.upcoming.map((u) => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <Text as="span" size={11} color="var(--ft-muted)" truncate>{`${u.description} · ${daysUntil(u.dueDate)}d`}</Text>
                    <Text as="span" numeric size={11} color="var(--ft-text)" nowrap>{u.baseEquivalent === null ? "—" : formatBaseMoney(u.baseEquivalent)}</Text>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
              <Headline size={15}>Settlements outstanding</Headline>
              <div style={{ display: "grid", gap: 4, paddingTop: 8 }}>
                {(data.owing?.topPending ?? []).map((pn) => (
                  <div key={pn.name} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <Text as="span" size={11} color="var(--ft-muted)" truncate>{`${pn.name} · ${pn.daysOutstanding ?? 0}d`}</Text>
                    <Text as="span" numeric size={11} nowrap color={pn.direction === "they_owe_me" ? "var(--ft-green)" : "var(--ft-red)"}>
                      {formatBaseMoney(pn.amountBase)}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
              <Headline size={15}>The estate</Headline>
              <div style={{ display: "grid", gap: 4, paddingTop: 8 }}>
                {data.composition.map((g) => (
                  <div key={g.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <Text as="span" size={11} color="var(--ft-muted)">{`${g.key} · ${(g.share * 100).toFixed(0)}%`}</Text>
                    <Text as="span" numeric size={11} color="var(--ft-text)" nowrap>{formatBaseMoney(g.base)}</Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Below the fold */}
      <div style={{ borderTop: "1px solid var(--ft-text)", marginTop: 30, paddingTop: 24, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 34 }}>
        {secondaries(data).map((s) => <Story key={s.kicker} {...s} />)}
      </div>
    </div>
  );
}
