/**
 * Quote / Sales Order HTML — matches QuickBooks `Order_5236` (Order Confirmation) export.
 */

import { type Address, type LineItem, addressToLines } from "./forez-pdf-template";

export type { Address, LineItem };

export const FOREZ_QUOTE = {
  logo: "/forez-logo.png",
  name: "FOREZ CORP.",
  line1: "2402 Ocean Ave",
  line2: "Ronkonkoma, NY 11779",
  country: "USA",
  email: "sales@forezcorp.com",
  website: "www.forezcorp.com",
};

export interface QuoteOrderInput {
  quoteNumber: string;
  /** Shown in header black box, e.g. "Order Confirmation 5236". */
  orderConfirmationTitle: string;
  issueDate: string;
  address: Address;
  shipTo: Address;
  reference?: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  leadTimeDays?: number;
  acceptedBy?: string;
  acceptedDate?: string;
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

export function generateForezQuoteOrderHTML(data: QuoteOrderInput): string {
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
  const leadDays = data.leadTimeDays ?? 10;

  const referenceBlock = data.reference?.trim()
    ? `
<div class="reference-block">
  <div class="reference-title">REFERENCE #</div>
  <div class="reference-value">${escapeHtml(data.reference.trim())}</div>
</div>`
    : "";

  const notesHtml = data.notes?.trim()
    ? `<p class="terms-line"><strong>Notes:</strong> ${escapeHtml(data.notes.trim())}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(data.orderConfirmationTitle)}</title>
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
.page {
  width: 8.5in;
  min-height: 11in;
  padding: 0.25in 0.25in 0.4in;
  display: flex;
  flex-direction: column;
}
.top-header {
  display: grid;
  grid-template-columns: 1fr 1.35fr 1fr;
  align-items: start;
  gap: 8pt;
  min-height: 108pt;
  margin-bottom: 6pt;
}
.company-block { font-size: 10pt; line-height: 1.22; padding-top: 2pt; }
.company-name { font-weight: 700; }
.logo-wrap { display: flex; justify-content: center; align-items: flex-start; padding-top: 2pt; }
.logo { width: 108pt; height: auto; object-fit: contain; }
.meta-boxes { display: flex; flex-direction: column; gap: 7pt; }
.black-box {
  background: #000;
  color: #fff;
  min-height: 27pt;
  padding: 6pt 8pt;
  font-size: 10pt;
  line-height: 1.2;
}
.black-box.order-title {
  font-size: 11pt;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.black-box.date-box { font-weight: 700; }
.addresses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24pt;
  margin-top: 8pt;
}
.addr-title { font-weight: 700; font-size: 10pt; margin-bottom: 6pt; }
.addr-line { font-size: 10pt; line-height: 1.22; }
.rule-heavy {
  border: none;
  border-top: 1pt solid #000;
  margin: 12pt 0 10pt;
}
.reference-block { margin-bottom: 12pt; }
.reference-title { font-weight: 700; font-size: 10pt; margin-bottom: 4pt; }
.reference-value { font-size: 10pt; }
.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 12pt;
}
.items-table thead tr { background: #000; color: #fff; }
.items-table thead th {
  font-weight: 700;
  font-size: 9pt;
  padding: 5pt 6pt;
  text-align: right;
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
  border-bottom: 1pt solid #e8e8e8;
}
.items-table tbody td.col-qty,
.items-table tbody td.col-unit {
  text-align: right;
}
.items-table tbody tr:last-child td { border-bottom: 1pt solid #000; }
.item-title { font-weight: 700; margin-bottom: 2pt; }
.item-details { line-height: 1.25; }
.bottom {
  display: flex;
  justify-content: space-between;
  gap: 20pt;
  margin-bottom: 28pt;
}
.terms { flex: 1; max-width: 52%; font-size: 10pt; line-height: 1.35; }
.terms-line { margin: 0 0 4pt; }
.totals { width: 240pt; flex-shrink: 0; font-size: 10pt; }
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
.total-bar .total-amount { font-size: 14pt; font-weight: 700; }
.signatures-row {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  gap: 8pt 24pt;
  align-items: end;
  font-size: 10pt;
  margin-bottom: auto;
  max-width: 100%;
}
.sig-value {
  border-bottom: 1pt solid #000;
  min-height: 14pt;
  padding-bottom: 2pt;
}
.thanks-footer {
  text-align: center;
  font-size: 12pt;
  margin-top: 24pt;
  padding-top: 12pt;
}
@media print { body { margin: 0; } }
</style>
</head>
<body>
<div class="page">

<div class="top-header">
  <div class="company-block">
    <div class="company-name">${escapeHtml(FOREZ_QUOTE.name)}</div>
    <div>${escapeHtml(FOREZ_QUOTE.line1)}</div>
    <div>${escapeHtml(FOREZ_QUOTE.line2)}</div>
    <div>${escapeHtml(FOREZ_QUOTE.country)}</div>
    <div>${escapeHtml(FOREZ_QUOTE.email)}</div>
    <div>${escapeHtml(FOREZ_QUOTE.website)}</div>
  </div>
  <div class="logo-wrap">
    <img src="${FOREZ_QUOTE.logo}" class="logo" alt="${escapeHtml(FOREZ_QUOTE.name)}" onerror="this.onerror=null;this.src='/favicon.svg';" />
  </div>
  <div class="meta-boxes">
    <div class="black-box order-title">${escapeHtml(data.orderConfirmationTitle)}</div>
    <div class="black-box date-box">DATE ${dateStr ? escapeHtml(dateStr) : "—"}</div>
  </div>
</div>

<div class="addresses">
  <div>
    <div class="addr-title">ADDRESS</div>
    <div>${renderAddressLines(data.address)}</div>
  </div>
  <div>
    <div class="addr-title">SHIP TO</div>
    <div>${renderAddressLines(data.shipTo)}</div>
  </div>
</div>

<hr class="rule-heavy" />

${referenceBlock}

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
    <p class="terms-line">Quotes are valid for 30 days only.</p>
    <p class="terms-line">Estimated Lead Time: ${leadDays} Business Days, After</p>
    <p class="terms-line">Order Confirmation.</p>
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
      <span>TOTAL</span>
      <span class="total-amount">${formatMoney(data.total, true)}</span>
    </div>
  </div>
</div>

<div class="signatures-row">
  <span>Accepted By</span>
  <span class="sig-value">${data.acceptedBy ? escapeHtml(data.acceptedBy) : ""}</span>
  <span>Accepted Date</span>
  <span class="sig-value">${data.acceptedDate ? escapeHtml(data.acceptedDate) : ""}</span>
</div>

<div class="thanks-footer">Thank You For Your Business!!!</div>

</div>
</body>
</html>`;
}

export function printForezQuoteOrderHTML(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}
