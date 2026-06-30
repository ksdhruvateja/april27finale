import { Router } from "express";
import { eq, and, lt, gte, count, sum } from "drizzle-orm";
import { db, invoicesTable, billsTable, customersTable, vendorsTable, productsTable, inventoryTable } from "@workspace/db";

const router = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const now = new Date();

  const [customers, vendors, products, inventory] = await Promise.all([
    db.select({ count: count() }).from(customersTable),
    db.select({ count: count() }).from(vendorsTable),
    db.select({ count: count() }).from(productsTable),
    db.select().from(inventoryTable),
  ]);

  const paidInvoices = await db.select({ total: sum(invoicesTable.total) }).from(invoicesTable).where(eq(invoicesTable.status, "paid"));
  const paidBills = await db.select({ total: sum(billsTable.total) }).from(billsTable).where(eq(billsTable.status, "paid"));

  const arDueInvoices = await db.select({ total: sum(invoicesTable.total) }).from(invoicesTable).where(and(eq(invoicesTable.status, "sent"), gte(invoicesTable.dueDate, now)));
  const arOverdueInvoices = await db.select({ total: sum(invoicesTable.total), cnt: count() }).from(invoicesTable).where(and(eq(invoicesTable.status, "sent"), lt(invoicesTable.dueDate, now)));

  const apDueBills = await db.select({ total: sum(billsTable.total) }).from(billsTable).where(and(eq(billsTable.status, "received"), gte(billsTable.dueDate, now)));
  const apOverdueBills = await db.select({ total: sum(billsTable.total), cnt: count() }).from(billsTable).where(and(eq(billsTable.status, "received"), lt(billsTable.dueDate, now)));

  const recentInvoicesRaw = await db.select().from(invoicesTable).orderBy(invoicesTable.createdAt).limit(5);
  const recentBillsRaw = await db.select().from(billsTable).orderBy(billsTable.createdAt).limit(5);

  async function enrichInvoice(inv: typeof invoicesTable.$inferSelect) {
    const [customer] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, inv.customerId));
    return { ...inv, customerName: customer?.name ?? "Unknown", lineItems: inv.lineItems as object[], subtotal: Number(inv.subtotal), taxTotal: Number(inv.taxTotal), discountTotal: Number(inv.discountTotal), total: Number(inv.total) };
  }

  async function enrichBill(bill: typeof billsTable.$inferSelect) {
    const [vendor] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, bill.vendorId));
    return { ...bill, vendorName: vendor?.name ?? "Unknown", lineItems: bill.lineItems as object[], subtotal: Number(bill.subtotal), taxTotal: Number(bill.taxTotal), total: Number(bill.total) };
  }

  const [recentInvoices, recentBills] = await Promise.all([
    Promise.all(recentInvoicesRaw.map(enrichInvoice)),
    Promise.all(recentBillsRaw.map(enrichBill)),
  ]);

  const lowStockCount = inventory.filter(i => Number(i.quantity) <= Number(i.reorderPoint)).length;

  res.json({
    cashIn: Number(paidInvoices[0]?.total ?? 0),
    cashOut: Number(paidBills[0]?.total ?? 0),
    arDue: Number(arDueInvoices[0]?.total ?? 0),
    arOverdue: Number(arOverdueInvoices[0]?.total ?? 0),
    apDue: Number(apDueBills[0]?.total ?? 0),
    apOverdue: Number(apOverdueBills[0]?.total ?? 0),
    overdueInvoiceCount: arOverdueInvoices[0]?.cnt ?? 0,
    unpaidBillCount: apOverdueBills[0]?.cnt ?? 0,
    totalCustomers: customers[0]?.count ?? 0,
    totalVendors: vendors[0]?.count ?? 0,
    totalProducts: products[0]?.count ?? 0,
    lowStockCount,
    recentInvoices,
    recentBills,
  });
});

export default router;
