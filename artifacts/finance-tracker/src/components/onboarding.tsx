"use client";
import { useState } from "react";
import {
  applyPersonas,
  personaOnboardingFollowUp,
  LS_ONBOARDING_FOLLOWUP_KEY,
  type PersonaId,
} from "@/lib/persona";
import { savePersonaToServer } from "@/lib/persona-sync";

// Onboarding questionnaire — F1b.
//
// Three questions. Never asks "which persona are you?"; asks about what
// the user actually wants to see, then derives the persona. The
// derivation table is short enough to keep in one function
// (`inferPersona`) so a future edit can see all the rules at once
// rather than tracing scattered scoring code.
//
// Rules the derivation obeys (from the F1 brief):
//   1. If the user picks investments AND nothing else in Q1 → market.
//      A market-persona user must never be pushed to connect a bank.
//   2. If Q3 says "show everything", the answer is full — full is the
//      "I want all the tools" persona, and it always wins over Q1.
//   3. Skip button = full. Anyone who wants out gets the same thing
//      as an existing user: every widget visible, every nav item.

interface OnboardingProps {
  onComplete: () => void;
}

type TrackChoice = "market" | "budget" | "wealth" | "social";
type BankChoice = "yes" | "no" | "later";
type VisibilityChoice = "focused" | "everything";

const TRACK_OPTIONS: { id: TrackChoice; label: string; sub: string }[] = [
  { id: "market", label: "Investments and market prices", sub: "Live prices, portfolio P&L, earnings calendar" },
  { id: "budget", label: "Day-to-day spending",           sub: "Where the money goes each month" },
  { id: "wealth", label: "Net worth over time",           sub: "Long-term growth, goals, savings rate" },
  { id: "social", label: "Money owed between people",     sub: "Split expenses, settle debts" },
];

const BANK_OPTIONS: { id: BankChoice; label: string; sub: string }[] = [
  { id: "yes",   label: "Yes",     sub: "Import balances and transactions" },
  { id: "no",    label: "No",      sub: "Investments only — I'll add my own tickers" },
  { id: "later", label: "Not sure", sub: "Decide later" },
];

const VISIBILITY_OPTIONS: { id: VisibilityChoice; label: string; sub: string }[] = [
  { id: "focused",    label: "Focused",    sub: "Only the tools I need. Everything else stays out of the way." },
  { id: "everything", label: "Everything", sub: "Show me every tool. I want the full terminal." },
];

