/**
 * Adapters: return / refund models → Forez return template.
 */
import {
  customerToShipFromShipTo,
  lineItemsFromApi,
} from "@/lib/forez-document-print";
import {
  FOREZ_RETURN,
  generateForezReturnRefundHTML,
  printForezReturnRefundHTML,
  type ReturnLineItem,
  type ReturnRefundInput,
} from "@/lib/pdf/forez-return-template";

export {
  FOREZ_RETURN,
  generateForezReturnRefundHTML,
  printForezReturnRefundHTML,
  printForezReturnRefundHTML as openForezReturnPrint,
};
export type { ReturnLineItem, ReturnRefundInput };

const DOC_TITLES: Record<string, string> = {
  return: "Return Authorization",
  refund: "Refund Receipt",
  return_refund: "Return & Refund",
};

const TYPE_LABELS: Record<string, string> = {
  return: "Return",
  refund: "Refund",
  return_refund: "Return & Refund",
};

export function formatReturnNumber(id: number): string {
  return `RET-${String(id).padStart(4, "0")}`;
}

export function buildReturnPrintHtml(input: {
  record: {
    id: number;
    type: string;
    customerId: number;
    customerName: string;
    invoiceId?: number | null;
    invoiceNumber?: string | null;
    status: string;
    reason?: string | null;
    lineItems?: Array<{
      description: string;
      lineDescription?: string;
      quantity: number;
      unitPrice?: number;
      unit?: string;
    }>;
    refundAmount?: number | null;
    refundMethod?: string | null;
    refundedAt?: string | null;
    notes?: string | null;
    createdAt: string;
  };
  customer?: any;
}): string {
  const { shipFrom } = input.customer
    ? customerToShipFromShipTo(input.customer, input.record.customerName)
    : { shipFrom: { name: input.record.customerName } };

  const lineItems = Array.isArray(input.record.lineItems) ? input.record.lineItems : [];
  const items: ReturnLineItem[] = lineItemsFromApi(
    lineItems.map((item) => ({
      description: item.description,
      lineDescription: item.lineDescription,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? 0,
      unit: item.unit,
    })),
  ).map((item) => ({
    description: item.description,
    details: item.details,
    quantity: item.quantity,
    rate: item.rate,
    unit: item.unit,
  }));

  const invoiceLabel =
    input.record.invoiceNumber?.trim() ||
    (input.record.invoiceId ? `INV-${input.record.invoiceId}` : null);

  const data: ReturnRefundInput = {
    recordNumber: formatReturnNumber(input.record.id),
    docTitle: DOC_TITLES[input.record.type] ?? "Return / Refund",
    typeLabel: TYPE_LABELS[input.record.type] ?? input.record.type,
    issueDate: input.record.createdAt,
    customer: shipFrom,
    invoiceNumber: invoiceLabel,
    status: input.record.status,
    reason: input.record.reason,
    refundAmount: input.record.refundAmount != null ? Number(input.record.refundAmount) : null,
    refundMethod: input.record.refundMethod,
    refundedAt: input.record.refundedAt,
    items,
    notes: input.record.notes,
  };

  return generateForezReturnRefundHTML(data);
}
