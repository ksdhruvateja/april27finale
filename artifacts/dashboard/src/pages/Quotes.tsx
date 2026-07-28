import { useState, useRef, Fragment, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListQuotes, useDeleteQuote, useConvertQuoteToInvoice, useUpdateQuote, getListQuotesQueryKey, useListInvoices, useListCustomers } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, FileCheck, Eye, Mail, MessageSquare, Printer, Download, Hash, X, Link2, FileText, Pencil, StickyNote, BarChart2, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie, Legend, ComposedChart, Line, Area } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import QuoteModal from "@/components/QuoteModal";
import QuoteView from "@/components/QuoteView";

const QUOTE_EXPIRY_DAYS = 30;

function getQuoteExpiry(createdAt: string | null | undefined): Date | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + QUOTE_EXPIRY_DAYS * 86400000);
}

function isQuoteExpired(q: any): boolean {
  if (["accepted", "invoiced", "declined"].includes(q.status)) return false;
  const expiry = getQuoteExpiry(q.createdAt);
  return expiry ? expiry < new Date() : false;
}

function daysUntilExpiry(createdAt: string | null | undefined): number | null {
  const expiry = getQuoteExpiry(createdAt);
  if (!expiry) return null;
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000);
}

const STATUS_MAP: Record<string, string> = {
  accepted: "text-emerald-700 bg-emerald-50 border-emerald-200",
  declined:  "text-red-600    bg-red-50    border-red-200",
  sent:      "text-blue-700   bg-blue-50   border-blue-200",
  draft:     "text-slate-500  bg-slate-50  border-slate-200",
  expired:   "text-red-600    bg-red-50    border-red-200",
  invoiced:  "text-purple-700 bg-purple-50 border-purple-200",
};

