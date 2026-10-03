// Child process for account-prefs.test.ts: opens a prefs session against a
// fake request context, then dies the way drill-sweep-shot did on 3 Oct 2026
// — a rejection thrown from inside a Playwright route callback, which no
// try/finally in the script can see. Prints each request as a JSON line so
// the parent can check that restore() still ran.

import type { BrowserContext } from "playwright";

const { openAccountPrefs } = await import("./account-prefs.js");

const respond = (body: unknown) => ({
  ok: () => true,
  status: () => 200,
  text: async () => JSON.stringify(body),
  json: async () => body,
});
const route = (method: string) => async (url: string, opts?: { data?: unknown }) => {
  const path = new URL(url).pathname;
  console.log(JSON.stringify({ method, path, body: opts?.data }));
  if (path === "/api/settings/preferences") return respond({ preferences: { "nr-default-page": "/portfolio" } });
  return respond({});
};
const request = { get: route("GET"), put: route("PUT"), patch: route("PATCH"), post: route("POST") };

const prefs = await openAccountPrefs({ request } as unknown as BrowserContext, "cookie");
try {
  void Promise.reject(new Error("socket hang up"));
  await new Promise((r) => setTimeout(r, 5000));
} finally {
  await prefs.restore();
}
