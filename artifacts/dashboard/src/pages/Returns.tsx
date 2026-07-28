import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useListCustomers, useListInvoices } from "@workspace/api-client-react";
import {
  Search, Plus, X, RefreshCw, RotateCcw, DollarSign, AlertTriangle,
  CheckCircle2, Clock, ChevronDown, ChevronUp, MoreHorizontal, Edit, Trash2, Filter,
  ArrowLeftRight, Package, BarChart2, TrendingDown, Printer, Mail, FileDown,
} from "lucide-react";
import forézLogo from "@assets/image_1775678558898.png";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, PieChart, Pie, Legend } from "recharts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const BUSINESS_RR = {
  name: "Forez Corp",
  line1: "2402 Ocean Ave",
  line2: "Ronkonkoma, NY 11779",
  email: "sales@forezcorp.com",
  website: "www.forezcorp.com",
};

const TYPE_LABEL_MAP: Record<string, string> = {
  return:        "Return Authorization",
  refund:        "Refund Memo",
  return_refund: "Return & Refund",
};

function esc(s: string | null | undefined) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function printReturn(r: any) {
  const refNum = `RR-${String(r.id).padStart(4, "0")}`;
  const docTitle = TYPE_LABEL_MAP[r.type] ?? "Return / Refund";

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',Courier,monospace;background:#fff;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px}
    .page{padding:44px 52px;max-width:800px;margin:0 auto}
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}
    .biz-name{font-weight:700;font-size:13px;margin-bottom:5px}
    .biz-info{font-size:12px;line-height:1.75;color:#333}
    .logo-img{height:72px;width:auto;object-fit:contain;display:block}
    .doc-title{font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:400;color:#1a1a1a;margin-bottom:18px}
    .addr-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:18px}
    .addr-label{font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:5px}
    .addr-value{font-size:12px;line-height:1.75}
    .doc-meta{font-size:12px;line-height:2}
    .meta-label{font-weight:700}
    .rule{border:none;border-top:1px solid #1a1a1a;margin:16px 0}
    .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
    .detail-label{font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:4px}
    .detail-value{font-size:12px;line-height:1.6}
    .items-section{margin-bottom:20px}
    .items-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px}
    .items-table{width:100%;border-collapse:collapse;font-size:12px}
    .items-table th{text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;border-bottom:2px solid #1a1a1a;padding:4px 8px 6px}
    .items-table td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
    .items-table .right{text-align:right}
    .items-table tfoot td{font-weight:700;border-top:2px solid #1a1a1a;border-bottom:none}
    .notes-block{font-size:12px;background:#f7f7f7;padding:12px 16px;margin-bottom:20px;line-height:1.65}
    .notes-label{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
    .amount-box{display:flex;justify-content:flex-end;margin:20px 0}
    .amount-inner{width:270px;font-size:12px;border-top:2px solid #1a1a1a;padding-top:8px}
    .amount-row{display:flex;justify-content:space-between;font-size:13px;font-weight:700}
    .mail-note{font-size:12px;background:#fff7ed;border:1px solid #fed7aa;padding:12px 16px;margin-bottom:20px;line-height:1.65}
    .mail-label{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;color:#c2410c}
    .page-footer{margin-top:64px;text-align:center;font-size:13px;color:#444;font-style:italic}
    @media print{body{padding:0}@page{margin:28px;size:A4}}
  `;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(refNum)} — Forez Corp</title>
<style>${css}</style></head>
<body><div class="page">

  <div class="page-header">
    <div>
      <div class="biz-name">FOREZ CORP.</div>
      <div class="biz-info">
        ${BUSINESS_RR.line1}<br/>
        ${BUSINESS_RR.line2}<br/>
        USA<br/>
        ${BUSINESS_RR.email}<br/>
        ${BUSINESS_RR.website}
      </div>
    </div>
    <img src="${forézLogo}" alt="Forez" class="logo-img"/>
  </div>

  <div class="doc-title">${esc(docTitle)}</div>

  <div class="addr-row">
    <div>
      <div class="addr-label">CUSTOMER</div>
      <div class="addr-value"><strong>${esc(r.customerName)}</strong></div>
    </div>
    <div>
      <div class="addr-label">RELATED INVOICE</div>
      <div class="addr-value">${esc(r.invoiceNumber || (r.invoiceId ? `INV-${r.invoiceId}` : "—"))}</div>
    </div>
    <div>
      <div class="doc-meta">
        <span class="meta-label">REF #</span> ${esc(refNum)}<br/>
        <span class="meta-label">DATE</span> ${r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}) : "—"}<br/>
        <span class="meta-label">STATUS</span> ${esc(r.status ?? "pending")}
      </div>
    </div>
  </div>

  <hr class="rule"/>

  <div class="detail-grid">
    <div>
      <div class="detail-label">REASON FOR ${r.type === "refund" ? "REFUND" : "RETURN"}</div>
      <div class="detail-value">${esc(r.reason || "—")}</div>
    </div>
    <div>
      <div class="detail-label">REFUND METHOD</div>
      <div class="detail-value">${esc(r.refundMethod || "—")}</div>
    </div>
  </div>

  ${r.lineItems && r.lineItems.length > 0 ? `
  <div class="items-section">
    <div class="items-label">Items Being Returned</div>
    <table class="items-table">
      <thead><tr>
        <th>Description</th><th>SKU</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Line Total</th>
      </tr></thead>
      <tbody>
        ${(r.lineItems as any[]).map((item: any) => {
          const qty = Number(item.quantity ?? 1);
          const price = Number(item.unitPrice ?? item.price ?? 0);
          return `<tr>
            <td>${esc(item.description ?? item.name ?? "—")}</td>
            <td style="color:#94a3b8;font-size:11px">${esc(item.sku ?? "")}</td>
            <td class="right">${qty}</td>
            <td class="right">$${price.toFixed(2)}</td>
            <td class="right">$${(qty * price).toFixed(2)}</td>
          </tr>`;
        }).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4" class="right">Total</td>
        <td class="right">$${(r.lineItems as any[]).reduce((s: number, item: any) => s + Number(item.quantity ?? 1) * Number(item.unitPrice ?? item.price ?? 0), 0).toFixed(2)}</td>
      </tr></tfoot>
    </table>
  </div>` : ""}

  ${r.notes ? `<div class="notes-block"><div class="notes-label">Notes</div>${esc(r.notes)}</div>` : ""}

  ${r.type !== "return" && r.refundAmount != null ? `
  <div class="amount-box">
    <div class="amount-inner">
      <div class="amount-row"><span>REFUND AMOUNT</span><span>$${Number(r.refundAmount).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
    </div>
  </div>` : ""}

  ${r.type !== "refund" ? `
  <div class="mail-note">
    <div class="mail-label">📦 Mail-In Instructions</div>
    Please ship the item(s) to:<br/>
    <strong>${BUSINESS_RR.name}</strong> — Returns Dept<br/>
    ${BUSINESS_RR.line1}, ${BUSINESS_RR.line2}<br/>
    Reference <strong>${esc(refNum)}</strong> on the outside of the package.<br/>
    Items must be in original packaging. Contact ${BUSINESS_RR.email} with any questions.
  </div>` : ""}

  <div class="page-footer">Thank You For Your Business!!!</div>

</div></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function mailReturn(r: any) {
  const refNum = `RR-${String(r.id).padStart(4, "0")}`;
  const docTitle = TYPE_LABEL_MAP[r.type] ?? "Return / Refund";
  const subject = encodeURIComponent(`${BUSINESS_RR.name} — ${docTitle} ${refNum}`);

  const mailInSection = r.type !== "refund"
    ? `\n\nMAIL-IN INSTRUCTIONS:\nPlease ship item(s) to:\n  ${BUSINESS_RR.name} — Returns Dept\n  ${BUSINESS_RR.line1}, ${BUSINESS_RR.line2}\nWrite "${refNum}" on the outside of the package.`
    : "";

  const refundSection = r.type !== "return" && r.refundAmount != null
    ? `\nRefund Amount:  $${Number(r.refundAmount).toFixed(2)}\nRefund Method:  ${r.refundMethod || "—"}`
    : "";

  const body = encodeURIComponent(
    `Dear ${r.customerName ?? "Customer"},\n\n` +
    `This email confirms your ${docTitle.toLowerCase()} request with Forez Corp.\n\n` +
    `Reference #:  ${refNum}\n` +
    `Invoice #:    ${r.invoiceNumber || (r.invoiceId ? `INV-${r.invoiceId}` : "—")}\n` +
    `Reason:       ${r.reason || "—"}\n` +
    `Status:       ${r.status ?? "pending"}` +
    refundSection +
    mailInSection +
    `\n\nIf you have any questions, please contact us at ${BUSINESS_RR.email} or visit ${BUSINESS_RR.website}.\n\nThank you,\n${BUSINESS_RR.name}`
  );

  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
}

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

/* ── FORM MODAL ──────────────────────────────────────────────── */
function ReturnModal({
  record,
  customers,
  invoices,
  onClose,
}: {
  record?: ReturnRecord;
  customers: any[];
  invoices: any[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!record;

  const [type, setType]               = useState(record?.type ?? "return");
  const [customerId, setCustomerId]   = useState<string>(record?.customerId?.toString() ?? "");
  const [invoiceId, setInvoiceId]     = useState<string>(record?.invoiceId?.toString() ?? "");
  const [status, setStatus]           = useState(record?.status ?? "pending");
  const [reason, setReason]           = useState(record?.reason ?? "");
  const [refundAmount, setRefundAmount] = useState(record?.refundAmount?.toString() ?? "");
  const [refundMethod, setRefundMethod] = useState(record?.refundMethod ?? "");
  const [refundedAt, setRefundedAt]   = useState(record?.refundedAt ? record.refundedAt.slice(0, 10) : "");
  const [notes, setNotes]             = useState(record?.notes ?? "");
  const [internalNote, setInternalNote] = useState(record?.internalNote ?? "");
  const [selectedItemIdxs, setSelectedItemIdxs] = useState<number[]>(
    record?.lineItems?.length ? record.lineItems.map((_: any, i: number) => i) : []
  );
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const filteredInvoices = invoices.filter((inv: any) =>
    !customerId || Number(inv.customerId) === Number(customerId)
  );

  // Get line items from the currently selected invoice
  const selectedInvoice = invoices.find((inv: any) => invoiceId && String(inv.id) === String(invoiceId));
  const invoiceLineItems: any[] = (selectedInvoice?.lineItems ?? []).filter((li: any) =>
    li.description && li.description !== "Freight" && li.description !== "Discount"
  );

  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id);
    // Default: select all items
    const inv = invoices.find((i: any) => String(i.id) === id);
    const items = (inv?.lineItems ?? []).filter((li: any) => li.description && li.description !== "Freight" && li.description !== "Discount");
    setSelectedItemIdxs(items.map((_: any, i: number) => i));
  };

  const toggleItem = (idx: number) => {
    setSelectedItemIdxs(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleSave = async () => {
    if (!customerId) { setError("Please select a customer."); return; }
    setSaving(true); setError(null);
    const chosenItems = invoiceLineItems.filter((_: any, i: number) => selectedItemIdxs.includes(i));
    try {
      const body = {
        type,
        customerId: Number(customerId),
        invoiceId: invoiceId ? Number(invoiceId) : null,
        status,
        reason: reason || null,
        lineItems: chosenItems,
        refundAmount: refundAmount ? Number(refundAmount) : null,
        refundMethod: refundMethod || null,
        refundedAt: refundedAt || null,
        notes: notes || null,
        internalNote: internalNote || null,
      };
      if (isEdit) {
        await apiFetch(`/api/returns-refunds/${record!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/returns-refunds", { method: "POST", body: JSON.stringify(body) });
      }
      await qc.invalidateQueries({ queryKey: ["returns-refunds"] });
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            <select value={customerId} onChange={e => { setCustomerId(e.target.value); setInvoiceId(""); }}
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
                  {inv.invoiceNumber || `INV-${inv.id}`} — ${Number(inv.total ?? 0).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {/* Line Items Selection */}
          {invoiceLineItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Items Being Returned</label>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setSelectedItemIdxs(invoiceLineItems.map((_: any, i: number) => i))}
                    className="text-indigo-600 hover:underline">All</button>
                  <span className="text-slate-300">|</span>
                  <button type="button" onClick={() => setSelectedItemIdxs([])}
                    className="text-slate-400 hover:underline">None</button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {invoiceLineItems.map((item: any, idx: number) => (
                  <label key={idx} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={selectedItemIdxs.includes(idx)} onChange={() => toggleItem(idx)}
                      className="w-4 h-4 accent-indigo-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-800 font-medium truncate block">{item.description || item.name || "Item"}</span>
                      {item.sku && <span className="text-[10px] text-slate-400">{item.sku}</span>}
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      Qty {item.quantity ?? 1} × ${Number(item.unitPrice ?? 0).toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{selectedItemIdxs.length} of {invoiceLineItems.length} item(s) selected</p>
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
          </div>

          {/* Refund fields */}
          {(type === "refund" || type === "return_refund") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Refund Amount ($)</label>
                <input type="number" placeholder="0.00" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-indigo-400" />
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

  const deleteRecord = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/returns-refunds/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["returns-refunds"] }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/returns-refunds/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["returns-refunds"] }),
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
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by customer, invoice, reason, notes…"
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
          <div className="glass-card p-5 flex flex-col gap-4">
            {/* KPI row */}
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
            {/* View tabs */}
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
          <div className="glass-card p-4 flex flex-wrap gap-3 items-end">
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
        <div className="glass-card overflow-hidden">
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
            <div className="overflow-x-auto overflow-y-auto max-h-[68vh] scrollbar-hide">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(239,246,255,0.95)" }}>
                  {["#", "Type", "Customer", "Invoice", "Reason", "Status", "Refund Amt", "Refund Method", "Date", ""].map(h => (
                    <th key={h} className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${h === "Refund Amt" ? "text-right" : "text-left"}`}
                      style={{ background: "rgba(99,102,241,0.10)", color: "#4338ca" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
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
                    <td className="px-4 py-3.5 max-w-[160px]">
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
                    <td className="px-4 py-3.5 text-xs text-slate-400 font-mono">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                          <MoreHorizontal size={14} className="text-slate-500" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
                          <DropdownMenuItem onClick={() => printReturn(r)}
                            className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                            <Printer size={13} /> Print
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printReturn(r)}
                            className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                            <FileDown size={13} /> Save to PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => mailReturn(r)}
                            className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                            <Mail size={13} /> Mail to Customer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditRecord(r); setShowModal(true); }}
                            className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                            <Edit size={13} /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => confirm("Delete this record?") && deleteRecord.mutate(r.id)}
                            className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                            <Trash2 size={13} /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
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
        />
      )}
    </Layout>
  );
}
