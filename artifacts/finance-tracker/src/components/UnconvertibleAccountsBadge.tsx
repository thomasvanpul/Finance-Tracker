// "N accounts without FX — not in total" — the badge that surfaces
// silent underreporting when the dashboard/accounts response was
// computed with one or more accounts whose FX rate the server couldn't
// resolve.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The server + several client widgets sum GBP-equivalents with `?? 0`,
// which silently drops accounts whose gbpEquivalent is null (rate
// unavailable). The dashboard endpoint at least exposes an
// `unconvertibleAccounts` counter next to `totalCash`/`netWorth` so the
// UI can tell the user "your total excludes N accounts". Mobile already
// does this. Desktop widgets ignored it, so a desktop user with an
// unconvertible account saw an underreported net-worth and no warning.
// The offline verification exposed how much this matters: an offline
// user has no way to refresh a partly-null cached response.
//
// This component IS the surface. Every desktop widget that reports a
// GBP total derived from a `?? 0` sum MUST render it. Enforcement is
// human review + the mechanical `?? 0` lock (see the follow-up test).

interface Props {
  count: number;
  // Optional compact variant for tight KPI cells; the default is the
  // full-width warning line matching the mobile treatment.
  compact?: boolean;
}

export function UnconvertibleAccountsBadge({ count, compact = false }: Props) {
  if (count <= 0) return null;
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: compact ? 9 : 10,
        letterSpacing: "0.06em",
        color: "var(--ft-amber)",
        marginTop: 4,
      }}
    >
      {count} account{count !== 1 ? "s" : ""} without FX — not in total
    </div>
  );
}
