import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { LogoMark } from "@/components/logo";

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_OAUTH);

type Mode = "signin" | "signup" | "forgot" | "reset";

function TopBar({ locked }: { locked: boolean }) {
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{ background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-raised)", height: 44 }}
    >
      <div
        className="flex items-center gap-2 px-4"
        style={{ borderRight: "1px solid var(--ft-raised)", height: 44 }}
      >
        <LogoMark />
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.12em", lineHeight: 1 }}>NUMERIS</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", letterSpacing: "0.15em", lineHeight: 1 }}>PERSONAL OS</span>
        </div>
      </div>
      <div className="flex-1" />
      {locked && (
        <div className="flex items-center gap-3 px-4 text-xs" style={{ color: "var(--ft-dim)" }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--ft-red)" }} />
            <span style={{ color: "var(--ft-red)" }}>Locked</span>
          </span>
        </div>
      )}
    </div>
  );
}

function FormulaBar({ label }: { label: string }) {
  return (
    <div
      className="flex-shrink-0 flex items-center gap-2 px-3"
      style={{ background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-raised)", height: 28 }}
    >
      <span
        className="text-xs font-mono px-2 py-0.5 border"
        style={{ color: "var(--ft-blue)", borderColor: "var(--ft-border2)", background: "var(--ft-base)", minWidth: 48, textAlign: "center" }}
      >
        AUTH
      </span>
      <span className="text-xs" style={{ color: "var(--ft-dim)" }}>fx</span>
      <span className="text-xs font-mono flex-1 truncate" style={{ color: "var(--ft-dim)" }}>
        {label}
      </span>
    </div>
  );
}

function RowGutter() {
  const ROWS = 1048;
  const EGG_ZONE_START = 997;
  return (
    <div
      className="hidden sm:flex flex-shrink-0 flex-col select-none"
      style={{ background: "var(--ft-base)", borderRight: "1px solid var(--ft-raised)", width: 44 }}
    >
      {Array.from({ length: ROWS }, (_, i) => {
        const rowNum = i + 1;
        const isEgg = rowNum >= EGG_ZONE_START;
        return (
          <div
            key={i}
            className="flex items-center justify-center"
            style={{
              height: 24,
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: isEgg ? "var(--ft-accent)" : "var(--ft-dim)",
              borderBottom: "1px solid rgba(33,38,45,0.5)",
              flexShrink: 0,
              fontWeight: isEgg ? 600 : undefined,
            }}
          >
            {rowNum}
          </div>
        );
      })}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  borderRadius: 2,
  color: "var(--ft-text)",
  fontSize: 13,
  fontFamily: "monospace",
  padding: "8px 10px",
  marginBottom: 10,
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  background: "var(--ft-blue)",
  color: "white",
  border: "none",
  borderRadius: 2,
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 0",
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  marginBottom: 8,
});

const btnSecondaryStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--ft-raised)",
  color: "var(--ft-text)",
  border: "1px solid var(--ft-border2)",
  borderRadius: 2,
  fontSize: 13,
  fontWeight: 500,
  padding: "8px 0",
  cursor: "pointer",
  marginBottom: 8,
};

