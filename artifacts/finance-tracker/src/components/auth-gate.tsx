// Auth gate — rebuilt to the same design language as the rest
// of the app.
//
// What went away:
//   - The 1,048-row spreadsheet gutter. It was ~1,000 DOM nodes
//     on the first screen every user loads on the free tier, for
//     an easter egg almost nobody reached.
//   - The row-1000 easter egg (LOCKED_CELL / "tf u doing here").
//     If an egg wants to exist, it doesn't belong on the entry
//     point.
//   - The spreadsheet metaphor entirely: cell reference "A1",
//     "=NUMERIS.SIGN_IN()", the formula bar, "LOCKED_CELL". That
//     metaphor was abandoned in the design work because it
//     doesn't survive a phone. The auth page just never caught up.
//
// What stayed:
//   - The `fx` provenance mark is NOT here — it earns its place
//     next to a computed figure (see MobileHome), and there are
//     no figures on this page. Kept out of the entry-point
//     signature deliberately.
//   - Type ladder, hairline structure, primitives — inherited
//     from HStack/VStack/Text/PanelBox as elsewhere.
//
// Provider buttons render iff the server reports the provider
// as configured via GET /api/auth-providers (useAuthProviders).
// No build-time env flag decides. Test-locked in
// auth-providers.test.ts.

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuthProviders, type ProviderId } from "@/lib/auth-providers";
import {
  classifyAuthError,
  makeAuthError,
  looksLikeColdStart,
  type AuthError,
} from "@/lib/auth-errors";
import { HStack, VStack, Text, PanelBox } from "@/components/primitives";
import { Logo } from "@/components/logo";

type Mode = "signin" | "signup" | "forgot" | "reset" | "twofa";

// One-sentence pitch shown on every mode. Written so a stranger
// arriving here knows what Numeris is before they type anything.
const PITCH = "A personal finance OS — your accounts, portfolios, budgets, and shared bills across currencies, in one screen.";

// Human labels for each provider. Icons are inline SVG (no emoji
// per the no-emoji lock). Each SVG is drawn to render legibly
// against both dark and light themes via currentColor.
const PROVIDER_LABEL: Record<ProviderId, string> = {
  google: "Continue with Google",
  apple:  "Continue with Apple",
  github: "Continue with GitHub",
};

function ProviderIcon({ id }: { id: ProviderId }) {
  if (id === "google") {
    return (
      <svg width={14} height={14} viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.7 30.4.5 24 .5 14.9.5 7.1 5.7 3.4 13.3l7.9 6.1C13.2 13.7 18.2 9.5 24 9.5z"/>
        <path fill="#34A853" d="M46.5 24.5c0-1.5-.1-3-.4-4.5H24v9h12.7c-.6 3.1-2.3 5.7-4.9 7.4l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.8z"/>
        <path fill="#FBBC05" d="M11.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C1.9 16.3.5 20 .5 24s1.4 7.7 3.4 10.7l7.4-6.1z"/>
        <path fill="#EA4335" d="M24 47.5c6.4 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-5.8 0-10.8-4.2-12.6-9.9l-7.9 6.1C7.1 42.3 14.9 47.5 24 47.5z"/>
      </svg>
    );
  }
  if (id === "apple") {
    return (
      <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M17.05 12.65c-.03-2.75 2.24-4.07 2.34-4.13-1.28-1.87-3.27-2.13-3.97-2.16-1.69-.17-3.29 1-4.14 1-.87 0-2.18-.98-3.58-.95-1.84.03-3.54 1.07-4.49 2.72-1.91 3.32-.49 8.22 1.37 10.9.91 1.32 1.99 2.8 3.4 2.75 1.37-.06 1.89-.88 3.55-.88s2.12.88 3.57.85c1.48-.03 2.41-1.34 3.31-2.66 1.04-1.52 1.47-3 1.49-3.08-.03-.01-2.85-1.09-2.88-4.32zM14.31 4.66c.75-.91 1.26-2.18 1.12-3.44-1.08.04-2.39.72-3.17 1.63-.7.8-1.31 2.08-1.15 3.32 1.21.09 2.44-.61 3.2-1.51z"/>
      </svg>
    );
  }
  // github
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.4-1.7-1.4-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.1-.4-.6-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.3.8.8 1.3 1.9 1.3 3.2 0 4.7-2.9 5.7-5.5 6 .4.4.8 1.1.8 2.3v3.4c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/>
    </svg>
  );
}

