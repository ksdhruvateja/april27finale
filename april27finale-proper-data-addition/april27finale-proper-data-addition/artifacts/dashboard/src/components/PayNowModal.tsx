import { useState, useEffect } from "react";
import { X, Copy, ExternalLink, Send, Mail, Link, CheckCircle, Loader2, AlertCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface Props {
  invoice: any;
  customerEmail?: string;
  onClose: () => void;
}

function formatAmt(v: any): string {
  const n = Number(v ?? 0);
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateStr(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function PayNowModal({ invoice, customerEmail, onClose }: Props) {
  const [paymentLinkBase, setPaymentLinkBase] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("QuickBoo");
  const [smtpReady, setSmtpReady] = useState<boolean | null>(null);

  const [tab, setTab] = useState<"link" | "email">("link");
  const [to, setTo] = useState(customerEmail || "");
  const [dueDate, setDueDate] = useState(
    invoice?.dueDate ? String(invoice.dueDate).slice(0, 10) : ""
  );
  const [isOverdue, setIsOverdue] = useState(invoice?.status === "overdue");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const invNumber = invoice?.invoiceNumber || `#${invoice?.id}`;
  const total = formatAmt(invoice?.total);

  const paymentLink = paymentLinkBase
    ? `${paymentLinkBase.replace(/\/$/, "")}?invoice_id=${invoice?.id}&ref=${encodeURIComponent(invNumber)}`
    : null;

  useEffect(() => {
    fetch("/api/app-settings/payment_link_url")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setPaymentLinkBase(d.value); });
    fetch("/api/app-settings/company_name")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setCompanyName(d.value); });
    fetch("/api/app-settings/smtp_host")
      .then(r => r.ok ? r.json() : null)
      .then(d => setSmtpReady(!!d?.value));
  }, []);

  useEffect(() => {
    const dueFmt = dueDate ? formatDateStr(dueDate) : "soon";
    const link = paymentLink;

    setSubject(
      isOverdue
        ? `Overdue Payment Notice — Invoice ${invNumber} (${total})`
        : `Payment Reminder — Invoice ${invNumber} · ${total} due ${dueFmt}`
    );

    const payLine = link
      ? `\nTo pay online, please use the secure link below:\n${link}\n`
      : "";

    const overdueText =
      `This invoice is now past due. Your prompt payment is greatly appreciated.\n`;
    const reminderText =
      `This is a friendly reminder that Invoice ${invNumber} for ${total} is due on ${dueFmt}.\n`;

    setBody(
      `Dear ${invoice?.customerName || "Customer"},\n\n` +
      (isOverdue
        ? `This is an overdue payment notice for Invoice ${invNumber} in the amount of ${total}.\n\n${overdueText}`
        : reminderText) +
      payLine +
      `\nIf you have any questions about this invoice, please don't hesitate to contact us and we will be happy to assist you.\n\n` +
      `Thank you for your continued business.\n\nBest regards,\n${companyName}`
    );
  }, [dueDate, isOverdue, paymentLink, companyName, invoice]);

  const handleCopyLink = () => {
    if (!paymentLink) return;
    navigator.clipboard.writeText(paymentLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Payment link copied!");
  };

  const handleSend = async () => {
    if (!to.trim()) { toast.error("Please enter a recipient email address."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/payments/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      toast.success(`Reminder sent to ${to.trim()}!`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <CreditCard size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 text-base">Pay Now — {invNumber}</h2>
            <p className="text-xs text-slate-500">
              {invoice?.customerName} · {total}
              {invoice?.dueDate ? ` · Due ${formatDateStr(String(invoice.dueDate).slice(0, 10))}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          {([
            { id: "link",  label: "Payment Link",          icon: <Link size={13} /> },
            { id: "email", label: "Send Email Reminder",   icon: <Mail size={13} /> },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          {/* ── PAYMENT LINK TAB ── */}
          {tab === "link" && (
            <>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Payment Link
                </label>
                {paymentLink ? (
                  <>
                    <div className="flex gap-2 items-center">
                      <input
                        readOnly
                        value={paymentLink}
                        className="flex-1 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 focus:outline-none select-all"
                        onClick={e => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={handleCopyLink}
                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all flex-shrink-0 ${
                          copied
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                      <a
                        href={paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex-shrink-0"
                      >
                        <ExternalLink size={13} /> Open
                      </a>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Share this link with your customer. The invoice ID and reference number are appended automatically.
                    </p>
                  </>
                ) : (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Payment link not configured</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Go to <strong>Settings → Payments</strong> and paste your Payment Link URL (Stripe or custom checkout).
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Invoice summary */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Invoice Summary</p>
                </div>
                <div className="grid grid-cols-2">
                  {[
                    { label: "Invoice #",   value: invNumber },
                    { label: "Customer",    value: invoice?.customerName },
                    { label: "Amount Due",  value: total },
                    { label: "Status",      value: (invoice?.status || "").replace("_", " ") },
                  ].map(({ label, value }, i) => (
                    <div
                      key={label}
                      className={`px-4 py-3 ${i < 2 ? "border-b border-slate-100" : ""} ${i % 2 === 0 ? "border-r border-slate-100" : ""}`}
                    >
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">{label}</p>
                      <p className="text-sm font-semibold text-slate-700 mt-0.5 capitalize">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── EMAIL TAB ── */}
          {tab === "email" && (
            <>
              {/* SMTP warning */}
              {smtpReady === false && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Email not configured</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Go to <strong>Settings → Email (SMTP)</strong> to set up your outgoing mail server so emails can be sent automatically.
                    </p>
                  </div>
                </div>
              )}

              {/* To */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  To (Customer Email)
                </label>
                <input
                  type="email"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="customer@email.com"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>

              {/* Due date + overdue toggle */}
              <div className="flex gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Due / Overdue Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 focus:outline-none focus:border-indigo-400 transition-colors"
                  />
                </div>
                <label className="flex items-center gap-2 mb-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isOverdue}
                    onChange={e => setIsOverdue(e.target.checked)}
                    className="w-4 h-4 accent-red-600 rounded"
                  />
                  <span className="text-sm font-semibold text-red-600">Send as Overdue Notice</span>
                </label>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Message
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={13}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors resize-none font-mono leading-relaxed"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Auto-drafted from invoice details. Edit freely — changes are not saved permanently.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
          {tab === "link" ? (
            <button
              onClick={handleCopyLink}
              disabled={!paymentLink}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Copy size={14} /> Copy Payment Link
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || !to.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? "Sending…" : "Send Email"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
