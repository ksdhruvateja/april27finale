import { useRef, useState, useEffect } from "react";
import { X, Printer, CheckCircle2, Clock, AlertTriangle, Ban, ShoppingCart, Link2, MapPin } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useListCustomers } from "@workspace/api-client-react";
import { useCompanyProfile } from "@/lib/companyProfile";
const forézLogo = "/forez-logo.png";

interface CompanyAddress {
  id: string; name: string;
  line1: string; line2?: string;
  city: string; state: string; zip: string;
  phone?: string;
}

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
  /** Override the overlay z-index (default "z-50"). Pass e.g. "z-[100]" when opened above another overlay. */
  overlayZIndex?: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  paid:      { label: "Paid",      icon: <CheckCircle2 size={14} />, bg: "bg-lime/10",       text: "text-lime",        border: "border-lime/30" },
  sent:      { label: "Sent",      icon: <Clock size={14} />,        bg: "bg-blue-400/10",   text: "text-blue-300",    border: "border-blue-400/30" },
  pending:   { label: "Pending",   icon: <Clock size={14} />,        bg: "bg-amber-400/10",  text: "text-amber-300",   border: "border-amber-400/30" },
  draft:     { label: "Draft",     icon: <Clock size={14} />,        bg: "bg-white/8",       text: "text-white/60",    border: "border-white/15" },
  overdue:   { label: "Overdue",   icon: <AlertTriangle size={14} />,bg: "bg-red-500/10",    text: "text-red-400",     border: "border-red-400/30" },
  cancelled: { label: "Cancelled", icon: <Ban size={14} />,          bg: "bg-white/5",       text: "text-white/40",    border: "border-white/10" },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe:         "Credit Card (Stripe)",
  bank_transfer:  "Bank Transfer",
  check:          "Check",
  cash:           "Cash",
};

// BUSINESS is now loaded dynamically via useCompanyProfile() inside the component

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const nl2br = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br/>");

