import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "var(--ft-base)", color: "var(--ft-red)", padding: 32, fontFamily: "monospace", minHeight: "100vh" }}>
          <div style={{ marginBottom: 8, color: "#F4A21E", fontSize: 14 }}>! RENDER ERROR</div>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{String(this.state.error)}</pre>
          <pre style={{ fontSize: 10, color: "var(--ft-dim)", marginTop: 8, whiteSpace: "pre-wrap" }}>
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// In production, point directly at Railway. In dev, leave base URL empty so
// requests go through the Vite proxy (/api → Railway) which handles cookies correctly.
if (!import.meta.env.DEV && import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL as string);
}

// Apply stored accent override synchronously before first render to avoid FOUC
try {
  const acc = localStorage.getItem("nr-accent-override");
  if (acc) document.documentElement.style.setProperty("--ft-accent", acc);
} catch { /* ignore */ }

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