export default function Quotes() {
  const [, setLocation] = useLocation();
  const { data: quotes, isLoading } = useListQuotes();
  const { data: invoices } = useListInvoices();
  const { data: customers } = useListCustomers();
  const customerMap = Object.fromEntries((customers ?? []).map((c: any) => [String(c.id), c]));
  const deleteQuote = useDeleteQuote();
  const convertToInvoice = useConvertQuoteToInvoice();
  const updateQuote = useUpdateQuote();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "confirmed" | "draft" | "sent" | "declined" | "expired">("all");
  const [filterDays, setFilterDays] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState<any | null>(null);
  const [viewQuote, setViewQuote] = useState<(typeof quotes extends (infer T)[] | undefined ? T : never) | null>(null);
  const [editingNum, setEditingNum] = useState<{ id: number; value: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const numInputRef = useRef<HTMLInputElement>(null);
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteEditId, setNoteEditId] = useState<number | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [confirmOpenId, setConfirmOpenId] = useState<number | null>(null);
  const [confirmSavingId, setConfirmSavingId] = useState<number | null>(null);
  const [confirmRefInput, setConfirmRefInput] = useState("");
  const [convertDialog, setConvertDialog] = useState<{
    id: number; quoteNumber: string; customerName: string; existingRef: string | null;
  } | null>(null);
  const [duplicateConvertGuard, setDuplicateConvertGuard] = useState<{
    quote: any; quoteNumber: string; existingInvoices: any[];
  } | null>(null);
  const [refNumber, setRefNumber] = useState("");
  const [invoiceNum, setInvoiceNum] = useState("");
  const [bulkConvertDialog, setBulkConvertDialog] = useState<{
    quoteIds: number[]; orderRef: string; invoiceMode: "single" | "multiple"; converting: boolean;
  } | null>(null);

  /* ── Analytics ────────────────────────────────────── */
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView]   = useState<"conversion" | "customers" | "trend" | "status">("conversion");
  const [chartPeriod, setChartPeriod] = useState<"all"|"1mo"|"3mo"|"6mo"|"12mo">("all");

  function getPeriodStart(p: string) {
    if (p === "all") return null;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - parseInt(p), now.getDate());
  }

  const quotesBase = useMemo(() => {
    const ps = getPeriodStart(chartPeriod);
    return (quotes ?? []).filter((q: any) => !ps || new Date(q.createdAt || 0) >= ps);
  }, [quotes, chartPeriod]);

  const quoteConversionData = useMemo(() => {
    const all = quotesBase as any[];
    const total = all.length;
    if (!total) return [];
    const counts: Record<string, number> = {};
    for (const q of all) counts[q.status ?? "draft"] = (counts[q.status ?? "draft"] ?? 0) + 1;
    const COLORS: Record<string, string> = {
      draft:"#94a3b8", sent:"#3b82f6", accepted:"#10b981",
      invoiced:"#6366f1", declined:"#ef4444", expired:"#f59e0b",
    };
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: COLORS[name]??"#94a3b8", pct: Math.round(value/total*100) }));
  }, [quotesBase]);

  const quoteCustomerData = useMemo(() => {
    const by: Record<string, { total: number; count: number; accepted: number }> = {};
    for (const q of (quotesBase as any[])) {
      const name = q.customerName || "Unknown";
      if (!by[name]) by[name] = { total: 0, count: 0, accepted: 0 };
      by[name].total += Number(q.total ?? 0);
      by[name].count += 1;
      if (q.status === "accepted" || q.status === "invoiced") by[name].accepted += 1;
    }
    return Object.entries(by).map(([name,v]) => ({ name, total: Math.round(v.total*100)/100, count: v.count, accepted: v.accepted }))
      .sort((a,b) => b.total - a.total).slice(0, 12);
  }, [quotesBase]);

  const quoteMonthlyData = useMemo(() => {
    const by: Record<string, { count: number; value: number; accepted: number }> = {};
    for (const q of (quotesBase as any[])) {
      const mo = (q.createdAt||"").slice(0,7) || "Unknown";
      if (!by[mo]) by[mo] = { count: 0, value: 0, accepted: 0 };
      by[mo].count += 1;
      by[mo].value += Number(q.total ?? 0);
      if (["accepted","invoiced"].includes(q.status ?? "")) by[mo].accepted += 1;
    }
    return Object.entries(by).filter(([m]) => m !== "Unknown").sort(([a],[b]) => a.localeCompare(b))
      .map(([month,v]) => ({
        month: new Date(month+"-01").toLocaleDateString("en-US",{ month:"short", year:"2-digit" }),
        count: v.count, value: Math.round(v.value*100)/100, accepted: v.accepted,
      }));
  }, [quotesBase]);

  const quoteKpis = useMemo(() => {
    const all = quotesBase as any[];
    const accepted = all.filter((q:any) => ["accepted","invoiced"].includes(q.status??"")); 
    const totalVal = all.reduce((s:number,q:any) => s+Number(q.total??0),0);
    const acceptedVal = accepted.reduce((s:number,q:any) => s+Number(q.total??0),0);
    return { total: all.length, accepted: accepted.length, totalVal, acceptedVal, convRate: all.length ? Math.round(accepted.length/all.length*100) : 0 };
  }, [quotesBase]);

  const fallbackFcNumber = (id: number) => `FRZQ-${Math.max(5100, 5099 + Number(id ?? 0))}`;

  const debouncedSearch = useDebounce(search, 250);
  const filtered = useMemo(() => {
    const qSearch = debouncedSearch.trim().toLowerCase();
    const cutoff = filterDays ? new Date(Date.now() - filterDays * 86400000) : null;
    return (quotes ?? [])
      .filter(q => {
        const expired = isQuoteExpired(q);
        const effectiveStatus = expired ? "expired" : (q as any).status;
        // status group filter
        if (filterStatus === "pending")   { if (!["draft","sent"].includes(effectiveStatus)) return false; }
        else if (filterStatus === "confirmed") { if (!["accepted","invoiced"].includes(effectiveStatus)) return false; }
        else if (filterStatus !== "all")  { if (effectiveStatus !== filterStatus) return false; }
        // date filter
        if (cutoff && new Date((q as any).createdAt ?? 0) < cutoff) return false;
        // text search
        if (qSearch) {
          const productText = ((q as any).lineItems ?? []).map((li: any) => String(li.description ?? "")).join(" ").toLowerCase();
          return [
            q.customerName, (q as any).quoteNumber, (q as any).trackingNumber,
            (q as any).status, (q as any).notes, (q as any).internalNote,
            String((q as any).id ?? ""), String((q as any).customerId ?? ""), productText,
          ].some(v => String(v ?? "").toLowerCase().includes(qSearch));
        }
        return true;
      })
      .sort((a, b) => {
        const bt = new Date((b as any).createdAt ?? 0).getTime();
        const at = new Date((a as any).createdAt ?? 0).getTime();
        if (bt !== at) return bt - at;
        return (b.id ?? 0) - (a.id ?? 0);
      });
  }, [quotes, debouncedSearch, filterStatus, filterDays]);

  const handleDelete = (id: number) => {
    if (confirm("Delete this quote?")) {
      deleteQuote.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() })
      });
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    const ids = filtered?.map(q => q.id) ?? [];
    setSelectedIds(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids));
  };
  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} selected quote(s)?`)) return;
    Promise.all([...selectedIds].map(id => deleteQuote.mutate({ id }, { onSuccess: () => {} }))).then(() => {
      queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      setSelectedIds(new Set());
    });
  };

  const openConvertDialog = (q: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const qn: string = (q as any).quoteNumber ?? fallbackFcNumber(q.id);
    const existingFromQuote = (invoices ?? []).filter((inv: any) => Number(inv.quoteId) === Number(q.id));
    if (existingFromQuote.length > 0) {
      setDuplicateConvertGuard({ quote: q, quoteNumber: qn, existingInvoices: existingFromQuote });
      return;
    }
    setConvertDialog({
      id: q.id,
      quoteNumber: qn,
      customerName: q.customerName,
      existingRef: q.trackingNumber ?? null,
    });
    setRefNumber(q.trackingNumber ?? "");
    setInvoiceNum("");
  };

  const confirmConvert = () => {
    if (!convertDialog) return;
    convertToInvoice.mutate(
      { id: convertDialog.id, data: { trackingNumber: refNumber.trim() || null, invoiceNumber: invoiceNum.trim() || null } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
          setConvertDialog(null);
          setLocation("/invoices");
        },
      }
    );
  };

  const handleBulkConvert = async () => {
    if (!bulkConvertDialog) return;
    setBulkConvertDialog(prev => prev ? { ...prev, converting: true } : null);
    const { quoteIds, orderRef, invoiceMode } = bulkConvertDialog;
    const idsToConvert = invoiceMode === "single" ? [quoteIds[0]] : quoteIds;
    for (const id of idsToConvert) {
      await new Promise<void>(resolve => {
        convertToInvoice.mutate(
          { id, data: { trackingNumber: orderRef.trim() || null } as any },
          { onSuccess: () => resolve(), onError: () => resolve() }
        );
      });
    }
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    setBulkConvertDialog(null);
    setSelectedIds(new Set());
    setLocation("/invoices");
  };

  const startEditNum = (q: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNum({ id: q.id, value: (q as any).quoteNumber ?? fallbackFcNumber(q.id) });
    setTimeout(() => numInputRef.current?.select(), 0);
  };

  const saveNum = (id: number) => {
    if (!editingNum) return;
    const val = editingNum.value.trim() || null;
    updateQuote.mutate({ id, data: { quoteNumber: val } as any }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() })
    });
    setEditingNum(null);
  };

  const saveInlineNote = (id: number) => {
    setNoteSaving(true);
    updateQuote.mutate(
      { id, data: { internalNote: noteEditText.trim() || null } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
          setNoteEditId(null);
          setNoteOpenId(null);
          setNoteSaving(false);
        },
        onError: () => { setNoteSaving(false); setNoteEditId(null); },
      }
    );
  };

  const confirmOrder = (id: number, refInput: string) => {
    setConfirmSavingId(id);
    const data: any = { status: "accepted" };
    if (refInput.trim()) data.trackingNumber = refInput.trim();
    updateQuote.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
          setConfirmOpenId(null);
          setConfirmSavingId(null);
          setConfirmRefInput("");
        },
        onError: () => {
          setConfirmSavingId(null);
        },
      },
    );
  };

  const revertOrderConfirmation = (id: number) => {
    setConfirmSavingId(id);
    updateQuote.mutate(
      { id, data: { status: "sent", trackingNumber: null } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
          setConfirmOpenId(null);
          setConfirmSavingId(null);
        },
        onError: () => {
          setConfirmSavingId(null);
        },
      },
    );
  };

  const declineQuote = (id: number) => {
    setConfirmSavingId(id);
    updateQuote.mutate(
      { id, data: { status: "declined" } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
          setConfirmOpenId(null);
          setConfirmSavingId(null);
        },
        onError: () => { setConfirmSavingId(null); },
      },
    );
  };

  return (
    <Layout>
      <Header title="Quotes" subtitle={`${quotes?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by customer or quote #..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button onClick={() => setShowCharts(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors flex-shrink-0 ${showCharts?"bg-violet-600 text-white border-violet-600":"bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            <BarChart2 size={14} /> Analytics {showCharts ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
          <button onClick={() => setShowModal(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
            <Plus size={14} /> Create Quote
          </button>
        </div>

        {/* ── Filter bar ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status group pills */}
          <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
            {([
              { value: "all",       label: "All" },
              { value: "pending",   label: "Pending Confirmation" },
              { value: "confirmed", label: "Order Confirmed" },
              { value: "declined",  label: "Declined" },
              { value: "expired",   label: "Expired" },
            ] as const).map(({ value, label }) => (
              <button key={value} onClick={() => setFilterStatus(value)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  filterStatus === value
                    ? value === "confirmed" ? "bg-emerald-600 text-white shadow-sm"
                    : value === "pending"   ? "bg-amber-500 text-white shadow-sm"
                    : value === "declined"  ? "bg-red-500 text-white shadow-sm"
                    : value === "expired"   ? "bg-orange-500 text-white shadow-sm"
                    : "bg-slate-800 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100"}`}>
                {label}
              </button>
            ))}
          </div>
          {/* Date range quick filters */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mr-0.5">Last:</span>
            {([
              { days: 7,   label: "7d" },
              { days: 15,  label: "15d" },
              { days: 30,  label: "30d" },
              { days: 90,  label: "3mo" },
              { days: 182, label: "6mo" },
              { days: 365, label: "12mo" },
            ]).map(({ days, label }) => (
              <button key={days} onClick={() => setFilterDays(filterDays === days ? null : days)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  filterDays === days
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600"}`}>
                {label}
              </button>
            ))}
          </div>
          {/* Clear filters */}
          {(filterStatus !== "all" || filterDays !== null) && (
            <button onClick={() => { setFilterStatus("all"); setFilterDays(null); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
              <X size={11} /> Clear filters
            </button>
          )}
        </div>

        {/* ── Analytics Panel ─────────────────────────────── */}
        {showCharts && (
          <div className="glass-card analytics-panel p-5 flex flex-col gap-4">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Quotes", value: String(quoteKpis.total), color: "text-slate-700" },
                { label: "Total Value", value: `$${quoteKpis.totalVal.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: "text-violet-600" },
                { label: "Accepted / Invoiced", value: `${quoteKpis.accepted} ($${quoteKpis.acceptedVal.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})})`, color: "text-emerald-600" },
                { label: "Conversion Rate", value: `${quoteKpis.convRate}%`, color: quoteKpis.convRate >= 50 ? "text-emerald-600" : "text-amber-500" },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <TrendingUp size={16} className={k.color} />
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{k.label}</p>
                    <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Tab + Period row */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                {(["conversion","customers","trend"] as const).map(v => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${chartView===v?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                    {v==="conversion"?"Status Mix":v==="customers"?"By Customer":"Monthly Trend"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                Period:
                {(["all","1mo","3mo","6mo","12mo"] as const).map(p => (
                  <button key={p} onClick={() => setChartPeriod(p)}
                    className={`px-2 py-1 rounded-md font-medium transition-all ${chartPeriod===p?"bg-violet-600 text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {p==="all"?"All":p}
                  </button>
                ))}
              </div>
            </div>

            {chartView === "conversion" && (
              <div className="flex gap-6 items-center">
                <div className="h-52 flex-1">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Quote Status Distribution</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={quoteConversionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3}>
                        {quoteConversionData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v:any,name:any) => [`${v} quotes (${quoteConversionData.find(d=>d.name===name)?.pct??0}%)`,name]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-[160px]">
                  {quoteConversionData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                      <span className="text-xs text-slate-600 capitalize flex-1">{d.name}</span>
                      <span className="text-xs font-bold text-slate-700">{d.value} <span className="text-slate-400 font-normal">({d.pct}%)</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chartView === "customers" && (
              <div className="h-72">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Top Customers by Quote Value</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quoteCustomerData} layout="vertical" margin={{ left: 80, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#cbd5e1" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#cbd5e1" width={76} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Total Value"]} />
                    <Bar dataKey="total" radius={[0,4,4,0]}>
                      {quoteCustomerData.map((_,i) => <Cell key={i} fill={`hsl(${270+i*15},60%,${55-i*2}%)`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "trend" && (() => {
              const trendData = quoteMonthlyData.map(d => ({
                ...d,
                winRate: d.count > 0 ? Math.round(d.accepted / d.count * 100) : 0,
                lost: d.count - d.accepted,
              }));
              return (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Monthly Quote Volume — Accepted vs. Not Won &amp; Win Rate</p>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={trendData} margin={{ left: 10, right: 40, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#cbd5e1" allowDecimals={false} label={{ value: "Quotes", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 10, fill: "#94a3b8" } }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#8b5cf6" domain={[0, 100]} tickFormatter={v => `${v}%`} label={{ value: "Win %", angle: 90, position: "insideRight", offset: 8, style: { fontSize: 10, fill: "#8b5cf6" } }} />
                    <Tooltip formatter={(v: any, name: string) => name === "winRate" ? [`${v}%`, "Win Rate"] : [v, name === "accepted" ? "Accepted" : "Not Won"]} />
                    <Legend formatter={v => v === "accepted" ? "Accepted" : v === "lost" ? "Not Won" : "Win Rate %"} />
                    <Bar yAxisId="left" dataKey="accepted" name="accepted" stackId="q" fill="#10b981" radius={[0,0,0,0]} />
                    <Bar yAxisId="left" dataKey="lost" name="lost" stackId="q" fill="#e2e8f0" radius={[3,3,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="winRate" name="winRate" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              );
            })()}
          </div>
        )}

        <div className="glass-card">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No quotes found.</div>
          ) : (
            <>
            {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-5 py-2.5 bg-indigo-50 border-b border-indigo-100">
              <span className="text-sm font-semibold text-indigo-700">{selectedIds.size} selected</span>
              <button
                onClick={() => setBulkConvertDialog({ quoteIds: [...selectedIds], orderRef: "", invoiceMode: "multiple", converting: false })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
              >
                <FileCheck size={12} /> Convert to Invoice{selectedIds.size > 1 ? "s" : ""}
              </button>
              <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
                <Trash2 size={12} /> Delete
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 font-medium">Clear selection</button>
            </div>
            )}
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-3 py-3 w-9">
                    <input type="checkbox" className="rounded border-slate-300 accent-indigo-600 cursor-pointer"
                      checked={(filtered?.length ?? 0) > 0 && (filtered?.every(q => selectedIds.has(q.id)) ?? false)}
                      onChange={toggleSelectAll} />
                  </th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Quote #</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Total</th>
                  <th className="px-3 py-3 text-center text-slate-400 font-medium text-[11px] uppercase tracking-wider w-16">Note</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(q => {
                  const rowExpired = isQuoteExpired(q);
                  return (
                  <Fragment key={q.id}>
                  <tr
                    className={`border-b transition-colors group cursor-pointer ${
                      rowExpired
                        ? "bg-red-50/60 border-red-100 hover:bg-red-50"
                        : `border-slate-100 hover:bg-slate-50 ${(noteOpenId === q.id || noteEditId === q.id) ? "border-b-0" : ""}`
                    } ${selectedIds.has(q.id) ? "!bg-indigo-50/50" : ""}`}
                    onClick={() => setViewQuote(q)}
                  >
                    <td className="px-3 py-3.5 w-9" onClick={e => toggleSelect(q.id, e)}>
                      <input type="checkbox" className="rounded border-slate-300 accent-indigo-600 cursor-pointer"
                        checked={selectedIds.has(q.id)} onChange={() => {}} />
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      {editingNum?.id === q.id ? (
                        <input
                          ref={numInputRef}
                          value={editingNum.value}
                          onChange={e => setEditingNum({ id: q.id, value: e.target.value })}
                          onBlur={() => saveNum(q.id)}
                          onKeyDown={e => { if (e.key === "Enter") saveNum(q.id); if (e.key === "Escape") setEditingNum(null); }}
                          className="font-mono text-xs border border-slate-300 rounded px-2 py-0.5 w-32 focus:outline-none focus:border-blue-400"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 group/num">
                          <Eye size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors" onClick={() => setViewQuote(q)} />
                          <span className="text-slate-400 font-mono text-xs" onClick={() => setViewQuote(q)}>
                            {(q as any).quoteNumber ?? fallbackFcNumber(q.id)}
                          </span>
                          <button
                            title="Edit quote number"
                            onClick={e => startEditNum(q, e)}
                            className="opacity-0 group-hover/num:opacity-100 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
                          >
                            <Edit size={10} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">
                      {(() => {
                        const cust = customerMap[String((q as any).customerId)];
                        if (cust?.company) return cust.company;
                        return q.customerName;
                      })()}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-500 text-xs">{formatDate(q.createdAt)}</span>
                        {!["accepted", "invoiced", "declined"].includes(q.status) && (() => {
                          const days = daysUntilExpiry((q as any).createdAt);
                          const expiry = getQuoteExpiry((q as any).createdAt);
                          if (days === null) return null;
                          if (days <= 0) return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                              Expired {formatDate(expiry?.toISOString())}
                            </span>
                          );
                          if (days <= 7) return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 w-fit">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                              Exp. {formatDate(expiry?.toISOString())} · {days}d left
                            </span>
                          );
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 w-fit">
                              Exp. {formatDate(expiry?.toISOString())}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {(() => {
                        const expired = isQuoteExpired(q);
                        const effectiveStatus = expired ? "expired" : q.status;
                        return (
                          <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_MAP[effectiveStatus] ?? STATUS_MAP.draft}`}>
                            {effectiveStatus}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-semibold text-right">{formatCurrency(q.total)}</td>
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title={(q as any).internalNote ? "View internal note" : "No note yet"}
                          onClick={e => { e.stopPropagation(); if (noteEditId === q.id) return; setNoteOpenId(noteOpenId === q.id ? null : q.id); }}
                          className={`p-1 rounded transition-colors ${(q as any).internalNote ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:text-amber-400 hover:bg-amber-50"}`}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          title="Edit internal note"
                          onClick={e => { e.stopPropagation(); setNoteEditId(q.id); setNoteEditText((q as any).internalNote ?? ""); setNoteOpenId(null); }}
                          className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          title="Send Email"
                          onClick={e => { e.stopPropagation(); setViewQuote(q); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-all"
                        >
                          <Mail size={13} />
                        </button>
                        <button
                          title="Send SMS"
                          onClick={e => { e.stopPropagation(); setViewQuote(q); }}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition-all"
                        >
                          <MessageSquare size={13} />
                        </button>
                        <button
                          title="Print"
                          onClick={e => { e.stopPropagation(); setViewQuote(q); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                        >
                          <Printer size={13} />
                        </button>
                        {q.status === "accepted" ? (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmOpenId(confirmOpenId === q.id ? null : q.id);
                            }}
                            className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            Order Confirmed
                          </button>
                        ) : (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmOpenId(confirmOpenId === q.id ? null : q.id);
                            }}
                            className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors"
                          >
                            Pending Confirmation
                          </button>
                        )}
                        {q.status === "accepted" && (
                          <button
                            onClick={e => openConvertDialog(q, e)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all whitespace-nowrap"
                          >
                            <FileCheck size={11} /> Create Invoice
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setEditQuote(q); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all whitespace-nowrap"
                        >
                          <Edit size={11} /> Edit Quote
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 hover:bg-slate-100 rounded-lg transition-all" onClick={e => e.stopPropagation()}>
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
                            <DropdownMenuItem onClick={() => setViewQuote(q)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Eye size={13} /> View Quote</DropdownMenuItem>
                            <DropdownMenuItem onClick={e => startEditNum(q, e)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Hash size={13} /> Edit Quote #</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setViewQuote(q)} className="gap-2 cursor-pointer text-sm text-blue-600 hover:bg-blue-50 focus:bg-blue-50 focus:text-blue-600"><Mail size={13} /> Send Email</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setViewQuote(q)} className="gap-2 cursor-pointer text-sm text-green-600 hover:bg-green-50 focus:bg-green-50 focus:text-green-600"><MessageSquare size={13} /> Send SMS</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setViewQuote(q)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Download size={13} /> Download PDF</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setViewQuote(q)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Printer size={13} /> Print</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(q.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {confirmOpenId === q.id && (
                    <tr className="border-b border-slate-100 bg-emerald-50/60">
                      <td colSpan={8} className="px-5 py-3">
                        {q.status === "accepted" ? (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-emerald-800">Order Already Confirmed</p>
                              <p className="text-xs text-emerald-700 mt-0.5">Revert to pending — hides the "Create Invoice" button.</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={e => { e.stopPropagation(); setConfirmOpenId(null); }}
                                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                              <button onClick={e => { e.stopPropagation(); revertOrderConfirmation(q.id); }}
                                disabled={confirmSavingId === q.id}
                                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60">
                                {confirmSavingId === q.id ? "Updating..." : "Revert to Pending"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="text-sm font-semibold text-emerald-800">Confirm this Order</p>
                              <p className="text-xs text-emerald-700 mt-0.5">Once confirmed, the "Create Invoice" option will appear on this quote.</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Order Reference # <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="e.g. ORD-2024-001, PO#1234, JOB-001…"
                                  value={confirmRefInput}
                                  onChange={e => setConfirmRefInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); confirmOrder(q.id, confirmRefInput); } if (e.key === "Escape") { setConfirmOpenId(null); setConfirmRefInput(""); } }}
                                  onClick={e => e.stopPropagation()}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 transition-colors"
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-4">
                                <button onClick={e => { e.stopPropagation(); setConfirmOpenId(null); setConfirmRefInput(""); }}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap">Cancel</button>
                                <button onClick={e => { e.stopPropagation(); declineQuote(q.id); }}
                                  disabled={confirmSavingId === q.id}
                                  className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 font-semibold hover:bg-red-100 transition-colors disabled:opacity-60 whitespace-nowrap">
                                  ✗ Decline
                                </button>
                                <button onClick={e => { e.stopPropagation(); confirmOrder(q.id, confirmRefInput); }}
                                  disabled={confirmSavingId === q.id}
                                  className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 whitespace-nowrap">
                                  {confirmSavingId === q.id ? "Confirming..." : "✓ Confirm Order"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {(noteOpenId === q.id || noteEditId === q.id) && (
                    <tr className="border-b border-slate-100 bg-amber-50/40">
                      <td colSpan={8} className="px-5 pb-3 pt-0">
                        {noteEditId === q.id ? (
                          <div className="flex flex-col gap-2 pt-2">
                            <textarea
                              value={noteEditText}
                              onChange={e => setNoteEditText(e.target.value)}
                              placeholder="Add an internal note (not visible to customer)..."
                              rows={2}
                              autoFocus
                              className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-400 resize-none placeholder:text-slate-400"
                              onKeyDown={e => { if (e.key === "Escape") setNoteEditId(null); }}
                            />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setNoteEditId(null)} className="text-xs px-3 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                              <button onClick={() => saveInlineNote(q.id)} disabled={noteSaving} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50">
                                {noteSaving ? "Saving…" : "Save Note"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 pt-2">
                            <StickyNote size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-slate-600 whitespace-pre-wrap">
                              {(q as any).internalNote || <span className="text-slate-400 italic">No internal note yet. Click the pencil icon to add one.</span>}
                            </span>
                          </div>
                        )}
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
      {showModal && <QuoteModal onClose={() => setShowModal(false)} />}
      {editQuote && <QuoteModal onClose={() => setEditQuote(null)} initial={editQuote} />}
      {viewQuote && <QuoteView quote={viewQuote} onClose={() => setViewQuote(null)} />}

      {/* Duplicate Convert Guard Dialog */}
      {duplicateConvertGuard && (() => {
        const { quote, quoteNumber, existingInvoices } = duplicateConvertGuard;
        // Base invoice number derived from quote number (FRZQ-5100 → FRZI-5100)
        const baseInvoiceNum = quoteNumber.replace(/^FRZQ-/i, "FRZI-");
        // Next suffix = count of existing invoices from this quote
        const nextSuffix = existingInvoices.length;
        const suggestedNum = `${baseInvoiceNum}-${nextSuffix}`;
        // Show the most recent existing invoice number
        const latestExisting = existingInvoices[existingInvoices.length - 1];
        const latestNum = latestExisting?.invoiceNumber ?? `FRZI-${latestExisting?.id}`;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setDuplicateConvertGuard(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                    <FileCheck size={14} className="text-amber-600" />
                  </div>
                  <h3 className="text-slate-800 font-bold text-base">Invoice Already Exists</h3>
                </div>
                <p className="text-slate-400 text-xs">
                  <span className="font-mono font-semibold text-slate-500">{quoteNumber}</span>
                  {" · "}{quote.customerName}
                </p>
              </div>
              <div className="px-6 py-5 flex flex-col gap-3">
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                  {existingInvoices.length === 1 ? (
                    <>This quote was already converted to invoice <span className="font-bold font-mono">{latestNum}</span>.</>
                  ) : (
                    <>This quote already has <span className="font-bold">{existingInvoices.length} invoices</span>. The latest is <span className="font-bold font-mono">{latestNum}</span>.</>
                  )}
                  {" "}Do you want to create another one?
                  <div className="mt-2 pt-2 border-t border-amber-200">
                    New invoice will be numbered: <span className="font-bold font-mono text-amber-900">{suggestedNum}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => setDuplicateConvertGuard(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  No, Cancel
                </button>
                <button
                  onClick={() => {
                    setDuplicateConvertGuard(null);
                    setConvertDialog({
                      id: quote.id,
                      quoteNumber,
                      customerName: quote.customerName,
                      existingRef: quote.trackingNumber ?? null,
                    });
                    setRefNumber(quote.trackingNumber ?? "");
                    setInvoiceNum(suggestedNum);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                >
                  <FileCheck size={14} /> Yes, Create Another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Convert to Invoice Dialog */}
      {convertDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setConvertDialog(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <FileCheck size={14} className="text-white" />
                  </div>
                  <h3 className="text-slate-800 font-bold text-base">Create Invoice from Quote</h3>
                </div>
                <p className="text-slate-400 text-xs">
                  <span className="font-mono font-semibold text-slate-500">{convertDialog.quoteNumber}</span>
                  {" · "}{convertDialog.customerName}
                </p>
              </div>
              <button onClick={() => setConvertDialog(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Reference Number */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Link2 size={12} className="text-indigo-500" />
                  Order Reference Number
                  <span className="ml-1 text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. ORD-2024-001 or JOB-001"
                  value={refNumber}
                  onChange={e => setRefNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmConvert(); if (e.key === "Escape") setConvertDialog(null); }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 transition-colors"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  This reference links the invoice to this quote, purchase orders, and shipments — making it searchable across the dashboard.
                </p>
              </div>

              {/* Invoice Number */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <FileText size={12} className="text-slate-400" />
                  Invoice Number
                  <span className="ml-1 text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. FC - 5100"
                  value={invoiceNum}
                  onChange={e => setInvoiceNum(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmConvert(); if (e.key === "Escape") setConvertDialog(null); }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>

              {/* Info strip */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700">
                The quote will be marked <span className="font-semibold">Accepted</span> and a new draft invoice will be created with all line items copied over.
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setConvertDialog(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmConvert}
                disabled={convertToInvoice.isPending}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {convertToInvoice.isPending ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating…</>
                ) : (
                  <><FileCheck size={14} /> Create Invoice</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Convert to Invoice Dialog */}
      {bulkConvertDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => !bulkConvertDialog.converting && setBulkConvertDialog(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
                    <FileCheck size={14} className="text-white" />
                  </div>
                  <h3 className="text-slate-800 font-bold text-base">Bulk Convert Quotes to Invoice{bulkConvertDialog.quoteIds.length > 1 ? "s" : ""}</h3>
                </div>
                <p className="text-slate-400 text-xs">{bulkConvertDialog.quoteIds.length} quote{bulkConvertDialog.quoteIds.length !== 1 ? "s" : ""} selected</p>
              </div>
              {!bulkConvertDialog.converting && (
                <button onClick={() => setBulkConvertDialog(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Link2 size={12} className="text-emerald-500" />
                  Order Reference Number
                  <span className="ml-1 text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. ORD-2024-001 or JOB-001"
                  value={bulkConvertDialog.orderRef}
                  onChange={e => setBulkConvertDialog(prev => prev ? { ...prev, orderRef: e.target.value } : null)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 transition-colors"
                />
              </div>
              {bulkConvertDialog.quoteIds.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Invoice Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBulkConvertDialog(prev => prev ? { ...prev, invoiceMode: "multiple" } : null)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${bulkConvertDialog.invoiceMode === "multiple" ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {bulkConvertDialog.quoteIds.length} Separate Invoices
                    </button>
                    <button
                      onClick={() => setBulkConvertDialog(prev => prev ? { ...prev, invoiceMode: "single" } : null)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${bulkConvertDialog.invoiceMode === "single" ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      First Quote Only
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {bulkConvertDialog.invoiceMode === "multiple"
                      ? "Each selected quote will become its own invoice."
                      : "Only the first selected quote will be converted."}
                  </p>
                </div>
              )}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-700">
                Each converted quote will be marked <span className="font-semibold">Accepted</span> and a draft invoice created with all line items.
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setBulkConvertDialog(null)} disabled={bulkConvertDialog.converting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleBulkConvert} disabled={bulkConvertDialog.converting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {bulkConvertDialog.converting ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Converting…</>
                ) : (
                  <><FileCheck size={14} /> Convert</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
