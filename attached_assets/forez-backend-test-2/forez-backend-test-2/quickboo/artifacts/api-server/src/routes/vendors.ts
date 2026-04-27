import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import {
  CreateVendorBody,
  UpdateVendorBody,
  GetVendorParams,
  UpdateVendorParams,
  DeleteVendorParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/vendors", async (_req, res): Promise<void> => {
  const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.createdAt);
  res.json(vendors);
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.insert(vendorsTable).values(parsed.data).returning();
  res.status(201).json(vendor);
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(vendor);
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.update(vendorsTable).set(parsed.data).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(vendor);
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const params = DeleteVendorParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vendor] = await db.delete(vendorsTable).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
