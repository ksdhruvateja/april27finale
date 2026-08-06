import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["SESSION_SECRET"];
if (!JWT_SECRET) {
  console.warn("[SECURITY] SESSION_SECRET is not set — using insecure fallback. Set it in production!");
}
const SECRET = JWT_SECRET ?? "insecure-dev-fallback-set-SESSION_SECRET-env-var";

export interface JwtPayload {
  id:                number;
  email:             string;
  name?:             string;
  role:              string;
  customPermissions?: string;
}

// Augment Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Sign a JWT for the given user payload (8-hour session). */
export function issueToken(payload: JwtPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt as any).sign(payload, SECRET, { expiresIn: "8h" });
}

/** Middleware: require a valid session cookie (or Bearer token fallback). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = req.cookies as Record<string, string> | undefined;
  const token =
    cookies?.["qb_session"] ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.user = (jwt as any).verify(token, SECRET) as JwtPayload;
    next();
  } catch {
    res.clearCookie("qb_session", { path: "/" });
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

const ROLE_ORDER: Record<string, number> = {
  developer:  0,
  admin:      1,
  sales:      2,
  accountant: 3,
  shipper:    4,
  viewer:     5,
  custom:     6,
};

/** Returns true if `actor` role is at least as privileged as `target` role. */
export function roleAtLeast(actor: string, target: string): boolean {
  const a = ROLE_ORDER[actor] ?? 99;
  const t = ROLE_ORDER[target] ?? 99;
  return a <= t;
}

/** Middleware: require the authenticated user to have one of the given roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions." });
      return;
    }
    next();
  };
}
