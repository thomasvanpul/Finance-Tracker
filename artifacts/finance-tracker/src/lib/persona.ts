import { saveSidebarConfig } from "@/lib/sidebar-config";
import { ALL_NAV_HREFS } from "@/lib/persona-nav";

// Widget IDs ordered as in WIDGET_REGISTRY — used to build persona presets
const ALL_WIDGET_IDS = [
  "net-worth", "accounts-summary", "recent-transactions", "spending-breakdown",
  "cash-flow", "budget-tracker", "savings-goals", "subscription-tracker",
  "market-snapshot", "recurring-detector", "financial-health", "transaction-calendar",
  "cash-flow-sankey", "month-comparison", "spending-forecast", "daily-spend",
  "top-merchants", "cash-flow-preview", "spending-velocity", "savings-rate",
  "emergency-fund", "nw-milestones", "decision-engine",
] as const;

type WidgetId = typeof ALL_WIDGET_IDS[number];
type WidgetSpan = "half" | "full";

interface WidgetConfig {
  enabled: WidgetId[];
  order: WidgetId[];
  spans: Partial<Record<WidgetId, WidgetSpan>>;
}

const PERSONA_WIDGETS: Record<PersonaId, WidgetConfig> = {
  market: {
    enabled: ["market-snapshot", "net-worth", "decision-engine", "financial-health", "accounts-summary"],
    order: ["market-snapshot", "net-worth", "decision-engine", "financial-health", "accounts-summary",
      "recent-transactions", "spending-breakdown", "cash-flow", "budget-tracker", "savings-goals",
      "subscription-tracker", "recurring-detector", "transaction-calendar", "cash-flow-sankey",
      "month-comparison", "spending-forecast", "daily-spend", "top-merchants", "cash-flow-preview",
      "spending-velocity", "savings-rate", "emergency-fund", "nw-milestones"],
    spans: { "market-snapshot": "full" },
  },
  budget: {
    enabled: ["spending-breakdown", "budget-tracker", "recent-transactions", "cash-flow",
      "accounts-summary", "cash-flow-preview", "spending-velocity", "savings-rate",
      "emergency-fund", "daily-spend", "savings-goals", "decision-engine"],
    order: ["spending-breakdown", "budget-tracker", "recent-transactions", "cash-flow",
      "accounts-summary", "cash-flow-preview", "savings-rate", "daily-spend",
      "spending-velocity", "emergency-fund", "savings-goals", "decision-engine",
      "net-worth", "subscription-tracker", "market-snapshot", "recurring-detector",
      "financial-health", "transaction-calendar", "cash-flow-sankey", "month-comparison",
      "spending-forecast", "top-merchants", "nw-milestones"],
    spans: { "budget-tracker": "full" },
  },
  wealth: {
    enabled: ["net-worth", "nw-milestones", "savings-goals", "savings-rate", "emergency-fund",
      "financial-health", "market-snapshot", "cash-flow", "accounts-summary", "decision-engine"],
    order: ["net-worth", "nw-milestones", "savings-rate", "emergency-fund", "financial-health",
      "savings-goals", "market-snapshot", "cash-flow", "accounts-summary", "decision-engine",
      "recent-transactions", "spending-breakdown", "budget-tracker", "subscription-tracker",
      "recurring-detector", "transaction-calendar", "cash-flow-sankey", "month-comparison",
      "spending-forecast", "daily-spend", "top-merchants", "cash-flow-preview",
      "spending-velocity"],
    spans: { "net-worth": "full", "nw-milestones": "full" },
  },
  social: {
    enabled: ["accounts-summary", "recent-transactions", "spending-breakdown", "cash-flow-preview", "decision-engine"],
    order: ["accounts-summary", "recent-transactions", "spending-breakdown", "cash-flow-preview",
      "decision-engine", "cash-flow", "budget-tracker", "savings-goals", "subscription-tracker",
      "market-snapshot", "net-worth", "recurring-detector", "financial-health",
      "transaction-calendar", "cash-flow-sankey", "month-comparison", "spending-forecast",
      "daily-spend", "top-merchants", "spending-velocity", "savings-rate", "emergency-fund",
      "nw-milestones"],
    spans: {},
  },
  full: {
    enabled: [...ALL_WIDGET_IDS],
    order: [...ALL_WIDGET_IDS],
    spans: { "net-worth": "full", "market-snapshot": "full", "budget-tracker": "full" },
  },
};

