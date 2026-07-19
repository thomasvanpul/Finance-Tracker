import { useMemo, useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";

// ─── types ───────────────────────────────────────────────────────────────────

interface Tx {
  id: number;
  date: string;
  description: string;
  type: string;
  category: string;
  gbpValue: number;
}

interface RecurringPattern {
  id: string;
  merchantName: string;
  estimatedAmount: number;
  frequency: string;
  lastOccurrence: string;
  occurrences: number;
}

interface RecurringRule {
  id: string;
  matchText: string;
  category: string;
  notes: string;
  isActive: boolean;
}

// ─── style atoms ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const secTitle: React.CSSProperties = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  color: "var(--ft-accent)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  marginBottom: 2,
};
const secSub: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.04em",
  marginBottom: 14,
};
const card: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  padding: 20,
  marginBottom: 16,
};
const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "4px 10px",
  fontWeight: 400,
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "7px 10px",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const BTN: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "4px 10px",
  border: "none",
  background: "var(--ft-accent)",
  color: "var(--ft-base)",
  cursor: "pointer",
};
const BTN_GHOST: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "4px 10px",
  border: "1px solid var(--ft-border)",
  background: "transparent",
  color: "var(--ft-muted)",
  cursor: "pointer",
};

const STORAGE_KEY = "nr-recurring-rules";

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadRules(): RecurringRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecurringRule[];
  } catch {
    return [];
  }
}

function saveRules(rules: RecurringRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

function detectRecurring(txs: Tx[]): RecurringPattern[] {
  // Group by normalised description
  const groups: Record<string, Tx[]> = {};
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    const key = tx.description.trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const patterns: RecurringPattern[] = [];

  for (const [key, items] of Object.entries(groups)) {
    if (items.length < 2) continue;

    // Sort by date
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

    // Compute intervals in days
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date).getTime();
      const curr = new Date(sorted[i].date).getTime();
      intervals.push(Math.round((curr - prev) / 86_400_000));
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    // Check if interval is roughly weekly (5-9) or monthly (25-35) or quarterly (85-95)
    let frequency = "";
    if (avgInterval >= 5 && avgInterval <= 9) frequency = "weekly";
    else if (avgInterval >= 25 && avgInterval <= 35) frequency = "monthly";
    else if (avgInterval >= 85 && avgInterval <= 95) frequency = "quarterly";
    else if (avgInterval >= 355 && avgInterval <= 375) frequency = "yearly";
    else if (items.length >= 3) frequency = `~${Math.round(avgInterval)}d`;

    if (!frequency) continue;

    // Check amounts are within ±10%
    const amounts = sorted.map((t) => t.gbpValue);
    const avgAmt = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const withinTolerance = amounts.every(
      (a) => Math.abs(a - avgAmt) / avgAmt <= 0.1
    );
    if (!withinTolerance) continue;

    patterns.push({
      id: `rec-${key.slice(0, 20)}`,
      merchantName: sorted[0].description,
      estimatedAmount: Math.round(avgAmt * 100) / 100,
      frequency,
      lastOccurrence: sorted[sorted.length - 1].date,
      occurrences: items.length,
    });
  }

  return patterns.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
}

// ─── section 1: auto-detected ─────────────────────────────────────────────────

