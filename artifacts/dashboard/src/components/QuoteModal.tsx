import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateQuote, useUpdateQuote, useListCustomers, useListTaxRates, getListQuotesQueryKey, useListSalesLeads, useListInvoices, useListQuotes } from "@workspace/api-client-react";
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

export default function QuoteModal({ onClose, initial }: Props) {
  const create = useCreateQuote();
  const update = useUpdateQuote();
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
  const [quoteDate, setQuoteDate] = useState(initial?.createdAt ? dateStr(initial.createdAt) : todayISO());
  const [expiresAt, setExpiresAt] = useState(() => {
    if (initial?.expiresAt) return dateStr(initial.expiresAt);
    const base = initial?.createdAt ? new Date(initial.createdAt) : new Date();
    base.setDate(base.getDate() + 30);
    return base.toISOString().slice(0, 10);
  });
  const [salesLead, setSalesLead] = useState(initial?.salesLead ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [internalNote, setInternalNote] = useState(initial?.internalNote ?? "");
  const [items, setItems] = useState<LineItem[]>(initItems(initial?.lineItems ?? []));
  const [profitCostMode, setProfitCostMode] = useState<"auto" | "manual">("auto");
  const [manualPurchaseCost, setManualPurchaseCost] = useState(0);
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

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    setDocLinked(null);
    const selectedCustomer = (customers ?? []).find((c: any) => String(c.id) === id);
    const isCustomerTaxExempt = Boolean((selectedCustomer as any)?.taxExempt);
    setTaxExempt(isCustomerTaxExempt);
    if (isCustomerTaxExempt) {
      setOrderTaxPercent(0);
      setTaxHint(null);
    } else {
      applyStateTax(id);
    }
  };
  const handleTaxExemptChange = (exempt: boolean) => {
    setTaxExempt(exempt);
    if (exempt) { setOrderTaxPercent(0); setTaxHint(null); }
    else if (customerId) applyStateTax(customerId);
  };

  useEffect(() => {
    if (!customerId || !(customers ?? []).length) return;
    const selectedCustomer = (customers ?? []).find((c: any) => String(c.id) === String(customerId));
    const isCustomerTaxExempt = Boolean((selectedCustomer as any)?.taxExempt);
    setTaxExempt(isCustomerTaxExempt);
    if (isCustomerTaxExempt) {
      setOrderTaxPercent(0);
      setTaxHint(null);
    } else {
      applyStateTax(String(customerId));
    }
  }, [customerId, customers, taxRateMap]);

  useEffect(() => {
    if (!quoteDate) return;
    const base = new Date(quoteDate + "T00:00:00");
    base.setDate(base.getDate() + 30);
    setExpiresAt(base.toISOString().slice(0, 10));
  }, [quoteDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || items.length === 0) return;
    const effectiveTax = taxExempt ? 0 : orderTaxPercent;
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, effectiveTax, freightCost);
    let finalItems = [...items];
    if (orderDiscountAmount > 0) finalItems = [...items, { description: "Discount", quantity: 1, unitPrice: -orderDiscountAmount }];
    if (freightCost > 0) finalItems = [...finalItems, { description: "Freight", quantity: 1, unitPrice: freightCost }];
    const sanitizedItems = finalItems.map(item => ({
      ...item,
      taxPercent: taxExempt ? 0 : (item.taxPercent ?? 0),
      discountPercent: item.discountPercent ?? 0,
    }));

    const payload = {
      customerId: Number(customerId),
      lineItems: sanitizedItems,
      notes: notes || null,
      internalNote: internalNote || null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      salesLead: salesLead || null,
      createdAt: quoteDate ? new Date(quoteDate).toISOString() : undefined,
    } as any;

    const onSuccess = () => { queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() }); onClose(); };

    if (isEditing) update.mutate({ id: initial.id, data: payload }, { onSuccess });
    else create.mutate({ data: payload }, { onSuccess });
  };

  const isPending = isEditing ? update.isPending : create.isPending;

  return (
    <>
      <Modal
        title={isEditing ? "Edit Quote" : "Create Quote"}
        subtitle={isEditing ? `Editing Quote #${initial?.quoteNumber ?? initial?.id}` : "Send a price quote to a customer"}
        onClose={onClose}
        lightMode
        maxWidth="max-w-none"
        footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEditing ? "Save Changes" : "Create Quote"} formId="quote-form" />}
      >
        <form id="quote-form" onSubmit={handleSubmit}>
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
                      <button key={i} type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          handleSelectCustomer(String(s.customerId));
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
              <FormField label="Quote Date">
                <FormInput type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
              </FormField>
              <FormField label="Expires At">
                <FormInput type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
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
              showProfit
              profitCostMode={profitCostMode}
              onProfitCostModeChange={setProfitCostMode}
              manualPurchaseCost={manualPurchaseCost}
              onManualPurchaseCostChange={setManualPurchaseCost}
              taxExempt={taxExempt}
              onTaxExemptChange={handleTaxExemptChange}
              lightMode
            />
            <FormField label="Notes">
              <FormTextarea placeholder="Any notes for this quote..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
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
