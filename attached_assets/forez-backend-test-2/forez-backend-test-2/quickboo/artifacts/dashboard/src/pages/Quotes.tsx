import { useState, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListQuotes, useDeleteQuote, useConvertQuoteToInvoice, useUpdateQuote, getListQuotesQueryKey, useListInvoices } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, FileCheck, Eye, Mail, MessageSquare, Printer, Download, Hash, X, Link2, FileText, Pencil, StickyNote } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import QuoteModal from "@/components/QuoteModal";
import QuoteView from "@/components/QuoteView";

const STATUS_MAP: Record<string, string> = {
  accepted: "text-emerald-700 bg-emerald-50 border-emerald-200",
  declined:  "text-red-600    bg-red-50    border-red-200",
  sent:      "text-blue-700   bg-blue-50   border-blue-200",
  draft:     "text-slate-500  bg-slate-50  border-slate-200",
};

export default function Quotes() {
  const [, setLocation] = useLocation();
  const { data: quotes, isLoading } = useListQuotes();
  const { data: invoices } = useListInvoices();
  const deleteQuote = useDeleteQuote();
  const convertToInvoice = useConvertQuoteToInvoice();
  const updateQuote = useUpdateQuote();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editQuote, setEditQuote] = useState<any | null>(null);
  const [viewQuote, setViewQuote] = useState<(typeof quotes extends (infer T)[] | undefined ? T : never) | null>(null);
  const [editingNum, setEditingNum] = useState<{ id: number; value: string } | null>(null);
  const numInputRef = useRef<HTMLInputElement>(null);
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteEditId, setNoteEditId] = useState<number | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [confirmOpenId, setConfirmOpenId] = useState<number | null>(null);
  const [confirmSavingId, setConfirmSavingId] = useState<number | null>(null);
  const [convertDialog, setConvertDialog] = useState<{
    id: number; quoteNumber: string; customerName: string; existingRef: string | null;
  } | null>(null);
  const [refNumber, setRefNumber] = useState("");
  const [invoiceNum, setInvoiceNum] = useState("");

  const fallbackFcNumber = (id: number) => `FC - ${Math.max(5100, 5099 + Number(id ?? 0))}`;

  const qSearch = search.trim().toLowerCase();
  const filtered = (quotes ?? [])
    .filter(q => {
      if (!qSearch) return true;
      const productText = ((q as any).lineItems ?? [])
        .map((li: any) => String(li.description ?? ""))
        .join(" ")
        .toLowerCase();
      return [
        q.customerName,
        (q as any).quoteNumber,
        (q as any).trackingNumber,
        (q as any).status,
        (q as any).notes,
        (q as any).internalNote,
        String((q as any).id ?? ""),
        productText,
      ].some(v => String(v ?? "").toLowerCase().includes(qSearch));
    })
    .sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return (b.id ?? 0) - (a.id ?? 0);
    });

  const handleDelete = (id: number) => {
    if (confirm("Delete this quote?")) {
      deleteQuote.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() })
      });
    }
  };

  const openConvertDialog = (q: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const qn: string = (q as any).quoteNumber ?? fallbackFcNumber(q.id);
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

  const confirmOrder = (id: number) => {
    setConfirmSavingId(id);
    updateQuote.mutate(
      { id, data: { status: "accepted" } as any },
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

  const revertOrderConfirmation = (id: number) => {
    setConfirmSavingId(id);
    updateQuote.mutate(
      { id, data: { status: "sent" } as any },
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

  return (
    <Layout>
      <Header title="Quotes" subtitle={`${quotes?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by customer or quote #..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button onClick={() => setShowModal(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
            <Plus size={14} /> Create Quote
          </button>
        </div>
        <div className="glass-card">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No quotes found.</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
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
                {filtered?.map(q => (
                  <Fragment key={q.id}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors group cursor-pointer ${(noteOpenId === q.id || noteEditId === q.id) ? "border-b-0" : ""}`}
                    onClick={() => setViewQuote(q)}
                  >
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
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{q.customerName}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(q.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_MAP[q.status] ?? STATUS_MAP.draft}`}>
                        {q.status}
                      </span>
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
                          <Edit size={11} /> Edit Bill
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 hover:bg-slate-100 rounded-lg transition-all" onClick={e => e.stopPropagation()}>
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
                            <DropdownMenuItem onClick={() => setViewQuote(q)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Eye size={13} /> View Quote</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditQuote(q)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit Quote</DropdownMenuItem>
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
                    <tr className="border-b border-slate-100 bg-amber-50/60">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-amber-800">Order Confirmation</p>
                            <p className="text-xs text-amber-700 mt-0.5">
                              {q.status === "accepted"
                                ? "Revert this quote to not yet confirmed. Create Invoice will be hidden again."
                                : "Set this quote as confirmed. Once confirmed, the Create Invoice action appears."}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmOpenId(null); }}
                              className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              Cancel
                            </button>
                            {q.status === "accepted" ? (
                              <button
                                onClick={e => { e.stopPropagation(); revertOrderConfirmation(q.id); }}
                                disabled={confirmSavingId === q.id}
                                className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60"
                              >
                                {confirmSavingId === q.id ? "Updating..." : "Mark as Order Not Yet Confirmed"}
                              </button>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); confirmOrder(q.id); }}
                                disabled={confirmSavingId === q.id}
                                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                              >
                                {confirmSavingId === q.id ? "Updating..." : "Mark as Order Confirmed"}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {(noteOpenId === q.id || noteEditId === q.id) && (
                    <tr className="border-b border-slate-100 bg-amber-50/40">
                      <td colSpan={7} className="px-5 pb-3 pt-0">
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
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
      {showModal && <QuoteModal onClose={() => setShowModal(false)} />}
      {editQuote && <QuoteModal onClose={() => setEditQuote(null)} initial={editQuote} />}
      {viewQuote && <QuoteView quote={viewQuote} onClose={() => setViewQuote(null)} />}

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
    </Layout>
  );
}
