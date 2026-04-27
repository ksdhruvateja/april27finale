import { useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePayBill, getListBillsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  X, Building2, Zap, Wallet, CheckSquare, CheckCircle2,
  AlertCircle, Loader2, CreditCard,
} from "lucide-react";

interface BillItem { id: number; vendorName: string; total: number; dueDate?: string; }

interface Props {
  bills: BillItem[];
  onClose: () => void;
}

type Method = "wire_transfer" | "ach" | "check" | "cash";

const METHODS: { id: Method; label: string; icon: ReactNode; desc: string; color: string }[] = [
  { id: "wire_transfer", label: "Wire Transfer", icon: <Building2 size={20} />, desc: "Bank wire", color: "border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100" },
  { id: "ach",           label: "ACH / Dwolla",  icon: <Zap size={20} />,       desc: "ACH transfer", color: "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100" },
  { id: "check",         label: "Check",         icon: <CheckSquare size={20} />, desc: "Paper check", color: "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100" },
  { id: "cash",          label: "Cash",          icon: <Wallet size={20} />,     desc: "Cash payment", color: "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100" },
];

interface BankAccount {
  id: number; name: string;
  bankName: string | null; accountNumber: string | null;
  routingNumber: string | null; accountType: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const inp = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400 transition-colors";

type Status = "idle" | "progress" | "done";
interface PayResult { billId: number; vendorName: string; total: number; ok: boolean; error?: string; }

export default function BulkPayBillModal({ bills, onClose }: Props) {
  const payBill = usePayBill();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"method" | "details">("method");
  const [method, setMethod] = useState<Method | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [checkNumberBase, setCheckNumberBase] = useState("1001");
  const [checkDate, setCheckDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<PayResult[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);

  const totalAmount = bills.reduce((s, b) => s + b.total, 0);

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts").then(r => r.json()),
  });

  const selectedAccount = bankAccounts.find(a => String(a.id) === bankAccountId);

  const processPayments = async () => {
    if (!method) return;
    setStatus("progress");
    const res: PayResult[] = [];
    for (let i = 0; i < bills.length; i++) {
      const b = bills[i];
      setCurrentIdx(i);
      const checkNum = method === "check" ? String(Number(checkNumberBase) + i) : null;
      try {
        await payBill.mutateAsync({
          id: b.id,
          data: {
            paymentMethod: method,
            paymentNote: note || null,
            bankAccountId: bankAccountId ? Number(bankAccountId) : null,
            checkNumber: checkNum,
            checkDate: method === "check" && checkDate ? new Date(checkDate).toISOString() : null,
          } as any,
        });
        res.push({ billId: b.id, vendorName: b.vendorName, total: b.total, ok: true });
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? err?.message ?? "Failed";
        res.push({ billId: b.id, vendorName: b.vendorName, total: b.total, ok: false, error: msg });
      }
    }
    setCurrentIdx(null);
    setResults(res);
    setStatus("done");
    queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
  };

