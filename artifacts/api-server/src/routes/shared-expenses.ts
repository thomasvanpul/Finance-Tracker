// F4 shared expenses.
//
// The whole feature turns on multi-tenancy. Two users can touch the
// same row through different lenses: the payer via
// sharedExpensesTable.userId, and any linked participant via
// sharedExpenseParticipantsTable.linkedUserId. Every query in this
// file names its predicate explicitly — there is no "trust the join,
// the FK will save us". A participant can READ the expense but
// cannot mutate it; only the payer can PATCH or DELETE. Only the
// payer can settle a participant's share; only the linked
// participant can REQUEST settlement on their own share.
//
// The zod schemas live inline here rather than in @workspace/api-zod
// so this router doesn't wait on an orval codegen pass. When the UI
// stabilises we lift them to the openapi spec and regenerate.
//
// State-changing endpoints for settlement live in this file too —
// keeping the whole feature in one router makes the multi-tenancy
// review straightforward.

import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  sharedExpensesTable,
  sharedExpenseParticipantsTable,
  sharedExpenseSettlementsTable,
  userTable,
} from "@workspace/db";
import { splitEqual, splitExact, splitShares } from "../lib/split-rules";

const router: IRouter = Router();

// ── Zod contracts ───────────────────────────────────────────────────

const CurrencyCode = z.string().length(3);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const ParticipantInput = z.object({
  name: z.string().min(1, "name required"),
  linkedEmail: z.string().email().optional(),
  // For "exact" rule this is the amount the participant owes; for
  // "shares" it's the integer share weight; for "equal" it's ignored
  // (participant list length is enough).
  shareInput: z.number().optional(),
  isPayer: z.boolean().optional(),
});

const CreateSharedExpenseBody = z.object({
  description: z.string().min(1),
  date: IsoDate,
  totalAmount: z.number().positive(),
  currency: CurrencyCode.default("GBP"),
  splitRule: z.enum(["equal", "exact", "shares"]),
  notes: z.string().optional(),
  accountId: z.number().int().optional(),
  participants: z.array(ParticipantInput).min(1, "at least one participant"),
});

// Split-rule dispatch. Returns per-participant amounts in insertion
// order, summing exactly to `total`. Any error here bubbles as a
// 400 — a malformed split is user error, not a server bug.
function applySplitRule(
  rule: "equal" | "exact" | "shares",
  total: number,
  participants: z.infer<typeof ParticipantInput>[],
): number[] {
  const n = participants.length;
  if (rule === "equal") return splitEqual(total, n).amounts;
  if (rule === "exact") {
    const amounts = participants.map((p, i) => {
      if (typeof p.shareInput !== "number") {
        throw new Error(`participant[${i}] shareInput required for exact split`);
      }
      return p.shareInput;
    });
    return splitExact(total, amounts).amounts;
  }
  // shares
  const shares = participants.map((p, i) => {
    if (typeof p.shareInput !== "number" || !Number.isInteger(p.shareInput)) {
      throw new Error(`participant[${i}] shareInput must be an integer share count`);
    }
    return p.shareInput;
  });
  return splitShares(total, shares).amounts;
}

// Enrich for the client. The participants array carries settlement
// status inline. Amounts are returned as numbers, currency stays
// alongside — a caller must never render one without the other.
async function enrichExpense(
  expense: typeof sharedExpensesTable.$inferSelect,
): Promise<Record<string, unknown>> {
  const participants = await db
    .select()
    .from(sharedExpenseParticipantsTable)
    .where(eq(sharedExpenseParticipantsTable.sharedExpenseId, expense.id));

  return {
    id: expense.id,
    userId: expense.userId,
    description: expense.description,
    date: expense.date,
    totalAmount: parseFloat(expense.totalAmount),
    currency: expense.currency,
    splitRule: expense.splitRule,
    notes: expense.notes ?? null,
    accountId: expense.accountId ?? null,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      linkedEmail: p.linkedEmail ?? null,
      linkedUserId: p.linkedUserId ?? null,
      shareInput: p.shareInput == null ? null : parseFloat(p.shareInput),
      shareAmount: parseFloat(p.shareAmount),
      isPayer: p.isPayer === "true",
      status: p.status,
    })),
  };
}

// A predicate that finds the expense IF the caller is authorised to
// see it: they are either the payer OR a linked participant. Used by
// GET /:id and GET /. Mutation endpoints use a stricter predicate
// (payer only) — see comment on PATCH / DELETE below.
async function findExpenseForReader(
  expenseId: number,
  userId: string,
): Promise<typeof sharedExpensesTable.$inferSelect | null> {
  const [ownExpense] = await db
    .select()
    .from(sharedExpensesTable)
    .where(and(eq(sharedExpensesTable.id, expenseId), eq(sharedExpensesTable.userId, userId)));
  if (ownExpense) return ownExpense;

  // Not the payer — check if a participant row links this user.
  const [participant] = await db
    .select()
    .from(sharedExpenseParticipantsTable)
    .where(
      and(
        eq(sharedExpenseParticipantsTable.sharedExpenseId, expenseId),
        eq(sharedExpenseParticipantsTable.linkedUserId, userId),
      ),
    );
  if (!participant) return null;

  // Load the expense itself. NOT scoped to userId here — we've
  // already verified the user is a participant on this specific
  // expense id; the fetch is authorised.
  const [expense] = await db
    .select()
    .from(sharedExpensesTable)
    .where(eq(sharedExpensesTable.id, expenseId));
  return expense ?? null;
}

