import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, BotMessageSquare, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { AiWanderer } from "@/components/ai-wanderer";
import { getBotSkin, type BotSkinId } from "@/lib/bot-skins";
import { MonoLabel } from "@/components/primitives";
import {
  StreamingProgress,
  StreamingReducedCapacity,
  StreamingCut,
  StreamingError,
  QueuedPromptChip,
} from "@/components/ai-coach/streaming-meta";

// ── Types ─────────────────────────────────────────────────────────────────────

// Model messages grow token-by-token as the stream progresses. The
// caption field carries real server-side progress state ("Reading your
// accounts", "Asking Groq", "Groq failed → trying Cerebras") — never
// fabricated "thinking…" text. If no data field is set, don't render.
type MessageStatus = "streaming" | "done" | "cut" | "error";

interface Message {
  role: "user" | "model";
  text: string;
  status?: MessageStatus;
  caption?: string;              // real progress caption from server
  servingProvider?: string | null;
  reducedCapacity?: boolean;
  cutReason?: string;
  errorMessage?: string;
}

export type AiStyle = "classic" | "wanderer" | "minimal";

const STYLE_KEY = "numeris-ai-style";
const HOTKEY = "g"; // press G (not inside input) to summon

// ── Page labels — display only ─────────────────────────────────────────────
// Displayed under the header so the user sees which page context the
// AI is using. The actual context is BUILT SERVER-SIDE from the
// authenticated user's own data — the client no longer assembles or
// posts financial state. Only the `path` string is sent.
//
// The old client-side buildContext(path) shipped one sentence ("the
// user is on X") which was almost useless and lived next to the very
// code that would have been tempted to grow into "the user is on X
// and their net worth is £Y" — a leak vector by attractive nuisance.
// Removed 2026-08-23. See lib/ai-context.ts.

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
  "/settings":     "Settings — app configuration",
};

// ── API ───────────────────────────────────────────────────────────────────────

// SSE streaming + no-data watchdog lives in a shared module so this
// component and pages/ai-coach.tsx use exactly the same wire contract
// and both benefit from the watchdog + honest error messages.
import { streamChat, type ChatServerEvent } from "@/lib/ai-chat-client";
import { apiFetch } from "@/lib/api-fetch";

// API_BASE removed — /api requests route through apiFetch, which handles
// both the web (relative) and native (VITE_NATIVE_API_URL) cases and
// attaches the bearer token on native. See lib/api-fetch.ts + G13 · 3/5.

// ── Skin-specific sling box themes ────────────────────────────────────────────

const SLING_SKIN: Record<BotSkinId, {
  border: string; bg: string; headerBg: string; headerBorder: string;
  titleText: string; titleColor: string; iconColor: string;
  shadow: string; tailColor: string; tag: string;
}> = {
  ix: {
    border: "1px solid var(--ft-border2)", bg: "var(--ft-surface)",
    headerBg: "var(--ft-raised)", headerBorder: "var(--ft-border)",
    titleText: "AI Coach", titleColor: "var(--ft-text)",
    iconColor: "var(--ft-accent)", shadow: "0 12px 48px rgba(0,0,0,0.7)",
    tailColor: "var(--ft-border2)", tag: "Powered by Groq",
  },
  mario: {
    border: "3px solid #e3170a", bg: "#0d0400",
    headerBg: "#1f0800", headerBorder: "#e3170a",
    titleText: "IT'S-A ME! Finance AI", titleColor: "#f7c948",
    iconColor: "#f7c948", shadow: "0 12px 48px rgba(0,0,0,0.85), 0 0 0 1px #f7c94822",
    tailColor: "#e3170a", tag: "Let's-a go!",
  },
  gilded: {
    border: "2px solid #c9922a", bg: "#0e0a02",
    headerBg: "#1c1205", headerBorder: "#c9922a",
    titleText: "Gilded Financial Oracle", titleColor: "#d4a017",
    iconColor: "#d4a017", shadow: "0 12px 48px rgba(0,0,0,0.8), 0 0 24px rgba(201,146,42,0.2)",
    tailColor: "#c9922a", tag: "Wealth Management",
  },
  bloodline: {
    border: "2px solid #8b0000", bg: "#060101",
    headerBg: "#120000", headerBorder: "#8b0000",
    titleText: "Bloodline Oracle", titleColor: "#c0392b",
    iconColor: "#c0392b", shadow: "0 12px 48px rgba(0,0,0,0.92), 0 0 24px rgba(139,0,0,0.35)",
    tailColor: "#8b0000", tag: "Dark Market Intelligence",
  },
};

