import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useRole, UserRole, CustomPermissions } from "@/context/RoleContext";
import { Plus, Trash2, Pencil, X, Check, ShieldAlert, Settings2, ChevronDown, ChevronUp, KeyRound, Eye, EyeOff } from "lucide-react";

interface AppUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  customPermissions: string | null;
  invitedBy: string | null;
  createdAt: string;
}

const ROLES: { value: UserRole; label: string; desc: string; color: string }[] = [
  { value: "developer",  label: "Developer",   desc: "Full access + manage all users",          color: "#a78bfa" },
  { value: "admin",      label: "Admin",        desc: "Full access, can invite sales/shippers",  color: "#60a5fa" },
  { value: "sales",      label: "Sales",        desc: "Quotes, invoices, POs, shipments",        color: "#34d399" },
  { value: "shipper",    label: "Shipper",       desc: "Shipments & POs, no prices",              color: "#93c5fd" },
  { value: "accountant", label: "Accountant",   desc: "Finance, banking, reports",               color: "#fbbf24" },
  { value: "viewer",     label: "Viewer",        desc: "Read-only: quotes, invoices, POs",       color: "#9ca3af" },
  { value: "custom",     label: "Custom Role",  desc: "Choose specific module access manually",  color: "#fb923c" },
];

const ROLE_BADGE: Record<string, string> = {
  developer:  "rgba(167,139,250,0.18)",
  admin:      "rgba(96,165,250,0.18)",
  sales:      "rgba(52,211,153,0.18)",
  shipper:    "rgba(147,197,253,0.18)",
  accountant: "rgba(251,191,36,0.18)",
  viewer:     "rgba(156,163,175,0.15)",
  custom:     "rgba(249,115,22,0.18)",
};
const ROLE_TEXT: Record<string, string> = {
  developer:  "#c4b5fd",
  admin:      "#93c5fd",
  sales:      "#6ee7b7",
  shipper:    "#bae6fd",
  accountant: "#fcd34d",
  viewer:     "#d1d5db",
  custom:     "#fdba74",
};

// ─── All navigable tabs ───────────────────────────────────────────────────────
const ALL_MODULES = [
  { path: "/",                label: "Dashboard",         group: "MAIN"       },
  { path: "/auctions",        label: "Auctions",          group: "MAIN"       },
  { path: "/tickets",         label: "Tickets",           group: "MAIN"       },
  { path: "/customers",       label: "Customers",         group: "SALES"      },
  { path: "/quotes",          label: "Quotes",            group: "SALES"      },
  { path: "/invoices",        label: "Invoices",          group: "SALES"      },
  { path: "/walk-in",         label: "Walk-in Sale",      group: "SALES"      },
  { path: "/sales-leads",     label: "Sales People",      group: "SALES"      },
  { path: "/returns-refunds", label: "Returns & Refunds", group: "SALES"      },
  { path: "/vendors",         label: "Vendors",           group: "PURCHASING" },
  { path: "/purchase-orders", label: "Purchase Orders",   group: "PURCHASING" },
  { path: "/bills",           label: "Bills",             group: "PURCHASING" },
  { path: "/products",        label: "Products",          group: "INVENTORY"  },
  { path: "/shipments",       label: "Shipments",         group: "INVENTORY"  },
  { path: "/tax-rates",       label: "Tax Rates",         group: "FINANCE"    },
  { path: "/accounting",      label: "Accounting",        group: "FINANCE"    },
  { path: "/banking",         label: "Banking",           group: "FINANCE"    },
  { path: "/documents",       label: "Documents",         group: "SYSTEM"     },
  { path: "/users",           label: "Users",             group: "SYSTEM"     },
  { path: "/history",         label: "History",           group: "SYSTEM"     },
  { path: "/settings",        label: "Settings",          group: "SYSTEM"     },
];

const MODULE_GROUPS = ["MAIN", "SALES", "PURCHASING", "INVENTORY", "FINANCE", "SYSTEM"] as const;
const ALL_PATHS = ALL_MODULES.map(m => m.path);

