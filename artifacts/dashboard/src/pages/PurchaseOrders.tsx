import { useState, useMemo, ReactNode } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useListAuctions } from "@/lib/auctions-api";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListPurchaseOrders, useDeletePurchaseOrder, useConvertPurchaseOrderToBill, useUpdatePurchaseOrder, getListPurchaseOrdersQueryKey, useListVendors, useListBills, useDeleteBill, getListBillsQueryKey, useListShipments } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, CreditCard, Truck, RefreshCw, BarChart2, ChevronDown, ChevronUp, CheckCircle2, Pencil, Tag, ChevronRight, Save, Calculator, X as XIcon, Percent, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import PurchaseOrderModal from "@/components/PurchaseOrderModal";
import ShipmentModal from "@/components/ShipmentModal";
import { downloadCsv, downloadPdfFromHtml } from "@/lib/export-utils";
import { useRole } from "@/context/RoleContext";
import { logAudit } from "@/lib/auditLog";

type PriceAdjustMode = "discount_pct" | "discount_usd" | "change_pct" | "set_usd";
interface PriceAdjustDialog {
  poId: number; poRef: string; vendorName: string;
  itemIdx: number; description: string;
  currentPrice: number; qty: number;
  mode: PriceAdjustMode; value: string; note: string;
}

const PO_STATUS_STYLES: Record<string, string> = {
  received:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  sent:      "text-blue-700   bg-blue-50   border-blue-200",
  cancelled: "text-slate-400  bg-slate-50  border-slate-200",
  draft:     "text-slate-500  bg-slate-50  border-slate-200",
  pending:   "text-amber-700  bg-amber-50  border-amber-200",
  fulfilled: "text-indigo-700 bg-indigo-50 border-indigo-200",
  shipped:   "text-sky-700    bg-sky-50    border-sky-200",
  overdue:   "text-red-600    bg-red-50    border-red-200",
};

type PoStatusFilter = "all" | "draft" | "pending" | "received" | "fulfilled" | "shipped" | "overdue";

const FILTER_TABS: { value: PoStatusFilter; label: string }[] = [
  { value: "all",       label: "All"       },
  { value: "draft",     label: "Draft"     },
  { value: "pending",   label: "Pending"   },
  { value: "received",  label: "Received"  },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "shipped",   label: "Shipped"   },
  { value: "overdue",   label: "Overdue"   },
];

function getEffectivePoStatus(po: any): string {
  const { status, expectedDate } = po;
  if (status === "received" || status === "fulfilled" || status === "cancelled") return status;
  if (expectedDate && new Date(expectedDate).getTime() < Date.now()) return "overdue";
  return status ?? "draft";
}

interface ShipmentContext {
  customerId: number;
  invoiceId: number | null;
  customerName: string;
  lineItems: Array<{ description: string; quantity: number }>;
  vendorCarrierName?: string | null;
  vendorCarrierAccount?: string | null;
}

