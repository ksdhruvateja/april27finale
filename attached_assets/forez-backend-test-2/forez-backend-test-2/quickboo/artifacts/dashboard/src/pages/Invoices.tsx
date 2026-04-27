import { useState, useRef, Fragment } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import InvoiceView from "@/components/InvoiceView";
import InvoiceModal from "@/components/InvoiceModal";
import { useListInvoices, useDeleteInvoice, usePayInvoice, useUpdateInvoice, getListInvoicesQueryKey } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, CheckCircle, Eye, X, Truck, ShoppingCart, Hash, Link2, ChevronDown, Pencil, StickyNote, Mail, MessageSquare, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import ShipmentModal from "@/components/ShipmentModal";
import InvoicePoModal from "@/components/InvoicePoModal";

type PaymentMethod = "stripe" | "bank_transfer" | "check" | "cash";

const INVOICE_STATUSES: { value: string; label: string; cls: string }[] = [
  { value: "draft",     label: "Draft",     cls: "text-slate-500  bg-slate-50  border-slate-200" },
  { value: "sent",      label: "Sent",      cls: "text-blue-700   bg-blue-50   border-blue-200"  },
  { value: "pending",   label: "Pending",   cls: "text-amber-700  bg-amber-50  border-amber-200" },
  { value: "paid",      label: "Paid",      cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { value: "cancelled", label: "Cancelled", cls: "text-slate-400  bg-slate-50  border-slate-200" },
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
  if (status !== "sent") return status;
  if (dueDate) {
    const daysPast = (Date.now() - new Date(dueDate).getTime()) / 86400000;
    return daysPast > 15 ? "overdue" : "due";
  }
  return "due";
}

function StatusBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const effective = status === "pending" ? "pending" : getEffectiveStatus(status, dueDate);
  const map: Record<string, string> = {
    paid:      "text-emerald-700 bg-emerald-50 border-emerald-200",
    due:       "text-blue-700   bg-blue-50   border-blue-200",
    pending:   "text-amber-700  bg-amber-50  border-amber-200",
    draft:     "text-slate-500  bg-slate-50  border-slate-200",
    overdue:   "text-red-600    bg-red-50    border-red-200",
    cancelled: "text-slate-400  bg-slate-50  border-slate-200",
  };
  const labels: Record<string, string> = { due: "Due", paid: "Paid", overdue: "Overdue", draft: "Draft", cancelled: "Cancelled", pending: "Pending" };
  return (
    <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[effective] ?? map.draft}`}>
      {labels[effective] ?? effective}
    </span>
  );
}

export default function Invoices() {
  const { data: invoices, isLoading } = useListInvoices();
  const deleteInvoice = useDeleteInvoice();
  const payInvoice = usePayInvoice();
  const updateInvoice = useUpdateInvoice();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "paid" | "overdue">("all");
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<any | null>(null);
  const [shipmentInvoice, setShipmentInvoice] = useState<InvoiceData | null>(null);
  const [poInvoice, setPoInvoice] = useState<InvoiceData | null>(null);
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null);
  const [payDialog, setPayDialog] = useState<{ id: number } | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("bank_transfer");
  const [payNote, setPayNote] = useState("");

  const fallbackFcNumber = (id: number) => `FC - ${Math.max(5100, 5099 + Number(id ?? 0))}`;
  const [editingNum, setEditingNum] = useState<{ id: number; value: string } | null>(null);
  const [editingRef, setEditingRef] = useState<{ id: number; value: string } | null>(null);
  const numInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const numSavingRef = useRef(false);
  const refSavingRef = useRef(false);
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteEditId, setNoteEditId] = useState<number | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const filtered = ((invoices as InvoiceData[] | undefined) ?? []).filter(i => {
    const s = search.trim().toLowerCase();
    const productText = (i.lineItems ?? [])
      .map(li => String(li.description ?? ""))
      .join(" ")
      .toLowerCase();
    const matchesSearch = !s || [
      i.customerName,
      i.invoiceNumber,
      i.trackingNumber,
      i.status,
      i.notes,
      i.internalNote,
      String(i.id ?? ""),
      productText,
    ].some(v => String(v ?? "").toLowerCase().includes(s));
    const effectiveStatus = getEffectiveStatus(i.status, i.dueDate);
    const matchesFilter = statusFilter === "all" || effectiveStatus === statusFilter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    const bt = new Date((b as any).createdAt ?? 0).getTime();
    const at = new Date((a as any).createdAt ?? 0).getTime();
    if (bt !== at) return bt - at;
    return (b.id ?? 0) - (a.id ?? 0);
  });

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
  };

  const doMarkPending = (id: number) => {
    updateInvoice.mutate({ id, data: { status: "pending" } as any }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() })
    });
  };
  const handleMarkPending = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    doMarkPending(id);
  };

  const doSetStatus = (inv: InvoiceData, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (newStatus === inv.status) return;
    if (newStatus === "paid") {
      openPayDialog(inv.id, e);
      return;
    }
    updateInvoice.mutate({ id: inv.id, data: { status: newStatus } as any }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() })
    });
  };

  const startEditNum = (inv: InvoiceData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingNum({ id: inv.id, value: inv.invoiceNumber ?? fallbackFcNumber(inv.id) });
    setTimeout(() => numInputRef.current?.select(), 0);
  };

  const saveNum = (id: number) => {
    if (!editingNum || numSavingRef.current) return;
    numSavingRef.current = true;
    const val = editingNum.value.trim() || null;
    // Optimistically update the cache so the new number shows instantly
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
    // Optimistically update the cache so the new reference shows instantly
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

  const confirmPay = () => {
    if (!payDialog) return;
    payInvoice.mutate({ id: payDialog.id, data: { paymentMethod: selectedMethod, paymentNote: payNote || undefined } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        setPayDialog(null);
        setViewInvoice(null);
      }
    });
  };

  return (
    <Layout>
      <Header title="Invoices" subtitle={`${invoices?.length ?? 0} total`} />
      <div className="flex-1 flex flex-col overflow-hidden px-5 py-4 gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by customer..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button onClick={() => setShowModal(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
            <Plus size={14} /> Create Invoice
          </button>
        </div>

        <div className="flex gap-2">
          {(["all", "due", "paid", "overdue"] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all capitalize ${
                statusFilter === f
                  ? f === "all"    ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]"
                  : f === "paid"   ? "bg-emerald-600 text-white border-emerald-600"
                  : f === "overdue"? "bg-red-500 text-white border-red-500"
                  :                  "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >{f === "all" ? "All" : f === "due" ? "Due" : f === "paid" ? "Paid" : "Overdue"}</button>
          ))}
        </div>

        <div className="glass-card flex-1 flex flex-col min-h-0">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No invoices found.</div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-100 bg-slate-50">
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
                {filtered?.map(inv => (
                  <Fragment key={inv.id}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors group cursor-pointer ${(noteOpenId === inv.id || noteEditId === inv.id) ? "border-b-0" : ""}`}
                    onClick={() => setViewInvoice(inv)}
                  >
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      {editingNum?.id === inv.id ? (
                        <input
                          ref={numInputRef}
                          value={editingNum.value}
                          onChange={e => setEditingNum({ id: inv.id, value: e.target.value })}
                          onBlur={() => saveNum(inv.id)}
                          onKeyDown={e => { if (e.key === "Enter") saveNum(inv.id); if (e.key === "Escape") setEditingNum(null); }}
                          className="font-mono text-xs border border-slate-300 rounded px-2 py-0.5 w-32 bg-white text-slate-800 caret-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
                        />
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 group/num">
                            <Eye size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors" onClick={() => setViewInvoice(inv)} />
                            <span className="text-slate-400 font-mono text-xs" onClick={() => setViewInvoice(inv)}>
                              {inv.invoiceNumber ?? fallbackFcNumber(inv.id)}
                            </span>
                            <button
                              title="Edit invoice number"
                              onClick={e => startEditNum(inv, e)}
                              className="opacity-0 group-hover/num:opacity-100 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
                            >
                              <Edit size={10} />
                            </button>
                          </div>
                          {inv.trackingNumber && (
                            <span className="text-[10px] text-indigo-500 font-medium flex items-center gap-1">
                              <Link2 size={9} /> {inv.trackingNumber}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{inv.customerName}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-500 text-xs">{formatDate(inv.createdAt)}</span>
                        {inv.paidAt && (
                          <span className="text-emerald-600 text-xs font-medium">Paid {formatDate(inv.paidAt)}</span>
                        )}
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
                            <DropdownMenuItem
                              key={s.value}
                              onClick={e => doSetStatus(inv, s.value, e)}
                              className={`gap-2 cursor-pointer text-sm focus:bg-slate-50 ${inv.status === s.value ? "font-bold" : ""}`}
                            >
                              <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
                              {inv.status === s.value && <span className="ml-auto text-slate-300 text-xs">current</span>}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-800 font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title={inv.internalNote ? "View internal note" : "No note yet"}
                          onClick={e => { e.stopPropagation(); if (noteEditId === inv.id) return; setNoteOpenId(noteOpenId === inv.id ? null : inv.id); }}
                          className={`p-1 rounded transition-colors ${inv.internalNote ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:text-amber-400 hover:bg-amber-50"}`}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          title="Edit internal note"
                          onClick={e => { e.stopPropagation(); setNoteEditId(inv.id); setNoteEditText(inv.internalNote ?? ""); setNoteOpenId(null); }}
                          className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          title="Send Email"
                          onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-all"
                        >
                          <Mail size={13} />
                        </button>
                        <button
                          title="Send SMS"
                          onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition-all"
                        >
                          <MessageSquare size={13} />
                        </button>
                        <button
                          title="Download"
                          onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setShipmentInvoice(inv); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-all whitespace-nowrap"
                        >
                          <Truck size={11} /> Shipment
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setPoInvoice(inv); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all whitespace-nowrap"
                        >
                          <ShoppingCart size={11} /> Create PO
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
                            <DropdownMenuItem onClick={e => startEditRef(inv, e)} className="gap-2 cursor-pointer text-sm text-indigo-600 hover:bg-indigo-50 focus:bg-indigo-50 focus:text-indigo-600">
                              <Link2 size={13} /> {inv.trackingNumber ? "Edit Order Ref" : "Set Order Reference"}
                            </DropdownMenuItem>
                            {inv.status !== "paid" && inv.status !== "cancelled" && (
                              <DropdownMenuItem onClick={e => openPayDialog(inv.id, e)} className="gap-2 cursor-pointer text-sm text-emerald-600 hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-600">
                                <CheckCircle size={13} /> Mark Paid
                              </DropdownMenuItem>
                            )}
                            {inv.status !== "pending" && inv.status !== "paid" && inv.status !== "cancelled" && (
                              <DropdownMenuItem onClick={e => handleMarkPending(inv.id, e)} className="gap-2 cursor-pointer text-sm text-amber-600 hover:bg-amber-50 focus:bg-amber-50 focus:text-amber-600">
                                <CheckCircle size={13} /> Mark Pending
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={e => handleDelete(inv.id, e)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                              <Trash2 size={13} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {(noteOpenId === inv.id || noteEditId === inv.id) && (
                    <tr className="border-b border-slate-100 bg-amber-50/40">
                      <td colSpan={8} className="px-5 pb-3 pt-0">
                        {noteEditId === inv.id ? (
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
                              <button onClick={() => saveInlineNote(inv.id)} disabled={noteSaving} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50">
                                {noteSaving ? "Saving…" : "Save Note"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 pt-2">
                            <StickyNote size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-slate-600 whitespace-pre-wrap">
                              {inv.internalNote || <span className="text-slate-400 italic">No internal note yet. Click the pencil icon to add one.</span>}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {showModal && <InvoiceModal onClose={() => setShowModal(false)} />}
      {editInvoice && <InvoiceModal onClose={() => setEditInvoice(null)} initial={editInvoice} />}
      {shipmentInvoice && (
        <ShipmentModal
          customerId={shipmentInvoice.customerId}
          invoiceId={shipmentInvoice.id}
          customerName={shipmentInvoice.customerName ?? ""}
          lineItems={shipmentInvoice.lineItems?.map(li => ({ description: li.description, quantity: li.quantity }))}
          onClose={() => setShipmentInvoice(null)}
        />
      )}
      {poInvoice && (
        <InvoicePoModal invoice={poInvoice} onClose={() => setPoInvoice(null)} />
      )}
      {viewInvoice && (
        <InvoiceView invoice={viewInvoice} onClose={() => setViewInvoice(null)}
          onMarkPaid={(id) => { setPayDialog({ id }); setSelectedMethod("bank_transfer"); setPayNote(""); }}
          onMarkPending={(id) => doMarkPending(id)}
          onCreatePO={() => { setPoInvoice(viewInvoice); setViewInvoice(null); }} />
      )}

      {/* Order Reference Dialog */}
      {editingRef && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setEditingRef(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-slate-800 font-bold text-base">Order Reference</h3>
                <p className="text-slate-400 text-xs mt-0.5">A unique reference that links this invoice to quotes, POs, and shipments</p>
              </div>
              <button onClick={() => setEditingRef(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <input
              ref={refInputRef}
              type="text"
              placeholder="e.g. ORD-2024-001 or JOB-001"
              value={editingRef.value}
              onChange={e => setEditingRef({ ...editingRef, value: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") saveRef(); if (e.key === "Escape") setEditingRef(null); }}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 transition-colors"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setEditingRef(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveRef} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
                Save Reference
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Dialog — light theme */}
      {payDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setPayDialog(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-bold text-base">Record Payment</h3>
              <button onClick={() => setPayDialog(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div>
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">Payment Method</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.value} onClick={() => setSelectedMethod(m.value)}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                      selectedMethod === m.value
                        ? "bg-[hsl(224_50%_15%)] border-[hsl(224_50%_15%)] text-white"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className={`text-sm font-semibold ${selectedMethod === m.value ? "text-white" : "text-slate-800"}`}>{m.label}</span>
                    <span className={`text-xs mt-0.5 ${selectedMethod === m.value ? "text-white/70" : "text-slate-400"}`}>{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Note (optional)</p>
              <input type="text" placeholder="e.g. Check #1234" value={payNote}
                onChange={e => setPayNote(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPayDialog(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmPay} disabled={payInvoice.isPending}
                className="flex-1 py-2.5 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-50">
                {payInvoice.isPending ? "Processing..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
