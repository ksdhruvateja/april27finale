import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, billsTable, vendorsTable, bankAccountsTable } from "@workspace/db";
import {
  CreateBillBody,
  UpdateBillBody,
  GetBillParams,
  UpdateBillParams,
  DeleteBillParams,
  PayBillParams,
  PayBillBody,
} from "@workspace/api-zod";
import * as dwolla from "../services/dwolla.js";
import * as checkeeper from "../services/checkeeper.js";

const router = Router();

function calcTotals(lineItems: Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>) {
  let subtotal = 0, taxTotal = 0;
  for (const item of lineItems) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const disc = lineSubtotal * (item.discountPercent / 100);
    subtotal += lineSubtotal;
    taxTotal += (lineSubtotal - disc) * (item.taxPercent / 100);
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

async function withVendorName(bill: typeof billsTable.$inferSelect) {
  const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, bill.vendorId));
  return { ...bill, vendorName: vendor?.name ?? "Unknown", lineItems: bill.lineItems as object[], subtotal: Number(bill.subtotal), taxTotal: Number(bill.taxTotal), total: Number(bill.total) };
}

router.get("/bills", async (_req, res): Promise<void> => {
  const bills = await db.select().from(billsTable).orderBy(billsTable.createdAt);
  if (bills.length === 0) { res.json([]); return; }
  const ids = [...new Set(bills.map(b => b.vendorId))];
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(inArray(vendorsTable.id, ids));
  const vmap = new Map(vendors.map(v => [v.id, v.name]));
  res.json(bills.map(b => ({ ...b, vendorName: vmap.get(b.vendorId) ?? "Unknown", lineItems: b.lineItems as object[], subtotal: Number(b.subtotal), taxTotal: Number(b.taxTotal), total: Number(b.total) })));
});

router.post("/bills", async (req, res): Promise<void> => {
  const parsed = CreateBillBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
  const [bill] = await db.insert(billsTable).values({
    vendorId: parsed.data.vendorId,
    purchaseOrderId: parsed.data.purchaseOrderId ?? null,
    status: parsed.data.status ?? "draft",
    lineItems: parsed.data.lineItems,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    total: String(totals.total),
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    notes: parsed.data.notes ?? null,
    internalNote: req.body.internalNote ?? null,
  }).returning();
  res.status(201).json(await withVendorName(bill));
});

router.get("/bills/:id", async (req, res): Promise<void> => {
  const params = GetBillParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, params.data.id));
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  res.json(await withVendorName(bill));
});

router.patch("/bills/:id", async (req, res): Promise<void> => {
  const params = UpdateBillParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBillBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.vendorId !== undefined) updateData.vendorId = parsed.data.vendorId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (req.body.internalNote !== undefined) updateData.internalNote = req.body.internalNote;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.lineItems !== undefined) {
    const totals = calcTotals(parsed.data.lineItems as Array<{ quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>);
    updateData.lineItems = parsed.data.lineItems;
    updateData.subtotal = String(totals.subtotal);
    updateData.taxTotal = String(totals.taxTotal);
    updateData.total = String(totals.total);
  }
  const [bill] = await db.update(billsTable).set(updateData).where(eq(billsTable.id, params.data.id)).returning();
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  res.json(await withVendorName(bill));
});

router.delete("/bills/:id", async (req, res): Promise<void> => {
  const params = DeleteBillParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [bill] = await db.delete(billsTable).where(eq(billsTable.id, params.data.id)).returning();
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  res.sendStatus(204);
});

router.post("/bills/:id/pay", async (req, res): Promise<void> => {
  const params = PayBillParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = PayBillBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  let externalTxId: string | null = null;
  let externalTxStatus: string | null = null;

  if (d.paymentMethod === "ach" && dwolla.isConfigured() && d.destRoutingNumber && d.destAccountNumber) {
    try {
      const [existingBill] = await db.select().from(billsTable).where(eq(billsTable.id, params.data.id));
      const result = await dwolla.initiateAchTransfer({
        amount: Number(existingBill?.total ?? 0),
        destRoutingNumber: d.destRoutingNumber,
        destAccountNumber: d.destAccountNumber,
        destName: d.destAccountName ?? "Vendor",
        note: d.paymentNote ?? undefined,
      });
      externalTxId = result.transferId;
      externalTxStatus = result.status;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Dwolla ACH transfer failed: ${msg}` });
      return;
    }
  }

  if (d.paymentMethod === "check" && d.sendViaCheckeeper && checkeeper.isConfigured()) {
    const [existingBill] = await db.select().from(billsTable).where(eq(billsTable.id, params.data.id));
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, existingBill?.vendorId ?? 0));
    const bankAccountId = d.bankAccountId;
    let bankAccount: { routingNumber: string | null; accountNumber: string | null } | undefined;
    if (bankAccountId) {
      const [ba] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, bankAccountId));
      bankAccount = ba;
    }
    try {
      const result = await checkeeper.submitCheck({
        payTo: vendor?.name ?? "Vendor",
        amount: Number(existingBill?.total ?? 0),
        date: d.checkDate ? new Date(d.checkDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        checkNumber: d.checkNumber ?? "1001",
        memo: d.paymentNote ?? `Bill BILL-${String(params.data.id).padStart(4, "0")}`,
        routingNumber: bankAccount?.routingNumber ?? "",
        accountNumber: bankAccount?.accountNumber ?? "",
        payerName: "Forez Corp",
        payeeAddress: d.payeeAddress ?? undefined,
      });
      externalTxId = result.checkId;
      externalTxStatus = result.status;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Checkeeper submission failed: ${msg}` });
      return;
    }
  }

  const [bill] = await db.update(billsTable).set({
    status: "paid",
    paymentMethod: d.paymentMethod,
    paymentNote: d.paymentNote ?? null,
    paidAt: new Date(),
    bankAccountId: d.bankAccountId ?? null,
    checkNumber: d.checkNumber ?? null,
    checkDate: d.checkDate ? new Date(d.checkDate) : null,
    externalTxId,
    externalTxStatus,
  }).where(eq(billsTable.id, params.data.id)).returning();
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  res.json({ ...(await withVendorName(bill)), externalTxId, externalTxStatus });
});

export default router;
