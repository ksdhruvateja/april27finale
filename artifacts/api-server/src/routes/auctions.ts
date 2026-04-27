import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, auctionsTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const AuctionBody = z.object({
  projectName: z.string().min(1),
  bidAmount: z.number().optional().default(0),
  costAmount: z.number().optional().default(0),
  invoiceId: z.number().nullable().optional(),
  linkedInvoiceIds: z.array(z.number()).optional().default([]),
  purchaseOrderIds: z.array(z.number()).optional().default([]),
  shipmentIds: z.array(z.number()).optional().default([]),
  billIds: z.array(z.number()).optional().default([]),
  notes: z.string().optional().default(""),
});

const AuctionPatch = AuctionBody.partial();

function toNumber(v: unknown): number { return typeof v === "string" ? parseFloat(v) : Number(v ?? 0); }
function toArr(v: unknown): number[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(Number).filter(n => Number.isFinite(n));
  return [];
}

function serialize(row: typeof auctionsTable.$inferSelect) {
  return {
    id: row.id,
    projectName: row.projectName,
    bidAmount: toNumber(row.bidAmount),
    costAmount: toNumber(row.costAmount),
    invoiceId: row.invoiceId ?? null,
    linkedInvoiceIds: toArr(row.linkedInvoiceIds),
    purchaseOrderIds: toArr(row.purchaseOrderIds),
    shipmentIds: toArr(row.shipmentIds),
    billIds: toArr(row.billIds),
    notes: row.notes ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/auctions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(auctionsTable).orderBy(desc(auctionsTable.createdAt));
  res.json(rows.map(serialize));
});

router.get("/auctions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Auction not found" }); return; }
  res.json(serialize(row));
});

router.post("/auctions", async (req, res): Promise<void> => {
  const parsed = AuctionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(auctionsTable).values({
    projectName: d.projectName,
    bidAmount: String(d.bidAmount ?? 0),
    costAmount: String(d.costAmount ?? 0),
    invoiceId: d.invoiceId ?? null,
    linkedInvoiceIds: d.linkedInvoiceIds ?? [],
    purchaseOrderIds: d.purchaseOrderIds ?? [],
    shipmentIds: d.shipmentIds ?? [],
    billIds: d.billIds ?? [],
    notes: d.notes ?? "",
  }).returning();
  res.status(201).json(serialize(row));
});

router.patch("/auctions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AuctionPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const upd: Record<string, unknown> = {};
  if (d.projectName !== undefined) upd.projectName = d.projectName;
  if (d.bidAmount !== undefined) upd.bidAmount = String(d.bidAmount);
  if (d.costAmount !== undefined) upd.costAmount = String(d.costAmount);
  if ("invoiceId" in d) upd.invoiceId = d.invoiceId ?? null;
  if (d.linkedInvoiceIds !== undefined) upd.linkedInvoiceIds = d.linkedInvoiceIds;
  if (d.purchaseOrderIds !== undefined) upd.purchaseOrderIds = d.purchaseOrderIds;
  if (d.shipmentIds !== undefined) upd.shipmentIds = d.shipmentIds;
  if (d.billIds !== undefined) upd.billIds = d.billIds;
  if (d.notes !== undefined) upd.notes = d.notes;
  const [row] = await db.update(auctionsTable).set(upd).where(eq(auctionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Auction not found" }); return; }
  res.json(serialize(row));
});

router.delete("/auctions/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(auctionsTable).where(eq(auctionsTable.id, id));
  res.status(204).send();
});

export default router;
