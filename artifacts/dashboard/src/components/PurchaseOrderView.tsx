import { useMemo } from "react";
import { X, Printer } from "lucide-react";
import { useListVendors } from "@workspace/api-client-react";
import {
  buildPurchaseOrderPrintHtml,
  formatPurchaseOrderNumber,
  openForezPurchaseOrderPrint,
} from "@/lib/forez-po-print";
import ForezDocumentPreview from "./ForezDocumentPreview";

interface LineItem {
  description: string;
  lineDescription?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

interface PurchaseOrder {
  id: number;
  vendorId: number;
  vendorName?: string;
  sourceInvoiceId?: number | null;
  poSequence?: number | null;
  status?: string;
  lineItems: LineItem[];
  subtotal: number;
  taxTotal?: number;
  total: number;
  notes?: string | null;
  internalNote?: string | null;
  expectedDate?: string | null;
  createdAt: string;
}

interface Props {
  po: PurchaseOrder;
  onClose: () => void;
  /** Linked invoice label for REFERENCE # (e.g. FRZI - 5100). */
  sourceInvoiceLabel?: string | null;
}

export default function PurchaseOrderView({ po, onClose, sourceInvoiceLabel }: Props) {
  const { data: vendors } = useListVendors();
  const vendor = vendors?.find((v: any) => v.id === po.vendorId) as any;

  const poNumber = formatPurchaseOrderNumber(po);

  const previewHtml = useMemo(() => {
    const reference = sourceInvoiceLabel
      ? `Invoice ${sourceInvoiceLabel}`
      : po.sourceInvoiceId
        ? `Invoice #${po.sourceInvoiceId}`
        : undefined;

    return buildPurchaseOrderPrintHtml({
      po,
      vendor,
      poNumber,
      reference,
    });
  }, [po, vendor, poNumber, sourceInvoiceLabel]);

  function handlePrint() {
    openForezPurchaseOrderPrint(previewHtml);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[920px] max-h-[94vh] flex flex-col rounded-xl border border-slate-200 bg-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-800 font-bold text-sm truncate font-mono">{poNumber}</span>
            <span className="text-slate-500 text-xs truncate">{po.vendorName}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700"
            >
              <Printer size={14} /> Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <ForezDocumentPreview html={previewHtml} />
        </div>

        {po.internalNote?.trim() && (
          <div className="flex-shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
              Internal note (not printed)
            </p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{po.internalNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
