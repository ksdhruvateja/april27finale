import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, invoicesTable, customersTable, quotesTable, purchaseOrdersTable, shipmentsTable } from "@workspace/db";
import { getNextDocNumber } from "../lib/doc-numbers";
import { getOrCreateWalkInCustomerId } from "../lib/walk-in-customer";
import {
  CreateInvoiceBody,
  UpdateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  DeleteInvoiceParams,
  PayInvoiceParams,
  PayInvoiceBody,
} from "@workspace/api-zod";

const router = Router();

function calcTotals(lineItems: Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>) {
  let subtotal = 0, taxTotal = 0, discountTotal = 0;
  for (const item of lineItems) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const disc = lineSubtotal * (item.discountPercent / 100);
    const taxable = lineSubtotal - disc;
    subtotal += lineSubtotal;
    discountTotal += disc;
    taxTotal += taxable * (item.taxPercent / 100);
  }
  return { subtotal, taxTotal, discountTotal, total: subtotal - discountTotal + taxTotal };
}

async function withCustomerName(inv: typeof invoicesTable.$inferSelect) {
  const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, inv.customerId));
  return { ...inv, customerName: customer?.name ?? "Unknown", lineItems: inv.lineItems as object[], subtotal: Number(inv.subtotal), taxTotal: Number(inv.taxTotal), discountTotal: Number(inv.discountTotal), total: Number(inv.total), invoiceNumber: inv.invoiceNumber ?? null, trackingNumber: inv.trackingNumber ?? null, quoteId: inv.quoteId ?? null };
}

router.get("/invoices", async (_req, res): Promise<void> => {
  const invoices = await db.select().from(invoicesTable).orderBy(invoicesTable.createdAt);
  if (invoices.length === 0) { res.json([]); return; }
  const ids = [...new Set(invoices.map(i => i.customerId))];
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable).where(inArray(customersTable.id, ids));
  const cmap = new Map(customers.map(c => [c.id, c.name]));
  res.json(invoices.map(inv => ({ ...inv, customerName: cmap.get(inv.customerId) ?? "Unknown", lineItems: inv.lineItems as object[], subtotal: Number(inv.subtotal), taxTotal: Number(inv.taxTotal), discountTotal: Number(inv.discountTotal), total: Number(inv.total), invoiceNumber: inv.invoiceNumber ?? null, trackingNumber: inv.trackingNumber ?? null, quoteId: inv.quoteId ?? null })));
});

function parseOptionalDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalizePaymentMethod(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "card") return "stripe";
  if (["stripe", "bank_transfer", "check", "cash"].includes(value)) return value;
  return undefined;
}

router.post("/invoices", async (req, res): Promise<void> => {
  const body = { ...req.body };
  if (!body.customerId && body.isQuickInvoice) {
    body.customerId = await getOrCreateWalkInCustomerId();
  }

  const parsed = CreateInvoiceBody.safeParse(body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rawLineItems = Array.isArray(body.lineItems) ? body.lineItems : parsed.data.lineItems;
  const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
  const providedNumber = (parsed.data as any).invoiceNumber as string | null | undefined;
  const invoiceNumber = providedNumber ?? `FRZI-${await getNextDocNumber()}`;
  const status = parsed.data.status ?? "draft";
  const createdAt = parseOptionalDate(body.createdAt);
  const paidAt = parseOptionalDate(body.paidAt);
  const paymentMethod = normalizePaymentMethod(body.paymentMethod);

  const [inv] = await db.insert(invoicesTable).values({
    customerId: parsed.data.customerId,
    estimateId: parsed.data.estimateId ?? null,
    quoteId: parsed.data.quoteId ?? null,
    status,
    invoiceNumber,
    trackingNumber: (parsed.data as any).trackingNumber ?? null,
    salesLead: parsed.data.salesLead ?? null,
    lineItems: rawLineItems,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    discountTotal: String(totals.discountTotal),
    total: String(totals.total),
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    isQuickInvoice: parsed.data.isQuickInvoice ?? false,
    notes: parsed.data.notes ?? null,
    internalNote: body.internalNote ?? null,
    ...(createdAt ? { createdAt } : {}),
    ...(status === "paid" || paidAt
      ? {
          paidAt: paidAt ?? new Date(),
          ...(paymentMethod ? { paymentMethod } : {}),
        }
      : {}),
  }).returning();
  res.status(201).json(await withCustomerName(inv));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(await withCustomerName(inv));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateInvoiceParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.customerId !== undefined) updateData.customerId = parsed.data.customerId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  if (parsed.data.trackingNumber !== undefined) updateData.trackingNumber = parsed.data.trackingNumber;
  if (parsed.data.salesLead !== undefined) updateData.salesLead = parsed.data.salesLead;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  const createdAt = parseOptionalDate(req.body.createdAt);
  if (createdAt) updateData.createdAt = createdAt;
  if (parsed.data.lineItems !== undefined) {
    const rawLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : parsed.data.lineItems;
    const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
    updateData.lineItems = rawLineItems;
    updateData.subtotal = String(totals.subtotal);
    updateData.taxTotal = String(totals.taxTotal);
    updateData.discountTotal = String(totals.discountTotal);
    updateData.total = String(totals.total);
  }
  const [inv] = await db.update(invoicesTable).set(updateData).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(await withCustomerName(inv));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [inv] = await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.sendStatus(204);
});

router.post("/invoices/:id/pay", async (req, res): Promise<void> => {
  const params = PayInvoiceParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = PayInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [inv] = await db.update(invoicesTable).set({
    status: "paid",
    paymentMethod: parsed.data.paymentMethod,
    paymentNote: parsed.data.paymentNote ?? null,
    paidAt: new Date(),
  }).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(await withCustomerName(inv));
});

export default router;
