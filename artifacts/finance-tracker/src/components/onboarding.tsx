"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateAccount,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
  AccountInputCurrency,
} from "@workspace/api-client-react";
import {
  applyPersonas,
  personaOnboardingFollowUp,
  PERSONAS,
  LS_ONBOARDING_FOLLOWUP_KEY,
  type PersonaId,
} from "@/lib/persona";
import { savePersonaToServer } from "@/lib/persona-sync";

// First-run experience — F1b.
//
// Two steps, in one full-screen surface:
//
//   ASK    two questions that derive the persona. Never asks "which
//          persona are you?"; asks what the user wants to see. The
//          derivation table is short enough to keep in one function
//          (`inferPersona`) so a future edit can see all the rules at
//          once rather than tracing scattered scoring code.
//   ACCOUNT the real account-create form, writing through the same
//          mutation the accounts page uses. A user who finishes here
//          with one account lands on a dashboard where
//          accounts-summary, net-worth and the persona widget all
//          have something true to say.
//
// There used to be a third question — "do you plan to connect a bank
// account?" — that collected an answer, discarded it, and promised
// behaviour that did not exist. Deleted rather than wired: an
// interface that implies it changed something and did not is the same
// fabrication defect as a mocked balance.
//
// Rules the derivation obeys (from the F1 brief):
//   1. If the user picks investments AND nothing else in Q1 → market.
//      A market-persona user must never be pushed to connect a bank.
//   2. If Q2 says "show everything", the answer is full — full is the
//      "I want all the tools" persona, and it always wins over Q1.
//   3. Skip button = full. Anyone who wants out gets the same thing
//      as an existing user: every widget visible, every nav item, and
//      no account step.
//
// The account write is allowed to fail without trapping anyone. Skip
// always ends onboarding, a failed create shows its error and still
// offers the way out, and the persona has already been applied and
// saved before this step is reached — so closing the tab here leaves
// a configured, usable app.

interface OnboardingProps {
  onComplete: () => void;
}

type TrackChoice = "market" | "budget" | "wealth" | "social";
type VisibilityChoice = "focused" | "everything";
type Step = "ask" | "account";

const TRACK_OPTIONS: { id: TrackChoice; label: string; sub: string }[] = [
  { id: "market", label: "Investments and market prices", sub: "Live prices, portfolio P&L, earnings calendar" },
  { id: "budget", label: "Day-to-day spending",           sub: "Where the money goes each month" },
  { id: "wealth", label: "Net worth over time",           sub: "Long-term growth, goals, savings rate" },
  { id: "social", label: "Money owed between people",     sub: "Split expenses, settle debts" },
];

const VISIBILITY_OPTIONS: { id: VisibilityChoice; label: string; sub: string }[] = [
  { id: "focused",    label: "Focused",    sub: "Only the tools I need. Everything else stays out of the way." },
  { id: "everything", label: "Everything", sub: "Show me every tool. I want the full terminal." },
];

