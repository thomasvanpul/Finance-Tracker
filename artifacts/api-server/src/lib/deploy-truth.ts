// ── Is what is deployed what is on origin/main? ─────────────────────────────
//
// The single check that would have caught thirteen failed Vercel builds on
// day one. A failed build is not a red page: the previous deployment keeps
// serving happily, so the site looks fine and every change appears not to
// have applied. The only way to see it is to compare the commit the running
// bundle was built from against the commit at the head of origin/main.
//
// Three facts, three different places:
//   • API commit — Render sets RENDER_GIT_COMMIT in the service environment.
//   • Web commit — Vercel sets VERCEL_GIT_COMMIT_SHA at BUILD time only, so
//     vite.config.ts bakes it into the bundle as __BUILD_COMMIT__ and the SPA
//     sends it up with the request.
//   • origin/main — GitHub's API.
//
// ── Unknown is a state, not a pass ──────────────────────────────────────────
// Every one of the three can be absent: env var unset, private repo with no
// token, GitHub down. When any is unknown the verdict is "unknown", never
// "match". A deploy checker that reports green because it could not look is
// worse than no deploy checker — it converts an unanswered question into a
// false reassurance.

export type DeployVerdict = "match" | "behind" | "unknown";

export interface DeployTruth {
  apiCommit: string | null;
  apiCommitSource: string | null;
  webCommit: string | null;
  originMainCommit: string | null;
  originMainSource: string | null;
  verdict: DeployVerdict;
  /** Plain sentence naming what is unknown or what differs. Never empty. */
  detail: string;
}

/** Render's own env var, with the generic fallbacks other hosts use. */
export function apiCommit(): { sha: string | null; source: string | null } {
  const candidates: Array<[string, string | undefined]> = [
    ["RENDER_GIT_COMMIT", process.env.RENDER_GIT_COMMIT],
    ["VERCEL_GIT_COMMIT_SHA", process.env.VERCEL_GIT_COMMIT_SHA],
    ["GIT_COMMIT", process.env.GIT_COMMIT],
    ["SOURCE_VERSION", process.env.SOURCE_VERSION],
  ];
  for (const [name, value] of candidates) {
    if (value && value.trim().length > 0) return { sha: value.trim(), source: name };
  }
  return { sha: null, source: null };
}

const GITHUB_REPO = process.env.GITHUB_REPO ?? "thomasvanpul/Finance-Tracker";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";
const GITHUB_TIMEOUT_MS = 4000;

// One lookup per 5 minutes. GitHub's unauthenticated ceiling is 60/hour per
// IP and Render's egress is shared, so an uncached call on every hub load
// would spend somebody else's budget as readily as ours.
const HEAD_TTL_MS = 5 * 60 * 1000;
let headCache: { sha: string | null; source: string | null; ts: number } | null = null;

export async function originMainCommit(): Promise<{ sha: string | null; source: string | null }> {
  const now = Date.now();
  if (headCache && now - headCache.ts < HEAD_TTL_MS) {
    return { sha: headCache.sha, source: headCache.source };
  }
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "numeris-admin-hub",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      // 404 on a private repo without a token is the common case and is worth
      // naming precisely — it reads as "repo missing" otherwise.
      const source = res.status === 404 && !token
        ? "github: 404 (private repo needs GITHUB_TOKEN)"
        : `github: HTTP ${res.status}`;
      headCache = { sha: null, source, ts: now };
      return { sha: null, source };
    }
    const body = (await res.json()) as { sha?: string };
    const sha = typeof body.sha === "string" ? body.sha : null;
    const source = sha ? `github:${GITHUB_REPO}@${GITHUB_BRANCH}` : "github: no sha in response";
    headCache = { sha, source, ts: now };
    return { sha, source };
  } catch (err) {
    const source = `github: ${err instanceof Error ? err.message : String(err)}`;
    headCache = { sha: null, source, ts: now };
    return { sha: null, source };
  }
}

/** Compare two shas that may be full or abbreviated. */
function sameCommit(a: string, b: string): boolean {
  const short = Math.min(a.length, b.length);
  if (short < 7) return false;
  return a.slice(0, short) === b.slice(0, short);
}

export async function getDeployTruth(webCommitFromClient: string | null): Promise<DeployTruth> {
  const api = apiCommit();
  const head = await originMainCommit();
  const web = webCommitFromClient && webCommitFromClient.trim().length > 0
    ? webCommitFromClient.trim()
    : null;

  const unknowns: string[] = [];
  if (!api.sha) unknowns.push("the API's commit (no RENDER_GIT_COMMIT in the environment)");
  if (!web) unknowns.push("the web bundle's commit (the SPA sent none — is it built by Vercel?)");
  if (!head.sha) unknowns.push(`origin/${GITHUB_BRANCH} (${head.source ?? "not attempted"})`);

  if (unknowns.length > 0) {
    return {
      apiCommit: api.sha,
      apiCommitSource: api.source,
      webCommit: web,
      originMainCommit: head.sha,
      originMainSource: head.source,
      verdict: "unknown",
      detail: `Cannot verify: could not read ${unknowns.join("; ")}.`,
    };
  }

  const apiMatches = sameCommit(api.sha!, head.sha!);
  const webMatches = sameCommit(web!, head.sha!);
  if (apiMatches && webMatches) {
    return {
      apiCommit: api.sha,
      apiCommitSource: api.source,
      webCommit: web,
      originMainCommit: head.sha,
      originMainSource: head.source,
      verdict: "match",
      detail: `API and web both serving origin/${GITHUB_BRANCH}.`,
    };
  }
  const behind = [
    ...(apiMatches ? [] : ["API"]),
    ...(webMatches ? [] : ["web"]),
  ];
  return {
    apiCommit: api.sha,
    apiCommitSource: api.source,
    webCommit: web,
    originMainCommit: head.sha,
    originMainSource: head.source,
    verdict: "behind",
    detail: `${behind.join(" and ")} ${behind.length === 1 ? "is" : "are"} not serving origin/${GITHUB_BRANCH}. A build failed, or a deploy is still running.`,
  };
}
