import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, invoicesTable, customersTable, quotesTable, purchaseOrdersTable, shipmentsTable } from "@workspace/db";
import { getNextDocNumber } from "../lib/doc-numbers";
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

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rawLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : parsed.data.lineItems;
  const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
  const providedNumber = (parsed.data as any).invoiceNumber as string | null | undefined;
  const invoiceNumber = providedNumber ?? `FRZI-${await getNextDocNumber()}`;
  const [inv] = await db.insert(invoicesTable).values({
    customerId: parsed.data.customerId,
    estimateId: parsed.data.estimateId ?? null,
    status: parsed.data.status ?? "draft",
    invoiceNumber,
    trackingNumber: (parsed.data as any).trackingNumber ?? null,
    lineItems: rawLineItems,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    discountTotal: String(totals.discountTotal),
    total: String(totals.total),
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    isQuickInvoice: parsed.data.isQuickInvoice ?? false,
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
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

  // Fetch current invoice to get the live total
  const [current] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!current) { res.status(404).json({ error: "Invoice not found" }); return; }

  const currentTotal    = Number(current.total ?? 0);
  const currentDiscount = Number(current.discountTotal ?? 0);

  // Compute early pay discount
  let earlyDiscAmt = 0;
  const earlyPct  = parsed.data.earlyDiscountPercent ?? null;
  const earlyAmt  = parsed.data.earlyDiscountAmount  ?? null;
  if (earlyPct != null && earlyPct > 0) {
    earlyDiscAmt = Math.round(currentTotal * earlyPct / 100 * 100) / 100;
  } else if (earlyAmt != null && earlyAmt > 0) {
    earlyDiscAmt = Math.min(earlyAmt, currentTotal); // can't discount more than total
  }

  // Build payment note — prepend early discount info if applicable
  const noteParts: string[] = [];
  if (earlyDiscAmt > 0) {
    const pctStr = earlyPct != null ? `${earlyPct}%—` : "";
    noteParts.push(`Early pay discount: ${pctStr}$${earlyDiscAmt.toFixed(2)}`);
  }
  if (parsed.data.paymentNote) noteParts.push(parsed.data.paymentNote);

  const updateFields: Record<string, unknown> = {
    status: "paid",
    paymentMethod: parsed.data.paymentMethod,
    paymentNote: noteParts.join(" | ") || null,
    paidAt: new Date(),
  };

  // Apply discount to stored totals so every downstream consumer sees correct numbers
  if (earlyDiscAmt > 0) {
    updateFields.discountTotal = String(Math.round((currentDiscount + earlyDiscAmt) * 100) / 100);
    updateFields.total         = String(Math.round((currentTotal - earlyDiscAmt) * 100) / 100);
  }

  const [inv] = await db.update(invoicesTable).set(updateFields).where(eq(invoicesTable.id, params.data.id)).returning();
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(await withCustomerName(inv));
});

export default router;
