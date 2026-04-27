import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, purchaseOrdersTable, vendorsTable, billsTable } from "@workspace/db";
import {
  GetPurchaseOrderParams,
  UpdatePurchaseOrderParams,
  DeletePurchaseOrderParams,
  ConvertPurchaseOrderToBillParams,
} from "@workspace/api-zod";
import { z } from "zod";

const router = Router();

const PurchaseOrderStatus = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((s) => s.toLowerCase());

const PurchaseOrderLineItem = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  taxPercent: z.number().optional().default(0),
  discountPercent: z.number().optional().default(0),
}).passthrough();

const CreatePurchaseOrderPayload = z.object({
  vendorId: z.number(),
  sourceInvoiceId: z.number().nullish(),
  status: PurchaseOrderStatus.optional(),
  lineItems: z.array(PurchaseOrderLineItem),
  notes: z.string().nullish(),
  expectedDate: z.coerce.date().nullish(),
});

const UpdatePurchaseOrderPayload = z.object({
  vendorId: z.number().optional(),
  status: PurchaseOrderStatus.optional(),
  lineItems: z.array(PurchaseOrderLineItem).optional(),
  notes: z.string().nullish(),
  expectedDate: z.coerce.date().nullish(),
}).partial();

function calcTotals(lineItems: Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>) {
  let subtotal = 0, taxTotal = 0;
  for (const item of lineItems) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const disc = lineSubtotal * (item.discountPercent / 100);
    subtotal += lineSubtotal;
    taxTotal += (lineSubtotal - disc) * (item.taxPercent / 100);
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

async function withVendorName(po: typeof purchaseOrdersTable.$inferSelect) {
  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, po.vendorId));
  return { ...po, vendorName: vendor?.name ?? "Unknown", lineItems: po.lineItems as object[], subtotal: Number(po.subtotal), taxTotal: Number(po.taxTotal), total: Number(po.total) };
}

router.get("/purchase-orders", async (_req, res): Promise<void> => {
  const pos = await db.select().from(purchaseOrdersTable).orderBy(purchaseOrdersTable.createdAt);
  if (pos.length === 0) { res.json([]); return; }
  const ids = [...new Set(pos.map(p => p.vendorId))];
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(inArray(vendorsTable.id, ids));
  const vmap = new Map(vendors.map(v => [v.id, v.name]));
  res.json(pos.map(p => ({ ...p, vendorName: vmap.get(p.vendorId) ?? "Unknown", lineItems: p.lineItems as object[], subtotal: Number(p.subtotal), taxTotal: Number(p.taxTotal), total: Number(p.total) })));
});

router.post("/purchase-orders", async (req, res): Promise<void> => {
  const parsed = CreatePurchaseOrderPayload.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
  let poSequence: number | null = null;
  if (parsed.data.sourceInvoiceId) {
    const existing = await db.select({ id: purchaseOrdersTable.id })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.sourceInvoiceId, parsed.data.sourceInvoiceId));
    poSequence = existing.length + 1;
  }
  const [po] = await db.insert(purchaseOrdersTable).values({
    vendorId: parsed.data.vendorId,
    sourceInvoiceId: parsed.data.sourceInvoiceId ?? null,
    poSequence,
    status: parsed.data.status ?? "draft",
    lineItems: parsed.data.lineItems,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    total: String(totals.total),
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
    expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
  }).returning();
  res.status(201).json(await withVendorName(po));
});

router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  const params = GetPurchaseOrderParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(await withVendorName(po));
});

router.patch("/purchase-orders/:id", async (req, res): Promise<void> => {
  const params = UpdatePurchaseOrderParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePurchaseOrderPayload.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.vendorId !== undefined) updateData.vendorId = parsed.data.vendorId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  if (parsed.data.expectedDate !== undefined) updateData.expectedDate = parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null;
  if (parsed.data.lineItems !== undefined) {
    const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
    updateData.lineItems = parsed.data.lineItems;
    updateData.subtotal = String(totals.subtotal);
    updateData.taxTotal = String(totals.taxTotal);
    updateData.total = String(totals.total);
  }
  const [po] = await db.update(purchaseOrdersTable).set(updateData).where(eq(purchaseOrdersTable.id, params.data.id)).returning();
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(await withVendorName(po));
});

router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  const params = DeletePurchaseOrderParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [po] = await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id)).returning();
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.sendStatus(204);
});

router.post("/purchase-orders/:id/convert", async (req, res): Promise<void> => {
  const params = ConvertPurchaseOrderToBillParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const [bill] = await db.insert(billsTable).values({
    vendorId: po.vendorId,
    purchaseOrderId: po.id,
    status: "received",
    lineItems: po.lineItems as object[],
    subtotal: po.subtotal,
    taxTotal: po.taxTotal,
    total: po.total,
    dueDate,
    notes: po.notes,
    internalNote: po.internalNote,
  }).returning();
  await db.update(purchaseOrdersTable).set({ status: "received" }).where(eq(purchaseOrdersTable.id, po.id));
  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, bill.vendorId));
  res.status(201).json({ ...bill, vendorName: vendor?.name ?? "Unknown", lineItems: bill.lineItems as object[], subtotal: Number(bill.subtotal), taxTotal: Number(bill.taxTotal), total: Number(bill.total) });
});

export default router;
