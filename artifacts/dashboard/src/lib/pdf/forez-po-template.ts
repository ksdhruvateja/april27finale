/**
 * Purchase Order HTML — matches QuickBooks export (`PO_1889` sample).
 */

import { type Address, type LineItem, addressToLines } from "./forez-pdf-template";

export type { Address, LineItem };

export const FOREZ_PO = {
  logo: "/forez-logo.png",
  name: "FOREZ CORP.",
  line1: "2402 Ocean Ave",
  line2: "Ronkonkoma, NY 11779",
  country: "USA",
  email: "admin@forezcorp.com",
  website: "www.forezcorp.com",
};

export interface PurchaseOrderInput {
  poNumber: string;
  issueDate: string;
  vendor: Address;
  shipTo: Address;
  /** Shown under REFERENCE # (e.g. linked invoice / MPLP refs). */
  reference?: string;
  items: LineItem[];
  subtotal: number;
  tax?: number;
  total: number;
  notes?: string;
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

export function generateForezPurchaseOrderHTML(data: PurchaseOrderInput): string {
  const rows = data.items
    .map((item) => {
      const amount = item.quantity * item.rate;
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
  <td class="col-rate">${formatMoney(item.rate)}</td>
  <td class="col-amount">${formatMoney(amount)}</td>
</tr>`;
    })
    .join("");

  const referenceBlock = data.reference?.trim()
    ? `
<div class="reference-block">
  <div class="reference-title">REFERENCE #</div>
  <div class="reference-value">${escapeHtml(data.reference.trim())}</div>
</div>`
    : "";

  const notesHtml = data.notes?.trim()
    ? `<p class="po-notes">${escapeHtml(data.notes.trim())}</p>`
    : "";

  const dateStr = formatDate(data.issueDate);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>PO ${escapeHtml(data.poNumber)}</title>
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
  padding: 0.35in 0.35in 0.45in;
}
.top-header {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  align-items: start;
  gap: 12pt;
  margin-bottom: 6pt;
}
.company-block { font-size: 10pt; line-height: 1.22; }
.company-name { font-weight: 700; }
.logo-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.logo { width: 100pt; height: auto; object-fit: contain; }
.doc-title {
  font-size: 20pt;
  font-weight: 400;
  margin: 8pt 0 14pt;
  letter-spacing: 0.02em;
}
.order-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr;
  gap: 12pt 16pt;
  margin-bottom: 0;
}
.col-label {
  font-weight: 700;
  font-size: 10pt;
  margin-bottom: 6pt;
}
.po-meta {
  text-align: left;
}
.po-meta-line {
  font-weight: 700;
  font-size: 10pt;
  line-height: 1.35;
}
.addr-line { font-size: 10pt; line-height: 1.22; }
.rule-heavy {
  border: none;
  border-top: 1pt solid #000;
  margin: 12pt 0 10pt;
}
.reference-block { margin-bottom: 12pt; }
.reference-title { font-weight: 700; font-size: 10pt; margin-bottom: 4pt; }
.reference-value { font-size: 10pt; line-height: 1.25; }
.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 14pt;
}
.items-table thead tr { background: #ccc; color: #fff; }
.items-table thead th {
  font-weight: 700;
  font-size: 9pt;
  padding: 5pt 6pt;
  text-align: right;
  vertical-align: middle;
}
.items-table thead th.col-desc-h {
  text-align: left;
  background: #ccc;
}
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
.item-details { font-weight: 400; line-height: 1.25; }
.totals-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-bottom: 36pt;
  gap: 4pt;
}
.total-row {
  display: flex;
  justify-content: space-between;
  width: 200pt;
  font-size: 10pt;
  padding: 1pt 0;
}
.total-row.total-grand {
  font-weight: 700;
  margin-top: 4pt;
}
.signatures {
  margin-top: 8pt;
  max-width: 420pt;
}
.sig-row {
  font-size: 8pt;
  margin-bottom: 28pt;
  border-top: 1pt solid #000;
  padding-top: 5pt;
  width: 100%;
}
.po-notes {
  margin-top: 12pt;
  font-size: 10pt;
  line-height: 1.35;
  max-width: 70%;
}
@media print { body { margin: 0; } }
</style>
</head>
<body>
<div class="page">

<div class="top-header">
  <div class="company-block">
    <div class="company-name">${escapeHtml(FOREZ_PO.name)}</div>
    <div>${escapeHtml(FOREZ_PO.line1)}</div>
    <div>${escapeHtml(FOREZ_PO.line2)}</div>
    <div>${escapeHtml(FOREZ_PO.country)}</div>
    <div>${escapeHtml(FOREZ_PO.email)}</div>
    <div>${escapeHtml(FOREZ_PO.website)}</div>
  </div>
  <div class="logo-wrap">
    <img src="${FOREZ_PO.logo}" class="logo" alt="${escapeHtml(FOREZ_PO.name)}" onerror="this.onerror=null;this.src='/favicon.svg';" />
  </div>
</div>

<div class="doc-title">Purchase Order</div>

<div class="order-header">
  <div class="vendor-col">
    <div class="col-label">VENDOR</div>
    <div class="addr-body">${renderAddressLines(data.vendor)}</div>
  </div>
  <div class="ship-col">
    <div class="col-label">SHIP TO</div>
    <div class="addr-body">${renderAddressLines(data.shipTo)}</div>
  </div>
  <div class="po-meta">
    <div class="po-meta-line">P.O. NO. ${escapeHtml(data.poNumber)}</div>
    <div class="po-meta-line">DATE ${dateStr ? escapeHtml(dateStr) : "—"}</div>
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

<div class="totals-wrap">
  <div class="total-row">
    <span>SUBTOTAL</span>
    <span>${formatMoney(data.subtotal)}</span>
  </div>
  ${
    data.tax != null && data.tax > 0
      ? `<div class="total-row"><span>TAX</span><span>${formatMoney(data.tax)}</span></div>`
      : ""
  }
  <div class="total-row total-grand">
    <span>TOTAL</span>
    <span>${formatMoney(data.total, true)}</span>
  </div>
</div>

${notesHtml}

<div class="signatures">
  <div class="sig-row">Approved By</div>
  <div class="sig-row">Date</div>
</div>

</div>
</body>
</html>`;
}

export function printForezPurchaseOrder(data: PurchaseOrderInput): void {
  const html = generateForezPurchaseOrderHTML(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

export function printForezPurchaseOrderHTML(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}
