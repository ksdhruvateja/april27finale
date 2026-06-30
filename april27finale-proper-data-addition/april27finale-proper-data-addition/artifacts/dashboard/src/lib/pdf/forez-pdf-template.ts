import { normalizeForezDocNumber } from "@/lib/forez-document-numbers";
import { FOREZ_PRINT_LAYOUT_CSS, renderForezTopHeader } from "./forez-print-shared";

/**
 * Forez document HTML — matches QuickBooks export layout (Estimate_5209 sample).
 * Measured from `Estimate_5209 (1).pdf`: Courier body, black header bands, SHIP FROM / SHIP TO,
 * QTY · UNIT · RATE · AMOUNT table, totals bar, signatures, thank-you footer.
 */

export interface Address {
  /** When set, each entry is printed on its own line (QuickBooks multi-line blocks). */
  lines?: string[];
  name?: string;
  company?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface LineItem {
  description: string;
  details?: string;
  quantity: number;
  rate: number;
  unit?: string;
}

export interface EstimateInput {
  estimateNumber: string;
  issueDate: string;
  dueDate?: string;
  shipFrom: Address;
  shipTo: Address;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  trackingNumber?: string;
}

export interface InvoiceInput {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  shipFrom: Address;
  shipTo: Address;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  trackingNumber?: string;
  termsLines?: string[];
}

export interface QuoteInput {
  quoteNumber: string;
  issueDate: string;
  dueDate?: string;
  shipFrom: Address;
  shipTo: Address;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  trackingNumber?: string;
}

export const FOREZ = {
  logo: "/forez-logo.png",
  name: "FOREZ CORP.",
  line1: "2402 Ocean Ave",
  line2: "Ronkonkoma, NY 11779",
  country: "USA",
  email: "sales@forezcorp.com",
  website: "www.forezcorp.com",
};

type DocKind = "INVOICE" | "ESTIMATE" | "QUOTE";

interface ForezRenderInput {
  docKind: DocKind;
  documentNumber: string;
  issueDate: string;
  shipFrom: Address;
  shipTo: Address;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  trackingNumber?: string;
  termsParagraphs: string[];
}

function formatMoney(value: number, withDollar = false) {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return withDollar ? `$${n}` : n;
}

function formatDate(date?: string) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value?: string) {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Flatten structured address into display lines (QuickBooks style). */
export function addressToLines(address: Address): string[] {
  if (address.lines?.length) {
    return address.lines.map((l) => l.trim()).filter(Boolean);
  }

  let zipLine = "";
  if (address.city || address.state || address.zip) {
    const cityState = [address.city, address.state].filter(Boolean).join(", ");
    zipLine = [cityState, address.zip].filter(Boolean).join(cityState && address.zip ? " " : "");
    if (zipLine && address.country) zipLine += ` ${address.country}`;
    else if (!zipLine && address.country) zipLine = address.country;
  } else if (address.country) {
    zipLine = address.country;
  }

  return [
    address.name,
    address.company,
    address.line1,
    address.line2,
    zipLine || undefined,
  ]
    .map((l) => (l ?? "").trim())
    .filter(Boolean);
}

function renderAddressLines(address: Address) {
  return addressToLines(address)
    .map((line) => `<div class="addr-line">${escapeHtml(line)}</div>`)
    .join("");
}

function isShippingLine(item: LineItem) {
  return (
    /^(freight|shipping)$/i.test(item.description.trim()) ||
    /shipping charges/i.test(item.details ?? "")
  );
}

function renderForezDocumentHTML(data: ForezRenderInput): string {
  const rows = data.items
    .map((item) => {
      const amount = item.quantity * item.rate;
      const shipping = isShippingLine(item);
      const title = shipping ? "Shipping" : item.description;
      const details = shipping ? item.details ?? item.description : item.details;

      return `
<tr class="item-row">
  <td class="col-desc">
    <div class="item-title">${escapeHtml(title)}</div>
    ${details && !shipping ? `<div class="item-details">${escapeHtml(details)}</div>` : ""}
    ${shipping && details ? `<div class="item-details">${escapeHtml(details)}</div>` : ""}
  </td>
  <td class="col-qty">${item.quantity}</td>
  <td class="col-unit">${escapeHtml(item.unit ?? "")}</td>
  <td class="col-rate">${formatMoney(item.rate)}</td>
  <td class="col-amount">${formatMoney(amount)}</td>
</tr>`;
    })
    .join("");

  const termsHtml = data.termsParagraphs
    .map((p) => `<p class="terms-line">${escapeHtml(p)}</p>`)
    .join("");

  const notesHtml = data.notes?.trim()
    ? `<p class="terms-line"><strong>Notes:</strong> ${escapeHtml(data.notes.trim())}</p>`
    : "";

  const dateValue = formatDate(data.issueDate);
  const rmaNumber = escapeHtml(data.documentNumber.trim());
  const trackingValue = data.trackingNumber?.trim();
  const trackingHtml = trackingValue
    ? `<div class="tracking"><strong>Tracking Number :</strong> ${escapeHtml(trackingValue)}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(data.documentNumber)}</title>
<style>
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Courier New", Courier, monospace;
  font-size: 10pt;
  line-height: 1.2;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${FOREZ_PRINT_LAYOUT_CSS}
.meta-boxes {
  display: flex;
  flex-direction: column;
  gap: 7pt;
  align-items: stretch;
  width: 100%;
}
.black-box {
  background: #000;
  color: #fff;
  min-height: 27pt;
  padding: 5pt 8pt;
  font-size: 10pt;
  line-height: 1.15;
}
.black-box.rma { font-family: Carlito, "Segoe UI", sans-serif; font-size: 11pt; font-weight: 700; }
.black-box.date {
  font-weight: 700;
  font-size: 10pt;
  min-height: 27pt;
}
.black-box.date .date-value {
  display: block;
  margin-top: 3pt;
  font-weight: 400;
}
.black-box.rma .rma-value {
  display: block;
  margin-top: 3pt;
  font-family: "Courier New", Courier, monospace;
  font-weight: 400;
  font-size: 10pt;
}
.tracking {
  font-family: Caladea, "Times New Roman", serif;
  font-size: 8pt;
  font-weight: 700;
  color: #212121;
  margin-bottom: 10pt;
}
/* —— Line items table —— */
.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 12pt;
}
.items-table thead tr {
  background: #000;
  color: #fff;
}
.items-table thead th {
  font-weight: 700;
  font-size: 9pt;
  padding: 5pt 6pt;
  text-align: right;
  vertical-align: middle;
}
.items-table thead th.col-desc-h {
  text-align: left;
  background: #000;
}
.col-desc { width: 52%; }
.col-qty { width: 8%; text-align: right; }
.col-unit { width: 14%; text-align: right; }
.col-rate { width: 13%; text-align: right; }
.col-amount { width: 13%; text-align: right; }
.items-table tbody td.col-qty,
.items-table tbody td.col-unit {
  font-size: 10pt;
  text-align: right;
  vertical-align: top;
}
.items-table tbody td {
  font-size: 10pt;
  padding: 6pt 6pt;
  vertical-align: top;
  border-bottom: 1pt solid #d0d0d0;
}
.items-table tbody tr:last-child td {
  border-bottom: 1pt solid #000;
}
.item-title { font-weight: 700; margin-bottom: 2pt; }
.item-details { font-weight: 400; line-height: 1.25; }
/* —— Terms + totals —— */
.bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20pt;
  margin-bottom: 28pt;
}
.terms {
  flex: 1;
  max-width: 52%;
  font-size: 10pt;
  line-height: 1.35;
}
.terms-line { margin: 0 0 4pt; }
.totals {
  width: 240pt;
  flex-shrink: 0;
  font-size: 10pt;
}
.total-row {
  display: flex;
  justify-content: space-between;
  padding: 2pt 0;
}
.total-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #000;
  color: #fff;
  margin-top: 8pt;
  padding: 6pt 10pt;
  min-height: 28pt;
}
.total-bar .total-label { font-size: 10pt; }
.total-bar .total-amount {
  font-size: 14pt;
  font-weight: 700;
}
/* —— Signatures —— */
.signatures {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40pt;
  margin-bottom: auto;
  padding-top: 8pt;
}
.sig-block {
  border-top: 1pt solid #000;
  padding-top: 6pt;
  font-size: 10pt;
}
/* —— Footer —— */
.thanks-footer {
  text-align: center;
  font-size: 12pt;
  margin-top: 24pt;
  padding-top: 12pt;
}
@media print {
  body { margin: 0; }
}
</style>
</head>
<body>
<div class="page">

${renderForezTopHeader(
  FOREZ,
  `<div class="meta-boxes">
    <div class="black-box rma">
      RMA No:
      <span class="rma-value">${rmaNumber}</span>
    </div>
    <div class="black-box date">
      DATE
      <span class="date-value">${dateValue ? escapeHtml(dateValue) : "—"}</span>
    </div>
  </div>`,
)}

<div class="addresses">
  <div class="ship-from">
    <div class="addr-title">Ship From</div>
    <div class="addr-body">${renderAddressLines(data.shipFrom)}</div>
  </div>
  <div class="ship-to">
    <div class="addr-title">Ship To</div>
    <div class="addr-body">${renderAddressLines(data.shipTo)}</div>
  </div>
</div>

<hr class="rule-heavy" />

${trackingHtml}

<table class="items-table">
  <thead>
    <tr>
      <th class="col-desc col-desc-h"></th>
      <th class="col-qty">QTY</th>
      <th class="col-unit">UNIT</th>
      <th class="col-rate">RATE</th>
      <th class="col-amount">AMOUNT</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="bottom">
  <div class="terms">
    ${termsHtml}
    ${notesHtml}
  </div>
  <div class="totals">
    <div class="total-row">
      <span>SUBTOTAL</span>
      <span>${formatMoney(data.subtotal)}</span>
    </div>
    ${
      data.discount != null && data.discount > 0
        ? `<div class="total-row"><span>DISCOUNT</span><span>-${formatMoney(data.discount)}</span></div>`
        : ""
    }
    <div class="total-row">
      <span>TAX</span>
      <span>${formatMoney(data.tax)}</span>
    </div>
    <div class="total-bar">
      <span class="total-label">TOTAL</span>
      <span class="total-amount">${formatMoney(data.total, true)}</span>
    </div>
  </div>
</div>

<div class="signatures">
  <div class="sig-block">Accepted By</div>
  <div class="sig-block">Accepted Date</div>
</div>

<div class="thanks-footer">Thank You For Your Business!!!</div>

</div>
</body>
</html>`;
}

const ESTIMATE_TERMS = [
  "Quotes are valid for 30 days only.",
  "Estimated Lead Time: 5 Business Days, After Order Confirmation.",
];

export function generateForezEstimateHTML(data: EstimateInput): string {
  return renderForezDocumentHTML({
    docKind: "ESTIMATE",
    documentNumber: normalizeForezDocNumber(data.estimateNumber, "estimate"),
    issueDate: data.issueDate,
    shipFrom: data.shipFrom,
    shipTo: data.shipTo,
    items: data.items,
    subtotal: data.subtotal,
    tax: data.tax,
    discount: data.discount,
    total: data.total,
    notes: data.notes,
    trackingNumber: data.trackingNumber,
    termsParagraphs: ESTIMATE_TERMS,
  });
}

/** @deprecated Use `generateForezInvoiceHTML` from `forez-invoice-template.ts` (FC-5234 layout). */
export function generateForezLegacyInvoiceHTML(data: InvoiceInput): string {
  return renderForezDocumentHTML({
    docKind: "INVOICE",
    documentNumber: data.invoiceNumber,
    issueDate: data.issueDate,
    shipFrom: data.shipFrom,
    shipTo: data.shipTo,
    items: data.items,
    subtotal: data.subtotal,
    tax: data.tax,
    discount: data.discount,
    total: data.total,
    notes: data.notes,
    trackingNumber: data.trackingNumber,
    termsParagraphs: data.termsLines ?? [],
  });
}

export function printForezHTML(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

export function printForezEstimate(data: EstimateInput): void {
  printForezHTML(generateForezEstimateHTML(data));
}

export function printForezLegacyInvoice(data: InvoiceInput): void {
  printForezHTML(generateForezLegacyInvoiceHTML(data));
}

