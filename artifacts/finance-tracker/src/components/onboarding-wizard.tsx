import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Step data ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

// ── Step 1: Welcome ───────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* Animated logo mark */}
        <div
          style={{
            width: 56,
            height: 56,
            background: "var(--ft-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontWeight: 900,
            fontSize: 22,
            color: "#000",
            flexShrink: 0,
            animation: "nr-pulse 2s ease-in-out infinite",
          }}
        >
          N
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--ft-text)",
              lineHeight: 1.2,
            }}
          >
            Welcome to Numeris
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ft-muted)",
              marginTop: 4,
            }}
          >
            Your personal finance OS. Not another budgeting app.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          {
            icon: "▪",
            color: "var(--ft-amber)",
            title: "Bloomberg-grade analytics",
            desc: "Health score, what-if scenarios, compound projections, and more — the tools professionals use, built for you.",
          },
          {
            icon: "▪",
            color: "var(--ft-cyan)",
            title: "20+ integrated tools",
            desc: "Budgets, goals, investments, net worth, tax estimates, and a full financial education platform in one place.",
          },
          {
            icon: "▪",
            color: "var(--ft-green)",
            title: "Fully yours",
            desc: "Your data stays local. No subscriptions. No ads. Numeris learns as you add data — the more you use it, the smarter it gets.",
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              display: "flex",
              gap: 14,
              padding: "12px 14px",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
            }}
          >
            <span
              style={{
                color: item.color,
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                lineHeight: 1,
                marginTop: 1,
                flexShrink: 0,
              }}
            >
              {item.icon}
            </span>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--ft-text)",
                  marginBottom: 3,
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ft-muted)",
                  lineHeight: 1.5,
                }}
              >
                {item.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Add first account ─────────────────────────────────────────────────

function StepAddAccount() {
  const accountTypes = [
    { label: "CURRENT", color: "var(--ft-blue)", desc: "Day-to-day spending" },
    { label: "SAVINGS", color: "var(--ft-green)", desc: "Emergency fund, saving pots" },
    { label: "INVESTMENT", color: "var(--ft-amber)", desc: "Stocks, ETFs, crypto" },
    { label: "CREDIT", color: "var(--ft-red)", desc: "Cards, loans, debt tracking" },
  ];

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ft-muted)",
          lineHeight: 1.6,
          marginBottom: 20,
        }}
      >
        To get started, add at least one account. Go to{" "}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--ft-accent)",
            fontWeight: 700,
          }}
        >
          Accounts
        </span>{" "}
        in the sidebar and click{" "}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--ft-accent)",
            fontWeight: 700,
          }}
        >
          + Add Account
        </span>
        . Numeris supports four account types:
      </div>

      {/* ASCII-style account type diagram */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {accountTypes.map((a) => (
          <div
            key={a.label}
            style={{
              padding: "10px 12px",
              background: "var(--ft-surface)",
              border: `1px solid var(--ft-border)`,
              borderLeft: `3px solid ${a.color}`,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: a.color,
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              {a.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--ft-muted)" }}>
              {a.desc}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-dim)",
          padding: "8px 10px",
          background: "rgba(88,166,255,0.05)",
          border: "1px solid rgba(88,166,255,0.12)",
          lineHeight: 1.5,
        }}
      >
        ┌──────────────────────────────────────────────┐{"\n"}
        │  Accounts → All accounts reflect in Net      │{"\n"}
        │  Worth, Dashboard, and Health Score.         │{"\n"}
        │  Add as many as you have.                    │{"\n"}
        └──────────────────────────────────────────────┘
      </div>
    </div>
  );
}

// ── Step 3: Log a transaction ─────────────────────────────────────────────────

function StepLogTransaction() {
  const shortcuts = [
    { keys: "N", action: "New transaction" },
    { keys: "G D", action: "Go to Dashboard" },
    { keys: "G A", action: "Go to Analytics" },
    { keys: "/", action: "Open command palette" },
    { keys: "?", action: "Show all shortcuts" },
  ];

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ft-muted)",
          lineHeight: 1.6,
          marginBottom: 20,
        }}
      >
        Press{" "}
        <KbdBadge>N</KbdBadge>{" "}
        anywhere to open Quick Add, or use the{" "}
        <span style={{ color: "var(--ft-accent)", fontWeight: 600 }}>
          + button
        </span>{" "}
        in the bottom-right corner. Categories auto-suggest as you type.
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-dim)",
          marginBottom: 16,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        Keyboard shortcuts
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {shortcuts.map((s) => (
          <div
            key={s.keys}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--ft-muted)" }}>
              {s.action}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {s.keys.split(" ").map((k) => (
                <KbdBadge key={k}>{k}</KbdBadge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KbdBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--ft-text)",
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border2)",
        borderBottom: "2px solid var(--ft-border2)",
        padding: "2px 7px",
        borderRadius: 3,
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

// ── Step 4: Set a goal ────────────────────────────────────────────────────────

function StepSetGoal() {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ft-muted)",
          lineHeight: 1.6,
          marginBottom: 20,
        }}
      >
        The{" "}
        <span style={{ color: "var(--ft-accent)", fontWeight: 600 }}>
          Goals
        </span>{" "}
        page lets you set savings targets with deadline projections and compound
        growth estimates. Here's what a completed goal card looks like:
      </div>

      {/* Static mockup of a goal card */}
      <div
        style={{
          border: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
          padding: 16,
          marginBottom: 16,
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--ft-text)",
                marginBottom: 2,
              }}
            >
              Emergency Fund
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ft-dim)",
              }}
            >
              TARGET · DEC 2025
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-green)",
              background: "rgba(63,185,80,0.1)",
              border: "1px solid rgba(63,185,80,0.2)",
              padding: "2px 8px",
            }}
          >
            ON TRACK
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 4,
            background: "var(--ft-border)",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              height: "100%",
              width: "68%",
              background: "var(--ft-green)",
            }}
          />
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
          }}
        >
          <span style={{ color: "var(--ft-muted)" }}>
            £6,800 <span style={{ color: "var(--ft-dim)" }}>saved</span>
          </span>
          <span style={{ color: "var(--ft-dim)" }}>68%</span>
          <span style={{ color: "var(--ft-muted)" }}>
            £10,000 <span style={{ color: "var(--ft-dim)" }}>target</span>
          </span>
        </div>

        {/* Projection */}
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            fontSize: 11,
            color: "var(--ft-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          At £600/mo you'll hit target in{" "}
          <span style={{ color: "var(--ft-amber)", fontWeight: 700 }}>
            3.7 months
          </span>
          . Compound projection:{" "}
          <span style={{ color: "var(--ft-green)" }}>£10,241</span> by Dec
          2025.
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--ft-dim)", lineHeight: 1.5 }}>
        Goals track contributions automatically from tagged transactions. Set as
        many goals as you need — retirement, holiday, house deposit.
      </div>
    </div>
  );
}

