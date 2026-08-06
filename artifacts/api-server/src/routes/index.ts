import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter          from "./health.js";
import storageRouter         from "./storage.js";
import documentsRouter       from "./documents.js";
import authRouter            from "./auth.js";
import usersRouter           from "./users.js";
import salesLeadsRouter      from "./sales-leads.js";
import customersRouter       from "./customers.js";
import vendorsRouter         from "./vendors.js";
import productsRouter        from "./products.js";
import taxRatesRouter        from "./tax-rates.js";
import quotesRouter          from "./quotes.js";
import estimatesRouter       from "./estimates.js";
import invoicesRouter        from "./invoices.js";
import purchaseOrdersRouter  from "./purchase-orders.js";
import billsRouter           from "./bills.js";
import inventoryRouter       from "./inventory.js";
import shipmentsRouter       from "./shipments.js";
import expensesRouter        from "./expenses.js";
import bankAccountsRouter    from "./bank-accounts.js";
import accountingRouter      from "./accounting.js";
import dashboardRouter       from "./dashboard.js";
import auctionsRouter        from "./auctions.js";
import inventoryLocationsRouter from "./inventory-locations.js";
import easyshipRouter        from "./easyship.js";
import appSettingsRouter     from "./app-settings.js";
import returnsRouter         from "./returns.js";
import plaidRouter           from "./plaid.js";
import ticketsRouter         from "./tickets.js";
import transactionsRouter    from "./transactions.js";
import { requireAuth }       from "../middleware/requireAuth.js";

const router: IRouter = Router();

/* ── Public routes (no auth required) ──────────────────────────────────── */
router.use(healthRouter);   // GET /healthz
router.use(authRouter);     // POST /auth/login, POST /auth/logout, GET /auth/me

/* ── All routes below this point require a valid session ─────────────────  */
router.use((req: Request, res: Response, next: NextFunction) => {
  // Let OPTIONS preflight pass through without auth check
  if (req.method === "OPTIONS") { next(); return; }
  requireAuth(req, res, next);
});

router.use(storageRouter);
router.use(documentsRouter);
router.use(usersRouter);
router.use(salesLeadsRouter);
router.use(customersRouter);
router.use(vendorsRouter);
router.use(productsRouter);
router.use(taxRatesRouter);
router.use(quotesRouter);
router.use(estimatesRouter);
router.use(invoicesRouter);
router.use(purchaseOrdersRouter);
router.use(billsRouter);
router.use(inventoryRouter);
router.use(shipmentsRouter);
router.use(expensesRouter);
router.use(bankAccountsRouter);
router.use(accountingRouter);
router.use(dashboardRouter);
router.use(auctionsRouter);
router.use(inventoryLocationsRouter);
router.use(easyshipRouter);
router.use(appSettingsRouter);
router.use(returnsRouter);
router.use(plaidRouter);
router.use(ticketsRouter);
router.use(transactionsRouter);

export default router;
