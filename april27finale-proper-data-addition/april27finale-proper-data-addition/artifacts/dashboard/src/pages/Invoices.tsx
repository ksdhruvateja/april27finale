import { useState, useRef, Fragment, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useListAuctions } from "@/lib/auctions-api";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import InvoiceView from "@/components/InvoiceView";
import InvoiceModal from "@/components/InvoiceModal";
import { useListInvoices, useDeleteInvoice, usePayInvoice, useUpdateInvoice, getListInvoicesQueryKey, useListCustomers, useListPurchaseOrders, useListShipments } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, CheckCircle, Eye, X, Truck, ShoppingCart, Hash, Link2, ChevronDown, Pencil, StickyNote, Mail, MessageSquare, Download, Calendar, ChevronRight, BarChart2, ChevronUp, TrendingUp, TrendingDown, Printer, Save, CreditCard } from "lucide-react";
import { printShippingSlip } from "@/lib/print-slip";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend, PieChart, Pie, ComposedChart, Line, Area } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { patchListCache } from "@/lib/query-sync";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import ShipmentModal from "@/components/ShipmentModal";
import InvoicePoModal from "@/components/InvoicePoModal";
import PayNowModal from "@/components/PayNowModal";
import { formatInvoiceNumber, forezDocFallbackNumber } from "@/lib/forez-document-numbers";

type PaymentMethod = "stripe" | "bank_transfer" | "check" | "cash";

const INVOICE_STATUSES: { value: string; label: string; cls: string }[] = [
  { value: "draft",        label: "Draft",        cls: "text-slate-500  bg-slate-50  border-slate-200" },
  { value: "sent",         label: "Sent",         cls: "text-blue-700   bg-blue-50   border-blue-200"  },
  { value: "paid",         label: "Paid",         cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { value: "overdue",      label: "Overdue",      cls: "text-red-600    bg-red-50    border-red-200" },
  { value: "payment_hold", label: "Payment Hold", cls: "text-amber-700  bg-amber-50  border-amber-300" },
  { value: "cancelled",    label: "Cancelled",    cls: "text-slate-400  bg-slate-50  border-slate-200" },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string; desc: string }[] = [
  { value: "stripe",        label: "Credit Card",   desc: "Process via Stripe" },
  { value: "bank_transfer", label: "Bank Transfer", desc: "ACH / wire transfer" },
  { value: "check",         label: "Check",         desc: "Physical check" },
  { value: "cash",          label: "Cash",          desc: "Cash payment" },
];

interface InvoiceData {
  id: number;
  customerId: number;
  customerName?: string;
  status: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxPercent: number; discountPercent: number }>;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  dueDate?: string | null;
  paymentMethod?: string | null;
  paymentNote?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  internalNote?: string | null;
  createdAt: string;
  isQuickInvoice?: boolean;
  invoiceNumber?: string | null;
  trackingNumber?: string | null;
  quoteId?: number | null;
}

function getEffectiveStatus(status: string, dueDate?: string | null): string {
  if (status === "paid") return "paid";
  if (status === "draft") return "draft";
  if (status === "overdue") return "overdue";
  if (status === "payment_hold") return "payment_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "sent" || status === "pending" || status === "due") {
    if (dueDate && new Date(dueDate).getTime() < Date.now()) return "overdue";
    return "sent";
  }
  return status;
}

function StatusBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const effective = getEffectiveStatus(status, dueDate);
  const map: Record<string, string> = {
    paid:         "text-emerald-700 bg-emerald-50 border-emerald-200",
    sent:         "text-blue-700   bg-blue-50   border-blue-200",
    draft:        "text-slate-500  bg-slate-50  border-slate-200",
    overdue:      "text-red-600    bg-red-50    border-red-200",
    payment_hold: "text-amber-700  bg-amber-50  border-amber-300",
    cancelled:    "text-slate-400  bg-slate-50  border-slate-200",
  };
  const labels: Record<string, string> = { paid: "Paid", sent: "Sent", overdue: "Overdue", draft: "Draft", payment_hold: "Payment Hold", cancelled: "Cancelled" };
  return (
    <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[effective] ?? map.draft}`}>
      {labels[effective] ?? effective}
    </span>
  );
}

type StatusFilter = "all" | "draft" | "sent" | "paid" | "overdue" | "payment_hold" | "cancelled";
type DateFilter = "none" | "created" | "due";

export default function Invoices() {
  const { data: invoices, isLoading, isError, error, refetch } = useListInvoices();
  const { data: auctionList } = useListAuctions();
  const { data: customers } = useListCustomers();
  const { data: purchaseOrders } = useListPurchaseOrders();
  const { data: shipments } = useListShipments();
  const deleteInvoice = useDeleteInvoice();
  const payInvoice = usePayInvoice();
  const updateInvoice = useUpdateInvoice();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilterType, setDateFilterType] = useState<DateFilter>("none");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<any | null>(null);
  const [shipmentInvoice, setShipmentInvoice] = useState<InvoiceData | null>(null);
  const [shipmentPreflight, setShipmentPreflight] = useState<InvoiceData | null>(null);
  const [poInvoice, setPoInvoice] = useState<InvoiceData | null>(null);
  const [duplicatePOGuard, setDuplicatePOGuard] = useState<{ inv: InvoiceData; existingPOs: any[] } | null>(null);
  const [duplicateShipGuard, setDuplicateShipGuard] = useState<{ inv: InvoiceData; existingShips: any[] } | null>(null);
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null);
  const [payDialog, setPayDialog] = useState<{ id: number } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("bank_transfer");
  const [payNote, setPayNote] = useState("");
  const [payDate, setPayDate] = useState<string>("");
  const [earlyDiscount, setEarlyDiscount] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  /* ── Analytics ────────────────────────────────────── */
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView]   = useState<"trend" | "customers" | "status" | "payment">("trend");
  const [chartPeriod, setChartPeriod] = useState<"all"|"1mo"|"3mo"|"6mo"|"12mo">("all");

  function getPeriodStart(p: string) {
    if (p === "all") return null;
    const now = new Date();
    const mo = parseInt(p);
    return new Date(now.getFullYear(), now.getMonth() - mo, now.getDate());
  }

  const invBaseFiltered = useMemo(() => {
    const ps = getPeriodStart(chartPeriod);
    return (invoices ?? []).filter((inv: any) => !ps || new Date(inv.createdAt || 0) >= ps);
  }, [invoices, chartPeriod]);

  const invMonthlyData = useMemo(() => {
    const by: Record<string, { revenue: number; count: number; paid: number }> = {};
    for (const inv of invBaseFiltered as any[]) {
      const mo = (inv.createdAt || "").slice(0, 7) || "Unknown";
      if (!by[mo]) by[mo] = { revenue: 0, count: 0, paid: 0 };
      by[mo].count += 1;
      by[mo].revenue += Number(inv.total ?? 0);
      if (inv.status === "paid") by[mo].paid += Number(inv.total ?? 0);
    }
    return Object.entries(by).filter(([m]) => m !== "Unknown").sort(([a],[b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month: new Date(month+"-01").toLocaleDateString("en-US", { month:"short", year:"2-digit" }),
        revenue: Math.round(v.revenue*100)/100,
        paid: Math.round(v.paid*100)/100,
        unpaid: Math.round((v.revenue - v.paid)*100)/100,
        count: v.count,
        collectionRate: v.revenue > 0 ? Math.round(v.paid / v.revenue * 100) : 0,
      }));
  }, [invBaseFiltered]);

  const invCustomerData = useMemo(() => {
    const by: Record<string, { revenue: number; count: number }> = {};
    for (const inv of invBaseFiltered as any[]) {
      const name = inv.customerName || "Unknown";
      if (!by[name]) by[name] = { revenue: 0, count: 0 };
      by[name].revenue += Number(inv.total ?? 0);
      by[name].count += 1;
    }
    return Object.entries(by).map(([name,v]) => ({ name, revenue: Math.round(v.revenue*100)/100, count: v.count }))
      .sort((a,b) => b.revenue - a.revenue).slice(0, 12);
  }, [invBaseFiltered]);

  const invStatusData = useMemo(() => {
    const by: Record<string, { count: number; total: number }> = {};
    for (const inv of invBaseFiltered as any[]) {
      const s = getEffectiveStatus(inv.status, inv.dueDate);
      if (!by[s]) by[s] = { count: 0, total: 0 };
      by[s].count += 1;
      by[s].total += Number(inv.total ?? 0);
    }
    const COLORS: Record<string, string> = { paid:"#10b981", sent:"#3b82f6", overdue:"#ef4444", draft:"#94a3b8" };
    return Object.entries(by).map(([name,v]) => ({ name, ...v, fill: COLORS[name]??"#94a3b8" }));
  }, [invBaseFiltered]);

  const invPaymentData = useMemo(() => {
    const by: Record<string, { total: number; count: number }> = {};
    for (const inv of (invoices ?? []) as any[]) {
      if (inv.status === "paid") {
        const m = inv.paymentMethod || "Unknown";
        if (!by[m]) by[m] = { total: 0, count: 0 };
        by[m].total += Number(inv.total ?? 0);
        by[m].count += 1;
      }
    }
    const COLORS = ["#10b981","#3b82f6","#6366f1","#f59e0b","#ef4444","#8b5cf6","#14b8a6"];
    return Object.entries(by).map(([name, v], i) => ({
      name, total: Math.round(v.total*100)/100, count: v.count, fill: COLORS[i%COLORS.length],
    })).sort((a,b) => b.total - a.total);
  }, [invoices]);

  const invKpis = useMemo(() => {
    const all = invBaseFiltered as any[];
    const paid = all.filter((i: any) => i.status === "paid");
    const overdue = all.filter((i: any) => getEffectiveStatus(i.status, i.dueDate) === "overdue");
    return {
      total: all.length,
      totalValue: all.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0),
      paidValue: paid.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0),
      overdueCount: overdue.length,
      overdueValue: overdue.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0),
    };
  }, [invBaseFiltered]);

  const fallbackFcNumber = (id: number) => forezDocFallbackNumber("invoice", id);
  const displayInvoiceNumber = (inv: { id: number; invoiceNumber?: string | null }) =>
    formatInvoiceNumber(inv.id, inv.invoiceNumber);
  const [editingNum, setEditingNum] = useState<{ id: number; value: string } | null>(null);
  const [editingRef, setEditingRef] = useState<{ id: number; value: string } | null>(null);
  const numInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const numSavingRef = useRef(false);
  const refSavingRef = useRef(false);
  const [payNowInvoice, setPayNowInvoice] = useState<any>(null);
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteEditId, setNoteEditId] = useState<number | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  type InvLineItem = { description: string; quantity: number; unitPrice: number; taxPercent: number; discountPercent: number; [k: string]: any };
  const [expandedInvId, setExpandedInvId] = useState<number | null>(null);
  const [expandedInvItems, setExpandedInvItems] = useState<Record<number, InvLineItem[]>>({});
  const [savingInvItems, setSavingInvItems] = useState<number | null>(null);

  const customerMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const c of (customers ?? [])) map.set(Number((c as any).id), c);
    return map;
  }, [customers]);

  const displayName = (inv: InvoiceData) => {
    const c = customerMap.get(Number(inv.customerId));
    return (c as any)?.company || (c as any)?.name || inv.customerName || "—";
  };

  const openPoModal = (inv: InvoiceData) => {
    const existingPOs = (purchaseOrders ?? []).filter((po: any) => po.sourceInvoiceId === inv.id);
    if (existingPOs.length > 0) {
      setDuplicatePOGuard({ inv, existingPOs });
    } else {
      setPoInvoice(inv);
    }
  };

  const openShipmentPreflight = (inv: InvoiceData) => {
    const existingShips = (shipments ?? []).filter((s: any) => s.invoiceId === inv.id);
    if (existingShips.length > 0) {
      setDuplicateShipGuard({ inv, existingShips });
    } else {
      setShipmentPreflight(inv);
    }
  };

  const auctionByInvoiceId = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of (auctionList ?? [])) {
      const ids = Array.from(new Set([
        ...(a.linkedInvoiceIds ?? []),
        ...(a.invoiceId ? [a.invoiceId] : []),
      ]));
      for (const id of ids) map.set(Number(id), a.projectName || `Auction #${a.id}`);
    }
    return map;
  }, [auctionList]);

  const debouncedSearch = useDebounce(search, 250);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      draft: 0,
      sent: 0,
      paid: 0,
      overdue: 0,
      payment_hold: 0,
      cancelled: 0,
    };
    for (const inv of (invoices as InvoiceData[] | undefined) ?? []) {
      counts.all += 1;
      const effective = getEffectiveStatus(inv.status, inv.dueDate);
      if (effective in counts) counts[effective] += 1;
    }
    return counts;
  }, [invoices]);

  const clearListFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFilterType("none");
    setDateFrom("");
    setDateTo("");
  };

  const filtered = useMemo(() => {
    const s = debouncedSearch.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : null;

    return ((invoices as InvoiceData[] | undefined) ?? []).filter(i => {
      const productText = (i.lineItems ?? []).map(li => String(li.description ?? "")).join(" ").toLowerCase();
      const cust = customerMap.get(Number(i.customerId));
      const companyOrName = (cust as any)?.company || (cust as any)?.name || i.customerName || "";
      const matchesSearch = !s || [
        companyOrName, i.customerName, i.invoiceNumber, i.trackingNumber,
        i.status, i.notes, i.internalNote, String(i.id ?? ""), productText,
      ].some(v => String(v ?? "").toLowerCase().includes(s));
      const effectiveStatus = getEffectiveStatus(i.status, i.dueDate);
      const matchesFilter = statusFilter === "all" || effectiveStatus === statusFilter;
      let matchesDate = true;
      if (dateFilterType !== "none" && (from !== null || to !== null)) {
        const dateVal = dateFilterType === "created"
          ? new Date(i.createdAt).getTime()
          : i.dueDate ? new Date(i.dueDate).getTime() : null;
        if (dateVal === null) matchesDate = false;
        else {
          if (from !== null && dateVal < from) matchesDate = false;
          if (to !== null && dateVal > to) matchesDate = false;
        }
      }
      return matchesSearch && matchesFilter && matchesDate;
    }).sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [invoices, debouncedSearch, statusFilter, dateFilterType, dateFrom, dateTo, customerMap]);

  const hasActiveFilters =
    debouncedSearch.trim().length > 0 ||
    statusFilter !== "all" ||
    dateFilterType !== "none" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const tableRows: InvoiceData[] =
    filtered.length > 0
      ? filtered
      : hasActiveFilters && (invoices?.length ?? 0) > 0
        ? ((invoices as InvoiceData[] | undefined) ?? [])
        : filtered;

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this invoice?")) {
      deleteInvoice.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() })
      });
    }
  };

  const openPayDialog = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPayDialog({ id });
    setSelectedMethod("bank_transfer");
    setPayNote("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setEarlyDiscount("");
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const displayedIds = tableRows.map(inv => inv.id);
    setSelectedIds(prev => {
      if (displayedIds.every(id => prev.has(id))) return new Set();
      return new Set(displayedIds);
    });
  };

  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.size} selected invoice(s)?`)) return;
    Promise.all([...selectedIds].map(id =>
      fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/invoices/${id}`, { method: "DELETE" })
    )).then(() => {
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      setSelectedIds(new Set());
    });
  };

  const doSetStatus = (inv: InvoiceData, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (newStatus === inv.status) return;
    if (newStatus === "paid") { openPayDialog(inv.id, e); return; }
    const prevStatus = inv.status;
    queryClient.setQueryData(getListInvoicesQueryKey(), (old: InvoiceData[] | undefined) =>
      old?.map(i => i.id === inv.id ? { ...i, status: newStatus } : i)
    );
    updateInvoice.mutate({ id: inv.id, data: { status: newStatus } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["accounting-pnl"] });
        queryClient.invalidateQueries({ queryKey: ["accounting-ar"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard/stats"] });
      },
      onError: () => {
        queryClient.setQueryData(getListInvoicesQueryKey(), (old: InvoiceData[] | undefined) =>
          old?.map(i => i.id === inv.id ? { ...i, status: prevStatus } : i)
        );
      }
    });
  };

  const startEditNum = (inv: InvoiceData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNum({ id: inv.id, value: displayInvoiceNumber(inv) });
    setTimeout(() => numInputRef.current?.select(), 0);
  };

  const saveNum = (id: number) => {
    if (!editingNum || numSavingRef.current) return;
    numSavingRef.current = true;
    const val = editingNum.value.trim() || null;
    queryClient.setQueryData(getListInvoicesQueryKey(), (old: InvoiceData[] | undefined) =>
      old?.map(inv => inv.id === id ? { ...inv, invoiceNumber: val } : inv)
    );
    setEditingNum(null);
    updateInvoice.mutate({ id, data: { invoiceNumber: val } as any }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() }),
      onError: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() }),
      onSettled: () => { numSavingRef.current = false; },
    });
  };

  const startEditRef = (inv: InvoiceData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRef({ id: inv.id, value: inv.trackingNumber ?? "" });
    setTimeout(() => refInputRef.current?.select(), 0);
  };

  const saveRef = () => {
    if (!editingRef || refSavingRef.current) return;
    refSavingRef.current = true;
    const id = editingRef.id;
    const val = editingRef.value.trim() || null;
    queryClient.setQueryData(getListInvoicesQueryKey(), (old: InvoiceData[] | undefined) =>
      old?.map(inv => inv.id === id ? { ...inv, trackingNumber: val } : inv)
    );
    setEditingRef(null);
    updateInvoice.mutate({ id, data: { trackingNumber: val } as any }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() }),
      onError: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() }),
      onSettled: () => { refSavingRef.current = false; },
    });
  };

  const saveInlineNote = (id: number) => {
    setNoteSaving(true);
    updateInvoice.mutate(
      { id, data: { internalNote: noteEditText.trim() || null } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          setNoteEditId(null);
          setNoteOpenId(null);
          setNoteSaving(false);
        },
        onError: () => { setNoteSaving(false); setNoteEditId(null); },
      }
    );
  };

  const toggleInvExpand = (inv: InvoiceData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedInvId === inv.id) {
      setExpandedInvId(null);
    } else {
      setExpandedInvId(inv.id);
      if (!expandedInvItems[inv.id]) {
        setExpandedInvItems(prev => ({
          ...prev,
          [inv.id]: (inv.lineItems ?? []).map(li => ({
            ...li,
            quantity: Number(li.quantity ?? 1),
            unitPrice: Number(li.unitPrice ?? 0),
            taxPercent: Number(li.taxPercent ?? 0),
            discountPercent: Number(li.discountPercent ?? 0),
          })),
        }));
      }
    }
  };

  const updateInvItem = (invId: number, idx: number, field: "quantity" | "unitPrice", value: number) => {
    setExpandedInvItems(prev => ({
      ...prev,
      [invId]: (prev[invId] ?? []).map((li, i) => i === idx ? { ...li, [field]: value } : li),
    }));
  };

  const calcInvTotals = (items: InvLineItem[]) => {
    let subtotal = 0, taxTotal = 0, discountTotal = 0;
    for (const li of items) {
      const gross = li.quantity * li.unitPrice;
      const disc = gross * (li.discountPercent / 100);
      const afterDisc = gross - disc;
      const tax = afterDisc * (li.taxPercent / 100);
      discountTotal += disc;
      subtotal += afterDisc;
      taxTotal += tax;
    }
    return { subtotal, taxTotal, discountTotal, total: subtotal + taxTotal };
  };

  const saveInvLineItems = async (inv: InvoiceData) => {
    const items = expandedInvItems[inv.id];
    if (!items) return;
    setSavingInvItems(inv.id);
    try {
      const { subtotal, taxTotal, discountTotal, total } = calcInvTotals(items);
      await updateInvoice.mutateAsync({
        id: inv.id,
        data: { lineItems: items, subtotal, taxTotal, discountTotal, total } as any,
      });
      await queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      setExpandedInvId(null);
    } finally {
      setSavingInvItems(null);
    }
  };

  const confirmPay = () => {
    if (!payDialog) return;
    const noteParts: string[] = [];
    if (payDate) noteParts.push(`Date: ${payDate}`);
    if (earlyDiscount) noteParts.push(`Early discount: ${earlyDiscount}%`);
    if (payNote) noteParts.push(payNote);
    payInvoice.mutate({ id: payDialog.id, data: { paymentMethod: selectedMethod, paymentNote: noteParts.join(" | ") || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        setPayDialog(null);
        setViewInvoice(null);
      }
    });
  };

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all",          label: "All" },
    { value: "draft",        label: "Draft" },
    { value: "sent",         label: "Sent" },
    { value: "paid",         label: "Paid" },
    { value: "overdue",      label: "Overdue" },
    { value: "payment_hold", label: "On Hold" },
    { value: "cancelled",    label: "Cancelled" },
  ];

  const DATE_FILTER_OPTS: { value: DateFilter; label: string }[] = [
    { value: "none", label: "Any Date" },
    { value: "created", label: "Created Date" },
    { value: "due", label: "Due Date" },
  ];

  return (
    <Layout>
      <Header title="Invoices" subtitle={`${invoices?.length ?? 0} total · ${tableRows.length} shown`} />
      <div className="flex-1 min-h-0 h-0 flex flex-col overflow-hidden bg-[hsl(220_25%_97%)]">
        <div className="flex-shrink-0 px-5 pt-4 pb-2 flex flex-col gap-3 min-w-0">

        {/* Search + Create */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search by customer, invoice #, order ref, status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowCharts(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors flex-shrink-0 ${showCharts ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            <BarChart2 size={14} /> Analytics {showCharts ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors flex-shrink-0"
          >
            <Plus size={14} /> Create Invoice
          </button>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status tabs */}
          <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {STATUS_TABS.map(tab => {
              const count = statusCounts[tab.value] ?? 0;
              return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                  statusFilter === tab.value
                    ? tab.value === "all"          ? "bg-[hsl(224_50%_15%)] text-white shadow-sm"
                    : tab.value === "draft"        ? "bg-slate-600 text-white shadow-sm"
                    : tab.value === "paid"         ? "bg-emerald-600 text-white shadow-sm"
                    : tab.value === "overdue"      ? "bg-red-500 text-white shadow-sm"
                    : tab.value === "payment_hold" ? "bg-amber-500 text-white shadow-sm"
                    : "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    statusFilter === tab.value ? "bg-white/20" : "bg-slate-100 text-slate-600"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
            })}
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={13} className="text-slate-400 flex-shrink-0" />
            <select
              value={dateFilterType}
              onChange={e => setDateFilterType(e.target.value as DateFilter)}
              className="text-xs text-slate-600 bg-transparent border-none focus:outline-none font-medium"
            >
              {DATE_FILTER_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {dateFilterType !== "none" && (
              <>
                <span className="text-slate-300">|</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="text-xs text-slate-600 bg-transparent border-none focus:outline-none w-28" />
                <span className="text-slate-400 text-xs">to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="text-xs text-slate-600 bg-transparent border-none focus:outline-none w-28" />
                <button onClick={() => { setDateFrom(""); setDateTo(""); setDateFilterType("none"); }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"><X size={11} /></button>
              </>
            )}
          </div>

          {filtered.length !== (invoices?.length ?? 0) && (
            <span className="text-xs text-slate-400 ml-1">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* ── Analytics Panel ─────────────────────────────── */}
        {showCharts && (
          <div className="glass-card analytics-panel p-5 flex flex-col gap-4 max-h-[min(60vh,640px)] overflow-y-auto">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Invoices", value: String(invKpis.total), color: "text-slate-700", icon: TrendingUp },
                { label: "Total Value", value: `$${invKpis.totalValue.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: "text-indigo-600", icon: TrendingUp },
                { label: "Paid Revenue", value: `$${invKpis.paidValue.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: "text-emerald-600", icon: TrendingUp },
                { label: "Overdue", value: `${invKpis.overdueCount} ($${invKpis.overdueValue.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})})`, color: "text-red-500", icon: TrendingDown },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <k.icon size={16} className={k.color} />
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{k.label}</p>
                    <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                {(["trend","customers","status","payment"] as const).map(v => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${chartView===v?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                    {v==="trend"?"Revenue Trend":v==="customers"?"By Customer":v==="status"?"Status Mix":"Payment Methods"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                Period:
                {(["all","1mo","3mo","6mo","12mo"] as const).map(p => (
                  <button key={p} onClick={() => setChartPeriod(p)}
                    className={`px-2 py-1 rounded-md font-medium transition-all ${chartPeriod===p?"bg-indigo-600 text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {p==="all"?"All":p}
                  </button>
                ))}
              </div>
            </div>

            {/* Charts */}
            {chartView === "trend" && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Monthly Collections — Paid vs. Unpaid &amp; Collection Rate</p>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={invMonthlyData} margin={{ left: 10, right: 44, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#cbd5e1" tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#f59e0b" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: any, name: string) => name === "collectionRate" ? [`${v}%`, "Collection Rate"] : [`$${Number(v).toLocaleString()}`, name === "paid" ? "Paid" : "Unpaid"]} />
                    <Legend formatter={v => v === "paid" ? "Collected" : v === "unpaid" ? "Unpaid" : "Collection Rate %"} />
                    <Bar yAxisId="left" dataKey="paid" name="paid" stackId="inv" fill="#10b981" radius={[0,0,0,0]} />
                    <Bar yAxisId="left" dataKey="unpaid" name="unpaid" stackId="inv" fill="#818cf8" radius={[3,3,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="collectionRate" name="collectionRate" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "customers" && (
              <div className="h-72">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Top Customers by Revenue</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={invCustomerData} layout="vertical" margin={{ left: 80, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#cbd5e1" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#cbd5e1" width={76} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="revenue" radius={[0,4,4,0]}>
                      {invCustomerData.map((_,i) => <Cell key={i} fill={`hsl(${215+i*18},65%,${55-i*2}%)`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "status" && (
              <div className="flex gap-6 items-center">
                <div className="h-52 flex-1">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Invoice Status Distribution</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={invStatusData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3} label={({name,pct}) => `${name} ${pct??0}%`} labelLine={false}>
                        {invStatusData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v:any,name:any) => [v, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-[180px]">
                  {invStatusData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                      <span className="text-xs text-slate-600 capitalize flex-1">{d.name}</span>
                      <span className="text-xs font-bold text-slate-700">{d.count} <span className="text-slate-400 font-normal">(${Math.round(d.total).toLocaleString()})</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chartView === "payment" && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Payment Method Breakdown — Amount Collected &amp; Invoice Count</p>
                {invPaymentData.length === 0 ? (
                  <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No paid invoices yet.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(invPaymentData.length * 52, 120)}>
                      <BarChart data={invPaymentData} layout="vertical" margin={{ left: 4, right: 80, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} stroke="#e2e8f0" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} stroke="none" width={110} tickFormatter={(v: string) => v.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} />
                        <Tooltip formatter={(v: any, name: string) => name === "total" ? [`$${Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`, "Amount"] : [v, "Invoices"]} />
                        <Bar dataKey="total" name="total" radius={[0,4,4,0]}
                          label={{ position: "right", formatter: (_: any, entry: any) => entry?.count !== undefined ? `${entry.count} inv.` : "", fontSize: 10, fill: "#94a3b8" }}>
                          {invPaymentData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 flex-wrap text-xs text-slate-500 pl-1">
                      {invPaymentData.map(d => (
                        <span key={d.name} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: d.fill }} />
                          <span className="capitalize">{d.name.replace(/_/g," ")}</span>
                          <strong className="text-slate-700">${Math.round(d.total).toLocaleString()}</strong>
                          <span className="text-slate-400">({d.count})</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        <div className="flex-1 min-h-0 h-0 px-5 pb-4 pt-1 flex flex-col">
        <div className="glass-card flex-1 min-h-0 h-0 flex flex-col overflow-hidden border border-blue-100/70 bg-white/95">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : isError ? (
            <div className="p-10 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-red-600 font-medium">Could not load invoices from the server.</p>
              <p className="text-xs text-slate-500 max-w-md">{(error as Error)?.message ?? "Check that the API is running and the database is connected."}</p>
              <button type="button" onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700">
                Retry
              </button>
            </div>
          ) : tableRows.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
              {(invoices?.length ?? 0) === 0
                ? <p>No invoices yet. Click Create Invoice to add one.</p>
                : (
                  <>
                    <p>No invoices match your filters ({invoices?.length ?? 0} saved in database).</p>
                    <p className="text-xs text-slate-500 max-w-md">
                      New invoices are saved as <strong className="text-slate-600">Draft</strong>. Check the Draft or All tab, or clear filters below.
                    </p>
                    <button
                      type="button"
                      onClick={clearListFilters}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700"
                    >
                      Show all invoices
                    </button>
                  </>
                )}
            </div>
          ) : (
            <>
            <div className="flex-shrink-0 px-4 py-2 border-b border-slate-100 bg-slate-50/90 text-xs text-slate-600 flex items-center justify-between gap-2">
              <span>
                Showing <strong className="text-slate-800">{tableRows.length}</strong> invoice{tableRows.length !== 1 ? "s" : ""}
                {hasActiveFilters && filtered.length === 0 && (invoices?.length ?? 0) > 0 && (
                  <span className="text-amber-700 ml-1">(filters hid all — showing saved list)</span>
                )}
              </span>
              <span className="text-slate-400 hidden sm:inline">Scroll below to see the full list</span>
            </div>
            {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-5 py-2.5 bg-indigo-50 border-b border-indigo-100">
              <span className="text-sm font-semibold text-indigo-700">{selectedIds.size} selected</span>
              <button
                onClick={() => {
                  const firstId = [...selectedIds][0];
                  const inv = tableRows.find(i => i.id === firstId);
                  if (inv) openPoModal(inv);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
              >
                <ShoppingCart size={12} /> Convert to PO
              </button>
              <button
                onClick={() => {
                  const firstId = [...selectedIds][0];
                  const inv = tableRows.find(i => i.id === firstId);
                  if (inv) openShipmentPreflight(inv);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold hover:bg-sky-100 transition-colors"
              >
                <Truck size={12} /> Create Shipment
              </button>
              <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
                <Trash2 size={12} /> Delete
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 font-medium">Clear selection</button>
            </div>
            )}
          <div className="data-table-scroll">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-3 w-9" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-slate-300 accent-indigo-600 cursor-pointer"
                      checked={(tableRows.length ?? 0) > 0 && (tableRows.every(inv => selectedIds.has(inv.id)) ?? false)}
                      onChange={toggleSelectAll} />
                  </th>
                  <th className="px-2 py-3 w-8" />
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Invoice</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Created / Paid</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Due Date</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Total</th>
                  <th className="px-3 py-3 text-center text-slate-400 font-medium text-[11px] uppercase tracking-wider w-16">Note</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {tableRows.map(inv => (
                  <Fragment key={inv.id}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors group cursor-pointer ${(noteOpenId === inv.id || noteEditId === inv.id || expandedInvId === inv.id) ? "border-b-0" : ""} ${selectedIds.has(inv.id) ? "bg-indigo-50/50" : ""} ${expandedInvId === inv.id ? "bg-indigo-50/30" : ""}`}
                    onClick={() => setViewInvoice(inv)}
                  >
                    <td className="px-3 py-3.5 w-9" onClick={e => toggleSelect(inv.id, e)}>
                      <input type="checkbox" className="rounded border-slate-300 accent-indigo-600 cursor-pointer"
                        checked={selectedIds.has(inv.id)} onChange={() => {}} />
                    </td>
                    <td className="px-2 py-3.5 w-8" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => toggleInvExpand(inv, e)}
                        title={expandedInvId === inv.id ? "Collapse" : "Edit line items"}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all"
                      >
                        {expandedInvId === inv.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      {editingNum?.id === inv.id ? (
                        <input
                          ref={numInputRef}
                          value={editingNum.value}
                          onChange={e => setEditingNum({ id: inv.id, value: e.target.value })}
                          onBlur={() => saveNum(inv.id)}
                          onKeyDown={e => { if (e.key === "Enter") saveNum(inv.id); if (e.key === "Escape") setEditingNum(null); }}
                          className="font-mono text-xs border border-slate-300 rounded px-2 py-0.5 w-32 bg-white text-slate-800 focus:outline-none focus:border-blue-400"
                        />
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 group/num whitespace-nowrap">
                            <Eye size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" onClick={() => setViewInvoice(inv)} />
                            <span className="text-slate-400 font-mono text-xs whitespace-nowrap" onClick={() => setViewInvoice(inv)}>
                              {displayInvoiceNumber(inv)}
                            </span>
                            <button title="Edit invoice number" onClick={e => startEditNum(inv, e)}
                              className="opacity-0 group-hover/num:opacity-100 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
                              <Edit size={10} />
                            </button>
                          </div>
                          {inv.trackingNumber && (
                            <span className="text-[10px] text-indigo-500 font-medium flex items-center gap-1">
                              <Link2 size={9} /> {inv.trackingNumber}
                            </span>
                          )}
                          {auctionByInvoiceId.has(Number(inv.id)) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                              🏷 {auctionByInvoiceId.get(Number(inv.id))}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-slate-800 font-medium text-sm">{displayName(inv)}</p>
                        {(() => { const c = customerMap.get(Number(inv.customerId)); return (c as any)?.company && (c as any)?.name !== displayName(inv) ? <p className="text-slate-400 text-xs mt-0.5">{(c as any).name}</p> : null; })()}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-500 text-xs">{formatDate(inv.createdAt)}</span>
                        {inv.paidAt && <span className="text-emerald-600 text-xs font-medium">Paid {formatDate(inv.paidAt)}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(inv.dueDate)}</td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1 group/status">
                            <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                            <ChevronDown size={11} className="text-slate-300 group-hover/status:text-slate-500 transition-colors -ml-0.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="bg-white border-slate-200 shadow-lg min-w-[140px]">
                          {INVOICE_STATUSES.map(s => (
                            <DropdownMenuItem key={s.value} onClick={e => doSetStatus(inv, s.value, e)}
                              className={`gap-2 cursor-pointer text-sm focus:bg-slate-50 ${getEffectiveStatus(inv.status, inv.dueDate) === s.value ? "font-bold" : ""}`}>
                              <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
                              {getEffectiveStatus(inv.status, inv.dueDate) === s.value && <span className="ml-auto text-slate-300 text-xs">current</span>}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-800 font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button title={inv.internalNote ? "View internal note" : "No note yet"}
                          onClick={e => { e.stopPropagation(); if (noteEditId === inv.id) return; setNoteOpenId(noteOpenId === inv.id ? null : inv.id); }}
                          className={`p-1 rounded transition-colors ${inv.internalNote ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:text-amber-400 hover:bg-amber-50"}`}>
                          <Eye size={13} />
                        </button>
                        <button title="Edit internal note"
                          onClick={e => { e.stopPropagation(); setNoteEditId(inv.id); setNoteEditText(inv.internalNote ?? ""); setNoteOpenId(null); }}
                          className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button title="Send Email" onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-all"><Mail size={13} /></button>
                        <button title="Send SMS" onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition-all"><MessageSquare size={13} /></button>
                        <button title="Download" onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"><Download size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); openShipmentPreflight(inv); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-all whitespace-nowrap">
                          <Truck size={11} /> Shipment
                        </button>
                        <button onClick={e => { e.stopPropagation(); openPoModal(inv); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all whitespace-nowrap">
                          <ShoppingCart size={11} /> Create PO
                        </button>
                        <button onClick={e => { e.stopPropagation(); setPayNowInvoice(inv); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all whitespace-nowrap shadow-sm">
                          <CreditCard size={11} /> Pay Now
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 hover:bg-slate-100 rounded-lg transition-all" onClick={e => e.stopPropagation()}>
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[170px]">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setViewInvoice(inv); }} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Eye size={13} /> View Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditInvoice(inv); }} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Edit size={13} /> Edit Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => startEditNum(inv, e)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Hash size={13} /> Edit Invoice #
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => startEditRef(inv, e)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Link2 size={13} /> Edit Order Ref
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => openPayDialog(inv.id, e)} className="gap-2 cursor-pointer text-sm text-emerald-600 hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-600">
                              <CheckCircle size={13} /> Mark Paid
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => handleDelete(inv.id, e)} className="gap-2 cursor-pointer text-sm text-red-500 hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                              <Trash2 size={13} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {expandedInvId === inv.id && (() => {
                    const editItems = expandedInvItems[inv.id] ?? [];
                    const { subtotal, taxTotal, discountTotal, total: liveTotal } = calcInvTotals(editItems);
                    const isSaving = savingInvItems === inv.id;
                    return (
                      <tr className="border-b border-indigo-100 bg-indigo-50/40">
                        <td colSpan={10} className="px-5 pb-4 pt-2">
                          <div className="flex flex-col gap-2">
                            <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">Edit Line Items</p>
                            <div className="rounded-xl border border-indigo-100 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-indigo-50/80 border-b border-indigo-100">
                                    <th className="px-3 py-2 text-left text-indigo-500 font-semibold uppercase tracking-wider text-[10px]">Description</th>
                                    <th className="px-3 py-2 text-center text-indigo-500 font-semibold uppercase tracking-wider text-[10px] w-28">Qty</th>
                                    <th className="px-3 py-2 text-center text-indigo-500 font-semibold uppercase tracking-wider text-[10px] w-32">Unit Price</th>
                                    <th className="px-3 py-2 text-center text-indigo-500 font-semibold uppercase tracking-wider text-[10px] w-20">Tax %</th>
                                    <th className="px-3 py-2 text-center text-indigo-500 font-semibold uppercase tracking-wider text-[10px] w-20">Disc %</th>
                                    <th className="px-3 py-2 text-right text-indigo-500 font-semibold uppercase tracking-wider text-[10px] w-28">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {editItems.map((li, idx) => {
                                    const gross = li.quantity * li.unitPrice;
                                    const afterDisc = gross * (1 - li.discountPercent / 100);
                                    const lineTotal = afterDisc * (1 + li.taxPercent / 100);
                                    return (
                                      <tr key={idx} className="border-b border-indigo-50 last:border-0 bg-white hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-3 py-2 text-slate-700 font-medium">{li.description || "—"}</td>
                                        <td className="px-3 py-2 text-center">
                                          <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={li.quantity}
                                            onChange={e => updateInvItem(inv.id, idx, "quantity", parseFloat(e.target.value) || 0)}
                                            onClick={e => e.stopPropagation()}
                                            className="w-20 text-center border border-indigo-200 rounded-lg px-2 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={li.unitPrice}
                                            onChange={e => updateInvItem(inv.id, idx, "unitPrice", parseFloat(e.target.value) || 0)}
                                            onClick={e => e.stopPropagation()}
                                            className="w-24 text-center border border-indigo-200 rounded-lg px-2 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-center text-slate-500">{li.taxPercent}%</td>
                                        <td className="px-3 py-2 text-center text-slate-500">{li.discountPercent}%</td>
                                        <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatCurrency(lineTotal)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span>Subtotal: <span className="font-semibold text-slate-700">{formatCurrency(subtotal)}</span></span>
                                {taxTotal > 0 && <span>Tax: <span className="font-semibold text-slate-700">+{formatCurrency(taxTotal)}</span></span>}
                                {discountTotal > 0 && <span>Discount: <span className="font-semibold text-red-600">−{formatCurrency(discountTotal)}</span></span>}
                                <span className="text-indigo-700 font-bold text-sm">New Total: {formatCurrency(liveTotal)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={e => { e.stopPropagation(); setExpandedInvId(null); }}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); saveInvLineItems(inv); }}
                                  disabled={isSaving}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                                >
                                  {isSaving ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</> : <><Save size={11} /> Save & Update Total</>}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  {noteOpenId === inv.id || noteEditId === inv.id ? (
                    <tr className="border-b border-slate-100 bg-amber-50/40">
                      <td colSpan={10} className="px-5 pb-3 pt-0">
                        {noteEditId === inv.id ? (
                          <div className="flex flex-col gap-2 pt-2">
                            <textarea value={noteEditText} onChange={e => setNoteEditText(e.target.value)}
                              placeholder="Add an internal note (not visible to customer)..." rows={2} autoFocus
                              className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-400 resize-none placeholder:text-slate-400"
                              onKeyDown={e => { if (e.key === "Escape") setNoteEditId(null); }} />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setNoteEditId(null)} className="text-xs px-3 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                              <button onClick={() => saveInlineNote(inv.id)} disabled={noteSaving}
                                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50">
                                {noteSaving ? "Saving…" : "Save Note"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 pt-2">
                            <StickyNote size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-slate-600 whitespace-pre-wrap">
                              {inv.internalNote || <span className="text-slate-400 italic">No note yet. Click pencil to add one.</span>}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>
        </div>

        {/* Inline ref edit */}
        {editingRef && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setEditingRef(null)}>
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative bg-white rounded-xl border border-slate-200 shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold text-slate-700 mb-3">Edit Order Reference</p>
              <input ref={refInputRef} value={editingRef.value} onChange={e => setEditingRef({ id: editingRef.id, value: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") saveRef(); if (e.key === "Escape") setEditingRef(null); }}
                placeholder="e.g. ORD-001 or PO#12345"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 mb-3"
                autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setEditingRef(null)} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
                <button onClick={saveRef} className="flex-1 py-2 rounded-lg bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)]">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <InvoiceModal
          onClose={() => setShowModal(false)}
          onCreated={(created) => {
            if (created?.id != null) {
              patchListCache(queryClient, getListInvoicesQueryKey(), "create", created as InvoiceData);
            }
            clearListFilters();
            void queryClient.refetchQueries({ queryKey: getListInvoicesQueryKey() });
          }}
        />
      )}
      {editInvoice && <InvoiceModal onClose={() => setEditInvoice(null)} initial={editInvoice} />}
      {viewInvoice && (
        <InvoiceView
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onEdit={() => { setEditInvoice(viewInvoice); setViewInvoice(null); }}
          onPay={e => openPayDialog(viewInvoice.id, e)}
          onShip={() => { const inv = viewInvoice; setViewInvoice(null); if (inv) openShipmentPreflight(inv); }}
          onCreatePO={() => { const inv = viewInvoice; setViewInvoice(null); if (inv) openPoModal(inv); }}
        />
      )}
      {/* Duplicate PO Guard Dialog */}
      {duplicatePOGuard && (() => {
        const { inv, existingPOs } = duplicatePOGuard;
        const poLabel = (po: any) => {
          const invNum = inv.invoiceNumber ?? `FRZI-${Math.max(5100, 5099 + Number(inv.id ?? 0))}`;
          const m = invNum.match(/^FRZI[\s-]+(.+)$/i);
          const core = m ? m[1].trim() : String(inv.id ?? 0);
          return po.poSequence ? `FRZPO-${core}-${po.poSequence}` : `FRZPO-${String(po.id).padStart(4, "0")}`;
        };
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setDuplicatePOGuard(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><ShoppingCart size={16} className="text-amber-600" /></div>
                <div>
                  <h3 className="text-slate-800 font-bold text-base leading-tight">PO Already Exists</h3>
                  <p className="text-slate-400 text-xs">{displayName(inv)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 mb-5">
                <p className="text-sm text-slate-600">
                  This invoice already has {existingPOs.length === 1 ? "a purchase order" : `${existingPOs.length} purchase orders`}:
                </p>
                <div className="flex flex-col gap-1.5">
                  {existingPOs.map((po: any) => (
                    <div key={po.id} className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <span className="font-mono text-xs font-bold text-amber-800">{poLabel(po)}</span>
                      <span className="text-xs text-slate-500 capitalize">{po.status ?? "—"}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Do you want to create another purchase order anyway?</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDuplicatePOGuard(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  No, Cancel
                </button>
                <button onClick={() => { setDuplicatePOGuard(null); setPoInvoice(inv); }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors flex items-center justify-center gap-2">
                  <ShoppingCart size={14} /> Yes, Create Another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Duplicate Shipment Guard Dialog */}
      {duplicateShipGuard && (() => {
        const { inv, existingShips } = duplicateShipGuard;
        const shipLabel = (s: any) => s.trackingNumber ? `#${s.trackingNumber}` : `SHIP-${String(s.id).padStart(4, "0")}`;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setDuplicateShipGuard(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center"><Truck size={16} className="text-sky-600" /></div>
                <div>
                  <h3 className="text-slate-800 font-bold text-base leading-tight">Shipment Already Exists</h3>
                  <p className="text-slate-400 text-xs">{displayName(inv)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 mb-5">
                <p className="text-sm text-slate-600">
                  This invoice already has {existingShips.length === 1 ? "a shipment" : `${existingShips.length} shipments`}:
                </p>
                <div className="flex flex-col gap-1.5">
                  {existingShips.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-sky-50 border border-sky-100 rounded-lg">
                      <span className="font-mono text-xs font-bold text-sky-800">{shipLabel(s)}</span>
                      <span className="text-xs text-slate-500 capitalize">{s.status ?? "—"}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Do you want to create another shipment anyway?</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDuplicateShipGuard(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  No, Cancel
                </button>
                <button onClick={() => { setDuplicateShipGuard(null); setShipmentPreflight(inv); }}
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors flex items-center justify-center gap-2">
                  <Truck size={14} /> Yes, Create Another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Shipment pre-flight popup */}
      {shipmentPreflight && (() => {
        const inv = shipmentPreflight;
        const cust = customerMap.get(Number(inv.customerId)) as any;
        const accountType = cust?.accountType ?? null;
        const accountTypeLabels: Record<string, { label: string; cls: string }> = {
          net30:        { label: "Net 30 (30-day terms)",  cls: "text-blue-700 bg-blue-50 border-blue-200" },
          net60:        { label: "Net 60 (60-day terms)",  cls: "text-indigo-700 bg-indigo-50 border-indigo-200" },
          net90:        { label: "Net 90 (90-day terms)",  cls: "text-purple-700 bg-purple-50 border-purple-200" },
          cash:         { label: "Cash (immediate)",       cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          cash_advance: { label: "Cash Advance",           cls: "text-amber-700 bg-amber-50 border-amber-200" },
          cod:          { label: "COD (pay on delivery)",  cls: "text-slate-700 bg-slate-50 border-slate-200" },
        };
        const acctInfo = accountType ? accountTypeLabels[accountType] : null;
        const outstandingBalance = ((invoices as InvoiceData[] | undefined) ?? [])
          .filter(i => Number(i.customerId) === Number(inv.customerId) && i.id !== inv.id && i.status !== "paid" && i.status !== "cancelled" && i.status !== "draft")
          .reduce((s, i) => s + Number(i.total ?? 0), 0);
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setShipmentPreflight(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center"><Truck size={16} className="text-sky-600" /></div>
                <div>
                  <h3 className="text-slate-800 font-bold text-base leading-tight">Customer Account Info</h3>
                  <p className="text-slate-400 text-xs">{displayName(inv)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 mb-5">
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 text-sm font-medium">Account Type</span>
                  {acctInfo ? (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${acctInfo.cls}`}>{acctInfo.label}</span>
                  ) : (
                    <span className="text-slate-400 text-xs">Not set</span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 text-sm font-medium">Outstanding Balance</span>
                  {outstandingBalance > 0 ? (
                    <span className="text-red-600 font-bold text-sm">{formatCurrency(outstandingBalance)}</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold text-sm">No balance owed</span>
                  )}
                </div>
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 text-sm font-medium">This Invoice</span>
                  <span className="text-slate-800 font-bold text-sm">{formatCurrency(inv.total)}</span>
                </div>
              </div>

              {/* Print label shortcut — always visible before proceeding */}
              <button
                onClick={() => printShippingSlip({
                  id: inv.id, customerId: inv.customerId, invoiceId: inv.id,
                  carrier: "Pending", trackingNumber: null, notes: null,
                  status: "preparing", shippedAt: null,
                })}
                className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 mb-1"
              >
                <Printer size={14} className="text-slate-500" /> Print Packing Slip / Shipping Label
              </button>

              <div className="flex gap-3">
                <button onClick={() => setShipmentPreflight(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => { setShipmentInvoice(inv); setShipmentPreflight(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors flex items-center justify-center gap-2">
                  <Truck size={14} /> Proceed to Shipping
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {shipmentInvoice && (
        <ShipmentModal
          customerId={shipmentInvoice.customerId}
          invoiceId={shipmentInvoice.id}
          customerName={displayName(shipmentInvoice)}
          lineItems={shipmentInvoice.lineItems}
          onClose={() => setShipmentInvoice(null)}
        />
      )}
      {poInvoice && <InvoicePoModal invoice={poInvoice} onClose={() => setPoInvoice(null)} />}

      {/* Pay Dialog */}
      {payDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setPayDialog(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-slate-800 font-bold text-base mb-4">Record Payment</h3>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Payment Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Early Discount %</label>
                  <div className="relative">
                    <input type="number" min="0" max="100" step="0.5" value={earlyDiscount} onChange={e => setEarlyDiscount(e.target.value)}
                      placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-7 text-sm text-slate-800 focus:outline-none focus:border-blue-400" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {earlyDiscount && Number(earlyDiscount) > 0 && (() => {
                    const inv = invoices?.find((i: any) => i.id === payDialog.id) as any;
                    const total = Number(inv?.total ?? 0);
                    const disc = (total * Number(earlyDiscount)) / 100;
                    return <p className="text-[11px] text-emerald-600 mt-1 font-semibold">Saves {formatCurrency(disc)} → Pay {formatCurrency(total - disc)}</p>;
                  })()}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} onClick={() => setSelectedMethod(m.value)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${selectedMethod === m.value ? "border-[hsl(224_50%_25%)] bg-[hsl(224_50%_97%)]" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                      <span className={`text-sm font-semibold ${selectedMethod === m.value ? "text-[hsl(224_50%_20%)]" : "text-slate-700"}`}>{m.label}</span>
                      <span className="text-xs text-slate-400 mt-0.5">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Note (optional)</label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="e.g. Check #1234"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setPayDialog(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={confirmPay} disabled={payInvoice.isPending}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {payInvoice.isPending ? "Saving…" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
      {payNowInvoice && (
        <PayNowModal
          invoice={payNowInvoice}
          customerEmail={(customerMap.get(Number(payNowInvoice.customerId)) as any)?.email || ""}
          onClose={() => setPayNowInvoice(null)}
        />
      )}
    </Layout>
  );
}
