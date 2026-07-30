import { logger } from "./logger";

// Wise personal API token integration.
// Generate a token from: Wise account -> Settings -> API tokens.
// Set WISE_API_TOKEN in the environment. Set WISE_ENV=sandbox to use the test API
// (https://api.sandbox.transferwise.tech) instead of live (default).

const WISE_ENV = process.env.WISE_ENV ?? "live";
const WISE_BASE_URL =
  WISE_ENV === "sandbox" ? "https://api.sandbox.transferwise.tech" : "https://api.transferwise.com";

function getToken(): string {
  const token = process.env.WISE_API_TOKEN;
  if (!token) {
    throw new Error("WISE_API_TOKEN is not set in the environment.");
  }
  return token;
}

async function wiseFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${WISE_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ path, status: res.status, body }, "Wise API request failed");
    throw new Error(`Wise API error ${res.status} on ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface WiseProfile {
  id: number;
  type: "personal" | "business";
  fullName?: string;
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: { value: number; currency: string };
}

export interface WiseTransaction {
  type: string;
  date: string; // ISO
  amount: { value: number; currency: string };
  totalFees: { value: number; currency: string };
  details: {
    type: string;
    description: string;
    merchant?: { name?: string };
  };
  referenceNumber: string;
}

export async function listProfiles(): Promise<WiseProfile[]> {
  return wiseFetch<WiseProfile[]>("/v2/profiles");
}

export async function listBalances(profileId: number): Promise<WiseBalance[]> {
  return wiseFetch<WiseBalance[]>(`/v4/profiles/${profileId}/balances?types=STANDARD`);
}

export async function getStatement(
  profileId: number,
  balanceId: number,
  currency: string,
  intervalStart: Date,
  intervalEnd: Date
): Promise<WiseTransaction[]> {
  const params = new URLSearchParams({
    currency,
    intervalStart: intervalStart.toISOString(),
    intervalEnd: intervalEnd.toISOString(),
    type: "COMPACT",
  });
  const resp = await wiseFetch<{ transactions: WiseTransaction[] }>(
    `/v3/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${params}`
  );
  return resp.transactions;
}

/** Verifies the configured token actually works, returning a friendly status. */
export async function checkConnection(): Promise<
  { connected: true; profileName: string | null } | { connected: false; error: string }
> {
  try {
    const profiles = await listProfiles();
    const personal = profiles.find((p) => p.type === "personal") ?? profiles[0];
    return { connected: true, profileName: personal?.fullName ?? null };
  } catch (err: any) {
    return { connected: false, error: err?.message ?? "Unknown error" };
  }
}

export { logger };
