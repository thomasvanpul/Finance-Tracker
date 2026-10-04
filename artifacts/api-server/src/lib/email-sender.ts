// The sender address for every email this server sends — better-auth's
// password reset and verification mail, and the weekly digest. One
// function so a sender-domain change reaches every call site: the digest
// used to hard-code `digest@numeris.app`, a domain nobody here owns, while
// this fallback logic lived only in better-auth.ts (fixed 2026-10-04,
// .review/archive/2026-10-04T0052-terms-ai-and-digest-sender).
//
// EMAIL_FROM is the real knob and must name a domain VERIFIED with Resend —
// Resend rejects an unverified sender at send time, not at boot. The
// fallback derives from the API's own origin rather than naming a host
// literally, so it follows a rename instead of outliving one; it is still
// only a fallback, and a deployment that relies on it will fail at Resend
// until that domain is verified there.
//
// Takes an env object (defaulting to process.env) rather than reading
// process.env internally, the same shape as resolveEmailTransport in
// email-transport.ts, so it is testable as a pure function.

type Env = Record<string, string | undefined>;

function get(env: Env, name: string): string | undefined {
  const raw = env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

function hostnameOf(origin: string, fallback: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return fallback;
  }
}

function apiOrigin(env: Env): string {
  return get(env, "API_BASE_URL")
    ?? get(env, "RENDER_EXTERNAL_URL")
    ?? (get(env, "RAILWAY_PUBLIC_DOMAIN") ? `https://${get(env, "RAILWAY_PUBLIC_DOMAIN")}` : "http://localhost:3000");
}

export function configuredEmailFrom(env: Env = process.env): string {
  return get(env, "EMAIL_FROM") ?? `noreply@${hostnameOf(apiOrigin(env), "localhost")}`;
}
