import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListInvoices, useListBills, useListCustomers, useListVendors, useListPurchaseOrders, useListShipments, useListQuotes, useUpdateInvoice, getListInvoicesQueryKey } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign,
  ArrowUpRight, ArrowDownRight, Plus, Trash2, Edit, BarChart2,
  Building2, CreditCard, Wallet, PiggyBank, Receipt,
  Package, X, Users, Store, Table2, Download, Filter, Search,
  Pencil, Check, AlertTriangle, Palette, History,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
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

type Tab = "overview" | "overdues" | "ledger" | "ar" | "ap" | "cashflow" | "expenses" | "banking" | "reports" | "orderledger";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",    label: "Overview",           icon: BarChart2      },
  { id: "overdues",    label: "Overdues & Pending", icon: AlertTriangle  },
  { id: "orderledger", label: "Order Ledger",       icon: Table2         },
  { id: "ledger",      label: "General Ledger",     icon: BookOpen       },
  { id: "ar",          label: "Receivables",        icon: ArrowUpRight   },
  { id: "ap",          label: "Payables",           icon: ArrowDownRight },
  { id: "cashflow",    label: "Cash Flow",          icon: TrendingUp     },
  { id: "expenses",    label: "Expenses",           icon: Receipt        },
  { id: "banking",     label: "Banking",            icon: Building2      },
  { id: "reports",     label: "Reports",            icon: BarChart2      },
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
function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

const ACCT_QUERY_OPTS = { refetchInterval: 30000, staleTime: 10000, retry: 2 } as const;

