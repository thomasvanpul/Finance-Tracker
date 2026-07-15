import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SETTINGS_ROW_ID = 1;

export async function getBaseCurrency(): Promise<string> {
  const rows = await db
    .select({ baseCurrency: appSettingsTable.baseCurrency })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  return rows[0]?.baseCurrency ?? "GBP";
}

export async function setBaseCurrency(currency: string): Promise<void> {
  await db
    .update(appSettingsTable)
    .set({ baseCurrency: currency })
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
}
