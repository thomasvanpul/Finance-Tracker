import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderType =
  | "limit-buy"
  | "limit-sell"
  | "stop-loss"
  | "stop-limit"
  | "trailing-stop";

interface WatchlistOrder {
  id: string;
  ticker: string;
  name: string;
  orderType: OrderType;
  targetPrice: number;
  stopLimitPrice?: number;
  trailingPercent?: number;
  quantity?: number;
  notes?: string;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

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

interface OrdersTabProps {
  quoteMap: Map<string, QuoteData>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = "ft-inv-orders";

const ORDER_TYPE_META: Record<
  OrderType,
  { label: string; color: string; bg: string; edu: string }
> = {
  "limit-buy": {
    label: "Limit Buy",
    color: "var(--ft-green)",
    bg: "rgba(63,185,80,0.1)",
    edu: "Only executes if price drops to or below your target. You control the entry price but risk missing the trade if the stock never reaches it.",
  },
  "limit-sell": {
    label: "Limit Sell",
    color: "var(--ft-green)",
    bg: "rgba(63,185,80,0.1)",
    edu: "Only executes if price rises to or above your target. Locks in your desired exit price but may not fill in a falling market.",
  },
  "stop-loss": {
    label: "Stop Loss",
    color: "var(--ft-red)",
    bg: "rgba(248,81,73,0.1)",
    edu: "Triggers a market sell if price falls to your stop. Protects against large losses but can result in worse prices during fast moves (slippage).",
  },
  "stop-limit": {
    label: "Stop-Limit",
    color: "var(--ft-amber)",
    bg: "rgba(230,162,60,0.1)",
    edu: "Like a stop loss but converts to a limit order when triggered — prevents selling below your limit price in a fast-moving market. Risk: may not execute at all if price gaps through your limit.",
  },
  "trailing-stop": {
    label: "Trailing Stop",
    color: "var(--ft-cyan)",
    bg: "rgba(34,211,238,0.1)",
    edu: "Stop price moves up with the stock, locking in gains as price rises. If the stock reverses by your set percentage, the stop triggers a market sell.",
  },
};

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function readOrders(): WatchlistOrder[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as WatchlistOrder[]) : [];
  } catch {
    return [];
  }
}

function writeOrders(orders: WatchlistOrder[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(orders));
  } catch {
    // storage unavailable
  }
}

function isTriggered(order: WatchlistOrder, currentPrice: number | undefined): boolean {
  if (currentPrice == null) return false;
  switch (order.orderType) {
    case "limit-buy":
      return currentPrice <= order.targetPrice;
    case "limit-sell":
      return currentPrice >= order.targetPrice;
    case "stop-loss":
      return currentPrice <= order.targetPrice;
    case "stop-limit":
      return currentPrice <= order.targetPrice;
    case "trailing-stop":
      // Simplified: treat targetPrice as the effective stop price
      return currentPrice <= order.targetPrice;
    default:
      return false;
  }
}

