// ── ITER 6 · PLAUSIBLE ──────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Reference: Plausible Analytics, and the single-page analytics dashboard
// generally. One chart across the top, a row of readings above it that
// select what the chart shows, and beneath it a grid of ranked lists where
// the bar is drawn BEHIND the label rather than beside it. No configuration,
// no widgets, no layout to arrange — the page is the same for everybody and
// there is nothing to set up.
//
// The claim: Numeris's dashboard has a drag-and-drop widget system, saved
// views, personas and a customise mode, and this page argues that all of it
// is a substitute for deciding what the dashboard is. This shows about a
// fifth of what the current dashboard shows and answers the same questions.
//
// The chart is recorded spend per day across the whole transaction window.
// Days with no rows are genuinely £0 recorded, not missing — the account's
// ledger is complete over this window, which is why a zero-baseline bar
// chart is honest here and would not be for net worth, where there is no
// history endpoint at all and every point would be invented.
//
// What it gives up: net worth, entirely, as a subject. It appears once as a
// reading. If the product is a wealth tracker rather than a spend tracker,
// this reference is aimed at the wrong noun — which is itself worth seeing
// in a screenshot rather than arguing about.
//
// Rules deliberately broken:
//   · The range control at the top is INERT. It is drawn because the pill
//     row is half of this reference's identity, and a prototype that hides
//     the control would be photographing a different design. It selects
//     nothing and the report says so.
//   · DESIGN.md § 2's panel edges — the ranked lists have no edges at all;
//     the bar behind each label is the only surface on the page.

import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney } from "@/lib/utils";
import { useProtoData, shortDay, type ProtoData } from "@/components/proto/proto-data";
import { categoryTransactionsHref, entityHref, merchantTransactionsHref } from "@/lib/entity-href";

interface Day { date: string; total: number }

/** Recorded expense per day across the ledger's own window. Built from the
 *  rows, so it cannot disagree with the lists below it. */
