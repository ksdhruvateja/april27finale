import { useRef, useState, useEffect } from "react";
import {
  X, Printer, Clock, CheckCircle2, XCircle, FileText,
  Mail, MessageSquare, Download, Copy, Check, MapPin,
  ChevronDown, FileCheck, SendHorizonal
} from "lucide-react";
import { useCompanyProfile } from "@/lib/companyProfile";

interface CompanyAddress {
  id: string; name: string;
  line1: string; line2?: string;
  city: string; state: string; zip: string;
  phone?: string;
}
import { formatCurrency, formatDate } from "@/lib/utils";
import forézLogo from "@/assets/image_1785249843852.png";

// BUSINESS is now loaded dynamically via useCompanyProfile() inside the component

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
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerCountry?: string | null;
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
  onDecline?: () => void;
  onStatusChange?: (status: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  accepted: { label: "Accepted", icon: <CheckCircle2 size={14} />, bg: "bg-lime/10",       text: "text-lime",        border: "border-lime/30" },
  sent:     { label: "Sent",     icon: <Clock size={14} />,         bg: "bg-blue-400/10",   text: "text-blue-300",    border: "border-blue-400/30" },
  draft:    { label: "Draft",    icon: <FileText size={14} />,      bg: "bg-white/8",        text: "text-white/60",    border: "border-white/15" },
  declined: { label: "Declined", icon: <XCircle size={14} />,       bg: "bg-red-500/10",    text: "text-red-400",     border: "border-red-400/30" },
};

type SendMode = "email" | "sms" | null;

