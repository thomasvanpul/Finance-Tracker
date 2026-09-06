// The admin gate must fail closed. Every case below exists because the
// alternative reading of it would hand the hub to every signed-in user.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { decideAdmin, adminGateConfigured } from "./admin-gate";

const ID = "user_abc123";
const EMAIL = "thomas@example.com";

let saved: { ids: string | undefined; emails: string | undefined };

beforeEach(() => {
  saved = { ids: process.env.ADMIN_USER_IDS, emails: process.env.ADMIN_EMAILS };
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  if (saved.ids === undefined) delete process.env.ADMIN_USER_IDS;
  else process.env.ADMIN_USER_IDS = saved.ids;
  if (saved.emails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = saved.emails;
});

describe("admin gate", () => {
  it("denies everyone when nothing is configured", () => {
    expect(decideAdmin({ userId: ID, email: EMAIL })).toEqual({
      allowed: false,
      reason: "not-configured",
    });
    expect(adminGateConfigured()).toBe(false);
  });

  it("denies everyone when the allowlist is empty or whitespace", () => {
    process.env.ADMIN_USER_IDS = "";
    expect(decideAdmin({ userId: ID, email: EMAIL }).allowed).toBe(false);
    process.env.ADMIN_USER_IDS = "  ,  , ";
    expect(decideAdmin({ userId: ID, email: EMAIL }).allowed).toBe(false);
  });

  it("allows an id on the allowlist and says so", () => {
    process.env.ADMIN_USER_IDS = `someone_else,${ID}`;
    expect(decideAdmin({ userId: ID, email: null })).toEqual({
      allowed: true,
      matchedOn: "user-id",
    });
  });

  it("allows an email on the allowlist, case-insensitively", () => {
    process.env.ADMIN_EMAILS = "THOMAS@example.com";
    expect(decideAdmin({ userId: ID, email: "thomas@EXAMPLE.com" })).toEqual({
      allowed: true,
      matchedOn: "email",
    });
  });

  it("denies a signed-in user who is not on either list", () => {
    process.env.ADMIN_USER_IDS = "someone_else";
    process.env.ADMIN_EMAILS = "other@example.com";
    expect(decideAdmin({ userId: ID, email: EMAIL })).toEqual({
      allowed: false,
      reason: "not-on-allowlist",
    });
  });

  it("does not match a null email against an allowlist entry", () => {
    process.env.ADMIN_EMAILS = "thomas@example.com";
    expect(decideAdmin({ userId: ID, email: null }).allowed).toBe(false);
  });

  it("does not treat a substring or prefix as a match", () => {
    process.env.ADMIN_USER_IDS = "user_abc123456";
    expect(decideAdmin({ userId: "user_abc123", email: null }).allowed).toBe(false);
    process.env.ADMIN_EMAILS = "thomas@example.com.attacker.test";
    expect(decideAdmin({ userId: ID, email: EMAIL }).allowed).toBe(false);
  });
});
