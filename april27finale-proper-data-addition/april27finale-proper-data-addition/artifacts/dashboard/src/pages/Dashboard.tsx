import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardStats, useListQuotes, useListInvoices,
  useListPurchaseOrders, useListBills, useListShipments, useListCustomers, useListVendors,
} from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Users, Store, Package, AlertCircle, Receipt, CreditCard,
  Activity, ChevronRight, X, FileText, ShoppingCart, Truck,
  Link2, CheckCircle2, Clock, Circle, ArrowLeftRight,
} from "lucide-react";
import {
  forezDocFallbackNumber,
  formatInvoiceNumber,
  formatQuoteNumber,
} from "@/lib/forez-document-numbers";

function matchAny(term: string, ...fields: (string | number | null | undefined)[]): boolean {
  const t = term.toLowerCase().trim();
  if (!t || t.length < 1) return false;
  return fields.some(f => {
    if (f == null) return false;
    return String(f).toLowerCase().includes(t);
  });
}

function invFallbackNum(id: number) { return forezDocFallbackNumber("invoice", id); }
function quoteFallbackNum(id: number) { return forezDocFallbackNumber("quote", id); }

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

  const debouncedSearch = useDebounce(search, 250);

  const realtimeQuery = useMemo(() => ({
    query: {
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
      staleTime: 10000,
      retry: 1,
    },
  }), []);

  const { data: stats, isLoading, error } = useGetDashboardStats(realtimeQuery);
  const { data: quotes } = useListQuotes(realtimeQuery);
  const { data: invoices } = useListInvoices(realtimeQuery);
  const { data: purchaseOrders } = useListPurchaseOrders(realtimeQuery);
  const { data: bills } = useListBills(realtimeQuery);
  const { data: shipments } = useListShipments(realtimeQuery);
  const { data: customers } = useListCustomers(realtimeQuery);
  const { data: vendors } = useListVendors(realtimeQuery);
  const { data: returnsRefunds } = useQuery<any[]>({
    queryKey: ["returns-refunds"],
    queryFn: () => fetch("/api/returns-refunds").then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const nowTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const sq = debouncedSearch.trim();

  // Comprehensive journey lookup: match by ANY reference connected to an invoice
  const journeys = useMemo(() => {
    if (sq.length < 2) return [];
    const sqL = sq.toLowerCase();
    const foundInvIds = new Set<number>();
    const addInv = (inv: any) => { if (inv) foundInvIds.add(inv.id); };

    // Match invoices by: invoice number, fallback number, tracking number, customer name, notes, status, id
    for (const inv of (invoices ?? []) as any[]) {
      const fallback = invFallbackNum(inv.id);
      if (matchAny(sqL,
        inv.id, inv.id.toString().padStart(4, "0"),
        inv.invoiceNumber, fallback, fallback.replace(/\s/g, ""),
        `fc-${inv.id}`, inv.trackingNumber,
        inv.customerName, inv.notes, inv.status, inv.paymentMethod,
      )) { addInv(inv); }
    }
    // Match by quote number / quote tracking → find linked invoice
    for (const q of (quotes ?? []) as any[]) {
      const fallback = quoteFallbackNum(q.id);
      if (matchAny(sqL,
        q.id, q.id.toString().padStart(4, "0"),
        q.quoteNumber, fallback, fallback.replace(/\s/g, ""),
        `fc-${q.id}`, q.trackingNumber,
        q.customerName, q.notes, q.status,
      )) {
        const inv = (invoices ?? [] as any[]).find((i: any) => i.quoteId === q.id);
        addInv(inv);
      }
    }
    // Match by PO number / vendor name → find linked invoice
    for (const po of (purchaseOrders ?? []) as any[]) {
      const poNum = `frzpo-${po.id.toString().padStart(4, "0")}`;
      if (matchAny(sqL,
        po.id, po.id.toString().padStart(4, "0"),
        poNum, po.poNumber, po.vendorName, po.notes, po.status,
      ) && po.sourceInvoiceId) {
        const inv = (invoices ?? [] as any[]).find((i: any) => i.id === po.sourceInvoiceId);
        addInv(inv);
      }
    }
    // Match by shipment tracking / carrier / customer name → find linked invoice
    for (const s of (shipments ?? []) as any[]) {
      const sNum = `ship-${s.id.toString().padStart(4, "0")}`;
      if (matchAny(sqL,
        s.id, s.id.toString().padStart(4, "0"),
        sNum, s.trackingNumber, s.carrier, s.customerName, s.notes, s.status,
      ) && s.invoiceId) {
        const inv = (invoices ?? [] as any[]).find((i: any) => i.id === s.invoiceId);
        addInv(inv);
      }
    }
    // Match by bill vendor → find invoices for that customer (best-effort)
    for (const b of (bills ?? []) as any[]) {
      const bNum = `bill-${b.id.toString().padStart(4, "0")}`;
      if (matchAny(sqL, b.id, b.id.toString().padStart(4, "0"), bNum, b.vendorName, b.notes, b.status)) {
        // Bills link to POs which link to invoices
        const pos = (purchaseOrders ?? [] as any[]).filter((po: any) => po.billId === b.id);
        for (const po of pos) {
          if (po.sourceInvoiceId) {
            const inv = (invoices ?? [] as any[]).find((i: any) => i.id === po.sourceInvoiceId);
            addInv(inv);
          }
        }
      }
    }
    // Match by return/refund → find linked invoice
    for (const r of (returnsRefunds ?? []) as any[]) {
      const rNum = `#${r.id.toString().padStart(4, "0")}`;
      if (matchAny(sqL,
        r.id, r.id.toString().padStart(4, "0"),
        rNum, r.customerName, r.invoiceNumber, r.reason, r.notes, r.type, r.status, r.refundMethod,
      ) && r.invoiceId) {
        const inv = (invoices ?? [] as any[]).find((i: any) => i.id === r.invoiceId);
        addInv(inv);
      }
    }

    return Array.from(foundInvIds).map(id => {
      const inv = (invoices ?? [] as any[]).find((i: any) => i.id === id);
      const quote = inv?.quoteId ? (quotes ?? []).find((q: any) => q.id === inv.quoteId) ?? null : null;
      const pos = (purchaseOrders ?? []).filter((po: any) => po.sourceInvoiceId === id);
      const ships = (shipments ?? []).filter((s: any) => s.invoiceId === id);
      const invBills = (bills ?? []).filter((b: any) =>
        (purchaseOrders ?? [] as any[]).some((po: any) => po.sourceInvoiceId === id && po.billId === b.id)
      );
      const returns = (returnsRefunds ?? []).filter((r: any) => r.invoiceId === id);
      return { invoice: inv, quote, purchaseOrders: pos, shipments: ships, bills: invBills, returns };
    }).filter(j => j.invoice);
  }, [sq, invoices, quotes, purchaseOrders, shipments, bills, returnsRefunds]);

  const searchResults = useMemo(() => {
    if (!sq) return null;
    const t = sq.toLowerCase();
    return {
      quotes: (quotes ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        r.quoteNumber, quoteFallbackNum(r.id), `fc-${r.id}`,
        r.customerName, r.trackingNumber, r.notes, r.status,
      )),
      invoices: (invoices ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        r.invoiceNumber, invFallbackNum(r.id), `fc-${r.id}`,
        r.customerName, r.trackingNumber, r.notes, r.status, r.paymentMethod,
      )),
      purchaseOrders: (purchaseOrders ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        `frzpo-${r.id.toString().padStart(4, "0")}`, r.poNumber,
        r.vendorName, r.notes, r.status,
      )),
      bills: (bills ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        `bill-${r.id.toString().padStart(4, "0")}`,
        r.vendorName, r.notes, r.status, r.dueDate,
      )),
      shipments: (shipments ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        `ship-${r.id.toString().padStart(4, "0")}`,
        r.trackingNumber, r.carrier, r.customerName, r.notes, r.status,
      )),
      customers: (customers ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        r.name, r.company, r.email, r.phone,
      )),
      vendors: (vendors ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        r.name, r.company, r.email, r.phone,
      )),
      returns: (returnsRefunds ?? []).filter((r: any) => matchAny(t,
        r.id, r.id.toString().padStart(4, "0"),
        `#${r.id.toString().padStart(4, "0")}`,
        r.customerName, r.invoiceNumber, r.reason, r.notes, r.type, r.status, r.refundMethod,
      )),
    };
  }, [sq, quotes, invoices, purchaseOrders, bills, shipments, customers, vendors, returnsRefunds]);

  const totalResults = useMemo(() =>
    searchResults ? Object.values(searchResults).reduce((s, a) => s + a.length, 0) : 0,
  [searchResults]);

  const shippingStats = useMemo(() => ({
    delivered: (shipments ?? []).filter((s: any) => s.status === "delivered").length,
    shipped:   (shipments ?? []).filter((s: any) => s.status === "shipped").length,
    pending:   (shipments ?? []).filter((s: any) => s.status === "pending").length,
  }), [shipments]);

  const shippingDelivered = shippingStats.delivered;
  const shippingShipped   = shippingStats.shipped;
  const shippingPending   = shippingStats.pending;

  const counters = useMemo(() => {
    const now = new Date();
    const isInvoiceOverdue = (inv: any) => {
      if (inv.status === "paid" || inv.status === "cancelled") return false;
      if (inv.status === "overdue") return true;
      return inv.dueDate && new Date(inv.dueDate) < now;
    };
    const isBillOverdue = (bill: any) => {
      if (bill.status === "paid" || bill.status === "cancelled") return false;
      if (bill.status === "overdue") return true;
      return bill.dueDate && new Date(bill.dueDate) < now;
    };
    return {
      incomingPurchaseOrders: (purchaseOrders ?? []).filter((po: any) =>
        po.status === "draft" || po.status === "sent").length,
      ordersAwaitingPayment: (invoices ?? []).filter((inv: any) =>
        inv.status === "sent" || inv.status === "pending" || inv.status === "overdue").length,
      ordersAwaitingInvoiceConversion: (quotes ?? []).filter((q: any) =>
        q.status !== "invoiced" && q.status !== "declined" && q.status !== "expired").length,
      receivableInvoiceCount: (invoices ?? []).filter((inv: any) =>
        inv.status === "sent" || inv.status === "pending" || inv.status === "overdue").length,
      payableBillCount: (bills ?? []).filter((bill: any) =>
        bill.status === "received" || bill.status === "overdue").length,
      overdueBillCount: (bills ?? []).filter(isBillOverdue).length,
      overdueInvoiceCount: (invoices ?? []).filter(isInvoiceOverdue).length,
    };
  }, [purchaseOrders, invoices, quotes, bills]);

  const incomingPurchaseOrders          = counters.incomingPurchaseOrders;
  const ordersAwaitingPayment           = counters.ordersAwaitingPayment;
  const ordersAwaitingInvoiceConversion = counters.ordersAwaitingInvoiceConversion;
  const receivableInvoiceCount          = counters.receivableInvoiceCount;
  const payableBillCount                = counters.payableBillCount;
  const overdueBillCount                = counters.overdueBillCount;
  const overdueInvoiceCount             = counters.overdueInvoiceCount;

  return (
    <Layout>
      <Header
        title="Dashboard"
        subtitle={today}
        tabs={["Overview", "Receivables", "Payables", "Overdues"]}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div className="page-scroll-body px-4 md:px-5 pb-4 pt-4 gap-4 flex flex-col bg-[hsl(220_25%_97%)]">
        {searchResults ? (
          <div className="flex flex-col gap-4">
            {journeys.length > 0 && journeys.map((j: any) => (
              <div key={j.invoice.id} className="glass-card overflow-hidden border-indigo-100">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-indigo-100 bg-indigo-50/60 min-w-0">
                  <Link2 size={13} className="text-indigo-500 flex-shrink-0" />
                  <span className="text-indigo-700 text-sm font-semibold flex-shrink-0">Order Journey</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-bold tracking-wide truncate max-w-[160px]">{sq}</span>
                  <span className="ml-auto text-slate-400 text-xs truncate flex-shrink-0 max-w-[200px]">for {j.invoice.customerName}</span>
                </div>
                <div className="px-5 py-4 flex flex-col gap-0">
                  {j.quote && (
                    <JourneyStep
                      icon={<FileText size={13} />}
                      label={`Quote — ${formatQuoteNumber(j.quote.id, (j.quote as any).quoteNumber)}`}
                      sub={`Created ${formatDate(j.quote.createdAt)} · ${formatCurrency(Number(j.quote.total))}`}
                      status={j.quote.status}
                      isFirst
                      href="/quotes"
                    />
                  )}
                  <JourneyStep
                    icon={<Receipt size={13} />}
                    label={`Invoice — ${formatInvoiceNumber(j.invoice.id, j.invoice.invoiceNumber)}`}
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
                  {j.bills && j.bills.map((b: any) => (
                    <JourneyStep
                      key={b.id}
                      icon={<CreditCard size={13} />}
                      label={`Bill — BILL-${b.id.toString().padStart(4,"0")}`}
                      sub={`${b.vendorName}${b.dueDate ? ` · Due ${formatDate(b.dueDate)}` : ""}${b.amount ? ` · ${formatCurrency(Number(b.amount))}` : ""}`}
                      status={b.status}
                      href="/bills"
                    />
                  ))}
                  {j.shipments.map((s: any, i: number) => (
                    <JourneyStep
                      key={s.id}
                      icon={<Truck size={13} />}
                      label={`Shipment — SHIP-${s.id.toString().padStart(4,"0")}`}
                      sub={`${s.carrier ? s.carrier + " · " : ""}${s.trackingNumber ?? "No carrier tracking"}`}
                      status={s.status}
                      isLast={i === j.shipments.length - 1 && (!j.returns || j.returns.length === 0)}
                      href="/shipments"
                    />
                  ))}
                  {j.shipments.length === 0 && (
                    <JourneyStep
                      icon={<Truck size={13} />}
                      label="Shipment — Not yet created"
                      sub="No shipment linked to this invoice yet"
                      status="pending"
                      isLast={!j.returns || j.returns.length === 0}
                      href="/shipments"
                      dim
                    />
                  )}
                  {j.returns && j.returns.map((r: any, i: number) => (
                    <JourneyStep
                      key={r.id}
                      icon={<ArrowLeftRight size={13} />}
                      label={`${r.type === "refund" ? "Refund" : r.type === "return_refund" ? "Return & Refund" : "Return"} — #${r.id.toString().padStart(4,"0")}`}
                      sub={`${r.reason ?? ""}${r.refundAmount ? ` · ${formatCurrency(Number(r.refundAmount))}` : ""}`}
                      status={r.status}
                      isLast={i === j.returns.length - 1}
                      href="/returns-refunds"
                    />
                  ))}
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
            <SearchGroup label="Quotes" icon={<FileText size={13}/>} results={searchResults.quotes} href="/quotes"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={formatQuoteNumber(r.id, r.quoteNumber)}
                sub={r.customerName}
                detail={r.trackingNumber ? `Ref: ${r.trackingNumber}` : undefined}
                total={r.total} status={r.status}
                date={r.createdAt}
                href="/quotes" onNavigate={() => setLocation("/quotes")} />} />
            <SearchGroup label="Invoices" icon={<Receipt size={13}/>} results={searchResults.invoices} href="/invoices"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={formatInvoiceNumber(r.id, r.invoiceNumber)}
                sub={r.customerName}
                detail={r.trackingNumber ? `Ref: ${r.trackingNumber}` : undefined}
                total={r.total} status={r.status}
                date={r.dueDate ?? r.createdAt}
                href="/invoices" onNavigate={() => setLocation("/invoices")} />} />
            <SearchGroup label="Purchase Orders" icon={<ShoppingCart size={13}/>} results={searchResults.purchaseOrders} href="/purchase-orders"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={r.poNumber ?? `FRZPO-${r.id.toString().padStart(4,"0")}`}
                sub={r.vendorName}
                total={r.total} status={r.status}
                date={r.createdAt}
                href="/purchase-orders" onNavigate={() => setLocation("/purchase-orders")} />} />
            <SearchGroup label="Bills" icon={<CreditCard size={13}/>} results={searchResults.bills} href="/bills"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={`BILL-${r.id.toString().padStart(4,"0")}`}
                sub={r.vendorName}
                total={r.amount}
                status={r.status}
                date={r.dueDate}
                href="/bills" onNavigate={() => setLocation("/bills")} />} />
            <SearchGroup label="Shipments" icon={<Truck size={13}/>} results={searchResults.shipments} href="/shipments"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={`SHIP-${r.id.toString().padStart(4,"0")}`}
                sub={r.customerName}
                detail={r.trackingNumber ? r.trackingNumber : r.carrier ?? undefined}
                status={r.status}
                date={r.shippedAt ?? r.createdAt}
                href="/shipments" onNavigate={() => setLocation("/shipments")} />} />
            <SearchGroup label="Returns & Refunds" icon={<ArrowLeftRight size={13}/>} results={searchResults.returns} href="/returns-refunds"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={`#${r.id.toString().padStart(4,"0")}`}
                sub={r.customerName}
                detail={r.invoiceNumber ? `Invoice: ${r.invoiceNumber}` : r.reason ?? undefined}
                total={r.refundAmount}
                status={r.status}
                date={r.createdAt}
                href="/returns-refunds" onNavigate={() => setLocation("/returns-refunds")} />} />
            <SearchGroup label="Customers" icon={<Users size={13}/>} results={searchResults.customers} href="/customers"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={r.company ?? r.name}
                sub={r.company ? r.name : r.email}
                detail={r.phone ?? undefined}
                href="/customers" onNavigate={() => setLocation("/customers")} />} />
            <SearchGroup label="Vendors" icon={<Store size={13}/>} results={searchResults.vendors} href="/vendors"
              renderRow={(r: any) => <SearchRow key={r.id}
                label={r.company ?? r.name}
                sub={r.company ? r.name : r.email}
                detail={r.phone ?? undefined}
                href="/vendors" onNavigate={() => setLocation("/vendors")} />} />
          </div>
        ) : error ? (
          <div className="glass-card p-6 md:p-8 border border-rose-200 bg-rose-50/60">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-rose-600 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-semibold text-rose-700">Cannot reach API server</p>
                <p className="text-sm text-rose-600 mt-1">
                  Dashboard is loaded, but backend data is unavailable. Check Netlify environment variable
                  <span className="font-semibold"> VITE_API_BASE_URL </span>
                  and point it to your Railway service URL.
                </p>
              </div>
            </div>
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
                  <span className="text-[11px] text-slate-500">Live refresh every 30s · {nowTime}</span>
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
                  <span className="text-xs text-slate-500">Invoices only · Live refresh every 30s · {nowTime}</span>
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
                  <span className="text-xs text-slate-500">Bills only · Live refresh every 30s · {nowTime}</span>
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
                <AlertRow icon={<AlertCircle size={13} />} label="Overdue Invoices" value={overdueInvoiceCount} href="/invoices" urgent />
                <AlertRow icon={<CreditCard size={13} />} label="Overdue Bills" value={overdueBillCount} href="/bills" urgent={overdueBillCount > 0} />
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
                          <td className="px-5 py-3 text-slate-400 font-mono text-xs">{formatInvoiceNumber(inv.id, (inv as any).invoiceNumber)}</td>
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

            {activeTab === 3 && (() => {
              const now = new Date();
              const overdueInvoices = (invoices ?? []).filter((inv: any) => {
                if (inv.status === "paid" || inv.status === "cancelled") return false;
                if (inv.status === "overdue") return true;
                return inv.dueDate && new Date(inv.dueDate) < now;
              });
              const overdueBills = (bills ?? []).filter((bill: any) => {
                if (bill.status === "paid") return false;
                if (bill.status === "overdue") return true;
                return bill.dueDate && new Date(bill.dueDate) < now;
              });
              const totalArOverdue = overdueInvoices.reduce((s: number, inv: any) => s + Number(inv.total ?? 0), 0);
              const totalApOverdue = overdueBills.reduce((s: number, bill: any) => s + Number(bill.amount ?? bill.total ?? 0), 0);
              return (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex flex-col gap-1">
                      <p className="text-xs text-rose-600 font-semibold uppercase tracking-wide">Overdue Receivables (AR)</p>
                      <p className="text-2xl font-bold text-rose-700 mt-1">{formatCurrency(totalArOverdue)}</p>
                      <p className="text-xs text-rose-500">{overdueInvoices.length} invoice{overdueInvoices.length !== 1 ? "s" : ""} past due</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex flex-col gap-1">
                      <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Overdue Payables (AP)</p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(totalApOverdue)}</p>
                      <p className="text-xs text-amber-600">{overdueBills.length} bill{overdueBills.length !== 1 ? "s" : ""} past due</p>
                    </div>
                  </div>

                  {overdueInvoices.length > 0 && (
                    <div className="glass-card overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-rose-100 bg-rose-50/40">
                        <div className="flex items-center gap-2">
                          <Receipt size={13} className="text-rose-500" />
                          <span className="text-rose-700 text-sm font-semibold">Overdue Invoices</span>
                        </div>
                        <a href="/invoices" className="flex items-center gap-1 text-rose-600 text-xs font-medium hover:underline">View all <ChevronRight size={11} /></a>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            {["Invoice #","Customer","Terms","Due Date","Days Overdue","Amount"].map(h => (
                              <th key={h} className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider last:text-right">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {overdueInvoices.sort((a: any, b: any) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime()).map((inv: any) => {
                            const days = inv.dueDate ? Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000)) : 0;
                            const cust = (customers ?? []).find((c: any) => Number(c.id) === Number(inv.customerId)) as any;
                            const terms = cust?.accountType ?? null;
                            const termsLabels: Record<string, { label: string; cls: string }> = {
                              net30: { label: "Net 30", cls: "text-blue-700 bg-blue-50 border-blue-200" },
                              net60: { label: "Net 60", cls: "text-indigo-700 bg-indigo-50 border-indigo-200" },
                              net90: { label: "Net 90", cls: "text-purple-700 bg-purple-50 border-purple-200" },
                              cash:  { label: "Cash",   cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                              cash_advance: { label: "Cash Adv.", cls: "text-amber-700 bg-amber-50 border-amber-200" },
                              cod:   { label: "COD",    cls: "text-slate-700 bg-slate-100 border-slate-200" },
                            };
                            const tInfo = terms ? termsLabels[terms] : null;
                            return (
                              <tr key={inv.id} className="border-b border-slate-100 hover:bg-rose-50/20 transition-colors">
                                <td className="px-5 py-3 text-slate-400 font-mono text-xs">{inv.invoiceNumber ?? invFallbackNum(inv.id)}</td>
                                <td className="px-5 py-3 text-slate-800 font-medium text-sm">{inv.customerName ?? "—"}</td>
                                <td className="px-5 py-3">
                                  {tInfo
                                    ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${tInfo.cls}`}>{tInfo.label}</span>
                                    : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="px-5 py-3 text-slate-500 text-xs">{formatDate(inv.dueDate)}</td>
                                <td className="px-5 py-3"><span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">{days}d overdue</span></td>
                                <td className="px-5 py-3 text-right text-rose-700 font-bold text-sm">{formatCurrency(Number(inv.total ?? 0))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 border-t border-slate-200">
                            <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-slate-600">Total Overdue</td>
                            <td className="px-5 py-3 font-bold text-rose-700 text-right">{formatCurrency(totalArOverdue)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {overdueBills.length > 0 && (
                    <div className="glass-card overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-amber-100 bg-amber-50/40">
                        <div className="flex items-center gap-2">
                          <CreditCard size={13} className="text-amber-600" />
                          <span className="text-amber-700 text-sm font-semibold">Overdue Bills</span>
                        </div>
                        <a href="/bills" className="flex items-center gap-1 text-amber-600 text-xs font-medium hover:underline">View all <ChevronRight size={11} /></a>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            {["Bill #","Vendor","Terms","Due Date","Days Overdue","Amount"].map(h => (
                              <th key={h} className="px-5 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider last:text-right">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {overdueBills.sort((a: any, b: any) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime()).map((bill: any) => {
                            const days = bill.dueDate ? Math.max(0, Math.floor((now.getTime() - new Date(bill.dueDate).getTime()) / 86400000)) : 0;
                            const vend = (vendors ?? []).find((v: any) => Number(v.id) === Number(bill.vendorId)) as any;
                            const vTerms = vend?.paymentTerms ?? null;
                            const vendorTermsLabels: Record<string, { label: string; cls: string }> = {
                              net30: { label: "Net 30", cls: "text-blue-700 bg-blue-50 border-blue-200" },
                              net60: { label: "Net 60", cls: "text-indigo-700 bg-indigo-50 border-indigo-200" },
                              net90: { label: "Net 90", cls: "text-purple-700 bg-purple-50 border-purple-200" },
                              cash:  { label: "Cash",   cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                              cod:   { label: "COD",    cls: "text-slate-700 bg-slate-100 border-slate-200" },
                            };
                            const vtInfo = vTerms ? vendorTermsLabels[vTerms] : null;
                            return (
                              <tr key={bill.id} className="border-b border-slate-100 hover:bg-amber-50/20 transition-colors">
                                <td className="px-5 py-3 text-slate-400 font-mono text-xs">BILL-{bill.id.toString().padStart(4,"0")}</td>
                                <td className="px-5 py-3 text-slate-800 font-medium text-sm">{bill.vendorName ?? "—"}</td>
                                <td className="px-5 py-3">
                                  {vtInfo
                                    ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${vtInfo.cls}`}>{vtInfo.label}</span>
                                    : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="px-5 py-3 text-slate-500 text-xs">{formatDate(bill.dueDate)}</td>
                                <td className="px-5 py-3"><span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">{days}d overdue</span></td>
                                <td className="px-5 py-3 text-right text-amber-700 font-bold text-sm">{formatCurrency(Number(bill.amount ?? bill.total ?? 0))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 border-t border-slate-200">
                            <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-slate-600">Total Overdue</td>
                            <td className="px-5 py-3 font-bold text-amber-700 text-right">{formatCurrency(totalApOverdue)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {overdueInvoices.length === 0 && overdueBills.length === 0 && (
                    <div className="glass-card p-10 text-center">
                      <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-semibold">No overdues — you're all caught up!</p>
                      <p className="text-slate-400 text-sm mt-1">All invoices and bills are current.</p>
                    </div>
                  )}
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
  label: string; icon: React.ReactNode;
  results: any[]; href?: string; renderRow: (r: any) => React.ReactNode;
}) {
  if (!results || results.length === 0) return null;
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/70">
        <span className="text-slate-400">{icon}</span>
        <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className="ml-auto bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{results.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {results.map(r => renderRow(r))}
      </div>
    </div>
  );
}

function SearchRow({ label, sub, detail, total, status, date, onNavigate }: {
  label: string; sub?: string; detail?: string; total?: number | string;
  status?: string; date?: string; href: string; onNavigate: () => void;
}) {
  const statusMap: Record<string, string> = {
    paid:      "text-emerald-700 bg-emerald-50 border-emerald-200",
    sent:      "text-blue-700 bg-blue-50 border-blue-200",
    draft:     "text-slate-500 bg-slate-50 border-slate-200",
    overdue:   "text-red-700 bg-red-50 border-red-200",
    pending:   "text-amber-700 bg-amber-50 border-amber-200",
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
    <button onClick={onNavigate} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50/80 transition-colors text-left group">
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">{label}</span>
          {sub && <span className="text-slate-500 text-xs truncate">{sub}</span>}
        </div>
        {detail && <span className="text-slate-400 text-[11px] truncate mt-0.5">{detail}</span>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {date && <span className="text-slate-400 text-[11px] hidden sm:block">{formatDate(date)}</span>}
        {status && (
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${statusMap[status] ?? statusMap.draft}`}>
            {status}
          </span>
        )}
        {total !== undefined && total !== null && (
          <span className="text-slate-800 font-semibold text-sm min-w-[60px] text-right">{formatCurrency(Number(total))}</span>
        )}
      </div>
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
