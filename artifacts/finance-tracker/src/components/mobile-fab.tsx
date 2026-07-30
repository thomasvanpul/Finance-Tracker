import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileSheet } from "@/components/mobile-sheet";
import { Button } from "@/components/ui/button";
import {
  useCreateTransaction,
  useListAccounts,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { applyAutoCategory } from "@/lib/auto-cat";

const CATEGORIES = [
  "Food & Drink","Shopping","Transport","Subscriptions","Housing","Entertainment",
  "Health","Travel","Education","Income","Savings","Investments","Transfer","Other",
];

type TxType = "income" | "expense" | "transfer";

const makeEmpty = () => ({
  date: new Date().toISOString().slice(0, 10),
  description: "",
  type: "expense" as TxType,
  category: "Other",
  nativeAmount: "",
  currency: "GBP",
  accountId: "",
});

const FAB_PAGES = ["/transactions", "/accounts", "/budget", "/", "/dashboard"];

export function MobileFab() {
  const isMobile = useIsMobile();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(makeEmpty);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTx = useCreateTransaction();
  const { data: accounts } = useListAccounts();

  const visible = isMobile && (location === "/" || FAB_PAGES.some(p => location === p || location.startsWith(p + "?")));

  const openFab = useCallback(() => {
    haptic.light();
    setForm(makeEmpty());
    setOpen(true);
  }, []);

  const handleDesc = (desc: string) => {
    const cat = applyAutoCategory(desc);
    setForm(f => ({ ...f, description: desc, category: cat ?? f.category }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.nativeAmount);
    if (!form.description || isNaN(amount) || amount <= 0 || !form.accountId) {
      toast({ title: "Fill in all fields", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      await createTx.mutateAsync({
        data: {
          date: form.date, description: form.description, type: form.type,
          category: form.category, accountId: parseInt(form.accountId),
          nativeAmount: amount, currency: form.currency,
        },
      });
      await queryClient.invalidateQueries();
      setOpen(false);
      haptic.success();
      toast({ title: "Transaction added" });
    } catch {
      toast({ title: "Failed to add", variant: "destructive" }); haptic.error();
    } finally { setSubmitting(false); }
  };

  if (!visible) return null;

  const STYLE: React.CSSProperties = {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    padding: "6px 10px",
    background: "var(--ft-base)",
    border: "1px solid var(--ft-border2)",
    color: "var(--ft-text)",
    outline: "none",
    borderRadius: 2,
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <>
      {/* FAB button */}
      <button
        type="button"
        onClick={openFab}
        aria-label="Add transaction"
        style={{
          position: "fixed",
          right: 16,
          bottom: `calc(68px + env(safe-area-inset-bottom, 0px))`,
          width: 44,
          height: 44,
          borderRadius: 2,
          background: "var(--ft-raised)",
          color: "var(--ft-text)",
          border: "1px solid var(--ft-border2)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 40,
        }}
      >
        <Plus style={{ width: 18, height: 18 }} />
      </button>

      {/* Quick-add sheet */}
      <MobileSheet
        open={open}
        onOpenChange={setOpen}
        title="Quick Add Transaction"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="fab-tx-form" disabled={submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        <form id="fab-tx-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Type toggle */}
          <div style={{ display: "flex", gap: 0, borderRadius: 2, overflow: "hidden", border: "1px solid var(--ft-border2)" }}>
            {(["expense", "income", "transfer"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { haptic.selection(); setForm(f => ({ ...f, type: t })); }}
                style={{
                  flex: 1, padding: "7px 0", fontSize: 10, fontFamily: "var(--font-mono)",
                  fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  border: "none", cursor: "pointer",
                  background: form.type === t ? (t === "income" ? "var(--ft-green)" : t === "expense" ? "var(--ft-red)" : "var(--ft-blue)") : "var(--ft-base)",
                  color: form.type === t ? "var(--ft-base)" : "var(--ft-dim)",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Amount */}
          <input
            type="number"
            placeholder="0.00"
            value={form.nativeAmount}
            onChange={e => setForm(f => ({ ...f, nativeAmount: e.target.value }))}
            step="0.01"
            min="0"
            inputMode="decimal"
            autoFocus
            style={{ ...STYLE, fontSize: 24, fontWeight: 700, textAlign: "center", padding: "10px", letterSpacing: "-0.02em", color: form.type === "income" ? "var(--ft-green)" : form.type === "expense" ? "var(--ft-red)" : "var(--ft-blue)" }}
          />

          {/* Description + date row */}
          <input
            type="text"
            placeholder="Description"
            value={form.description}
            onChange={e => handleDesc(e.target.value)}
            className="ft-filter-input"
            style={STYLE}
          />

          {/* Category */}
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="ft-filter-input" style={STYLE}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Account */}
          <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="ft-filter-input" style={{ ...STYLE, color: form.accountId ? "var(--ft-text)" : "var(--ft-dim)" }}>
            <option value="">Select account…</option>
            {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* Date */}
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="ft-filter-input" style={STYLE} />

          <div style={{ height: 8 }} />
        </form>
      </MobileSheet>
    </>
  );
}
