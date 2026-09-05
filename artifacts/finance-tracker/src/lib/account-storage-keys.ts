// Every localStorage key the app writes, classified (BACKLOG § G20/B).
//
// Pure data: no DOM, importable from tests and from the sync engine
// (account-storage.ts). The lock test account-storage-keys.lock.test.ts
// scans the source tree for localStorage call sites and fails on any
// key that is not in exactly one of these classes, so adding a key to
// the app means deciding, here, whether it follows the user.
//
//   account      the user's own data or choices — mirrored to the
//                user_preferences table and hydrated on sign-in, so
//                laptop and phone agree
//   device       a property of this screen or this install: density,
//                masking, sidebar width, animation, the native bearer
//   server-cache a read cache of a column the server already owns
//                (theme, base currency, persona, tab slot); its module
//                hydrates it itself and it must never round-trip twice
//   local-cache  regenerable — AI commentary, quotes, the query
//                persister; losing it costs a refetch, nothing else
//   onboarding   the onboarding flow's flags — out of scope for G20/B
//                and left exactly as they are on purpose
//
// Keys are the runtime strings, not the constant names, because the
// sync engine sees the string at the Storage.prototype choke point.

export type KeyClass = "account" | "device" | "server-cache" | "local-cache" | "onboarding";

export const ACCOUNT_LEVEL_KEYS: readonly string[] = [
  // transactions and categorisation
  "ft-tx-notes", "ft-tx-tags", "ft-tx-splits", "ft-tx-templates",
  "ft-cat-rules", "nr-cat-rules", "ft-category-meta", "nr-custom-categories",
  "nr-tx-default-type", "nr-tx-default-currency", "nr-tx-default-category",
  "nr-recurring-rules", "nr-import-history",
  // accounts, debts, net worth, cash flow
  "ft-acct-meta", "nr-debt-aprs", "ft-nw-target", "ft-nw-milestones", "ft-nw-history",
  "numeris:cashflow:multipliers", "nr-fx-overrides",
  // budgets, goals, savings, health
  "ft-budget-rollover", "ft-budget-rollover-month", "ft-savings-target",
  "ft-achievements", "ft-health-score-history", "nr-learn-progress",
  // investments and markets
  "ft-tickers", "ft-watchlists", "ft-price-alerts", "ft-inv-classes", "ft-inv-orders",
  "ft-rebalance-targets", "ft-portfolio-snapshots", "ft-options-positions", "ft-futures-positions",
  "ft-trading-journal-trades", "ft-crypto-wallets",
  // alerts and insights
  "nr-alert-rules", "ft-alert-rules", "ft-balance-alerts",
  "nr-dismissed-insights", "ft-decisions-dismissed",
  // calendar, business, family, shared
  "ft-cal-events", "ft-cal-feeds", "ft-cal-imported",
  "ft-business-invoices", "ft-business-categories",
  "ft-family-members", "ft-family-budgets", "ft-family-goals", "ft-family-timeline",
  "ft-bill-splits", "ft-split-my-name",
  // tax, pensions, property
  "ft-tax-disposals", "ft-isa-contributions", "nr-tax-country", "ft-pension", "ft-isa", "ft-mortgages",
  // dashboard, analytics, layout choices that are choices, not screen facts
  "ft-dashboard-views", "ft-widgets", "ft-analytics-annotations",
  "nr-default-page", "nr-show-nw-strip", "nr-sidebar-more", "nr-sidebar-config",
  "nr-hide-from-print", "ft-digest-enabled", "nr-beta-features",
  // display formats — how the user reads a number, the same on every device
  "ft-default-currency", "ft-amount-display", "ft-date-format",
  "nr-date-format", "nr-number-format", "nr-show-cents", "nr-compact-numbers",
  "nr-week-start", "nr-time-format",
  // the companion's memory of the user
  "ix-companion-v1",
];

export const DEVICE_LOCAL_KEYS: readonly string[] = [
  "ft-density", "nr-font-scale",
  "nr-mask-mode", "nr-blur-amounts", "nr-auto-blur-delay", "ft-privacy",
  "ft-sidebar", "ft-sidebar-width", "nr-sidebar-collapsed-default", "nr-sidebar-collapsed-sections",
  "nr-theme-effects-enabled", "nr-theme-transition", "nr-animation-intensity", "nr-accent-override",
  "nr-pwa-dismissed", "ft-chart-expand-seen", "ft-dashboard-customize-mode", "ft-world-clock-cities",
  "ft-login-history", "ft-last-session-snapshot-v1", "nr-dev-mode",
  // the sync engine's own bookkeeping
  "nr-prefs-owner", "nr-prefs-pending", "nr-prefs-shadow-v1",
];

export const SERVER_CACHE_KEYS: readonly string[] = [
  "ft-theme", "nr-base-currency", "ft-persona", "nr-tab-slot",
];

// The AI commentary caches (ft-dashboard-ai-insights, ft-budget-ai-insight,
// ft-goals-ai-coach, ft-investments-ai-commentary, nr-ai-coach-msgs) are
// sessionStorage, not localStorage, and the native bearer
// (nr-native-auth-token) is Capacitor Preferences — none of them is a
// localStorage key, so none is listed here.
export const LOCAL_CACHE_KEYS: readonly string[] = [
  "ft-briefing-cache", "ft-crypto-prices", "numeris-ai-style", "numeris-bot-skin",
];

export const ONBOARDING_KEYS: readonly string[] = [
  "nr-onboarding-complete", "ft-onboarding-complete", "ft-onboarding-dismissed",
  "ft-acct-onboarding-dismissed", "nr-onboarding-followup",
];

// Keys built at runtime from a prefix. Classified by prefix.
export const KEY_PREFIXES: ReadonlyArray<{ prefix: string; cls: KeyClass }> = [
  { prefix: "nr-theme-effects-", cls: "device" },
  { prefix: "numeris-query-", cls: "local-cache" },
  { prefix: "ft-qs-dismissed-", cls: "onboarding" },
  { prefix: "ft-qs-done-", cls: "onboarding" },
];

const CLASS_OF: ReadonlyMap<string, KeyClass> = new Map<string, KeyClass>([
  ...ACCOUNT_LEVEL_KEYS.map((k): [string, KeyClass] => [k, "account"]),
  ...DEVICE_LOCAL_KEYS.map((k): [string, KeyClass] => [k, "device"]),
  ...SERVER_CACHE_KEYS.map((k): [string, KeyClass] => [k, "server-cache"]),
  ...LOCAL_CACHE_KEYS.map((k): [string, KeyClass] => [k, "local-cache"]),
  ...ONBOARDING_KEYS.map((k): [string, KeyClass] => [k, "onboarding"]),
]);

export function classifyKey(key: string): KeyClass | null {
  const exact = CLASS_OF.get(key);
  if (exact) return exact;
  for (const { prefix, cls } of KEY_PREFIXES) {
    if (key.startsWith(prefix)) return cls;
  }
  return null;
}

export function isAccountLevelKey(key: string): boolean {
  return classifyKey(key) === "account";
}

// Every explicitly listed key, for the lock test's "nothing listed
// twice, nothing listed that no longer exists" checks.
export const ALL_LISTED_KEYS: readonly string[] = [
  ...ACCOUNT_LEVEL_KEYS, ...DEVICE_LOCAL_KEYS, ...SERVER_CACHE_KEYS, ...LOCAL_CACHE_KEYS, ...ONBOARDING_KEYS,
];
