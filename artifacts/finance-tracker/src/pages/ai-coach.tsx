import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Loader2, BotMessageSquare, Sparkles, RotateCcw, TrendingDown, Target, PiggyBank, AlertTriangle } from "lucide-react";
import { useListTransactions, useListAccounts, useGetDashboard, useListBudgets, useGetInvestmentSummary, useListGoals } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "model";
  text: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function sendChat(messages: Message[], context: string): Promise<string> {
  const res = await fetch("/api/ai/chat", {
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

// ── Context builder ───────────────────────────────────────────────────────────

function buildSpendingContext(
  accounts: Array<{ name: string; balance: string; gbpEquivalent: number }> | undefined,
  dashboard: { netWorth?: number; thisMonth?: { income?: number; expenses?: number; savingsRate?: number } } | undefined,
  budgets: Array<{ category: string; monthlyLimit: number }> | undefined,
  topCategories: Array<{ category: string; total: number }>,
  lastMonthCategories: Array<{ category: string; total: number }>,
  investmentSummary: { totalValueGbp: number } | undefined,
  goals: Array<{ target: number; current: number }> | undefined,
): string {
  const parts: string[] = ["USER'S FINANCIAL SNAPSHOT:"];

  // Net worth
  if (dashboard?.netWorth != null) {
    parts.push(`Net worth: ${formatGbp(dashboard.netWorth)}`);
  }

  if (accounts?.length) {
    const totalGbp = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);
    parts.push(`Total liquid assets: ${formatGbp(totalGbp)} across ${accounts.length} account(s)`);
  }

  // Investment portfolio
  if (investmentSummary != null) {
    parts.push(`Investment portfolio value: ${formatGbp(investmentSummary.totalValueGbp)}`);
  }

  if (dashboard?.thisMonth) {
    const { income, expenses, savingsRate } = dashboard.thisMonth;
    if (income != null) parts.push(`This month income: ${formatGbp(income)}`);
    if (expenses != null) parts.push(`This month expenses: ${formatGbp(expenses)}`);
    if (income != null && expenses != null) parts.push(`This month net: ${formatGbp(income - expenses)}`);
    if (savingsRate != null) parts.push(`Savings rate: ${(savingsRate * 100).toFixed(1)}%`);
  }

  // Goals summary
  if (goals?.length) {
    const activeGoals = goals.filter(g => g.current < g.target);
    const totalNeeded = activeGoals.reduce((s, g) => s + (g.target - g.current), 0);
    parts.push(`Savings goals: ${activeGoals.length} active (${formatGbp(totalNeeded)} still needed)`);
  }

  // Budget summary with over-limit count
  if (budgets?.length) {
    const thisMonth = new Date().toISOString().slice(0, 7);
    // over-limit detection is computed in the caller and passed via topCategories
    // We just report budget count here; over-limit count is enriched separately below
    parts.push(`Monthly budgets: ${budgets.length} active — ${budgets.map(b => `${b.category} £${b.monthlyLimit}`).join(", ")}`);
    // Count budgets exceeded by topCategories this month
    const overLimit = budgets.filter(b => {
      const spent = topCategories.find(c => c.category === b.category)?.total ?? 0;
      return spent > b.monthlyLimit;
    });
    if (overLimit.length > 0) {
      parts.push(`Budgets over limit this month: ${overLimit.length} (${overLimit.map(b => b.category).join(", ")})`);
    }
    void thisMonth; // suppress unused variable warning
  }

  if (topCategories.length) {
    const lastMonthMap = new Map(lastMonthCategories.map(c => [c.category, c.total]));
    const withChange = topCategories.slice(0, 5).map(c => {
      const prev = lastMonthMap.get(c.category);
      if (prev != null && prev > 0) {
        const pct = Math.round(((c.total - prev) / prev) * 100);
        const sign = pct >= 0 ? "+" : "";
        return `${c.category} ${formatGbp(c.total)} (${sign}${pct}% vs last month)`;
      }
      return `${c.category} ${formatGbp(c.total)}`;
    });
    parts.push(`Top spending categories this month: ${withChange.join(", ")}`);
  }

  if (lastMonthCategories.length) {
    parts.push(`Last month top categories: ${lastMonthCategories.slice(0, 5).map(c => `${c.category} ${formatGbp(c.total)}`).join(", ")}`);
  }

  parts.push("Use this data to give specific, actionable advice tailored to their situation.");
  return parts.join("\n");
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  { icon: TrendingDown,   label: "Where am I overspending?",         text: "Based on my spending data, where am I overspending compared to my budgets? Give me specific actionable advice." },
  { icon: Sparkles,       label: "Spending trends this month",       text: "Compare my spending this month vs last month. Which categories increased or decreased? What does this pattern say about my habits?" },
  { icon: PiggyBank,      label: "How can I save more?",             text: "Looking at my income and expenses, how can I realistically increase my savings rate? Give me concrete steps." },
  { icon: Target,         label: "Am I on track for my goals?",      text: "Based on my current savings rate and expenses, am I on track to meet my savings goals? What adjustments should I make?" },
  { icon: AlertTriangle,  label: "Any financial red flags?",         text: "Review my financial data and flag any concerning patterns or risks I should address immediately." },
];

// ── Message renderer ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  const formatted = msg.text
    .split(/\n\n+/)
    .map((para, i) => {
      // Detect bullet list paragraphs
      if (/^[-*•]\s/.test(para)) {
        const items = para.split(/\n/).filter(Boolean);
        return (
          <ul key={i} style={{ margin: "6px 0", paddingLeft: 16, listStyle: "none" }}>
            {items.map((item, j) => (
              <li key={j} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <span style={{ color: "var(--ft-accent)", marginTop: 2, flexShrink: 0 }}>·</span>
                <span>{item.replace(/^[-*•]\s/, "")}</span>
              </li>
            ))}
          </ul>
        );
      }
      // Bold (**text**)
      const boldified = para.split(/\*\*(.+?)\*\*/g).map((chunk, j) =>
        j % 2 === 1 ? <strong key={j} style={{ color: "var(--ft-text)" }}>{chunk}</strong> : chunk
      );
      return <p key={i} style={{ margin: "6px 0 0" }}>{boldified}</p>;
    });

  return (
    <div style={{
      display: "flex",
      gap: 12,
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-start",
      marginBottom: 20,
    }}>
      {/* Avatar */}
      <div style={{
        width: 30,
        height: 30,
        borderRadius: 2,
        background: isUser ? "var(--ft-blue)" : "rgba(245,158,11,0.12)",
        border: `1px solid ${isUser ? "var(--ft-blue)" : "var(--ft-amber)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: 12,
      }}>
        {isUser
          ? <span style={{ color: "#fff", fontFamily: "var(--font-mono)", fontWeight: 700 }}>U</span>
          : <BotMessageSquare size={14} style={{ color: "var(--ft-amber)" }} />
        }
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "75%",
        background: isUser ? "rgba(79,140,255,0.08)" : "var(--ft-surface)",
        border: `1px solid ${isUser ? "rgba(79,140,255,0.2)" : "var(--ft-border)"}`,
        borderRadius: 3,
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.65,
        color: "var(--ft-text)",
        fontFamily: "var(--font-sans, sans-serif)",
      }}>
        {formatted}
      </div>
    </div>
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
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.gbpValue);
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
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.gbpValue);
    }
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  })();

  const spendingContext = buildSpendingContext(
    accounts as any,
    dashboard,
    budgets as any,
    topCategories,
    lastMonthCategories,
    investmentSummary as { totalValueGbp: number } | undefined,
    goals as Array<{ target: number; current: number }> | undefined,
  );

  const SESSION_KEY = "nr-ai-coach-msgs";
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)); } catch { /* noop */ }
  }, [messages]);

  // Check if AI is available
  useEffect(() => {
    fetch("/api/ai/status", { credentials: "include" })
      .then(r => r.json())
      .then((d: { available: boolean }) => setAiAvailable(d.available))
      .catch(() => setAiAvailable(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);
    const next: Message[] = [...messages, { role: "user", text: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const reply = await sendChat(next, spendingContext);
      setMessages(m => [...m, { role: "model", text: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, spendingContext]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    setInput("");
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{ height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>AI Coach</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>Personalised financial guidance powered by Gemini</div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "none", border: "1px solid var(--ft-border2)", padding: "4px 10px", cursor: "pointer", letterSpacing: "0.06em" }}
          >
            <RotateCcw size={11} /> NEW CHAT
          </button>
        )}
      </div>

      {aiAvailable === null && (
        <div style={{ margin: "0 0 16px", padding: "10px 16px", background: "var(--ft-surface)", border: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
          Checking AI availability…
        </div>
      )}
      {aiAvailable === false && (
        <div style={{ margin: "0 0 16px", padding: "12px 16px", background: "rgba(230,80,80,0.06)", border: "1px solid rgba(230,80,80,0.2)", fontSize: 12, color: "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
          AI assistant is not configured on this server. Add GEMINI_API_KEY to enable it.
        </div>
      )}

      {/* Chat area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px" }}>
        {isEmpty ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 32, paddingBottom: 80 }}>
            {/* Hero */}
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 3, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Sparkles size={24} style={{ color: "var(--ft-amber)" }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 6 }}>
                Your AI Financial Coach
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", maxWidth: 340, lineHeight: 1.6 }}>
                Ask anything about your finances. I have access to your current month's spending, budgets, and account balances.
              </div>
            </div>

            {/* Spending summary cards */}
            {(dashboard?.thisMonth?.income != null || topCategories.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, width: "100%", maxWidth: 480 }}>
                {dashboard?.thisMonth?.income != null && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Income</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-green)" }}>{formatGbp(dashboard.thisMonth.income!)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>this month</div>
                  </div>
                )}
                {dashboard?.thisMonth?.expenses != null && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Spent</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-red)" }}>{formatGbp(dashboard.thisMonth.expenses!)}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>this month</div>
                  </div>
                )}
                {dashboard?.thisMonth?.savingsRate != null && (
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Savings</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-blue)" }}>{(dashboard.thisMonth.savingsRate! * 100).toFixed(0)}%</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>rate</div>
                  </div>
                )}
              </div>
            )}

            {/* Suggested prompts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 480 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Try asking</div>
              {SUGGESTED_PROMPTS.map(({ icon: Icon, label, text }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSend(text)}
                  disabled={loading || aiAvailable === false}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    background: "var(--ft-surface)", border: "1px solid var(--ft-border2)",
                    cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                  }}
                >
                  <Icon size={14} style={{ color: "var(--ft-accent)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: 8 }}>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 20 }}>
                <div style={{ width: 30, height: 30, borderRadius: 2, background: "rgba(245,158,11,0.12)", border: "1px solid var(--ft-amber)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <BotMessageSquare size={14} style={{ color: "var(--ft-amber)" }} />
                </div>
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 3, padding: "12px 16px" }}>
                  <Loader2 size={14} style={{ color: "var(--ft-dim)", animation: "spin 1s linear infinite" }} />
                </div>
              </div>
            )}
            {error && (
              <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(230,80,80,0.06)", border: "1px solid rgba(230,80,80,0.2)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)" }}>
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your finances… (Enter to send, Shift+Enter for newline)"
            disabled={loading || aiAvailable === false}
            rows={2}
            style={{
              flex: 1,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              color: "var(--ft-text)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              padding: "10px 12px",
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
            }}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={loading || !input.trim() || aiAvailable === false}
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: loading || !input.trim() ? "var(--ft-raised)" : "var(--ft-accent)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            {loading
              ? <Loader2 size={16} style={{ color: "var(--ft-dim)", animation: "spin 1s linear infinite" }} />
              : <Send size={16} style={{ color: loading || !input.trim() ? "var(--ft-dim)" : "var(--ft-bg, #0D1117)" }} />
            }
          </button>
        </div>
        <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.05em" }}>
          Your spending data is sent securely to Gemini to generate personalised advice. Data is not stored by Google.
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
