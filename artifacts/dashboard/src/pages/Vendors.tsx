import { useState, useMemo, Fragment } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListVendors, useDeleteVendor, getListVendorsQueryKey, useListBills, useListPurchaseOrders } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, ChevronDown, ChevronUp, Building2, ShoppingCart, CreditCard, X, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import VendorModal from "@/components/VendorModal";

type Vendor = {
  id: number; name: string; company?: string | null; email?: string | null;
  phone?: string | null; address?: string | null; city?: string | null;
  state?: string | null; zipCode?: string | null; country?: string | null;
  shippingAccountNumber?: string | null; notes?: string | null;
};

const PO_STATUS_MAP: Record<string, string> = {
  draft:     "text-slate-500 bg-slate-50 border-slate-200",
  sent:      "text-blue-700 bg-blue-50 border-blue-200",
  received:  "text-purple-700 bg-purple-50 border-purple-200",
  fulfilled: "text-emerald-700 bg-emerald-50 border-emerald-200",
  cancelled: "text-slate-400 bg-slate-50 border-slate-200",
};

const BILL_STATUS_MAP: Record<string, string> = {
  draft:    "text-slate-500 bg-slate-50 border-slate-200",
  received: "text-purple-700 bg-purple-50 border-purple-200",
  paid:     "text-emerald-700 bg-emerald-50 border-emerald-200",
  overdue:  "text-red-700 bg-red-50 border-red-200",
};