function genId(): string {
  return `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function EduTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ft-dim)",
          fontSize: 10,
          padding: "0 2px",
          verticalAlign: "middle",
        }}
        title="What is this order type?"
      >
        ?
      </button>
      {show && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            left: 16,
            top: -4,
            width: 260,
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border2)",
            padding: "8px 10px",
            fontSize: 11,
            color: "var(--ft-muted)",
            lineHeight: 1.5,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OrdersTab({ quoteMap }: OrdersTabProps) {
  const [orders, setOrders] = useState<WatchlistOrder[]>(() => readOrders());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    name: "",
    orderType: "limit-buy" as OrderType,
    targetPrice: "",
    stopLimitPrice: "",
    trailingPercent: "",
    quantity: "",
    notes: "",
  });

  // Persist on change
  useEffect(() => {
    writeOrders(orders);
  }, [orders]);

  // Auto-detect triggers when quoteMap updates
  useEffect(() => {
    setOrders((prev) =>
      prev.map((order) => {
        const current = quoteMap.get(order.ticker)?.price;
        const triggered = isTriggered(order, current);
        if (triggered && !order.triggered) {
          return { ...order, triggered: true, triggeredAt: new Date().toISOString() };
        }
        return order;
      })
    );
  }, [quoteMap]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newOrder: WatchlistOrder = {
      id: genId(),
      ticker: form.ticker.toUpperCase(),
      name: form.name,
      orderType: form.orderType,
      targetPrice: parseFloat(form.targetPrice),
      stopLimitPrice: form.stopLimitPrice ? parseFloat(form.stopLimitPrice) : undefined,
      trailingPercent: form.trailingPercent ? parseFloat(form.trailingPercent) : undefined,
      quantity: form.quantity ? parseFloat(form.quantity) : undefined,
      notes: form.notes || undefined,
      createdAt: new Date().toISOString(),
      triggered: false,
    };
    setOrders((prev) => [newOrder, ...prev]);
    setForm({
      ticker: "",
      name: "",
      orderType: "limit-buy",
      targetPrice: "",
      stopLimitPrice: "",
      trailingPercent: "",
      quantity: "",
      notes: "",
    });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const clearTriggered = () => {
    setOrders((prev) => prev.filter((o) => !o.triggered));
  };

  const triggeredCount = orders.filter((o) => o.triggered).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--ft-amber)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Watchlist & Order Alerts
          </div>
          <div style={{ fontSize: 11, color: "var(--ft-dim)", marginTop: 2 }}>
            Track price targets and order conditions — simulated, not connected to a broker
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {triggeredCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTriggered}
              style={{ fontSize: 11, color: "var(--ft-dim)", border: "1px solid var(--ft-border)" }}
            >
              Clear {triggeredCount} triggered
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            style={{
              background: "var(--ft-amber)",
              color: "var(--ft-base)",
              border: "none",
              borderRadius: 2,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
            Add Alert
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border2)",
            padding: 16,
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
            New Order Alert
          </div>
          <form onSubmit={handleAdd}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Ticker</Label>
                <Input
                  placeholder="e.g. AAPL"
                  value={form.ticker}
                  onChange={(e) => setField("ticker", e.target.value.toUpperCase())}
                  required
                  style={{ fontSize: 12, height: 32 }}
                />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Security Name</Label>
                <Input
                  placeholder="e.g. Apple Inc."
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  required
                  style={{ fontSize: 12, height: 32 }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Order Type</Label>
                <select
                  value={form.orderType}
                  onChange={(e) => setField("orderType", e.target.value as OrderType)}
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
                  {(Object.keys(ORDER_TYPE_META) as OrderType[]).map((t) => (
                    <option key={t} value={t}>
                      {ORDER_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Target Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 150.00"
                  value={form.targetPrice}
                  onChange={(e) => setField("targetPrice", e.target.value)}
                  required
                  style={{ fontSize: 12, height: 32 }}
                />
              </div>
            </div>
            {form.orderType === "stop-limit" && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                  <Label style={{ fontSize: 11 }}>Limit Price (floor)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 145.00"
                    value={form.stopLimitPrice}
                    onChange={(e) => setField("stopLimitPrice", e.target.value)}
                    style={{ fontSize: 12, height: 32 }}
                  />
                </div>
              </div>
            )}
            {form.orderType === "trailing-stop" && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1">
                  <Label style={{ fontSize: 11 }}>Trailing % (from high)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="50"
                    placeholder="e.g. 10"
                    value={form.trailingPercent}
                    onChange={(e) => setField("trailingPercent", e.target.value)}
                    style={{ fontSize: 12, height: 32 }}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Quantity (optional)</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="e.g. 100"
                  value={form.quantity}
                  onChange={(e) => setField("quantity", e.target.value)}
                  style={{ fontSize: 12, height: 32 }}
                />
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 11 }}>Notes (optional)</Label>
                <Input
                  placeholder="e.g. support level retest"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  style={{ fontSize: 12, height: 32 }}
                />
              </div>
            </div>
            {/* Edu callout for selected order type */}
            <div
              style={{
                background: ORDER_TYPE_META[form.orderType].bg,
                border: `1px solid ${ORDER_TYPE_META[form.orderType].color}33`,
                padding: "6px 10px",
                fontSize: 11,
                color: "var(--ft-muted)",
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: ORDER_TYPE_META[form.orderType].color,
                  marginRight: 6,
                }}
              >
                {ORDER_TYPE_META[form.orderType].label}:
              </span>
              {ORDER_TYPE_META[form.orderType].edu}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="submit"
                size="sm"
                style={{
                  background: "var(--ft-amber)",
                  color: "var(--ft-base)",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Add Alert
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                style={{ fontSize: 12, color: "var(--ft-dim)" }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Orders table */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 12px",
            background: "rgba(230,162,60,0.07)",
            borderBottom: "1px solid rgba(230,162,60,0.2)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--ft-amber)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            ▼ Active Alerts — {orders.length} total · {triggeredCount} triggered
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  ["TICKER", "left"],
                  ["ORDER TYPE", "left"],
                  ["TARGET", "right"],
                  ["CURRENT", "right"],
                  ["DISTANCE", "right"],
                  ["QTY", "right"],
                  ["NOTES", "left"],
                  ["STATUS", "center"],
                  ["", "right"],
                ].map(([h, align]) => (
                  <th key={h} style={{ ...TH, textAlign: align as "left" | "right" | "center" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      textAlign: "center",
                      padding: "32px 16px",
                      fontSize: 12,
                      color: "var(--ft-dim)",
                    }}
                  >
                    No order alerts yet — add one to start tracking price targets.
                  </td>
                </tr>
              )}
              {orders.map((order) => {
                const currentPrice = quoteMap.get(order.ticker)?.price;
                const triggered = order.triggered || isTriggered(order, currentPrice);
                const meta = ORDER_TYPE_META[order.orderType];
                const distance =
                  currentPrice != null
                    ? ((order.targetPrice - currentPrice) / currentPrice) * 100
                    : null;
                const isBuy = order.orderType === "limit-buy";
                const rowBg = triggered
                  ? "rgba(88,166,255,0.06)"
                  : "var(--ft-base)";

                return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: "1px solid rgba(33,38,45,0.5)",
                      background: rowBg,
                    }}
                  >
                    <td
                      style={{
                        padding: "7px 10px",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        color: "var(--ft-blue)",
                        fontSize: 12,
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      {order.ticker}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      <span
                        style={{
                          padding: "2px 6px",
                          background: meta.bg,
                          color: meta.color,
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          borderRadius: 2,
                        }}
                      >
                        {meta.label}
                      </span>
                      <EduTooltip text={meta.edu} />
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        textAlign: "right",
                        fontFamily: "var(--font-mono)",
                        color: isBuy ? "var(--ft-green)" : "var(--ft-red)",
                        fontWeight: 600,
                        fontSize: 12,
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      ${order.targetPrice.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        textAlign: "right",
                        fontFamily: "var(--font-mono)",
                        color: "var(--ft-text)",
                        fontSize: 12,
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      {currentPrice != null ? `$${currentPrice.toFixed(2)}` : "—"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        textAlign: "right",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color:
                          distance == null
                            ? "var(--ft-dim)"
                            : distance > 0
                            ? "var(--ft-green)"
                            : "var(--ft-red)",
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      {distance != null
                        ? `${distance > 0 ? "+" : ""}${distance.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        textAlign: "right",
                        color: "var(--ft-muted)",
                        fontSize: 11,
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      {order.quantity ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        color: "var(--ft-dim)",
                        fontSize: 11,
                        borderRight: "1px solid var(--ft-border)",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {order.notes ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "7px 10px",
                        textAlign: "center",
                        borderRight: "1px solid var(--ft-border)",
                      }}
                    >
                      {triggered ? (
                        <span
                          style={{
                            padding: "2px 6px",
                            background: "rgba(88,166,255,0.15)",
                            color: "var(--ft-blue)",
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                            borderRadius: 2,
                          }}
                        >
                          ⚡ TRIGGERED
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: "2px 6px",
                            background: "rgba(63,185,80,0.08)",
                            color: "var(--ft-green)",
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            borderRadius: 2,
                          }}
                        >
                          WATCHING
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "right" }}>
                      <button
                        onClick={() => handleDelete(order.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          color: "var(--ft-red)",
                          opacity: 0.6,
                        }}
                        title="Delete alert"
                      >
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
    </div>
  );
}
