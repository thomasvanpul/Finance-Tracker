import { Router, type IRouter } from "express";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import upcomingRouter from "./upcoming";
import investmentsRouter from "./investments";
import marketRouter from "./market";
import wiseRouter from "./wise";
import importRouter from "./import";
import dashboardRouter from "./dashboard";
import debtsRouter from "./debts";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(dashboardRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(upcomingRouter);
router.use(investmentsRouter);
router.use(marketRouter);
router.use(wiseRouter);
router.use(importRouter);
router.use(debtsRouter);
router.use(settingsRouter);

export default router;
