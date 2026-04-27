import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListEstimates, useDeleteEstimate, useConvertEstimateToInvoice, getListEstimatesQueryKey } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Receipt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import EstimateModal from "@/components/EstimateModal";
import { downloadCsv, downloadPdfFromHtml } from "@/lib/export-utils";

const STATUS_MAP: Record<string, string> = {
  approved:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  rejected:  "text-red-600    bg-red-50    border-red-200",
  invoiced:  "text-purple-700 bg-purple-50 border-purple-200",
  pending:   "text-blue-700   bg-blue-50   border-blue-200",
  draft:     "text-slate-500  bg-slate-50  border-slate-200",
};

export default function Estimates() {
  const [, setLocation] = useLocation();
  const { data: estimates, isLoading } = useListEstimates();
  const deleteEstimate = useDeleteEstimate();
  const convertToInvoice = useConvertEstimateToInvoice();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const fallbackFcNumber = (id: number) => `FRZI - ${Math.max(5100, 5099 + Number(id ?? 0))}`;

  const q = search.trim().toLowerCase();
  const filtered = (estimates ?? [])
    .filter((e: any) => {
      if (!q) return true;
      const productText = (e.lineItems ?? [])
        .map((li: any) => String(li.description ?? ""))
        .join(" ")
        .toLowerCase();
      return [
        e.customerName,
        e.estimateNumber,
        e.status,
        e.notes,
        e.internalNote,
        String(e.id ?? ""),
        productText,
      ].some(v => String(v ?? "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return (b.id ?? 0) - (a.id ?? 0);
    });

  const handleDelete = (id: number) => {
    if (confirm("Delete this estimate?")) {
      deleteEstimate.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() })
      });
    }
  };

  const handleConvert = (id: number) => {
    if (confirm("Convert this estimate to an invoice?")) {
      convertToInvoice.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
          setLocation("/invoices");
        }
      });
    }
  };

  const downloadAllExcel = () => {
    const rows = filtered.map((e) => [
      (e as any).estimateNumber ?? fallbackFcNumber(e.id),
      e.customerName,
      formatDate(e.createdAt),
      e.status,
      e.total,
    ]);
    downloadCsv("estimates.csv", ["Estimate Number", "Customer", "Created", "Status", "Total"], rows);
  };

  const downloadAllPdf = () => {
    const tableHtml = `<table><thead><tr><th>Estimate Number</th><th>Customer</th><th>Created</th><th>Status</th><th>Total</th></tr></thead><tbody>${
      filtered.map((e) => `<tr><td>${(e as any).estimateNumber ?? fallbackFcNumber(e.id)}</td><td>${e.customerName}</td><td>${formatDate(e.createdAt)}</td><td>${e.status}</td><td>${formatCurrency(e.total)}</td></tr>`).join("")
    }</tbody></table>`;
    downloadPdfFromHtml("Estimates", tableHtml);
  };

  return (
    <Layout>
      <Header title="Estimates" subtitle={`${estimates?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search estimates by customer..." value={search}
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
            <button onClick={() => setShowModal(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
              <Plus size={14} /> Create Estimate
            </button>
          </div>
        </div>
        <div className="glass-card">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No estimates found.</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Estimate #</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Total</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{(e as any).estimateNumber ?? fallbackFcNumber(e.id)}</td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{e.customerName}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(e.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_MAP[e.status] ?? STATUS_MAP.draft}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-semibold text-right">{formatCurrency(e.total)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {e.status !== "invoiced" && (
                          <button
                            onClick={() => handleConvert(e.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all whitespace-nowrap"
                          >
                            <Receipt size={11} /> Create Invoice
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                            <DropdownMenuItem className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(e.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
      {showModal && <EstimateModal onClose={() => setShowModal(false)} />}
    </Layout>
  );
}
