// ── ITER 1 · MERCURY ────────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: Mercury (mercury.com) — the banking dashboard whose whole
// argument is that a balance does not need decoration. One figure at a size
// nothing else on the page approaches, editorial type, whitespace measured
// in whole screens rather than in gaps, and colour that appears exactly
// where something is true and nowhere else.
//
// The organising idea: hierarchy by SIZE and DISTANCE only. There is no
// rule, no border, no panel and no surface change anywhere on this page.
// Every group is separated by space, and the reading order is enforced by
// how far apart things are, not by what they are inside. That is the whole
// design; if it fails it fails because a finance page needs edges.
//
// What it gives up: density. Eight accounts and three upcoming bills is all
// that fits above 900px. Everything Numeris currently shows on the dashboard
// — spending, budgets, goals, the sankey — is a scroll away or a page away.
//
// Rules deliberately broken:
//   · DESIGN.md § 3 (~16px between groups) — the gaps here are 40–104px.
//     The demotion IS the design; at 16px this is a stack with a big number
//     on top.
//   · DESIGN.md's panel rules — there are no panels, so § 2 has nothing to
//     apply to. That is the point of the reference, not an oversight.

import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatMoney, formatBaseMoney, formatNative } from "@/lib/utils";
import { useProtoData, shortDay } from "@/components/proto/proto-data";
import { entityHref } from "@/lib/entity-href";

/** The three readings under the hero. Named here rather than mapped from a
 *  generic list because the choice of exactly these three IS the design —
 *  what a calm page says second. */
function readings(data: ReturnType<typeof useProtoData>) {
  const out: { label: string; value: string; href?: string }[] = [];
  if (data.totalCash !== null) out.push({ label: "Cash", value: formatBaseMoney(data.totalCash) });
  if (data.portfolio !== null) out.push({ label: "Investments", value: formatBaseMoney(data.portfolio.totalValueBase) });
  const property = data.composition.find((g) => g.key === "property");
  if (property !== undefined) out.push({ label: "Property", value: formatBaseMoney(property.base) });
  return out;
}

export function MercuryDashboard() {
  const data = useProtoData();
  if (!data.ready || data.netWorth === null) return null;
  const attr = data.attribution;
  const moved = attr !== null && attr.status === "ok" ? attr : null;

  return (
    <div style={{ maxWidth: 860, paddingTop: 56, paddingBottom: 120 }}>
      <Text as="div" size={12} color="var(--ft-dim)" letterSpacing="0.02em" mb={22}>
        Net worth
      </Text>

      <Drill href="/net-worth" title="Everything this is the total of">
        <Text as="span" numeric size={104} weight={300} letterSpacing="-0.045em" lineHeight={1} color="var(--ft-text)">
          {formatBaseMoney(data.netWorth)}
        </Text>
      </Drill>

      {/* The only colour above the fold, and it is a state, not a category. */}
      {moved !== null && (
        <div style={{ paddingTop: 26, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <Text as="span" numeric size={17} weight={500} color={moved.totalBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
            {moved.totalBase > 0 ? "+" : ""}{formatMoney(moved.totalBase, data.baseCurrency)}
          </Text>
          <Text as="span" size={17} color="var(--ft-muted)" lineHeight={1.5}>
            {moved.windowLabel}
            {data.finding !== null ? ` · ${data.finding.lead.toLowerCase()}` : ""}
          </Text>
        </div>
      )}

      {/* Three readings. No rule above them, no box around them; they are
          set far enough down that the eye reaches them second regardless. */}
      <div style={{ display: "flex", columnGap: 76, rowGap: 30, flexWrap: "wrap", paddingTop: 104 }}>
        {readings(data).map((r) => (
          <div key={r.label} style={{ display: "grid", gap: 9 }}>
            <Text as="span" size={12} color="var(--ft-dim)">{r.label}</Text>
            <Text as="span" numeric size={26} weight={400} letterSpacing="-0.02em" color="var(--ft-muted)">{r.value}</Text>
          </div>
        ))}
      </div>

      {/* Accounts, as a reading list. No zebra, no rules, no right-hand
          rail of secondary figures — the native amount sits directly under
          the name because a foreign account is one thing with two readings,
          not two columns. Native first, converted second (the mobile
          signature, applied here because it is right, not because it is
          the phone). */}
      <div style={{ paddingTop: 96 }}>
        <Text as="div" size={12} color="var(--ft-dim)" mb={30}>Accounts</Text>
        <div style={{ display: "grid", gap: 30 }}>
          {data.accounts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 40 }}>
              <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <Drill href={entityHref("account", a.id)} title={`Open ${a.name}`}>
                  <Text as="span" size={16} color="var(--ft-text)">{a.name}</Text>
                </Drill>
                {a.currency !== data.baseCurrency && (
                  <Text as="span" numeric size={12} color="var(--ft-dim)">{formatNative(a.balance, a.currency)}</Text>
                )}
              </div>
              <Text as="span" numeric size={17} weight={400} color="var(--ft-muted)" nowrap>
                {a.baseEquivalent === null ? "—" : formatBaseMoney(a.baseEquivalent)}
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* What is coming, as a sentence rather than a table. A calm page can
          carry three bills as prose; it cannot carry thirty, and saying so
          is more honest than a list that will not scale. */}
      {data.upcoming.length > 0 && data.upcomingTotal !== null && (
        <div style={{ paddingTop: 88, maxWidth: "52ch" }}>
          <Text as="p" size={17} lineHeight={1.6} color="var(--ft-muted)">
            <Text as="span" numeric size={17} weight={500} color="var(--ft-text)">{formatBaseMoney(data.upcomingTotal)}</Text>
            {` leaves across ${data.upcoming.length} payments, the first on ${shortDay(data.upcoming[0].dueDate)}.`}
          </Text>
        </div>
      )}
    </div>
  );
}
