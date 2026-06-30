import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { documentsTable, insertDocumentSchema } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  isLocalStorageMode,
  createLocalReadStream,
  localFileExists,
  deleteLocalFile,
} from "../lib/localFileStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function contentDispositionFilename(name: string): string {
  const safe = name.replace(/[^\w.\-() ]+/g, "_");
  return `filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function streamDocumentFile(
  doc: typeof documentsTable.$inferSelect,
  res: Response,
  disposition: "inline" | "attachment",
) {
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `${disposition}; ${contentDispositionFilename(doc.originalName)}`);

  if (isLocalStorageMode()) {
    if (!(await localFileExists(doc.objectPath))) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }
    createLocalReadStream(doc.objectPath).pipe(res);
    return;
  }

  const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
  const response = await objectStorageService.downloadObject(objectFile);
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-disposition") {
      res.setHeader(key, value);
    }
  });
  if (response.body) {
    const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
    nodeStream.pipe(res);
  } else {
    res.end();
  }
}

router.get("/documents", async (req: Request, res: Response) => {
  try {
    const { search, category } = req.query as Record<string, string>;
    const docs = await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));
    let filtered = docs;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(s) ||
        d.originalName.toLowerCase().includes(s) ||
        (d.description ?? "").toLowerCase().includes(s) ||
        (d.category ?? "").toLowerCase().includes(s)
      );
    }
    if (category && category !== "all") {
      filtered = filtered.filter(d => d.category === category);
    }
    res.json(filtered);
  } catch (e) {
    req.log.error({ err: e }, "Failed to list documents");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/documents/:id/download", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    await streamDocumentFile(doc, res, "attachment");
  } catch (e) {
    if (e instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log.error({ err: e }, "Failed to download document");
    res.status(500).json({ error: "Failed to download document" });
  }
});

router.get("/documents/:id/preview", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    await streamDocumentFile(doc, res, "inline");
  } catch (e) {
    if (e instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log.error({ err: e }, "Failed to preview document");
    res.status(500).json({ error: "Failed to preview document" });
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
    req.log.error({ err: e }, "Failed to get document");
    res.status(500).json({ error: "Failed to get document" });
  }
});

router.post("/documents", async (req: Request, res: Response) => {
  const parsed = insertDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid data", issues: parsed.error.issues });
    return;
  }
  try {
    const [doc] = await db.insert(documentsTable).values(parsed.data).returning();
    res.status(201).json(doc);
  } catch (e) {
    req.log.error({ err: e }, "Failed to create document");
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
    req.log.error({ err: e }, "Failed to update document");
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.delete("/documents/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    await db.delete(documentsTable).where(eq(documentsTable.id, id));

    if (isLocalStorageMode()) {
      await deleteLocalFile(doc.objectPath);
    }

    res.json({ success: true });
  } catch (e) {
    req.log.error({ err: e }, "Failed to delete document");
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
