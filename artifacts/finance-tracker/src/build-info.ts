// The commit this bundle was built from.
//
// Baked in by vite.config.ts from VERCEL_GIT_COMMIT_SHA at build time. It
// cannot be read at runtime — the browser has no access to Vercel's
// environment — so this is the only way the admin hub can compare what is
// deployed against what is on origin/main.
//
// Empty in a local dev build. The hub reports "unknown" for an empty value
// rather than treating a missing commit as a match: a deploy checker that
// goes green because it could not look is worse than none at all.

declare const __BUILD_COMMIT__: string;

export const BUILD_COMMIT: string | null =
  typeof __BUILD_COMMIT__ === "string" && __BUILD_COMMIT__.length > 0
    ? __BUILD_COMMIT__
    : null;
