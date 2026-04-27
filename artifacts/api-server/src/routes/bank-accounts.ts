import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, bankAccountsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const CreateBody = z.object({
  name: z.string().min(1),
  accountType: z.enum(["checking", "savings", "credit", "cash", "other"]).default("checking"),
  bankName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  routingNumber: z.string().optional().nullable(),
  openingBalance: z.number().default(0),
  currentBalance: z.number().default(0),
  currency: z.string().default("USD"),
  isActive: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

const UpdateBody = CreateBody.partial();

function format(row: typeof bankAccountsTable.$inferSelect) {
  return { ...row, openingBalance: Number(row.openingBalance), currentBalance: Number(row.currentBalance) };
}

router.get("/bank-accounts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(bankAccountsTable).orderBy(bankAccountsTable.createdAt);
  res.json(rows.map(format));
});

router.post("/bank-accounts", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(bankAccountsTable).values({
    name: d.name,
    accountType: d.accountType,
    bankName: d.bankName ?? null,
    accountNumber: d.accountNumber ?? null,
    routingNumber: d.routingNumber ?? null,
    openingBalance: String(d.openingBalance),
    currentBalance: String(d.currentBalance),
    currency: d.currency,
    isActive: d.isActive,
    notes: d.notes ?? null,
  }).returning();
  res.status(201).json(format(row));
});

router.patch("/bank-accounts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.accountType !== undefined) updates.accountType = d.accountType;
  if (d.bankName !== undefined) updates.bankName = d.bankName;
  if (d.accountNumber !== undefined) updates.accountNumber = d.accountNumber;
  if (d.routingNumber !== undefined) updates.routingNumber = d.routingNumber;
  if (d.openingBalance !== undefined) updates.openingBalance = String(d.openingBalance);
  if (d.currentBalance !== undefined) updates.currentBalance = String(d.currentBalance);
  if (d.currency !== undefined) updates.currency = d.currency;
  if (d.isActive !== undefined) updates.isActive = d.isActive;
  if (d.notes !== undefined) updates.notes = d.notes;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [row] = await db.update(bankAccountsTable).set(updates).where(eq(bankAccountsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(format(row));
});

router.delete("/bank-accounts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(bankAccountsTable).where(eq(bankAccountsTable.id, id));
  res.status(204).send();
});

export default router;
