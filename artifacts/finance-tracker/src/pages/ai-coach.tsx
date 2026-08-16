import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Send, Loader2, BotMessageSquare, Sparkles, RotateCcw, TrendingDown, Target, PiggyBank, AlertTriangle, Zap, TrendingUp, BarChart2, Flame, Shield, Users } from "lucide-react";
import { useListTransactions, useListAccounts, useGetDashboard, useListBudgets, useGetInvestmentSummary, useListGoals, useListInvestments } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { loadPersonaIds, PERSONAS, type PersonaId } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

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
  personaLabel?: string,
): string {
  const parts: string[] = ["USER'S FINANCIAL SNAPSHOT:"];
  if (personaLabel) {
    parts.push(`User profile: ${personaLabel}. Tailor advice to this focus area.`);
  }

  if (dashboard?.netWorth != null) {
    parts.push(`Net worth: ${formatGbp(dashboard.netWorth)}`);
  }

  if (accounts?.length) {
    const totalGbp = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);
    parts.push(`Total liquid assets: ${formatGbp(totalGbp)} across ${accounts.length} account(s)`);
  }

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

  if (goals?.length) {
    const activeGoals = goals.filter(g => g.current < g.target);
    const totalNeeded = activeGoals.reduce((s, g) => s + (g.target - g.current), 0);
    parts.push(`Savings goals: ${activeGoals.length} active (${formatGbp(totalNeeded)} still needed)`);
  }

  if (budgets?.length) {
    const thisMonth = new Date().toISOString().slice(0, 7);
    parts.push(`Monthly budgets: ${budgets.length} active — ${budgets.map(b => `${b.category} £${b.monthlyLimit}`).join(", ")}`);
    const overLimit = budgets.filter(b => {
      const spent = topCategories.find(c => c.category === b.category)?.total ?? 0;
      return spent > b.monthlyLimit;
    });
    if (overLimit.length > 0) {
      parts.push(`Budgets over limit this month: ${overLimit.length} (${overLimit.map(b => b.category).join(", ")})`);
    }
    void thisMonth;
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
  market:  "Market & investment analysis powered by Gemini",
  budget:  "Spending control & budget advice powered by Gemini",
  wealth:  "Long-term wealth planning powered by Gemini",
  social:  "Expense & social spending insights powered by Gemini",
  full:    "Complete financial analysis powered by Gemini",
};

// ── Message renderer ──────────────────────────────────────────────────────────

