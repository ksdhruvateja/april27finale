import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { Readable } from "stream";
import { z } from "zod/v4";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  isLocalStorageMode,
  newLocalObjectPath,
  saveLocalUpload,
  createLocalReadStream,
  localFileExists,
} from "../lib/localFileStorage";

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number().optional(),
  contentType: z.string().optional(),
});
const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({ name: z.string(), size: z.number().optional(), contentType: z.string().optional() }).optional(),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function objectPathFromWildcard(wildcardPath: string): string {
  return `/objects/${wildcardPath}`;
}

/**
 * POST /storage/uploads/request-url
 *
 * Cloud: presigned GCS URL. Local dev: PUT to /api/storage/local-upload/:id
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    if (isLocalStorageMode()) {
      const { objectId, objectPath } = newLocalObjectPath();
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL: `/api/storage/local-upload/${objectId}`,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/** Local dev: receive raw file bytes after request-url */
router.put(
  "/storage/local-upload/:id",
  express.raw({ type: () => true, limit: "100mb" }),
  async (req: Request, res: Response) => {
    if (!isLocalStorageMode()) {
      res.status(404).json({ error: "Local upload is not enabled" });
      return;
    }
    try {
      const objectId = req.params.id;
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
      if (!data.length) {
        res.status(400).json({ error: "Empty upload body" });
        return;
      }
      const objectPath = await saveLocalUpload(objectId, data);
      res.status(200).json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Local upload failed");
      res.status(500).json({ error: "Failed to save upload" });
    }
  },
);

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  if (isLocalStorageMode()) {
    res.status(404).json({ error: "Public object storage is not configured" });
    return;
  }
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/** Serve stored files (local disk or cloud object storage) */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = objectPathFromWildcard(wildcardPath);

    if (isLocalStorageMode()) {
      if (!(await localFileExists(objectPath))) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const stream = createLocalReadStream(objectPath);
      const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      stream.pipe(res);
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
