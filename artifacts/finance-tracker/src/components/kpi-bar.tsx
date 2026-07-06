import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";

export function KpiBar() {
  const { data } = useGetDashboard();

  if (!data) return null;

  const items = [
    { label: "Net Worth", value: formatGbp(data.netWorth), color: "#58A6FF" },
    { label: "Liquidity", value: formatGbp(data.netLiquidity), color: "#3FB950" },
    { label: "Cash", value: formatGbp(data.totalCash), color: "#C9D1D9" },
    { label: "Portfolio", value: formatGbp(data.portfolio.totalValueGbp), color: data.portfolio.totalPlGbp >= 0 ? "#3FB950" : "#F85149" },
  ];

  return (
    <div
      className="flex-shrink-0 flex border-b overflow-x-auto"
      style={{
        background: "#0D1117",
        borderColor: "#21262D",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      } as React.CSSProperties}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 px-3 sm:px-4 py-1 border-r flex-shrink-0"
          style={{ borderColor: "#21262D" }}
        >
          <span className="text-xs whitespace-nowrap" style={{ color: "#484F58" }}>
            {item.label}
          </span>
          <span
            className="text-xs font-bold font-mono whitespace-nowrap"
            style={{ color: item.color }}
          >
            {item.value}
          </span>
        </div>
      ))}
      <div className="flex-1" />
    </div>
  );
}
