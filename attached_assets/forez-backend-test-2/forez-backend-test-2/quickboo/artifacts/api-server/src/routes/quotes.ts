import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, quotesTable, customersTable, invoicesTable } from "@workspace/db";
import {
  CreateQuoteBody,
  UpdateQuoteBody,
  GetQuoteParams,
  UpdateQuoteParams,
  DeleteQuoteParams,
  ConvertQuoteToInvoiceParams,
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

async function withCustomerName(quote: typeof quotesTable.$inferSelect) {
  const [customer] = await db.select({
    name: customersTable.name,
    email: customersTable.email,
    phone: customersTable.phone,
    address: customersTable.address,
    city: customersTable.city,
    state: customersTable.state,
    zipCode: customersTable.zipCode,
    country: customersTable.country,
  }).from(customersTable).where(eq(customersTable.id, quote.customerId));
  return {
    ...quote,
    customerName: customer?.name ?? "Unknown",
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    customerAddress: customer?.address ?? null,
    customerCity: customer?.city ?? null,
    customerState: customer?.state ?? null,
    customerZip: customer?.zipCode ?? null,
    customerCountry: customer?.country ?? null,
    lineItems: quote.lineItems as object[],
    subtotal: Number(quote.subtotal),
    taxTotal: Number(quote.taxTotal),
    discountTotal: Number(quote.discountTotal),
    total: Number(quote.total),
    quoteNumber: quote.quoteNumber ?? null,
    trackingNumber: quote.trackingNumber ?? null,
  };
}

router.get("/quotes", async (_req, res): Promise<void> => {
  const quotes = await db.select().from(quotesTable).orderBy(quotesTable.createdAt);
  const result = await Promise.all(quotes.map(withCustomerName));
  res.json(result);
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rawLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : parsed.data.lineItems;
  const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
  const [quote] = await db.insert(quotesTable).values({
    customerId: parsed.data.customerId,
    status: parsed.data.status ?? "draft",
    salesLead: (parsed.data as any).salesLead ?? null,
    quoteNumber: (parsed.data as any).quoteNumber ?? null,
    trackingNumber: (parsed.data as any).trackingNumber ?? null,
    lineItems: rawLineItems,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    discountTotal: String(totals.discountTotal),
    total: String(totals.total),
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning();
  res.status(201).json(await withCustomerName(quote));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, params.data.id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(await withCustomerName(quote));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const params = UpdateQuoteParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.customerId !== undefined) updateData.customerId = parsed.data.customerId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  if ((parsed.data as any).salesLead !== undefined) updateData.salesLead = (parsed.data as any).salesLead;
  if ((parsed.data as any).quoteNumber !== undefined) updateData.quoteNumber = (parsed.data as any).quoteNumber;
  if ((parsed.data as any).trackingNumber !== undefined) updateData.trackingNumber = (parsed.data as any).trackingNumber;
  if (parsed.data.expiresAt !== undefined) updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsed.data.lineItems !== undefined) {
    const rawLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : parsed.data.lineItems;
    const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
    updateData.lineItems = rawLineItems;
    updateData.subtotal = String(totals.subtotal);
    updateData.taxTotal = String(totals.taxTotal);
    updateData.discountTotal = String(totals.discountTotal);
    updateData.total = String(totals.total);
  }
  const [quote] = await db.update(quotesTable).set(updateData).where(eq(quotesTable.id, params.data.id)).returning();
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.json(await withCustomerName(quote));
});

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const params = DeleteQuoteParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [quote] = await db.delete(quotesTable).where(eq(quotesTable.id, params.data.id)).returning();
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  res.sendStatus(204);
});

router.post("/quotes/:id/convert", async (req, res): Promise<void> => {
  const params = ConvertQuoteToInvoiceParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.id, params.data.id));
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

  const salesLead = req.body?.salesLead ?? quote.salesLead ?? null;
  const trackingNumber = req.body?.trackingNumber ?? quote.trackingNumber ?? null;
  const invoiceNumber = req.body?.invoiceNumber ?? null;

  const [invoice] = await db.insert(invoicesTable).values({
    customerId: quote.customerId,
    quoteId: quote.id,
    status: "draft",
    salesLead,
    trackingNumber,
    invoiceNumber,
    lineItems: quote.lineItems as object[],
    subtotal: quote.subtotal,
    taxTotal: quote.taxTotal,
    discountTotal: quote.discountTotal,
    total: quote.total,
    notes: quote.notes,
    internalNote: quote.internalNote,
    isQuickInvoice: false,
  }).returning();

  await db.update(quotesTable).set({ status: "accepted" }).where(eq(quotesTable.id, quote.id));

  const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, invoice.customerId));
  res.status(201).json({ ...invoice, customerName: customer?.name ?? "Unknown", lineItems: invoice.lineItems as object[], subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), discountTotal: Number(invoice.discountTotal), total: Number(invoice.total) });
});

export default router;