// ── Chat panel (shared across all styles) ────────────────────────────────────

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  style: AiStyle;
  anchorBottom?: number;
  anchorRight?: number;
  wandererPos?: { x: number; y: number } | null;
}

function ChatPanel({ open, onClose, style, anchorBottom = 72, anchorRight = 20, wandererPos }: ChatPanelProps) {
  const [location] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // Queue of user prompts typed while a stream is in flight. Sent
  // FIFO once the current stream ends. Rendered as a small pill list
  // above the input so the user sees what's queued and can't wonder
  // whether their message was dropped.
  const [pending, setPending] = useState<string[]>([]);
  const streaming = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, open]);

  // Handle one server event by mutating the last model message in the
  // list. We use functional setMessages so state updates arriving
  // during React 18's automatic batching still compose correctly.
  const applyEvent = useCallback((event: ChatServerEvent) => {
    setMessages((prev) => {
      const next = [...prev];
      // The last message is the streaming model bubble we just added.
      const idx = next.length - 1;
      if (idx < 0 || next[idx].role !== "model") return prev;
      const m = { ...next[idx] };
      if (event.type === "progress") {
        m.caption = event.detail;
      } else if (event.type === "attempt") {
        m.caption = `Asking ${event.provider}`;
      } else if (event.type === "fallthrough") {
        m.caption = `${event.from} failed → trying ${event.to}`;
      } else if (event.type === "token") {
        m.text = (m.text ?? "") + event.text;
        // Once tokens are arriving, drop the progress caption — the
        // text itself is the progress signal.
        m.caption = undefined;
      } else if (event.type === "done") {
        m.status = "done";
        m.servingProvider = event.servingProvider;
        m.reducedCapacity = event.reducedCapacity;
        m.caption = undefined;
      } else if (event.type === "cut") {
        m.status = "cut";
        m.servingProvider = event.servingProvider;
        m.cutReason = event.reason;
        m.caption = undefined;
      } else if (event.type === "error") {
        m.status = "error";
        m.errorMessage = event.message;
        m.caption = undefined;
      }
      next[idx] = m;
      return next;
    });
  }, []);

  // Drive one prompt through the stream — used by handleSend AND by
  // the pending-queue drain when a previous stream completes.
  const runPrompt = useCallback(async (prompt: string, history: Message[]) => {
    streaming.current = true;
    // Open a fresh model bubble in the streaming state. The stream
    // callback will mutate this specific bubble via applyEvent.
    setMessages([...history, { role: "user", text: prompt }, { role: "model", text: "", status: "streaming" }]);
    const nextHistory: Message[] = [...history, { role: "user", text: prompt }];
    await streamChat(nextHistory, location, {
      onEvent: applyEvent,
      onError: (message) => applyEvent({ type: "error", message }),
    });
    streaming.current = false;
  }, [applyEvent, location]);

  // Drain queue after each stream ends. Effect re-runs when pending
  // grows OR when messages settle — the ref guard prevents concurrent
  // drains if a fast follow-up arrives just as one stream ends.
  useEffect(() => {
    if (streaming.current) return;
    if (pending.length === 0) return;
    // Only drain when the last stream is in a terminal state.
    const last = messages[messages.length - 1];
    if (last && last.role === "model" && last.status === "streaming") return;
    const [nextPrompt, ...rest] = pending;
    setPending(rest);
    void runPrompt(nextPrompt, messages);
  }, [pending, messages, runPrompt]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    // If a stream is already running, enqueue and let the effect
    // drain when it completes. Input stays live either way.
    if (streaming.current) {
      setPending((q) => [...q, text]);
      return;
    }
    void runPrompt(text, messages);
  }, [input, messages, runPrompt]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!open) return null;

  const isCenter = style === "minimal";
  const isWandererSling = style === "wanderer" && wandererPos != null;
  const skin = isWandererSling ? getBotSkin() : "ix";
  const sk = SLING_SKIN[skin];

  // Compute sling box position — bubble slings out above+left of character
  let slingStyle: React.CSSProperties = {};
  let tailStyle: React.CSSProperties = {};
  if (isWandererSling && wandererPos) {
    const panelW = Math.min(400, window.innerWidth * 0.88);
    const panelH = Math.min(460, window.innerHeight * 0.62);
    // Position bubble above and to the left of the character
    let left = wandererPos.x - panelW - 16;
    if (left < 8) left = Math.min(wandererPos.x + 48, window.innerWidth - panelW - 8);
    let top = wandererPos.y - panelH - 8;
    if (top < 8) top = 8;
    slingStyle = { left, top, width: panelW, maxHeight: panelH };
    // Position the tail at the bottom of the bubble pointing to character
    tailStyle = {
      position: "absolute",
      bottom: -10, right: left < wandererPos.x - panelW - 10 ? 16 : "auto",
      left: left >= wandererPos.x + 48 ? 24 : "auto",
      width: 0, height: 0,
      borderLeft: "10px solid transparent",
      borderRight: "10px solid transparent",
      borderTop: `10px solid ${sk.tailColor}`,
      zIndex: 1,
    };
  }

  return (
    <div style={{
      position: "fixed",
      zIndex: 9998,
      ...(isWandererSling ? {
        ...slingStyle,
        animation: "sling-in 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards",
      } : isCenter ? {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(480px, 92vw)",
        maxHeight: "70vh",
        animation: "bot-appear 0.12s ease-out forwards",
      } : {
        bottom: anchorBottom,
        right: anchorRight,
        width: 360,
        maxHeight: 520,
        animation: "bot-appear 0.12s ease-out forwards",
      }),
      background: isWandererSling ? sk.bg : "var(--ft-surface)",
      // Wanderer skins keep their character-shaped border. Default
      // panel is a plain hairline frame, no box-shadow (constitution —
      // data surfaces). No accent stripe: the frame is the identity.
      border: isWandererSling ? sk.border : "1px solid var(--ft-border2)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {isWandererSling && <div style={tailStyle} />}
      {/* ── Header ── hairline structure, mono type ladder ── */}
      <div style={{
        background: isWandererSling ? sk.headerBg : "var(--ft-raised)",
        borderBottom: `1px solid ${isWandererSling ? sk.headerBorder : "var(--ft-border)"}`,
        padding: "8px 12px",
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        flexShrink: 0,
      }}>
        <span aria-hidden style={{ color: isWandererSling ? sk.iconColor : "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1 }}>◇</span>
        <MonoLabel size={10} color={isWandererSling ? sk.titleColor : "var(--ft-text)"} letterSpacing="0.14em">
          {isWandererSling ? sk.titleText : "AI Coach"}
        </MonoLabel>
        <MonoLabel size={9} color="var(--ft-muted)" letterSpacing="0.1em">
          · {isWandererSling ? sk.tag : "GROQ · CEREBRAS · OPENROUTER"}
        </MonoLabel>
        <button
          onClick={onClose}
          aria-label="Close AI Coach"
          style={{
            marginLeft: "auto", background: "none", border: "none",
            cursor: "pointer", color: "var(--ft-muted)", padding: "2px 4px",
            display: "flex", alignSelf: "center",
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* ── Context strip — page label ── */}
      <div style={{
        background: "var(--ft-base)",
        borderBottom: "1px solid var(--ft-border)",
        padding: "5px 12px",
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        flexShrink: 0,
      }}>
        <MonoLabel size={8} color="var(--ft-dim)" letterSpacing="0.14em">CONTEXT</MonoLabel>
        <MonoLabel size={9} color="var(--ft-muted)">{PAGE_LABELS[location] ?? location}</MonoLabel>
      </div>

      {/* ── Message list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && <EmptyState location={location} onPick={(prompt) => { setInput(prompt); setTimeout(() => inputRef.current?.focus(), 10); }} />}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {/* Queued follow-ups — typed while streaming, sent in turn. */}
        {pending.map((q, i) => (
          <QueuedPromptChip key={`pending-${i}`} text={q} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Input — stays live during streams ── */}
      <div style={{ borderTop: "1px solid var(--ft-border)", padding: "8px", display: "flex", gap: 6, background: "var(--ft-raised)", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={streaming.current ? "Ask a follow-up (queued while replying)…" : "Ask about your finances…"}
          style={{
            flex: 1, resize: "none",
            fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5,
            background: "var(--ft-surface)", border: "1px solid var(--ft-border2)",
            color: "var(--ft-text)", padding: "6px 8px", outline: "none", borderRadius: 2,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label={streaming.current ? "Queue follow-up (Enter)" : "Send (Enter)"}
          style={{
            width: 36, height: 36, alignSelf: "flex-end", flexShrink: 0,
            background: input.trim() ? "var(--ft-accent)" : "var(--ft-raised)",
            color: input.trim() ? "var(--ft-base)" : "var(--ft-muted)",
            border: `1px solid ${input.trim() ? "var(--ft-accent)" : "var(--ft-border2)"}`,
            cursor: input.trim() ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 2,
          }}
        >
          <Send style={{ width: 13, height: 13 }} />
        </button>
      </div>

      <style>{`
        @keyframes sling-in { 0%{opacity:0;transform:scale(0.7) translateY(12px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes bot-appear { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ── Empty state (floating panel) ─────────────────────────────────────────
// Small, compact. Three tap-to-fill example prompts scoped to the
// current page — the coach page has a richer data-grounded variant
// (see EmptyStateSuggestions in pages/ai-coach.tsx). Here we keep
// the panel light because the floating surface is transient.
const PAGE_STARTERS: Record<string, string[]> = {
  "/":              ["How am I doing this month?", "What changed since last month?", "Any red flags in my spending?"],
  "/accounts":      ["Which account has the most idle cash?", "Am I over-concentrated in one currency?"],
  "/transactions":  ["Anything unusual in the last week?", "Which category grew fastest?"],
  "/budget":        ["Which budget is most at risk?", "How can I claw back this month?"],
  "/goals":         ["Am I on pace for my goals?", "Which goal needs the most work?"],
  "/owing":         ["Who owes me the most?", "Who should I settle up with first?"],
  "/investments":   ["Any concentration risk?", "How is my portfolio balanced?"],
  "/subscriptions": ["Which subscriptions cost most per year?", "Which look inactive?"],
};
const DEFAULT_STARTERS = ["How am I doing this month?", "Can I afford a £500 spend this week?", "What changed since last month?"];

function EmptyState({ location, onPick }: { location: string; onPick: (prompt: string) => void }) {
  const starters = PAGE_STARTERS[location] ?? DEFAULT_STARTERS;
  return (
    <div style={{ padding: "20px 4px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <MonoLabel size={9} color="var(--ft-dim)" letterSpacing="0.14em">READY</MonoLabel>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", lineHeight: 1.5 }}>
          Ask about your finances. I read your accounts, budgets and goals server-side.
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <MonoLabel size={8} color="var(--ft-dim)" letterSpacing="0.14em">TRY</MonoLabel>
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            style={{
              textAlign: "left",
              padding: "8px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-text)",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              cursor: "pointer",
              lineHeight: 1.5,
              borderRadius: 2,
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────
// Terminal-styled hairline rect (2px radius, not pill). User right,
// model left. Alignment, background and the COACH tag mark role. Streaming captions +
// reduced-capacity + cut + error render inside via shared visuals.
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row" }}>
      <div style={{
        maxWidth: "86%",
        background: isUser ? "var(--ft-raised)" : "var(--ft-surface)",
        color: "var(--ft-text)",
        padding: "8px 11px",
        border: "1px solid var(--ft-border)",
        borderRadius: 2,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {/* Role tag — small mono glyph, tabular. */}
        {!isUser && (
          <div style={{ marginBottom: 4 }}>
            <MonoLabel size={8} color="var(--ft-dim)" letterSpacing="0.14em">COACH</MonoLabel>
          </div>
        )}

        {/* Progress caption before tokens arrive, or between last token and done. */}
        {msg.status === "streaming" && msg.caption && (
          <div style={{ marginBottom: msg.text ? 6 : 0 }}>
            <StreamingProgress caption={msg.caption} />
          </div>
        )}

        {/* Body text (grows token by token). */}
        {msg.text && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.65 }}>
            {msg.text}
          </div>
        )}

        {/* Empty streaming state — no caption, no tokens yet. */}
        {msg.status === "streaming" && !msg.caption && !msg.text && (
          <StreamingProgress caption="Starting…" />
        )}

        {/* Terminal meta strips. */}
        {msg.status === "done" && msg.reducedCapacity && msg.servingProvider && (
          <StreamingReducedCapacity provider={msg.servingProvider} />
        )}
        {msg.status === "cut" && msg.servingProvider && (
          <StreamingCut provider={msg.servingProvider} reason={msg.cutReason ?? "unknown"} />
        )}
        {msg.status === "error" && (
          <StreamingError message={msg.errorMessage ?? "AI temporarily unavailable."} />
        )}
      </div>
    </div>
  );
}

// ── Main AiAgent ──────────────────────────────────────────────────────────────

export function AiAgent({ sidebarW }: { sidebarW?: number }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [wandererPos, setWandererPos] = useState<{ x: number; y: number } | null>(null);
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
    apiFetch("/api/ai/status", { credentials: "include" })
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
        <AiWanderer
          onOpen={(bx?: number, by?: number) => {
            if (bx != null && by != null) setWandererPos({ x: bx, y: by });
            setOpen(true);
          }}
          summoned={summoned}
          locationKey={location}
          sidebarW={sidebarW}
        />
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
          title={`${open ? "Close" : "Open"} AI Coach (G)`}
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
        wandererPos={aiStyle === "wanderer" ? wandererPos : null}
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
