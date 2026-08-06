import { useState, useMemo } from "react";
import { useCompanyProfile } from "@/lib/companyProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logAudit } from "@/lib/auditLog";
import { useRole } from "@/context/RoleContext";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useListCustomers, useListInvoices } from "@workspace/api-client-react";
import {
  Search, Plus, X, RefreshCw, RotateCcw, DollarSign, AlertTriangle,
  CheckCircle2, Clock, ChevronDown, ChevronUp, MoreHorizontal, Edit, Trash2, Filter,
  ArrowLeftRight, Package, BarChart2, TrendingDown, FileText, Printer, CreditCard,
  CheckSquare, Square, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, PieChart, Pie, Legend,
} from "recharts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
}

const TYPES = ["return", "refund", "return_refund"] as const;
const TYPE_LABEL: Record<string, string> = {
  return:        "Return",
  refund:        "Refund",
  return_refund: "Return & Refund",
};
const TYPE_COLORS: Record<string, string> = {
  return:        "bg-amber-50 text-amber-700 border-amber-200",
  refund:        "bg-blue-50 text-blue-700 border-blue-200",
  return_refund: "bg-violet-50 text-violet-700 border-violet-200",
};

const STATUSES = ["pending", "approved", "rejected", "received", "refunded", "completed"] as const;
const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  approved:  "bg-blue-50 text-blue-700 border-blue-200",
  rejected:  "bg-red-50 text-red-600 border-red-200",
  received:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  refunded:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CREDIT_STATUSES = new Set(["approved", "refunded", "completed"]);

const REFUND_METHODS = ["Cash", "Credit Card", "Bank Transfer", "ACH", "Check", "Store Credit", "Other"];
const RETURN_REASONS = [
  "Damaged on arrival", "Wrong item sent", "Item not as described",
  "Changed mind", "Duplicate order", "Quality issue", "Other",
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[status] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[type] ?? "bg-slate-50 text-slate-500 border-slate-200"}`}>
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

interface ReturnRecord {
  id: number;
  type: string;
  customerId: number;
  customerName: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  status: string;
  reason: string | null;
  lineItems: any[];
  refundAmount: number | null;
  refundMethod: string | null;
  refundedAt: string | null;
  notes: string | null;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── CREDIT MEMO VIEW ────────────────────────────────────────── */
function CreditMemoView({
  record,
  onClose,
}: {
  record: ReturnRecord;
  onClose: () => void;
}) {
  const profile = useCompanyProfile();
  const cmNumber = `CM-${String(record.id).padStart(4, "0")}`;
  const lineItems: any[] = Array.isArray(record.lineItems) ? record.lineItems : [];
  const hasLines = lineItems.length > 0;
  const total = record.refundAmount ?? 0;

  const { data: allTickets } = useQuery<any[]>({
    queryKey: ["tickets"],
    queryFn: () => fetch(`${API}/api/tickets`).then(r => r.json()),
  });
  const linkedTickets = useMemo(() => {
    if (!allTickets) return [];
    return allTickets.filter((t: any) =>
      t.customerId === record.customerId ||
      (record.invoiceNumber && t.orderRef && t.orderRef === record.invoiceNumber)
    );
  }, [allTickets, record.customerId, record.invoiceNumber]);

  function printMemo() {
    const rows = lineItems.map(li => {
      const gross = (li.quantity ?? 1) * (li.unitPrice ?? 0);
      const disc  = gross * ((li.discountPercent ?? 0) / 100);
      const lineTotal = gross - disc;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9">${li.description ?? ""}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${li.quantity ?? 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:right">$${Number(li.unitPrice ?? 0).toFixed(2)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:right;color:#ef4444">${(li.discountPercent ?? 0) > 0 ? `-${li.discountPercent}%` : "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">$${lineTotal.toFixed(2)}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Credit Memo ${cmNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;padding:32px;max-width:680px;margin:0 auto}
h1{font-size:22px;font-weight:900;color:#1e293b}
.cm-badge{display:inline-block;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:20px;padding:3px 14px;font-size:12px;font-weight:700;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{background:#f8fafc;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border-bottom:2px solid #e2e8f0}
th:nth-child(2),th:nth-child(3),th:nth-child(4),th:last-child{text-align:right}
th:nth-child(2){text-align:center}
.row-total{display:flex;justify-content:space-between;padding:5px 0;color:#475569;font-size:13px;border-top:1px solid #f1f5f9}
.grand{display:flex;justify-content:space-between;padding:10px 0 0;border-top:2px solid #1e293b;font-size:18px;font-weight:900}
.footer{margin-top:24px;text-align:center;color:#94a3b8;font-size:11px;border-top:1px solid #f1f5f9;padding-top:14px}
@media print{body{padding:16px}}
</style></head><body>
<h1>Credit Memo</h1>
<p style="color:#64748b;font-size:12px;margin-bottom:6px">${cmNumber}</p>
<div class="cm-badge">✓ Credit Approved</div>
<div style="display:flex;justify-content:space-between;margin-bottom:20px;gap:24px">
  <div><strong>Customer</strong><br><span style="color:#475569">${record.customerName}</span></div>
  ${record.invoiceNumber ? `<div><strong>Invoice Ref</strong><br><span style="color:#6366f1">${record.invoiceNumber}</span></div>` : ""}
  <div><strong>Reason</strong><br><span style="color:#475569">${record.reason ?? "—"}</span></div>
  <div style="text-align:right"><strong>Date</strong><br><span style="color:#475569">${new Date(record.createdAt).toLocaleDateString("en-US",{dateStyle:"medium"})}</span></div>
</div>
${hasLines ? `<table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Disc</th><th>Credit</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
<div style="display:flex;justify-content:flex-end"><div style="min-width:220px">
  <div class="grand"><span>Total Credit</span><span style="color:#16a34a">$${total.toFixed(2)}</span></div>
