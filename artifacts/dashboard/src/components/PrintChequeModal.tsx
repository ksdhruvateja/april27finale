import { useState, useEffect, useMemo } from "react";
import { X, Printer, Save, PenLine, CheckSquare, Square, FileText, Edit3, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateBill, getListBillsQueryKey, useListVendors, useListCustomers } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

/* ── Amount → words ─────────────────────────────────────────── */
function amountInWords(amount: number): string {
  if (isNaN(amount) || amount < 0) return "Zero and 00/100";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
    "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function toWords(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + toWords(n % 100) : "");
    if (n < 1_000_000) return toWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + toWords(n % 1000) : "");
    return toWords(Math.floor(n / 1_000_000)) + " Million" + (n % 1_000_000 ? " " + toWords(n % 1_000_000) : "");
  }
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);
  return `${dollars === 0 ? "Zero" : toWords(dollars)} and ${String(cents).padStart(2, "0")}/100`;
}

/* ── Types ───────────────────────────────────────────────────── */
interface Bill {
  id: number;
  vendorName: string;
  total: number;
  dueDate?: string;
  status?: string;
}

interface Props {
  bills: Bill[];
  onClose: () => void;
}

const COMPANY = "Forez Corp";
const COMPANY_ADDR_1 = "123 Corporate Drive";
const COMPANY_ADDR_2 = "Business City, ST 00000";
const ROUTING = "021000021";
const ACCOUNT = "1234567890";

