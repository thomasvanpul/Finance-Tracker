import { useGetDashboard } from "@workspace/api-client-react";
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

interface KpiItem {
  label: string;
  raw: number | null;
  color: string;
  fmt: (v: number) => string;
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

  const items: KpiItem[] = useMemo(() => {
    switch (personaId) {
      case "market":
        return [
          { label: "Portfolio", raw: data.portfolio.totalValueGbp, color: "var(--ft-blue)", fmt },
          { label: "P&L", raw: data.portfolio.totalPlGbp, color: data.portfolio.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt },
          { label: "Return", raw: data.portfolio.totalPlPercent, color: (data.portfolio.totalPlPercent ?? 0) >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt: fmtPct },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt },
        ];
      case "budget":
        return [
          { label: "This Month", raw: data.thisMonth.expenses, color: "var(--ft-red)", fmt },
          { label: "Saved", raw: data.thisMonth.netSavings, color: data.thisMonth.netSavings >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt },
          { label: "Savings Rate", raw: data.thisMonth.savingsRate, color: data.thisMonth.savingsRate >= 0.15 ? "var(--ft-green)" : "var(--ft-amber)", fmt: fmtPct },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt },
        ];
      case "wealth":
        return [
          { label: "Net Worth", raw: data.netWorth, color: "var(--ft-blue)", fmt },
          { label: "Savings Rate", raw: data.thisMonth.savingsRate, color: data.thisMonth.savingsRate >= 0.2 ? "var(--ft-green)" : "var(--ft-amber)", fmt: fmtPct },
          { label: "Portfolio", raw: data.portfolio.totalValueGbp, color: "var(--ft-text)", fmt },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt },
        ];
      case "social":
        return [
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt },
          { label: "Owed to Me", raw: data.owing.totalOwedToMe, color: data.owing.totalOwedToMe > 0 ? "var(--ft-green)" : "var(--ft-dim)", fmt },
          { label: "I Owe", raw: data.owing.totalIOwe, color: data.owing.totalIOwe > 0 ? "var(--ft-red)" : "var(--ft-dim)", fmt },
          { label: "Net Worth", raw: data.netWorth, color: "var(--ft-blue)", fmt },
        ];
      default:
        return [
          { label: "Net Worth", raw: data.netWorth, color: "var(--ft-blue)", fmt },
          { label: "Liquidity", raw: data.netLiquidity, color: "var(--ft-green)", fmt },
          { label: "Cash", raw: data.totalCash, color: "var(--ft-text)", fmt },
          { label: "Portfolio", raw: data.portfolio.totalValueGbp, color: data.portfolio.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)", fmt },
        ];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, data]);

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
          <span className="text-xs whitespace-nowrap" style={{ color: "var(--ft-dim)" }}>
            {item.label}
          </span>
          <KpiValue raw={item.raw} color={item.color} fmt={item.fmt} />
        </div>
      ))}
      <div className="flex-1" />
      {/* Persona mode badge — shown at end of KPI bar */}
      {persona && personaGlyph && personaColor && (
        <Link href="/settings?panel=terminal-profile">
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
