import { Router } from "express";
import { eq, gte, sql, inArray } from "drizzle-orm";
import { db, productsTable, inventoryTable, invoicesTable, customersTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/products", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);
  res.json(products.map(p => ({
    ...p,
    salePrice: Number(p.salePrice),
    costPrice: Number(p.costPrice),
    taxPercent: Number(p.taxPercent),
    discountPercent: Number(p.discountPercent),
  })));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db.insert(productsTable).values({
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    category: parsed.data.category ?? null,
    description: parsed.data.description ?? null,
    salePrice: String(parsed.data.salePrice),
    costPrice: String(parsed.data.costPrice),
    taxPercent: String(parsed.data.taxPercent),
    discountPercent: String(parsed.data.discountPercent),
    discountAmount: parsed.data.discountAmount !== undefined ? String(parsed.data.discountAmount) : "0",
    minOrderQty: parsed.data.minOrderQty ?? 1,
    preferredVendorId: parsed.data.preferredVendorId ?? null,
    isInventoryItem: parsed.data.isInventoryItem ?? true,
    estimatedLeadDays: parsed.data.estimatedLeadDays ?? null,
    optimalStockMin: parsed.data.optimalStockMin ?? null,
    unit: parsed.data.unit ?? null,
    notes: parsed.data.notes ?? null,
    ...(req.body?.quickbooksExtras && typeof req.body.quickbooksExtras === "object"
      ? { quickbooksExtras: req.body.quickbooksExtras }
      : {}),
  }).returning();

  await db.insert(inventoryTable).values({ productId: product.id, quantity: "0", reorderPoint: "10" });

  res.status(201).json({
    ...product,
    salePrice: Number(product.salePrice),
    costPrice: Number(product.costPrice),
    taxPercent: Number(product.taxPercent),
    discountPercent: Number(product.discountPercent),
  });
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({
    ...product,
    salePrice: Number(product.salePrice),
    costPrice: Number(product.costPrice),
    taxPercent: Number(product.taxPercent),
    discountPercent: Number(product.discountPercent),
  });
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.salePrice !== undefined) updateData.salePrice = String(parsed.data.salePrice);
  if (parsed.data.costPrice !== undefined) updateData.costPrice = String(parsed.data.costPrice);
  if (parsed.data.taxPercent !== undefined) updateData.taxPercent = String(parsed.data.taxPercent);
  if (parsed.data.discountPercent !== undefined) updateData.discountPercent = String(parsed.data.discountPercent);
  if (req.body?.quickbooksExtras && typeof req.body.quickbooksExtras === "object") {
    updateData.quickbooksExtras = req.body.quickbooksExtras;
  }

  const [product] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({
    ...product,
    salePrice: Number(product.salePrice),
    costPrice: Number(product.costPrice),
    taxPercent: Number(product.taxPercent),
    discountPercent: Number(product.discountPercent),
  });
});

router.get("/products/:id/analytics", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const months = Math.min(Number(req.query.months ?? 12), 24);

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const invoices = await db.select({
    id: invoicesTable.id,
    customerId: invoicesTable.customerId,
    customerName: sql<string>`${invoicesTable.customerId}`,
    status: invoicesTable.status,
    lineItems: sql<any>`${invoicesTable.lineItems}`,
    createdAt: invoicesTable.createdAt,
  }).from(invoicesTable).where(gte(invoicesTable.createdAt, since));

  const relevantLines: Array<{ invoiceId: number; customerId: number; createdAt: Date; qty: number; price: number; discount: number; discountAmt: number }> = [];
  for (const inv of invoices) {
    if (!Array.isArray(inv.lineItems)) continue;
    for (const li of inv.lineItems) {
      if (Number(li.productId) !== id) continue;
      relevantLines.push({
        invoiceId: inv.id,
        customerId: inv.customerId,
        createdAt: inv.createdAt,
        qty: Number(li.quantity ?? 1),
        price: Number(li.unitPrice ?? li.salePrice ?? 0),
        discount: Number(li.discountPercent ?? 0),
        discountAmt: Number(li.discountAmount ?? 0),
      });
    }
  }

  const totalQty = relevantLines.reduce((s, l) => s + l.qty, 0);
  const totalRevenue = relevantLines.reduce((s, l) => s + l.qty * l.price, 0);
  const uniqueBuyers = new Set(relevantLines.map(l => l.customerId)).size;
  const uniqueInvoices = new Set(relevantLines.map(l => l.invoiceId)).size;
  const avgDiscount = relevantLines.filter(l => l.discount > 0).reduce((s, l) => s + l.discount, 0) / Math.max(1, relevantLines.filter(l => l.discount > 0).length);
  const discountedOrders = relevantLines.filter(l => l.discount > 0 || l.discountAmt > 0).length;

  const periodBreakdown: Record<string, { qty: number; revenue: number; invoices: number; buyers: Set<number> }> = {};
  const now = new Date();
  for (const line of relevantLines) {
    const ageMs = now.getTime() - new Date(line.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    for (const [label, days] of [["1mo", 30], ["3mo", 90], ["6mo", 180], ["12mo", 365]] as [string, number][]) {
      if (ageDays <= days) {
        if (!periodBreakdown[label]) periodBreakdown[label] = { qty: 0, revenue: 0, invoices: 0, buyers: new Set() };
        periodBreakdown[label].qty += line.qty;
        periodBreakdown[label].revenue += line.qty * line.price;
        periodBreakdown[label].buyers.add(line.customerId);
      }
    }
  }

  const breakdown = Object.fromEntries(
    Object.entries(periodBreakdown).map(([k, v]) => [k, { qty: v.qty, revenue: v.revenue, buyers: v.buyers.size }])
  );

  // ── Top customers by units purchased ──────────────────────────────────
  const customerStatsMap = new Map<number, { qty: number; revenue: number }>();
  for (const line of relevantLines) {
    const existing = customerStatsMap.get(line.customerId) ?? { qty: 0, revenue: 0 };
    customerStatsMap.set(line.customerId, {
      qty: existing.qty + line.qty,
      revenue: existing.revenue + line.qty * line.price,
    });
  }

  let topCustomers: { customerId: number; name: string; qty: number; revenue: number }[] = [];
  if (customerStatsMap.size > 0) {
    const customerIds = Array.from(customerStatsMap.keys());
    const customers = await db.select({ id: customersTable.id, name: customersTable.name, company: customersTable.company })
      .from(customersTable)
      .where(inArray(customersTable.id, customerIds));
    const nameMap = new Map(customers.map(c => [c.id, c.company || c.name]));
    topCustomers = Array.from(customerStatsMap.entries())
      .map(([customerId, stats]) => ({
        customerId,
        name: nameMap.get(customerId) ?? `Customer #${customerId}`,
        qty: stats.qty,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.qty - a.qty);
  }

  res.json({ totalQty, totalRevenue, uniqueBuyers, uniqueInvoices, avgDiscount, discountedOrders, months, breakdown, topCustomers });
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, params.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
