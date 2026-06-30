import { useMemo } from "react";
import { X, Printer, CheckCircle2, Clock, AlertTriangle, Ban, ShoppingCart } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { formatInvoiceNumber } from "@/lib/forez-document-numbers";
import {
  buildInvoicePrintHtml,
  openForezDocumentPrint,
  type ForezPrintLineItem,
} from "@/lib/forez-document-print";
import { useListCustomers } from "@workspace/api-client-react";
import ForezDocumentPreview from "./ForezDocumentPreview";

interface LineItem {
  description: string;
  lineDescription?: string;
  sku?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  taxPercent?: number;
  discountPercent?: number;
}

interface Invoice {
  id: number;
  customerId?: number;
  customerName?: string;
  status: string;
  lineItems: LineItem[];
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

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onMarkPaid?: (id: number) => void;
  onMarkPending?: (id: number) => void;
  onCreatePO?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  paid:      { label: "Paid",      icon: <CheckCircle2 size={14} />, bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  sent:      { label: "Sent",      icon: <Clock size={14} />,        bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200" },
  pending:   { label: "Pending",   icon: <Clock size={14} />,        bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200" },
  draft:     { label: "Draft",     icon: <Clock size={14} />,        bg: "bg-slate-100",   text: "text-slate-600",   border: "border-slate-200" },
  overdue:   { label: "Overdue",   icon: <AlertTriangle size={14} />,bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200" },
  cancelled: { label: "Cancelled", icon: <Ban size={14} />,          bg: "bg-slate-50",    text: "text-slate-500",   border: "border-slate-200" },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe:         "Credit Card (Stripe)",
  bank_transfer:  "Bank Transfer",
  check:          "Check",
  cash:           "Cash",
};

export default function InvoiceView({ invoice, onClose, onMarkPaid, onMarkPending, onCreatePO }: Props) {
  const { data: customers } = useListCustomers();

  const customer = customers?.find((c: any) => c.id === invoice.customerId) as any;

  const effectiveInvoiceNum = formatInvoiceNumber(Number(invoice.id ?? 0), invoice.invoiceNumber);
  const status = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft;
  const isOverdue = invoice.status === "sent" && invoice.dueDate && new Date(invoice.dueDate) < new Date();

  const previewHtml = useMemo(() => {
    const paidNote =
      invoice.paidAt && invoice.paymentMethod
        ? `Paid via ${PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod} on ${formatDate(invoice.paidAt)}.`
        : null;

    const notes = [invoice.notes, paidNote].filter(Boolean).join("\n\n") || null;

    return buildInvoicePrintHtml({
      invoiceNumber: effectiveInvoiceNum,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      customer,
      customerName: invoice.customerName,
      lineItems: invoice.lineItems as ForezPrintLineItem[],
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      discountTotal: invoice.discountTotal,
      total: invoice.total,
      notes,
      trackingNumber: invoice.trackingNumber,
      paymentMethod: invoice.paymentMethod,
    });
  }, [invoice, customer, effectiveInvoiceNum]);

  function handlePrint() {
    openForezDocumentPrint(previewHtml);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[920px] max-h-[94vh] flex flex-col rounded-xl border border-slate-200 bg-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar — actions only; document body is the print template below */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-800 font-bold text-sm truncate">{effectiveInvoiceNum}</span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${status.bg} ${status.text} ${status.border}`}
            >
              {status.icon}
              {isOverdue ? "Overdue" : status.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onCreatePO && (
              <button
                type="button"
                onClick={onCreatePO}
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1.5 rounded-lg hover:bg-violet-100"
              >
                <ShoppingCart size={13} /> PO
              </button>
            )}
            {invoice.status !== "pending" && invoice.status !== "paid" && invoice.status !== "cancelled" && onMarkPending && (
              <button
                type="button"
                onClick={() => onMarkPending(invoice.id)}
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg hover:bg-amber-100"
              >
                <CheckCircle2 size={13} /> Pending
              </button>
            )}
            {invoice.status !== "paid" && invoice.status !== "cancelled" && onMarkPaid && (
              <button
                type="button"
                onClick={() => onMarkPaid(invoice.id)}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100"
              >
                <CheckCircle2 size={13} /> Paid
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-700"
            >
              <Printer size={13} /> Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Same layout as PDF / print */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 bg-slate-200/80">
          <ForezDocumentPreview html={previewHtml} />
        </div>

        {invoice.internalNote?.trim() && (
          <div className="flex-shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
              Internal note (not on printed invoice)
            </p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{invoice.internalNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
