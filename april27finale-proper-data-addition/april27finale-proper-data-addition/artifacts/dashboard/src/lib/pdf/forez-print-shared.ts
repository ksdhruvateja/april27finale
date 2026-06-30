/**
 * Shared print layout — company block, centered logo, right-side doc meta.
 * Used by invoice, quote, PO, return/refund, and estimate templates.
 */

export interface ForezCompanyInfo {
  logo: string;
  name: string;
  line1: string;
  line2: string;
  country: string;
  email: string;
  website: string;
}

export function escapePrintHtml(value?: string | null): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Page shell + true 3-column header (logo centered on the page). */
export const FOREZ_PRINT_LAYOUT_CSS = `
.page {
  width: 8.5in;
  min-height: 11in;
  padding: 0.35in 0.3in 0.4in;
  display: flex;
  flex-direction: column;
}
.top-header {
  display: grid;
  grid-template-columns: 1fr 110pt 1fr;
  align-items: start;
  column-gap: 16pt;
  min-height: 100pt;
  margin-bottom: 6pt;
}
.company-block {
  font-size: 10pt;
  line-height: 1.22;
  padding-top: 2pt;
  justify-self: start;
  align-self: start;
  min-width: 0;
  max-width: 100%;
}
.company-name { font-weight: 700; }
.logo-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 110pt;
  justify-self: center;
  align-self: start;
  padding-top: 2pt;
}
.logo {
  width: 100pt;
  max-width: 100%;
  height: auto;
  object-fit: contain;
  display: block;
  margin: 0 auto;
}
.header-right {
  justify-self: end;
  align-self: start;
  text-align: right;
  padding-top: 2pt;
  min-width: 0;
  max-width: 100%;
}
.doc-title-right {
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.15;
  text-align: right;
  word-break: break-word;
}
.doc-meta-lines { margin-top: 6pt; }
.doc-meta-line {
  font-weight: 700;
  font-size: 10pt;
  line-height: 1.35;
}
.addresses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20pt;
  margin-top: 6pt;
}
.addr-title {
  font-weight: 700;
  font-size: 8pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 6pt;
}
.addr-line { font-size: 10pt; line-height: 1.22; }
.rule-heavy {
  border: none;
  border-top: 1pt solid #000;
  margin: 10pt 0 0;
}
`;

export function renderForezCompanyBlock(company: ForezCompanyInfo): string {
  return `
  <div class="company-block">
    <div class="company-name">${escapePrintHtml(company.name)}</div>
    <div>${escapePrintHtml(company.line1)}</div>
    <div>${escapePrintHtml(company.line2)}</div>
    <div>${escapePrintHtml(company.country)}</div>
    <div>${escapePrintHtml(company.email)}</div>
    <div>${escapePrintHtml(company.website)}</div>
  </div>`;
}

export function renderForezLogo(company: ForezCompanyInfo): string {
  return `
  <div class="logo-wrap">
    <img src="${company.logo}" class="logo" alt="${escapePrintHtml(company.name)}" onerror="this.onerror=null;this.src='/favicon.svg';" />
  </div>`;
}

export function renderForezTopHeader(company: ForezCompanyInfo, rightHtml: string): string {
  return `
<div class="top-header">
  ${renderForezCompanyBlock(company)}
  ${renderForezLogo(company)}
  <div class="header-right">
    ${rightHtml}
  </div>
</div>`;
}
