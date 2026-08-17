import { useState } from "react";
import { useLocation } from "wouter";
import { PERSONAS, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { useIsMobile } from "@/hooks/use-mobile";

const qsDismissedKey = (id: string) => `ft-qs-dismissed-${id}`;
const qsDoneKey = (id: string) => `ft-qs-done-${id}`;

interface QsStep { id: string; label: string; desc: string; href: string; }

export const PERSONA_QS_STEPS: Record<PersonaId, QsStep[]> = {
  market: [
    { id: "market-position", label: "Add first position", desc: "Track holdings with live P&L and price alerts", href: "/investments" },
    { id: "market-decisions", label: "Review AI decisions", desc: "Data-driven buy / sell / hold recommendations", href: "/decisions" },
    { id: "market-coach", label: "Ask your AI coach", desc: "Get personalised investment and market analysis", href: "/ai-coach" },
  ],
  budget: [
    { id: "budget-account", label: "Add an account", desc: "Link bank, card, or cash account to start tracking", href: "/accounts" },
    { id: "budget-transactions", label: "Log transactions", desc: "Add manually, import CSV, or scan a receipt", href: "/transactions" },
    { id: "budget-rules", label: "Create budget categories", desc: "Set monthly spending limits per category", href: "/budget" },
  ],
  wealth: [
    { id: "wealth-networth", label: "Log net worth", desc: "Record assets, liabilities, and total savings", href: "/net-worth" },
    { id: "wealth-fire", label: "Calculate FIRE number", desc: "Project your financial independence target date", href: "/fire" },
    { id: "wealth-goals", label: "Set a savings goal", desc: "Define a target amount with a deadline", href: "/goals" },
  ],
  social: [
    { id: "social-group", label: "Create a split group", desc: "Add flatmates, travel companions, or friends", href: "/split" },
    { id: "social-expense", label: "Add a shared expense", desc: "Split a bill and track who owes what", href: "/split" },
    { id: "social-debts", label: "Review the debt ledger", desc: "See all outstanding balances at a glance", href: "/owing" },
  ],
  full: [
    { id: "full-account", label: "Add your first account", desc: "Connect bank account, investments, or property", href: "/accounts" },
    { id: "full-portfolio", label: "Explore the market terminal", desc: "Live quotes, P&L, and portfolio analytics", href: "/investments" },
    { id: "full-health", label: "Check financial health", desc: "Your comprehensive financial wellness score", href: "/health-score" },
  ],
};

export function PersonaQuickStart() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const primaryId = useActivePersona();
  const persona = PERSONAS.find(p => p.id === primaryId);
  const steps = (primaryId && PERSONA_QS_STEPS[primaryId]) ? PERSONA_QS_STEPS[primaryId] : PERSONA_QS_STEPS.full;

  const dismissedKey = qsDismissedKey(primaryId ?? "full");
  const doneKey = qsDoneKey(primaryId ?? "full");

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissedKey) === "1");
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(doneKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set<string>(); }
  });

  const allDone = steps.every(s => done.has(s.id));

  if (dismissed || allDone || !persona) return null;
  if (!localStorage.getItem("ft-onboarding-complete")) return null;

  const completeStep = (id: string, href: string) => {
    const next = new Set([...done, id]);
    setDone(next);
    try { localStorage.setItem(doneKey, JSON.stringify([...next])); } catch {}
    navigate(href);
  };

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissedKey, "1"); } catch {}
  };

  const doneCount = steps.filter(s => done.has(s.id)).length;

  return (
    <div style={{
      border: "1px solid rgba(244,162,30,0.3)",
      background: "rgba(244,162,30,0.04)",
      marginBottom: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 14px 5px",
        borderBottom: "1px solid rgba(244,162,30,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-amber)", letterSpacing: "0.12em" }}>
            ◈ {persona.code} — QUICK START
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {doneCount}/{steps.length} DONE
          </span>
        </div>
        <button
          onClick={dismiss}
          title="Dismiss"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", borderBottom: "1px solid rgba(244,162,30,0.1)" }}>
        {steps.map((step, i) => {
          const isDone = done.has(step.id);
          return isMobile ? (
            /* Mobile: compact single-row layout */
            <div
              key={step.id}
              style={{
                padding: "8px 14px",
                borderBottom: i < steps.length - 1 ? "1px solid rgba(244,162,30,0.1)" : "none",
                display: "flex", alignItems: "center", gap: 10,
                opacity: isDone ? 0.45 : 1,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: "50%",
                border: `1px solid ${isDone ? "var(--ft-green)" : "rgba(244,162,30,0.5)"}`,
                background: isDone ? "var(--ft-green)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                fontSize: 8, fontFamily: "var(--font-mono)",
                color: isDone ? "#000" : "var(--ft-amber)",
                fontWeight: 700,
              }}>
                {isDone ? "✓" : (i + 1)}
              </div>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                color: isDone ? "var(--ft-dim)" : "var(--ft-text)",
                letterSpacing: "0.02em",
                textDecoration: isDone ? "line-through" : "none",
                flex: 1, minWidth: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {step.label}
              </span>
              {!isDone && (
                <button
                  onClick={() => completeStep(step.id, step.href)}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.1em", color: "var(--ft-amber)",
                    background: "transparent", border: "1px solid rgba(244,162,30,0.4)",
                    padding: "3px 10px", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  GO
                </button>
              )}
            </div>
          ) : (
            /* Desktop: original 3-column layout */
            <div
              key={step.id}
              style={{
                padding: "10px 14px",
                borderRight: i < steps.length - 1 ? "1px solid rgba(244,162,30,0.1)" : "none",
                display: "flex", flexDirection: "column", gap: 4,
                opacity: isDone ? 0.45 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: `1px solid ${isDone ? "var(--ft-green)" : "rgba(244,162,30,0.5)"}`,
                  background: isDone ? "var(--ft-green)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 8, fontFamily: "var(--font-mono)",
                  color: isDone ? "#000" : "var(--ft-amber)",
                  fontWeight: 700,
                }}>
                  {isDone ? "✓" : (i + 1)}
                </div>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                  color: isDone ? "var(--ft-dim)" : "var(--ft-text)",
                  letterSpacing: "0.02em",
                  textDecoration: isDone ? "line-through" : "none",
                }}>
                  {step.label}
                </span>
              </div>
              <p style={{
                fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)",
                letterSpacing: "0.02em", lineHeight: 1.5, margin: "0 0 6px",
              }}>
                {step.desc}
              </p>
              {!isDone && (
                <button
                  onClick={() => completeStep(step.id, step.href)}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.1em", color: "var(--ft-amber)",
                    background: "transparent", border: "1px solid rgba(244,162,30,0.4)",
                    padding: "3px 10px", cursor: "pointer", alignSelf: "flex-start",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(244,162,30,0.12)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  GO →
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!isMobile && (
        <div style={{ padding: "5px 14px", display: "flex", justifyContent: "flex-end" }}>
          <a
            href="/settings?panel=terminal-profile"
            style={{
              fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)",
              letterSpacing: "0.06em", opacity: 0.65, textDecoration: "none",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.65"; }}
          >
            Wrong profile? Change in Settings →
          </a>
        </div>
      )}
    </div>
  );
}
