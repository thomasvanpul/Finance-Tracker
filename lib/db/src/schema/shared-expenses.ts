import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

// A shared expense is one payment made by one user on behalf of a
// group. Unlike a standalone debt (see debts.ts), the participants
// are related — they were on the same bill — so settling one tells
// the payer where they are with the whole bill, not just one line.
//
// userId here is always the payer. Every participant either has a
// linkedUserId (they are also a Numeris user and see the expense on
// their own screen) or does not (private ledger only, exactly like
// today's debts). The row must always exist on the payer's side; a
// participant seeing it is derived from participant.linkedUserId,
// never from a duplicated row on their user_id — that is the
// multi-tenancy contract this schema enforces.
//
// Currency is captured once at the expense level, not per participant.
// A split rule applied to the total in currency X produces per-
// participant amounts in the same currency. Cross-currency splits
// (payer paid in EUR, participant thinks in GBP) are out of scope
// for F4 and would require an FX capture at settlement time.
export const sharedExpensesTable = pgTable("shared_expenses", {
  id: serial("id").primaryKey(),
  // Payer / creator. Every query MUST include this predicate unless
  // the query is running for a participant, in which case the
  // predicate is on shared_expense_participants.linkedUserId.
  userId: text("user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  date: text("date").notNull(), // ISO YYYY-MM-DD
  // Total the payer actually paid, in the currency they paid in.
  // Stored as numeric to avoid float error in the split arithmetic;
  // the split logic converts to integer minor units before dividing.
  totalAmount: numeric("total_amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  // Split rule. Percentage splits are deliberately NOT a top-level
  // rule — the check-in comment in F4 rejects them unless they sum
  // exactly. The two rules that always sum exactly are:
  //   equal   — divide evenly. Remainder pence go to the earliest
  //             participants by insertion order. Deterministic.
  //   exact   — participants specify per-person amounts; validated
  //             to sum to totalAmount.
  //   shares  — proportional to integer share weights; remainder
  //             pence go to the participants with the largest share
  //             weight, then insertion order. Deterministic.
  splitRule: text("split_rule").notNull(), // "equal" | "exact" | "shares"
  notes: text("notes"),
  // Optional link to the payer's account that the expense came out
  // of. Used later to attach a transaction to the expense.
  accountId: integer("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// One row per participant. The payer may or may not be a participant
// themselves — record it either way. `linkedUserId` is the fanout
// mechanism: a Numeris user linked to this row sees the expense in
// their own inbox and can act on their own settlement handshake.
//
// `shareInput` captures the raw user input (share count for shares,
// exact amount for exact, unused for equal). `shareAmount` is the
// final amount THIS participant owes the payer in the expense's
// currency, always summing to totalAmount across participants. Both
// are stored so the UI can round-trip the input without re-running
// the split calculation, and so a future edit that changes the
// total can re-derive shareAmount from shareInput.
export const sharedExpenseParticipantsTable = pgTable("shared_expense_participants", {
  id: serial("id").primaryKey(),
  sharedExpenseId: integer("shared_expense_id").notNull().references(() => sharedExpensesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  linkedEmail: text("linked_email"),
  linkedUserId: text("linked_user_id").references(() => userTable.id, { onDelete: "set null" }),
  shareInput: numeric("share_input", { precision: 18, scale: 4 }),
  shareAmount: numeric("share_amount", { precision: 18, scale: 4 }).notNull(),
  // Whether this participant IS the payer (creator of the expense).
  // A payer-participant does not owe themselves; they're recorded so
  // the split arithmetic is complete and the UI can show the payer's
  // own share alongside everyone else's.
  isPayer: text("is_payer").notNull().default("false"), // "true" | "false", kept as text for cross-driver portability
  // Freeze-dried settlement status. Advances via the settlement
  // handshake in shared_expense_settlements — the pointer here is
  // the authoritative current status; the settlements table is the
  // audit trail.
  status: text("status").notNull().default("outstanding"),
  //   outstanding    — no request in flight, participant still owes
  //   requested      — participant claims to have paid; awaiting ack
  //   acknowledged   — payer confirmed receipt; settled
  //   disputed       — payer rejected the claim; back to outstanding
  //                    from the participant's point of view but the
  //                    dispute reason is recorded on the settlement
  //   waived         — payer unilaterally marked settled (used when
  //                    the participant is not a Numeris user and can
  //                    never send a request themselves)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// The handshake ledger. Every state change on a participant's
// settlement is one row here, in insertion order, so the audit trail
// survives even if the participant.status is later flipped by a
// dispute. The payer sees the full trail on the expense detail view.
export const sharedExpenseSettlementsTable = pgTable("shared_expense_settlements", {
  id: serial("id").primaryKey(),
  participantId: integer("participant_id").notNull().references(() => sharedExpenseParticipantsTable.id, { onDelete: "cascade" }),
  // Who fired the action. For the participant → "requested" event
  // this is participant.linkedUserId; for the payer → "acknowledged"
  // or "disputed" it is the expense.userId. Recorded explicitly
  // rather than inferred so the audit is legible after a dispute.
  actorUserId: text("actor_user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "requested" | "acknowledged" | "disputed" | "waived"
  // Free-text note (dispute reason, payment method, etc.). Never
  // required — a settlement with no note is normal.
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSharedExpenseSchema = createInsertSchema(sharedExpensesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertSharedExpense = z.infer<typeof insertSharedExpenseSchema>;
export type SharedExpense = typeof sharedExpensesTable.$inferSelect;

export const insertSharedExpenseParticipantSchema = createInsertSchema(sharedExpenseParticipantsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertSharedExpenseParticipant = z.infer<typeof insertSharedExpenseParticipantSchema>;
export type SharedExpenseParticipant = typeof sharedExpenseParticipantsTable.$inferSelect;

export const insertSharedExpenseSettlementSchema = createInsertSchema(sharedExpenseSettlementsTable).omit({
  id: true, createdAt: true,
});
export type InsertSharedExpenseSettlement = z.infer<typeof insertSharedExpenseSettlementSchema>;
export type SharedExpenseSettlement = typeof sharedExpenseSettlementsTable.$inferSelect;
