import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, ticketsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const NoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
});

const TicketBody = z.object({
  orderRef: z.string().optional().default(""),
  customerId: z.number().nullable().optional(),
  customerName: z.string().optional().default(""),
  customerEmail: z.string().optional().default(""),
  customerPhone: z.string().optional().default(""),
  subject: z.string().min(1),
  description: z.string().optional().default(""),
  status: z.enum(["open", "pending", "closed"]).optional().default("open"),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  contactMethod: z.enum(["email", "phone", "in_person", "other"]).optional().default("email"),
  notes: z.array(NoteSchema).optional().default([]),
});

const TicketPatch = TicketBody.partial();

function serialize(row: typeof ticketsTable.$inferSelect) {
  return {
    id: row.id,
    orderRef: row.orderRef ?? "",
    customerId: row.customerId ?? null,
    customer: {
      name: row.customerName ?? "",
      email: row.customerEmail ?? "",
      phone: row.customerPhone ?? "",
    },
    subject: row.subject,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    contactMethod: row.contactMethod,
    notes: Array.isArray(row.notes) ? row.notes : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: (row as any).updatedAt ? (row as any).updatedAt.toISOString() : row.createdAt.toISOString(),
  };
}

router.get("/tickets", async (_req, res): Promise<void> => {
  const rows = await db.select().from(ticketsTable).orderBy(desc(ticketsTable.createdAt));
  res.json(rows.map(serialize));
});

router.get("/tickets/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
  if (!row) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(serialize(row));
});

router.post("/tickets", async (req, res): Promise<void> => {
  const parsed = TicketBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(ticketsTable).values({
    orderRef: d.orderRef,
    customerId: d.customerId ?? null,
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    customerPhone: d.customerPhone,
    subject: d.subject,
    description: d.description,
    status: d.status,
    priority: d.priority,
    contactMethod: d.contactMethod,
    notes: d.notes as any,
  }).returning();
  res.status(201).json(serialize(row));
});

router.patch("/tickets/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = TicketPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const update: Partial<typeof ticketsTable.$inferInsert> = {};
  if (d.orderRef !== undefined) update.orderRef = d.orderRef;
  if (d.customerId !== undefined) update.customerId = d.customerId ?? null;
  if (d.customerName !== undefined) update.customerName = d.customerName;
  if (d.customerEmail !== undefined) update.customerEmail = d.customerEmail;
  if (d.customerPhone !== undefined) update.customerPhone = d.customerPhone;
  if (d.subject !== undefined) update.subject = d.subject;
  if (d.description !== undefined) update.description = d.description;
  if (d.status !== undefined) update.status = d.status;
  if (d.priority !== undefined) update.priority = d.priority;
  if (d.contactMethod !== undefined) update.contactMethod = d.contactMethod;
  if (d.notes !== undefined) update.notes = d.notes as any;
  const [row] = await db.update(ticketsTable).set(update).where(eq(ticketsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(serialize(row));
});

router.delete("/tickets/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(ticketsTable).where(eq(ticketsTable.id, id));
  res.status(204).end();
});

export default router;
