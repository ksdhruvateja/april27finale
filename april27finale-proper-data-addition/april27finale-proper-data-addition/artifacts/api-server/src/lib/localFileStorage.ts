import { createReadStream } from "node:fs";
import { mkdir, writeFile, unlink, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** True when Replit/GCS object storage is not configured — use on-disk uploads instead. */
export function isLocalStorageMode(): boolean {
  return !process.env.PRIVATE_OBJECT_DIR?.trim();
}

export function getLocalUploadRoot(): string {
  const configured = process.env.LOCAL_UPLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "uploads");
}

export async function ensureLocalUploadDirs(): Promise<void> {
  const root = getLocalUploadRoot();
  await mkdir(path.join(root, "uploads"), { recursive: true });
}

export function newLocalObjectPath(): { objectId: string; objectPath: string } {
  const objectId = randomUUID();
  return { objectId, objectPath: `/objects/uploads/${objectId}` };
}

export function localFilePathFromObjectPath(objectPath: string): string {
  if (!objectPath.startsWith("/objects/")) {
    throw new Error(`Invalid object path: ${objectPath}`);
  }
  const relative = objectPath.slice("/objects/".length);
  return path.join(getLocalUploadRoot(), relative);
}

export async function saveLocalUpload(objectId: string, data: Buffer): Promise<string> {
  await ensureLocalUploadDirs();
  const objectPath = `/objects/uploads/${objectId}`;
  const filePath = localFilePathFromObjectPath(objectPath);
  await writeFile(filePath, data);
  return objectPath;
}

export async function localFileExists(objectPath: string): Promise<boolean> {
  try {
    await access(localFilePathFromObjectPath(objectPath));
    return true;
  } catch {
    return false;
  }
}

export async function deleteLocalFile(objectPath: string): Promise<void> {
  try {
    await unlink(localFilePathFromObjectPath(objectPath));
  } catch {
    /* ignore missing files */
  }
}

export function createLocalReadStream(objectPath: string) {
  return createReadStream(localFilePathFromObjectPath(objectPath));
}
