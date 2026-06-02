/**
 * Adapters: purchase order models → Forez PO template.
 */
import {
  FOREZ_PO,
  generateForezPurchaseOrderHTML,
  printForezPurchaseOrderHTML,
  type Address,
  type LineItem,
  type PurchaseOrderInput,
} from "@/lib/pdf/forez-po-template";
import { lineItemsFromApi } from "@/lib/forez-document-print";

export {
  FOREZ_PO,
  generateForezPurchaseOrderHTML,
  printForezPurchaseOrderHTML,
  printForezPurchaseOrderHTML as openForezPurchaseOrderPrint,
};
export type { Address, LineItem, PurchaseOrderInput };

/** Matches list UI / QuickBooks-style PO numbers. */
export function formatPurchaseOrderNumber(po: {
  id: number;
  sourceInvoiceId?: number | null;
  poSequence?: number | null;
}): string {
  if (po.sourceInvoiceId != null && po.poSequence != null) {
    return `FRZPO-${String(po.sourceInvoiceId).padStart(4, "0")}-${po.poSequence}`;
  }
  return `FRZP${String(po.id).padStart(7, "0")}`;
}

export function vendorToAddress(vendor: any): Address {
  const shipJson = vendor?.shippingAddress as Record<string, string> | undefined;
  const billJson = vendor?.billingAddress as Record<string, string> | undefined;
  const j = billJson?.line1 || billJson?.address ? billJson : shipJson;

  if (j?.line1 || j?.address) {
    return {
      name: vendor?.name,
      company: vendor?.company && vendor.company !== vendor.name ? vendor.company : undefined,
      line1: j.line1 ?? j.address,
      line2: j.line2,
      city: j.city,
      state: j.state,
      zip: j.zip ?? j.zipCode,
      country: j.country || "USA",
    };
  }

  return {
    name: vendor?.name,
    company: vendor?.company && vendor.company !== vendor.name ? vendor.company : undefined,
    line1: vendor?.address,
    city: vendor?.city,
    state: vendor?.state,
    zip: vendor?.zipCode,
    country: vendor?.country || "USA",
  };
}

/** Forez receiving address (SHIP TO on PO). */
export function forezShipToAddress(): Address {
  return {
    name: FOREZ_PO.name,
    line1: FOREZ_PO.line1,
    line2: FOREZ_PO.line2,
    country: FOREZ_PO.country,
  };
}

export function buildPurchaseOrderPrintHtml(input: {
  po: {
    id: number;
    sourceInvoiceId?: number | null;
    poSequence?: number | null;
    createdAt: string;
    notes?: string | null;
    lineItems: Array<{
      description: string;
      lineDescription?: string;
      quantity: number;
      unitPrice: number;
      unit?: string;
    }>;
    subtotal: number;
    taxTotal?: number;
    total: number;
  };
  vendor: any;
  /** Override PO number if already computed in UI. */
  poNumber?: string;
  reference?: string | null;
  shipTo?: Address;
}): string {
  const poNumber = input.poNumber ?? formatPurchaseOrderNumber(input.po);
  const referenceParts = [input.reference, input.po.notes].filter(Boolean) as string[];
  const reference = referenceParts.length ? referenceParts.join(" / ") : undefined;

  const data: PurchaseOrderInput = {
    poNumber,
    issueDate: input.po.createdAt,
    vendor: vendorToAddress(input.vendor),
    shipTo: input.shipTo ?? forezShipToAddress(),
    reference,
    items: lineItemsFromApi(input.po.lineItems),
    subtotal: Number(input.po.subtotal),
    tax: Number(input.po.taxTotal ?? 0),
    total: Number(input.po.total),
  };

  return generateForezPurchaseOrderHTML(data);
}
