import { useRef, useState, useEffect } from "react";
import { X, Printer, CheckCircle2, Clock, AlertTriangle, Ban, ShoppingCart, Link2, MapPin, CreditCard, Plus } from "lucide-react";
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
  onApplyCredit?: () => void;
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

export default function InvoiceView({ invoice, onClose, onMarkPaid, onMarkPending, onCreatePO, onApplyCredit, overlayZIndex = "z-50" }: Props) {
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

  const [credits, setCredits] = useState<any[]>([]);
  useEffect(() => {
    if (!invoice.id) return;
    fetch(`/api/returns-refunds?invoiceId=${invoice.id}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setCredits(data.filter((c: any) => Number(c.refundAmount) > 0)))
      .catch(() => {});
  }, [invoice.id]);
  const creditTotal = credits.reduce((sum, c) => sum + Number(c.refundAmount || 0), 0);

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
      if (!addr?.line1) return "";
      const lines = [addr.line1];
      if (addr.line2) lines.push(addr.line2);
      if (addr.city) lines.push([addr.city, addr.state, addr.zip].filter(Boolean).join(", "));
      return lines.join("<br/>");
    })();

    const lineItemsHTML = (invoice.lineItems as LineItem[]).map(item => {
      const amount = item.quantity * item.unitPrice;
      return `
        <tr>
          <td>
            <div class="iname">${item.description ? nl2br(item.description) : "—"}</div>
            ${item.lineDescription ? `<div class="idesc">${nl2br(item.lineDescription)}</div>` : ""}
          </td>
          <td>${item.sku ? `<span class="isku">${item.sku}</span>` : `<span style="color:#d1d5db">—</span>`}</td>
          <td class="r">${item.quantity}</td>
          <td style="color:#9ca3af">${item.unit || "ea"}</td>
          <td class="r">${formatCurrency(item.unitPrice)}</td>
          <td class="r iamt">${formatCurrency(amount)}</td>
        </tr>`;
    }).join("");

    const paymentHTML = invoice.paidAt && invoice.paymentMethod ? `
      <div class="info-box pay-box">
        <div class="info-box-lbl">✓ Payment Received</div>
        <p>${PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod} on ${formatDate(invoice.paidAt)}${invoice.paymentNote ? ` — ${invoice.paymentNote}` : ""}</p>
      </div>` : "";

    const notesHTML = invoice.notes ? `
      <div class="info-box notes-box">
        <div class="info-box-lbl">Notes</div>
        <p>${nl2br(invoice.notes)}</p>
      </div>` : "";

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Invoice ${effectiveInvoiceNum} — ${profile.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px;line-height:1.5}
  .page{max-width:860px;margin:0 auto;padding:36px 48px}
  .doc-hdr{text-align:center;padding-bottom:18px;border-bottom:2.5px solid #0d2044;margin-bottom:0}
  .co-logo{width:80px;height:80px;object-fit:contain;border-radius:10px;display:block;margin:0 auto 10px}
  .co-name{font-size:21px;font-weight:800;color:#0d2044;letter-spacing:-0.3px;line-height:1.2}
  .co-addr{font-size:11px;color:#6b7280;margin-top:5px;line-height:1.65}
  .doc-meta{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 0 20px;border-bottom:1px solid #e5e7eb;margin-bottom:24px}
  .doc-type{font-size:28px;font-weight:900;color:#0d2044;letter-spacing:-0.5px;line-height:1}
  .doc-right{text-align:right}
  .mrow{display:flex;justify-content:flex-end;align-items:baseline;gap:14px;line-height:2.1}
  .mlbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .mval{font-size:12.5px;font-weight:700;color:#111827;min-width:110px;text-align:right}
  .mval.alert{color:#dc2626}
  .mval.ok{color:#059669}
  .spill{display:inline-block;margin-top:8px;padding:3px 11px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase}
  .s-paid{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0}
  .s-sent{background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe}
  .s-pending{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
  .s-overdue{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}
  .s-draft{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb}
  .s-cancelled{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb}
  .addr-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .addr-block{padding:14px 16px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa}
  .addr-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #efefef}
  .addr-name{font-size:13.5px;font-weight:700;color:#0d2044;margin-bottom:3px}
  .addr-text{font-size:11.5px;color:#6b7280;line-height:1.75}
  table.items{width:100%;border-collapse:collapse;margin-bottom:6px}
  table.items thead tr{background:#0d2044}
  table.items th{padding:10px 13px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.85);text-align:left}
  table.items th.r{text-align:right}
  table.items tbody tr{border-bottom:1px solid #f3f4f6}
  table.items tbody tr:last-child{border-bottom:2px solid #e5e7eb}
  table.items td{padding:11px 13px;font-size:12.5px;color:#374151;vertical-align:top}
  table.items td.r{text-align:right}
  .iname{font-weight:600;color:#111827;margin-bottom:2px}
  .idesc{font-size:11px;color:#9ca3af;margin-top:3px;line-height:1.5}
  .isku{display:inline-block;font-size:10px;font-family:'Courier New',monospace;color:#9ca3af;background:#f3f4f6;padding:1px 5px;border-radius:3px}
  .iamt{font-weight:700;color:#111827}
  .tot-wrap{display:flex;justify-content:flex-end;margin:10px 0 24px}
  .tot-inner{width:270px}
  .tot-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:12.5px;border-bottom:1px solid #f3f4f6}
  .tot-lbl{color:#6b7280}
  .tot-val{font-weight:600;color:#111827}
  .tot-val.disc{color:#dc2626}
  .tot-val.cr{color:#059669}
  .grand-row{display:flex;justify-content:space-between;align-items:center;background:#0d2044;border-radius:5px;padding:13px 16px;margin-top:8px}
  .grand-lbl{font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.5px}
  .grand-val{font-size:22px;font-weight:900;color:#fff}
  .info-box{padding:13px 16px;border-radius:6px;margin-top:16px}
  .info-box-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px}
  .pay-box{background:#f0fdf4;border:1px solid #bbf7d0}
  .pay-box .info-box-lbl{color:#15803d}
  .pay-box p{font-size:12px;color:#166534;line-height:1.6}
  .notes-box{background:#fffbeb;border:1px solid #fde68a}
  .notes-box .info-box-lbl{color:#b45309}
  .notes-box p{font-size:12px;color:#78350f;line-height:1.75}
  .doc-footer{margin-top:40px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
  .foot-l,.foot-r{font-size:10px;color:#9ca3af}
  @media print{body{padding:0}#ptoolbar,#ptoolbar-spacer{display:none!important}@page{margin:22px 36px;size:A4}}
</style></head>
<body>
  <div id="ptoolbar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1e293b;color:#f1f5f9;display:flex;align-items:center;gap:10px;padding:10px 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
    <span style="font-weight:700;color:#94a3b8;flex:1">📄 Invoice Preview</span>
    <span id="editHint" style="font-size:11px;color:#60a5fa;display:none;margin-right:8px">✦ Click any text field to edit</span>
    <button id="editBtn" onclick="toggleEdit()" style="background:#334155;color:#f1f5f9;border:1px solid #475569;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:600">✏️ Edit Content</button>
    <button onclick="window.print()" style="background:#0d2044;color:#fff;border:1px solid #1e3a6e;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:700">🖨️ Print</button>
  </div>
  <div id="ptoolbar-spacer" style="height:52px"></div>
  <script>
    var _editing=false,_els=[];
    function toggleEdit(){
      _editing=!_editing;
      var btn=document.getElementById('editBtn');
      var hint=document.getElementById('editHint');
      if(_editing){
        btn.textContent='✓ Done Editing';btn.style.background='#059669';btn.style.borderColor='#10b981';hint.style.display='inline';
        document.querySelectorAll('.addr-name,.addr-text,.notes-box p,.pay-box p,.foot-l,.foot-r,.iname,.idesc').forEach(function(el){
          el.contentEditable='true';el.style.outline='2px dashed #60a5fa';el.style.borderRadius='3px';el.style.minHeight='1em';_els.push(el);
        });
      } else {
        btn.textContent='✏️ Edit Content';btn.style.background='#334155';btn.style.borderColor='#475569';hint.style.display='none';
        _els.forEach(function(el){el.contentEditable='false';el.style.outline='';el.style.borderRadius='';});_els=[];
      }
    }
  </script>
<div class="page">

  <div class="doc-hdr">
    <img src="${logoSrc}" class="co-logo" alt="${fromName}"/>
    <div class="co-name">${fromName}</div>
    <div class="co-addr">${fromLine1} · ${fromLine2}${fromPhone ? ` · ${fromPhone}` : ""}</div>
  </div>

  <div class="doc-meta">
    <div class="doc-type">INVOICE</div>
    <div class="doc-right">
      <div class="mrow"><span class="mlbl">Invoice No.</span><span class="mval">${effectiveInvoiceNum}</span></div>
      <div class="mrow"><span class="mlbl">Date Issued</span><span class="mval">${formatDate(invoice.createdAt)}</span></div>
      ${invoice.dueDate ? `<div class="mrow"><span class="mlbl">Due Date</span><span class="mval${isOverdue ? " alert" : ""}">${formatDate(invoice.dueDate)}</span></div>` : ""}
      ${invoice.paidAt ? `<div class="mrow"><span class="mlbl">Paid On</span><span class="mval ok">${formatDate(invoice.paidAt)}</span></div>` : ""}
      ${invoice.trackingNumber ? `<div class="mrow"><span class="mlbl">Reference</span><span class="mval" style="font-family:'Courier New',monospace;font-size:11px">${invoice.trackingNumber}</span></div>` : ""}
      <div><span class="spill s-${badgeClass}">${badgeLabel}</span></div>
    </div>
  </div>

  <div class="addr-grid">
    <div class="addr-block">
      <div class="addr-lbl">From</div>
      <div class="addr-name">${fromName}</div>
      <div class="addr-text">${fromLine1}<br/>${fromLine2}${fromPhone ? `<br/>${fromPhone}` : ""}</div>
    </div>
    <div class="addr-block">
      <div class="addr-lbl">Bill To</div>
      <div class="addr-name">${invoice.customerName ?? "—"}</div>
      ${customerAddrHTML ? `<div class="addr-text">${customerAddrHTML}</div>` : ""}
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:36%">Description</th>
      <th style="width:10%">SKU</th>
      <th class="r" style="width:7%">Qty</th>
      <th style="width:7%">Unit</th>
      <th class="r" style="width:15%">Unit Price</th>
      <th class="r" style="width:15%">Amount</th>
    </tr></thead>
    <tbody>${lineItemsHTML}</tbody>
  </table>

  <div class="tot-wrap">
    <div class="tot-inner">
      <div class="tot-row"><span class="tot-lbl">Subtotal</span><span class="tot-val">${formatCurrency(invoice.subtotal)}</span></div>
      ${invoice.discountTotal > 0 ? `<div class="tot-row"><span class="tot-lbl">Discount</span><span class="tot-val disc">−${formatCurrency(invoice.discountTotal)}</span></div>` : ""}
      <div class="tot-row"><span class="tot-lbl">Tax</span><span class="tot-val">${formatCurrency(invoice.taxTotal)}</span></div>
      ${credits.map((c: any) => `<div class="tot-row"><span class="tot-lbl">Credit CM-${String(c.id).padStart(4,"0")}</span><span class="tot-val cr">−${formatCurrency(Number(c.refundAmount))}</span></div>`).join("")}
      <div class="grand-row">
        <span class="grand-lbl">${creditTotal > 0 ? "Net Due" : "Total Due"}</span>
        <span class="grand-val">${formatCurrency(Math.max(0, invoice.total - creditTotal))}</span>
      </div>
    </div>
  </div>

  ${paymentHTML}
  ${notesHTML}

  <div class="doc-footer">
    <div class="foot-l">${fromLine1} · ${fromLine2}${fromPhone ? ` · ${fromPhone}` : ""}</div>
    <div class="foot-r">Thank you for your business</div>
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
    // User prints via the toolbar Print button
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
            {onApplyCredit && invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <button onClick={onApplyCredit} className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-400/20 transition-colors">
                <CreditCard size={13} /> Apply Credit
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
              {credits.length > 0 && (
                <>
                  <div className="h-px bg-emerald-400/20 mx-4" />
                  {credits.map((c: any) => (
                    <TotalRow
                      key={c.id}
                      label={`Credit CM-${String(c.id).padStart(4, "0")}`}
                      value={`−${formatCurrency(Number(c.refundAmount))}`}
                      accent="text-emerald-400"
                    />
                  ))}
                </>
              )}
              <div className="flex justify-between items-center px-4 py-3.5 bg-[#0d1f3c]">
                <span className="text-white font-bold text-sm">{creditTotal > 0 ? "Net Due" : "Total Due"}</span>
                <span className="text-[#c8ff00] font-black text-lg">{formatCurrency(Math.max(0, invoice.total - creditTotal))}</span>
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
