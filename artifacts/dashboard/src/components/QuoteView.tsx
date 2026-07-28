import { useRef, useState, useEffect } from "react";
import {
  X, Printer, Clock, CheckCircle2, XCircle, FileText,
  Mail, MessageSquare, Download, Copy, Check
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import forézLogo from "@assets/image_1775678558898.png";

const BUSINESS = {
  name:    "Forez Corp",
  line1:   "2402 Ocean Ave",
  line2:   "Ronkonkoma, NY 11779",
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

interface LineItem {
  description: string;
  lineDescription?: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  discountPercent: number;
}

interface Quote {
  id: number;
  customerName: string;
  customerCompany?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerCountry?: string | null;
  customerAccountType?: string | null;
  customerBillingAddress?: any;
  customerShippingAddress?: any;
  status: string;
  lineItems: LineItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  notes?: string | null;
  internalNote?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface Props {
  quote: Quote;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  accepted: { label: "Accepted", icon: <CheckCircle2 size={14} />, bg: "bg-lime/10",       text: "text-lime",        border: "border-lime/30" },
  sent:     { label: "Sent",     icon: <Clock size={14} />,         bg: "bg-blue-400/10",   text: "text-blue-300",    border: "border-blue-400/30" },
  draft:    { label: "Draft",    icon: <FileText size={14} />,      bg: "bg-white/8",        text: "text-white/60",    border: "border-white/15" },
  declined: { label: "Declined", icon: <XCircle size={14} />,       bg: "bg-red-500/10",    text: "text-red-400",     border: "border-red-400/30" },
};

type SendMode = "email" | "sms" | null;

export default function QuoteView({ quote, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [sendMode, setSendMode] = useState<SendMode>(null);
  const [emailTo, setEmailTo] = useState(quote.customerEmail ?? "");
  const [smsTo, setSmsTo] = useState(quote.customerPhone ?? "");
  const [copied, setCopied] = useState(false);
  const [validityText, setValidityText] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/app-settings/quote_validity_text")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setValidityText(d.value); });
  }, []);

  const status = STATUS_CONFIG[quote.status] ?? STATUS_CONFIG.draft;
  const quoteNum = (quote as any).quoteNumber ?? `FRZQ - ${Math.max(5100, 5099 + Number(quote.id ?? 0))}`;
  const isExpired =
    quote.status === "sent" &&
    !!quote.expiresAt &&
    new Date(quote.expiresAt) < new Date();

  const customerAddrLine = [
    quote.customerAddress,
    [quote.customerCity, quote.customerState].filter(Boolean).join(", "),
    quote.customerZip,
    quote.customerCountry && quote.customerCountry !== "US" ? quote.customerCountry : null,
  ].filter(Boolean).join("\n");

  const emailSubject = `Quote ${quoteNum} from Forez Corp`;
  const emailBody =
    `Hi ${quote.customerName},\n\nPlease find your quote ${quoteNum} from Forez Corp below.\n\n` +
    `Items:\n${(quote.lineItems as LineItem[]).map(i => `  • ${i.description} × ${i.quantity} — ${formatCurrency(i.quantity * i.unitPrice)}`).join("\n")}\n\n` +
    `Subtotal: ${formatCurrency(quote.subtotal)}\n` +
    (quote.discountTotal > 0 ? `Discount: -${formatCurrency(quote.discountTotal)}\n` : "") +
    `Tax: ${formatCurrency(quote.taxTotal)}\n` +
    `Total: ${formatCurrency(quote.total)}\n` +
    (quote.expiresAt ? `\nThis quote expires on ${formatDate(quote.expiresAt)}.\n` : "") +
    `\nThank you for your business!\n\nForez Corp\n${BUSINESS.phone}\n${BUSINESS.email}`;

  const smsBody =
    `Hi ${quote.customerName}, your quote ${quoteNum} from Forez Corp is ready. ` +
    `Total: ${formatCurrency(quote.total)}` +
    (quote.expiresAt ? ` — expires ${formatDate(quote.expiresAt)}.` : ".");

  function openMailto() {
    window.open(
      `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`,
      "_blank"
    );
  }

  function openSms() {
    window.open(`sms:${encodeURIComponent(smsTo)}?body=${encodeURIComponent(smsBody)}`, "_blank");
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint(_download = false) {
    const accent   = quote.status === "accepted" ? "#276749" : "#1D4E89";
    const docLabel = quote.status === "accepted" ? "ORDER CONFIRMATION" : "QUOTE";

    // ── Net terms helpers ────────────────────────────────────────────────────
    const netDays = (() => {
      const t = quote.customerAccountType;
      if (!t) return null;
      const m = t.replace(/\s/g, "").match(/^[Nn]et(\d+)$/i);
      return m ? parseInt(m[1], 10) : null;
    })();
    const netTermsLabel = netDays != null ? `Net ${netDays}` : null;

    // ── Bill-to address block ─────────────────────────────────────────────
    const customerBlock = (() => {
      const parts: string[] = [];
      // Company (bold) then contact name if different
      if (quote.customerCompany) {
        parts.push(`<b>${escapeHtml(quote.customerCompany)}</b>`);
        if (quote.customerName && quote.customerName !== quote.customerCompany) {
          parts.push(escapeHtml(quote.customerName));
        }
      } else if (quote.customerName) {
        parts.push(`<b>${escapeHtml(quote.customerName)}</b>`);
      }
      // Street address: prefer structured billingAddress JSON, then flat fields
      const ba = quote.customerBillingAddress as any;
      if (ba?.line1) {
        parts.push(escapeHtml(ba.line1));
        if (ba.line2) parts.push(escapeHtml(ba.line2));
        const city = [ba.city, ba.state].filter(Boolean).join(", ") + (ba.zip ? ` ${ba.zip}` : "");
        if (city.trim()) parts.push(city);
      } else if (quote.customerAddress) {
        parts.push(escapeHtml(quote.customerAddress));
        const city = [quote.customerCity, quote.customerState].filter(Boolean).join(", ") + (quote.customerZip ? ` ${escapeHtml(quote.customerZip)}` : "");
        if (city.trim()) parts.push(city);
      }
      if (quote.customerCountry && quote.customerCountry !== "US") parts.push(escapeHtml(quote.customerCountry));
      if (quote.customerEmail) parts.push(escapeHtml(quote.customerEmail));
      if (quote.customerPhone) parts.push(escapeHtml(quote.customerPhone));
      return parts.join("<br/>") || "—";
    })();

    const lineItemsHTML = (quote.lineItems as LineItem[]).map((item, idx) => {
      const gross   = item.quantity * item.unitPrice;
      const disc    = gross * (item.discountPercent / 100);
      const taxable = gross - disc;
      const net     = taxable + taxable * (item.taxPercent / 100);
      return `<tr>
        <td class="num" contenteditable="true">${idx + 1}</td>
        <td contenteditable="true">
          <div class="item-name">${item.description ? nl2br(item.description) : "—"}</div>
          ${item.lineDescription ? `<div class="item-desc">${nl2br(item.lineDescription)}</div>` : ""}
        </td>
        <td class="r" contenteditable="true">${item.quantity}</td>
        <td class="r" contenteditable="true">${formatCurrency(item.unitPrice)}</td>
        <td class="r" contenteditable="true">${item.discountPercent > 0 ? item.discountPercent + "%" : "—"}</td>
        <td class="r" contenteditable="true">${item.taxPercent > 0 ? item.taxPercent + "%" : "—"}</td>
        <td class="r" contenteditable="true" style="font-weight:600">${formatCurrency(net)}</td>
      </tr>`;
    }).join("");

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
      .add-row-btn{display:block;width:100%;margin:6px 0 0;background:none;border:1.5px dashed #cbd5e1;border-radius:4px;padding:7px;font-size:11px;color:#94a3b8;cursor:pointer;font-family:inherit;text-align:center}
      .add-row-btn:hover{background:#f0f4ff;border-color:${accent};color:${accent}}
      .totals-wrap{display:flex;justify-content:flex-end;margin:14px 0 28px}
      .totals-box{width:290px;border:1px solid #e2e8f0;border-radius:3px;overflow:hidden;font-size:12px}
      .totals-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid #f1f5f9;color:#374151}
      .totals-grand{background:${accent};color:#fff;display:flex;justify-content:space-between;align-items:center;padding:11px 14px;font-size:13px;font-weight:700}
      .notes-box{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid ${accent};border-radius:3px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#374151;line-height:1.65}
      .notes-title{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent};margin-bottom:6px}
      .custom-block{border:1.5px dashed #cbd5e1;border-radius:4px;padding:12px 16px;margin:10px 0;font-size:12px;color:#374151;line-height:1.6;min-height:44px}
      .custom-block:focus{outline:none;border-color:${accent}}
      [contenteditable]:focus{outline:2px solid ${accent}55;outline-offset:1px;border-radius:2px}
      [contenteditable]:empty:before{content:attr(data-ph);color:#94a3b8;pointer-events:none}
      .doc-footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;font-style:italic}
    `;

    const w = window.open("", "_blank", "width=980,height=860");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>${escapeHtml(quoteNum)} — Forez Corp</title>
<style>${CSS}</style></head>
<body>

<div id="toolbar">
  <span class="t-label">Format</span>
  <button class="tb" onclick="fmt('bold')"><b>B</b></button>
  <button class="tb" onclick="fmt('italic')"><i>I</i></button>
  <button class="tb" onclick="fmt('underline')"><u>U</u></button>
  <div class="t-sep"></div>
  <span class="t-label">Align</span>
  <button class="tb tb-align" id="al-l" onclick="aln('left')" title="Left">&#9664; Left</button>
  <button class="tb tb-align" id="al-c" onclick="aln('center')" title="Center">&#9646; Centre</button>
  <button class="tb tb-align" id="al-r" onclick="aln('right')" title="Right">Right &#9654;</button>
  <div class="t-sep"></div>
  <span class="t-label">Content</span>
  <button class="tb" onclick="addBlock()">＋ Add Block</button>
  <button class="tb" onclick="addRow()">＋ Add Row</button>
  <button class="tb" onclick="removeBlock()" style="color:#f87171">✕ Remove</button>
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
      <div class="doc-type-pill" contenteditable="true">${docLabel}</div>
      <div class="doc-number" contenteditable="true">${escapeHtml(quoteNum)}</div>
      <div class="doc-meta-right" contenteditable="true"><strong>Date:</strong> ${formatDate(quote.createdAt)}${quote.expiresAt ? `<br/><strong>Expires:</strong> ${formatDate(quote.expiresAt)}` : ""}<br/><strong>Status:</strong> ${escapeHtml(status.label)}</div>
    </div>
  </div>

  <div class="accent-stripe"></div>

  <div class="addr-grid">
    <div>
      <div class="addr-title">Bill To</div>
      <div class="addr-body" contenteditable="true">${customerBlock}</div>
    </div>
    <div></div>
    <div>
      <div class="addr-title">Quote Details</div>
      <div class="addr-body" contenteditable="true"><b>Quote #</b> ${escapeHtml(quoteNum)}<br/><b>Date:</b> ${formatDate(quote.createdAt)}${quote.expiresAt ? `<br/><b>Expires:</b> ${formatDate(quote.expiresAt)}` : ""}${netTermsLabel ? `<br/><b>Terms:</b> ${netTermsLabel}` : ""}<br/><b>Status:</b> ${escapeHtml(status.label)}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>#</th><th>Description</th>
        <th class="r">Qty</th><th class="r">Unit Price</th>
        <th class="r">Disc %</th><th class="r">Tax %</th><th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>${lineItemsHTML}</tbody>
  </table>
  <button class="add-row-btn" onclick="addRow()">＋ Add Line Item</button>

  <div class="totals-wrap">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal</span><span contenteditable="true">${formatCurrency(quote.subtotal)}</span></div>
      ${quote.discountTotal > 0 ? `<div class="totals-row"><span>Discount</span><span contenteditable="true" style="color:#dc2626">&#8722;${formatCurrency(quote.discountTotal)}</span></div>` : ""}
      <div class="totals-row"><span>Tax</span><span contenteditable="true">${formatCurrency(quote.taxTotal)}</span></div>
      <div class="totals-grand"><span>TOTAL</span><span contenteditable="true">${formatCurrency(quote.total)}</span></div>
    </div>
  </div>

  ${quote.notes ? `<div class="notes-box"><div class="notes-title">Notes</div><div contenteditable="true">${nl2br(quote.notes)}</div></div>` : ""}

  <div class="notes-box" style="background:#fffbeb;border-left-color:#b45309">
    <div class="notes-title" style="color:#b45309">Validity</div>
    <div contenteditable="true">${escapeHtml(validityText || (quote.expiresAt ? `Valid until ${formatDate(quote.expiresAt)}` : "Valid for 30 days from issue date"))}</div>
  </div>

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
</body></html>`);
    w.document.close();
    w.focus();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950" />
      <div
        className="relative z-10 w-full max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-hide rounded-2xl border border-white/12"
        style={{ background: "#0c0c10" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b border-white/8"
          style={{ background: "#0c0c10" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center">
              <img src={forézLogo} alt="Forez Corp" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base">{quoteNum}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                  {status.icon}
                  {isExpired ? "Expired" : status.label}
                </span>
              </div>
              <p className="text-white/40 text-xs">Forez Corp · Industrial &amp; Commercial Supplies</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            <ActionBtn icon={<Mail size={13} />} label="Email" onClick={() => setSendMode(sendMode === "email" ? null : "email")} active={sendMode === "email"} color="blue" />
            <ActionBtn icon={<MessageSquare size={13} />} label="SMS" onClick={() => setSendMode(sendMode === "sms" ? null : "sms")} active={sendMode === "sms"} color="green" />
            <ActionBtn icon={<Download size={13} />} label="Download" onClick={() => handlePrint(true)} color="violet" />
            <ActionBtn icon={<Printer size={13} />} label="Print" onClick={() => handlePrint(false)} color="default" />
            <button onClick={onClose} className="ml-1 p-1.5 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Send Email Panel */}
        {sendMode === "email" && (
          <SendPanel
            title="Send via Email"
            icon={<Mail size={14} className="text-blue-400" />}
            fields={[
              { label: "To (email address)", value: emailTo, onChange: setEmailTo, placeholder: "customer@example.com", type: "email" },
            ]}
            previewLabel="Email Body Preview"
            previewText={emailBody}
            primaryLabel="Open in Mail App"
            onPrimary={openMailto}
            copyText={emailBody}
            copied={copied}
            onCopy={() => copyToClipboard(emailBody)}
            onClose={() => setSendMode(null)}
          />
        )}

        {/* Send SMS Panel */}
        {sendMode === "sms" && (
          <SendPanel
            title="Send via SMS"
            icon={<MessageSquare size={14} className="text-green-400" />}
            fields={[
              { label: "To (phone number)", value: smsTo, onChange: setSmsTo, placeholder: "+1 555 000 0000", type: "tel" },
            ]}
            previewLabel="SMS Message"
            previewText={smsBody}
            primaryLabel="Open SMS App"
            onPrimary={openSms}
            copyText={smsBody}
            copied={copied}
            onCopy={() => copyToClipboard(smsBody)}
            onClose={() => setSendMode(null)}
          />
        )}

        {/* Quote Body */}
        <div ref={printRef} className="px-8 py-6 flex flex-col gap-6">
          {/* From / To */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-white/35 text-[10px] uppercase tracking-widest mb-2">From</p>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-6 h-6 rounded-md overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                  <img src={forézLogo} alt="Forez Corp" className="w-full h-full object-contain" />
                </div>
                <span className="text-white font-bold text-sm">Forez Corp</span>
              </div>
              <p className="text-white/45 text-xs leading-relaxed">
                {BUSINESS.line1}<br />
                {BUSINESS.line2}<br />
                {BUSINESS.phone}<br />
                {BUSINESS.email}
              </p>
            </div>
            <div>
              <p className="text-white/35 text-[10px] uppercase tracking-widest mb-2">Prepared For</p>
              <p className="text-white font-bold text-sm mb-1">{quote.customerName}</p>
              <p className="text-white/45 text-xs leading-relaxed">
                {quote.customerAddress && <>{quote.customerAddress}<br /></>}
                {(quote.customerCity || quote.customerState) && (
                  <>{[quote.customerCity, quote.customerState].filter(Boolean).join(", ")}{quote.customerZip ? ` ${quote.customerZip}` : ""}<br /></>
                )}
                {quote.customerCountry && quote.customerCountry !== "US" && <>{quote.customerCountry}<br /></>}
                {quote.customerPhone && <>{quote.customerPhone}<br /></>}
                {quote.customerEmail && <>{quote.customerEmail}</>}
              </p>
            </div>
          </div>

          {/* Dates + net terms */}
          {(() => {
            const nt = quote.customerAccountType;
            const ntMatch = nt ? nt.replace(/\s/g, "").match(/^[Nn]et(\d+)$/i) : null;
            const ntLabel = ntMatch ? `Net ${ntMatch[1]}` : null;
            return (
              <div className={`grid gap-3 ${ntLabel ? "grid-cols-3" : "grid-cols-2"}`}>
                <MetaChip label="Quote Date" value={formatDate(quote.createdAt)} />
                <MetaChip label="Expires" value={formatDate(quote.expiresAt)} alert={isExpired ?? false} />
                {ntLabel && <MetaChip label="Net Terms" value={ntLabel} />}
              </div>
            );
          })()}

          <div className="h-px bg-white/8" />

          {/* Line Items */}
          <div>
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left pb-3 text-white/35 text-xs uppercase tracking-widest font-medium">Description</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-16">Qty</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-28">Unit Price</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-20">Discount</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-16">Tax</th>
                  <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(quote.lineItems as LineItem[]).map((item, i) => {
                  const gross = item.quantity * item.unitPrice;
                  const disc = gross * (item.discountPercent / 100);
                  const taxable = gross - disc;
                  const net = taxable + taxable * (item.taxPercent / 100);
                  return (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-3.5 pr-4">
                        <div className="text-white text-base font-semibold whitespace-pre-wrap">{item.description}</div>
                        {item.lineDescription && (
                          <div className="text-white/45 text-[15px] mt-1 whitespace-pre-wrap">{item.lineDescription}</div>
                        )}
                      </td>
                      <td className="py-3.5 text-right text-white/60">{item.quantity}</td>
                      <td className="py-3.5 text-right text-white/70">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-3.5 text-right text-white/50">
                        {item.discountPercent > 0 ? <span className="text-red-400">-{item.discountPercent}%</span> : <span className="text-white/25">—</span>}
                      </td>
                      <td className="py-3.5 text-right text-white/50">{item.taxPercent > 0 ? `${item.taxPercent}%` : <span className="text-white/25">—</span>}</td>
                      <td className="py-3.5 text-right text-white font-semibold">{formatCurrency(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 flex flex-col gap-0 bg-white/4 border border-white/8 rounded-xl overflow-hidden">
              <TotalRow label="Subtotal" value={formatCurrency(quote.subtotal)} />
              {quote.discountTotal > 0 && (
                <TotalRow label="Discount" value={`-${formatCurrency(quote.discountTotal)}`} accent="text-red-400" />
              )}
              <TotalRow label="Tax" value={formatCurrency(quote.taxTotal)} />
              <div className="flex justify-between items-center px-4 py-3.5 bg-lime/10 border-t border-lime/20">
                <span className="text-white font-bold text-sm">Quote Total</span>
                <span className="text-lime font-black text-lg">{formatCurrency(quote.total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="bg-white/4 border border-white/8 rounded-xl p-4">
              <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1.5">Notes</p>
              <p className="text-white/65 text-sm leading-relaxed">{quote.notes}</p>
            </div>
          )}

          {quote.internalNote && (
            <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-4">
              <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1.5">Internal Notes (Software Only)</p>
              <p className="text-amber-100/80 text-sm leading-relaxed whitespace-pre-wrap">{quote.internalNote}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-white/8">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md overflow-hidden bg-white/10 flex items-center justify-center">
                <img src={forézLogo} alt="Forez Corp" className="w-full h-full object-contain" />
              </div>
              <span className="text-white/30 text-xs">Forez Corp · {BUSINESS.website}</span>
            </div>
            <span className="text-white/25 text-xs">
              {validityText || (quote.expiresAt ? `Valid until ${formatDate(quote.expiresAt)}` : "Thank you for your business")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

const COLOR_MAP = {
  blue:    "bg-blue-400/10 border-blue-400/30 text-blue-300 hover:bg-blue-400/20",
  green:   "bg-green-400/10 border-green-400/30 text-green-300 hover:bg-green-400/20",
  violet:  "bg-violet-400/10 border-violet-400/30 text-violet-300 hover:bg-violet-400/20",
  default: "bg-white/8 border-white/10 text-white/80 hover:bg-white/12",
};

function ActionBtn({ icon, label, onClick, active, color = "default" }: {
  icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; color?: keyof typeof COLOR_MAP;
}) {
  const cls = active
    ? "bg-white/15 border-white/25 text-white"
    : COLOR_MAP[color];
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${cls}`}>
      {icon}{label}
    </button>
  );
}

function SendPanel({ title, icon, fields, previewLabel, previewText, primaryLabel, onPrimary, copyText, copied, onCopy, onClose }: {
  title: string;
  icon: React.ReactNode;
  fields: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type: string }[];
  previewLabel: string;
  previewText: string;
  primaryLabel: string;
  onPrimary: () => void;
  copyText: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mx-6 my-3 rounded-xl border border-white/10 bg-white/4 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/80 text-sm font-semibold">
          {icon}{title}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
          <X size={14} />
        </button>
      </div>
      {fields.map(f => (
        <div key={f.label}>
          <label className="text-white/35 text-[10px] uppercase tracking-wider block mb-1.5">{f.label}</label>
          <input
            type={f.type}
            value={f.value}
            onChange={e => f.onChange(e.target.value)}
            placeholder={f.placeholder}
            className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
          />
        </div>
      ))}
      <div>
        <label className="text-white/35 text-[10px] uppercase tracking-wider block mb-1.5">{previewLabel}</label>
        <pre className="bg-white/4 border border-white/8 rounded-lg p-3 text-white/90 text-xs font-mono leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
          {previewText}
        </pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onPrimary}
          className="flex-1 py-2 rounded-lg bg-white/10 border border-white/15 text-white text-sm font-semibold hover:bg-white/15 transition-colors"
        >
          {primaryLabel}
        </button>
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/6 border border-white/10 text-white/60 text-sm font-medium hover:bg-white/10 transition-colors"
        >
          {copied ? <Check size={13} className="text-lime" /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function MetaChip({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${alert ? "bg-red-500/8 border-red-400/20" : "bg-white/4 border-white/8"}`}>
      <p className="text-white/35 text-[10px] uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-sm font-semibold ${alert ? "text-red-400" : "text-white"}`}>{value}</p>
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
