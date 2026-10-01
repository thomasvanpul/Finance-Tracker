// Daily net-worth history: the capture on the dashboard read, and the
// read behind GET /net-worth/history. Table rules are in
// lib/db/src/schema/net-worth-snapshots.ts.

import { asc, eq } from "drizzle-orm";
import { db, netWorthSnapshotsTable } from "@workspace/db";
import type { NetWorthTerms } from "../routes/dashboard";
import { localDateString } from "./date-ranges";
import { logger } from "./logger";

export interface NetWorthCapture {
  terms: NetWorthTerms;
  // computeNetWorth(terms), exactly as the dashboard returned it. Passed in
  // rather than recomputed so the stored figure is the one the user saw.
  netWorth: number;
  baseCurrency: string;
  // The dashboard's own figure was partial (unconvertible account or
  // unvalued holding).
  partial: boolean;
  now?: Date;
}

// Write-once per (user, local date): the first dashboard read of the day
// captures, later reads no-op. Never throws — a lazy side-effect on a read
// path must not fail the read (same posture as captureAccountSnapshots).
export async function captureNetWorthSnapshot(userId: string, capture: NetWorthCapture): Promise<void> {
  const { terms, baseCurrency, partial } = capture;
  try {
    await db
      .insert(netWorthSnapshotsTable)
      .values({
        userId,
        date: localDateString(capture.now ?? new Date()),
        baseCurrency,
        assets: String(terms.totalCash),
        portfolio: String(terms.portfolioValueBase),
        liabilities: String(terms.totalLiabilities),
        owingNet: String(terms.totalOwedToMe - terms.totalIOwe),
        netWorth: String(capture.netWorth),
        partial,
      })
      .onConflictDoNothing({ target: [netWorthSnapshotsTable.userId, netWorthSnapshotsTable.date] });
  } catch (err) {
    logger.warn({ err, userId }, "captureNetWorthSnapshot: insert failed");
  }
}

export interface NetWorthPoint {
  date: string;
  netWorth: number;
  assets: number;
  portfolio: number;
  liabilities: number;
  owingNet: number;
  partial: boolean;
}

export interface NetWorthHistory {
  baseCurrency: string;
  // Earliest captured day in the current base currency, or null when none.
  dataAvailableSince: string | null;
  // Captured days in a previous base currency, left out of `points`
  // rather than converted at today's rate.
  daysInOtherCurrency: number;
  points: NetWorthPoint[];
}

const money = (v: unknown): number => Math.round(Number(v) * 100) / 100;

export async function readNetWorthHistory(
  userId: string,
  baseCurrency: string,
  days: number,
  now: Date = new Date(),
): Promise<NetWorthHistory> {
  // One row per captured day, so a user's whole history is small; reading
  // it all gives dataAvailableSince without a second query.
  const rows = await db
    .select()
    .from(netWorthSnapshotsTable)
    .where(eq(netWorthSnapshotsTable.userId, userId))
    .orderBy(asc(netWorthSnapshotsTable.date));

  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  const fromStr = localDateString(from);

  const inBase = rows.filter((r) => r.baseCurrency === baseCurrency);
  return {
    baseCurrency,
    dataAvailableSince: inBase[0]?.date ?? null,
    daysInOtherCurrency: rows.length - inBase.length,
    points: inBase
      .filter((r) => r.date >= fromStr)
      .map((r) => ({
        date: r.date,
        netWorth: money(r.netWorth),
        assets: money(r.assets),
        portfolio: money(r.portfolio),
        liabilities: money(r.liabilities),
        owingNet: money(r.owingNet),
        partial: r.partial,
      })),
  };
}
