import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, debtsTable, userTable } from "@workspace/db";
import {
  CreateDebtBody,
  UpdateDebtParams,
  UpdateDebtBody,
  DeleteDebtParams,
  SettleDebtParams,
  ListDebtsResponse,
  GetDebtSummaryResponse,
} from "@workspace/api-zod";
import { toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";
import { adjustAccountBalance } from "../lib/balance";

const router: IRouter = Router();

async function enrichDebt(item: typeof debtsTable.$inferSelect, userId: string) {
  const nativeAmount = parseFloat(item.nativeAmount);
  const baseCurrency = await getBaseCurrency(userId);
  const gbpEquivalent = await toBase(nativeAmount, item.currency, baseCurrency);
  return {
    id: item.id,
    personName: item.personName,
    description: item.description,
    date: item.date,
    nativeAmount,
    currency: item.currency,
    direction: item.direction,
    status: item.status,
    notes: item.notes ?? null,
    accountId: item.accountId ?? null,
    gbpEquivalent: Math.round(gbpEquivalent * 100) / 100,
    createdAt: item.createdAt.toISOString(),
    linkedEmail: item.linkedEmail ?? null,
    linkedUserId: item.linkedUserId ?? null,
    isReceived: item.isReceived,
    sourceDebtId: item.sourceDebtId ?? null,
  };
}

// GET /users/lookup?email= — look up a user by email (for linking IOUs)
router.get("/users/lookup", async (req, res): Promise<void> => {
  const email = String(req.query.email ?? "").toLowerCase().trim();
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }
  const [user] = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, name: user.name, email: user.email });
});

// GET /debts/received — debts where current user is the linked recipient
router.get("/debts/received", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const items = await db
    .select()
    .from(debtsTable)
    .where(and(eq(debtsTable.linkedUserId, userId), eq(debtsTable.isReceived, true)))
    .orderBy(debtsTable.date);
  const enriched = await Promise.all(items.map((i) => enrichDebt(i, userId)));
  res.json(ListDebtsResponse.parse(enriched));
});

router.get("/debts/summary", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const items = await db
    .select()
    .from(debtsTable)
    .where(and(eq(debtsTable.userId, userId), eq(debtsTable.status, "pending")));

  const baseCurrency = await getBaseCurrency(userId);
  let totalOwedToMe = 0;
  let totalIOwe = 0;

  for (const item of items) {
    const gbp = await toBase(parseFloat(item.nativeAmount), item.currency, baseCurrency);
    if (item.direction === "they_owe_me") totalOwedToMe += gbp;
    else totalIOwe += gbp;
  }

  res.json(
    GetDebtSummaryResponse.parse({
      totalOwedToMe: Math.round(totalOwedToMe * 100) / 100,
      totalIOwe: Math.round(totalIOwe * 100) / 100,
      netGbp: Math.round((totalOwedToMe - totalIOwe) * 100) / 100,
      pendingCount: items.length,
    })
  );
});

router.get("/debts", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const items = await db
    .select()
    .from(debtsTable)
    .where(eq(debtsTable.userId, userId))
    .orderBy(debtsTable.date);
  const enriched = await Promise.all(items.map((i) => enrichDebt(i, userId)));
  res.json(ListDebtsResponse.parse(enriched));
});

router.post("/debts", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { nativeAmount, linkedEmail, ...rest } = parsed.data;

  // Insert the primary debt
  const [item] = await db
    .insert(debtsTable)
    .values({ ...rest, nativeAmount: String(nativeAmount), userId, linkedEmail: linkedEmail ?? null })
    .returning();

  // If linkedEmail provided, try to find the user and create a mirror debt
  if (linkedEmail) {
    const normalizedEmail = linkedEmail.toLowerCase().trim();
    const [linkedUser] = await db
      .select({ id: userTable.id, name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.email, normalizedEmail))
      .limit(1);

    if (linkedUser && linkedUser.id !== userId) {
      // Direction is flipped for the recipient
      const mirrorDirection = item.direction === "i_owe_them" ? "they_owe_me" : "i_owe_them";

      // Insert mirror debt for the linked user
      await db.insert(debtsTable).values({
        userId: linkedUser.id,
        personName: item.personName,
        description: item.description,
        date: item.date,
        nativeAmount: item.nativeAmount,
        currency: item.currency,
        direction: mirrorDirection,
        status: "pending",
        notes: item.notes ?? undefined,
        linkedEmail: null,
        linkedUserId: userId,
        isReceived: true,
        sourceDebtId: item.id,
      });

      // Update the original debt's linkedUserId
      await db
        .update(debtsTable)
        .set({ linkedUserId: linkedUser.id })
        .where(eq(debtsTable.id, item.id));
    }
  }

  const enriched = await enrichDebt(item, userId);
  res.status(201).json(enriched);
});

// POST /debts/:id/reject — recipient rejects a received IOU
router.post("/debts/:id/reject", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const idNum = parseInt(req.params.id);
  if (isNaN(idNum)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [debt] = await db
    .select()
    .from(debtsTable)
    .where(
      and(
        eq(debtsTable.id, idNum),
        eq(debtsTable.linkedUserId, userId),
        eq(debtsTable.isReceived, true)
      )
    );
  if (!debt) {
    res.status(404).json({ error: "Received debt not found" });
    return;
  }
  await db.delete(debtsTable).where(eq(debtsTable.id, idNum));
  res.sendStatus(204);
});

router.post("/debts/:id/settle", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = SettleDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(debtsTable)
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)));
  if (!existing) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  const [item] = await db
    .update(debtsTable)
    .set({ status: "settled" })
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  if (existing.accountId) {
    const nativeAmount = parseFloat(existing.nativeAmount);
    const txType = existing.direction === "i_owe_them" ? "expense" : "income";
    await adjustAccountBalance(existing.accountId, nativeAmount, existing.currency, txType);
  }
  const enriched = await enrichDebt(item, userId);
  res.json(enriched);
});

router.patch("/debts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = UpdateDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDebtBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.nativeAmount !== undefined) updateData.nativeAmount = String(parsed.data.nativeAmount);
  const [item] = await db
    .update(debtsTable)
    .set(updateData)
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  const enriched = await enrichDebt(item, userId);
  res.json(enriched);
});

router.delete("/debts/:id", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const params = UpdateDebtParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [item] = await db
    .delete(debtsTable)
    .where(and(eq(debtsTable.id, params.data.id), eq(debtsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Debt not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