export type PersonaId = "market" | "budget" | "wealth" | "social" | "full";

export interface Persona {
  id: PersonaId;
  code: string;
  label: string;
  tagline: string;
  description: string;
  defaultPage: string;
  highlights: string[];
  pinnedHrefs: string[];
  visibleHrefs: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "market",
    code: "MKT·01",
    label: "Market Terminal",
    tagline: "Watch stocks, track your portfolio",
    description:
      "Built for investors who want live prices, portfolio P&L, earnings calendars, and market news — without any bank linking.",
    defaultPage: "/portfolio",
    highlights: ["Live market data & charts", "Portfolio P&L tracking", "Earnings calendar", "AI-powered decisions"],
    pinnedHrefs: ["/portfolio", "/investments", "/calendar"],
    visibleHrefs: [
      "/", "/portfolio", "/investments", "/calendar", "/decisions",
      "/ai-coach", "/net-worth", "/calculators", "/learn", "/settings",
    ],
  },
  {
    id: "budget",
    code: "BDG·02",
    label: "Budget Commander",
    tagline: "Control spending, hit your goals",
    description:
      "For people who want to understand where every pound goes — track transactions, enforce budgets, and work toward savings targets.",
    defaultPage: "/",
    highlights: ["Transaction tracking", "Budget categories", "Spending analytics", "Savings goals"],
    pinnedHrefs: ["/", "/transactions", "/budget"],
    visibleHrefs: [
      "/", "/accounts", "/transactions", "/budget", "/goals",
      "/analytics", "/subscriptions", "/recurring", "/cashflow",
      "/upcoming", "/import", "/reports", "/ai-coach", "/settings",
    ],
  },
  {
    id: "wealth",
    code: "WLT·03",
    label: "Wealth Architect",
    tagline: "Build net worth, plan retirement",
    description:
      "Long-horizon financial planning — net worth growth, FIRE projections, pension tracking, and scenario modelling.",
    defaultPage: "/net-worth",
    highlights: ["Net worth history", "FIRE calculator", "Pension & ISA tracker", "What-if scenarios"],
    pinnedHrefs: ["/net-worth", "/portfolio", "/goals"],
    visibleHrefs: [
      "/", "/portfolio", "/investments", "/net-worth", "/goals",
      "/fire", "/pension", "/whatif", "/tax", "/calculators",
      "/decisions", "/ai-coach", "/projection", "/settings",
    ],
  },
  {
    id: "social",
    code: "SOC·04",
    label: "Social Finance",
    tagline: "Split bills, track shared costs",
    description:
      "Group expenses, debt tracking, and shared finances — perfect for housemates, trips, or anyone who regularly splits bills.",
    defaultPage: "/split",
    highlights: ["AI receipt scanning", "Bill splitting", "Debt ledger", "Push to transactions"],
    pinnedHrefs: ["/split", "/owing", "/transactions"],
    visibleHrefs: [
      "/", "/accounts", "/transactions", "/split", "/owing",
      "/budget", "/subscriptions", "/upcoming", "/ai-coach", "/settings",
    ],
  },
  {
    id: "full",
    code: "ANL·05",
    label: "Full Analyst",
    tagline: "The complete Bloomberg experience",
    description:
      "Every page, every tool, every widget. For power users who want the full terminal with nothing hidden.",
    defaultPage: "/",
    highlights: ["All 30+ pages unlocked", "Full nav customisation", "Every financial tool", "No restrictions"],
    pinnedHrefs: ["/", "/transactions", "/portfolio"],
    visibleHrefs: ALL_NAV_HREFS,
  },
];

// Accent is the closed enum of named accents in the design language.
// Every colour a caller wants to apply should route through here — a bare
// hex or `var(--ft-*)` literal at a callsite is a smell.
export type Accent = "blue" | "green" | "amber" | "violet" | "accent";

export const ACCENTS: Record<Accent, string> = {
  blue: "var(--ft-blue)",
  green: "var(--ft-green)",
  amber: "var(--ft-amber)",
  violet: "#A78BFA",
  accent: "var(--ft-accent)",
};

export const PERSONA_ACCENT: Record<PersonaId, Accent> = {
  market: "blue",
  budget: "green",
  wealth: "amber",
  social: "violet",
  full: "accent",
};

