import { useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePayBill, getListBillsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  X, Building2, Wallet, CheckSquare, CheckCircle2,
  AlertCircle, Loader2, CreditCard, ChevronRight, ArrowRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BillItem {
  id: number;
  vendorId: number;
  vendorName: string;
  total: number;
  dueDate?: string;
}

interface Props {
  bills: BillItem[];
  preferredMethods: Record<number, string>; // vendorId → method string
  onClose: () => void;
}

type Method = "cash" | "credit_card" | "bank_transfer" | "check";

const VALID_METHODS: Method[] = ["cash", "credit_card", "bank_transfer", "check"];
const isValidMethod = (m: string | undefined | null): m is Method =>
  !!m && VALID_METHODS.includes(m as Method);

const METHODS: { id: Method; label: string; icon: ReactNode; desc: string; color: string; ring: string }[] = [
  {
    id: "cash",
    label: "Cash",
    icon: <Wallet size={20} />,
    desc: "Pay with cash",
    color: "border-emerald-300 bg-emerald-50 text-emerald-700",
    ring: "ring-emerald-400",
  },
  {
    id: "credit_card",
    label: "Credit Card",
    icon: <CreditCard size={20} />,
    desc: "Pay by card",
    color: "border-blue-300 bg-blue-50 text-blue-700",
    ring: "ring-blue-400",
  },
  {
    id: "bank_transfer",
    label: "Bank Transfer",
    icon: <Building2 size={20} />,
    desc: "Transfer from bank",
    color: "border-indigo-300 bg-indigo-50 text-indigo-700",
    ring: "ring-indigo-400",
  },
  {
    id: "check",
    label: "Check",
    icon: <CheckSquare size={20} />,
    desc: "Paper check",
    color: "border-amber-300 bg-amber-50 text-amber-700",
    ring: "ring-amber-400",
  },
];

const METHOD_COLORS: Record<Method, string> = {
  cash:          "text-emerald-700 bg-emerald-50 border-emerald-200",
  credit_card:   "text-blue-700    bg-blue-50    border-blue-200",
  bank_transfer: "text-indigo-700  bg-indigo-50  border-indigo-200",
  check:         "text-amber-700   bg-amber-50   border-amber-200",
};

interface BankAccount {
  id: number;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  accountType: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const inp = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors";

// ─── Per-vendor state ────────────────────────────────────────────────────────

interface VendorGroup {
  vendorId: number;
  vendorName: string;
  bills: BillItem[];
  total: number;
}

interface VendorPayState {
  method: Method;
  bankAccountId: string;
  checkNumberBase: string;
  checkDate: string;
  note: string;
}

interface PayResult {
  billId: number;
  vendorName: string;
  total: number;
  ok: boolean;
  error?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BulkPayBillModal({ bills, preferredMethods, onClose }: Props) {
  const payBill = usePayBill();
  const queryClient = useQueryClient();

  // Group bills by vendor (preserve insertion order = original selection order)
  const groups: VendorGroup[] = [];
  const groupMap = new Map<number, VendorGroup>();
  for (const b of bills) {
    if (!groupMap.has(b.vendorId)) {
      const g: VendorGroup = { vendorId: b.vendorId, vendorName: b.vendorName, bills: [], total: 0 };
      groups.push(g);
      groupMap.set(b.vendorId, g);
    }
    const g = groupMap.get(b.vendorId)!;
    g.bills.push(b);
    g.total += b.total;
  }

  // Per-vendor configurable state, pre-seeded with preferred method
  const [vendorStates, setVendorStates] = useState<Record<number, VendorPayState>>(() => {
    const init: Record<number, VendorPayState> = {};
    for (const g of groups) {
      const preferred = preferredMethods[g.vendorId];
      init[g.vendorId] = {
        method: isValidMethod(preferred) ? preferred : "bank_transfer",
        bankAccountId: "",
        checkNumberBase: "1001",
        checkDate: todayISO(),
        note: "",
      };
    }
    return init;
  });

  const [currentStep, setCurrentStep] = useState(0); // which vendor we're on
  const [processing, setProcessing] = useState(false);
  const [allResults, setAllResults] = useState<PayResult[]>([]);
  const [done, setDone] = useState(false);

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts").then(r => r.json()),
  });

  const group = groups[currentStep];
  const vs = group ? vendorStates[group.vendorId] : null;

  const updateVs = (patch: Partial<VendorPayState>) => {
    if (!group) return;
    setVendorStates(prev => ({
      ...prev,
      [group.vendorId]: { ...prev[group.vendorId], ...patch },
    }));
  };

  const needsBankAccount = vs && (vs.method === "bank_transfer" || vs.method === "check");
  const canProceed = vs && (!needsBankAccount || !!vs.bankAccountId);

  const processVendor = async () => {
    if (!group || !vs) return;
    setProcessing(true);
    const res: PayResult[] = [];
    for (let i = 0; i < group.bills.length; i++) {
      const b = group.bills[i];
      const checkNum = vs.method === "check" ? String(Number(vs.checkNumberBase) + i) : null;
      try {
        await payBill.mutateAsync({
          id: b.id,
          data: {
            paymentMethod: vs.method,
            paymentNote: vs.note || null,
            bankAccountId: vs.bankAccountId ? Number(vs.bankAccountId) : null,
            checkNumber: checkNum,
            checkDate: vs.method === "check" && vs.checkDate ? new Date(vs.checkDate).toISOString() : null,
          } as any,
        });
        res.push({ billId: b.id, vendorName: b.vendorName, total: b.total, ok: true });
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? err?.message ?? "Failed";
        res.push({ billId: b.id, vendorName: b.vendorName, total: b.total, ok: false, error: msg });
      }
    }
    // Invalidate after each vendor so the list updates live
    await queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
    setAllResults(prev => [...prev, ...res]);
    setProcessing(false);

    if (currentStep + 1 >= groups.length) {
      setDone(true);
    } else {
      setCurrentStep(s => s + 1);
    }
  };

  const grandTotal = bills.reduce((s, b) => s + b.total, 0);
  const succeeded  = allResults.filter(r => r.ok).length;
  const failed     = allResults.filter(r => !r.ok).length;

  // ── Done summary ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${failed === 0 ? "bg-emerald-500" : "bg-amber-500"}`}>
                {failed === 0
                  ? <CheckCircle2 size={16} className="text-white" />
                  : <AlertCircle size={16} className="text-white" />}
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Payment Complete</h3>
                <p className="text-xs text-slate-400">
                  {succeeded} of {bills.length} bill{bills.length !== 1 ? "s" : ""} paid across {groups.length} vendor{groups.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Results grouped by vendor */}
          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
            {groups.map(g => {
              const gResults = allResults.filter(r => g.bills.some(b => b.id === r.billId));
              const gOk = gResults.every(r => r.ok);
              const vm = vendorStates[g.vendorId];
              return (
                <div key={g.vendorId} className={`rounded-xl border overflow-hidden ${gOk ? "border-emerald-200" : "border-red-200"}`}>
                  <div className={`px-3 py-2 flex items-center justify-between ${gOk ? "bg-emerald-50" : "bg-red-50"}`}>
                    <div className="flex items-center gap-2">
                      {gOk
                        ? <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                        : <AlertCircle  size={13} className="text-red-500 flex-shrink-0" />}
                      <span className="font-semibold text-sm text-slate-800">{g.vendorName}</span>
                      {isValidMethod(vm?.method) && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${METHOD_COLORS[vm.method]}`}>
                          {METHODS.find(m => m.id === vm.method)?.label}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-700">{formatCurrency(g.total)}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {gResults.map(r => (
                      <div key={r.billId} className="flex items-center gap-2 px-3 py-2 text-sm">
                        {r.ok
                          ? <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                          : <AlertCircle  size={12} className="text-red-500 flex-shrink-0" />}
                        <span className="font-mono text-[10px] text-slate-400">BILL-{String(r.billId).padStart(4, "0")}</span>
                        <span className="flex-1 text-slate-600">{r.vendorName}</span>
                        <span className="font-semibold">{formatCurrency(r.total)}</span>
                        {!r.ok && <span className="text-xs text-red-500 truncate max-w-[90px]" title={r.error}>{r.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 pb-5 pt-3 border-t border-slate-100">
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Processing spinner ───────────────────────────────────────────────────
  if (processing) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl px-8 py-10 flex flex-col items-center gap-4">
          <Loader2 size={32} className="text-indigo-500 animate-spin" />
          <div className="text-center">
            <p className="font-semibold text-slate-800">
              Paying {group?.bills.length} bill{(group?.bills.length ?? 0) !== 1 ? "s" : ""}…
            </p>
            <p className="text-sm text-slate-500 mt-1">{group?.vendorName}</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div className="bg-indigo-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentStep) / groups.length) * 100}%` }} />
          </div>
          <p className="text-xs text-slate-400">Vendor {currentStep + 1} of {groups.length}</p>
        </div>
      </div>
    );
  }

  // ── Per-vendor wizard step ───────────────────────────────────────────────
  if (!group || !vs) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
              <h3 className="font-bold text-slate-800 text-base">
                Settling Bills — {group.vendorName}
              </h3>
              <p className="text-xs text-slate-400">
                Vendor {currentStep + 1} of {groups.length} · {group.bills.length} bill{group.bills.length !== 1 ? "s" : ""} · {formatCurrency(group.total)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Vendor progress pills */}
        {groups.length > 1 && (
          <div className="px-6 pt-3 pb-1 flex items-center gap-1.5 flex-wrap flex-shrink-0">
            {groups.map((g, i) => {
              const isPast    = i < currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={g.vendorId}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    isPast    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : isCurrent ? "bg-[hsl(224_50%_15%)] border-[hsl(224_50%_15%)] text-white shadow-sm"
                    : "bg-slate-50 border-slate-200 text-slate-400"
                  }`}>
                  {isPast && <CheckCircle2 size={10} />}
                  {g.vendorName}
                </div>
              );
            })}
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">

          {/* Bills for this vendor */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bills to settle</p>
              <p className="text-xs font-bold text-slate-700">{formatCurrency(group.total)}</p>
            </div>
            <div className="max-h-28 overflow-y-auto divide-y divide-slate-100">
              {group.bills.map(b => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">BILL-{String(b.id).padStart(4, "0")}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{formatCurrency(b.total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Payment Method</p>
              {isValidMethod(preferredMethods[group.vendorId]) && (
                <span className="text-[10px] text-indigo-500 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full font-semibold">
                  ★ Preferred
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(m => {
                const isSelected = vs.method === m.id;
                const isPreferred = preferredMethods[group.vendorId] === m.id;
                return (
                  <button key={m.id}
                    onClick={() => updateVs({ method: m.id })}
                    className={`relative flex flex-col items-center gap-1.5 py-3.5 rounded-xl border-2 transition-all text-sm font-semibold ${
                      isSelected
                        ? m.color + " ring-2 ring-offset-1 " + m.ring + " shadow-sm"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                    }`}>
                    {isPreferred && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-200 px-1 py-0 rounded-full leading-4">
                        preferred
                      </span>
                    )}
                    {m.icon}
                    <span>{m.label}</span>
                    <span className="text-[10px] font-normal opacity-60">{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bank account picker */}
          {needsBankAccount && (
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Pay From — Bank Account *</label>
              <select value={vs.bankAccountId} onChange={e => updateVs({ bankAccountId: e.target.value })} className={inp}>
                <option value="">Select bank account…</option>
                {bankAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.bankName ? ` — ${a.bankName}` : ""}{a.accountNumber ? ` ···${a.accountNumber.slice(-4)}` : ""}
                  </option>
                ))}
              </select>
              {bankAccounts.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">No bank accounts found. Add them in Banking first.</p>
              )}
            </div>
          )}

          {/* Check fields */}
          {vs.method === "check" && (
            <div className="flex flex-col gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700">
                Check numbers auto-increment from the base number below
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Starting Check # *</label>
                  <input type="text" value={vs.checkNumberBase}
                    onChange={e => updateVs({ checkNumberBase: e.target.value })}
                    placeholder="e.g. 1001" className={inp} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Check Date *</label>
                  <input type="date" value={vs.checkDate}
                    onChange={e => updateVs({ checkDate: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="text-[11px] text-amber-700 flex flex-col gap-0.5">
                {group.bills.map((b, i) => (
                  <div key={b.id} className="flex justify-between">
                    <span>BILL-{String(b.id).padStart(4, "0")}</span>
                    <span className="font-mono">Check #{Number(vs.checkNumberBase) + i}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit card info */}
          {vs.method === "credit_card" && (
            <div className="flex items-center gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
              <CreditCard size={16} className="text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                {group.bills.length} bill{group.bills.length !== 1 ? "s" : ""} will be recorded as paid by credit card.
              </p>
            </div>
          )}

          {/* Cash info */}
          {vs.method === "cash" && (
            <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <Wallet size={16} className="text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-800">
                {group.bills.length} bill{group.bills.length !== 1 ? "s" : ""} will be marked as paid with cash.
              </p>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Payment Note <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea rows={2} value={vs.note}
              onChange={e => updateVs({ note: e.target.value })}
              placeholder={`e.g. Batch payment to ${group.vendorName}`}
              className={inp + " resize-none"} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={processVendor}
            disabled={!canProceed}
            className="flex-1 py-2.5 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {currentStep + 1 < groups.length ? (
              <>
                Pay {formatCurrency(group.total)} &amp; Continue
                <ArrowRight size={14} />
              </>
            ) : (
              <>
                <CreditCard size={14} />
                Pay {formatCurrency(group.total)} · Finish
              </>
            )}
          </button>
        </div>

        {/* Grand total footer hint */}
        {groups.length > 1 && (
          <div className="px-6 pb-4 flex items-center justify-between text-xs text-slate-400 -mt-1 flex-shrink-0">
            <span>
              {groups.slice(0, currentStep).reduce((s, g) => s + g.total, 0) > 0
                ? `${formatCurrency(groups.slice(0, currentStep).reduce((s, g) => s + g.total, 0))} settled so far`
                : ""}
            </span>
            <span>Grand total: <span className="font-semibold text-slate-600">{formatCurrency(grandTotal)}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
