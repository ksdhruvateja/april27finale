import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign,
  ArrowUpRight, ArrowDownRight, Plus, Trash2, Edit, BarChart2,
  Building2, CreditCard, Wallet, PiggyBank, Receipt,
  Package, X,
} from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/expenseCategories";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

async function apiPost(path: string, body: object) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

async function apiPatch(path: string, body: object) {
  const r = await fetch(`${API}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

async function apiDelete(path: string) {
  await fetch(`${API}${path}`, { method: "DELETE" });
}

type Tab = "overview" | "ledger" | "ar" | "ap" | "cashflow" | "expenses" | "banking" | "reports";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "Overview",        icon: BarChart2   },
  { id: "ledger",    label: "General Ledger",  icon: BookOpen    },
  { id: "ar",        label: "Receivables",     icon: ArrowUpRight },
  { id: "ap",        label: "Payables",        icon: ArrowDownRight },
  { id: "cashflow",  label: "Cash Flow",       icon: TrendingUp  },
  { id: "expenses",  label: "Expenses",        icon: Receipt     },
  { id: "banking",   label: "Banking",         icon: Building2   },
  { id: "reports",   label: "Reports",         icon: BarChart2   },
];

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="glass-card p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={16} className="text-white" />
      </div>
      <div>
        <p className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-slate-800 font-bold text-lg leading-tight">{value}</p>
        {sub && <p className="text-slate-400 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AgingBadge({ bucket }: { bucket: string }) {
  const map: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "1-30":  "bg-yellow-50 text-yellow-700 border-yellow-200",
    "31-60": "bg-orange-50 text-orange-700 border-orange-200",
    "61-90": "bg-red-50 text-red-600 border-red-200",
    "90+":   "bg-red-100 text-red-800 border-red-300",
  };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${map[bucket] ?? map.current}`}>{bucket === "current" ? "Current" : `${bucket} days`}</span>;
}