function MessageBubble({ msg, index }: { msg: Message; index: number }) {
  const isUser = msg.role === "user";

  const formatted = msg.text
    .split(/\n\n+/)
    .map((para, i) => {
      if (/^\d+\.\s/.test(para)) {
        const items = para.split(/\n/).filter(Boolean);
        return (
          <ol key={i} style={{ margin: "8px 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((item, j) => (
              <li key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 18, paddingTop: 1, flexShrink: 0, fontWeight: 700 }}>
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
          <ul key={i} style={{ margin: "8px 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
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
          <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", margin: "12px 0 4px", borderBottom: "1px solid var(--ft-border)", paddingBottom: 4 }}>
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

  return (
    <div style={{
      display: "flex",
      gap: 10,
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-start",
      marginBottom: 16,
      animation: "fadeSlideIn 0.15s ease-out",
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 2,
        background: isUser ? "rgba(79,140,255,0.15)" : "rgba(245,158,11,0.10)",
        border: `1px solid ${isUser ? "rgba(79,140,255,0.35)" : "rgba(245,158,11,0.3)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {isUser
          ? <Text as="span" mono size={10} weight={700} color="var(--ft-blue)" letterSpacing="0.05em">YOU</Text>
          : <BotMessageSquare size={13} style={{ color: "var(--ft-amber)" }} />
        }
      </div>

      <div style={{
        maxWidth: "78%",
        background: isUser ? "rgba(79,140,255,0.06)" : "var(--ft-surface)",
        border: `1px solid ${isUser ? "rgba(79,140,255,0.18)" : "var(--ft-border)"}`,
        borderLeft: isUser ? undefined : "2px solid var(--ft-amber)",
        borderRadius: 2,
        padding: "10px 14px",
        lineHeight: 1.7,
        color: "var(--ft-text)",
      }}>
        {isUser && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-blue)", letterSpacing: "0.08em", marginBottom: 5, textTransform: "uppercase" }}>
            Query #{index + 1}
          </div>
        )}
        {!isUser && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-amber)", letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
            <Sparkles size={9} /> AI Coach Response
          </div>
        )}
        {formatted}
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
      if (tx.gbpValue == null) continue;
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
      if (tx.gbpValue == null) continue;
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.gbpValue);
    }
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  })();

  const activePersonaIds = useMemo(() => loadPersonaIds(), []);
  const primaryPersonaId: PersonaId = activePersonaIds[0] ?? "full";
  const primaryPersona = PERSONAS.find(p => p.id === primaryPersonaId);
  const coachSubtitle = PERSONA_SUBTITLE[primaryPersonaId];
  const suggestedPrompts = PROMPTS_BY_PERSONA[primaryPersonaId];

  const spendingContext = buildSpendingContext(
    accounts as any,
    dashboard,
    budgets as any,
    topCategories,
    lastMonthCategories,
    investmentSummary as { totalValueGbp: number } | undefined,
    goals as Array<{ target: number; current: number }> | undefined,
    primaryPersona ? `${primaryPersona.label} — ${primaryPersona.tagline}` : undefined,
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

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/status", { credentials: "include", signal: controller.signal })
      .then(r => r.json())
      .then((d: { available: boolean }) => setAiAvailable(d.available))
      .catch((e) => { if (e.name !== "AbortError") setAiAvailable(false); });
    return () => controller.abort();
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

  const smartInsights = useMemo(() => {
    const items: SmartInsightItem[] = [];

    if (budgets && transactions) {
      const thisM = new Date().toISOString().slice(0, 7);
      const spendMap = new Map<string, number>();
      for (const tx of transactions) {
        if (tx.type !== "expense" || !tx.date.startsWith(thisM)) continue;
        if (tx.gbpValue == null) continue;
        spendMap.set(tx.category, (spendMap.get(tx.category) ?? 0) + tx.gbpValue);
      }
      for (const b of budgets as Array<{ id: number; category: string; monthlyLimit: number }>) {
        const spent = spendMap.get(b.category) ?? 0;
        const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
        if (pct >= 90) {
          items.push({
            icon: AlertTriangle, color: pct >= 100 ? "var(--ft-red)" : "var(--ft-amber)",
            title: `${b.category} budget ${pct >= 100 ? "exceeded" : "nearly full"}`,
            body: `${formatGbp(spent)} of ${formatGbp(b.monthlyLimit)} used (${pct.toFixed(0)}%)`,
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
      const total = (investmentSummary as { totalValueGbp: number }).totalValueGbp;
      if (total > 0) {
        const byTicker = new Map<string, number>();
        for (const inv of investments as Array<{ ticker: string; gbpValue: number }>) {
          byTicker.set(inv.ticker, (byTicker.get(inv.ticker) ?? 0) + inv.gbpValue);
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

  return (
    <VStack height="calc(100vh - 64px)">
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
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(230,80,80,0.05)", border: "1px solid rgba(230,80,80,0.18)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={11} style={{ flexShrink: 0 }} />
          AI assistant is not configured on this server. Add GEMINI_API_KEY to enable it.
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
                        <span className="pnum">{formatGbp(dashboard.thisMonth.income!)}</span>
                      </Text>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>this month</div>
                    </div>
                  )}
                  {dashboard?.thisMonth?.expenses != null && (
                    <div style={{ background: "var(--ft-surface)", padding: "10px 12px", borderTop: `2px solid ${dashboard.thisMonth.expenses! > 0 ? "var(--ft-red)" : "var(--ft-border2)"}` }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Spent</div>
                      <Text as="div" mono size={15} weight={700} color={dashboard.thisMonth.expenses! > 0 ? "var(--ft-red)" : "var(--ft-muted)"}>
                        <span className="pnum">{formatGbp(dashboard.thisMonth.expenses!)}</span>
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

            {/* Smart Insights */}
            {smartInsights.length > 0 && (
              <div style={{ width: "100%", maxWidth: 480 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, borderLeft: "3px solid var(--ft-amber)", paddingLeft: 8 }}>
                  <Zap size={10} style={{ color: "var(--ft-amber)" }} />
                  <Text as="span" mono upper size={8} weight={700} color="var(--ft-amber)" letterSpacing="0.12em">Needs Attention</Text>
                </div>
                <VStack gap={4}>
                  {smartInsights.map((item, i) => (
                    <SmartInsightCard
                      key={i}
                      item={item}
                      loading={loading}
                      aiAvailable={aiAvailable}
                      onSend={handleSend}
                    />
                  ))}
                </VStack>
              </div>
            )}

            {/* Suggested prompts — persona-aware */}
            <VStack gap={4} wide maxWidth={480}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, borderLeft: "3px solid var(--ft-accent)", paddingLeft: 8 }}>
                <MonoLabel as="span" size={8} letterSpacing="0.12em">Suggested queries</MonoLabel>
                {primaryPersona && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)", padding: "1px 6px", border: "1px solid var(--ft-accent)", letterSpacing: "0.06em" }}>
                    {primaryPersona.code}
                  </span>
                )}
              </div>
              {suggestedPrompts.map((prompt) => (
                <SuggestedPromptButton
                  key={prompt.label}
                  prompt={prompt}
                  loading={loading}
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
            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: 2, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <BotMessageSquare size={13} style={{ color: "var(--ft-amber)" }} />
                </div>
                <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "2px solid var(--ft-amber)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <HStack gap={4} align="center">
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-amber)", display: "inline-block", animation: "pulse 1.2s ease-in-out 0s infinite" }} />
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-amber)", display: "inline-block", animation: "pulse 1.2s ease-in-out 0.2s infinite" }} />
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-amber)", display: "inline-block", animation: "pulse 1.2s ease-in-out 0.4s infinite" }} />
                  </HStack>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>Analysing…</span>
                </div>
              </div>
            )}
            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(230,80,80,0.05)", border: "1px solid rgba(230,80,80,0.18)", fontSize: 11, color: "var(--ft-red)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                {error}
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
            placeholder={isEmpty ? "Ask anything about your finances…" : "Follow-up question…"}
            disabled={loading || aiAvailable === false}
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
            disabled={loading || !input.trim() || aiAvailable === false}
            title="Send (Enter)"
            style={{
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: loading || !input.trim() ? "var(--ft-raised)" : "var(--ft-accent)",
              border: `1px solid ${loading || !input.trim() ? "var(--ft-border2)" : "var(--ft-accent)"}`,
              borderRadius: 2,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            {loading
              ? <Loader2 size={15} style={{ color: "var(--ft-dim)", animation: "spin 1s linear infinite" }} />
              : <Send size={15} style={{ color: loading || !input.trim() ? "var(--ft-dim)" : "var(--ft-bg, #0D1117)" }} />
            }
          </button>
        </div>
        <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
          Spending data is sent securely to Gemini · Not stored by Google
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
