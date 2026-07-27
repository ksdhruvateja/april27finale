import { Router } from "express";
import { eq, sql, and, inArray, asc } from "drizzle-orm";
import { db, customersTable, invoicesTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router = Router();

async function withBalances(customers: (typeof customersTable.$inferSelect)[]) {
  if (customers.length === 0) return customers;
  const ids = customers.map(c => c.id);
  const balances = await db.select({
    customerId: invoicesTable.customerId,
    amountOwed: sql<string>`coalesce(sum(${invoicesTable.total}), 0)`,
  })
    .from(invoicesTable)
    .where(and(
      inArray(invoicesTable.customerId, ids),
      inArray(invoicesTable.status, ["sent", "pending", "overdue", "draft"]),
    ))
    .groupBy(invoicesTable.customerId);
  const balanceMap = new Map(balances.map(b => [b.customerId, Number(b.amountOwed ?? 0)]));
  return customers.map(c => ({ ...c, amountOwed: balanceMap.get(c.id) ?? 0 }));
}

router.get("/customers", async (req, res): Promise<void> => {
  const customers = await db.select().from(customersTable).orderBy(asc(customersTable.name));
  res.json(await withBalances(customers));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { creditLimit, ...rest } = parsed.data;
  const insertPayload = {
    ...rest,
    ...(creditLimit !== undefined ? { creditLimit: creditLimit === null ? null : String(creditLimit) } : {}),
  };
  const [customer] = await db.insert(customersTable).values(insertPayload).returning();
  res.status(201).json(customer);
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.id));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(customer);
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { creditLimit, ...rest } = parsed.data;
  const updatePayload = {
    ...rest,
    ...(creditLimit !== undefined ? { creditLimit: creditLimit === null ? null : String(creditLimit) } : {}),
  };
  const [customer] = await db.update(customersTable).set(updatePayload).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(customer);
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db.delete(customersTable).where(eq(customersTable.id, params.data.id)).returning();
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
