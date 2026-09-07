// ── entityHref ──────────────────────────────────────────────────────────────
// One place that says how to link to a thing.
//
// The app had grown five separate conventions for the same job, each invented
// at its own call site: `/accounts?highlight=<id>`, `/goals?highlight=<id>`,
// `/transactions?q=<description>`, `/investments?add=1` and
// `/settings?panel=<id>`. Two of them collided on the name `highlight` while
// meaning different things, and one of them — the goals link — pointed at a
// parameter no page has ever read.
//
// A detail surface is a query parameter on the entity's own list screen, not a
// route (CLAUDE.md: a new URL is a claim that this is one of ~20 things a user
// looks up by name; a single account is not). Everything that opens one goes
// through here, so the parameter name lives in exactly one file.

export type EntityKind =
  | "account"
  | "goal"
  | "investment"
  | "settings";

/** The query parameter each kind's list screen reads. */
export const ENTITY_PARAM: Record<EntityKind, string> = {
  account: "account",
  goal: "goal",
  investment: "position",
  settings: "panel",
};

const ENTITY_ROUTE: Record<EntityKind, string> = {
  account: "/accounts",
  goal: "/goals",
  investment: "/investments",
  settings: "/settings",
};

/** Link to one entity's detail surface on its list screen. */
export function entityHref(kind: EntityKind, id: string | number): string {
  return `${ENTITY_ROUTE[kind]}?${ENTITY_PARAM[kind]}=${encodeURIComponent(String(id))}`;
}

/** Link to a transaction search. Not an entity id — a query over rows. */
export function transactionSearchHref(query: string): string {
  return `/transactions?q=${encodeURIComponent(query)}`;
}

/** Link to the add-position form on the investments screen. */
export function addInvestmentHref(): string {
  return "/investments?add=1";
}
