/**
 * Adapters: app models → Forez PDF template (`lib/pdf/forez-pdf-template.ts`).
 */
import {
  FOREZ,
  addressToLines,
  generateForezEstimateHTML,
  generateForezLegacyInvoiceHTML,
  printForezHTML,
  type Address,
  type LineItem,
} from "@/lib/pdf/forez-pdf-template";
import {
  formatEstimateNumber,
  formatInvoiceNumber,
  formatQuoteNumber,
  forezDocFallbackNumber,
  invoiceTitleFromNumber,
  normalizeForezDocNumber,
  orderConfirmationTitleFromQuoteNumber,
} from "@/lib/forez-document-numbers";
import {
  FOREZ_INVOICE,
  generateForezInvoiceHTML,
  printForezInvoice,
  type ForezInvoiceInput,
} from "@/lib/pdf/forez-invoice-template";
import {
  FOREZ_QUOTE,
  generateForezQuoteOrderHTML,
} from "@/lib/pdf/forez-quote-template";

export {
  FOREZ,
  FOREZ as FOREZ_BUSINESS,
  FOREZ_INVOICE,
  addressToLines,
  generateForezEstimateHTML,
  generateForezInvoiceHTML,
  generateForezLegacyInvoiceHTML,
  generateForezQuoteOrderHTML,
  generateForezQuoteOrderHTML as generateForezQuoteHTML,
  generateForezQuoteOrderHTML as generateQuoteHTML,
  generateForezInvoiceHTML as generateInvoiceHTML,
  formatEstimateNumber,
  formatInvoiceNumber,
  formatQuoteNumber,
  forezDocFallbackNumber,
  invoiceTitleFromNumber,
  normalizeForezDocNumber,
  orderConfirmationTitleFromQuoteNumber,
  FOREZ_QUOTE,
  printForezHTML,
  printForezHTML as openForezPrintWindow,
  printForezInvoice,
};
export type { Address, Address as CustomerAddress, ForezInvoiceInput, LineItem };
export type { QuoteOrderInput } from "@/lib/pdf/forez-quote-template";

export const FOREZ_LOGO_URL = FOREZ.logo;