const linkBtnStyle: React.CSSProperties = {
  color: "var(--ft-blue)",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const urlError = new URLSearchParams(window.location.search).get("error");
  const [error, setError] = useState<string | null>(
    urlError === "account_not_linked" ? "Google account not linked. Try signing in with email/password first, then link Google from settings." : urlError
  );
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);

  // Dev bypass: skip the loading spinner but still require a real session.
  // Once signed in, the 30-day session means this only shows once a month.
  if (isPending) {
    if (import.meta.env.VITE_DEV_BYPASS === "true") return <>{children}</>;
    return <div style={{ minHeight: "100vh", background: "var(--ft-base)" }} />;
  }

  if (session) {
    return <>{children}</>;
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res?.error) {
        type ErrShape = { message?: string; statusText?: string; error?: { message?: string } };
        const e = res.error as ErrShape;
        const msg = e?.message ?? e?.error?.message ?? e?.statusText ?? "Incorrect email or password";
        if (msg.toLowerCase().includes("two") || msg.toLowerCase().includes("2fa") || msg.toLowerCase().includes("factor")) {
          setNeedsCode(true);
        } else {
          setError(msg || "Incorrect email or password");
        }
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await (authClient as { twoFactor?: { verifyTotp?: (opts: { code: string }) => Promise<{ error?: unknown }> } }).twoFactor?.verifyTotp?.({ code: totpCode });
      if (res?.error) {
        setError((res.error as { message?: string })?.message ?? "Incorrect code");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await authClient.signUp.email({ email, password, name });
      if (res?.error) {
        setError((res.error as { message?: string })?.message ?? "Sign up failed");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
        errorCallbackURL: window.location.origin,
      });
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setError("Google sign-in is unavailable in this environment.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resetOrigin = import.meta.env.VITE_RESET_ORIGIN || window.location.origin;
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: resetOrigin,
      });
      if (res?.error) {
        setError((res.error as { message?: string })?.message ?? "Something went wrong");
      } else {
        setForgotSent(true);
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!resetToken) {
      setError("Missing reset token");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({
        newPassword,
        token: resetToken,
      });
      if (res?.error) {
        setError((res.error as { message?: string })?.message ?? "Reset failed");
      } else {
        setNewPassword("");
        setConfirmPassword("");
        setResetToken(null);
        setMode("signin");
        // Clear the token from the URL without a full reload
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("reset");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  const goToSignIn = () => {
    setMode("signin");
    setError(null);
    setForgotSent(false);
  };

  const isSignIn = mode === "signin";

  const formulaLabel = needsCode
    ? "=NUMERIS.VERIFY_2FA()"
    : mode === "forgot"
    ? "=NUMERIS.FORGOT_PASSWORD()"
    : mode === "reset"
    ? "=NUMERIS.RESET_PASSWORD()"
    : isSignIn
    ? "=NUMERIS.SIGN_IN()"
    : "=NUMERIS.SIGN_UP()";

  const headerLabel = needsCode
    ? "Two-factor authentication"
    : mode === "forgot"
    ? "Reset your password"
    : mode === "reset"
    ? "Set a new password"
    : isSignIn
    ? "Sign in to Numeris"
    : "Create your account";

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-hidden"
      style={{ background: "var(--ft-base)", color: "var(--ft-text)" }}
    >
      <TopBar locked />
      <FormulaBar label={formulaLabel} />

      <div className="flex flex-1 overflow-y-auto ft-no-scrollbar" style={{ scrollbarWidth: "none" }}>
        <RowGutter />

        <div style={{ flex: 1, position: "relative", minHeight: 1048 * 24 }}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "calc(50dvh - 200px)" }}>
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              width: 320,
            }}
          >
            <div
              className="flex items-center gap-1.5 px-3"
              style={{ height: 26, borderBottom: "1px solid var(--ft-raised)", background: "var(--ft-base)" }}
            >
              <span className="text-xs font-mono" style={{ color: "var(--ft-blue)" }}>A1</span>
              <span className="text-xs" style={{ color: "var(--ft-dim)" }}>·</span>
              <span className="text-xs" style={{ color: "var(--ft-dim)" }}>
                {headerLabel}
              </span>
            </div>

            <div className="p-4">
              {needsCode ? (
                <form onSubmit={handleTotpVerify}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="6-digit code"
                    style={inputStyle}
                  />
                  {error && (
                    <p className="font-mono" style={{ color: "var(--ft-red)", fontSize: 12, marginBottom: 10 }}>
                      ! {error}
                    </p>
                  )}
                  <button type="submit" disabled={submitting || totpCode.length < 6} style={btnStyle(submitting || totpCode.length < 6)}>
                    {submitting ? "Verifying…" : "Verify"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNeedsCode(false); setTotpCode(""); setError(null); }}
                    style={btnSecondaryStyle}
                  >
                    Back
                  </button>
                </form>
              ) : mode === "forgot" ? (
                forgotSent ? (
                  <div>
                    <p className="font-mono text-xs" style={{ color: "var(--ft-text)", marginBottom: 16, lineHeight: 1.6 }}>
                      If that email is registered, a reset link has been sent.
                    </p>
                    <p className="text-center text-xs" style={{ color: "var(--ft-dim)", marginTop: 4 }}>
                      <button type="button" onClick={goToSignIn} style={linkBtnStyle}>
                        ← Back to sign in
                      </button>
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword}>
                    <input
                      type="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      style={inputStyle}
                    />
                    {error && (
                      <p className="font-mono" style={{ color: "var(--ft-red)", fontSize: 12, marginBottom: 10 }}>
                        ! {error}
                      </p>
                    )}
                    <button type="submit" disabled={submitting || !email} style={btnStyle(submitting || !email)}>
                      {submitting ? "Sending…" : "Send reset link"}
                    </button>
                    <p className="text-center text-xs" style={{ color: "var(--ft-dim)", marginTop: 4 }}>
                      <button type="button" onClick={goToSignIn} style={linkBtnStyle}>
                        ← Back to sign in
                      </button>
                    </p>
                  </form>
                )
              ) : mode === "reset" ? (
                <form onSubmit={handleResetPassword}>
                  <input
                    type="password"
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    style={inputStyle}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    style={inputStyle}
                  />
                  {error && (
                    <p className="font-mono" style={{ color: "var(--ft-red)", fontSize: 12, marginBottom: 10 }}>
                      ! {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || newPassword.length < 8 || confirmPassword.length < 8}
                    style={btnStyle(submitting || newPassword.length < 8 || confirmPassword.length < 8)}
                  >
                    {submitting ? "Updating…" : "Update password"}
                  </button>
                  <p className="text-center text-xs" style={{ color: "var(--ft-dim)", marginTop: 4 }}>
                    <button type="button" onClick={goToSignIn} style={linkBtnStyle}>
                      ← Back to sign in
                    </button>
                  </p>
                </form>
              ) : isSignIn ? (
                <form onSubmit={handleSignIn}>
                  <input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    style={inputStyle}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    style={inputStyle}
                  />
                  <p className="text-xs" style={{ color: "var(--ft-dim)", marginBottom: 10, marginTop: -4 }}>
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setError(null); }}
                      style={linkBtnStyle}
                    >
                      Forgot password?
                    </button>
                  </p>
                  {error && (
                    <p className="font-mono" style={{ color: "var(--ft-red)", fontSize: 12, marginBottom: 10 }}>
                      ! {error}
                    </p>
                  )}
                  <button type="submit" disabled={submitting || !email || !password} style={btnStyle(submitting || !email || !password)}>
                    {submitting ? "Signing in…" : "Sign in"}
                  </button>
                  {GOOGLE_ENABLED && (
                    <button type="button" onClick={handleGoogle} disabled={googleLoading} style={{ ...btnSecondaryStyle, opacity: googleLoading ? 0.6 : 1, cursor: googleLoading ? "default" : "pointer" }}>
                      {googleLoading ? "Redirecting…" : "Continue with Google"}
                    </button>
                  )}
                  <p className="text-center text-xs" style={{ color: "var(--ft-dim)", marginTop: 4 }}>
                    No account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(null); }}
                      style={linkBtnStyle}
                    >
                      Sign up
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleSignUp}>
                  <input
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    style={inputStyle}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    style={inputStyle}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 8 chars)"
                    style={inputStyle}
                  />
                  {error && (
                    <p className="font-mono" style={{ color: "var(--ft-red)", fontSize: 12, marginBottom: 10 }}>
                      ! {error}
                    </p>
                  )}
                  <button type="submit" disabled={submitting || !name || !email || password.length < 8} style={btnStyle(submitting || !name || !email || password.length < 8)}>
                    {submitting ? "Creating account…" : "Create account"}
                  </button>
                  {GOOGLE_ENABLED && (
                    <button type="button" onClick={handleGoogle} disabled={googleLoading} style={{ ...btnSecondaryStyle, opacity: googleLoading ? 0.6 : 1, cursor: googleLoading ? "default" : "pointer" }}>
                      {googleLoading ? "Redirecting…" : "Continue with Google"}
                    </button>
                  )}
                  <p className="text-center text-xs" style={{ color: "var(--ft-dim)", marginTop: 4 }}>
                    Have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signin"); setError(null); }}
                      style={linkBtnStyle}
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
          </div>

          <div
            style={{
              position: "absolute",
              top: 999 * 24,
              left: 0,
              right: 0,
              padding: "0 20px 0 20px",
              fontFamily: "var(--font-mono)",
            }}
          >
            <div
              style={{
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-accent)",
                borderRadius: 2,
                padding: "12px 16px",
                maxWidth: 460,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--ft-accent)",
                    background: "var(--ft-raised)",
                    padding: "1px 6px",
                    borderRadius: 2,
                    letterSpacing: "0.1em",
                  }}
                >
                  A1000
                </span>
                <span style={{ fontSize: 10, color: "var(--ft-dim)" }}>·</span>
                <span style={{ fontSize: 10, color: "var(--ft-dim)" }}>
                  =NUMERIS.LOCKED_CELL("SECRET_A1000")
                </span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4 }}>
                tf u doing here
              </p>
              <p style={{ fontSize: 12, color: "var(--ft-muted)", marginBottom: 10 }}>
                you scrolled through 1,000 rows of a login screen for this?
              </p>
              <div style={{ fontSize: 11, color: "var(--ft-green)", marginBottom: 2 }}>
                ✓ respect achieved
              </div>
              <div style={{ fontSize: 11, color: "var(--ft-amber)", marginBottom: 10 }}>
                ! no loot here though
              </div>
              <div
                style={{
                  paddingTop: 8,
                  borderTop: "1px solid var(--ft-border2)",
                  fontSize: 10,
                  color: "var(--ft-dim)",
                  letterSpacing: "0.05em",
                }}
              >
                #REF! · SHEET1!A1000:B1001 · NUMERIS_EGG_V1
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
