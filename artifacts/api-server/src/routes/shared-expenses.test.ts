// F4-2 multi-tenancy test. The whole point is to prove that:
//
//   - user A cannot see, modify, or delete user B's expenses BEYOND
//     the specific shared object they participate in
//   - user A CAN see a shared expense created by user B if A is a
//     linked participant, but even then cannot mutate it
//   - participant-side settlement (request) requires being the
//     linked participant on that specific row — not any linked-user
//     status on some other row
//   - payer-side settlement actions (acknowledge / dispute / waive)
//     require being the payer of THAT expense
//
// If any of these fail the whole feature is unsafe and cannot ship.
//
// This suite uses a predicate-aware in-memory mock of drizzle. The
// production drizzle code paths hit `db.select().from(T).where(pred)`,
// `db.insert(T).values(v).returning()`, etc. The mock evaluates the
// predicate tree against an in-memory array. `eq(col, val)` and
// `and(...)` are matched by shape; anything else throws so a route
// change that starts using a new drizzle helper fails the test
// loudly rather than silently returning wrong data.

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// ── Table stubs ──────────────────────────────────────────────────────
// Each stub is a bag of column descriptors. The route calls
// `sharedExpensesTable.userId` etc. — we return an object with an
// identifiable `__col` tag so the eq() mock can pull it out.
// __col carries both the table tag (so predicates on a different
// table's column short-circuit) and the camelCase field key that
// the row storage uses.
function col(table: string, key: string) {
  return { __col: `${table}.${key}`, __table: table, __key: key };
}
const sharedExpensesTableMock = {
  id: col("shared_expenses", "id"),
  userId: col("shared_expenses", "userId"),
  description: col("shared_expenses", "description"),
  date: col("shared_expenses", "date"),
  totalAmount: col("shared_expenses", "totalAmount"),
  currency: col("shared_expenses", "currency"),
  splitRule: col("shared_expenses", "splitRule"),
  notes: col("shared_expenses", "notes"),
  accountId: col("shared_expenses", "accountId"),
  __table: "shared_expenses",
};
const sharedExpenseParticipantsTableMock = {
  id: col("shared_expense_participants", "id"),
  sharedExpenseId: col("shared_expense_participants", "sharedExpenseId"),
  name: col("shared_expense_participants", "name"),
  linkedEmail: col("shared_expense_participants", "linkedEmail"),
  linkedUserId: col("shared_expense_participants", "linkedUserId"),
  shareInput: col("shared_expense_participants", "shareInput"),
  shareAmount: col("shared_expense_participants", "shareAmount"),
  isPayer: col("shared_expense_participants", "isPayer"),
  status: col("shared_expense_participants", "status"),
  __table: "shared_expense_participants",
};
const sharedExpenseSettlementsTableMock = {
  id: col("shared_expense_settlements", "id"),
  participantId: col("shared_expense_settlements", "participantId"),
  actorUserId: col("shared_expense_settlements", "actorUserId"),
  kind: col("shared_expense_settlements", "kind"),
  note: col("shared_expense_settlements", "note"),
  __table: "shared_expense_settlements",
};
const userTableMock = {
  id: col("user", "id"),
  name: col("user", "name"),
  email: col("user", "email"),
  __table: "user",
};

