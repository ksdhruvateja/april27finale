import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, inventoryLocationsTable, stockMovementsTable, productsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const LocationBody = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const MovementBody = z.object({
  productId: z.number(),
  movementType: z.enum(["in", "out", "transfer", "adjust", "initial"]),
  quantity: z.number(),
  locationId: z.number().optional().nullable(),
  toLocationId: z.number().optional().nullable(),
  referenceId: z.number().optional().nullable(),
  referenceType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get("/inventory-locations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(inventoryLocationsTable).orderBy(inventoryLocationsTable.name);
  res.json(rows);
});

router.post("/inventory-locations", async (req, res): Promise<void> => {
  const parsed = LocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(inventoryLocationsTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/inventory-locations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = LocationBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(inventoryLocationsTable).set(parsed.data).where(eq(inventoryLocationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Location not found" }); return; }
  res.json(row);
});

router.delete("/inventory-locations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(inventoryLocationsTable).where(eq(inventoryLocationsTable.id, id));
  res.status(204).send();
});

router.get("/stock-movements", async (req, res): Promise<void> => {
  const productId = req.query.productId ? Number(req.query.productId) : null;
  const query = db.select({
    id: stockMovementsTable.id,
    productId: stockMovementsTable.productId,
    productName: productsTable.name,
    productSku: productsTable.sku,
    movementType: stockMovementsTable.movementType,
    quantity: stockMovementsTable.quantity,
    locationId: stockMovementsTable.locationId,
    toLocationId: stockMovementsTable.toLocationId,
    referenceId: stockMovementsTable.referenceId,
    referenceType: stockMovementsTable.referenceType,
    notes: stockMovementsTable.notes,
    createdAt: stockMovementsTable.createdAt,
  }).from(stockMovementsTable)
    .leftJoin(productsTable, eq(stockMovementsTable.productId, productsTable.id));
  
  const results = productId
    ? await query.where(eq(stockMovementsTable.productId, productId)).orderBy(stockMovementsTable.createdAt)
    : await query.orderBy(stockMovementsTable.createdAt);
  
  res.json(results.map(r => ({ ...r, quantity: Number(r.quantity) })));
});

router.post("/stock-movements", async (req, res): Promise<void> => {
  const parsed = MovementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(stockMovementsTable).values({
    productId: d.productId,
    movementType: d.movementType,
    quantity: String(d.quantity),
    locationId: d.locationId ?? null,
    toLocationId: d.toLocationId ?? null,
    referenceId: d.referenceId ?? null,
    referenceType: d.referenceType ?? null,
    notes: d.notes ?? null,
  }).returning();
  res.status(201).json({ ...row, quantity: Number(row.quantity) });
});

export default router;
