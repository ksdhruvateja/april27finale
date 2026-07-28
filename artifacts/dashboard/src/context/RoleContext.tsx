import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type UserRole = "developer" | "admin" | "sales" | "shipper" | "accountant" | "viewer" | "custom";

export interface CustomPermissions {
  allowedPaths: string[];
  readOnly: boolean;
  hidePrices: boolean;
}

export interface CurrentUser {
  id?: number;
  email: string;
  name?: string;
  role: UserRole;
  customPermissions?: CustomPermissions;
}

interface RoleContextType {
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;
  hasAccess: (path: string) => boolean;
  canEdit: boolean;
  canManageUsers: boolean;
  isShipper: boolean;
  hidePrices: boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

export const ROLE_ACCESS: Record<Exclude<UserRole, "custom">, string[]> = {
  developer:  ["*"],
  admin:      ["*"],
  sales:      ["/", "/auctions", "/customers", "/quotes", "/invoices", "/walk-in", "/purchase-orders", "/products", "/shipments", "/sales-leads", "/tickets", "/history", "/documents"],
  shipper:    ["/purchase-orders", "/shipments", "/documents"],
  accountant: ["/", "/auctions", "/customers", "/invoices", "/walk-in", "/vendors", "/purchase-orders", "/bills", "/tax-rates", "/accounting", "/banking", "/tickets", "/history", "/documents"],
  viewer:     ["/", "/auctions", "/quotes", "/invoices", "/purchase-orders", "/shipments", "/tickets", "/history", "/documents"],
};

export function checkAccess(role: UserRole, path: string, customPermissions?: CustomPermissions): boolean {
  if (role === "custom") {
    if (!customPermissions) return false;
    const allowed = customPermissions.allowedPaths;
    return allowed.some(p => path === p || (p !== "/" && path.startsWith(p)));
  }
  const allowed = ROLE_ACCESS[role as Exclude<UserRole, "custom">];
  if (!allowed) return false;
  if (allowed.includes("*")) return true;
  return allowed.some(p => path === p || (p !== "/" && path.startsWith(p)));
}

const STORAGE_KEY = "forez_current_user";

export function RoleProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<CurrentUser | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as CurrentUser;
    } catch {}
    return null;
  });

  useEffect(() => {
    if (currentUser) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser)); } catch {}
    } else {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [currentUser]);

  const setCurrentUser = (user: CurrentUser | null) => {
    setCurrentUserState(user);
  };

  const hasAccess = (path: string) =>
    currentUser ? checkAccess(currentUser.role, path, currentUser.customPermissions) : false;

  const canEdit = currentUser
    ? currentUser.role === "custom"
      ? !(currentUser.customPermissions?.readOnly ?? true)
      : !["viewer"].includes(currentUser.role)
    : false;

  const canManageUsers = currentUser
    ? ["developer", "admin"].includes(currentUser.role)
    : false;

  const isShipper  = currentUser?.role === "shipper";
  const hidePrices = currentUser?.role === "shipper"
    || (currentUser?.role === "custom" && (currentUser.customPermissions?.hidePrices ?? false));

  return (
    <RoleContext.Provider value={{ currentUser, setCurrentUser, hasAccess, canEdit, canManageUsers, isShipper, hidePrices }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}
