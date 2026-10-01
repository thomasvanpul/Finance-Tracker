// Google, GitHub and Apple sign-in grants are revoked best-effort before account
// deletion. The DB is mocked: the rows below stand for what the account
// lookup returned. fetch is stubbed, so no provider is called.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let selected: { providerId: string; accessToken: string | null; refreshToken: string | null }[] = [];

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = async () => selected;
  return {
    db: chain,
    accountTable: { userId: "user_id", providerId: "provider_id", accessToken: "a", refreshToken: "r" },
  };
});

vi.mock("./logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { revokeOAuthGrants } = await import("./oauth-grants");

const fetchMock = vi.fn();

beforeEach(() => {
  selected = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_CLIENT_ID", "gh-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "gh-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("revokeOAuthGrants", () => {
  it("revokes a Google grant with the refresh token, which ends the grant", async () => {
    selected = [{ providerId: "google", accessToken: "g-access", refreshToken: "g-refresh" }];
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const out = await revokeOAuthGrants("user-a");
    expect(out).toEqual({ revoked: ["google"], remaining: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(String(init.body)).toBe("token=g-refresh");
  });

  it("revokes a GitHub grant through the app's grant endpoint", async () => {
    selected = [{ providerId: "github", accessToken: "gh-token", refreshToken: null }];
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const out = await revokeOAuthGrants("user-a");
    expect(out).toEqual({ revoked: ["github"], remaining: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/applications/gh-id/grant");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("gh-id:gh-secret").toString("base64")}`);
    expect(JSON.parse(init.body)).toEqual({ access_token: "gh-token" });
  });

  it("reports a grant with no stored token as remaining without calling the provider", async () => {
    selected = [{ providerId: "google", accessToken: null, refreshToken: null }];
    const out = await revokeOAuthGrants("user-a");
    expect(out).toEqual({ revoked: [], remaining: ["google"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a provider refusal as remaining", async () => {
    selected = [{ providerId: "google", accessToken: "expired", refreshToken: null }];
    fetchMock.mockResolvedValueOnce(new Response('{"error":"invalid_token"}', { status: 400 }));
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: [], remaining: ["google"] });
  });

  it("never throws: a network failure is reported as remaining", async () => {
    selected = [
      { providerId: "github", accessToken: "gh-token", refreshToken: null },
      { providerId: "google", accessToken: "g", refreshToken: null },
    ];
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: ["google"], remaining: ["github"] });
  });

  it("reports GitHub as remaining when the app's client credentials are not configured", async () => {
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    selected = [{ providerId: "github", accessToken: "gh-token", refreshToken: null }];
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: [], remaining: ["github"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the account lookup itself fails", async () => {
    selected = undefined as never;
    const out = await revokeOAuthGrants("user-a");
    expect(out.revoked).toEqual([]);
  });

  it("ignores a provider that holds no grant (credential)", async () => {
    selected = [{ providerId: "credential", accessToken: null, refreshToken: null }];
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: [], remaining: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revokes an Apple grant with the refresh token and the client-secret JWT", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "work.numeris.web");
    vi.stubEnv("APPLE_CLIENT_SECRET", "eyJ.client.secret");
    selected = [{ providerId: "apple", accessToken: "a-access", refreshToken: "a-refresh" }];
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: ["apple"], remaining: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: "work.numeris.web",
      client_secret: "eyJ.client.secret",
      token: "a-refresh",
      token_type_hint: "refresh_token",
    });
  });

  it("falls back to the Apple access token, hinted as one", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "work.numeris.web");
    vi.stubEnv("APPLE_CLIENT_SECRET", "eyJ.client.secret");
    selected = [{ providerId: "apple", accessToken: "a-access", refreshToken: null }];
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: ["apple"], remaining: [] });
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(body.get("token")).toBe("a-access");
    expect(body.get("token_type_hint")).toBe("access_token");
  });

  it("reports Apple as remaining when Apple refuses, with no token, or unconfigured", async () => {
    vi.stubEnv("APPLE_CLIENT_ID", "work.numeris.web");
    vi.stubEnv("APPLE_CLIENT_SECRET", "eyJ.client.secret");
    selected = [{ providerId: "apple", accessToken: "a", refreshToken: null }];
    fetchMock.mockResolvedValueOnce(new Response('{"error":"invalid_client"}', { status: 400 }));
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: [], remaining: ["apple"] });

    selected = [{ providerId: "apple", accessToken: null, refreshToken: null }];
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: [], remaining: ["apple"] });

    vi.stubEnv("APPLE_CLIENT_SECRET", "");
    selected = [{ providerId: "apple", accessToken: "a", refreshToken: null }];
    expect(await revokeOAuthGrants("user-a")).toEqual({ revoked: [], remaining: ["apple"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
