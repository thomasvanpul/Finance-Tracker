import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowDownRight, ArrowUpRight, Landmark, LineChart, Wallet, AlertCircle } from "lucide-react";

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: React.ReactNode;
  icon?: any;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="bg-card/50 border-card-border/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
        {subtitle && (
          <p
            className={`text-xs mt-1 font-medium ${
              trend === "up"
                ? "text-success"
                : trend === "down"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: dashboard, isLoading, isError, error } = useGetDashboard();

  if (isLoading || (!dashboard && !isError)) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Centre</h1>
        <p className="text-muted-foreground">Your financial overview at a glance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Net Liquidity"
          value={formatGbp(dashboard.netLiquidity)}
          icon={Wallet}
        />
        <MetricCard
          title="Net Worth"
          value={formatGbp(dashboard.netWorth)}
          icon={Landmark}
        />
        <MetricCard
          title="Total Cash"
          value={formatGbp(dashboard.totalCash)}
          subtitle={`${dashboard.accountBreakdown.length} Accounts connected`}
          icon={Wallet}
        />
        <MetricCard
          title="Portfolio Value"
          value={formatGbp(dashboard.portfolio.totalValueGbp)}
          subtitle={`${formatGbp(dashboard.portfolio.totalPlGbp)} (${formatPercent(
            dashboard.portfolio.totalPlPercent
          )})`}
          trend={dashboard.portfolio.totalPlGbp >= 0 ? "up" : "down"}
          icon={LineChart}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-card-border/50">
          <CardHeader>
            <CardTitle>Cash Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.accountBreakdown.map((account) => (
                <div key={account.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Landmark className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{account.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Intl.NumberFormat("en-GB", {
                          style: "currency",
                          currency: account.currency,
                        }).format(account.balance)}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm font-medium">{formatGbp(account.gbpEquivalent)}</div>
                </div>
              ))}
              {dashboard.accountBreakdown.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No accounts added yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-card-border/50">
          <CardHeader>
            <CardTitle>This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                    <ArrowDownRight className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">Income</p>
                  </div>
                </div>
                <div className="text-lg font-bold text-success">
                  +{formatGbp(dashboard.thisMonth.income)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">Expenses</p>
                  </div>
                </div>
                <div className="text-lg font-bold text-destructive">
                  -{formatGbp(dashboard.thisMonth.expenses)}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium leading-none">Net Savings</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatPercent(dashboard.thisMonth.savingsRate)} savings rate
                  </p>
                </div>
                <div
                  className={`text-xl font-bold ${
                    dashboard.thisMonth.netSavings >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {dashboard.thisMonth.netSavings > 0 ? "+" : ""}
                  {formatGbp(dashboard.thisMonth.netSavings)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
