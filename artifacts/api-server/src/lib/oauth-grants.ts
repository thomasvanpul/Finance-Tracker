// Revoke Google and GitHub sign-in grants before account deletion,
// best-effort.
//
// Unlike a bank consent (bank-consents.ts), a sign-in grant left live at
// the provider gives nobody access to anything of ours once the account is
// gone, so a failure here never blocks deletion. It is reported instead:
// every provider whose grant is still live comes back in `remaining`, and
// the client tells the user where to remove it themselves.
//
// Most grants cannot be revoked from here at all. better-auth.ts drops the
// OAuth tokens before every account write, and both providers' revoke
// endpoints need a token. Only rows written before that change still hold
// one. A row with no token is reported as remaining without a call.
//
// Must run before deleteUserAccount: the tokens go with the account rows.

import { and, eq, inArray } from "drizzle-orm";
import { db, accountTable } from "@workspace/db";
import { logger } from "./logger";

export type GrantProvider = "google" | "github";

export interface GrantRevokeSummary {
  revoked: GrantProvider[];
  remaining: GrantProvider[];
}

const PROVIDERS: readonly GrantProvider[] = ["google", "github"];
const REVOKE_TIMEOUT_MS = 5_000;

interface GrantRow {
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
}

export async function revokeOAuthGrants(userId: string): Promise<GrantRevokeSummary> {
  const summary: GrantRevokeSummary = { revoked: [], remaining: [] };
  let rows: GrantRow[];
  try {
    rows = await db
      .select({
        providerId: accountTable.providerId,
        accessToken: accountTable.accessToken,
        refreshToken: accountTable.refreshToken,
      })
      .from(accountTable)
      .where(and(eq(accountTable.userId, userId), inArray(accountTable.providerId, [...PROVIDERS])));
    if (!Array.isArray(rows)) throw new Error("account lookup returned no rows array");
  } catch (err) {
    // Without the rows there is no telling which grants exist; deletion
    // goes ahead, and the confirmation screen's general advice still stands.
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "oauth grant lookup failed");
    return summary;
  }

  for (const row of rows) {
    const provider = PROVIDERS.find((p) => p === row.providerId);
    if (!provider) continue;
    const reason = await revokeOne(provider, row);
    if (reason === null) {
      summary.revoked.push(provider);
    } else {
      summary.remaining.push(provider);
      logger.warn({ provider, reason }, "oauth grant not revoked at provider");
    }
  }
  return summary;
}

// null when revoked, otherwise why not.
async function revokeOne(provider: GrantProvider, row: GrantRow): Promise<string | null> {
  try {
    return provider === "google" ? await revokeGoogle(row) : await revokeGithub(row);
  } catch (err) {
    return `request failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Revoking the refresh token ends the whole grant; an access token works
// only while it is unexpired.
async function revokeGoogle(row: GrantRow): Promise<string | null> {
  const token = row.refreshToken || row.accessToken;
  if (!token) return "no stored token";
  const res = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
  });
  return res.ok ? null : `google answered ${res.status}`;
}

// DELETE /applications/{client_id}/grant removes the app's authorisation
// for the user, not just the one token.
async function revokeGithub(row: GrantRow): Promise<string | null> {
  const token = row.accessToken;
  if (!token) return "no stored token";
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return "github client credentials not configured";
  const res = await fetch(`https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: token }),
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
  });
  return res.status === 204 ? null : `github answered ${res.status}`;
}
