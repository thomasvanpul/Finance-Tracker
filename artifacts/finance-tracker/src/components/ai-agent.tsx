import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Loader2, BotMessageSquare, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { AiWanderer } from "@/components/ai-wanderer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "model";
  text: string;
}

export type AiStyle = "classic" | "wanderer" | "minimal";

const STYLE_KEY = "numeris-ai-style";
const HOTKEY = "g"; // press G (not inside input) to summon

// ── Page context ──────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  "/":             "Dashboard — financial overview with key metrics",
  "/accounts":     "Accounts — bank accounts and balances",
  "/transactions": "Transactions — income and expense history",
  "/budget":       "Budget — monthly spending limits by category",
  "/goals":        "Goals — savings targets and progress",
  "/owing":        "Debts — IOUs and money owed",
  "/investments":  "Investments — portfolio holdings and performance",
  "/net-worth":    "Net Worth — assets vs liabilities over time",
  "/subscriptions":"Subscriptions — recurring bills and memberships",
  "/calendar":     "Calendar — upcoming financial events",
  "/analytics":    "Analytics — spending patterns and insights",
  "/health-score": "Health Score — financial health rating",
  "/tax":          "Tax — tax estimates and records",
  "/learn":        "Learn — financial education hub",
  "/settings":     "Settings — app configuration",
};

function buildContext(path: string): string {
  const page = PAGE_LABELS[path] ?? `Page: ${path}`;
  return `The user is currently on: ${page}. Tailor your response to be relevant to this context when appropriate.`;
}

// ── API ───────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_URL ?? "");

async function sendChat(messages: Message[], context: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to get response");
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

// ── Chat panel (shared across all styles) ────────────────────────────────────

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  style: AiStyle;
  anchorBottom?: number;
  anchorRight?: number;
}

