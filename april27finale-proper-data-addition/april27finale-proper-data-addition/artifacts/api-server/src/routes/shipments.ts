import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, shipmentsTable, customersTable } from "@workspace/db";
import {
  CreateShipmentBody,
  UpdateShipmentBody,
  GetShipmentParams,
  UpdateShipmentParams,
} from "@workspace/api-zod";

const router = Router();

async function withCustomerName(ship: typeof shipmentsTable.$inferSelect) {
  const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, ship.customerId));
  return { ...ship, customerName: customer?.name ?? "Unknown" };
}

router.get("/shipments", async (_req, res): Promise<void> => {
  const shipments = await db.select().from(shipmentsTable).orderBy(shipmentsTable.createdAt);
  if (shipments.length === 0) { res.json([]); return; }
  const ids = [...new Set(shipments.map(s => s.customerId))];
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable).where(inArray(customersTable.id, ids));
  const cmap = new Map(customers.map(c => [c.id, c.name]));
  res.json(shipments.map(s => ({ ...s, customerName: cmap.get(s.customerId) ?? "Unknown" })));
});

router.post("/shipments", async (req, res): Promise<void> => {
  const parsed = CreateShipmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [ship] = await db.insert(shipmentsTable).values({
    customerId: parsed.data.customerId,
    invoiceId: parsed.data.invoiceId ?? null,
    status: parsed.data.status ?? "pending",
    carrier: parsed.data.carrier ?? null,
    trackingNumber: parsed.data.trackingNumber ?? null,
    shippedAt: parsed.data.shippedAt ? new Date(parsed.data.shippedAt) : null,
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
    shippingCost: req.body.shippingCost != null ? String(req.body.shippingCost) : null,
    easyshipShipmentId: req.body.easyshipShipmentId ?? null,
    labelUrl: req.body.labelUrl ?? null,
    packageData: req.body.packageData ?? null,
  }).returning();
  res.status(201).json(await withCustomerName(ship));
});

router.get("/shipments/:id", async (req, res): Promise<void> => {
  const params = GetShipmentParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [ship] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, params.data.id));
  if (!ship) { res.status(404).json({ error: "Shipment not found" }); return; }
  res.json(await withCustomerName(ship));
});

router.patch("/shipments/:id", async (req, res): Promise<void> => {
  const params = UpdateShipmentParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateShipmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.carrier !== undefined) updateData.carrier = parsed.data.carrier;
  if (parsed.data.trackingNumber !== undefined) updateData.trackingNumber = parsed.data.trackingNumber;
  if (parsed.data.shippedAt !== undefined) updateData.shippedAt = parsed.data.shippedAt ? new Date(parsed.data.shippedAt) : null;
  if (parsed.data.deliveredAt !== undefined) updateData.deliveredAt = parsed.data.deliveredAt ? new Date(parsed.data.deliveredAt) : null;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  if (req.body.shippingCost !== undefined) updateData.shippingCost = req.body.shippingCost != null ? String(req.body.shippingCost) : null;
  if (req.body.easyshipShipmentId !== undefined) updateData.easyshipShipmentId = req.body.easyshipShipmentId;
  if (req.body.labelUrl !== undefined) updateData.labelUrl = req.body.labelUrl;
  if (req.body.packageData !== undefined) updateData.packageData = req.body.packageData;
  const [ship] = await db.update(shipmentsTable).set(updateData).where(eq(shipmentsTable.id, params.data.id)).returning();
  if (!ship) { res.status(404).json({ error: "Shipment not found" }); return; }
  res.json(await withCustomerName(ship));
});

router.delete("/shipments/:id", async (req, res): Promise<void> => {
  const params = GetShipmentParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [ship] = await db.delete(shipmentsTable).where(eq(shipmentsTable.id, params.data.id)).returning();
  if (!ship) { res.status(404).json({ error: "Shipment not found" }); return; }
  res.json(ship);
});

export default router;