export default function InvoiceView({ invoice, onClose, onMarkPaid, onMarkPending, onCreatePO, overlayZIndex = "z-50" }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: customers } = useListCustomers();
  const profile = useCompanyProfile();
  const [companyAddresses, setCompanyAddresses] = useState<CompanyAddress[]>([]);
  const [addrPickerOpen, setAddrPickerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/app-settings/company_addresses")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) { try { setCompanyAddresses(JSON.parse(d.value)); } catch {} } });
  }, []);

  const customer = customers?.find((c: any) => c.id === invoice.customerId) as any;
  const addr = customer?.shippingAddress ?? customer?.billingAddress;

  const effectiveInvoiceNum = invoice.invoiceNumber ?? `FRZI - ${Math.max(5100, 5099 + Number(invoice.id ?? 0))}`;
  const status = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft;
  const isOverdue = invoice.status === "sent" && invoice.dueDate && new Date(invoice.dueDate) < new Date();

  function buildPrintHTML(fromAddr?: CompanyAddress | null) {
    const badgeClass = isOverdue ? "overdue" : invoice.status;
    const badgeLabel = isOverdue ? "Overdue" : (status.label);
    const from = fromAddr ?? null;
    const fromLine1 = from?.line1 ?? profile.line1;
    const fromLine2 = from ? `${from.city}${from.state ? `, ${from.state}` : ""}${from.zip ? ` ${from.zip}` : ""}` : profile.line2;
    const fromName  = from?.name ?? profile.name;
    const fromPhone = from?.phone ?? null;
    const logoSrc   = profile.logo ?? forézLogo;

    const customerAddrHTML = (() => {
      const parts: string[] = [];
      if (addr?.line1) parts.push(`<div class="addr">${addr.line1}${addr.line2 ? `<br/>${addr.line2}` : ""}${addr.city ? `<br/>${addr.city}${addr.state ? `, ${addr.state}` : ""}${addr.zip ? ` ${addr.zip}` : ""}` : ""}</div>`);
      return parts.join("");
    })();

    const lineItemsHTML = (invoice.lineItems as LineItem[]).map(item => {
      const amount = item.quantity * item.unitPrice;
      return `
        <tr>
          <td>
            <div class="item-name">${item.description ? nl2br(item.description) : "—"}</div>
            ${item.lineDescription ? `<div class="item-desc">${nl2br(item.lineDescription)}</div>` : ""}
          </td>
          <td>${item.sku ? `<span class="item-sku">${item.sku}</span>` : `<span class="muted">—</span>`}</td>
          <td class="right">${item.quantity}</td>
          <td>${item.unit || "ea"}</td>
          <td class="right">${formatCurrency(item.unitPrice)}</td>
          <td class="right item-amount">${formatCurrency(amount)}</td>
        </tr>`;
    }).join("");

    const paymentHTML = invoice.paidAt && invoice.paymentMethod ? `
      <div class="payment-info">
        <div class="info-label">✓ Payment Received</div>
        <p>${PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod} on ${formatDate(invoice.paidAt)}${invoice.paymentNote ? ` — ${invoice.paymentNote}` : ""}</p>
      </div>` : "";

    const notesHTML = invoice.notes ? `
      <div class="notes-block">
        <div class="info-label">Notes</div>
        <p>${invoice.notes}</p>
      </div>` : "";

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Invoice ${effectiveInvoiceNum} — ${profile.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:#fff;color:#1a1a2e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{padding:48px 56px;max-width:860px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px}
  .logo-block{display:flex;align-items:center;gap:14px}
  .logo-svg{width:46px;height:46px;border-radius:10px;object-fit:contain;flex-shrink:0;display:block}
  .company-name{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#0d1f3c;line-height:1}
  .company-tagline{font-size:10px;color:#9ca3af;letter-spacing:2.5px;text-transform:uppercase;margin-top:4px}
  .inv-title-block{text-align:right}
  .inv-title{font-size:38px;font-weight:900;letter-spacing:-2px;color:#0d1f3c;line-height:1}
  .inv-num{font-size:14px;font-weight:700;color:#6b7280;margin-top:5px;letter-spacing:0.5px}
  .status-badge{display:inline-block;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;margin-top:8px;letter-spacing:0.5px}
  .badge-paid{background:#d1fae5;color:#065f46}
  .badge-sent{background:#dbeafe;color:#1e40af}
  .badge-pending{background:#fef3c7;color:#92400e}
  .badge-overdue{background:#fee2e2;color:#991b1b}
  .badge-draft{background:#f3f4f6;color:#6b7280}
  .badge-cancelled{background:#f3f4f6;color:#6b7280}
  .ref-pill{display:inline-flex;align-items:center;gap:5px;margin-top:8px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;padding:3px 10px;font-size:11px}
  .ref-pill .rl{color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .ref-pill .rv{color:#4338ca;font-weight:700;font-family:monospace}
  .divider{border:none;border-top:1px solid #e5e7eb;margin:28px 0}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-bottom:28px}
  .info-block h4{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:10px;font-weight:600}
  .info-block .biz-name{font-size:15px;font-weight:700;color:#0d1f3c;margin-bottom:5px}
  .info-block .addr{font-size:12px;color:#6b7280;line-height:1.8}
  .info-block .contact-row{font-size:12px;color:#6b7280;line-height:1.9}
  .dates-row{display:flex;gap:16px;margin-bottom:32px}
  .date-chip{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:13px 16px}
  .date-chip .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;margin-bottom:5px;font-weight:600}
  .date-chip .val{font-size:13px;font-weight:600;color:#111827}
  .date-chip.alert{border-color:#fca5a5;background:#fef2f2}
  .date-chip.alert .val{color:#dc2626}
  .date-chip.paid-chip{border-color:#6ee7b7;background:#ecfdf5}
  .date-chip.paid-chip .val{color:#059669}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  thead tr{background:#f9fafb;border-bottom:2px solid #e5e7eb}
  th{text-align:left;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;font-weight:600}
  th.right{text-align:right}
  td{padding:13px 14px;font-size:14px;border-bottom:1px solid #f3f4f6;vertical-align:top;color:#374151}
  td.right{text-align:right}
  .item-name{font-weight:600;font-size:14px;color:#111827;margin-bottom:2px;white-space:pre-wrap}
  .item-desc{font-size:12px;color:#9ca3af;margin-top:2px}
  .item-sku{font-size:11px;font-family:monospace;color:#9ca3af;background:#f3f4f6;padding:2px 6px;border-radius:4px}
  .item-amount{font-weight:700;color:#111827}
  .muted{color:#d1d5db}
  .totals-section{display:flex;justify-content:flex-end;margin-top:8px}
  .totals-box{width:300px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
  .total-row{display:flex;justify-content:space-between;padding:10px 18px;font-size:13px;border-bottom:1px solid #f3f4f6}
  .total-row .tl{color:#6b7280}
  .total-row .tv{font-weight:600;color:#111827}
  .total-row.discount .tv{color:#dc2626}
  .grand-total{display:flex;justify-content:space-between;align-items:center;padding:15px 18px;background:#0d1f3c}
  .grand-total .gl{font-size:14px;font-weight:700;color:#fff}
  .grand-total .gv{font-size:20px;font-weight:900;color:#c8ff00}
  .info-label{font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600;margin-bottom:6px}
  .payment-info{margin-top:28px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px}
  .payment-info .info-label{color:#16a34a}
  .payment-info p{font-size:12px;color:#166534}
  .notes-block{margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px}
  .notes-block .info-label{color:#b45309}
  .notes-block p{font-size:12px;color:#78350f;line-height:1.7}
  .footer{margin-top:48px;padding-top:20px;border-top:2px solid #0d1f3c;display:flex;justify-content:space-between;align-items:flex-end}
  .footer-logo{display:flex;align-items:center;gap:8px;margin-bottom:5px}
  .footer-logo-badge{width:22px;height:22px;border-radius:5px;object-fit:contain;display:block}
  .footer-co{font-size:13px;font-weight:700;color:#0d1f3c}
  .footer-addr{font-size:11px;color:#9ca3af;line-height:1.7}
  .footer-right{text-align:right}
  .footer-thanks{font-size:13px;font-weight:600;color:#374151}
  .footer-terms{font-size:10px;color:#9ca3af;margin-top:3px}
  @media print{body{padding:0}@page{margin:36px;size:A4}}
</style></head>
<body><div class="page">

  <div class="header">
    <div class="logo-block">
      <img src="${logoSrc}" alt="${profile.name}" class="logo-svg" />
      <div>
        <div class="company-name">${profile.name}</div>
        <div class="company-tagline">${profile.tagline}</div>
      </div>
    </div>
    <div class="inv-title-block">
      <div class="inv-title">INVOICE</div>
      <div class="inv-num">${effectiveInvoiceNum}</div>
      <div><span class="status-badge badge-${badgeClass}">${badgeLabel}</span></div>
      ${invoice.trackingNumber ? `<div><div class="ref-pill"><span class="rl">Ref&nbsp;</span><span class="rv">${invoice.trackingNumber}</span></div></div>` : ""}
    </div>
  </div>

  <hr class="divider"/>

  <div class="info-grid">
    <div class="info-block">
      <h4>From</h4>
      <div class="biz-name">${fromName}</div>
      <div class="addr">${fromLine1}<br/>${fromLine2}</div>
      ${fromPhone ? `<div class="contact-row" style="margin-top:6px">📞 ${fromPhone}</div>` : ""}
      <div class="contact-row">🌐 ${BUSINESS.website}</div>
    </div>
    <div class="info-block">
      <h4>Bill To</h4>
      <div class="biz-name">${invoice.customerName ?? "—"}</div>
      ${customerAddrHTML}
    </div>
  </div>

  <div class="dates-row">
    <div class="date-chip">
      <div class="lbl">Issue Date</div>
      <div class="val">${formatDate(invoice.createdAt)}</div>
    </div>
    ${invoice.dueDate ? `<div class="date-chip${isOverdue ? " alert" : ""}"><div class="lbl">Due Date</div><div class="val">${formatDate(invoice.dueDate)}</div></div>` : ""}
    ${invoice.paidAt ? `<div class="date-chip paid-chip"><div class="lbl">Paid On</div><div class="val">${formatDate(invoice.paidAt)}</div></div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Item / Description</th>
        <th>SKU</th>
        <th class="right">Qty</th>
        <th>Unit</th>
        <th class="right">Unit Price</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>${lineItemsHTML}</tbody>
  </table>

  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row"><span class="tl">Subtotal</span><span class="tv">${formatCurrency(invoice.subtotal)}</span></div>
      ${invoice.discountTotal > 0 ? `<div class="total-row discount"><span class="tl">Discount</span><span class="tv">−${formatCurrency(invoice.discountTotal)}</span></div>` : ""}
      <div class="total-row"><span class="tl">Tax</span><span class="tv">${formatCurrency(invoice.taxTotal)}</span></div>
      <div class="grand-total"><span class="gl">Total Due</span><span class="gv">${formatCurrency(invoice.total)}</span></div>
    </div>
  </div>

  ${paymentHTML}
  ${notesHTML}

  <div class="footer">
    <div>
      <div class="footer-logo">
        <img src="${logoSrc}" alt="${profile.name}" class="footer-logo-badge" />
        <div class="footer-co">${profile.name}</div>
      </div>
      <div class="footer-addr">
        ${fromLine1} · ${fromLine2}${fromPhone ? `<br/>${fromPhone}` : ""}
      </div>
    </div>
    <div class="footer-right">
      <div class="footer-thanks">Thank you for your business!</div>
      <div class="footer-terms">Payment due within 30 days of invoice date.</div>
    </div>
  </div>

</div></body></html>`;
  }

  function doPrint(fromAddr?: CompanyAddress | null) {
    const html = buildPrintHTML(fromAddr);
    const w = window.open("", "_blank", "width=960,height=800");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  }

  function handlePrint() {
    if (companyAddresses.length >= 1) {
      setAddrPickerOpen(true);
    } else {
      doPrint(null);
    }
  }

  return (
    <>
    {addrPickerOpen && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setAddrPickerOpen(false)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={16} className="text-slate-600" />
            <h3 className="text-slate-900 font-bold text-base">Choose Print Address</h3>
          </div>
          <div className="flex flex-col gap-2">
            {companyAddresses.map(a => (
              <button key={a.id} onClick={() => { setAddrPickerOpen(false); doPrint(a); }}
                className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br/>{[a.city,a.state,a.zip].filter(Boolean).join(", ")}</p>
              </button>
            ))}
            <button onClick={() => { setAddrPickerOpen(false); doPrint(null); }}
              className="text-left px-4 py-3 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors">
              <p className="text-sm font-semibold text-slate-500">Use profile default address</p>
            </button>
          </div>
          <button onClick={() => setAddrPickerOpen(false)} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
        </div>
      </div>
    )}
    <div className={`fixed inset-0 ${overlayZIndex} flex items-center justify-center p-4`} onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950" />
      <div
        className="relative z-10 w-full max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-hide rounded-2xl border border-white/12"
        style={{ background: "#0c0c10" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b border-white/8"
          style={{ background: "#0c0c10" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center p-0.5">
              <img src={profile.logo ?? forézLogo} alt={profile.name} className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base">{effectiveInvoiceNum}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                  {status.icon}
                  {isOverdue ? "Overdue" : status.label}
                </span>
              </div>
              <p className="text-white/40 text-xs">{profile.name} · {profile.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onCreatePO && (
              <button onClick={onCreatePO} className="flex items-center gap-1.5 text-xs font-semibold bg-amber-400/10 border border-amber-400/30 text-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-400/20 transition-colors">
                <ShoppingCart size={13} /> Create PO(s)
              </button>
            )}
            {invoice.status !== "pending" && invoice.status !== "paid" && invoice.status !== "cancelled" && onMarkPending && (
              <button onClick={() => onMarkPending(invoice.id)} className="flex items-center gap-1.5 text-xs font-semibold bg-amber-400/10 border border-amber-400/30 text-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-400/20 transition-colors">
                <CheckCircle2 size={13} /> Mark Pending
              </button>
            )}
            {invoice.status !== "paid" && invoice.status !== "cancelled" && onMarkPaid && (
              <button onClick={() => onMarkPaid(invoice.id)} className="flex items-center gap-1.5 text-xs font-semibold bg-lime/10 border border-lime/30 text-lime px-3 py-1.5 rounded-lg hover:bg-lime/20 transition-colors">
                <CheckCircle2 size={13} /> Mark Paid
              </button>
            )}
            <button onClick={handlePrint} className="flex items-center gap-1.5 text-xs font-semibold bg-white/8 border border-white/10 text-white/80 px-3 py-1.5 rounded-lg hover:bg-white/12 transition-colors">
              <Printer size={13} /> Print / PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Invoice Body */}
        <div ref={printRef} className="px-8 py-6 flex flex-col gap-6">

          {/* From / To */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-white/35 text-[10px] uppercase tracking-widest mb-2">From</p>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-6 h-6 rounded-md overflow-hidden bg-white flex items-center justify-center p-0.5">
                  <img src={profile.logo ?? forézLogo} alt={profile.name} className="w-full h-full object-contain" />
                </div>
                <span className="text-white font-bold text-sm">{profile.name}</span>
              </div>
              <p className="text-white/45 text-xs leading-relaxed">
                {profile.line1}<br />
                {profile.line2}<br />
                📞 {profile.phone}<br />
                ✉ {profile.email}
              </p>
            </div>
            <div>
              <p className="text-white/35 text-[10px] uppercase tracking-widest mb-2">Bill To</p>
              <p className="text-white font-bold text-sm mb-1">{invoice.customerName ?? "—"}</p>
              {customer?.email && <p className="text-white/45 text-xs">✉ {customer.email}</p>}
              {customer?.phone && <p className="text-white/45 text-xs">📞 {customer.phone}</p>}
              {addr && (
                <p className="text-white/45 text-xs leading-relaxed mt-1">
                  {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />
                  {[addr.city, addr.state, addr.zip].filter(Boolean).join(", ")}
                </p>
              )}
              {invoice.paymentMethod && (
                <div className="inline-flex items-center gap-1.5 mt-2 bg-white/6 border border-white/10 rounded-md px-2.5 py-1">
                  <span className="text-white/40 text-[10px] uppercase tracking-wider">Paid via</span>
                  <span className="text-white/80 text-xs font-medium">{PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod}</span>
                </div>
              )}
            </div>
          </div>

          {/* Order ref + dates */}
          {invoice.trackingNumber && (
            <div className="flex items-center gap-2">
              <Link2 size={12} className="text-indigo-400" />
              <span className="text-indigo-300 text-xs font-semibold">Order Reference:</span>
              <span className="text-indigo-200 text-xs font-mono">{invoice.trackingNumber}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <MetaChip label="Invoice Date" value={formatDate(invoice.createdAt)} />
            <MetaChip label="Due Date" value={formatDate(invoice.dueDate)} alert={!!isOverdue} />
            {invoice.paidAt && <MetaChip label="Paid On" value={formatDate(invoice.paidAt)} positive />}
          </div>

          <div className="h-px bg-white/8" />

          {/* Line Items */}
          <div>
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left pb-3 pr-5 text-white/35 text-xs uppercase tracking-widest font-medium">Description</th>
                  <th className="text-left pb-3 pl-5 text-white/35 text-xs uppercase tracking-widest font-medium w-24 border-l border-white/10">SKU</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-12">Qty</th>
                  <th className="text-left pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-14">Unit</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-28">Unit Price</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.lineItems as LineItem[]).map((item, i) => {
                  const amount = item.quantity * item.unitPrice;
                  return (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-3.5 pr-5">
                        <div className="text-white text-base font-semibold whitespace-pre-wrap">{item.description}</div>
                        {item.lineDescription && (
                          <div className="text-white/45 text-[15px] mt-1 whitespace-pre-wrap">{item.lineDescription}</div>
                        )}
                      </td>
                      <td className="py-3.5 pl-5 border-l border-white/10">
                        {item.sku
                          ? <span className="font-mono text-sm text-white/60 bg-white/10 px-2 py-1 rounded">{item.sku}</span>
                          : <span className="text-white/20">—</span>}
                      </td>
                      <td className="py-3 text-right text-white/60">{item.quantity}</td>
                      <td className="py-3 text-white/50 text-xs">{item.unit || "ea"}</td>
                      <td className="py-3 text-right text-white/70">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-3 text-right text-white font-semibold">{formatCurrency(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 flex flex-col gap-0 bg-white/4 border border-white/8 rounded-xl overflow-hidden">
              <TotalRow label="Subtotal" value={formatCurrency(invoice.subtotal)} />
              {invoice.discountTotal > 0 && (
                <TotalRow label="Discount" value={`−${formatCurrency(invoice.discountTotal)}`} accent="text-red-400" />
              )}
              <TotalRow label="Tax" value={formatCurrency(invoice.taxTotal)} />
              <div className="flex justify-between items-center px-4 py-3.5 bg-[#0d1f3c]">
                <span className="text-white font-bold text-sm">Total Due</span>
                <span className="text-[#c8ff00] font-black text-lg">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="bg-blue-900/40 border border-blue-400/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <p className="text-blue-300 text-[10px] font-bold uppercase tracking-widest">Customer Notes</p>
              </div>
              <p className="text-blue-100 text-sm leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {invoice.internalNote && (
            <div className="bg-amber-400/15 border-2 border-amber-400/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <p className="text-amber-300 text-[10px] font-bold uppercase tracking-widest">⚠ Internal Note — Staff Only</p>
              </div>
              <p className="text-amber-100 text-sm leading-relaxed whitespace-pre-wrap">{invoice.internalNote}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-white/8">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-[#0d1f3c] flex items-center justify-center">
                <span className="text-[#c8ff00] font-black text-[8px]">FC</span>
              </div>
              <span className="text-white/30 text-xs">{profile.name} · {profile.tagline}</span>
            </div>
            <span className="text-white/25 text-xs">Thank you for your business</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function MetaChip({ label, value, positive, alert }: { label: string; value: string; positive?: boolean; alert?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${alert ? "bg-red-500/8 border-red-400/20" : "bg-white/4 border-white/8"}`}>
      <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-sm font-semibold ${alert ? "text-red-400" : positive ? "text-lime" : "text-white"}`}>{value}</p>
    </div>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-2.5 border-b border-white/6">
      <span className="text-white/50 text-sm">{label}</span>
      <span className={`text-sm font-semibold ${accent ?? "text-white/80"}`}>{value}</span>
    </div>
  );
}
