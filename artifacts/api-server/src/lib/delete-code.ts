// The step-up check for deleting an account that has no password.
//
// A session proves a device once signed in, not that the owner is acting
// now (see routes/account.ts). Password accounts re-enter the password.
// Passkey-only and OAuth-only accounts used to have only the typed email,
// which the page itself shows. They now prove control of that address: a
// six-digit code is mailed to it and typed back into the same dialog.
//
// Decision: the bank question
// account-deletion-passkey-oauth-only-accounts-have-no-re-auth, answered
// 3 Oct "take the recommended option", which was an email confirmation
// before delete. A code in the dialog rather than a link: a link needs a
// landing route, and this does not earn one.
//
// One code per user, stored hashed in better-auth's `verification` table
// under its own identifier prefix, so it can never satisfy a better-auth
// check or be satisfied by one. One guess per code: the row is deleted on
// every attempt, right or wrong, so guessing costs an email each time.

import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, verificationTable } from "@workspace/db";
import { sendTransactionalEmail } from "./better-auth";
import { isEmailDeliverable } from "./email-transport";

// why fixed: security parameters of the deletion step-up, not deployment
// settings; a shorter or longer code must ship as a reviewed change, and the
// SPA's input (profile.tsx DELETE_CODE_DIGITS) has to change with it.
const CODE_TTL_MINUTES = 15;
const CODE_DIGITS = 6;
const MS_PER_MINUTE = 60_000;

function identifierFor(userId: string): string {
  return `account-delete:${userId}`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Mails a fresh code, replacing any earlier one. */
export async function issueDeleteCode(userId: string, email: string): Promise<"sent" | "no-transport"> {
  if (!isEmailDeliverable()) return "no-transport";
  // why fixed: base 10 — the code is decimal digits.
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
  const identifier = identifierFor(userId);
  await db.delete(verificationTable).where(eq(verificationTable.identifier, identifier));
  await db.insert(verificationTable).values({
    id: randomUUID(),
    identifier,
    value: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * MS_PER_MINUTE),
  });
  await sendTransactionalEmail({
    label: "Account Deletion",
    to: email,
    code,
    subject: "Your Numeris account deletion code",
    html: `<p>Your code to delete your Numeris account is <strong>${code}</strong>.</p><p>It works once and expires in ${CODE_TTL_MINUTES} minutes. If you did not ask to delete your account, ignore this message and sign out of any device you do not recognise — nothing is deleted without this code.</p>`,
  });
  return "sent";
}

/** True only for the live code; any attempt, right or wrong, uses it up. */
export async function consumeDeleteCode(userId: string, code: string): Promise<boolean> {
  const identifier = identifierFor(userId);
  const [row] = await db
    .delete(verificationTable)
    .where(eq(verificationTable.identifier, identifier))
    .returning({ value: verificationTable.value, expiresAt: verificationTable.expiresAt });
  if (!row || row.expiresAt.getTime() <= Date.now()) return false;
  if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(code)) return false;
  return timingSafeEqual(Buffer.from(hashCode(code)), Buffer.from(row.value));
}
