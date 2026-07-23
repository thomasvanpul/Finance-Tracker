import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthGate } from "@/components/auth-gate";
import { ThemeProvider } from "@/contexts/theme-context";
import { WidgetsProvider } from "@/contexts/widgets-context";
import { TickersProvider } from "@/contexts/tickers-context";
import { PrivacyProvider } from "@/contexts/privacy-context";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import Transactions from "@/pages/transactions";
import Upcoming from "@/pages/upcoming";
import Investments from "@/pages/investments";
import Owing from "@/pages/owing";
import Settings from "@/pages/settings";
import Profile from "@/pages/profile";
import Reports from "@/pages/reports";
import Goals from "@/pages/goals";
import Analytics from "@/pages/analytics";
import Budget from "@/pages/budget";
import HealthScore from "@/pages/health-score";
import NetWorthHistory from "@/pages/net-worth-history";
import WhatIf from "@/pages/whatif";
import Subscriptions from "@/pages/subscriptions";
import Tax from "@/pages/tax";
import Mortgage from "@/pages/mortgage";
import Calendar from "@/pages/calendar";
import Split from "@/pages/split";
import CashFlow from "@/pages/cashflow";
import YearReview from "@/pages/year-review";
import Import from "@/pages/import";
import Recurring from "@/pages/recurring";
import Learn from "@/pages/learn";
import Wardrobe from "@/pages/wardrobe";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/upcoming" component={Upcoming} />
        <Route path="/investments" component={Investments} />
        <Route path="/owing" component={Owing} />
        <Route path="/reports" component={Reports} />
        <Route path="/goals" component={Goals} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/budget" component={Budget} />
        <Route path="/health-score" component={HealthScore} />
        <Route path="/net-worth" component={NetWorthHistory} />
        <Route path="/whatif" component={WhatIf} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/tax" component={Tax} />
        <Route path="/mortgage" component={Mortgage} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/split" component={Split} />
        {/* Redirects for consolidated routes */}
        <Route path="/reports"><Redirect to="/analytics" /></Route>
        <Route path="/upcoming"><Redirect to="/calendar" /></Route>
        <Route path="/split"><Redirect to="/owing" /></Route>
        <Route path="/recurring"><Redirect to="/subscriptions" /></Route>
        <Route path="/mortgage"><Redirect to="/whatif" /></Route>
        <Route path="/learn" component={Learn} />
        <Route path="/cashflow" component={CashFlow} />
        <Route path="/year-review" component={YearReview} />
        <Route path="/import" component={Import} />
        <Route path="/recurring" component={Recurring} />
        <Route path="/settings" component={Settings} />
        <Route path="/profile" component={Profile} />
        <Route path="/wardrobe" component={Wardrobe} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <PrivacyProvider>
      <TickersProvider>
      <WidgetsProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthGate>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </AuthGate>
          </TooltipProvider>
        </QueryClientProvider>
      </WidgetsProvider>
      </TickersProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}

export default App;
