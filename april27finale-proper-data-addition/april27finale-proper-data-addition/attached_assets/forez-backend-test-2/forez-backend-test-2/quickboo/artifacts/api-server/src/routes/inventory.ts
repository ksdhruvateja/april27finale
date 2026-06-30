import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, inventoryTable, productsTable } from "@workspace/db";
import {
  GetInventoryItemParams,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
} from "@workspace/api-zod";

const router = Router();

async function withProductInfo(inv: typeof inventoryTable.$inferSelect) {
  const [product] = await db.select({ name: productsTable.name, sku: productsTable.sku, unit: productsTable.unit }).from(productsTable).where(eq(productsTable.id, inv.productId));
  return { ...inv, productName: product?.name ?? "Unknown", sku: product?.sku ?? null, unit: product?.unit ?? null, quantity: Number(inv.quantity), reorderPoint: Number(inv.reorderPoint) };
}

router.get("/inventory", async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryTable).orderBy(inventoryTable.productId);
  res.json(await Promise.all(items.map(withProductInfo)));
});

router.get("/inventory/:id", async (req, res): Promise<void> => {
  const params = GetInventoryItemParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [inv] = await db.select().from(inventoryTable).where(eq(inventoryTable.id, params.data.id));
  if (!inv) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.json(await withProductInfo(inv));
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const params = UpdateInventoryItemParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.quantity !== undefined) updateData.quantity = String(parsed.data.quantity);
  if (parsed.data.reorderPoint !== undefined) updateData.reorderPoint = String(parsed.data.reorderPoint);
  const [inv] = await db.update(inventoryTable).set(updateData).where(eq(inventoryTable.id, params.data.id)).returning();
  if (!inv) { res.status(404).json({ error: "Inventory item not found" }); return; }
  res.json(await withProductInfo(inv));
});

export default router;
