import { db, userTable, upcomingTable } from "@workspace/db";
import { like, eq } from "drizzle-orm";

async function main() {
  const [user] = await db.select({ id: userTable.id })
    .from(userTable)
    .where(like(userTable.email, '%vanpulthomas+numeris%'));
  if (!user) throw new Error("User vanpulthomas+numeris not found");

  const userId = user.id;
  // Account IDs in production: Monzo=3, Maybank=4, Wise MYR=5, Trading212=6
  const MONZO = 3, MAYBANK = 4, WISE_MYR = 5;

  const items = [
    // Near-term (this week)
    { dueDate: "2026-09-03", description: "Council Tax", category: "Housing", type: "expense", frequency: "monthly", nativeAmount: "142.00", currency: "GBP", accountId: MONZO },
    // Mid-term
    { dueDate: "2026-09-08", description: "Netflix", category: "Subscriptions", type: "expense", frequency: "monthly", nativeAmount: "17.99", currency: "GBP", accountId: MONZO },
    { dueDate: "2026-09-12", description: "Spotify", category: "Subscriptions", type: "expense", frequency: "monthly", nativeAmount: "11.99", currency: "GBP", accountId: MONZO },
    { dueDate: "2026-09-15", description: "Imperial Stipend", category: "Income", type: "income", frequency: "monthly", nativeAmount: "1200.00", currency: "GBP", accountId: MONZO },
    { dueDate: "2026-09-18", description: "KL Weekend Trip", category: "Travel", type: "expense", frequency: "one-time", nativeAmount: "650.00", currency: "MYR", accountId: WISE_MYR },
    { dueDate: "2026-09-20", description: "Maxis Phone Bill", category: "Utilities", type: "expense", frequency: "monthly", nativeAmount: "65.00", currency: "MYR", accountId: MAYBANK },
    { dueDate: "2026-09-20", description: "iCloud+", category: "Subscriptions", type: "expense", frequency: "monthly", nativeAmount: "2.99", currency: "GBP", accountId: MONZO },
    { dueDate: "2026-09-25", description: "PureGym", category: "Health & Fitness", type: "expense", frequency: "monthly", nativeAmount: "45.00", currency: "GBP", accountId: MONZO },
    // Far-term
    { dueDate: "2026-10-01", description: "Rent", category: "Housing", type: "expense", frequency: "monthly", nativeAmount: "925.00", currency: "GBP", accountId: MONZO },
    { dueDate: "2026-10-10", description: "Contents Insurance", category: "Insurance", type: "expense", frequency: "yearly", nativeAmount: "180.00", currency: "GBP", accountId: MONZO },
    { dueDate: "2026-10-14", description: "Broadband Renewal", category: "Utilities", type: "expense", frequency: "one-time", nativeAmount: "30.00", currency: "GBP", accountId: MONZO },
  ];

  const rows = items.map(i => ({
    ...i,
    status: "pending" as const,
    userId,
  }));

  const inserted = await db.insert(upcomingTable).values(rows).returning({ id: upcomingTable.id, description: upcomingTable.description });
  console.log("Seeded", inserted.length, "items:");
  inserted.forEach(i => console.log(" ", i.id, i.description));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