/* ══════════════════════════════════════════════════════════════ */
/*  OVERVIEW TAB                                                   */
/* ══════════════════════════════════════════════════════════════ */
function OverviewTab() {
  const { data: pnl } = useQuery({ queryKey: ["accounting-pnl"], queryFn: () => apiFetch("/api/accounting/pnl") });
  const { data: ar } = useQuery({ queryKey: ["accounting-ar"], queryFn: () => apiFetch("/api/accounting/ar-aging") });
  const { data: ap } = useQuery({ queryKey: ["accounting-ap"], queryFn: () => apiFetch("/api/accounting/ap-aging") });
  const { data: banks } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => apiFetch("/api/bank-accounts") });

  const totalAR = (ar ?? []).reduce((s: number, r: any) => s + r.total, 0);
  const totalAP = (ap ?? []).reduce((s: number, r: any) => s + r.total, 0);
  const totalBankBalance = (banks ?? []).filter((b: any) => b.isActive).reduce((s: number, b: any) => s + b.currentBalance, 0);
  const overdueAR = (ar ?? []).filter((r: any) => r.bucket !== "current").reduce((s: number, r: any) => s + r.total, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(pnl?.revenue ?? 0)} sub="All-time paid invoices" icon={TrendingUp} color="bg-emerald-500" />
        <StatCard label="Net Profit" value={formatCurrency(pnl?.netProfit ?? 0)} sub={`Gross: ${formatCurrency(pnl?.grossProfit ?? 0)}`} icon={DollarSign} color={(pnl?.netProfit ?? 0) >= 0 ? "bg-blue-500" : "bg-red-500"} />
        <StatCard label="Accounts Receivable" value={formatCurrency(totalAR)} sub={overdueAR > 0 ? `${formatCurrency(overdueAR)} overdue` : "All current"} icon={ArrowUpRight} color="bg-indigo-500" />
        <StatCard label="Bank Balance" value={formatCurrency(totalBankBalance)} sub={`${(banks ?? []).filter((b: any) => b.isActive).length} accounts`} icon={Building2} color="bg-slate-600" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Accounts Payable" value={formatCurrency(totalAP)} sub="Unpaid bills" icon={ArrowDownRight} color="bg-amber-500" />
        <StatCard label="Total Expenses" value={formatCurrency(pnl?.expenses ?? 0)} sub="All recorded expenses" icon={Receipt} color="bg-rose-500" />
        <StatCard label="COGS" value={formatCurrency(pnl?.cogs ?? 0)} sub="Cost of goods sold" icon={Package} color="bg-purple-500" />
      </div>

      {/* Monthly P&L mini-chart */}
      {(pnl?.months ?? []).length > 0 && (
        <div className="glass-card p-5">
          <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider mb-4">Monthly P&amp;L</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Month","Revenue","COGS","Gross Profit","Expenses","Net Profit"].map(h => (
                    <th key={h} className="pb-2 text-left text-[11px] uppercase tracking-wider text-slate-400 font-semibold pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(pnl?.months ?? [])].reverse().slice(0, 12).map((m: any) => (
                  <tr key={m.month} className="border-b border-slate-50">
                    <td className="py-2 text-slate-500 text-xs pr-4">{m.month}</td>
                    <td className="py-2 text-emerald-600 font-medium pr-4">{formatCurrency(m.revenue)}</td>
                    <td className="py-2 text-slate-500 pr-4">{formatCurrency(m.cogs)}</td>
                    <td className="py-2 font-medium pr-4">{formatCurrency(m.grossProfit)}</td>
                    <td className="py-2 text-rose-500 pr-4">{formatCurrency(m.expenses)}</td>
                    <td className={`py-2 font-bold ${m.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(m.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  GENERAL LEDGER TAB                                             */
/* ══════════════════════════════════════════════════════════════ */
function LedgerTab() {
  const { data, isLoading } = useQuery({ queryKey: ["accounting-gl"], queryFn: () => apiFetch("/api/accounting/general-ledger") });
  const [filter, setFilter] = useState("all");
  const types = ["all", "invoice", "payment_received", "bill", "payment_made", "expense"];

  const rows = (data ?? []).filter((r: any) => filter === "all" || r.type === filter);
  const runningBalance = rows.reduce((s: number, r: any) => s + r.debit - r.credit, 0);

  const typeLabel: Record<string, string> = {
    invoice: "Invoice", payment_received: "Payment In", bill: "Bill",
    payment_made: "Payment Out", expense: "Expense",
  };
  const typeBg: Record<string, string> = {
    invoice: "text-indigo-600 bg-indigo-50 border-indigo-200",
    payment_received: "text-emerald-600 bg-emerald-50 border-emerald-200",
    bill: "text-amber-600 bg-amber-50 border-amber-200",
    payment_made: "text-red-600 bg-red-50 border-red-200",
    expense: "text-rose-600 bg-rose-50 border-rose-200",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all capitalize ${filter === t ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
            {t === "all" ? "All" : typeLabel[t] ?? t}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 self-center">Net position: <span className={`font-bold ${runningBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(runningBalance)}</span></span>
      </div>
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Date","Type","Description","Party","Ref","Debit","Credit"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No transactions yet</td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${typeBg[r.type] ?? "text-slate-500 bg-slate-50 border-slate-200"}`}>{typeLabel[r.type] ?? r.type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{r.description}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.party ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.ref}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold text-right">{r.debit > 0 ? formatCurrency(r.debit) : "—"}</td>
                  <td className="px-4 py-3 text-red-500 font-semibold text-right">{r.credit > 0 ? formatCurrency(r.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  AR AGING TAB                                                   */
/* ══════════════════════════════════════════════════════════════ */
function ARTab() {
  const { data, isLoading } = useQuery({ queryKey: ["accounting-ar"], queryFn: () => apiFetch("/api/accounting/ar-aging") });
  const rows: any[] = data ?? [];
  const buckets = ["current","1-30","31-60","61-90","90+"];
  const bucketTotals = buckets.map(b => ({ bucket: b, total: rows.filter(r => r.bucket === b).reduce((s, r) => s + r.total, 0) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-3">
        {bucketTotals.map(b => (
          <div key={b.bucket} className="glass-card p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{b.bucket === "current" ? "Current" : `${b.bucket} days`}</p>
            <p className={`font-bold text-base ${b.bucket === "current" ? "text-emerald-600" : b.bucket === "1-30" ? "text-yellow-600" : "text-red-600"}`}>{formatCurrency(b.total)}</p>
          </div>
        ))}
      </div>
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No outstanding receivables</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Invoice #","Customer","Due Date","Days Overdue","Aging","Amount"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.ref}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{r.customer}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.dueDate)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.daysOverdue > 0 ? `${r.daysOverdue}d` : "—"}</td>
                  <td className="px-4 py-3"><AgingBadge bucket={r.bucket} /></td>
                  <td className="px-4 py-3 font-semibold text-slate-800 text-right">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-slate-600">Total Outstanding</td>
                <td className="px-4 py-3 font-bold text-slate-800 text-right">{formatCurrency(rows.reduce((s, r) => s + r.total, 0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  AP AGING TAB                                                   */
/* ══════════════════════════════════════════════════════════════ */
function APTab() {
  const { data, isLoading } = useQuery({ queryKey: ["accounting-ap"], queryFn: () => apiFetch("/api/accounting/ap-aging") });
  const rows: any[] = data ?? [];
  const buckets = ["current","1-30","31-60","61-90","90+"];
  const bucketTotals = buckets.map(b => ({ bucket: b, total: rows.filter(r => r.bucket === b).reduce((s, r) => s + r.total, 0) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-3">
        {bucketTotals.map(b => (
          <div key={b.bucket} className="glass-card p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{b.bucket === "current" ? "Current" : `${b.bucket} days`}</p>
            <p className={`font-bold text-base ${b.bucket === "current" ? "text-emerald-600" : b.bucket === "1-30" ? "text-yellow-600" : "text-red-600"}`}>{formatCurrency(b.total)}</p>
          </div>
        ))}
      </div>
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No outstanding payables</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Bill #","Vendor","Due Date","Days Overdue","Aging","Amount"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.ref}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{r.vendor}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.dueDate)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.daysOverdue > 0 ? `${r.daysOverdue}d` : "—"}</td>
                  <td className="px-4 py-3"><AgingBadge bucket={r.bucket} /></td>
                  <td className="px-4 py-3 font-semibold text-slate-800 text-right">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-slate-600">Total Outstanding</td>
                <td className="px-4 py-3 font-bold text-slate-800 text-right">{formatCurrency(rows.reduce((s, r) => s + r.total, 0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  CASH FLOW TAB                                                  */
/* ══════════════════════════════════════════════════════════════ */
function CashFlowTab() {
  const { data: pnl } = useQuery({ queryKey: ["accounting-pnl"], queryFn: () => apiFetch("/api/accounting/pnl") });
  const months: any[] = [...(pnl?.months ?? [])].reverse().slice(0, 12);
  const maxVal = Math.max(...months.map((m: any) => Math.max(m.revenue, m.cogs + m.expenses)), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Cash In" value={formatCurrency(pnl?.revenue ?? 0)} sub="Revenue from paid invoices" icon={ArrowUpRight} color="bg-emerald-500" />
        <StatCard label="Total Cash Out" value={formatCurrency((pnl?.cogs ?? 0) + (pnl?.expenses ?? 0))} sub="Bills + Expenses" icon={ArrowDownRight} color="bg-red-500" />
        <StatCard label="Net Cash Flow" value={formatCurrency(pnl?.netProfit ?? 0)} icon={DollarSign} color={(pnl?.netProfit ?? 0) >= 0 ? "bg-blue-500" : "bg-orange-500"} />
      </div>

      {months.length > 0 ? (
        <div className="glass-card p-5">
          <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider mb-4">Monthly Cash Flow</p>
          <div className="flex flex-col gap-3">
            {months.map((m: any) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-16 flex-shrink-0">{m.month}</span>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${(m.revenue / maxVal) * 100}%` }} />
                    <span className="text-xs text-emerald-600 font-medium">{formatCurrency(m.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded-full bg-red-400" style={{ width: `${((m.cogs + m.expenses) / maxVal) * 100}%` }} />
                    <span className="text-xs text-red-500 font-medium">{formatCurrency(m.cogs + m.expenses)}</span>
                  </div>
                </div>
                <span className={`text-xs font-bold w-20 text-right ${m.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(m.netProfit)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-400" /><span className="text-xs text-slate-500">Cash In</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><span className="text-xs text-slate-500">Cash Out</span></div>
          </div>
        </div>
      ) : (
        <div className="glass-card p-10 text-center text-slate-400 text-sm">No paid transactions yet — cash flow will appear here</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  EXPENSES TAB                                                   */
/* ══════════════════════════════════════════════════════════════ */
const emptyExpForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  description: "", category: "", amount: "", paymentMethod: "", reference: "", notes: "",
});

function ExpensesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["expenses"], queryFn: () => apiFetch("/api/expenses") });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyExpForm());
  const [catFilter, setCatFilter] = useState("all");

  const create = useMutation({
    mutationFn: (body: object) => apiPost("/api/expenses", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["accounting-pnl"] }); qc.invalidateQueries({ queryKey: ["accounting-gl"] }); setShowForm(false); setForm(emptyExpForm()); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/expenses/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["accounting-pnl"] }); qc.invalidateQueries({ queryKey: ["accounting-gl"] }); },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const expenses: any[] = data ?? [];
  const filtered = catFilter === "all" ? expenses : expenses.filter(e => e.category === catFilter);
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);

  const byCategory: Record<string, number> = {};
  expenses.forEach(e => { byCategory[e.category || "Uncategorized"] = (byCategory[e.category || "Uncategorized"] ?? 0) + e.amount; });

  const inputCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400";
  const selectCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCatFilter("all")} className={`px-3 py-1 rounded-lg text-xs font-semibold border ${catFilter === "all" ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]" : "bg-white text-slate-500 border-slate-200"}`}>All</button>
          {Object.keys(byCategory).map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)} className={`px-3 py-1 rounded-lg text-xs font-semibold border ${catFilter === cat ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]" : "bg-white text-slate-500 border-slate-200"}`}>{cat}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
          <Plus size={14} /> Add Expense
        </button>
      </div>

      {/* Category summary */}
      {Object.keys(byCategory).length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(byCategory).sort(([,a],[,b]) => b - a).slice(0, 4).map(([cat, amt]) => (
            <div key={cat} className="glass-card p-3">
              <p className="text-[11px] text-slate-400 font-semibold truncate">{cat}</p>
              <p className="text-slate-800 font-bold">{formatCurrency(amt)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No expenses recorded yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Date","Description","Category","Payment Method","Ref","Amount",""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{e.description}</td>
                  <td className="px-4 py-3">
                    {e.category ? <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-medium">{e.category}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{e.paymentMethod || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{e.reference || "—"}</td>
                  <td className="px-4 py-3 font-bold text-rose-600 text-right">{formatCurrency(e.amount)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => { if (confirm("Delete this expense?")) del.mutate(e.id); }} className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-slate-600">Total</td>
                <td className="px-4 py-3 font-bold text-rose-600 text-right">{formatCurrency(totalFiltered)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-bold text-base">Add Expense</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 font-semibold">Date</label><input type="date" className={inputCls} value={form.date} onChange={set("date")} /></div>
              <div><label className="text-xs text-slate-500 font-semibold">Amount ($) *</label><input type="number" min="0" step="0.01" placeholder="0.00" className={inputCls} value={form.amount} onChange={set("amount")} /></div>
            </div>
            <div><label className="text-xs text-slate-500 font-semibold">Description *</label><input className={inputCls} placeholder="e.g. Office supplies from Staples" value={form.description} onChange={set("description")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 font-semibold">Category</label>
                <select className={selectCls} value={form.category} onChange={set("category")}>
                  <option value="">Uncategorized</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold">Payment Method</label>
                <select className={selectCls} value={form.paymentMethod} onChange={set("paymentMethod")}>
                  <option value="">Select...</option>
                  {["Cash","Check","Bank Transfer","Credit Card","Debit Card","ACH"].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div><label className="text-xs text-slate-500 font-semibold">Reference / Receipt #</label><input className={inputCls} placeholder="e.g. REC-001" value={form.reference} onChange={set("reference")} /></div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                disabled={!form.description || !form.amount || create.isPending}
                onClick={() => create.mutate({ date: form.date, description: form.description, category: form.category || null, amount: Number(form.amount), paymentMethod: form.paymentMethod || null, reference: form.reference || null, notes: form.notes || null })}
                className="flex-1 py-2 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] disabled:opacity-50">
                {create.isPending ? "Saving..." : "Add Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  BANKING TAB                                                    */
/* ══════════════════════════════════════════════════════════════ */
const emptyBankForm = () => ({ name: "", accountType: "checking", bankName: "", accountNumber: "", routingNumber: "", openingBalance: "0", currentBalance: "0", currency: "USD", notes: "" });

function BankingTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => apiFetch("/api/bank-accounts") });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyBankForm());
  const [editId, setEditId] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: (body: object) => apiPost("/api/bank-accounts", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-accounts"] }); setShowForm(false); setForm(emptyBankForm()); },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiPatch(`/api/bank-accounts/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-accounts"] }); setEditId(null); setForm(emptyBankForm()); setShowForm(false); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/bank-accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });

  const accounts: any[] = data ?? [];
  const totalBalance = accounts.filter(a => a.isActive).reduce((s, a) => s + a.currentBalance, 0);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openEdit = (a: any) => {
    setForm({ name: a.name, accountType: a.accountType, bankName: a.bankName ?? "", accountNumber: a.accountNumber ?? "", routingNumber: a.routingNumber ?? "", openingBalance: String(a.openingBalance), currentBalance: String(a.currentBalance), currency: a.currency, notes: a.notes ?? "" });
    setEditId(a.id);
    setShowForm(true);
  };

  const inputCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400";
  const selectCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400";

  const typeIcon: Record<string, React.ElementType> = { checking: Building2, savings: PiggyBank, credit: CreditCard, cash: Wallet, other: DollarSign };
  const typeColor: Record<string, string> = { checking: "bg-blue-500", savings: "bg-emerald-500", credit: "bg-red-500", cash: "bg-amber-500", other: "bg-slate-500" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="glass-card px-5 py-3 flex items-center gap-3">
          <Building2 size={18} className="text-slate-500" />
          <div>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Bank Balance</p>
            <p className="text-slate-800 font-bold text-xl">{formatCurrency(totalBalance)}</p>
          </div>
        </div>
        <button onClick={() => { setEditId(null); setForm(emptyBankForm()); setShowForm(true); }} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
          <Plus size={14} /> Add Account
        </button>
      </div>

      {isLoading ? (
        <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
      ) : accounts.length === 0 ? (
        <div className="glass-card p-10 text-center text-slate-400 text-sm">No bank accounts added yet</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {accounts.map((a: any) => {
            const Icon = typeIcon[a.accountType] ?? DollarSign;
            return (
              <div key={a.id} className="glass-card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeColor[a.accountType] ?? "bg-slate-500"}`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-slate-800 font-bold">{a.name}</p>
                      <p className="text-slate-400 text-xs">{a.bankName ? `${a.bankName} · ` : ""}{a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"><Edit size={13} /></button>
                    <button onClick={() => { if (confirm("Delete this bank account?")) del.mutate(a.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Current Balance</p>
                    <p className={`font-bold text-base ${a.currentBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(a.currentBalance)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Opening Balance</p>
                    <p className="font-semibold text-slate-600">{formatCurrency(a.openingBalance)}</p>
                  </div>
                </div>
                {a.accountNumber && (
                  <p className="text-xs text-slate-400 font-mono">••••{a.accountNumber.slice(-4)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-bold text-base">{editId ? "Edit Account" : "Add Bank Account"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 font-semibold">Account Name *</label><input className={inputCls} placeholder="e.g. Business Checking" value={form.name} onChange={set("name")} /></div>
              <div>
                <label className="text-xs text-slate-500 font-semibold">Account Type</label>
                <select className={selectCls} value={form.accountType} onChange={set("accountType")}>
                  {["checking","savings","credit","cash","other"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 font-semibold">Bank Name</label><input className={inputCls} placeholder="e.g. Chase, Wells Fargo" value={form.bankName} onChange={set("bankName")} /></div>
              <div><label className="text-xs text-slate-500 font-semibold">Currency</label>
                <select className={selectCls} value={form.currency} onChange={set("currency")}>
                  {["USD","EUR","GBP","CAD","AUD","JPY","INR"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 font-semibold">Account Number</label><input className={inputCls} placeholder="****1234" value={form.accountNumber} onChange={set("accountNumber")} /></div>
              <div><label className="text-xs text-slate-500 font-semibold">Routing Number</label><input className={inputCls} placeholder="021000021" value={form.routingNumber} onChange={set("routingNumber")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500 font-semibold">Opening Balance ($)</label><input type="number" step="0.01" className={inputCls} value={form.openingBalance} onChange={set("openingBalance")} /></div>
              <div><label className="text-xs text-slate-500 font-semibold">Current Balance ($)</label><input type="number" step="0.01" className={inputCls} value={form.currentBalance} onChange={set("currentBalance")} /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                disabled={!form.name || create.isPending || update.isPending}
                onClick={() => {
                  const body = { name: form.name, accountType: form.accountType, bankName: form.bankName || null, accountNumber: form.accountNumber || null, routingNumber: form.routingNumber || null, openingBalance: Number(form.openingBalance), currentBalance: Number(form.currentBalance), currency: form.currency, notes: form.notes || null };
                  if (editId) update.mutate({ id: editId, body });
                  else create.mutate(body);
                }}
                className="flex-1 py-2 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] disabled:opacity-50">
                {editId ? "Save Changes" : "Add Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  REPORTS TAB                                                    */
/* ══════════════════════════════════════════════════════════════ */
function ReportsTab() {
  const [section, setSection] = useState<"customer" | "product" | "pnl">("customer");
  const [calcRevenue, setCalcRevenue] = useState<string>("");
  const [calcCost, setCalcCost] = useState<string>("");
  const { data: custRev } = useQuery({ queryKey: ["accounting-customer-revenue"], queryFn: () => apiFetch("/api/accounting/customer-revenue") });
  const { data: prodProfit } = useQuery({ queryKey: ["accounting-product-profit"], queryFn: () => apiFetch("/api/accounting/product-profit") });
  const { data: pnl } = useQuery({ queryKey: ["accounting-pnl"], queryFn: () => apiFetch("/api/accounting/pnl") });
  const revenue = Number(calcRevenue || 0);
  const cost = Number(calcCost || 0);
  const grossProfit = revenue - cost;
  const margin = cost > 0 ? (grossProfit / cost) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {([["customer","Customer Revenue"],["product","Product Profitability"],["pnl","P&L Summary"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${section === id ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>{label}</button>
        ))}
      </div>

      {section === "customer" && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Customer","Invoices","Total Revenue","Paid","Outstanding"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(custRev ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No customer revenue data yet</td></tr>
              ) : (custRev ?? []).map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-slate-500">{r.invoiceCount}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(r.revenue)}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold">{formatCurrency(r.paid)}</td>
                  <td className="px-4 py-3 text-amber-600 font-semibold">{r.outstanding > 0 ? formatCurrency(r.outstanding) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === "product" && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Product","SKU","Units Sold","Revenue","COGS","Gross Profit","Margin","Stock"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(prodProfit ?? []).length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">No sales data yet. Paid invoices with products will appear here.</td></tr>
              ) : (prodProfit ?? []).map((p: any, i: number) => {
                const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-800 font-medium">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.sku ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{p.sold}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(p.revenue)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatCurrency(p.cogs)}</td>
                    <td className={`px-4 py-3 font-bold ${p.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(p.profit)}</td>
                    <td className={`px-4 py-3 font-semibold text-sm ${Number(margin) >= 30 ? "text-emerald-600" : Number(margin) >= 0 ? "text-yellow-600" : "text-red-500"}`}>{margin}%</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{p.stockQty}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {section === "pnl" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-6 flex flex-col gap-4">
            <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Profit &amp; Loss Summary</p>
            <div className="flex flex-col gap-0 border border-slate-200 rounded-xl overflow-hidden">
            {[
              { label: "Gross Revenue", value: pnl?.revenue, color: "text-emerald-600" },
              { label: "Cost of Goods Sold (COGS)", value: -(pnl?.cogs ?? 0), color: "text-slate-600" },
              { label: "Gross Profit", value: pnl?.grossProfit, color: "text-blue-600", bold: true },
              { label: "Operating Expenses", value: -(pnl?.expenses ?? 0), color: "text-rose-600" },
            ].map(row => (
              <div key={row.label} className="flex justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-500">{row.label}</span>
                <span className={`text-sm font-semibold ${row.color} ${row.bold ? "font-bold" : ""}`}>{formatCurrency(row.value ?? 0)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-4 bg-slate-800">
              <span className="text-white font-bold">Net Profit</span>
              <span className={`font-black text-lg ${(pnl?.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(pnl?.netProfit ?? 0)}</span>
            </div>
          </div>
          </div>
          <div className="glass-card p-6 flex flex-col gap-4">
            <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Profit Calculator</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 font-semibold">Expected Revenue</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcRevenue}
                  onChange={(e) => setCalcRevenue(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold">Purchase Cost</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcCost}
                  onChange={(e) => setCalcCost(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex justify-between px-4 py-2.5 border-b border-slate-100">
                <span className="text-sm text-slate-500">Purchase Cost</span>
                <span className="text-sm font-semibold text-slate-800">{formatCurrency(cost)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 border-b border-slate-100">
                <span className="text-sm text-slate-500">Expected Revenue</span>
                <span className="text-sm font-semibold text-slate-800">{formatCurrency(revenue)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-slate-50">
                <span className="text-sm font-semibold text-slate-700">Gross Profit</span>
                <span className={`text-sm font-bold ${grossProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {grossProfit >= 0 ? "+" : ""}{formatCurrency(grossProfit)} ({margin.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                      */
/* ══════════════════════════════════════════════════════════════ */
export default function Accounting() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <Layout>
      <Header title="Accounting" subtitle="Financial management & reporting" />
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-[hsl(220_25%_97%)]">
        {/* Tab bar */}
        <div className="px-5 pt-4 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all -mb-px ${
                    tab === t.id
                      ? "border-[hsl(224_50%_15%)] text-[hsl(224_50%_15%)]"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}>
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-5">
          {tab === "overview"  && <OverviewTab />}
          {tab === "ledger"    && <LedgerTab />}
          {tab === "ar"        && <ARTab />}
          {tab === "ap"        && <APTab />}
          {tab === "cashflow"  && <CashFlowTab />}
          {tab === "expenses"  && <ExpensesTab />}
          {tab === "banking"   && <BankingTab />}
          {tab === "reports"   && <ReportsTab />}
        </div>
      </div>
    </Layout>
  );
}