export default function PurchaseOrders() {
  const { data: pos, isLoading } = useListPurchaseOrders();
  const { data: auctionList } = useListAuctions();
  const { data: bills } = useListBills();
  const { data: shipments } = useListShipments();
  const deletePO = useDeletePurchaseOrder();
  const deleteBill = useDeleteBill();
  const convertToBill = useConvertPurchaseOrderToBill();
  const updatePO = useUpdatePurchaseOrder();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoStatusFilter>("all");
  const [showModal, setShowModal] = useState(false);
  const [editPO, setEditPO] = useState<any | null>(null);
  const [shipmentContext, setShipmentContext] = useState<ShipmentContext | null>(null);
  const [loadingShipment, setLoadingShipment] = useState<number | null>(null);
  const [changingStatusPO, setChangingStatusPO] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState<number | null>(null);
  const [customStatusInput, setCustomStatusInput] = useState("");
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView] = useState<"demand" | "vendor" | "status">("demand");
  const [expandedPoId, setExpandedPoId] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, Array<{ description: string; quantity: number; unitPrice: number; [k: string]: any }>>>({});
  const [savingPoItems, setSavingPoItems] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusApplying, setBulkStatusApplying] = useState(false);
  const [billingReversalDialog, setBillingReversalDialog] = useState<{
    po: any; linkedBillId: number; newStatus: string; reason: string;
  } | null>(null);
  const [priceAdjustDialog, setPriceAdjustDialog] = useState<PriceAdjustDialog | null>(null);
  const [duplicateShipGuard, setDuplicateShipGuard] = useState<{
    context: ShipmentContext; existingShips: any[];
  } | null>(null);
  const { currentUser } = useRole();

  const { data: vendors } = useListVendors();

  const STATUS_DOT_COLORS: Record<string,string> = {
    received:"#10b981", sent:"#3b82f6", draft:"#94a3b8",
    pending:"#f59e0b", fulfilled:"#6366f1", shipped:"#0ea5e9",
    overdue:"#ef4444", cancelled:"#cbd5e1",
  };

  const handleInlineStatusChange = (po: any, status: string) => {
    if (status === po.status) return;
    const linkedBill = (bills ?? []).find((b: any) => b.purchaseOrderId === po.id);
    if (linkedBill) {
      setBillingReversalDialog({ po, linkedBillId: linkedBill.id, newStatus: status, reason: "" });
      return;
    }
    updatePO.mutate({ id: po.id, data: { status } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        const poRef = po.sourceInvoiceId && po.poSequence
          ? `FRZPO-${String(po.sourceInvoiceId).padStart(4,"0")}-${po.poSequence}`
          : `FRZPO-${String(po.id).padStart(4,"0")}`;
        const user = currentUser ?? { name: "Unknown", email: "", role: "unknown" };
        logAudit({
          user: { name: user.name ?? user.email, email: user.email, role: user.role },
          action: "status_change",
          entityType: "po",
          entityId: String(po.id),
          entityRef: poRef,
          description: `Status changed on ${poRef} (${po.vendorName}): ${po.status} → ${status}`,
        });
      },
    });
  };

  const confirmBillingReversal = () => {
    if (!billingReversalDialog) return;
    const { po, linkedBillId, newStatus, reason } = billingReversalDialog;
    const poRef = po.sourceInvoiceId && po.poSequence
      ? `FRZPO-${String(po.sourceInvoiceId).padStart(4,"0")}-${po.poSequence}`
      : `FRZPO-${String(po.id).padStart(4,"0")}`;
    updatePO.mutate(
      { id: po.id, data: { status: newStatus, internalNote: reason.trim() || `Status changed to ${newStatus} — linked bill deleted` } as any },
      {
        onSuccess: () => {
          deleteBill.mutate({ id: linkedBillId }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
            },
          });
          setBillingReversalDialog(null);
          const user = currentUser ?? { name: "Unknown", email: "", role: "unknown" };
          logAudit({
            user: { name: user.name ?? user.email, email: user.email, role: user.role },
            action: "billing_reversal",
            entityType: "po",
            entityId: String(po.id),
            entityRef: poRef,
            description: `Billing reversal on ${poRef} (${po.vendorName}): status → ${newStatus}, linked bill #${linkedBillId} deleted`,
            note: reason || undefined,
          });
        },
      }
    );
  };

  const calcAdjustedPrice = (d: PriceAdjustDialog): number => {
    const v = parseFloat(d.value) || 0;
    if (d.mode === "discount_pct") return Math.max(0, d.currentPrice * (1 - v / 100));
    if (d.mode === "discount_usd") return Math.max(0, d.currentPrice - v);
    if (d.mode === "change_pct")   return Math.max(0, d.currentPrice * (1 + v / 100));
    if (d.mode === "set_usd")      return Math.max(0, v);
    return d.currentPrice;
  };

  const applyPriceAdjust = () => {
    if (!priceAdjustDialog) return;
    const newPrice = calcAdjustedPrice(priceAdjustDialog);
    const { poId, poRef, vendorName, itemIdx, description, currentPrice, qty, note } = priceAdjustDialog;
    const prev = expandedItems[poId] ?? [];
    const updated = prev.map((item, idx) => idx === itemIdx ? { ...item, unitPrice: newPrice } : item);
    setExpandedItems(prev2 => ({ ...prev2, [poId]: updated }));
    setPriceAdjustDialog(null);
    const user = currentUser ?? { name: "Unknown", email: "", role: "unknown" };
    logAudit({
      user: { name: user.name ?? user.email, email: user.email, role: user.role },
      action: "price_adjust",
      entityType: "po",
      entityId: String(poId),
      entityRef: poRef,
      description: `Price adjusted for "${description}" on ${poRef} (${vendorName}): ${formatCurrency(currentPrice)} → ${formatCurrency(newPrice)} (qty ${qty}, new total ${formatCurrency(newPrice * qty)})`,
      note: note || undefined,
      meta: { itemIdx, currentPrice, newPrice, qty, mode: priceAdjustDialog.mode, value: priceAdjustDialog.value },
    });
  };

  const togglePoExpand = (po: any) => {
    const id = po.id;
    if (expandedPoId === id) {
      setExpandedPoId(null);
    } else {
      setExpandedPoId(id);
      if (!expandedItems[id]) {
        const items = (po.lineItems ?? []).map((li: any) => ({
          ...li,
          quantity: Number(li.quantity ?? 1),
          unitPrice: Number(li.unitPrice ?? 0),
        }));
        setExpandedItems(prev => ({ ...prev, [id]: items }));
      }
    }
  };

  const savePoLineItems = async (po: any) => {
    const items = expandedItems[po.id];
    if (!items) return;
    setSavingPoItems(po.id);
    try {
      await updatePO.mutateAsync({ id: po.id, data: { lineItems: items } as any });
      await queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      setExpandedPoId(null);
      const poRef = po.sourceInvoiceId && po.poSequence
        ? `FRZPO-${String(po.sourceInvoiceId).padStart(4,"0")}-${po.poSequence}`
        : `FRZPO-${String(po.id).padStart(4,"0")}`;
      const user = currentUser ?? { name: "Unknown", email: "", role: "unknown" };
      logAudit({
        user: { name: user.name ?? user.email, email: user.email, role: user.role },
        action: "line_items_saved",
        entityType: "po",
        entityId: String(po.id),
        entityRef: poRef,
        description: `Line items updated on ${poRef} (${po.vendorName}) — ${items.length} item(s), total ${formatCurrency(items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0))}`,
      });
    } finally {
      setSavingPoItems(null);
    }
  };

  const vendorSpendData = useMemo(() => {
    const by: Record<string, number> = {};
    for (const po of (pos ?? []) as any[]) {
      const name = po.vendorName || "Unknown";
      by[name] = (by[name] ?? 0) + Number(po.total ?? 0);
    }
    return Object.entries(by)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total).slice(0, 12);
  }, [pos]);

  const topDemandData = useMemo(() => {
    const by: Record<string, number> = {};
    for (const po of (pos ?? []) as any[]) {
      for (const li of (po.lineItems ?? []) as any[]) {
        const name = li.description || "Item";
        by[name] = (by[name] ?? 0) + Number(li.quantity ?? 0);
      }
    }
    return Object.entries(by)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [pos]);

  const statusPieData = useMemo(() => {
    const by: Record<string, number> = {};
    for (const po of (pos ?? []) as any[]) {
      const s = getEffectivePoStatus(po);
      by[s] = (by[s] ?? 0) + 1;
    }
    const COLORS: Record<string, string> = {
      received: "#10b981", sent: "#3b82f6", draft: "#94a3b8",
      pending: "#f59e0b", fulfilled: "#6366f1", shipped: "#0ea5e9",
      overdue: "#ef4444", cancelled: "#cbd5e1",
    };
    return Object.entries(by).map(([name, value]) => ({ name, value, fill: COLORS[name] ?? "#94a3b8" }));
  }, [pos]);

  const auctionByPoId = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of (auctionList ?? [])) {
      for (const id of (a.purchaseOrderIds ?? [])) map.set(Number(id), a.projectName || `Auction #${a.id}`);
    }
    return map;
  }, [auctionList]);

  const debouncedSearch = useDebounce(search, 250);

  const filtered = useMemo(() => (pos ?? [])
    .filter((p: any) => {
      const effective = getEffectivePoStatus(p);
      if (statusFilter !== "all" && effective !== statusFilter) return false;
      const q = debouncedSearch.trim().toLowerCase();
      if (!q) return true;
      const productText = (p.lineItems ?? []).map((li: any) => String(li.description ?? "")).join(" ").toLowerCase();
      const poNumber = p.sourceInvoiceId && p.poSequence
        ? `frzpo-${String(p.sourceInvoiceId).padStart(4, "0")}-${p.poSequence}`
        : `frzpo-${String(p.id).padStart(4, "0")}`;
      return [
        p.vendorName, p.status, p.notes, p.internalNote, poNumber, String(p.id), productText,
      ].some(v => String(v ?? "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return (b.id ?? 0) - (a.id ?? 0);
    }), [pos, debouncedSearch, statusFilter]);

  const handleDelete = (id: number) => {
    if (confirm("Delete this purchase order?")) {
      deletePO.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
      });
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    const ids = filtered?.map(po => po.id) ?? [];
    setSelectedIds(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids));
  };
  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedIds.size} selected PO(s)?`)) return;
    Promise.all([...selectedIds].map(id =>
      fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/purchase-orders/${id}`, { method: "DELETE" })
    )).then(() => {
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      setSelectedIds(new Set());
    });
  };

  const bulkChangeStatus = async (status: string) => {
    setBulkStatusOpen(false);
    setBulkStatusApplying(true);
    const ids = [...selectedIds];
    const user = currentUser ?? { name: "Unknown", email: "", role: "unknown" };
    await Promise.all(ids.map(id => {
      const po = (pos ?? []).find((p: any) => p.id === id);
      const poRef = po?.sourceInvoiceId && po?.poSequence
        ? `FRZPO-${String(po.sourceInvoiceId).padStart(4,"0")}-${po.poSequence}`
        : `FRZPO-${String(id).padStart(4,"0")}`;
      return updatePO.mutateAsync({ id, data: { status } as any }).then(() => {
        logAudit({
          user: { name: user.name ?? user.email, email: user.email, role: user.role },
          action: "bulk_status_change",
          entityType: "po",
          entityId: String(id),
          entityRef: poRef,
          description: `Bulk status change on ${poRef}: → ${status}`,
        });
      });
    }));
    await queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    setBulkStatusApplying(false);
    setSelectedIds(new Set());
  };

  const handleConvert = (id: number) => {
    if (confirm("Convert this PO to a bill?")) {
      convertToBill.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
      });
    }
  };

  const handleCreateShipment = async (po: { id: number; vendorId?: number | null; sourceInvoiceId?: number | null; lineItems?: object[] }) => {
    setLoadingShipment(po.id);
    try {
      // Fetch vendor carrier info
      let vendorCarrierName: string | null = null;
      let vendorCarrierAccount: string | null = null;
      if (po.vendorId) {
        const vRes = await fetch(`/api/vendors/${po.vendorId}`);
        if (vRes.ok) {
          const v = await vRes.json();
          vendorCarrierName = v.shippingCarrierName ?? null;
          vendorCarrierAccount = v.shippingAccountNumber ?? null;
        }
      }
      if (po.sourceInvoiceId) {
        const res = await fetch(`/api/invoices/${po.sourceInvoiceId}`);
        if (res.ok) {
          const inv = await res.json();
          const ctx: ShipmentContext = {
            customerId: inv.customerId,
            invoiceId: inv.id,
            customerName: inv.customerName ?? "Customer",
            lineItems: (inv.lineItems ?? []).map((li: { description: string; quantity: number }) => ({ description: li.description, quantity: li.quantity })),
            vendorCarrierName,
            vendorCarrierAccount,
          };
          const existingShips = (shipments ?? []).filter((s: any) => s.invoiceId === inv.id);
          if (existingShips.length > 0) {
            setDuplicateShipGuard({ context: ctx, existingShips });
          } else {
            setShipmentContext(ctx);
          }
          return;
        }
      }
      const poItems = (po.lineItems ?? []) as Array<{ description: string; quantity: number }>;
      setShipmentContext({
        customerId: 0,
        invoiceId: null,
        customerName: "Customer",
        lineItems: poItems.map(li => ({ description: li.description, quantity: li.quantity })),
        vendorCarrierName,
        vendorCarrierAccount,
      });
    } finally {
      setLoadingShipment(null);
    }
  };

  const downloadAllExcel = () => {
    const rows = filtered.map((po) => [
      `FRZPO-${String(po.id).padStart(4, "0")}`,
      po.vendorName,
      formatDate(po.createdAt),
      formatDate(po.expectedDate),
      getEffectivePoStatus(po),
      po.total,
    ]);
    downloadCsv("purchase-orders.csv", ["PO Number", "Vendor", "Created", "Expected", "Status", "Total"], rows);
  };

  const downloadAllPdf = () => {
    const tableHtml = `<table><thead><tr><th>PO Number</th><th>Vendor</th><th>Created</th><th>Expected</th><th>Status</th><th>Total</th></tr></thead><tbody>${
      filtered.map((po) => `<tr><td>FRZPO-${String(po.id).padStart(4, "0")}</td><td>${po.vendorName}</td><td>${formatDate(po.createdAt)}</td><td>${formatDate(po.expectedDate)}</td><td>${getEffectivePoStatus(po)}</td><td>${formatCurrency(po.total)}</td></tr>`).join("")
    }</tbody></table>`;
    downloadPdfFromHtml("Purchase Orders", tableHtml);
  };

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of (pos ?? [])) {
      const eff = getEffectivePoStatus(p);
      counts[eff] = (counts[eff] ?? 0) + 1;
    }
    return counts;
  }, [pos]);

  return (
    <Layout>
      <Header title="Purchase Orders" subtitle={`${pos?.length ?? 0} total`} />
      <div className="page-shell flex flex-col px-5 pb-4 gap-4 bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex-shrink-0 pt-4 flex flex-col gap-4 min-w-0">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search POs by vendor, number, product…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCharts(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${showCharts ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <BarChart2 size={14} /> {showCharts ? "Hide" : "Analytics"}
              {showCharts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button onClick={downloadAllExcel} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All Excel
            </button>
            <button onClick={downloadAllPdf} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All PDF
            </button>
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200">
              <Plus size={14} /> Create PO
            </button>
          </div>
        </div>

        {/* Analytics panel */}
        {showCharts && (
          <div className="glass-card analytics-panel p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {([
                  { v: "demand", label: "Top Demand" },
                  { v: "vendor", label: "Vendor Spend" },
                  { v: "status", label: "Status Mix" },
                ] as const).map(({ v, label }, idx) => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`px-3.5 py-2 text-xs font-semibold transition-colors ${idx > 0 ? "border-l border-slate-200" : ""} ${chartView === v ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-auto">{pos?.length ?? 0} purchase orders</span>
            </div>

            {chartView === "demand" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Products by Units Ordered</p>
                  {topDemandData.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No PO line items yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topDemandData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={130} />
                        <Tooltip formatter={(v: any) => [v, "Units"]} />
                        <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                          {topDemandData.map((_: any, i: number) => (
                            <Cell key={i} fill={["#6366f1","#818cf8","#a5b4fc","#4f46e5","#7c3aed","#8b5cf6","#a78bfa","#c4b5fd","#3b82f6","#60a5fa"][i % 10]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[200px] max-w-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Product Rankings</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100 max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr style={{ background: "rgba(99,102,241,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Product</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Units</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topDemandData.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{i + 1}</td>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-indigo-600">{r.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : chartView === "vendor" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Spend by Vendor</p>
                  {vendorSpendData.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No PO spend data.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={vendorSpendData} margin={{ top: 4, right: 8, bottom: 50, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} width={48} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Total Spend"]} />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                          {vendorSpendData.map((_: any, i: number) => (
                            <Cell key={i} fill={["#8b5cf6","#7c3aed","#a78bfa","#6d28d9","#c4b5fd","#ddd6fe","#6366f1","#4f46e5","#818cf8","#a5b4fc","#4338ca","#3730a3"][i % 12]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[200px] max-w-xs">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Vendor Breakdown</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100 max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(139,92,246,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Vendor</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorSpendData.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[160px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-violet-600">${r.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-6 flex-wrap items-center">
                <div className="flex-shrink-0">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">PO Status Distribution</p>
                  <ResponsiveContainer width={260} height={200}>
                    <PieChart>
                      <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        dataKey="value" nameKey="name" paddingAngle={3}>
                        {statusPieData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, n: string) => [v, n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3 min-w-[200px]">
                  {statusPieData.map((entry: any) => (
                    <div key={entry.name} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                      <div>
                        <p className="text-[10px] text-slate-400 capitalize">{entry.name}</p>
                        <p className="text-lg font-bold text-slate-700 leading-tight">{entry.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5 flex-wrap">
            {FILTER_TABS.map(tab => {
              const count = tab.value === "all" ? (pos?.length ?? 0) : (tabCounts[tab.value] ?? 0);
              const isActive = statusFilter === tab.value;
              const activeClass =
                tab.value === "all"       ? "bg-[hsl(224_50%_15%)] text-white shadow-sm"
                : tab.value === "overdue" ? "bg-red-500 text-white shadow-sm"
                : tab.value === "received"? "bg-emerald-600 text-white shadow-sm"
                : tab.value === "fulfilled"? "bg-indigo-600 text-white shadow-sm"
                : tab.value === "shipped" ? "bg-sky-600 text-white shadow-sm"
                : tab.value === "pending" ? "bg-amber-500 text-white shadow-sm"
                : "bg-slate-600 text-white shadow-sm";
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${isActive ? activeClass : "text-slate-500 hover:text-slate-700"}`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0 rounded-full font-bold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {statusFilter !== "all" && (
            <span className="text-xs text-slate-400 ml-1">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        </div>

        <div className="page-table-wrap">
        <div className="glass-card flex-1 min-h-0 h-0 flex flex-col overflow-hidden border border-blue-100/70 bg-white/95">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No purchase orders found.</div>
          ) : (
            <>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 flex-wrap">
                <span className="text-sm font-semibold text-indigo-700 mr-1">
                  {selectedIds.size} PO{selectedIds.size !== 1 ? "s" : ""} selected
                </span>

                {/* Bulk status change dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setBulkStatusOpen(o => !o)}
                    disabled={bulkStatusApplying}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-60"
                  >
                    {bulkStatusApplying
                      ? <><RefreshCw size={12} className="animate-spin" /> Updating…</>
                      : <><Tag size={12} /> Change Status <ChevronDown size={11} /></>
                    }
                  </button>
                  {bulkStatusOpen && (
                    <>
                    <div className="fixed inset-0 z-[199]" onClick={() => setBulkStatusOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 z-[200] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                      {[
                        { value: "draft",     label: "Draft",     dot: "#94a3b8" },
                        { value: "pending",   label: "Pending",   dot: "#f59e0b" },
                        { value: "sent",      label: "Sent",      dot: "#3b82f6" },
                        { value: "shipped",   label: "Shipped",   dot: "#0ea5e9" },
                        { value: "received",  label: "Received",  dot: "#10b981" },
                        { value: "fulfilled", label: "Fulfilled", dot: "#6366f1" },
                        { value: "cancelled", label: "Cancelled", dot: "#cbd5e1" },
                      ].map(s => (
                        <button
                          key={s.value}
                          onMouseDown={() => bulkChangeStatus(s.value)}
                          className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-sm text-slate-700 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                          {s.label}
                        </button>
                      ))}
                    </div>
                    </>
                  )}
                </div>

                <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
                  <Trash2 size={12} /> Delete
                </button>
                <button onClick={() => { setSelectedIds(new Set()); setBulkStatusOpen(false); }} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                  Clear selection
                </button>
              </div>
            )}
            <div className="data-table-scroll">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-blue-100 bg-blue-50/80">
                  <th className="px-3 py-3 w-9">
                    <input type="checkbox" className="rounded border-blue-300 accent-indigo-600 cursor-pointer"
                      checked={(filtered?.length ?? 0) > 0 && (filtered?.every(po => selectedIds.has(po.id)) ?? false)}
                      onChange={toggleSelectAll} />
                  </th>
                  <th className="px-2 py-3 w-8" />
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">PO #</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Vendor</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Expected</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-blue-700 font-medium text-[11px] uppercase tracking-wider">Total</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(po => {
                  const effectiveStatus = getEffectivePoStatus(po);
                  const isOverdue = effectiveStatus === "overdue";
                  const isExpanded = expandedPoId === po.id;
                  const editItems = expandedItems[po.id] ?? (po.lineItems ?? []);
                  return (
                    <>
                    <tr key={po.id} className={`border-b border-slate-100 transition-colors group ${isExpanded ? (isOverdue ? "bg-red-50/40" : "bg-blue-50/60") : isOverdue ? "bg-red-50/30 hover:bg-red-50/60" : "hover:bg-blue-50/50"} ${selectedIds.has(po.id) ? "!bg-indigo-50/50" : ""}`}>
                      <td className="px-3 py-3.5 w-9" onClick={e => toggleSelect(po.id, e)}>
                        <input type="checkbox" className="rounded border-slate-300 accent-indigo-600 cursor-pointer"
                          checked={selectedIds.has(po.id)} onChange={() => {}} />
                      </td>
                      <td className="px-2 py-3.5">
                        <button
                          onClick={() => togglePoExpand(po)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
                          title={isExpanded ? "Collapse" : "Edit line items"}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          {po.sourceInvoiceId && po.poSequence
                            ? <span className="text-amber-700 font-mono text-xs">FRZPO-{po.sourceInvoiceId.toString().padStart(4, "0")}-{po.poSequence}</span>
                            : <span className="text-slate-400 font-mono text-xs">FRZPO-{po.id.toString().padStart(4, "0")}</span>
                          }
                          {auctionByPoId.has(Number(po.id)) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                              🏷 {auctionByPoId.get(Number(po.id))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-800 font-medium">{po.vendorName}</td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(po.createdAt)}</td>
                      <td className="px-5 py-3.5 text-xs">
                        <span className={isOverdue ? "text-red-500 font-semibold" : "text-slate-500"}>
                          {formatDate(po.expectedDate)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border capitalize cursor-pointer transition-all hover:opacity-80 hover:shadow-sm focus:outline-none ${PO_STATUS_STYLES[effectiveStatus] ?? "text-violet-700 bg-violet-50 border-violet-200"}`}>
                              {effectiveStatus}
                              <ChevronDown size={9} className="opacity-60" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="bg-white border border-slate-200 shadow-xl rounded-xl p-1 min-w-[180px] z-50">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider px-2 py-1.5">Change Status</p>
                            {(["draft","pending","sent","received","fulfilled","shipped","cancelled"] as const).map(s => (
                              <DropdownMenuItem key={s} onClick={() => { handleInlineStatusChange(po, s); setShowCustomInput(null); }}
                                className={`flex items-center gap-2 cursor-pointer text-xs font-medium capitalize rounded-lg px-2 py-1.5 transition-colors ${s === (po.status ?? "draft") ? "bg-slate-50 text-slate-800 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_DOT_COLORS[s] ?? "#94a3b8" }} />
                                {s}
                                {s === (po.status ?? "draft") && <CheckCircle2 size={11} className="ml-auto text-indigo-500" />}
                              </DropdownMenuItem>
                            ))}
                            {/* Custom tag section */}
                            <div className="border-t border-slate-100 mt-1 pt-1">
                              {/* Show current custom status if any */}
                              {po.status && !["draft","pending","sent","received","fulfilled","shipped","cancelled","overdue"].includes(po.status) && showCustomInput !== po.id && (
                                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-violet-50 rounded-lg mb-0.5">
                                  <Tag size={10} className="text-violet-500 flex-shrink-0" />
                                  <span className="text-xs font-semibold text-violet-700 flex-1 capitalize">{po.status}</span>
                                  <CheckCircle2 size={11} className="text-violet-500 flex-shrink-0" />
                                  <button
                                    onClick={e => { e.stopPropagation(); e.preventDefault(); setShowCustomInput(po.id); setCustomStatusInput(po.status ?? ""); }}
                                    className="ml-1 p-0.5 rounded hover:bg-violet-100 text-violet-400 hover:text-violet-700 transition-colors">
                                    <Pencil size={10} />
                                  </button>
                                </div>
                              )}
                              {showCustomInput === po.id ? (
                                <div className="px-2 py-1.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                  <input
                                    autoFocus
                                    value={customStatusInput}
                                    onChange={e => setCustomStatusInput(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter" && customStatusInput.trim()) {
                                        handleInlineStatusChange(po, customStatusInput.trim().toLowerCase());
                                        setShowCustomInput(null); setCustomStatusInput("");
                                      }
                                      if (e.key === "Escape") { setShowCustomInput(null); setCustomStatusInput(""); }
                                    }}
                                    placeholder="Custom status…"
                                    className="flex-1 text-xs border border-violet-200 rounded-md px-2 py-1 focus:outline-none focus:border-violet-400 text-slate-700 placeholder:text-slate-400"
                                  />
                                  <button
                                    onClick={e => { e.stopPropagation(); if (customStatusInput.trim()) { handleInlineStatusChange(po, customStatusInput.trim().toLowerCase()); setShowCustomInput(null); setCustomStatusInput(""); }}}
                                    className="text-xs font-semibold text-violet-600 hover:text-violet-800 px-1.5 py-0.5 rounded hover:bg-violet-100 transition-colors">
                                    Save
                                  </button>
                                </div>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={e => e.preventDefault()}
                                  onClick={() => { setShowCustomInput(po.id); setCustomStatusInput(""); }}
                                  className="flex items-center gap-2 cursor-pointer text-xs font-medium text-violet-500 hover:bg-violet-50 rounded-lg px-2 py-1.5">
                                  <Plus size={10} /> Custom tag…
                                </DropdownMenuItem>
                              )}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      <td className="px-5 py-3.5 text-slate-800 font-semibold text-right">{formatCurrency(po.total)}</td>
                      <td className="px-5 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            {loadingShipment === po.id
                              ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                              : <MoreHorizontal size={14} className="text-slate-500" />
                            }
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[170px]">
                            <DropdownMenuItem
                              onClick={() => { setChangingStatusPO(po); setNewStatus(po.status ?? "draft"); }}
                              className="gap-2 cursor-pointer text-sm hover:bg-violet-50 focus:bg-violet-50 text-violet-700 focus:text-violet-700">
                              <RefreshCw size={13} /> Change Status
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateShipment(po)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Truck size={13} /> Create Shipment
                            </DropdownMenuItem>
                            {po.status !== "received" && po.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => handleConvert(po.id)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><CreditCard size={13} /> Convert to Bill</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setEditPO(po)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(po.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`expand-${po.id}`} className="border-b border-slate-200">
                        <td colSpan={9} className="p-0">
                          <div className="bg-[hsl(224_30%_12%)] px-6 py-5 flex flex-col gap-4">
                            {/* Header row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-1 h-5 rounded-full bg-indigo-400 flex-shrink-0" />
                                <div>
                                  <p className="text-white font-semibold text-sm">Line Items</p>
                                  <p className="text-slate-400 text-[11px]">{editItems.length} item{editItems.length !== 1 ? "s" : ""} · click price to adjust</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setExpandedPoId(null)}
                                  className="px-4 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-slate-400 hover:text-white hover:border-white/20 transition-all"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => savePoLineItems(po)}
                                  disabled={savingPoItems === po.id}
                                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-400 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-900/40"
                                >
                                  {savingPoItems === po.id
                                    ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                                    : <><Save size={11} /> Save Changes</>}
                                </button>
                              </div>
                            </div>

                            {/* Column labels */}
                            <div className="grid items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4"
                              style={{ gridTemplateColumns: "1fr 100px 130px 100px" }}>
                              <span>Description</span>
                              <span className="text-right">Qty</span>
                              <span className="text-right">Unit Price</span>
                              <span className="text-right">Total</span>
                            </div>

                            {/* Items */}
                            <div className="flex flex-col gap-1.5">
                              {editItems.map((item: any, idx: number) => (
                                <div key={idx} className="grid items-center gap-3 bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl px-4 py-3 transition-colors"
                                  style={{ gridTemplateColumns: "1fr 100px 130px 100px" }}>
                                  {/* Description */}
                                  <p className="text-sm text-white font-medium truncate pr-2">{item.description || <span className="text-slate-500 italic">No description</span>}</p>

                                  {/* Quantity */}
                                  <div className="flex justify-end">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.quantity}
                                      onChange={e => {
                                        const updated = [...editItems];
                                        updated[idx] = { ...item, quantity: parseFloat(e.target.value) || 0 };
                                        setExpandedItems(prev => ({ ...prev, [po.id]: updated }));
                                      }}
                                      className="w-20 text-center bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-sm text-white font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white/15 transition-all placeholder:text-slate-500"
                                    />
                                  </div>

                                  {/* Unit Price — click to adjust */}
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => {
                                        const poRef = po.sourceInvoiceId && po.poSequence
                                          ? `FRZPO-${String(po.sourceInvoiceId).padStart(4,"0")}-${po.poSequence}`
                                          : `FRZPO-${String(po.id).padStart(4,"0")}`;
                                        const fresh = expandedItems[po.id] ?? (po.lineItems ?? []);
                                        setPriceAdjustDialog({
                                          poId: po.id, poRef, vendorName: po.vendorName ?? "",
                                          itemIdx: idx, description: item.description || `Item ${idx + 1}`,
                                          currentPrice: fresh[idx]?.unitPrice ?? item.unitPrice,
                                          qty: fresh[idx]?.quantity ?? item.quantity,
                                          mode: "discount_pct", value: "", note: "",
                                        });
                                      }}
                                      className="flex items-center gap-1.5 bg-indigo-500/15 border border-indigo-400/30 rounded-lg px-3 py-1.5 text-sm font-mono font-semibold text-indigo-300 hover:bg-indigo-500/30 hover:border-indigo-400/60 hover:text-indigo-200 transition-all group"
                                      title="Click to adjust price"
                                    >
                                      {formatCurrency(item.unitPrice)}
                                      <Calculator size={11} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                  </div>

                                  {/* Line total */}
                                  <p className="text-right text-sm font-bold text-emerald-400">
                                    {formatCurrency(item.quantity * item.unitPrice)}
                                  </p>
                                </div>
                              ))}
                            </div>

                            {/* Subtotal footer */}
                            <div className="flex items-center justify-between border-t border-white/10 pt-3 px-1">
                              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Subtotal</span>
                              <span className="text-base font-bold text-white">
                                {formatCurrency(editItems.reduce((s: number, i: any) => s + (i.quantity * i.unitPrice), 0))}
                              </span>
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
            </>
          )}
        </div>
        </div>
      </div>
      {showModal && <PurchaseOrderModal onClose={() => setShowModal(false)} />}
      {editPO && <PurchaseOrderModal onClose={() => setEditPO(null)} initial={editPO} />}

      {/* Change Status Modal */}
      {changingStatusPO && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setChangingStatusPO(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Change PO Status</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {changingStatusPO.poNumber ?? `FRZPO-${String(changingStatusPO.id).padStart(4, "0")}`} · {changingStatusPO.vendorName}
                </p>
              </div>
              <button onClick={() => setChangingStatusPO(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <Trash2 size={14} className="text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {(["draft","pending","sent","received","fulfilled","shipped","cancelled"] as const).map(s => {
                const isActive = newStatus === s;
                return (
                  <button key={s} onClick={() => setNewStatus(s)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border capitalize transition-colors ${
                      isActive
                        ? `${PO_STATUS_STYLES[s] ?? ""} border-2`
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}>
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setChangingStatusPO(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 font-semibold hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                disabled={savingStatus || newStatus === changingStatusPO.status}
                onClick={async () => {
                  setSavingStatus(true);
                  try {
                    await updatePO.mutateAsync({ id: changingStatusPO.id, data: { status: newStatus as any } });
                    await queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
                    setChangingStatusPO(null);
                  } finally { setSavingStatus(false); }
                }}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {savingStatus ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : <><RefreshCw size={13} /> Update Status</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Duplicate Shipment Guard Dialog */}
      {duplicateShipGuard && (() => {
        const { context, existingShips } = duplicateShipGuard;
        const shipLabel = (s: any) => s.trackingNumber ? `#${s.trackingNumber}` : `SHIP-${String(s.id).padStart(4, "0")}`;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setDuplicateShipGuard(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center"><Truck size={16} className="text-sky-600" /></div>
                <div>
                  <h3 className="text-slate-800 font-bold text-base leading-tight">Shipment Already Exists</h3>
                  <p className="text-slate-400 text-xs">{context.customerName}</p>
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
                <button onClick={() => { setDuplicateShipGuard(null); setShipmentContext(context); }}
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors flex items-center justify-center gap-2">
                  <Truck size={14} /> Yes, Create Another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {shipmentContext && shipmentContext.customerId > 0 && (
        <ShipmentModal
          customerId={shipmentContext.customerId}
          invoiceId={shipmentContext.invoiceId}
          customerName={shipmentContext.customerName}
          lineItems={shipmentContext.lineItems}
          vendorCarrierName={shipmentContext.vendorCarrierName}
          vendorCarrierAccount={shipmentContext.vendorCarrierAccount}
          onClose={() => setShipmentContext(null)}
        />
      )}
      {priceAdjustDialog && (() => {
        const d = priceAdjustDialog;
        const newPrice = calcAdjustedPrice(d);
        const newTotal = newPrice * d.qty;
        const diff = newPrice - d.currentPrice;
        const modeBtn = (m: PriceAdjustMode, label: string, icon: ReactNode) => (
          <button key={m} onClick={() => setPriceAdjustDialog(p => p ? { ...p, mode: m, value: "" } : p)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-all ${d.mode === m ? "bg-blue-700 text-white border-blue-700 shadow" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700"}`}>
            {icon} {label}
          </button>
        );
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setPriceAdjustDialog(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Adjust Price</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{d.description} · {d.poRef}</p>
                </div>
                <button onClick={() => setPriceAdjustDialog(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><XIcon size={16} /></button>
              </div>
              <div className="px-6 py-4 flex flex-col gap-4">
                {/* Current info */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Current Price", value: formatCurrency(d.currentPrice), cls: "text-slate-800" },
                    { label: "Quantity", value: String(d.qty), cls: "text-slate-700" },
                    { label: "Current Total", value: formatCurrency(d.currentPrice * d.qty), cls: "text-slate-700" },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                      <p className={`text-sm font-bold ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {/* Mode selector */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Adjustment Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    {modeBtn("discount_pct", "Discount %", <Percent size={11} />)}
                    {modeBtn("discount_usd", "Discount $", <DollarSign size={11} />)}
                    {modeBtn("change_pct",   "Change %",   <Percent size={11} />)}
                    {modeBtn("set_usd",      "Set Price $", <DollarSign size={11} />)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {d.mode === "discount_pct" && "Reduce price by a percentage (e.g. 10 = 10% off)"}
                    {d.mode === "discount_usd" && "Subtract a flat dollar amount from the price"}
                    {d.mode === "change_pct"   && "Increase or decrease by % (negative = decrease)"}
                    {d.mode === "set_usd"      && "Set the unit price directly to this amount"}
                  </p>
                </div>
                {/* Value input */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    {d.mode.includes("pct") ? "Percentage" : "Amount ($)"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                      {d.mode.includes("pct") ? "%" : "$"}
                    </span>
                    <input
                      type="number" step="0.01"
                      placeholder={d.mode.includes("pct") ? "e.g. 10" : "e.g. 5.00"}
                      value={d.value}
                      onChange={e => setPriceAdjustDialog(p => p ? { ...p, value: e.target.value } : p)}
                      autoFocus
                      className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>
                </div>
                {/* Preview */}
                {d.value !== "" && (
                  <div className={`rounded-xl p-3 border text-sm flex items-center justify-between ${diff < 0 ? "bg-emerald-50 border-emerald-200" : diff > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">New unit price</p>
                      <p className={`font-bold text-base ${diff < 0 ? "text-emerald-700" : diff > 0 ? "text-amber-700" : "text-slate-700"}`}>{formatCurrency(newPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-0.5">New total (×{d.qty})</p>
                      <p className={`font-bold text-base ${diff < 0 ? "text-emerald-700" : diff > 0 ? "text-amber-700" : "text-slate-700"}`}>{formatCurrency(newTotal)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-0.5">Difference</p>
                      <p className={`font-semibold text-sm ${diff < 0 ? "text-emerald-600" : diff > 0 ? "text-amber-600" : "text-slate-500"}`}>
                        {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                      </p>
                    </div>
                  </div>
                )}
                {/* Internal note */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Internal Note (reason)</label>
                  <textarea rows={2} placeholder="e.g. Negotiated discount with vendor…"
                    value={d.note}
                    onChange={e => setPriceAdjustDialog(p => p ? { ...p, note: e.target.value } : p)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                  />
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => setPriceAdjustDialog(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={applyPriceAdjust} disabled={d.value === ""}
                  className="flex-1 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  <Calculator size={14} /> Apply Adjustment
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {billingReversalDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setBillingReversalDialog(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">Linked Bill Detected</h3>
              <p className="text-sm text-slate-500 mt-1">
                This PO has a linked bill. Changing its status will delete the associated bill.
                Please provide a reason for this reversal.
              </p>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                PO <span className="font-semibold">#{billingReversalDialog.po.id}</span> → New status:{" "}
                <span className="font-semibold capitalize">{billingReversalDialog.newStatus}</span>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Reason / Internal Note</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Order cancelled by vendor, reverting to draft…"
                  value={billingReversalDialog.reason}
                  onChange={e => setBillingReversalDialog(d => d ? { ...d, reason: e.target.value } : d)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setBillingReversalDialog(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmBillingReversal}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">
                Confirm &amp; Delete Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
