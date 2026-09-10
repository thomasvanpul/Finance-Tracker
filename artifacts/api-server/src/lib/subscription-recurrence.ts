// Subscriptions as a recurrence RULE that generates upcoming rows.
//
// ── The three representations, and why this one wins ─────────────────────
// A payment that repeats has three homes in this schema: `subscriptions`
// (manual, has frequency + nextDue, reaches no total), `recurring_patterns`
// (auto-detected from transactions, reaches no total), and `upcoming` (the
// only one that reaches committedOut, at dashboard.ts:197 via the query at
// dashboard.ts:427, and at upcoming.ts:82 and ai-context.ts:157).
//
// `upcoming` is canonical for a DATED FUTURE OBLIGATION. `subscriptions` is
// the rule that emits those rows. Teaching committedOut to read
// subscriptions directly would double-count every subscription the user has
// also entered by hand as an upcoming item, on day one.
//
// ── The two properties that matter ───────────────────────────────────────
// IDEMPOTENT. Running generation twice must not produce two rows. Held in
//   two places: this module only ever emits an occurrence that has no row
//   yet, and `upcoming_subscription_due_uniq` (migration 0021) refuses the
//   duplicate in the database when two requests race.
//
// IT ADVANCES. Generation emits the earliest occurrence on or after today
//   for which no row exists — of ANY status. A row that has been paid still
//   occupies its occurrence, so the next call emits the one after it. That
//   is the whole advance mechanism; there is no separate "roll forward"
//   step and `subscriptions.nextDue` is never rewritten. The user's own
//   data is read, not reconciled.
//
// ── Deliberately one row ahead, not a horizon ────────────────────────────
// Each active subscription holds at most one unfilled occupied occurrence.
// A horizon (say "everything in the next 90 days") would put three monthly
// rows in a 30-day committedOut window for a quarterly-billed service and
// overstate the commitment. One row ahead means committedOut counts each
// subscription at most once per window, which is what it means.

import { localDateString } from "./date-ranges";

/** The vocabulary `upcoming.frequency` uses. */
export type UpcomingFrequency = "one-time" | "weekly" | "monthly" | "quarterly" | "yearly";

// The two tables disagree on the word for a year. `subscriptions` is
// written by pages/subscriptions.tsx and components/mobile/MobileSubscriptions.tsx,
// which both type frequency as "weekly" | "monthly" | "quarterly" | "annual".
// `upcoming` calls the same thing "yearly" (schema/upcoming.ts:12, and the
// RECURRING sets in widgets/subscription-tracker.tsx:10 and
// phone/UpcomingScreen.tsx:101). A generated row has to speak the
// upcoming vocabulary or the client stops recognising it as recurring.
const FREQUENCY_TO_UPCOMING: Record<string, UpcomingFrequency> = {
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "yearly",
  yearly: "yearly",
};

/** How far the occurrence walk is allowed to run before giving up. */
const MAX_STEPS = 2000;

export function toUpcomingFrequency(subscriptionFrequency: string): UpcomingFrequency | null {
  return FREQUENCY_TO_UPCOMING[subscriptionFrequency.trim().toLowerCase()] ?? null;
}

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Add `n` months, clamping the day to the end of the target month.
 *
 * The reason this is hand-rolled rather than `Date.setMonth`: a monthly
 * subscription anchored on the 31st, stepped through February, lands on
 * "Feb 31" and setMonth silently rolls it into March. The billing date
 * then drifts a day forward every February forever. Clamping to Feb 28
 * keeps the anchor's day-of-month and is what a card issuer actually does.
 */