function OverviewTab() {
  const { data: pnl } = useQuery({ queryKey: ["accounting-pnl"], queryFn: () => apiFetch("/api/accounting/pnl"), ...ACCT_QUERY_OPTS });
  const { data: ar } = useQuery({ queryKey: ["accounting-ar"], queryFn: () => apiFetch("/api/accounting/ar-aging"), ...ACCT_QUERY_OPTS });
  const { data: ap } = useQuery({ queryKey: ["accounting-ap"], queryFn: () => apiFetch("/api/accounting/ap-aging"), ...ACCT_QUERY_OPTS });
  const { data: banks } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => apiFetch("/api/bank-accounts"), ...ACCT_QUERY_OPTS });
  const { data: invoices } = useListInvoices({ query: ACCT_QUERY_OPTS });
  const { data: bills } = useListBills({ query: ACCT_QUERY_OPTS });
  const { data: customers } = useListCustomers({ query: ACCT_QUERY_OPTS });
  const { data: vendors } = useListVendors({ query: ACCT_QUERY_OPTS });

  const totalAR = (ar ?? []).reduce((s: number, r: any) => s + r.total, 0);
  const totalAP = (ap ?? []).reduce((s: number, r: any) => s + r.total, 0);
  const totalBankBalance = (banks ?? []).filter((b: any) => b.isActive).reduce((s: number, b: any) => s + b.currentBalance, 0);
  const overdueAR = (ar ?? []).filter((r: any) => r.bucket !== "current").reduce((s: number, r: any) => s + r.total, 0);

  const customerMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of (customers ?? [])) m.set(Number((c as any).id), c);
    return m;
  }, [customers]);

  const vendorMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const v of (vendors ?? [])) m.set(Number((v as any).id), v);
    return m;
  }, [vendors]);

  const customerOwed = useMemo(() => {
    const map = new Map<number, { name: string; company: string; total: number; oldestDue: string | null }>();
    const now = Date.now();
    for (const inv of ((invoices ?? []) as any[])) {
      if (inv.status === "paid" || inv.status === "cancelled") continue;
      const cid = Number(inv.customerId);
      const c = customerMap.get(cid);
      const company = (c?.company || c?.name || inv.customerName || "—");
      const entry = map.get(cid) ?? { name: c?.name || inv.customerName || "—", company, total: 0, oldestDue: null };
      entry.total += Number(inv.total ?? 0);
      if (inv.dueDate) {
        if (!entry.oldestDue || new Date(inv.dueDate) < new Date(entry.oldestDue)) entry.oldestDue = inv.dueDate;
      }
      map.set(cid, entry);
    }
    return Array.from(map.entries())
      .map(([id, e]) => ({
        id, type: "customer" as const, counterparty: e.company,
        subname: e.company !== e.name ? e.name : null,
        total: e.total,
        dueDate: e.oldestDue,
        daysOverdue: e.oldestDue ? Math.max(0, Math.floor((Date.now() - new Date(e.oldestDue).getTime()) / 86400000)) : 0,
      }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [invoices, customerMap]);

  const vendorOwed = useMemo(() => {
    const map = new Map<number, { name: string; company: string; total: number; oldestDue: string | null }>();
    for (const bill of ((bills ?? []) as any[])) {
      if (bill.status === "paid" || bill.status === "cancelled") continue;
      const vid = Number(bill.vendorId);
      const v = vendorMap.get(vid);
      const company = (v?.company || v?.name || bill.vendorName || "—");
      const entry = map.get(vid) ?? { name: v?.name || bill.vendorName || "—", company, total: 0, oldestDue: null };
      entry.total += Number(bill.total ?? bill.amount ?? 0);
      if (bill.dueDate) {
        if (!entry.oldestDue || new Date(bill.dueDate) < new Date(entry.oldestDue)) entry.oldestDue = bill.dueDate;
      }
      map.set(vid, entry);
    }
    return Array.from(map.entries())
      .map(([id, e]) => ({
        id, type: "vendor" as const, counterparty: e.company,
        subname: e.company !== e.name ? e.name : null,
        total: e.total,
        dueDate: e.oldestDue,
        daysOverdue: e.oldestDue ? Math.max(0, Math.floor((Date.now() - new Date(e.oldestDue).getTime()) / 86400000)) : 0,
      }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [bills, vendorMap]);

  const totalCustomerOwed = customerOwed.reduce((s, r) => s + r.total, 0);
  const totalVendorOwed = vendorOwed.reduce((s, r) => s + r.total, 0);

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

      {/* Owed Section */}
      <div className="grid grid-cols-2 gap-4">
        {/* Customers who owe us (AR) */}
        <div className="glass-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center"><Users size={13} className="text-white" /></div>
              <p className="text-slate-700 font-semibold text-sm">Customers Owe Us</p>
            </div>
            <span className="text-indigo-700 font-bold text-sm">{formatCurrency(totalCustomerOwed)}</span>
          </div>
          {customerOwed.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-4">No outstanding customer balances</p>
          ) : (
            <div className="overflow-y-auto max-h-56">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-1.5 text-left text-slate-400 font-medium text-[10px] uppercase tracking-wider">Customer</th>
                    <th className="pb-1.5 text-left text-slate-400 font-medium text-[10px] uppercase tracking-wider">Oldest Due</th>
                    <th className="pb-1.5 text-left text-slate-400 font-medium text-[10px] uppercase tracking-wider">Aging</th>
                    <th className="pb-1.5 text-right text-slate-400 font-medium text-[10px] uppercase tracking-wider">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOwed.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-2">
                        <p className="text-slate-800 font-medium">{r.counterparty}</p>
                        {r.subname && <p className="text-slate-400 text-[10px]">{r.subname}</p>}
                      </td>
                      <td className="py-2 text-slate-500 pr-2">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                      <td className="py-2 pr-2"><AgingBadge bucket={agingBucket(r.daysOverdue)} /></td>
                      <td className="py-2 text-right font-semibold text-indigo-700">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Vendors we owe (AP) */}
        <div className="glass-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center"><Store size={13} className="text-white" /></div>
              <p className="text-slate-700 font-semibold text-sm">We Owe Vendors</p>
            </div>
            <span className="text-amber-700 font-bold text-sm">{formatCurrency(totalVendorOwed)}</span>
          </div>
          {vendorOwed.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-4">No outstanding vendor balances</p>
          ) : (
            <div className="overflow-y-auto max-h-56">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-1.5 text-left text-slate-400 font-medium text-[10px] uppercase tracking-wider">Vendor</th>
                    <th className="pb-1.5 text-left text-slate-400 font-medium text-[10px] uppercase tracking-wider">Oldest Due</th>
                    <th className="pb-1.5 text-left text-slate-400 font-medium text-[10px] uppercase tracking-wider">Aging</th>
                    <th className="pb-1.5 text-right text-slate-400 font-medium text-[10px] uppercase tracking-wider">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorOwed.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-2">
                        <p className="text-slate-800 font-medium">{r.counterparty}</p>
                        {r.subname && <p className="text-slate-400 text-[10px]">{r.subname}</p>}
                      </td>
                      <td className="py-2 text-slate-500 pr-2">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                      <td className="py-2 pr-2"><AgingBadge bucket={agingBucket(r.daysOverdue)} /></td>
                      <td className="py-2 text-right font-semibold text-amber-700">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
/*  OVERDUES & PENDING TAB                                         */
/* ══════════════════════════════════════════════════════════════ */
function OverduesTab() {
  const { data: invoices } = useListInvoices({ query: ACCT_QUERY_OPTS });
  const { data: bills } = useListBills({ query: ACCT_QUERY_OPTS });
  const { data: customers } = useListCustomers({ query: ACCT_QUERY_OPTS });
  const { data: vendors } = useListVendors({ query: ACCT_QUERY_OPTS });

  const customerMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of (customers ?? [])) m.set(Number((c as any).id), c);
    return m;
  }, [customers]);

  const vendorMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const v of (vendors ?? [])) m.set(Number((v as any).id), v);
    return m;
  }, [vendors]);

  const overdueAR = useMemo(() => {
    const now = Date.now();
    return ((invoices ?? []) as any[])
      .filter(inv => {
        if (inv.status === "paid" || inv.status === "cancelled") return false;
        if (!inv.dueDate) return false;
        return new Date(inv.dueDate).getTime() < now;
      })
      .map(inv => {
        const c = customerMap.get(Number(inv.customerId));
        const daysOverdue = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
        return { id: inv.id, ref: inv.invoiceNumber || `FRZI-${inv.id}`, party: c?.company || c?.name || inv.customerName || "—", dueDate: inv.dueDate, daysOverdue, amount: Number(inv.total ?? 0), type: "ar" as const, status: inv.status };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [invoices, customerMap]);

  const pendingAP = useMemo(() => {
    const now = Date.now();
    return ((bills ?? []) as any[])
      .filter(b => b.status !== "paid" && b.status !== "cancelled")
      .map(b => {
        const v = vendorMap.get(Number(b.vendorId));
        const daysOverdue = b.dueDate ? Math.max(0, Math.floor((now - new Date(b.dueDate).getTime()) / 86400000)) : 0;
        return { id: b.id, ref: b.billNumber || `BILL-${b.id}`, party: v?.company || v?.name || b.vendorName || "—", dueDate: b.dueDate, daysOverdue, amount: Number(b.total ?? b.amount ?? 0), type: "ap" as const, status: b.status };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [bills, vendorMap]);

  const totalOverdueAR = overdueAR.reduce((s, r) => s + r.amount, 0);
  const totalPendingAP = pendingAP.reduce((s, r) => s + r.amount, 0);

  const agingBucketColor = (d: number) =>
    d <= 0 ? "text-emerald-600" : d <= 30 ? "text-yellow-600" : d <= 60 ? "text-orange-600" : "text-red-600";

  const combined = [...overdueAR.map(r => ({ ...r, label: "AR" })), ...pendingAP.map(r => ({ ...r, label: "AP" }))]
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const chartData = [
    { name: "Overdue AR", value: totalOverdueAR, fill: "#ef4444" },
    { name: "Pending AP", value: totalPendingAP, fill: "#f59e0b" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Overdue Receivables" value={formatCurrency(totalOverdueAR)} sub={`${overdueAR.length} invoices overdue`} icon={AlertTriangle} color="bg-red-500" />
        <StatCard label="Pending Payables" value={formatCurrency(totalPendingAP)} sub={`${pendingAP.length} bills unpaid`} icon={ArrowDownRight} color="bg-amber-500" />
        <StatCard label="Total Exposure" value={formatCurrency(totalOverdueAR + totalPendingAP)} sub="Combined AR + AP" icon={DollarSign} color="bg-slate-600" />
      </div>

      {(totalOverdueAR > 0 || totalPendingAP > 0) && (
        <div className="glass-card p-5">
          <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">Overdue vs Pending Summary</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 80, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} stroke="#e2e8f0" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} stroke="none" width={120} />
              <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Amount"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "#475569", formatter: (v: any) => `$${Math.round(v).toLocaleString()}` }}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-500" />
          <span className="text-slate-700 font-semibold text-sm">All Overdue & Pending Items</span>
          <span className="ml-auto text-xs text-slate-400">{combined.length} item{combined.length !== 1 ? "s" : ""}</span>
        </div>
        {combined.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No overdue or pending items — you're all caught up!</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[68vh] scrollbar-hide">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Type","Ref","Party","Due Date","Days Overdue","Status","Amount"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combined.map((r, i) => (
                <tr key={`${r.type}-${r.id}-${i}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${r.label === "AR" ? "text-indigo-700 bg-indigo-50 border-indigo-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>{r.label}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.ref}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{r.party}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                  <td className={`px-4 py-3 text-xs font-semibold ${agingBucketColor(r.daysOverdue)}`}>
                    {r.daysOverdue > 0 ? `${r.daysOverdue}d overdue` : "Due today"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize text-slate-600 bg-slate-50 border-slate-200">{r.status}</span>
                  </td>
                  <td className={`px-4 py-3 font-bold text-right ${r.label === "AR" ? "text-indigo-700" : "text-amber-700"}`}>{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-slate-600">Total</td>
                <td className="px-4 py-3 font-bold text-slate-800 text-right">{formatCurrency(totalOverdueAR + totalPendingAP)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>
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
          <div className="overflow-x-auto overflow-y-auto max-h-[68vh] scrollbar-hide">
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
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  AR AGING TAB                                                   */
/* ══════════════════════════════════════════════════════════════ */
const METHOD_LABELS: Record<string, string> = {
  stripe: "Credit Card (Stripe)",
  bank_transfer: "Bank Transfer",
  check: "Check",
  cash: "Cash",
};
const METHOD_COLORS: Record<string, string> = {
  stripe: "text-indigo-700 bg-indigo-50 border-indigo-200",
  bank_transfer: "text-blue-700 bg-blue-50 border-blue-200",
  check: "text-amber-700 bg-amber-50 border-amber-200",
  cash: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

function PaymentHistorySection() {
  const { data, isLoading } = useQuery({
    queryKey: ["payments-history"],
    queryFn: () => apiFetch("/api/payments"),
    refetchInterval: 30000,
  });
  const payments: any[] = data ?? [];

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <CreditCard size={14} className="text-emerald-600" />
        <span className="text-slate-700 font-semibold text-sm">Payment History</span>
        <span className="ml-auto text-xs text-slate-400">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
      </div>
      {isLoading ? (
        <div className="p-8 flex justify-center"><div className="animate-spin w-5 h-5 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
      ) : payments.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">No payments recorded yet</div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-72 scrollbar-hide">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Date","Invoice #","Customer","Amount","Method","Reference"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(p.paidAt)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.invoiceNumber ?? `INV-${p.invoiceId}`}</td>
                  <td className="px-4 py-2.5 text-slate-800 font-medium">{p.customerName ?? `Customer #${p.customerId}`}</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${METHOD_COLORS[p.method] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                      {METHOD_LABELS[p.method] ?? p.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400 max-w-[140px] truncate">
                    {p.stripeChargeId ?? p.stripePaymentIntentId ?? p.stripeCheckoutSessionId ?? p.note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ARTab() {
  const { data, isLoading } = useQuery({ queryKey: ["accounting-ar"], queryFn: () => apiFetch("/api/accounting/ar-aging") });
  const [bucketFilter, setBucketFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const rows: any[] = data ?? [];
  const buckets = ["current","1-30","31-60","61-90","90+"];
  const bucketTotals = buckets.map(b => ({ bucket: b, total: rows.filter(r => r.bucket === b).reduce((s, r) => s + r.total, 0), count: rows.filter(r => r.bucket === b).length }));
  const bucketColors: Record<string, string> = { current: "#10b981", "1-30": "#f59e0b", "31-60": "#f97316", "61-90": "#ef4444", "90+": "#b91c1c" };
  const filteredRows = useMemo(() => {
    let result = bucketFilter === "all" ? rows : rows.filter((r: any) => r.bucket === bucketFilter);
    if (dateFrom) result = result.filter((r: any) => r.dueDate && r.dueDate.slice(0,10) >= dateFrom);
    if (dateTo)   result = result.filter((r: any) => r.dueDate && r.dueDate.slice(0,10) <= dateTo);
    return result;
  }, [rows, bucketFilter, dateFrom, dateTo]);
  const total = rows.reduce((s: number, r: any) => s + r.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">AR Aging Breakdown</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bucketTotals} margin={{ left: 0, right: 20, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={b => b === "current" ? "Current" : `${b}d`} stroke="#e2e8f0" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} stroke="none" />
              <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Outstanding"]} labelFormatter={l => l === "current" ? "Current" : `${l} days overdue`} />
              <Bar dataKey="total" radius={[4,4,0,0]} onClick={(d: any) => setBucketFilter(prev => prev === d.bucket ? "all" : d.bucket)}>
                {bucketTotals.map((b, i) => <Cell key={i} fill={bucketColors[b.bucket] ?? "#94a3b8"} opacity={bucketFilter === "all" || bucketFilter === b.bucket ? 1 : 0.35} style={{ cursor: "pointer" }} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 text-center mt-1">Click a bar to filter · Total: <strong className="text-slate-600">{formatCurrency(total)}</strong></p>
        </div>
        <div className="grid grid-cols-1 gap-2 content-start">
          {bucketTotals.map(b => (
            <button key={b.bucket} onClick={() => setBucketFilter(prev => prev === b.bucket ? "all" : b.bucket)}
              className={`glass-card p-3 flex items-center gap-3 text-left transition-all ${bucketFilter === b.bucket ? "ring-2 ring-blue-400" : "hover:shadow-md"}`}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: bucketColors[b.bucket] }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{b.bucket === "current" ? "Current" : `${b.bucket} days`}</p>
                <p className={`font-bold text-base ${b.bucket === "current" ? "text-emerald-600" : b.bucket === "1-30" ? "text-yellow-600" : "text-red-600"}`}>{formatCurrency(b.total)}</p>
              </div>
              <span className="text-xs text-slate-400">{b.count} inv.</span>
            </button>
          ))}
        </div>
      </div>
      {/* AR Date Range Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400" />
        <span className="text-slate-400 text-xs">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">✕ Clear</button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No outstanding receivables</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[68vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Invoice #","Customer","Due Date","Days Overdue","Aging","Amount"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r: any) => (
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
                <td className="px-4 py-3 font-bold text-slate-800 text-right">{formatCurrency(filteredRows.reduce((s: number, r: any) => s + r.total, 0))}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>

      <PaymentHistorySection />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  AP AGING TAB                                                   */
/* ══════════════════════════════════════════════════════════════ */
function APTab() {
  const { data, isLoading } = useQuery({ queryKey: ["accounting-ap"], queryFn: () => apiFetch("/api/accounting/ap-aging") });
  const [bucketFilter, setBucketFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const rows: any[] = data ?? [];
  const buckets = ["current","1-30","31-60","61-90","90+"];
  const bucketTotals = buckets.map(b => ({ bucket: b, total: rows.filter(r => r.bucket === b).reduce((s, r) => s + r.total, 0), count: rows.filter(r => r.bucket === b).length }));
  const bucketColors: Record<string, string> = { current: "#10b981", "1-30": "#f59e0b", "31-60": "#f97316", "61-90": "#ef4444", "90+": "#b91c1c" };
  const filteredRows = useMemo(() => {
    let result = bucketFilter === "all" ? rows : rows.filter((r: any) => r.bucket === bucketFilter);
    if (dateFrom) result = result.filter((r: any) => r.dueDate && r.dueDate.slice(0,10) >= dateFrom);
    if (dateTo)   result = result.filter((r: any) => r.dueDate && r.dueDate.slice(0,10) <= dateTo);
    return result;
  }, [rows, bucketFilter, dateFrom, dateTo]);
  const total = rows.reduce((s: number, r: any) => s + r.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider mb-3">AP Aging Breakdown</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bucketTotals} margin={{ left: 0, right: 20, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={b => b === "current" ? "Current" : `${b}d`} stroke="#e2e8f0" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} stroke="none" />
              <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Outstanding"]} labelFormatter={l => l === "current" ? "Current" : `${l} days overdue`} />
              <Bar dataKey="total" radius={[4,4,0,0]} onClick={(d: any) => setBucketFilter(prev => prev === d.bucket ? "all" : d.bucket)}>
                {bucketTotals.map((b, i) => <Cell key={i} fill={bucketColors[b.bucket] ?? "#94a3b8"} opacity={bucketFilter === "all" || bucketFilter === b.bucket ? 1 : 0.35} style={{ cursor: "pointer" }} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 text-center mt-1">Click a bar to filter · Total: <strong className="text-slate-600">{formatCurrency(total)}</strong></p>
        </div>
        <div className="grid grid-cols-1 gap-2 content-start">
          {bucketTotals.map(b => (
            <button key={b.bucket} onClick={() => setBucketFilter(prev => prev === b.bucket ? "all" : b.bucket)}
              className={`glass-card p-3 flex items-center gap-3 text-left transition-all ${bucketFilter === b.bucket ? "ring-2 ring-blue-400" : "hover:shadow-md"}`}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: bucketColors[b.bucket] }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{b.bucket === "current" ? "Current" : `${b.bucket} days`}</p>
                <p className={`font-bold text-base ${b.bucket === "current" ? "text-emerald-600" : b.bucket === "1-30" ? "text-yellow-600" : "text-red-600"}`}>{formatCurrency(b.total)}</p>
              </div>
              <span className="text-xs text-slate-400">{b.count} bills</span>
            </button>
          ))}
        </div>
      </div>
      {/* AP Date Range Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400" />
        <span className="text-slate-400 text-xs">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">✕ Clear</button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">No outstanding payables</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[68vh]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {["Bill #","Vendor","Due Date","Days Overdue","Aging","Amount"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r: any) => (
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
                <td className="px-4 py-3 font-bold text-slate-800 text-right">{formatCurrency(filteredRows.reduce((s: number, r: any) => s + r.total, 0))}</td>
              </tr>
            </tfoot>
          </table>
          </div>
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
          <div className="overflow-x-auto overflow-y-auto max-h-[68vh] scrollbar-hide">
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
          </div>
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
  const [custSearch, setCustSearch] = useState<string>("");
  const { data: custRev } = useQuery({ queryKey: ["accounting-customer-revenue"], queryFn: () => apiFetch("/api/accounting/customer-revenue") });
  const { data: prodProfit } = useQuery({ queryKey: ["accounting-product-profit"], queryFn: () => apiFetch("/api/accounting/product-profit") });
  const { data: pnl } = useQuery({ queryKey: ["accounting-pnl"], queryFn: () => apiFetch("/api/accounting/pnl") });
  const revenue = Number(calcRevenue || 0);
  const cost = Number(calcCost || 0);
  const grossProfit = revenue - cost;
  const margin = cost > 0 ? (grossProfit / cost) * 100 : 0;
  const filteredCustRev = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return (custRev ?? []) as any[];
    return ((custRev ?? []) as any[]).filter(r => r.name?.toLowerCase().includes(q));
  }, [custRev, custSearch]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {([["customer","Customer Revenue"],["product","Product Profitability"],["pnl","P&L Summary"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${section === id ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>{label}</button>
        ))}
      </div>

      {section === "customer" && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search customers…"
              value={custSearch}
              onChange={e => setCustSearch(e.target.value)}
              className="w-full max-w-sm pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-slate-400"
            />
            {custSearch && (
              <button onClick={() => setCustSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-[68vh] scrollbar-hide">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["Customer","Invoices","Total Revenue","Paid","Outstanding"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustRev.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">{custSearch ? "No customers match your search" : "No customer revenue data yet"}</td></tr>
                ) : filteredCustRev.map((r: any, i: number) => (
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
          </div>
        </div>
      )}

      {section === "product" && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[68vh] scrollbar-hide">
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
/*  ORDER LEDGER TAB                                              */
/* ══════════════════════════════════════════════════════════════ */

const OL_STATUS: Record<string, string> = {
  paid:      "text-emerald-700 bg-emerald-50 border-emerald-200",
  sent:      "text-blue-700 bg-blue-50 border-blue-200",
  draft:     "text-slate-500 bg-slate-50 border-slate-200",
  overdue:   "text-red-700 bg-red-50 border-red-200",
  pending:   "text-amber-700 bg-amber-50 border-amber-200",
  cancelled: "text-slate-400 bg-slate-50 border-slate-200",
};

const OL_ROW: Record<string, { bg: string; border: string }> = {
  paid:      { bg: "bg-emerald-50",  border: "border-l-[3px] border-l-emerald-400" },
  draft:     { bg: "bg-slate-50",    border: "border-l-[3px] border-l-slate-300"   },
  overdue:   { bg: "bg-red-50",      border: "border-l-[3px] border-l-red-400"     },
  pending:   { bg: "bg-amber-50",    border: "border-l-[3px] border-l-amber-400"   },
  cancelled: { bg: "bg-slate-100",   border: "border-l-[3px] border-l-slate-200"   },
  sent:      { bg: "bg-blue-50",     border: "border-l-[3px] border-l-blue-400"    },
  received:  { bg: "bg-violet-50",   border: "border-l-[3px] border-l-violet-400"  },
  shipped:   { bg: "bg-sky-50",      border: "border-l-[3px] border-l-sky-400"     },
};

function OrderLedgerTab() {
  const { data: invoices }       = useListInvoices();
  const { data: purchaseOrders } = useListPurchaseOrders();
  const { data: shipmentsList }  = useListShipments();
  const { data: quotesList }     = useListQuotes();
  const { data: customers }      = useListCustomers();
  const { data: vendors }        = useListVendors();
  const { data: bills }          = useListBills();

  const updateInvoice = useUpdateInvoice();
  const queryClient   = useQueryClient();

  const [filterSearch,      setFilterSearch]      = useState("");
  const [filterCustomer,    setFilterCustomer]    = useState("__all__");
  const [filterVendor,      setFilterVendor]      = useState("__all__");
  const [filterStatus,      setFilterStatus]      = useState("__all__");
  const [filterFrom,        setFilterFrom]        = useState("");
  const [filterTo,          setFilterTo]          = useState("");
  const [filterShipStatus,  setFilterShipStatus]  = useState("__all__");
  const [filterProfit,      setFilterProfit]      = useState("__all__");
  const [filterMinAmount,   setFilterMinAmount]   = useState("");
  const [filterMaxAmount,   setFilterMaxAmount]   = useState("");
  const [filterCarrier,     setFilterCarrier]     = useState("__all__");
  const [showFilters,       setShowFilters]       = useState(false);

  const [editingRemark, setEditingRemark] = useState<{ id: number; value: string } | null>(null);
  const remarkInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [customColors, setCustomColors] = useState<Record<string, string>>({});

  const toggleRow = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function saveRemark(invId: number, value: string) {
    await updateInvoice.mutateAsync({ id: invId, data: { notes: value } as any });
    await queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    setEditingRemark(null);
  }

  const customerMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of (customers ?? []) as any[]) m.set(Number(c.id), c);
    return m;
  }, [customers]);

  const vendorMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const v of (vendors ?? []) as any[]) m.set(Number(v.id), v);
    return m;
  }, [vendors]);

  const rows = useMemo(() => {
    return ((invoices ?? []) as any[]).map((inv: any) => {
      const customer  = customerMap.get(Number(inv.customerId));
      const buyerName = customer?.company || customer?.name || inv.customerName || "—";
      const accountType = customer?.accountType || "—";

      const quote = inv.quoteId
        ? ((quotesList ?? []) as any[]).find((q: any) => q.id === inv.quoteId)
        : null;

      const pos       = ((purchaseOrders ?? []) as any[]).filter((po: any) => po.sourceInvoiceId === inv.id);
      const primaryPo = pos[0] ?? null;
      const poVendor  = primaryPo ? vendorMap.get(Number(primaryPo.vendorId)) : null;
      const vendorName = poVendor?.company || poVendor?.name || primaryPo?.vendorName || "—";

      const ships      = ((shipmentsList ?? []) as any[]).filter((s: any) => s.invoiceId === inv.id);
      const primaryShip = ships[0] ?? null;

      const linkedBills = ((bills ?? []) as any[]).filter((b: any) =>
        pos.some((po: any) => po.id === b.purchaseOrderId)
      );
      const primaryBill = linkedBills.find((b: any) => b.status === "paid") ?? linkedBills[0] ?? null;

      const lineItems   = (inv.lineItems ?? []) as any[];
      const firstLi     = lineItems[0] ?? {};
      const productNames = lineItems.map((li: any) => li.description || "").filter(Boolean).join("; ") || "—";
      const totalQty    = lineItems.reduce((s: number, li: any) => s + Number(li.quantity ?? 0), 0);
      const sku         = firstLi.sku || "—";
      const unit        = firstLi.unit || "ea";
      const sellingPricePerPc = lineItems.length === 1 ? Number(firstLi.unitPrice ?? 0) : null;

      const poLineItems        = (primaryPo?.lineItems ?? []) as any[];
      const firstPoLi          = poLineItems[0] ?? {};
      const purchaseCostPerPc  = poLineItems.length === 1 ? Number(firstPoLi.unitPrice ?? 0) : null;
      const totalPurchaseCost  = Number(primaryPo?.total ?? 0);
      const actualShipping     = Number(primaryShip?.shippingCost ?? 0);
      const totalSelling       = Number(inv.total ?? 0);
      const grossProfit        = totalSelling - totalPurchaseCost - actualShipping;

      const cusPO   = inv.trackingNumber || quote?.trackingNumber || "—";
      const forezInv = inv.invoiceNumber || `FRZI-${Math.max(5100, 5099 + Number(inv.id))}`;
      const forezPO  = pos.map((po: any) => `FRZPO-${String(po.id).padStart(4, "0")}`).join(", ") || "—";

      return {
        date: inv.createdAt,
        buyerName, supplierName: vendorName,
        mfgNumber: sku, productName: productNames,
        orderQty: totalQty, units: unit,
        purchaseCostPerPc, totalPurchaseCost,
        sellingPricePerPc, totalSellingCost: totalSelling,
        shippingMethod: primaryShip?.carrier || "—",
        actualShippingCost: actualShipping,
        purchasingPaymentMethod: accountType,
        purchasingPaymentDate: primaryBill?.paidAt || null,
        paymentReceivedMethod: accountType,
        paymentReceivedDate: inv.paidAt || null,
        grossProfit, netProfit: grossProfit,
        venPromiseDate: primaryPo?.expectedDate || null,
        orderStatus: inv.status,
        cusPO, forezInv, forezPO,
        forezInvReceive: inv.paidAt || null,
        carrierName: primaryShip?.carrier || "—",
        trackingNumber: primaryShip?.trackingNumber || "—",
        shippingStatus: primaryShip?.status || "—",
        remarks: primaryPo?.notes || (inv as any).notes || "—",
        _invId: inv.id,
      };
    });
  }, [invoices, purchaseOrders, shipmentsList, quotesList, customers, vendors, bills, customerMap, vendorMap]);

  const uniqueCustomers   = useMemo(() => Array.from(new Set(rows.map(r => r.buyerName))).sort(), [rows]);
  const uniqueVendors     = useMemo(() => Array.from(new Set(rows.filter(r => r.supplierName !== "—").map(r => r.supplierName))).sort(), [rows]);
  const uniqueStatuses    = useMemo(() => Array.from(new Set(rows.map(r => r.orderStatus))).sort(), [rows]);
  const uniqueShipStatus  = useMemo(() => Array.from(new Set(rows.filter(r => r.shippingStatus !== "—").map(r => r.shippingStatus))).sort(), [rows]);
  const uniqueCarriers    = useMemo(() => Array.from(new Set(rows.filter(r => r.carrierName !== "—").map(r => r.carrierName))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    const s = filterSearch.toLowerCase();
    const minAmt = filterMinAmount ? Number(filterMinAmount) : null;
    const maxAmt = filterMaxAmount ? Number(filterMaxAmount) : null;
    return rows.filter(r => {
      if (filterCustomer   !== "__all__" && r.buyerName      !== filterCustomer)  return false;
      if (filterVendor     !== "__all__" && r.supplierName   !== filterVendor)    return false;
      if (filterStatus     !== "__all__" && r.orderStatus    !== filterStatus)    return false;
      if (filterShipStatus !== "__all__" && r.shippingStatus !== filterShipStatus) return false;
      if (filterCarrier    !== "__all__" && r.carrierName    !== filterCarrier)   return false;
      if (filterProfit === "positive" && r.grossProfit <= 0) return false;
      if (filterProfit === "negative" && r.grossProfit >= 0) return false;
      if (minAmt !== null && r.totalSellingCost < minAmt) return false;
      if (maxAmt !== null && r.totalSellingCost > maxAmt) return false;
      if (filterFrom && new Date(r.date) < new Date(filterFrom))              return false;
      if (filterTo   && new Date(r.date) > new Date(filterTo + "T23:59:59")) return false;
      if (s && ![r.buyerName, r.supplierName, r.productName, r.cusPO, r.forezInv, r.forezPO, r.trackingNumber, r.mfgNumber]
        .some(v => v?.toLowerCase().includes(s))) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rows, filterCustomer, filterVendor, filterStatus, filterShipStatus, filterCarrier, filterProfit, filterMinAmount, filterMaxAmount, filterSearch, filterFrom, filterTo]);

  const allSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r._invId));
  const someSelected = !allSelected && filteredRows.some(r => selectedIds.has(r._invId));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredRows.map(r => r._invId)));
  };

  const handleExport = () => {
    const COLS = ["Date","Buyer Name","Supplier Name","Mfg #","Product Name","Order Qty","Units",
      "Purch Cost/Pc","Total Purch Cost","Sell Price/Pc","Total Sell Cost","Ship Method",
      "Actual Ship Cost","Purch Pay Method","Purch Pay Date","Recv Pay Method","Recv Pay Date",
      "Gross Profit","Net Profit","Ven Promise Date","Order Status","Cus PO","Forez Inv",
      "Forez PO","Forez INV Receive","Carrier","Tracking #","Ship Status","Remarks"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csvRows = filteredRows.map(r => [
      esc(formatDate(r.date)), esc(r.buyerName), esc(r.supplierName), esc(r.mfgNumber), esc(r.productName),
      esc(r.orderQty), esc(r.units),
      esc(r.purchaseCostPerPc != null ? r.purchaseCostPerPc.toFixed(2) : ""),
      esc(r.totalPurchaseCost.toFixed(2)),
      esc(r.sellingPricePerPc != null ? r.sellingPricePerPc.toFixed(2) : ""),
      esc(r.totalSellingCost.toFixed(2)), esc(r.shippingMethod), esc(r.actualShippingCost.toFixed(2)),
      esc(r.purchasingPaymentMethod), esc(formatDate(r.purchasingPaymentDate)),
      esc(r.paymentReceivedMethod), esc(formatDate(r.paymentReceivedDate)),
      esc(r.grossProfit.toFixed(2)), esc(r.netProfit.toFixed(2)),
      esc(formatDate(r.venPromiseDate)), esc(r.orderStatus), esc(r.cusPO), esc(r.forezInv), esc(r.forezPO),
      esc(formatDate(r.forezInvReceive)), esc(r.carrierName), esc(r.trackingNumber), esc(r.shippingStatus), esc(r.remarks),
    ].join(","));
    const csv = [COLS.map(c => `"${c}"`).join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `order-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const TH = ({ children, right, stickyLeft, minW }: { children: React.ReactNode; right?: boolean; stickyLeft?: number; minW?: number }) => (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap bg-slate-50 border-b border-slate-100 ${right ? "text-right" : "text-left"} ${stickyLeft !== undefined ? "sticky z-20" : "sticky top-0 z-10"}`}
      style={stickyLeft !== undefined ? { left: stickyLeft, top: 0, minWidth: minW, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" } : { minWidth: minW }}
    >
      {children}
    </th>
  );
  const TD = ({ children, right, mono, muted, fw, className: cx, stickyLeft, minW }: {
    children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean; fw?: boolean; className?: string; stickyLeft?: number; minW?: number;
  }) => (
    <td
      className={`px-3 py-2.5 text-xs whitespace-nowrap border-b border-slate-100 ${stickyLeft !== undefined ? "sticky z-10 bg-inherit" : "bg-inherit"} ${right ? "text-right" : ""} ${mono ? "font-mono" : ""} ${muted ? "text-slate-400" : "text-slate-700"} ${fw ? "font-semibold text-slate-800" : ""} ${cx ?? ""}`}
      style={stickyLeft !== undefined ? { left: stickyLeft, minWidth: minW, boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" } : { minWidth: minW }}
    >
      {children}
    </td>
  );

  const activeFilters = [
    filterCustomer   !== "__all__",
    filterVendor     !== "__all__",
    filterStatus     !== "__all__",
    filterShipStatus !== "__all__",
    filterCarrier    !== "__all__",
    filterProfit     !== "__all__",
    !!filterFrom,
    !!filterTo,
    !!filterMinAmount,
    !!filterMaxAmount,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search orders, products, refs…"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${showFilters || activeFilters > 0 ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          <Filter size={13} />
          Filters
          {activeFilters > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{activeFilters}</span>
          )}
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
        >
          <Download size={13} /> Export CSV
        </button>
        <div className="relative">
          <button
            onClick={() => setShowColorPanel(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${showColorPanel || Object.keys(customColors).length > 0 ? "bg-violet-50 border-violet-200 text-violet-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Palette size={13} />
            Row Colors
            {Object.keys(customColors).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-bold">{Object.keys(customColors).length}</span>
            )}
          </button>
          {showColorPanel && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[220px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color by Status</span>
                {Object.keys(customColors).length > 0 && (
                  <button onClick={() => setCustomColors({})} className="text-[10px] font-semibold text-red-400 hover:text-red-600">Reset all</button>
                )}
              </div>
              {uniqueStatuses.map(status => (
                <div key={status} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: customColors[status] || "#e2e8f0" }} />
                  <span className="text-xs capitalize text-slate-600 flex-1">{status}</span>
                  <input
                    type="color"
                    value={customColors[status] || "#ffffff"}
                    onChange={e => setCustomColors(prev => ({ ...prev, [status]: e.target.value }))}
                    className="w-7 h-6 rounded cursor-pointer border border-slate-200 p-0"
                    title={`Set row color for "${status}"`}
                  />
                  {customColors[status] && (
                    <button
                      onClick={() => setCustomColors(prev => { const n = { ...prev }; delete n[status]; return n; })}
                      className="text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              {uniqueStatuses.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">No statuses yet</p>
              )}
            </div>
          )}
        </div>
        <span className="ml-auto text-xs text-slate-400 font-medium">{filteredRows.length} order{filteredRows.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
          <span className="text-sm font-semibold text-indigo-700">{selectedIds.size} row{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold transition-colors ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card p-4 flex flex-col gap-3">
          {/* Quick-reset + active pill */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filters</span>
            {activeFilters > 0 && (
              <button
                onClick={() => {
                  setFilterCustomer("__all__"); setFilterVendor("__all__"); setFilterStatus("__all__");
                  setFilterShipStatus("__all__"); setFilterCarrier("__all__"); setFilterProfit("__all__");
                  setFilterFrom(""); setFilterTo(""); setFilterMinAmount(""); setFilterMaxAmount("");
                }}
                className="text-[10px] font-semibold text-red-500 hover:text-red-700 transition-colors"
              >
                Clear all ({activeFilters})
              </button>
            )}
          </div>

          {/* Quick date shortcuts */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
            {[
              { label: "7d",     days: 7   },
              { label: "30d",    days: 30  },
              { label: "90d",    days: 90  },
              { label: "6mo",    days: 182 },
              { label: "1yr",    days: 365 },
              { label: "2yr",    days: 730 },
            ].map(({ label, days }) => {
              const from = new Date(); from.setDate(from.getDate() - days);
              const fStr = from.toISOString().slice(0, 10);
              const isActive = filterFrom === fStr && !filterTo;
              return (
                <button
                  key={label}
                  onClick={() => { setFilterFrom(fStr); setFilterTo(""); }}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${isActive ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"}`}
                >
                  Last {label}
                </button>
              );
            })}
            {(filterFrom || filterTo) && (
              <button onClick={() => { setFilterFrom(""); setFilterTo(""); }}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-white text-red-400 border-red-200 hover:bg-red-50 transition-colors">
                Clear dates
              </button>
            )}
          </div>

          {/* Row 1 — entity filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Customer</label>
              <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                <option value="__all__">All Customers</option>
                {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Vendor / Supplier</label>
              <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                <option value="__all__">All Vendors</option>
                {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Order Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                <option value="__all__">All Statuses</option>
                {uniqueStatuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Shipping Status</label>
              <select value={filterShipStatus} onChange={e => setFilterShipStatus(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                <option value="__all__">All Ship Status</option>
                {uniqueShipStatus.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Carrier</label>
              <select value={filterCarrier} onChange={e => setFilterCarrier(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                <option value="__all__">All Carriers</option>
                {uniqueCarriers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2 — date + amount + profit */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Date From</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Date To</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Min Amount ($)</label>
              <input type="number" min="0" step="1" placeholder="e.g. 100" value={filterMinAmount} onChange={e => setFilterMinAmount(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Max Amount ($)</label>
              <input type="number" min="0" step="1" placeholder="e.g. 5000" value={filterMaxAmount} onChange={e => setFilterMaxAmount(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Profit</label>
              <select value={filterProfit} onChange={e => setFilterProfit(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                <option value="__all__">All Orders</option>
                <option value="positive">Profitable only</option>
                <option value="negative">Loss only</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Ledger table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[62vh]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-100 px-2 py-2.5" style={{ left: 0, minWidth: 40, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.06)" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                  />
                </th>
                <TH stickyLeft={40}  minW={100}>Date</TH>
                <TH stickyLeft={140} minW={140}>Buyer Name</TH>
                <TH stickyLeft={280} minW={130}>Supplier Name</TH>
                <TH stickyLeft={410} minW={90}>Mfg #</TH>
                <TH stickyLeft={500} minW={180}>Product Name</TH>
                <TH stickyLeft={680} right minW={62}>Qty</TH>
                <TH>Units</TH>
                <TH right>Purch Cost/Pc</TH>
                <TH right>Total Purch Cost</TH>
                <TH right>Sell Price/Pc</TH>
                <TH right>Total Sell Cost</TH>
                <TH>Ship Method</TH>
                <TH right>Ship Cost</TH>
                <TH>Purch Pay Method</TH>
                <TH>Purch Pay Date</TH>
                <TH>Recv Pay Method</TH>
                <TH>Recv Pay Date</TH>
                <TH right>Gross Profit</TH>
                <TH right>Net Profit</TH>
                <TH>Ven Promise Date</TH>
                <TH>Order Status</TH>
                <TH>Cus PO</TH>
                <TH>Forez Inv</TH>
                <TH>Forez PO</TH>
                <TH>Forez INV Recv</TH>
                <TH>Carrier</TH>
                <TH>Tracking #</TH>
                <TH>Ship Status</TH>
                <TH>Remarks</TH>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={30} className="px-5 py-12 text-center text-slate-400 text-sm">
                    No orders found matching your filters.
                  </td>
                </tr>
              ) : filteredRows.map(r => {
                const customBg = customColors[r.orderStatus];
                const defaultRowStyle = OL_ROW[r.orderStatus] ?? { bg: "bg-white", border: "border-l-[3px] border-l-transparent" };
                const isSelected = selectedIds.has(r._invId);
                const isEditingRemark = editingRemark?.id === r._invId;
                const rowStyle = customBg
                  ? { bg: "", border: defaultRowStyle.border }
                  : defaultRowStyle;
                const selectedBorder = "border-l-[3px] border-l-indigo-500";
                return (
                <tr
                  key={r._invId}
                  onClick={() => toggleRow(r._invId)}
                  className={`cursor-pointer transition-colors hover:brightness-[0.97] ${isSelected ? "bg-indigo-100" : rowStyle.bg} ${isSelected ? selectedBorder : rowStyle.border}`}
                  style={!isSelected && customBg ? { backgroundColor: customBg } : undefined}
                >
                  <td className="sticky z-10 px-2 py-2 border-b border-slate-100 bg-inherit" style={{ left: 0, minWidth: 40, boxShadow: "3px 0 6px -2px rgba(0,0,0,0.08)" }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(r._invId)}
                      className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                  </td>
                  <TD mono muted stickyLeft={40}  minW={100}>{formatDate(r.date)}</TD>
                  <TD fw          stickyLeft={140} minW={140}>{r.buyerName}</TD>
                  <TD             stickyLeft={280} minW={130}>{r.supplierName}</TD>
                  <TD mono muted  stickyLeft={410} minW={90}>{r.mfgNumber}</TD>
                  <TD             stickyLeft={500} minW={180}><span className="max-w-[160px] block truncate" title={r.productName}>{r.productName}</span></TD>
                  <TD right       stickyLeft={680} minW={62}>{r.orderQty > 0 ? r.orderQty : "—"}</TD>
                  <TD muted>{r.units}</TD>
                  <TD right muted>{r.purchaseCostPerPc != null ? formatCurrency(r.purchaseCostPerPc) : "—"}</TD>
                  <TD right muted>{r.totalPurchaseCost > 0 ? formatCurrency(r.totalPurchaseCost) : "—"}</TD>
                  <TD right muted>{r.sellingPricePerPc != null ? formatCurrency(r.sellingPricePerPc) : "—"}</TD>
                  <TD right fw>{formatCurrency(r.totalSellingCost)}</TD>
                  <TD muted>{r.shippingMethod}</TD>
                  <TD right muted>{r.actualShippingCost > 0 ? formatCurrency(r.actualShippingCost) : "—"}</TD>
                  <TD muted>{r.purchasingPaymentMethod}</TD>
                  <TD mono muted>{formatDate(r.purchasingPaymentDate)}</TD>
                  <TD muted>{r.paymentReceivedMethod}</TD>
                  <TD mono muted>{formatDate(r.paymentReceivedDate)}</TD>
                  <TD right>
                    <span className={r.grossProfit >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                      {r.grossProfit >= 0 ? "+" : ""}{formatCurrency(r.grossProfit)}
                    </span>
                  </TD>
                  <TD right>
                    <span className={r.netProfit >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                      {r.netProfit >= 0 ? "+" : ""}{formatCurrency(r.netProfit)}
                    </span>
                  </TD>
                  <TD mono muted>{formatDate(r.venPromiseDate)}</TD>
                  <TD>
                    <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${OL_STATUS[r.orderStatus] ?? OL_STATUS.draft}`}>
                      {r.orderStatus}
                    </span>
                  </TD>
                  <TD mono muted>{r.cusPO}</TD>
                  <TD mono>{r.forezInv}</TD>
                  <TD mono muted>{r.forezPO}</TD>
                  <TD mono muted>{formatDate(r.forezInvReceive)}</TD>
                  <TD muted>{r.carrierName}</TD>
                  <TD mono muted>{r.trackingNumber}</TD>
                  <TD muted>{r.shippingStatus}</TD>
                  <td className="px-2 py-2 text-xs whitespace-nowrap border-b border-slate-50 min-w-[140px]" onClick={e => e.stopPropagation()}>
                    {isEditingRemark ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={remarkInputRef}
                          autoFocus
                          value={editingRemark.value}
                          onChange={e => setEditingRemark(prev => prev ? { ...prev, value: e.target.value } : null)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveRemark(r._invId, editingRemark.value);
                            if (e.key === "Escape") setEditingRemark(null);
                          }}
                          className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-blue-500 min-w-0"
                          placeholder="Add remark…"
                        />
                        <button onClick={() => saveRemark(r._invId, editingRemark.value)}
                          className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50 flex-shrink-0">
                          <Check size={11} />
                        </button>
                        <button onClick={() => setEditingRemark(null)}
                          className="p-0.5 rounded text-slate-400 hover:bg-slate-100 flex-shrink-0">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group/remark cursor-pointer"
                        onClick={() => setEditingRemark({ id: r._invId, value: r.remarks === "—" ? "" : r.remarks })}>
                        <span className="truncate max-w-[110px] text-slate-400" title={r.remarks}>
                          {r.remarks === "—" ? <span className="italic text-slate-300">Add remark…</span> : r.remarks}
                        </span>
                        <Pencil size={9} className="opacity-0 group-hover/remark:opacity-60 text-blue-500 flex-shrink-0 transition-opacity" />
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
          {tab === "overview"    && <OverviewTab />}
          {tab === "overdues"    && <OverduesTab />}
          {tab === "orderledger" && <OrderLedgerTab />}
          {tab === "ledger"      && <LedgerTab />}
          {tab === "ar"          && <ARTab />}
          {tab === "ap"          && <APTab />}
          {tab === "cashflow"    && <CashFlowTab />}
          {tab === "expenses"    && <ExpensesTab />}
          {tab === "banking"     && <BankingTab />}
          {tab === "reports"     && <ReportsTab />}
        </div>
      </div>
    </Layout>
  );
}
