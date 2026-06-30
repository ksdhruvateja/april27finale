import { useMemo } from "react";
import { X, Printer } from "lucide-react";
import { useListCustomers } from "@workspace/api-client-react";
import {
  buildReturnPrintHtml,
  formatReturnNumber,
  openForezReturnPrint,
} from "@/lib/forez-return-print";
import ForezDocumentPreview from "./ForezDocumentPreview";

interface ReturnRecord {
  id: number;
  type: string;
  customerId: number;
  customerName: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  status: string;
  reason: string | null;
  lineItems: Array<{
    description: string;
    lineDescription?: string;
    quantity: number;
    unitPrice?: number;
    unit?: string;
  }>;
  refundAmount: number | null;
  refundMethod: string | null;
  refundedAt: string | null;
  notes: string | null;
  internalNote: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  return: "Return",
  refund: "Refund",
  return_refund: "Return & Refund",
};

interface Props {
  record: ReturnRecord;
  onClose: () => void;
}

export default function ReturnView({ record, onClose }: Props) {
  const { data: customers } = useListCustomers();
  const customer = customers?.find((c: any) => c.id === record.customerId) as any;

  const recordNumber = formatReturnNumber(record.id);

  const previewHtml = useMemo(
    () => buildReturnPrintHtml({ record, customer }),
    [record, customer],
  );

  function handlePrint() {
    openForezReturnPrint(previewHtml);
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
            <span className="text-slate-800 font-bold text-sm truncate font-mono">{recordNumber}</span>
            <span className="text-slate-500 text-xs truncate">{TYPE_LABEL[record.type] ?? record.type}</span>
            <span className="text-slate-500 text-xs truncate">· {record.customerName}</span>
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

        {record.internalNote?.trim() && (
          <div className="flex-shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
              Internal note (not printed)
            </p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{record.internalNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
