import { Router, type Request, type Response } from "express";
import { Resend } from "resend";
import { db, transactionsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import type { Transaction } from "@workspace/db";
import { toBase } from "../lib/market";
import { getBaseCurrency } from "../lib/app-settings-db";

const router = Router();

function getWeekBounds(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return { from, to: now };
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildHtml(data: {
  userName: string;
  weekIncome: number;
  weekExpenses: number;
  topCategories: { category: string; total: number }[];
  txCount: number;
}): string {
  const { userName, weekIncome, weekExpenses, topCategories, txCount } = data;
  const net = weekIncome - weekExpenses;
  const netColor = net >= 0 ? "#00ff88" : "#ff4444";

  const categoryRows = topCategories
    .map(
      (c) =>
        `<tr>
      <td style="font-family:monospace;font-size:13px;color:#aaa;padding:4px 0">${c.category}</td>
      <td style="font-family:monospace;font-size:13px;color:#fff;text-align:right;padding:4px 0">${formatGbp(c.total)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your Weekly Finance Digest</title></head>
<body style="background:#0d0d0d;margin:0;padding:20px;font-family:monospace">
  <div style="max-width:520px;margin:0 auto;border:1px solid #222;padding:32px">
    <div style="color:#00ff88;font-size:10px;letter-spacing:0.2em;margin-bottom:24px">NUMERIS · WEEKLY DIGEST</div>
    <h1 style="color:#fff;font-size:22px;font-weight:400;margin:0 0 8px">Hello, ${userName}</h1>
    <p style="color:#666;font-size:12px;margin:0 0 32px">Here's your financial summary for the past 7 days.</p>

    <div style="display:flex;gap:16px;margin-bottom:32px">
      <div style="flex:1;border:1px solid #222;padding:16px">
        <div style="color:#666;font-size:9px;letter-spacing:0.12em;margin-bottom:6px">INCOME</div>
        <div style="color:#00ff88;font-size:20px">${formatGbp(weekIncome)}</div>
      </div>
      <div style="flex:1;border:1px solid #222;padding:16px">
        <div style="color:#666;font-size:9px;letter-spacing:0.12em;margin-bottom:6px">EXPENSES</div>
        <div style="color:#ff4444;font-size:20px">${formatGbp(weekExpenses)}</div>
      </div>
      <div style="flex:1;border:1px solid #222;padding:16px">
        <div style="color:#666;font-size:9px;letter-spacing:0.12em;margin-bottom:6px">NET</div>
        <div style="color:${netColor};font-size:20px">${formatGbp(net)}</div>
      </div>
    </div>

    ${txCount > 0 ? `<div style="color:#666;font-size:11px;margin-bottom:8px">${txCount} transactions this week</div>` : ""}

    ${
      topCategories.length > 0
        ? `
    <div style="border:1px solid #222;padding:16px;margin-bottom:24px">
      <div style="color:#666;font-size:9px;letter-spacing:0.12em;margin-bottom:12px">TOP SPENDING CATEGORIES</div>
      <table style="width:100%;border-collapse:collapse">${categoryRows}</table>
    </div>`
        : ""
    }

    <p style="color:#333;font-size:10px;margin-top:32px">You're receiving this because you enabled weekly digest in Numeris. <a href="#" style="color:#555">Unsubscribe</a></p>
  </div>
</body>
</html>`;
}

// POST /api/digest/send — send digest to authenticated user's email
router.post("/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as { id: string; email: string; name?: string } | undefined;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userId = user.id;
    const userEmail = user.email;
    const userName = user.name ?? "there";

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Resend not configured" });
      return;
    }

    const resend = new Resend(apiKey);

    const { from } = getWeekBounds();
    const fromStr = from.toISOString().slice(0, 10);

    // Fetch week's transactions
    const weekTxs = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), gte(transactionsTable.date, fromStr)));

    const baseCurrency = await getBaseCurrency(userId);

    // Convert each transaction's nativeAmount to base currency
    const converted = await Promise.all(
      weekTxs.map(async (tx: Transaction) => {
        const native = Math.abs(parseFloat(tx.nativeAmount));
        const base = await toBase(native, tx.currency, baseCurrency);
        return { ...tx, baseValue: base };
      })
    );

    const weekIncome = converted
      .filter((t: Transaction & { baseValue: number }) => t.type === "income")
      .reduce((s: number, t: Transaction & { baseValue: number }) => s + t.baseValue, 0);

    const weekExpenses = converted
      .filter((t: Transaction & { baseValue: number }) => t.type === "expense")
      .reduce((s: number, t: Transaction & { baseValue: number }) => s + t.baseValue, 0);

    // Top categories by expense in base currency
    const catMap: Record<string, number> = {};
    for (const tx of converted.filter((t: Transaction & { baseValue: number }) => t.type === "expense")) {
      catMap[tx.category] = (catMap[tx.category] ?? 0) + tx.baseValue;
    }
    const topCategories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, total]) => ({ category, total }));

    const html = buildHtml({
      userName,
      weekIncome,
      weekExpenses,
      topCategories,
      txCount: weekTxs.length,
    });

    await resend.emails.send({
      from: "Numeris <digest@numeris.app>",
      to: userEmail,
      subject: `Weekly Digest — ${new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })}`,
      html,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Digest send error:", err);
    res.status(500).json({ error: "Failed to send digest" });
  }
});

export default router;
