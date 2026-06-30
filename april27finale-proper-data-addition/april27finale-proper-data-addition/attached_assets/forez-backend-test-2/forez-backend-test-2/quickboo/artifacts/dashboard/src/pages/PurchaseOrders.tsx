import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListPurchaseOrders, useDeletePurchaseOrder, useConvertPurchaseOrderToBill, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, CreditCard, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import PurchaseOrderModal from "@/components/PurchaseOrderModal";
import ShipmentModal from "@/components/ShipmentModal";
import { downloadCsv, downloadPdfFromHtml } from "@/lib/export-utils";

const STATUS_MAP: Record<string, string> = {
  received:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  sent:      "text-blue-700   bg-blue-50   border-blue-200",
  cancelled: "text-slate-400  bg-slate-50  border-slate-200",
  draft:     "text-slate-500  bg-slate-50  border-slate-200",
};

interface ShipmentContext {
  customerId: number;
  invoiceId: number | null;
  customerName: string;
  lineItems: Array<{ description: string; quantity: number }>;
}

export default function PurchaseOrders() {
  const { data: pos, isLoading } = useListPurchaseOrders();
  const deletePO = useDeletePurchaseOrder();
  const convertToBill = useConvertPurchaseOrderToBill();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editPO, setEditPO] = useState<any | null>(null);
  const [shipmentContext, setShipmentContext] = useState<ShipmentContext | null>(null);
  const [loadingShipment, setLoadingShipment] = useState<number | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = (pos ?? [])
    .filter((p: any) => {
      if (!q) return true;
      const productText = (p.lineItems ?? []).map((li: any) => String(li.description ?? "")).join(" ").toLowerCase();
      const poNumber = p.sourceInvoiceId && p.poSequence
        ? `frzpo-${String(p.sourceInvoiceId).padStart(4, "0")}-${p.poSequence}`
        : `frzpo-${String(p.id).padStart(4, "0")}`;
      return [
        p.vendorName,
        p.status,
        p.notes,
        p.internalNote,
        poNumber,
        String(p.id),
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
    if (confirm("Delete this purchase order?")) {
      deletePO.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
      });
    }
  };

  const handleConvert = (id: number) => {
    if (confirm("Convert this PO to a bill?")) {
      convertToBill.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
      });
    }
  };

  const handleCreateShipment = async (po: { id: number; sourceInvoiceId?: number | null; lineItems?: object[] }) => {
    setLoadingShipment(po.id);
    try {
      if (po.sourceInvoiceId) {
        const res = await fetch(`/api/invoices/${po.sourceInvoiceId}`);
        if (res.ok) {
          const inv = await res.json();
          setShipmentContext({
            customerId: inv.customerId,
            invoiceId: inv.id,
            customerName: inv.customerName ?? "Customer",
            lineItems: (inv.lineItems ?? []).map((li: { description: string; quantity: number }) => ({ description: li.description, quantity: li.quantity })),
          });
          return;
        }
      }
      const poItems = (po.lineItems ?? []) as Array<{ description: string; quantity: number }>;
      setShipmentContext({
        customerId: 0,
        invoiceId: null,
        customerName: "Customer",
        lineItems: poItems.map(li => ({ description: li.description, quantity: li.quantity })),
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
      po.status,
      po.total,
    ]);
    downloadCsv("purchase-orders.csv", ["PO Number", "Vendor", "Created", "Expected", "Status", "Total"], rows);
  };

  const downloadAllPdf = () => {
    const tableHtml = `<table><thead><tr><th>PO Number</th><th>Vendor</th><th>Created</th><th>Expected</th><th>Status</th><th>Total</th></tr></thead><tbody>${
      filtered.map((po) => `<tr><td>FRZPO-${String(po.id).padStart(4, "0")}</td><td>${po.vendorName}</td><td>${formatDate(po.createdAt)}</td><td>${formatDate(po.expectedDate)}</td><td>${po.status}</td><td>${formatCurrency(po.total)}</td></tr>`).join("")
    }</tbody></table>`;
    downloadPdfFromHtml("Purchase Orders", tableHtml);
  };

  return (
    <Layout>
      <Header title="Purchase Orders" subtitle={`${pos?.length ?? 0} total`} />
      <div className="flex-1 flex flex-col overflow-hidden px-5 py-4 gap-4 bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search POs by vendor..." value={search}
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
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200">
              <Plus size={14} /> Create PO
            </button>
          </div>
        </div>
        <div className="glass-card flex-1 flex flex-col min-h-0 border border-blue-100/70">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No purchase orders found.</div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-blue-100 bg-blue-50/80">
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
                {filtered?.map(po => (
                  <tr key={po.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors group">
                    <td className="px-5 py-3.5 font-mono text-xs">
                      {po.sourceInvoiceId && po.poSequence
                        ? <span className="text-amber-700">FRZPO-{po.sourceInvoiceId.toString().padStart(4, "0")}-{po.poSequence}</span>
                        : <span className="text-slate-400">FRZPO-{po.id.toString().padStart(4, "0")}</span>
                      }
                    </td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{po.vendorName}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(po.createdAt)}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(po.expectedDate)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_MAP[po.status] ?? STATUS_MAP.draft}`}>
                        {po.status}
                      </span>
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
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
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
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
      {showModal && <PurchaseOrderModal onClose={() => setShowModal(false)} />}
      {editPO && <PurchaseOrderModal onClose={() => setEditPO(null)} initial={editPO} />}
      {shipmentContext && shipmentContext.customerId > 0 && (
        <ShipmentModal
          customerId={shipmentContext.customerId}
          invoiceId={shipmentContext.invoiceId}
          customerName={shipmentContext.customerName}
          lineItems={shipmentContext.lineItems}
          onClose={() => setShipmentContext(null)}
        />
      )}
    </Layout>
  );
}
