import { describe, expect, it } from "vitest";
import { splitLineAmount } from "./split-amount";

describe("splitLineAmount", () => {
  it("writes a positive magnitude, so the server's expense negation lowers the balance", () => {
    expect(splitLineAmount("12.50")).toBe(12.5);
  });

  it("drops a sign the user typed rather than passing it through", () => {
    expect(splitLineAmount("-12.50")).toBe(12.5);
  });
});