</div></div>
${record.refundMethod ? `<p style="margin-top:12px;font-size:12px;color:#64748b">Refund method: <strong>${record.refundMethod}</strong></p>` : ""}
${record.notes ? `<div style="margin-top:16px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af"><strong>Notes:</strong> ${record.notes}</div>` : ""}
<div class="footer">This credit memo was issued by ${profile.name} · ${cmNumber}</div>
</body></html>`;
    const win = window.open("", "_blank", "width=750,height=950");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FileText size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base">Credit Memo</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{cmNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={printMemo}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Status banner */}
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-emerald-700">Credit Approved — {record.refundMethod ? `to be issued via ${record.refundMethod}` : "Credit on file"}</span>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Customer", value: record.customerName },
              { label: "Invoice Ref", value: record.invoiceNumber ?? "—", mono: true, color: "text-indigo-600" },
              { label: "Reason", value: record.reason ?? "—" },
              { label: "Date Issued", value: new Date(record.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" }) },
            ].map(({ label, value, mono, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                <p className={`text-sm font-semibold ${mono ? `font-mono ${color ?? "text-slate-700"}` : color ?? "text-slate-700"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          {hasLines ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Returned Items</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "rgba(16,185,129,0.07)" }}>
                      {["Description", "Qty", "Unit Price", "Disc", "Credit"].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${h === "Qty" ? "text-center" : h === "Unit Price" || h === "Disc" || h === "Credit" ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li: any, i: number) => {
                      const gross = (li.quantity ?? 1) * (li.unitPrice ?? 0);
                      const disc  = gross * ((li.discountPercent ?? 0) / 100);
                      const lineTotal = gross - disc;
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-slate-800">{li.description ?? `Item ${i + 1}`}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{li.quantity ?? 1}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(li.unitPrice ?? 0)}</td>
                          <td className="px-4 py-3 text-right text-red-500 text-xs">
                            {(li.discountPercent ?? 0) > 0 ? `-${li.discountPercent}%` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Total */}
          <div className="flex justify-end">
            <div className="min-w-[200px]">
              <div className="flex justify-between items-center pt-3 border-t-2 border-slate-200 gap-8">
                <span className="text-sm font-semibold text-slate-600">Total Credit</span>
                <span className="text-2xl font-black text-emerald-600">{formatCurrency(total)}</span>
              </div>
              {record.refundMethod && (
                <p className="text-xs text-slate-400 text-right mt-1">Via {record.refundMethod}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {record.notes && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-blue-500 mb-1">Notes</p>
              <p>{record.notes}</p>
            </div>
          )}
          {record.internalNote && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-amber-500 mb-1">Internal Note</p>
              <p>{record.internalNote}</p>
            </div>
          )}

          {/* Linked Support Tickets */}
          {linkedTickets.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Linked Support Tickets ({linkedTickets.length})
              </p>
              <div className="flex flex-col gap-2">
                {linkedTickets.map((t: any) => (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText size={14} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.orderRef && (
                          <span className="font-mono text-xs font-bold text-indigo-600">#{t.orderRef}</span>
                        )}
                        <span className="text-xs font-semibold text-slate-700 truncate">{t.subject}</span>
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${
                          t.status === "closed"   ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          t.status === "pending"  ? "bg-amber-50  text-amber-700  border-amber-200"  :
                                                    "bg-blue-50   text-blue-700   border-blue-200"
                        }`}>{t.status}</span>
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${
                          t.priority === "urgent" ? "bg-red-50    text-red-600    border-red-200"    :
                          t.priority === "high"   ? "bg-orange-50 text-orange-700 border-orange-200" :
                                                    "bg-slate-50  text-slate-500  border-slate-200"
                        }`}>{t.priority}</span>
                      </div>
                      {t.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                      )}
                      <p className="text-[10px] text-slate-300 mt-1">
                        {new Date(t.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── FORM MODAL ──────────────────────────────────────────────── */
function ReturnModal({
  record,
  customers,
  invoices,
  onClose,
  onApproved,
}: {
  record?: ReturnRecord;
  customers: any[];
  invoices: any[];
  onClose: () => void;
  onApproved?: (record: ReturnRecord) => void;
}) {
  const profile = useCompanyProfile();
  const qc = useQueryClient();
  const isEdit = !!record;

  const [type, setType]               = useState(record?.type ?? "return");
  const [customerId, setCustomerId]   = useState<string>(record?.customerId?.toString() ?? "");
  const [invoiceId, setInvoiceId]     = useState<string>(record?.invoiceId?.toString() ?? "");
  const [status, setStatus]           = useState(record?.status ?? "pending");
  const [reason, setReason]           = useState(record?.reason ?? "");
  const [refundAmount, setRefundAmount] = useState(record?.refundAmount?.toString() ?? "");
  const [refundAmountEdited, setRefundAmountEdited] = useState(false);
  const [refundMethod, setRefundMethod] = useState(record?.refundMethod ?? "");
  const [refundedAt, setRefundedAt]   = useState(record?.refundedAt ? record.refundedAt.slice(0, 10) : "");
  const [notes, setNotes]             = useState(record?.notes ?? "");
  const [internalNote, setInternalNote] = useState(record?.internalNote ?? "");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Line-item selection state
  const [selectedLineIdxs, setSelectedLineIdxs] = useState<Set<number>>(() => {
    if (record?.lineItems?.length) {
      return new Set(record.lineItems.map((_: any, i: number) => i));
    }
    return new Set<number>();
  });

  const filteredInvoices = invoices.filter(inv =>
    !customerId || Number(inv.customerId) === Number(customerId)
  );

  // Get the selected invoice's line items
  const selectedInvoice = invoices.find(inv => invoiceId && Number(inv.id) === Number(invoiceId));
  const invLineItems: any[] = selectedInvoice?.lineItems ?? [];

  // When invoice changes, select all items and auto-calc total
  function handleInvoiceChange(newInvId: string) {
    setInvoiceId(newInvId);
    setRefundAmountEdited(false);
    const inv = invoices.find(i => Number(i.id) === Number(newInvId));
    if (inv) {
      const lines: any[] = inv.lineItems ?? [];
      const allIdxs = new Set(lines.map((_: any, i: number) => i));
      setSelectedLineIdxs(allIdxs);
      if (!refundAmountEdited) {
        setRefundAmount(Number(inv.total ?? 0).toFixed(2));
      }
    } else {
      setSelectedLineIdxs(new Set());
    }
  }

  // Recalculate total when selection changes
  function calcSelectedTotal(idxs: Set<number>): number {
    return [...idxs].reduce((sum, i) => {
      const li = invLineItems[i];
      if (!li) return sum;
      const gross = (li.quantity ?? 1) * (li.unitPrice ?? 0);
      const disc = gross * ((li.discountPercent ?? 0) / 100);
      return sum + (gross - disc);
    }, 0);
  }

  function toggleLine(idx: number) {
    setSelectedLineIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      setRefundAmountEdited(false);
      const total = calcSelectedTotal(next);
      setRefundAmount(total.toFixed(2));
      return next;
    });
  }

  function toggleAllLines() {
    if (selectedLineIdxs.size === invLineItems.length) {
      setSelectedLineIdxs(new Set());
      setRefundAmount("0.00");
    } else {
      const allIdxs = new Set(invLineItems.map((_: any, i: number) => i));
      setSelectedLineIdxs(allIdxs);
      const total = calcSelectedTotal(allIdxs);
      setRefundAmount(total.toFixed(2));
    }
    setRefundAmountEdited(false);
  }

  const handleSave = async () => {
    if (!customerId) { setError("Please select a customer."); return; }
    setSaving(true); setError(null);
    try {
      const selectedLines = invLineItems.length > 0
        ? invLineItems.filter((_: any, i: number) => selectedLineIdxs.has(i))
        : (record?.lineItems ?? []);

      const body = {
        type,
        customerId: Number(customerId),
        invoiceId: invoiceId ? Number(invoiceId) : null,
        status,
        reason: reason || null,
        lineItems: selectedLines,
        refundAmount: refundAmount ? Number(refundAmount) : null,
        refundMethod: refundMethod || null,
        refundedAt: refundedAt || null,
        notes: notes || null,
        internalNote: internalNote || null,
      };

      let saved: ReturnRecord;
      if (isEdit) {
        saved = await apiFetch(`/api/returns-refunds/${record!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        saved = await apiFetch("/api/returns-refunds", { method: "POST", body: JSON.stringify(body) });
      }
      await qc.invalidateQueries({ queryKey: ["returns-refunds"] });
      onClose();
      // If status is approved/refunded/completed, show credit memo
      if (CREDIT_STATUSES.has(saved.status) && onApproved) {
        onApproved(saved);
      }
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTotal = calcSelectedTotal(selectedLineIdxs);
  const showLineItems = (type === "return" || type === "return_refund") && invLineItems.length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{isEdit ? "Edit Return / Refund" : "New Return / Refund"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Track customer returns and refund requests</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Type */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Type</label>
            <div className="flex gap-2">
              {TYPES.map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${type === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Customer *</label>
            <select value={customerId} onChange={e => { setCustomerId(e.target.value); setInvoiceId(""); setSelectedLineIdxs(new Set()); }}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-indigo-400">
              <option value="">Select customer…</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.company || c.name}</option>
              ))}
            </select>
          </div>

          {/* Invoice */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Linked Invoice (optional)</label>
            <select value={invoiceId} onChange={e => handleInvoiceChange(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
              <option value="">None</option>
              {filteredInvoices.map((inv: any) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber || `INV-${inv.id}`} — {formatCurrency(Number(inv.total ?? 0))}
                </option>
              ))}
            </select>
          </div>

          {/* ── Invoice line-item picker ─────────────────────────── */}
          {showLineItems && (
            <div className="border border-indigo-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100">
                <div className="flex items-center gap-2">
                  <Package size={13} className="text-indigo-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Select Items to Return</span>
                </div>
                <button
                  onClick={toggleAllLines}
                  className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  {selectedLineIdxs.size === invLineItems.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 w-8"></th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Description</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-500 w-12">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 w-20">Unit $</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-500 w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invLineItems.map((li: any, i: number) => {
                    const gross = (li.quantity ?? 1) * (li.unitPrice ?? 0);
                    const disc  = gross * ((li.discountPercent ?? 0) / 100);
                    const lineTotal = gross - disc;
                    const checked = selectedLineIdxs.has(i);
                    return (
                      <tr
                        key={i}
                        onClick={() => toggleLine(i)}
                        className={`border-b border-slate-100 cursor-pointer transition-colors ${checked ? "bg-indigo-50/40" : "hover:bg-slate-50"}`}
                      >
                        <td className="px-3 py-2.5">
                          {checked
                            ? <CheckSquare size={14} className="text-indigo-600" />
                            : <Square size={14} className="text-slate-300" />
                          }
                        </td>
                        <td className={`px-3 py-2.5 ${checked ? "text-slate-800 font-medium" : "text-slate-500"}`}>{li.description ?? `Item ${i + 1}`}</td>
                        <td className={`px-3 py-2.5 text-center ${checked ? "text-slate-700" : "text-slate-400"}`}>{li.quantity ?? 1}</td>
                        <td className={`px-3 py-2.5 text-right ${checked ? "text-slate-700" : "text-slate-400"}`}>${Number(li.unitPrice ?? 0).toFixed(2)}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${checked ? "text-indigo-700" : "text-slate-300"}`}>${lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Running total */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50/60 border-t border-indigo-100">
                <span className="text-xs text-indigo-600 font-semibold">
                  {selectedLineIdxs.size} of {invLineItems.length} items selected
                </span>
                <span className="text-sm font-black text-indigo-700">{formatCurrency(selectedTotal)}</span>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
              <option value="">Select reason…</option>
              {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
              {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            {CREDIT_STATUSES.has(status) && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                <Info size={11} /> Saving with this status will generate a Credit Memo
              </p>
            )}
          </div>

          {/* Refund fields */}
          {(type === "refund" || type === "return_refund") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Refund Amount ($)
                  {showLineItems && !refundAmountEdited && <span className="ml-1 text-indigo-400 normal-case font-normal">auto-calculated</span>}
                </label>
                <input
                  type="number" placeholder="0.00" step="0.01"
                  value={refundAmount}
                  onChange={e => { setRefundAmount(e.target.value); setRefundAmountEdited(true); }}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Refund Method</label>
                <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
                  <option value="">Select…</option>
                  {REFUND_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Refund Date</label>
                <input type="date" value={refundedAt} onChange={e => setRefundedAt(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400" />
              </div>
            </div>
          )}

          {/* For return-only type, still show a simple amount field */}
          {type === "return" && (
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
                Credit Amount ($)
                {showLineItems && !refundAmountEdited && <span className="ml-1 text-indigo-400 normal-case font-normal">auto-calculated</span>}
              </label>
              <input
                type="number" placeholder="0.00" step="0.01"
                value={refundAmount}
                onChange={e => { setRefundAmount(e.target.value); setRefundAmountEdited(true); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Customer notes, communication details…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Internal Note</label>
            <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={2} placeholder="Internal team notes only…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 resize-none" />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-200">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 pb-6 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN PAGE ───────────────────────────────────────────────── */
export default function Returns() {
  const qc = useQueryClient();
  const { currentUser } = useRole();
  const auditUser = () => ({ name: currentUser?.name ?? "", email: currentUser?.email ?? "", role: currentUser?.role ?? "unknown" });
  const { data: customers }   = useListCustomers();
  const { data: invoices }    = useListInvoices();
  const { data: records, isLoading } = useQuery<ReturnRecord[]>({
    queryKey: ["returns-refunds"],
    queryFn: () => apiFetch("/api/returns-refunds"),
  });

  const [search, setSearch]       = useState("");
  const [filterType, setFilterType]   = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [showFilters, setShowFilters]   = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editRecord, setEditRecord] = useState<ReturnRecord | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView]   = useState<"type"|"reason"|"trend"|"status">("type");
  const [creditMemoRecord, setCreditMemoRecord] = useState<ReturnRecord | null>(null);

  const deleteRecord = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/returns-refunds/${id}`, { method: "DELETE" }),
    onSuccess: (_: any, id: number) => {
      const r = records?.find(x => x.id === id);
      qc.invalidateQueries({ queryKey: ["returns-refunds"] });
      logAudit({ user: auditUser(), action: "deleted", entityType: "other", entityId: String(id), entityRef: r ? `RET-${String(id).padStart(4,"0")}` : `#${id}`, description: `Return/Refund deleted${r ? ` (${r.customerName})` : ""}` });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/returns-refunds/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (saved: ReturnRecord) => {
      qc.invalidateQueries({ queryKey: ["returns-refunds"] });
      if (CREDIT_STATUSES.has(saved.status)) {
        setCreditMemoRecord(saved);
      }
      logAudit({ user: auditUser(), action: "status_change", entityType: "other", entityId: String(saved.id), entityRef: `RET-${String(saved.id).padStart(4,"0")}`, description: `Return #${saved.id} status → ${saved.status}${saved.customerName ? ` (${saved.customerName})` : ""}` });
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return (records ?? []).filter(r => {
      if (filterType   !== "__all__" && r.type   !== filterType)   return false;
      if (filterStatus !== "__all__" && r.status !== filterStatus) return false;
      if (q && ![r.customerName, r.invoiceNumber, r.reason, r.notes, r.refundMethod, String(r.id)]
        .some(v => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [records, filterType, filterStatus, q]);

  const stats = useMemo(() => {
    const all = records ?? [];
    const pending   = all.filter(r => r.status === "pending").length;
    const approved  = all.filter(r => r.status === "approved").length;
    const totalRefunded = all.filter(r => ["refunded", "completed"].includes(r.status))
      .reduce((s, r) => s + (r.refundAmount ?? 0), 0);
    const rejected  = all.filter(r => r.status === "rejected").length;
    return { pending, approved, totalRefunded, rejected };
  }, [records]);

  const uniqueStatuses = useMemo(() => Array.from(new Set((records ?? []).map(r => r.status))).sort(), [records]);
  const activeFilters = [filterType !== "__all__", filterStatus !== "__all__"].filter(Boolean).length;

  /* ── Analytics data ──────────────────────────────── */
  const retTypeData = useMemo(() => {
    const by: Record<string,{count:number;refund:number}> = {};
    for (const r of (records??[])) {
      const k = TYPE_LABEL[r.type]??r.type;
      if (!by[k]) by[k] = { count:0, refund:0 };
      by[k].count++;
      by[k].refund += Number(r.refundAmount??0);
    }
    const COLS: Record<string,string> = { Return:"#6366f1", Refund:"#10b981", "Return & Refund":"#f59e0b" };
    return Object.entries(by).map(([name,v]) => ({ name, ...v, refund: Math.round(v.refund*100)/100, fill: COLS[name]??"#94a3b8" }));
  }, [records]);

  const retReasonData = useMemo(() => {
    const by: Record<string,{count:number;refund:number}> = {};
    for (const r of (records??[])) {
      const k = r.reason || "Other";
      if (!by[k]) by[k] = { count:0, refund:0 };
      by[k].count++;
      by[k].refund += Number(r.refundAmount??0);
    }
    return Object.entries(by).map(([name,v]) => ({ name, count:v.count, refund: Math.round(v.refund*100)/100 }))
      .sort((a,b) => b.refund - a.refund);
  }, [records]);

  const retMonthlyData = useMemo(() => {
    const by: Record<string,{count:number;refund:number}> = {};
    for (const r of (records??[])) {
      const mo = r.createdAt.slice(0,7);
      if (!by[mo]) by[mo] = { count:0, refund:0 };
      by[mo].count++;
      by[mo].refund += Number(r.refundAmount??0);
    }
    return Object.entries(by).sort(([a],[b]) => a.localeCompare(b)).map(([month,v]) => ({
      month: new Date(month+"-01").toLocaleDateString("en-US",{month:"short",year:"2-digit"}),
      count: v.count, refund: Math.round(v.refund*100)/100,
    }));
  }, [records]);

  const retStatusData = useMemo(() => {
    const by: Record<string,number> = {};
    for (const r of (records??[])) { by[r.status]=(by[r.status]??0)+1; }
    const COLS: Record<string,string> = { pending:"#f59e0b", approved:"#3b82f6", rejected:"#ef4444", refunded:"#10b981", completed:"#6366f1", processing:"#8b5cf6" };
    return Object.entries(by).map(([name,count]) => ({ name, count, fill: COLS[name]??"#94a3b8" }));
  }, [records]);

  return (
    <Layout>
      <Header title="Returns & Refunds" subtitle="Track product returns and customer refund requests" />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-5 py-4 gap-4 bg-[hsl(220_25%_97%)]">

        {/* Stats */}
        <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Pending Review", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
            { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
            { label: "Total Refunded", value: formatCurrency(stats.totalRefunded), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
            { label: "Rejected", value: stats.rejected, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className={`glass-card p-4 flex items-center gap-3 border ${border}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon size={16} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">{label}</p>
                <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by customer, invoice, reason…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters || activeFilters > 0 ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Filter size={13} />
            Filters
            {activeFilters > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{activeFilters}</span>}
          </button>
          <button onClick={() => setShowCharts(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${showCharts?"bg-rose-600 text-white border-rose-600":"bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <BarChart2 size={13} /> Analytics {showCharts ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          </button>
          <button
            onClick={() => { setEditRecord(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} /> New Return / Refund
          </button>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* ── Analytics Panel ─────────────────────────────── */}
        {showCharts && (
          <div className="flex-shrink-0 glass-card p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Records", value: String(records?.length??0), color: "text-slate-700" },
                { label: "Pending Review", value: String(stats.pending), color: "text-amber-600" },
                { label: "Total Refunded", value: `$${stats.totalRefunded.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`, color: "text-emerald-600" },
                { label: "Rejected", value: String(stats.rejected), color: "text-red-500" },
              ].map(k => (
                <div key={k.label} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <TrendingDown size={16} className={k.color} />
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{k.label}</p>
                    <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 w-fit">
              {(["type","reason","trend","status"] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${chartView===v?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                  {v==="type"?"By Type":v==="reason"?"By Reason":v==="trend"?"Monthly Trend":"Status Mix"}
                </button>
              ))}
            </div>
            {chartView === "type" && (
              <div className="h-56">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Returns & Refunds by Type</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={retTypeData} margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#cbd5e1" tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={(v:any, name:any) => [name==="count"?v:`$${Number(v).toLocaleString()}`, name==="count"?"Count":"Refund Amount"]} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" name="Count" radius={[4,4,0,0]}>
                      {retTypeData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                    <Bar yAxisId="right" dataKey="refund" name="Refund Amount" radius={[4,4,0,0]} fill="#10b981" opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "reason" && (
              <div className="h-72">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Refund Amount by Reason</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={retReasonData} layout="vertical" margin={{ left: 120, right: 50, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#cbd5e1" tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#cbd5e1" width={116} />
                    <Tooltip formatter={(v:any) => [`$${Number(v).toLocaleString()}`, "Refund"]} />
                    <Bar dataKey="refund" radius={[0,4,4,0]}>
                      {retReasonData.map((_,i) => <Cell key={i} fill={`hsl(${0+i*30},65%,${58-i*2}%)`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "trend" && (
              <div className="h-64">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Monthly Returns Volume & Refund Amounts</p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retMonthlyData} margin={{ left: 10, right: 30, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#cbd5e1" tickFormatter={v => `$${v}`} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name="Returns" />
                    <Line yAxisId="right" type="monotone" dataKey="refund" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} name="Refund ($)" strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartView === "status" && (
              <div className="flex gap-6 items-center">
                <div className="h-52 flex-1">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Status Distribution</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={retStatusData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3} label>
                        {retStatusData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-[160px]">
                  {retStatusData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                      <span className="text-xs text-slate-600 capitalize flex-1">{d.name}</span>
                      <span className="text-xs font-bold text-slate-700">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter panel */}
        {showFilters && (
          <div className="flex-shrink-0 glass-card p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Type</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
                <option value="__all__">All Types</option>
                {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400">
                <option value="__all__">All Statuses</option>
                {uniqueStatuses.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            {(filterType !== "__all__" || filterStatus !== "__all__") && (
              <button onClick={() => { setFilterType("__all__"); setFilterStatus("__all__"); }}
                className="text-xs text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1">
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="glass-card flex-1 min-h-0 flex flex-col" style={{ minHeight: 0 }}>
          {isLoading ? (
            <div className="p-10 flex justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <ArrowLeftRight size={22} className="text-slate-400" />
              </div>
              <p className="text-slate-500 text-sm font-medium">No returns or refunds found</p>
              <p className="text-slate-400 text-xs">Create a new record using the button above</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0" style={{ minHeight: 0 }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: "rgba(239,246,255,0.97)" }}>
                  {["#", "Type", "Customer", "Invoice", "Reason", "Status", "Credit Amt", "Method", "Date", ""].map(h => (
                    <th key={h} className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${h === "Credit Amt" ? "text-right" : "text-left"}`}
                      style={{ background: "rgba(99,102,241,0.10)", color: "#4338ca" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const hasCreditMemo = CREDIT_STATUSES.has(r.status);
                  return (
                    <tr key={r.id}
                      className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors group"
                      style={{ background: "rgba(255,255,255,0.45)" }}
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-400">#{r.id.toString().padStart(4, "0")}</td>
                      <td className="px-4 py-3.5"><TypeBadge type={r.type} /></td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 text-sm">{r.customerName}</p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-indigo-600">
                        {r.invoiceNumber || (r.invoiceId ? `INV-${r.invoiceId}` : "—")}
                      </td>
                      <td className="px-4 py-3.5 max-w-[140px]">
                        <span className="truncate block text-slate-500 text-xs" title={r.reason ?? ""}>{r.reason || "—"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 cursor-pointer">
                              <StatusBadge status={r.status} />
                              <ChevronDown size={10} className="text-slate-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                            {STATUSES.map(s => (
                              <DropdownMenuItem key={s} onClick={() => updateStatus.mutate({ id: r.id, status: s })}
                                className={`capitalize text-xs cursor-pointer gap-2 ${r.status === s ? "font-bold" : ""}`}>
                                {r.status === s && <CheckCircle2 size={11} className="text-indigo-600" />}
                                {s}
                                {CREDIT_STATUSES.has(s) && s !== r.status && (
                                  <span className="ml-auto text-[10px] text-emerald-600 font-semibold">→ Credit Memo</span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-sm">
                        {r.refundAmount != null ? (
                          <span className="text-emerald-600">{formatCurrency(r.refundAmount)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{r.refundMethod || "—"}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-slate-400 font-mono">{formatDate(r.createdAt)}</span>
                          {hasCreditMemo && (
                            <button
                              onClick={() => setCreditMemoRecord(r)}
                              className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-100 transition-colors w-fit"
                            >
                              <FileText size={9} /> CM-{String(r.id).padStart(4, "0")}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
                            <DropdownMenuItem onClick={() => { setEditRecord(r); setShowModal(true); }}
                              className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Edit size={13} /> Edit
                            </DropdownMenuItem>
                            {hasCreditMemo && (
                              <DropdownMenuItem onClick={() => setCreditMemoRecord(r)}
                                className="gap-2 cursor-pointer text-sm text-emerald-700 hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-700">
                                <FileText size={13} /> View Credit Memo
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => confirm("Delete this record?") && deleteRecord.mutate(r.id)}
                              className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                              <Trash2 size={13} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ReturnModal
          record={editRecord ?? undefined}
          customers={(customers ?? []) as any[]}
          invoices={(invoices ?? []) as any[]}
          onClose={() => { setShowModal(false); setEditRecord(null); }}
          onApproved={saved => { setCreditMemoRecord(saved); }}
        />
      )}

      {creditMemoRecord && (
        <CreditMemoView
          record={creditMemoRecord}
          onClose={() => setCreditMemoRecord(null)}
        />
      )}
    </Layout>
  );
}
