import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListBills, useDeleteBill, getListBillsQueryKey } from "@workspace/api-client-react";
import { ChevronDown, Plus, MoreHorizontal, Edit, Trash2, CreditCard, PenLine } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import BillModal from "@/components/BillModal";
import PayBillModal from "@/components/PayBillModal";
import PrintChequeModal from "@/components/PrintChequeModal";
import BulkPayBillModal from "@/components/BulkPayBillModal";
import { downloadCsv, downloadPdfFromHtml } from "@/lib/export-utils";

const STATUS_MAP: Record<string, string> = {
  paid:      "text-emerald-700 bg-emerald-50 border-emerald-200",
  overdue:   "text-red-600    bg-red-50    border-red-200",
  received:  "text-blue-700   bg-blue-50   border-blue-200",
  cancelled: "text-slate-400  bg-slate-50  border-slate-200",
  draft:     "text-slate-500  bg-slate-50  border-slate-200",
};

const METHOD_LABELS: Record<string, string> = {
  wire_transfer: "Wire",
  ach: "ACH",
  check: "Check",
  cash: "Cash",
};

function BillCard({
  b, selected, onSelect, onPay, onDelete,
}: {
  b: any;
  selected: boolean;
  onSelect: (id: number) => void;
  onPay?: (b: any) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3.5 border-b border-slate-100 last:border-b-0 transition-colors group ${selected ? "bg-indigo-50/60" : "hover:bg-slate-50/60"}`}>
      {/* Checkbox — only for unpaid bills (onPay present) */}
      {onPay !== undefined ? (
        <button
          onClick={() => onSelect(b.id)}
          className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selected ? "bg-indigo-600 border-indigo-600" : "border-slate-300 hover:border-indigo-400"}`}
        >
          {selected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
      ) : <div className="w-4 flex-shrink-0" />}

      <div className="flex-1 flex items-start justify-between gap-3 min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-800 font-semibold text-sm truncate">{b.vendorName}</span>
            <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize flex-shrink-0 ${STATUS_MAP[b.status] ?? STATUS_MAP.draft}`}>
              {b.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
            <span className="font-mono">BILL-{b.id.toString().padStart(4, "0")}</span>
            <span>Due {formatDate(b.dueDate) || "—"}</span>
            {(b as any).paymentMethod && (
              <span className="text-slate-500 font-medium">
                {METHOD_LABELS[(b as any).paymentMethod] || (b as any).paymentMethod}
                {(b as any).checkNumber && ` #${(b as any).checkNumber}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-slate-800 font-bold text-sm">{formatCurrency(b.total)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
              <MoreHorizontal size={13} className="text-slate-500" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
              {onPay && b.status !== "paid" && b.status !== "cancelled" && (
                <DropdownMenuItem
                  onClick={() => onPay(b)}
                  className="gap-2 cursor-pointer text-sm text-emerald-600 hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-600"
                >
                  <CreditCard size={13} /> Pay Bill
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                <Edit size={13} /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(b.id)}
                className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"
              >
                <Trash2 size={13} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default function Bills() {
  const { data: bills, isLoading } = useListBills();
  const deleteBill = useDeleteBill();
  const queryClient = useQueryClient();
  const [vendorFilter, setVendorFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [payingBill, setPayingBill] = useState<{ id: number; vendorName: string; total: number } | null>(null);
  const [showCheque, setShowCheque] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkPay, setShowBulkPay] = useState(false);

  const vendorNames = Array.from(new Set((bills ?? []).map(b => b.vendorName))).sort();

  const allFiltered = (bills ?? [])
    .filter(b => !vendorFilter || b.vendorName === vendorFilter)
    .sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return b.id - a.id;
    });

  const pendingBills = allFiltered.filter(b => b.status !== "paid");
  const paidBills    = allFiltered.filter(b => b.status === "paid");

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingBills.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingBills.map(b => b.id)));
    }
  };

  const selectedBills = pendingBills.filter(b => selectedIds.has(b.id));
  const selectedTotal = selectedBills.reduce((s, b) => s + b.total, 0);
  const allSelected   = pendingBills.length > 0 && selectedIds.size === pendingBills.length;

  const handleDelete = (id: number) => {
    if (confirm("Delete this bill?")) {
      deleteBill.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() })
      });
    }
  };

  const downloadAllExcel = () => {
    const rows = allFiltered.map((b) => [
      `BILL-${String(b.id).padStart(4, "0")}`,
      b.vendorName,
      formatDate(b.createdAt),
      formatDate(b.dueDate),
      b.status,
      b.total,
    ]);
    downloadCsv("bills.csv", ["Bill Number", "Vendor", "Created", "Due Date", "Status", "Total"], rows);
  };

  const downloadAllPdf = () => {
    const tableHtml = `<table><thead><tr><th>Bill Number</th><th>Vendor</th><th>Created</th><th>Due Date</th><th>Status</th><th>Total</th></tr></thead><tbody>${
      allFiltered.map((b) => `<tr><td>BILL-${String(b.id).padStart(4, "0")}</td><td>${b.vendorName}</td><td>${formatDate(b.createdAt)}</td><td>${formatDate(b.dueDate)}</td><td>${b.status}</td><td>${formatCurrency(b.total)}</td></tr>`).join("")
    }</tbody></table>`;
    downloadPdfFromHtml("Bills", tableHtml);
  };

  return (
    <Layout>
      <Header title="Bills" subtitle={`${bills?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 gap-4 flex flex-col bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">

        {/* Toolbar */}
        <div className="flex justify-between items-center gap-3 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            <select
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400 transition-colors cursor-pointer"
            >
              <option value="">All vendors</option>
              {vendorNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadAllExcel} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All Excel
            </button>
            <button onClick={downloadAllPdf} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All PDF
            </button>
            <button
              onClick={() => setShowCheque(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1e3a5f] text-sm font-semibold text-[#1e3a5f] bg-white hover:bg-blue-50 transition-colors"
            >
              <PenLine size={14} /> Write Cheque
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200"
            >
              <Plus size={14} /> Create Bill
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex-shrink-0 flex items-center gap-3 bg-[hsl(224_50%_15%)] text-white px-4 py-3 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-5 h-5 rounded bg-indigo-400/30 flex items-center justify-center text-[11px] font-bold">{selectedIds.size}</div>
              <span className="text-sm font-semibold">{selectedIds.size} bill{selectedIds.size !== 1 ? "s" : ""} selected</span>
              <span className="text-indigo-300 text-sm">·</span>
              <span className="text-indigo-200 text-sm font-medium">{formatCurrency(selectedTotal)}</span>
            </div>
            <button
              onClick={() => setShowBulkPay(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors shadow"
            >
              <CreditCard size={14} /> Pay Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-xs font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="glass-card p-10 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 h-[calc(100vh-200px)]">

            {/* LEFT — Pending / Unpaid */}
            <div className="glass-card flex flex-col min-h-0 border border-blue-100/70">
              {/* Column header */}
              <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/70 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  {/* Select all checkbox */}
                  {pendingBills.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      title={allSelected ? "Deselect all" : "Select all pending"}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${allSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-400 hover:border-indigo-400 bg-white"}`}
                    >
                      {allSelected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      {!allSelected && selectedIds.size > 0 && <div className="w-2 h-0.5 bg-indigo-400 rounded" />}
                    </button>
                  )}
                  <span className="text-sm font-bold text-slate-800">Pending Bills</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {pendingBills.length} unpaid
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <button
                      onClick={() => setShowBulkPay(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                    >
                      <CreditCard size={10} /> Pay {selectedIds.size}
                    </button>
                  )}
                  <span className="text-xs font-semibold text-red-500">
                    {formatCurrency(pendingBills.reduce((s, b) => s + b.total, 0))}
                  </span>
                </div>
              </div>
              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {pendingBills.length === 0 ? (
                  <p className="px-4 py-10 text-center text-slate-500 text-sm">No pending bills.</p>
                ) : (
                  pendingBills.map(b => (
                    <BillCard
                      key={b.id}
                      b={b}
                      selected={selectedIds.has(b.id)}
                      onSelect={toggleSelect}
                      onPay={b2 => setPayingBill({ id: b2.id, vendorName: b2.vendorName, total: b2.total })}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </div>
            </div>

            {/* RIGHT — Paid */}
            <div className="glass-card flex flex-col min-h-0 border border-blue-100/70">
              <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/70 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">Paid Bills</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {paidBills.length} paid
                  </span>
                </div>
                <span className="text-xs font-semibold text-emerald-600">
                  {formatCurrency(paidBills.reduce((s, b) => s + b.total, 0))}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {paidBills.length === 0 ? (
                  <p className="px-4 py-10 text-center text-slate-500 text-sm">No paid bills yet.</p>
                ) : (
                  paidBills.map(b => (
                    <BillCard key={b.id} b={b} selected={false} onSelect={() => {}} onDelete={handleDelete} />
                  ))
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {showModal && <BillModal onClose={() => setShowModal(false)} />}
      {payingBill && (
        <PayBillModal bill={payingBill} onClose={() => setPayingBill(null)} />
      )}
      {showCheque && (
        <PrintChequeModal
          bills={(bills as any[]).map(b => ({ id: b.id, vendorName: b.vendorName, total: b.total, dueDate: b.dueDate, status: b.status }))}
          onClose={() => setShowCheque(false)}
        />
      )}
      {showBulkPay && selectedBills.length > 0 && (
        <BulkPayBillModal
          bills={selectedBills.map(b => ({ id: b.id, vendorName: b.vendorName, total: b.total, dueDate: (b as any).dueDate }))}
          onClose={() => {
            setShowBulkPay(false);
            setSelectedIds(new Set());
          }}
        />
      )}
    </Layout>
  );
}
