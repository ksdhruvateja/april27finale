import { Router } from "express";
import { eq, desc, not, and } from "drizzle-orm";
import {
  db, invoicesTable, billsTable, expensesTable,
  customersTable, vendorsTable, productsTable, inventoryTable,
} from "@workspace/db";

const router = Router();

function num(v: string | number | null | undefined) { return Number(v ?? 0); }

router.get("/accounting/general-ledger", async (_req, res): Promise<void> => {
  const [invoices, bills, expenses] = await Promise.all([
    db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt)),
    db.select().from(billsTable).orderBy(desc(billsTable.createdAt)),
    db.select().from(expensesTable).orderBy(desc(expensesTable.date)),
  ]);

  const customerMap: Record<number, string> = {};
  const cs = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  cs.forEach(c => { customerMap[c.id] = c.name; });

  const vendorMap: Record<number, string> = {};
  const vs = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  vs.forEach(v => { vendorMap[v.id] = v.name; });

  const entries: object[] = [];

  // Helper: parse early pay discount amount from paymentNote
  // Format written by /pay route: "Early pay discount: 5%—$250.00 | …"
  function parseEarlyDiscount(note: string | null | undefined): number {
    if (!note) return 0;
    const m = note.match(/Early pay discount:[^$]*\$([0-9]+(?:\.[0-9]+)?)/);
    return m ? Number(m[1]) : 0;
  }

  for (const inv of invoices) {
    const earlyDisc = parseEarlyDiscount(inv.paymentNote);
    // For the debit (AR entry) we show the gross amount before the early-pay discount
    // so readers can reconcile. The gross = stored total + early discount.
    const grossTotal = num(inv.total) + (inv.status === "paid" ? earlyDisc : 0);

    entries.push({
      id: `INV-${inv.id}`,
      date: inv.createdAt,
      type: "invoice",
      description: `Invoice to ${customerMap[inv.customerId] ?? "Customer #" + inv.customerId}`,
      party: customerMap[inv.customerId] ?? null,
      debit: grossTotal,
      credit: 0,
      balance: grossTotal,
      status: inv.status,
      ref: inv.invoiceNumber ?? `INV-${inv.id.toString().padStart(4, "0")}`,
    });
    if (inv.status === "paid") {
      // Early pay discount entry (reduces AR — treated as a contra-revenue adjustment)
      if (earlyDisc > 0) {
        entries.push({
          id: `INV-DISC-${inv.id}`,
          date: inv.paidAt ?? inv.createdAt,
          type: "early_pay_discount",
          description: `Early pay discount – ${customerMap[inv.customerId] ?? "Customer"}`,
          party: customerMap[inv.customerId] ?? null,
          debit: 0,
          credit: earlyDisc,
          balance: -earlyDisc,
          status: "paid",
          ref: inv.invoiceNumber ?? `INV-${inv.id.toString().padStart(4, "0")}`,
          discountAmount: earlyDisc,
        });
      }
      // Cash receipt for the net amount actually collected
      const methodLabel: Record<string, string> = {
        cash: "Cash", stripe: "Credit Card", bank_transfer: "Bank Transfer", check: "Check",
      };
      entries.push({
        id: `INV-PAY-${inv.id}`,
        date: inv.paidAt ?? inv.createdAt,
        type: "payment_received",
        description: `Payment received – ${customerMap[inv.customerId] ?? "Customer"}`,
        party: customerMap[inv.customerId] ?? null,
        debit: 0,
        credit: num(inv.total),
        balance: -num(inv.total),
        status: "paid",
        ref: inv.invoiceNumber ?? `INV-${inv.id.toString().padStart(4, "0")}`,
        paymentMethod: inv.paymentMethod ?? null,
        paymentMethodLabel: inv.paymentMethod ? (methodLabel[inv.paymentMethod] ?? inv.paymentMethod) : null,
        paymentNote: inv.paymentNote ?? null,
      });
    }
  }

  for (const bill of bills) {
    entries.push({
      id: `BILL-${bill.id}`,
      date: bill.createdAt,
      type: "bill",
      description: `Bill from ${vendorMap[bill.vendorId] ?? "Vendor #" + bill.vendorId}`,
      party: vendorMap[bill.vendorId] ?? null,
      debit: 0,
      credit: num(bill.total),
      balance: -num(bill.total),
      status: bill.status,
      ref: `BILL-${bill.id.toString().padStart(4, "0")}`,
    });
    if (bill.status === "paid") {
      entries.push({
        id: `BILL-PAY-${bill.id}`,
        date: bill.paidAt ?? bill.createdAt,
        type: "payment_made",
        description: `Payment made – ${vendorMap[bill.vendorId] ?? "Vendor"}`,
        party: vendorMap[bill.vendorId] ?? null,
        debit: num(bill.total),
        credit: 0,
        balance: num(bill.total),
        status: "paid",
        ref: `BILL-${bill.id.toString().padStart(4, "0")}`,
      });
    }
  }

  for (const exp of expenses) {
    entries.push({
      id: `EXP-${exp.id}`,
      date: exp.date,
      type: "expense",
      description: exp.description,
      party: exp.vendorId ? (vendorMap[exp.vendorId] ?? null) : null,
      debit: 0,
      credit: num(exp.amount),
      balance: -num(exp.amount),
      status: "recorded",
      ref: exp.reference ?? `EXP-${exp.id.toString().padStart(4, "0")}`,
      category: exp.category,
    });
  }

  entries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  res.json(entries);
});