// BrandMark used to live here as a bespoke boxed-N placeholder. The
// real Numeris mark is <LogoMark>/<Logo> in components/logo.tsx —
// the animated peak-and-diagonal glyph the sidebar and mobile
// header already use. Auth-gate now composes <Logo> like every
// other brand chrome site should.

// ── Shared styles (kept tiny and centralised — three fields, one
//    button — instead of the 49 inline objects the previous file
//    carried). Buttons and inputs get one style each, and the
//    small variants layer via inline overrides.
const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  // Inputs recede when empty: --ft-base blends into the card's own
  // surrounding surface (both are dark on dark themes), and the
  // border sits at the lighter --ft-border rather than --ft-border2.
  // Focus + fill still carry the action; the empty form doesn't
  // shout back at the user before they've done anything.
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border)",
  color: "var(--ft-text)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  padding: "10px 12px",
  outline: "none",
  minHeight: 44, // 44pt touch target on mobile
};
// Primary action reads as primary via the accent border + accent
// text + full-width footprint — not via a solid olive block. The
// old solid-fill made the button the heaviest element on the card,
// so the eye landed on it before the mark or the heading (audit
// finding). Outline treatment holds affordance without weight;
// hover fills to communicate the action.
const PRIMARY_BTN: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "var(--ft-accent)",
  border: "1.5px solid var(--ft-accent)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "12px 16px",
  cursor: "pointer",
  minHeight: 44,
  transition: "background 0.14s ease, color 0.14s ease",
};
const SECONDARY_BTN: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "var(--ft-text)",
  border: "1px solid var(--ft-border2)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "10px 14px",
  cursor: "pointer",
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};
const LINK_BTN: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--ft-accent)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const { providers, passwordResetEnabled, loading: providersLoading } = useAuthProviders();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [error, setError] = useState<AuthError | null>(() => {
    // ?error=xxx from an OAuth redirect
    const url = new URLSearchParams(window.location.search).get("error");
    if (url === "account_not_linked") {
      return {
        kind: "provider_unavailable",
        message: "That social account isn't linked. Sign in with email/password first, then link it from Settings.",
      };
    }
    return null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState<ProviderId | null>(null);
  const [forgotSent, setForgotSent] = useState<{ email: string } | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);

  if (isPending) {
    return <div style={{ minHeight: "100vh", background: "var(--ft-base)" }} />;
  }
  if (session) {
    return <>{children}</>;
  }

  const catch401 = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      // Network / cold-start disambiguation
      const initial = classifyAuthError(err);
      if (initial.kind === "network") {
        const cold = await looksLikeColdStart();
        setError(cold ? makeAuthError("server_waking") : initial);
      } else {
        setError(initial);
      }
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    await catch401(async () => {
      const res = await authClient.signIn.email({ email, password });
      if (res?.error) {
        const classified = classifyAuthError(res.error);
        if (classified.kind === "two_factor_wrong") {
          setMode("twofa");
        } else {
          setError(classified);
        }
      }
      // Successful sign-in: better-auth's useSession refreshes on
      // its own; if there is a session on next render we unmount
      // and reveal the app.
    });
    setSubmitting(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    await catch401(async () => {
      const res = await authClient.signUp.email({ email, password, name });
      if (res?.error) {
        setError(classifyAuthError(res.error));
      } else {
        // Fresh sign-up: land on the onboarding questionnaire
        // rather than a bare dashboard. The onboarding component
        // (see components/onboarding.tsx) reads the persona
        // localStorage key and renders when it's absent; a
        // fresh signup has no key, so simply revealing the app
        // shell brings the OnboardingGate up automatically.
        // Nothing more to do here — the session flip on the
        // next useSession refresh reveals children.
      }
    });
    setSubmitting(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    await catch401(async () => {
      const resetOrigin = import.meta.env.VITE_RESET_ORIGIN || window.location.origin;
      const res = await authClient.requestPasswordReset({ email, redirectTo: resetOrigin });
      if (res?.error) {
        setError(classifyAuthError(res.error));
      } else {
        // Only claim "sent" after the API returned success.
        // The server throws when RESEND_API_KEY is missing, which
        // routes here as `reset_transport_off` — the UI shows the
        // real message rather than "check your inbox".
        setForgotSent({ email });
      }
    });
    setSubmitting(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError({ kind: "wrong_credentials", message: "Passwords do not match." });
      return;
    }
    if (!resetToken) {
      setError(makeAuthError("reset_token_invalid"));
      return;
    }
    setSubmitting(true);
    setError(null);
    await catch401(async () => {
      const res = await authClient.resetPassword({ newPassword, token: resetToken });
      if (res?.error) {
        setError(classifyAuthError(res.error));
      } else {
        setResetToken(null);
        setNewPassword("");
        setConfirmPassword("");
        setMode("signin");
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("reset");
        window.history.replaceState({}, "", url.toString());
      }
    });
    setSubmitting(false);
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    await catch401(async () => {
      const tf = (authClient as unknown as {
        twoFactor?: { verifyTotp?: (opts: { code: string }) => Promise<{ error?: unknown }> };
      }).twoFactor;
      const res = await tf?.verifyTotp?.({ code: totpCode });
      if (res?.error) setError(classifyAuthError(res.error));
    });
    setSubmitting(false);
  };

  const handleSocial = async (provider: ProviderId) => {
    setError(null);
    setSocialLoading(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
        errorCallbackURL: window.location.origin,
      });
    } catch (err) {
      setError(classifyAuthError(err));
    } finally {
      setSocialLoading(null);
    }
  };

  const applyAction = (action: NonNullable<AuthError["action"]>) => {
    setError(null);
    if (action.intent === "signup") setMode("signup");
    else if (action.intent === "signin") setMode("signin");
    else if (action.intent === "forgot") setMode("forgot");
    else if (action.intent === "retry") {
      // Retry: clear the error; the user re-clicks Submit. We
      // don't auto-resubmit because a retry loop against a
      // still-cold server would spam Render's rate limiter.
    }
  };

  // ── Sub-renders ──────────────────────────────────────────
  // Weight ladder, top to bottom:
  //   Logo (mark + wordmark) — hero size 44, leads the eye
  //   heading — 20px, semantic h1, tells you what you're doing
  //   sub description — 12px muted, context
  //   form — quiet inputs, hairline borders
  //   primary action — outline accent, clear affordance without a
  //     solid olive block dominating the card
  const renderHeader = (heading: string, sub?: string) => (
    <VStack gap={8} padding="0 0 20px">
      <Logo size={44} />
      <Text as="h1" weight={700} color="var(--ft-text)" size={20} lineHeight={1.25} mt={12}>
        {heading}
      </Text>
      {sub && (
        <Text as="p" color="var(--ft-muted)" size={12} lineHeight={1.55} mt={2}>
          {sub}
        </Text>
      )}
    </VStack>
  );

  const renderError = () => {
    if (!error) return null;
    return (
      <div
        role="alert"
        style={{
          background: "color-mix(in srgb, var(--ft-red) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--ft-red) 40%, transparent)",
          padding: "10px 12px",
          marginBottom: 12,
        }}
      >
        <Text as="div" color="var(--ft-red)" mono size={11} lineHeight={1.45}>
          {error.message}
        </Text>
        {error.action && (
          <button
            type="button"
            onClick={() => applyAction(error.action!)}
            style={{ ...LINK_BTN, color: "var(--ft-red)", marginTop: 6 }}
          >
            {error.action.label}
          </button>
        )}
      </div>
    );
  };

  const renderProviders = () => {
    if (providersLoading) return null;
    if (providers.length === 0) return null;
    return (
      <VStack gap={8} padding="12px 0 0">
        <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12 }}>
          <Text as="div" mono upper letterSpacing="0.08em" color="var(--ft-dim)" size={9} mb={8} align="center">
            OR
          </Text>
          <VStack gap={8}>
            {providers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSocial(p)}
                disabled={socialLoading != null}
                style={{
                  ...SECONDARY_BTN,
                  opacity: socialLoading != null && socialLoading !== p ? 0.5 : 1,
                }}
              >
                <ProviderIcon id={p} />
                <span>{socialLoading === p ? "Redirecting…" : PROVIDER_LABEL[p]}</span>
              </button>
            ))}
          </VStack>
        </div>
      </VStack>
    );
  };

  // ── Body per mode ────────────────────────────────────────
  const body = (() => {
    if (mode === "twofa") {
      return (
        <>
          {renderHeader("Two-factor code", "Enter the 6-digit code from your authenticator.")}
          {renderError()}
          <form onSubmit={handleTotp}>
            <VStack gap={10}>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                style={INPUT_STYLE}
              />
              <button type="submit" className="ft-auth-primary" disabled={submitting || totpCode.length < 6} style={{ ...PRIMARY_BTN, opacity: submitting || totpCode.length < 6 ? 0.5 : 1 }}>
                {submitting ? "Verifying…" : "Verify"}
              </button>
              <HStack justify="center" padding="6px 0 0">
                <button type="button" onClick={() => { setMode("signin"); setError(null); setTotpCode(""); }} style={LINK_BTN}>
                  ← Back to sign in
                </button>
              </HStack>
            </VStack>
          </form>
        </>
      );
    }
    if (mode === "reset") {
      return (
        <>
          {renderHeader("Set a new password", "Choose a password of at least 8 characters.")}
          {renderError()}
          <form onSubmit={handleReset}>
            <VStack gap={10}>
              <input type="password" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" style={INPUT_STYLE} />
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={INPUT_STYLE} />
              <button
                type="submit"
                className="ft-auth-primary"
                disabled={submitting || newPassword.length < 8 || confirmPassword.length < 8}
                style={{ ...PRIMARY_BTN, opacity: submitting || newPassword.length < 8 ? 0.5 : 1 }}
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
              <HStack justify="center" padding="6px 0 0">
                <button type="button" onClick={() => { setMode("signin"); setError(null); }} style={LINK_BTN}>
                  ← Back to sign in
                </button>
              </HStack>
            </VStack>
          </form>
        </>
      );
    }
    if (mode === "forgot") {
      if (forgotSent) {
        return (
          <>
            {renderHeader("Check your inbox", `If ${forgotSent.email} is registered, a reset link is on its way. Links expire in 1 hour.`)}
            <HStack justify="center" padding="8px 0 0">
              <button type="button" onClick={() => { setMode("signin"); setError(null); setForgotSent(null); }} style={LINK_BTN}>
                ← Back to sign in
              </button>
            </HStack>
          </>
        );
      }
      return (
        <>
          {renderHeader("Reset your password", passwordResetEnabled
            ? "We'll email you a link to set a new password."
            : "Password reset isn't configured on this server."
          )}
          {renderError()}
          <form onSubmit={handleForgot}>
            <VStack gap={10}>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                style={INPUT_STYLE}
                disabled={!passwordResetEnabled}
              />
              <button
                type="submit"
                className="ft-auth-primary"
                disabled={submitting || !email || !passwordResetEnabled}
                style={{ ...PRIMARY_BTN, opacity: submitting || !email || !passwordResetEnabled ? 0.5 : 1 }}
              >
                {submitting ? "Sending…" : passwordResetEnabled ? "Send reset link" : "Reset unavailable"}
              </button>
              <HStack justify="center" padding="6px 0 0">
                <button type="button" onClick={() => { setMode("signin"); setError(null); }} style={LINK_BTN}>
                  ← Back to sign in
                </button>
              </HStack>
            </VStack>
          </form>
        </>
      );
    }

    // signin / signup
    const isSignIn = mode === "signin";
    return (
      <>
        {renderHeader(
          isSignIn ? "Sign in" : "Create your account",
          PITCH,
        )}
        {renderError()}
        <form onSubmit={isSignIn ? handleSignIn : handleSignUp}>
          <VStack gap={10}>
            {!isSignIn && (
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                style={INPUT_STYLE}
              />
            )}
            <input
              type="email"
              autoFocus={isSignIn}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={INPUT_STYLE}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignIn ? "Password" : "Password (min 8 characters)"}
              style={INPUT_STYLE}
            />
            {isSignIn && passwordResetEnabled && (
              <HStack justify="end">
                <button type="button" onClick={() => { setMode("forgot"); setError(null); }} style={LINK_BTN}>
                  Forgot password?
                </button>
              </HStack>
            )}
            <button
              type="submit"
              className="ft-auth-primary"
              disabled={
                submitting ||
                !email ||
                (!isSignIn && !name) ||
                (!isSignIn && password.length < 8) ||
                (isSignIn && !password)
              }
              style={{
                ...PRIMARY_BTN,
                opacity:
                  submitting || !email || (isSignIn ? !password : !name || password.length < 8) ? 0.5 : 1,
              }}
            >
              {submitting
                ? isSignIn ? "Signing in…" : "Creating account…"
                : isSignIn ? "Sign in" : "Create account"}
            </button>
          </VStack>
        </form>

        {renderProviders()}

        <HStack justify="center" padding="16px 0 0">
          <Text as="span" color="var(--ft-dim)" size={11}>
            {isSignIn ? "No account? " : "Have an account? "}
            <button
              type="button"
              onClick={() => { setMode(isSignIn ? "signup" : "signin"); setError(null); }}
              style={LINK_BTN}
            >
              {isSignIn ? "Sign up" : "Sign in"}
            </button>
          </Text>
        </HStack>
      </>
    );
  })();

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 20px 40px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <PanelBox padding={20}>
          {body}
        </PanelBox>
      </div>
    </div>
  );
}
