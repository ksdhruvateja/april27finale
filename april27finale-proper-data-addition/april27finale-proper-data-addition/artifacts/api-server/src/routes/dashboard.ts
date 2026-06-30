import { Router } from "express";
import { eq, and, lt, gte, count, sum, inArray, not, or, desc, isNull } from "drizzle-orm";
import { db, invoicesTable, billsTable, customersTable, vendorsTable, productsTable, inventoryTable } from "@workspace/db";

const router = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const now = new Date();

  const [
    customers,
    vendors,
    products,
    inventory,
    paidInvoices,
    paidBills,
    arDueInvoices,
    arOverdueInvoices,
    apDueBills,
    apOverdueBills,
    recentInvoicesRaw,
    recentBillsRaw,
  ] = await Promise.all([
    db.select({ count: count() }).from(customersTable),
    db.select({ count: count() }).from(vendorsTable),
    db.select({ count: count() }).from(productsTable),
    db.select().from(inventoryTable),
    db.select({ total: sum(invoicesTable.total) }).from(invoicesTable).where(eq(invoicesTable.status, "paid")),
    db.select({ total: sum(billsTable.total) }).from(billsTable).where(eq(billsTable.status, "paid")),
    // AR Due: unpaid invoices with future/no due date
    db.select({ total: sum(invoicesTable.total) }).from(invoicesTable).where(
      and(
        not(eq(invoicesTable.status, "paid")),
        not(eq(invoicesTable.status, "cancelled")),
        or(gte(invoicesTable.dueDate, now), isNull(invoicesTable.dueDate))
      )
    ),
    // AR Overdue: unpaid invoices with past due date
    db.select({ total: sum(invoicesTable.total), cnt: count() }).from(invoicesTable).where(
      and(
        not(eq(invoicesTable.status, "paid")),
        not(eq(invoicesTable.status, "cancelled")),
        lt(invoicesTable.dueDate, now)
      )
    ),
    // AP Due: unpaid bills with future/no due date
    db.select({ total: sum(billsTable.total) }).from(billsTable).where(
      and(
        not(eq(billsTable.status, "paid")),
        not(eq(billsTable.status, "cancelled")),
        or(gte(billsTable.dueDate, now), isNull(billsTable.dueDate))
      )
    ),
    // AP Overdue: unpaid bills with past due date
    db.select({ total: sum(billsTable.total), cnt: count() }).from(billsTable).where(
      and(
        not(eq(billsTable.status, "paid")),
        not(eq(billsTable.status, "cancelled")),
        lt(billsTable.dueDate, now)
      )
    ),
    db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt)).limit(5),
    db.select().from(billsTable).orderBy(desc(billsTable.createdAt)).limit(5),
  ]);

  const [customerRows, vendorRows] = await Promise.all([
    recentInvoicesRaw.length > 0
      ? db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable).where(inArray(customersTable.id, [...new Set(recentInvoicesRaw.map(i => i.customerId))]))
      : [],
    recentBillsRaw.length > 0
      ? db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(inArray(vendorsTable.id, [...new Set(recentBillsRaw.map(b => b.vendorId))]))
      : [],
  ]);

  const cmap = new Map((customerRows as { id: number; name: string }[]).map(c => [c.id, c.name]));
  const vmap = new Map((vendorRows as { id: number; name: string }[]).map(v => [v.id, v.name]));

  const recentInvoices = recentInvoicesRaw.map(inv => ({ ...inv, customerName: cmap.get(inv.customerId) ?? "Unknown", lineItems: inv.lineItems as object[], subtotal: Number(inv.subtotal), taxTotal: Number(inv.taxTotal), discountTotal: Number(inv.discountTotal), total: Number(inv.total) }));
  const recentBills = recentBillsRaw.map(bill => ({ ...bill, vendorName: vmap.get(bill.vendorId) ?? "Unknown", lineItems: bill.lineItems as object[], subtotal: Number(bill.subtotal), taxTotal: Number(bill.taxTotal), total: Number(bill.total) }));

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