// ── Row storage ──────────────────────────────────────────────────────
// Drizzle returns rows keyed by the schema field name (camelCase),
// not the underlying column name. Mirror that here so enrichExpense
// and other consumers see the same shape as production.
interface ExpenseRow {
  id: number;
  userId: string;
  description: string;
  date: string;
  totalAmount: string;
  currency: string;
  splitRule: string;
  notes: string | null;
  accountId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
interface ParticipantRow {
  id: number;
  sharedExpenseId: number;
  name: string;
  linkedEmail: string | null;
  linkedUserId: string | null;
  shareInput: string | null;
  shareAmount: string;
  isPayer: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
interface SettlementRow {
  id: number;
  participantId: number;
  actorUserId: string;
  kind: string;
  note: string | null;
  createdAt: Date;
}
interface UserRow {
  id: string;
  name: string;
  email: string;
}
const store = {
  expenses: [] as ExpenseRow[],
  participants: [] as ParticipantRow[],
  settlements: [] as SettlementRow[],
  users: [] as UserRow[],
  next: { expense: 1, participant: 1, settlement: 1 },
};

function reset(): void {
  store.expenses.length = 0;
  store.participants.length = 0;
  store.settlements.length = 0;
  store.users.length = 0;
  store.next.expense = 1;
  store.next.participant = 1;
  store.next.settlement = 1;
}

// Route each table stub to its row array. Everything else is a code
// path the route has to justify — throw so the test surfaces it.
function rowsFor(table: unknown): unknown[] {
  const t = (table as { __table?: string }).__table;
  if (t === "shared_expenses") return store.expenses;
  if (t === "shared_expense_participants") return store.participants;
  if (t === "shared_expense_settlements") return store.settlements;
  if (t === "user") return store.users;
  throw new Error(`mock has no table for ${t}`);
}

// ── Predicate evaluator ──────────────────────────────────────────────
// eq() returns { __eq: [col, val] }. and() returns { __and: [...] }.
// We evaluate against a candidate row using the column's __col
// mapping (e.g. "shared_expenses.user_id") applied to the row.
function evalPred(row: Record<string, unknown>, pred: unknown, tableName: string): boolean {
  if (!pred || typeof pred !== "object") return true;
  if ("__eq" in pred) {
    const [left, right] = (pred as { __eq: [unknown, unknown] }).__eq;
    const c = left as { __table?: string; __key?: string };
    if (!c.__key) throw new Error("mock predicate: left of eq is not a column");
    if (c.__table !== tableName) return false; // column belongs to a different table
    return row[c.__key] === right;
  }
  if ("__and" in pred) {
    const children = (pred as { __and: unknown[] }).__and;
    return children.every((child) => evalPred(row, child, tableName));
  }
  throw new Error(`mock predicate: unknown shape ${JSON.stringify(pred)}`);
}

// Build a chainable select/insert/update/delete against `rows`.
function chain(kind: "select" | "insert" | "update" | "delete", table: unknown) {
  const tName = (table as { __table: string }).__table;
  const rows = rowsFor(table) as Record<string, unknown>[];
  let filterPred: unknown = null;
  let insertValues: Record<string, unknown> | null = null;
  let updateSet: Record<string, unknown> | null = null;
  let limitN: number | null = null;

  const applyFilter = () =>
    filterPred == null ? rows.slice() : rows.filter((r) => evalPred(r, filterPred, tName));

  // A drizzle chain can be awaited directly (no .returning()) — an
  // `.insert(t).values(v)` without .returning() should still commit
  // the row. So .values() must set state AND return the same chain
  // that resolves as a thenable. Same for .where() on updates/deletes.
  const c: {
    from: () => typeof c;
    where: (pred: unknown) => typeof c;
    values: (v: Record<string, unknown>) => typeof c;
    set: (s: Record<string, unknown>) => typeof c;
    returning: () => Promise<unknown[]>;
    orderBy: () => typeof c;
    limit: (n: number) => typeof c;
    then: (onResolve: (v: unknown[]) => void, onReject?: (e: unknown) => void) => unknown;
  } = {
    from() { return c; },
    where(pred: unknown) { filterPred = pred; return c; },
    values(v: Record<string, unknown>) { insertValues = v; return c; },
    set(s: Record<string, unknown>) { updateSet = s; return c; },
    orderBy() { return c; },
    limit(n: number) { limitN = n; return c; },
    async returning() {
      if (kind === "insert") {
        const now = new Date();
        if (tName === "shared_expenses") {
          const row: ExpenseRow = {
            id: store.next.expense++,
            userId: String(insertValues!.userId),
            description: String(insertValues!.description),
            date: String(insertValues!.date),
            totalAmount: String(insertValues!.totalAmount),
            currency: String(insertValues!.currency ?? "GBP"),
            splitRule: String(insertValues!.splitRule),
            notes: (insertValues!.notes as string | null) ?? null,
            accountId: (insertValues!.accountId as number | null) ?? null,
            createdAt: now,
            updatedAt: now,
          };
          store.expenses.push(row);
          return [row];
        }
        if (tName === "shared_expense_participants") {
          const row: ParticipantRow = {
            id: store.next.participant++,
            sharedExpenseId: Number(insertValues!.sharedExpenseId),
            name: String(insertValues!.name),
            linkedEmail: (insertValues!.linkedEmail as string | null) ?? null,
            linkedUserId: (insertValues!.linkedUserId as string | null) ?? null,
            shareInput: (insertValues!.shareInput as string | null) ?? null,
            shareAmount: String(insertValues!.shareAmount),
            isPayer: String(insertValues!.isPayer ?? "false"),
            status: String(insertValues!.status ?? "outstanding"),
            createdAt: now,
            updatedAt: now,
          };
          store.participants.push(row);
          return [row];
        }
        if (tName === "shared_expense_settlements") {
          const row: SettlementRow = {
            id: store.next.settlement++,
            participantId: Number(insertValues!.participantId),
            actorUserId: String(insertValues!.actorUserId),
            kind: String(insertValues!.kind),
            note: (insertValues!.note as string | null) ?? null,
            createdAt: now,
          };
          store.settlements.push(row);
          return [row];
        }
        throw new Error(`mock insert: unknown table ${tName}`);
      }
      if (kind === "update") {
        const affected = applyFilter();
        for (const r of affected) {
          for (const [k, v] of Object.entries(updateSet!)) {
            (r as Record<string, unknown>)[k] = v;
          }
          (r as Record<string, unknown>).updatedAt = new Date();
        }
        return affected;
      }
      if (kind === "delete") {
        const removed: unknown[] = [];
        for (let i = rows.length - 1; i >= 0; i--) {
          if (evalPred(rows[i]!, filterPred, tName)) {
            removed.unshift(rows[i]);
            rows.splice(i, 1);
          }
        }
        // Cascade: participants → settlements when an expense is deleted.
        // Matches ON DELETE CASCADE in the schema so the tests reflect
        // the real DB behaviour on removal.
        if (tName === "shared_expenses") {
          for (const e of removed as ExpenseRow[]) {
            const partIds = store.participants
              .filter((p) => p.sharedExpenseId === e.id)
              .map((p) => p.id);
            store.participants = store.participants.filter((p) => p.sharedExpenseId !== e.id);
            store.settlements = store.settlements.filter((s) => !partIds.includes(s.participantId));
          }
        }
        return removed;
      }
      // select
      return applyFilter().slice(0, limitN ?? undefined);
    },
    // Selects don't call .returning(); they resolve via thenable.
    // Inserts / updates / deletes may or may not chain .returning();
    // when awaited directly the same-state operation must happen.
    then(onResolve: (v: unknown[]) => void, onReject?: (e: unknown) => void) {
      const run = async () => {
        if (kind === "insert" || kind === "update" || kind === "delete") {
          return await c.returning();
        }
        // select
        let out = applyFilter();
        if (limitN != null) out = out.slice(0, limitN);
        const cols = (c as unknown as { __selectCols?: Record<string, unknown> }).__selectCols;
        if (cols) {
          out = out.map((r) => {
            const projected: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(cols)) {
              const c2 = v as { __key?: string };
              if (c2.__key) projected[k] = (r as Record<string, unknown>)[c2.__key];
            }
            return projected;
          });
        }
        return out;
      };
      run().then((v) => onResolve(v), (e) => {
        if (onReject) onReject(e);
        else throw e;
      });
      return { then() { /* thenable is single-use in these tests */ } };
    },
  };

