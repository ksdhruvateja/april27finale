import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import { z } from "zod";
import { requireRole, roleAtLeast } from "../middleware/requireAuth.js";

const router = Router();

/* ── Validation schemas ─────────────────────────────────────────────────── */
const UserRoleEnum = z.enum(["developer", "admin", "sales", "shipper", "accountant", "viewer", "custom"]);

const CreateUserBody = z.object({
  email:             z.string().email().max(320),
  name:              z.string().max(120).optional(),
  role:              UserRoleEnum,
  password:          z.string().min(4).max(200),   // required on create
  customPermissions: z.string().max(8000).optional(),
  invitedBy:         z.string().max(320).optional(),
});

const UpdateUserBody = z.object({
  name:              z.string().max(120).optional(),
  role:              UserRoleEnum.optional(),
  password:          z.string().min(4).max(200).optional(),
  customPermissions: z.string().max(8000).optional().nullable(),
});

const ROLE_ORDER = ["developer", "admin", "sales", "accountant", "shipper", "viewer", "custom"];

/* ── GET /users — admin/developer only ─────────────────────────────────── */
router.get("/users", requireRole("developer", "admin"), async (_req, res): Promise<void> => {
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

/* ── POST /users — admin/developer only, no privilege escalation ────────── */
router.post("/users", requireRole("developer", "admin"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") });
    return;
  }

  const actorRole = req.user!.role;
  const targetRole = parsed.data.role;

  // Prevent assigning a role higher than your own (e.g. admin can't create developer)
  if (!roleAtLeast(actorRole, targetRole)) {
    res.status(403).json({ error: `You cannot assign the '${targetRole}' role (higher than your own).` });
    return;
  }

  // Only developers can create other developers
  if (targetRole === "developer" && actorRole !== "developer") {
    res.status(403).json({ error: "Only a Developer account can create another Developer." });
    return;
  }

  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [user] = await db
      .insert(appUsersTable)
      .values({ ...rest, passwordHash, invitedBy: req.user!.email })
      .returning();
    const { passwordHash: _ph, ...safe } = user as typeof user & { passwordHash?: string };
    res.status(201).json(safe);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      res.status(409).json({ error: "A user with that email already exists." });
    } else {
      console.error("Create user error:", err);
      res.status(500).json({ error: "Failed to create user." });
    }
  }
});

/* ── PATCH /users/:id — admin/developer only ────────────────────────────── */
router.patch("/users/:id", requireRole("developer", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") }); return; }

  const actorRole = req.user!.role;

  // Prevent privilege escalation when changing a role
  if (parsed.data.role && !roleAtLeast(actorRole, parsed.data.role)) {
    res.status(403).json({ error: `You cannot assign the '${parsed.data.role}' role.` });
    return;
  }

  // Only developers can set/change developer role
  if (parsed.data.role === "developer" && actorRole !== "developer") {
    res.status(403).json({ error: "Only a Developer can assign the Developer role." });
    return;
  }

  // Prevent editing your own role (admin could accidentally lock themselves out)
  if (id === req.user!.id && parsed.data.role && parsed.data.role !== req.user!.role) {
    res.status(400).json({ error: "You cannot change your own role." });
    return;
  }

  const { password, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (password) update.passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .update(appUsersTable)
    .set(update)
    .where(eq(appUsersTable.id, id))
    .returning();

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash: _ph, ...safe } = user as typeof user & { passwordHash?: string };
  res.json(safe);
});

/* ── DELETE /users/:id — admin/developer only, can't delete yourself ──── */
router.delete("/users/:id", requireRole("developer", "admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  if (id === req.user!.id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }

  // Prevent admin from deleting a developer account
  const [target] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found." }); return; }

  if (target.role === "developer" && req.user!.role !== "developer") {
    res.status(403).json({ error: "Only a Developer can delete a Developer account." });
    return;
  }

  await db.delete(appUsersTable).where(eq(appUsersTable.id, id));
  res.json({ success: true });
});

export default router;
