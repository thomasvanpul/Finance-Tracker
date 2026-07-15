import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Landmark, TrendingUp, HandCoins, Wallet, ArrowLeftRight, CalendarClock } from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export default function Dashboard() {
  const { data: dashboard, isLoading, isError, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
      {/* Page title */}
      <div>
        <h1 className="text-base sm:text-lg font-bold tracking-tight" style={{ color: "#E6EDF3" }}>
          Portfolio Overview
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>
          All figures in GBP · Live market data
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load dashboard</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? "Could not reach the server."}
          </AlertDescription>
        </Alert>
      )}

      {dashboard && (
        <>
          {/* ── KPI Cards — one continuous grid, not separated cards ── */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-sm border overflow-hidden"
            style={{ background: "#21262D", borderColor: "#21262D" }}
          >
            {[
              {
                label: "Net Worth",
                value: formatGbp(dashboard.netWorth),
                sub: "Cash + Portfolio",
                color: "#58A6FF",
                positive: true,
              },
              {
                label: "Net Liquidity",
                value: formatGbp(dashboard.netLiquidity),
                sub: "After upcoming 30d",
                color: "#3FB950",
                positive: dashboard.netLiquidity >= 0,
              },
              {
                label: "Total Cash",
                value: formatGbp(dashboard.totalCash),
                sub: `${dashboard.accountBreakdown.length} account${dashboard.accountBreakdown.length !== 1 ? "s" : ""}`,
                color: "#E6EDF3",
                positive: true,
              },
              {
                label: "Portfolio",
                value: formatGbp(dashboard.portfolio.totalValueGbp),
                sub: `P&L ${dashboard.portfolio.totalPlGbp >= 0 ? "+" : ""}${formatGbp(dashboard.portfolio.totalPlGbp)}`,
                color: dashboard.portfolio.totalPlGbp >= 0 ? "#3FB950" : "#F85149",
                positive: dashboard.portfolio.totalPlGbp >= 0,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="p-3"
                style={{ background: "#161B22" }}
              >
                <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{card.label}</div>
                <div className="text-base sm:text-lg font-bold font-mono truncate" style={{ color: card.color }}>
                  {card.value}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: "#484F58" }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* ── This Month ── */}
          <div
            className="rounded-sm border overflow-hidden"
            style={{ borderColor: "#21262D" }}
          >
            <div
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center gap-2"
              style={{ background: "#161B22", borderColor: "#21262D", color: "#58A6FF" }}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              This Month
            </div>
            <div className="grid grid-cols-3" style={{ background: "#0D1117" }}>
              {[
                { label: "Income", value: `+${formatGbp(dashboard.thisMonth.income)}`, color: "#3FB950" },
                { label: "Expenses", value: `-${formatGbp(dashboard.thisMonth.expenses)}`, color: "#F85149" },
                {
                  label: "Net Savings",
                  value: `${dashboard.thisMonth.netSavings >= 0 ? "+" : ""}${formatGbp(dashboard.thisMonth.netSavings)}`,
                  color: dashboard.thisMonth.netSavings >= 0 ? "#3FB950" : "#F85149",
                  sub: `${formatPercent(dashboard.thisMonth.savingsRate)} rate`,
                },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className="p-3 flex flex-col gap-0.5"
                  style={{ borderRight: i < 2 ? "1px solid #21262D" : undefined }}
                >
                  <div className="text-xs" style={{ color: "#6E7681" }}>{item.label}</div>
                  <div className="text-sm font-bold font-mono" style={{ color: item.color }}>{item.value}</div>
                  {item.sub && <div className="text-xs" style={{ color: "#484F58" }}>{item.sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* ── 6-month spending chart ── */}
          {(dashboard.monthlyHistory?.length ?? 0) > 0 && (
            <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
              <div
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center gap-2"
                style={{ background: "#161B22", borderColor: "#21262D", color: "#8B949E" }}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Income vs Expenses — Last 6 Months
              </div>
              <div style={{ background: "#0D1117", padding: "12px 8px 8px" }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dashboard.monthlyHistory} margin={{ top: 0, right: 8, left: -8, bottom: 0 }} barCategoryGap="30%">
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#6E7681", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => {
                        const [y, m] = v.split("-");
                        return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("en-GB", { month: "short" });
                      }}
                    />
                    <YAxis
                      tick={{ fill: "#6E7681", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v}`}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatGbp(value), name === "income" ? "Income" : "Expenses"]}
                      contentStyle={{ background: "#161B22", border: "1px solid #30363D", color: "#C9D1D9", fontSize: 11 }}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    />
                    <Legend
                      formatter={(value) => <span style={{ fontSize: 10, color: "#6E7681" }}>{value === "income" ? "Income" : "Expenses"}</span>}
                      iconSize={8}
                    />
                    <Bar dataKey="income" fill="#3FB950" radius={[2, 2, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="expenses" fill="#F85149" radius={[2, 2, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Two column: Accounts + Owing ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
            {/* Cash Accounts */}
            <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
              <div
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center justify-between"
                style={{ background: "#161B22", borderColor: "#21262D", color: "#3FB950" }}
              >
                <span className="flex items-center gap-2"><Wallet className="w-3.5 h-3.5" /> Cash Accounts</span>
                <Link href="/accounts">
                  <span className="text-xs normal-case font-normal cursor-pointer" style={{ color: "#58A6FF" }}>→ Manage</span>
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Account", "Ccy", "Balance", "GBP"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "5px 10px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#6E7681",
                            background: "#161B22",
                            borderBottom: "1px solid #30363D",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.accountBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: "16px 10px", textAlign: "center", color: "#484F58", fontSize: 11 }}>
                          No accounts — add via Accounts
                        </td>
                      </tr>
                    ) : (
                      dashboard.accountBreakdown.map((acct) => (
                        <tr key={acct.id} style={{ borderBottom: "1px solid #21262D" }}>
                          <td style={{ padding: "6px 10px", color: "#C9D1D9" }}>
                            <span className="flex items-center gap-1.5">
                              <Landmark className="w-3 h-3 flex-shrink-0" style={{ color: "#484F58" }} />
                              <span className="truncate max-w-[100px]">{acct.name}</span>
                            </span>
                          </td>
                          <td style={{ padding: "6px 10px", color: "#58A6FF", fontWeight: 600 }}>{acct.currency}</td>
                          <td style={{ padding: "6px 10px", color: "#8B949E", fontFamily: "monospace" }}>
                            {new Intl.NumberFormat("en-GB", { style: "currency", currency: acct.currency }).format(acct.balance)}
                          </td>
                          <td style={{ padding: "6px 10px", color: "#3FB950", fontFamily: "monospace", fontWeight: 600 }}>
                            {formatGbp(acct.gbpEquivalent)}
                          </td>
                        </tr>
                      ))
                    )}
                    {dashboard.accountBreakdown.length > 0 && (
                      <tr style={{ background: "rgba(63,185,80,0.04)", borderTop: "1px solid #30363D" }}>
                        <td colSpan={3} style={{ padding: "5px 10px", color: "#484F58", fontSize: 11, fontWeight: 600 }}>TOTAL CASH</td>
                        <td style={{ padding: "5px 10px", color: "#3FB950", fontFamily: "monospace", fontWeight: 700 }}>
                          {formatGbp(dashboard.totalCash)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Owing summary */}
            <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
              <div
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center justify-between"
                style={{ background: "#161B22", borderColor: "#21262D", color: "#F0883E" }}
              >
                <span className="flex items-center gap-2"><HandCoins className="w-3.5 h-3.5" /> IOUs & Owing</span>
                <Link href="/owing">
                  <span className="text-xs normal-case font-normal cursor-pointer" style={{ color: "#58A6FF" }}>→ Manage</span>
                </Link>
              </div>
              <div style={{ background: "#0D1117" }}>
                <div className="grid grid-cols-3 divide-x" style={{ borderBottom: "1px solid #21262D", ["--tw-divide-opacity" as string]: 1 }}>
                  {[
                    { label: "They Owe Me", value: formatGbp(dashboard.owing.totalOwedToMe), color: "#3FB950" },
                    { label: "I Owe", value: formatGbp(dashboard.owing.totalIOwe), color: "#F85149" },
                    {
                      label: "Net",
                      value: `${dashboard.owing.netGbp >= 0 ? "+" : ""}${formatGbp(dashboard.owing.netGbp)}`,
                      color: dashboard.owing.netGbp >= 0 ? "#3FB950" : "#F85149",
                    },
                  ].map((item, i) => (
                    <div
                      key={item.label}
                      className="p-3"
                      style={{ borderRight: i < 2 ? "1px solid #21262D" : undefined }}
                    >
                      <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{item.label}</div>
                      <div className="text-sm font-bold font-mono" style={{ color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 text-xs" style={{ color: "#484F58" }}>
                  {dashboard.owing.pendingCount === 0
                    ? "No open IOUs — add via Owing tab"
                    : `${dashboard.owing.pendingCount} open IOU${dashboard.owing.pendingCount !== 1 ? "s" : ""} · tap Owing to manage`}
                </div>
              </div>
            </div>
          </div>

          {/* ── Portfolio + Upcoming row ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
            {/* Portfolio */}
            <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
              <div
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center justify-between"
                style={{ background: "#161B22", borderColor: "#21262D", color: "#58A6FF" }}
              >
                <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Investments</span>
                <Link href="/investments">
                  <span className="text-xs normal-case font-normal cursor-pointer" style={{ color: "#58A6FF" }}>→ View</span>
                </Link>
              </div>
              <div className="grid grid-cols-3 divide-x" style={{ background: "#0D1117" }}>
                {[
                  { label: "Value", value: formatGbp(dashboard.portfolio.totalValueGbp), color: "#E6EDF3" },
                  {
                    label: "P&L",
                    value: `${dashboard.portfolio.totalPlGbp >= 0 ? "+" : ""}${formatGbp(dashboard.portfolio.totalPlGbp)}`,
                    color: dashboard.portfolio.totalPlGbp >= 0 ? "#3FB950" : "#F85149",
                  },
                  {
                    label: "Return",
                    value: `${dashboard.portfolio.totalPlPercent >= 0 ? "+" : ""}${formatPercent(dashboard.portfolio.totalPlPercent)}`,
                    color: dashboard.portfolio.totalPlPercent >= 0 ? "#3FB950" : "#F85149",
                  },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    className="p-3"
                    style={{ borderRight: i < 2 ? "1px solid #21262D" : undefined }}
                  >
                    <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{item.label}</div>
                    <div className="text-sm font-bold font-mono" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming */}
            <div className="rounded-sm border overflow-hidden" style={{ borderColor: "#21262D" }}>
              <div
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b flex items-center justify-between"
                style={{ background: "#161B22", borderColor: "#21262D", color: "#8B949E" }}
              >
                <span className="flex items-center gap-2"><CalendarClock className="w-3.5 h-3.5" /> Upcoming 30 days</span>
                <Link href="/upcoming">
                  <span className="text-xs normal-case font-normal cursor-pointer" style={{ color: "#58A6FF" }}>→ View</span>
                </Link>
              </div>
              <div className="grid grid-cols-2 divide-x" style={{ background: "#0D1117" }}>
                {[
                  { label: "Committed Out", value: `-${formatGbp(dashboard.totalCash - dashboard.netLiquidity > 0 ? dashboard.totalCash - dashboard.netLiquidity : 0)}`, color: "#F85149" },
                  { label: "Net Liquidity", value: formatGbp(dashboard.netLiquidity), color: dashboard.netLiquidity >= 0 ? "#3FB950" : "#F85149" },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    className="p-3"
                    style={{ borderRight: i < 1 ? "1px solid #21262D" : undefined }}
                  >
                    <div className="text-xs mb-1" style={{ color: "#6E7681" }}>{item.label}</div>
                    <div className="text-sm font-bold font-mono" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
