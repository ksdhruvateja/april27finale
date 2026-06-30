import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePayBill, getListBillsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormInput, FormTextarea, SubmitBar } from "./Modal";
import CheckPrintView from "./CheckPrintView";
import { Banknote, Building2, CreditCard, Wallet, Zap, CheckSquare, Send, Printer, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const FOREZ_NAME = "Forez Corp";
const FOREZ_ADDRESS = "2402 Ocean Ave\nRonkonkoma, NY 11779";

interface BankAccount {
  id: number;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  accountType: string;
}

interface Bill {
  id: number;
  vendorName: string;
  total: number;
}

interface Props {
  bill: Bill;
  onClose: () => void;
}

type Method = "wire_transfer" | "ach" | "check" | "cash";

const METHODS: { id: Method; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "wire_transfer", label: "Wire Transfer", icon: <Building2 size={22} />, desc: "Send funds via bank wire" },
  { id: "ach",           label: "ACH / Dwolla",  icon: <Zap size={22} />,       desc: "Automated Clearing House" },
  { id: "check",         label: "Check",         icon: <CheckSquare size={22} />, desc: "Print or mail a paper check" },
  { id: "cash",          label: "Cash",          icon: <Wallet size={22} />,     desc: "Pay with cash immediately" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function nextCheckNumber(_accounts: BankAccount[], accountId: number) {
  return String(1001 + accountId);
}

export default function PayBillModal({ bill, onClose }: Props) {
  const payBill = usePayBill();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<Method | null>(null);
  const [step, setStep] = useState<"method" | "details" | "check">("method");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [destRouting, setDestRouting] = useState("");
  const [destAccount, setDestAccount] = useState("");
  const [destName, setDestName] = useState(bill.vendorName);
  const [sendViaCheckeeper, setSendViaCheckeeper] = useState(false);
  const [payeeAddress, setPayeeAddress] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts").then(r => r.json()),
  });

  const selectedAccount = bankAccounts.find(a => String(a.id) === bankAccountId);

  const markPaid = (overrides?: Partial<{ checkNumber: string; checkDate: string }>) => {
    setApiError(null);
    payBill.mutate({
      id: bill.id,
      data: {
        paymentMethod: method!,
        paymentNote: note || null,
        bankAccountId: bankAccountId ? Number(bankAccountId) : null,
        checkNumber: overrides?.checkNumber || checkNumber || null,
        checkDate: overrides?.checkDate
          ? new Date(overrides.checkDate).toISOString()
          : checkDate ? new Date(checkDate).toISOString() : null,
        destRoutingNumber: destRouting || null,
        destAccountNumber: destAccount || null,
        destAccountName: destName || null,
        sendViaCheckeeper: sendViaCheckeeper || null,
        payeeAddress: payeeAddress || null,
      } as any,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["accounting-ap"] });
        queryClient.invalidateQueries({ queryKey: ["accounting-pnl"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        onClose();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Payment failed";
        setApiError(msg);
      },
    });
  };

  const handleCashConfirm = () => markPaid();
  const handleWireAchConfirm = (e: React.FormEvent) => { e.preventDefault(); markPaid(); };
  const handlePrintAndPay = () => markPaid();

  if (step === "check" && selectedAccount) {
    return (
      <Modal
        title={`Print Check — ${bill.vendorName}`}
        subtitle={`Amount: ${formatCurrency(bill.total)}`}
        onClose={onClose}
        footer={
          <div className="flex justify-between items-center w-full">
            <button onClick={() => setStep("details")}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
              ← Back
            </button>
            <span className="text-xs text-slate-400">Printing will mark this bill as paid</span>
          </div>
        }
      >
        <div className="px-6 py-5">
          <CheckPrintView
            data={{
              payToOrder: bill.vendorName,
              amount: bill.total,
              date: checkDate,
              checkNumber,
              memo: `Bill BILL-${String(bill.id).padStart(4, "0")}`,
              bankName: selectedAccount.bankName ?? "",
              routingNumber: selectedAccount.routingNumber ?? "",
              accountNumber: selectedAccount.accountNumber ?? "",
              payerName: FOREZ_NAME,
              payerAddress: FOREZ_ADDRESS,
            }}
            onPrint={handlePrintAndPay}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Pay Bill"
      subtitle={`${bill.vendorName} — ${formatCurrency(bill.total)}`}
      onClose={onClose}
      footer={
        step === "method" ? (
          <div className="text-xs text-slate-400">Select a payment method to continue</div>
        ) : method === "cash" ? (
          <SubmitBar onClose={onClose} isLoading={payBill.isPending} label="Confirm Cash Payment" formId="pay-bill-form" />
        ) : method === "check" ? (
          <div className="flex justify-between items-center w-full">
            <button onClick={() => setStep("method")}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
              ← Back
            </button>
            <div className="flex gap-2">
              {sendViaCheckeeper ? (
                <SubmitBar
                  onClose={() => {}}
                  hideClose
                  isLoading={payBill.isPending}
                  label="Send Check via Checkeeper"
                  formId="pay-bill-checkeeper-form"
                />
              ) : (
                <button
                  onClick={() => { if (bankAccountId) setStep("check"); }}
                  disabled={!bankAccountId}
                  className="px-4 py-2 rounded-lg bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-40"
                >
                  Preview & Print Check →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center w-full">
            <button onClick={() => setStep("method")}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
              ← Back
            </button>
            <SubmitBar
              onClose={() => {}}
              hideClose
              isLoading={payBill.isPending}
              label={`Confirm ${method === "wire_transfer" ? "Wire Transfer" : "ACH via Dwolla"}`}
              formId="pay-bill-form"
            />
          </div>
        )
      }
    >
      {/* ── Method selection ── */}
      {step === "method" && (
        <div className="px-6 py-5">
          <p className="text-sm text-slate-500 mb-4">How would you like to pay this bill?</p>
          <div className="grid grid-cols-2 gap-3">
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); setStep("details"); }}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-slate-200 hover:border-[hsl(224_50%_30%)] hover:bg-[hsl(224_50%_97%)] transition-all text-slate-700 group"
              >
                <span className="text-slate-400 group-hover:text-[hsl(224_50%_40%)] transition-colors">{m.icon}</span>
                <span className="font-semibold text-sm">{m.label}</span>
                <span className="text-[11px] text-slate-400">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cash ── */}
      {step === "details" && method === "cash" && (
        <form id="pay-bill-form" onSubmit={e => { e.preventDefault(); handleCashConfirm(); }}
          className="px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <Wallet size={20} className="text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Cash Payment</p>
              <p className="text-xs text-emerald-600">This bill will be immediately marked as paid.</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-slate-500">Vendor</span>
              <span className="font-medium">{bill.vendorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount</span>
              <span className="font-semibold text-slate-800">{formatCurrency(bill.total)}</span>
            </div>
          </div>
          <FormField label="Note (optional)">
            <FormTextarea placeholder="e.g. Cash paid in person" value={note} onChange={e => setNote(e.target.value)} rows={2} />
          </FormField>
          {apiError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2">{apiError}</p>}
        </form>
      )}

      {/* ── Wire Transfer ── */}
      {step === "details" && method === "wire_transfer" && (
        <form id="pay-bill-form" onSubmit={handleWireAchConfirm} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Building2 size={16} className="text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-700">Wire transfers are processed manually through your bank. This records the payment in Forez.</p>
          </div>
          <FormField label="Pay From — Bank Account" required>
            <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} required
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400">
              <option value="">Select bank account…</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.bankName ? ` — ${a.bankName}` : ""}{a.accountNumber ? ` ···${a.accountNumber.slice(-4)}` : ""}
                </option>
              ))}
            </select>
            {bankAccounts.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No bank accounts found. Add them in Banking first.</p>}
          </FormField>
          {selectedAccount && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Wire Details</p>
              <div className="flex justify-between"><span className="text-slate-500">Bank</span><span className="font-medium">{selectedAccount.bankName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Routing</span><span className="font-mono font-medium">{selectedAccount.routingNumber || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Account</span><span className="font-mono font-medium">{selectedAccount.accountNumber ? "···" + selectedAccount.accountNumber.slice(-4) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold">{formatCurrency(bill.total)}</span></div>
            </div>
          )}
          <FormField label="Note (optional)">
            <FormTextarea placeholder="e.g. Wire ref #12345" value={note} onChange={e => setNote(e.target.value)} rows={2} />
          </FormField>
          {apiError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2">{apiError}</p>}
        </form>
      )}

      {/* ── ACH via Dwolla ── */}
      {step === "details" && method === "ach" && (
        <form id="pay-bill-form" onSubmit={handleWireAchConfirm} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
            <Zap size={16} className="text-violet-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-violet-800">Dwolla ACH Transfer</p>
              <p className="text-xs text-violet-600 mt-0.5">
                Enter the vendor's bank details below. Once DWOLLA_KEY and DWOLLA_SECRET are set, transfers submit automatically via Dwolla.
              </p>
            </div>
          </div>

          <FormField label="Pay From — Bank Account" required>
            <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} required
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400">
              <option value="">Select bank account…</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.bankName ? ` — ${a.bankName}` : ""}{a.accountNumber ? ` ···${a.accountNumber.slice(-4)}` : ""}
                </option>
              ))}
            </select>
          </FormField>

          <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor Bank Details (for Dwolla)</p>
            <FormField label="Vendor Account Name">
              <FormInput placeholder={bill.vendorName} value={destName} onChange={e => setDestName(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Routing Number">
                <FormInput placeholder="9-digit routing #" value={destRouting} onChange={e => setDestRouting(e.target.value)} />
              </FormField>
              <FormField label="Account Number">
                <FormInput placeholder="Account number" value={destAccount} onChange={e => setDestAccount(e.target.value)} />
              </FormField>
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-slate-400">
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              Vendor routing/account required for live Dwolla ACH. Leave blank to record as pending.
            </div>
          </div>

          <FormField label="Note (optional)">
            <FormTextarea placeholder="e.g. ACH batch ref" value={note} onChange={e => setNote(e.target.value)} rows={2} />
          </FormField>
          {apiError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2">{apiError}</p>}
        </form>
      )}

      {/* ── Check ── */}
      {step === "details" && method === "check" && (
        <div className="px-6 py-5 flex flex-col gap-4">
          <FormField label="Pay From — Bank Account" required>
            <select
              value={bankAccountId}
              onChange={e => {
                setBankAccountId(e.target.value);
                const acc = bankAccounts.find(a => String(a.id) === e.target.value);
                if (acc) setCheckNumber(nextCheckNumber(bankAccounts, acc.id));
              }}
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400">
              <option value="">Select bank account…</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.bankName ? ` — ${a.bankName}` : ""}{a.accountNumber ? ` ···${a.accountNumber.slice(-4)}` : ""}
                </option>
              ))}
            </select>
            {bankAccounts.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No bank accounts found. Add them in Banking first.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Check Number" required>
              <FormInput value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="e.g. 1001" />
            </FormField>
            <FormField label="Check Date" required>
              <FormInput type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} />
            </FormField>
          </div>

          {/* Delivery method toggle */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex">
              <button
                type="button"
                onClick={() => setSendViaCheckeeper(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-r border-slate-200 ${!sendViaCheckeeper ? "bg-[hsl(224_50%_15%)] text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
              >
                <Printer size={14} /> Print Locally
              </button>
              <button
                type="button"
                onClick={() => setSendViaCheckeeper(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${sendViaCheckeeper ? "bg-violet-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
              >
                <Send size={14} /> Mail via Checkeeper
              </button>
            </div>
          </div>

          {sendViaCheckeeper && (
            <form id="pay-bill-checkeeper-form" onSubmit={e => { e.preventDefault(); markPaid(); }} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                <Send size={14} className="text-violet-600 flex-shrink-0" />
                <p className="text-xs text-violet-700">
                  Checkeeper will print and mail the physical check to the vendor.
                  {" "}Add <code className="text-[10px] bg-violet-100 px-1 py-0.5 rounded">CHECKEEPER_TOKEN</code> to activate.
                </p>
              </div>
              <FormField label="Vendor Mailing Address (optional)">
                <FormTextarea
                  placeholder={"123 Main St\nNew York, NY 10001"}
                  value={payeeAddress}
                  onChange={e => setPayeeAddress(e.target.value)}
                  rows={3}
                />
              </FormField>
            </form>
          )}

          <FormField label="Memo (optional)">
            <FormInput value={note} onChange={e => setNote(e.target.value)} placeholder={`Bill BILL-${String(bill.id).padStart(4, "0")}`} />
          </FormField>
          {apiError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2">{apiError}</p>}
        </div>
      )}
    </Modal>
  );
}
