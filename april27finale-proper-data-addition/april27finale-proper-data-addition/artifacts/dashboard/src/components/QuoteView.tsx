import { useMemo, useState } from "react";
import {
  X, Printer, Clock, CheckCircle2, XCircle, FileText,
  Mail, MessageSquare, Copy, Check
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatQuoteNumber } from "@/lib/forez-document-numbers";
import {
  buildQuotePrintHtml,
  FOREZ_QUOTE,
  openForezDocumentPrint,
} from "@/lib/forez-document-print";
import { useListCustomers } from "@workspace/api-client-react";
import ForezDocumentPreview from "./ForezDocumentPreview";

const BUSINESS = { ...FOREZ_QUOTE, phone: "+1 (516) 860-2513" };

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
  customerId?: number;
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
  const { data: customers } = useListCustomers();
  const customer = customers?.find((c: any) => c.id === quote.customerId) as any;

  const [sendMode, setSendMode] = useState<SendMode>(null);
  const [emailTo, setEmailTo] = useState(quote.customerEmail ?? "");
  const [smsTo, setSmsTo] = useState(quote.customerPhone ?? "");
  const [copied, setCopied] = useState(false);

  const status = STATUS_CONFIG[quote.status] ?? STATUS_CONFIG.draft;
  const quoteNum = formatQuoteNumber(Number(quote.id ?? 0), (quote as any).quoteNumber);
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

  const previewHtml = useMemo(
    () =>
      buildQuotePrintHtml({
        quoteNumber: quoteNum,
        issueDate: quote.createdAt,
        dueDate: quote.expiresAt,
        customer,
        customerName: quote.customerName,
        customerEmail: quote.customerEmail,
        customerPhone: quote.customerPhone,
        customerAddress: quote.customerAddress,
        customerCity: quote.customerCity,
        customerState: quote.customerState,
        customerZip: quote.customerZip,
        customerCountry: quote.customerCountry,
        lineItems: quote.lineItems,
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        discountTotal: quote.discountTotal,
        total: quote.total,
        notes: quote.notes,
        trackingNumber: (quote as any).trackingNumber,
        acceptedBy: undefined,
        acceptedDate: undefined,
      }),
    [quote, quoteNum, customer],
  );

  function handlePrint() {
    openForezDocumentPrint(previewHtml);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[920px] max-h-[94vh] flex flex-col rounded-xl border border-slate-200 bg-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-800 font-bold text-sm truncate">{quoteNum}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
              {status.icon}
              {isExpired ? "Expired" : status.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <ActionBtn icon={<Mail size={13} />} label="Email" onClick={() => setSendMode(sendMode === "email" ? null : "email")} active={sendMode === "email"} color="blue" />
            <ActionBtn icon={<MessageSquare size={13} />} label="SMS" onClick={() => setSendMode(sendMode === "sms" ? null : "sms")} active={sendMode === "sms"} color="green" />
            <ActionBtn icon={<Printer size={13} />} label="Print / PDF" onClick={handlePrint} color="default" />
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
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

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto p-4 bg-slate-200/80">
          <ForezDocumentPreview html={previewHtml} />
        </div>

        {quote.internalNote?.trim() && (
          <div className="flex-shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
              Internal note (not on printed quote)
            </p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{quote.internalNote}</p>
          </div>
        )}
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

