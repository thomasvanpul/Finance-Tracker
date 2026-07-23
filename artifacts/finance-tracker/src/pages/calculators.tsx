"use client";
import { useLocation } from "wouter";

type Tool = {
  href: string;
  code: string;
  label: string;
  tag: string;
  description: string;
  bullets: string[];
  accent: string;
};

const TOOLS: Tool[] = [
  {
    href: "/fire",
    code: "G·0",
    label: "FIRE CALCULATOR",
    tag: "RETIRE EARLY",
    description: "Compute your Financial Independence number, safe withdrawal rate, and projected retirement date based on savings rate and expected returns.",
    bullets: ["FI number & years to freedom", "Safe withdrawal rate (SWR)", "Coast FIRE & Lean FIRE variants", "Portfolio survival probability"],
    accent: "var(--ft-green)",
  },
  {
    href: "/mortgage",
    code: "G·M",
    label: "MORTGAGE CALCULATOR",
    tag: "PROPERTY",
    description: "Model monthly repayments, total interest cost, and full amortisation schedule for any mortgage. Compare fixed vs. variable scenarios.",
    bullets: ["Monthly payment breakdown", "Full amortisation table", "Overpayment impact analysis", "Stamp duty & LTV estimator"],
    accent: "var(--ft-blue)",
  },
  {
    href: "/pension",
    code: "G·P",
    label: "PENSION & ISA TRACKER",
    tag: "TAX-EFFICIENT",
    description: "Track defined-contribution pension growth and ISA allowance utilisation across the current tax year. Projects pot value at target retirement age.",
    bullets: ["Annual & lifetime allowance tracking", "ISA allowance vs. used (£20k)", "State pension toggle (£11,502/yr)", "Compound growth projection chart"],
    accent: "var(--ft-amber)",
  },
  {
    href: "/whatif",
    code: "G·F",
    label: "SCENARIO PLANNER",
    tag: "WHAT-IF",
    description: "Run parallel financial scenarios — salary changes, big purchases, investment windfalls — and visualise the long-run impact on your net worth.",
    bullets: ["Income & expense shock events", "Lump-sum investment modelling", "Side-by-side scenario comparison", "12-month projected balance chart"],
    accent: "var(--ft-red)",
  },
];

export default function Calculators() {
  const [, navigate] = useLocation();

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28, paddingBottom: 16, borderBottom: "1px solid var(--ft-border)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.16em", marginBottom: 4 }}>
          TOOLS › CALCULATORS
        </div>
        <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.04em", margin: 0 }}>
          PLANNING TOOLS
        </h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 6, letterSpacing: "0.04em" }}>
          Four calculators for long-range financial planning. Select a tool to launch it in full.
        </p>
      </div>

      {/* Tool grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 16 }}>
        {TOOLS.map((tool) => (
          <ToolCard key={tool.href} tool={tool} onLaunch={() => navigate(tool.href)} />
        ))}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 28, paddingTop: 12, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>
        TIP — Keyboard shortcuts still work directly: G then the key shown on each card to jump straight to any tool.
      </div>
    </div>
  );
}

function ToolCard({ tool, onLaunch }: { tool: Tool; onLaunch: () => void }) {
  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.15s",
        cursor: "pointer",
      }}
      onClick={onLaunch}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = tool.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ft-border)"; }}
    >
      {/* Card header */}
      <div style={{
        padding: "12px 16px 10px",
        borderBottom: "1px solid var(--ft-border)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div>
          {/* Tag */}
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.14em",
            color: tool.accent,
            marginBottom: 4,
          }}>
            {tool.tag}
          </div>
          {/* Title */}
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ft-text)",
            letterSpacing: "0.06em",
          }}>
            {tool.label}
          </div>
        </div>

        {/* Shortcut chip */}
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: "3px 8px",
          background: "var(--ft-raised)",
          border: "1px solid var(--ft-border2)",
          color: "var(--ft-dim)",
          flexShrink: 0,
          alignSelf: "flex-start",
          marginTop: 2,
        }}>
          {tool.code}
        </div>
      </div>

      {/* Description */}
      <div style={{ padding: "12px 16px 8px", flex: 1 }}>
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ft-muted)",
          lineHeight: 1.65,
          margin: 0,
          letterSpacing: "0.02em",
        }}>
          {tool.description}
        </p>

        {/* Feature bullets */}
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {tool.bullets.map((b) => (
            <li key={b} style={{ display: "flex", alignItems: "baseline", gap: 7, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.03em" }}>
              <span style={{ color: tool.accent, flexShrink: 0, fontSize: 8 }}>›</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Launch footer */}
      <div style={{
        borderTop: "1px solid var(--ft-border)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>
          {tool.href.replace("/", "").toUpperCase()}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onLaunch(); }}
          style={{
            background: "none",
            border: `1px solid ${tool.accent}`,
            color: tool.accent,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "3px 12px",
            cursor: "pointer",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${tool.accent} 12%, transparent)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          LAUNCH →
        </button>
      </div>
    </div>
  );
}