function ChatPanel({ open, onClose, style, anchorBottom = 72, anchorRight = 20 }: ChatPanelProps) {
  const [location] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, open]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const next: Message[] = [...messages, { role: "user", text }];
    setMessages(next);
    setLoading(true);
    try {
      const reply = await sendChat(next, buildContext(location));
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, location]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!open) return null;

  const isCenter = style === "minimal" || style === "wanderer";

  return (
    <div style={{
      position: "fixed",
      zIndex: 9998,
      ...(isCenter ? {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(480px, 92vw)",
        maxHeight: "70vh",
      } : {
        bottom: anchorBottom,
        right: anchorRight,
        width: 360,
        maxHeight: 520,
      }),
      background: "var(--ft-surface)",
      border: "1px solid var(--ft-border2)",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "var(--ft-raised)",
        borderBottom: "1px solid var(--ft-border)",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}>
        <Sparkles style={{ width: 13, height: 13, color: "var(--ft-accent)", flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          AI Financial Assistant
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", marginLeft: 4 }}>
          Powered by Gemini
        </span>
        <button
          onClick={onClose}
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ft-muted)", padding: 2, display: "flex" }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* Page context indicator */}
      <div style={{
        background: "var(--ft-base)",
        borderBottom: "1px solid var(--ft-border)",
        padding: "4px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--ft-muted)",
        flexShrink: 0,
      }}>
        Context: {PAGE_LABELS[location] ?? location}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 16px" }}>
            <Sparkles style={{ width: 28, height: 28, color: "var(--ft-border2)", margin: "0 auto 10px" }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.7, margin: 0 }}>
              Ask me anything about your finances.
              <br />Budgeting · investments · tax · goals.
            </p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-border2)", marginTop: 8 }}>
              I know which page you're on and can give contextual advice.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 8, alignItems: "flex-start" }}>
            <div style={{
              maxWidth: "84%",
              background: msg.role === "user" ? "var(--ft-accent)" : "var(--ft-raised)",
              color: msg.role === "user" ? "var(--ft-base)" : "var(--ft-text)",
              padding: "8px 11px",
              fontSize: 12,
              lineHeight: 1.6,
              border: "1px solid",
              borderColor: msg.role === "user" ? "var(--ft-accent)" : "var(--ft-border2)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              borderRadius: 0,
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--ft-raised)", width: "fit-content", border: "1px solid var(--ft-border2)" }}>
            <Loader2 style={{ width: 11, height: 11, color: "var(--ft-accent)", animation: "ai-spin 1s linear infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>Thinking…</span>
          </div>
        )}
        {error && (
          <div style={{ padding: "6px 10px", background: "rgba(248,113,113,0.08)", border: "1px solid var(--ft-red)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid var(--ft-border)", padding: "8px", display: "flex", gap: 6, background: "var(--ft-raised)", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
          placeholder="Ask about your finances…"
          style={{
            flex: 1, resize: "none", fontFamily: "var(--font-sans)", fontSize: 12,
            background: "var(--ft-surface)", border: "1px solid var(--ft-border2)",
            color: "var(--ft-text)", padding: "6px 8px", lineHeight: 1.5, outline: "none", borderRadius: 0,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            width: 36, height: 36, alignSelf: "flex-end", flexShrink: 0,
            background: input.trim() && !loading ? "var(--ft-accent)" : "var(--ft-border2)",
            color: input.trim() && !loading ? "var(--ft-base)" : "var(--ft-muted)",
            border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.1s",
          }}
        >
          <Send style={{ width: 13, height: 13 }} />
        </button>
      </div>

      <style>{`@keyframes ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main AiAgent ──────────────────────────────────────────────────────────────

export function AiAgent() {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [aiStyle, setAiStyle] = useState<AiStyle>(() => {
    try {
      const v = localStorage.getItem(STYLE_KEY);
      if (v === "classic" || v === "wanderer" || v === "minimal") return v;
    } catch { /* ignore */ }
    return "classic";
  });
  const [summoned, setSummoned] = useState(false);
  const summonedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep style in sync with localStorage (settings page can change it)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STYLE_KEY) return;
      const v = e.newValue;
      if (v === "classic" || v === "wanderer" || v === "minimal") setAiStyle(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Also poll localStorage for same-tab changes (settings page)
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const v = localStorage.getItem(STYLE_KEY);
        if (v === "classic" || v === "wanderer" || v === "minimal") {
          setAiStyle((prev) => (prev !== v ? (v as AiStyle) : prev));
        }
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Check availability
  useEffect(() => {
    fetch(`${API_BASE}/api/ai/status`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { available: boolean }) => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, []);

  // Global hotkey: G (when not focused in input/textarea/select)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key.toLowerCase() === HOTKEY) {
        e.preventDefault();
        if (aiStyle === "wanderer" && !open) {
          setSummoned(true);
          clearTimeout(summonedTimerRef.current);
          summonedTimerRef.current = setTimeout(() => setSummoned(false), 100);
        } else {
          setOpen((o) => !o);
        }
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [aiStyle, open]);

  if (available === false) return null;

  return (
    <>
      {/* Wanderer style */}
      {aiStyle === "wanderer" && (
        <AiWanderer onOpen={() => setOpen(true)} summoned={summoned} />
      )}

      {/* Classic style — bottom-right button */}
      {aiStyle === "classic" && (
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 9999,
            width: 44, height: 44, borderRadius: "50%",
            background: open ? "var(--ft-raised)" : "var(--ft-accent)",
            border: `1px solid ${open ? "var(--ft-border2)" : "var(--ft-accent)"}`,
            color: open ? "var(--ft-muted)" : "var(--ft-base)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            transition: "background 0.15s, color 0.15s",
          }}
          title={`${open ? "Close" : "Open"} AI Assistant (G)`}
        >
          {open ? <X className="w-4 h-4" /> : <BotMessageSquare className="w-4 h-4" />}
        </button>
      )}

      {/* Minimal style — no persistent trigger, just hotkey label */}
      {aiStyle === "minimal" && !open && (
        <div style={{
          position: "fixed", bottom: 14, right: 14, zIndex: 9990,
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--ft-border2)", letterSpacing: "0.06em",
          pointerEvents: "none",
        }}>
          Press G for AI
        </div>
      )}

      {/* Chat panel */}
      <ChatPanel
        open={open}
        onClose={() => setOpen(false)}
        style={aiStyle}
        anchorBottom={aiStyle === "classic" ? 72 : undefined}
        anchorRight={aiStyle === "classic" ? 20 : undefined}
      />
    </>
  );
}

// ── Exports for settings page ─────────────────────────────────────────────────

export function getAiStyle(): AiStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    if (v === "classic" || v === "wanderer" || v === "minimal") return v as AiStyle;
  } catch { /* ignore */ }
  return "classic";
}

export function setAiStylePref(style: AiStyle) {
  try { localStorage.setItem(STYLE_KEY, style); } catch { /* ignore */ }
}
