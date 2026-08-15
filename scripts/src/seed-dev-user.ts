// Seed a known test user into the Neon dev branch, with enough realistic
// data to exercise the UI. Idempotent — safe to run repeatedly. Refuses to
// run against anything but the dev branch. Credentials live in this file
// deliberately (not in a committed .env).
//
// Prerequisite: the api-server must be running on API_BASE_URL, because
// user + password creation goes through better-auth's HTTP endpoint (which
// owns the password hash format). Everything else is written directly via
// drizzle so we can bulk-insert without hitting rate limits.
//
//   1. cd artifacts/api-server && pnpm dev     (in one terminal)
//   2. cd scripts && pnpm seed:dev              (in another)

import { eq } from "drizzle-orm";
import {
  db,
  userTable,
  accountsTable,
  transactionsTable,
  subscriptionsTable,
  budgetsTable,
  upcomingTable,
  debtsTable,
} from "@workspace/db";

import { SEED_EMAIL, SEED_PASSWORD, SEED_NAME } from "./seed-credentials.js";

// ── Dev-branch guard ────────────────────────────────────────────────────────
const DEV_DB_HOST = "ep-withered-night-abucoq17";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

function assertDevBranch(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(DEV_DB_HOST)) {
    console.error(
      `[seed] refusing to run — DATABASE_URL must point at the dev branch host "${DEV_DB_HOST}"`,
    );
    console.error(`[seed] observed: ${url ? url.replace(/:[^@/]+@/, ":***@") : "(unset)"}`);
    process.exit(1);
  }
}

// ── Date helpers (relative to today so screenshots stay meaningful) ─────────
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoDaysAhead(days: number): string {
  return isoDaysAgo(-days);
}

// ── Delete existing seed user (cascade wipes everything user-owned) ─────────
async function purge(): Promise<void> {
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, SEED_EMAIL));
  if (existing.length > 0) {
    await db.delete(userTable).where(eq(userTable.email, SEED_EMAIL));
    console.log(`[seed] removed existing user ${SEED_EMAIL} (cascade)`);
  }
}

