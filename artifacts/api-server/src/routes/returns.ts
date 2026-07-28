import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, returnsTable, customersTable, invoicesTable } from "@workspace/db";
import { z } from "zod/v4";

const router = Router();

const CreateReturnBody = z.object({
  type: z.enum(["return", "refund", "return_refund"]).default("return"),
  customerId: z.number().int(),
  invoiceId: z.number().int().nullish(),
  status: z.enum(["pending", "approved", "rejected", "received", "refunded", "completed"]).default("pending"),
  reason: z.string().nullish(),
  lineItems: z.array(z.any()).default([]),
  refundAmount: z.union([z.string(), z.number()]).nullish(),
  refundMethod: z.string().nullish(),
  refundedAt: z.string().nullish(),
  notes: z.string().nullish(),
  internalNote: z.string().nullish(),
});

const UpdateReturnBody = CreateReturnBody.partial();

async function withNames(r: typeof returnsTable.$inferSelect) {
  const [customer] = await db
    .select({ name: customersTable.name, company: customersTable.company })
    .from(customersTable)
    .where(eq(customersTable.id, r.customerId));

  let invoiceNumber: string | null = null;
  if (r.invoiceId) {
    const [inv] = await db
      .select({ invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, r.invoiceId));
    invoiceNumber = inv?.invoiceNumber ?? null;
  }

  let usedByInvoiceNumber: string | null = null;
  if ((r as any).usedByInvoiceId) {
    const [inv] = await db
      .select({ invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.id, (r as any).usedByInvoiceId));
    usedByInvoiceNumber = inv?.invoiceNumber ?? null;
  }

  return {
    ...r,
    customerName: customer?.company || customer?.name || "Unknown",
    invoiceNumber,
    usedByInvoiceNumber,
    refundAmount: r.refundAmount != null ? Number(r.refundAmount) : null,
    lineItems: (r.lineItems ?? []) as object[],
  };
}

router.get("/returns-refunds", async (_req, res): Promise<void> => {
  const rows = await db.select().from(returnsTable).orderBy(desc(returnsTable.createdAt));
  res.json(await Promise.all(rows.map(withNames)));
});

router.get("/returns-refunds/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(returnsTable).where(eq(returnsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await withNames(row));
});

router.post("/returns-refunds", async (req, res): Promise<void> => {
  const parsed = CreateReturnBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { refundAmount, refundedAt, invoiceId, lineItems, ...rest } = parsed.data;
  const [row] = await db.insert(returnsTable).values({
    ...rest,
    invoiceId: invoiceId ?? null,
    lineItems: lineItems ?? [],
    refundAmount: refundAmount != null ? String(refundAmount) : null,
    refundedAt: refundedAt ? new Date(refundedAt) : null,
  }).returning();
  res.status(201).json(await withNames(row));
});

router.patch("/returns-refunds/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateReturnBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, any> = {};
  const d = parsed.data;
  if (d.type         !== undefined) updateData.type         = d.type;
  if (d.customerId   !== undefined) updateData.customerId   = d.customerId;
  if (d.invoiceId    !== undefined) updateData.invoiceId    = d.invoiceId ?? null;
  if (d.status       !== undefined) updateData.status       = d.status;
  if (d.reason       !== undefined) updateData.reason       = d.reason ?? null;
  if (d.lineItems    !== undefined) updateData.lineItems    = d.lineItems;
  if (d.refundAmount !== undefined) updateData.refundAmount = d.refundAmount != null ? String(d.refundAmount) : null;
  if (d.refundMethod !== undefined) updateData.refundMethod = d.refundMethod ?? null;
  if (d.refundedAt   !== undefined) updateData.refundedAt   = d.refundedAt ? new Date(d.refundedAt) : null;
  if (d.notes        !== undefined) updateData.notes        = d.notes ?? null;
  if (d.internalNote !== undefined) updateData.internalNote = d.internalNote ?? null;
  // allow clearing usedByInvoiceId if explicitly passed
  if (req.body.usedByInvoiceId !== undefined) updateData.usedByInvoiceId = req.body.usedByInvoiceId ?? null;
  const [row] = await db.update(returnsTable).set(updateData).where(eq(returnsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await withNames(row));
});

// POST /api/returns-refunds/:id/use  — mark a credit as consumed by an invoice
router.post("/returns-refunds/:id/use", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { invoiceId } = req.body as { invoiceId: number };
  if (!invoiceId || isNaN(Number(invoiceId))) { res.status(400).json({ error: "invoiceId required" }); return; }
  const [row] = await db
    .update(returnsTable)
    .set({ usedByInvoiceId: Number(invoiceId) } as any)
    .where(eq(returnsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await withNames(row));
});

router.delete("/returns-refunds/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(returnsTable).where(eq(returnsTable.id, id));
  res.status(204).end();
});

export default router;
