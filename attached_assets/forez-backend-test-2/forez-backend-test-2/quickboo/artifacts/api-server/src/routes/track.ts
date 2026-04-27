import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, invoicesTable, quotesTable, purchaseOrdersTable, shipmentsTable, customersTable, vendorsTable } from "@workspace/db";

const router = Router();

router.get("/track/:ref", async (req, res): Promise<void> => {
  const ref = (req.params as any).ref as string;
  if (!ref || ref.trim().length < 2) { res.status(400).json({ error: "Reference too short" }); return; }

  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.trackingNumber, ref));
  if (invoices.length === 0) { res.status(404).json({ error: "No documents found for this reference" }); return; }

  const results = await Promise.all(invoices.map(async inv => {
    const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, inv.customerId));

    let quote = null;
    if (inv.quoteId) {
      const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, inv.quoteId));
      if (q) {
        const [qCustomer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, q.customerId));
        quote = { ...q, customerName: qCustomer?.name ?? "Unknown", total: Number(q.total) };
      }
    }

    const pos = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.sourceInvoiceId, inv.id));
    const purchaseOrders = await Promise.all(pos.map(async po => {
      const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, po.vendorId));
      return { ...po, vendorName: vendor?.name ?? "Unknown", total: Number(po.total) };
    }));

    const shipmentRows = await db.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, inv.id));
    const shipments = await Promise.all(shipmentRows.map(async s => {
      const [sCustomer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, s.customerId));
      return { ...s, customerName: sCustomer?.name ?? "Unknown" };
    }));

    return {
      invoice: { ...inv, customerName: customer?.name ?? "Unknown", total: Number(inv.total), invoiceNumber: inv.invoiceNumber ?? null },
      quote,
      purchaseOrders,
      shipments,
    };
  }));

  res.json(results);
});

export default router;
