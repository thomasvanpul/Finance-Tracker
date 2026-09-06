// Who may read the admin hub.
//
// There is no role column anywhere in lib/db and no better-auth admin plugin
// (verified 2026-09-06: `role`/`admin` return nothing across lib/db/src). So
// the gate is an explicit allowlist in the environment rather than a schema
// change — one operator, no invitations, nothing to escalate into.
//
// ── Fails closed ────────────────────────────────────────────────────────────
// An unset or empty allowlist grants NOBODY. That is deliberate and it is the
// rule this repo already learned the hard way: a rate limiter once keyed
// itself to `NODE_ENV !== "production"` on a platform that never set
// NODE_ENV, and so disabled itself in production. A gate whose default is
// "allow when unconfigured" is the same bug. If ADMIN_USER_IDS is missing in
// Render, the hub 403s for everyone including Thomas — visibly, not silently.
//
// ── Ids, not emails ─────────────────────────────────────────────────────────
// ADMIN_USER_IDS holds better-auth user ids. An email is user-mutable and
// only unique among current rows; an id is stable for the life of the
// account. ADMIN_EMAILS is accepted too because an id is awkward to look up
// the first time, but it is the weaker of the two and the endpoint reports
// which one matched so a deployment cannot quietly be running on the weaker
// one without anyone knowing.

export interface AdminIdentity {
  userId: string;
  email: string | null;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

export type AdminDecision =
  | { allowed: true; matchedOn: "user-id" | "email" }
  | { allowed: false; reason: "not-configured" | "not-on-allowlist" };

export function decideAdmin(identity: AdminIdentity): AdminDecision {
  const ids = parseList(process.env.ADMIN_USER_IDS);
  const emails = parseList(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());

  if (ids.length === 0 && emails.length === 0) {
    return { allowed: false, reason: "not-configured" };
  }
  if (ids.includes(identity.userId)) {
    return { allowed: true, matchedOn: "user-id" };
  }
  if (identity.email !== null && emails.includes(identity.email.toLowerCase())) {
    return { allowed: true, matchedOn: "email" };
  }
  return { allowed: false, reason: "not-on-allowlist" };
}

/** True when the deployment has an allowlist at all. Reported, never used to relax the gate. */
export function adminGateConfigured(): boolean {
  return parseList(process.env.ADMIN_USER_IDS).length > 0
    || parseList(process.env.ADMIN_EMAILS).length > 0;
}
