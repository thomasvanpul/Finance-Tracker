import { useEffect, useState } from "react";

// Minimal password gate matching the backend's single shared-password auth.
// Not per-user auth — just enough to keep a public URL from being wide open.

type Status = "checking" | "authed" | "unauthed";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/check", { credentials: "include" })
      .then((res) => setStatus(res.ok ? "authed" : "unauthed"))
      .catch(() => setStatus("unauthed"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password, code: needsCode ? code : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setStatus("authed");
      } else if (body.requiresCode) {
        setNeedsCode(true);
        setError(res.ok ? null : (body.error ?? "Incorrect code"));
      } else {
        setError(body.error ?? "Incorrect password");
        if (needsCode) setCode("");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return <div style={{ minHeight: "100vh", background: "#0D1117" }} />;
  }

  if (status === "unauthed") {
    return (
      <div
        className="flex flex-col h-[100dvh] overflow-hidden"
        style={{ background: "#0D1117", color: "#C9D1D9" }}
      >
        {/* Top bar — same chrome as the logged-in ribbon, minus nav tabs */}
        <div
          className="flex-shrink-0 flex items-center"
          style={{ background: "#161B22", borderBottom: "1px solid #21262D", height: 44 }}
        >
          <div
            className="flex items-center gap-2 px-4"
            style={{ borderRight: "1px solid #21262D", height: 44 }}
          >
            <div
              className="flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ width: 26, height: 26, background: "linear-gradient(135deg,#1F6FEB,#0D419D)", borderRadius: 3 }}
            >
              F
            </div>
            <span className="font-bold text-sm tracking-tight" style={{ color: "#E6EDF3" }}>
              Fintrack
            </span>
            <span className="text-xs ml-1" style={{ color: "#484F58" }}>v2</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 px-4 text-xs" style={{ color: "#484F58" }}>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#F85149" }} />
              <span style={{ color: "#F85149" }}>Locked</span>
            </span>
          </div>
        </div>

        {/* Formula bar */}
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
            =FINTRACK.AUTHENTICATE()
          </span>
        </div>

        {/* Content: row gutter + centered login cell */}
        <div className="flex flex-1 overflow-hidden">
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

          <div className="flex-1 flex items-center justify-center">
            <form
              onSubmit={handleSubmit}
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
                  {needsCode ? "Enter your 6-digit authenticator code" : "Enter password to continue"}
                </span>
              </div>
              <div className="p-4">
                {!needsCode ? (
                  <input
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="APP_PASSWORD"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "#0D1117",
                      border: "1px solid #30363D",
                      borderRadius: 2,
                      color: "#E6EDF3",
                      fontSize: 13,
                      fontFamily: "monospace",
                      padding: "8px 10px",
                      marginBottom: 12,
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000 or backup code"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "#0D1117",
                      border: "1px solid #30363D",
                      borderRadius: 2,
                      color: "#E6EDF3",
                      fontSize: 13,
                      fontFamily: "monospace",
                      padding: "8px 10px",
                      marginBottom: 12,
                    }}
                  />
                )}
                {error && (
                  <p
                    className="font-mono"
                    style={{ color: "#F85149", fontSize: 12, marginBottom: 12 }}
                  >
                    ! {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting || (needsCode ? !code : !password)}
                  style={{
                    width: "100%",
                    background: "#1F6FEB",
                    color: "white",
                    border: "none",
                    borderRadius: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 0",
                    cursor: submitting || (needsCode ? !code : !password) ? "default" : "pointer",
                    opacity: submitting || (needsCode ? !code : !password) ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Verifying…" : "Enter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