// Deriving the persona. Kept table-shaped so the rules are legible.
export function inferPersona(
  tracks: TrackChoice[],
  _bank: BankChoice | null,
  visibility: VisibilityChoice | null,
): PersonaId {
  // Visibility "everything" always wins — full is the "show all tools" persona.
  if (visibility === "everything") return "full";
  // No signal → full. Skipping already returns full elsewhere; this
  // catches "clicked continue without selecting anything".
  if (tracks.length === 0) return "full";
  // Multiple domains → full. From the brief: "does not mention
  // budgeting gets market". By contrast, "mentions investments AND
  // budgeting" is not market; the app needs to show both, and the
  // simplest way is full.
  if (tracks.length > 1) return "full";
  // Exactly one selection maps 1:1 to a persona.
  return tracks[0]!;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [tracks, setTracks] = useState<Set<TrackChoice>>(new Set());
  const [bank, setBank] = useState<BankChoice | null>(null);
  const [visibility, setVisibility] = useState<VisibilityChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleTrack(id: TrackChoice) {
    setTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish(persona: PersonaId) {
    setSubmitting(true);
    // Local application first — user should see their landing page even
    // if the server write fails (offline / rate limit). Server write is
    // best-effort; savePersonaToServer swallows the error and logs.
    applyPersonas([persona]);
    // Item 12: onboarding follow-up destination. Persona's real default
    // page is often empty until data arrives (Portfolio, Dashboard,
    // Net Worth) — dropping the user there before they've added a
    // connection or account shows them the empty state instead of the
    // app. Set a one-shot key that DefaultPageRedirector reads before
    // the persona default, then clears. Only set for personas that
    // route somewhere other than their default page.
    const followUp = personaOnboardingFollowUp(persona);
    const persistedDefault = localStorage.getItem("nr-default-page");
    if (followUp !== persistedDefault) {
      localStorage.setItem(LS_ONBOARDING_FOLLOWUP_KEY, followUp);
    }
    await savePersonaToServer(persona);
    onComplete();
  }

  function handleSkip() {
    void finish("full");
  }

  function handleContinue() {
    const persona = inferPersona(Array.from(tracks), bank, visibility);
    void finish(persona);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--ft-base)",
        color: "var(--ft-text)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 900, letterSpacing: "0.15em" }}>
            NUMERIS
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              letterSpacing: "0.12em",
              padding: "2px 6px",
              border: "1px solid var(--ft-border)",
            }}
          >
            INIT · v3
          </div>
        </div>
        <button
          onClick={handleSkip}
          disabled={submitting}
          style={{
            background: "none",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "6px 12px",
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.5 : 1,
          }}
        >
          Skip → Full
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "40px 24px 32px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 32 }}>
          <header>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.2em",
                color: "var(--ft-accent)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Setup · 3 questions
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Let's shape the app around what you're here to do.
            </h1>
            <p style={{ marginTop: 8, color: "var(--ft-dim)", fontSize: 13, lineHeight: 1.5 }}>
              You can change any of this later in Settings. Skip if you'd rather see everything.
            </p>
          </header>

          {/* Q1 */}
          <Question
            index={1}
            label="What do you mostly want to track?"
            sub="Pick any that apply. If you pick only one, the app will focus on it."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TRACK_OPTIONS.map((o) => (
                <ChoiceRow
                  key={o.id}
                  selected={tracks.has(o.id)}
                  onClick={() => toggleTrack(o.id)}
                  label={o.label}
                  sub={o.sub}
                  ariaLabel={`Track ${o.label}`}
                />
              ))}
            </div>
          </Question>

          {/* Q2 */}
          <Question
            index={2}
            label="Do you plan to connect a bank account?"
            sub="If no, we'll skip the bank connection prompts and focus on holdings you enter yourself."
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {BANK_OPTIONS.map((o) => (
                <PillRow
                  key={o.id}
                  selected={bank === o.id}
                  onClick={() => setBank(o.id)}
                  label={o.label}
                  sub={o.sub}
                  ariaLabel={`Bank plan: ${o.label}`}
                />
              ))}
            </div>
          </Question>

          {/* Q3 */}
          <Question
            index={3}
            label="How much of the app do you want visible?"
            sub="Focused hides the tools you didn't ask for. Everything shows the full terminal."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {VISIBILITY_OPTIONS.map((o) => (
                <ChoiceRow
                  key={o.id}
                  selected={visibility === o.id}
                  onClick={() => setVisibility(o.id)}
                  label={o.label}
                  sub={o.sub}
                  ariaLabel={`Visibility: ${o.label}`}
                />
              ))}
            </div>
          </Question>

          {/* Continue */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={handleContinue}
              disabled={submitting}
              style={{
                background: "transparent",
                border: "1px solid var(--ft-accent)",
                color: "var(--ft-accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "10px 22px",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              {submitting ? "Launching…" : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Question({ index, label, sub, children }: {
  index: number;
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            color: "var(--ft-accent)",
            fontWeight: 700,
          }}
        >
          Q{index}
        </span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{label}</h2>
      </div>
      <p style={{ margin: "0 0 12px", color: "var(--ft-dim)", fontSize: 12 }}>{sub}</p>
      {children}
    </section>
  );
}

function ChoiceRow({ selected, onClick, label, sub, ariaLabel }: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: selected ? "color-mix(in srgb, var(--ft-accent) 12%, var(--ft-surface))" : "var(--ft-surface)",
        border: `1px solid ${selected ? "var(--ft-accent)" : "var(--ft-border)"}`,
        color: "var(--ft-text)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          border: `1px solid ${selected ? "var(--ft-accent)" : "var(--ft-border2)"}`,
          background: selected ? "var(--ft-accent)" : "transparent",
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color: "var(--ft-base)",
          fontSize: 10,
          fontWeight: 900,
        }}
      >
        {selected ? "×" : ""}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--ft-dim)" }}>{sub}</span>
      </span>
    </button>
  );
}

function PillRow({ selected, onClick, label, sub, ariaLabel }: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      style={{
        flex: "1 1 180px",
        minWidth: 160,
        padding: "12px 14px",
        background: selected ? "color-mix(in srgb, var(--ft-accent) 12%, var(--ft-surface))" : "var(--ft-surface)",
        border: `1px solid ${selected ? "var(--ft-accent)" : "var(--ft-border)"}`,
        color: "var(--ft-text)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>{sub}</div>
    </button>
  );
}
