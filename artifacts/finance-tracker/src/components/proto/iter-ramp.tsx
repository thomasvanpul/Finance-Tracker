// ── ITER 5 · RAMP ───────────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: Ramp. The page opens with what is UNUSUAL, not with a total.
// Ramp's spend dashboard leads with flagged transactions and policy
// exceptions; the balance is somewhere below, because a balance you already
// know is not information.
//
// The claim being tested is the strongest one in this set, and the most
// falsifiable: that a personal finance dashboard should be a QUEUE. Every
// item on it is something that changed, is overdue, is concentrated, or is
// missing — and when nothing qualifies, the page is nearly empty, which is
// the correct state and not a failure of the design.
//
// Everything on this page is derived from a figure the API supplied, and
// every flag states its own evidence underneath itself, because a screen
// that tells you something is wrong and does not show its working is a
// screen you stop trusting on the second false positive. The severity
// ordering is by base-currency magnitude where the flags are comparable and
// by recency where they are not — it is NOT a score, because a score would
// be a number this product cannot justify.
//
// What it gives up: the balance. Net worth appears at 15px in a strip at
// the bottom, and a person who opens the app to check it has to look for
// it. If Thomas's daily use is "what am I worth", this design is wrong for
// him no matter how good the queue is.
//
// Rules deliberately broken:
//   · DESIGN.md § 2 (permanent surfaces are quiet) — the flag rows carry
//     accent-tinted left edges and a tinted ground, which is an alert
//     treatment on a permanent surface. That is the design: the page IS
//     the alert list, so alert styling is not ephemeral here.
//   · The type ladder leads at 15/24px on LANGUAGE rather than on a figure,
//     inverting § 5's usual arrangement.

import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney, formatMoney, formatNative } from "@/lib/utils";
import { useProtoData, sumBase, shortDay, daysUntil, type ProtoData } from "@/components/proto/proto-data";
import { entityHref, ledgerHref, thisMonthRange } from "@/lib/entity-href";

type Severity = "high" | "watch" | "info";

interface Flag {
  key: string;
  severity: Severity;
  /** The claim, in a sentence. Never a label. */
  claim: string;
  /** The figures the claim rests on. Label|value pairs, both real. */
  evidence: { label: string; value: string }[];
  /** Where the rows behind the claim live (§ 14). */
  href: string;
  hrefLabel: string;
}

const EDGE: Record<Severity, string> = {
  high: "var(--ft-red)",
  watch: "var(--ft-amber)",
  info: "var(--ft-muted)",
};

/** How soon a bill has to be before it is worth interrupting someone. */
const DUE_SOON_DAYS = 10;
/** A single account above this share of everything is a concentration. */
const CONCENTRATION_FLOOR = 0.25;
/** Outstanding longer than this and it is not going to settle by itself. */
const STALE_IOU_DAYS = 30;

