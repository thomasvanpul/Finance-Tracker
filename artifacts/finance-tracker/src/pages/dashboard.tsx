import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Landmark } from "lucide-react";

const COL_STYLE: React.CSSProperties = {
  padding: "5px 0",
  fontSize: 10,
  color: "#6E7681",
  textAlign: "center",
  borderRight: "1px solid #21262D",
  fontWeight: 600,
  background: "#161B22",
  borderBottom: "2px solid #30363D",
};

function SectionHeader({ label, color = "#1F6FEB" }: { label: string; color?: string }) {
  return (
    <div
      className="flex items-center px-3 py-1.5 text-xs font-bold tracking-wide border-b"
      style={{ background: color + "22", borderColor: color + "44", color }}
    >
      ▼ {label}
    </div>
  );
}

function XlsRow({
  cells,
  rowNum,
  highlight,
}: {
  cells: React.ReactNode[];
  rowNum?: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center border-b xls-row"
      style={{
        borderColor: "rgba(33,38,45,0.5)",
        background: highlight ? "rgba(31,111,235,0.08)" : undefined,
      }}
    >
      {rowNum !== undefined && (
        <div
          className="flex-shrink-0 flex items-center justify-center text-xs border-r"
          style={{ width: 36, color: "#484F58", borderColor: "#21262D", height: 28 }}
        >
          {rowNum}
        </div>
      )}
      {cells}
    </div>
  );
}

