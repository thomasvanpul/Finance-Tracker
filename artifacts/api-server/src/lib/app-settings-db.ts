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

// Persona (F1). Server does not know the runtime meaning of each id
// — validation is a string-set check. Frontend owns the semantics.
export const VALID_PERSONAS = ["market", "budget", "wealth", "social", "full"] as const;
export type PersonaId = (typeof VALID_PERSONAS)[number];

export async function getPersona(userId: string): Promise<PersonaId> {
  const row = await ensureSettings(userId);
  return (row.persona as PersonaId) ?? "full";
}

export async function setPersona(userId: string, persona: PersonaId): Promise<void> {
  await ensureSettings(userId);
  await db
    .update(appSettingsTable)
    .set({ persona })
    .where(eq(appSettingsTable.userId, userId));
}

// Theme. Same shape as persona: server validates against the id list;
// frontend (contexts/theme-context.tsx) owns colour semantics. Keep
// this list in sync with the FintrackTheme union — the client route
// gets called before the client applies, so an unknown id here is a
// hard 400 rather than a silent write.
export const VALID_THEMES = [
  "void", "phosphor", "arctic", "parchment", "slate", "linen",
  "amber", "midnight", "matrix", "synthwave", "deep-space",
  "mario", "gilded", "bloodline",
] as const;
export type ThemeId = (typeof VALID_THEMES)[number];

export async function getTheme(userId: string): Promise<ThemeId> {
  const row = await ensureSettings(userId);
  return (row.theme as ThemeId) ?? "void";
}

export async function setTheme(userId: string, theme: ThemeId): Promise<void> {
  await ensureSettings(userId);
  await db
    .update(appSettingsTable)
    .set({ theme })
    .where(eq(appSettingsTable.userId, userId));
}
