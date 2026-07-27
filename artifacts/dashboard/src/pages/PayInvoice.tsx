import { useEffect, useState } from "react";
import { useParams, useSearch } from "wouter";
import { CheckCircle2, Clock, AlertCircle, Loader2, CreditCard, Building2, FileText, Calendar, Hash } from "lucide-react";
import brandLogo from "@assets/image_1775679584141.png";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  discountPercent: number;
}

interface PublicInvoice {
  id: number;
  invoiceNumber: string;
  status: string;
  customerName: string;
  customerEmail: string | null;
  lineItems: LineItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(new Date(dateStr));
}

export default function PayInvoice() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const search = useSearch();
  const paymentStatus = new URLSearchParams(search).get("payment");

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!token) { setError("Invalid payment link."); setLoading(false); return; }
    fetch(`${BASE_URL}/api/pay/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? "Invoice not found");
        }
        return r.json();
      })
      .then((data) => { setInvoice(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token, BASE_URL]);

  async function handlePayNow() {
    if (!token) return;
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/pay/${token}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create payment session");
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      setCheckoutError(e.message);
      setCheckingOut(false);
    }
  }

  const isPaid = invoice?.status === "paid" || paymentStatus === "success";

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #e9f4ff 0%, #c8e1f7 100%)" }}>
        <div className="flex flex-col items-center gap-3 text-blue-700">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Loading invoice…</p>
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #e9f4ff 0%, #c8e1f7 100%)" }}>
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full mx-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Invoice Not Found</h2>
          <p className="text-slate-500 text-sm">{error ?? "This payment link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const lineItems = (invoice.lineItems as LineItem[]) ?? [];

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "linear-gradient(135deg, #e9f4ff 0%, #c8e1f7 100%)" }}>
      <div className="max-w-2xl mx-auto">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-8">
          <img src={brandLogo} alt="Forez Corp" className="h-10 w-10 object-contain rounded-xl shadow" />
          <div>
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Forez Corp</p>
            <p className="text-[13px] text-slate-500">Secure Invoice Payment</p>
          </div>
        </div>

        {/* Payment-success banner */}
        {paymentStatus === "success" && (
          <div className="mb-6 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-emerald-700">Payment received! Thank you — we'll send a confirmation shortly.</p>
          </div>
        )}

        {/* Payment-cancelled banner */}
        {paymentStatus === "cancelled" && (
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-700">Payment was cancelled. You can try again below.</p>
          </div>
        )}

        {/* Invoice card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Invoice header */}
          <div className="px-8 py-6 border-b border-slate-100" style={{ background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)" }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-200" />
                  <span className="text-blue-200 text-xs font-semibold uppercase tracking-wider">Invoice</span>
                </div>
                <h1 className="text-2xl font-black text-white">{invoice.invoiceNumber}</h1>
              </div>
              <span className={`mt-1 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                isPaid
                  ? "bg-emerald-100 text-emerald-700"
                  : invoice.status === "overdue"
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-800"
              }`}>
                {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {isPaid ? "Paid" : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </span>
            </div>
          </div>

          <div className="px-8 py-6">
            {/* Customer + dates row */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bill To</p>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-800">{invoice.customerName}</p>
                </div>
                {invoice.customerEmail && (
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">{invoice.customerEmail}</p>
                )}
              </div>
              <div className="text-right">
                <div className="mb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Invoice Date</p>
                  <p className="text-sm text-slate-700 font-medium">{formatDate(invoice.createdAt)}</p>
                </div>
                {invoice.dueDate && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Due Date</p>
                    <div className="flex items-center justify-end gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <p className="text-sm text-slate-700 font-medium">{formatDate(invoice.dueDate)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            <div className="mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3">Description</th>
                    <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3">Qty</th>
                    <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3">Unit Price</th>
                    <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => {
                    const lineSubtotal = item.quantity * item.unitPrice;
                    const disc = lineSubtotal * (item.discountPercent / 100);
                    const lineTotal = lineSubtotal - disc;
                    return (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800">{item.description}</p>
                          {item.discountPercent > 0 && (
                            <p className="text-xs text-emerald-600 mt-0.5">{item.discountPercent}% discount applied</p>
                          )}
                          {item.taxPercent > 0 && (
                            <p className="text-xs text-slate-400 mt-0.5">{item.taxPercent}% tax</p>
                          )}
                        </td>
                        <td className="py-3 text-right text-slate-600">{item.quantity}</td>
                        <td className="py-3 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-3 text-right font-semibold text-slate-800">{formatCurrency(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discountTotal > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount</span>
                  <span>−{formatCurrency(invoice.discountTotal)}</span>
                </div>
              )}
              {invoice.taxTotal > 0 && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Tax</span>
                  <span>{formatCurrency(invoice.taxTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black text-slate-900 border-t border-slate-200 pt-3 mt-2">
                <span>Total Due</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-slate-600">{invoice.notes}</p>
              </div>
            )}
          </div>

          {/* Pay Now footer */}
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-100">
            {isPaid ? (
              <div className="flex items-center gap-3 justify-center text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">
                  {invoice.paidAt ? `Paid on ${formatDate(invoice.paidAt)}` : "This invoice has been paid"}
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {checkoutError && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{checkoutError}</span>
                  </div>
                )}
                <button
                  onClick={handlePayNow}
                  disabled={checkingOut}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)" }}
                >
                  {checkingOut ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  ) : (
                    <><CreditCard className="w-4 h-4" /> Pay {formatCurrency(invoice.total)} Now</>
                  )}
                </button>
                <p className="text-center text-[11px] text-slate-400">
                  Secured by Stripe · SSL encrypted
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Questions? Contact Forez Corp · This link is unique to your invoice
        </p>
      </div>
    </div>
  );
}