function Cell({
  children,
  right,
  bold,
  color,
  flex = 1,
  mono,
}: {
  children: React.ReactNode;
  right?: boolean;
  bold?: boolean;
  color?: string;
  flex?: number;
  mono?: boolean;
}) {
  return (
    <div
      className="px-3 py-1.5 text-xs border-r truncate"
      style={{
        flex,
        textAlign: right ? "right" : "left",
        fontWeight: bold ? 700 : 400,
        color: color ?? "#C9D1D9",
        borderColor: "#21262D",
        fontVariantNumeric: mono ? "tabular-nums" : undefined,
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { data: dashboard, isLoading, isError, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: "#E6EDF3" }}>
            Portfolio Overview
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#484F58" }}>
            All figures in GBP · Live market data
          </p>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load dashboard</AlertTitle>
          <AlertDescription>
            {(error as any)?.message ?? "Could not reach the server. Check your connection."}
          </AlertDescription>
        </Alert>
      )}

      {dashboard && (
        <>
          {/* ── KPI Summary Table ── */}
          <div className="border" style={{ borderColor: "#21262D" }}>
            <SectionHeader label="KEY METRICS — Snapshot" color="#1F6FEB" />

            {/* Column headers */}
            <div className="flex" style={{ marginLeft: 36 }}>
              {["METRIC", "VALUE (GBP)", "DETAIL", "STATUS"].map((h, i) => (
                <div key={h} style={{ ...COL_STYLE, flex: [2, 2, 3, 2][i] }}>{h}</div>
              ))}
            </div>

            {[
              {
                metric: "Net Worth",
                value: formatGbp(dashboard.netWorth),
                detail: `Cash + Portfolio`,
                status: "▲ Healthy",
                statusColor: "#3FB950",
              },
              {
                metric: "Net Liquidity",
                value: formatGbp(dashboard.netLiquidity),
                detail: "Available cash",
                status: "▲ Positive",
                statusColor: "#3FB950",
              },
              {
                metric: "Total Cash",
                value: formatGbp(dashboard.totalCash),
                detail: `${dashboard.accountBreakdown.length} account${dashboard.accountBreakdown.length !== 1 ? "s" : ""} linked`,
                status: dashboard.accountBreakdown.length > 0 ? "● Synced" : "○ No accounts",
                statusColor: dashboard.accountBreakdown.length > 0 ? "#58A6FF" : "#8B949E",
              },
              {
                metric: "Portfolio Value",
                value: formatGbp(dashboard.portfolio.totalValueGbp),
                detail: `P&L: ${dashboard.portfolio.totalPlGbp >= 0 ? "+" : ""}${formatGbp(dashboard.portfolio.totalPlGbp)} (${formatPercent(dashboard.portfolio.totalPlPercent)})`,
                status: dashboard.portfolio.totalPlGbp >= 0 ? "▲ Gain" : "▼ Loss",
                statusColor: dashboard.portfolio.totalPlGbp >= 0 ? "#3FB950" : "#F85149",
              },
            ].map((row, i) => (
              <XlsRow
                key={row.metric}
                rowNum={i + 2}
                highlight={i === 0}
                cells={[
                  <Cell key="m" flex={2} color="#E6EDF3" bold>{row.metric}</Cell>,
                  <Cell key="v" flex={2} color="#58A6FF" bold mono>{row.value}</Cell>,
                  <Cell key="d" flex={3} color="#8B949E">{row.detail}</Cell>,
                  <Cell key="s" flex={2} color={row.statusColor}>{row.status}</Cell>,
                ]}
              />
            ))}

            {/* Totals row */}
            <div
              className="flex items-center border-t"
              style={{ background: "rgba(31,111,235,0.04)", borderColor: "#30363D" }}
            >
              <div style={{ width: 36 }} />
              <Cell flex={2} color="#484F58" bold>TOTAL NET WORTH</Cell>
              <Cell flex={2} color="#E6EDF3" bold mono>{formatGbp(dashboard.netWorth)}</Cell>
              <Cell flex={3} color="#484F58">Sum of all assets</Cell>
              <Cell flex={2} color="#3FB950" bold>● All systems go</Cell>
            </div>
          </div>

          {/* ── Two column lower area ── */}
          <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {/* Cash Accounts Table */}
            <div className="border" style={{ borderColor: "#21262D" }}>
              <SectionHeader label="CASH ACCOUNTS — Multi-Currency" color="#3FB950" />
              <div className="flex" style={{ marginLeft: 36 }}>
                {["ACCOUNT", "CURRENCY", "NATIVE BAL", "GBP EQUIV"].map((h, i) => (
                  <div key={h} style={{ ...COL_STYLE, flex: [3, 1, 2, 2][i] }}>{h}</div>
                ))}
              </div>

              {dashboard.accountBreakdown.length === 0 ? (
                <XlsRow
                  rowNum={2}
                  cells={[
                    <div
                      key="empty"
                      className="flex-1 px-3 py-4 text-xs text-center"
                      style={{ color: "#484F58" }}
                    >
                      No accounts linked — connect a bank via Accounts page
                    </div>,
                  ]}
                />
              ) : (
                dashboard.accountBreakdown.map((acct, i) => (
                  <XlsRow
                    key={acct.id}
                    rowNum={i + 2}
                    cells={[
                      <Cell key="n" flex={3} color="#E6EDF3">
                        <span className="flex items-center gap-1.5">
                          <Landmark className="w-3 h-3 flex-shrink-0" style={{ color: "#484F58" }} />
                          {acct.name}
                        </span>
                      </Cell>,
                      <Cell key="c" flex={1} color="#58A6FF" bold>{acct.currency}</Cell>,
                      <Cell key="nb" flex={2} color="#8B949E" mono>
                        {new Intl.NumberFormat("en-GB", {
                          style: "currency",
                          currency: acct.currency,
                        }).format(acct.balance)}
                      </Cell>,
                      <Cell key="gbp" flex={2} color="#3FB950" bold mono>
                        {formatGbp(acct.gbpEquivalent)}
                      </Cell>,
                    ]}
                  />
                ))
              )}

              {dashboard.accountBreakdown.length > 0 && (
                <div
                  className="flex items-center border-t"
                  style={{ background: "rgba(63,185,80,0.04)", borderColor: "#30363D" }}
                >
                  <div style={{ width: 36 }} />
                  <Cell flex={3} color="#484F58" bold>TOTAL CASH</Cell>
                  <Cell flex={1} color="#484F58">GBP</Cell>
                  <Cell flex={2}>{""}</Cell>
                  <Cell flex={2} color="#3FB950" bold mono>{formatGbp(dashboard.totalCash)}</Cell>
                </div>
              )}
            </div>

            {/* Monthly P&L Table */}
            <div className="border" style={{ borderColor: "#21262D" }}>
              <SectionHeader label="MONTHLY P&L — Current Period" color="#58A6FF" />
              <div className="flex" style={{ marginLeft: 36 }}>
                {["CATEGORY", "DIRECTION", "AMOUNT (GBP)"].map((h, i) => (
                  <div key={h} style={{ ...COL_STYLE, flex: [3, 2, 3][i] }}>{h}</div>
                ))}
              </div>

              {[
                {
                  cat: "Income",
                  dir: "CREDIT ▲",
                  amount: `+${formatGbp(dashboard.thisMonth.income)}`,
                  color: "#3FB950",
                  bg: "rgba(63,185,80,0.05)",
                },
                {
                  cat: "Expenses",
                  dir: "DEBIT ▼",
                  amount: `-${formatGbp(dashboard.thisMonth.expenses)}`,
                  color: "#F85149",
                  bg: "rgba(248,81,73,0.05)",
                },
              ].map((row, i) => (
                <XlsRow
                  key={row.cat}
                  rowNum={i + 2}
                  cells={[
                    <Cell key="c" flex={3} color="#E6EDF3">{row.cat}</Cell>,
                    <Cell key="d" flex={2} color={row.color}>{row.dir}</Cell>,
                    <Cell key="a" flex={3} color={row.color} bold mono>{row.amount}</Cell>,
                  ]}
                />
              ))}

              {/* Net row */}
              <div
                className="flex items-center border-t"
                style={{
                  background: dashboard.thisMonth.netSavings >= 0
                    ? "rgba(63,185,80,0.06)"
                    : "rgba(248,81,73,0.06)",
                  borderColor: "#30363D",
                }}
              >
                <div style={{ width: 36 }} />
                <Cell flex={3} color="#484F58" bold>NET SAVINGS</Cell>
                <Cell flex={2} color={dashboard.thisMonth.netSavings >= 0 ? "#3FB950" : "#F85149"}>
                  {formatPercent(dashboard.thisMonth.savingsRate)} rate
                </Cell>
                <Cell
                  flex={3}
                  bold
                  mono
                  color={dashboard.thisMonth.netSavings >= 0 ? "#3FB950" : "#F85149"}
                >
                  {dashboard.thisMonth.netSavings > 0 ? "+" : ""}
                  {formatGbp(dashboard.thisMonth.netSavings)}
                </Cell>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
