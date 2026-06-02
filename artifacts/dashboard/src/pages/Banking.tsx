import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useListBills } from "@workspace/api-client-react";
import {
  Plus, Building2, Banknote, CreditCard, Wallet, MoreHorizontal,
  Edit, Trash2, ArrowUpRight, CheckSquare, Zap, Search, X,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Modal, { FormField, FormInput, FormTextarea, SubmitBar } from "@/components/Modal";

interface BankAccount {
  id: number;
  name: string;
  accountType: string;
  bankName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  openingBalance: number;
  currentBalance: number;
  currency: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

const METHOD_LABEL: Record<string, string> = {
  wire_transfer: "Wire",
  ach: "ACH",
  check: "Check",
  cash: "Cash",
};
const METHOD_COLOR: Record<string, string> = {
  wire_transfer: "bg-blue-50 text-blue-700 border-blue-200",
  ach:           "bg-violet-50 text-violet-700 border-violet-200",
  check:         "bg-amber-50 text-amber-700 border-amber-200",
  cash:          "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const METHOD_ICON: Record<string, React.ReactNode> = {
  wire_transfer: <Building2 size={12} />,
  ach:           <Zap size={12} />,
  check:         <CheckSquare size={12} />,
  cash:          <Wallet size={12} />,
};

const ACCOUNT_TYPES = ["checking", "savings", "credit", "cash", "other"];

function maskAccount(num: string | null) {
  if (!num) return "—";
  return "···" + num.slice(-4);
}

// ─── Add / Edit Account Modal ─────────────────────────────────────────────────
interface AccountModalProps {
  initial?: BankAccount;
  onClose: () => void;
}

function AccountModal({ initial, onClose }: AccountModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    accountType: initial?.accountType ?? "checking",
    bankName: initial?.bankName ?? "",
    accountNumber: initial?.accountNumber ?? "",
    routingNumber: initial?.routingNumber ?? "",
    currentBalance: String(initial?.currentBalance ?? ""),
    currency: initial?.currency ?? "USD",
    notes: initial?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        accountType: form.accountType,
        bankName: form.bankName || null,
        accountNumber: form.accountNumber || null,
        routingNumber: form.routingNumber || null,
        currentBalance: Number(form.currentBalance) || 0,
        openingBalance: initial?.openingBalance ?? (Number(form.currentBalance) || 0),
        currency: form.currency,
        notes: form.notes || null,
        isActive: true,
      };
      if (initial) {
        return fetch(`/api/bank-accounts/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => r.json());
      }
      return fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      onClose();
    },
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Modal
      title={initial ? "Edit Bank Account" : "Add Bank Account"}
      subtitle={initial ? "Update account details" : "Connect a new bank account"}
      onClose={onClose}
      footer={<SubmitBar onClose={onClose} isLoading={save.isPending} label={initial ? "Save Changes" : "Add Account"} formId="bank-form" />}
    >
      <form id="bank-form" onSubmit={e => { e.preventDefault(); save.mutate(); }} className="px-6 py-4 flex flex-col gap-4">
        <FormField label="Account Name" required>
          <FormInput placeholder="e.g. Main Checking" value={form.name} onChange={f("name")} required />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Account Type">
            <select value={form.accountType} onChange={f("accountType")}
              className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400">
              {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </FormField>
          <FormField label="Currency">
            <FormInput placeholder="USD" value={form.currency} onChange={f("currency")} />
          </FormField>
        </div>
        <FormField label="Bank Name">
          <FormInput placeholder="e.g. Chase, Bank of America" value={form.bankName} onChange={f("bankName")} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Routing Number">
            <FormInput placeholder="9-digit routing #" value={form.routingNumber} onChange={f("routingNumber")} />
          </FormField>
          <FormField label="Account Number">
            <FormInput placeholder="Account number" value={form.accountNumber} onChange={f("accountNumber")} />
          </FormField>
        </div>
        <FormField label="Current Balance">
          <FormInput type="number" step="0.01" placeholder="0.00" value={form.currentBalance} onChange={f("currentBalance")} />
        </FormField>
        <FormField label="Notes">
          <FormTextarea placeholder="Optional notes" value={form.notes} onChange={f("notes")} rows={2} />
        </FormField>
      </form>
    </Modal>
  );
}

// ─── Main Banking Page ─────────────────────────────────────────────────────────
export default function Banking() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | "all">("all");
  const [searchTx, setSearchTx] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => fetch("/api/bank-accounts").then(r => r.json()),
  });

  const { data: bills = [] } = useListBills();

  const deleteAccount = useMutation({
    mutationFn: (id: number) => fetch(`/api/bank-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });

  // All payments extracted from bills (only paid bills with method info)
  const allTransactions = useMemo(() => {
    return (bills as any[])
      .filter(b => b.status === "paid" && b.paymentMethod)
      .map(b => ({
        id: b.id,
        date: b.paidAt || b.createdAt,
        method: b.paymentMethod as string,
        payee: b.vendorName as string,
        bankAccountId: b.bankAccountId as number | null,
        checkNumber: b.checkNumber as string | null,
        amount: b.total as number,
        ref: `BILL-${String(b.id).padStart(4, "0")}`,
      }));
  }, [bills]);

  // Summary stats per method across ALL accounts
  const methodTotals = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const tx of allTransactions) {
      if (!map[tx.method]) map[tx.method] = { count: 0, total: 0 };
      map[tx.method].count++;
      map[tx.method].total += tx.amount;
    }
    return map;
  }, [allTransactions]);

  // Per-account stats
  const accountStats = useMemo(() => {
    const map: Record<number, Record<string, { count: number; total: number }>> = {};
    for (const tx of allTransactions) {
      if (!tx.bankAccountId) continue;
      if (!map[tx.bankAccountId]) map[tx.bankAccountId] = {};
      if (!map[tx.bankAccountId][tx.method]) map[tx.bankAccountId][tx.method] = { count: 0, total: 0 };
      map[tx.bankAccountId][tx.method].count++;
      map[tx.bankAccountId][tx.method].total += tx.amount;
    }
    return map;
  }, [allTransactions]);

  // Filtered transactions
  const filteredTx = useMemo(() => {
    return allTransactions.filter(tx => {
      if (selectedAccountId !== "all" && tx.bankAccountId !== selectedAccountId) return false;
      if (methodFilter !== "all" && tx.method !== methodFilter) return false;
      if (searchTx && !tx.payee.toLowerCase().includes(searchTx.toLowerCase()) && !tx.ref.toLowerCase().includes(searchTx.toLowerCase())) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, selectedAccountId, methodFilter, searchTx]);

  const SUMMARY_METHODS = [
    { key: "wire_transfer", label: "Wire Transfers", icon: <Building2 size={18} />, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
    { key: "ach",           label: "ACH Transfers",  icon: <Zap size={18} />,       color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
    { key: "check",         label: "Checks Printed", icon: <CheckSquare size={18} />, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
    { key: "cash",          label: "Cash Payments",  icon: <Wallet size={18} />,    color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  ];

  return (
    <Layout>
      <Header title="Banking" subtitle={`${accounts.length} account${accounts.length !== 1 ? "s" : ""} connected`} />
      <div className="page-scroll-body px-5 py-4 flex flex-col gap-5 bg-[hsl(220_25%_97%)]">

        {/* Payment Method Summary */}
        <div className="grid grid-cols-4 gap-3">
          {SUMMARY_METHODS.map(m => {
            const stats = methodTotals[m.key] || { count: 0, total: 0 };
            return (
              <button
                key={m.key}
                onClick={() => setMethodFilter(methodFilter === m.key ? "all" : m.key)}
                className={`glass-card px-4 py-3.5 flex flex-col gap-2 text-left transition-all border ${methodFilter === m.key ? m.bg + " ring-2 ring-offset-1 ring-current/20" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className={`flex items-center gap-2 ${m.color}`}>
                  {m.icon}
                  <span className="text-[11px] font-semibold uppercase tracking-wider">{m.label}</span>
                </div>
                <div>
                  <div className="text-[22px] font-bold text-slate-800">{stats.count}</div>
                  <div className="text-[11px] text-slate-400">{formatCurrency(stats.total)} total</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bank Accounts */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Bank Accounts</h2>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-[hsl(224_50%_15%)] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors"
            >
              <Plus size={12} /> Add Account
            </button>
          </div>

          {loadingAccounts ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : accounts.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Building2 size={28} className="mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 text-sm font-medium mb-1">No bank accounts yet</p>
              <p className="text-slate-400 text-xs mb-4">Add your accounts to track wire transfers, ACH, and checks.</p>
              <button onClick={() => setShowModal(true)}
                className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors">
                Add First Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {accounts.map(acc => {
                const stats = accountStats[acc.id] || {};
                const totalSpent = Object.values(stats).reduce((s, v) => s + v.total, 0);
                const isSelected = selectedAccountId === acc.id;
                return (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccountId(isSelected ? "all" : acc.id)}
                    className={`glass-card p-4 cursor-pointer transition-all border-2 ${isSelected ? "border-[hsl(224_50%_30%)] bg-[hsl(224_50%_98%)]" : "border-transparent hover:border-slate-200"}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(224_50%_15%)] flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-white" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">{acc.name}</div>
                          <div className="text-[11px] text-slate-400">{acc.bankName || "—"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold capitalize px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                          {acc.accountType}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger onClick={e => e.stopPropagation()} className="p-1 hover:bg-slate-100 rounded transition-colors">
                            <MoreHorizontal size={13} className="text-slate-400" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[130px]">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditAccount(acc); }} className="gap-2 cursor-pointer text-sm">
                              <Edit size={13} /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); if (confirm("Delete this bank account?")) deleteAccount.mutate(acc.id); }}
                              className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                              <Trash2 size={13} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="mb-3">
                      <div className="text-[11px] text-slate-400 mb-0.5">Current Balance</div>
                      <div className="text-[22px] font-bold text-slate-800">{formatCurrency(acc.currentBalance)}</div>
                    </div>

                    {/* Account details */}
                    <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
                      <div>
                        <span className="text-slate-400">Routing</span>
                        <div className="font-mono text-slate-600 font-medium">{acc.routingNumber || "—"}</div>
                      </div>
                      <div>
                        <span className="text-slate-400">Account</span>
                        <div className="font-mono text-slate-600 font-medium">{maskAccount(acc.accountNumber)}</div>
                      </div>
                    </div>

                    {/* Payment method stats */}
                    <div className="border-t border-slate-100 pt-2.5 flex gap-3">
                      {["wire_transfer", "ach", "check"].map(m => {
                        const s = stats[m] || { count: 0, total: 0 };
                        return (
                          <div key={m} className="flex items-center gap-1">
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${METHOD_COLOR[m]}`}>
                              {METHOD_ICON[m]} {METHOD_LABEL[m]}
                            </span>
                            <span className="text-[11px] text-slate-500">{s.count}</span>
                          </div>
                        );
                      })}
                      {totalSpent > 0 && (
                        <div className="ml-auto text-[11px] text-slate-400 flex items-center gap-0.5">
                          <ArrowUpRight size={10} className="text-red-400" />
                          {formatCurrency(totalSpent)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Transaction History
              {selectedAccountId !== "all" && (
                <button onClick={() => setSelectedAccountId("all")} className="ml-2 text-[11px] text-[hsl(224_50%_40%)] hover:underline font-normal">
                  (showing 1 account — clear)
                </button>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {/* Method filter pills */}
              {["all", "wire_transfer", "ach", "check", "cash"].map(m => (
                <button
                  key={m}
                  onClick={() => setMethodFilter(m)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    methodFilter === m
                      ? m === "all" ? "bg-slate-800 text-white border-slate-800" : METHOD_COLOR[m] + " border-current"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {m === "all" ? "All" : METHOD_LABEL[m]}
                </button>
              ))}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTx}
                  onChange={e => setSearchTx(e.target.value)}
                  className="pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 w-36"
                />
                {searchTx && (
                  <button onClick={() => setSearchTx("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            {filteredTx.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                {allTransactions.length === 0
                  ? "No payments recorded yet. Pay a bill to see transactions here."
                  : "No transactions match your filters."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Method</th>
                    <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Payee</th>
                    <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Reference</th>
                    <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Account</th>
                    <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map(tx => {
                    const acct = accounts.find(a => a.id === tx.bankAccountId);
                    return (
                      <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(tx.date)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${METHOD_COLOR[tx.method] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
                            {METHOD_ICON[tx.method]}
                            {METHOD_LABEL[tx.method] ?? tx.method}
                            {tx.checkNumber && <span className="opacity-70">#{tx.checkNumber}</span>}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-800 font-medium">{tx.payee}</td>
                        <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{tx.ref}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs">
                          {acct ? (
                            <span className="flex items-center gap-1">
                              <Building2 size={11} className="text-slate-400" />
                              {acct.name}
                              {acct.accountNumber && <span className="text-slate-300">···{acct.accountNumber.slice(-4)}</span>}
                            </span>
                          ) : tx.method === "cash" ? (
                            <span className="text-emerald-500 flex items-center gap-1"><Wallet size={11} /> Cash</span>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-800 font-semibold text-right">
                          <span className="flex items-center justify-end gap-1 text-red-500">
                            <ArrowUpRight size={12} />
                            {formatCurrency(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && <AccountModal onClose={() => setShowModal(false)} />}
      {editAccount && <AccountModal initial={editAccount} onClose={() => setEditAccount(null)} />}
    </Layout>
  );
}
