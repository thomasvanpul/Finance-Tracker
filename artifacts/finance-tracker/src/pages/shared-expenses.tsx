// F4-5: minimal shared-expenses UI.
//
// This is deliberately spartan. The desktop language (mono figures,
// hairline borders, ft-* tokens) is inherited from primitives so the
// page slots into the terminal aesthetic without inventing a new
// visual system. When usage patterns settle, the crud + settlement
// interactions here will be folded into /split alongside the local
// group workflow it already carries.
//
// What this page CAN do:
//   - list my shared expenses (as payer OR linked participant)
//   - create a new shared expense with N participants and a
//     split rule (equal / exact / shares)
//   - as PAYER: acknowledge, dispute, or waive a participant's
//     settlement request
//   - as PARTICIPANT: request settlement on my share
//
// What it deliberately doesn't do yet:
//   - patch / edit — delete + recreate covers it
//   - full participant CRUD after creation
//   - integrating an actual bank payment (that is TrueLayer + F4's
//     "one level under moving money" model — separate decision)
//
// The whole page cannot show a number the API did not supply. Every
// figure comes from useListSharedExpenses().data — nothing local.

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { HStack, VStack, Text, PanelBox } from "@/components/primitives";
import { Users } from "lucide-react";
import {
  useListSharedExpenses,
  useCreateSharedExpense,
  useParticipantSettlementAction,
  useDeleteSharedExpense,
  type SharedExpense,
  type CreateSharedExpenseInput,
} from "@/lib/shared-expenses-hook";
import { authClient } from "@/lib/auth-client";

const STATUS_COLOR: Record<string, string> = {
  outstanding: "var(--ft-dim)",
  requested: "var(--ft-amber)",
  acknowledged: "var(--ft-green)",
  disputed: "var(--ft-red)",
  waived: "var(--ft-muted)",
};

const RULE_LABEL: Record<CreateSharedExpenseInput["splitRule"], string> = {
  equal: "Equal (remainder pence go to earliest)",
  exact: "Exact amounts (must sum to total)",
  shares: "Integer shares (proportional)",
};

interface ParticipantInputRow {
  name: string;
  linkedEmail: string;
  shareInput: string; // string so the user can type "1.50" or "3" freely
}

