/**
 * Invoice HTML — matches QuickBooks export (`Invoice FC-5234` sample).
 * Payment link / Stripe block is optional until payment API is wired.
 */

import { type Address, type LineItem, addressToLines } from "./forez-pdf-template";
import { FOREZ_PRINT_LAYOUT_CSS, renderForezTopHeader } from "./forez-print-shared";

export type { Address, LineItem };

export const FOREZ_INVOICE = {
  logo: "/forez-logo.png",
  name: "FOREZ CORP.",
  line1: "2402 Ocean Ave",
  line2: "Ronkonkoma, NY 11779",
  country: "USA",
  email: "sales@forezcorp.com",
  website: "www.forezcorp.com",
};

export interface ForezInvoiceInput {
  /** Display title, e.g. "Invoice FC-5234". */
  invoiceTitle: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  billTo: Address;
  shipTo: Address;
  /** Order confirmation / reference number (trackingNumber or fallback to quoteNumber). */
  reference?: string;
  /** Source quote number — displayed as "QUOTE #" when present. */
  quoteNumber?: string;
  paymentMethod?: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  /** Online pay URL (Stripe etc.) — section still shows layout when false. */
  paymentUrl?: string;
  showPaymentSection?: boolean;
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

export function generateForezInvoiceHTML(data: ForezInvoiceInput): string {
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

  const dateStr = formatDate(data.issueDate);
  const dueStr = formatDate(data.dueDate);
  const pleasePay = formatMoney(data.total, true);
  const notesHtml = data.notes?.trim()
    ? `<p class="terms-line">${escapeHtml(data.notes.trim())}</p>`
    : "";

  const showPay = data.showPaymentSection !== false;
  const paymentBlock = showPay
    ? `
<div class="payment-section">
  <div class="ways-to-pay">Ways to pay</div>
  <div class="pay-amount">${pleasePay}</div>
  <div class="total-due-row">
    <span class="total-due-label">TOTAL DUE</span>
    <span class="thank-you-inline">THANK YOU.</span>
  </div>
  ${
    data.paymentUrl
      ? `<a class="view-and-pay" href="${escapeHtml(data.paymentUrl)}" target="_blank" rel="noopener noreferrer">View and pay</a>`
      : `<div class="view-and-pay view-and-pay--placeholder">View and pay</div>`
  }
</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(data.invoiceTitle)}</title>
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
.meta-band {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: #ccc;
  color: #000;
  margin-top: 10pt;
  font-size: 10pt;
}
.meta-band.three-col { grid-template-columns: 1fr 1fr 1fr; }
.meta-band.two-col { grid-template-columns: 1fr 1fr; margin-top: 0; }
.meta-cell {
  padding: 5pt 8pt;
  border-right: 1pt solid #b0b0b0;
}
.meta-cell:last-child { border-right: none; }
.meta-label { font-weight: 700; font-size: 8pt; letter-spacing: 0.03em; }
.meta-value {
  margin-top: 4pt;
  font-size: 10pt;
  min-height: 12pt;
}
.meta-value.please-pay { font-weight: 700; }
.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-top: 0;
  margin-bottom: 10pt;
}
.items-table thead tr { background: #ccc; color: #000; }
.items-table thead th {
  font-weight: 700;
  font-size: 8pt;
  padding: 5pt 6pt;
  text-align: right;
  letter-spacing: 0.03em;
}
.items-table thead th.col-desc-h { text-align: left; }
.col-desc { width: 48%; }
.col-qty { width: 8%; text-align: right; }
.col-unit { width: 10%; text-align: right; }
.col-rate { width: 14%; text-align: right; }
.col-amount { width: 14%; text-align: right; }
.items-table tbody td {
  font-size: 10pt;
  padding: 5pt 6pt;
  vertical-align: top;
}
.items-table tbody td.col-qty,
.items-table tbody td.col-unit {
  text-align: right;
}
.item-title { font-weight: 700; margin-bottom: 2pt; }
.item-details { line-height: 1.25; }
.bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16pt;
  margin-bottom: 8pt;
}
.terms { flex: 1; max-width: 52%; font-size: 10pt; line-height: 1.35; }
.terms-line { margin: 0 0 4pt; }
.totals { width: 200pt; flex-shrink: 0; font-size: 10pt; }
.total-row {
  display: flex;
  justify-content: space-between;
  padding: 2pt 0;
}
.total-row.total-grand {
  font-weight: 700;
  margin-top: 4pt;
}
.payment-section {
  margin-top: 10pt;
  padding-top: 8pt;
  border-top: 1pt solid #000;
  position: relative;
  min-height: 72pt;
}
.ways-to-pay {
  font-size: 14pt;
  font-weight: 700;
  margin-bottom: 4pt;
}
.pay-amount {
  font-size: 16pt;
  font-weight: 700;
  text-align: right;
  margin-bottom: 6pt;
}
.total-due-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 10pt;
  font-weight: 700;
  margin-bottom: 10pt;
}
.view-and-pay {
  display: inline-block;
  background: rgba(0, 119, 197, 0.85);
  color: #fff;
  font-size: 13pt;
  font-weight: 700;
  padding: 8pt 16pt;
  text-decoration: none;
  border-radius: 2pt;
}
.view-and-pay--placeholder {
  cursor: default;
  opacity: 0.95;
}
.thanks-footer {
  text-align: center;
  font-size: 12pt;
  margin-top: auto;
  padding-top: 16pt;
}
@media print {
  body { margin: 0; }
  .view-and-pay { color: #fff !important; }
}
</style>
</head>
<body>
<div class="page">

${renderForezTopHeader(FOREZ_INVOICE, `<div class="doc-title-right">${escapeHtml(data.invoiceTitle)}</div>`)}

<div class="addresses">
  <div>
    <div class="addr-title">Bill To</div>
    <div>${renderAddressLines(data.billTo)}</div>
  </div>
  <div>
    <div class="addr-title">Ship To</div>
    <div>${renderAddressLines(data.shipTo)}</div>
  </div>
</div>

<div class="meta-band three-col">
  <div class="meta-cell">
    <div class="meta-label">DATE</div>
    <div class="meta-value">${dateStr ? escapeHtml(dateStr) : "—"}</div>
  </div>
  <div class="meta-cell">
    <div class="meta-label">PLEASE PAY</div>
    <div class="meta-value please-pay">${escapeHtml(pleasePay)}</div>
  </div>
  <div class="meta-cell">
    <div class="meta-label">DUE DATE</div>
    <div class="meta-value">${dueStr ? escapeHtml(dueStr) : "—"}</div>
  </div>
</div>

${data.quoteNumber ? `
<div class="meta-band" style="grid-template-columns:1fr 1fr 1fr;">
  <div class="meta-cell">
    <div class="meta-label">ORDER CONFIRMATION #</div>
    <div class="meta-value">${escapeHtml(data.reference ?? "")}</div>
  </div>
  <div class="meta-cell">
    <div class="meta-label">QUOTE #</div>
    <div class="meta-value">${escapeHtml(data.quoteNumber)}</div>
  </div>
  <div class="meta-cell">
    <div class="meta-label">PMT METHOD</div>
    <div class="meta-value">${escapeHtml(data.paymentMethod ?? "ACH")}</div>
  </div>
</div>` : `
<div class="meta-band two-col">
  <div class="meta-cell">
    <div class="meta-label">ORDER CONFIRMATION #</div>
    <div class="meta-value">${escapeHtml(data.reference ?? "")}</div>
  </div>
  <div class="meta-cell">
    <div class="meta-label">PMT METHOD</div>
    <div class="meta-value">${escapeHtml(data.paymentMethod ?? "ACH")}</div>
  </div>
</div>`}

<hr class="rule-heavy" />

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
    <div class="total-row total-grand">
      <span>TOTAL</span>
      <span>${formatMoney(data.total)}</span>
    </div>
  </div>
</div>

${paymentBlock}

<div class="thanks-footer">Thank You For Your Business!!!</div>

</div>
</body>
</html>`;
}

export function printForezInvoice(data: ForezInvoiceInput): void {
  const html = generateForezInvoiceHTML(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}
