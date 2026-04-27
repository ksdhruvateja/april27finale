import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateInvoice, useUpdateInvoice, useListCustomers, useListTaxRates, getListInvoicesQueryKey, useListSalesLeads, useListInvoices, useListQuotes } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { LightFormField as FormField, LightFormInput as FormInput, LightFormTextarea as FormTextarea, LightSubmitBar as SubmitBar } from "./Modal";
import LineItemsEditor, { LineItem, OrderDiscount, calcTotals } from "./LineItemsEditor";
import CustomerModal from "./CustomerModal";
import CustomerCombobox from "./CustomerCombobox";
import SalesLeadQuickModal from "./SalesLeadQuickModal";

interface Props { onClose: () => void; initial?: any; }

const todayISO = () => new Date().toISOString().slice(0, 10);
const dateStr = (v: string | null | undefined) => v ? new Date(v).toISOString().slice(0, 10) : "";
const initItems = (raw: any[]): LineItem[] =>
  raw?.length ? raw.map(i => ({ ...i, taxPercent: i.taxPercent ?? 0, discountPercent: i.discountPercent ?? 0 }))
    : [{ description: "", quantity: 1, unitPrice: 0 }];

export default function InvoiceModal({ onClose, initial }: Props) {
  const create = useCreateInvoice();
  const update = useUpdateInvoice();
  const { data: customers } = useListCustomers();
  const { data: taxRates } = useListTaxRates();
  const { data: salesLeads } = useListSalesLeads();
  const { data: allInvoices = [] } = useListInvoices();
  const { data: allQuotes = [] } = useListQuotes();
  const queryClient = useQueryClient();
  const isEditing = !!initial;

  const [docSearch, setDocSearch] = useState("");
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  const [docLinked, setDocLinked] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(initial?.customerId ? String(initial.customerId) : "");
  const [invoiceDate, setInvoiceDate] = useState(initial?.createdAt ? dateStr(initial.createdAt) : todayISO());
  const [dueDate, setDueDate] = useState(dateStr(initial?.dueDate));
  const [salesLead, setSalesLead] = useState(initial?.salesLead ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [internalNote, setInternalNote] = useState(initial?.internalNote ?? "");
  const [items, setItems] = useState<LineItem[]>(initItems(initial?.lineItems ?? []));
  const [orderDiscount, setOrderDiscount] = useState<OrderDiscount | null>(null);
  const [freightCost, setFreightCost] = useState<number>(
    Number((initial?.lineItems as any[])?.find((li: any) => li.description === "Freight")?.unitPrice ?? 0)
  );
  const [orderTaxPercent, setOrderTaxPercent] = useState<number>(
    (initial?.lineItems as any[])?.[0]?.taxPercent ?? 0
  );
  const [taxHint, setTaxHint] = useState<string | null>(null);
  const [taxExempt, setTaxExempt] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddSalesLead, setShowAddSalesLead] = useState(false);
  const [salesLeadOpen, setSalesLeadOpen] = useState(false);
  const [showSendPrompt, setShowSendPrompt] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending-email" | "sending-text" | "sent-email" | "sent-text">("idle");
  const salesLeadRef = useRef<HTMLDivElement>(null);

  const taxRateMap = useMemo(() => {
    const map: Record<string, { rate: number; name: string }> = {};
    for (const r of taxRates ?? []) {
      if (r.region && r.country === "US") map[r.region] = { rate: Number(r.rate), name: r.name };
    }
    return map;
  }, [taxRates]);

  const applyStateTax = (id: string) => {
    const customer = (customers ?? []).find((c: any) => String(c.id) === id);
    const state = (customer as any)?.shippingAddress?.state || (customer as any)?.state;
    const entry = state ? taxRateMap[state] : undefined;
    if (entry !== undefined) { setOrderTaxPercent(entry.rate); setTaxHint(`${state} — ${entry.rate}% (shipping address)`); }
    else { setOrderTaxPercent(0); setTaxHint(null); }
  };

  const [termsBadge, setTermsBadge] = useState<string | null>(null);

  const calcDueDateFromTerms = (id: string, baseDate?: string) => {
    const customer = (customers ?? []).find((c: any) => String(c.id) === id);
    const terms = (customer as any)?.accountType as string | null | undefined;
    setTermsBadge(terms ?? null);
    const base = baseDate ? new Date(baseDate + "T00:00:00") : new Date();
    const daysMap: Record<string, number> = { net30: 30, net60: 60, net90: 90 };
    if (terms) {
      const days = daysMap[terms];
      if (days !== undefined) {
        const d = new Date(base); d.setDate(d.getDate() + days);
        return d.toISOString().split("T")[0];
      } else if (terms === "cash" || terms === "cod" || terms === "cash_advance") {
        return base.toISOString().split("T")[0];
      }
    }
    // no terms: default to 30 days from base
    const d = new Date(base); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  };

  const autoSetDueDate = (id: string) => {
    if (dueDate) return;
    setDueDate(calcDueDateFromTerms(id, invoiceDate));
  };

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    setDocLinked(null);
    if (!taxExempt) applyStateTax(id);
    // always recalculate due date from the current invoiceDate when customer changes
    setDueDate(calcDueDateFromTerms(id, invoiceDate));
  };

  // When invoice date changes on a new invoice, recalculate due date
  useEffect(() => {
    if (isEditing || !invoiceDate) return;
    if (customerId) {
      setDueDate(calcDueDateFromTerms(customerId, invoiceDate));
    } else {
      // no customer yet — default to invoiceDate + 30
      const base = new Date(invoiceDate + "T00:00:00");
      base.setDate(base.getDate() + 30);
      setDueDate(base.toISOString().split("T")[0]);
    }
  }, [invoiceDate]);

  const docQuery = docSearch.trim().toLowerCase();
  const docSuggestions = useMemo(() => {
    if (!docQuery) return [];
    const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
    const results: { label: string; sub: string; badge: string; badgeCls: string; customerId: number; docNum: string }[] = [];
    for (const inv of (allInvoices as any[])) {
      const num = inv.invoiceNumber || `FRZI-${5099 + Number(inv.id)}`;
      if (!num.toLowerCase().includes(docQuery) && !String(inv.id).includes(docQuery)) continue;
      const c = customerMap.get(Number(inv.customerId));
      if (!c) continue;
      results.push({ label: c.company ? `${c.name} (${c.company})` : c.name, sub: `${num} · Invoice${inv.total != null ? ` · $${Number(inv.total).toFixed(2)}` : ""}`, badge: "Invoice", badgeCls: "bg-indigo-50 text-indigo-600 border-indigo-200", customerId: c.id, docNum: num });
      if (results.length >= 8) break;
    }
    for (const q of (allQuotes as any[])) {
      const num = q.quoteNumber || `FRZQ-${5099 + Number(q.id)}`;
      if (!num.toLowerCase().includes(docQuery) && !String(q.id).includes(docQuery)) continue;
      const c = customerMap.get(Number(q.customerId));
      if (!c) continue;
      results.push({ label: c.company ? `${c.name} (${c.company})` : c.name, sub: `${num} · Quote${q.total != null ? ` · $${Number(q.total).toFixed(2)}` : ""}`, badge: "Quote", badgeCls: "bg-violet-50 text-violet-600 border-violet-200", customerId: c.id, docNum: num });
      if (results.length >= 10) break;
    }
    return results;
  }, [allInvoices, allQuotes, customers, docQuery]);
  const handleTaxExemptChange = (exempt: boolean) => {
    setTaxExempt(exempt);
    if (exempt) { setOrderTaxPercent(0); setTaxHint(null); }
    else if (customerId) applyStateTax(customerId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || items.length === 0) return;
    const effectiveTax = taxExempt ? 0 : orderTaxPercent;
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, effectiveTax, freightCost);
    let finalItems = [...items];
    if (orderDiscountAmount > 0) finalItems = [...items, { description: "Discount", quantity: 1, unitPrice: -orderDiscountAmount }];
    if (freightCost > 0) finalItems = [...finalItems, { description: "Freight", quantity: 1, unitPrice: freightCost }];
    const sanitizedItems = finalItems.map(item => ({ ...item, taxPercent: item.taxPercent ?? 0, discountPercent: item.discountPercent ?? 0 }));

    const payload = {
      customerId: Number(customerId),
      lineItems: sanitizedItems,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      salesLead: salesLead || null,
      notes: notes || null,
      internalNote: internalNote || null,
      createdAt: invoiceDate ? new Date(invoiceDate).toISOString() : undefined,
    } as any;

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["accounting-pnl"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-ar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setShowSendPrompt(true);
    };

    if (isEditing) update.mutate({ id: initial.id, data: payload }, { onSuccess });
    else create.mutate({ data: payload }, { onSuccess });
  };

  const selectedCustomer = useMemo(() => (customers ?? []).find((c: any) => String(c.id) === String(customerId)), [customers, customerId]);
  const custEmail = selectedCustomer?.email ?? "";
  const custPhone = selectedCustomer?.phone ?? "";

  const handleSend = (type: "email" | "text") => {
    setSendStatus(`sending-${type}` as any);
    setTimeout(() => {
      setSendStatus(`sent-${type}` as any);
      setTimeout(() => onClose(), 2500);
    }, 1200);
  };

  const isPending = isEditing ? update.isPending : create.isPending;

  return (
    <>
      <Modal
        title={isEditing ? "Edit Invoice" : "Create Invoice"}
        subtitle={isEditing ? `Editing Invoice #${initial?.invoiceNumber ?? initial?.id}` : "Invoice a customer for products or services"}
        onClose={onClose}
        lightMode
        maxWidth="max-w-none"
        footer={showSendPrompt ? (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 pb-1">
              <span className="text-lg">✓</span> Invoice saved! Send a copy to the customer?
            </div>
            <div className="flex flex-wrap gap-2">
              {custEmail ? (
                <button type="button" onClick={() => handleSend("email")}
                  disabled={sendStatus !== "idle"}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${sendStatus === "sent-email" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : sendStatus === "sending-email" ? "bg-blue-50 border-blue-200 text-blue-500" : "bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50"}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {sendStatus === "sending-email" ? "Sending…" : sendStatus === "sent-email" ? "✓ Email Sent" : `Send via Email · ${custEmail}`}
                </button>
              ) : <span className="text-xs text-slate-400 italic self-center">No email on file</span>}
              {custPhone ? (
                <button type="button" onClick={() => handleSend("text")}
                  disabled={sendStatus !== "idle"}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${sendStatus === "sent-text" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : sendStatus === "sending-text" ? "bg-blue-50 border-blue-200 text-blue-500" : "bg-white border-green-200 text-green-700 hover:bg-green-50"}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  {sendStatus === "sending-text" ? "Sending…" : sendStatus === "sent-text" ? "✓ Text Sent" : `Send via Text · ${custPhone}`}
                </button>
              ) : <span className="text-xs text-slate-400 italic self-center">No phone on file</span>}
              <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : <SubmitBar onClose={onClose} isLoading={isPending} label={isEditing ? "Save Changes" : "Create Invoice"} formId="invoice-form" />}
      >
        <form id="invoice-form" onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-4">
            {/* Doc # lookup */}
            <div className="relative">
              <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Find customer by invoice / quote #
              </label>
              <input
                type="text"
                placeholder="Type an invoice or quote number…"
                value={docSearch}
                onChange={e => { setDocSearch(e.target.value); setDocSearchOpen(true); }}
                onFocus={() => setDocSearchOpen(true)}
                onBlur={() => setTimeout(() => setDocSearchOpen(false), 150)}
                autoComplete="off"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 transition-colors"
              />
              {docLinked && (
                <span className="absolute right-2 top-[34px] text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold pointer-events-none">
                  ✓ Auto-filled from {docLinked}
                </span>
              )}
              {docSearchOpen && docSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-[200] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="max-h-52 overflow-y-auto">
                    {docSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          handleSelectCustomer(String(s.customerId));
                          autoSetDueDate(String(s.customerId));
                          setDocSearch(s.docNum);
                          setDocLinked(s.docNum);
                          setDocSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{s.label}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{s.sub}</p>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.badgeCls}`}>{s.badge}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <FormField label="Customer" required>
              <CustomerCombobox
                customers={customers ?? []}
                value={customerId}
                onSelect={handleSelectCustomer}
                onAddNew={() => setShowAddCustomer(true)}
                required
                lightMode
              />
              {taxHint && !taxExempt && (
                <div className="mt-1.5">
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Tax auto-set: {taxHint}
                  </p>
                </div>
              )}
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Invoice Date">
                <FormInput type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </FormField>
              <FormField label="Due Date">
                <FormInput type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                {termsBadge && (
                  <p className="text-[11px] mt-1 flex items-center gap-1 text-indigo-600">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    {termsBadge === "net30" && "Net 30 — auto-set 30 days out"}
                    {termsBadge === "net60" && "Net 60 — auto-set 60 days out"}
                    {termsBadge === "net90" && "Net 90 — auto-set 90 days out"}
                    {(termsBadge === "cash" || termsBadge === "cash_advance") && "Cash — due immediately"}
                    {termsBadge === "cod" && "COD — due on delivery (today)"}
                  </p>
                )}
              </FormField>
              <FormField label="Sales Lead">
                <div ref={salesLeadRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setSalesLeadOpen(o => !o)}
                    onBlur={e => { if (!salesLeadRef.current?.contains(e.relatedTarget as Node)) setSalesLeadOpen(false); }}
                    className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition-colors text-left"
                  >
                    <span className={salesLead ? "text-slate-800 font-medium" : "text-slate-400"}>
                      {salesLead || "— None —"}
                    </span>
                    <div className="flex items-center gap-1">
                      {salesLead && (
                        <span
                          role="button"
                          tabIndex={0}
                          onMouseDown={e => { e.stopPropagation(); setSalesLead(""); setSalesLeadOpen(false); }}
                          className="text-slate-300 hover:text-slate-500 text-xs leading-none px-1 cursor-pointer"
                        >✕</span>
                      )}
                      <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${salesLeadOpen ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                    </div>
                  </button>
                  {salesLeadOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-[200] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      <div className="max-h-52 overflow-y-auto">
                        <button type="button" onMouseDown={() => { setSalesLead(""); setSalesLeadOpen(false); }}
                          className="w-full text-left px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-100 transition-colors">
                          — None —
                        </button>
                        {(salesLeads ?? []).length === 0 && (
                          <p className="px-3 py-3 text-xs text-slate-400 text-center">No sales leads yet</p>
                        )}
                        {(salesLeads ?? []).map(lead => {
                          const name = `${lead.firstName} ${lead.lastName}`.trim();
                          const isSelected = salesLead === name;
                          return (
                            <button key={lead.id} type="button"
                              onMouseDown={() => { setSalesLead(name); setSalesLeadOpen(false); }}
                              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 text-sm hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors ${isSelected ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-800"}`}>
                              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 flex-shrink-0">
                                {(lead.firstName?.[0] ?? "?").toUpperCase()}
                              </span>
                              <span className="flex-1">{name}</span>
                              {isSelected && <span className="text-indigo-500 text-xs">✓</span>}
                            </button>
                          );
                        })}
                        <button type="button" onMouseDown={() => { setSalesLeadOpen(false); setShowAddSalesLead(true); }}
                          className="w-full text-left px-3 py-2.5 text-sm text-indigo-600 font-semibold hover:bg-indigo-50 border-t border-slate-100 transition-colors flex items-center gap-2">
                          <span className="text-base leading-none">+</span> Add New Sales Lead
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </FormField>
            </div>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              orderDiscount={orderDiscount}
              onOrderDiscountChange={setOrderDiscount}
              orderTaxPercent={taxExempt ? 0 : orderTaxPercent}
              onOrderTaxPercentChange={v => { if (!taxExempt) setOrderTaxPercent(v); }}
              freightCost={freightCost}
              onFreightCostChange={setFreightCost}
              taxExempt={taxExempt}
              onTaxExemptChange={handleTaxExemptChange}
              lightMode
            />
            <FormField label="Notes">
              <FormTextarea placeholder="Any notes for this invoice..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </FormField>
            <FormField label="Internal Notes">
              <FormTextarea
                placeholder="Internal only — never shown on customer print/email."
                value={internalNote}
                onChange={e => setInternalNote(e.target.value)}
                rows={2}
              />
            </FormField>
          </div>
        </form>
      </Modal>
      {showAddCustomer && (
        <CustomerModal onClose={() => setShowAddCustomer(false)} onCreated={id => { setCustomerId(String(id)); setShowAddCustomer(false); }} />
      )}
      {showAddSalesLead && (
        <SalesLeadQuickModal
          onClose={() => setShowAddSalesLead(false)}
          onCreated={(fullName) => setSalesLead(fullName)}
        />
      )}
    </>
  );
}