function buildFlags(data: ProtoData): Flag[] {
  const flags: Flag[] = [];
  const attr = data.attribution !== null && data.attribution.status === "ok" ? data.attribution : null;

  if (attr !== null && data.finding !== null) {
    const worst = [...attr.rows].sort((a, b) => Math.abs(b.amountBase) - Math.abs(a.amountBase))[0];
    flags.push({
      key: "attribution",
      severity: Math.abs(attr.totalBase) > 500 ? "high" : "watch",
      claim: `${data.finding.lead} ${data.finding.cause}`,
      evidence: [
        { label: `Total ${attr.windowLabel}`, value: `${attr.totalBase >= 0 ? "+" : ""}${formatMoney(attr.totalBase, data.baseCurrency)}` },
        ...(worst === undefined ? [] : worst.breakdown.slice(0, 2).map((b) => ({
          label: b.label, value: `${b.amountBase >= 0 ? "+" : ""}${formatMoney(b.amountBase, data.baseCurrency)}`,
        }))),
      ],
      href: worst?.drillHref ?? "/net-worth",
      hrefLabel: "See what moved",
    });
  }

  const top = data.accounts[0];
  const topBase = top?.baseEquivalent ?? null;
  if (top !== undefined && topBase !== null && top.share !== null && top.share > CONCENTRATION_FLOOR && data.netWorth !== null) {
    flags.push({
      key: "concentration",
      severity: "watch",
      claim: `${Math.round(top.share * 100)}% of everything you own is one account, held in ${top.currency}.`,
      evidence: [
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
    flags.push({
      key: "no-income",
      severity: "high",
      claim: `No income has been recorded this month. The ${past.length} months before it averaged ${formatBaseMoney(mean)}.`,
      evidence: [
        { label: "Recorded this month", value: formatBaseMoney(0) },
        ...past.slice(-3).map((m) => ({ label: m.short, value: formatBaseMoney(m.income) })),
      ],
      href: ledgerHref({ type: "income", ...thisMonthRange() }),
      hrefLabel: "Check the ledger",
    });
  }

  const soon = data.upcoming.filter((u) => daysUntil(u.dueDate) <= DUE_SOON_DAYS);
  if (soon.length > 0) {
    const total = sumBase(soon.map((u) => u.baseEquivalent));
    flags.push({
      key: "due",
      severity: "watch",
      claim: `${soon.length} payment${soon.length === 1 ? "" : "s"} leave${soon.length === 1 ? "s" : ""} in the next ${DUE_SOON_DAYS} days${total === null ? "" : `, ${formatBaseMoney(total)} in all`}.`,
      evidence: soon.map((u) => ({
        label: `${u.description} · ${shortDay(u.dueDate)}`,
        value: u.baseEquivalent === null ? "—" : formatBaseMoney(u.baseEquivalent),
      })),
      href: "/upcoming",
      hrefLabel: "Open upcoming",
    });
  }

  const stale = (data.owing?.topPending ?? []).filter((p) => (p.daysOutstanding ?? 0) > STALE_IOU_DAYS);
  if (stale.length > 0) {
    flags.push({
      key: "stale-iou",
      severity: "info",
      claim: `${stale.length} settlement${stale.length === 1 ? " has" : "s have"} been outstanding more than ${STALE_IOU_DAYS} days.`,
      evidence: stale.map((p) => ({
        label: `${p.name} · ${p.daysOutstanding ?? 0} days`,
        value: formatBaseMoney(p.amountBase),
      })),
      href: "/owing",
      hrefLabel: "Open settlements",
    });
  }

  const order: Record<Severity, number> = { high: 0, watch: 1, info: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

function FlagCard({ flag }: { flag: Flag }) {
  return (
    <div style={{
      borderLeft: `2px solid ${EDGE[flag.severity]}`,
      background: "var(--ft-surface)",
      padding: "18px 22px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 12 }}>
        <Text as="span" mono size={9} upper letterSpacing="0.14em" color={EDGE[flag.severity]}>{flag.severity}</Text>
        <Text as="span" size={20} weight={500} lineHeight={1.35} letterSpacing="-0.012em" color="var(--ft-text)">
          {flag.claim}
        </Text>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto max-content", columnGap: 22, rowGap: 4, justifyContent: "start", paddingBottom: 14 }}>
        {flag.evidence.map((e) => (
          <div key={e.label} style={{ display: "contents" }}>
            <Text as="span" size={12} color="var(--ft-dim)">{e.label}</Text>
            <Text as="span" numeric size={12} weight={500} color="var(--ft-muted)" align="right">{e.value}</Text>
          </div>
        ))}
      </div>
      <Drill href={flag.href} title={flag.hrefLabel}>
        <Text as="span" size={12} weight={500} color="var(--ft-text)">{flag.hrefLabel}</Text>
      </Drill>
    </div>
  );
}

export function RampDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const flags = buildFlags(data);
  const p = data.portfolio;

  const quiet: { label: string; value: string }[] = [
    { label: "Net worth", value: data.netWorth === null ? "—" : formatBaseMoney(data.netWorth) },
    { label: "Liquid", value: data.netLiquidity === null ? "—" : formatBaseMoney(data.netLiquidity) },
    { label: "Cash", value: data.totalCash === null ? "—" : formatBaseMoney(data.totalCash) },
    { label: "Portfolio", value: p === null ? "—" : formatBaseMoney(p.totalValueBase) },
    { label: "Spent this month", value: data.thisMonth === null ? "—" : formatBaseMoney(data.thisMonth.expenses) },
    { label: "Accounts", value: String(data.accounts.length) },
  ];

  return (
    <div style={{ maxWidth: 1000, paddingBottom: 72 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 22 }}>
        <Text as="h1" size={15} weight={600} color="var(--ft-text)">
          {flags.length === 0 ? "Nothing needs your attention" : `${flags.length} things need your attention`}
        </Text>
        <Text as="span" size={12} color="var(--ft-dim)">ordered by what it costs you to ignore</Text>
      </div>

      <div style={{ display: "grid", gap: 2 }}>
        {flags.map((f) => <FlagCard key={f.key} flag={f} />)}
      </div>

      {/* Everything that is simply true, demoted to a strip. Reading order
          is deliberate: a person is meant to arrive here having already
          dealt with the queue above. */}
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 46, rowGap: 16, paddingTop: 40, borderTop: "1px solid var(--ft-border)", marginTop: 34 }}>
        {quiet.map((q) => (
          <div key={q.label} style={{ display: "grid", gap: 5 }}>
            <Text as="span" size={11} color="var(--ft-dim)">{q.label}</Text>
            <Text as="span" numeric size={15} weight={500} color="var(--ft-muted)">{q.value}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}
