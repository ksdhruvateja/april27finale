import { useState, useMemo, useEffect } from "react";
import ShipmentModal from "@/components/ShipmentModal";
import { useListAuctions } from "@/lib/auctions-api";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListShipments, useUpdateShipment, getListShipmentsQueryKey, useListCustomers, useListVendors } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Truck, FileText, BarChart2, ChevronDown, ChevronUp, ChevronRight, Package, StickyNote, MapPin, Phone, Mail, User } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import { downloadCsv, downloadPdfFromHtml } from "@/lib/export-utils";
import { printShippingSlip, fetchCompanyAddresses, CompanyAddress } from "@/lib/print-slip";

const STATUS_MAP: Record<string, string> = {
  delivered: "text-emerald-700 bg-emerald-50 border-emerald-200",
  shipped:   "text-blue-700   bg-blue-50   border-blue-200",
  returned:  "text-red-600    bg-red-50    border-red-200",
  pending:   "text-slate-500  bg-slate-50  border-slate-200",
};

export default function Shipments() {
  const { data: shipments, isLoading } = useListShipments();
  const { data: auctionList } = useListAuctions();
  const { data: customers = [] } = useListCustomers();
  const { data: vendors = [] } = useListVendors();
  const updateShipment = useUpdateShipment();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView]   = useState<"carrier"|"status"|"customer"|"trend">("carrier");
  const [expandedShipId, setExpandedShipId] = useState<number | null>(null);
  const [companyAddresses, setCompanyAddresses] = useState<CompanyAddress[]>([]);
  const [addrPicker, setAddrPicker] = useState<{ shipment: any } | null>(null);
  const [createShipOpen, setCreateShipOpen] = useState(false);
  const [createShipCustomer, setCreateShipCustomer] = useState<{ id: number; name: string } | null>(null);
  const [createShipSearch, setCreateShipSearch] = useState("");

  useEffect(() => {
    fetchCompanyAddresses().then(setCompanyAddresses);
  }, []);

  const customerById = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of (customers as any[])) m.set(Number(c.id), c);
    return m;
  }, [customers]);

  const vendorById = useMemo(() => {
    const m = new Map<number, any>();
    for (const v of (vendors as any[])) m.set(Number(v.id), v);
    return m;
  }, [vendors]);

  const auctionByShipmentId = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of (auctionList ?? [])) {
      for (const id of (a.shipmentIds ?? [])) map.set(Number(id), a.projectName || `Auction #${a.id}`);
    }
    return map;
  }, [auctionList]);

  const q = search.trim().toLowerCase();
  const filtered = (shipments ?? [])
    .filter((s: any) => {
      if (!q) return true;
      return [
        s.customerName,
        s.trackingNumber,
        s.carrier,
        s.status,
        s.notes,
        s.internalNote,
        `SHP-${String(s.id ?? "").padStart(4, "0")}`,
        String(s.id ?? ""),
      ].some(v => String(v ?? "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return (b.id ?? 0) - (a.id ?? 0);
    });

  /* ── Analytics data ──────────────────────────────── */
  const shipCarrierData = useMemo(() => {
    const by: Record<string,number> = {};
    for (const s of (shipments??[]) as any[]) { const k = s.carrier||"Unknown"; by[k]=(by[k]??0)+1; }
    const COLS = ["#6366f1","#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6"];
    return Object.entries(by).map(([name,count],i) => ({ name, count, fill:COLS[i%COLS.length] }))
      .sort((a,b) => b.count - a.count);
  }, [shipments]);

  const shipStatusData = useMemo(() => {
    const by: Record<string,number> = {};
    for (const s of (shipments??[]) as any[]) { const k = s.status||"pending"; by[k]=(by[k]??0)+1; }
    const COLS: Record<string,string> = { delivered:"#10b981", shipped:"#3b82f6", returned:"#ef4444", pending:"#94a3b8" };
    return Object.entries(by).map(([name,count]) => ({ name, count, fill:COLS[name]??"#94a3b8" }));
  }, [shipments]);

  const shipCustomerData = useMemo(() => {
    const by: Record<string,number> = {};
    for (const s of (shipments??[]) as any[]) { const k = s.customerName||"Unknown"; by[k]=(by[k]??0)+1; }
    return Object.entries(by).map(([name,count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count).slice(0,12);
  }, [shipments]);

  const shipMonthlyData = useMemo(() => {
    const by: Record<string,{total:number;delivered:number}> = {};
    for (const s of (shipments??[]) as any[]) {
      const mo = (s.createdAt||"").slice(0,7)||"Unknown";
      if (!by[mo]) by[mo] = { total:0, delivered:0 };
      by[mo].total++;
      if (s.status==="delivered") by[mo].delivered++;
    }
    return Object.entries(by).filter(([m]) => m!=="Unknown").sort(([a],[b]) => a.localeCompare(b))
      .map(([month,v]) => ({ month: new Date(month+"-01").toLocaleDateString("en-US",{month:"short",year:"2-digit"}), ...v }));
  }, [shipments]);

  const handleUpdateStatus = (id: number) => {
    const status = prompt("New status (pending, shipped, delivered, returned):", "shipped") as "pending" | "shipped" | "delivered" | "returned";
    if (status) {
      updateShipment.mutate({ id, data: { status } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() })
      });
    }
  };

  const handlePrintSlip = async (s: any) => {
    if (companyAddresses.length > 1) {
      setAddrPicker({ shipment: s });
      return;
    }
    setPrintingId(s.id);
    try {
      await printShippingSlip(s, companyAddresses[0] ?? null);
    } finally {
      setPrintingId(null);
    }
  };

  const handlePrintSlipWithAddr = async (s: any, addr: CompanyAddress | null) => {
    setAddrPicker(null);
    setPrintingId(s.id);
    try {
      await printShippingSlip(s, addr);
    } finally {
      setPrintingId(null);
    }
  };

  const downloadAllExcel = () => {
    const rows = filtered.map((s) => [
      `SHP-${String(s.id).padStart(4, "0")}`,
      s.customerName,
      s.carrier ?? "",
      s.trackingNumber ?? "",
      formatDate(s.shippedAt),
      s.status,
    ]);
    downloadCsv("shipments.csv", ["Shipment", "Customer", "Carrier", "Tracking Number", "Shipped At", "Status"], rows);
  };

  const downloadAllPdf = () => {
    const tableHtml = `<table><thead><tr><th>Shipment</th><th>Customer</th><th>Carrier</th><th>Tracking Number</th><th>Shipped At</th><th>Status</th></tr></thead><tbody>${
      filtered.map((s) => `<tr><td>SHP-${String(s.id).padStart(4, "0")}</td><td>${s.customerName}</td><td>${s.carrier ?? "—"}</td><td>${s.trackingNumber ?? "—"}</td><td>${formatDate(s.shippedAt)}</td><td>${s.status}</td></tr>`).join("")
    }</tbody></table>`;
    downloadPdfFromHtml("Shipments", tableHtml);
  };

  return (
    <>
    {addrPicker && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setAddrPicker(null)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={16} className="text-slate-600" />
            <h3 className="text-slate-900 font-bold text-base">Choose Ship-From Address</h3>
          </div>
          <p className="text-slate-400 text-xs mb-4">Select which company address to print on this packing slip.</p>
          <div className="flex flex-col gap-2">
            {companyAddresses.map(a => (
              <button key={a.id} onClick={() => handlePrintSlipWithAddr(addrPicker.shipment, a)}
                className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{a.line1}<br/>{[a.city,a.state,a.zip].filter(Boolean).join(", ")}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setAddrPicker(null)} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
        </div>
      </div>
    )}
    <Layout>
      <Header title="Shipments" subtitle={`${shipments?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by customer or tracking #..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadAllExcel} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All Excel
            </button>
            <button onClick={downloadAllPdf} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All PDF
            </button>
            <button onClick={() => setShowCharts(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${showCharts?"bg-teal-600 text-white border-teal-600":"bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              <BarChart2 size={14} /> Analytics {showCharts ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            </button>
            <button onClick={() => setCreateShipOpen(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
              <Plus size={14} /> Create Shipment
            </button>
          </div>
        </div>

        {/* ── Analytics Panel ─────────────────────────────── */}
        {showCharts && (
          <div className="glass-card analytics-panel p-5 flex flex-col gap-4">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Shipments", value: String(shipments?.length??0), color: "text-slate-700" },
                { label: "Delivered", value: String(shipStatusData.find(d=>d.name==="delivered")?.count??0), color: "text-emerald-600" },
                { label: "In Transit", value: String(shipStatusData.find(d=>d.name==="shipped")?.count??0), color: "text-blue-600" },
                { label: "Carriers", value: String(shipCarrierData.length), color: "text-teal-600" },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <Truck size={16} className={k.color} />
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{k.label}</p>
                    <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* View tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
              {(["carrier","status","customer","trend"] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${chartView===v?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                  {v==="carrier"?"By Carrier":v==="status"?"Status Mix":v==="customer"?"By Customer":"Monthly Trend"}
                </button>
              ))}
            </div>

            {chartView === "carrier" && (
              <div className="flex gap-6 items-center">
                <div className="h-56 flex-1">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Shipments by Carrier</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={shipCarrierData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3} label={({name,count}) => `${name}: ${count}`} labelLine={false}>
                        {shipCarrierData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v:any) => [`${v} shipments`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-[160px]">
                  {shipCarrierData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                      <span className="text-xs text-slate-600 flex-1">{d.name}</span>
                      <span className="text-xs font-bold text-slate-700">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chartView === "status" && (
              <div className="flex gap-6 items-center">
                <div className="h-52 flex-1">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Shipment Status Distribution</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={shipStatusData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3} label>
                        {shipStatusData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-[160px]">
                  {shipStatusData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                      <span className="text-xs text-slate-600 capitalize flex-1">{d.name}</span>
                      <span className="text-xs font-bold text-slate-700">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chartView === "customer" && (
              <div className="h-72">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Shipments by Customer</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shipCustomerData} layout="vertical" margin={{ left: 80, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#cbd5e1" width={76} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0,4,4,0]}>
                      {shipCustomerData.map((_,i) => <Cell key={i} fill={`hsl(${175+i*20},60%,${48-i*2}%)`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "trend" && (
              <div className="h-64">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Monthly Shipment Volume vs Delivered</p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={shipMonthlyData} margin={{ left: 10, right: 20, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name="Total Shipped" />
                    <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Delivered" strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        <div className="glass-card">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No shipments found.</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-2 py-3 w-8" />
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Shipment</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Carrier</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Tracking #</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Shipped</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(s => {
                  const isExpanded = expandedShipId === s.id;
                  const cust = customerById.get(Number((s as any).customerId));
                  const pkgData = (() => { try { return (s as any).packageData ? JSON.parse((s as any).packageData) : null; } catch { return null; } })();
                  const shippingAddr = cust?.shippingAddress ?? null;
                  return (
                    <>
                    <tr key={s.id} className={`border-b border-slate-100 transition-colors group ${isExpanded ? "bg-teal-50/50" : "hover:bg-slate-50"}`}>
                      <td className="px-2 py-3.5">
                        <button
                          onClick={() => setExpandedShipId(isExpanded ? null : s.id)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
                          title={isExpanded ? "Collapse details" : "View details"}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-400 font-mono text-xs">SHP-{s.id.toString().padStart(4, "0")}</span>
                          {auctionByShipmentId.has(Number(s.id)) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                              🏷 {auctionByShipmentId.get(Number(s.id))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-800 font-medium">{s.customerName}</td>
                      <td className="px-5 py-3.5 text-slate-500">{s.carrier || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{s.trackingNumber || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(s.shippedAt)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_MAP[s.status] ?? STATUS_MAP.pending}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handlePrintSlip(s)}
                            disabled={printingId === s.id}
                            title="Download Packing Slip"
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all text-xs font-medium disabled:opacity-50 flex-shrink-0"
                          >
                            <FileText size={13} />
                            {printingId === s.id ? "…" : "Packing Slip"}
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                              <MoreHorizontal size={14} className="text-slate-500" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
                              <DropdownMenuItem
                                onClick={() => handlePrintSlip(s)}
                                disabled={printingId === s.id}
                                className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"
                              >
                                <FileText size={13} />
                                {printingId === s.id ? "Generating…" : "Print Shipping Slip"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateStatus(s.id)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Truck size={13} /> Update Status</DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded detail row ── */}
                    {isExpanded && (
                      <tr key={`expand-${s.id}`} className="bg-teal-50/30 border-b border-teal-100">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-3 gap-4">

                            {/* Column 1: Shipment Details */}
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider flex items-center gap-1.5"><Package size={11} /> Shipping Details</p>
                              <div className="bg-white rounded-xl border border-teal-100 p-3 flex flex-col gap-2 text-xs">
                                {(s as any).shippingCost && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400 font-medium">Shipping Cost</span>
                                    <span className="text-slate-800 font-semibold">${Number((s as any).shippingCost).toFixed(2)}</span>
                                  </div>
                                )}
                                {(s as any).labelUrl && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-medium">Shipping Label</span>
                                    <a href={(s as any).labelUrl} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline font-semibold">View Label</a>
                                  </div>
                                )}
                                {(s as any).easyshipShipmentId && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400 font-medium">Easyship ID</span>
                                    <span className="text-slate-600 font-mono text-[10px]">{(s as any).easyshipShipmentId}</span>
                                  </div>
                                )}
                                {pkgData && (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-slate-400 font-medium">Package</span>
                                    <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-[10px] text-slate-600 font-mono whitespace-pre-wrap">{typeof pkgData === "object" ? JSON.stringify(pkgData, null, 2) : String(pkgData)}</div>
                                  </div>
                                )}
                                {s.shippedAt && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400 font-medium">Shipped</span>
                                    <span className="text-slate-600">{formatDate(s.shippedAt)}</span>
                                  </div>
                                )}
                                {(s as any).deliveredAt && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400 font-medium">Delivered</span>
                                    <span className="text-emerald-600 font-semibold">{formatDate((s as any).deliveredAt)}</span>
                                  </div>
                                )}
                                {!((s as any).shippingCost || (s as any).labelUrl || s.shippedAt || (s as any).deliveredAt) && (
                                  <span className="text-slate-400 italic">No additional shipping details.</span>
                                )}
                              </div>
                            </div>

                            {/* Column 2: Notes */}
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5"><StickyNote size={11} /> Notes</p>
                              <div className="bg-white rounded-xl border border-amber-100 p-3 flex flex-col gap-3 text-xs flex-1">
                                {s.notes ? (
                                  <div>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Shipping Notes</span>
                                    <p className="text-slate-700 leading-relaxed">{s.notes}</p>
                                  </div>
                                ) : null}
                                {(s as any).internalNote ? (
                                  <div>
                                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide block mb-1">Internal Note</span>
                                    <p className="text-slate-700 bg-amber-50 rounded-lg px-2.5 py-2 border border-amber-100 leading-relaxed">{(s as any).internalNote}</p>
                                  </div>
                                ) : null}
                                {!s.notes && !(s as any).internalNote && (
                                  <span className="text-slate-400 italic">No notes for this shipment.</span>
                                )}
                              </div>
                            </div>

                            {/* Column 3: Customer/Recipient Details */}
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><User size={11} /> {cust ? "Customer Details" : "Recipient"}</p>
                              <div className="bg-white rounded-xl border border-blue-100 p-3 flex flex-col gap-2 text-xs">
                                {cust ? (
                                  <>
                                    <div className="font-semibold text-slate-800 text-sm">{cust.company || cust.name}</div>
                                    {cust.company && cust.name && <div className="text-slate-500">{cust.name}</div>}
                                    {cust.email && (
                                      <div className="flex items-center gap-1.5 text-slate-600"><Mail size={11} className="text-slate-400" />{cust.email}</div>
                                    )}
                                    {cust.phone && (
                                      <div className="flex items-center gap-1.5 text-slate-600"><Phone size={11} className="text-slate-400" />{cust.phone}</div>
                                    )}
                                    {(shippingAddr || cust.address) && (
                                      <div className="flex items-start gap-1.5 text-slate-600">
                                        <MapPin size={11} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                          {shippingAddr ? (
                                            <>
                                              <div className="font-semibold text-teal-600 text-[10px] uppercase tracking-wide mb-0.5">Shipping Address</div>
                                              <div>{shippingAddr.address || shippingAddr.line1 || ""}</div>
                                              {(shippingAddr.city || shippingAddr.state) && <div>{[shippingAddr.city, shippingAddr.state].filter(Boolean).join(", ")} {shippingAddr.zip || shippingAddr.zipCode || ""}</div>}
                                            </>
                                          ) : (
                                            <>
                                              <div>{cust.address}</div>
                                              {(cust.city || cust.state) && <div>{[cust.city, cust.state].filter(Boolean).join(", ")} {cust.zipCode || ""}</div>}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {cust.shippingCarrierName && (
                                      <div className="flex items-center gap-1.5">
                                        <Truck size={11} className="text-slate-400" />
                                        <span className="text-slate-600">{cust.shippingCarrierName}</span>
                                        {cust.shippingAccountNumber && <span className="text-slate-400 font-mono text-[10px]">#{cust.shippingAccountNumber}</span>}
                                      </div>
                                    )}
                                    {cust.notes && (
                                      <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-slate-600 border border-slate-100 mt-1 leading-relaxed">{cust.notes}</div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-slate-800 font-medium">{s.customerName || "—"}</div>
                                )}
                              </div>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                    </>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    {/* ── Create Shipment — Customer Picker ─────────────────── */}
    {createShipOpen && !createShipCustomer && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => { setCreateShipOpen(false); setCreateShipSearch(""); }}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-slate-800 font-bold text-base">Create Shipment</h3>
            <p className="text-slate-400 text-xs mt-0.5">Select a customer for this shipment</p>
          </div>
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={createShipSearch}
                onChange={e => setCreateShipSearch(e.target.value)}
                placeholder="Search customers…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {(customers as any[])
              .filter((c: any) => {
                const q = createShipSearch.toLowerCase();
                return !q || (c.name || "").toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q);
              })
              .slice(0, 40)
              .map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => { setCreateShipCustomer({ id: c.id, name: c.company || c.name }); setCreateShipSearch(""); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-[hsl(224_50%_15%)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(c.company || c.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.company || c.name}</p>
                    {c.company && <p className="text-xs text-slate-400 truncate">{c.name}</p>}
                  </div>
                </button>
              ))}
            {(customers as any[]).length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No customers found</p>
            )}
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
            <button onClick={() => { setCreateShipOpen(false); setCreateShipSearch(""); }} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Create Shipment — ShipmentModal ────────────────────── */}
    {createShipCustomer && (
      <ShipmentModal
        customerId={createShipCustomer.id}
        customerName={createShipCustomer.name}
        onClose={() => { setCreateShipCustomer(null); setCreateShipOpen(false); }}
      />
    )}
    </Layout>
    </>
  );
}
