import { Router, type IRouter } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  db, accountsTable, transactionsTable, investmentsTable, upcomingTable,
  debtsTable, budgetsTable, goalsTable, subscriptionsTable,
} from "@workspace/db";
import { txToBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";

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

router.get("/export/tax-year/:year", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const yearParam = parseInt(req.params.year, 10);

  if (isNaN(yearParam) || yearParam < 2000 || yearParam > 2100) {
    res.status(400).json({ error: "Invalid tax year. Provide a four-digit year e.g. 2024 for the 2024/25 tax year." });
    return;
  }

  // UK tax year: 6 April YYYY – 5 April YYYY+1
  const dateFrom = `${yearParam}-04-06`;
  const dateTo = `${yearParam + 1}-04-05`;

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        gte(transactionsTable.date, dateFrom),
        lte(transactionsTable.date, dateTo),
      )
    )
    .orderBy(transactionsTable.date);

  const accounts = await db
    .select({ id: accountsTable.id, name: accountsTable.name })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId));

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const baseCurrency = await getBaseCurrency(userId);

  const escape = (v: string | number): string => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = ["Date", "Description", "Amount", "Type", "Category", "Account", "Notes"];
  const rows: string[] = [header.join(",")];

  for (const tx of txs) {
    const native = parseFloat(tx.nativeAmount);
    // Stored rate when present — a CSV export re-run tomorrow won't
    // silently show different Amount values for the same transactions.
    const gbp = await txToBase(tx, baseCurrency);
    // Empty string in the Amount column when FX is unavailable — an
    // exported spreadsheet full of fabricated conversions would poison
    // the user's own accounting downstream.
    const amount =
      gbp == null ? "" : ((tx.type === "expense" ? -gbp : gbp).toFixed(2));
    const accountName = accountMap.get(tx.accountId) ?? "Unknown";

    rows.push(
      [
        tx.date,
        tx.description,
        amount,
        tx.type,
        tx.category,
        accountName,
        "", // Notes field — reserved for future use
      ]
        .map(escape)
        .join(","),
    );
  }

  const csv = rows.join("\n");
  const filename = `tax-year-${yearParam}-${String(yearParam + 1).slice(2)}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;
