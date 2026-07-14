import { Router, type IRouter } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import { ImportCsvResponse } from "@workspace/api-zod";
import { parseRevolutCsv } from "../lib/csv-import/revolut";
import { parseMaybankCsv } from "../lib/csv-import/maybank";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function dedupeHash(accountId: number, date: string, description: string, amount: number): string {
  return createHash("sha256").update(`${accountId}|${date}|${description}|${amount}`).digest("hex");
}

router.post("/import/csv", upload.single("file"), async (req, res): Promise<void> => {
  const provider = req.query.provider as string;
  const accountId = Number(req.query.accountId);

  if (!["revolut", "maybank"].includes(provider)) {
    res.status(400).json({ error: "provider must be 'revolut' or 'maybank'" });
    return;
  }
  if (!Number.isInteger(accountId)) {
    res.status(400).json({ error: "accountId query param is required" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded (expected multipart field 'file')" });
    return;
  }

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) {
    res.status(404).json({ error: `Account ${accountId} not found` });
    return;
  }

  const fileContent = req.file.buffer.toString("utf-8");
  const { rows, errors } =
    provider === "revolut" ? parseRevolutCsv(fileContent) : parseMaybankCsv(fileContent);

  let added = 0;
  let skipped = 0;

  for (const row of rows) {
    const externalId = `csv:${dedupeHash(accountId, row.date, row.description, row.amount)}`;

    const existing = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.externalId, externalId));

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(transactionsTable).values({
      date: row.date,
      description: row.description,
      type: row.amount > 0 ? "income" : "expense",
      category: "Other",
      accountId,
      nativeAmount: String(Math.abs(row.amount)),
      currency: row.currency,
      source: "csv",
      externalId,
    });
    added++;
  }

  logger.info({ provider, accountId, added, skipped, parseErrors: errors.length }, "CSV import complete");
  res.json(ImportCsvResponse.parse({ provider, added, skipped, errors }));
});

export default router;