// ── Routes ───────────────────────────────────────────────────────────

// GET /shared-expenses — list all expenses this user can see (as
// payer OR as linked participant). Payer-owned expenses always
// appear; participant-visible expenses appear too but never for a
// user who has neither role.
router.get("/shared-expenses", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  // 1. Expenses this user created.
  const own = await db
    .select()
    .from(sharedExpensesTable)
    .where(eq(sharedExpensesTable.userId, userId))
    .orderBy(sharedExpensesTable.date);

  // 2. Expenses where this user is a linked participant. Two-step
  //    fetch so we can restrict the second `select` to the expense
  //    ids we've already established the user is authorised for.
  const participantRows = await db
    .select({ sharedExpenseId: sharedExpenseParticipantsTable.sharedExpenseId })
    .from(sharedExpenseParticipantsTable)
    .where(eq(sharedExpenseParticipantsTable.linkedUserId, userId));

  const participantExpenseIds = participantRows.map((r) => r.sharedExpenseId);
  const externalIds = participantExpenseIds.filter((id) => !own.some((o) => o.id === id));

  // Fetch each authorised-as-participant expense one at a time.
  // A small N; a batch `inArray` would be optimal but adds a code
  // path the multi-tenancy review has to re-audit. Keep it plain.
  const external: (typeof sharedExpensesTable.$inferSelect)[] = [];
  for (const id of externalIds) {
    const [e] = await db.select().from(sharedExpensesTable).where(eq(sharedExpensesTable.id, id));
    if (e) external.push(e);
  }

  const all = [...own, ...external];
  const enriched = await Promise.all(all.map(enrichExpense));
  res.json(enriched);
});

// GET /shared-expenses/:id — single expense. 404 if the user is
// neither payer nor linked participant. Do NOT distinguish
// "doesn't exist" from "you can't see it" — both are 404 to the
// user. Multi-tenancy leakage often starts with error messages.
router.get("/shared-expenses/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const expense = await findExpenseForReader(id, userId);
  if (!expense) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(await enrichExpense(expense));
});

// POST /shared-expenses — create.
router.post("/shared-expenses", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateSharedExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;

  // Split the total. This throws for exact-sum mismatches and any
  // other split-rule input error — surface the message to the user.
  let shareAmounts: number[];
  try {
    shareAmounts = applySplitRule(body.splitRule, body.totalAmount, body.participants);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  // Insert the expense.
  const [expense] = await db
    .insert(sharedExpensesTable)
    .values({
      userId,
      description: body.description,
      date: body.date,
      totalAmount: String(body.totalAmount),
      currency: body.currency,
      splitRule: body.splitRule,
      notes: body.notes ?? null,
      accountId: body.accountId ?? null,
    })
    .returning();

  // Resolve linked users by email in one lookup per email. If an
  // email doesn't correspond to a Numeris user, the row still gets
  // created — linkedUserId stays null and the participant is a
  // private ledger entry (same behaviour as legacy debts).
  const emailList = body.participants
    .map((p) => p.linkedEmail?.toLowerCase().trim())
    .filter((e): e is string => typeof e === "string" && e.length > 0);
  const emails: string[] = Array.from(new Set<string>(emailList));
  const userLookups = new Map<string, string>();
  for (const email of emails) {
    const [u] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);
    if (u) userLookups.set(email, u.id);
  }

  // Insert participants.
  for (let i = 0; i < body.participants.length; i++) {
    const p = body.participants[i]!;
    const email = p.linkedEmail?.toLowerCase().trim();
    const linkedUserId = email ? userLookups.get(email) ?? null : null;
    await db.insert(sharedExpenseParticipantsTable).values({
      sharedExpenseId: expense.id,
      name: p.name,
      linkedEmail: email ?? null,
      linkedUserId,
      shareInput: p.shareInput != null ? String(p.shareInput) : null,
      shareAmount: String(shareAmounts[i]),
      isPayer: p.isPayer ? "true" : "false",
      status: "outstanding",
    });
  }

  res.status(201).json(await enrichExpense(expense));
});

// PATCH /shared-expenses/:id — payer only.
//
// Only rewrites the top-level metadata (description, date, notes).
// Rewriting the split rule or totalAmount would require re-computing
// per-participant shares and re-issuing settlement handshakes,
// which is a separate flow (delete + recreate covers it today).
const PatchSharedExpenseBody = z.object({
  description: z.string().min(1).optional(),
  date: IsoDate.optional(),
  notes: z.string().nullable().optional(),
});

