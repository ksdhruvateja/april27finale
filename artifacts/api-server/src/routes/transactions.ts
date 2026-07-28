import { Router } from "express";
import { desc, eq, and, gte, lte, SQL } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";

const router = Router();

/**
 * GET /api/transactions
 * Query params:
 *   type        – filter by type (invoice_payment | bill_payment | walkin_sale_payment)
 *   entityId    – filter by customer/vendor id
 *   from        – ISO date string (>=)
 *   to          – ISO date string (<=)
 *   method      – payment method
 *   limit       – default 200
 */
router.get("/transactions", async (req, res): Promise<void> => {
  const { type, entityId, from, to, method, limit } = req.query as Record<string, string>;

  const conditions: SQL[] = [];
  if (type)     conditions.push(eq(transactionsTable.type, type));
  if (entityId) conditions.push(eq(transactionsTable.entityId, Number(entityId)));
  if (method)   conditions.push(eq(transactionsTable.paymentMethod, method));
  if (from)     conditions.push(gte(transactionsTable.paidAt, new Date(from)));
  if (to)       conditions.push(lte(transactionsTable.paidAt, new Date(to)));

  const rows = await db
    .select()
    .from(transactionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactionsTable.paidAt))
    .limit(Number(limit ?? 200));

  // Add a computed human-readable reference (TXN-00001)
  const result = rows.map(r => ({
    ...r,
    txRef:  `TXN-${String(r.id).padStart(5, "0")}`,
    amount: Number(r.amount),
  }));

  res.json(result);
});

/**
 * GET /api/transactions/:id
 */
router.get("/transactions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, id));

  if (!row) { res.status(404).json({ error: "Transaction not found" }); return; }

  res.json({
    ...row,
    txRef:  `TXN-${String(row.id).padStart(5, "0")}`,
    amount: Number(row.amount),
  });
});

export default router;
