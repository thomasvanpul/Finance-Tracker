// Shared caller for Google Gemini's generateContent endpoint.
//
// ── Why this exists ────────────────────────────────────────────────────────
// Four AI routes (chat, receipt-split, receipt-scan, batch-categorize)
// all called generateContent with the same three defects:
//
//   1. Silent catches — `catch { res.status(502)... }`. The exception
//      was not even bound. Google's error body says exactly what is
//      wrong (retired model, quota, invalid key, prompt filter) and
//      we threw all of it away, which is why every AI failure was
//      undiagnosable from logs.
//
//   2. Key in the URL query string — `?key=${apiKey}`. Documented by
//      Google, but it means the key can leak into fetch traces,
//      proxy logs, and error stacks. The x-goog-api-key header is
//      the same auth without the URL exposure.
//
//   3. Google's raw error body forwarded to the client. The operator
//      needs the detail, the user does not — and Google's error
//      messages can leak internal details (model names, quota
//      metadata) that don't belong in a browser response.
//
// This helper fixes all three at once. Every AI route now goes through
// it and gets consistent error surfacing without duplicating the
// try/catch/log pattern four times.

import { logger } from "./logger";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiCallResult {
  // True iff we got a 2xx AND the body had no error field.
  ok: boolean;
  // On success: Gemini's parsed candidates response. On failure: null.
  data:
    | {
        candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      }
    | null;
  // Server-side diagnostic when !ok. Never returned to the client.
  // Includes upstream HTTP status and body when the failure came from
  // Google; includes the local exception message when the fetch itself
  // threw. Redacted for the API key just in case a stack trace picks
  // it up from an env dump.
  diagnostic: string;
}

// Redact the API key wherever it might have landed in a string that's
// about to be logged. Belt-and-braces — the header path shouldn't put
// the key in URLs or bodies, but a stack trace from a network layer
// could still capture the env value.
function redactKey(text: string, apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join("[GEMINI_KEY_REDACTED]");
}

export async function callGemini(opts: {
  model: string;
  apiKey: string;
  // Full Gemini generateContent request body. Passed through
  // unchanged so callers keep control of prompt/inline_data/config.
  body: unknown;
  // Route label for log correlation ("ai.chat", "ai.receipt-scan", etc).
  // Not returned to the client.
  route: string;
}): Promise<GeminiCallResult> {
  const url = `${GEMINI_BASE}/${opts.model}:generateContent`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header-based auth — key never appears in the URL, so it
        // stays out of fetch traces, proxy access logs, and any
        // error message that might include the request line.
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(opts.body),
    });
  } catch (err) {
    // Network-level failure — DNS, TCP, TLS, timeout. Bound and
    // logged so the operator can see what actually happened.
    // Redact BOTH the log entry AND the returned diagnostic — a
    // stack trace from a network layer could theoretically capture
    // the header value, and the diagnostic goes into caller-side
    // logs too.
    const message = err instanceof Error ? err.message : String(err);
    const redacted = redactKey(message, opts.apiKey);
    logger.warn(
      { route: opts.route, model: opts.model, err: redacted },
      "gemini fetch threw before response",
    );
    return { ok: false, data: null, diagnostic: `fetch threw: ${redacted}` };
  }

  if (!response.ok) {
    // Read the body — this is the "exactly what is wrong" surface
    // Google publishes. Retired model → 404 with a message naming
    // the model. Quota → 429 with quota metadata. Bad key → 401.
    // Prompt filter → 400 with a safety-category enum. Every one
    // of these was previously discarded.
    let body = "";
    try {
      body = await response.text();
    } catch (bodyErr) {
      body = `<body read failed: ${bodyErr instanceof Error ? bodyErr.message : String(bodyErr)}>`;
    }
    const redactedBody = redactKey(body, opts.apiKey);
    logger.warn(
      {
        route: opts.route,
        model: opts.model,
        status: response.status,
        statusText: response.statusText,
        body: redactedBody.slice(0, 2000),
      },
      "gemini returned non-2xx",
    );
    return {
      ok: false,
      data: null,
      diagnostic: `HTTP ${response.status} ${response.statusText}: ${redactedBody.slice(0, 500)}`,
    };
  }

  // 2xx path — parse and check for the body-level error field.
  // Google returns 200 with an `error` object in some validation
  // failure modes (older API behaviour), so we can't skip this.
  let data: {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    error?: { message?: string; status?: string };
  };
  try {
    data = (await response.json()) as typeof data;
  } catch (parseErr) {
    const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
    logger.warn(
      { route: opts.route, model: opts.model, err: message },
      "gemini 2xx body failed to parse as JSON",
    );
    return { ok: false, data: null, diagnostic: `json parse failed: ${message}` };
  }

  if (data.error) {
    const redacted = redactKey(data.error.message ?? "", opts.apiKey);
    logger.warn(
      {
        route: opts.route,
        model: opts.model,
        status: data.error.status,
        message: redacted,
      },
      "gemini 2xx body carried an error object",
    );
    return { ok: false, data: null, diagnostic: `body error: ${redacted}` };
  }

  return { ok: true, data, diagnostic: "" };
}
