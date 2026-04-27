import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetDashboardStats, useListQuotes, useListInvoices,
  useListPurchaseOrders, useListBills, useListShipments, useListCustomers, useListVendors,
} from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Users, Store, Package, AlertCircle, Receipt, CreditCard,
  Activity, ChevronRight, X, FileText, ShoppingCart, Truck,
  Link2, CheckCircle2, Clock, Circle,
} from "lucide-react";

function matchDoc(term: string, id: number, ...names: (string | undefined | null)[]): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  const padded = id.toString().padStart(4, "0");
  if (padded.includes(t)) return true;
  return names.some(n => n?.toLowerCase().includes(t));
}

const DATE_FILTER_OPTIONS = [
  { label: "Next 2 days",  days: 2 },
  { label: "Next 5 days",  days: 5 },
  { label: "Next 7 days",  days: 7 },
  { label: "Next 15 days", days: 15 },
  { label: "Next 30 days", days: 30 },
  { label: "All",          days: 0 },
];

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [receivablesFilter, setReceivablesFilter] = useState(0);
  const [payablesFilter, setPayablesFilter] = useState(0);
  const [, setLocation] = useLocation();
  const refreshMs = 15000;
  const realtimeQuery = {
    query: {
      refetchInterval: refreshMs,
      refetchIntervalInBackground: true,
    },
  } as const;
  const { data: stats, isLoading } = useGetDashboardStats(realtimeQuery);
  const { data: quotes } = useListQuotes(realtimeQuery);
  const { data: invoices } = useListInvoices(realtimeQuery);
  const { data: purchaseOrders } = useListPurchaseOrders(realtimeQuery);
  const { data: bills } = useListBills(realtimeQuery);
  const { data: shipments } = useListShipments(realtimeQuery);
  const { data: customers } = useListCustomers(realtimeQuery);
  const { data: vendors } = useListVendors(realtimeQuery);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const nowTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const sq = search.trim();

  const journeyInvoices = sq.length >= 2
    ? (invoices ?? []).filter((inv: any) => inv.trackingNumber && inv.trackingNumber.toLowerCase() === sq.toLowerCase())
    : [];

  const journeys = journeyInvoices.map((inv: any) => {
    const quote = inv.quoteId ? (quotes ?? []).find((q: any) => q.id === inv.quoteId) ?? null : null;
    const pos = (purchaseOrders ?? []).filter((po: any) => po.sourceInvoiceId === inv.id);
    const ships = (shipments ?? []).filter((s: any) => s.invoiceId === inv.id);
    return { invoice: inv, quote, purchaseOrders: pos, shipments: ships };
  });

  const searchResults = sq ? {
    quotes:         (quotes ?? []).filter((r: any) => matchDoc(sq, r.id, r.customerName)),
    invoices:       (invoices ?? []).filter((r: any) => matchDoc(sq, r.id, r.customerName)),
    purchaseOrders: (purchaseOrders ?? []).filter((r: any) => matchDoc(sq, r.id, r.vendorName, r.poNumber)),
    bills:          (bills ?? []).filter((r: any) => matchDoc(sq, r.id, r.vendorName)),
    shipments:      (shipments ?? []).filter((r: any) => matchDoc(sq, r.id, r.customerName)),
    customers:      (customers ?? []).filter((r: any) => matchDoc(sq, r.id, r.name, r.company, r.email)),
    vendors:        (vendors ?? []).filter((r: any) => matchDoc(sq, r.id, r.name, r.company, r.email)),
  } : null;
  const totalResults = searchResults ? Object.values(searchResults).reduce((s, a) => s + a.length, 0) : 0;
  const shippingDelivered = (shipments ?? []).filter((s: any) => s.status === "delivered").length;
  const shippingShipped = (shipments ?? []).filter((s: any) => s.status === "shipped").length;
  const shippingPending = (shipments ?? []).filter((s: any) => s.status === "pending").length;
  const incomingPurchaseOrders = (purchaseOrders ?? []).filter((po: any) =>
    po.status === "draft" || po.status === "sent",
  ).length;
  const ordersAwaitingPayment = (invoices ?? []).filter((inv: any) =>
    inv.status === "sent" || inv.status === "pending" || inv.status === "overdue",
  ).length;
  const ordersAwaitingInvoiceConversion = (quotes ?? []).filter((q: any) =>
    q.status !== "invoiced" && q.status !== "declined" && q.status !== "expired",
  ).length;
  const receivableInvoiceCount = (invoices ?? []).filter((inv: any) =>
    inv.status === "sent" || inv.status === "pending" || inv.status === "overdue",
  ).length;
  const payableBillCount = (bills ?? []).filter((bill: any) =>
    bill.status === "received" || bill.status === "overdue",
  ).length;
  const overdueBillCount = (bills ?? []).filter((bill: any) => bill.status === "overdue").length;
  const isOverview = activeTab === 0;

  return (
    <Layout>
      <Header
        title="Dashboard"
        subtitle={today}
        tabs={["Overview", "Receivables", "Payables"]}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div className={`flex-1 scrollbar-hide px-4 md:px-5 ${isOverview ? "pb-4 pt-4 gap-3 overflow-hidden" : "pb-8 pt-5 gap-5 overflow-y-auto"} flex flex-col bg-[hsl(220_25%_97%)]`}>
        {searchResults ? (
          <div className="flex flex-col gap-4">
            {journeys.length > 0 && journeys.map((j: any) => (
              <div key={j.invoice.id} className="glass-card overflow-hidden border-indigo-100">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-indigo-100 bg-indigo-50/60">
                  <Link2 size={13} className="text-indigo-500" />
                  <span className="text-indigo-700 text-sm font-semibold">Order Journey</span>
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-bold tracking-wide">{sq}</span>
                  <span className="ml-auto text-slate-400 text-xs">for {j.invoice.customerName}</span>
                </div>
                <div className="px-5 py-4 flex flex-col gap-0">
                  {j.quote && (
                    <JourneyStep
                      icon={<FileText size={13} />}
                      label={`Quote — ${(j.quote as any).quoteNumber ?? `FC - ${Math.max(5100, 5099 + Number(j.quote.id ?? 0))}`}`}
                      sub={`Created ${formatDate(j.quote.createdAt)} · ${formatCurrency(Number(j.quote.total))}`}
                      status={j.quote.status}
                      isFirst
                      href="/quotes"
                    />
                  )}
                  <JourneyStep
                    icon={<Receipt size={13} />}
                    label={`Invoice — ${j.invoice.invoiceNumber ?? `FC - ${Math.max(5100, 5099 + Number(j.invoice.id ?? 0))}`}`}
                    sub={`${j.invoice.dueDate ? `Due ${formatDate(j.invoice.dueDate)} · ` : ""}${formatCurrency(Number(j.invoice.total))}`}
                    status={j.invoice.status}
                    isFirst={!j.quote}
                    href="/invoices"
                  />
                  {j.purchaseOrders.map((po: any, i: number) => (
                    <JourneyStep
                      key={po.id}
                      icon={<ShoppingCart size={13} />}
                      label={`Purchase Order — FRZPO-${po.id.toString().padStart(4,"0")}${j.purchaseOrders.length > 1 ? ` (${i+1}/${j.purchaseOrders.length})` : ""}`}
                      sub={`${po.vendorName} · ${formatCurrency(Number(po.total))}`}
                      status={po.status}
                      href="/purchase-orders"
                    />
                  ))}
                  {j.shipments.map((s: any) => (
                    <JourneyStep
                      key={s.id}
                      icon={<Truck size={13} />}
                      label={`Shipment — SHIP-${s.id.toString().padStart(4,"0")}`}
                      sub={`${s.carrier ? s.carrier + " · " : ""}${s.trackingNumber ?? "No carrier tracking"}`}
                      status={s.status}
                      isLast
                      href="/shipments"
                    />
                  ))}
                  {j.shipments.length === 0 && (
                    <JourneyStep
                      icon={<Truck size={13} />}
                      label="Shipment — Not yet created"
                      sub="No shipment linked to this invoice yet"
                      status="pending"
                      isLast
                      href="/shipments"
                      dim
                    />
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-sm">
                {totalResults === 0 && journeys.length === 0
                  ? <>No results for <span className="font-semibold text-slate-800">"{sq}"</span></>
                  : journeys.length > 0 && totalResults === 0
                  ? <span className="text-indigo-600 text-sm">Order journey found for <span className="font-semibold">"{sq}"</span></span>
                  : <><span className="font-semibold text-slate-800">{totalResults}</span> result{totalResults !== 1 ? "s" : ""} for <span className="font-semibold text-slate-800">"{sq}"</span></>
                }
              </p>
              <button onClick={() => setSearch("")} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-xs transition-colors">
                <X size={12} /> Clear
              </button>
            </div>
            {totalResults === 0 && (
              <div className="glass-card p-10 flex flex-col items-center justify-center gap-2 text-slate-400">
                <FileText size={28} className="opacity-30" />
                <p className="text-sm">No documents or contacts matched your search.</p>
              </div>
            )}
            <SearchGroup label="Quotes" prefix="FC" icon={<FileText size={13}/>} results={searchResults.quotes} href="/quotes"
              renderRow={(r: any) => <SearchRow key={r.id} label={(r as any).quoteNumber ?? `FC - ${Math.max(5100, 5099 + Number(r.id ?? 0))}`} name={r.customerName} total={r.total} status={r.status} href="/quotes" onNavigate={() => setLocation("/quotes")} />} />
            <SearchGroup label="Invoices" prefix="FC" icon={<Receipt size={13}/>} results={searchResults.invoices} href="/invoices"
              renderRow={(r: any) => <SearchRow key={r.id} label={(r as any).invoiceNumber ?? `FC - ${Math.max(5100, 5099 + Number(r.id ?? 0))}`} name={r.customerName} total={r.total} status={r.status} href="/invoices" onNavigate={() => setLocation("/invoices")} />} />
            <SearchGroup label="Purchase Orders" prefix="FRZPO" icon={<ShoppingCart size={13}/>} results={searchResults.purchaseOrders} href="/purchase-orders"
              renderRow={(r: any) => <SearchRow key={r.id} label={`FRZPO-${r.id.toString().padStart(4,"0")}`} name={r.vendorName} total={r.total} status={r.status} href="/purchase-orders" onNavigate={() => setLocation("/purchase-orders")} />} />
            <SearchGroup label="Bills" prefix="BILL" icon={<CreditCard size={13}/>} results={searchResults.bills} href="/bills"
              renderRow={(r: any) => <SearchRow key={r.id} label={`BILL-${r.id.toString().padStart(4,"0")}`} name={r.vendorName} total={r.total} status={r.status} href="/bills" onNavigate={() => setLocation("/bills")} />} />
            <SearchGroup label="Shipments" prefix="SHIP" icon={<Truck size={13}/>} results={searchResults.shipments} href="/shipments"
              renderRow={(r: any) => <SearchRow key={r.id} label={`SHIP-${r.id.toString().padStart(4,"0")}`} name={r.customerName} status={r.status} href="/shipments" onNavigate={() => setLocation("/shipments")} />} />
            <SearchGroup label="Customers" prefix="" icon={<Users size={13}/>} results={searchResults.customers} href="/customers"
              renderRow={(r: any) => <SearchRow key={r.id} label={r.name} name={r.email} href="/customers" onNavigate={() => setLocation("/customers")} />} />
            <SearchGroup label="Vendors" prefix="" icon={<Store size={13}/>} results={searchResults.vendors} href="/vendors"
              renderRow={(r: any) => <SearchRow key={r.id} label={r.name} name={r.email} href="/vendors" onNavigate={() => setLocation("/vendors")} />} />
          </div>
        ) : isLoading || !stats ? (
          <div className="glass-card p-10 flex items-center justify-center">
            <div className="animate-spin w-7 h-7 border-[3px] border-[hsl(224_50%_15%)] border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {activeTab === 0 && (
            <>
            {/* Welcome strip */}
            <div className="glass-card px-4 md:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-[hsl(224_50%_15%)]/4 blur-3xl" />
              </div>
              <div className="relative min-w-0">
                <h2 className="text-slate-900 text-[14px] md:text-[15px] font-extrabold leading-tight">
                  Welcome to Forez Corp &nbsp;—&nbsp; {today}
                </h2>
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-2.5">
              <KpiCard
                label="Cash In"
                value={formatCurrency(stats.cashIn)}
                icon={<TrendingUp size={15} />}
                sub="Collected revenue"
                color="emerald"
              />
              <KpiCard
                label="Cash Out"
                value={formatCurrency(stats.cashOut)}
                icon={<TrendingDown size={15} />}
                sub="Paid expenses"
                color="red"
              />
              <KpiCard
                label="A/R Due"
                value={formatCurrency(stats.arDue)}
                icon={<ArrowUpRight size={15} />}
                sub="Receivables pending"
                color="blue"
              />
              <KpiCard
                label="A/P Due"
                value={formatCurrency(stats.apDue)}
                icon={<ArrowDownRight size={15} />}
                sub="Payables pending"
                color="purple"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="glass-card p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-[13px] font-semibold text-slate-700">Operations Control Center</h3>
                  <span className="text-[11px] text-slate-500">Live refresh every {Math.floor(refreshMs / 1000)}s · {nowTime}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-2">
                    <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-2">Shipping Status</p>
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center justify-between"><span>Delivered</span><span className="font-bold text-emerald-600">{shippingDelivered}</span></div>
                      <div className="flex items-center justify-between"><span>Shipped</span><span className="font-bold text-blue-600">{shippingShipped}</span></div>
                      <div className="flex items-center justify-between"><span>Pending</span><span className="font-bold text-amber-600">{shippingPending}</span></div>
                    </div>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-2">
                    <p className="text-xs text-sky-600 font-semibold uppercase tracking-wide">Total Purchase Orders Incoming</p>
                    <p className="text-xl font-bold text-sky-700 mt-1.5">{incomingPurchaseOrders}</p>
                    <p className="text-xs text-slate-500 mt-1">Draft + Sent purchase orders</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-2">
                    <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Orders Awaiting Payment</p>
                    <p className="text-xl font-bold text-purple-700 mt-1.5">{ordersAwaitingPayment}</p>
                    <p className="text-xs text-slate-500 mt-1">Invoices in sent/pending/overdue</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2">
                    <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Awaiting Invoice Conversion</p>
                    <p className="text-xl font-bold text-emerald-700 mt-1.5">{ordersAwaitingInvoiceConversion}</p>
                    <p className="text-xs text-slate-500 mt-1">Quotes not yet converted</p>
                  </div>
                </div>
              </div>
            </div>
            </>
            )}

            {activeTab === 1 && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700">Receivables Snapshot</h3>
                  <span className="text-xs text-slate-500">Invoices only · Live refresh every {Math.floor(refreshMs / 1000)}s · {nowTime}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                    <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Total Open Receivables</p>
                    <p className="text-2xl font-bold text-blue-700 mt-2">{formatCurrency(Number(stats?.arDue ?? 0) + Number(stats?.arOverdue ?? 0))}</p>
                  </div>
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
                    <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide">Invoices Awaiting Payment</p>
                    <p className="text-2xl font-bold text-indigo-700 mt-2">{receivableInvoiceCount}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                    <p className="text-xs text-rose-600 font-semibold uppercase tracking-wide">Overdue Receivables</p>
                    <p className="text-2xl font-bold text-rose-700 mt-2">{formatCurrency(Number(stats?.arOverdue ?? 0))}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                    <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Collected Revenue</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-2">{formatCurrency(Number(stats?.cashIn ?? 0))}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 2 && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700">Payables Snapshot</h3>
                  <span className="text-xs text-slate-500">Bills only · Live refresh every {Math.floor(refreshMs / 1000)}s · {nowTime}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-3">
                    <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide">Total Open Payables</p>
                    <p className="text-2xl font-bold text-purple-700 mt-2">{formatCurrency(Number(stats?.apDue ?? 0) + Number(stats?.apOverdue ?? 0))}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Bills Awaiting Payment</p>
                    <p className="text-2xl font-bold text-amber-700 mt-2">{payableBillCount}</p>
                  </div>
                  <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-wide">Overdue Bills</p>
                    <p className="text-2xl font-bold text-red-700 mt-2">{overdueBillCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs text-slate-600 font-semibold uppercase tracking-wide">Paid Expenses</p>
                    <p className="text-2xl font-bold text-slate-700 mt-2">{formatCurrency(Number(stats?.cashOut ?? 0))}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Mid row — overview only */}
            {activeTab === 0 && <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
              {/* Alerts */}
              <div className="glass-card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2.5">
                  <Activity size={13} className="text-slate-400" />
                  <span className="text-slate-700 text-sm font-semibold">Needs Attention</span>
                </div>
                <AlertRow icon={<AlertCircle size={13} />} label="Overdue Invoices" value={stats.overdueInvoiceCount} href="/invoices" urgent />
                <AlertRow icon={<CreditCard size={13} />} label="Unpaid Bills" value={stats.unpaidBillCount} href="/bills" />
                <AlertRow icon={<Package size={13} />} label="Low Stock Items" value={stats.lowStockCount} href="/inventory" urgent />
              </div>

              {/* AR vs AP */}
              <div className="glass-card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2.5">
                  <Receipt size={13} className="text-slate-400" />
                  <span className="text-slate-700 text-sm font-semibold">AR vs AP Pipeline</span>
                </div>
                <PipelineBar label="Receivable Due" value={stats.arDue} max={Math.max(stats.arDue, stats.arOverdue, stats.apDue, stats.apOverdue, 1)} color="blue" />
                <PipelineBar label="Receivable Overdue" value={stats.arOverdue} max={Math.max(stats.arDue, stats.arOverdue, stats.apDue, stats.apOverdue, 1)} color="red" />
                <PipelineBar label="Payable Due" value={stats.apDue} max={Math.max(stats.arDue, stats.arOverdue, stats.apDue, stats.apOverdue, 1)} color="navy" />
                <PipelineBar label="Payable Overdue" value={stats.apOverdue} max={Math.max(stats.arDue, stats.arOverdue, stats.apDue, stats.apOverdue, 1)} color="purple" />
              </div>

              {/* Platform */}
              <div className="glass-card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2.5">
                  <Activity size={13} className="text-slate-400" />
                  <span className="text-slate-700 text-sm font-semibold">Platform</span>
                </div>
                <CountRow icon={<Users size={13} />} label="Customers" value={stats.totalCustomers} href="/customers" />
                <CountRow icon={<Store size={13} />} label="Vendors" value={stats.totalVendors} href="/vendors" />
                <CountRow icon={<Package size={13} />} label="Products" value={stats.totalProducts} href="/products" />
                <div className="h-px bg-slate-100 my-2" />
                <div className="flex items-center justify-between px-0">
                  <span className="text-slate-400 text-xs">Net Cash Flow</span>
                  <span className={`text-sm font-bold ${stats.cashIn - stats.cashOut >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {formatCurrency(stats.cashIn - stats.cashOut)}
                  </span>
                </div>
              </div>
            </div>}

            {/* Recent Invoices */}
            {activeTab === 1 && (() => {
              const days = DATE_FILTER_OPTIONS[receivablesFilter]?.days ?? 0;
              const cutoff = days > 0 ? Date.now() + days * 86400000 : Infinity;
              const filtered = (stats.recentInvoices ?? []).filter((inv: any) =>
                days === 0 || (inv.dueDate ? new Date(inv.dueDate).getTime() <= cutoff : true)
              );
              return filtered.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Receipt size={13} className="text-slate-400" />
                      <span className="text-slate-700 text-sm font-semibold">Receivables</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={receivablesFilter}
                        onChange={e => setReceivablesFilter(Number(e.target.value))}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-slate-400"
                      >
                        {DATE_FILTER_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                      </select>
                      <a href="/invoices" className="flex items-center gap-1 text-[hsl(224_50%_30%)] text-xs font-medium hover:underline">
                        View all <ChevronRight size={11} />
                      </a>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Invoice</th>
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Customer</th>
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Due Date</th>
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                        <th className="px-5 py-2.5 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((inv: { id: number; customerName?: string; createdAt: string; status: string; total: number; dueDate?: string | null }) => (
                        <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 text-slate-400 font-mono text-xs">{(inv as any).invoiceNumber ?? `FC - ${Math.max(5100, 5099 + Number(inv.id ?? 0))}`}</td>
                          <td className="px-5 py-3 text-slate-800 font-medium text-sm">{inv.customerName ?? "—"}</td>
                          <td className="px-5 py-3 text-slate-400 text-xs">{formatDate(inv.dueDate)}</td>
                          <td className="px-5 py-3"><StatusBadge status={inv.status} dueDate={inv.dueDate} /></td>
                          <td className="px-5 py-3 text-right text-slate-800 font-semibold text-sm">{formatCurrency(inv.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Recent Bills */}
            {activeTab === 2 && (() => {
              const days = DATE_FILTER_OPTIONS[payablesFilter]?.days ?? 0;
              const cutoff = days > 0 ? Date.now() + days * 86400000 : Infinity;
              const filtered = (stats.recentBills ?? []).filter((bill: any) =>
                days === 0 || (bill.dueDate ? new Date(bill.dueDate).getTime() <= cutoff : true)
              );
              return filtered.length > 0 && (
                <div className="glass-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CreditCard size={13} className="text-slate-400" />
                      <span className="text-slate-700 text-sm font-semibold">Payables</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={payablesFilter}
                        onChange={e => setPayablesFilter(Number(e.target.value))}
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-slate-400"
                      >
                        {DATE_FILTER_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                      </select>
                      <a href="/bills" className="flex items-center gap-1 text-[hsl(224_50%_30%)] text-xs font-medium hover:underline">
                        View all <ChevronRight size={11} />
                      </a>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Bill</th>
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Vendor</th>
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Due Date</th>
                        <th className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                        <th className="px-5 py-2.5 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((bill: { id: number; vendorName?: string; createdAt: string; status: string; total: number; dueDate?: string | null }) => (
                        <tr key={bill.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 text-slate-400 font-mono text-xs">BILL-{bill.id.toString().padStart(4, "0")}</td>
                          <td className="px-5 py-3 text-slate-800 font-medium text-sm">{bill.vendorName ?? "—"}</td>
                          <td className="px-5 py-3 text-slate-400 text-xs">{formatDate(bill.dueDate)}</td>
                          <td className="px-5 py-3"><StatusBadge status={bill.status} dueDate={bill.dueDate} /></td>
                          <td className="px-5 py-3 text-right text-slate-800 font-semibold text-sm">{formatCurrency(bill.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </Layout>
  );
}

function KpiCard({ label, value, icon, sub, color }: {
  label: string; value: string; icon: React.ReactNode; sub: string;
  color: "emerald" | "red" | "blue" | "purple";
}) {
  const map = {
    emerald: { bg: "bg-emerald-50",  icon: "text-emerald-600",  val: "text-emerald-700",  border: "border-emerald-100" },
    red:     { bg: "bg-red-50",      icon: "text-red-500",      val: "text-red-600",      border: "border-red-100" },
    blue:    { bg: "bg-blue-50",     icon: "text-blue-600",     val: "text-blue-700",     border: "border-blue-100" },
    purple:  { bg: "bg-purple-50",   icon: "text-purple-600",   val: "text-purple-700",   border: "border-purple-100" },
  };
  const c = map[color];
  return (
    <div className="glass-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">{label}</span>
        <div className={`w-6 h-6 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
      <div className={`text-xl font-bold leading-tight ${c.val}`}>{value}</div>
      <span className="text-slate-400 text-[11px]">{sub}</span>
    </div>
  );
}

function AlertRow({ icon, label, value, href, urgent }: { icon: React.ReactNode; label: string; value: number; href: string; urgent?: boolean }) {
  const hasIssue = urgent && value > 0;
  return (
    <a href={href} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group">
      <div className="flex items-center gap-2">
        <span className={hasIssue ? "text-red-400" : "text-slate-400"}>{icon}</span>
        <span className="text-slate-600 text-sm group-hover:text-slate-800 transition-colors">{label}</span>
      </div>
      <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${hasIssue ? "text-red-600 bg-red-50" : "text-emerald-700 bg-emerald-50"}`}>
        {value}
      </span>
    </a>
  );
}

function PipelineBar({ label, value, max, color }: { label: string; value: number; max: number; color: "blue" | "red" | "navy" | "purple" }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  const barColor = { blue: "bg-blue-500", red: "bg-red-500", navy: "bg-[hsl(224_50%_15%)]", purple: "bg-purple-500" };
  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex justify-between">
        <span className="text-slate-500 text-xs">{label}</span>
        <span className="text-slate-700 text-xs font-semibold">{formatCurrency(value)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor[color]} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CountRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <a href={href} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-slate-600 text-sm">{label}</span>
      </div>
      <span className="text-slate-800 font-semibold text-sm">{value}</span>
    </a>
  );
}

function SearchGroup({ label, icon, results, renderRow }: {
  label: string; prefix: string; icon: React.ReactNode;
  results: any[]; href: string; renderRow: (r: any) => React.ReactNode;
}) {
  if (results.length === 0) return null;
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
        <span className="text-slate-400">{icon}</span>
        <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-slate-400 text-xs">{results.length} result{results.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {results.map(r => renderRow(r))}
      </div>
    </div>
  );
}

function SearchRow({ label, name, total, status, onNavigate }: {
  label: string; name?: string; total?: number; status?: string; href: string; onNavigate: () => void;
}) {
  const statusMap: Record<string, string> = {
    paid:      "text-emerald-700 bg-emerald-50 border-emerald-200",
    sent:      "text-blue-700 bg-blue-50 border-blue-200",
    draft:     "text-slate-500 bg-slate-50 border-slate-200",
    overdue:   "text-red-700 bg-red-50 border-red-200",
    pending:   "text-blue-700 bg-blue-50 border-blue-200",
    approved:  "text-emerald-700 bg-emerald-50 border-emerald-200",
    accepted:  "text-emerald-700 bg-emerald-50 border-emerald-200",
    rejected:  "text-red-700 bg-red-50 border-red-200",
    declined:  "text-red-700 bg-red-50 border-red-200",
    invoiced:  "text-purple-700 bg-purple-50 border-purple-200",
    received:  "text-purple-700 bg-purple-50 border-purple-200",
    cancelled: "text-slate-400 bg-slate-50 border-slate-200",
    shipped:   "text-indigo-700 bg-indigo-50 border-indigo-200",
  };
  return (
    <button onClick={onNavigate} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
      <span className="font-mono text-xs text-slate-500 min-w-[90px]">{label}</span>
      {name && <span className="text-slate-700 text-sm flex-1 truncate">{name}</span>}
      {status && (
        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${statusMap[status] ?? statusMap.draft}`}>
          {status}
        </span>
      )}
      {total !== undefined && (
        <span className="text-slate-800 font-semibold text-sm flex-shrink-0">{formatCurrency(total)}</span>
      )}
    </button>
  );
}

function JourneyStep({ icon, label, sub, status, isFirst, isLast, href, dim }: {
  icon: React.ReactNode; label: string; sub: string; status: string;
  isFirst?: boolean; isLast?: boolean; href: string; dim?: boolean;
}) {
  const done = ["paid", "accepted", "approved", "received", "delivered", "shipped"].includes(status);
  const active = !done && !dim;
  const dotColor = done ? "bg-emerald-500" : dim ? "bg-slate-200" : "bg-indigo-400";
  const lineColor = "bg-slate-100";
  return (
    <a href={href} className={`flex gap-3 group/step hover:bg-slate-50 rounded-lg transition-colors ${dim ? "opacity-50" : ""}`}>
      <div className="flex flex-col items-center w-6 flex-shrink-0 pt-1">
        <div className={`w-5 h-5 rounded-full ${dotColor} flex items-center justify-center text-white flex-shrink-0 transition-colors`}>
          {done ? <CheckCircle2 size={12} /> : active ? <Clock size={10} /> : <Circle size={10} />}
        </div>
        {!isLast && <div className={`w-px flex-1 min-h-[24px] ${lineColor} my-1`} />}
      </div>
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-slate-400 ${dim ? "" : "group-hover/step:text-slate-600"}`}>{icon}</span>
          <span className={`text-sm font-semibold ${dim ? "text-slate-400" : "text-slate-700"} truncate`}>{label}</span>
          <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${
            done ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
            dim  ? "text-slate-400  bg-slate-50  border-slate-200" :
                   "text-indigo-600 bg-indigo-50 border-indigo-200"
          }`}>{status}</span>
        </div>
        <p className="text-xs text-slate-400 ml-5 mt-0.5 truncate">{sub}</p>
      </div>
    </a>
  );
}

function StatusBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const isOverdue = status === "sent" && dueDate && new Date(dueDate) < new Date();
  const effectiveStatus = isOverdue ? "overdue" : status;
  const map: Record<string, string> = {
    paid:      "text-emerald-700 bg-emerald-50 border-emerald-200",
    sent:      "text-blue-700 bg-blue-50 border-blue-200",
    draft:     "text-slate-500 bg-slate-50 border-slate-200",
    overdue:   "text-red-700 bg-red-50 border-red-200",
    received:  "text-purple-700 bg-purple-50 border-purple-200",
    cancelled: "text-slate-400 bg-slate-50 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[effectiveStatus] ?? map.draft} capitalize`}>
      {effectiveStatus}
    </span>
  );
}
