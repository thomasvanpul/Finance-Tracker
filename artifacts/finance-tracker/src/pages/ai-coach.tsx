import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Send, Loader2, BotMessageSquare, Sparkles, RotateCcw, TrendingDown, Target, PiggyBank, AlertTriangle, Zap, TrendingUp, BarChart2, Flame, Shield, Users } from "lucide-react";
import { useListTransactions, useListAccounts, useGetDashboard, useListBudgets, useGetInvestmentSummary, useListGoals, useListInvestments } from "@workspace/api-client-react";
import { apiFetch } from "@/lib/api-fetch";
import { formatBaseMoney } from "@/lib/utils";
import { PERSONAS, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { PageHeader } from "@/components/page-header";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

// Model messages grow token-by-token from the SSE stream. `caption`
// carries the real server-side progress state (never fabricated) so
// the coach shows "Reading your accounts" / "Asking Groq" rather
// than a dead spinner. See lib/ai-chat-client.ts for the wire format
// and lib/ai-context.ts for the source of progress events.
type MessageStatus = "streaming" | "done" | "cut" | "error";

interface Message {
  role: "user" | "model";
  text: string;
  status?: MessageStatus;
  caption?: string;
  servingProvider?: string | null;
  reducedCapacity?: boolean;
  cutReason?: string;
  errorMessage?: string;
}

// ── API ───────────────────────────────────────────────────────────────────────
// Shared streaming client. This page used to have its own sendChat +
// client-side buildSpendingContext — the second copy of the exact
// leak vector ai-agent.tsx already closed. Both surfaces now go
// through the same server-side context assembly (lib/ai-context.ts),
// so nothing here posts financial data up.

import { streamChat, type ChatServerEvent } from "@/lib/ai-chat-client";
import {
  StreamingProgress,
  StreamingReducedCapacity,
  StreamingCut,
  StreamingError,
  QueuedPromptChip,
} from "@/components/ai-coach/streaming-meta";

// (buildSpendingContext was here — a client-side assembler that shipped
// the user's finances up in the request body. Removed 2026-08-23 along
// with the same pattern in ai-agent.tsx. The server now builds
// context from the authenticated user's own rows via lib/ai-context.ts.
// SmartInsights below still uses local data — but only to render
// prompt suggestions in the sidebar, never to build a payload.)

// ── Suggested prompts — organised by persona ─────────────────────────────────

type Prompt = { icon: React.ElementType; label: string; text: string };

const PROMPTS_BY_PERSONA: Record<PersonaId, Prompt[]> = {
  market: [
    { icon: TrendingUp,   label: "Portfolio vs benchmarks",          text: "Compare my investment portfolio performance vs SPY and major indices. Where am I outperforming or underperforming?" },
    { icon: AlertTriangle,label: "Concentration risk check",          text: "Review my portfolio for concentration risk. Am I over-exposed to any single stock, sector, or geography?" },
    { icon: BarChart2,    label: "Best moves this market cycle",      text: "Based on my current holdings and the market environment, what portfolio adjustments should I consider?" },
    { icon: Sparkles,     label: "What's my alpha?",                  text: "Calculate my approximate alpha vs S&P 500. Am I adding value with my stock selection, or should I consider index funds?" },
    { icon: Target,       label: "Dividend income potential",         text: "Analyze my portfolio for dividend income opportunities. Which positions pay dividends, and how can I increase yield?" },
    { icon: Shield,       label: "Downside protection",              text: "How exposed is my portfolio to a 20% market downturn? What defensive positions should I consider?" },
  ],
  budget: [
    { icon: TrendingDown, label: "Where am I overspending?",         text: "Based on my spending data, where am I overspending compared to my budgets? Give me specific actionable advice." },
    { icon: Sparkles,     label: "Spending trends this month",       text: "Compare my spending this month vs last month. Which categories increased or decreased? What does this pattern say about my habits?" },
    { icon: PiggyBank,    label: "How can I save more?",             text: "Looking at my income and expenses, how can I realistically increase my savings rate? Give me 3 concrete steps I can start today." },
    { icon: Target,       label: "30-day spending challenge",         text: "Design a personalised 30-day spending challenge based on my weakest budget categories. Make it challenging but achievable." },
    { icon: Zap,          label: "Subscriptions audit",              text: "Based on my recurring charges, which subscriptions are worth keeping and which should I cancel? Estimate annual savings." },
    { icon: AlertTriangle,label: "Any financial red flags?",         text: "Review my financial data and flag any concerning spending patterns or risks I should address immediately." },
  ],
  wealth: [
    { icon: Target,       label: "Am I on track for FIRE?",           text: "Based on my current savings rate, net worth, and expenses, am I on track for financial independence? When could I retire?" },
    { icon: TrendingUp,   label: "10-year net worth projection",      text: "Project my net worth in 10 years based on my current savings rate, investment returns, and spending. What levers have the most impact?" },
    { icon: PiggyBank,    label: "Pension & ISA strategy",            text: "Am I maximising my pension and ISA contributions efficiently? What's the optimal split between pension, ISA, and other accounts?" },
    { icon: Shield,       label: "Emergency fund adequacy",           text: "Is my emergency fund sufficient for my lifestyle and risk level? How many months of expenses should I be holding?" },
    { icon: Sparkles,     label: "Tax optimisation",                  text: "Based on my financial situation, what tax-efficient strategies should I be using? (ISA, pension, capital gains allowance, etc.)" },
    { icon: BarChart2,    label: "Wealth building priorities",        text: "Given my goals and current financial picture, what should be my top 3 wealth-building priorities for the next 12 months?" },
  ],
  social: [
    { icon: Users,        label: "Shared expense patterns",          text: "Help me understand my shared expense patterns. Am I spending disproportionately on group activities vs personal expenses?" },
    { icon: TrendingDown, label: "Where am I overspending with friends?", text: "Looking at my social and dining expenses, where am I overspending? What's a realistic monthly social budget for me?" },
    { icon: Sparkles,     label: "Split bill strategy",              text: "What's the fairest approach to splitting expenses in my social circle? How do I bring up financial boundaries without awkwardness?" },
    { icon: AlertTriangle,label: "Any financial red flags?",         text: "Review my financial data and flag any concerning patterns, especially around social spending or shared costs." },
    { icon: PiggyBank,    label: "How can I save more?",             text: "Looking at my income and expenses, how can I realistically increase my savings rate? Give me concrete steps." },
    { icon: Target,       label: "Am I on track for my goals?",      text: "Based on my current savings rate and expenses, am I on track to meet my savings goals? What adjustments should I make?" },
  ],
  full: [
    { icon: TrendingDown, label: "Where am I overspending?",         text: "Based on my spending data, where am I overspending compared to my budgets? Give me specific actionable advice." },
    { icon: Sparkles,     label: "Spending trends this month",       text: "Compare my spending this month vs last month. Which categories increased or decreased? What does this pattern say about my habits?" },
    { icon: PiggyBank,    label: "How can I save more?",             text: "Looking at my income and expenses, how can I realistically increase my savings rate? Give me concrete steps." },
    { icon: Target,       label: "Am I on track for my goals?",      text: "Based on my current savings rate and expenses, am I on track to meet my savings goals? What adjustments should I make?" },
    { icon: AlertTriangle,label: "Any financial red flags?",         text: "Review my financial data and flag any concerning patterns or risks I should address immediately." },
    { icon: TrendingUp,   label: "Review my investment portfolio",   text: "Based on my portfolio value and financial situation, is my investment strategy well-balanced? What should I focus on?" },
  ],
};

const PERSONA_SUBTITLE: Record<PersonaId, string> = {
  market:  "Market & investment analysis powered by Groq",
  budget:  "Spending control & budget advice powered by Groq",
  wealth:  "Long-term wealth planning powered by Groq",
  social:  "Expense & social spending insights powered by Groq",
  full:    "Complete financial analysis powered by Groq",
};

// ── Message renderer ──────────────────────────────────────────────────────────
// Terminal-styled hairline rect (2px radius per constitution). User
// right-aligned with accent left border; coach left-aligned with
// blue left border and a small COACH tag. No per-message avatar,
// no "QUERY #1" label — position + border colour convey role,
// which is the anti-vibe rule against relentless labelling.
//
// Model output uses a small markdown pass (numbered lists, bullets,
// H2s, **bold**) rendered with the same mono/tabular vocabulary the
// rest of the app uses. Streaming states from ai-coach/streaming-meta
// render inside the coach bubble.

function renderMarkdown(text: string): React.ReactNode[] {
  return text
    .split(/\n\n+/)
    .map((para, i) => {
      if (/^\d+\.\s/.test(para)) {
        const items = para.split(/\n/).filter(Boolean);
        return (
          <ol key={i} style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((item, j) => (
              <li key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 18, paddingTop: 2, flexShrink: 0, fontWeight: 700 }}>
                  {String(j + 1).padStart(2, "0")}
                </span>
                <Text as="span" mono size={12}>{item.replace(/^\d+\.\s/, "")}</Text>
              </li>
            ))}
          </ol>
        );
      }
      if (/^[-*•]\s/.test(para)) {
        const items = para.split(/\n/).filter(Boolean);
        return (
          <ul key={i} style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((item, j) => (
              <li key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: "var(--ft-accent)", fontFamily: "var(--font-mono)", marginTop: 3, flexShrink: 0, fontSize: 10 }}>▸</span>
                <Text as="span" mono size={12}>{item.replace(/^[-*•]\s/, "")}</Text>
              </li>
            ))}
          </ul>
        );
      }
      if (/^##\s/.test(para)) {
        return (
          <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "0.14em", textTransform: "uppercase", margin: "10px 0 4px" }}>
            {para.replace(/^##\s/, "")}
          </div>
        );
      }
      const boldified = para.split(/\*\*(.+?)\*\*/g).map((chunk, j) =>
        j % 2 === 1
          ? <strong key={j} style={{ color: "var(--ft-text)", fontWeight: 700 }}>{chunk}</strong>
          : chunk
      );
      return <p key={i} style={{ margin: "6px 0 0", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>{boldified}</p>;
    });
}

