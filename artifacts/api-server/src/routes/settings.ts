import { Router, type IRouter } from "express";
import { changePassword, get2faStatus, setup2fa, confirm2fa, disable2fa } from "../lib/auth";

const router: IRouter = Router();

router.post("/settings/password", changePassword);
router.get("/settings/2fa/status", get2faStatus);
router.post("/settings/2fa/setup", setup2fa);
router.post("/settings/2fa/confirm", confirm2fa);
router.post("/settings/2fa/disable", disable2fa);

export default router;
