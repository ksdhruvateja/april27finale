import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { logAudit } from "@/lib/auditLog";
import { useRole } from "@/context/RoleContext";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListCustomers, useDeleteCustomer, getListCustomersQueryKey, useListInvoices, useListSalesLeads } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Eye, X, Phone, Mail, MapPin, Building2, AlertCircle, BarChart2, ChevronDown, ChevronUp, Gift } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CustomerModal from "@/components/CustomerModal";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string) {
  const r = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

type Customer = {
  id: number; name: string; company?: string | null; email?: string | null;
  emails?: any[] | null; phone?: string | null; phones?: any[] | null;
  address?: string | null; city?: string | null;
  state?: string | null; zipCode?: string | null; country?: string | null;
  shippingAccountNumber?: string | null; notes?: string | null;
  taxExempt?: boolean; accountType?: string | null; creditLimit?: any;
  salesRep?: string | null; taxNumber?: string | null;
  billingAddress?: any; shippingAddress?: any; amountOwed?: number;
};

function CustomerViewModal({ customer, onClose, creditAvailable, salesLeads }: { customer: Customer; onClose: () => void; creditAvailable: number; salesLeads: any[] }) {
  const phones: any[] = customer.phones ?? (customer.phone ? [{ label: "Mobile", number: customer.phone }] : []);
  const emails: any[] = customer.emails ?? (customer.email ? [{ label: "Work", email: customer.email }] : []);

  // Find the matching sales lead by name
  const matchedLead = useMemo(() => {
    if (!customer.salesRep) return null;
    const needle = customer.salesRep.trim().toLowerCase();
    return salesLeads.find((l: any) => {
      const full = `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim().toLowerCase();
      return full === needle;
    }) ?? null;
  }, [customer.salesRep, salesLeads]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{customer.company || customer.name}</h2>
            {customer.company && <p className="text-sm text-slate-400 mt-0.5">{customer.name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {phones.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Phone size={11} /> Phone Numbers</p>
              <div className="space-y-1.5">
                {phones.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 min-w-[52px] text-center">{p.label ?? "Phone"}</span>
                    <span className="text-sm text-slate-700">{p.number ?? p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {emails.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Mail size={11} /> Email Addresses</p>
              <div className="space-y-1.5">
                {emails.map((em: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 min-w-[52px] text-center">{em.label ?? "Email"}</span>
                    <span className="text-sm text-slate-700">{em.email ?? em}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(customer.city || customer.state) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><MapPin size={11} /> Location</p>
              <p className="text-sm text-slate-700">{[customer.address, [customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")}</p>
            </div>
          )}
          {customer.accountType && (
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[11px] text-slate-400 font-semibold uppercase">Account Type</p>
                <p className="text-sm text-slate-700 font-medium mt-0.5">{customer.accountType}</p>
              </div>
              {customer.creditLimit && (
                <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[11px] text-slate-400 font-semibold uppercase">Credit Limit</p>
                  <p className="text-sm text-slate-700 font-medium mt-0.5">${Number(customer.creditLimit).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
          {creditAvailable > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Gift size={15} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Store Credit Available</p>
                <p className="text-lg font-black text-emerald-700 mt-0.5">{formatCurrency(creditAvailable)}</p>
                <p className="text-[11px] text-emerald-500 mt-0.5">Eligible to receive — from approved returns &amp; refunds</p>
              </div>
            </div>
          )}

          {customer.taxExempt !== undefined && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${customer.taxExempt ? "bg-lime-50 text-lime-700 border border-lime-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
              {customer.taxExempt ? "Tax Exempt" : "Taxable"}
            </div>
          )}
          {/* Company Addresses */}
          {Array.isArray((customer as any).companyAddresses) && (customer as any).companyAddresses.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><MapPin size={11} /> Company Addresses</p>
              <div className="flex flex-col gap-2">
                {(customer as any).companyAddresses.map((addr: any) => (
                  <div key={addr.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 mb-1.5">
                      {addr.type}
                    </span>
                    <p className="text-sm text-slate-700">
                      {[addr.address, [addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {customer.salesRep && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Sales Lead
              </p>
              {matchedLead ? (
                <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: "hsl(224 50% 20%)" }}>
                    {customer.salesRep[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-indigo-900">{customer.salesRep}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {matchedLead.email && (
                        <span className="text-[11px] text-indigo-600 flex items-center gap-1 truncate">
                          <Mail size={9} />{matchedLead.email}
                        </span>
                      )}
                      {matchedLead.mobile && (
                        <span className="text-[11px] text-indigo-600 flex items-center gap-1">
                          <Phone size={9} />{matchedLead.mobile}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-700">{customer.salesRep}</p>
              )}
            </div>
          )}
          {customer.shippingAccountNumber && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Shipping Account #</p>
              <p className="text-sm text-slate-700">{customer.shippingAccountNumber}</p>
            </div>
          )}
          {customer.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const { data: customers, isLoading } = useListCustomers();
  const { data: salesLeadsData } = useListSalesLeads();
  const salesLeads: any[] = (salesLeadsData as any[]) ?? [];
  const { data: invoices } = useListInvoices();
  const { data: returnsData } = useQuery<any[]>({
    queryKey: ["returns-refunds"],
    queryFn: () => apiFetch("/api/returns-refunds"),
  });
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();
  const { currentUser } = useRole();
  const auditUser = () => ({ name: currentUser?.name ?? "", email: currentUser?.email ?? "", role: currentUser?.role ?? "unknown" });
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView] = useState<"revenue" | "owed" | "type">("revenue");

  const debouncedSearch = useDebounce(search, 250);

  /** Credit available per customer ID (approved / refunded / completed returns) */
  const creditByCustomerId = useMemo(() => {
    const CREDIT_STATUSES = new Set(["approved", "refunded", "completed"]);
    const map: Record<number, number> = {};
    for (const r of (returnsData ?? [])) {
      if (CREDIT_STATUSES.has(r.status) && r.refundAmount != null) {
        map[r.customerId] = (map[r.customerId] ?? 0) + Number(r.refundAmount);
      }
    }
    return map;
  }, [returnsData]);

  /* ── Analytics data ─────────────────────────────────────── */
  const revenueByCustomer = useMemo(() => {
    const by: Record<string, number> = {};
    for (const inv of (invoices ?? []) as any[]) {
      if (inv.status === "paid") {
        const name = inv.customerName || "Unknown";
        by[name] = (by[name] ?? 0) + Number(inv.total ?? 0);
      }
    }
    return Object.entries(by)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total).slice(0, 12);
  }, [invoices]);

  const customerHealthData = useMemo(() => {
    const by: Record<string, { paid: number; outstanding: number }> = {};
    for (const inv of (invoices ?? []) as any[]) {
      const name = inv.customerName || "Unknown";
      if (!by[name]) by[name] = { paid: 0, outstanding: 0 };
      if (inv.status === "paid") by[name].paid += Number(inv.total ?? 0);
      else if (["sent","overdue","partial","payment_hold"].includes(inv.status ?? "")) by[name].outstanding += Number(inv.total ?? 0);
    }
    return Object.entries(by)
      .map(([name, v]) => ({
        name, paid: Math.round(v.paid * 100) / 100,
        outstanding: Math.round(v.outstanding * 100) / 100,
        total: Math.round((v.paid + v.outstanding) * 100) / 100,
      }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total).slice(0, 10);
  }, [invoices]);

  const owedByCustomer = useMemo(() => {
    const by: Record<string, number> = {};
    for (const c of (customers ?? []) as any[]) {
      const owed = Number(c.amountOwed ?? 0);
      if (owed > 0) by[c.company || c.name || "Unknown"] = owed;
    }
    return Object.entries(by)
      .map(([name, owed]) => ({ name, owed: Math.round(owed * 100) / 100 }))
      .sort((a, b) => b.owed - a.owed).slice(0, 12);
  }, [customers]);

  const accountTypePie = useMemo(() => {
    const by: Record<string, number> = {};
    for (const c of (customers ?? []) as any[]) {
      const t = (c as any).accountType || "Standard";
      by[t] = (by[t] ?? 0) + 1;
    }
    const COLORS = ["#3b82f6","#6366f1","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6"];
    return Object.entries(by).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
  }, [customers]);
  const filtered = useMemo(() => {
    const s = debouncedSearch.toLowerCase();
    if (!s) return customers ?? [];
    return (customers ?? []).filter(c =>
      c.name.toLowerCase().includes(s) ||
      (c.company ?? "").toLowerCase().includes(s) ||
      (c.email ?? "").toLowerCase().includes(s) ||
      (c.phone ?? "").includes(s)
    );
  }, [customers, debouncedSearch]);

  const handleDelete = (id: number) => {
    const c = customers?.find((x: any) => x.id === id);
    if (confirm("Delete this customer?")) {
      deleteCustomer.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          logAudit({ user: auditUser(), action: "deleted", entityType: "customer", entityId: String(id), entityRef: c ? (c.company || c.name) : `#${id}`, description: `Customer deleted: ${c ? (c.company || c.name) : id}` });
        }
      });
    }
  };

  return (
    <Layout>
      <Header title="Customers" subtitle={`${customers?.length ?? 0} total`} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-5 py-4 gap-4 bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex-shrink-0 flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by name, company, email..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCharts(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${showCharts ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <BarChart2 size={14} /> {showCharts ? "Hide Charts" : "Analytics"}
              {showCharts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200">
              <Plus size={14} /> Add Customer
            </button>
          </div>
        </div>

        {/* Analytics panel */}
        {showCharts && (
          <div className="flex-shrink-0 glass-card analytics-panel p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {([
                  { v: "revenue", label: "Revenue Paid" },
                  { v: "owed",    label: "Amount Owed"  },
                  { v: "type",    label: "Account Types"},
                ] as const).map(({ v, label }, idx) => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`px-3.5 py-2 text-xs font-semibold transition-colors ${idx > 0 ? "border-l border-slate-200" : ""} ${chartView === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-auto">{customers?.length ?? 0} customers</span>
            </div>

            {chartView === "revenue" ? (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Customer Payment Health — Paid vs. Outstanding</p>
                {customerHealthData.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No invoice data yet.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(customerHealthData.length * 42, 180)}>
                      <BarChart data={customerHealthData} layout="vertical" margin={{ left: 4, right: 60, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} stroke="#e2e8f0" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} stroke="none" width={120} />
                        <Tooltip formatter={(v: any, name: string) => [`$${Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`, name === "paid" ? "Paid" : "Outstanding"]} />
                        <Legend iconType="circle" iconSize={8} formatter={v => v === "paid" ? "Paid" : "Outstanding"} />
                        <Bar dataKey="paid" name="paid" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                        <Bar dataKey="outstanding" name="outstanding" stackId="a" fill="#f59e0b" radius={[0,4,4,0]}
                          label={{ position: "right", formatter: (v: any, entry: any) => v > 0 ? `$${Number(entry?.value ?? v).toLocaleString()}` : "", fontSize: 10, fill: "#94a3b8" }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 text-xs text-slate-500 pl-1">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Paid</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />Outstanding</span>
                      <span className="ml-auto text-slate-400">Total billed: <strong className="text-slate-600">${customerHealthData.reduce((s,d)=>s+d.total,0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}</strong></span>
                    </div>
                  </>
                )}
              </div>
            ) : chartView === "owed" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Outstanding Balance by Customer</p>
                  {owedByCustomer.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No outstanding balances.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={owedByCustomer} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Owed"]} />
                        <Bar dataKey="owed" radius={[0, 4, 4, 0]}>
                          {owedByCustomer.map((_: any, i: number) => (
                            <Cell key={i} fill={i === 0 ? "#ef4444" : i < 3 ? "#f97316" : "#f59e0b"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[180px] max-w-xs">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Balances Summary</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(239,68,68,0.07)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Customer</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Owed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {owedByCustomer.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-red-50/30"}>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-red-600">${r.owed.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 px-1">
                    <p className="text-xs text-slate-400">Total owed: <span className="font-semibold text-red-600">${owedByCustomer.reduce((s, r) => s + r.owed, 0).toFixed(2)}</span></p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-6 flex-wrap items-center">
                <div className="flex-shrink-0">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Account Type Distribution</p>
                  <ResponsiveContainer width={240} height={200}>
                    <PieChart>
                      <Pie data={accountTypePie} cx="50%" cy="50%" outerRadius={88} dataKey="value" nameKey="name" paddingAngle={3}>
                        {accountTypePie.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, n: string) => [v, n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3 min-w-[200px]">
                  {accountTypePie.map((entry: any) => (
                    <div key={entry.name} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                      <div>
                        <p className="text-[10px] text-slate-400 truncate max-w-[80px]">{entry.name}</p>
                        <p className="text-xl font-bold text-slate-700 leading-tight">{entry.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="glass-card flex-1 min-h-0 flex flex-col overflow-hidden border border-blue-100/70">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No customers found.</div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-blue-100 bg-blue-50/95">
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Name / Company</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Account Type</th>
                  <th className="px-5 py-3 text-right text-blue-700 font-medium text-[11px] uppercase tracking-wider">Amount Owed</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(c => {
                  const phones: any[] = (c as any).phones ?? (c.phone ? [{ label: "Mobile", number: c.phone }] : []);
                  const emails: any[] = (c as any).emails ?? (c.email ? [{ label: "Work", email: c.email }] : []);
                  const credit = creditByCustomerId[c.id] ?? 0;
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => setViewingCustomer(c as Customer)}>
                      <td className="px-5 py-3.5">
                        <p className="text-slate-800 font-semibold">{c.company || c.name}</p>
                        {c.company && <p className="text-xs text-slate-400 mt-0.5">{c.name}</p>}
                        {credit > 0 && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                            <Gift size={9} /> {formatCurrency(credit)} credit
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {emails.length === 0 ? <span className="text-slate-400">—</span> : (
                          <div className="space-y-0.5">
                            {emails.slice(0, 2).map((em: any, i: number) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium text-indigo-500">{em.label ?? "Email"}</span>
                                <span className="text-slate-600 text-xs">{em.email ?? em}</span>
                              </div>
                            ))}
                            {emails.length > 2 && <p className="text-[10px] text-slate-400">+{emails.length - 2} more</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {phones.length === 0 ? <span className="text-slate-400">—</span> : (
                          <div className="space-y-0.5">
                            {phones.slice(0, 2).map((ph: any, i: number) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium text-blue-500">{ph.label ?? "Phone"}</span>
                                <span className="text-slate-600 text-xs">{ph.number ?? ph}</span>
                              </div>
                            ))}
                            {phones.length > 2 && <p className="text-[10px] text-slate-400">+{phones.length - 2} more</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {(c as Customer).accountType ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{(c as Customer).accountType}</span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {(() => {
                          const owed = (c as Customer).amountOwed ?? 0;
                          if (owed === 0) return <span className="text-slate-400 text-xs">—</span>;
                          return (
                            <span className="flex items-center justify-end gap-1 text-sm font-semibold text-red-600">
                              <AlertCircle size={11} className="text-red-400" />
                              {formatCurrency(owed)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[130px]">
                            <DropdownMenuItem onClick={() => setViewingCustomer(c as Customer)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Eye size={13} /> View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingCustomer(c as Customer)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(c.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
      {editingCustomer && <CustomerModal customer={editingCustomer} onClose={() => setEditingCustomer(null)} />}
      {viewingCustomer && <CustomerViewModal customer={viewingCustomer} onClose={() => setViewingCustomer(null)} creditAvailable={creditByCustomerId[viewingCustomer.id] ?? 0} salesLeads={salesLeads} />}
    </Layout>
  );
}
