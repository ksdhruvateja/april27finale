import { useMemo, useState } from "react";
import { useCreateInvoice, useUpdateInvoice, useListCustomers, useListTaxRates, getListInvoicesQueryKey, useListSalesLeads } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormInput, FormTextarea, SubmitBar } from "./Modal";
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
  const queryClient = useQueryClient();
  const isEditing = !!initial;

  const [customerId, setCustomerId] = useState(initial?.customerId ? String(initial.customerId) : "");
  const [invoiceDate, setInvoiceDate] = useState(initial?.createdAt ? dateStr(initial.createdAt) : todayISO());
  const [dueDate, setDueDate] = useState(dateStr(initial?.dueDate));
  const [salesLead, setSalesLead] = useState(initial?.salesLead ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [internalNote, setInternalNote] = useState(initial?.internalNote ?? "");
  const [items, setItems] = useState<LineItem[]>(initItems(initial?.lineItems ?? []));
  const [orderDiscount, setOrderDiscount] = useState<OrderDiscount | null>(null);
  const [orderTaxPercent, setOrderTaxPercent] = useState<number>(
    (initial?.lineItems as any[])?.[0]?.taxPercent ?? 0
  );
  const [taxHint, setTaxHint] = useState<string | null>(null);
  const [taxExempt, setTaxExempt] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddSalesLead, setShowAddSalesLead] = useState(false);
  const ADD_SALES_LEAD_VALUE = "__add_sales_lead__";

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

  const handleSelectCustomer = (id: string) => { setCustomerId(id); if (!taxExempt) applyStateTax(id); };
  const handleTaxExemptChange = (exempt: boolean) => {
    setTaxExempt(exempt);
    if (exempt) { setOrderTaxPercent(0); setTaxHint(null); }
    else if (customerId) applyStateTax(customerId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || items.length === 0) return;
    const effectiveTax = taxExempt ? 0 : orderTaxPercent;
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, effectiveTax);
    let finalItems = [...items];
    if (orderDiscountAmount > 0) finalItems = [...items, { description: "Discount", quantity: 1, unitPrice: -orderDiscountAmount }];
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

    const onSuccess = () => { queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() }); onClose(); };

    if (isEditing) update.mutate({ id: initial.id, data: payload }, { onSuccess });
    else create.mutate({ data: payload }, { onSuccess });
  };

  const isPending = isEditing ? update.isPending : create.isPending;

  return (
    <>
      <Modal
        title={isEditing ? "Edit Invoice" : "Create Invoice"}
        subtitle={isEditing ? `Editing Invoice #${initial?.invoiceNumber ?? initial?.id}` : "Invoice a customer for products or services"}
        onClose={onClose}
        placement="right"
        maxWidth="max-w-none"
        footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEditing ? "Save Changes" : "Create Invoice"} formId="invoice-form" />}
      >
        <form id="invoice-form" onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-4">
            <FormField label="Customer" required>
              <CustomerCombobox
                customers={customers ?? []}
                value={customerId}
                onSelect={handleSelectCustomer}
                onAddNew={() => setShowAddCustomer(true)}
                required
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
              </FormField>
              <FormField label="Sales Lead">
                <select
                  value={salesLead}
                  onChange={e => {
                    if (e.target.value === ADD_SALES_LEAD_VALUE) {
                      setShowAddSalesLead(true);
                      return;
                    }
                    setSalesLead(e.target.value);
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors bg-white"
                >
                  <option value="">— None —</option>
                  {(salesLeads ?? []).map(lead => (
                    <option key={lead.id} value={`${lead.firstName} ${lead.lastName}`}>
                      {lead.firstName} {lead.lastName}
                    </option>
                  ))}
                  <option value={ADD_SALES_LEAD_VALUE}>+ Add Sales Lead</option>
                </select>
              </FormField>
            </div>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              orderDiscount={orderDiscount}
              onOrderDiscountChange={setOrderDiscount}
              orderTaxPercent={taxExempt ? 0 : orderTaxPercent}
              onOrderTaxPercentChange={v => { if (!taxExempt) setOrderTaxPercent(v); }}
              taxExempt={taxExempt}
              onTaxExemptChange={handleTaxExemptChange}
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