// ── Step 5: You're ready ──────────────────────────────────────────────────────

function StepReady() {
  const features = [
    {
      label: "BUDGET",
      color: "var(--ft-blue)",
      desc: "Monthly budget planner with overspend alerts",
    },
    {
      label: "HEALTH SCORE",
      color: "var(--ft-green)",
      desc: "Live financial wellness index across 6 dimensions",
    },
    {
      label: "WHAT-IF",
      color: "var(--ft-amber)",
      desc: "Scenario modelling: salary change, debt payoff, investment returns",
    },
    {
      label: "INVESTMENTS",
      color: "var(--ft-cyan)",
      desc: "Portfolio tracker with P/L, allocation, and education",
    },
    {
      label: "ANALYTICS",
      color: "var(--ft-muted)",
      desc: "Deep-dive charts: spending trends, category breakdowns, net worth over time",
    },
  ];

  return (
    <div>
      <div
        style={{
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 32,
            color: "var(--ft-amber)",
            marginBottom: 8,
            lineHeight: 1,
          }}
        >
          ✓
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--ft-text)",
            marginBottom: 6,
          }}
        >
          You're ready
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ft-muted)",
            lineHeight: 1.6,
            maxWidth: 400,
            margin: "0 auto",
          }}
        >
          Numeris learns as you add data. The more you use it, the smarter it
          gets. Here are the power features waiting for you:
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {features.map((f) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 14px",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: f.color,
                letterSpacing: "0.08em",
                minWidth: 90,
                flexShrink: 0,
              }}
            >
              {f.label}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--ft-muted)",
                lineHeight: 1.4,
              }}
            >
              {f.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { title: "Welcome to Numeris", component: <StepWelcome /> },
  { title: "Add your first account", component: <StepAddAccount /> },
  { title: "Log a transaction", component: <StepLogTransaction /> },
  { title: "Set a goal", component: <StepSetGoal /> },
  { title: "You're ready", component: <StepReady /> },
];

