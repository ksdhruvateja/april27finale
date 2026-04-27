import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useRole, UserRole, CustomPermissions } from "@/context/RoleContext";
import { Plus, Trash2, Pencil, X, Check, ShieldAlert, Settings2 } from "lucide-react";

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
  { value: "developer",  label: "Developer",    desc: "Full access + manage all users",           color: "#a78bfa" },
  { value: "admin",      label: "Admin",         desc: "Full access, can invite sales/shippers",   color: "#60a5fa" },
  { value: "sales",      label: "Sales",         desc: "Quotes, invoices, POs, shipments",         color: "#34d399" },
  { value: "shipper",    label: "Shipper",        desc: "Shipments & POs, no prices",               color: "#93c5fd" },
  { value: "accountant", label: "Accountant",    desc: "Finance, banking, reports",                color: "#fbbf24" },
  { value: "viewer",     label: "Viewer",         desc: "Read-only: quotes, invoices, POs",        color: "#9ca3af" },
  { value: "custom",     label: "Custom Role",   desc: "Choose specific module access manually",   color: "#fb923c" },
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

const ALL_MODULES = [
  { path: "/",               label: "Dashboard",       group: "MAIN"       },
  { path: "/customers",      label: "Customers",       group: "SALES"      },
  { path: "/quotes",         label: "Quotes",          group: "SALES"      },
  { path: "/invoices",       label: "Invoices",        group: "SALES"      },
  { path: "/sales-leads",    label: "Sales Leads",     group: "SALES"      },
  { path: "/vendors",        label: "Vendors",         group: "PURCHASING" },
  { path: "/purchase-orders",label: "Purchase Orders", group: "PURCHASING" },
  { path: "/bills",          label: "Bills",           group: "PURCHASING" },
  { path: "/products",       label: "Products",        group: "INVENTORY"  },
  { path: "/shipments",      label: "Shipments",       group: "INVENTORY"  },
  { path: "/tax-rates",      label: "Tax Rates",       group: "FINANCE"    },
  { path: "/accounting",     label: "Accounting",      group: "FINANCE"    },
  { path: "/banking",        label: "Banking",         group: "FINANCE"    },
];

const MODULE_GROUPS = ["MAIN", "SALES", "PURCHASING", "INVENTORY", "FINANCE"] as const;

const DEFAULT_CUSTOM: CustomPermissions = {
  allowedPaths: ["/", "/purchase-orders", "/shipments"],
  readOnly: false,
  hidePrices: false,
};

