import { useRef } from "react";
import { X, Printer, CheckCircle2, Clock, AlertTriangle, Ban, ShoppingCart, Link2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useListCustomers } from "@workspace/api-client-react";
import forézLogo from "@assets/image_1775678558898.png";

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

const BUSINESS = {
  name:    "Forez Corp",
  line1:   "2402 Ocean Ave",
  line2:   "Ronkonkoma, NY 11779",
  country: "United States",
  phone:   "+1 (516) 860-2513",
  email:   "info@forezcorp.com",
  website: "www.forezcorp.com",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const nl2br = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br/>");

export default function InvoiceView({ invoice, onClose, onMarkPaid, onMarkPending, onCreatePO }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: customers } = useListCustomers();

  const customer = customers?.find((c: any) => c.id === invoice.customerId) as any;
  const addr = customer?.shippingAddress ?? customer?.billingAddress;

  const effectiveInvoiceNum = invoice.invoiceNumber ?? `FRZI - ${Math.max(5100, 5099 + Number(invoice.id ?? 0))}`;
  const status = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft;
  const isOverdue = invoice.status === "sent" && invoice.dueDate && new Date(invoice.dueDate) < new Date();

  function buildPrintHTML() {
    const accent = "#1D4E89";

    const billingAddrHTML = (() => {
      const parts: string[] = [];
      if (invoice.customerName) parts.push(`<b>${escapeHtml(invoice.customerName)}</b>`);
      if (addr?.line1) parts.push(escapeHtml(addr.line1));
      if (addr?.line2) parts.push(escapeHtml(addr.line2));
      const cityLine = [addr?.city, addr?.state].filter(Boolean).join(", ") + (addr?.zip ? ` ${addr.zip}` : "");
      if (cityLine.trim()) parts.push(cityLine);
      if (customer?.email) parts.push(escapeHtml(customer.email));
      if (customer?.phone) parts.push(escapeHtml(customer.phone));
      return parts.join("<br/>") || "—";
    })();

    const shippingAddrHTML = (() => {
      const sa = customer?.shippingAddress;
      if (!sa?.line1) return invoice.customerName ? `<b>${escapeHtml(invoice.customerName)}</b>` : "—";
      const parts: string[] = [];
      if (invoice.customerName) parts.push(`<b>${escapeHtml(invoice.customerName)}</b>`);
      parts.push(escapeHtml(sa.line1));
      if (sa.line2) parts.push(escapeHtml(sa.line2));
      const cityLine = [sa.city, sa.state].filter(Boolean).join(", ") + (sa.zip ? ` ${sa.zip}` : "");
      if (cityLine.trim()) parts.push(cityLine);
      return parts.join("<br/>");
    })();

    const lineItemsHTML = (invoice.lineItems as LineItem[]).map((item, idx) => {
      const amount = item.quantity * item.unitPrice;
      return `<tr>
        <td class="num" contenteditable="true">${idx + 1}</td>
        <td contenteditable="true">
          <div class="item-name">${item.description ? nl2br(item.description) : "—"}</div>
          ${item.lineDescription ? `<div class="item-desc">${nl2br(item.lineDescription)}</div>` : ""}
          ${item.sku ? `<div class="item-sku">${escapeHtml(item.sku)}</div>` : ""}
        </td>
        <td class="r" contenteditable="true">${item.quantity}</td>
        <td class="r" contenteditable="true">${item.unit || "ea"}</td>
        <td class="r" contenteditable="true">${formatCurrency(item.unitPrice)}</td>
        <td class="r" contenteditable="true" style="font-weight:600">${formatCurrency(amount)}</td>
      </tr>`;
    }).join("");

    const pmtLabel = invoice.paymentMethod ? (PAYMENT_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod) : "—";
    const refNum   = invoice.trackingNumber ?? "—";

    const CSS = `
      *{box-sizing:border-box;margin:0;padding:0}
      #toolbar{position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;gap:4px;flex-wrap:wrap;background:#0f172a;padding:8px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.4)}
      .t-label{color:#64748b;font-size:10px;font-weight:700;letter-spacing:0.5px;padding-right:2px;text-transform:uppercase}
      .t-sep{width:1px;height:20px;background:#1e293b;margin:0 6px;flex-shrink:0}
      .tb{border:1px solid #1e293b;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;background:#1e293b;color:#cbd5e1;transition:all 0.15s;white-space:nowrap;font-family:inherit}
      .tb:hover{background:#334155;color:#fff}
      .tb.active{background:${accent};color:#fff;border-color:${accent}}
      .tb-print{background:${accent}!important;color:#fff!important;border-color:${accent}!important;margin-left:auto;padding:4px 16px!important;font-size:12px!important}
      .tb-print:hover{filter:brightness(1.15)!important}
      @media print{#toolbar{display:none!important}body{padding-top:0!important;background:#fff!important}.page{box-shadow:none!important;border:none!important;max-width:none!important;margin:0!important;padding:32px 40px!important}.custom-block{border:none!important}.add-row-btn{display:none!important}[contenteditable]{outline:none!important}}
      body{font-family:Arial,Helvetica,sans-serif;background:#dde3ea;padding-top:54px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color:#1e293b}
      .page{background:#fff;max-width:840px;margin:20px auto 48px;padding:44px 52px;box-shadow:0 4px 32px rgba(0,0,0,0.10);border:1px solid #e2e8f0;border-radius:2px}
      .doc-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
      .co-brand{display:flex;align-items:center;gap:12px;margin-bottom:8px}
      .co-logo{height:48px;width:auto;object-fit:contain;display:block}
      .co-name{font-size:20px;font-weight:700;color:#0f172a;letter-spacing:0.2px;line-height:1.1}
      .co-info{font-size:11px;color:#64748b;line-height:1.7}
      .doc-badge{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
      .doc-type-pill{background:${accent};color:#fff;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;padding:5px 18px;border-radius:2px;display:inline-block}
      .doc-number{font-size:26px;font-weight:800;color:#0f172a;line-height:1;letter-spacing:-0.5px}
      .doc-meta-right{font-size:11px;color:#64748b;line-height:1.9;text-align:right}
      .doc-meta-right strong{color:#374151;font-weight:700}
      .accent-stripe{height:3px;background:${accent};margin:0 -52px 28px}
      .addr-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:28px}
      .addr-title{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${accent};border-bottom:1.5px solid ${accent};padding-bottom:5px;margin-bottom:8px}
      .addr-body{font-size:12px;color:#374151;line-height:1.75}
      .addr-body b{color:#0f172a;font-weight:700}
      table.items{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:12px}
      table.items thead tr{background:${accent}1a}
      table.items th{padding:9px 11px;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${accent};text-align:left;border-bottom:2px solid ${accent}44}
      table.items th.r{text-align:right}
      table.items td{padding:9px 11px;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#374151}
      table.items td.r{text-align:right}
      table.items td.num{font-size:11px;color:#94a3b8;width:30px}
      table.items tbody tr:nth-child(even){background:#f8faff}
      table.items tbody tr:last-child td{border-bottom:2px solid #e2e8f0}
      .item-name{font-weight:600;color:#0f172a;font-size:12px}
      .item-desc{font-size:11px;color:#64748b;margin-top:2px}
      .item-sku{font-size:10px;color:#94a3b8;margin-top:1px;font-family:monospace}
      .add-row-btn{display:block;width:100%;margin:6px 0 0;background:none;border:1.5px dashed #cbd5e1;border-radius:4px;padding:7px;font-size:11px;color:#94a3b8;cursor:pointer;font-family:inherit;text-align:center}
      .add-row-btn:hover{background:#f0f4ff;border-color:${accent};color:${accent}}
      .totals-wrap{display:flex;justify-content:flex-end;margin:14px 0 28px}
      .totals-box{width:290px;border:1px solid #e2e8f0;border-radius:3px;overflow:hidden;font-size:12px}
      .totals-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid #f1f5f9;color:#374151}
      .totals-grand{background:${accent};color:#fff;display:flex;justify-content:space-between;align-items:center;padding:11px 14px;font-size:13px;font-weight:700}
      .payment-ok{font-size:12px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:3px;padding:10px 14px;margin-bottom:16px}
      .notes-box{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid ${accent};border-radius:3px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#374151;line-height:1.65}
      .notes-title{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent};margin-bottom:6px}
      .custom-block{border:1.5px dashed #cbd5e1;border-radius:4px;padding:12px 16px;margin:10px 0;font-size:12px;color:#374151;line-height:1.6;min-height:44px}
      .custom-block:focus{outline:none;border-color:${accent}}
      [contenteditable]:focus{outline:2px solid ${accent}55;outline-offset:1px;border-radius:2px}
      [contenteditable]:empty:before{content:attr(data-ph);color:#94a3b8;pointer-events:none}
      .doc-footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;font-style:italic}
    `;

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Invoice ${escapeHtml(effectiveInvoiceNum)} &#8212; Forez Corp</title>
<style>${CSS}</style></head>
<body>

<div id="toolbar">
  <span class="t-label">Format</span>
  <button class="tb" onclick="fmt('bold')"><b>B</b></button>
  <button class="tb" onclick="fmt('italic')"><i>I</i></button>
  <button class="tb" onclick="fmt('underline')"><u>U</u></button>
  <div class="t-sep"></div>
  <span class="t-label">Align</span>
  <button class="tb tb-align" id="al-l" onclick="aln('left')">&#9664; Left</button>
  <button class="tb tb-align" id="al-c" onclick="aln('center')">&#9646; Centre</button>
  <button class="tb tb-align" id="al-r" onclick="aln('right')">Right &#9654;</button>
  <div class="t-sep"></div>
  <span class="t-label">Content</span>
  <button class="tb" onclick="addBlock()">&#65291; Add Block</button>
  <button class="tb" onclick="addRow()">&#65291; Add Row</button>
  <button class="tb" onclick="removeBlock()" style="color:#f87171">&#10005; Remove</button>
  <div class="t-sep"></div>
  <button class="tb tb-print" onclick="window.print()">&#128424;&nbsp; Print / Save PDF</button>
</div>

<div class="page" id="doc">

  <div class="doc-header">
    <div>
      <div class="co-brand">
        <img src="${forézLogo}" alt="Forez" class="co-logo"/>
        <div class="co-name" contenteditable="true">FOREZ CORP.</div>
      </div>
      <div class="co-info" contenteditable="true">${BUSINESS.line1}<br/>${BUSINESS.line2}<br/>United States &nbsp;|&nbsp; ${BUSINESS.phone}<br/>${BUSINESS.email} &nbsp;|&nbsp; ${BUSINESS.website}</div>
    </div>
    <div class="doc-badge">
      <div class="doc-type-pill" contenteditable="true">INVOICE</div>
      <div class="doc-number" contenteditable="true">${escapeHtml(effectiveInvoiceNum)}</div>
      <div class="doc-meta-right" contenteditable="true"><strong>Date:</strong> ${formatDate(invoice.createdAt)}${invoice.dueDate ? `<br/><strong>Due:</strong> ${formatDate(invoice.dueDate)}` : ""}${invoice.paidAt ? `<br/><strong>Paid:</strong> ${formatDate(invoice.paidAt)}` : ""}<br/><strong>Status:</strong> ${escapeHtml(status.label)}</div>
    </div>
  </div>

  <div class="accent-stripe"></div>

  <div class="addr-grid">
    <div>
      <div class="addr-title">Bill To</div>
      <div class="addr-body" contenteditable="true">${billingAddrHTML}</div>
    </div>
    <div>
      <div class="addr-title">Ship To</div>
      <div class="addr-body" contenteditable="true">${shippingAddrHTML}</div>
    </div>
    <div>
      <div class="addr-title">Invoice Details</div>
      <div class="addr-body" contenteditable="true"><b>Invoice #</b> ${escapeHtml(effectiveInvoiceNum)}<br/><b>Date:</b> ${formatDate(invoice.createdAt)}${invoice.dueDate ? `<br/><b>Due:</b> ${formatDate(invoice.dueDate)}` : ""}${invoice.paidAt ? `<br/><b>Paid:</b> ${formatDate(invoice.paidAt)}` : ""}<br/><b>Ref #:</b> ${escapeHtml(refNum)}<br/><b>Payment:</b> ${escapeHtml(pmtLabel)}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>#</th><th>Description</th>
        <th class="r">Qty</th><th class="r">Unit</th>
        <th class="r">Unit Price</th><th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>${lineItemsHTML}</tbody>
  </table>
  <button class="add-row-btn" onclick="addRow()">&#65291; Add Line Item</button>

  <div class="totals-wrap">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal</span><span contenteditable="true">${formatCurrency(invoice.subtotal)}</span></div>
      ${invoice.discountTotal > 0 ? `<div class="totals-row"><span>Discount</span><span contenteditable="true" style="color:#dc2626">&#8722;${formatCurrency(invoice.discountTotal)}</span></div>` : ""}
      <div class="totals-row"><span>Tax</span><span contenteditable="true">${formatCurrency(invoice.taxTotal)}</span></div>
      <div class="totals-grand"><span>TOTAL DUE</span><span contenteditable="true">${formatCurrency(invoice.total)}</span></div>
    </div>
  </div>

  ${invoice.paidAt && invoice.paymentMethod ? `<div class="payment-ok" contenteditable="true">&#10003; <strong>Payment received</strong> &#8212; ${escapeHtml(pmtLabel)} on ${formatDate(invoice.paidAt)}${invoice.paymentNote ? ` (${escapeHtml(invoice.paymentNote)})` : ""}</div>` : ""}
  ${invoice.notes ? `<div class="notes-box"><div class="notes-title">Notes</div><div contenteditable="true">${nl2br(invoice.notes)}</div></div>` : ""}

  <div class="doc-footer" contenteditable="true">Thank You For Your Business!</div>
</div>

<script>
(function(){
  var lf=null;
  document.addEventListener('focusin',function(e){if(e.target&&e.target.getAttribute&&e.target.getAttribute('contenteditable')==='true')lf=e.target;});
  window.fmt=function(c){document.execCommand(c,false,null);};
  window.aln=function(d){
    document.execCommand('justify'+d[0].toUpperCase()+d.slice(1),false,null);
    document.querySelectorAll('.tb-align').forEach(function(b){b.classList.remove('active');});
    var el=document.getElementById('al-'+d[0]);if(el)el.classList.add('active');
  };
  window.addBlock=function(){
    var b=document.createElement('div');
    b.className='custom-block';b.setAttribute('contenteditable','true');
    b.setAttribute('data-ph','Click to type here\u2026');
    var footer=document.querySelector('.doc-footer');
    document.getElementById('doc').insertBefore(b,footer);b.focus();
  };
  window.removeBlock=function(){
    if(lf&&lf.id!=='doc'&&!lf.classList.contains('doc-footer')&&!lf.classList.contains('page')){
      if(window.confirm('Remove this section?')){lf.remove();lf=null;}
    }
  };
  window.addRow=function(){
    var tbody=document.querySelector('table.items tbody');if(!tbody)return;
    var cols=document.querySelectorAll('table.items thead th').length;
    var tr=document.createElement('tr');
    for(var i=0;i<cols;i++){
      var td=document.createElement('td');td.setAttribute('contenteditable','true');
      if(i===0){td.className='num';td.textContent=tbody.children.length+1;}
      else if(i===1){td.textContent='';}
      else{td.className='r';td.textContent='—';}
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    var c=tr.querySelector('td:nth-child(2)');if(c)c.focus();
  };
})();
<\/script>
</body></html>`;
  }

  function handlePrint() {
    const html = buildPrintHTML();
    const w = window.open("", "_blank", "width=960,height=800");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
              <img src={forézLogo} alt="Forez Corp" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base">{effectiveInvoiceNum}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                  {status.icon}
                  {isOverdue ? "Overdue" : status.label}
                </span>
              </div>
              <p className="text-white/40 text-xs">Forez Corp · Industrial &amp; Commercial Supplies</p>
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
                  <img src={forézLogo} alt="Forez Corp" className="w-full h-full object-contain" />
                </div>
                <span className="text-white font-bold text-sm">Forez Corp</span>
              </div>
              <p className="text-white/45 text-xs leading-relaxed">
                {BUSINESS.line1}<br />
                {BUSINESS.line2}<br />
                📞 {BUSINESS.phone}<br />
                ✉ {BUSINESS.email}
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
            <div className="bg-white/4 border border-white/8 rounded-xl p-4">
              <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1.5">Notes</p>
              <p className="text-white/65 text-sm leading-relaxed">{invoice.notes}</p>
            </div>
          )}

          {invoice.internalNote && (
            <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4">
              <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1.5">Internal Notes (Software Only)</p>
              <p className="text-amber-100/80 text-sm leading-relaxed whitespace-pre-wrap">{invoice.internalNote}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-white/8">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-[#0d1f3c] flex items-center justify-center">
                <span className="text-[#c8ff00] font-black text-[8px]">FC</span>
              </div>
              <span className="text-white/30 text-xs">Forez Corp · Industrial &amp; Commercial Supplies</span>
            </div>
            <span className="text-white/25 text-xs">Thank you for your business</span>
          </div>
        </div>
      </div>
    </div>
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