// ── Main component ─────────────────────────────────────────────────────────────

export function OnboardingWizard({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      // Small delay for mount animation
      const t = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(t);
    }
    setIsVisible(false);
    return undefined;
  }, [open]);

  const handleClose = () => {
    localStorage.setItem("nr-onboarding-complete", "1");
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  if (!open) return null;

  const isLast = step === TOTAL_STEPS - 1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        opacity: isVisible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Modal */}
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "80vh",
          background: "var(--ft-base)",
          border: "1px solid var(--ft-border2)",
          display: "flex",
          flexDirection: "column",
          transform: isVisible ? "translateY(0)" : "translateY(12px)",
          transition: "transform 200ms ease",
        }}
      >
        {/* Top bar: step counter + skip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid var(--ft-border)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-dim)",
              letterSpacing: "0.12em",
              fontWeight: 700,
            }}
          >
            STEP {step + 1} OF {TOTAL_STEPS}
          </span>
          <button
            onClick={handleClose}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
              transition: "color 150ms",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "var(--ft-muted)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "var(--ft-dim)")
            }
          >
            Skip for now ×
          </button>
        </div>

        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 20px",
            borderBottom: "1px solid var(--ft-border)",
            flexShrink: 0,
          }}
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 24 : 8,
                height: 8,
                background:
                  i <= step ? "var(--ft-amber)" : "var(--ft-border2)",
                border: "none",
                cursor: "pointer",
                transition: "width 200ms ease, background 200ms ease",
                padding: 0,
              }}
            />
          ))}
          <div
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-dim)",
              alignSelf: "center",
            }}
          >
            {Math.round(((step + 1) / TOTAL_STEPS) * 100)}%
          </div>
        </div>

        {/* Step title */}
        <div
          style={{
            padding: "16px 20px 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ft-text)",
              letterSpacing: "0.02em",
            }}
          >
            {STEPS[step].title}
          </div>
          <div
            style={{
              height: 1,
              background: "var(--ft-border)",
              margin: "12px 0 0",
            }}
          />
        </div>

        {/* Step content — scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
          }}
        >
          {STEPS[step].component}
        </div>

        {/* Footer: back / next */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "12px 20px",
            borderTop: "1px solid var(--ft-border)",
            flexShrink: 0,
          }}
        >
          {step > 0 && (
            <button
              onClick={handleBack}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-muted)",
                background: "none",
                border: "1px solid var(--ft-border)",
                cursor: "pointer",
                padding: "7px 16px",
                transition: "border-color 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = "var(--ft-border2)";
                b.style.color = "var(--ft-text)";
              }}
              onMouseLeave={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.borderColor = "var(--ft-border)";
                b.style.color = "var(--ft-muted)";
              }}
            >
              ← BACK
            </button>
          )}
          <button
            onClick={handleNext}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: "#000",
              background: "var(--ft-amber)",
              border: "none",
              cursor: "pointer",
              padding: "7px 20px",
              letterSpacing: "0.06em",
              transition: "opacity 150ms",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.opacity = "0.85")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
            }
          >
            {isLast ? "GET STARTED →" : "NEXT →"}
          </button>
        </div>
      </div>

      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes nr-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
        }
      `}</style>
    </div>
  );
}
