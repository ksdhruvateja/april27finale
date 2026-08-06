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
import forézLogo from "@assets/image_1785249843852.png";

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

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html><head><title>${quoteNum} — ${profile.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:#fff;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{padding:40px 52px;max-width:860px;margin:0 auto}
  .letterhead{text-align:center;padding-bottom:20px;border-bottom:2px solid #111827;margin-bottom:24px}
  .lh-logo{width:60px;height:60px;border-radius:12px;object-fit:contain;display:block;margin:0 auto 10px}
  .lh-name{font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#111827;line-height:1}
  .lh-tag{font-size:9px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;margin-top:4px}
  .doc-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
  .doc-type{font-size:32px;font-weight:900;letter-spacing:-1.5px;color:#111827}
  .doc-meta{text-align:right}
  .doc-num{font-size:13px;font-weight:700;color:#6b7280;margin-bottom:6px;letter-spacing:0.5px}
  .badge{display:inline-block;padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.5px}
  .badge-accepted{background:#d4f400;color:#111}
  .badge-sent{background:#dbeafe;color:#1e40af}
  .badge-declined{background:#fee2e2;color:#dc2626}
  .badge-draft{background:#f3f4f6;color:#6b7280}
  .badge-expired{background:#fee2e2;color:#dc2626}
  .badge-invoiced{background:#ede9fe;color:#6d28d9}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:24px}
  .info-block h4{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:8px;font-weight:700}
  .info-block .biz-name{font-size:14px;font-weight:700;color:#111827;margin-bottom:4px}
  .info-block .addr{font-size:12px;color:#6b7280;line-height:1.8}
  .dates-row{display:flex;gap:14px;margin-bottom:28px}
  .date-chip{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 15px}
  .date-chip .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;margin-bottom:4px;font-weight:700}
  .date-chip .val{font-size:13px;font-weight:600;color:#111827}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#f9fafb;border-bottom:2px solid #e5e7eb}
  th{text-align:left;padding:9px 13px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;font-weight:700}
  th.right{text-align:right}
  td{padding:11px 13px;font-size:13px;border-bottom:1px solid #f3f4f6;vertical-align:top;color:#374151}
  td.right{text-align:right}
  .item-name{font-weight:600;font-size:13px;color:#111827;margin-bottom:2px;white-space:pre-wrap}
  .item-desc{font-size:11px;color:#9ca3af;margin-top:2px;line-height:1.4}
  .totals-section{display:flex;justify-content:flex-end;margin-bottom:24px}
  .totals-box{width:290px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
  .total-row{display:flex;justify-content:space-between;padding:9px 16px;font-size:12px;border-bottom:1px solid #f3f4f6;color:#6b7280}
  .total-row .tv{font-weight:600;color:#111827}
  .total-row.discount .tv{color:#dc2626}
  .grand-total{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:#111827}
  .grand-total .gl{font-size:13px;font-weight:700;color:#fff}
  .grand-total .gv{font-size:18px;font-weight:900;color:#d4f400}
  .notes{font-size:12px;color:#6b7280;line-height:1.7;margin-top:16px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px}
  .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e7eb;text-align:center}
  .footer-addr{font-size:10px;color:#9ca3af}
  @media print{body{padding:0}@page{margin:28px 36px;size:A4}}
</style></head><body>
<div class="page">

  <div class="letterhead">
    <img src="${logoSrc}" alt="${fromName}" class="lh-logo" />
    <div class="lh-name">${fromName}</div>
    ${profile.tagline ? `<div class="lh-tag">${profile.tagline}</div>` : ""}
  </div>

  <div class="doc-header">
    <div class="doc-type">QUOTE</div>
    <div class="doc-meta">
      <div class="doc-num">${quoteNum}</div>
      <div><span class="badge badge-${quote.status}">${status.label}</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <h4>Prepared By</h4>
      <div class="biz-name">${fromName}</div>
      <div class="addr">${fromLine1}<br/>${fromLine2}${fromPhone ? `<br/>${fromPhone}` : ""}</div>
    </div>
    <div class="info-block">
      <h4>Prepared For</h4>
      <div class="biz-name">${quote.customerName}</div>
      ${customerAddrLine ? `<div class="addr">${customerAddrLine.replace(/\n/g, "<br/>")}</div>` : ""}
    </div>
  </div>

  <div class="dates-row">
    <div class="date-chip">
      <div class="lbl">Issue Date</div>
      <div class="val">${formatDate(quote.createdAt)}</div>
    </div>
    ${quote.expiresAt ? `<div class="date-chip"><div class="lbl">Expires</div><div class="val">${formatDate(quote.expiresAt)}</div></div>` : ""}
  </div>

  <table>
    <thead><tr>
      <th>Description</th>
      <th class="right">Qty</th>
      <th class="right">Unit Price</th>
      ${hasLineDiscounts ? `<th class="right">Discount</th>` : ""}
      <th class="right">Amount</th>
    </tr></thead>
    <tbody>${lineItems.map(item => {
      const gross = item.quantity * item.unitPrice;
      const disc = gross * (item.discountPercent / 100);
      const amount = gross - disc;
      return `<tr>
        <td>
          <div class="item-name">${item.description ? nl2br(item.description) : "—"}</div>
          ${item.lineDescription ? `<div class="item-desc">${nl2br(item.lineDescription)}</div>` : ""}
        </td>
        <td class="right">${item.quantity}</td>
        <td class="right">${formatCurrency(item.unitPrice)}</td>
        ${hasLineDiscounts ? `<td class="right">${item.discountPercent > 0 ? item.discountPercent + "%" : "—"}</td>` : ""}
        <td class="right" style="font-weight:600">${formatCurrency(amount)}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>

  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row"><span>Subtotal</span><span class="tv">${formatCurrency(quote.subtotal)}</span></div>
      ${quote.discountTotal > 0 ? `<div class="total-row discount"><span>Discount</span><span class="tv">−${formatCurrency(quote.discountTotal)}</span></div>` : ""}
      ${quote.taxTotal > 0 ? `<div class="total-row"><span>Tax</span><span class="tv">${formatCurrency(quote.taxTotal)}</span></div>` : ""}
      <div class="grand-total"><span class="gl">Total</span><span class="gv">${formatCurrency(quote.total)}</span></div>
    </div>
  </div>

  ${quote.notes ? `<div class="notes"><strong>Notes:</strong> ${quote.notes}</div>` : ""}

  <div class="footer">
    <div class="footer-addr">${fromLine1} · ${fromLine2}${fromPhone ? ` · ${fromPhone}` : ""}</div>
  </div>

</div></body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
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