function dailySpend(data: ProtoData): Day[] {
  const rows = data.txns.filter((t) => t.type === "expense" && t.baseEquivalent !== null);
  if (rows.length === 0) return [];
  const byDate = new Map<string, number>();
  for (const t of rows) {
    // Narrowed to a local rather than coalesced: an unconvertible row is not
    // a £0 day (lib/fabricated-zero-lock.test.ts). The filter above already
    // excluded them, and this keeps the exclusion legible at the call site.
    const amount = t.baseEquivalent;
    if (amount === null) continue;
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + Math.abs(amount));
  }
  const dates = rows.map((t) => t.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const out: Day[] = [];
  const [fy, fm, fd] = first.split("-").map(Number);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const [ly, lm, ld] = last.split("-").map(Number);
  const end = Date.UTC(ly, lm - 1, ld);
  while (cursor.getTime() <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push({ date: iso, total: byDate.get(iso) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function Chart({ days, height }: { days: Day[]; height: number }) {
  if (days.length === 0) return null;
  const peak = Math.max(...days.map((d) => d.total));
  if (peak === 0) return null;
  const slot = 100 / days.length;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height, gap: 1, borderBottom: "1px solid var(--ft-border2)" }}>
      {days.map((d) => (
        <div key={d.date} title={`${shortDay(d.date)} · ${formatBaseMoney(d.total)}`}
          style={{
            width: `${slot}%`,
            height: d.total === 0 ? 1 : `${Math.max(1.5, (d.total / peak) * 100)}%`,
            background: d.total === 0 ? "var(--ft-border)" : "var(--ft-accent)",
            opacity: d.total === 0 ? 1 : 0.85,
          }} />
      ))}
    </div>
  );
}

/** A ranked list, Plausible's way: the bar is the row's background and the
 *  label sits on top of it, so rank and magnitude are one mark rather than
 *  two things to line up. */
function Ranked({ title, unit, rows }: {
  title: string; unit: string; rows: { key: string; label: string; share: number; value: string; href?: string }[];
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 12 }}>
        <Text as="span" size={13} weight={600} color="var(--ft-text)">{title}</Text>
        <Text as="span" mono size={9} upper letterSpacing="0.12em" color="var(--ft-dim)">{unit}</Text>
      </div>
      <div style={{ display: "grid", gap: 3 }}>
        {rows.map((r) => {
          const inner = (
            <div style={{ position: "relative", height: 27, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingLeft: 8, paddingRight: 8 }}>
              <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(1.5, r.share * 100).toFixed(2)}%`, background: "var(--ft-accent-tint)" }} />
              <Text as="span" size={12} color="var(--ft-text)" truncate>{r.label}</Text>
              <Text as="span" numeric size={12} color="var(--ft-muted)" nowrap>{r.value}</Text>
            </div>
          );
          if (r.href === undefined) return <div key={r.key} style={{ position: "relative" }}>{inner}</div>;
          return <Drill key={r.key} href={r.href} title={`Open ${r.label}`} style={{ display: "block", position: "relative" }}>{inner}</Drill>;
        })}
      </div>
    </div>
  );
}

const RANGES = ["7d", "30d", "90d", "12m", "All"];

export function PlausibleDashboard() {
  const data = useProtoData();
  if (!data.ready) return null;
  const days = dailySpend(data);
  const spent = days.reduce((s, d) => s + d.total, 0);
  const p = data.portfolio;

  const readings: { label: string; value: string; on: boolean }[] = [
    { label: "Recorded spend", value: formatBaseMoney(spent), on: true },
    { label: "Net worth", value: data.netWorth === null ? "—" : formatBaseMoney(data.netWorth), on: false },
    { label: "Cash", value: data.totalCash === null ? "—" : formatBaseMoney(data.totalCash), on: false },
    { label: "Portfolio", value: p === null ? "—" : formatBaseMoney(p.totalValueBase), on: false },
  ];

  return (
    <div style={{ maxWidth: 1240, paddingBottom: 60 }}>
      {/* The range row. Inert — see the header comment. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, paddingBottom: 20 }}>
        <Text as="span" size={15} weight={600} color="var(--ft-text)">All accounts</Text>
        <div style={{ display: "flex", gap: 2 }}>
          {RANGES.map((r) => (
            <div key={r} style={{
              padding: "5px 12px",
              background: r === "All" ? "var(--ft-accent-tint)" : "transparent",
              border: `1px solid ${r === "All" ? "var(--ft-accent-edge)" : "var(--ft-border)"}`,
            }}>
              <Text as="span" mono size={10} color={r === "All" ? "var(--ft-text)" : "var(--ft-dim)"}>{r}</Text>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "20px 22px 18px" }}>
        <div style={{ display: "flex", gap: 44, paddingBottom: 22 }}>
          {readings.map((r) => (
            <div key={r.label} style={{ display: "grid", gap: 6, borderBottom: r.on ? "2px solid var(--ft-accent)" : "2px solid transparent", paddingBottom: 8 }}>
              <Text as="span" size={11} color={r.on ? "var(--ft-muted)" : "var(--ft-dim)"}>{r.label}</Text>
              <Text as="span" numeric size={24} weight={600} letterSpacing="-0.022em" color={r.on ? "var(--ft-text)" : "var(--ft-muted)"}>{r.value}</Text>
            </div>
          ))}
        </div>
        <Chart days={days} height={168} />
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
          <Text as="span" mono size={10} color="var(--ft-dim)">{days.length > 0 ? shortDay(days[0].date) : ""}</Text>
          <Text as="span" mono size={10} color="var(--ft-dim)">{`${days.length} days recorded`}</Text>
          <Text as="span" mono size={10} color="var(--ft-dim)">{days.length > 0 ? shortDay(days[days.length - 1].date) : ""}</Text>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 40, paddingTop: 34 }}>
        <Ranked title="Categories" unit="spend"
          rows={data.categories.slice(0, 8).map((c) => ({ key: c.name, label: c.name, share: c.share, value: formatBaseMoney(c.total), href: categoryTransactionsHref(c.name) }))} />
        <Ranked title="Merchants" unit="spend"
          rows={data.merchants.slice(0, 8).map((m) => ({ key: m.name, label: m.name, share: m.share, value: formatBaseMoney(m.total), href: merchantTransactionsHref(m.name) }))} />
        <Ranked title="Accounts" unit="value"
          rows={data.accounts.slice(0, 8).map((a) => ({ key: String(a.id), label: a.name, share: a.share ?? 0, value: a.baseEquivalent === null ? "—" : formatBaseMoney(a.baseEquivalent), href: entityHref("account", a.id) }))} />
        <Ranked title="Currencies" unit="exposure"
          rows={data.exposure.map((g) => ({ key: g.key, label: g.key, share: g.share, value: `${(g.share * 100).toFixed(1)}%` }))} />
      </div>
    </div>
  );
}
