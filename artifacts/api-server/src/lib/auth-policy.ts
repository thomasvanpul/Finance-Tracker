// Auth policy constants that MORE THAN ONE module has to agree on.
//
// Kept out of lib/better-auth.ts deliberately: that module imports the
// drizzle adapter and therefore @workspace/db, which throws at import time
// without DATABASE_URL. routes/auth-providers.ts is a public endpoint that
// must stay importable (and testable) without a database, so the shared fact
// lives here instead of being read off the better-auth instance.
//
// lib/better-auth.verification.test.ts locks the two to each other, so this
// file cannot drift from what the server actually enforces.

// Email verification is REQUIRED before an email+password account may sign in.
//
// Turned on 2026-09-19. Until then anyone could sign up as any address —
// including an address belonging to someone else — and reach the app. For a
// product whose whole surface is a person's finances, an unowned address is
// not an acceptable identity, and the volunteer test round is the point at
// which addresses stop being Thomas's own.
//
// Consequences worth knowing before flipping this back:
//   - sign-up returns NO session (better-auth dist/api/routes/sign-up.mjs:251)
//   - sign-in answers 403 "Email not verified" until the link is clicked
//   - a duplicate sign-up stops answering USER_ALREADY_EXISTS and returns a
//     synthetic success instead (sign-up.mjs:161) — enumeration protection
//     that arrives as a side effect of this flag, so the UI must not promise
//     "account created", only "if that address is new, check your inbox"
//   - and it cannot be on without a live mail transport; see
//     lib/email-transport.ts for the lockout that refusal prevents.
//
// OAuth providers are unaffected: Google and Apple only surface addresses
// they have verified themselves, and better-auth marks those emailVerified.
export const REQUIRE_EMAIL_VERIFICATION = true;

// How long a verification link stays good. Shorter than better-auth's default
// (1 hour) would be hostile to a volunteer who opens mail once a day; longer
// than a day gives a leaked link too much life.
export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60 * 24;
