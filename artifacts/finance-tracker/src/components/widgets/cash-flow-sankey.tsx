import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

type TxRow = {
  date: string;
  type: "income" | "expense" | "transfer";
  category: string;
  gbpValue: number;
};

type FlowNode = { label: string; value: number; y: number; h: number };

const W = 520;
const H = 340;
const COL_W = 110;
const NODE_W = 14;
const CENTER_X = W / 2;
const MARGIN_Y = 16;
const GAP = 6;

function groupBy(rows: TxRow[], key: keyof TxRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] || "Other");
    out[k] = (out[k] ?? 0) + Math.abs(r.gbpValue);
  }
  return out;
}

function buildNodes(groups: Record<string, number>, total: number, startY: number): FlowNode[] {
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const usable = H - MARGIN_Y * 2 - GAP * (entries.length - 1);
  let y = startY;
  return entries.map(([label, value]) => {
    const h = Math.max(12, (value / total) * usable);
    const node = { label, value, y, h };
    y += h + GAP;
    return node;
  });
}

function FlowPath({
  x1, y1, h1, x2, y2, h2, color, hovered, onEnter, onLeave,
}: {
  x1: number; y1: number; h1: number;
  x2: number; y2: number; h2: number;
  color: string; hovered: boolean;
  onEnter: () => void; onLeave: () => void;
}) {
  const mx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + h2} C${mx},${y2 + h2} ${mx},${y1 + h1} ${x1},${y1 + h1} Z`;
  return (
    <path
      d={d}
      fill={color}
      opacity={hovered ? 0.55 : 0.18}
      stroke="none"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ cursor: "default", transition: "opacity 0.15s" }}
    />
  );
}

export function CashFlowSankeyWidget() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, base.getMonth() + 1, 0).getDate();
  const dateFrom = `${y}-${m}-01`;
  const dateTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  const monthLabel = base.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const { data, isLoading } = useListTransactions({ dateFrom, dateTo });
  const rows = (data ?? []) as unknown as TxRow[];

  const incomeRows = rows.filter(r => r.type === "income");
  const expenseRows = rows.filter(r => r.type === "expense");

  const totalIncome = incomeRows.reduce((s, r) => s + Math.abs(r.gbpValue), 0);
  const totalExpense = expenseRows.reduce((s, r) => s + Math.abs(r.gbpValue), 0);
  const savings = totalIncome - totalExpense;

  const incomeNodes = buildNodes(groupBy(incomeRows, "category"), totalIncome || 1, MARGIN_Y);
  const expenseNodes = buildNodes(groupBy(expenseRows, "category"), totalExpense || 1, MARGIN_Y);

  const centerH = H - MARGIN_Y * 2;
  const centerY = MARGIN_Y;
  const centerX1 = CENTER_X - NODE_W / 2;
  const centerX2 = CENTER_X + NODE_W / 2;
  const incomeX = COL_W;
  const expenseX = W - COL_W - NODE_W;

  return (
    <WidgetShell title="Flow Diagram" accent="var(--ft-blue)" isLoading={isLoading}>
      {!isLoading && (
        <>
          {/* Month nav */}
          <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--ft-raised)" }}>
            <button onClick={() => setOffset(o => o - 1)} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "0 4px", lineHeight: 1 }}>‹</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)" }}>{monthLabel}</span>
            <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset >= 0} style={{ background: "none", border: "none", color: offset >= 0 ? "var(--ft-border2)" : "var(--ft-dim)", cursor: offset >= 0 ? "default" : "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "0 4px", lineHeight: 1 }}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
            {[
              { label: "Income", value: totalIncome, color: "var(--ft-green)" },
              { label: "Expenses", value: totalExpense, color: "var(--ft-red)" },
              { label: savings >= 0 ? "Saved" : "Deficit", value: Math.abs(savings), color: savings >= 0 ? "var(--ft-accent)" : "var(--ft-red)" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "8px 12px", background: "var(--ft-surface)", borderTop: `2px solid ${item.color}`, overflow: "hidden", minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
                  {item.label}
                </div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: item.color, whiteSpace: "nowrap" }}>
                  {formatBaseMoney(item.value)}
                </div>
                {totalIncome > 0 && item.label !== "Income" && (
                  <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>
                    {(item.value / totalIncome * 100).toFixed(0)}% of income
                  </div>
                )}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: "32px 12px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
              No transactions this month
            </div>
          ) : (
            <div style={{ padding: "8px 0 4px", overflowX: "auto" }}>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 300 }}>
                {incomeNodes.map((node, i) => {
                  const sliceH = (node.value / (totalIncome || 1)) * centerH;
                  const sliceY = centerY + incomeNodes.slice(0, i).reduce((s, n) => s + (n.value / (totalIncome || 1)) * centerH, 0);
                  const key = `in-${node.label}`;
                  return (
                    <FlowPath key={key}
                      x1={incomeX + NODE_W} y1={node.y} h1={node.h}
                      x2={centerX1} y2={sliceY} h2={sliceH}
                      color="var(--ft-green)" hovered={hovered === key}
                      onEnter={() => setHovered(key)} onLeave={() => setHovered(null)}
                    />
                  );
                })}

                {expenseNodes.map((node, i) => {
                  const sliceH = (node.value / (totalIncome || 1)) * centerH;
                  const sliceY = centerY + expenseNodes.slice(0, i).reduce((s, n) => s + (n.value / (totalIncome || 1)) * centerH, 0);
                  const key = `ex-${node.label}`;
                  return (
                    <FlowPath key={key}
                      x1={centerX2} y1={sliceY} h1={sliceH}
                      x2={expenseX} y2={node.y} h2={node.h}
                      color="var(--ft-red)" hovered={hovered === key}
                      onEnter={() => setHovered(key)} onLeave={() => setHovered(null)}
                    />
                  );
                })}

                {incomeNodes.map(node => (
                  <g key={`in-rect-${node.label}`}>
                    <rect x={incomeX} y={node.y} width={NODE_W} height={node.h} fill="var(--ft-green)" opacity={0.85} />
                    <text x={incomeX - 6} y={node.y + node.h / 2 + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-muted)">
                      {node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label}
                    </text>
                    <text x={incomeX - 6} y={node.y + node.h / 2 + 13} textAnchor="end" fontFamily="var(--font-mono)" fontSize={8} fill="var(--ft-dim)">
                      {formatBaseMoney(node.value)}
                    </text>
                  </g>
                ))}

                <rect x={centerX1} y={centerY} width={NODE_W} height={centerH} fill="var(--ft-border2)" opacity={0.7} />
                <text x={CENTER_X} y={H / 2 - 4} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fill="var(--ft-dim)">THIS</text>
                <text x={CENTER_X} y={H / 2 + 7} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fill="var(--ft-dim)">MONTH</text>

                {expenseNodes.map(node => (
                  <g key={`ex-rect-${node.label}`}>
                    <rect x={expenseX} y={node.y} width={NODE_W} height={node.h} fill="var(--ft-red)" opacity={0.85} />
                    <text x={expenseX + NODE_W + 6} y={node.y + node.h / 2 + 3} textAnchor="start" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-muted)">
                      {node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label}
                    </text>
                    <text x={expenseX + NODE_W + 6} y={node.y + node.h / 2 + 13} textAnchor="start" fontFamily="var(--font-mono)" fontSize={8} fill="var(--ft-dim)">
                      {formatBaseMoney(node.value)}
                    </text>
                  </g>
                ))}

                {savings > 0 && (() => {
                  const savingsH = Math.max(8, (savings / (totalIncome || 1)) * centerH);
                  const usedH = (totalExpense / (totalIncome || 1)) * centerH;
                  const savingsY = centerY + usedH;
                  const key = "savings";
                  return (
                    <g>
                      <FlowPath
                        x1={centerX2} y1={savingsY} h1={savingsH}
                        x2={W - 50} y2={savingsY} h2={savingsH}
                        color="var(--ft-accent)" hovered={hovered === key}
                        onEnter={() => setHovered(key)} onLeave={() => setHovered(null)}
                      />
                      <text x={W - 44} y={savingsY + savingsH / 2 + 3} textAnchor="start" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-accent)">
                        Saved
                      </text>
                      <text x={W - 44} y={savingsY + savingsH / 2 + 13} textAnchor="start" fontFamily="var(--font-mono)" fontSize={8} fill="var(--ft-dim)">
                        {formatBaseMoney(savings)}
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          )}
        </>
      )}
    </WidgetShell>
  );
}