function MessageBubble({ msg }: { msg: Message; index: number }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      marginBottom: 14,
    }}>
      <div style={{
        maxWidth: "80%",
        background: isUser ? "var(--ft-raised)" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: `2px solid ${isUser ? "var(--ft-accent)" : "var(--ft-blue)"}`,
        borderRadius: 2,
        padding: "10px 14px",
        color: "var(--ft-text)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {!isUser && (
          <div style={{ marginBottom: 6 }}>
            <MonoLabel as="span" size={8} color="var(--ft-dim)" letterSpacing="0.14em">COACH</MonoLabel>
          </div>
        )}

        {msg.status === "streaming" && msg.caption && (
          <div style={{ marginBottom: msg.text ? 6 : 0 }}>
            <StreamingProgress caption={msg.caption} />
          </div>
        )}

        {msg.text && (
          isUser
            ? <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.65 }}>{msg.text}</div>
            : <div>{renderMarkdown(msg.text)}</div>
        )}

        {msg.status === "streaming" && !msg.caption && !msg.text && (
          <StreamingProgress caption="Starting…" />
        )}

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

// ── Smart insight card ────────────────────────────────────────────────────────

interface SmartInsightItem {
  icon: React.ElementType;
  color: string;
  title: string;
  body: string;
  prompt: string;
}