// Kept as-is at the call surface for backward compatibility — every entry
// now derives from PERSONA_ACCENT + ACCENTS so the mapping is one-way and
// there is no risk of drift between "persona colour" and "accent token".
export const PERSONA_COLORS: Record<PersonaId, string> = {
  market: ACCENTS[PERSONA_ACCENT.market],
  budget: ACCENTS[PERSONA_ACCENT.budget],
  wealth: ACCENTS[PERSONA_ACCENT.wealth],
  social: ACCENTS[PERSONA_ACCENT.social],
  full: ACCENTS[PERSONA_ACCENT.full],
};

export const PERSONA_GLYPHS: Record<PersonaId, string> = {
  market: "▲",
  budget: "◈",
  wealth: "◆",
  social: "⬡",
  full: "✦",
};

export const PERSONA_BG: Record<PersonaId, string> = {
  market: "rgba(96,165,250,0.08)",
  budget: "rgba(74,222,128,0.08)",
  wealth: "rgba(245,158,11,0.08)",
  social: "rgba(167,139,250,0.08)",
  full:   "rgba(239,68,68,0.08)",
};

export const PERSONA_FOCUS: Record<PersonaId, string> = {
  market: "Portfolio anomalies · large positions · price movements · P&L drift",
  budget: "Budget overruns · category limits · spending velocity · monthly burn",
  wealth: "Savings rate · FIRE trajectory · net worth milestones · tax efficiency",
  social: "Outstanding IOUs · shared expense settlements · group debt tracking",
  full: "Full monitoring across all alert categories — nothing filtered",
};

export const PERSONA_INSIGHT_PREVIEWS: Record<PersonaId, { page: string; msg: string }[]> = {
  market: [
    { page: "Portfolio", msg: "Market Terminal active — live prices and P&L on all positions. Tap any ticker for intraday chart." },
    { page: "Cashflow",  msg: "Monthly net +£1,240: 30-day forecast shows investable surplus trajectory." },
    { page: "Tax",       msg: "£6,000 of CGT allowance still available — rebalancing within this limit is tax-free." },
  ],
  budget: [
    { page: "Budget",        msg: "Budget Commander mode — spending limits enforced across all 12 categories." },
    { page: "Analytics",     msg: "Spot where the money is going — category breakdown and calendar heatmap are your best friends." },
    { page: "Subscriptions", msg: "Recurring costs are 18% of monthly income — target under 15% for healthy budgets." },
  ],
  wealth: [
    { page: "Net Worth", msg: "Wealth Architect active — net worth growth trajectory and FIRE progress pre-loaded." },
    { page: "Pension",   msg: "TAX TIP — Max ISA before taxable investing. £20,000/yr grows entirely tax-free." },
    { page: "FIRE",      msg: "Your live portfolio and expenses are pre-loaded. Adjust the savings rate to model different FI timelines." },
  ],
  social: [
    { page: "Bill Split", msg: "Social Finance mode — group expenses and splits tracked with AI receipt scanning." },
    { page: "Owing",      msg: "You're net owed £340 — follow up on outstanding splits via Group Split." },
    { page: "Calendar",   msg: "Shared expenses and group trip dates overlaid — keep social financial commitments visible." },
  ],
  full: [
    { page: "Dashboard", msg: "Full Analyst mode — every page, every tool, every widget. Nothing hidden." },
    { page: "Analytics", msg: "All analytics views available including advanced correlation and category intelligence." },
    { page: "Settings",  msg: "Full nav customisation — pin, hide, or reorder any of the 30+ pages in the sidebar." },
  ],
};

export const LS_PERSONA_KEY = "ft-persona";
export const LS_ONBOARDING_KEY = "ft-onboarding-complete";

// The "sync now" verb on a connection row. Depends on which providers
// the persona is allowed to add (see providersForPersona in
// pages/settings-connections.tsx) — market/wealth users only ever have
// broker/exchange connections here, so "REFRESH PRICES" is what a sync
// actually does for them. Budget and social users only see bank
// connections, so "REFRESH TRANSACTIONS" is honest. Wealth and full
// can hold both, so the neutral "SYNC NOW" stays. State-driven labels
// (SYNCING… · RETRY · RECONNECT) are not persona-varied — those describe
// what the button does right now, not what the user came for.
//
// Table shape kept in one place so the rule set is visible at once and
// the two call sites (desktop settings-connections + mobile Settings)
// stay in sync.
export function syncCta(persona: PersonaId): string {
  switch (persona) {
    case "market":
      return "REFRESH PRICES";
    case "budget":
    case "social":
      return "REFRESH TRANSACTIONS";
    case "wealth":
    case "full":
    default:
      return "SYNC NOW";
  }
}

