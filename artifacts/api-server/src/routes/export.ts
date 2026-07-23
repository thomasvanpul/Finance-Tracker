import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db, accountsTable, transactionsTable, investmentsTable, upcomingTable,
  debtsTable, budgetsTable, goalsTable, subscriptionsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/export/backup", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const [accounts, transactions, investments, upcoming, debts, budgets, goals, subscriptions] =
    await Promise.all([
      db.select().from(accountsTable).where(eq(accountsTable.userId, userId)),
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
      db.select().from(investmentsTable).where(eq(investmentsTable.userId, userId)),
      db.select().from(upcomingTable).where(eq(upcomingTable.userId, userId)),
      db.select().from(debtsTable).where(eq(debtsTable.userId, userId)),
      db.select().from(budgetsTable).where(eq(budgetsTable.userId, userId)),
      db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
      db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)),
    ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    accounts,
    transactions,
    investments,
    upcoming,
    debts,
    budgets,
    goals,
    subscriptions,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="numeris-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

export default router;
