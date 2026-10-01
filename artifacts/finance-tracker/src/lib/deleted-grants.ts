// Sign-in grants still live at Google or GitHub after account deletion.
//
// The server revokes them best-effort (api-server lib/oauth-grants.ts) and
// returns the ones it could not. Deletion signs the user out, which unmounts
// the profile page, so the list is carried in sessionStorage to the sign-in
// screen, where it is shown until dismissed (DeletedGrantsNotice).

export type GrantProvider = "google" | "github";

export const GRANT_HELP: Record<GrantProvider, { label: string; url: string; where: string }> = {
  google: {
    label: "Google",
    url: "https://myaccount.google.com/connections",
    where: "Google Account, Data & privacy, Third-party apps & services",
  },
  github: {
    label: "GitHub",
    url: "https://github.com/settings/applications",
    where: "GitHub Settings, Applications, Authorized OAuth Apps",
  },
};

const KEY = "nr-deleted-account-grants";

function isProvider(v: unknown): v is GrantProvider {
  return v === "google" || v === "github";
}

export function rememberRemainingGrants(providers: readonly string[]): void {
  const known = providers.filter(isProvider);
  try {
    if (known.length > 0) sessionStorage.setItem(KEY, JSON.stringify(known));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the confirmation screen's advice before deletion
    // already named both providers.
  }
}

export function readRemainingGrants(): GrantProvider[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isProvider) : [];
  } catch {
    return [];
  }
}

export function clearRemainingGrants(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
