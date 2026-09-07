import { useGetDashboard } from "@workspace/api-client-react";
import { entityHref, ledgerHref, thisMonthRange } from "@/lib/entity-href";
import { Drill } from "@/components/drill";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PrivNum } from "@/contexts/privacy-context";
import { useCountUp } from "@/hooks/use-count-up";
import { PERSONAS, PERSONA_COLORS, PERSONA_GLYPHS } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { useMemo } from "react";
import { Link } from "wouter";

function KpiValue({ raw, color, fmt }: { raw: number | null; color: string; fmt: (v: number) => string }) {
  // Null-value (an unknown or undefined-in-the-data case) renders as
  // "—" per the app-wide "no fabricated number" rule. Never fall
  // through to fmt(raw ?? 0) — that reintroduces the fabricated-zero
  // defect Lock #16 was written to prevent.
  const animated = useCountUp(raw ?? 0);
  return (
    <PrivNum className="text-xs font-bold font-mono whitespace-nowrap" style={{ color }}>
      {raw == null ? "—" : fmt(animated)}
    </PrivNum>
  );
}

function Cell({ drill, label, children }: { drill?: string; label: string; children: React.ReactNode }) {
  const inner = <span className="flex items-center gap-2">{children}</span>;
  if (!drill) return inner;
  return (
    <Drill href={drill} style={{ display: "inline-flex" }} title={`${label} — open what it is made of`}>
      {inner}
    </Drill>
  );
}

interface KpiItem {
  label: string;
  raw: number | null;
  color: string;
  fmt: (v: number) => string;
  /**
   * Where the figure came from, when it is a sum over rows (DESIGN.md §14).
   * Left undefined for a ratio: a savings rate and a total return are a
   * figure divided by another figure, not a set of rows, and there is
   * nothing behind them to open.
   */
  href?: string;
}

export function KpiBar() {
  const { data } = useGetDashboard();

  const personaId = useActivePersona();
  const persona = useMemo(
    () => PERSONAS.find((p) => p.id === personaId) ?? null,
    [personaId],
  );

  if (!data) return null;

  const currency = data.baseCurrency ?? "GBP";
  const fmt = (value: number) => formatCurrency(value, currency);
  const fmtPct = (value: number) => `${value >= 0 ? "+" : ""}${formatPercent(value)}`;

  // The month the "this month" figures are summing, so a drill lands on
  // exactly those rows rather than the whole ledger.
  const { from: monthStart, to: monthEnd } = thisMonthRange();

  const items: KpiItem[] = useMemo(() => {
    switch (personaId) {
      case "market":
        return [
          { label: "Portfolio", raw: data.portfolio.totalValueBase, color: "var(--ft-blue)", fmt, href: "/investments" },
          { label: "P&L", raw: data.portfolio.totalPlBase, color: data.portfolio.totalPlBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt, href: "/investments" },
          { label: "Return", raw: data.portfolio.totalPlPercent, color: (data.portfolio.totalPlPercent ?? 0) >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt: fmtPct },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt, href: "/accounts" },
        ];
      case "budget":
        return [
          { label: "This Month", raw: data.thisMonth.expenses, color: "var(--ft-red)", fmt, href: ledgerHref({ type: "expense", from: monthStart, to: monthEnd }) },
          { label: "Saved", raw: data.thisMonth.netSavings, color: data.thisMonth.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt, href: ledgerHref({ from: monthStart, to: monthEnd }) },
          // savingsRate is a percentage (15 means 15%), so the threshold is
          // 15, not 0.15. Null keeps its own colour and KpiValue renders "—".
          { label: "Savings Rate", raw: data.thisMonth.savingsRate, color: (data.thisMonth.savingsRate ?? 0) >= 15 ? "var(--ft-green)" : "var(--ft-amber)", fmt: fmtPct },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt, href: "/accounts" },
        ];
      case "wealth":
        return [
          { label: "Net Worth", raw: data.netWorth, color: "var(--ft-blue)", fmt, href: "/net-worth" },
          { label: "Savings Rate", raw: data.thisMonth.savingsRate, color: (data.thisMonth.savingsRate ?? 0) >= 20 ? "var(--ft-green)" : "var(--ft-amber)", fmt: fmtPct },
          { label: "Portfolio", raw: data.portfolio.totalValueBase, color: "var(--ft-text)", fmt, href: "/investments" },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt, href: "/accounts" },
        ];
      case "social":
        return [
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt, href: "/accounts" },
          { label: "Owed to Me", raw: data.owing.totalOwedToMe, color: data.owing.totalOwedToMe > 0 ? "var(--ft-green)" : "var(--ft-dim)", fmt, href: "/owing" },
          { label: "I Owe", raw: data.owing.totalIOwe, color: data.owing.totalIOwe > 0 ? "var(--ft-red)" : "var(--ft-dim)", fmt, href: "/owing" },
          { label: "Net Worth", raw: data.netWorth, color: "var(--ft-blue)", fmt, href: "/net-worth" },
        ];
      default:
        return [
          { label: "Net Worth", raw: data.netWorth, color: "var(--ft-blue)", fmt, href: "/net-worth" },
          { label: "Liquidity", raw: data.netLiquidity, color: "var(--ft-green)", fmt, href: "/accounts" },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt, href: "/accounts" },
          { label: "Portfolio", raw: data.portfolio.totalValueBase, color: data.portfolio.totalPlBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt, href: "/investments" },
        ];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, data, monthStart, monthEnd]);

  const personaColor = persona ? (PERSONA_COLORS[persona.id] ?? "var(--ft-dim)") : null;
  const personaGlyph = persona && persona.id !== "full" ? PERSONA_GLYPHS[persona.id] : null;

  return (
    <div
      className="flex-shrink-0 flex border-b overflow-x-auto"
      style={{
        background: "var(--ft-base)",
        borderColor: "var(--ft-border)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      } as React.CSSProperties}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 px-3 sm:px-4 py-1 border-r flex-shrink-0"
          style={{ borderColor: "var(--ft-border)" }}
        >
          {/* Label and figure are one target. They name the same set of rows,
              and each on its own is a small thing to hit — "P&L" is three
              characters. `.ft-drill` inherits colour, so the label stays dim
              and the figure keeps its semantic green or red until hover. */}
          <Cell drill={item.href} label={item.label}>
            <span className="text-xs whitespace-nowrap" style={{ color: "var(--ft-dim)" }}>
              {item.label}
            </span>
            <KpiValue raw={item.raw} color={item.color} fmt={item.fmt} />
          </Cell>
        </div>
      ))}
      <div className="flex-1" />
      {/* Persona mode badge — shown at end of KPI bar */}
      {persona && personaGlyph && personaColor && (
        <Link href={entityHref("settings", "terminal-profile")}>
          <div
            className="flex items-center gap-1.5 px-3 py-1 border-l flex-shrink-0 cursor-pointer"
            style={{
              borderColor: "var(--ft-border)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
            }}
            title={`${persona.label} — click to manage profile`}
          >
            <span style={{ color: personaColor, fontWeight: 700, lineHeight: 1 }}>{personaGlyph}</span>
            <span style={{ color: "var(--ft-dim)", letterSpacing: "0.08em" }}>{persona.code}</span>
          </div>
        </Link>
      )}
    </div>
  );
}
