import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const DEFAULT_DEV_EMAIL    = "developer@gmail.com";
const DEFAULT_DEV_PASSWORD = "developer143";
const DEFAULT_DEV_NAME     = "Developer";

async function ensureDefaultDeveloper() {
  const existing = await db.select().from(appUsersTable).where(eq(appUsersTable.email, DEFAULT_DEV_EMAIL));
  if (existing.length === 0) {
    const hash = await bcrypt.hash(DEFAULT_DEV_PASSWORD, 10);
    await db.insert(appUsersTable).values({
      email:        DEFAULT_DEV_EMAIL,
      name:         DEFAULT_DEV_NAME,
      role:         "developer",
      passwordHash: hash,
    });
  }
}

ensureDefaultDeveloper().catch(console.error);

const LoginBody = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

router.get("/auth/me", async (_req, res): Promise<void> => {
  res.status(401).json({ error: "Not authenticated" });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.email, email.toLowerCase().trim()));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "No password set for this account. Contact your admin." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  res.json({
    id:                user.id,
    email:             user.email,
    name:              user.name,
    role:              user.role,
    customPermissions: user.customPermissions,
  });
});

export default router;