  return c;
}


vi.mock("@workspace/db", () => ({
  db: {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const real = chain("select", table);
        if (cols) (real as unknown as { __selectCols?: unknown }).__selectCols = cols;
        return real;
      },
    }),
    insert: (t: unknown) => chain("insert", t),
    update: (t: unknown) => chain("update", t),
    delete: (t: unknown) => chain("delete", t),
  },
  sharedExpensesTable: sharedExpensesTableMock,
  sharedExpenseParticipantsTable: sharedExpenseParticipantsTableMock,
  sharedExpenseSettlementsTable: sharedExpenseSettlementsTableMock,
  userTable: userTableMock,
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}));

// ── Test server boot ────────────────────────────────────────────────
let server: Server;
let baseUrl: string;
let currentUserId = "user-A";

beforeAll(async () => {
  const { default: express } = await import("express");
  const { default: sharedExpensesRouter } = await import("./shared-expenses");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(sharedExpensesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  reset();
  store.users.push({ id: "user-A", name: "Alice", email: "alice@example.com" });
  store.users.push({ id: "user-B", name: "Bob", email: "bob@example.com" });
  store.users.push({ id: "user-C", name: "Carol", email: "carol@example.com" });
});

function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  currentUserId = userId;
  return fn().finally(() => { currentUserId = "user-A"; });
}

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (text && text[0] === "<") {
    throw new Error(`HTML error from server (${res.status}): ${text.slice(0, 500)}`);
  }
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function get(path: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function patch(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function del(path: string): Promise<{ status: number }> {
  const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  return { status: res.status };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("shared-expenses: multi-tenancy", () => {
  it("user B cannot see user A's expense unless they are a linked participant", async () => {
    // Alice creates a private expense with a name-only participant.
    await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [{ name: "Alice" }, { name: "someone-random" }],
      }),
    );
    // Bob lists — should see nothing.
    const list = await asUser("user-B", () => get("/shared-expenses"));
    expect(list.status).toBe(200);
    expect(list.json).toEqual([]);
  });

  it("user B CAN see user A's expense when linked by email", async () => {
    await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [
          { name: "Alice" },
          { name: "Bob", linkedEmail: "bob@example.com" },
        ],
      }),
    );
    const list = (await asUser("user-B", () => get("/shared-expenses"))).json as unknown[];
    expect(list).toHaveLength(1);
  });

  it("user B cannot PATCH user A's expense (even as a linked participant)", async () => {
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [
          { name: "Alice" },
          { name: "Bob", linkedEmail: "bob@example.com" },
        ],
      }),
    )).json as { id: number };
    const attempt = await asUser("user-B", () =>
      patch(`/shared-expenses/${created.id}`, { description: "hijacked" }),
    );
    expect(attempt.status).toBe(404);
    // Confirm nothing changed on Alice's read.
    const check = (await asUser("user-A", () => get(`/shared-expenses/${created.id}`))).json as { description: string };
    expect(check.description).toBe("dinner");
  });

  it("user B cannot DELETE user A's expense (even as a linked participant)", async () => {
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [
          { name: "Alice" },
          { name: "Bob", linkedEmail: "bob@example.com" },
        ],
      }),
    )).json as { id: number };
    const attempt = await asUser("user-B", () => del(`/shared-expenses/${created.id}`));
    expect(attempt.status).toBe(404);
    // Confirm the expense still exists for Alice.
    const check = await asUser("user-A", () => get(`/shared-expenses/${created.id}`));
    expect(check.status).toBe(200);
  });

  it("user C (unrelated) cannot GET user A's expense that A + B share", async () => {
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [
          { name: "Alice" },
          { name: "Bob", linkedEmail: "bob@example.com" },
        ],
      }),
    )).json as { id: number };
    const attempt = await asUser("user-C", () => get(`/shared-expenses/${created.id}`));
    expect(attempt.status).toBe(404);
  });

  it("user B cannot REQUEST settlement on user A's participant row (they are on a different row)", async () => {
    // Alice creates a bill with Bob and Carol as participants.
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [
          { name: "Alice" },
          { name: "Bob", linkedEmail: "bob@example.com" },
          { name: "Carol", linkedEmail: "carol@example.com" },
        ],
      }),
    )).json as { id: number; participants: { id: number; linkedUserId: string | null }[] };
    const carolRow = created.participants.find((p) => p.linkedUserId === "user-C")!;
    // Bob tries to request settlement on Carol's row — must fail.
    const attempt = await asUser("user-B", () =>
      post(`/shared-expenses/${created.id}/participants/${carolRow.id}/request`, {}),
    );
    expect(attempt.status).toBe(404);
  });

  it("user B cannot ACKNOWLEDGE their own settlement request (payer-only)", async () => {
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 30,
        splitRule: "equal",
        participants: [
          { name: "Alice" },
          { name: "Bob", linkedEmail: "bob@example.com" },
        ],
      }),
    )).json as { id: number; participants: { id: number; linkedUserId: string | null }[] };
    const bobRow = created.participants.find((p) => p.linkedUserId === "user-B")!;
    // Bob requests settlement — allowed.
    const req = await asUser("user-B", () =>
      post(`/shared-expenses/${created.id}/participants/${bobRow.id}/request`, {}),
    );
    expect(req.status).toBe(204);
    // Bob tries to acknowledge his own request — must fail (payer only).
    const ack = await asUser("user-B", () =>
      post(`/shared-expenses/${created.id}/participants/${bobRow.id}/acknowledge`, {}),
    );
    expect(ack.status).toBe(404);
    // Alice acknowledges — allowed.
    const ackA = await asUser("user-A", () =>
      post(`/shared-expenses/${created.id}/participants/${bobRow.id}/acknowledge`, {}),
    );
    expect(ackA.status).toBe(204);
  });
});

