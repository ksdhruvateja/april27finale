import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, expensesTable, vendorsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const CreateExpenseBody = z.object({
  date: z.string().optional(),
  description: z.string().min(1),
  category: z.string().optional().nullable(),
  amount: z.number().positive(),
  vendorId: z.number().int().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  bankAccountId: z.number().int().optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const UpdateExpenseBody = CreateExpenseBody.partial();

async function withVendorName(exp: typeof expensesTable.$inferSelect) {
  let vendorName: string | null = null;
  if (exp.vendorId) {
    const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, exp.vendorId));
    vendorName = v?.name ?? null;
  }
  return { ...exp, amount: Number(exp.amount), vendorName };
}

router.get("/expenses", async (_req, res): Promise<void> => {
  const rows = await db.select().from(expensesTable).orderBy(desc(expensesTable.date));
  res.json(await Promise.all(rows.map(withVendorName)));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(expensesTable).values({
    date: d.date ? new Date(d.date) : new Date(),
    description: d.description,
    category: d.category ?? null,
    amount: String(d.amount),
    vendorId: d.vendorId ?? null,
    paymentMethod: d.paymentMethod ?? null,
    bankAccountId: d.bankAccountId ?? null,
    reference: d.reference ?? null,
    notes: d.notes ?? null,
  }).returning();
  res.status(201).json(await withVendorName(row));
});

router.get("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(await withVendorName(row));
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: any = {};
  if (d.date !== undefined) updates.date = new Date(d.date!);
  if (d.description !== undefined) updates.description = d.description;
  if (d.category !== undefined) updates.category = d.category;
  if (d.amount !== undefined) updates.amount = String(d.amount);
  if (d.vendorId !== undefined) updates.vendorId = d.vendorId;
  if (d.paymentMethod !== undefined) updates.paymentMethod = d.paymentMethod;
  if (d.bankAccountId !== undefined) updates.bankAccountId = d.bankAccountId;
  if (d.reference !== undefined) updates.reference = d.reference;
  if (d.notes !== undefined) updates.notes = d.notes;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [row] = await db.update(expensesTable).set(updates).where(eq(expensesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json(await withVendorName(row));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.status(204).send();
});

export default router;
