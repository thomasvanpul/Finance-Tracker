import { useState, useEffect, useRef, useCallback } from "react";
import {
  useCreateTransaction,
  useListAccounts,
  getListTransactionsQueryKey,
  getGetDashboardQueryKey,
  getGetTransactionSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

type TransactionType = "income" | "expense" | "transfer";

const CATEGORIES = [
  "Salary",
  "Freelance",
  "Groceries",
  "Eating Out",
  "Transport",
  "Utilities",
  "Subscriptions",
  "Entertainment",
  "Healthcare",
  "Education",
  "Shopping",
  "Travel",
  "Investments",
  "Rent",
  "Insurance",
  "Savings",
  "Other",
];

const CURRENCIES = ["GBP", "USD", "EUR", "MYR", "SGD"];

const TYPE_CONFIG: Record<TransactionType, { label: string; color: string }> = {
  income: { label: "INCOME", color: "var(--ft-green)" },
  expense: { label: "EXPENSE", color: "var(--ft-red)" },
  transfer: { label: "TRANSFER", color: "var(--ft-accent)" },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildInitialState() {
  return {
    amount: "",
    currency: "GBP",
    type: "expense" as TransactionType,
    description: "",
    category: "",
    accountId: "",
    date: todayIso(),
  };
}

export function QuickAddTransaction({ open, onClose }: Props) {
  const [form, setForm] = useState(buildInitialState);
  const amountRef = useRef<HTMLInputElement>(null);
  const createTransaction = useCreateTransaction();
  const { data: accountsData } = useListAccounts();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const accounts = accountsData ?? [];

  const reset = useCallback(() => {
    setForm(buildInitialState());
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (open) {
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleSubmit = async () => {
    if (!form.amount || !form.accountId) {
      toast({
        title: "Missing fields",
        description: "Amount and account are required.",
        variant: "destructive",
      });
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a positive number.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createTransaction.mutateAsync({
        data: {
          nativeAmount: Math.abs(amount),
          currency: form.currency,
          type: form.type,
          description: form.description,
          category: form.category,
          accountId: parseInt(form.accountId, 10),
          date: form.date,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
      toast({ title: "Transaction added" });
      reset();
      onClose();
    } catch (err) {
      toast({
        title: "Failed to add transaction",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (!open) return null;

  const isPending = createTransaction.isPending;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border2)",
          width: "100%",
          maxWidth: 420,
          fontFamily: "var(--font-mono)",
        }}
      >
        <div
          style={{
            background: "var(--ft-raised)",
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 14px",
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-muted)",
          }}
        >
          <span>
            <span style={{ color: "var(--ft-accent)" }}>·</span> Quick Add
          </span>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--ft-dim)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ft-dim)",
                marginBottom: 6,
              }}
            >
              Amount
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              <input
                ref={amountRef}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                style={{
                  flex: 1,
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  borderRight: "none",
                  color: TYPE_CONFIG[form.type].color,
                  fontFamily: "var(--font-mono)",
                  fontSize: 24,
                  fontWeight: 700,
                  padding: "8px 12px",
                  outline: "none",
                  minWidth: 0,
                }}
              />
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                style={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-muted)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "0 10px",
                  cursor: "pointer",
                  outline: "none",
                  flexShrink: 0,
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ft-dim)",
                marginBottom: 6,
              }}
            >
              Type
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              {(["expense", "income", "transfer"] as TransactionType[]).map((t, i) => {
                const active = form.type === t;
                const cfg = TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      background: active ? cfg.color : "var(--ft-raised)",
                      border: `1px solid ${active ? cfg.color : "var(--ft-border)"}`,
                      color: active ? "var(--ft-surface)" : "var(--ft-dim)",
                      cursor: "pointer",
                      marginLeft: i > 0 ? -1 : 0,
                      position: "relative",
                      zIndex: active ? 1 : 0,
                      transition: "all 0.1s",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ft-dim)",
                marginBottom: 6,
              }}
            >
              Description
            </div>
            <input
              type="text"
              placeholder="e.g. Tesco weekly shop"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-text)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: "7px 10px",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                  marginBottom: 6,
                }}
              >
                Category
              </div>
              <input
                type="text"
                list="qa-categories"
                placeholder="Select or type"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  padding: "7px 10px",
                  outline: "none",
                }}
              />
              <datalist id="qa-categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ft-dim)",
                  marginBottom: 6,
                }}
              >
                Date
              </div>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  padding: "7px 10px",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ft-dim)",
                marginBottom: 6,
              }}
            >
              Account
            </div>
            <select
              value={form.accountId}
              onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
              style={{
                width: "100%",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: form.accountId ? "var(--ft-text)" : "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: "7px 10px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="" disabled>
                Select account
              </option>
              {accounts.map((a: { id: number; name: string; currency: string }) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 2 }}>
            <button
              onClick={handleClose}
              style={{
                background: "none",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-muted)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                padding: "6px 14px",
                cursor: "pointer",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              style={{
                background: isPending ? "var(--ft-border)" : TYPE_CONFIG[form.type].color,
                border: "none",
                color: isPending ? "var(--ft-dim)" : "var(--ft-surface)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                padding: "6px 18px",
                cursor: isPending ? "not-allowed" : "pointer",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                transition: "all 0.1s",
              }}
            >
              {isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useQuickAdd(): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "n" || e.key === "N") {
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, close };
}
