// AES-256-GCM authenticated encryption for provider credentials.
//
// Wire format (base64 of the concatenation):
//   iv (12 bytes) || ciphertext (n) || authTag (16 bytes)
//
// The key comes from CREDENTIAL_ENCRYPTION_KEY, a base64 string that decodes
// to exactly 32 bytes. The module refuses to load without a valid key so a
// misconfigured deploy fails at startup instead of silently accepting the
// first credential in plaintext-adjacent form.
//
// GCM's authentication tag protects both confidentiality and integrity: any
// tampering with the stored ciphertext produces a decrypt error instead of a
// silently altered plaintext. Callers should treat decrypt errors as
// "credential unusable — user must reconnect" rather than trying to recover.
//
// Rotation and loss story: see docs/CREDENTIAL-ENCRYPTION.md.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const KEY_BYTES = 32;   // AES-256
const IV_BYTES = 12;    // GCM standard
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const b64 = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and put it in the api-server env.",
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        "Regenerate with `openssl rand -base64 32`.",
    );
  }
  return key;
}

// Cached at first use so a boot-time misconfig fails once, loudly.
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey == null) cachedKey = loadKey();
  return cachedKey;
}

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptCredential(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("credential blob is too short to be valid ciphertext");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

// Test-only: reset the cached key so tests can inject a different value via
// the environment. Not exported through any production path.
export function __resetCryptoKeyForTesting(): void {
  cachedKey = null;
}
