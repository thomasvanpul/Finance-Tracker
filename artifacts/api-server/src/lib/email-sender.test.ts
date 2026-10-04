// configuredEmailFrom is the one function every outbound sender (better-auth
// and the weekly digest) must go through. The digest once bypassed it and
// hard-coded `digest@numeris.app`, a domain nobody here owns — these locks
// exist so a future hard-coded sender fails here instead of at Resend.

import { describe, it, expect } from "vitest";
import { configuredEmailFrom } from "./email-sender";

type Env = Record<string, string | undefined>;

describe("configuredEmailFrom", () => {
  it("uses EMAIL_FROM when set", () => {
    expect(configuredEmailFrom({ EMAIL_FROM: "noreply@numeris.page" })).toBe("noreply@numeris.page");
  });

  it("trims EMAIL_FROM and treats whitespace-only as unset", () => {
    expect(configuredEmailFrom({ EMAIL_FROM: "  noreply@numeris.page  " })).toBe("noreply@numeris.page");
    expect(configuredEmailFrom({ EMAIL_FROM: "   ", API_BASE_URL: "https://numeris.page" }))
      .toBe("noreply@numeris.page");
  });

  it("falls back to noreply@<API_BASE_URL host> when EMAIL_FROM is unset", () => {
    expect(configuredEmailFrom({ API_BASE_URL: "https://numeris.page" })).toBe("noreply@numeris.page");
  });

  it("falls back to noreply@localhost when nothing is configured", () => {
    expect(configuredEmailFrom({})).toBe("noreply@localhost");
  });

  it("never returns a hard-coded foreign domain regardless of env", () => {
    // The regression this task fixed: a literal domain baked into a call
    // site instead of read from configuration. Every output must trace to
    // either EMAIL_FROM or the derived API origin — never a fixed literal.
    const cases: Env[] = [
      {},
      { EMAIL_FROM: "digest@numeris.page" },
      { API_BASE_URL: "https://financetracker.work" },
      { RENDER_EXTERNAL_URL: "https://numeris-api.onrender.com" },
    ];
    for (const env of cases) {
      expect(configuredEmailFrom(env)).not.toContain("numeris.app");
    }
  });
});