export default function SharedExpensesPage() {
  const { data: expenses = [], isLoading } = useListSharedExpenses();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;

  const [creating, setCreating] = useState(false);

  return (
    <div style={{ padding: "16px 24px 32px" }}>
      <PageHeader
        icon={Users}
        title="Shared Expenses"
        subtitle="Bills split with other people. If they use Numeris, they see this too."
        actions={
          <button
            onClick={() => setCreating((v) => !v)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: creating ? "var(--ft-muted)" : "var(--ft-accent)",
              background: "transparent",
              border: `1px solid ${creating ? "var(--ft-border)" : "var(--ft-accent)"}`,
              padding: "6px 14px",
              cursor: "pointer",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {creating ? "Cancel" : "+ New Bill"}
          </button>
        }
      />

      {creating && (
        <CreateForm
          onDone={() => setCreating(false)}
          currentUserEmail={session?.user?.email ?? ""}
        />
      )}

      {isLoading && (
        <Text mono size={11} color="var(--ft-dim)">Loading…</Text>
      )}

      {!isLoading && expenses.length === 0 && !creating && (
        <PanelBox padding={16}>
          <Text mono size={11} color="var(--ft-dim)">
            No shared bills yet. Click "New Bill" to record one.
          </Text>
        </PanelBox>
      )}

      <VStack gap={12} marginTop={16}>
        {expenses.map((e) => (
          <ExpenseCard key={e.id} expense={e} currentUserId={currentUserId} />
        ))}
      </VStack>
    </div>
  );
}

function ExpenseCard({
  expense,
  currentUserId,
}: {
  expense: SharedExpense;
  currentUserId: string | null;
}) {
  const isPayer = currentUserId != null && expense.userId === currentUserId;
  const settle = useParticipantSettlementAction();
  const del = useDeleteSharedExpense();

  return (
    <PanelBox padding={14}>
      <HStack justify="between" align="baseline">
        <VStack gap={2} minWidth0>
          <Text as="div" size={13} weight={600}>{expense.description}</Text>
          <Text as="div" mono size={10} color="var(--ft-dim)" letterSpacing="0.04em">
            {expense.date} · {expense.currency} {expense.totalAmount.toFixed(2)} · {expense.splitRule}
          </Text>
        </VStack>
        <Text mono size={10} color="var(--ft-dim)" letterSpacing="0.06em">
          {isPayer ? "YOU PAID" : "SHARED WITH YOU"}
        </Text>
      </HStack>

      {expense.notes && (
        <Text as="div" size={11} color="var(--ft-muted)" mt={4}>{expense.notes}</Text>
      )}

      <div style={{ marginTop: 10, borderTop: "1px solid var(--ft-border)" }}>
        {expense.participants.map((p) => {
          const isMe = p.linkedUserId != null && p.linkedUserId === currentUserId;
          return (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid var(--ft-border)",
                alignItems: "center",
              }}
            >
              <div>
                <Text as="div" size={12} weight={500}>
                  {p.name}{isMe ? " (you)" : ""}{p.isPayer ? " · payer" : ""}
                </Text>
                <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.04em">
                  {p.linkedUserId ? "linked" : p.linkedEmail ?? "unlinked"}
                </Text>
              </div>
              <Text mono size={12} className="pnum">
                {expense.currency} {p.shareAmount.toFixed(2)}
              </Text>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: STATUS_COLOR[p.status] ?? "var(--ft-dim)",
                  textTransform: "uppercase",
                  border: `1px solid ${STATUS_COLOR[p.status] ?? "var(--ft-dim)"}44`,
                  padding: "2px 6px",
                }}
              >
                {p.status}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {isPayer && !p.isPayer && p.status === "requested" && (
                  <>
                    <SmallBtn
                      label="Ack"
                      onClick={() =>
                        settle.mutate({ expenseId: expense.id, participantId: p.id, action: "acknowledge" })
                      }
                    />
                    <SmallBtn
                      label="Dispute"
                      danger
                      onClick={() =>
                        settle.mutate({ expenseId: expense.id, participantId: p.id, action: "dispute" })
                      }
                    />
                  </>
                )}
                {isPayer && !p.isPayer && p.status === "outstanding" && p.linkedUserId == null && (
                  // Participant is not a Numeris user; only a waive is
                  // possible from the payer's side.
                  <SmallBtn
                    label="Waive"
                    onClick={() =>
                      settle.mutate({ expenseId: expense.id, participantId: p.id, action: "waive" })
                    }
                  />
                )}
                {isMe && !p.isPayer && (p.status === "outstanding" || p.status === "disputed") && (
                  <SmallBtn
                    label="Mark paid"
                    onClick={() =>
                      settle.mutate({ expenseId: expense.id, participantId: p.id, action: "request" })
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isPayer && (
        <HStack justify="end" marginTop={10}>
          <SmallBtn
            label="Delete bill"
            danger
            onClick={() => {
              if (confirm(`Delete "${expense.description}"? Participants keep their history.`)) {
                del.mutate(expense.id);
              }
            }}
          />
        </HStack>
      )}
    </PanelBox>
  );
}

function SmallBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  const color = danger ? "var(--ft-red)" : "var(--ft-accent)";
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color,
        background: "transparent",
        border: `1px solid ${color}`,
        padding: "4px 10px",
        cursor: "pointer",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function CreateForm({
  onDone,
  currentUserEmail,
}: {
  onDone: () => void;
  currentUserEmail: string;
}) {
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [splitRule, setSplitRule] = useState<CreateSharedExpenseInput["splitRule"]>("equal");
  const [rows, setRows] = useState<ParticipantInputRow[]>([
    { name: "You", linkedEmail: currentUserEmail, shareInput: "" },
    { name: "", linkedEmail: "", shareInput: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateSharedExpense();

  const parsedTotal = useMemo(() => parseFloat(totalAmount), [totalAmount]);

  function updateRow(i: number, patch: Partial<ParticipantInputRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { name: "", linkedEmail: "", shareInput: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    if (!description.trim()) { setError("Description required"); return; }
    if (!isFinite(parsedTotal) || parsedTotal <= 0) { setError("Total must be a positive number"); return; }
    if (rows.length === 0 || rows.some((r) => !r.name.trim())) {
      setError("Every participant needs a name");
      return;
    }
    const participants = rows.map((r, i) => ({
      name: r.name.trim(),
      linkedEmail: r.linkedEmail.trim() || undefined,
      shareInput: splitRule === "equal" ? undefined : (
        splitRule === "shares" ? parseInt(r.shareInput, 10) : parseFloat(r.shareInput)
      ),
      isPayer: i === 0 && r.linkedEmail.trim().toLowerCase() === currentUserEmail.toLowerCase(),
    }));
    try {
      await create.mutateAsync({
        description: description.trim(),
        date,
        totalAmount: parsedTotal,
        currency,
        splitRule,
        participants,
      });
      onDone();
    } catch (err) {
      // Surface the server's message — the split-rule validator
      // writes for the user (e.g. "amounts sum to 9.99, expected
      // 10.00").
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1.4fr 0.6fr auto",
    gap: 8,
    marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    padding: "6px 8px",
    background: "var(--ft-raised)",
    border: "1px solid var(--ft-border2)",
    color: "var(--ft-text)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
  };

  return (
    <PanelBox padding={16}>
      <Text as="div" size={13} weight={600} mb={12}>New shared bill</Text>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px", gap: 10, marginBottom: 12 }}>
        <input
          placeholder="Description (e.g. Dinner at Padella)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={inputStyle}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={inputStyle}
        />
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <input
          type="number"
          step="0.01"
          placeholder="Total amount"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          style={inputStyle}
        />
        <select
          value={splitRule}
          onChange={(e) => setSplitRule(e.target.value as CreateSharedExpenseInput["splitRule"])}
          style={inputStyle}
        >
          {Object.entries(RULE_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      <Text mono size={9} color="var(--ft-dim)" letterSpacing="0.06em" mb={6}>
        PARTICIPANTS
      </Text>
      <div style={rowStyle}>
        <Text mono size={9} color="var(--ft-dim)">NAME</Text>
        <Text mono size={9} color="var(--ft-dim)">EMAIL (optional link)</Text>
        <Text mono size={9} color="var(--ft-dim)">
          {splitRule === "equal" ? "—" : splitRule === "shares" ? "SHARES" : "AMOUNT"}
        </Text>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} style={rowStyle}>
          <input value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} style={inputStyle} placeholder="Name" />
          <input value={r.linkedEmail} onChange={(e) => updateRow(i, { linkedEmail: e.target.value })} style={inputStyle} placeholder="name@example.com" />
          <input
            value={r.shareInput}
            onChange={(e) => updateRow(i, { shareInput: e.target.value })}
            style={inputStyle}
            disabled={splitRule === "equal"}
            placeholder={splitRule === "shares" ? "e.g. 2" : splitRule === "exact" ? "e.g. 8.20" : ""}
          />
          <button
            onClick={() => removeRow(i)}
            disabled={rows.length <= 1}
            style={{
              background: "transparent",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-dim)",
              padding: "6px 10px",
              cursor: rows.length <= 1 ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addRow}
        style={{
          background: "transparent",
          border: "1px dashed var(--ft-border2)",
          color: "var(--ft-dim)",
          padding: "6px 12px",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          marginTop: 6,
          width: "100%",
        }}
      >
        + Add participant
      </button>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            border: "1px solid var(--ft-red)44",
            background: "var(--ft-red)11",
            color: "var(--ft-red)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      <HStack gap={8} justify="end" marginTop={14}>
        <SmallBtn label="Cancel" onClick={onDone} />
        <button
          onClick={submit}
          disabled={create.isPending}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-base)",
            background: create.isPending ? "var(--ft-muted)" : "var(--ft-accent)",
            border: "none",
            padding: "6px 16px",
            cursor: create.isPending ? "not-allowed" : "pointer",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {create.isPending ? "Creating…" : "Create bill"}
        </button>
      </HStack>
    </PanelBox>
  );
}
