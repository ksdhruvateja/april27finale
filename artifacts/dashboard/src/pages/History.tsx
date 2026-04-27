import { useState, useMemo, ReactNode } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatDate } from "@/lib/utils";
import { getAuditLog, clearAuditLog, AuditEntry, AuditEntityType } from "@/lib/auditLog";
import {
  Clock, Search, Trash2, FileText, ShoppingCart,
  Receipt, CreditCard, Truck, Headphones,
  Package, Users, Store, ChevronDown, ChevronUp, RefreshCw,
  Hash, User, AlertCircle,
} from "lucide-react";

const ENTITY_META: Record<AuditEntityType, { label: string; color: string; icon: ReactNode }> = {
  po:       { label: "Purchase Order", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <ShoppingCart size={11} /> },
  invoice:  { label: "Invoice",        color: "bg-blue-50 text-blue-700 border-blue-200",       icon: <Receipt size={11} /> },
  quote:    { label: "Quote",          color: "bg-amber-50 text-amber-700 border-amber-200",    icon: <FileText size={11} /> },
  bill:     { label: "Bill",           color: "bg-rose-50 text-rose-700 border-rose-200",       icon: <CreditCard size={11} /> },
  shipment: { label: "Shipment",       color: "bg-sky-50 text-sky-700 border-sky-200",          icon: <Truck size={11} /> },
  ticket:   { label: "Ticket",         color: "bg-teal-50 text-teal-700 border-teal-200",       icon: <Headphones size={11} /> },
  product:  { label: "Product",        color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Package size={11} /> },
  customer: { label: "Customer",       color: "bg-purple-50 text-purple-700 border-purple-200", icon: <Users size={11} /> },
  vendor:   { label: "Vendor",         color: "bg-orange-50 text-orange-700 border-orange-200", icon: <Store size={11} /> },
  other:    { label: "Other",          color: "bg-slate-50 text-slate-600 border-slate-200",    icon: <AlertCircle size={11} /> },
};

const ACTION_LABELS: Record<string, string> = {
  price_adjust:     "Price Adjusted",
  line_items_saved: "Line Items Saved",
  status_change:    "Status Changed",
  billing_reversal: "Billing Reversed",
  created:          "Created",
  deleted:          "Deleted",
  converted:        "Converted",
  note_added:       "Note Added",
  updated:          "Updated",
};

const ENTITY_TYPES: Array<AuditEntityType | "all"> = [
  "all", "po", "invoice", "quote", "bill", "shipment", "ticket", "product", "customer", "vendor", "other",
];

function groupByDate(entries: AuditEntry[]): Array<{ date: string; items: AuditEntry[] }> {
  const map = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const d = e.timestamp.slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(e);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

function formatDateLabel(d: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

export default function History() {
  const [entries, setEntries] = useState<AuditEntry[]>(() => getAuditLog());
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<AuditEntityType | "all">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = () => setEntries(getAuditLog());

  const handleClear = () => {
    if (!confirm("Clear all history? This cannot be undone.")) return;
    clearAuditLog();
    setEntries([]);
  };

  const allUsers = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) seen.add(e.user.email || e.user.name);
    return Array.from(seen).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (userFilter !== "all" && (e.user.email || e.user.name) !== userFilter) return false;
      if (!q) return true;
      return [e.entityRef, e.description, e.user.name, e.user.email, e.action, e.note ?? ""].some(f =>
        f.toLowerCase().includes(q)
      );
    });
  }, [entries, entityFilter, userFilter, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <Layout>
      <Header title="History" subtitle={`${filtered.length} of ${entries.length} events`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search by PO#, Invoice#, Quote#, user, action…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* User filter */}
          <div className="relative">
            <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg pl-8 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400 transition-colors appearance-none"
            >
              <option value="all">All Users</option>
              {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <button onClick={reload} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={handleClear} className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Clear all history">
            <Trash2 size={14} />
          </button>
        </div>

        {/* Entity type tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {ENTITY_TYPES.map(et => {
            const count = et === "all" ? entries.length : entries.filter(e => e.entityType === et).length;
            if (et !== "all" && count === 0) return null;
            const meta = et === "all" ? null : ENTITY_META[et];
            return (
              <button
                key={et}
                onClick={() => setEntityFilter(et)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  entityFilter === et
                    ? et === "all"
                      ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]"
                      : meta!.color + " ring-1 ring-offset-1"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {meta?.icon}
                {et === "all" ? "All" : meta!.label}
                <span className={`text-[10px] px-1.5 rounded-full font-bold ${entityFilter === et ? "bg-white/25 text-inherit" : "bg-slate-100 text-slate-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timeline */}
        {filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Clock size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              {entries.length === 0
                ? "No history recorded yet. Every create, update, delete, and payment across the app will appear here."
                : "No events match your filters."}
            </p>
          </div>
        ) : grouped.map(({ date, items }) => (
          <div key={date} className="flex flex-col gap-2">
            {/* Day header */}
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{formatDateLabel(date)}</p>
              <div className="flex-1 border-t border-slate-100" />
              <span className="text-[10px] text-slate-400 font-medium">{items.length} event{items.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="glass-card flex flex-col divide-y divide-slate-100">
              {items.map(entry => {
                const isExpanded = expandedId === entry.id;
                const meta = ENTITY_META[entry.entityType] ?? ENTITY_META.other;
                return (
                  <div key={entry.id}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${isExpanded ? "bg-slate-50/80" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Time */}
                      <div className="flex-shrink-0 w-14 text-right">
                        <p className="text-[11px] text-slate-400 font-medium">{formatTs(entry.timestamp)}</p>
                      </div>
                      {/* Entity badge */}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${meta.color}`}>
                        {meta.icon} {meta.label}
                      </span>
                      {/* Ref */}
                      {entry.entityRef && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex-shrink-0">
                          <Hash size={9} />{entry.entityRef}
                        </span>
                      )}
                      {/* Description */}
                      <p className="flex-1 text-sm text-slate-700 leading-snug min-w-0">{entry.description}</p>
                      {/* User */}
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-semibold text-slate-600">{entry.user.name || entry.user.email}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{entry.user.role}</p>
                      </div>
                      {/* Expand toggle */}
                      <div className="flex-shrink-0 text-slate-400">
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-3 ml-[5.25rem] flex flex-col gap-2 border-t border-slate-100 pt-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div>
                            <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Action</p>
                            <p className="text-slate-700 font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Entity</p>
                            <p className="text-slate-700">{entry.entityRef || entry.entityId}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">User</p>
                            <p className="text-slate-700">{entry.user.name || entry.user.email}</p>
                            <p className="text-slate-400 text-[10px]">{entry.user.email}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Time</p>
                            <p className="text-slate-700">{formatDate(entry.timestamp)}</p>
                          </div>
                        </div>
                        {entry.note && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">Note</p>
                            <p className="text-xs text-amber-800">{entry.note}</p>
                          </div>
                        )}
                        {entry.meta && Object.keys(entry.meta).length > 0 && (
                          <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Technical Details</p>
                            <pre className="text-[10px] text-slate-600 overflow-x-auto">{JSON.stringify(entry.meta, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