// Default tab access per role — used to pre-populate the picker when selecting a role
const ROLE_DEFAULT_PATHS: Record<string, string[]> = {
  developer:  ALL_PATHS,
  admin:      ALL_PATHS,
  sales:      ["/", "/auctions", "/tickets", "/customers", "/quotes", "/invoices", "/walk-in",
               "/sales-leads", "/returns-refunds", "/purchase-orders", "/products", "/shipments",
               "/documents", "/history"],
  shipper:    ["/purchase-orders", "/shipments", "/documents"],
  accountant: ["/", "/auctions", "/tickets", "/customers", "/invoices", "/walk-in", "/vendors",
               "/purchase-orders", "/bills", "/tax-rates", "/accounting", "/banking",
               "/documents", "/history"],
  viewer:     ["/", "/auctions", "/quotes", "/invoices", "/purchase-orders", "/shipments",
               "/tickets", "/history", "/documents"],
  custom:     ["/", "/purchase-orders", "/shipments"],
};

const makeDefaultPerms = (role: string): CustomPermissions => ({
  allowedPaths: ROLE_DEFAULT_PATHS[role] ?? ALL_PATHS,
  readOnly:     false,
  hidePrices:   false,
});

// ─── Tab Picker ───────────────────────────────────────────────────────────────
function TabPicker({
  value,
  onChange,
  showRestrictions,
}: {
  value: CustomPermissions;
  onChange: (v: CustomPermissions) => void;
  showRestrictions?: boolean;
}) {
  const toggle = (path: string) => {
    const has = value.allowedPaths.includes(path);
    onChange({
      ...value,
      allowedPaths: has
        ? value.allowedPaths.filter(p => p !== path)
        : [...value.allowedPaths, path],
    });
  };

  const toggleGroup = (group: string) => {
    const groupPaths = ALL_MODULES.filter(m => m.group === group).map(m => m.path);
    const allOn = groupPaths.every(p => value.allowedPaths.includes(p));
    onChange({
      ...value,
      allowedPaths: allOn
        ? value.allowedPaths.filter(p => !groupPaths.includes(p))
        : [...new Set([...value.allowedPaths, ...groupPaths])],
    });
  };

  const selectAll = () => onChange({ ...value, allowedPaths: ALL_PATHS });
  const clearAll  = () => onChange({ ...value, allowedPaths: [] });
  const allOn     = ALL_PATHS.every(p => value.allowedPaths.includes(p));

  return (
    <div
      className="rounded-xl p-4 mt-2"
      style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.20)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 size={13} style={{ color: "#2563eb" }} />
          <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#2563eb" }}>
            Tab Access
          </span>
          <span className="text-[11px] font-semibold ml-1" style={{ color: "rgba(71,85,105,0.65)" }}>
            ({value.allowedPaths.length}/{ALL_PATHS.length} tabs)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={allOn ? clearAll : selectAll}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors"
            style={{
              background: allOn ? "rgba(239,68,68,0.10)" : "rgba(37,99,235,0.10)",
              color: allOn ? "#ef4444" : "#2563eb",
            }}
          >
            {allOn ? "Clear All" : "Select All"}
          </button>
        </div>
      </div>

      {/* Module checkboxes grouped */}
      <div className="flex flex-col gap-3 mb-4">
        {MODULE_GROUPS.map(group => {
          const mods  = ALL_MODULES.filter(m => m.group === group);
          const allOn = mods.every(m => value.allowedPaths.includes(m.path));
          const someOn = mods.some(m => value.allowedPaths.includes(m.path));
          return (
            <div key={group}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex items-center gap-2 mb-1.5 w-full text-left"
              >
                <div
                  className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: allOn ? "#2563eb" : someOn ? "rgba(37,99,235,0.35)" : "rgba(148,163,184,0.22)",
                    border: allOn ? "none" : "1px solid rgba(148,163,184,0.35)",
                  }}
                >
                  {allOn  && <Check size={9} color="#fff" strokeWidth={3} />}
                  {!allOn && someOn && <div className="w-1.5 h-0.5 rounded-full" style={{ background: "#2563eb" }} />}
                </div>
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: "rgba(71,85,105,0.75)" }}>
                  {group}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-1.5 pl-5">
                {mods.map(m => {
                  const on = value.allowedPaths.includes(m.path);
                  return (
                    <button
                      key={m.path}
                      type="button"
                      onClick={() => toggle(m.path)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors"
                      style={{
                        background: on ? "rgba(37,99,235,0.12)" : "rgba(148,163,184,0.08)",
                        border: on ? "1px solid rgba(37,99,235,0.25)" : "1px solid rgba(148,163,184,0.20)",
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded flex items-center justify-center flex-shrink-0"
                        style={{
                          background: on ? "#2563eb" : "rgba(148,163,184,0.18)",
                          border: on ? "none" : "1px solid rgba(148,163,184,0.28)",
                        }}
                      >
                        {on && <Check size={8} color="#fff" strokeWidth={3} />}
                      </div>
                      <span className="text-[11px] font-semibold truncate" style={{ color: on ? "#1e3a8a" : "rgba(71,85,105,0.85)" }}>
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Read/Write & Price access restrictions */}
      {showRestrictions && (
        <div
          className="flex flex-col gap-2 pt-3"
          style={{ borderTop: "1px solid rgba(148,163,184,0.20)" }}
        >
          <label className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: "rgba(71,85,105,0.75)" }}>
            Restrictions
          </label>
          {[
            { key: "readOnly",   label: "Read-only mode", desc: "Cannot create, edit, or delete anything" },
            { key: "hidePrices", label: "Hide prices",    desc: "Prices are hidden across all modules"    },
          ].map(opt => {
            const on = value[opt.key as keyof CustomPermissions] as boolean;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onChange({ ...value, [opt.key]: !on })}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{
                  background: on ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.04)",
                  border: on ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(148,163,184,0.20)",
                }}
              >
                <div
                  className="rounded-full flex items-center transition-all flex-shrink-0 relative"
                  style={{ width: 32, height: 18, background: on ? "#ef4444" : "rgba(255,255,255,0.15)" }}
                >
                  <div
                    className="absolute rounded-full transition-all"
                    style={{ width: 12, height: 12, background: "#ffffff", left: on ? 16 : 4, top: 3 }}
                  />
                </div>
                <div>
                  <div className="text-[12px] font-bold" style={{ color: on ? "#b91c1c" : "#1e293b" }}>{opt.label}</div>
                  <div className="text-[10px] font-semibold" style={{ color: "rgba(71,85,105,0.75)" }}>{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Inline tab editor on a user row ─────────────────────────────────────────
function UserTabEditor({ user, onSaved }: { user: AppUser; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<CustomPermissions>(() => {
    try { return user.customPermissions ? JSON.parse(user.customPermissions) : makeDefaultPerms(user.role); }
    catch { return makeDefaultPerms(user.role); }
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customPermissions: JSON.stringify(perms) }),
    });
    setSaving(false);
    setOpen(false);
    onSaved();
  };

  const count = perms.allowedPaths.length;

  return (
    <div className="px-6 pb-1 pt-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
        style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.18)" }}
      >
        <Settings2 size={11} />
        Manage Tabs ({count}/{ALL_PATHS.length})
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="mt-2">
          <TabPicker
            value={perms}
            onChange={setPerms}
            showRestrictions={true}
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)" }}
            >
              <Check size={12} /> {saving ? "Saving…" : "Save Tab Access"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold"
              style={{ background: "rgba(148,163,184,0.18)", color: "#475569" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function UserManagement() {
  const { currentUser, canManageUsers } = useRole();

  const isDeveloper  = currentUser?.role === "developer";
  const availableRoles = isDeveloper ? ROLES : ROLES.filter(r => r.value !== "developer");

  const [users,     setUsers]     = useState<AppUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // ── Add form state ──
  const [form, setForm] = useState({
    email: "", name: "", role: "viewer" as UserRole, password: "",
  });
  const [formPerms, setFormPerms] = useState<CustomPermissions>(makeDefaultPerms("viewer"));

  // ── Edit form state ──
  const [editRole,  setEditRole]  = useState<UserRole>("viewer");
  const [editName,  setEditName]  = useState("");
  const [editPerms, setEditPerms] = useState<CustomPermissions>(makeDefaultPerms("viewer"));

  const [error,  setError]  = useState("");
  const [saving, setSaving] = useState(false);

  // ── Password reset state ──
  const [resetId,        setResetId]        = useState<number | null>(null);
  const [resetNew,       setResetNew]       = useState("");
  const [resetConfirm,   setResetConfirm]   = useState("");
  const [resetShow,      setResetShow]      = useState(false);
  const [resetSaving,    setResetSaving]    = useState(false);
  const [resetError,     setResetError]     = useState("");
  const [resetOk,        setResetOk]        = useState(false);

  // Expanded tab-editor rows
  const [expandedTabEdit, setExpandedTabEdit] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/users")
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // When role changes in add form, reset tab defaults
  const setFormRole = (role: UserRole) => {
    setForm(f => ({ ...f, role }));
    setFormPerms(p => ({ ...p, allowedPaths: ROLE_DEFAULT_PATHS[role] ?? ALL_PATHS }));
  };

  // When role changes in edit form, reset tab defaults
  const setEditRoleAndPaths = (role: UserRole) => {
    setEditRole(role);
    setEditPerms(p => ({ ...p, allowedPaths: ROLE_DEFAULT_PATHS[role] ?? ALL_PATHS }));
  };

  const handleAdd = async () => {
    if (!form.email)    { setError("Email is required.");    return; }
    if (!form.password) { setError("Password is required."); return; }
    if (formPerms.allowedPaths.length === 0) {
      setError("Select at least one tab for this user."); return;
    }
    setSaving(true); setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:             form.email,
        name:              form.name || undefined,
        role:              form.role,
        password:          form.password,
        invitedBy:         currentUser?.email,
        customPermissions: JSON.stringify(formPerms),
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to add user."); setSaving(false); return; }
    setAdding(false);
    setForm({ email: "", name: "", role: "viewer", password: "" });
    setFormPerms(makeDefaultPerms("viewer"));
    load();
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    setSaving(true);
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role:              editRole,
        name:              editName,
        customPermissions: JSON.stringify(editPerms),
      }),
    });
    setEditingId(null);
    load();
    setSaving(false);
  };

  const openReset = (id: number) => {
    setResetId(id); setResetNew(""); setResetConfirm("");
    setResetShow(false); setResetError(""); setResetOk(false);
    setEditingId(null); // close edit form if open
  };

  const handleReset = async () => {
    if (!resetNew)                      { setResetError("Enter a new password."); return; }
    if (resetNew.length < 4)            { setResetError("Password must be at least 4 characters."); return; }
    if (resetNew !== resetConfirm)      { setResetError("Passwords do not match."); return; }
    setResetSaving(true); setResetError("");
    const res = await fetch(`/api/users/${resetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetNew }),
    });
    setResetSaving(false);
    if (res.ok) {
      setResetOk(true);
      setTimeout(() => { setResetId(null); setResetOk(false); }, 2000);
    } else {
      setResetError("Failed to update password.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    load();
  };

  const startEdit = (u: AppUser) => {
    setEditingId(u.id);
    setEditRole(u.role as UserRole);
    setEditName(u.name ?? "");
    try {
      const stored = u.customPermissions ? JSON.parse(u.customPermissions) : null;
      setEditPerms(stored ?? makeDefaultPerms(u.role));
    } catch {
      setEditPerms(makeDefaultPerms(u.role));
    }
  };

  const getTabSummary = (u: AppUser) => {
    try {
      const cp: CustomPermissions = u.customPermissions
        ? JSON.parse(u.customPermissions)
        : { allowedPaths: ROLE_DEFAULT_PATHS[u.role] ?? ALL_PATHS, readOnly: false, hidePrices: false };
      const count = cp.allowedPaths.length;
      const total = ALL_PATHS.length;
      if (count === total) return `All ${total} tabs`;
      const labels = cp.allowedPaths
        .map(p => ALL_MODULES.find(m => m.path === p)?.label)
        .filter(Boolean)
        .slice(0, 3);
      const extra = count > 3 ? ` +${count - 3}` : "";
      return labels.join(", ") + extra;
    } catch { return null; }
  };

  if (!canManageUsers) {
    return (
      <Layout>
        <Header title="User Management" />
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="glass-card p-10 max-w-md text-center">
            <ShieldAlert size={36} className="mx-auto mb-3" style={{ color: "#3b82f6" }} />
            <h2 className="text-[18px] font-black mb-2" style={{ color: "#0f172a" }}>Access Denied</h2>
            <p className="text-[13px] font-semibold" style={{ color: "rgba(71,85,105,0.85)" }}>
              Only Developers and Admins can manage users.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header title="User Management" subtitle="Manage team members and their access levels" />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-7 py-6" style={{ background: "transparent" }}>

        {/* Permission banner */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 rounded-xl mb-5"
          style={{ background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)" }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-[10px] font-black"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 2px 8px rgba(59,130,246,0.40)" }}
          >
            {isDeveloper ? "DEV" : "ADM"}
          </div>
          <div>
            <span className="text-[13px] font-black" style={{ color: "#0f172a" }}>
              {isDeveloper ? "Developer Access" : "Admin Access"}
            </span>
            <span className="text-[12px] font-semibold ml-2" style={{ color: "rgba(71,85,105,0.85)" }}>
              {isDeveloper
                ? "You can create and assign all roles, including other Developers."
                : "You can create Admin, Sales, Shipper, Accountant, Viewer, and Custom accounts."}
            </span>
          </div>
        </div>

        {/* Role Reference */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {ROLES.map(r => (
            <div key={r.value} className="glass-card px-4 py-3 flex items-start gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: r.color }} />
              <div>
                <div className="text-[12px] font-black" style={{ color: "#0f172a" }}>{r.label}</div>
                <div className="text-[11px] font-semibold mt-0.5" style={{ color: "rgba(71,85,105,0.85)" }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="glass-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <h2 className="text-[15px] font-black" style={{ color: "#0f172a" }}>Team Members</h2>
              <p className="text-[12px] font-semibold mt-0.5" style={{ color: "rgba(71,85,105,0.80)" }}>
                {users.length} user{users.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={() => { setAdding(true); setError(""); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 4px 14px rgba(59,130,246,0.35)" }}
            >
              <Plus size={14} /> Add User
            </button>
          </div>

          {/* ── Add form ── */}
          {adding && (
            <div className="px-6 py-5" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex flex-wrap items-end gap-3 mb-0">
                <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                  <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: "rgba(71,85,105,0.85)" }}>Email *</label>
                  <input
                    type="email"
                    placeholder="user@company.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="input-light"
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: "rgba(71,85,105,0.85)" }}>Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="input-light"
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: "rgba(71,85,105,0.85)" }}>Password *</label>
                  <input
                    type="password"
                    placeholder="Min. 4 chars"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="input-light"
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-[11px] font-black uppercase tracking-wider" style={{ color: "rgba(71,85,105,0.85)" }}>Role</label>
                  <select
                    value={form.role}
                    onChange={e => setFormRole(e.target.value as UserRole)}
                    className="input-light"
                    style={{ fontSize: 13 }}
                  >
                    {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <button
                    onClick={handleAdd}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 3px 10px rgba(59,130,246,0.30)" }}
                  >
                    <Check size={13} /> {saving ? "Saving…" : "Add"}
                  </button>
                  <button
                    onClick={() => { setAdding(false); setError(""); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold"
                    style={{ background: "rgba(148,163,184,0.18)", color: "#475569" }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Tab picker — always shown */}
              <TabPicker
                value={formPerms}
                onChange={setFormPerms}
                showRestrictions={true}
              />

              {error && <p className="mt-2 text-[12px] font-bold" style={{ color: "#f87171" }}>{error}</p>}
            </div>
          )}

          {/* ── User rows ── */}
          {loading ? (
            <div className="text-center py-12 text-[13px] font-semibold" style={{ color: "rgba(71,85,105,0.80)" }}>Loading…</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-[13px] font-semibold" style={{ color: "rgba(71,85,105,0.80)" }}>No users yet — add one above.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              {users.map(u => (
                <div key={u.id}>
                  {/* Main user row */}
                  <div
                    className="flex items-center gap-4 px-6 py-4 transition-all"
                    style={{ background: "transparent" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                      style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 2px 8px rgba(59,130,246,0.35)" }}
                    >
                      {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                    </div>

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      {editingId === u.id ? (
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="input-light mb-1 w-full"
                          style={{ fontSize: 13, padding: "4px 10px" }}
                          placeholder="Display name"
                        />
                      ) : (
                        <div className="text-[13px] font-bold truncate" style={{ color: "#0f172a" }}>
                          {u.name ?? <span style={{ color: "rgba(71,85,105,0.65)" }}>(no name)</span>}
                        </div>
                      )}
                      <div className="text-[11px] font-semibold truncate" style={{ color: "rgba(71,85,105,0.80)" }}>{u.email}</div>
                      {!editingId && (() => {
                        const summary = getTabSummary(u);
                        return summary ? (
                          <div className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: "rgba(37,99,235,0.75)" }}>
                            {summary}
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* Role */}
                    <div className="flex-shrink-0">
                      {editingId === u.id ? (
                        <select
                          value={editRole}
                          onChange={e => setEditRoleAndPaths(e.target.value as UserRole)}
                          className="input-light"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span
                          className="text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wide"
                          style={{
                            background: ROLE_BADGE[u.role] ?? "rgba(156,163,175,0.15)",
                            color: ROLE_TEXT[u.role] ?? "#d1d5db",
                            border: `1px solid ${ROLE_TEXT[u.role] ?? "#d1d5db"}22`,
                          }}
                        >
                          {ROLES.find(r => r.value === u.role)?.label ?? u.role}
                        </span>
                      )}
                    </div>

                    {/* Invited by */}
                    {u.invitedBy && (
                      <div className="text-[11px] font-semibold hidden md:block" style={{ color: "rgba(71,85,105,0.70)" }}>
                        by {u.invitedBy}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {editingId === u.id ? (
                        <>
                          <button
                            onClick={() => handleEdit(u.id)}
                            disabled={saving}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: "rgba(148,163,184,0.18)", color: "#475569" }}
                          >
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(u)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.22)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.12)"; }}
                            title="Edit name / role / tabs"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => resetId === u.id ? setResetId(null) : openReset(u.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: resetId === u.id ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.12)", color: "#fbbf24" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.22)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = resetId === u.id ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.12)"; }}
                            title="Reset password"
                          >
                            <KeyRound size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.22)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.12)"; }}
                            title="Remove user"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline tab + access picker when editing name/role */}
                  {editingId === u.id && (
                    <div className="px-6 pb-5">
                      <TabPicker
                        value={editPerms}
                        onChange={setEditPerms}
                        showRestrictions={true}
                      />
                    </div>
                  )}

                  {/* Password reset form */}
                  {resetId === u.id && editingId !== u.id && (
                    <div
                      className="mx-6 mb-4 rounded-xl p-4"
                      style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)" }}
                    >
                      <p className="text-[11px] font-black uppercase tracking-wider mb-3" style={{ color: "#d97706" }}>
                        Reset Password — {u.name ?? u.email}
                      </p>
                      {resetOk ? (
                        <p className="text-[13px] font-bold" style={{ color: "#34d399" }}>✓ Password updated successfully!</p>
                      ) : (
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
                            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: "rgba(71,85,105,0.75)" }}>New Password</label>
                            <div className="relative">
                              <input
                                type={resetShow ? "text" : "password"}
                                placeholder="Min. 4 characters"
                                value={resetNew}
                                onChange={e => { setResetNew(e.target.value); setResetError(""); }}
                                className="input-light w-full pr-8"
                                style={{ fontSize: 13 }}
                              />
                              <button
                                type="button"
                                onClick={() => setResetShow(s => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2"
                                style={{ color: "rgba(71,85,105,0.55)" }}
                              >
                                {resetShow ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
                            <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: "rgba(71,85,105,0.75)" }}>Confirm Password</label>
                            <input
                              type={resetShow ? "text" : "password"}
                              placeholder="Repeat new password"
                              value={resetConfirm}
                              onChange={e => { setResetConfirm(e.target.value); setResetError(""); }}
                              onKeyDown={e => { if (e.key === "Enter") handleReset(); }}
                              className="input-light"
                              style={{ fontSize: 13 }}
                            />
                          </div>
                          <div className="flex items-center gap-2 pb-0.5">
                            <button
                              onClick={handleReset}
                              disabled={resetSaving}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white"
                              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}
                            >
                              <KeyRound size={13} /> {resetSaving ? "Saving…" : "Update Password"}
                            </button>
                            <button
                              onClick={() => setResetId(null)}
                              className="px-3 py-2 rounded-xl text-[13px] font-bold"
                              style={{ background: "rgba(148,163,184,0.18)", color: "#475569" }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                          {resetError && (
                            <p className="w-full text-[12px] font-bold mt-1" style={{ color: "#f87171" }}>{resetError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manage Tabs expander (when not in name/role edit mode) */}
                  {editingId !== u.id && (
                    <UserTabEditor
                      user={u}
                      onSaved={() => { load(); setExpandedTabEdit(null); }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