// ─── Custom Permission Picker ─────────────────────────────────────────────────
function CustomPermPicker({
  value,
  onChange,
}: {
  value: CustomPermissions;
  onChange: (v: CustomPermissions) => void;
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
    if (allOn) {
      onChange({ ...value, allowedPaths: value.allowedPaths.filter(p => !groupPaths.includes(p)) });
    } else {
      const merged = [...new Set([...value.allowedPaths, ...groupPaths])];
      onChange({ ...value, allowedPaths: merged });
    }
  };

  return (
    <div
      className="rounded-xl p-4 mt-2"
      style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.20)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Settings2 size={13} style={{ color: "#2563eb" }} />
        <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#2563eb" }}>
          Module Access
        </span>
      </div>

      {/* Module checkboxes grouped */}
      <div className="flex flex-col gap-3 mb-4">
        {MODULE_GROUPS.map(group => {
          const mods = ALL_MODULES.filter(m => m.group === group);
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
                  {allOn && <Check size={9} color="#fff" strokeWidth={3} />}
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

      {/* Extra options */}
      <div
        className="flex flex-col gap-2 pt-3"
        style={{ borderTop: "1px solid rgba(148,163,184,0.20)" }}
      >
        <label className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: "rgba(71,85,105,0.75)" }}>
          Restrictions
        </label>
        {[
          { key: "readOnly",   label: "Read-only mode",  desc: "Cannot create, edit, or delete anything" },
          { key: "hidePrices", label: "Hide prices",     desc: "Prices are hidden across all modules"    },
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
                className="w-8 h-4.5 rounded-full flex items-center transition-all flex-shrink-0 relative"
                style={{
                  background: on ? "#ef4444" : "rgba(255,255,255,0.15)",
                  width: 32,
                  height: 18,
                }}
              >
                <div
                  className="absolute rounded-full transition-all"
                  style={{
                    width: 12,
                    height: 12,
                    background: "#ffffff",
                    left: on ? 16 : 4,
                    top: 3,
                  }}
                />
              </div>
              <div>
                <div className="text-[12px] font-bold" style={{ color: on ? "#b91c1c" : "#1e293b" }}>
                  {opt.label}
                </div>
                <div className="text-[10px] font-semibold" style={{ color: "rgba(71,85,105,0.75)" }}>
                  {opt.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function UserManagement() {
  const { currentUser, canManageUsers } = useRole();

  const isDeveloper = currentUser?.role === "developer";
  const availableRoles = isDeveloper
    ? ROLES
    : ROLES.filter(r => r.value !== "developer");

  const [users, setUsers]         = useState<AppUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole]   = useState<UserRole>("viewer");
  const [editName, setEditName]   = useState("");
  const [editCustomPerms, setEditCustomPerms] = useState<CustomPermissions>(DEFAULT_CUSTOM);
  const [form, setForm] = useState({ email: "", name: "", role: "viewer" as UserRole, password: "" });
  const [customPerms, setCustomPerms] = useState<CustomPermissions>(DEFAULT_CUSTOM);
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/users")
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.email) { setError("Email is required."); return; }
    if (!form.password) { setError("Password is required."); return; }
    if (form.role === "custom" && customPerms.allowedPaths.length === 0) {
      setError("Select at least one module for a custom role.");
      return;
    }
    setSaving(true); setError("");
    const body: any = {
      email: form.email,
      name: form.name || undefined,
      role: form.role,
      password: form.password,
      invitedBy: currentUser?.email,
    };
    if (form.role === "custom") {
      body.customPermissions = JSON.stringify(customPerms);
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to add user."); setSaving(false); return; }
    setAdding(false);
    setForm({ email: "", name: "", role: "viewer", password: "" });
    setCustomPerms(DEFAULT_CUSTOM);
    load();
    setSaving(false);
  };

  const handleEdit = async (id: number) => {
    setSaving(true);
    const body: any = { role: editRole, name: editName };
    if (editRole === "custom") {
      body.customPermissions = JSON.stringify(editCustomPerms);
    } else {
      body.customPermissions = null;
    }
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditingId(null);
    load();
    setSaving(false);
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
      setEditCustomPerms(u.customPermissions ? JSON.parse(u.customPermissions) : DEFAULT_CUSTOM);
    } catch {
      setEditCustomPerms(DEFAULT_CUSTOM);
    }
  };

  const getCustomSummary = (u: AppUser) => {
    if (u.role !== "custom" || !u.customPermissions) return null;
    try {
      const cp: CustomPermissions = JSON.parse(u.customPermissions);
      const labels = cp.allowedPaths
        .map(p => ALL_MODULES.find(m => m.path === p)?.label)
        .filter(Boolean);
      const extras: string[] = [];
      if (cp.readOnly) extras.push("read-only");
      if (cp.hidePrices) extras.push("no prices");
      return [...labels, ...extras].join(", ");
    } catch {
      return null;
    }
  };

  if (!canManageUsers) {
    return (
      <Layout>
        <Header title="User Management" />
        <div className="flex-1 flex items-center justify-center px-6 py-8" style={{ background: "transparent" }}>
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
          {/* Header row */}
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
              <Plus size={14} />
              Add User
            </button>
          </div>

          {/* Add form */}
          {adding && (
            <div className="px-6 py-4" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
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
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
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

              {/* Custom permissions picker */}
              {form.role === "custom" && (
                <CustomPermPicker value={customPerms} onChange={setCustomPerms} />
              )}

              {error && <p className="mt-2 text-[12px] font-bold" style={{ color: "#f87171" }}>{error}</p>}
            </div>
          )}

          {/* User rows */}
          {loading ? (
            <div className="text-center py-12 text-[13px] font-semibold" style={{ color: "rgba(71,85,105,0.80)" }}>Loading…</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-[13px] font-semibold" style={{ color: "rgba(71,85,105,0.80)" }}>No users yet — add one above.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              {users.map(u => (
                <div key={u.id}>
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

                    {/* Name + email + custom summary */}
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
                      {u.role === "custom" && !editingId && (() => {
                        const summary = getCustomSummary(u);
                        return summary ? (
                          <div className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: "rgba(37,99,235,0.80)" }}>
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
                          onChange={e => setEditRole(e.target.value as UserRole)}
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
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.22)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.12)"; }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline custom permission picker when editing a custom role user */}
                  {editingId === u.id && editRole === "custom" && (
                    <div className="px-6 pb-5">
                      <CustomPermPicker value={editCustomPerms} onChange={setEditCustomPerms} />
                    </div>
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
