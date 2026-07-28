import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
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
  // accept both "expectedDate" and "promiseDate" as the delivery commitment date
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
  return { ...po, vendorName: vendor?.name ?? "Unknown", lineItems: po.lineItems as object[], receivedItems: po.receivedItems as object[], subtotal: Number(po.subtotal), taxTotal: Number(po.taxTotal), total: Number(po.total) };
}

function computePoStatus(
  currentStatus: string,
  lineItems: Array<{ quantity: number; [k: string]: any }>,
  receivedItems: Array<{ lineIndex: number; receivedQty: number }>,
): string {
  // Terminal statuses are not overridden by receipt logic
  if (["billed", "cancelled"].includes(currentStatus)) return currentStatus;
  if (lineItems.length === 0) return currentStatus;

  const orderedQtyByIdx = lineItems.map((li) => Number(li.quantity ?? 0));
  const receivedQtyByIdx: number[] = new Array(lineItems.length).fill(0);
  for (const r of receivedItems) {
    if (r.lineIndex >= 0 && r.lineIndex < lineItems.length) {
      receivedQtyByIdx[r.lineIndex] = Number(r.receivedQty ?? 0);
    }
  }

  const allFull = orderedQtyByIdx.every((oq, i) => receivedQtyByIdx[i] >= oq);
  const anyReceived = receivedQtyByIdx.some((rq) => rq > 0);

  if (allFull) return "received";
  if (anyReceived) return "partially_received";
  return currentStatus;
}

router.get("/purchase-orders", async (_req, res): Promise<void> => {
  const pos = await db.select().from(purchaseOrdersTable).orderBy(purchaseOrdersTable.createdAt);
  if (pos.length === 0) { res.json([]); return; }
  const ids = [...new Set(pos.map(p => p.vendorId))];
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(inArray(vendorsTable.id, ids));
  const vmap = new Map(vendors.map(v => [v.id, v.name]));
  res.json(pos.map(p => ({ ...p, vendorName: vmap.get(p.vendorId) ?? "Unknown", lineItems: p.lineItems as object[], receivedItems: p.receivedItems as object[], subtotal: Number(p.subtotal), taxTotal: Number(p.taxTotal), total: Number(p.total) })));
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
  // promiseDate takes precedence over expectedDate
  const resolvedDate = parsed.data.promiseDate ?? parsed.data.expectedDate ?? null;
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
    expectedDate: resolvedDate ? new Date(resolvedDate) : null,
    receivedItems: [],
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
  const updateData: Partial<typeof purchaseOrdersTable.$inferInsert> = {};
  if (parsed.data.vendorId !== undefined) updateData.vendorId = parsed.data.vendorId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  // promiseDate takes precedence over expectedDate
  const dateVal = parsed.data.promiseDate ?? parsed.data.expectedDate;
  if (dateVal !== undefined) updateData.expectedDate = dateVal ? new Date(dateVal) : null;
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

// POST /purchase-orders/:id/receive — record partial or full receipt of items
router.post("/purchase-orders/:id/receive", async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ReceiveItemsPayload.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const lineItems = (po.lineItems as Array<{ quantity: number; productId?: number; description?: string; [k: string]: any }>) ?? [];
  const existing = (po.receivedItems as Array<{ lineIndex: number; receivedQty: number }>) ?? [];

  // Merge received quantities
  const merged = [...existing];
  for (const inc of parsed.data.items) {
    const existing_idx = merged.findIndex(r => r.lineIndex === inc.lineIndex);
    if (existing_idx >= 0) {
      merged[existing_idx] = { lineIndex: inc.lineIndex, receivedQty: merged[existing_idx].receivedQty + inc.qty };
    } else {
      merged.push({ lineIndex: inc.lineIndex, receivedQty: inc.qty });
    }
  }

  // Write stock movements + update inventory for items that have a productId
  for (const inc of parsed.data.items) {
    if (inc.qty <= 0) continue;
    const li = lineItems[inc.lineIndex];
    if (!li) continue;
    const productId = li.productId ?? (li as any).product_id;
    if (!productId) continue;

    // Insert stock movement
    await db.insert(stockMovementsTable).values({
      productId: Number(productId),
      movementType: "in",
      quantity: String(inc.qty),
      referenceId: po.id,
      referenceType: "purchase_order",
      notes: `Received from PO ${po.id}`,
    });

    // Update inventory quantity
    const [inv] = await db.select().from(inventoryTable).where(eq(inventoryTable.productId, Number(productId)));
    if (inv) {
      const newQty = Number(inv.quantity) + inc.qty;
      await db.update(inventoryTable).set({ quantity: String(newQty) }).where(eq(inventoryTable.productId, Number(productId)));
    } else {
      await db.insert(inventoryTable).values({ productId: Number(productId), quantity: String(inc.qty), reorderPoint: "0" });
    }
  }

  // Compute new status
  const newStatus = computePoStatus(po.status ?? "draft", lineItems, merged);

  const [updated] = await db.update(purchaseOrdersTable)
    .set({ receivedItems: merged, status: newStatus })
    .where(eq(purchaseOrdersTable.id, id))
    .returning();

  res.json(await withVendorName(updated));
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
