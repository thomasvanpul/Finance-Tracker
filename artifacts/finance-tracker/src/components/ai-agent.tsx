import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2, BotMessageSquare } from "lucide-react";

interface Message {
  role: "user" | "model";
  text: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function sendChat(messages: Message[]): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to get response");
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export function AiAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/ai/status`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { available: boolean }) => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    const next: Message[] = [...messages, { role: "user", text }];
    setMessages(next);
    setLoading(true);
    try {
      const reply = await sendChat(next);
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (available === false) return null;

  return (
    <>
      {/* Floating trigger */}
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
        title={open ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {open ? <X className="w-4 h-4" /> : <BotMessageSquare className="w-4 h-4" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 72, right: 20, zIndex: 9998,
          width: 360, maxHeight: 520,
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border2)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)",
            padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
          }}>
            <BotMessageSquare style={{ width: 14, height: 14, color: "var(--ft-accent)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-text)" }}>
              AI Financial Assistant
            </span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)" }}>
              Powered by Gemini
            </span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <MessageSquare style={{ width: 32, height: 32, color: "var(--ft-border2)", margin: "0 auto 10px" }} />
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.6 }}>
                  Ask me anything about your finances — budgeting, investments, tax, savings goals, or financial concepts.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                gap: 8, alignItems: "flex-start",
              }}>
                <div style={{
                  maxWidth: "82%",
                  background: msg.role === "user" ? "var(--ft-accent)" : "var(--ft-raised)",
                  color: msg.role === "user" ? "var(--ft-base)" : "var(--ft-text)",
                  padding: "8px 10px",
                  fontSize: 12, lineHeight: 1.55,
                  border: "1px solid",
                  borderColor: msg.role === "user" ? "var(--ft-accent)" : "var(--ft-border2)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--ft-raised)", width: "fit-content", border: "1px solid var(--ft-border2)" }}>
                <Loader2 style={{ width: 12, height: 12, color: "var(--ft-accent)", animation: "spin 1s linear infinite" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>Thinking…</span>
              </div>
            )}
            {error && (
              <div style={{ padding: "6px 10px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--ft-red)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: "1px solid var(--ft-border)", padding: "8px", display: "flex", gap: 6, background: "var(--ft-raised)" }}>
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder="Ask about budgeting, investing, tax…"
              style={{
                flex: 1, resize: "none", fontFamily: "var(--font-sans)", fontSize: 12,
                background: "var(--ft-surface)", border: "1px solid var(--ft-border2)",
                color: "var(--ft-text)", padding: "6px 8px", lineHeight: 1.5,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, alignSelf: "flex-end",
                background: input.trim() && !loading ? "var(--ft-accent)" : "var(--ft-border2)",
                color: input.trim() && !loading ? "var(--ft-base)" : "var(--ft-muted)",
                border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.1s",
                flexShrink: 0,
              }}
            >
              <Send style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