export default function Vendors() {
  const { data: vendors, isLoading } = useListVendors();
  const { data: bills } = useListBills();
  const { data: purchaseOrders } = useListPurchaseOrders();
  const deleteVendor = useDeleteVendor();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string>("__all__");

  const debouncedSearch = useDebounce(search, 250);

  const owedByVendor = useMemo(() => {
    const map = new Map<number, number>();
    for (const bill of (bills ?? []) as any[]) {
      if (bill.status === "paid") continue;
      const vid = Number(bill.vendorId);
      if (!vid) continue;
      map.set(vid, (map.get(vid) ?? 0) + Number(bill.total ?? bill.amount ?? 0));
    }
    return map;
  }, [bills]);

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    for (const v of (vendors ?? []) as any[]) {
      const co = v.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort();
  }, [vendors]);

  const filtered = useMemo(() => {
    const s = debouncedSearch.toLowerCase();
    return (vendors ?? []).filter((v: any) => {
      if (companyFilter !== "__all__" && (v.company?.trim() ?? "") !== companyFilter) return false;
      if (!s) return true;
      return (
        v.name.toLowerCase().includes(s) ||
        (v.company ?? "").toLowerCase().includes(s) ||
        v.email?.toLowerCase().includes(s) ||
        v.phone?.toLowerCase().includes(s)
      );
    });
  }, [vendors, debouncedSearch, companyFilter]);

  const vendorPOs = useMemo(() => {
    if (selectedVendorId === null) return [];
    return (purchaseOrders ?? [] as any[]).filter((po: any) => Number(po.vendorId) === selectedVendorId);
  }, [purchaseOrders, selectedVendorId]);

  const vendorBills = useMemo(() => {
    if (selectedVendorId === null) return [];
    return (bills ?? [] as any[]).filter((b: any) => Number(b.vendorId) === selectedVendorId);
  }, [bills, selectedVendorId]);

  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView] = useState<"pos" | "bills">("pos");

  const poVolumeData = useMemo(() => {
    const by: Record<string, { count: number; total: number }> = {};
    for (const po of (purchaseOrders ?? []) as any[]) {
      const name = po.vendorName || "Unknown";
      if (!by[name]) by[name] = { count: 0, total: 0 };
      by[name].count += 1;
      by[name].total += Number(po.total ?? 0);
    }
    return Object.entries(by)
      .map(([name, v]) => ({ name, count: v.count, total: Math.round(v.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total).slice(0, 12);
  }, [purchaseOrders]);

  const billsOwedData = useMemo(() => {
    return Array.from(owedByVendor.entries())
      .map(([vendorId, owed]) => {
        const vendor = (vendors ?? [] as any[]).find((v: any) => Number(v.id) === vendorId);
        return { name: vendor?.company || vendor?.name || `Vendor #${vendorId}`, owed: Math.round(owed * 100) / 100 };
      })
      .filter(r => r.owed > 0)
      .sort((a, b) => b.owed - a.owed).slice(0, 12);
  }, [owedByVendor, vendors]);

  const handleDelete = (id: number) => {
    if (confirm("Delete this vendor?")) {
      deleteVendor.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() })
      });
    }
  };

  const toggleDrillIn = (vendorId: number) => {
    setSelectedVendorId(prev => prev === vendorId ? null : vendorId);
  };

  return (
    <Layout>
      <Header title="Vendors" subtitle={`${filtered?.length ?? 0} shown · ${vendors?.length ?? 0} total`} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex-shrink-0 px-5 pt-4 pb-3 flex flex-col gap-4">

        {/* Toolbar */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search vendors..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
            </div>
            {uniqueCompanies.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400 flex-shrink-0" />
                <select
                  value={companyFilter}
                  onChange={e => setCompanyFilter(e.target.value)}
                  className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400 transition-colors cursor-pointer"
                >
                  <option value="__all__">All Companies</option>
                  {uniqueCompanies.map(co => (
                    <option key={co} value={co}>{co}</option>
                  ))}
                </select>
                {companyFilter !== "__all__" && (
                  <button
                    onClick={() => setCompanyFilter("__all__")}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    title="Clear company filter"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setShowCharts(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${showCharts ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <BarChart2 size={14} /> {showCharts ? "Hide Charts" : "Analytics"}
            {showCharts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200">
            <Plus size={14} /> Add Vendor
          </button>
        </div>

        {/* Analytics panel */}
        {showCharts && (
          <div className="glass-card p-5 flex flex-col gap-4 max-h-[min(42vh,520px)] overflow-y-auto">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {([
                  { v: "pos", label: "PO Volume & Spend" },
                  { v: "bills", label: "Bills Owed" },
                ] as const).map(({ v, label }, idx) => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`px-3.5 py-2 text-xs font-semibold transition-colors ${idx > 0 ? "border-l border-slate-200" : ""} ${chartView === v ? "bg-violet-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-auto">{vendors?.length ?? 0} vendors</span>
            </div>

            {chartView === "pos" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Total PO Spend by Vendor</p>
                  {poVolumeData.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No PO data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={poVolumeData} margin={{ top: 4, right: 8, bottom: 50, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} width={48} />
                        <Tooltip formatter={(v: any, n: string) => [n === "total" ? `$${Number(v).toFixed(2)}` : v, n === "total" ? "Total Spend" : "PO Count"]} />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]} name="total">
                          {poVolumeData.map((_: any, i: number) => (
                            <Cell key={i} fill={["#8b5cf6","#7c3aed","#a78bfa","#6d28d9","#c4b5fd","#ddd6fe","#6366f1","#4f46e5","#818cf8","#a5b4fc","#4338ca","#3730a3"][i % 12]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[200px] max-w-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Vendor Rankings</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100 max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(139,92,246,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Vendor</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">POs</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poVolumeData.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-violet-50/30"}>
                            <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{i+1}</td>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[120px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{r.count}</td>
                            <td className="px-3 py-2 text-right font-semibold text-violet-600">${r.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Outstanding Bills Owed to Vendors</p>
                  {billsOwedData.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No unpaid bills.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={billsOwedData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Owed"]} />
                        <Bar dataKey="owed" radius={[0, 4, 4, 0]}>
                          {billsOwedData.map((_: any, i: number) => (
                            <Cell key={i} fill={i === 0 ? "#ef4444" : i < 3 ? "#f97316" : "#f59e0b"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[180px] max-w-xs">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Bills Owed</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(239,68,68,0.07)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Vendor</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Owed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billsOwedData.length === 0 ? (
                          <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400">All bills paid!</td></tr>
                        ) : billsOwedData.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-red-50/30"}>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[150px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-red-600">${r.owed.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 px-1">
                    <p className="text-xs text-slate-400">Total owed: <span className="font-semibold text-red-600">${billsOwedData.reduce((s, r) => s + r.owed, 0).toFixed(2)}</span></p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Vendor Table */}
        <div className="flex-1 min-h-0 px-5 pb-4 flex flex-col">
        <div className="glass-card flex-1 min-h-0 flex flex-col overflow-hidden border border-blue-100/70">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No vendors found.</div>
          ) : (
            <>
            <div className="flex-shrink-0 px-4 py-2 border-b border-blue-100 bg-blue-50/90 text-xs text-slate-600 flex items-center justify-between">
              <span>Showing <strong className="text-slate-800">{filtered.length}</strong> vendor{filtered.length !== 1 ? "s" : ""}</span>
              <span className="text-slate-400">Scroll the list below to see all</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-blue-100 bg-blue-50/95">
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Location</th>
                  <th className="px-5 py-3 text-right text-blue-700 font-medium text-[11px] uppercase tracking-wider">Amount Owed</th>
                  <th className="px-5 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map((v: any) => {
                  const owed = owedByVendor.get(Number(v.id)) ?? 0;
                  const isExpanded = selectedVendorId === v.id;
                  const poCount = (purchaseOrders ?? [] as any[]).filter((po: any) => Number(po.vendorId) === v.id).length;
                  const billCount = (bills ?? [] as any[]).filter((b: any) => Number(b.vendorId) === v.id).length;
                  return (
                    <Fragment key={v.id}>
                      <tr
                        className={`border-b border-slate-100 hover:bg-blue-50/50 transition-colors group cursor-pointer ${isExpanded ? "bg-blue-50/40 border-b-0" : ""}`}
                        onClick={() => toggleDrillIn(v.id)}
                      >
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="text-slate-800 font-semibold">{v.company || v.name}</p>
                            {v.company && v.company !== v.name && (
                              <p className="text-slate-400 text-xs mt-0.5">{v.name}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">{v.email || "—"}</td>
                        <td className="px-5 py-3.5 text-slate-500">{v.phone || "—"}</td>
                        <td className="px-5 py-3.5 text-slate-500">{[v.city, v.state].filter(Boolean).join(", ") || "—"}</td>
                        <td className="px-5 py-3.5 text-right">
                          {owed > 0 ? (
                            <span className="text-red-600 font-semibold">{formatCurrency(owed)}</span>
                          ) : (
                            <span className="text-emerald-600 font-medium text-xs">Settled</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {(poCount > 0 || billCount > 0) && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleDrillIn(v.id); }}
                                title={isExpanded ? "Collapse" : "View orders & bills"}
                                className={`p-1.5 rounded-lg transition-all text-xs flex items-center gap-1 ${isExpanded ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
                              >
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                                <MoreHorizontal size={14} className="text-slate-500" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[130px]">
                                <DropdownMenuItem onClick={() => setEditingVendor(v as Vendor)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDelete(v.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`drill-${v.id}`} className="border-b border-blue-100">
                          <td colSpan={6} className="px-5 pb-5 pt-0 bg-blue-50/30">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">

                              {/* Purchase Orders */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <ShoppingCart size={12} className="text-indigo-500" />
                                  <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">Purchase Orders</span>
                                  <span className="ml-auto text-[11px] text-slate-400">{vendorPOs.length} total</span>
                                </div>
                                {vendorPOs.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic px-1">No purchase orders for this vendor.</p>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {vendorPOs.map((po: any) => (
                                      <div key={po.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-3 py-2">
                                        <span className="font-mono text-[11px] text-slate-500 flex-shrink-0">
                                          FRZPO-{po.id.toString().padStart(4, "0")}
                                        </span>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize flex-shrink-0 ${PO_STATUS_MAP[po.status] ?? PO_STATUS_MAP.draft}`}>
                                          {po.status}
                                        </span>
                                        {po.expectedDate && (
                                          <span className="text-[10px] text-slate-400 flex-shrink-0">Due {formatDate(po.expectedDate)}</span>
                                        )}
                                        <span className="ml-auto text-xs font-semibold text-slate-700 flex-shrink-0">{formatCurrency(Number(po.total ?? 0))}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Bills */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <CreditCard size={12} className="text-amber-500" />
                                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Bills</span>
                                  <span className="ml-auto text-[11px] text-slate-400">{vendorBills.length} total</span>
                                </div>
                                {vendorBills.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic px-1">No bills for this vendor.</p>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {vendorBills.map((bill: any) => (
                                      <div key={bill.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-3 py-2">
                                        <span className="font-mono text-[11px] text-slate-500 flex-shrink-0">
                                          BILL-{bill.id.toString().padStart(4, "0")}
                                        </span>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize flex-shrink-0 ${BILL_STATUS_MAP[bill.status] ?? BILL_STATUS_MAP.draft}`}>
                                          {bill.status}
                                        </span>
                                        {bill.dueDate && (
                                          <span className="text-[10px] text-slate-400 flex-shrink-0">Due {formatDate(bill.dueDate)}</span>
                                        )}
                                        <span className="ml-auto text-xs font-semibold text-slate-700 flex-shrink-0">{formatCurrency(Number(bill.total ?? bill.amount ?? 0))}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>
        </div>
      </div>
      {showModal && <VendorModal onClose={() => setShowModal(false)} />}
      {editingVendor && (
        <VendorModal vendor={editingVendor} onClose={() => setEditingVendor(null)} />
      )}
    </Layout>
  );
}
