import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  blackScholes,
  intrinsicValue,
  timeValue,
  type BlackScholesResult,
} from "./black-scholes";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuoteData {
  ticker: string;
  price: number;
  currency: string;
  pe?: number | null;
  forwardPe?: number | null;
  eps?: number | null;
  low52w?: number | null;
  high52w?: number | null;
  marketCap?: number | null;
  beta?: number | null;
  dividendYield?: number | null;
  analystTargetPrice?: number | null;
}

interface OptionsPosition {
  id: string;
  ticker: string;
  type: "call" | "put";
  strike: number;
  expiry: string; // ISO date string YYYY-MM-DD
  contracts: number; // each contract = 100 shares
  premiumPaid: number; // per share
  direction: "long" | "short";
  createdAt: string;
}

interface FuturesPosition {
  id: string;
  symbol: string;
  direction: "long" | "short";
  contracts: number;
  entryPrice: number;
  contractSize: number; // notional per unit
  marginPosted: number;
  expiry: string;
  currentPrice?: number; // manual override
  createdAt: string;
}

interface DerivativesTabProps {
  quoteMap: Map<string, QuoteData>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_OPTIONS_KEY = "ft-options-positions";
const LS_FUTURES_KEY = "ft-futures-positions";

const TH: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  whiteSpace: "nowrap" as const,
};

