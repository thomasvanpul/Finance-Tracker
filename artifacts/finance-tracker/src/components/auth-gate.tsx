import { useEffect, useState } from "react";

// Minimal password gate matching the backend's single shared-password auth.
// Not per-user auth — just enough to keep a public URL from being wide open.

type Status = "checking" | "authed" | "unauthed";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setStatus("authed");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Incorrect password");
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
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1117",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            background: "#161B22",
            border: "1px solid #30363D",
            borderRadius: 4,
            padding: 32,
            width: 320,
          }}
        >
          <h1 style={{ color: "#E6EDF3", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            Fintrack
          </h1>
          <p style={{ color: "#6E7681", fontSize: 12, marginBottom: 20 }}>
            Enter password to continue
          </p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#0D1117",
              border: "1px solid #30363D",
              borderRadius: 2,
              color: "#E6EDF3",
              fontSize: 13,
              padding: "8px 10px",
              marginBottom: 12,
            }}
          />
          {error && <p style={{ color: "#F85149", fontSize: 12, marginBottom: 12 }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            style={{
              width: "100%",
              background: "#1F6FEB",
              color: "white",
              border: "none",
              borderRadius: 2,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 0",
              cursor: submitting || !password ? "default" : "pointer",
              opacity: submitting || !password ? 0.6 : 1,
            }}
          >
            {submitting ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