// ── Create user via better-auth HTTP endpoint (owns the password hash) ──────
async function signUp(): Promise<string> {
  // Better-auth rejects requests without an Origin header. Use one that the
  // api-server's trustedOrigins already whitelists in dev (localhost:4321).
  const res = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:4321",
    },
    body: JSON.stringify({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      name: SEED_NAME,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sign-up failed: ${res.status} ${res.statusText}\n${body}`);
  }
  const row = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, SEED_EMAIL));
  if (row.length === 0) throw new Error("user row missing after sign-up");
  return row[0].id;
}

// ── Accounts: mix currencies + all four account.type values ─────────────────
interface SeededAccount { id: number; name: string; currency: string; }

async function seedAccounts(userId: string): Promise<Record<string, SeededAccount>> {
  const values = [
    { key: "monzo",    row: { userId, name: "Monzo Current",       currency: "GBP", type: "cash",       balance: "2450.30",   isWiseLinked: false } },
    { key: "barclays", row: { userId, name: "Barclays Savings",    currency: "GBP", type: "cash",       balance: "8100.00",   isWiseLinked: false } },
    { key: "wiseEur",  row: { userId, name: "Wise EUR",            currency: "EUR", type: "cash",       balance: "540.75",    isWiseLinked: false } },
    { key: "maybank",  row: { userId, name: "Maybank MYR",         currency: "MYR", type: "cash",       balance: "1980.00",   isWiseLinked: false } },
    { key: "vanguard", row: { userId, name: "Vanguard ISA",        currency: "GBP", type: "investment", balance: "14200.00",  isWiseLinked: false } },
    { key: "pension",  row: { userId, name: "Aviva SIPP",          currency: "GBP", type: "pension",    balance: "27500.00",  isWiseLinked: false } },
    { key: "flat",     row: { userId, name: "Flat, Kuala Lumpur",  currency: "MYR", type: "property",   balance: "850000.00", isWiseLinked: false } },
    { key: "misc",     row: { userId, name: "Season ticket loan",  currency: "GBP", type: "other",      balance: "6800.00",   isWiseLinked: false } },
  ] as const;

  const inserted = await db
    .insert(accountsTable)
    .values(values.map((v) => v.row))
    .returning({ id: accountsTable.id, name: accountsTable.name, currency: accountsTable.currency });

  const map: Record<string, SeededAccount> = {};
  for (const v of values) {
    const found = inserted.find((r) => r.name === v.row.name);
    if (!found) throw new Error(`missing account ${v.row.name}`);
    map[v.key] = { id: found.id, name: found.name, currency: found.currency };
  }
  return map;
}

// ── Transactions: ~90 days, realistic raw merchant descriptors ──────────────
interface TxSpec {
  daysAgo: number;
  description: string;
  type: "income" | "expense" | "transfer";
  category: string;
  account: keyof Awaited<ReturnType<typeof seedAccounts>>;
  amount: string;
  currency: string;
}

async function seedTransactions(userId: string, acc: Record<string, SeededAccount>): Promise<void> {
  const txs: TxSpec[] = [
    // Salary — recurring monthly
    { daysAgo: 88, description: "IMPERIAL COLLEGE UROP STIPEND", type: "income",  category: "Salary",       account: "monzo",    amount: "1250.00", currency: "GBP" },
    { daysAgo: 58, description: "IMPERIAL COLLEGE UROP STIPEND", type: "income",  category: "Salary",       account: "monzo",    amount: "1250.00", currency: "GBP" },
    { daysAgo: 28, description: "IMPERIAL COLLEGE UROP STIPEND", type: "income",  category: "Salary",       account: "monzo",    amount: "1250.00", currency: "GBP" },

    // Rent
    { daysAgo: 85, description: "BACS RENT LANDLORD REF 4471",   type: "expense", category: "Rent / Mortgage", account: "monzo", amount: "890.00",  currency: "GBP" },
    { daysAgo: 55, description: "BACS RENT LANDLORD REF 4471",   type: "expense", category: "Rent / Mortgage", account: "monzo", amount: "890.00",  currency: "GBP" },
    { daysAgo: 25, description: "BACS RENT LANDLORD REF 4471",   type: "expense", category: "Rent / Mortgage", account: "monzo", amount: "890.00",  currency: "GBP" },

    // Groceries + eating out
    { daysAgo: 82, description: "TESCO STORES 3456",              type: "expense", category: "Groceries",   account: "monzo",    amount: "42.18",   currency: "GBP" },
    { daysAgo: 79, description: "SAINSBURYS SMKT",                type: "expense", category: "Groceries",   account: "monzo",    amount: "31.55",   currency: "GBP" },
    { daysAgo: 76, description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 72, description: "PRET A MANGER 4118",             type: "expense", category: "Eating Out",  account: "monzo",    amount: "8.45",    currency: "GBP" },
    { daysAgo: 68, description: "TESCO STORES 3456",              type: "expense", category: "Groceries",   account: "monzo",    amount: "27.80",   currency: "GBP" },
    { daysAgo: 65, description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 60, description: "M&S SIMPLY FOOD",                type: "expense", category: "Groceries",   account: "monzo",    amount: "18.20",   currency: "GBP" },
    { daysAgo: 54, description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 50, description: "DISHOOM SHOREDITCH",             type: "expense", category: "Eating Out",  account: "monzo",    amount: "62.30",   currency: "GBP" },
    { daysAgo: 47, description: "TESCO STORES 3456",              type: "expense", category: "Groceries",   account: "monzo",    amount: "38.90",   currency: "GBP" },
    { daysAgo: 42, description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 38, description: "PRET A MANGER 4118",             type: "expense", category: "Eating Out",  account: "monzo",    amount: "9.10",    currency: "GBP" },
    { daysAgo: 33, description: "TESCO STORES 3456",              type: "expense", category: "Groceries",   account: "monzo",    amount: "45.60",   currency: "GBP" },
    { daysAgo: 29, description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 22, description: "WAITROSE 401 KENSINGTON",        type: "expense", category: "Groceries",   account: "monzo",    amount: "51.20",   currency: "GBP" },
    { daysAgo: 18, description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 14, description: "TESCO STORES 3456",              type: "expense", category: "Groceries",   account: "monzo",    amount: "35.10",   currency: "GBP" },
    { daysAgo: 10, description: "PRET A MANGER 4118",             type: "expense", category: "Eating Out",  account: "monzo",    amount: "8.75",    currency: "GBP" },
    { daysAgo: 7,  description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },
    { daysAgo: 4,  description: "TESCO STORES 3456",              type: "expense", category: "Groceries",   account: "monzo",    amount: "22.40",   currency: "GBP" },
    { daysAgo: 2,  description: "SQ *THE COFFEE HOUSE LONDON GB", type: "expense", category: "Coffee",      account: "monzo",    amount: "3.85",    currency: "GBP" },

    // Transport
    { daysAgo: 70, description: "TFL TRAVEL CH",                  type: "expense", category: "Transport",   account: "monzo",    amount: "18.30",   currency: "GBP" },
    { daysAgo: 40, description: "TFL TRAVEL CH",                  type: "expense", category: "Transport",   account: "monzo",    amount: "21.10",   currency: "GBP" },
    { daysAgo: 15, description: "TFL TRAVEL CH",                  type: "expense", category: "Transport",   account: "monzo",    amount: "19.75",   currency: "GBP" },
    { daysAgo: 6,  description: "UBER *TRIP HELP.UBER.COM",       type: "expense", category: "Transport",   account: "monzo",    amount: "14.20",   currency: "GBP" },

    // Shopping / Electronics
    { daysAgo: 63, description: "AMZN Mktp UK*RT4H8",             type: "expense", category: "Shopping",    account: "monzo",    amount: "29.99",   currency: "GBP" },
    { daysAgo: 44, description: "AMZN Mktp UK*QQ2P1",             type: "expense", category: "Shopping",    account: "monzo",    amount: "14.50",   currency: "GBP" },
    { daysAgo: 20, description: "APPLE.COM/BILL",                 type: "expense", category: "Electronics", account: "barclays", amount: "179.00",  currency: "GBP" },

    // Utilities
    { daysAgo: 80, description: "OCTOPUS ENERGY DD",              type: "expense", category: "Utilities",   account: "monzo",    amount: "72.40",   currency: "GBP" },
    { daysAgo: 50, description: "OCTOPUS ENERGY DD",              type: "expense", category: "Utilities",   account: "monzo",    amount: "68.10",   currency: "GBP" },
    { daysAgo: 20, description: "OCTOPUS ENERGY DD",              type: "expense", category: "Utilities",   account: "monzo",    amount: "63.90",   currency: "GBP" },

    // Foreign currency — EUR
    { daysAgo: 45, description: "SNCF CONNECT PARIS",             type: "expense", category: "Travel",      account: "wiseEur",  amount: "89.50",   currency: "EUR" },
    { daysAgo: 44, description: "BOULANGERIE PAUL",               type: "expense", category: "Eating Out",  account: "wiseEur",  amount: "6.20",    currency: "EUR" },
    { daysAgo: 43, description: "MONOPRIX GARE DU NORD",          type: "expense", category: "Groceries",   account: "wiseEur",  amount: "18.75",   currency: "EUR" },
    { daysAgo: 42, description: "HOTEL LES DEUX GARES",           type: "expense", category: "Accommodation", account: "wiseEur", amount: "142.00", currency: "EUR" },

    // Foreign currency — MYR
    { daysAgo: 30, description: "GRABPAY *MRT KUALA LUMPUR",      type: "expense", category: "Transport",   account: "maybank",  amount: "12.50",   currency: "MYR" },
    { daysAgo: 26, description: "JAYA GROCER MIDVALLEY",          type: "expense", category: "Groceries",   account: "maybank",  amount: "84.30",   currency: "MYR" },
    { daysAgo: 21, description: "STARBUCKS KLCC MYR",             type: "expense", category: "Coffee",      account: "maybank",  amount: "18.90",   currency: "MYR" },

    // Investment / transfers
    { daysAgo: 60, description: "VANGUARD ISA CONTRIBUTION",      type: "transfer", category: "Savings",    account: "vanguard", amount: "500.00",  currency: "GBP" },
    { daysAgo: 30, description: "VANGUARD ISA CONTRIBUTION",      type: "transfer", category: "Savings",    account: "vanguard", amount: "500.00",  currency: "GBP" },
  ];

  const rows = txs.map((t) => {
    const account = acc[t.account];
    if (!account) throw new Error(`unknown account key ${t.account}`);
    return {
      userId,
      date: isoDaysAgo(t.daysAgo),
      description: t.description,
      type: t.type,
      category: t.category,
      accountId: account.id,
      nativeAmount: t.amount,
      currency: t.currency,
      source: "manual",
    };
  });
  await db.insert(transactionsTable).values(rows);
  console.log(`[seed] inserted ${rows.length} transactions`);
}

async function seedSubscriptions(userId: string): Promise<void> {
  const startDate = isoDaysAgo(180);
  await db.insert(subscriptionsTable).values([
    { userId, name: "Netflix",            amount: "10.99", currency: "GBP", frequency: "monthly", category: "Entertainment", nextDue: isoDaysAhead(12), startDate, active: true, manuallyAdded: true },
    { userId, name: "Spotify",            amount: "11.99", currency: "GBP", frequency: "monthly", category: "Entertainment", nextDue: isoDaysAhead(5),  startDate, active: true, manuallyAdded: true },
    { userId, name: "iCloud+ 200GB",      amount: "2.99",  currency: "GBP", frequency: "monthly", category: "Utilities",     nextDue: isoDaysAhead(20), startDate, active: true, manuallyAdded: true },
    { userId, name: "ChatGPT Plus",       amount: "20.00", currency: "USD", frequency: "monthly", category: "Subscriptions", nextDue: isoDaysAhead(8),  startDate, active: true, manuallyAdded: true },
  ]);
  console.log("[seed] inserted 4 subscriptions");
}

async function seedUpcoming(userId: string, acc: Record<string, SeededAccount>): Promise<void> {
  await db.insert(upcomingTable).values([
    {
      userId,
      dueDate: isoDaysAhead(6),
      description: "BACS RENT LANDLORD REF 4471",
      category: "Rent / Mortgage",
      type: "expense",
      frequency: "monthly",
      status: "pending",
      nativeAmount: "890.00",
      currency: "GBP",
      accountId: acc.monzo.id,
    },
    {
      userId,
      dueDate: isoDaysAhead(14),
      description: "OCTOPUS ENERGY DD",
      category: "Utilities",
      type: "expense",
      frequency: "monthly",
      status: "pending",
      nativeAmount: "70.00",
      currency: "GBP",
      accountId: acc.monzo.id,
    },
    {
      // Foreign — exercises the native+converted row rendering on
      // MobileUpcomingFull. RM 1,250 / month for the KL flat.
      userId,
      dueDate: isoDaysAhead(9),
      description: "MAYBANK PROPERTY TAX",
      category: "Property",
      type: "expense",
      frequency: "one-time",
      status: "pending",
      nativeAmount: "1250.00",
      currency: "MYR",
      accountId: acc.maybank.id,
    },
  ]);
  console.log("[seed] inserted 3 upcoming bills (1 foreign)");
}

async function seedDebts(userId: string): Promise<void> {
  await db.insert(debtsTable).values([
    {
      userId,
      personName: "Alex Chen",
      description: "Split dinner at Dishoom",
      date: isoDaysAgo(50),
      nativeAmount: "31.15",
      currency: "GBP",
      direction: "they_owe_me",
      status: "pending",
    },
    {
      userId,
      personName: "Priya Nair",
      description: "Concert ticket",
      date: isoDaysAgo(22),
      nativeAmount: "48.00",
      currency: "GBP",
      direction: "i_owe_them",
      status: "pending",
    },
    {
      // Foreign — exercises the native+converted amount treatment on
      // MobileOwing.
      userId,
      personName: "Hui Ling",
      description: "Shared Airbnb, Penang",
      date: isoDaysAgo(12),
      nativeAmount: "620.00",
      currency: "MYR",
      direction: "they_owe_me",
      status: "pending",
    },
  ]);
  console.log("[seed] inserted 3 debts (1 foreign)");
}

async function seedBudgets(userId: string): Promise<void> {
  await db.insert(budgetsTable).values([
    { userId, category: "Groceries",       monthlyLimit: "300.00" },
    { userId, category: "Coffee",          monthlyLimit: "40.00"  },
    { userId, category: "Eating Out",      monthlyLimit: "150.00" },
    { userId, category: "Transport",       monthlyLimit: "80.00"  },
    { userId, category: "Utilities",       monthlyLimit: "100.00" },
    { userId, category: "Rent / Mortgage", monthlyLimit: "900.00" },
    { userId, category: "Shopping",        monthlyLimit: "120.00" },
  ]);
  console.log("[seed] inserted 7 budgets");
}

async function main(): Promise<void> {
  assertDevBranch();
  console.log(`[seed] target: dev branch (${DEV_DB_HOST})`);
  console.log(`[seed] api:    ${API_BASE}`);
  console.log(`[seed] user:   ${SEED_EMAIL}`);

  await purge();
  const userId = await signUp();
  console.log(`[seed] created user ${userId}`);

  const acc = await seedAccounts(userId);
  console.log(`[seed] inserted ${Object.keys(acc).length} accounts`);

  await seedTransactions(userId, acc);
  await seedSubscriptions(userId);
  await seedUpcoming(userId, acc);
  await seedDebts(userId);
  await seedBudgets(userId);

  console.log(`\n[seed] done. sign in as ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
