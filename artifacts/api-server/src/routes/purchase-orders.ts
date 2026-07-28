import { Router } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, purchaseOrdersTable, vendorsTable, billsTable, stockMovementsTable, inventoryTable } from "@workspace/db";
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
  // accept both names
  expectedDate: z.coerce.date().nullish(),
  promiseDate: z.coerce.date().nullish(),
});

const UpdatePurchaseOrderPayload = z.object({
  vendorId: z.number().optional(),
  status: PurchaseOrderStatus.optional(),
  lineItems: z.array(PurchaseOrderLineItem).optional(),
  notes: z.string().nullish(),
  expectedDate: z.coerce.date().nullish(),
  promiseDate: z.coerce.date().nullish(),
}).partial();

const ReceiveItemsPayload = z.object({
  items: z.array(z.object({
    lineIndex: z.number().int().min(0),
    qty: z.number().min(0),
  })),
});

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
  return {
    ...po,
    vendorName: vendor?.name ?? "Unknown",
    lineItems: po.lineItems as object[],
    receivedItems: po.receivedItems as object[],
    subtotal: Number(po.subtotal),
    taxTotal: Number(po.taxTotal),
    total: Number(po.total),
  };
}

function resolveDate(parsed: { expectedDate?: Date | null; promiseDate?: Date | null }): Date | null {
  return parsed.promiseDate ? new Date(parsed.promiseDate) : parsed.expectedDate ? new Date(parsed.expectedDate) : null;
}

router.get("/purchase-orders", async (_req, res): Promise<void> => {
  const pos = await db.select().from(purchaseOrdersTable).orderBy(purchaseOrdersTable.createdAt);
  if (pos.length === 0) { res.json([]); return; }
  const ids = [...new Set(pos.map(p => p.vendorId))];
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(inArray(vendorsTable.id, ids));
  const vmap = new Map(vendors.map(v => [v.id, v.name]));
  res.json(pos.map(p => ({
    ...p,
    vendorName: vmap.get(p.vendorId) ?? "Unknown",
    lineItems: p.lineItems as object[],
    receivedItems: p.receivedItems as object[],
    subtotal: Number(p.subtotal),
    taxTotal: Number(p.taxTotal),
    total: Number(p.total),
  })));
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
    receivedItems: [],
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    total: String(totals.total),
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
    expectedDate: resolveDate(parsed.data),
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
  // accept promiseDate or expectedDate for the expected_date column
  const newDate = resolveDate(parsed.data);
  if (newDate !== null || parsed.data.expectedDate !== undefined || parsed.data.promiseDate !== undefined) {
    updateData.expectedDate = newDate;
  }
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

// POST /purchase-orders/:id/receive
router.post("/purchase-orders/:id/receive", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ReceiveItemsPayload.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (po.status === "cancelled") { res.status(400).json({ error: "Cannot receive items on a cancelled PO" }); return; }

  const lineItems = (po.lineItems as Array<{ description: string; quantity: number; unitPrice: number; productId?: number }>) ?? [];
  const existingReceived: Array<{ lineIndex: number; receivedQty: number }> =
    ((po.receivedItems as any[]) ?? []).map((r: any) => ({ lineIndex: Number(r.lineIndex), receivedQty: Number(r.receivedQty ?? 0) }));

  // Merge: build a map from lineIndex → total received so far
  const receivedMap = new Map<number, number>();
  for (const r of existingReceived) receivedMap.set(r.lineIndex, r.receivedQty);

  const newlyReceived: Array<{ lineIndex: number; qty: number; productId?: number }> = [];
  for (const item of parsed.data.items) {
    const { lineIndex, qty } = item;
    if (lineIndex < 0 || lineIndex >= lineItems.length) continue;
    const prevQty = receivedMap.get(lineIndex) ?? 0;
    const delta = Math.max(0, qty - prevQty); // newly added qty
    if (delta > 0) newlyReceived.push({ lineIndex, qty: delta, productId: lineItems[lineIndex]?.productId });
    receivedMap.set(lineIndex, qty);
  }

  // Build updated receivedItems
  const updatedReceivedItems = Array.from(receivedMap.entries()).map(([lineIndex, receivedQty]) => ({ lineIndex, receivedQty }));

  // Determine new status
  const allFulfilled = lineItems.every((li, idx) => {
    const ordered = Number(li.quantity ?? 0);
    const received = receivedMap.get(idx) ?? 0;
    return received >= ordered;
  });
  const anyReceived = Array.from(receivedMap.values()).some(v => v > 0);
  const newStatus = allFulfilled ? "received" : anyReceived ? "partially_received" : po.status;

  // Update PO
  const [updatedPO] = await db
    .update(purchaseOrdersTable)
    .set({ receivedItems: updatedReceivedItems, status: newStatus })
    .where(eq(purchaseOrdersTable.id, id))
    .returning();

  // Write stock movements + update inventory for newly received items that have a productId
  for (const item of newlyReceived) {
    if (!item.productId) continue;
    const productId = item.productId;
    await db.insert(stockMovementsTable).values({
      productId,
      movementType: "in",
      quantity: String(item.qty),
      referenceId: id,
      referenceType: "purchase_order",
      notes: `Received from PO #${id} (line ${item.lineIndex})`,
    });
    // Update inventory quantity (upsert-style)
    const [existing] = await db.select().from(inventoryTable).where(eq(inventoryTable.productId, productId));
    if (existing) {
      await db.update(inventoryTable)
        .set({ quantity: sql`${inventoryTable.quantity} + ${String(item.qty)}` })
        .where(eq(inventoryTable.productId, productId));
    } else {
      await db.insert(inventoryTable).values({ productId, quantity: String(item.qty) });
    }
  }

  res.json(await withVendorName(updatedPO));
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
  await db.update(purchaseOrdersTable).set({ status: "billed" }).where(eq(purchaseOrdersTable.id, po.id));
  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, bill.vendorId));
  res.status(201).json({ ...bill, vendorName: vendor?.name ?? "Unknown", lineItems: bill.lineItems as object[], subtotal: Number(bill.subtotal), taxTotal: Number(bill.taxTotal), total: Number(bill.total) });
});

export default router;
