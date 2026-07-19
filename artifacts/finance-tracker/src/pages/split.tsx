import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTransaction,
  getListTransactionsQueryKey,
  getGetDashboardQueryKey,
  getGetTransactionSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Trash2,
  Check,
  X,
  SplitSquareHorizontal,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Settings2,
  ChevronLeft,
} from "lucide-react";

// ─── Data model ───────────────────────────────────────────────────────────────

interface SplitGroup {
  id: string;
  name: string;
  members: string[];
  createdAt: string;
  settled: boolean;
}

interface SplitExpense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitType: "equal" | "custom" | "percentage";
  shares: Record<string, number>;
  date: string;
  category: string;
  addedToMyTransactions: boolean;
}

interface BillSplitData {
  groups: SplitGroup[];
  expenses: SplitExpense[];
}

interface Transfer {
  from: string;
  to: string;
  amount: number;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_DATA = "ft-bill-splits";
const LS_MY_NAME = "ft-split-my-name";

function loadData(): BillSplitData {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) return JSON.parse(raw) as BillSplitData;
  } catch {}
  return { groups: [], expenses: [] };
}

function saveData(data: BillSplitData): void {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(data));
  } catch {}
}

function loadMyName(): string {
  return localStorage.getItem(LS_MY_NAME) ?? "";
}

function saveMyName(name: string): void {
  localStorage.setItem(LS_MY_NAME, name);
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ─── Balance + settle-up algorithm ───────────────────────────────────────────

function computeBalances(
  members: string[],
  expenses: SplitExpense[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const m of members) balances[m] = 0;

  for (const exp of expenses) {
    // The payer gets credited the full amount
    if (balances[exp.paidBy] !== undefined) {
      balances[exp.paidBy] += exp.amount;
    }
    // Each member is debited their share
    for (const [member, share] of Object.entries(exp.shares)) {
      if (balances[member] !== undefined) {
        balances[member] -= share;
      }
    }
  }
  return balances;
}

function minimumTransfers(balances: Record<string, number>): Transfer[] {
  const transfers: Transfer[] = [];
  // Work on a mutable copy, rounded to 2dp
  const pos: Array<{ name: string; amount: number }> = [];
  const neg: Array<{ name: string; amount: number }> = [];

  for (const [name, bal] of Object.entries(balances)) {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > 0.005) pos.push({ name, amount: rounded });
    else if (rounded < -0.005) neg.push({ name, amount: rounded });
  }

  // Sort descending by absolute amount
  pos.sort((a, b) => b.amount - a.amount);
  neg.sort((a, b) => a.amount - b.amount);

  let pi = 0;
  let ni = 0;
  while (pi < pos.length && ni < neg.length) {
    const creditor = pos[pi];
    const debtor = neg[ni];
    const transfer = Math.min(creditor.amount, Math.abs(debtor.amount));
    if (transfer > 0.005) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    creditor.amount -= transfer;
    debtor.amount += transfer;
    if (Math.abs(creditor.amount) < 0.005) pi++;
    if (Math.abs(debtor.amount) < 0.005) ni++;
  }

  return transfers;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const MEMBER_COLORS = [
  { bg: "rgba(96,165,250,0.15)", color: "#60A5FA" },
  { bg: "rgba(74,222,128,0.15)", color: "#4ADE80" },
  { bg: "rgba(244,162,30,0.15)", color: "#F4A21E" },
  { bg: "rgba(34,211,238,0.15)", color: "#22D3EE" },
  { bg: "rgba(248,113,113,0.15)", color: "#F87171" },
  { bg: "rgba(167,139,250,0.15)", color: "#A78BFA" },
  { bg: "rgba(251,191,36,0.15)", color: "#FBBF24" },
  { bg: "rgba(52,211,153,0.15)", color: "#34D399" },
];

function memberColor(index: number): { bg: string; color: string } {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

function memberIndex(members: string[], name: string): number {
  return members.indexOf(name);
}

const CATEGORIES = [
  "Food & Drink",
  "Accommodation",
  "Transport",
  "Activities",
  "Shopping",
  "Groceries",
  "Utilities",
  "Entertainment",
  "Travel",
  "Other",
];

// ─── Shared style constants ────────────────────────────────────────────────────

const INPUT_S: React.CSSProperties = {
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  height: 30,
  fontSize: 12,
  padding: "0 8px",
  borderRadius: 2,
  outline: "none",
  width: "100%",
};

const LABEL_S: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--ft-dim)",
  marginBottom: 4,
  display: "block",
};

// ─── MemberAvatar ─────────────────────────────────────────────────────────────

