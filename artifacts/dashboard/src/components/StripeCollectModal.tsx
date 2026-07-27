import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { X, CreditCard, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  invoiceId: number;
  invoiceNumber: string;
  total: number;
  customerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

/* ── Inner payment form (must live inside <Elements>) ── */
function PaymentForm({
  amountCents,
  invoiceId,
  onSuccess,
  onClose,
}: {
  amountCents: number;
  invoiceId: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const { error: submitErr } = await elements.submit();
    if (submitErr) {
      setError(submitErr.message ?? "Validation error");
      setProcessing(false);
      return;
    }

    // Confirm using the client secret already loaded into Elements
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? "Payment failed");
      setProcessing(false);
      return;
    }

    // Payment intent succeeded — record it on the backend
    try {
      await fetch(`${API}/api/invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "stripe",
          paymentNote: result.paymentIntent?.id ?? "Stripe walk-in payment",
        }),
      });
    } catch {
      // Non-fatal — webhook will also catch it
    }

    setProcessing(false);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <PaymentElement
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card", "us_bank_account"],
          }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || processing}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {processing ? (
            <><Loader2 size={14} className="animate-spin" /> Processing…</>
          ) : (
            <><CreditCard size={14} /> Charge {formatCurrency(amountCents / 100)}</>
          )}
        </button>
      </div>
    </form>
  );
}

/* ── Success screen ── */
function SuccessScreen({ total, onClose }: { total: number; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 size={28} className="text-emerald-600" />
      </div>
      <div className="text-center">
        <p className="text-slate-800 font-bold text-lg">Payment Successful!</p>
        <p className="text-slate-400 text-sm mt-1">{formatCurrency(total)} collected via Stripe</p>
      </div>
      <button
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
      >
        Done
      </button>
    </div>
  );
}

/* ── Main modal ── */
export default function StripeCollectModal({
  invoiceId,
  invoiceNumber,
  total,
  customerName,
  onClose,
  onSuccess,
}: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/invoices/${invoiceId}/payment-intent`, { method: "POST" })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInitError(data.error); return; }
        setClientSecret(data.clientSecret);
        setPublishableKey(data.publishableKey);
        setAmountCents(data.amountCents);
      })
      .catch(() => setInitError("Failed to initialise payment. Check Stripe configuration."))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  const handleSuccess = () => {
    setSucceeded(true);
    onSuccess();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 bg-[hsl(220_25%_97%)] rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-200 bg-white rounded-t-2xl">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <CreditCard size={16} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-slate-800 font-bold text-base leading-tight">Collect Payment</h3>
            <p className="text-slate-400 text-xs truncate">{invoiceNumber} · {customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Amount banner */}
        {!succeeded && (
          <div className="mx-6 mt-4 flex items-center justify-between px-4 py-3 rounded-xl bg-indigo-600 text-white">
            <span className="text-sm font-medium opacity-80">Amount Due</span>
            <span className="text-xl font-black">{formatCurrency(total)}</span>
          </div>
        )}

        {/* Body */}
        <div className="px-6 pb-6 pt-4">
          {succeeded ? (
            <SuccessScreen total={total} onClose={onClose} />
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
              <p className="text-slate-400 text-sm">Connecting to Stripe…</p>
            </div>
          ) : initError ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertCircle size={24} className="text-red-400" />
              <p className="text-red-600 text-sm text-center">{initError}</p>
              <p className="text-slate-400 text-xs text-center">
                Make sure <code className="bg-slate-100 px-1 rounded">STRIPE_SECRET_KEY</code> and{" "}
                <code className="bg-slate-100 px-1 rounded">STRIPE_PUBLISHABLE_KEY</code> are set in Secrets.
              </p>
              <button onClick={onClose} className="mt-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                Close
              </button>
            </div>
          ) : clientSecret && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#4f46e5",
                    borderRadius: "10px",
                    fontFamily: "Inter, system-ui, sans-serif",
                  },
                },
              }}
            >
              <PaymentForm
                amountCents={amountCents}
                invoiceId={invoiceId}
                onSuccess={handleSuccess}
                onClose={onClose}
              />
            </Elements>
          ) : null}
        </div>
      </div>
    </div>
  );
}
