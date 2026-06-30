import { useRef, useState } from "react";
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

  const status = STATUS_CONFIG[quote.status] ?? STATUS_CONFIG.draft;
  const quoteNum = (quote as any).quoteNumber ?? `FC - ${Math.max(5100, 5099 + Number(quote.id ?? 0))}`;
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
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`
      <html><head><title>${quoteNum} — Forez Corp</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Segoe UI',sans-serif;background:#fff;color:#111;padding:48px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px}
        .logo-block{display:flex;align-items:center;gap:12px}
        .logo-img{width:42px;height:42px;border-radius:8px;object-fit:contain}
        .company-name{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#111}
        .company-sub{font-size:10px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:2px}
        .company-addr{font-size:11px;color:#666;line-height:1.6;margin-top:6px}
        h1{font-size:30px;font-weight:900;letter-spacing:-1px;color:#000}
        .badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;margin-top:6px}
        .badge-accepted{background:#d4f400;color:#000}
        .badge-sent{background:#dbeafe;color:#1e40af}
        .badge-declined{background:#fee2e2;color:#dc2626}
        .badge-draft{background:#f5f5f5;color:#555}
        .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin:28px 0}
        .meta-block h4{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:6px}
        .meta-block p{font-size:13px;color:#111;line-height:1.6}
        .meta-block p strong{font-weight:700}
        hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0}
        table{width:100%;border-collapse:collapse;margin-bottom:24px}
        thead tr{background:#f5f5f5}
        th{text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#555;border-bottom:2px solid #e0e0e0}
        td{padding:12px;font-size:14px;border-bottom:1px solid #f0f0f0;vertical-align:top}
        td.right{text-align:right}
        .item-name{font-size:14px;font-weight:600;color:#111;white-space:pre-wrap}
        .item-desc{font-size:12px;color:#888;margin-top:2px;line-height:1.4}
        .totals{display:flex;justify-content:flex-end}
        .totals-table{width:280px}
        .totals-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #f0f0f0}
        .totals-total{display:flex;justify-content:space-between;padding:10px 0 0;font-size:18px;font-weight:800;color:#000;border-top:2px solid #000;margin-top:4px}
        .notes{font-size:12px;color:#666;line-height:1.6;margin-top:20px;padding:16px;background:#f9f9f9;border-radius:6px}
        .footer{margin-top:48px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e0e0e0;padding-top:16px}
        .footer-logo{display:flex;align-items:center;gap:8px}
        .footer-logo-img{width:22px;height:22px;border-radius:4px;object-fit:contain}
        .footer-co{font-size:12px;font-weight:700;color:#333}
        .footer-right{font-size:10px;color:#aaa;text-align:right}
        @media print{body{padding:0} @page{margin:40px}}
      </style></head><body>
      <div class="header">
        <div>
          <div class="logo-block">
            <img src="${forézLogo}" alt="Forez Corp" class="logo-img" />
            <div>
              <div class="company-name">Forez Corp</div>
              <div class="company-sub">Industrial &amp; Commercial Supplies</div>
            </div>
          </div>
          <div class="company-addr">
            ${BUSINESS.line1}, ${BUSINESS.line2}<br/>
            ${BUSINESS.phone} &nbsp;·&nbsp; ${BUSINESS.email}
          </div>
        </div>
        <div style="text-align:right">
          <h1>${quoteNum}</h1>
          <span class="badge badge-${quote.status}">${status.label}</span>
          <div style="margin-top:12px;font-size:11px;color:#888">
            <div><strong>Issued:</strong> ${formatDate(quote.createdAt)}</div>
            ${quote.expiresAt ? `<div style="margin-top:4px"><strong>Expires:</strong> ${formatDate(quote.expiresAt)}</div>` : ""}
          </div>
        </div>
      </div>
      <hr/>
      <div class="meta">
        <div class="meta-block">
          <h4>Prepared By</h4>
          <p><strong>${BUSINESS.name}</strong><br/>${BUSINESS.line1}<br/>${BUSINESS.line2}<br/>${BUSINESS.email}</p>
        </div>
        <div class="meta-block">
          <h4>Prepared For</h4>
          <p><strong>${quote.customerName}</strong>${customerAddrLine ? `<br/>${customerAddrLine.replace(/\n/g, "<br/>")}` : ""}${quote.customerEmail ? `<br/>${quote.customerEmail}` : ""}${quote.customerPhone ? `<br/>${quote.customerPhone}` : ""}</p>
        </div>
        <div class="meta-block" style="text-align:right"></div>
      </div>
      <hr/>
      <table>
        <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Discount</th><th style="text-align:right">Tax</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${(quote.lineItems as LineItem[]).map(item => {
          const gross = item.quantity * item.unitPrice;
          const disc = gross * (item.discountPercent / 100);
          const taxable = gross - disc;
          const net = taxable + taxable * (item.taxPercent / 100);
          return `<tr>
            <td>
              <div class="item-name">${item.description ? nl2br(item.description) : "—"}</div>
              ${item.lineDescription ? `<div class="item-desc">${nl2br(item.lineDescription)}</div>` : ""}
            </td>
            <td class="right">${item.quantity}</td>
            <td class="right">${formatCurrency(item.unitPrice)}</td>
            <td class="right">${item.discountPercent > 0 ? item.discountPercent + "%" : "—"}</td>
            <td class="right">${item.taxPercent > 0 ? item.taxPercent + "%" : "—"}</td>
            <td class="right" style="font-weight:600">${formatCurrency(net)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
      <div class="totals">
        <div class="totals-table">
          <div class="totals-row"><span>Subtotal</span><span>${formatCurrency(quote.subtotal)}</span></div>
          ${quote.discountTotal > 0 ? `<div class="totals-row"><span>Discount</span><span style="color:#dc2626">-${formatCurrency(quote.discountTotal)}</span></div>` : ""}
          <div class="totals-row"><span>Tax</span><span>${formatCurrency(quote.taxTotal)}</span></div>
          <div class="totals-total"><span>Total</span><span>${formatCurrency(quote.total)}</span></div>
        </div>
      </div>
      ${quote.notes ? `<div class="notes"><strong>Notes:</strong> ${quote.notes}</div>` : ""}
      <div class="footer">
        <div class="footer-logo">
          <img src="${forézLogo}" alt="Forez Corp" class="footer-logo-img" />
          <div class="footer-co">Forez Corp</div>
        </div>
        <div class="footer-right">
          ${quote.expiresAt ? `Quote valid until ${formatDate(quote.expiresAt)}` : "Thank you for your business"}<br/>
          ${BUSINESS.website}
        </div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
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

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <MetaChip label="Quote Date" value={formatDate(quote.createdAt)} />
            <MetaChip label="Expires" value={formatDate(quote.expiresAt)} alert={isExpired ?? false} />
          </div>

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
              {quote.expiresAt ? `Valid until ${formatDate(quote.expiresAt)}` : "Thank you for your business"}
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
