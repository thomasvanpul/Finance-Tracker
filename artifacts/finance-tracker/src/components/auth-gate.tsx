import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_OAUTH);

type Mode = "signin" | "signup";

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <rect width="22" height="22" rx="4" fill="#0D1117" />
      <rect x="3" y="14" width="3" height="5" rx="0.5" fill="#1F6FEB" opacity="0.7" />
      <rect x="8" y="10" width="3" height="9" rx="0.5" fill="#1F6FEB" opacity="0.85" />
      <rect x="13" y="6" width="3" height="13" rx="0.5" fill="#1F6FEB" />
      <polyline points="4.5,13 9.5,9 14.5,5 18,3" stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="3" r="1.2" fill="#3FB950" />
    </svg>
  );
}

function TopBar({ locked }: { locked: boolean }) {
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{ background: "#161B22", borderBottom: "1px solid #21262D", height: 44 }}
    >
      <div
        className="flex items-center gap-2 px-4"
        style={{ borderRight: "1px solid #21262D", height: 44 }}
      >
        <Logo />
        <span className="font-bold text-sm tracking-tight" style={{ color: "#E6EDF3" }}>Fintrack</span>
        <span className="text-xs ml-1" style={{ color: "#484F58" }}>v2</span>
      </div>
      <div className="flex-1" />
      {locked && (
        <div className="flex items-center gap-3 px-4 text-xs" style={{ color: "#484F58" }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#F85149" }} />
            <span style={{ color: "#F85149" }}>Locked</span>
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
      style={{ background: "#161B22", borderBottom: "1px solid #21262D", height: 28 }}
    >
      <span
        className="text-xs font-mono px-2 py-0.5 border"
        style={{ color: "#58A6FF", borderColor: "#30363D", background: "#0D1117", minWidth: 48, textAlign: "center" }}
      >
        AUTH
      </span>
      <span className="text-xs" style={{ color: "#484F58" }}>fx</span>
      <span className="text-xs font-mono flex-1 truncate" style={{ color: "#6E7681" }}>
        {label}
      </span>
    </div>
  );
}

function RowGutter() {
  return (
    <div
      className="hidden sm:flex flex-shrink-0 flex-col select-none"
      style={{ background: "#161B22", borderRight: "1px solid #21262D", width: 36 }}
    >
      {Array.from({ length: 40 }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-center text-xs"
          style={{ height: 24, color: "#484F58", borderBottom: "1px solid rgba(33,38,45,0.5)", flexShrink: 0 }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0D1117",
  border: "1px solid #30363D",
  borderRadius: 2,
  color: "#E6EDF3",
  fontSize: 13,
  fontFamily: "monospace",
  padding: "8px 10px",
  marginBottom: 10,
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  background: "#1F6FEB",
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
  background: "#21262D",
  color: "#C9D1D9",
  border: "1px solid #30363D",
  borderRadius: 2,
  fontSize: 13,
  fontWeight: 500,
  padding: "8px 0",
  cursor: "pointer",
  marginBottom: 8,
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isPending) {
    return <div style={{ minHeight: "100vh", background: "#0D1117" }} />;
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
        const msg = (res.error as any)?.message ?? String(res.error);
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
      const res = await (authClient as any).twoFactor?.verifyTotp?.({ code: totpCode });
      if (res?.error) {
        setError((res.error as any)?.message ?? "Incorrect code");
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
        setError((res.error as any)?.message ?? "Sign up failed");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    await authClient.signIn.social({ provider: "google", callbackURL: window.location.href });
  };

  const isSignIn = mode === "signin";
  const formulaLabel = needsCode
    ? "=FINTRACK.VERIFY_2FA()"
    : isSignIn
    ? "=FINTRACK.SIGN_IN()"
    : "=FINTRACK.SIGN_UP()";

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-hidden"
      style={{ background: "#0D1117", color: "#C9D1D9" }}
    >
      <TopBar locked />
      <FormulaBar label={formulaLabel} />

      <div className="flex flex-1 overflow-hidden">
        <RowGutter />

        <div className="flex-1 flex items-center justify-center">
          <div
            style={{
              background: "#161B22",
              border: "1px solid #30363D",
              borderRadius: 2,
              width: 320,
            }}
          >
            <div
              className="flex items-center gap-1.5 px-3"
              style={{ height: 26, borderBottom: "1px solid #21262D", background: "#0D1117" }}
            >
              <span className="text-xs font-mono" style={{ color: "#58A6FF" }}>A1</span>
              <span className="text-xs" style={{ color: "#484F58" }}>·</span>
              <span className="text-xs" style={{ color: "#6E7681" }}>
                {needsCode ? "Two-factor authentication" : isSignIn ? "Sign in to Fintrack" : "Create an account"}
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
                    <p className="font-mono" style={{ color: "#F85149", fontSize: 12, marginBottom: 10 }}>
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
                  {error && (
                    <p className="font-mono" style={{ color: "#F85149", fontSize: 12, marginBottom: 10 }}>
                      ! {error}
                    </p>
                  )}
                  <button type="submit" disabled={submitting || !email || !password} style={btnStyle(submitting || !email || !password)}>
                    {submitting ? "Signing in…" : "Sign in"}
                  </button>
                  {GOOGLE_ENABLED && (
                    <button type="button" onClick={handleGoogle} style={btnSecondaryStyle}>
                      Continue with Google
                    </button>
                  )}
                  <p className="text-center text-xs" style={{ color: "#6E7681", marginTop: 4 }}>
                    No account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(null); }}
                      style={{ color: "#58A6FF", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
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
                    <p className="font-mono" style={{ color: "#F85149", fontSize: 12, marginBottom: 10 }}>
                      ! {error}
                    </p>
                  )}
                  <button type="submit" disabled={submitting || !name || !email || password.length < 8} style={btnStyle(submitting || !name || !email || password.length < 8)}>
                    {submitting ? "Creating account…" : "Create account"}
                  </button>
                  {GOOGLE_ENABLED && (
                    <button type="button" onClick={handleGoogle} style={btnSecondaryStyle}>
                      Continue with Google
                    </button>
                  )}
                  <p className="text-center text-xs" style={{ color: "#6E7681", marginTop: 4 }}>
                    Have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signin"); setError(null); }}
                      style={{ color: "#58A6FF", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
