import { Router, type IRouter } from "express";
import { deleteUserAccount } from "../lib/account-deletion";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Delete the signed-in user's account and everything they own. The
// confirmation is the account email, typed by the user and checked here
// against the session — the client-side check is a convenience, this is
// the bar. Not a password: passkey-only and OAuth-only users have none.
//
// What this cannot do is make a third party forget a credential the user
// pasted in (Wise, Alpaca, Kraken tokens; the Google/GitHub sign-in
// grant). The row holding our encrypted copy goes; the user revokes the
// token at the provider. The confirmation screen says so.
router.post("/account/delete", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const sessionUser = (req as any).user as { email?: string } | undefined;
  const body = req.body as { email?: unknown } | undefined;
  const typed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!typed || !sessionUser?.email || typed !== sessionUser.email.toLowerCase()) {
    res.status(400).json({ error: "Type the account email exactly to confirm deletion" });
    return;
  }
  const result = await deleteUserAccount(userId);
  if (!result) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  // Counts only — the id and email are gone and are not written to a log
  // that outlives them.
  logger.info({ deletedRows: result.deletedRows }, "account deleted");
  res.json(result);
});

export default router;
