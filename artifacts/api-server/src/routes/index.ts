import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import upcomingRouter from "./upcoming";
import investmentsRouter from "./investments";
import marketRouter from "./market";
import plaidRouter from "./plaid";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(upcomingRouter);
router.use(investmentsRouter);
router.use(marketRouter);
router.use(plaidRouter);

export default router;