// Where the user lands the first time they finish onboarding. For most
// personas this is a "connect first" step — the persona's real landing
// page (Portfolio, Dashboard, Net Worth, Split) is empty until data
// arrives, so dropping the user there before they've added a connection
// or an account shows them the empty state instead of the app. Full
// persona explicitly chose "show everything" so we honour that and land
// them on the dashboard directly.
//
// Read once by DefaultPageRedirector in App.tsx, then cleared — so the
// second time the user opens the app they land on the persona's real
// default page (from PERSONAS[].defaultPage).
export function personaOnboardingFollowUp(persona: PersonaId): string {
  switch (persona) {
    case "market":
      return "/settings"; // add Alpaca/Kraken keys
    case "budget":
      return "/accounts"; // add first bank account or Wise
    case "wealth":
      return "/accounts"; // needs both bank + broker to compute net worth
    case "social":
      return "/split"; // social's default page — no external data required
    case "full":
    default:
      return "/"; // full explicitly chose to see the whole app
  }
}

export const LS_ONBOARDING_FOLLOWUP_KEY = "nr-onboarding-followup";

// Event fired whenever the active persona changes. Consumers that
// render persona-derived UI (KPI content, nav, empty state, default
// landing) listen for this via useActivePersona() (see persona-hook.ts).
export const PERSONA_UPDATE_EVENT = "nr-persona-update";

export function loadPersonaIds(): PersonaId[] {
  try {
    const raw = localStorage.getItem(LS_PERSONA_KEY);
    return raw ? (JSON.parse(raw) as PersonaId[]) : [];
  } catch {
    return [];
  }
}

export function isOnboardingComplete(): boolean {
  return !!localStorage.getItem(LS_ONBOARDING_KEY);
}

export function applyPersonas(ids: PersonaId[]): void {
  const selected = PERSONAS.filter((p) => ids.includes(p.id));
  if (selected.length === 0) return;

  // Union all visible hrefs across selected personas
  const visibleSet = new Set<string>();
  for (const p of selected) {
    for (const h of p.visibleHrefs) visibleSet.add(h);
  }

  // Union all pinned hrefs
  const pinnedSet = new Set<string>();
  for (const p of selected) {
    for (const h of p.pinnedHrefs) pinnedSet.add(h);
  }

  // First persona's default page wins
  const defaultPage = selected[0].defaultPage;

  // Build sidebar config
  const items = ALL_NAV_HREFS.map((href) => ({
    href,
    visible: visibleSet.has(href),
    pinned: pinnedSet.has(href),
  }));

  saveSidebarConfig({ items, pinnedFirst: true });
  localStorage.setItem("nr-default-page", defaultPage);
  localStorage.setItem(LS_PERSONA_KEY, JSON.stringify(ids));
  localStorage.setItem(LS_ONBOARDING_KEY, "1");

  // Build merged widget config across selected personas
  const widgetEnabledSet = new Set<WidgetId>();
  const widgetSpans: Partial<Record<WidgetId, WidgetSpan>> = {};
  let widgetOrder: WidgetId[] = [];
  const primaryWidgetConfig = PERSONA_WIDGETS[selected[0].id];
  widgetOrder = [...primaryWidgetConfig.order];
  for (const p of selected) {
    const cfg = PERSONA_WIDGETS[p.id];
    for (const w of cfg.enabled) widgetEnabledSet.add(w);
    Object.assign(widgetSpans, cfg.spans);
    // Add any order entries from secondary personas not already present
    const orderSet = new Set(widgetOrder);
    for (const w of cfg.order) {
      if (!orderSet.has(w)) { widgetOrder.push(w); orderSet.add(w); }
    }
  }
  localStorage.setItem("ft-widgets", JSON.stringify({
    enabled: [...widgetEnabledSet],
    order: widgetOrder,
    spans: widgetSpans,
  }));

  // Notify listeners to re-read configs without a page reload.
  // `nr-persona-update` fires alongside the more specific events so
  // components that derive UI from the persona itself (not just from
  // sidebar or widget configs) have one signal to listen for.
  window.dispatchEvent(new Event("nr-sidebar-config-update"));
  window.dispatchEvent(new Event("ft-widgets-update"));
  window.dispatchEvent(new Event(PERSONA_UPDATE_EVENT));
}
