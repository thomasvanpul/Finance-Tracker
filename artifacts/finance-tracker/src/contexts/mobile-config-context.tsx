import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";

export type HomeWidget = "net-worth" | "this-month" | "accounts" | "goals" | "upcoming" | "recent-txns" | "budget";
export type QuickAction = "log-expense" | "log-income" | "add-goal" | "view-accounts";
export type MidTab = "accounts" | "txns" | "budget" | "goals" | "investments";

export interface MobileConfig {
  midTabs: [MidTab, MidTab];
  homeWidgets: HomeWidget[];
  quickActions: QuickAction[];
}

export const DEFAULT_CONFIG: MobileConfig = {
  midTabs: ["txns", "budget"],
  homeWidgets: ["net-worth", "this-month", "accounts", "recent-txns"],
  quickActions: ["log-expense", "log-income"],
};

export const ALL_WIDGETS: { id: HomeWidget; label: string; desc: string }[] = [
  { id: "net-worth",   label: "Net Worth",            desc: "Total wealth at a glance" },
  { id: "this-month",  label: "This Month",           desc: "Income, spending & savings" },
  { id: "accounts",    label: "Accounts",             desc: "Balance cards per account" },
  { id: "goals",       label: "Goals",                desc: "Savings target progress" },
  { id: "upcoming",    label: "Upcoming Bills",       desc: "Next scheduled payments" },
  { id: "recent-txns", label: "Recent Transactions",  desc: "Latest activity" },
  { id: "budget",      label: "Budget Bars",          desc: "Monthly category limits" },
];

export const ALL_ACTIONS: { id: QuickAction; label: string; fixed?: boolean }[] = [
  { id: "log-expense",   label: "Log Expense",   fixed: true },
  { id: "log-income",    label: "Log Income" },
  { id: "add-goal",      label: "View Goals" },
  { id: "view-accounts", label: "View Accounts" },
];

export const MID_TAB_OPTIONS: { id: MidTab; label: string }[] = [
  { id: "accounts",    label: "Accounts" },
  { id: "txns",        label: "Transactions" },
  { id: "budget",      label: "Budget" },
  { id: "goals",       label: "Goals" },
  { id: "investments", label: "Investments" },
];

const LS_KEY = "nr-mobile-config-v1";

function loadConfig(): MobileConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

type Action =
  | { type: "SET_MIDTABS"; tabs: [MidTab, MidTab] }
  | { type: "TOGGLE_WIDGET"; widget: HomeWidget }
  | { type: "REORDER_WIDGETS"; widgets: HomeWidget[] }
  | { type: "TOGGLE_ACTION"; action: QuickAction }
  | { type: "RESET" };

function reducer(state: MobileConfig, action: Action): MobileConfig {
  let next: MobileConfig;
  switch (action.type) {
    case "SET_MIDTABS":
      next = { ...state, midTabs: action.tabs };
      break;
    case "TOGGLE_WIDGET": {
      const has = state.homeWidgets.includes(action.widget);
      next = {
        ...state,
        homeWidgets: has
          ? state.homeWidgets.filter(w => w !== action.widget)
          : [...state.homeWidgets, action.widget],
      };
      break;
    }
    case "REORDER_WIDGETS":
      next = { ...state, homeWidgets: action.widgets };
      break;
    case "TOGGLE_ACTION": {
      if (action.action === "log-expense") return state;
      const has = state.quickActions.includes(action.action);
      next = {
        ...state,
        quickActions: has
          ? state.quickActions.filter(a => a !== action.action)
          : state.quickActions.length < 4
            ? [...state.quickActions, action.action]
            : state.quickActions,
      };
      break;
    }
    case "RESET":
      next = DEFAULT_CONFIG;
      break;
    default:
      return state;
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

interface MobileConfigCtx {
  config: MobileConfig;
  setMidTabs: (tabs: [MidTab, MidTab]) => void;
  toggleWidget: (w: HomeWidget) => void;
  reorderWidgets: (ws: HomeWidget[]) => void;
  toggleAction: (a: QuickAction) => void;
  resetConfig: () => void;
}

const Ctx = createContext<MobileConfigCtx | null>(null);

export function MobileConfigProvider({ children }: { children: ReactNode }) {
  const [config, dispatch] = useReducer(reducer, undefined, loadConfig);

  const setMidTabs    = useCallback((tabs: [MidTab, MidTab]) => dispatch({ type: "SET_MIDTABS", tabs }), []);
  const toggleWidget  = useCallback((widget: HomeWidget)     => dispatch({ type: "TOGGLE_WIDGET", widget }), []);
  const reorderWidgets = useCallback((widgets: HomeWidget[]) => dispatch({ type: "REORDER_WIDGETS", widgets }), []);
  const toggleAction  = useCallback((action: QuickAction)    => dispatch({ type: "TOGGLE_ACTION", action }), []);
  const resetConfig   = useCallback(()                       => dispatch({ type: "RESET" }), []);

  return (
    <Ctx.Provider value={{ config, setMidTabs, toggleWidget, reorderWidgets, toggleAction, resetConfig }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMobileConfig() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMobileConfig requires MobileConfigProvider");
  return ctx;
}
