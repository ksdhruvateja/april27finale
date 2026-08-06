import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { issueToken, requireAuth, type JwtPayload } from "../middleware/requireAuth.js";

const router = Router();

/* ── Default developer account seeding ─────────────────────────────────── */
const DEFAULT_DEV_EMAIL    = "developer@gmail.com";
const DEFAULT_DEV_PASSWORD = "developer143";
const DEFAULT_DEV_NAME     = "Developer";

async function ensureDefaultDeveloper() {
  const existing = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.email, DEFAULT_DEV_EMAIL));
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

/* ── Rate limiter: 20 attempts per 15 min per IP ────────────────────────── */
const loginLimiter = rateLimit({
  windowMs:              15 * 60 * 1000,
  max:                   20,
  message:               { error: "Too many sign-in attempts. Please wait 15 minutes and try again." },
  standardHeaders:       true,
  legacyHeaders:         false,
  skipSuccessfulRequests: true,
});

/* ── Schemas ─────────────────────────────────────────────────────────────── */
const LoginBody = z.object({
  email:    z.string().email(),
  password: z.string().min(1).max(200),
});

/* ── Cookie config ───────────────────────────────────────────────────────── */
const COOKIE_NAME = "qb_session";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax"  as const,
  secure:   process.env["NODE_ENV"] === "production",
  maxAge:   8 * 60 * 60 * 1000, // 8 hours in ms
  path:     "/",
};

/* ── POST /auth/login ────────────────────────────────────────────────────── */
router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email and password are required." });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.email, email.toLowerCase().trim()));

  // Always run bcrypt to prevent timing-based user enumeration
  const dummyHash = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  const hashToCheck = user?.passwordHash ?? dummyHash;
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!user || !user.passwordHash || !valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const payload: JwtPayload = {
    id:                user.id,
    email:             user.email,
    name:              user.name  ?? undefined,
    role:              user.role,
    customPermissions: user.customPermissions ?? undefined,
  };

  const token = issueToken(payload);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

  res.json({
    id:                user.id,
    email:             user.email,
    name:              user.name,
    role:              user.role,
    customPermissions: user.customPermissions,
  });
});

/* ── POST /auth/logout ───────────────────────────────────────────────────── */
router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

/* ── GET /auth/me ────────────────────────────────────────────────────────── */
router.get("/auth/me", requireAuth, (req, res): void => {
  // requireAuth already validated the token; just return the payload
  res.json(req.user);
});

export default router;