function SmartInsightCard({
  item,
  loading,
  aiAvailable,
  onSend,
}: {
  item: SmartInsightItem;
  loading: boolean;
  aiAvailable: boolean | null;
  onSend: (prompt: string) => void;
}) {
  const [hov, setHov] = useState(false);
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSend(item.prompt)}
      disabled={loading || aiAvailable === false}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
        background: hov ? "var(--ft-raised)" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: `3px solid ${item.color}`,
        cursor: "pointer", textAlign: "left",
        transition: "background 0.1s",
        width: "100%",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <Icon size={12} style={{ color: item.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", fontWeight: 600 }}>{item.title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>{item.body}</div>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: item.color, letterSpacing: "0.08em", flexShrink: 0 }}>ASK ▸</span>
    </button>
  );
}

// ── Suggested prompt button ───────────────────────────────────────────────────

function SuggestedPromptButton({
  prompt,
  loading,
  aiAvailable,
  onSend,
}: {
  prompt: Prompt;
  loading: boolean;
  aiAvailable: boolean | null;
  onSend: (text: string) => void;
}) {
  const [hov, setHov] = useState(false);
  const Icon = prompt.icon;
  return (
    <button
      type="button"
      onClick={() => onSend(prompt.text)}
      disabled={loading || aiAvailable === false}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
        background: hov ? "var(--ft-raised)" : "var(--ft-surface)",
        border: hov ? "1px solid var(--ft-border)" : "1px solid var(--ft-border2)",
        cursor: "pointer", textAlign: "left",
        transition: "background 0.1s, border-color 0.1s",
        width: "100%",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <Icon size={12} style={{ color: "var(--ft-accent)", flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", flex: 1 }}>{prompt.label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", flexShrink: 0 }}>↵</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AiCoach() {
  const { data: accounts } = useListAccounts();
  const { data: dashData } = useGetDashboard();
  const { data: budgets } = useListBudgets();
  const { data: transactions } = useListTransactions({});
  const { data: investmentSummary } = useGetInvestmentSummary();
  const { data: goals } = useListGoals();
  const { data: investments } = useListInvestments();

  const dashboard = dashData as { netWorth?: number; thisMonth?: { income?: number; expenses?: number; savingsRate?: number } } | undefined;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);

  const topCategories = (() => {
    if (!transactions) return [];
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (!tx.date.startsWith(thisMonth) || tx.type !== "expense") continue;
      if (tx.baseEquivalent == null) continue;
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.baseEquivalent);
    }
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  })();

  const lastMonthCategories = (() => {
    if (!transactions) return [];
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (!tx.date.startsWith(lastMonth) || tx.type !== "expense") continue;
      if (tx.baseEquivalent == null) continue;
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.baseEquivalent);
    }
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  })();

  // Reactive persona (P2·6). Prior code read loadPersonaIds() on
  // mount, so a persona switch mid-session left stale prompts on
  // screen until reload. useActivePersona re-renders on the
  // nr-persona-update event chain (see persona-hook.ts).
  const primaryPersonaId: PersonaId = useActivePersona();
  const primaryPersona = PERSONAS.find(p => p.id === primaryPersonaId);
  const coachSubtitle = PERSONA_SUBTITLE[primaryPersonaId];
  const suggestedPrompts = PROMPTS_BY_PERSONA[primaryPersonaId];

  // primaryPersona is still used elsewhere (subtitle, prompt suggestions).
  // No longer feeds context assembly — that's server-side now.
  void primaryPersona;

  const SESSION_KEY = "nr-ai-coach-msgs";
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const streaming = useRef(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)); } catch { /* noop */ }
  }, [messages]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/ai/status", { credentials: "include", signal: controller.signal })
      .then(r => r.json())
      .then((d: { available: boolean }) => setAiAvailable(d.available))
      .catch((e) => { if (e.name !== "AbortError") setAiAvailable(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Apply one SSE event to the latest model bubble.
  const applyEvent = useCallback((event: ChatServerEvent) => {
    setMessages((prev) => {
      const idx = prev.length - 1;
      if (idx < 0 || prev[idx].role !== "model") return prev;
      const next = [...prev];
      const m: Message = { ...next[idx] };
      if (event.type === "progress") m.caption = event.detail;
      else if (event.type === "attempt") m.caption = `Asking ${event.provider}`;
      else if (event.type === "fallthrough") m.caption = `${event.from} failed → trying ${event.to}`;
      else if (event.type === "token") { m.text = (m.text ?? "") + event.text; m.caption = undefined; }
      else if (event.type === "done") { m.status = "done"; m.servingProvider = event.servingProvider; m.reducedCapacity = event.reducedCapacity; m.caption = undefined; }
      else if (event.type === "cut") { m.status = "cut"; m.servingProvider = event.servingProvider; m.cutReason = event.reason; m.caption = undefined; }
      else if (event.type === "error") { m.status = "error"; m.errorMessage = event.message; m.caption = undefined; }
      next[idx] = m;
      return next;
    });
  }, []);

  const runPrompt = useCallback(async (prompt: string, history: Message[]) => {
    streaming.current = true;
    setMessages([...history, { role: "user", text: prompt }, { role: "model", text: "", status: "streaming" }]);
    const nextHistory: Message[] = [...history, { role: "user", text: prompt }];
    // Send `/ai-coach` as the path so server-side buildChatContext can
    // page-aware its framing. Financial data comes from the DB, not from
    // this page's local state.
    await streamChat(nextHistory, "/ai-coach", {
      onEvent: applyEvent,
      onError: (message) => applyEvent({ type: "error", message }),
    });
    streaming.current = false;
  }, [applyEvent]);

  useEffect(() => {
    if (streaming.current) return;
    if (pending.length === 0) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "model" && last.status === "streaming") return;
    const [nextPrompt, ...rest] = pending;
    setPending(rest);
    void runPrompt(nextPrompt, messages);
  }, [pending, messages, runPrompt]);

  const handleSend = useCallback((text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput("");
    if (streaming.current) {
      setPending((q) => [...q, msg]);
      return;
    }
    void runPrompt(msg, messages);
  }, [input, messages, runPrompt]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Derived state — no separate loading/error refs. streaming.current is
  // a ref that flips inside runPrompt; components that need to react
  // to the streaming state (input placeholder, disabled buttons) read
  // it via the last-message status which lives in React state.
  const lastMessage = messages[messages.length - 1];
  const isStreaming = lastMessage?.role === "model" && lastMessage.status === "streaming";
  const lastError = lastMessage?.role === "model" && lastMessage.status === "error" ? lastMessage.errorMessage : null;

  const reset = () => {
    setMessages([]);
    setPending([]);
    setInput("");
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  };

  const smartInsights = useMemo(() => {
    const items: SmartInsightItem[] = [];

    if (budgets && transactions) {
      const thisM = new Date().toISOString().slice(0, 7);
      const spendMap = new Map<string, number>();
      for (const tx of transactions) {
        if (tx.type !== "expense" || !tx.date.startsWith(thisM)) continue;
        if (tx.baseEquivalent == null) continue;
        spendMap.set(tx.category, (spendMap.get(tx.category) ?? 0) + tx.baseEquivalent);
      }
      for (const b of budgets as Array<{ id: number; category: string; monthlyLimit: number }>) {
        const spent = spendMap.get(b.category) ?? 0;
        const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
        if (pct >= 90) {
          items.push({
            icon: AlertTriangle, color: pct >= 100 ? "var(--ft-red)" : "var(--ft-amber)",
            title: `${b.category} budget ${pct >= 100 ? "exceeded" : "nearly full"}`,
            body: `${formatBaseMoney(spent)} of ${formatBaseMoney(b.monthlyLimit)} used (${pct.toFixed(0)}%)`,
            prompt: `My ${b.category} budget is at ${pct.toFixed(0)}% this month. Help me understand where I'm overspending and how to get back on track.`,
          });
        }
      }
    }

    const sr = (dashData as { thisMonth?: { savingsRate?: number } } | undefined)?.thisMonth?.savingsRate;
    const srIncome = (dashData as { thisMonth?: { income?: number } } | undefined)?.thisMonth?.income;
    if (sr != null && sr < 0.1 && srIncome != null && srIncome > 0) {
      items.push({
        icon: TrendingDown, color: "var(--ft-red)",
        title: "Low savings rate this month",
        body: `${(sr * 100).toFixed(0)}% savings rate — most experts recommend 20%+`,
        prompt: "My savings rate is below 10% this month. What are the most effective ways to increase it based on my spending patterns?",
      });
    }

    if (investments && investmentSummary) {
      const total = (investmentSummary as { totalValueBase: number }).totalValueBase;
      if (total > 0) {
        const byTicker = new Map<string, number>();
        for (const inv of investments as Array<{ ticker: string; baseEquivalent: number }>) {
          byTicker.set(inv.ticker, (byTicker.get(inv.ticker) ?? 0) + inv.baseEquivalent);
        }
        const [topTicker, topVal] = [...byTicker.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
        const pct = (topVal / total) * 100;
        if (pct > 30) {
          items.push({
            icon: TrendingUp, color: "var(--ft-amber)",
            title: `${topTicker} is ${pct.toFixed(0)}% of portfolio`,
            body: "High concentration risk. Consider diversifying.",
            prompt: `My ${topTicker} position is ${pct.toFixed(0)}% of my portfolio. Is this too concentrated? What should I consider?`,
          });
        }
      }
    }

    if (goals) {
      for (const g of goals as Array<{ name: string; target: number; current: number; deadline?: string }>) {
        if (!g.deadline) continue;
        const daysLeft = Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (24 * 3600 * 1000));
        const progress = g.target > 0 ? g.current / g.target : 0;
        if (daysLeft > 0 && daysLeft < 90 && progress < 0.8) {
          items.push({
            icon: Target, color: "var(--ft-amber)",
            title: `Goal "${g.name}" at risk`,
            body: `${(progress * 100).toFixed(0)}% funded, ${daysLeft} days left`,
            prompt: `My goal "${g.name}" is only ${(progress * 100).toFixed(0)}% funded with ${daysLeft} days remaining. What should I prioritise?`,
          });
        }
      }
    }

    return items.slice(0, 4);
  }, [budgets, transactions, dashData, investments, investmentSummary, goals]);

  const isEmpty = messages.length === 0;
  const userMsgCount = messages.filter(m => m.role === "user").length;

  // Compute savings rate color for KPI cell
  const srPct = dashboard?.thisMonth?.savingsRate != null ? dashboard.thisMonth.savingsRate! * 100 : null;
  const srHasIncome = (dashboard?.thisMonth?.income ?? 0) > 0;
  const srColor = srPct == null ? "var(--ft-text)" : !srHasIncome ? "var(--ft-muted)" : srPct >= 20 ? "var(--ft-blue)" : srPct >= 10 ? "var(--ft-amber)" : "var(--ft-red)";
  const srAccent = srColor;
  const srLabel = srPct == null ? "" : !srHasIncome ? "no income yet" : srPct >= 20 ? "on track" : srPct >= 10 ? "below target" : "low";

  // Root: was `height: calc(100vh - 64px)`. The magic 64 guessed
  // the chrome above <main> and got it wrong by 8px, so <main>
  // overflowed by 60px — exactly the composer height at the
  // bottom of this page. The old fix "set <main> to overflow:hidden"
  // would have CLIPPED the composer (rendering the input
  // unreachable), not shrunk the page. Correct fix: flex-shrink
  // into whatever <main> gives us. layout.tsx makes <main> a flex
  // column for /ai-coach via VIEWPORT_LOCKED_ROUTES; here we
  // grow + minHeight0 so the transcript's scroller (:609) is
  // the ONE active vertical scroller on the page.
  return (
    <VStack grow minHeight0>
      <PageHeader
        icon={Sparkles}
        title="AI Coach"
        subtitle={coachSubtitle}
        actions={
          <HStack gap={8} align="center">
            {messages.length > 0 && (
              <Text as="span" mono size={9} color="var(--ft-dim)" letterSpacing="0.05em">
                {userMsgCount} {userMsgCount === 1 ? "query" : "queries"}
              </Text>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", background: "none", border: "1px solid var(--ft-border2)", padding: "4px 10px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", transition: "color 0.15s, border-color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-text)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-border)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ft-dim)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ft-border2)"; }}
              >
                <RotateCcw size={10} /> New Chat
              </button>
            )}
          </HStack>
        }
      />

      {/* AI status banners */}
      {aiAvailable === null && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.04em" }}>
          <Loader2 size={10} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
          Checking AI availability…
        </div>
      )}
      {aiAvailable === false && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "2px solid var(--ft-red)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "baseline", gap: 8 }}>
          <MonoLabel as="span" size={9} color="var(--ft-red)" letterSpacing="0.14em">AI OFFLINE</MonoLabel>
          <span style={{ fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.5 }}>
            No AI provider is currently configured or verified. Check /api/ai/status for the per-provider health (Groq, Cerebras, OpenRouter).
          </span>
        </div>
      )}

      {/* Chat area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px", display: "flex", flexDirection: "column" }}>
        {isEmpty ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, paddingBottom: 40 }}>

            {/* Hero section */}
            <div style={{ textAlign: "center", maxWidth: 440 }}>
              <div style={{
                width: 48, height: 48,
                borderRadius: 3,
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 14px",
              }}>
                <Sparkles size={22} style={{ color: "var(--ft-amber)" }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 6, letterSpacing: "0.02em" }}>
                Your AI Financial Coach
              </div>
              <Text as="div" mono size={10} color="var(--ft-dim)" lineHeight={1.7}>
                {primaryPersona
                  ? `Focused on ${primaryPersona.tagline.toLowerCase()}. I have full access to your spending, budgets, investments, and goals.`
                  : "Ask anything about your finances. I have access to your current month's spending, budgets, and account balances."
                }
              </Text>
            </div>

            {/* Context-loaded KPI strip — border-as-gap grid */}
            {(dashboard?.thisMonth?.income != null || topCategories.length > 0) && (
              <div style={{ width: "100%", maxWidth: 480 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                  Context loaded
                </div>
                <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
                  {dashboard?.thisMonth?.income != null && (
                    <div style={{ background: "var(--ft-surface)", padding: "10px 12px", borderTop: `2px solid ${dashboard.thisMonth.income! > 0 ? "var(--ft-green)" : "var(--ft-border2)"}` }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Income</div>
                      <Text as="div" mono size={15} weight={700} color={dashboard.thisMonth.income! > 0 ? "var(--ft-green)" : "var(--ft-muted)"}>
                        <span className="pnum">{formatBaseMoney(dashboard.thisMonth.income!)}</span>
                      </Text>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>this month</div>
                    </div>
                  )}
                  {dashboard?.thisMonth?.expenses != null && (
                    <div style={{ background: "var(--ft-surface)", padding: "10px 12px", borderTop: `2px solid ${dashboard.thisMonth.expenses! > 0 ? "var(--ft-red)" : "var(--ft-border2)"}` }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Spent</div>
                      <Text as="div" mono size={15} weight={700} color={dashboard.thisMonth.expenses! > 0 ? "var(--ft-red)" : "var(--ft-muted)"}>
                        <span className="pnum">{formatBaseMoney(dashboard.thisMonth.expenses!)}</span>
                      </Text>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>this month</div>
                    </div>
                  )}
                  {dashboard?.thisMonth?.savingsRate != null && (
                    <div style={{ background: "var(--ft-surface)", padding: "10px 12px", borderTop: `2px solid ${srAccent}` }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Savings Rate</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: srColor }}>
                        <span className="pnum">{srPct!.toFixed(0)}%</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>{srLabel}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Universal data-grounded starters — visible even when no
                smart insights fire. Each prompt is only shown when the
                user actually has the underlying data (budgets/goals/
                last-month/investments), so no starter references a table
                the user hasn't filled in yet. */}
            {(() => {
              const starters: Array<{ label: string; text: string }> = [];
              starters.push({
                label: "How am I doing this month?",
                text: "Give me a straight read on how I'm doing this month — income vs spend, savings rate, and one thing to focus on.",
              });
              if (lastMonthCategories.length > 0) {
                starters.push({
                  label: "What changed since last month?",
                  text: "Compare this month vs last month. Which categories moved the most, what does the pattern say, and what should I do about it?",
                });
              }
              if (budgets && (budgets as unknown[]).length > 0) {
                starters.push({
                  label: "Which budget is most at risk?",
                  text: "Which of my budgets is most likely to blow this month? Give me the one to focus on and a specific action.",
                });
              }
              if (goals && (goals as unknown[]).length > 0) {
                starters.push({
                  label: "Am I on pace for my goals?",
                  text: "Am I on pace to hit my savings goals? Which one needs more attention and by how much?",
                });
              }
              return (
                <VStack gap={4} wide maxWidth={480}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8 }}>
                    <MonoLabel as="span" size={8} letterSpacing="0.14em">Common questions</MonoLabel>
                  </div>
                  {starters.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => handleSend(s.text)}
                      disabled={isStreaming || aiAvailable === false}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        padding: "9px 12px",
                        background: "var(--ft-surface)",
                        border: "1px solid var(--ft-border)",
                        borderLeft: "2px solid var(--ft-accent)",
                        cursor: isStreaming || aiAvailable === false ? "not-allowed" : "pointer",
                        textAlign: "left",
                        width: "100%",
                        borderRadius: 2,
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{s.label}</span>
                      <MonoLabel as="span" size={8} color="var(--ft-dim)" letterSpacing="0.1em">↵</MonoLabel>
                    </button>
                  ))}
                </VStack>
              );
            })()}

            {/* Smart Insights — data-triggered "needs attention" cards */}
            {smartInsights.length > 0 && (
              <div style={{ width: "100%", maxWidth: 480 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, borderLeft: "3px solid var(--ft-amber)", paddingLeft: 8 }}>
                  <Zap size={10} style={{ color: "var(--ft-amber)" }} />
                  <Text as="span" mono upper size={8} weight={700} color="var(--ft-amber)" letterSpacing="0.14em">Needs attention</Text>
                </div>
                <VStack gap={4}>
                  {smartInsights.map((item, i) => (
                    <SmartInsightCard
                      key={i}
                      item={item}
                      loading={isStreaming}
                      aiAvailable={aiAvailable}
                      onSend={handleSend}
                    />
                  ))}
                </VStack>
              </div>
            )}

            {/* Persona-scoped prompts — flavour for the user's chosen focus */}
            <VStack gap={4} wide maxWidth={480}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, borderLeft: "3px solid var(--ft-blue)", paddingLeft: 8 }}>
                <MonoLabel as="span" size={8} letterSpacing="0.14em">Persona picks</MonoLabel>
                {primaryPersona && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-blue)", padding: "1px 6px", border: "1px solid var(--ft-blue)", letterSpacing: "0.06em" }}>
                    {primaryPersona.code}
                  </span>
                )}
              </div>
              {suggestedPrompts.map((prompt) => (
                <SuggestedPromptButton
                  key={prompt.label}
                  prompt={prompt}
                  loading={isStreaming}
                  aiAvailable={aiAvailable}
                  onSend={handleSend}
                />
              ))}
            </VStack>
          </div>
        ) : (
          <div style={{ paddingTop: 8 }}>
            {/* Session divider */}
            <HStack gap={10} align="center" marginBottom={20}>
              <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
              <Text as="span" mono upper size={8} color="var(--ft-dim)" letterSpacing="0.1em" nowrap>
                Session — {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </Text>
              <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
            </HStack>

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                msg={msg}
                index={messages.slice(0, i).filter(m => m.role === "user").length}
              />
            ))}
            {/* Queued follow-ups typed while a stream is in flight — shared visual. */}
            {pending.map((q, i) => (
              <div key={`pending-${i}`} style={{ marginBottom: 12 }}>
                <QueuedPromptChip text={q} />
              </div>
            ))}
            {/* Note: lastError already surfaces INSIDE the streaming
                bubble via StreamingError. The old page-level error
                banner is redundant now that terminal states live
                per-message. Kept a compact fallback below for the
                narrow case where lastError is set but no bubble was
                ever opened (fetch failed before applyEvent ran). */}
            {lastError && messages[messages.length - 1]?.status !== "error" && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "2px solid var(--ft-red)" }}>
                <StreamingError message={lastError} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 10, flexShrink: 0 }}>
        {!isEmpty && (
          <HStack align="center" justify="between" marginBottom={8}>
            <HStack gap={6} align="center">
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: aiAvailable ? "var(--ft-green)" : "var(--ft-dim)" }} />
              <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.06em">
                {aiAvailable ? "AI ONLINE" : "AI OFFLINE"}
              </Text>
            </HStack>
            <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.04em">
              {input.length > 0 ? `${input.length} chars` : "Enter ↵ to send · Shift+Enter for newline"}
            </Text>
          </HStack>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={isStreaming ? "Ask a follow-up (queued while replying)…" : isEmpty ? "Ask anything about your finances…" : "Follow-up question…"}
            disabled={aiAvailable === false}
            rows={2}
            style={{
              flex: 1,
              background: "var(--ft-surface)",
              border: `1px solid ${input.length > 0 ? "var(--ft-border)" : "var(--ft-border2)"}`,
              borderRadius: 2,
              color: "var(--ft-text)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              padding: "10px 12px",
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
              transition: "border-color 0.15s",
            }}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || aiAvailable === false}
            title={isStreaming ? "Queue follow-up (Enter)" : "Send (Enter)"}
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: !input.trim() ? "var(--ft-raised)" : "var(--ft-accent)",
              border: `1px solid ${!input.trim() ? "var(--ft-border2)" : "var(--ft-accent)"}`,
              borderRadius: 2,
              cursor: !input.trim() ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <Send size={15} style={{ color: !input.trim() ? "var(--ft-dim)" : "var(--ft-bg, #0D1117)" }} />
          </button>
        </div>
        <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
          Streamed from Groq / Cerebras / OpenRouter · Context assembled server-side, never posted from this page
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </VStack>
  );
}