export interface ForezPrintLineItem {
  description: string;
  lineDescription?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

export function formatPrintDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function jsonAddressToAddress(
  j: Record<string, string> | undefined,
  customer: any,
  fallbackName?: string,
): Address | null {
  if (!j?.line1 && !j?.address) return null;

  const line1 = j.line1 ?? j.address;
  return {
    name: customer?.name ?? fallbackName,
    company: customer?.company && customer.company !== customer?.name ? customer.company : undefined,
    line1,
    line2: j.line2,
    city: j.city,
    state: j.state,
    zip: j.zip ?? j.zipCode,
    country: j.country || "USA",
  };
}

function legacyCustomerAddress(customer: any, fallbackName?: string): Address {
  return {
    name: customer?.name ?? fallbackName,
    company: customer?.company && customer.company !== customer?.name ? customer.company : undefined,
    line1: customer?.address,
    city: customer?.city,
    state: customer?.state,
    zip: customer?.zipCode,
    country: customer?.country || "USA",
  };
}

/**
 * QuickBooks-style columns: SHIP FROM = billing / primary, SHIP TO = shipping destination.
 */
export function customerToShipFromShipTo(customer: any, fallbackName?: string): {
  shipFrom: Address;
  shipTo: Address;
} {
  const shipJson = customer?.shippingAddress as Record<string, string> | undefined;
  const billJson = customer?.billingAddress as Record<string, string> | undefined;

  const shipping = jsonAddressToAddress(shipJson, customer, fallbackName);
  const billing = jsonAddressToAddress(billJson, customer, fallbackName);
  const legacy = legacyCustomerAddress(customer, fallbackName);

  const shipFrom = billing ?? shipping ?? legacy;
  const shipTo = shipping ?? billing ?? legacy;

  return { shipFrom, shipTo };
}

/** @deprecated Use customerToShipFromShipTo */
export function customerToShipToAddress(customer: any, fallbackName?: string): Address {
  return customerToShipFromShipTo(customer, fallbackName).shipTo;
}

/** @deprecated Use customerToShipFromShipTo */
export function customerToAddresses(customer: any, fallbackName?: string) {
  const { shipFrom, shipTo } = customerToShipFromShipTo(customer, fallbackName);
  return { shippingAddress: shipTo, billingAddress: shipFrom };
}

export function lineItemsFromApi(
  items: Array<{
    description: string;
    lineDescription?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
  }>,
): LineItem[] {
  return items.map((item) => ({
    description: item.description,
    details: item.lineDescription,
    quantity: item.quantity,
    rate: item.unitPrice,
    unit: item.unit,
  }));
}

const INVOICE_PMT_LABELS: Record<string, string> = {
  bank_transfer: "ACH",
  stripe: "Credit Card",
  check: "Check",
  cash: "Cash",
};

function invoicePaymentMethodLabel(method?: string | null): string {
  if (!method) return "ACH";
  return INVOICE_PMT_LABELS[method] ?? method;
}

export function buildInvoicePrintHtml(input: {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  customer: any;
  customerName?: string;
  lineItems: ForezPrintLineItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal?: number;
  total: number;
  notes?: string | null;
  trackingNumber?: string | null;
  /** Quote number from the source quote — shown as "QUOTE #" and used as order confirmation fallback. */
  quoteNumber?: string | null;
  paymentMethod?: string | null;
  /** Stripe / hosted pay URL — wired when payment API is configured */
  paymentUrl?: string | null;
  showPaymentSection?: boolean;
}): string {
  const { shipFrom, shipTo } = customerToShipFromShipTo(input.customer, input.customerName);

  const invoiceNumber = normalizeForezDocNumber(input.invoiceNumber, "invoice");
  const quoteNumber = input.quoteNumber?.trim() || undefined;
  const data: ForezInvoiceInput = {
    invoiceTitle: invoiceTitleFromNumber(invoiceNumber),
    invoiceNumber,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? undefined,
    billTo: shipFrom,
    shipTo,
    reference: input.trackingNumber?.trim() || quoteNumber || undefined,
    quoteNumber,
    paymentMethod: invoicePaymentMethodLabel(input.paymentMethod),
    items: lineItemsFromApi(input.lineItems),
    subtotal: input.subtotal,
    tax: input.taxTotal,
    discount: input.discountTotal,
    total: input.total,
    notes: input.notes ?? undefined,
    paymentUrl: input.paymentUrl?.trim() || undefined,
    showPaymentSection: input.showPaymentSection,
  };

  return generateForezInvoiceHTML(data);
}

export function buildQuotePrintHtml(input: {
  quoteNumber: string;
  issueDate: string;
  dueDate?: string | null;
  customer?: any;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerCountry?: string | null;
  lineItems: Array<{
    description: string;
    lineDescription?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    taxPercent?: number;
  }>;
  subtotal: number;
  taxTotal: number;
  discountTotal?: number;
  total: number;
  notes?: string | null;
  trackingNumber?: string | null;
  reference?: string | null;
  leadTimeDays?: number;
  acceptedBy?: string | null;
  acceptedDate?: string | null;
}): string {
  const { shipFrom, shipTo } = input.customer
    ? customerToShipFromShipTo(input.customer, input.customerName)
    : {
        shipFrom: fallbackCustomerAddress(input),
        shipTo: fallbackCustomerAddress(input),
      };

  const reference =
    input.reference?.trim() ||
    input.trackingNumber?.trim() ||
    input.notes?.trim() ||
    undefined;

  const items = lineItemsFromApi(input.lineItems).map((item, i) => {
    const src = input.lineItems[i];
    const taxable = (src?.taxPercent ?? 0) > 0;
    return taxable ? { ...item, unit: "T" } : item;
  });

  const acceptedBy = input.acceptedBy?.trim() || undefined;
  const acceptedDate = input.acceptedDate?.trim() || undefined;

  const quoteNumber = normalizeForezDocNumber(input.quoteNumber, "quote");

  return generateForezQuoteOrderHTML({
    quoteNumber,
    orderConfirmationTitle: orderConfirmationTitleFromQuoteNumber(quoteNumber),
    issueDate: input.issueDate,
    address: shipFrom,
    shipTo,
    reference,
    items,
    subtotal: input.subtotal,
    tax: input.taxTotal,
    discount: input.discountTotal,
    total: input.total,
    notes: reference && input.notes?.trim() === reference ? undefined : input.notes ?? undefined,
    leadTimeDays: input.leadTimeDays,
    acceptedBy,
    acceptedDate,
  });
}

function fallbackCustomerAddress(input: {
  customerName: string;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerCountry?: string | null;
}): Address {
  return {
    name: input.customerName,
    line1: input.customerAddress ?? undefined,
    city: input.customerCity ?? undefined,
    state: input.customerState ?? undefined,
    zip: input.customerZip ?? undefined,
    country: input.customerCountry || "USA",
  };
}

export const openForezDocumentPrint = printForezHTML;
