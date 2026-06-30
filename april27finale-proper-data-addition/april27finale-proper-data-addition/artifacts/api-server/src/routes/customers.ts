import { Router } from "express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, customersTable, invoicesTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  GetCustomerParams,
  UpdateCustomerParams,
  DeleteCustomerParams,
} from "@workspace/api-zod";
import {
  contactEmailsField,
  contactPhonesField,
  normalizeContactList,
} from "../lib/normalize-contacts.js";

const router = Router();

const customerAccountType = z
  .enum(["net30", "net60", "net90", "cash", "cash_advance", "cod"])
  .nullish();

const CreateCustomerPayload = CreateCustomerBody.extend({
  emails: contactEmailsField,
  phones: contactPhonesField,
  quickbooksExtras: z.record(z.string(), z.unknown()).nullish(),
  accountType: customerAccountType,
});

const UpdateCustomerPayload = UpdateCustomerBody.extend({
  emails: contactEmailsField,
  phones: contactPhonesField,
  quickbooksExtras: z.record(z.string(), z.unknown()).nullish(),
  accountType: customerAccountType,
});

function buildCustomerWritePayload(
  data: z.infer<typeof CreateCustomerPayload> | z.infer<typeof UpdateCustomerPayload>,
  quickbooksExtras?: Record<string, unknown> | null,
) {
  const { creditLimit, emails, phones, quickbooksExtras: _qb, ...rest } = data;
  const normalizedEmails = emails !== undefined ? normalizeContactList(emails as unknown[], "email") : undefined;
  const normalizedPhones = phones !== undefined ? normalizeContactList(phones as unknown[], "phone") : undefined;
  const primaryFromEmails = normalizedEmails?.[0]?.email ?? null;

  const payload: Record<string, unknown> = {
    ...rest,
    ...(creditLimit !== undefined ? { creditLimit: creditLimit === null ? null : String(creditLimit) } : {}),
    ...(quickbooksExtras !== undefined ? { quickbooksExtras } : {}),
  };

  if (normalizedEmails !== undefined) {
    payload.emails = normalizedEmails;
    const currentEmail = payload.email;
    if (currentEmail === undefined || currentEmail === null || currentEmail === "") {
      payload.email = primaryFromEmails;
    }
  }

  if (normalizedPhones !== undefined) {
    payload.phones = normalizedPhones;
    const currentPhone = payload.phone;
    if (currentPhone === undefined || currentPhone === null || currentPhone === "") {
      payload.phone = normalizedPhones?.[0]?.number ?? null;
    }
  }

  return payload;
}

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
  const customers = await db.select().from(customersTable).orderBy(customersTable.createdAt);
  res.json(await withBalances(customers));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const quickbooksExtras =
    parsed.data.quickbooksExtras ??
    (req.body?.quickbooksExtras && typeof req.body.quickbooksExtras === "object"
      ? req.body.quickbooksExtras
      : undefined);
  const insertPayload = buildCustomerWritePayload(parsed.data, quickbooksExtras);
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
  const parsed = UpdateCustomerPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const quickbooksExtras =
    parsed.data.quickbooksExtras ??
    (req.body?.quickbooksExtras && typeof req.body.quickbooksExtras === "object"
      ? req.body.quickbooksExtras
      : undefined);
  const updatePayload = buildCustomerWritePayload(parsed.data, quickbooksExtras);
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
