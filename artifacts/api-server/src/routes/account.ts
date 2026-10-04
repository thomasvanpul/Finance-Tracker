import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, accountTable } from "@workspace/db";
import { verifyPassword } from "better-auth/crypto";
import { deleteUserAccount } from "../lib/account-deletion";
import { revokeBankConsents, ConsentRevokeError } from "../lib/bank-consents";
import { revokeOAuthGrants } from "../lib/oauth-grants";
import { consumeDeleteCode, issueDeleteCode } from "../lib/delete-code";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Delete the signed-in user's account and everything they own. The typed
// email is a mistake-guard, not a security bar — it is the same address
// the session already carries and the page already shows, so it proves
// nothing a stolen session cookie or bearer token didn't already have.
// The real bar is the password re-check below: a valid session is proof a
// device once signed in, not proof this request is the owner acting now.
//
// Passkey-only and OAuth-only users have no password to re-check. They
// prove control of the account's email instead: the first request mails a
// single-use code (202, nothing deleted) and the second carries it back
// (lib/delete-code.ts). With no way to deliver mail the request is refused
// rather than falling back to the typed email alone. better-auth's
// twoFactor plugin requires a password account to enable 2FA (see
// lib/better-auth.ts), so a 2FA-enabled user always has one and always
// hits the password re-check.
//
// What this cannot do is make a third party forget a credential the user
// pasted in (Wise, Alpaca, Kraken tokens). The row holding our encrypted
// copy goes; the user revokes the token at the provider. The confirmation
// screen says so. Enable Banking is the exception: its consent is ours to
// close, so it is closed before anything is deleted (lib/bank-consents.ts,
// BACKLOG M10). Google, GitHub and Apple sign-in grants are revoked best-effort
// (lib/oauth-grants.ts) and never block deletion; any still live come back
// in `oauthGrants.remaining`, and the client tells the user where to remove
// them.
router.post("/account/delete", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const sessionUser = (req as any).user as { email?: string } | undefined;
  const body = req.body as { email?: unknown; password?: unknown; code?: unknown } | undefined;
  const typed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!typed || !sessionUser?.email || typed !== sessionUser.email.toLowerCase()) {
    res.status(400).json({ error: "Type the account email exactly to confirm deletion" });
    return;
  }

  const [credential] = await db
    .select({ password: accountTable.password })
    .from(accountTable)
    .where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, "credential")));
  if (credential?.password) {
    const typedPassword = typeof body?.password === "string" ? body.password : "";
    const passwordOk = typedPassword.length > 0
      && (await verifyPassword({ hash: credential.password, password: typedPassword }));
    if (!passwordOk) {
      res.status(400).json({ error: "Enter your current password to confirm deletion" });
      return;
    }
  } else {
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) {
      const issued = await issueDeleteCode(userId, sessionUser.email);
      if (issued === "no-transport") {
        res.status(503).json({ error: "This server cannot send the confirmation email, so the account was not deleted. Contact support." });
        return;
      }
      res.status(202).json({ status: "code_sent" });
      return;
    }
    if (!(await consumeDeleteCode(userId, code))) {
      res.status(400).json({ error: "That code is wrong or has expired. Request a new one." });
      return;
    }
  }

  try {
    const revoked = await revokeBankConsents(userId);
    logger.info({ ...revoked }, "bank consents closed before account deletion");
  } catch (err) {
    if (!(err instanceof ConsentRevokeError)) throw err;
    logger.error({ err: err.message }, "account deletion stopped: bank consent not closed");
    res.status(502).json({
      error: "Your bank connection could not be closed at the provider, so nothing was deleted. Try again in a few minutes.",
    });
    return;
  }

  // Before deletion: the tokens it needs go with the account rows.
  const oauthGrants = await revokeOAuthGrants(userId);

  const result = await deleteUserAccount(userId);
  if (!result) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  // Counts only — the id and email are gone and are not written to a log
  // that outlives them.
  logger.info({ deletedRows: result.deletedRows, oauthGrants }, "account deleted");
  res.json({ ...result, oauthGrants });
});

export default router;
