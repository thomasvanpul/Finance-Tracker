import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptCredential,
  decryptCredential,
  __resetCryptoKeyForTesting,
} from "./crypto";

// A single fresh key for the suite. Reset the module cache before each test
// so anyone setting CREDENTIAL_ENCRYPTION_KEY = "" mid-suite gets a clean
// error rather than the previously cached buffer.
const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  __resetCryptoKeyForTesting();
});

describe("crypto — AES-256-GCM credential encryption", () => {
  it("round-trips a plaintext through encrypt then decrypt", () => {
    const secret = "wise-token-abcdefghijklmnopqrstuvwxyz-1234567890";
    const blob = encryptCredential(secret);
    expect(decryptCredential(blob)).toBe(secret);
  });

  it("produces a different blob for the same plaintext each call (IV is random)", () => {
    const secret = "same-secret-every-time";
    const a = encryptCredential(secret);
    const b = encryptCredential(secret);
    expect(a).not.toBe(b);
    // But both decrypt to the same plaintext.
    expect(decryptCredential(a)).toBe(secret);
    expect(decryptCredential(b)).toBe(secret);
  });

  it("blob is base64 and does not contain the plaintext", () => {
    // Sanity check the wire format — the ciphertext must not leak the
    // secret in any form, base64 or otherwise. GCM guarantees this
    // cryptographically; this test catches a future refactor that
    // accidentally stringifies the plaintext into the blob.
    const secret = "the-quick-brown-fox-jumps-over-the-lazy-dog";
    const blob = encryptCredential(secret);
    expect(blob).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(blob).not.toContain(secret);
    expect(Buffer.from(blob, "base64").includes(Buffer.from(secret))).toBe(false);
  });

  it("refuses to decrypt a tampered ciphertext (auth tag rejects)", () => {
    const blob = encryptCredential("original-secret");
    const buf = Buffer.from(blob, "base64");
    // Flip a bit somewhere in the ciphertext (not IV, not tag).
    buf[20] ^= 0x01;
    const tampered = buf.toString("base64");
    expect(() => decryptCredential(tampered)).toThrow();
  });

  it("refuses to decrypt with a different key", () => {
    const blob = encryptCredential("original-secret");
    // Rotate the key mid-flight.
    process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    __resetCryptoKeyForTesting();
    expect(() => decryptCredential(blob)).toThrow();
  });

  it("throws on startup if the key is missing", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "";
    __resetCryptoKeyForTesting();
    expect(() => encryptCredential("x")).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
  });

  it("throws if the key decodes to the wrong length", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    __resetCryptoKeyForTesting();
    expect(() => encryptCredential("x")).toThrow(/must decode to 32 bytes/);
  });

  it("rejects a blob that is too short to be valid ciphertext", () => {
    expect(() => decryptCredential("YWFh")).toThrow(/too short/);
  });
});
