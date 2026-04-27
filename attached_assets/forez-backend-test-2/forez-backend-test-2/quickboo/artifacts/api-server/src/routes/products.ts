import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable, inventoryTable } from "@workspace/db";
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
    unit: parsed.data.unit ?? null,
    notes: parsed.data.notes ?? null,
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
