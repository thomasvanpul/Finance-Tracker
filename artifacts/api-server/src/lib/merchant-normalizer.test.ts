import { describe, it, expect } from "vitest";
import { normalizeMerchant } from "./merchant-normalizer";

// A merchant is the billing entity, not the brand that owns it.
//
// These tests pin the one property the recurrence detector depends on:
// two descriptors that bill on different channels must not collapse to
// the same key, because the detector groups by (description, currency)
// and then rejects any group whose amounts are not within ±20% of the
// median. One brand-wide key puts a monthly subscription, an annual
// licence and a one-off retail purchase in the same group, and the
// group is thrown away whole.

describe("normalizeMerchant — platform channels stay apart", () => {
  it("separates Apple's billing channels from Apple retail", () => {
    const bill = normalizeMerchant("APPLE.COM/BILL");
    const store = normalizeMerchant("APPLE STORE R123");
    expect(bill).not.toEqual(store);
  });

  it("keeps iTunes, Apple Music and Apple TV+ distinct from each other", () => {
    const names = [
      normalizeMerchant("ITUNES.COM/BILL"),
      normalizeMerchant("APPLE MUSIC"),
      normalizeMerchant("APPLE TV+"),
    ];
    expect(new Set(names).size).toBe(3);
  });

  it("separates Google's channels", () => {
    const names = [
      normalizeMerchant("GOOGLE *YouTubePremium"),
      normalizeMerchant("GOOGLE *Play"),
      normalizeMerchant("GOOGLE *Google One"),
      normalizeMerchant("GOOGLE *Cloud"),
    ];
    expect(new Set(names).size).toBe(4);
  });

  it("separates Amazon retail from Amazon Prime and AWS", () => {
    const names = [
      normalizeMerchant("AMZN Mktp UK*RT4H8"),
      normalizeMerchant("Amazon Prime"),
      normalizeMerchant("AWS EMEA"),
    ];
    expect(new Set(names).size).toBe(3);
  });

  it("separates Microsoft 365 from Xbox and Azure", () => {
    const names = [
      normalizeMerchant("MICROSOFT*365 SUBSCRIPTION"),
      normalizeMerchant("MICROSOFT*XBOX"),
      normalizeMerchant("MICROSOFT AZURE"),
    ];
    expect(new Set(names).size).toBe(3);
  });

  it("still strips the variable part so repeat charges share a key", () => {
    // Store numbers and terminal ids are noise, not channel: two visits
    // to the same channel must land on the same key or nothing recurs.
    expect(normalizeMerchant("APPLE STORE R123")).toEqual(normalizeMerchant("APPLE STORE R456"));
    expect(normalizeMerchant("AMZN Mktp UK*RT4H8")).toEqual(normalizeMerchant("AMZN Mktp UK*99ZZ1"));
  });

  it("falls back to the bare brand when no channel is identifiable", () => {
    expect(normalizeMerchant("APPLE")).toEqual("Apple");
    expect(normalizeMerchant("GOOGLE LLC")).toEqual("Google");
  });

  // A wallet is a payment rail, not a merchant. Collapsing every wallet
  // charge to "Apple Pay" put groceries, fuel and coffee in one key that
  // can never pass the ±20% gate. Decision: strip the rail, keep the
  // merchant (vault Efforts/Numeris-Decisions.md § 12, recommended option).
  it("strips the wallet rail and keeps the merchant behind it", () => {
    expect(normalizeMerchant("APPLE PAY TESCO")).toEqual("Tesco");
    expect(normalizeMerchant("GOOGLE PAY SHELL")).toEqual("Shell");
    expect(normalizeMerchant("SAMSUNG PAY BOULANGERIE PAUL")).toEqual("BOULANGERIE PAUL");
    expect(normalizeMerchant("BOULANGERIE PAUL APPLE PAY")).toEqual("BOULANGERIE PAUL");
  });

  it("keeps the rail name when no merchant follows it", () => {
    expect(normalizeMerchant("APPLE PAY")).toEqual("Apple Pay");
    expect(normalizeMerchant("GOOGLE PAY *")).toEqual("Google Pay");
  });

  it("leaves unmatched descriptors alone apart from reference suffixes", () => {
    expect(normalizeMerchant("BOULANGERIE PAUL")).toEqual("BOULANGERIE PAUL");
  });
});
