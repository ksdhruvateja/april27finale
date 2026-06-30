import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, salesLeadsTable } from "@workspace/db";
import { z } from "zod";

const CreateBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().nullish(),
  mobile: z.string().nullish(),
});

const UpdateBody = CreateBody.partial();

const router = Router();

router.get("/sales-leads", async (req, res): Promise<void> => {
  const leads = await db.select().from(salesLeadsTable).orderBy(salesLeadsTable.createdAt);
  res.json(leads);
});

router.post("/sales-leads", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [lead] = await db.insert(salesLeadsTable).values(parsed.data).returning();
  res.status(201).json(lead);
});

router.patch("/sales-leads/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [lead] = await db.update(salesLeadsTable).set(parsed.data).where(eq(salesLeadsTable.id, id)).returning();
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }
  res.json(lead);
});

router.delete("/sales-leads/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [lead] = await db.delete(salesLeadsTable).where(eq(salesLeadsTable.id, id)).returning();
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
