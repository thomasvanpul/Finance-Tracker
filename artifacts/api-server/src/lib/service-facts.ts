// ── The one typed source for what Numeris runs on ───────────────────────────
//
// Every external service, what it costs, which plan it is on, and the ceiling
// that would bite first. The admin hub renders this; nothing else restates it.
//
// ── Why this file exists rather than a second copy of OPERATIONS.md ─────────
// The ceilings were prose in docs/OPERATIONS.md § "Free-tier ceilings that
// would push an upgrade". Prose cannot be rendered, compared against live
// usage, or checked for staleness. Copying the numbers into a component would
// have created exactly the drift this codebase has been bitten by before, so
// the direction is reversed: this module is the source, and the doc's table is
// GENERATED from it by lib/service-facts-doc.ts between the
// SERVICE-FACTS markers. `pnpm gen:service-facts` rewrites it and
// service-facts.doc-drift.lock.test.ts fails if the file on disk no longer
// matches, so the two cannot silently diverge.
//
// The doc keeps what a table cannot carry: the reasoning, the symptom
// each ceiling produces, and the upgrade argument. Read it for the why.
//
// ── Honesty rules for the numbers in here ───────────────────────────────────
// A figure is one of two things and the type says which:
//   • measurable — the app can read current consumption itself, so the hub
//     shows real headroom.
//   • stated    — nobody exposes an API for it, so it is a human-checked fact
//     carrying the date it was checked. The hub SHOWS that date. A stated
//     fact with no date is not allowed; `checkedOn` is required.
// Never present a stated fact as if it were measured. That distinction is the
// whole point of the split — see docs/DESIGN.md on the `fx` provenance mark,
// which makes the same argument for computed figures in the UI.

export type ServiceCategory = "infrastructure" | "market-data" | "ai" | "monitoring";

/** How the hub can learn current consumption for a ceiling. */
export type CeilingSource =
  /** The app measures it — the hub renders live headroom. */
  | { kind: "measurable"; via: string }
  /** No API. A human checked it on `checkedOn` and the hub shows that date. */
  | { kind: "stated"; checkedOn: string };

export interface Ceiling {
  /** What the limit is on, in the provider's own words. */
  readonly label: string;
  /** Numeric ceiling. Null where the provider states no hard number. */
  readonly limit: number | null;
  readonly unit: string;
  /** The symptom this ceiling produces when it bites. Never "it breaks". */
  readonly symptom: string;
  readonly source: CeilingSource;
}

export interface ServiceFact {
  readonly id: string;
  readonly name: string;
  readonly category: ServiceCategory;
  /** What Numeris uses it for, one line. */
  readonly role: string;
  readonly plan: string;
  /** Monthly cost in GBP. 0 is free — and the hub must make a change obvious. */
  readonly monthlyCostGbp: number;
  /** What the next plan up costs, so the price of a ceiling is visible. */
  readonly nextPlan: { name: string; monthlyCostGbp: number } | null;
  readonly ceilings: readonly Ceiling[];
  /**
   * Set where a service is usable today but cannot ship to public users.
   * Rendered as a blocking badge, not a footnote.
   */
  readonly launchBlocker: string | null;
  /** When a human last verified this row's plan and prices. */
  readonly checkedOn: string;
  readonly dashboardUrl: string | null;
}

