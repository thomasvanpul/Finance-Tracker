// Source lock: /split's "add my share to transactions" names a real account.
//
// It used to send `accountId: 0` (finding 5a617039239d). No account has id
// 0, and since b46bce3 POST /transactions checks ownership of every id it is
// given, so the write answered 404 every time — the button could only ever
// show "Could not add transaction". (Measured 1 Oct on the dev branch: zero
// transactions with account_id 0, so none were written before the gate.)
//
// The handler now takes the account the user picks beside the button.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../pages/split.tsx"), "utf8");

describe("split.tsx add-to-transactions", () => {
  it("never sends a placeholder account id", () => {
    expect(src.match(/accountId:\s*0\b/g) ?? []).toEqual([]);
  });

  it("sends the account the user chose", () => {
    expect(src).toMatch(/handleAddToTransactions\s*=\s*useCallback\(\s*async\s*\(expenseId: string, accountId: number\)/);
  });
});