router.get("/accounting/ar-aging", async (_req, res): Promise<void> => {
  const now = new Date();
  const invoices = await db.select().from(invoicesTable).where(and(not(eq(invoicesTable.status, "paid")), not(eq(invoicesTable.status, "cancelled"))));
  const customerMap: Record<number, string> = {};
  const cs = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  cs.forEach(c => { customerMap[c.id] = c.name; });

  const rows = invoices.map(inv => {
    const due = inv.dueDate ? new Date(inv.dueDate) : null;
    const daysOverdue = due ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0;
    const bucket = !due ? "current"
      : daysOverdue <= 0 ? "current"
      : daysOverdue <= 30 ? "1-30"
      : daysOverdue <= 60 ? "31-60"
      : daysOverdue <= 90 ? "61-90"
      : "90+";
    return {
      id: inv.id,
      ref: inv.invoiceNumber ?? `INV-${inv.id.toString().padStart(4, "0")}`,
      customer: customerMap[inv.customerId] ?? "Unknown",
      total: num(inv.total),
      dueDate: inv.dueDate,
      daysOverdue: Math.max(0, daysOverdue),
      bucket,
      status: inv.status,
    };
  });
  res.json(rows);
});

router.get("/accounting/ap-aging", async (_req, res): Promise<void> => {
  const now = new Date();
  const bills = await db.select().from(billsTable).where(and(not(eq(billsTable.status, "paid")), not(eq(billsTable.status, "cancelled"))));
  const vendorMap: Record<number, string> = {};
  const vs = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  vs.forEach(v => { vendorMap[v.id] = v.name; });

  const rows = bills.map(bill => {
    const due = bill.dueDate ? new Date(bill.dueDate) : null;
    const daysOverdue = due ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0;
    const bucket = !due ? "current"
      : daysOverdue <= 0 ? "current"
      : daysOverdue <= 30 ? "1-30"
      : daysOverdue <= 60 ? "31-60"
      : daysOverdue <= 90 ? "61-90"
      : "90+";
    return {
      id: bill.id,
      ref: `BILL-${bill.id.toString().padStart(4, "0")}`,
      vendor: vendorMap[bill.vendorId] ?? "Unknown",
      total: num(bill.total),
      dueDate: bill.dueDate,
      daysOverdue: Math.max(0, daysOverdue),
      bucket,
      status: bill.status,
    };
  });
  res.json(rows);
});