describe("shared-expenses: split rule integration", () => {
  it("equal split of £24.61 across 3 assigns 8.21 / 8.20 / 8.20 in insertion order", async () => {
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 24.61,
        splitRule: "equal",
        participants: [{ name: "A" }, { name: "B" }, { name: "C" }],
      }),
    )).json as { participants: { shareAmount: number; name: string }[] };
    expect(created.participants.map((p) => p.shareAmount)).toEqual([8.21, 8.20, 8.20]);
  });

  it("exact split rejects sum mismatch with a legible error", async () => {
    const res = await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 10,
        splitRule: "exact",
        // 3.33 + 3.33 + 3.33 = 9.99 — the quiet-unfairness case.
        participants: [
          { name: "A", shareInput: 3.33 },
          { name: "B", shareInput: 3.33 },
          { name: "C", shareInput: 3.33 },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toMatch(/9\.99.*10\.00/);
  });

  it("shares split of £24.61 with weights [3,1,1] gives [14.77, 4.92, 4.92]", async () => {
    const created = (await asUser("user-A", () =>
      post("/shared-expenses", {
        description: "dinner",
        date: "2026-08-17",
        totalAmount: 24.61,
        splitRule: "shares",
        participants: [
          { name: "A", shareInput: 3 },
          { name: "B", shareInput: 1 },
          { name: "C", shareInput: 1 },
        ],
      }),
    )).json as { participants: { shareAmount: number }[] };
    expect(created.participants.map((p) => p.shareAmount)).toEqual([14.77, 4.92, 4.92]);
  });
});
