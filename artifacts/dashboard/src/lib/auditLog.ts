export type AuditEntityType =
  | "po" | "invoice" | "quote" | "bill"
  | "shipment" | "ticket" | "product"
  | "customer" | "vendor" | "other";

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: { name: string; email: string; role: string };
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityRef: string;
  description: string;
  note?: string;
  meta?: Record<string, any>;
}

const KEY = "forez_audit_log_v1";
const MAX_ENTRIES = 2000;

let _currentAuditUser: { name: string; email: string; role: string } = {
  name: "Unknown",
  email: "",
  role: "unknown",
};

export function setAuditUser(user: { name?: string | null; email: string; role: string } | null) {
  if (user) {
    _currentAuditUser = {
      name: user.name?.trim() || user.email,
      email: user.email,
      role: user.role,
    };
  } else {
    _currentAuditUser = { name: "Unknown", email: "", role: "unknown" };
  }
}

export function getCurrentAuditUser() {
  return { ..._currentAuditUser };
}

export function getAuditLog(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function logAudit(entry: Omit<AuditEntry, "id" | "timestamp">) {
  const log = getAuditLog();
  const next: AuditEntry = {
    id: `au_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const trimmed = [next, ...log].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch { /* storage full — silently skip */ }
}

export function clearAuditLog() {
  localStorage.removeItem(KEY);
}
