import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, estimatesTable, customersTable, invoicesTable } from "@workspace/db";
import {
  CreateEstimateBody,
  UpdateEstimateBody,
  GetEstimateParams,
  UpdateEstimateParams,
  DeleteEstimateParams,
  ConvertEstimateToInvoiceParams,
} from "@workspace/api-zod";

const router = Router();

function calcTotals(lineItems: Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>) {
  let subtotal = 0, taxTotal = 0, discountTotal = 0;
  for (const item of lineItems) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const disc = lineSubtotal * (item.discountPercent / 100);
    const taxable = lineSubtotal - disc;
    const tax = taxable * (item.taxPercent / 100);
    subtotal += lineSubtotal;
    discountTotal += disc;
    taxTotal += tax;
  }
  return { subtotal, taxTotal, discountTotal, total: subtotal - discountTotal + taxTotal };
}

async function withCustomerName(est: typeof estimatesTable.$inferSelect) {
  const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, est.customerId));
  return { ...est, customerName: customer?.name ?? "Unknown", lineItems: est.lineItems as object[], subtotal: Number(est.subtotal), taxTotal: Number(est.taxTotal), discountTotal: Number(est.discountTotal), total: Number(est.total) };
}

router.get("/estimates", async (_req, res): Promise<void> => {
  const estimates = await db.select().from(estimatesTable).orderBy(estimatesTable.createdAt);
  res.json(await Promise.all(estimates.map(withCustomerName)));
});

router.post("/estimates", async (req, res): Promise<void> => {
  const parsed = CreateEstimateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
  const [est] = await db.insert(estimatesTable).values({
    customerId: parsed.data.customerId,
    quoteId: parsed.data.quoteId ?? null,
    status: parsed.data.status ?? "draft",
    lineItems: parsed.data.lineItems,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    discountTotal: String(totals.discountTotal),
    total: String(totals.total),
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
  }).returning();
  res.status(201).json(await withCustomerName(est));
});

router.get("/estimates/:id", async (req, res): Promise<void> => {
  const params = GetEstimateParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [est] = await db.select().from(estimatesTable).where(eq(estimatesTable.id, params.data.id));
  if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }
  res.json(await withCustomerName(est));
});

router.patch("/estimates/:id", async (req, res): Promise<void> => {
  const params = UpdateEstimateParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEstimateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.customerId !== undefined) updateData.customerId = parsed.data.customerId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  if (parsed.data.lineItems !== undefined) {
    const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
    updateData.lineItems = parsed.data.lineItems;
    updateData.subtotal = String(totals.subtotal);
    updateData.taxTotal = String(totals.taxTotal);
    updateData.discountTotal = String(totals.discountTotal);
    updateData.total = String(totals.total);
  }
  const [est] = await db.update(estimatesTable).set(updateData).where(eq(estimatesTable.id, params.data.id)).returning();
  if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }
  res.json(await withCustomerName(est));
});

router.delete("/estimates/:id", async (req, res): Promise<void> => {
  const params = DeleteEstimateParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [est] = await db.delete(estimatesTable).where(eq(estimatesTable.id, params.data.id)).returning();
  if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }
  res.sendStatus(204);
});

router.post("/estimates/:id/convert", async (req, res): Promise<void> => {
  const params = ConvertEstimateToInvoiceParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [est] = await db.select().from(estimatesTable).where(eq(estimatesTable.id, params.data.id));
  if (!est) { res.status(404).json({ error: "Estimate not found" }); return; }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const [invoice] = await db.insert(invoicesTable).values({
    customerId: est.customerId,
    estimateId: est.id,
    status: "draft",
    lineItems: est.lineItems as object[],
    subtotal: est.subtotal,
    taxTotal: est.taxTotal,
    discountTotal: est.discountTotal,
    total: est.total,
    dueDate,
    notes: est.notes,
    internalNote: est.internalNote,
    isQuickInvoice: false,
  }).returning();

  await db.update(estimatesTable).set({ status: "invoiced" }).where(eq(estimatesTable.id, est.id));

  const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, invoice.customerId));
  res.status(201).json({ ...invoice, customerName: customer?.name ?? "Unknown", lineItems: invoice.lineItems as object[], subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), discountTotal: Number(invoice.discountTotal), total: Number(invoice.total) });
});

export default router;