const GREEKS_META: {
  key: keyof BlackScholesResult;
  callKey?: keyof BlackScholesResult;
  putKey?: keyof BlackScholesResult;
  label: string;
  edu: string;
  format: (v: number) => string;
}[] = [
  {
    key: "callDelta",
    callKey: "callDelta",
    putKey: "putDelta",
    label: "Delta (Δ)",
    edu: "For every $1 the stock moves, this option moves by Δ dollars. Call delta is positive (0 to 1); put delta is negative (−1 to 0).",
    format: (v) => v.toFixed(4),
  },
  {
    key: "gamma",
    label: "Gamma (Γ)",
    edu: "The rate of change of Delta per $1 move in the stock. High gamma means Delta changes rapidly — important near expiry and ATM.",
    format: (v) => v.toFixed(5),
  },
  {
    key: "vega",
    label: "Vega (ν) per 1% vol",
    edu: "How much the option price changes when implied volatility rises by 1%. Longer-dated options have higher vega.",
    format: (v) => `$${v.toFixed(4)}`,
  },
  {
    key: "callTheta",
    callKey: "callTheta",
    putKey: "putTheta",
    label: "Theta (Θ) per day",
    edu: "Time decay — how much value the option loses per calendar day, all else equal. Theta is negative for long options (you lose time value every day).",
    format: (v) => `$${v.toFixed(4)}`,
  },
  {
    key: "callRho",
    callKey: "callRho",
    putKey: "putRho",
    label: "Rho (ρ) per 1% rate",
    edu: "Sensitivity to risk-free rate. Calls benefit from rising rates; puts are hurt. Rho is small for short-dated options.",
    format: (v) => `$${v.toFixed(4)}`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readOptions(): OptionsPosition[] {
  try {
    const raw = localStorage.getItem(LS_OPTIONS_KEY);
    return raw ? (JSON.parse(raw) as OptionsPosition[]) : [];
  } catch {
    return [];
  }
}

function writeOptions(pos: OptionsPosition[]): void {
  try {
    localStorage.setItem(LS_OPTIONS_KEY, JSON.stringify(pos));
  } catch {
    // storage unavailable
  }
}

function readFutures(): FuturesPosition[] {
  try {
    const raw = localStorage.getItem(LS_FUTURES_KEY);
    return raw ? (JSON.parse(raw) as FuturesPosition[]) : [];
  } catch {
    return [];
  }
}

function writeFutures(pos: FuturesPosition[]): void {
  try {
    localStorage.setItem(LS_FUTURES_KEY, JSON.stringify(pos));
  } catch {
    // storage unavailable
  }
}

function genId(): string {
  return `drv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function yearsToExpiry(expiryDate: string): number {
  const expMs = new Date(expiryDate).getTime();
  const nowMs = Date.now();
  return Math.max(0, (expMs - nowMs) / (365.25 * 24 * 60 * 60 * 1000));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EduCallout({ title, color, bg, border, children }: {
  title: string;
  color: string;
  bg: string;
  border: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${border}`, background: bg, marginBottom: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {open ? "▼" : "▶"} {title}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 12px 12px",
            fontSize: 12,
            color: "var(--ft-muted)",
            lineHeight: 1.7,
            borderTop: `1px solid ${border}`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Black-Scholes Calculator ──────────────────────────────────────────────────

interface BSCalcProps {
  quoteMap: Map<string, QuoteData>;
}

function BSCalculator({ quoteMap }: BSCalcProps) {
  const [calcTicker, setCalcTicker] = useState("");
  const [spot, setSpot] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [vol, setVol] = useState("20");
  const [rfr, setRfr] = useState("5");
  const [result, setResult] = useState<BlackScholesResult | null>(null);
  const [optType, setOptType] = useState<"call" | "put">("call");

  // Auto-fill spot from quoteMap
  useEffect(() => {
    const q = quoteMap.get(calcTicker.toUpperCase());
    if (q) {
      setSpot(q.price.toFixed(2));
    }
  }, [calcTicker, quoteMap]);

  const compute = () => {
    const S = parseFloat(spot);
    const K = parseFloat(strike);
    const T = expiry ? yearsToExpiry(expiry) : 0;
    const r = parseFloat(rfr) / 100;
    const sigma = parseFloat(vol) / 100;
    if (isNaN(S) || isNaN(K) || isNaN(r) || isNaN(sigma)) return;
    setResult(blackScholes(S, K, T, r, sigma));
  };

  const iv = result
    ? intrinsicValue(optType, parseFloat(spot) || 0, parseFloat(strike) || 0)
    : null;
  const tv =
    result != null && iv != null
      ? timeValue(optType === "call" ? result.callPrice : result.putPrice, iv)
      : null;

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border2)",
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--ft-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 12,
        }}
      >
        Black-Scholes Calculator
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Ticker (auto-fill spot)</Label>
          <Input
            placeholder="e.g. AAPL"
            value={calcTicker}
            onChange={(e) => setCalcTicker(e.target.value)}
            style={{ fontSize: 12, height: 32 }}
          />
        </div>
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Option Type</Label>
          <select
            value={optType}
            onChange={(e) => setOptType(e.target.value as "call" | "put")}
            style={{
              width: "100%",
              height: 32,
              fontSize: 12,
              background: "var(--ft-base)",
              color: "var(--ft-text)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 4,
              padding: "0 8px",
            }}
          >
            <option value="call">Call</option>
            <option value="put">Put</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Spot Price (S)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 185.00"
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
            style={{ fontSize: 12, height: 32 }}
          />
        </div>
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Strike Price (K)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g. 190.00"
            value={strike}
            onChange={(e) => setStrike(e.target.value)}
            style={{ fontSize: 12, height: 32 }}
          />
        </div>
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Expiry Date</Label>
          <Input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            style={{ fontSize: 12, height: 32 }}
          />
        </div>
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Implied Vol %</Label>
          <Input
            type="number"
            step="0.5"
            min="1"
            max="200"
            placeholder="e.g. 20"
            value={vol}
            onChange={(e) => setVol(e.target.value)}
            style={{ fontSize: 12, height: 32 }}
          />
        </div>
        <div className="space-y-1">
          <Label style={{ fontSize: 11 }}>Risk-Free Rate %</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            placeholder="e.g. 5"
            value={rfr}
            onChange={(e) => setRfr(e.target.value)}
            style={{ fontSize: 12, height: 32 }}
          />
        </div>
      </div>

      <Button
        onClick={compute}
        size="sm"
        style={{
          background: "var(--ft-cyan)",
          color: "var(--ft-base)",
          border: "none",
          borderRadius: 2,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        Calculate
      </Button>

      {result && (
        <div>
          {/* Price output */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              {
                label: "Call Price",
                value: `$${result.callPrice.toFixed(4)}`,
                color: "var(--ft-green)",
              },
              {
                label: "Put Price",
                value: `$${result.putPrice.toFixed(4)}`,
                color: "var(--ft-red)",
              },
              {
                label: "Intrinsic Value",
                value: iv != null ? `$${iv.toFixed(4)}` : "—",
                color: "var(--ft-text)",
              },
              {
                label: "Time Value",
                value: tv != null ? `$${tv.toFixed(4)}` : "—",
                color: "var(--ft-amber)",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "var(--ft-base)",
                  border: "1px solid var(--ft-border)",
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 2 }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: item.color,
                    fontSize: 13,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Greeks table */}
          <div style={{ border: "1px solid var(--ft-border)", overflowX: "auto" }}>
            <div
              style={{
                padding: "5px 10px",
                background: "rgba(34,211,238,0.07)",
                borderBottom: "1px solid rgba(34,211,238,0.2)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--ft-cyan)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Greeks (for {optType})
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Greek", "Value", "Plain English"].map((h) => (
                    <th
                      key={h}
                      style={{
                        ...TH,
                        textAlign: h === "Value" ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GREEKS_META.map((g) => {
                  let val: number;
                  if (optType === "call") {
                    val = result[g.callKey ?? g.key] as number;
                  } else {
                    val = result[g.putKey ?? g.key] as number;
                  }
                  return (
                    <tr
                      key={g.label}
                      style={{ borderBottom: "1px solid var(--ft-border)" }}
                    >
                      <td
                        style={{
                          padding: "6px 10px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: "var(--ft-cyan)",
                          fontSize: 12,
                          borderRight: "1px solid var(--ft-border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.label}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          color: "var(--ft-text)",
                          fontSize: 12,
                          borderRight: "1px solid var(--ft-border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.format(val)}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          color: "var(--ft-muted)",
                          fontSize: 11,
                          lineHeight: 1.5,
                        }}
                      >
                        {g.edu}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Options Positions Table ───────────────────────────────────────────────────

function OptionsSection({ quoteMap }: { quoteMap: Map<string, QuoteData> }) {
  const [positions, setPositions] = useState<OptionsPosition[]>(() => readOptions());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    type: "call" as "call" | "put",
    strike: "",
    expiry: "",
    contracts: "1",
    premiumPaid: "",
    direction: "long" as "long" | "short",
  });

  useEffect(() => {
    writeOptions(positions);
  }, [positions]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const pos: OptionsPosition = {
      id: genId(),
      ticker: form.ticker.toUpperCase(),
      type: form.type,
      strike: parseFloat(form.strike),
      expiry: form.expiry,
      contracts: parseInt(form.contracts, 10),
      premiumPaid: parseFloat(form.premiumPaid),
      direction: form.direction,
      createdAt: new Date().toISOString(),
    };
    setPositions((prev) => [pos, ...prev]);
    setForm({ ticker: "", type: "call", strike: "", expiry: "", contracts: "1", premiumPaid: "", direction: "long" });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div>
      <EduCallout
        title="What is an option?"
        color="var(--ft-green)"
        bg="rgba(63,185,80,0.05)"
        border="rgba(63,185,80,0.2)"
      >
        <div style={{ paddingTop: 8 }}>
          An <strong style={{ color: "var(--ft-text)" }}>option</strong> is a contract giving
          the buyer the right (but not the obligation) to buy or sell an asset at a set price
          (the <em style={{ color: "var(--ft-cyan)" }}>strike</em>) before a given date
          (the <em style={{ color: "var(--ft-cyan)" }}>expiry</em>).
          <br /><br />
          <strong style={{ color: "var(--ft-green)" }}>Call option:</strong> Right to BUY. Profitable if stock rises above strike + premium paid.
          <br />
          <strong style={{ color: "var(--ft-red)" }}>Put option:</strong> Right to SELL. Profitable if stock falls below strike − premium paid.
          <br /><br />
          <strong style={{ color: "var(--ft-amber)" }}>Premium:</strong> The price you pay for the option (max loss as a buyer).
          It consists of <em>intrinsic value</em> (in-the-money amount) + <em>time value</em> (decays daily — theta).
          <br /><br />
          <strong>ITM</strong> = stock is past the strike in your favour.
          <strong> ATM</strong> = stock is at the strike.
          <strong> OTM</strong> = stock hasn't reached the strike yet — option is worth only time value.
        </div>
      </EduCallout>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ft-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Options Positions
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: "var(--ft-green)",
            color: "var(--ft-base)",
            border: "none",
            borderRadius: 2,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <Plus style={{ width: 12, height: 12, marginRight: 4 }} />
          Add Option
        </Button>
      </div>

      {showForm && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: 14, marginBottom: 10 }}>
          <form onSubmit={handleAdd}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Ticker</Label>
                <Input value={form.ticker} onChange={(e) => setField("ticker", e.target.value.toUpperCase())} placeholder="AAPL" required style={{ fontSize: 12, height: 30 }} />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Type</Label>
                <select value={form.type} onChange={(e) => setField("type", e.target.value as "call" | "put")}
                  style={{ width: "100%", height: 30, fontSize: 12, background: "var(--ft-base)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", borderRadius: 4, padding: "0 8px" }}>
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Direction</Label>
                <select value={form.direction} onChange={(e) => setField("direction", e.target.value as "long" | "short")}
                  style={{ width: "100%", height: 30, fontSize: 12, background: "var(--ft-base)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", borderRadius: 4, padding: "0 8px" }}>
                  <option value="long">Long (bought)</option>
                  <option value="short">Short (sold/written)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Strike ($)</Label>
                <Input type="number" step="0.5" value={form.strike} onChange={(e) => setField("strike", e.target.value)} placeholder="190.00" required style={{ fontSize: 12, height: 30 }} />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Expiry Date</Label>
                <Input type="date" value={form.expiry} onChange={(e) => setField("expiry", e.target.value)} required style={{ fontSize: 12, height: 30 }} />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Contracts</Label>
                <Input type="number" min="1" value={form.contracts} onChange={(e) => setField("contracts", e.target.value)} required style={{ fontSize: 12, height: 30 }} />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Premium / share ($)</Label>
                <Input type="number" step="0.01" value={form.premiumPaid} onChange={(e) => setField("premiumPaid", e.target.value)} placeholder="5.50" required style={{ fontSize: 12, height: 30 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" size="sm" style={{ background: "var(--ft-green)", color: "var(--ft-base)", border: "none", fontSize: 11, fontWeight: 600 }}>Add</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)} style={{ fontSize: 11, color: "var(--ft-dim)" }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div style={{ border: "1px solid var(--ft-border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Ticker", "Type", "Dir", "Strike", "Expiry", "Contracts", "Premium Paid", "Spot", "Intrinsic/Share", "Total P&L", ""].map((h, i) => (
                <th key={i} style={{ ...TH, textAlign: ["Contracts", "Premium Paid", "Spot", "Intrinsic/Share", "Total P&L"].includes(h) ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "var(--ft-dim)" }}>
                  No options positions yet.
                </td>
              </tr>
            )}
            {positions.map((pos) => {
              const q = quoteMap.get(pos.ticker);
              const spot = q?.price;
              const iv = spot != null ? intrinsicValue(pos.type, spot, pos.strike) : null;
              const sharesPer = 100;
              const totalCost = pos.premiumPaid * sharesPer * pos.contracts;
              const totalIntrinsic = iv != null ? iv * sharesPer * pos.contracts : null;
              const plTotal = totalIntrinsic != null
                ? pos.direction === "long"
                  ? totalIntrinsic - totalCost
                  : totalCost - totalIntrinsic
                : null;
              const daysToExpiry = Math.max(0, Math.ceil((new Date(pos.expiry).getTime() - Date.now()) / 86400000));

              return (
                <tr key={pos.id} style={{ borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ft-blue)", fontSize: 12, borderRight: "1px solid var(--ft-border)" }}>{pos.ticker}</td>
                  <td style={{ padding: "6px 10px", borderRight: "1px solid var(--ft-border)" }}>
                    <span style={{ padding: "1px 5px", fontSize: 10, fontWeight: 700, borderRadius: 2, background: pos.type === "call" ? "rgba(63,185,80,0.12)" : "rgba(248,81,73,0.12)", color: pos.type === "call" ? "var(--ft-green)" : "var(--ft-red)" }}>
                      {pos.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, color: pos.direction === "long" ? "var(--ft-green)" : "var(--ft-amber)", borderRight: "1px solid var(--ft-border)", fontWeight: 600 }}>{pos.direction}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", color: "var(--ft-text)", fontSize: 12, borderRight: "1px solid var(--ft-border)" }}>${pos.strike.toFixed(2)}</td>
                  <td style={{ padding: "6px 10px", fontSize: 11, color: daysToExpiry < 7 ? "var(--ft-red)" : "var(--ft-muted)", borderRight: "1px solid var(--ft-border)", whiteSpace: "nowrap" }}>
                    {pos.expiry} <span style={{ color: "var(--ft-dim)", fontSize: 10 }}>({daysToExpiry}d)</span>
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-text)", fontSize: 12, borderRight: "1px solid var(--ft-border)" }}>{pos.contracts}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-muted)", fontSize: 12, borderRight: "1px solid var(--ft-border)" }}>${pos.premiumPaid.toFixed(2)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-text)", fontSize: 12, borderRight: "1px solid var(--ft-border)" }}>
                    {spot != null ? `$${spot.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: iv != null && iv > 0 ? "var(--ft-green)" : "var(--ft-dim)", borderRight: "1px solid var(--ft-border)" }}>
                    {iv != null ? `$${iv.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: plTotal == null ? "var(--ft-dim)" : plTotal >= 0 ? "var(--ft-green)" : "var(--ft-red)", borderRight: "1px solid var(--ft-border)" }}>
                    {plTotal != null ? `${plTotal >= 0 ? "+" : ""}$${plTotal.toFixed(0)}` : "—"}
                  </td>
                  <td style={{ padding: "4px 6px" }}>
                    <button onClick={() => handleDelete(pos.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", opacity: 0.6, padding: 4 }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Futures Section ───────────────────────────────────────────────────────────

function FuturesSection({ quoteMap }: { quoteMap: Map<string, QuoteData> }) {
  const [positions, setPositions] = useState<FuturesPosition[]>(() => readFutures());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    direction: "long" as "long" | "short",
    contracts: "1",
    entryPrice: "",
    contractSize: "100",
    marginPosted: "",
    expiry: "",
    currentPrice: "",
  });

  useEffect(() => {
    writeFutures(positions);
  }, [positions]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const pos: FuturesPosition = {
      id: genId(),
      symbol: form.symbol.toUpperCase(),
      direction: form.direction,
      contracts: parseInt(form.contracts, 10),
      entryPrice: parseFloat(form.entryPrice),
      contractSize: parseFloat(form.contractSize),
      marginPosted: parseFloat(form.marginPosted),
      expiry: form.expiry,
      currentPrice: form.currentPrice ? parseFloat(form.currentPrice) : undefined,
      createdAt: new Date().toISOString(),
    };
    setPositions((prev) => [pos, ...prev]);
    setForm({ symbol: "", direction: "long", contracts: "1", entryPrice: "", contractSize: "100", marginPosted: "", expiry: "", currentPrice: "" });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div>
      <EduCallout
        title="What is a futures contract?"
        color="var(--ft-amber)"
        bg="rgba(230,162,60,0.05)"
        border="rgba(230,162,60,0.2)"
      >
        <div style={{ paddingTop: 8 }}>
          A <strong style={{ color: "var(--ft-text)" }}>futures contract</strong> is a legally binding
          agreement to buy or sell an asset at a predetermined price on a specific date.
          Unlike options, both parties are <em>obligated</em> to fulfil the contract.
          <br /><br />
          <strong style={{ color: "var(--ft-amber)" }}>Leverage:</strong> You only post a fraction of the contract value as margin.
          This amplifies both gains and losses — a 5% price move can mean a 50% gain or loss on margin.
          <br /><br />
          <strong style={{ color: "var(--ft-amber)" }}>Mark-to-Market:</strong> Positions are settled daily.
          If the market moves against you, cash is debited from your account that night.
          <br /><br />
          <strong style={{ color: "var(--ft-amber)" }}>Roll:</strong> Futures expire. Traders who want continuous exposure must
          close the expiring contract and open the next one — this is called "rolling." If the new contract
          costs more (contango), you lose on the roll; if less (backwardation), you gain.
        </div>
      </EduCallout>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Futures Positions
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          style={{ background: "var(--ft-amber)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 11, fontWeight: 600 }}
        >
          <Plus style={{ width: 12, height: 12, marginRight: 4 }} />
          Add Future
        </Button>
      </div>

      {showForm && (
        <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: 14, marginBottom: 10 }}>
          <form onSubmit={handleAdd}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                { label: "Symbol", field: "symbol" as const, placeholder: "ES (E-mini S&P)", type: "text", transform: (v: string) => v.toUpperCase() },
                { label: "Direction", field: "direction" as const, type: "select", options: [{ v: "long", l: "Long" }, { v: "short", l: "Short" }] },
                { label: "Contracts", field: "contracts" as const, placeholder: "1", type: "number" },
                { label: "Entry Price", field: "entryPrice" as const, placeholder: "4500.00", type: "number" },
                { label: "Contract Size", field: "contractSize" as const, placeholder: "50 (E-mini = $50/pt)", type: "number" },
                { label: "Margin Posted ($)", field: "marginPosted" as const, placeholder: "12000", type: "number" },
                { label: "Expiry Date", field: "expiry" as const, type: "date" },
                { label: "Current Price (override)", field: "currentPrice" as const, placeholder: "leave blank for quoteMap", type: "number" },
              ].map((f) => (
                <div key={f.field} className="space-y-1">
                  <Label style={{ fontSize: 11 }}>{f.label}</Label>
                  {f.type === "select" && f.options ? (
                    <select
                      value={form[f.field]}
                      onChange={(e) => setField(f.field, e.target.value as typeof form[typeof f.field])}
                      style={{ width: "100%", height: 30, fontSize: 12, background: "var(--ft-base)", color: "var(--ft-text)", border: "1px solid var(--ft-border2)", borderRadius: 4, padding: "0 8px" }}
                    >
                      {f.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  ) : (
                    <Input
                      type={f.type}
                      step={f.type === "number" ? "any" : undefined}
                      placeholder={f.placeholder}
                      value={form[f.field]}
                      onChange={(e) =>
                        setField(f.field, f.transform ? f.transform(e.target.value) : e.target.value)
                      }
                      required={!["currentPrice"].includes(f.field)}
                      style={{ fontSize: 12, height: 30 }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="submit" size="sm" style={{ background: "var(--ft-amber)", color: "var(--ft-base)", border: "none", fontSize: 11, fontWeight: 600 }}>Add</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)} style={{ fontSize: 11, color: "var(--ft-dim)" }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div style={{ border: "1px solid var(--ft-border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Symbol", "Dir", "Contracts", "Entry", "Current", "Contract Size", "Notional", "Margin", "Mark-to-Mkt P&L", "Return on Margin", "Expiry", ""].map((h, i) => (
                <th key={i} style={{ ...TH, textAlign: ["Contracts", "Entry", "Current", "Contract Size", "Notional", "Margin", "Mark-to-Mkt P&L", "Return on Margin"].includes(h) ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "var(--ft-dim)" }}>
                  No futures positions yet.
                </td>
              </tr>
            )}
            {positions.map((pos) => {
              const q = quoteMap.get(pos.symbol);
              const current = pos.currentPrice ?? q?.price;
              const priceDiff = current != null ? current - pos.entryPrice : null;
              const mtmPl = priceDiff != null
                ? priceDiff * pos.contractSize * pos.contracts * (pos.direction === "long" ? 1 : -1)
                : null;
              const returnOnMargin = mtmPl != null && pos.marginPosted > 0
                ? (mtmPl / pos.marginPosted) * 100
                : null;
              const notional = pos.entryPrice * pos.contractSize * pos.contracts;

              return (
                <tr key={pos.id} style={{ borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ft-blue)", fontSize: 12, borderRight: "1px solid var(--ft-border)" }}>{pos.symbol}</td>
                  <td style={{ padding: "6px 10px", fontSize: 11, color: pos.direction === "long" ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600, borderRight: "1px solid var(--ft-border)" }}>{pos.direction}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", borderRight: "1px solid var(--ft-border)" }}>{pos.contracts}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)", borderRight: "1px solid var(--ft-border)" }}>${pos.entryPrice.toFixed(2)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", borderRight: "1px solid var(--ft-border)" }}>
                    {current != null ? `$${current.toFixed(2)}` : "—"}
                    {pos.currentPrice != null && <span style={{ fontSize: 9, color: "var(--ft-dim)", marginLeft: 4 }}>man.</span>}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)", borderRight: "1px solid var(--ft-border)" }}>${pos.contractSize}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-muted)", borderRight: "1px solid var(--ft-border)" }}>
                    ${(notional / 1000).toFixed(0)}k
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)", borderRight: "1px solid var(--ft-border)" }}>
                    ${pos.marginPosted.toLocaleString()}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: mtmPl == null ? "var(--ft-dim)" : mtmPl >= 0 ? "var(--ft-green)" : "var(--ft-red)", borderRight: "1px solid var(--ft-border)" }}>
                    {mtmPl != null ? `${mtmPl >= 0 ? "+" : ""}$${mtmPl.toFixed(0)}` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: returnOnMargin == null ? "var(--ft-dim)" : returnOnMargin >= 0 ? "var(--ft-green)" : "var(--ft-red)", borderRight: "1px solid var(--ft-border)" }}>
                    {returnOnMargin != null ? `${returnOnMargin >= 0 ? "+" : ""}${returnOnMargin.toFixed(1)}%` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, color: "var(--ft-dim)", whiteSpace: "nowrap", borderRight: "1px solid var(--ft-border)" }}>{pos.expiry}</td>
                  <td style={{ padding: "4px 6px" }}>
                    <button onClick={() => handleDelete(pos.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", opacity: 0.6, padding: 4 }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DerivativesTab({ quoteMap }: DerivativesTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <BSCalculator quoteMap={quoteMap} />
      <div style={{ border: "1px solid var(--ft-border)", padding: 16, background: "var(--ft-base)" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ft-green)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            borderBottom: "1px solid var(--ft-border)",
            paddingBottom: 8,
            marginBottom: 16,
          }}
        >
          ▼ Options Tracker
        </div>
        <OptionsSection quoteMap={quoteMap} />
      </div>
      <div style={{ border: "1px solid var(--ft-border)", padding: 16, background: "var(--ft-base)" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ft-amber)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            borderBottom: "1px solid var(--ft-border)",
            paddingBottom: 8,
            marginBottom: 16,
          }}
        >
          ▼ Futures Tracker
        </div>
        <FuturesSection quoteMap={quoteMap} />
      </div>
    </div>
  );
}