router.patch("/shared-expenses/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = PatchSharedExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Payer-only mutation. Predicate is (id AND userId=payer).
  const [existing] = await db
    .select()
    .from(sharedExpensesTable)
    .where(and(eq(sharedExpensesTable.id, id), eq(sharedExpensesTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.date !== undefined) updateData.date = parsed.data.date;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  const [updated] = await db
    .update(sharedExpensesTable)
    .set(updateData)
    .where(and(eq(sharedExpensesTable.id, id), eq(sharedExpensesTable.userId, userId)))
    .returning();
  res.json(await enrichExpense(updated));
});

// DELETE /shared-expenses/:id — payer only. Cascades to
// participants + settlements via the FK ON DELETE CASCADE.
router.delete("/shared-expenses/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [removed] = await db
    .delete(sharedExpensesTable)
    .where(and(eq(sharedExpensesTable.id, id), eq(sharedExpensesTable.userId, userId)))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.sendStatus(204);
});

// ── Settlement handshake (F4-3) ─────────────────────────────────────

// POST /shared-expenses/:id/participants/:pid/request
// The LINKED PARTICIPANT (not the payer) claims to have paid their
// share. Records a "requested" settlement; flips participant status
// to "requested". The payer then acknowledges or disputes.
router.post("/shared-expenses/:id/participants/:pid/request", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const expenseId = parseInt(req.params.id, 10);
  const participantId = parseInt(req.params.pid, 10);
  if (!Number.isInteger(expenseId) || !Number.isInteger(participantId)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const note = typeof req.body?.note === "string" ? (req.body.note as string) : null;

  // The participant must exist on THIS expense (guards against
  // requesting settlement on a participant id from another expense
  // you happen to be linked to) AND their linkedUserId must be the
  // caller. This is the participant-side authorisation predicate.
  const [participant] = await db
    .select()
    .from(sharedExpenseParticipantsTable)
    .where(
      and(
        eq(sharedExpenseParticipantsTable.id, participantId),
        eq(sharedExpenseParticipantsTable.sharedExpenseId, expenseId),
        eq(sharedExpenseParticipantsTable.linkedUserId, userId),
      ),
    );
  if (!participant) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (participant.status === "acknowledged") {
    res.status(409).json({ error: "already settled" });
    return;
  }

  await db.insert(sharedExpenseSettlementsTable).values({
    participantId,
    actorUserId: userId,
    kind: "requested",
    note,
  });
  await db
    .update(sharedExpenseParticipantsTable)
    .set({ status: "requested" })
    .where(eq(sharedExpenseParticipantsTable.id, participantId));
  res.sendStatus(204);
});

// POST /shared-expenses/:id/participants/:pid/acknowledge
// PAYER-only. Confirms a request; participant status → acknowledged.
router.post("/shared-expenses/:id/participants/:pid/acknowledge", async (req, res): Promise<void> => {
  await payerSettlementAction(req, res, "acknowledged", "acknowledged");
});

// POST /shared-expenses/:id/participants/:pid/dispute
// PAYER-only. Rejects a request; participant status flips back to
// outstanding but the dispute row stays in the ledger for audit.
router.post("/shared-expenses/:id/participants/:pid/dispute", async (req, res): Promise<void> => {
  await payerSettlementAction(req, res, "disputed", "outstanding");
});

// POST /shared-expenses/:id/participants/:pid/waive
// PAYER-only. Marks a participant settled unilaterally — the only
// path when the participant is NOT a Numeris user and can therefore
// never send a request themselves. The audit trail records the
// waive so the fact that no handshake occurred is visible on the
// expense detail view.
router.post("/shared-expenses/:id/participants/:pid/waive", async (req, res): Promise<void> => {
  await payerSettlementAction(req, res, "waived", "acknowledged");
});

async function payerSettlementAction(
  req: import("express").Request,
  res: import("express").Response,
  kind: "acknowledged" | "disputed" | "waived",
  nextStatus: "acknowledged" | "outstanding",
): Promise<void> {
  const userId = (req as any).userId as string;
  const expenseId = parseInt(String(req.params.id), 10);
  const participantId = parseInt(String(req.params.pid), 10);
  if (!Number.isInteger(expenseId) || !Number.isInteger(participantId)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const note = typeof req.body?.note === "string" ? (req.body.note as string) : null;

  // The expense must exist AND belong to the caller as payer. Only
  // then can the caller act on any of its participants.
  const [expense] = await db
    .select()
    .from(sharedExpensesTable)
    .where(and(eq(sharedExpensesTable.id, expenseId), eq(sharedExpensesTable.userId, userId)));
  if (!expense) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const [participant] = await db
    .select()
    .from(sharedExpenseParticipantsTable)
    .where(
      and(
        eq(sharedExpenseParticipantsTable.id, participantId),
        eq(sharedExpenseParticipantsTable.sharedExpenseId, expenseId),
      ),
    );
  if (!participant) {
    res.status(404).json({ error: "not found" });
    return;
  }

  await db.insert(sharedExpenseSettlementsTable).values({
    participantId,
    actorUserId: userId,
    kind,
    note,
  });
  await db
    .update(sharedExpenseParticipantsTable)
    .set({ status: nextStatus })
    .where(eq(sharedExpenseParticipantsTable.id, participantId));
  res.sendStatus(204);
}

export default router;
