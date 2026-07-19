import { useGetDashboard } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { PrivNum } from "@/contexts/privacy-context";

export function KpiBar() {
  const { data } = useGetDashboard();

  if (!data) return null;

  const currency = data.baseCurrency ?? "GBP";
  const fmt = (value: number) => formatCurrency(value, currency);

  const items = [
    { label: "Net Worth", value: fmt(data.netWorth), color: "var(--ft-blue)" },
    { label: "Liquidity", value: fmt(data.netLiquidity), color: "var(--ft-green)" },
    { label: "Cash", value: fmt(data.totalCash), color: "var(--ft-text)" },
    { label: "Portfolio", value: fmt(data.portfolio.totalValueGbp), color: data.portfolio.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
  ];

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
          <PrivNum className="text-xs font-bold font-mono whitespace-nowrap" style={{ color: item.color }}>
            {item.value}
          </PrivNum>
        </div>
      ))}
      <div className="flex-1" />
    </div>
  );
}
