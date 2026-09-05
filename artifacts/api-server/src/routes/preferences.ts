// GET/PATCH /settings/preferences — account-level UI preferences
// (BACKLOG § G20/B). Opaque string values keyed by the same names the
// client uses in localStorage; the classification of which keys are
// account-level lives on the client, the size/shape limits live in
// lib/user-preferences-db.ts.
//
// The PATCH body can exceed the app-wide express.json() default (a
// first sign-in on a new device pushes every account-level key at
// once), so app.ts gives this path a larger JSON limit.

import { Router, type IRouter } from "express";
import { getPreferences, patchPreferences, validatePreferencePatch } from "../lib/user-preferences-db";

const router: IRouter = Router();

router.get("/settings/preferences", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const preferences = await getPreferences(userId);
  res.json({ preferences });
});

router.patch("/settings/preferences", async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const validation = validatePreferencePatch(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const result = await patchPreferences(userId, validation.patch);
  res.json(result);
});

export default router;