// Deriving the persona. Kept table-shaped so the rules are legible.
export function inferPersona(
  tracks: TrackChoice[],
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
  const [step, setStep] = useState<Step>("ask");
  const [tracks, setTracks] = useState<Set<TrackChoice>>(new Set());
  const [visibility, setVisibility] = useState<VisibilityChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [persona, setPersona] = useState<PersonaId>("full");

  function toggleTrack(id: TrackChoice) {
    setTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Applies the persona and moves to the account step. Local
  // application first — the user should get their landing page even if
  // the server write fails (offline / rate limit); savePersonaToServer
  // swallows the error and logs.
  async function applyAndAdvance(chosen: PersonaId) {
    setSubmitting(true);
    setPersona(chosen);
    applyPersonas([chosen]);
    await savePersonaToServer(chosen);
    setSubmitting(false);
    setStep("account");
  }

  // Ends onboarding. `withAccount` says whether the user leaves with
  // real data behind them.
  //
  // Item 12's onboarding follow-up destination exists because "the
  // persona's real default page is often empty until data arrives" —
  // it redirects a fresh user to the page where they can create some.
  // That is still true for anyone who skipped the account step or
  // whose write failed, so the mechanism stays; it just no longer
  // fires for the user who now has an account, because for them the
  // persona's own default page has something to show.
  function leave(chosen: PersonaId, withAccount: boolean) {
    if (!withAccount) {
      const followUp = personaOnboardingFollowUp(chosen);
      const persistedDefault = localStorage.getItem("nr-default-page");
      if (followUp !== persistedDefault) {
        localStorage.setItem(LS_ONBOARDING_FOLLOWUP_KEY, followUp);
      }
    }
    onComplete();
  }

  // Top-bar skip. "I do not want to answer questions" — so it does not
  // then ask one. Full persona, straight into the app.
  function handleSkip() {
    setSubmitting(true);
    applyPersonas(["full"]);
    void savePersonaToServer("full");
    leave("full", false);
  }

  function handleContinue() {
    void applyAndAdvance(inferPersona(Array.from(tracks), visibility));
  }

  return (
    <div
      data-nr-route-state="onboarding"
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
            {step === "ask" ? "INIT · 1/2" : "INIT · 2/2"}
          </div>
        </div>
        {step === "ask" && (
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
        )}
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
          {step === "account" ? (
            <AccountStep
              persona={persona}
              onDone={(withAccount) => leave(persona, withAccount)}
            />
          ) : (
          <>
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
              Setup · 2 questions
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Let's shape the app around what you're here to do.
            </h1>
            <p style={{ marginTop: 8, color: "var(--ft-dim)", fontSize: 13, lineHeight: 1.5 }}>
              Your answers set which tools you see — the sidebar, the phone's tabs and the
              dashboard's widgets. You can change all of it later in Settings.
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
              {submitting ? "Saving…" : "Continue →"}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 2: the first account ─────────────────────────────────────────────
//
// The real create form, writing through the same mutation
// `/accounts` uses. Three fields, because that is what the mutation
// takes: name, currency, opening balance.
//
// The contract that matters: this step can never trap anyone. Skip
// always leaves. A failed write shows the server's own message and
// leaves the way out in place — it does not retry silently, does not
// clear the form, and does not hold the user here. The persona has
// already been applied and saved by the time this renders, so leaving
// from here in any way lands in a configured app.

// Taken from the generated API enum rather than retyped, so this list
// cannot drift from what the server will accept.
const ONBOARDING_CURRENCIES = Object.values(AccountInputCurrency);

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ft-dim)",
  marginBottom: 6,
  display: "block",
};

const FIELD_STYLE: React.CSSProperties = {
  width: "100%",
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border)",
  color: "var(--ft-text)",
  padding: "10px 12px",
  fontSize: 13,
};

function AccountStep({ persona, onDone }: {
  persona: PersonaId;
  onDone: (withAccount: boolean) => void;
}) {
  const createAccount = useCreateAccount();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<AccountInputCurrency>("GBP");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personaDef = PERSONAS.find((p) => p.id === persona);
  const parsedBalance = Number.parseFloat(balance);
  const canSubmit = name.trim().length > 0 && Number.isFinite(parsedBalance) && !saving;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await createAccount.mutateAsync({
        data: { name: name.trim(), currency, balance: parsedBalance },
      });
      // Both queries were already fetched (and came back empty) while
      // the questionnaire was on screen, so the app behind this
      // takeover is holding a cache that says "0 accounts". Without
      // this the user lands on a home screen reporting no accounts and
      // a loading net worth, seconds after typing a balance.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      ]);
      onDone(true);
    } catch (err: unknown) {
      // Show it and stay put with the exits intact. The user is not
      // stuck: "Skip for now" below is still live.
      setError(err instanceof Error ? err.message : "The account could not be saved.");
      setSaving(false);
    }
  }

  return (
    <>
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
          Setup · first account
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
          Add one account, so the dashboard has something to say.
        </h1>
        <p style={{ marginTop: 8, color: "var(--ft-dim)", fontSize: 13, lineHeight: 1.5 }}>
          A current account, a savings account, a card — whatever you check most often.
          You can add the rest, and correct this one, from Accounts at any time.
        </p>
        {personaDef && (
          <p style={{ marginTop: 10, color: "var(--ft-dim)", fontSize: 12, lineHeight: 1.5 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--ft-accent)",
                border: "1px solid var(--ft-border)",
                padding: "2px 6px",
                marginRight: 8,
              }}
            >
              {personaDef.code}
            </span>
            {personaDef.label} — {personaDef.tagline}.
          </p>
        )}
      </header>

      <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <label htmlFor="nr-onb-account-name" style={FIELD_LABEL_STYLE}>Account name</label>
          <input
            id="nr-onb-account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Current account"
            autoFocus
            style={{ ...FIELD_STYLE, fontFamily: "var(--font-sans)" }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 120 }}>
            <label htmlFor="nr-onb-account-currency" style={FIELD_LABEL_STYLE}>Currency</label>
            <select
              id="nr-onb-account-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as AccountInputCurrency)}
              style={{ ...FIELD_STYLE, fontFamily: "var(--font-mono)" }}
            >
              {ONBOARDING_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 160 }}>
            <label htmlFor="nr-onb-account-balance" style={FIELD_LABEL_STYLE}>Balance today</label>
            <input
              id="nr-onb-account-balance"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              // The native spinner arrows render as a white block on
              // every dark theme and are not themeable. A figure entry
              // in this app is typed, not nudged.
              className="nr-no-spinner"
              style={{ ...FIELD_STYLE, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              border: "1px solid var(--ft-red, var(--ft-border))",
              background: "color-mix(in srgb, var(--ft-red, var(--ft-accent)) 10%, transparent)",
              color: "var(--ft-text)",
              padding: "10px 12px",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {/* The server's own words on their own line — a message
                that may or may not end in a full stop must not be run
                into the next sentence. */}
            <div>{error}</div>
            <div style={{ marginTop: 6, color: "var(--ft-dim)" }}>
              Your setup is saved. You can skip this and add the account later from Accounts.
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => onDone(false)}
            style={{
              background: "none",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              background: "transparent",
              border: `1px solid ${canSubmit ? "var(--ft-accent)" : "var(--ft-border)"}`,
              color: canSubmit ? "var(--ft-accent)" : "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "10px 22px",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : error ? "Try again →" : "Add account →"}
          </button>
        </div>
      </form>
    </>
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
