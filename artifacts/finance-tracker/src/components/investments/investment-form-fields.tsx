// The add/edit position form, as one component.
//
// It used to be a `const FormFields = (...)` JSX value inside
// pages/investments.tsx, closed over that page's `form` state, its
// `setField`, `handleTickerChange` and `effectiveCostPerShare`. That
// worked for the two desktop dialogs on that page and nothing else,
// which is why the market persona's primary action was dead on the
// phone: the FAB navigates to /investments?add=1, and the phone had no
// way to render this form.
//
// Everything it needed was a pure function of `form`, so the whole
// closure moved in here with it. The page owns the state and the
// submit; this owns the fields. Both surfaces render this one
// implementation — a second rendering of the same form is the thing
// the E4 refactor commits were removing, not something to reintroduce.

import type React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MonoLabel, Text } from "@/components/primitives";
import type { InputMode, InvForm, AssetClass } from "@/pages/investments/types";
import { ASSET_CLASSES, detectExchange, detectAssetClass } from "@/pages/investments/types";

const INP: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 };

// Cost per share including fees, in the position's native currency.
//
// Exported, but not yet the only copy: pages/investments.tsx
// getSubmitData() computes the same figure inline for the value it
// actually writes. The two agree for every shares > 0 input, and the
// form marks shares required, so they cannot disagree in practice
// today — but they are two copies of one piece of money arithmetic,
// and that is how a shown figure and a saved figure drift apart.
// Collapsing them touches the write path, which this extraction was
// not asked to do; the export is here so it can be done deliberately.
export function computeEffectiveCostPerShare(form: InvForm): number | null {
  const fees = parseFloat(form.fees || "0") || 0;
  if (form.inputMode === "totalCost") {
    const sh = parseFloat(form.totalShares) || 0;
    const tc = parseFloat(form.totalCost) || 0;
    return sh > 0 ? (tc + fees) / sh : null;
  }
  const sh = parseFloat(form.shares) || 0;
  const cpp = parseFloat(form.costPricePerShare) || 0;
  return sh > 0 ? cpp + fees / sh : null;
}

export interface InvestmentFormFieldsProps {
  form: InvForm;
  setForm: React.Dispatch<React.SetStateAction<InvForm>>;
  /** Prefix for input ids, so two instances on one page keep labels bound. */
  idPrefix?: string;
}

