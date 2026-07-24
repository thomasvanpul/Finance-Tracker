import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type WidgetId =
  | "net-worth"
  | "spending-breakdown"
  | "budget-tracker"
  | "savings-goals"
  | "subscription-tracker"
  | "cash-flow"
  | "recent-transactions"
  | "accounts-summary"
  | "market-snapshot"
  | "recurring-detector"
  | "financial-health"
  | "transaction-calendar"
  | "cash-flow-sankey"
  | "month-comparison"
  | "spending-forecast"
  | "daily-spend"
  | "top-merchants"
  | "cash-flow-preview"
  | "spending-velocity"
  | "savings-rate"
  | "emergency-fund"
  | "nw-milestones";

export type WidgetSpan = "half" | "full";

export interface WidgetDef {
  id: WidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultSpan: WidgetSpan;
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  { id: "net-worth",            label: "Net Worth",           description: "Total assets minus liabilities over time", defaultEnabled: true,  defaultSpan: "full" },
  { id: "accounts-summary",     label: "Accounts",            description: "Balance across all linked accounts",       defaultEnabled: true,  defaultSpan: "half" },
  { id: "recent-transactions",  label: "Recent Transactions", description: "Last 10 transactions across all accounts", defaultEnabled: true,  defaultSpan: "half" },
  { id: "spending-breakdown",   label: "Spending Breakdown",  description: "Category donut chart for the current month", defaultEnabled: true,  defaultSpan: "half" },
  { id: "cash-flow",            label: "Cash Flow",           description: "Income vs expenses bar chart by month",    defaultEnabled: true,  defaultSpan: "half" },
  { id: "budget-tracker",       label: "Budget Tracker",      description: "Spending limits with progress bars",       defaultEnabled: false, defaultSpan: "full" },
  { id: "savings-goals",        label: "Savings Goals",       description: "Goal cards with completion progress",      defaultEnabled: false, defaultSpan: "full" },
  { id: "subscription-tracker", label: "Subscriptions",       description: "Detected recurring monthly charges",       defaultEnabled: false, defaultSpan: "half" },
  { id: "market-snapshot",      label: "Market Snapshot",     description: "Live indices: FTSE, SPX, BTC, GBP/USD",   defaultEnabled: false, defaultSpan: "half" },
  { id: "recurring-detector",   label: "Recurring Detector",  description: "Auto-detected recurring monthly charges",  defaultEnabled: false, defaultSpan: "full" },
  { id: "financial-health",     label: "Financial Health",    description: "Composite health score across savings, liquidity, portfolio, and cash buffer", defaultEnabled: false, defaultSpan: "half" },
  { id: "transaction-calendar", label: "Calendar",            description: "Monthly calendar with per-day income and expense indicators", defaultEnabled: false, defaultSpan: "full" },
  { id: "cash-flow-sankey",     label: "Flow Diagram",        description: "Sankey-style income → spending → savings flow for the current month", defaultEnabled: false, defaultSpan: "full" },
  { id: "month-comparison",     label: "MoM Comparison",      description: "This month vs last month by category",                                 defaultEnabled: false, defaultSpan: "half" },
  { id: "spending-forecast",    label: "Spending Forecast",   description: "Projected month-end spend based on current daily rate",                defaultEnabled: false, defaultSpan: "half" },
  { id: "daily-spend",          label: "Daily Spend",         description: "Today's spending vs daily average",                                     defaultEnabled: false, defaultSpan: "half" },
  { id: "top-merchants",        label: "Top Merchants",       description: "Top payees this month by spend",                                        defaultEnabled: false, defaultSpan: "half" },
  { id: "cash-flow-preview",   label: "Cash Flow · 30 Days", description: "30-day projected balance",                                              defaultEnabled: true,  defaultSpan: "half" },
  { id: "spending-velocity",   label: "Spend Rate",          description: "Daily spend vs last month",                                             defaultEnabled: true,  defaultSpan: "half" },
  { id: "savings-rate",        label: "Savings Rate",        description: "This month's savings rate vs target",                                   defaultEnabled: true,  defaultSpan: "half" },
  { id: "emergency-fund",      label: "Emergency Fund",      description: "Months of expenses covered vs 6-month target",                          defaultEnabled: true,  defaultSpan: "half" },
  { id: "nw-milestones",      label: "Milestones",          description: "Net worth milestones reached over time",                                     defaultEnabled: false, defaultSpan: "half" },
];