/* ── Print HTML generator ────────────────────────────────────── */
function buildPrintHtml(opts: {
  checkNumber: string;
  date: string;
  payTo: string;
  payToAddress?: string;
  amount: number;
  amountWords: string;
  bankName: string;
  bankAddr: string;
  routingNumber: string;
  accountNumber: string;
  memo: string;
  signatureName: string;
  billLines: { ref: string; desc: string; amount: number }[];
}) {
  const fmt = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const billRowsHtml = opts.billLines.length === 0 ? "" : opts.billLines.map(l => `
    <tr>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;">${l.ref}</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;">${l.desc}</td>
      <td style="padding:3px 6px;border-bottom:1px solid #e2e8f0;text-align:right;">$${fmt(l.amount)}</td>
    </tr>`).join("");

  const stubHtml = (label: string) => `
  <div style="height:3.75in;width:8.5in;padding:0.25in 0.45in 0.2in;box-sizing:border-box;page-break-inside:avoid;border-top:1px dashed #94a3b8;">
    <table style="width:100%;margin-bottom:6px;">
      <tr>
        <td style="font-size:11pt;font-weight:700;color:#1e3a5f;">${COMPANY}</td>
        <td style="text-align:right;font-size:9pt;color:#475569;">${label}</td>
      </tr>
      <tr>
        <td style="font-size:8.5pt;color:#475569;">Date: ${opts.date}</td>
        <td style="text-align:right;font-size:8.5pt;color:#475569;">Check No. ${opts.checkNumber}</td>
      </tr>
    </table>
    <table style="width:100%;margin-bottom:6px;">
      <tr>
        <td style="font-size:8.5pt;color:#475569;width:50%;"><strong>Pay To:</strong> ${opts.payTo}</td>
        <td style="text-align:right;font-size:8.5pt;color:#475569;"><strong>Amount:</strong> $${fmt(opts.amount)}</td>
      </tr>
    </table>
    ${opts.billLines.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:3px 6px;text-align:left;border-bottom:2px solid #cbd5e1;color:#475569;font-weight:600;">Reference</th>
          <th style="padding:3px 6px;text-align:left;border-bottom:2px solid #cbd5e1;color:#475569;font-weight:600;">Description</th>
          <th style="padding:3px 6px;text-align:right;border-bottom:2px solid #cbd5e1;color:#475569;font-weight:600;">Amount</th>
        </tr>
      </thead>
      <tbody>${billRowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:4px 6px;text-align:right;font-weight:700;font-size:8.5pt;color:#1e3a5f;">Total:</td>
          <td style="padding:4px 6px;text-align:right;font-weight:700;font-size:8.5pt;color:#1e3a5f;">$${fmt(opts.amount)}</td>
        </tr>
      </tfoot>
    </table>` : `<div style="font-size:8.5pt;color:#94a3b8;padding:8px 0;">${opts.memo || "—"}</div>`}
    <div style="margin-top:8px;font-size:7.5pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px;">${label === "ACCOUNTS PAYABLE COPY" ? "Retain for your records." : "Detach and retain for your records."}</div>
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Check #${opts.checkNumber} — ${COMPANY}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background:#fff; width:8.5in; }
  @page { size: 8.5in 11in; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .check-section {
    width:8.5in; height:3.5in; padding:0.22in 0.45in 0.15in;
    box-sizing:border-box; position:relative; overflow:hidden;
    background: linear-gradient(135deg, #f0f7ff 0%, #fff 50%, #f5f0ff 100%);
    border-bottom: 1px dashed #94a3b8;
  }
  .check-watermark {
    position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%) rotate(-30deg);
    font-size:72pt; color:rgba(30,58,95,0.04); font-weight:900;
    letter-spacing:0.05em; pointer-events:none; white-space:nowrap;
    z-index:0;
  }
  .check-inner { position:relative; z-index:1; height:100%; display:flex; flex-direction:column; gap:0; }
  .row1 { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; }
  .co-name { font-size:13pt; font-weight:800; color:#1e3a5f; letter-spacing:0.01em; }
  .co-addr { font-size:8pt; color:#475569; margin-top:1px; }
  .check-num-box { font-size:12pt; font-weight:700; color:#1e3a5f; border:1.5px solid #1e3a5f; border-radius:4px; padding:3px 12px; background:#fff; letter-spacing:0.06em; }
  .date-row { display:flex; justify-content:flex-end; margin-bottom:6px; }
  .date-label { font-size:8pt; color:#64748b; margin-right:6px; margin-top:2px; }
  .date-val { font-size:9pt; font-weight:600; color:#1e293b; border-bottom:1px solid #334155; padding-bottom:1px; min-width:1.4in; }
  .payto-row { display:flex; align-items:flex-end; gap:12px; margin-bottom:6px; }
  .payto-label { font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:2px; }
  .payto-val { font-size:10pt; font-weight:600; color:#0f172a; border-bottom:1.5px solid #1e3a5f; padding-bottom:2px; flex:1; }
  .amount-box { border:2px solid #1e3a5f; border-radius:5px; padding:5px 14px; font-size:12pt; font-weight:800; color:#1e3a5f; white-space:nowrap; background:#fff; min-width:1.5in; text-align:center; letter-spacing:0.04em; }
  .words-row { display:flex; align-items:flex-end; gap:12px; margin-bottom:6px; }
  .words-val { font-size:8.5pt; color:#0f172a; border-bottom:1.5px solid #334155; padding-bottom:2px; flex:1; }
  .words-fill { flex:1; border-bottom:1.5px solid #334155; }
  .bank-block { font-size:7.5pt; color:#475569; text-align:right; min-width:1.8in; line-height:1.5; }
  .void-note { font-size:7pt; color:#dc2626; font-weight:700; letter-spacing:0.06em; text-align:right; }
  .memo-sig-row { display:flex; align-items:flex-end; gap:12px; margin-top:4px; }
  .memo-label { font-size:7.5pt; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:2px; }
  .memo-val { font-size:8.5pt; color:#0f172a; border-bottom:1px solid #334155; padding-bottom:2px; flex:1; }
  .sig-block { text-align:center; min-width:2.1in; }
  .sig-line { border-bottom:1.5px solid #334155; padding-bottom:2px; min-height:0.28in; font-style:italic; font-size:9pt; color:#475569; text-align:center; }
  .sig-label { font-size:7pt; color:#94a3b8; text-transform:uppercase; letter-spacing:0.08em; margin-top:2px; }
  .micr-line { margin-top:auto; padding-top:4px; border-top:1px dashed #cbd5e1; font-family:'Courier New',monospace; font-size:9pt; color:#94a3b8; letter-spacing:0.1em; display:flex; justify-content:space-between; }
</style>
</head>
<body>

<!-- ═══ CHECK SECTION (top, 3.5") ═══ -->
<div class="check-section">
  <div class="check-watermark">FOREZ CORP</div>
  <div class="check-inner">
    <!-- Row 1: Company + Check Number -->
    <div class="row1">
      <div>
        <div class="co-name">${COMPANY}</div>
        <div class="co-addr">${COMPANY_ADDR_1}</div>
        <div class="co-addr">${COMPANY_ADDR_2}</div>
      </div>
      <div class="check-num-box">No. ${opts.checkNumber}</div>
    </div>

    <!-- Date -->
    <div class="date-row">
      <span class="date-label">Date:</span>
      <span class="date-val">${opts.date}</span>
    </div>

    <!-- Pay To + Amount Box -->
    <div class="payto-row">
      <div style="flex:1;">
        <div class="payto-label">Pay to the Order of</div>
        <div class="payto-val">${opts.payTo || "&nbsp;"}</div>
        ${opts.payToAddress ? `<div style="font-size:7.5pt;color:#64748b;margin-top:2px;padding-left:2px;">${opts.payToAddress}</div>` : ""}
      </div>
      <div class="amount-box">$ ${fmt(opts.amount)}</div>
    </div>

    <!-- Amount in Words + Bank -->
    <div class="words-row">
      <div style="flex:1;">
        <div class="words-val">${opts.amountWords} Dollars</div>
      </div>
      <div>
        <div class="bank-block">
          <div style="font-weight:700;font-size:8pt;color:#1e3a5f;">${opts.bankName}</div>
          <div>${opts.bankAddr}</div>
        </div>
        <div class="void-note">VOID AFTER 90 DAYS</div>
      </div>
    </div>

    <!-- Memo + Signature -->
    <div class="memo-sig-row">
      <div style="flex:1;">
        <div class="memo-label">Memo</div>
        <div class="memo-val">${opts.memo || "&nbsp;"}</div>
      </div>
      <div class="sig-block">
        <div class="sig-line">${opts.signatureName || "&nbsp;"}</div>
        <div class="sig-label">Authorized Signature</div>
      </div>
    </div>

    <!-- MICR -->
    <div class="micr-line">
      <span>⑆ ${opts.routingNumber || ROUTING} ⑆ ${opts.accountNumber || ACCOUNT} ⑈ ${opts.checkNumber.padStart(6, "0")}</span>
      <span style="font-size:7pt;letter-spacing:normal;color:#b0bec5;">HIGH SECURITY CHECK — CONTAINS SECURITY FEATURES</span>
    </div>
  </div>
</div>

<!-- ═══ VOUCHER STUB 1 — Remittance Advice ═══ -->
${stubHtml("REMITTANCE ADVICE")}

<!-- ═══ VOUCHER STUB 2 — Accounts Payable Copy ═══ -->
${stubHtml("ACCOUNTS PAYABLE COPY")}

</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════
   MODAL COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function PrintChequeModal({ bills, onClose }: Props) {
  const unpaid = bills.filter(b => b.status !== "paid" && b.status !== "cancelled");

  /* Mode: from bills OR custom */
  const [mode, setMode] = useState<"bills" | "custom">(unpaid.length > 0 ? "bills" : "custom");

  /* Bill selection */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(unpaid.map(b => b.id)));

  /* Vendors + Customers (for Pay To typeahead) */
  const { data: vendors = [] } = useListVendors();
  const { data: customers = [] } = useListCustomers();

  /* Combined payee list for typeahead */
  const payeeList = useMemo(() => {
    const list: Array<{ id: string; label: string; type: "vendor" | "customer"; address: string; rawId: number }> = [];
    for (const v of vendors as any[]) {
      list.push({
        id: `v-${v.id}`, label: v.company || v.name || `Vendor #${v.id}`, type: "vendor",
        address: [v.address, v.city && v.state ? `${v.city}, ${v.state}` : v.city || v.state, v.zip].filter(Boolean).join(" · "),
        rawId: v.id,
      });
    }
    for (const c of customers as any[]) {
      list.push({
        id: `c-${c.id}`, label: c.company || c.name || `Customer #${c.id}`, type: "customer",
        address: [c.address, c.city && c.state ? `${c.city}, ${c.state}` : c.city || c.state, c.zipCode].filter(Boolean).join(" · "),
        rawId: c.id,
      });
    }
    return list;
  }, [vendors, customers]);

  /* Typeahead state (custom mode) */
  const [payToQuery, setPayToQuery] = useState("");
  const [showPayToSuggest, setShowPayToSuggest] = useState(false);
  const payToSuggestions = useMemo(() => {
    if (!payToQuery.trim()) return [];
    const q = payToQuery.toLowerCase();
    return payeeList.filter(p => p.label.toLowerCase().includes(q)).slice(0, 8);
  }, [payToQuery, payeeList]);

  /* Bank accounts */
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [routingNumber, setRoutingNumber] = useState(ROUTING);
  const [accountNumber, setAccountNumber] = useState(ACCOUNT);
  const [payToAddress, setPayToAddress] = useState("");

  useEffect(() => {
    fetch("/api/bank-accounts")
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const accounts = data?.data ?? data ?? [];
        setBankAccounts(accounts);
        if (accounts.length > 0 && !selectedAccountId) {
          const first = accounts[0];
          setSelectedAccountId(String(first.id));
          if (first.bankName) setBankName(first.bankName);
          if (first.routingNumber) setRoutingNumber(first.routingNumber);
          if (first.accountNumber) setAccountNumber(first.accountNumber);
          setBankAddr(first.routingNumber ? `Routing: ${first.routingNumber}` : "Routing: 021-000-021");
        }
      })
      .catch(() => {});
  }, []);

  /* Form */
  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const [checkNumber, setCheckNumber] = useState(String(Math.floor(1000 + Math.random() * 8999)));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [payTo, setPayTo] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customMemo, setCustomMemo] = useState("");
  const [bankName, setBankName] = useState("First National Bank");
  const [bankAddr, setBankAddr] = useState("Routing: 021-000-021");
  const [signatureName, setSignatureName] = useState("");
  const [vendorId, setVendorId] = useState<string>("");

  /* Save state */
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateBill = useUpdateBill();
  const queryClient = useQueryClient();

  /* Derived values for BILLS mode */
  const selectedBills = unpaid.filter(b => selectedIds.has(b.id));
  const billsTotal = selectedBills.reduce((s, b) => s + Number(b.total), 0);
  const billsPayTo = vendorId
    ? (vendors as any[]).find(v => String(v.id) === vendorId)?.company
      || (vendors as any[]).find(v => String(v.id) === vendorId)?.name
      || payTo
    : Array.from(new Set(selectedBills.map(b => b.vendorName))).join(" / ") || payTo;

  const effectivePayTo = mode === "bills" ? billsPayTo : payTo;
  const effectiveAmount = mode === "bills" ? billsTotal : (parseFloat(customAmount) || 0);
  const effectiveMemo = mode === "bills"
    ? selectedBills.map(b => `BILL-${String(b.id).padStart(4, "0")}`).join(", ")
    : customMemo;

  function toggleBill(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (mode !== "bills" || selectedBills.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(selectedBills.map(b =>
        updateBill.mutateAsync({ id: b.id, data: { status: "paid", paymentMethod: "check", checkNumber } as any })
      ));
      await queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      setSaved(true);
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrint() {
    const billLines = mode === "bills"
      ? selectedBills.map(b => ({
          ref: `BILL-${String(b.id).padStart(4, "0")}`,
          desc: b.vendorName,
          amount: Number(b.total),
        }))
      : effectiveMemo
        ? [{ ref: "CUSTOM", desc: effectiveMemo, amount: effectiveAmount }]
        : [];

    const html = buildPrintHtml({
      checkNumber,
      date: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      payTo: effectivePayTo,
      payToAddress: payToAddress || undefined,
      amount: effectiveAmount,
      amountWords: amountInWords(effectiveAmount),
      bankName,
      bankAddr,
      routingNumber,
      accountNumber,
      memo: effectiveMemo,
      signatureName,
      billLines,
    });

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const canSave = mode === "bills" && selectedBills.length > 0 && !saved;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[9000] flex items-start justify-center p-4 overflow-y-auto bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#1e3a5f] to-[#2d5a9e] text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <PenLine size={18} />
            <div>
              <h2 className="font-bold text-base">Write Cheque</h2>
              <p className="text-blue-200 text-xs">Prints full 8.5″ × 11″ — check on top, two stubs below</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Mode toggle ───────────────────────────────── */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <button onClick={() => setMode("bills")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${mode === "bills" ? "bg-[#1e3a5f] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              <FileText size={13} /> From Bills
            </button>
            <button onClick={() => { setMode("custom"); setSaved(false); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors border-l border-slate-200 ${mode === "custom" ? "bg-[#1e3a5f] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              <Edit3 size={13} /> Custom Entry
            </button>
          </div>

          {/* ── From Bills mode ────────────────────────────── */}
          {mode === "bills" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Select Bills</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(new Set(unpaid.map(b => b.id)))}
                    className="text-[10px] font-semibold text-blue-600 hover:underline">All</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={() => setSelectedIds(new Set())}
                    className="text-[10px] font-semibold text-slate-400 hover:underline">None</button>
                </div>
              </div>
              {unpaid.length === 0 ? (
                <div className="text-sm text-slate-400 italic py-3 text-center bg-slate-50 rounded-lg border border-slate-100">
                  No unpaid bills available. Use Custom Entry to write a free-form cheque.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {unpaid.map(b => {
                    const checked = selectedIds.has(b.id);
                    return (
                      <button key={b.id} onClick={() => toggleBill(b.id)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors ${checked ? "border-[#1e3a5f]/40 bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                        {checked
                          ? <CheckSquare size={14} className="text-[#1e3a5f] flex-shrink-0" />
                          : <Square size={14} className="text-slate-300 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{b.vendorName}</div>
                          <div className="text-[10px] text-slate-400">BILL-{String(b.id).padStart(4, "0")} · {formatCurrency(b.total)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Custom Entry mode ──────────────────────────── */}
          {mode === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Pay To</label>
                <div className="relative">
                  <input
                    value={payToQuery || payTo}
                    onChange={e => {
                      const val = e.target.value;
                      setPayToQuery(val);
                      setPayTo(val);
                      setShowPayToSuggest(true);
                      if (!val) { setPayToAddress(""); setVendorId(""); }
                    }}
                    onFocus={() => { if (payToQuery || payTo) setShowPayToSuggest(true); }}
                    onBlur={() => setTimeout(() => setShowPayToSuggest(false), 150)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                    placeholder="Type to search vendors & customers…"
                    autoComplete="off"
                  />
                  {showPayToSuggest && payToSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      {payToSuggestions.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={() => {
                            setPayTo(p.label);
                            setPayToQuery(p.label);
                            setPayToAddress(p.address);
                            if (p.type === "vendor") setVendorId(String(p.rawId));
                            else setVendorId("");
                            setShowPayToSuggest(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                        >
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${p.type === "vendor" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"}`}>
                            {p.type === "vendor" ? "Vendor" : "Customer"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{p.label}</div>
                            {p.address && <div className="text-[10px] text-slate-400 truncate">{p.address}</div>}
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onMouseDown={() => {
                          setPayTo(payToQuery);
                          setShowPayToSuggest(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 border-t border-slate-100"
                      >
                        <span className="text-slate-400">+ Use</span> <span className="font-semibold text-slate-700">"{payToQuery}"</span> <span className="text-slate-400">as free-form payee</span>
                      </button>
                    </div>
                  )}
                </div>
                {payToAddress && (
                  <p className="text-[10px] text-slate-400 mt-1 pl-1">{payToAddress}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Amount ($)</label>
                <input type="number" min="0" step="0.01" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Memo / Reference</label>
                <input value={customMemo} onChange={e => setCustomMemo(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                  placeholder="Invoice or note" />
              </div>
            </div>
          )}

          {/* ── Vendor picker — bills mode only ────────────── */}
          {mode === "bills" && (vendors as any[]).length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Override Pay-To with Vendor
              </label>
              <div className="relative">
                <select value={vendorId} onChange={e => {
                  const v = (vendors as any[]).find(x => String(x.id) === e.target.value);
                  setVendorId(e.target.value);
                  if (v) {
                    const addrParts = [v.address, v.city && v.state ? `${v.city}, ${v.state}` : v.city || v.state, v.zip].filter(Boolean);
                    setPayToAddress(addrParts.join(" · "));
                  } else {
                    setPayToAddress("");
                  }
                }}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white pr-8 focus:outline-none focus:border-blue-400 appearance-none">
                  <option value="">— Select a vendor —</option>
                  {(vendors as any[]).map((v: any) => (
                    <option key={v.id} value={String(v.id)}>{v.company || v.name || `Vendor #${v.id}`}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* ── Cheque fields ─────────────────────────────── */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Cheque Details</p>

            {/* Bank Account Selector */}
            {bankAccounts.length > 0 && (
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Pay From Account</label>
                <div className="relative">
                  <select
                    value={selectedAccountId}
                    onChange={e => {
                      const acct = bankAccounts.find(a => String(a.id) === e.target.value);
                      setSelectedAccountId(e.target.value);
                      if (acct) {
                        if (acct.bankName) setBankName(acct.bankName);
                        if (acct.routingNumber) {
                          setRoutingNumber(acct.routingNumber);
                          setBankAddr(`Routing: ${acct.routingNumber}`);
                        }
                        if (acct.accountNumber) setAccountNumber(acct.accountNumber);
                      }
                    }}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white pr-8 focus:outline-none focus:border-blue-400 appearance-none"
                  >
                    <option value="">— Select bank account —</option>
                    {bankAccounts.map((a: any) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name || a.bankName || `Account #${a.id}`}
                        {a.accountType ? ` (${a.accountType})` : ""}
                        {a.accountNumber ? ` ····${String(a.accountNumber).slice(-4)}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Check #</label>
                <input value={checkNumber} onChange={e => setCheckNumber(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 font-mono"
                  placeholder="1001" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Authorized Signature</label>
                <input value={signatureName} onChange={e => setSignatureName(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
                  placeholder="Name (optional)" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Bank Name</label>
                <input value={bankName} onChange={e => setBankName(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Bank Address / Routing</label>
                <input value={bankAddr} onChange={e => setBankAddr(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
              </div>
            </div>
          </div>

          {/* ── Preview summary ───────────────────────────── */}
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm">
            <div className="flex-1 text-slate-700">
              <span className="font-semibold text-[#1e3a5f]">{COMPANY}</span>
              {effectivePayTo && <> → <span className="font-semibold">{effectivePayTo}</span></>}
              {effectiveAmount > 0 && <> · <span className="font-bold text-[#1e3a5f]">{formatCurrency(effectiveAmount)}</span></>}
            </div>
            <div className="text-xs text-slate-400 font-mono">#{checkNumber}</div>
          </div>

          {/* ── Actions ──────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-400">
              Prints on 8.5″×11″ laser paper · Check on top, two stubs below
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  ✓ Saved & marked paid
                </span>
              )}
              <button onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
                <Printer size={14} /> Print Preview
              </button>
              {canSave && (
                <button onClick={handleSave} disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#1e3a5f] to-[#2d5a9e] text-white text-sm font-semibold hover:from-[#162d4a] hover:to-[#234888] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                  <Save size={14} /> {isSaving ? "Saving…" : "Save & Mark Paid"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
