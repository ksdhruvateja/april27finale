import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const UserRoleEnum = z.enum(["developer", "admin", "sales", "shipper", "accountant", "viewer", "custom"]);

const CreateUserBody = z.object({
  email:             z.string().email(),
  name:              z.string().optional(),
  role:              UserRoleEnum,
  password:          z.string().min(4).optional(),
  customPermissions: z.string().optional(),
  invitedBy:         z.string().optional(),
});

const UpdateUserBody = z.object({
  name:              z.string().optional(),
  role:              UserRoleEnum.optional(),
  password:          z.string().min(4).optional(),
  customPermissions: z.string().optional().nullable(),
});

const ROLE_ORDER = ["developer", "admin", "sales", "accountant", "shipper", "viewer", "custom"];

router.get("/users", async (_req, res): Promise<void> => {
  const rows = await db.select().from(appUsersTable).orderBy(appUsersTable.createdAt);
  rows.sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const users = rows.map(u => ({
    id:               u.id,
    email:            u.email,
    name:             u.name,
    role:             u.role,
    customPermissions: u.customPermissions,
    invitedBy:        u.invitedBy,
    createdAt:        u.createdAt,
    hasPassword:      !!u.passwordHash,
  }));
  res.json(users);
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  try {
    const [user] = await db.insert(appUsersTable)
      .values({ ...rest, ...(passwordHash ? { passwordHash } : {}) })
      .returning();
    const { passwordHash: _ph, ...safe } = user as typeof user & { passwordHash?: string };
    res.status(201).json(safe);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      res.status(409).json({ error: "A user with that email already exists." });
    } else {
      res.status(500).json({ error: "Failed to create user." });
    }
  }
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { password, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (password) update.passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.update(appUsersTable).set(update).where(eq(appUsersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash: _ph, ...safe } = user as typeof user & { passwordHash?: string };
  res.json(safe);
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(appUsersTable).where(eq(appUsersTable.id, id));
  res.json({ success: true });
});

export default router;