function MemberAvatar({
  name,
  members,
  size = 24,
}: {
  name: string;
  members: string[];
  size?: number;
}) {
  const idx = memberIndex(members, name);
  const col = memberColor(idx >= 0 ? idx : 0);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: col.bg,
        color: col.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 700,
        flexShrink: 0,
        border: `1px solid ${col.color}33`,
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ─── AddGroupPanel ────────────────────────────────────────────────────────────

interface AddGroupPanelProps {
  onAdd: (group: SplitGroup) => void;
  onCancel: () => void;
}

function AddGroupPanel({ onAdd, onCancel }: AddGroupPanelProps) {
  const [name, setName] = useState("");
  const [membersRaw, setMembersRaw] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState("");

  function parseMembersRaw() {
    const parsed = membersRaw
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      setMembers((prev) => {
        const combined = [...prev];
        for (const m of parsed) {
          if (!combined.includes(m)) combined.push(m);
        }
        return combined;
      });
      setMembersRaw("");
    }
  }

  function addOne() {
    const trimmed = newMember.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers((prev) => [...prev, trimmed]);
    }
    setNewMember("");
  }

  function removeMember(m: string) {
    setMembers((prev) => prev.filter((x) => x !== m));
  }

  function handleAdd() {
    if (!name.trim() || members.length < 2) return;
    const group: SplitGroup = {
      id: genId(),
      name: name.trim(),
      members,
      createdAt: new Date().toISOString(),
      settled: false,
    };
    onAdd(group);
  }

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border2)",
        borderLeft: "3px solid var(--ft-accent)",
        padding: "14px 16px",
        borderRadius: 2,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ft-accent)",
          marginBottom: 12,
        }}
      >
        New Group
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Group Name</label>
        <input
          style={INPUT_S}
          placeholder='e.g. "Holiday Portugal 2026"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Add Members (comma-separated)</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...INPUT_S, flex: 1 }}
            placeholder='e.g. "Thomas, Alice, Bob"'
            value={membersRaw}
            onChange={(e) => setMembersRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                parseMembersRaw();
              }
            }}
          />
          <button
            onClick={parseMembersRaw}
            style={{
              padding: "0 10px",
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border2)",
              color: "var(--ft-muted)",
              fontSize: 11,
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Or add one at a time</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...INPUT_S, flex: 1 }}
            placeholder="Person name"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOne();
              }
            }}
          />
          <button
            onClick={addOne}
            style={{
              padding: "0 10px",
              background: "rgba(96,165,250,0.12)",
              border: "1px solid rgba(96,165,250,0.25)",
              color: "var(--ft-blue)",
              fontSize: 11,
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {members.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
          {members.map((m, i) => {
            const col = memberColor(i);
            return (
              <div
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px 2px 6px",
                  background: col.bg,
                  border: `1px solid ${col.color}33`,
                  borderRadius: 2,
                  fontSize: 11,
                  color: col.color,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: col.color,
                    color: "var(--ft-base)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                  }}
                >
                  {m[0]?.toUpperCase()}
                </span>
                {m}
                <button
                  onClick={() => removeMember(m)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: col.color, opacity: 0.7, display: "flex" }}
                >
                  <X style={{ width: 10, height: 10 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {members.length < 2 && (
        <div
          style={{
            fontSize: 10,
            color: "var(--ft-dim)",
            fontFamily: "var(--font-mono)",
            marginBottom: 10,
          }}
        >
          Add at least 2 members to create a group.
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleAdd}
          disabled={!name.trim() || members.length < 2}
          style={{
            padding: "5px 14px",
            background: !name.trim() || members.length < 2 ? "var(--ft-raised)" : "var(--ft-blue)",
            color: !name.trim() || members.length < 2 ? "var(--ft-dim)" : "#fff",
            border: "none",
            borderRadius: 2,
            fontSize: 12,
            cursor: !name.trim() || members.length < 2 ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          Create Group
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "5px 12px",
            background: "transparent",
            color: "var(--ft-dim)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── AddExpenseForm ───────────────────────────────────────────────────────────

interface AddExpenseFormProps {
  group: SplitGroup;
  onAdd: (expense: SplitExpense) => void;
  onCancel: () => void;
}

function AddExpenseForm({ group, onAdd, onCancel }: AddExpenseFormProps) {
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paidBy, setPaidBy] = useState(group.members[0] ?? "");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState("Other");
  const [splitType, setSplitType] = useState<"equal" | "custom" | "percentage">("equal");
  const [customShares, setCustomShares] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of group.members) init[m] = "";
    return init;
  });

  const amount = parseFloat(amountStr) || 0;
  const count = group.members.length;
  const equalShare = count > 0 ? amount / count : 0;

  function computedShares(): Record<string, number> {
    const shares: Record<string, number> = {};
    if (splitType === "equal") {
      for (const m of group.members) shares[m] = equalShare;
    } else if (splitType === "custom") {
      for (const m of group.members) {
        shares[m] = parseFloat(customShares[m] ?? "") || 0;
      }
    } else {
      // percentage
      const totalPct = group.members.reduce(
        (s, m) => s + (parseFloat(customShares[m] ?? "") || 0),
        0
      );
      for (const m of group.members) {
        const pct = parseFloat(customShares[m] ?? "") || 0;
        shares[m] = totalPct > 0 ? (pct / totalPct) * amount : 0;
      }
    }
    return shares;
  }

  const shares = computedShares();
  const sharesSum = Object.values(shares).reduce((s, v) => s + v, 0);
  const isBalanced =
    splitType === "equal" ||
    Math.abs(sharesSum - amount) < 0.005;

  function handleAdd() {
    if (!description.trim() || amount <= 0 || !paidBy || !isBalanced) return;
    const expense: SplitExpense = {
      id: genId(),
      groupId: group.id,
      description: description.trim(),
      amount,
      paidBy,
      splitType,
      shares: computedShares(),
      date,
      category,
      addedToMyTransactions: false,
    };
    onAdd(expense);
  }

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border2)",
        borderTop: "2px solid var(--ft-accent)",
        padding: "14px 16px",
        borderRadius: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ft-accent)",
          marginBottom: 12,
        }}
      >
        Add Expense
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LABEL_S}>Description</label>
          <input
            style={INPUT_S}
            placeholder="Dinner, hotel, tickets…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label style={LABEL_S}>Total Amount (£)</label>
          <input
            style={INPUT_S}
            type="number"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL_S}>Paid By</label>
          <select
            style={{ ...INPUT_S }}
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
          >
            {group.members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={LABEL_S}>Date</label>
          <input
            style={INPUT_S}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL_S}>Category</label>
          <select
            style={{ ...INPUT_S }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Split type picker */}
      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Split Type</label>
        <div style={{ display: "flex", gap: 5 }}>
          {(["equal", "custom", "percentage"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSplitType(t)}
              style={{
                padding: "3px 10px",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRadius: 2,
                border: `1px solid ${splitType === t ? "rgba(96,165,250,0.5)" : "var(--ft-border2)"}`,
                background: splitType === t ? "rgba(96,165,250,0.12)" : "var(--ft-base)",
                color: splitType === t ? "var(--ft-blue)" : "var(--ft-dim)",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Per-member share inputs */}
      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>
          {splitType === "equal"
            ? "Equal shares"
            : splitType === "percentage"
            ? "Percentages (%)"
            : "Custom amounts (£)"}
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {group.members.map((m, i) => {
            const col = memberColor(i);
            const displayVal =
              splitType === "equal"
                ? equalShare.toFixed(2)
                : customShares[m] ?? "";

            return (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: col.bg,
                    color: col.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {m[0]?.toUpperCase()}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--ft-text)",
                    width: 80,
                    flexShrink: 0,
                  }}
                >
                  {m}
                </span>
                {splitType === "equal" ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-green)",
                    }}
                  >
                    £{displayVal}
                  </span>
                ) : (
                  <input
                    style={{ ...INPUT_S, width: 90 }}
                    type="number"
                    placeholder={splitType === "percentage" ? "%" : "0.00"}
                    value={displayVal}
                    onChange={(e) =>
                      setCustomShares((prev) => ({ ...prev, [m]: e.target.value }))
                    }
                  />
                )}
                {splitType !== "equal" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-dim)",
                    }}
                  >
                    {splitType === "percentage"
                      ? `= £${shares[m]?.toFixed(2) ?? "0.00"}`
                      : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {splitType !== "equal" && amount > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: "5px 10px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              borderRadius: 2,
              background: isBalanced
                ? "rgba(74,222,128,0.06)"
                : "rgba(248,113,113,0.06)",
              border: `1px solid ${isBalanced ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              color: isBalanced ? "var(--ft-green)" : "var(--ft-red)",
            }}
          >
            {isBalanced
              ? `✓ Balanced — £${sharesSum.toFixed(2)} of £${amount.toFixed(2)}`
              : `Remaining: £${(amount - sharesSum).toFixed(2)}`}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleAdd}
          disabled={!description.trim() || amount <= 0 || !isBalanced}
          style={{
            padding: "5px 14px",
            background:
              !description.trim() || amount <= 0 || !isBalanced
                ? "var(--ft-raised)"
                : "var(--ft-blue)",
            color:
              !description.trim() || amount <= 0 || !isBalanced
                ? "var(--ft-dim)"
                : "#fff",
            border: "none",
            borderRadius: 2,
            fontSize: 12,
            cursor:
              !description.trim() || amount <= 0 || !isBalanced
                ? "not-allowed"
                : "pointer",
            fontWeight: 600,
          }}
        >
          Add Expense
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "5px 12px",
            background: "transparent",
            color: "var(--ft-dim)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── GroupCard (left panel item) ──────────────────────────────────────────────

interface GroupCardProps {
  group: SplitGroup;
  expenses: SplitExpense[];
  myName: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function GroupCard({ group, expenses, myName, isActive, onClick, onDelete }: GroupCardProps) {
  const groupExpenses = expenses.filter((e) => e.groupId === group.id);
  const total = groupExpenses.reduce((s, e) => s + e.amount, 0);
  const balances = computeBalances(group.members, groupExpenses);
  const myBalance = myName && balances[myName] !== undefined ? balances[myName] : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? "var(--ft-raised)" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: isActive
          ? "3px solid var(--ft-accent)"
          : group.settled
          ? "3px solid var(--ft-border2)"
          : "3px solid var(--ft-blue)",
        borderRadius: 2,
        padding: "10px 12px",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.1s",
        opacity: group.settled ? 0.65 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ft-text)",
              marginBottom: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {group.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", gap: -4 }}>
              {group.members.slice(0, 5).map((m, i) => (
                <div
                  key={m}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: memberColor(i).bg,
                    color: memberColor(i).color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 7,
                    fontWeight: 700,
                    border: "1px solid var(--ft-base)",
                    marginLeft: i === 0 ? 0 : -4,
                  }}
                >
                  {m[0]?.toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              {group.members.length} members
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              {groupExpenses.length} expense{groupExpenses.length !== 1 ? "s" : ""} · {formatGbp(total)}
            </span>
          </div>
          {myBalance !== null && (
            <div style={{ marginTop: 4 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: myBalance > 0.005 ? "var(--ft-green)" : myBalance < -0.005 ? "var(--ft-red)" : "var(--ft-dim)",
                }}
              >
                {myBalance > 0.005
                  ? `+${formatGbp(myBalance)} net`
                  : myBalance < -0.005
                  ? `${formatGbp(myBalance)} net`
                  : "settled up"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {group.settled && (
            <span
              style={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "1px 5px",
                borderRadius: 2,
                background: "rgba(74,222,128,0.08)",
                color: "var(--ft-green)",
                border: "1px solid rgba(74,222,128,0.15)",
              }}
            >
              Settled
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ft-dim)",
              padding: 2,
              display: "flex",
              opacity: 0.6,
            }}
            title="Delete group"
          >
            <Trash2 style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

interface ExpenseRowProps {
  expense: SplitExpense;
  members: string[];
  myName: string;
  onAddToTransactions: () => void;
  onDelete: () => void;
}

function ExpenseRow({ expense, members, myName, onAddToTransactions, onDelete }: ExpenseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const myShare = myName ? expense.shares[myName] : undefined;
  const paidByIdx = memberIndex(members, expense.paidBy);
  const paidByCol = memberColor(paidByIdx >= 0 ? paidByIdx : 0);

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((p) => !p)}
      >
        <div style={{ flexShrink: 0, color: "var(--ft-dim)" }}>
          {expanded ? (
            <ChevronDown style={{ width: 12, height: 12 }} />
          ) : (
            <ChevronRight style={{ width: 12, height: 12 }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)" }}>
              {expense.description}
            </span>
            <span
              style={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "1px 5px",
                borderRadius: 2,
                background: "rgba(74,222,128,0.06)",
                color: "var(--ft-dim)",
                border: "1px solid var(--ft-border2)",
              }}
            >
              {expense.category}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>
              {formatDateShort(expense.date)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MemberAvatar name={expense.paidBy} members={members} size={14} />
              <span style={{ fontSize: 9, color: paidByCol.color, fontFamily: "var(--font-mono)" }}>
                paid by {expense.paidBy}
              </span>
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: "var(--ft-text)",
            }}
          >
            {formatGbp(expense.amount)}
          </div>
          {myShare !== undefined && (
            <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              your share {formatGbp(myShare)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 4, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {myShare !== undefined && myShare > 0 && (
            <button
              onClick={onAddToTransactions}
              title={
                expense.addedToMyTransactions
                  ? "Added to transactions"
                  : "Add my share to transactions"
              }
              style={{
                padding: "2px 7px",
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRadius: 2,
                border: expense.addedToMyTransactions
                  ? "1px solid rgba(74,222,128,0.3)"
                  : "1px solid rgba(96,165,250,0.3)",
                background: expense.addedToMyTransactions
                  ? "rgba(74,222,128,0.08)"
                  : "rgba(96,165,250,0.08)",
                color: expense.addedToMyTransactions
                  ? "var(--ft-green)"
                  : "var(--ft-blue)",
                cursor: expense.addedToMyTransactions ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
              disabled={expense.addedToMyTransactions}
            >
              {expense.addedToMyTransactions ? (
                <>
                  <Check style={{ width: 9, height: 9 }} /> Logged
                </>
              ) : (
                <>+ Log</>
              )}
            </button>
          )}
          <button
            onClick={onDelete}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ft-dim)",
              padding: 2,
              display: "flex",
              opacity: 0.6,
            }}
            title="Delete"
          >
            <Trash2 style={{ width: 11, height: 11 }} />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            padding: "8px 12px 10px 36px",
            borderTop: "1px solid var(--ft-border)",
            background: "var(--ft-base)",
          }}
        >
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Split breakdown · {expense.splitType}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {Object.entries(expense.shares).map(([member, share]) => {
              const mi = memberIndex(members, member);
              const col = memberColor(mi >= 0 ? mi : 0);
              const isMe = member === myName;
              return (
                <div
                  key={member}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    background: col.bg,
                    border: `1px solid ${col.color}33`,
                    borderRadius: 2,
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: col.color, fontWeight: 700 }}>{member}</span>
                  {isMe && (
                    <span style={{ fontSize: 8, color: col.color, opacity: 0.7 }}>(you)</span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-text)",
                      fontWeight: 600,
                    }}
                  >
                    {formatGbp(share)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SettleUpPanel ────────────────────────────────────────────────────────────

interface SettleUpPanelProps {
  group: SplitGroup;
  expenses: SplitExpense[];
  myName: string;
  onMarkGroupSettled: () => void;
}

function SettleUpPanel({ group, expenses, myName, onMarkGroupSettled }: SettleUpPanelProps) {
  const [settledTransfers, setSettledTransfers] = useState<Set<number>>(new Set());

  const balances = computeBalances(group.members, expenses);
  const transfers = minimumTransfers(balances);

  function toggleTransfer(i: number) {
    setSettledTransfers((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const allDone = transfers.length > 0 && settledTransfers.size === transfers.length;

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderTop: "2px solid var(--ft-cyan)",
        borderRadius: 2,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ft-cyan)",
          }}
        >
          Settle Up
        </span>
        {transfers.length === 0 && (
          <span style={{ fontSize: 10, color: "var(--ft-green)", fontFamily: "var(--font-mono)" }}>
            ✓ All settled
          </span>
        )}
      </div>

      {/* Per-member balance bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
        {group.members.map((m, i) => {
          const bal = Math.round((balances[m] ?? 0) * 100) / 100;
          const col = memberColor(i);
          const isMe = m === myName;
          return (
            <div key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: col.bg,
                  color: col.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 7,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {m[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 10, color: "var(--ft-text)", width: 70, flexShrink: 0 }}>
                {m}
                {isMe && (
                  <span style={{ fontSize: 8, color: "var(--ft-dim)", marginLeft: 3 }}>(you)</span>
                )}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color:
                    bal > 0.005
                      ? "var(--ft-green)"
                      : bal < -0.005
                      ? "var(--ft-red)"
                      : "var(--ft-dim)",
                }}
              >
                {bal > 0.005 ? "+" : ""}
                {formatGbp(bal)}
              </span>
              <span style={{ fontSize: 9, color: "var(--ft-dim)" }}>
                {bal > 0.005 ? "is owed" : bal < -0.005 ? "owes" : "even"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Transfer instructions */}
      {transfers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--ft-dim)",
              marginBottom: 6,
            }}
          >
            Minimum transfers to settle
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {transfers.map((t, i) => {
              const fromIdx = memberIndex(group.members, t.from);
              const toIdx = memberIndex(group.members, t.to);
              const fromCol = memberColor(fromIdx >= 0 ? fromIdx : 0);
              const toCol = memberColor(toIdx >= 0 ? toIdx : 0);
              const done = settledTransfers.has(i);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: done ? "rgba(74,222,128,0.06)" : "var(--ft-raised)",
                    border: `1px solid ${done ? "rgba(74,222,128,0.2)" : "var(--ft-border)"}`,
                    borderRadius: 2,
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: fromCol.bg,
                      color: fromCol.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.from[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ft-text)", fontWeight: done ? 400 : 600 }}>
                    {t.from}
                  </span>
                  <ArrowRight style={{ width: 12, height: 12, color: "var(--ft-dim)", flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: done ? "var(--ft-dim)" : "var(--ft-accent)",
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {formatGbp(t.amount)}
                  </span>
                  <ArrowRight style={{ width: 12, height: 12, color: "var(--ft-dim)", flexShrink: 0 }} />
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: toCol.bg,
                      color: toCol.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.to[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ft-text)" }}>{t.to}</span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => toggleTransfer(i)}
                    style={{
                      padding: "2px 8px",
                      fontSize: 9,
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderRadius: 2,
                      border: done
                        ? "1px solid rgba(74,222,128,0.3)"
                        : "1px solid var(--ft-border2)",
                      background: done ? "rgba(74,222,128,0.1)" : "transparent",
                      color: done ? "var(--ft-green)" : "var(--ft-dim)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    {done ? (
                      <>
                        <Check style={{ width: 9, height: 9 }} /> Done
                      </>
                    ) : (
                      "Mark done"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allDone && !group.settled && (
        <button
          onClick={onMarkGroupSettled}
          style={{
            width: "100%",
            padding: "7px",
            background: "rgba(74,222,128,0.12)",
            border: "1px solid rgba(74,222,128,0.3)",
            color: "var(--ft-green)",
            borderRadius: 2,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <CheckCircle2 style={{ width: 14, height: 14 }} /> Mark Group as Settled
        </button>
      )}

      {group.settled && (
        <div
          style={{
            padding: "7px",
            background: "rgba(74,222,128,0.06)",
            border: "1px solid rgba(74,222,128,0.15)",
            borderRadius: 2,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ft-green)",
            fontFamily: "var(--font-mono)",
          }}
        >
          ✓ This group is settled
        </div>
      )}
    </div>
  );
}

// ─── GroupSummaryStats ─────────────────────────────────────────────────────────

interface GroupSummaryStatsProps {
  group: SplitGroup;
  expenses: SplitExpense[];
  myName: string;
}

function GroupSummaryStats({ group, expenses, myName }: GroupSummaryStatsProps) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const myShare = myName
    ? expenses.reduce((s, e) => s + (e.shares[myName] ?? 0), 0)
    : 0;
  const myPaid = myName
    ? expenses.filter((e) => e.paidBy === myName).reduce((s, e) => s + e.amount, 0)
    : 0;
  const myNet = myPaid - myShare;

  const statCell = (
    label: string,
    value: string,
    color: string,
    sub?: string
  ) => (
    <div
      style={{
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        borderTop: `2px solid ${color}`,
        padding: "10px 12px",
        borderRadius: 2,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      {statCell("Total Expenses", formatGbp(total), "var(--ft-text)", `${expenses.length} items`)}
      {myName && statCell("Your Share", formatGbp(myShare), "var(--ft-blue)", "of total")}
      {myName && statCell("You Paid", formatGbp(myPaid), "var(--ft-accent)", "as payer")}
      {myName &&
        statCell(
          "Your Net",
          `${myNet > 0.005 ? "+" : ""}${formatGbp(myNet)}`,
          myNet > 0.005 ? "var(--ft-green)" : myNet < -0.005 ? "var(--ft-red)" : "var(--ft-dim)",
          myNet > 0.005 ? "others owe you" : myNet < -0.005 ? "you owe others" : "even"
        )}
      {!myName && statCell("Members", `${group.members.length}`, "var(--ft-blue)", "in group")}
    </div>
  );
}

// ─── MyNameSettingBar ──────────────────────────────────────────────────────────

interface MyNameBarProps {
  myName: string;
  onChange: (name: string) => void;
  groupMembers: string[];
}

function MyNameBar({ myName, onChange, groupMembers }: MyNameBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(myName);

  function save() {
    const trimmed = draft.trim();
    onChange(trimmed);
    saveMyName(trimmed);
    setEditing(false);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        borderRadius: 2,
        marginBottom: 10,
      }}
    >
      <Settings2 style={{ width: 11, height: 11, color: "var(--ft-dim)", flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--ft-dim)", flexShrink: 0 }}>You are</span>
      {editing ? (
        <>
          <select
            style={{ ...INPUT_S, height: 22, fontSize: 10, flex: 1, minWidth: 0 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          >
            <option value="">— pick your name —</option>
            {groupMembers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            style={{
              padding: "2px 8px",
              fontSize: 10,
              background: "var(--ft-blue)",
              color: "#fff",
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              padding: "2px 6px",
              fontSize: 10,
              background: "transparent",
              color: "var(--ft-dim)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 11, fontWeight: 600, color: myName ? "var(--ft-accent)" : "var(--ft-dim)" }}>
            {myName || "— not set —"}
          </span>
          <button
            onClick={() => {
              setDraft(myName);
              setEditing(true);
            }}
            style={{
              padding: "2px 7px",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "transparent",
              color: "var(--ft-dim)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            Change
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SplitPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTransaction = useCreateTransaction();

  const [data, setData] = useState<BillSplitData>(() => loadData());
  const [myName, setMyName] = useState<string>(() => loadMyName());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // Persist on every change
  useEffect(() => {
    saveData(data);
  }, [data]);

  const activeGroups = useMemo(
    () => data.groups.filter((g) => !g.settled),
    [data.groups]
  );
  const settledGroups = useMemo(
    () => data.groups.filter((g) => g.settled),
    [data.groups]
  );

  const selectedGroup = useMemo(
    () => (selectedGroupId ? data.groups.find((g) => g.id === selectedGroupId) ?? null : null),
    [selectedGroupId, data.groups]
  );

  const groupExpenses = useMemo(
    () => (selectedGroupId ? data.expenses.filter((e) => e.groupId === selectedGroupId) : []),
    [selectedGroupId, data.expenses]
  );

  // Auto-select first group when none selected
  useEffect(() => {
    if (!selectedGroupId && activeGroups.length > 0) {
      setSelectedGroupId(activeGroups[0].id);
    }
  }, [selectedGroupId, activeGroups]);

  const handleAddGroup = useCallback((group: SplitGroup) => {
    setData((prev) => ({ ...prev, groups: [...prev.groups, group] }));
    setSelectedGroupId(group.id);
    setShowAddGroup(false);
    setMobileView("detail");
    toast({ title: "Group created", description: group.name });
  }, [toast]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    setData((prev) => ({
      groups: prev.groups.filter((g) => g.id !== groupId),
      expenses: prev.expenses.filter((e) => e.groupId !== groupId),
    }));
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    toast({ title: "Group deleted" });
  }, [selectedGroupId, toast]);

  const handleAddExpense = useCallback((expense: SplitExpense) => {
    setData((prev) => ({ ...prev, expenses: [...prev.expenses, expense] }));
    setShowAddExpense(false);
    toast({ title: "Expense added", description: expense.description });
  }, [toast]);

  const handleDeleteExpense = useCallback((expenseId: string) => {
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== expenseId),
    }));
    toast({ title: "Expense removed" });
  }, [toast]);

  const handleMarkGroupSettled = useCallback(() => {
    if (!selectedGroupId) return;
    setData((prev) => ({
      ...prev,
      groups: prev.groups.map((g) =>
        g.id === selectedGroupId ? { ...g, settled: true } : g
      ),
    }));
    toast({ title: "Group settled", description: "All done!" });
  }, [selectedGroupId, toast]);

  const handleAddToTransactions = useCallback(
    async (expenseId: string) => {
      if (!myName) {
        toast({
          title: "Set your name first",
          description: "Use the 'You are' bar to identify yourself in this group.",
          variant: "destructive",
        });
        return;
      }
      const expense = data.expenses.find((e) => e.id === expenseId);
      if (!expense) return;
      const myShare = expense.shares[myName];
      if (myShare === undefined || myShare <= 0) {
        toast({
          title: "No share found",
          description: "You don't appear to have a share in this expense.",
          variant: "destructive",
        });
        return;
      }
      if (expense.addedToMyTransactions) return;

      try {
        await createTransaction.mutateAsync({
          data: {
            nativeAmount: Math.round(myShare * 100) / 100,
            currency: "GBP",
            type: "expense",
            description: expense.description,
            category: expense.category,
            accountId: 0,
            date: expense.date,
          },
        });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
        setData((prev) => ({
          ...prev,
          expenses: prev.expenses.map((e) =>
            e.id === expenseId ? { ...e, addedToMyTransactions: true } : e
          ),
        }));
        toast({
          title: "Added to transactions",
          description: `${expense.description} — ${formatGbp(myShare)}`,
        });
      } catch {
        toast({
          title: "Could not add transaction",
          description: "Please try again or add manually.",
          variant: "destructive",
        });
      }
    },
    [data.expenses, myName, createTransaction, queryClient, toast]
  );

  const handleSelectGroup = useCallback((id: string) => {
    setSelectedGroupId(id);
    setShowAddExpense(false);
    setMobileView("detail");
  }, []);

  // ─── Left panel ────────────────────────────────────────────────────────────

  const leftPanel = (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        height: "100%",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ft-dim)",
          }}
        >
          Groups ({activeGroups.length})
        </span>
        <button
          onClick={() => {
            setShowAddGroup(true);
            setMobileView("list");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            background: "rgba(96,165,250,0.1)",
            border: "1px solid rgba(96,165,250,0.25)",
            color: "var(--ft-blue)",
            borderRadius: 2,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
          }}
        >
          <Plus style={{ width: 10, height: 10 }} /> New
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {showAddGroup && (
          <AddGroupPanel
            onAdd={handleAddGroup}
            onCancel={() => setShowAddGroup(false)}
          />
        )}

        {activeGroups.length === 0 && !showAddGroup && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--ft-dim)",
              fontSize: 11,
            }}
          >
            <Users
              style={{
                width: 28,
                height: 28,
                margin: "0 auto 8px",
                opacity: 0.3,
              }}
            />
            <div style={{ marginBottom: 4 }}>No groups yet</div>
            <div style={{ fontSize: 10 }}>Create one to start splitting expenses.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activeGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              expenses={data.expenses}
              myName={myName}
              isActive={selectedGroupId === g.id}
              onClick={() => handleSelectGroup(g.id)}
              onDelete={() => handleDeleteGroup(g.id)}
            />
          ))}
        </div>

        {/* Settled groups collapsible */}
        {settledGroups.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowSettled((p) => !p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 0",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ft-dim)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                width: "100%",
              }}
            >
              {showSettled ? (
                <ChevronDown style={{ width: 11, height: 11 }} />
              ) : (
                <ChevronRight style={{ width: 11, height: 11 }} />
              )}
              Settled ({settledGroups.length})
            </button>
            {showSettled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {settledGroups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    expenses={data.expenses}
                    myName={myName}
                    isActive={selectedGroupId === g.id}
                    onClick={() => handleSelectGroup(g.id)}
                    onDelete={() => handleDeleteGroup(g.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Right panel ───────────────────────────────────────────────────────────

  const rightPanel = selectedGroup ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          borderLeft: "3px solid var(--ft-accent)",
          borderRadius: 2,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ft-text)", marginBottom: 3 }}>
            {selectedGroup.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {selectedGroup.members.map((m, i) => (
                <MemberAvatar key={m} name={m} members={selectedGroup.members} size={18} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              {selectedGroup.members.join(" · ")}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!selectedGroup.settled && (
            <button
              onClick={() => setShowAddExpense(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                background: "var(--ft-blue)",
                border: "none",
                color: "#fff",
                borderRadius: 2,
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <Plus style={{ width: 11, height: 11 }} /> Add Expense
            </button>
          )}
        </div>
      </div>

      {/* Your name bar */}
      <MyNameBar
        myName={myName}
        onChange={(n) => setMyName(n)}
        groupMembers={selectedGroup.members}
      />

      {/* Summary stats */}
      {groupExpenses.length > 0 && (
        <GroupSummaryStats
          group={selectedGroup}
          expenses={groupExpenses}
          myName={myName}
        />
      )}

      {/* Add expense form */}
      {showAddExpense && !selectedGroup.settled && (
        <AddExpenseForm
          group={selectedGroup}
          onAdd={handleAddExpense}
          onCancel={() => setShowAddExpense(false)}
        />
      )}

      {/* Expenses list */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            color: "var(--ft-dim)",
            marginBottom: 6,
            padding: "0 2px",
          }}
        >
          Expenses ({groupExpenses.length})
        </div>
        {groupExpenses.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              background: "var(--ft-surface)",
              border: "1px dashed var(--ft-border2)",
              borderRadius: 2,
              color: "var(--ft-dim)",
              fontSize: 11,
            }}
          >
            <DollarSign style={{ width: 22, height: 22, margin: "0 auto 8px", opacity: 0.3 }} />
            <div>No expenses yet.</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>
              Add one with the button above.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[...groupExpenses]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((exp) => (
                <ExpenseRow
                  key={exp.id}
                  expense={exp}
                  members={selectedGroup.members}
                  myName={myName}
                  onAddToTransactions={() => handleAddToTransactions(exp.id)}
                  onDelete={() => handleDeleteExpense(exp.id)}
                />
              ))}
          </div>
        )}
      </div>

      {/* Settle up */}
      <SettleUpPanel
        group={selectedGroup}
        expenses={groupExpenses}
        myName={myName}
        onMarkGroupSettled={handleMarkGroupSettled}
      />
    </div>
  ) : (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: 280,
        color: "var(--ft-dim)",
        fontSize: 12,
        gap: 8,
      }}
    >
      <SplitSquareHorizontal style={{ width: 32, height: 32, opacity: 0.2 }} />
      <div>Select a group to view expenses and settle up.</div>
    </div>
  );

  // ─── Responsive: detect mobile ─────────────────────────────────────────────
  // Use a simple className-based check rather than a JS media query to keep it stateless
  // and avoid a flicker; we do the logic via inline styles with a responsive breakpoint approach.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <PageHeader
        icon={SplitSquareHorizontal}
        title="Group Expenses"
        subtitle="Split bills, track shared costs, settle up with minimum transfers"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {data.groups.length > 0 && (
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ft-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {activeGroups.length} active
              </span>
            )}
          </div>
        }
      />

      {/* Two-panel layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 12,
          alignItems: "start",
        }}
        className="split-layout"
      >
        {/* Left panel */}
        <div
          style={{
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            borderRadius: 2,
            overflow: "hidden",
            minHeight: 400,
          }}
          className={mobileView === "detail" ? "split-panel-hidden" : "split-panel-left"}
        >
          {leftPanel}
        </div>

        {/* Right panel */}
        <div
          style={{ minHeight: 400 }}
          className={mobileView === "list" ? "split-panel-hidden-mobile" : ""}
        >
          {/* Mobile back button */}
          {mobileView === "detail" && (
            <button
              onClick={() => setMobileView("list")}
              style={{
                display: "none",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                borderRadius: 2,
                fontSize: 11,
                color: "var(--ft-muted)",
                cursor: "pointer",
                marginBottom: 10,
              }}
              className="split-back-btn"
            >
              <ChevronLeft style={{ width: 12, height: 12 }} /> Back to Groups
            </button>
          )}
          {rightPanel}
        </div>
      </div>

      {/* Responsive styles injected inline via a style tag */}
      <style>{`
        @media (max-width: 720px) {
          .split-layout {
            grid-template-columns: 1fr !important;
          }
          .split-panel-hidden {
            display: none !important;
          }
          .split-panel-hidden-mobile {
            display: none !important;
          }
          .split-back-btn {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
