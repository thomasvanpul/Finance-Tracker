import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function ensureSettings(userId: string) {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.userId, userId));
  if (rows[0]) return rows[0];
  const [row] = await db
    .insert(appSettingsTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  return row ?? (await db.select().from(appSettingsTable).where(eq(appSettingsTable.userId, userId)))[0]!;
}

export async function getBaseCurrency(userId: string): Promise<string> {
  const row = await ensureSettings(userId);
  return row.baseCurrency;
}

export async function setBaseCurrency(userId: string, currency: string): Promise<void> {
  await ensureSettings(userId);
  await db
    .update(appSettingsTable)
    .set({ baseCurrency: currency })
    .where(eq(appSettingsTable.userId, userId));
}
