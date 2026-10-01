import { describe, expect, it } from "vitest";
import { LEDGER_MONTH_CAP, ledgerPaging } from "./ledger-paging";

describe("ledgerPaging", () => {
  it("stops paging at the cap when older history exists beyond it", () => {
    // Finding e085bf1810a5: the query fetches cap + 1 months, so loaded > shown
    // stayed true forever and "LOADING EARLIER…" never cleared.
    expect(ledgerPaging(LEDGER_MONTH_CAP + 1, LEDGER_MONTH_CAP)).toEqual({
      hasMoreToLoad: false,
      atCap: true,
    });
  });

  it("is neither paging nor capped at the cap when history ends there", () => {
    expect(ledgerPaging(LEDGER_MONTH_CAP, LEDGER_MONTH_CAP)).toEqual({
      hasMoreToLoad: false,
      atCap: false,
    });
  });

  it("keeps paging below the cap while older months are loaded", () => {
    expect(ledgerPaging(3, 2)).toEqual({ hasMoreToLoad: true, atCap: false });
  });

  it("keeps offering one more month below the cap even when the fetch came back short", () => {
    // A gap in history is not proof nothing older exists.
    expect(ledgerPaging(1, 1)).toEqual({ hasMoreToLoad: true, atCap: false });
  });
});