function addMonthsClamped(iso: string, n: number, anchorDay: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const total = parsed.y * 12 + (parsed.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toIso(y, m, Math.min(anchorDay, daysInMonth(y, m)));
}

function addDays(iso: string, n: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const ms = Date.UTC(parsed.y, parsed.m - 1, parsed.d) + n * 86_400_000;
  const d = new Date(ms);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * The occurrence at step `i` of a rule anchored at `anchor`.
 *
 * Every occurrence is computed from the ANCHOR, never from the previous
 * occurrence. Stepping incrementally would compound the February clamp:
 * Jan 31 -> Feb 28 -> Mar 28, losing the 31st permanently. From the anchor,
 * March is Mar 31 again.
 */
export function occurrenceAt(anchor: string, frequency: UpcomingFrequency, i: number): string | null {
  const parsed = parseIsoDate(anchor);
  if (!parsed) return null;
  switch (frequency) {
    case "weekly": return addDays(anchor, i * 7);
    case "monthly": return addMonthsClamped(anchor, i, parsed.d);
    case "quarterly": return addMonthsClamped(anchor, i * 3, parsed.d);
    case "yearly": return addMonthsClamped(anchor, i * 12, parsed.d);
    case "one-time": return i === 0 ? anchor : null;
  }
}

export interface RecurrenceRule {
  /** subscriptions.nextDue, falling back to subscriptions.startDate. */
  anchor: string | null;
  frequency: string;
}

/**
 * The earliest occurrence on or after `today` that is not already taken.
 *
 * `taken` is the set of due dates that already have an upcoming row for
 * this subscription, whatever their status. A paid row still occupies its
 * date — that is what makes the rule advance.
 *
 * Returns null when the frequency is not a recurrence this app models,
 * when the anchor is unparseable, or when the walk exceeds MAX_STEPS
 * (which means the data is wrong, not that there is no answer, and
 * inventing one would be worse than emitting nothing).
 */
export function nextUnfilledOccurrence(
  rule: RecurrenceRule,
  today: string,
  taken: ReadonlySet<string>,
): string | null {
  const anchor = rule.anchor;
  if (!anchor || !parseIsoDate(anchor)) return null;
  const frequency = toUpcomingFrequency(rule.frequency);
  if (!frequency) return null;

  for (let i = 0; i < MAX_STEPS; i++) {
    const occurrence = occurrenceAt(anchor, frequency, i);
    if (occurrence == null) return null;
    if (occurrence < today) continue;
    if (taken.has(occurrence)) continue;
    return occurrence;
  }
  return null;
}

// ── Generation ──────────────────────────────────────────────────────────

export interface SubscriptionRule {
  id: number;
  name: string;
  amount: string;
  currency: string;
  frequency: string;
  category: string;
  nextDue: string | null;
  startDate: string;
}

export interface GeneratedRow {
  userId: string;
  subscriptionId: number;
  dueDate: string;
  description: string;
  category: string;
  type: "expense";
  frequency: string;
  status: "pending";
  nativeAmount: string;
  currency: string;
  accountId: null;
}

export interface RecurrenceStore {
  activeSubscriptions(userId: string): Promise<SubscriptionRule[]>;
  /** Every (subscriptionId, dueDate) already occupied, of ANY status, with that status. */
  occupiedOccurrences(userId: string): Promise<Array<{ subscriptionId: number; dueDate: string; status: string }>>;
  /** Inserts, skipping any row the unique index refuses. Returns rows actually written. */
  insertGenerated(rows: GeneratedRow[]): Promise<number>;
  /** Pending expense rows the user entered by hand (NULL subscription_id). */
  handEnteredExpenses(userId: string): Promise<CandidateRow[]>;
}

export interface GenerationResult {
  inserted: number;
  /** Subscriptions whose frequency this app cannot turn into a recurrence. */
  unsupported: Array<{ id: number; frequency: string }>;
  /** Hand-entered rows that plausibly duplicate a subscription. Reported, never acted on. */
  duplicates: DuplicatePair[];
}

export function todayIso(): string {
  return localDateString(new Date());
}

export async function generateUpcomingFromSubscriptions(
  userId: string,
  store: RecurrenceStore,
  today: string = todayIso(),
): Promise<GenerationResult> {
  const subscriptions = await store.activeSubscriptions(userId);
  if (subscriptions.length === 0) return { inserted: 0, unsupported: [], duplicates: [] };

  const occupied = await store.occupiedOccurrences(userId);
  const takenBySubscription = new Map<number, Set<string>>();
  // A subscription that already has an unsettled row still ahead of it is
  // finished for now. Without this, every call would emit the occurrence
  // AFTER the one it emitted last time and a subscription would accumulate
  // a row per page load — which is the shape idempotency actually has here.
  // "Taken date" alone is not enough, because advancing past a taken date is
  // exactly what makes the rule advance once a row is paid.
  const awaitingSettlement = new Set<number>();
  for (const row of occupied) {
    let set = takenBySubscription.get(row.subscriptionId);
    if (!set) { set = new Set(); takenBySubscription.set(row.subscriptionId, set); }
    set.add(row.dueDate);
    // Past-due and still pending does not count: it has fallen out of the
    // 30-day committedOut window, so emitting the next occurrence adds a
    // figure to that window rather than double-counting inside it.
    if (row.status === "pending" && row.dueDate >= today) awaitingSettlement.add(row.subscriptionId);
  }

  const rows: GeneratedRow[] = [];
  const unsupported: GenerationResult["unsupported"] = [];

  for (const subscription of subscriptions) {
    if (awaitingSettlement.has(subscription.id)) continue;
    const frequency = toUpcomingFrequency(subscription.frequency);
    if (!frequency) {
      unsupported.push({ id: subscription.id, frequency: subscription.frequency });
      continue;
    }
    const dueDate = nextUnfilledOccurrence(
      { anchor: subscription.nextDue ?? subscription.startDate, frequency: subscription.frequency },
      today,
      takenBySubscription.get(subscription.id) ?? new Set<string>(),
    );
    if (!dueDate) continue;

    rows.push({
      userId,
      subscriptionId: subscription.id,
      dueDate,
      description: subscription.name,
      category: subscription.category,
      type: "expense",
      // The upcoming vocabulary, not the subscription one — "annual"
      // becomes "yearly" or the client stops reading the row as recurring.
      frequency,
      status: "pending",
      nativeAmount: subscription.amount,
      currency: subscription.currency,
      // No account. A subscription carries no account today, and guessing
      // one would put a real balance movement behind a guess when the row
      // is later paid. The pay path already handles a null accountId.
      accountId: null,
    });
  }

  const inserted = rows.length > 0 ? await store.insertGenerated(rows) : 0;

  // Detect-and-report only. A hand-entered row that describes the same
  // obligation as a subscription is left exactly where the user put it.
  const duplicates = findSubscriptionDuplicates(subscriptions, await store.handEnteredExpenses(userId));

  return { inserted, unsupported, duplicates };
}

// ── Step 3: the overlap ──────────────────────────────────────────────────
//
// A hand-entered upcoming row can describe the same obligation as a
// subscription. Generation never touches such a row — it carries a NULL
// subscription_id, so it is not in the generator's "occupied" set and is
// neither merged nor deleted. That is by construction, not by care.
//
// But it does mean committedOut can count the same real payment twice: once
// from the hand-entered row and once from the generated one. Detecting that
// is in scope; acting on it is not. Thomas's data is not ours to reconcile.

export interface CandidateRow {
  id: number;
  dueDate: string;
  description: string;
  nativeAmount: string;
  currency: string;
}

export interface DuplicatePair {
  subscriptionId: number;
  subscriptionName: string;
  upcomingId: number;
  upcomingDescription: string;
  dueDate: string;
  amount: string;
  currency: string;
  daysApart: number;
}

/** Calendar days between two ISO dates. */
function daysBetween(a: string, b: string): number {
  const pa = parseIsoDate(a), pb = parseIsoDate(b);
  if (!pa || !pb) return Number.POSITIVE_INFINITY;
  const ms = Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** How far apart two dates may be and still be called the same obligation. */
export const DUPLICATE_DATE_TOLERANCE_DAYS = 3;

/**
 * Hand-entered rows that plausibly duplicate an active subscription.
 *
 * The rule: same currency, the same amount to the penny, due date within
 * DUPLICATE_DATE_TOLERANCE_DAYS of the subscription's anchor. Description is
 * NOT matched — a direct debit reads "NETFLIX.COM 4471" on a statement and
 * "Netflix" in the subscriptions list, so requiring a description match
 * would miss the very case this is for.
 *
 * FALSE POSITIVES: two genuinely different £9.99 monthly obligations falling
 * in the same week collide. That is why this reports and never acts. The
 * amount match is exact to the penny rather than a percentage band so the
 * collision has to be exact, which is the strongest cheap discriminator
 * available without descriptions.
 *
 * FALSE NEGATIVES, which are the larger risk: a subscription whose price
 * changed, a foreign-currency charge whose converted amount moves with the
 * rate, and any obligation the user entered on a date more than three days
 * from the billing date are all missed.
 */
export function findSubscriptionDuplicates(
  subscriptions: ReadonlyArray<{ id: number; name: string; amount: string; currency: string; nextDue: string | null; startDate: string }>,
  handEntered: ReadonlyArray<CandidateRow>,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (const subscription of subscriptions) {
    const anchor = subscription.nextDue ?? subscription.startDate;
    if (!anchor || !parseIsoDate(anchor)) continue;
    const amount = Number(subscription.amount);
    if (!Number.isFinite(amount)) continue;

    for (const row of handEntered) {
      if (row.currency !== subscription.currency) continue;
      const rowAmount = Number(row.nativeAmount);
      if (!Number.isFinite(rowAmount)) continue;
      // Compared in whole pennies, not as a float difference: 11 - 10.99 is
      // 0.009999999999999787 in IEEE 754, so a "difference below 0.01" test
      // calls two amounts a penny apart identical.
      if (Math.round(rowAmount * 100) !== Math.round(amount * 100)) continue;
      const daysApart = daysBetween(row.dueDate, anchor);
      if (daysApart > DUPLICATE_DATE_TOLERANCE_DAYS) continue;

      pairs.push({
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        upcomingId: row.id,
        upcomingDescription: row.description,
        dueDate: row.dueDate,
        amount: subscription.amount,
        currency: subscription.currency,
        daysApart,
      });
    }
  }
  return pairs;
}
