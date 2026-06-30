/**
 * Return / Refund HTML — Forez-branded printable document.
 */

import { type Address, addressToLines } from "./forez-pdf-template";
import { FOREZ_PRINT_LAYOUT_CSS, renderForezTopHeader } from "./forez-print-shared";

export type { Address };

export const FOREZ_RETURN = {
  logo: "/forez-logo.png",
  name: "FOREZ CORP.",
  line1: "2402 Ocean Ave",
  line2: "Ronkonkoma, NY 11779",
  country: "USA",
  email: "sales@forezcorp.com",
  website: "www.forezcorp.com",
};

export interface ReturnLineItem {
  description: string;
  details?: string;
  quantity: number;
  rate?: number;
  unit?: string;
}

export interface ReturnRefundInput {
  recordNumber: string;
  docTitle: string;
  typeLabel: string;
  issueDate: string;
  customer: Address;
  invoiceNumber?: string | null;
  status: string;
  reason?: string | null;
  refundAmount?: number | null;
  refundMethod?: string | null;
  refundedAt?: string | null;
  items: ReturnLineItem[];
  notes?: string | null;
}

function formatMoney(value: number, withDollar = false) {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return withDollar ? `$${n}` : n;
}

function formatDate(date?: string | null) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value?: string | null) {
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

function detailRow(label: string, value?: string | null) {
  if (!value?.trim()) return "";
  return `
<div class="detail-row">
  <div class="detail-label">${escapeHtml(label)}</div>
  <div class="detail-value">${escapeHtml(value.trim())}</div>
</div>`;
}

export function generateForezReturnRefundHTML(data: ReturnRefundInput): string {
  const dateStr = formatDate(data.issueDate);
  const refundDateStr = formatDate(data.refundedAt);

  const itemRows = data.items
    .map((item) => {
      const amount = item.rate != null ? item.quantity * item.rate : null;
      const detailLines = (item.details ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      return `
<tr class="item-row">
  <td class="col-desc">
    <div class="item-title">${escapeHtml(item.description)}</div>
    ${detailLines.map((l) => `<div class="item-details">${escapeHtml(l)}</div>`).join("")}
  </td>
  <td class="col-qty">${item.quantity}</td>
  <td class="col-unit">${escapeHtml(item.unit ?? "")}</td>
  <td class="col-rate">${item.rate != null ? formatMoney(item.rate) : "—"}</td>
  <td class="col-amount">${amount != null ? formatMoney(amount) : "—"}</td>
</tr>`;
    })
    .join("");

  const itemsTable =
    data.items.length > 0
      ? `
<table class="items-table">
  <thead>
    <tr>
      <th class="col-desc col-desc-h">ITEM</th>
      <th class="col-qty">QTY</th>
      <th class="col-unit">UNIT</th>
      <th class="col-rate">RATE</th>
      <th class="col-amount">AMOUNT</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>`
      : "";

  const refundBlock =
    data.refundAmount != null || data.refundMethod || refundDateStr
      ? `
<div class="refund-block">
  <div class="col-label">REFUND DETAILS</div>
  ${detailRow("Amount", data.refundAmount != null ? formatMoney(data.refundAmount, true) : null)}
  ${detailRow("Method", data.refundMethod)}
  ${detailRow("Refund Date", refundDateStr || null)}
</div>`
      : "";

  const notesHtml = data.notes?.trim()
    ? `<div class="notes-block"><div class="col-label">NOTES</div><p class="doc-notes">${escapeHtml(data.notes.trim())}</p></div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(data.docTitle)} ${escapeHtml(data.recordNumber)}</title>
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
.order-header {
  margin-top: 6pt;
}
.col-label {
  font-weight: 700;
  font-size: 8pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 6pt;
}
.details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8pt 24pt;
  margin-bottom: 14pt;
}
.detail-row { margin-bottom: 6pt; }
.detail-label { font-weight: 700; font-size: 8pt; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 2pt; }
.detail-value { font-size: 10pt; line-height: 1.25; }
.refund-block { margin-bottom: 14pt; }
.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 14pt;
}
.items-table thead tr { background: #ccc; color: #000; }
.items-table thead th {
  font-weight: 700;
  font-size: 9pt;
  padding: 5pt 6pt;
  text-align: right;
  vertical-align: middle;
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
.items-table tbody td.col-unit,
.items-table tbody td.col-rate,
.items-table tbody td.col-amount {
  text-align: right;
}
.item-title { font-weight: 700; margin-bottom: 2pt; }
.item-details { font-weight: 400; line-height: 1.25; }
.notes-block { margin-top: 8pt; margin-bottom: 24pt; }
.doc-notes {
  font-size: 10pt;
  line-height: 1.35;
  max-width: 85%;
  white-space: pre-wrap;
}
.signatures { margin-top: 8pt; max-width: 420pt; }
.sig-row {
  font-size: 8pt;
  margin-bottom: 28pt;
  border-top: 1pt solid #000;
  padding-top: 5pt;
  width: 100%;
}
@media print { body { margin: 0; } }
</style>
</head>
<body>
<div class="page">

${renderForezTopHeader(
  FOREZ_RETURN,
  `<div class="doc-title-right">${escapeHtml(data.docTitle)}</div>
  <div class="doc-meta-lines">
    <div class="doc-meta-line">RMA NO. ${escapeHtml(data.recordNumber)}</div>
    <div class="doc-meta-line">DATE ${dateStr ? escapeHtml(dateStr) : "—"}</div>
    <div class="doc-meta-line">TYPE ${escapeHtml(data.typeLabel)}</div>
  </div>`,
)}

<div class="order-header">
  <div class="customer-col">
    <div class="addr-title">Customer</div>
    <div class="addr-body">${renderAddressLines(data.customer)}</div>
  </div>
</div>

<hr class="rule-heavy" />

<div class="details-grid">
  ${detailRow("Status", data.status.charAt(0).toUpperCase() + data.status.slice(1))}
  ${detailRow("Linked Invoice", data.invoiceNumber)}
  ${detailRow("Reason", data.reason)}
</div>

${refundBlock}
${itemsTable}
${notesHtml}

<div class="signatures">
  <div class="sig-row">Authorized By</div>
  <div class="sig-row">Customer Signature</div>
</div>

</div>
</body>
</html>`;
}

export function printForezReturnRefundHTML(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Could not open print window. Please allow pop-ups for this site and try again.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}
