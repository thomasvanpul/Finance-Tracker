import { Router, type IRouter } from "express";
import accountsRouter from "./accounts";
import marketLiveRouter from "./market-live";
import transactionsRouter from "./transactions";
import upcomingRouter from "./upcoming";
import investmentsRouter from "./investments";
import marketRouter from "./market";
import wiseRouter from "./wise";
import importRouter from "./import";
import dashboardRouter from "./dashboard";
import debtsRouter from "./debts";
import settingsRouter from "./settings";
import aiRouter from "./ai";
import budgetsRouter from "./budgets";
import goalsRouter from "./goals";
import subscriptionsRouter from "./subscriptions";
import exportRouter from "./export";
import digestRouter from "./digest";
import receiptRouter from "./receipt";
import connectionsRouter from "./connections";
import enableBankingRouter from "./enable-banking";
import sharedExpensesRouter from "./shared-expenses";
import recurringRouter from "./recurring";
import accountRouter from "./account";
import preferencesRouter from "./preferences";

const router: IRouter = Router();

router.use(marketLiveRouter);
router.use(budgetsRouter);
router.use(goalsRouter);
router.use(subscriptionsRouter);
router.use(exportRouter);
router.use(dashboardRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(upcomingRouter);
router.use(investmentsRouter);
router.use(marketRouter);
router.use(wiseRouter);
router.use(connectionsRouter);
router.use(enableBankingRouter);
router.use(importRouter);
router.use(debtsRouter);
router.use(sharedExpensesRouter);
router.use(recurringRouter);
router.use(settingsRouter);
router.use(accountRouter);
router.use(preferencesRouter);
router.use(aiRouter);
// Mount prefixes here are RELATIVE — this router is itself already
// mounted at /api by app.ts, so writing "/api/digest" here would give
// the handler at /api/api/digest. Both of these shipped with that bug
// and 404'd every call from the UI (receipt-parse from
// quick-add-transaction.tsx, digest-send from settings.tsx). Property
// test in app.route-mounts.test.ts locks the shape so a future addition
// with the same typo fails at build time.
router.use("/digest", digestRouter);
router.use("/receipt", receiptRouter);

export default router;