// Prices converted at the rate stated in each entry's plan string where the
// vendor bills in USD; the conversion date is the row's checkedOn. Nobody
// should read these as live FX.
export const SERVICE_FACTS: readonly ServiceFact[] = [
  {
    id: "render",
    name: "Render",
    category: "infrastructure",
    role: "Hosts the Express API at numeris-api.onrender.com",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: { name: "Starter ($7/mo)", monthlyCostGbp: 5.5 },
    ceilings: [
      {
        label: "RAM",
        limit: 512,
        unit: "MB",
        symptom: "OOM restart — silent, shows up as a cold start not an error",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
      {
        label: "Instance hours",
        limit: 750,
        unit: "hours/month",
        symptom: "service suspended for the rest of the month",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
      {
        label: "Idle sleep",
        limit: 15,
        unit: "minutes",
        symptom: "~50s cold start on the next request; masked by the cron-job.org pinger",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
      {
        label: "healthz p95 (7d)",
        limit: 800,
        unit: "ms",
        symptom: "past this for 7 days is the documented signal to price Starter",
        source: { kind: "measurable", via: "request_metrics" },
      },
      {
        label: "endpoint p95 (3d)",
        limit: 1500,
        unit: "ms",
        symptom: "past this for 3 days is the documented signal to price Starter",
        source: { kind: "measurable", via: "request_metrics" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-01",
    dashboardUrl: "https://dashboard.render.com",
  },
  {
    id: "neon",
    name: "Neon",
    category: "infrastructure",
    role: "Postgres (eu-west-2). Production plus the `dev` branch local work points at",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: { name: "Launch ($19/mo)", monthlyCostGbp: 15 },
    ceilings: [
      {
        label: "Storage",
        limit: 500,
        unit: "MB",
        symptom: "INSERT failures in the api-server log — writes fail, reads keep working",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
      {
        label: "Compute hours",
        limit: 191.9,
        unit: "hours/month",
        symptom: "smaller compute assigned → query latency drifts up before anything fails",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
      {
        label: "request_metrics rows",
        limit: 30,
        unit: "days retained",
        symptom: "at 100k rows/day the table alone (~900 MB) breaches Neon free",
        source: { kind: "measurable", via: "request_metrics" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-01",
    dashboardUrl: "https://console.neon.tech",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "infrastructure",
    role: "Serves the React SPA at financetracker.work",
    plan: "Hobby",
    monthlyCostGbp: 0,
    nextPlan: { name: "Pro ($20/mo)", monthlyCostGbp: 16 },
    ceilings: [
      {
        label: "Bandwidth",
        limit: 100,
        unit: "GB/month",
        symptom: "deployments keep serving; overage warnings by email first",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
      {
        label: "Function CPU",
        limit: 1,
        unit: "s/invocation",
        symptom: "rate-limit errors on the /api proxy functions",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-01",
    dashboardUrl: "https://vercel.com/dashboard",
  },
  {
    id: "cron-job-org",
    name: "cron-job.org",
    category: "monitoring",
    role: "Hits /api/healthz every minute so Render never idles into sleep",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: null,
    ceilings: [
      {
        label: "Cron jobs",
        limit: 50,
        unit: "jobs",
        symptom: "cannot add another monitor; the existing one keeps running",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-01",
    dashboardUrl: "https://console.cron-job.org",
  },
  {
    id: "healthchecks-io",
    name: "Healthchecks.io",
    category: "monitoring",
    role: "Dead-man's switch — alerts if the pinger itself stops",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: null,
    ceilings: [
      {
        label: "Checks",
        limit: 20,
        unit: "checks",
        symptom: "cannot add another check",
        source: { kind: "stated", checkedOn: "2026-09-01" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-01",
    dashboardUrl: "https://healthchecks.io",
  },
  {
    id: "yahoo",
    name: "Yahoo Finance",
    category: "market-data",
    role: "Quotes and the ONLY lane covering global indices and commodity futures",
    plan: "Undocumented public endpoints — no plan, no contract, no key",
    monthlyCostGbp: 0,
    nextPlan: null,
    ceilings: [
      {
        label: "Rate limit",
        limit: null,
        unit: "unpublished",
        symptom:
          "429 on the cookie+crumb bootstrap from shared datacentre egress; the price lane now avoids that endpoint entirely",
        source: { kind: "measurable", via: "provider-health breaker" },
      },
    ],
    launchBlocker:
      "NOT LAUNCH-SAFE. Undocumented endpoints with no commercial licence and no redistribution right. Works for Thomas today; cannot ship to public users. Fixing the throttling did not change this.",
    checkedOn: "2026-09-06",
    dashboardUrl: null,
  },
  {
    id: "alpaca",
    name: "Alpaca",
    category: "market-data",
    role: "US equities and ETFs",
    plan: "Free (Basic market data)",
    monthlyCostGbp: 0,
    nextPlan: { name: "Algo Trader Plus ($99/mo)", monthlyCostGbp: 78 },
    ceilings: [
      {
        label: "Requests",
        limit: 200,
        unit: "per minute",
        symptom: "429; the chain falls through to Polygon",
        source: { kind: "measurable", via: "provider-health breaker" },
      },
    ],
    launchBlocker:
      "Redistribution to third parties is not granted on this tier. Not a breach today — every account is Thomas's own — and Thomas has sent the 30-day notice separately. Becomes a blocker the moment a third party signs up.",
    checkedOn: "2026-09-06",
    dashboardUrl: "https://app.alpaca.markets",
  },
  {
    id: "polygon",
    name: "Polygon",
    category: "market-data",
    role: "US equities fallback behind Alpaca",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: { name: "Stocks Starter ($29/mo)", monthlyCostGbp: 23 },
    ceilings: [
      {
        label: "Requests",
        limit: 5,
        unit: "per minute",
        symptom: "429 — tight enough that it is a fallback, never a primary",
        source: { kind: "measurable", via: "provider-health minute budget" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-06",
    dashboardUrl: "https://polygon.io/dashboard",
  },
  {
    id: "twelvedata",
    name: "Twelve Data",
    category: "market-data",
    role: "Forex, non-US equities, last resort for the slow asset classes",
    plan: "Free (Basic)",
    monthlyCostGbp: 0,
    nextPlan: { name: "Grow ($79/mo)", monthlyCostGbp: 62 },
    ceilings: [
      {
        label: "Credits",
        limit: 800,
        unit: "per day",
        symptom:
          "hard stop; the app self-caps at 760 (95%) so it degrades in the morning rather than dying at 4pm",
        source: { kind: "measurable", via: "provider-health credit budget" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-06",
    dashboardUrl: "https://twelvedata.com/account",
  },
  {
    id: "frankfurter",
    name: "Frankfurter (ECB)",
    category: "market-data",
    role: "Forex floor — ECB daily reference fixings, not live quotes",
    plan: "Free, open data",
    monthlyCostGbp: 0,
    nextPlan: null,
    ceilings: [
      {
        label: "Rate limit",
        limit: null,
        unit: "none published",
        symptom: "n/a — the constraint is that a fixing is daily, not that it throttles",
        source: { kind: "measurable", via: "provider-health breaker" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-06",
    dashboardUrl: null,
  },
  {
    id: "groq",
    name: "Groq",
    category: "ai",
    role: "First lane for AI insights and categorisation",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: { name: "Developer (pay-as-you-go)", monthlyCostGbp: 0 },
    ceilings: [
      {
        label: "Requests",
        limit: 30,
        unit: "per minute",
        symptom: "429; the AI chain falls through to Cerebras",
        source: { kind: "stated", checkedOn: "2026-09-06" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-06",
    dashboardUrl: "https://console.groq.com",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    category: "ai",
    role: "Second AI lane",
    plan: "Free",
    monthlyCostGbp: 0,
    nextPlan: null,
    ceilings: [
      {
        label: "Requests",
        limit: 30,
        unit: "per minute",
        symptom: "429; the AI chain falls through to OpenRouter",
        source: { kind: "stated", checkedOn: "2026-09-06" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-06",
    dashboardUrl: "https://cloud.cerebras.ai",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "ai",
    role: "Last AI lane",
    plan: "Free tier models",
    monthlyCostGbp: 0,
    nextPlan: { name: "Credits (pay-as-you-go)", monthlyCostGbp: 0 },
    ceilings: [
      {
        label: "Requests",
        limit: 50,
        unit: "per day (free models)",
        symptom: "429 — after this the AI features have no lane left",
        source: { kind: "stated", checkedOn: "2026-09-06" },
      },
    ],
    launchBlocker: null,
    checkedOn: "2026-09-06",
    dashboardUrl: "https://openrouter.ai/credits",
  },
];

/** Total monthly spend across every service, GBP. */
export function totalMonthlyCostGbp(): number {
  return SERVICE_FACTS.reduce((sum, s) => sum + s.monthlyCostGbp, 0);
}

/** Services that cannot ship to public users as configured. */
export function launchBlockers(): readonly ServiceFact[] {
  return SERVICE_FACTS.filter((s) => s.launchBlocker !== null);
}

/**
 * Oldest checkedOn across every row, as an ISO date. The hub shows this so a
 * page of confidently-rendered facts cannot quietly become a page of
 * year-old ones.
 */
export function oldestCheckDate(): string {
  const dates = SERVICE_FACTS.flatMap((s) => [
    s.checkedOn,
    ...s.ceilings.map((c) => (c.source.kind === "stated" ? c.source.checkedOn : s.checkedOn)),
  ]);
  return dates.reduce((oldest, d) => (d < oldest ? d : oldest), dates[0]);
}