  const succeeded = results.filter(r => r.ok).length;
  const failed    = results.filter(r => !r.ok).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={status === "idle" ? onClose : undefined}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[hsl(224_50%_15%)] flex items-center justify-center">
              <CreditCard size={15} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Pay {bills.length} Bill{bills.length !== 1 ? "s" : ""}</h3>
              <p className="text-xs text-slate-400">Total: <span className="font-semibold text-slate-700">{formatCurrency(totalAmount)}</span></p>
            </div>
          </div>
          {status !== "progress" && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Results view (done) ── */}
          {status === "done" && (
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${failed === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                {failed === 0
                  ? <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
                  : <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />}
                <div>
                  <p className="font-semibold text-sm">{succeeded} of {bills.length} bills paid successfully</p>
                  {failed > 0 && <p className="text-xs text-amber-700 mt-0.5">{failed} failed — see details below</p>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {results.map(r => (
                  <div key={r.billId} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm ${r.ok ? "bg-emerald-50/60 border-emerald-100" : "bg-red-50 border-red-200"}`}>
                    {r.ok
                      ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                      : <AlertCircle size={14} className="text-red-500 flex-shrink-0" />}
                    <span className="flex-1 font-medium text-slate-700">{r.vendorName}</span>
                    <span className="font-mono text-xs text-slate-500">BILL-{String(r.billId).padStart(4, "0")}</span>
                    <span className="font-semibold">{formatCurrency(r.total)}</span>
                    {!r.ok && <span className="text-xs text-red-600 truncate max-w-[120px]" title={r.error}>{r.error}</span>}
                  </div>
                ))}
              </div>
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors">
                Done
              </button>
            </div>
          )}

          {/* ── Progress view ── */}
          {status === "progress" && (
            <div className="px-6 py-8 flex flex-col items-center gap-4">
              <Loader2 size={32} className="text-indigo-500 animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-slate-800">Processing payments…</p>
                {currentIdx !== null && (
                  <p className="text-sm text-slate-500 mt-1">
                    {currentIdx + 1} of {bills.length} — {bills[currentIdx]?.vendorName}
                  </p>
                )}
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${((currentIdx ?? 0) / bills.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Method selection ── */}
          {status === "idle" && step === "method" && (
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Bills summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Selected Bills</p>
                  <p className="text-xs font-bold text-slate-700">{formatCurrency(totalAmount)} total</p>
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                  {bills.map(b => (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">BILL-{String(b.id).padStart(4, "0")}</span>
                        <span className="text-slate-700 font-medium">{b.vendorName}</span>
                      </div>
                      <span className="font-semibold text-slate-800">{formatCurrency(b.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-600">Choose payment method</p>
              <div className="grid grid-cols-2 gap-2.5">
                {METHODS.map(m => (
                  <button key={m.id} onClick={() => { setMethod(m.id); setStep("details"); }}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${m.color}`}>
                    {m.icon}
                    <span className="font-semibold text-sm">{m.label}</span>
                    <span className="text-[11px] opacity-70">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Details step ── */}
          {status === "idle" && step === "details" && method && (
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Summary */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm">
                <span className="text-slate-500">Paying {bills.length} bill{bills.length !== 1 ? "s" : ""} via <span className="font-semibold text-slate-700">{METHODS.find(m2 => m2.id === method)?.label}</span></span>
                <span className="font-bold text-slate-800">{formatCurrency(totalAmount)}</span>
              </div>

              {/* Bank account — shown for wire, ach, check */}
              {(method === "wire_transfer" || method === "ach" || method === "check") && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Pay From — Bank Account{method !== "cash" ? " *" : ""}</label>
                  <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={inp}>
                    <option value="">Select bank account…</option>
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.bankName ? ` — ${a.bankName}` : ""}{a.accountNumber ? ` ···${a.accountNumber.slice(-4)}` : ""}
                      </option>
                    ))}
                  </select>
                  {bankAccounts.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No bank accounts found. Add them in Banking first.</p>}
                </div>
              )}

              {/* Check-specific fields */}
              {method === "check" && (
                <div className="flex flex-col gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700">Check Numbers will auto-increment starting from the base number</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Starting Check # *</label>
                      <input type="text" value={checkNumberBase} onChange={e => setCheckNumberBase(e.target.value)} placeholder="e.g. 1001" className={inp} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Check Date *</label>
                      <input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} className={inp} />
                    </div>
                  </div>
                  <div className="text-[11px] text-amber-700">
                    {bills.map((b, i) => (
                      <div key={b.id} className="flex justify-between">
                        <span>{b.vendorName} (BILL-{String(b.id).padStart(4, "0")})</span>
                        <span className="font-mono">Check #{Number(checkNumberBase) + i}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash confirmation banner */}
              {method === "cash" && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <Wallet size={18} className="text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-800">All {bills.length} bills will be marked as paid with cash immediately.</p>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Payment Note (applied to all bills)</label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Batch payment — April 2026"
                  className={inp + " resize-none"} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === "idle" && (
          <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex gap-3 flex-shrink-0">
            {step === "details" ? (
              <>
                <button onClick={() => setStep("method")}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  ← Back
                </button>
                <button
                  onClick={processPayments}
                  disabled={
                    (method === "wire_transfer" || method === "ach" || method === "check") && !bankAccountId
                  }
                  className="flex-1 py-2.5 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <CreditCard size={14} /> Pay {bills.length} Bill{bills.length !== 1 ? "s" : ""} · {formatCurrency(totalAmount)}
                </button>
              </>
            ) : (
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