export function InvestmentFormFields({ form, setForm, idPrefix = "inv" }: InvestmentFormFieldsProps) {
  const setField = <K extends keyof InvForm>(k: K, v: InvForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Typing a ticker also settles the currency and, on a still-empty
  // field, the asset class — both derived from the symbol itself.
  const handleTickerChange = (raw: string) => {
    const t = raw.toUpperCase();
    const exchInfo = detectExchange(t);
    const autoClass = t.length >= 2 ? detectAssetClass(t) : "";
    setForm((f) => ({
      ...f,
      ticker: t,
      nativeCurrency: exchInfo?.currency ?? f.nativeCurrency,
      assetClass: f.assetClass || autoClass,
    }));
  };

  const effectiveCostPerShare = computeEffectiveCostPerShare(form);
  const id = (s: string) => `${idPrefix}-${s}`;

  return (
    <div className="space-y-4">
      {/* Row 1: Ticker + Date */}
      <div className="ft-two-col grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={id("ticker")}>Ticker Symbol</Label>
          <Input id={id("ticker")} placeholder="e.g. VOO or 0700.HK" style={INP}
            value={form.ticker} onChange={(e) => handleTickerChange(e.target.value)} required />
          {form.ticker && (() => {
            const ex = detectExchange(form.ticker);
            return ex ? (
              <Text as="div" mono size={10} color="var(--ft-muted)">
                {ex.label} · {ex.currency}
              </Text>
            ) : (
              <Text as="div" mono size={10} color="var(--ft-muted)">
                US market · {form.nativeCurrency}
              </Text>
            );
          })()}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("date")}>Buy Date</Label>
          <Input id={id("date")} type="date" value={form.buyDate} onChange={(e) => setField("buyDate", e.target.value)} required />
        </div>
      </div>

      {/* Company name */}
      <div className="space-y-1.5">
        <Label htmlFor={id("name")}>Company / Fund Name</Label>
        <Input id={id("name")} placeholder="e.g. Vanguard S&P 500 ETF" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
      </div>

      {/* Asset class */}
      <div className="space-y-1.5">
        <Label>Asset Class</Label>
        <Select value={form.assetClass || (form.ticker ? detectAssetClass(form.ticker) : "Stock")}
          onValueChange={(v) => setField("assetClass", v as AssetClass)}>
          <SelectTrigger style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSET_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {form.ticker && !form.assetClass && (
          <Text as="div" mono size={10} color="var(--ft-blue)">
            Auto-detected: {detectAssetClass(form.ticker)}
          </Text>
        )}
      </div>

      {/* Input mode toggle */}
      <div className="space-y-1.5">
        <Label>Input Method</Label>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--ft-border2)", borderRadius: 2, overflow: "hidden" }}>
          {(["perShare", "totalCost"] as InputMode[]).map((mode) => (
            <button key={mode} type="button"
              onClick={() => setField("inputMode", mode)}
              style={{
                flex: 1, padding: "6px 10px", fontSize: 10, fontWeight: 600,
                fontFamily: "var(--font-mono)", letterSpacing: "0.06em",
                border: "none", cursor: "pointer", transition: "background 0.1s",
                background: form.inputMode === mode ? "var(--ft-accent)" : "var(--ft-raised)",
                color: form.inputMode === mode ? "var(--ft-base)" : "var(--ft-muted)",
              }}
            >
              {mode === "perShare" ? "Per Share" : "Total Cost"}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic price inputs */}
      {form.inputMode === "perShare" ? (
        <div className="ft-two-col grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("shares")}>Number of Shares</Label>
            <Input id={id("shares")} type="number" step="0.0001" min="0" placeholder="10" style={INP}
              value={form.shares} onChange={(e) => setField("shares", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("cost")}>Cost per Share ({form.nativeCurrency})</Label>
            <Input id={id("cost")} type="number" step="0.0001" min="0" placeholder="420.50" style={INP}
              value={form.costPricePerShare} onChange={(e) => setField("costPricePerShare", e.target.value)} required />
          </div>
        </div>
      ) : (
        <div className="ft-two-col grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("total-shares")}>Number of Shares</Label>
            <Input id={id("total-shares")} type="number" step="0.0001" min="0" placeholder="10" style={INP}
              value={form.totalShares} onChange={(e) => setField("totalShares", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("total-cost")}>Total Amount Paid ({form.nativeCurrency})</Label>
            <Input id={id("total-cost")} type="number" step="0.01" min="0" placeholder="4205.00" style={INP}
              value={form.totalCost} onChange={(e) => setField("totalCost", e.target.value)} required />
          </div>
        </div>
      )}

      {/* Transaction fees */}
      <div className="space-y-1.5">
        <Label htmlFor={id("fees")}>Transaction Fees ({form.nativeCurrency}) <Text as="span" weight={400} color="var(--ft-muted)">— optional</Text></Label>
        <Input id={id("fees")} type="number" step="0.01" min="0" placeholder="0.00" style={INP}
          value={form.fees} onChange={(e) => setField("fees", e.target.value)} />
      </div>

      {/* Effective cost summary */}
      {effectiveCostPerShare !== null && effectiveCostPerShare > 0 && (
        <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <MonoLabel as="span" size={10} color="var(--ft-muted)" letterSpacing="0.06em">Effective Cost / Share</MonoLabel>
          <Text as="span" mono size={13} weight={700} color="var(--ft-accent)">
            {effectiveCostPerShare.toFixed(4)} {form.nativeCurrency}
          </Text>
        </div>
      )}
    </div>
  );
}
