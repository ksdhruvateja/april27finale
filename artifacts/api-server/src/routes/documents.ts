import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { documentsTable, insertDocumentSchema } from "@workspace/db/schema";
import { eq, desc, like, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/documents", async (req: Request, res: Response) => {
  try {
    const { search, category } = req.query as Record<string, string>;
    let query = db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt)) as any;
    const docs = await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));
    let filtered = docs;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(s) ||
        (d.description ?? "").toLowerCase().includes(s) ||
        (d.category ?? "").toLowerCase().includes(s)
      );
    }
    if (category && category !== "all") {
      filtered = filtered.filter(d => d.category === category);
    }
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/documents/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: "Failed to get document" });
  }
});

router.post("/documents", async (req: Request, res: Response) => {
  const parsed = insertDocumentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data", issues: parsed.error.issues }); return; }
  try {
    const [doc] = await db.insert(documentsTable).values(parsed.data).returning();
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: "Failed to create document" });
  }
});

router.patch("/documents/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const allowed = z.object({
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      starred: z.boolean().optional(),
    }).parse(req.body);
    const [doc] = await db.update(documentsTable).set(allowed).where(eq(documentsTable.id, id)).returning();
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.delete("/documents/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