export default function QuoteView({ quote, onClose, onDecline, onStatusChange }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const profile = useCompanyProfile();
  const [sendMode, setSendMode] = useState<SendMode>(null);
  const [emailTo, setEmailTo] = useState(quote.customerEmail ?? "");
  const [smsTo, setSmsTo] = useState(quote.customerPhone ?? "");
  const [copied, setCopied] = useState(false);
  const [companyAddresses, setCompanyAddresses] = useState<CompanyAddress[]>([]);
  const [addrPickerOpen, setAddrPickerOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/app-settings/company_addresses")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) { try { setCompanyAddresses(JSON.parse(d.value)); } catch {} } });
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

  const emailSubject = `Quote ${quoteNum} from ${profile.name}`;
  const emailBody =
    `Hi ${quote.customerName},\n\nPlease find your quote ${quoteNum} from ${profile.name} below.\n\n` +
    `Items:\n${(quote.lineItems as LineItem[]).map(i => `  • ${i.description} × ${i.quantity} — ${formatCurrency(i.quantity * i.unitPrice)}`).join("\n")}\n\n` +
    `Subtotal: ${formatCurrency(quote.subtotal)}\n` +
    (quote.discountTotal > 0 ? `Discount: -${formatCurrency(quote.discountTotal)}\n` : "") +
    `Tax: ${formatCurrency(quote.taxTotal)}\n` +
    `Total: ${formatCurrency(quote.total)}\n` +
    (quote.expiresAt ? `\nThis quote expires on ${formatDate(quote.expiresAt)}.\n` : "") +
    `\nThank you for your business!\n\n${profile.name}\n${profile.phone}\n${profile.email}`;

  const smsBody =
    `Hi ${quote.customerName}, your quote ${quoteNum} from ${profile.name} is ready. ` +
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

  function doPrint(fromAddr?: CompanyAddress | null, _download = false) {
    const lineItems = quote.lineItems as LineItem[];
    const hasLineDiscounts = lineItems.some(item => item.discountPercent > 0);
    const fromLine1 = fromAddr?.line1 ?? profile.line1;
    const fromLine2 = fromAddr
      ? `${fromAddr.city}${fromAddr.state ? `, ${fromAddr.state}` : ""}${fromAddr.zip ? ` ${fromAddr.zip}` : ""}`
      : profile.line2;
    const fromName = fromAddr?.name ?? profile.name;
    const fromPhone = fromAddr?.phone ?? null;
    const logoSrc = profile.logo ?? forézLogo;
    const badgeKey = isExpired ? "expired" : quote.status;
    const badgeLabel = isExpired ? "Expired" : status.label;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>${quoteNum} — ${profile.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#fff;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px;line-height:1.6}
  .page{max-width:800px;margin:0 auto;padding:32px 44px}
  .doc-hdr{text-align:center;padding-bottom:14px;border-bottom:1.5px solid #111;margin-bottom:0}
  .co-logo{width:72px;height:72px;object-fit:contain;display:block;margin:0 auto 8px}
  .co-name{font-size:18px;font-weight:700;color:#111;letter-spacing:-0.1px}
  .co-addr{font-size:10.5px;color:#888;margin-top:4px;line-height:1.6}
  .doc-meta{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #d0d0d0;margin-bottom:20px}
  .doc-type{font-size:20px;font-weight:700;color:#111;letter-spacing:1px}
  .doc-right{text-align:right}
  .mrow{display:flex;justify-content:flex-end;align-items:baseline;gap:20px;line-height:2.2}
  .mlbl{font-size:9.5px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap}
  .mval{font-size:12px;font-weight:600;color:#222;min-width:110px;text-align:right}
  .mval.alert{color:#b91c1c}
  .spill{display:inline-block;margin-top:8px;padding:2px 10px;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;border:1.5px solid currentColor}
  .s-accepted{color:#166534}
  .s-sent{color:#1e40af}
  .s-draft{color:#999;border-color:#ccc}
  .s-declined{color:#b91c1c}
  .s-expired{color:#b91c1c}
  .s-invoiced{color:#6d28d9}
  .addr-grid{display:flex;gap:0;padding-bottom:16px;border-bottom:1px solid #ddd;margin-bottom:20px}
  .addr-block{flex:1;padding-right:24px}
  .addr-block+.addr-block{padding-left:24px;padding-right:0;border-left:1px solid #e0e0e0}
  .addr-lbl{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#bbb;margin-bottom:5px}
  .addr-name{font-size:13px;font-weight:700;color:#111;margin-bottom:2px}
  .addr-text{font-size:11px;color:#666;line-height:1.75}
  table.items{width:100%;border-collapse:collapse;margin-bottom:4px}
  table.items thead tr{background:#f2f2f2;border-top:1.5px solid #bbb;border-bottom:1.5px solid #bbb}
  table.items th{padding:9px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#444;text-align:left}
  table.items th.r{text-align:right}
  table.items tbody tr{border-bottom:1px solid #eee}
  table.items tbody tr:last-child{border-bottom:1.5px solid #bbb}
  table.items td{padding:10px 12px;font-size:12px;color:#333;vertical-align:top}
  table.items td.r{text-align:right}
  .iname{font-weight:600;color:#111;margin-bottom:1px}
  .idesc{font-size:10.5px;color:#999;margin-top:2px;line-height:1.5}
  .iamt{font-weight:600;color:#222}
  .tot-wrap{display:flex;justify-content:flex-end;margin:8px 0 22px}
  .tot-inner{width:256px}
  .tot-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px;border-bottom:1px solid #f0f0f0}
  .tot-lbl{color:#777}
  .tot-val{font-weight:600;color:#222}
  .tot-val.disc{color:#b91c1c}
  .grand-row{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0 0;border-top:2.5px double #111;margin-top:4px}
  .grand-lbl{font-size:11px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px}
  .grand-val{font-size:18px;font-weight:700;color:#111}
  .notes-box{margin-top:14px;padding-top:10px;border-top:1px solid #e8e8e8}
  .notes-lbl{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#aaa;margin-bottom:5px}
  .notes-box p{font-size:12px;color:#444;line-height:1.75}
  .validity{margin-top:16px;font-size:11.5px;color:#666;font-style:italic}
  .doc-footer{margin-top:32px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}
  .foot-l,.foot-r{font-size:9.5px;color:#aaa}
  @media print{body{padding:0}#ptoolbar,#ptoolbar-spacer{display:none!important}@page{margin:18px 32px;size:A4}}
</style></head><body>
  <div id="ptoolbar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1e293b;color:#f1f5f9;display:flex;align-items:center;gap:10px;padding:10px 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
    <span style="font-weight:700;color:#94a3b8;flex:1">📄 Quote Preview</span>
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
        document.querySelectorAll('.addr-name,.addr-text,.notes-box p,.foot-l,.foot-r,.iname,.idesc,.validity').forEach(function(el){
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
    <div class="doc-type">QUOTE</div>
    <div class="doc-right">
      <div class="mrow"><span class="mlbl">Quote No.</span><span class="mval">${quoteNum}</span></div>
      <div class="mrow"><span class="mlbl">Date Issued</span><span class="mval">${formatDate(quote.createdAt)}</span></div>
      ${quote.expiresAt ? `<div class="mrow"><span class="mlbl">Valid Until</span><span class="mval${isExpired ? " alert" : ""}">${formatDate(quote.expiresAt)}</span></div>` : ""}
      <div><span class="spill s-${badgeKey}">${badgeLabel}</span></div>
    </div>
  </div>

  <div class="addr-grid">
    <div class="addr-block">
      <div class="addr-lbl">Prepared By</div>
      <div class="addr-name">${fromName}</div>
      <div class="addr-text">${fromLine1}<br/>${fromLine2}${fromPhone ? `<br/>${fromPhone}` : ""}</div>
    </div>
    <div class="addr-block">
      <div class="addr-lbl">Prepared For</div>
      <div class="addr-name">${quote.customerName}</div>
      ${customerAddrLine ? `<div class="addr-text">${customerAddrLine.replace(/\n/g, "<br/>")}</div>` : ""}
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:${hasLineDiscounts ? "42%" : "52%"}">Description</th>
      <th class="r" style="width:8%">Qty</th>
      <th class="r" style="width:17%">Unit Price</th>
      ${hasLineDiscounts ? `<th class="r" style="width:10%">Discount</th>` : ""}
      <th class="r" style="width:18%">Amount</th>
    </tr></thead>
    <tbody>${lineItems.map(item => {
      const gross = item.quantity * item.unitPrice;
      const disc = gross * (item.discountPercent / 100);
      const amount = gross - disc;
      return `<tr>
        <td>
          <div class="iname">${item.description ? nl2br(item.description) : "—"}</div>
          ${item.lineDescription ? `<div class="idesc">${nl2br(item.lineDescription)}</div>` : ""}
        </td>
        <td class="r">${item.quantity}</td>
        <td class="r">${formatCurrency(item.unitPrice)}</td>
        ${hasLineDiscounts ? `<td class="r">${item.discountPercent > 0 ? item.discountPercent + "%" : "—"}</td>` : ""}
        <td class="r iamt">${formatCurrency(amount)}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>

  <div class="tot-wrap">
    <div class="tot-inner">
      <div class="tot-row"><span class="tot-lbl">Subtotal</span><span class="tot-val">${formatCurrency(quote.subtotal)}</span></div>
      ${quote.discountTotal > 0 ? `<div class="tot-row"><span class="tot-lbl">Discount</span><span class="tot-val disc">−${formatCurrency(quote.discountTotal)}</span></div>` : ""}
      ${quote.taxTotal > 0 ? `<div class="tot-row"><span class="tot-lbl">Tax</span><span class="tot-val">${formatCurrency(quote.taxTotal)}</span></div>` : ""}
      <div class="grand-row">
        <span class="grand-lbl">Quote Total</span>
        <span class="grand-val">${formatCurrency(quote.total)}</span>
      </div>
    </div>
  </div>

  ${quote.expiresAt && !isExpired ? `<div class="validity">This quotation is valid until <strong>${formatDate(quote.expiresAt)}</strong>. Prices are subject to change after expiry.</div>` : ""}
  ${quote.notes ? `<div class="notes-box"><div class="notes-lbl">Notes</div><p>${nl2br(quote.notes)}</p></div>` : ""}

  <div class="doc-footer">
    <div class="foot-l">${fromLine1} · ${fromLine2}${fromPhone ? ` · ${fromPhone}` : ""}</div>
    <div class="foot-r">Thank you for considering our services</div>
  </div>

</div></body></html>`);
    w.document.close();
    w.focus();
    // User prints via the toolbar Print button
  }

  function handlePrint(_download = false) {
    if (companyAddresses.length >= 1) {
      setAddrPickerOpen(true);
    } else {
      doPrint(null, _download);
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
              <img src={profile.logo ?? forézLogo} alt={profile.name} className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base">{quoteNum}</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                  {status.icon}
                  {isExpired ? "Expired" : status.label}
                </span>
              </div>
              <p className="text-white/40 text-xs">{profile.name} · {profile.tagline}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            <ActionBtn icon={<Mail size={13} />} label="Email" onClick={() => setSendMode(sendMode === "email" ? null : "email")} active={sendMode === "email"} color="blue" />
            <ActionBtn icon={<MessageSquare size={13} />} label="SMS" onClick={() => setSendMode(sendMode === "sms" ? null : "sms")} active={sendMode === "sms"} color="green" />
            <ActionBtn icon={<Download size={13} />} label="Download" onClick={() => handlePrint(true)} color="violet" />
            <ActionBtn icon={<Printer size={13} />} label="Print" onClick={() => handlePrint(false)} color="default" />
            {onDecline && !["declined", "invoiced", "accepted"].includes(quote.status) && (
              <ActionBtn icon={<XCircle size={13} />} label="Decline" onClick={onDecline} color="red" />
            )}
            {/* Status Change Dropdown */}
            {onStatusChange && (
              <div className="relative">
                <button
                  onClick={() => setStatusMenuOpen(v => !v)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${status.bg} ${status.text} ${status.border} hover:opacity-90`}
                >
                  {status.icon}
                  {isExpired ? "Expired" : status.label}
                  <ChevronDown size={11} className={`transition-transform ${statusMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {statusMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#18181f] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                    {[
                      { value: "draft",    label: "Draft",    icon: <FileText size={12} />,     cls: "text-white/60" },
                      { value: "sent",     label: "Sent",     icon: <SendHorizonal size={12} />, cls: "text-blue-300" },
                      { value: "accepted", label: "Accepted", icon: <CheckCircle2 size={12} />,  cls: "text-emerald-400" },
                      { value: "declined", label: "Declined", icon: <XCircle size={12} />,       cls: "text-red-400" },
                      { value: "invoiced", label: "Invoiced", icon: <FileCheck size={12} />,     cls: "text-purple-400" },
                    ].map(s => (
                      <button
                        key={s.value}
                        onClick={() => { onStatusChange(s.value); setStatusMenuOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold transition-colors hover:bg-white/8 ${quote.status === s.value ? "bg-white/6" : ""} ${s.cls}`}
                      >
                        {s.icon}
                        {s.label}
                        {quote.status === s.value && <Check size={11} className="ml-auto opacity-60" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                  <img src={profile.logo ?? forézLogo} alt={profile.name} className="w-full h-full object-contain" />
                </div>
                <span className="text-white font-bold text-sm">{profile.name}</span>
              </div>
              <p className="text-white/45 text-xs leading-relaxed">
                {profile.line1}<br />
                {profile.line2}<br />
                {profile.phone}<br />
                {profile.email}
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

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <MetaChip label="Quote Date" value={formatDate(quote.createdAt)} />
            <MetaChip label="Expires" value={formatDate(quote.expiresAt)} alert={isExpired ?? false} />
          </div>

          <div className="h-px bg-white/8" />

          {/* Line Items */}
          {(() => {
            const lineItems = quote.lineItems as LineItem[];
            const hasLineDiscounts = lineItems.some(item => item.discountPercent > 0);
            return (
            <div>
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left pb-3 text-white/35 text-xs uppercase tracking-widest font-medium">Description</th>
                    <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-16">Qty</th>
                    <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-28">Unit Price</th>
                    {hasLineDiscounts && <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-20">Discount</th>}
                    <th className="text-right pb-3 text-white/35 text-[10px] uppercase tracking-widest font-medium w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => {
                    const gross = item.quantity * item.unitPrice;
                    const disc = gross * (item.discountPercent / 100);
                    const amount = gross - disc;
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
                        {hasLineDiscounts && (
                          <td className="py-3.5 text-right text-white/50">
                            {item.discountPercent > 0 ? <span className="text-red-400">-{item.discountPercent}%</span> : <span className="text-white/25">—</span>}
                          </td>
                        )}
                        <td className="py-3.5 text-right text-white font-semibold">{formatCurrency(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            );
          })()}

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
                <img src={profile.logo ?? forézLogo} alt={profile.name} className="w-full h-full object-contain" />
              </div>
              <span className="text-white/30 text-xs">{profile.name} · {profile.website}</span>
            </div>
            <span className="text-white/25 text-xs">
              {quote.expiresAt ? `Valid until ${formatDate(quote.expiresAt)}` : "Thank you for your business"}
            </span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

const COLOR_MAP = {
  blue:    "bg-blue-400/10 border-blue-400/30 text-blue-300 hover:bg-blue-400/20",
  green:   "bg-green-400/10 border-green-400/30 text-green-300 hover:bg-green-400/20",
  violet:  "bg-violet-400/10 border-violet-400/30 text-violet-300 hover:bg-violet-400/20",
  red:     "bg-red-500/10 border-red-400/30 text-red-400 hover:bg-red-500/20",
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
        <pre className="bg-white/4 border border-white/8 rounded-lg p-3 text-white/55 text-xs font-mono leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
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