router.get("/accounting/pnl", async (_req, res): Promise<void> => {
  const [paidInvoices, paidBills, allExpenses] = await Promise.all([
    db.select().from(invoicesTable).where(eq(invoicesTable.status, "paid")),
    db.select().from(billsTable).where(eq(billsTable.status, "paid")),
    db.select().from(expensesTable),
  ]);

  const revenue = paidInvoices.reduce((s, i) => s + num(i.total), 0);
  const cogs = paidBills.reduce((s, b) => s + num(b.total), 0);
  const expenses = allExpenses.reduce((s, e) => s + num(e.amount), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;

  const byMonth: Record<string, { revenue: number; cogs: number; expenses: number }> = {};
  const ensureMonth = (k: string) => { if (!byMonth[k]) byMonth[k] = { revenue: 0, cogs: 0, expenses: 0 }; };

  for (const inv of paidInvoices) {
    const k = inv.paidAt ? inv.paidAt.toISOString().slice(0, 7) : inv.createdAt.toISOString().slice(0, 7);
    ensureMonth(k);
    byMonth[k].revenue += num(inv.total);
  }
  for (const bill of paidBills) {
    const k = bill.paidAt ? bill.paidAt.toISOString().slice(0, 7) : bill.createdAt.toISOString().slice(0, 7);
    ensureMonth(k);
    byMonth[k].cogs += num(bill.total);
  }
  for (const exp of allExpenses) {
    const k = exp.date.toISOString().slice(0, 7);
    ensureMonth(k);
    byMonth[k].expenses += num(exp.amount);
  }

  const months = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, grossProfit: v.revenue - v.cogs, netProfit: v.revenue - v.cogs - v.expenses }));

  res.json({ revenue, cogs, expenses, grossProfit, netProfit, months });
});

router.get("/accounting/customer-revenue", async (_req, res): Promise<void> => {
  const invoices = await db.select().from(invoicesTable);
  const customers = await db.select().from(customersTable);
  const cMap: Record<number, { name: string; revenue: number; paid: number; outstanding: number; invoiceCount: number }> = {};
  for (const c of customers) {
    cMap[c.id] = { name: c.name, revenue: 0, paid: 0, outstanding: 0, invoiceCount: 0 };
  }
  for (const inv of invoices) {
    if (!cMap[inv.customerId]) continue;
    cMap[inv.customerId].invoiceCount++;
    cMap[inv.customerId].revenue += num(inv.total);
    if (inv.status === "paid") cMap[inv.customerId].paid += num(inv.total);
    else cMap[inv.customerId].outstanding += num(inv.total);
  }
  const rows = Object.values(cMap)
    .filter(r => r.invoiceCount > 0)
    .sort((a, b) => b.revenue - a.revenue);
  res.json(rows);
});

router.get("/accounting/product-profit", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable);
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.status, "paid"));
  const inv = await db.select().from(inventoryTable);

  const invMap: Record<number, number> = {};
  inv.forEach(i => { invMap[i.productId] = Number(i.quantity ?? 0); });

  const pMap: Record<number, { name: string; sku: string | null; salePrice: number; costPrice: number; sold: number; revenue: number; cogs: number; profit: number; stockQty: number }> = {};
  for (const p of products) {
    pMap[p.id] = {
      name: p.name,
      sku: p.sku,
      salePrice: num(p.salePrice),
      costPrice: num(p.costPrice),
      sold: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
      stockQty: invMap[p.id] ?? 0,
    };
  }

  for (const invoice of invoices) {
    const items = invoice.lineItems as Array<{ productId?: number; quantity: number; unitPrice: number }>;
    for (const item of items) {
      if (!item.productId || !pMap[item.productId]) continue;
      const p = pMap[item.productId];
      p.sold += item.quantity;
      p.revenue += item.quantity * item.unitPrice;
      p.cogs += item.quantity * p.costPrice;
      p.profit = p.revenue - p.cogs;
    }
  }

  const rows = Object.values(pMap)
    .filter(p => p.sold > 0)
    .sort((a, b) => b.revenue - a.revenue);
  res.json(rows);
});

export default router;
