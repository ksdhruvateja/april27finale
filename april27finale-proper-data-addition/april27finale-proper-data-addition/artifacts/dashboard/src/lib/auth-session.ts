const SESSION_KEY = "forez.auth.session.v1";

const ROLES = new Set(["developer", "admin", "sales", "shipper", "accountant", "viewer", "custom"]);

export interface StoredAuthUser {
  id?: number;
  email: string;
  name?: string;
  role: string;
  customPermissions?: {
    allowedPaths: string[];
    readOnly: boolean;
    hidePrices: boolean;
  };
}

function isValidUser(value: unknown): value is StoredAuthUser {
  if (!value || typeof value !== "object") return false;
  const u = value as Record<string, unknown>;
  return typeof u.email === "string" && typeof u.role === "string" && ROLES.has(u.role);
}

/** Restore signed-in user after a full page reload. */
export function loadAuthSession(): StoredAuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(user: StoredAuthUser | null): void {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private browsing / quota */
  }
}