const DEFAULT_DEF_MAP = Object.fromEntries(WIDGET_REGISTRY.map(w => [w.id, w]));

interface StoredState {
  enabled: WidgetId[];
  order: WidgetId[];
  spans: Partial<Record<WidgetId, WidgetSpan>>;
}

interface WidgetsCtx {
  enabled: Set<WidgetId>;
  order: WidgetId[];
  spans: Partial<Record<WidgetId, WidgetSpan>>;
  toggle: (id: WidgetId) => void;
  isEnabled: (id: WidgetId) => boolean;
  setOrder: (order: WidgetId[]) => void;
  toggleSpan: (id: WidgetId) => void;
  getSpan: (id: WidgetId) => WidgetSpan;
}

const WidgetsContext = createContext<WidgetsCtx | null>(null);

function load(): StoredState {
  try {
    const raw = localStorage.getItem("ft-widgets");
    if (raw) {
      const parsed = JSON.parse(raw);
      const storedOrder: WidgetId[] = parsed.order ?? WIDGET_REGISTRY.map(w => w.id);
      const storedEnabled: WidgetId[] = parsed.enabled ?? WIDGET_REGISTRY.filter(w => w.defaultEnabled).map(w => w.id);

      // Migrate: append any registry IDs not yet in stored order/enabled
      const storedOrderSet = new Set(storedOrder);
      const migratedOrder = [...storedOrder];
      const migratedEnabled = [...storedEnabled];

      for (const def of WIDGET_REGISTRY) {
        if (!storedOrderSet.has(def.id)) {
          migratedOrder.push(def.id);
          if (def.defaultEnabled) {
            migratedEnabled.push(def.id);
          }
        }
      }

      return {
        enabled: migratedEnabled,
        order: migratedOrder,
        spans: parsed.spans ?? {},
      };
    }
  } catch {}
  return {
    enabled: WIDGET_REGISTRY.filter(w => w.defaultEnabled).map(w => w.id),
    order: WIDGET_REGISTRY.map(w => w.id),
    spans: {},
  };
}

function persist(enabled: WidgetId[], order: WidgetId[], spans: Partial<Record<WidgetId, WidgetSpan>>) {
  try { localStorage.setItem("ft-widgets", JSON.stringify({ enabled, order, spans })); } catch {}
}

export function WidgetsProvider({ children }: { children: ReactNode }) {
  const init = load();
  const [enabled, setEnabled] = useState<Set<WidgetId>>(new Set(init.enabled));
  const [order, setOrderState] = useState<WidgetId[]>(init.order);
  const [spans, setSpans] = useState<Partial<Record<WidgetId, WidgetSpan>>>(init.spans);

  const toggle = useCallback((id: WidgetId) => {
    setEnabled(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persist([...next], order, spans);
      return next;
    });
  }, [order, spans]);

  const setOrder = useCallback((newOrder: WidgetId[]) => {
    setOrderState(newOrder);
    persist([...enabled], newOrder, spans);
  }, [enabled, spans]);

  const toggleSpan = useCallback((id: WidgetId) => {
    setSpans(prev => {
      const current = prev[id] ?? DEFAULT_DEF_MAP[id]?.defaultSpan ?? "half";
      const next = { ...prev, [id]: current === "full" ? "half" : "full" as WidgetSpan };
      persist([...enabled], order, next);
      return next;
    });
  }, [enabled, order]);

  const getSpan = useCallback((id: WidgetId): WidgetSpan => {
    return spans[id] ?? DEFAULT_DEF_MAP[id]?.defaultSpan ?? "half";
  }, [spans]);

  return (
    <WidgetsContext.Provider value={{
      enabled,
      order,
      spans,
      toggle,
      isEnabled: id => enabled.has(id),
      setOrder,
      toggleSpan,
      getSpan,
    }}>
      {children}
    </WidgetsContext.Provider>
  );
}

export function useWidgets() {
  const ctx = useContext(WidgetsContext);
  if (!ctx) throw new Error("useWidgets must be used within WidgetsProvider");
  return ctx;
}