function AutoDetected({
  patterns,
  onAddRule,
}: {
  patterns: RecurringPattern[];
  onAddRule: (p: RecurringPattern) => void;
}) {
  return (
    <div style={card}>
      <div style={secTitle}>AUTO-DETECTED RECURRING TRANSACTIONS</div>
      <div style={secSub}>
        Detected by matching description + interval (weekly / monthly / quarterly) + amount within ±10%
      </div>
      {patterns.length === 0 ? (
        <div style={{ ...labelStyle, textAlign: "center", padding: "24px 0" }}>
          No recurring patterns detected — add more transactions to identify patterns
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {patterns.map((p) => (
            <div
              key={p.id}
              style={{
                background: "var(--ft-base)",
                border: "1px solid var(--ft-border)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ ...mono, fontSize: 12, color: "var(--ft-text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {p.merchantName}
                </div>
                <span style={{
                  ...mono,
                  fontSize: 9,
                  padding: "1px 6px",
                  background: "var(--ft-accent)22",
                  color: "var(--ft-accent)",
                  flexShrink: 0,
                }}>
                  {p.frequency}
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Estimated amt</div>
                  <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--ft-red)" }}>
                    -{formatGbp(p.estimatedAmount)}
                  </div>
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Last seen</div>
                  <div style={{ ...mono, fontSize: 10, color: "var(--ft-muted)" }}>{p.lastOccurrence}</div>
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Count</div>
                  <div style={{ ...mono, fontSize: 10, color: "var(--ft-muted)" }}>{p.occurrences}×</div>
                </div>
              </div>
              <button
                onClick={() => onAddRule(p)}
                style={{ ...BTN, alignSelf: "flex-start", marginTop: 4 }}
              >
                + Add Rule
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── section 2: manual rules ──────────────────────────────────────────────────

function ManualRules({
  rules,
  allTxs,
  onToggle,
  onDelete,
  onAddRule,
}: {
  rules: RecurringRule[];
  allTxs: Tx[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddRule: (rule: RecurringRule) => void;
}) {
  const [form, setForm] = useState({ matchText: "", category: "", notes: "" });
  const [testingId, setTestingId] = useState<string | null>(null);

  const matchCount = (rule: RecurringRule) =>
    allTxs.filter((t) =>
      t.description.toLowerCase().includes(rule.matchText.toLowerCase())
    ).length;

  const handleAdd = () => {
    if (!form.matchText.trim()) return;
    const rule: RecurringRule = {
      id: `rule-${Date.now()}`,
      matchText: form.matchText.trim(),
      category: form.category.trim() || "Other",
      notes: form.notes.trim(),
      isActive: true,
    };
    onAddRule(rule);
    setForm({ matchText: "", category: "", notes: "" });
  };

  return (
    <div style={card}>
      <div style={secTitle}>MANUAL RULES</div>
      <div style={secSub}>
        Define rules to auto-categorize transactions by description keyword
      </div>

      {/* Add form */}
      <div style={{
        background: "var(--ft-base)",
        border: "1px solid var(--ft-border)",
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 2, minWidth: 140 }}>
          <div style={labelStyle}>Match text (substring)</div>
          <input
            value={form.matchText}
            onChange={(e) => setForm((f) => ({ ...f, matchText: e.target.value }))}
            placeholder="e.g. Netflix"
            style={{
              ...mono,
              fontSize: 11,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-text)",
              padding: "6px 10px",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
          <div style={labelStyle}>Assign category</div>
          <input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="e.g. Subscriptions"
            style={{
              ...mono,
              fontSize: 11,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-text)",
              padding: "6px 10px",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 2, minWidth: 120 }}>
          <div style={labelStyle}>Notes (optional)</div>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. Monthly subscription"
            style={{
              ...mono,
              fontSize: 11,
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-text)",
              padding: "6px 10px",
              outline: "none",
            }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!form.matchText.trim()}
          style={{
            ...BTN,
            opacity: !form.matchText.trim() ? 0.5 : 1,
            cursor: !form.matchText.trim() ? "not-allowed" : "pointer",
            padding: "8px 16px",
          }}
        >
          + Add Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div style={{ ...labelStyle, textAlign: "center", padding: "16px 0" }}>
          No manual rules yet — add one above
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["Active","Match Text","Category","Notes","Matches","Actions"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const count = matchCount(rule);
                const isTesting = testingId === rule.id;
                const testMatches = isTesting
                  ? allTxs.filter((t) =>
                      t.description.toLowerCase().includes(rule.matchText.toLowerCase())
                    ).slice(0, 5)
                  : [];

                return (
                  <>
                    <tr key={rule.id} style={{ opacity: rule.isActive ? 1 : 0.5 }}>
                      <td style={{ ...td, width: 52 }}>
                        <button
                          onClick={() => onToggle(rule.id)}
                          style={{
                            ...mono,
                            fontSize: 9,
                            padding: "2px 6px",
                            border: "none",
                            cursor: "pointer",
                            background: rule.isActive ? "var(--ft-green)22" : "var(--ft-border)",
                            color: rule.isActive ? "var(--ft-green)" : "var(--ft-dim)",
                          }}
                        >
                          {rule.isActive ? "ON" : "OFF"}
                        </button>
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "var(--ft-accent)" }}>
                        {rule.matchText}
                      </td>
                      <td style={{ ...td }}>
                        <span style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          background: "var(--ft-raised)",
                          color: "var(--ft-muted)",
                        }}>
                          {rule.category}
                        </span>
                      </td>
                      <td style={{ ...td, color: "var(--ft-dim)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {rule.notes || "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button
                          onClick={() => setTestingId((v) => v === rule.id ? null : rule.id)}
                          style={{
                            ...BTN_GHOST,
                            fontSize: 9,
                            color: count > 0 ? "var(--ft-amber)" : "var(--ft-dim)",
                          }}
                        >
                          {count} match{count !== 1 ? "es" : ""} {isTesting ? "▲" : "▼"}
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button
                          onClick={() => onDelete(rule.id)}
                          style={{ ...BTN_GHOST, color: "var(--ft-red)", borderColor: "var(--ft-red)44" }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isTesting && testMatches.length > 0 && (
                      <tr key={`${rule.id}-test`}>
                        <td colSpan={6} style={{ ...td, padding: 0 }}>
                          <div style={{
                            background: "var(--ft-amber)08",
                            border: "1px solid var(--ft-amber)33",
                            padding: "10px 14px",
                          }}>
                            <div style={{ ...labelStyle, color: "var(--ft-amber)", marginBottom: 8 }}>
                              Top matching transactions (showing up to 5)
                            </div>
                            {testMatches.map((t) => (
                              <div key={t.id} style={{ display: "flex", gap: 16, marginBottom: 4, alignItems: "center" }}>
                                <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", width: 80 }}>{t.date}</span>
                                <span style={{ ...mono, fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</span>
                                <span style={{ ...mono, fontSize: 9, color: "var(--ft-muted)" }}>{t.category || "—"}</span>
                                <span style={{ ...mono, fontSize: 9, color: "var(--ft-amber)" }}>→ {rule.category}</span>
                                <span style={{ ...mono, fontSize: 10, color: "var(--ft-red)" }}>{formatGbp(t.gbpValue)}</span>
                              </div>
                            ))}
                            {count > 5 && (
                              <div style={{ ...labelStyle, marginTop: 4 }}>
                                …and {count - 5} more
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── section 3: apply rules ───────────────────────────────────────────────────

function ApplyRules({
  rules,
  allTxs,
}: {
  rules: RecurringRule[];
  allTxs: Tx[];
}) {
  const [showPreview, setShowPreview] = useState(false);

  const activeRules = rules.filter((r) => r.isActive);

  const preview = useMemo(() => {
    const changes: { tx: Tx; newCategory: string; rule: RecurringRule }[] = [];
    for (const tx of allTxs) {
      if (tx.category) continue; // skip already categorized
      for (const rule of activeRules) {
        if (tx.description.toLowerCase().includes(rule.matchText.toLowerCase())) {
          changes.push({ tx, newCategory: rule.category, rule });
          break;
        }
      }
    }
    return changes;
  }, [allTxs, activeRules]);

  return (
    <div style={card}>
      <div style={secTitle}>APPLY RULES</div>
      <div style={secSub}>
        Preview which un-categorized transactions would be updated by your active rules
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <div style={{
          ...mono,
          fontSize: 11,
          color: "var(--ft-text)",
        }}>
          {activeRules.length} active rule{activeRules.length !== 1 ? "s" : ""} · {preview.length} un-categorized transaction{preview.length !== 1 ? "s" : ""} would be updated
        </div>
        <button
          onClick={() => setShowPreview((v) => !v)}
          disabled={preview.length === 0}
          style={{
            ...BTN_GHOST,
            opacity: preview.length === 0 ? 0.5 : 1,
            cursor: preview.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {showPreview ? "Hide" : "Show"} Preview ({preview.length})
        </button>
        <div style={{
          ...mono,
          fontSize: 9,
          color: "var(--ft-amber)",
          padding: "4px 10px",
          background: "var(--ft-amber)10",
          border: "1px solid var(--ft-amber)33",
          marginLeft: "auto",
        }}>
          API update coming soon — this is a preview only
        </div>
      </div>

      {showPreview && preview.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["Date","Description","Current Category","Rule","New Category"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 50).map(({ tx, newCategory, rule }) => (
                <tr key={tx.id}>
                  <td style={{ ...td, color: "var(--ft-dim)" }}>{tx.date}</td>
                  <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{tx.description}</td>
                  <td style={{ ...td, color: "var(--ft-muted)" }}>{tx.category || <em style={{ color: "var(--ft-dim)" }}>none</em>}</td>
                  <td style={{ ...td, color: "var(--ft-accent)", fontSize: 9 }}>{rule.matchText}</td>
                  <td style={{ ...td }}>
                    <span style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      background: "var(--ft-green)22",
                      color: "var(--ft-green)",
                    }}>
                      {newCategory}
                    </span>
                  </td>
                </tr>
              ))}
              {preview.length > 50 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--ft-dim)" }}>
                    …and {preview.length - 50} more rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPreview && preview.length === 0 && (
        <div style={{ ...labelStyle, textAlign: "center", padding: "16px 0" }}>
          All transactions already have categories, or no active rules match
        </div>
      )}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function RecurringPage() {
  const { data: rawTxs, isLoading } = useListTransactions({});
  const allTxs = (rawTxs ?? []) as Tx[];

  const [rules, setRules] = useState<RecurringRule[]>(loadRules);

  const patterns = useMemo(() => detectRecurring(allTxs), [allTxs]);

  const handleAddRuleFromPattern = (p: RecurringPattern) => {
    const rule: RecurringRule = {
      id: `rule-${Date.now()}`,
      matchText: p.merchantName,
      category: "Subscriptions",
      notes: `Auto-detected · ${p.frequency} · ~${formatGbp(p.estimatedAmount)}`,
      isActive: true,
    };
    setRules((prev) => {
      const updated = [...prev, rule];
      saveRules(updated);
      return updated;
    });
  };

  const handleAddRule = (rule: RecurringRule) => {
    setRules((prev) => {
      // Avoid duplicates by matchText
      if (prev.some((r) => r.matchText.toLowerCase() === rule.matchText.toLowerCase())) return prev;
      const updated = [...prev, rule];
      saveRules(updated);
      return updated;
    });
  };

  const handleToggle = (id: string) => {
    setRules((prev) => {
      const updated = prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r);
      saveRules(updated);
      return updated;
    });
  };

  const handleDelete = (id: string) => {
    setRules((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveRules(updated);
      return updated;
    });
  };

  if (isLoading) {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", padding: "40px 0", textAlign: "center" }}>
        Loading transaction data…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            RECURRING RULES
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
            auto-detect and categorize recurring transactions
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...labelStyle, marginBottom: 2 }}>Detected patterns</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-text)" }}>
              {patterns.length}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...labelStyle, marginBottom: 2 }}>Active rules</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ft-accent)" }}>
              {rules.filter((r) => r.isActive).length}
            </div>
          </div>
        </div>
      </div>

      {/* Section 1 */}
      <AutoDetected patterns={patterns} onAddRule={handleAddRuleFromPattern} />

      {/* Section 2 */}
      <ManualRules
        rules={rules}
        allTxs={allTxs}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddRule={handleAddRule}
      />

      {/* Section 3 */}
      <ApplyRules rules={rules} allTxs={allTxs} />
    </div>
  );
}
