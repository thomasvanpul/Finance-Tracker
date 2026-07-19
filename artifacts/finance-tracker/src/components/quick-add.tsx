import { useState, useCallback, useRef, useEffect } from "react";
import {
  useCreateTransaction,
  useListAccounts,
  getListTransactionsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Salary", "Freelance", "Groceries", "Eating Out", "Transport",
  "Utilities", "Subscriptions", "Entertainment", "Healthcare",
  "Education", "Shopping", "Travel", "Investments", "Rent",
  "Insurance", "Savings", "Other",
];

type TxType = "expense" | "income";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  date: string;
  description: string;
  amount: string;
  type: TxType;
  category: string;
  accountId: string;
}

function emptyForm(): FormState {
  return { date: todayIso(), description: "", amount: "", type: "expense", category: "", accountId: "" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [feedback, setFeedback] = useState<"idle" | "success" | "error">("idle");
  const amountRef = useRef<HTMLInputElement>(null);

  const createTransaction = useCreateTransaction();
  const { data: accountsData } = useListAccounts({});
  const queryClient = useQueryClient();

  const accounts = accountsData ?? [];

  const openPanel = useCallback(() => {
    setForm(emptyForm());
    setFeedback("idle");
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    setFeedback("idle");
  }, []);

  // Focus amount field on open
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => amountRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closePanel]);

  const setField = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.accountId || isNaN(amount) || amount <= 0) return;

    try {
      await createTransaction.mutateAsync({
        data: {
          date: form.date,
          description: form.description,
          type: form.type,
          category: form.category,
          accountId: parseInt(form.accountId, 10),
          nativeAmount: amount,
          currency: "GBP",
        },
      });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setFeedback("success");
      setTimeout(() => {
        closePanel();
      }, 900);
    } catch {
      setFeedback("error");
      setTimeout(() => setFeedback("idle"), 2500);
    }
  }, [form, createTransaction, queryClient, closePanel]);

  const isPending = createTransaction.isPending;

  const typeColors: Record<TxType, string> = {
    expense: "var(--ft-red)",
    income: "var(--ft-green)",
  };

  return (
    <>
      {/* Floating + button */}
      <button
        aria-label="Quick add transaction"
        onClick={open ? closePanel : openPanel}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 500,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: open ? "var(--ft-raised)" : "var(--ft-accent)",
          border: `1px solid ${open ? "var(--ft-border2)" : "var(--ft-accent)"}`,
          color: open ? "var(--ft-muted)" : "black",
          fontSize: 24,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: open ? "none" : "0 0 16px rgba(244,162,30,0.35), 0 4px 16px rgba(0,0,0,0.5)",
          transition: "all 0.18s",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
        }}
      >
        {open ? "×" : "+"}
      </button>

      {/* Slide-up panel */}
      <div
        style={{
          position: "fixed",
          right: 24,
          bottom: 88,
          zIndex: 500,
          width: 320,
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          fontFamily: "var(--font-mono)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.18s, transform 0.18s",
          pointerEvents: open ? "auto" : "none",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div style={{
          background: "var(--ft-raised)",
          borderBottom: "1px solid var(--ft-border)",
          padding: "0 12px",
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ft-muted)",
        }}>
          <span><span style={{ color: "var(--ft-accent)" }}>·</span> Quick Add Transaction</span>
          <button
            onClick={closePanel}
            style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Date */}
          <div>
            <div style={LABEL}>Date</div>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              style={INPUT}
            />
          </div>

          {/* Description */}
          <div>
            <div style={LABEL}>Description</div>
            <input
              type="text"
              placeholder="e.g. Tesco weekly shop"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              style={INPUT}
            />
          </div>

          {/* Amount */}
          <div>
            <div style={LABEL}>Amount (£)</div>
            <input
              ref={amountRef}
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setField("amount", e.target.value)}
              style={{ ...INPUT, color: typeColors[form.type], fontWeight: 700, fontSize: 18 }}
            />
          </div>

          {/* Type toggle */}
          <div>
            <div style={LABEL}>Type</div>
            <div style={{ display: "flex" }}>
              {(["expense", "income"] as TxType[]).map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField("type", t)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    background: form.type === t ? typeColors[t] : "var(--ft-raised)",
                    border: `1px solid ${form.type === t ? typeColors[t] : "var(--ft-border)"}`,
                    color: form.type === t ? (t === "income" ? "var(--ft-base)" : "var(--ft-base)") : "var(--ft-dim)",
                    cursor: "pointer",
                    marginLeft: i > 0 ? -1 : 0,
                    position: "relative",
                    zIndex: form.type === t ? 1 : 0,
                    transition: "all 0.1s",
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <div style={LABEL}>Category</div>
            <input
              type="text"
              list="qa-float-categories"
              placeholder="Select or type"
              value={form.category}
              onChange={(e) => setField("category", e.target.value)}
              style={INPUT}
            />
            <datalist id="qa-float-categories">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Account */}
          <div>
            <div style={LABEL}>Account</div>
            <select
              required
              value={form.accountId}
              onChange={(e) => setField("accountId", e.target.value)}
              style={{ ...INPUT, cursor: "pointer", color: form.accountId ? "var(--ft-text)" : "var(--ft-dim)" }}
            >
              <option value="" disabled>Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {feedback === "error" && (
            <div style={{ fontSize: 10, color: "var(--ft-red)", textAlign: "center" }}>Failed to add — please try again.</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || feedback === "success"}
            style={{
              background: feedback === "success" ? "var(--ft-green)" : isPending ? "var(--ft-border)" : "var(--ft-accent)",
              border: "none",
              color: feedback === "success" ? "var(--ft-base)" : isPending ? "var(--ft-dim)" : "var(--ft-base)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "8px 0",
              cursor: isPending ? "not-allowed" : "pointer",
              width: "100%",
              transition: "background 0.15s",
            }}
          >
            {feedback === "success" ? "✓ Added" : isPending ? "Adding…" : "Add Transaction"}
          </button>
        </form>
      </div>
    </>
  );
}

// ─── Shared micro styles ──────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontSize: 8,
  fontFamily: "var(--font-mono)",
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 4,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border)",
  color: "var(--ft-text)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "6px 9px",
  outline: "none",
};
