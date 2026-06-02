import { useEffect, useMemo, useState } from "react";
import { useCreateEstimate, useListCustomers, useListTaxRates } from "@workspace/api-client-react";
import Modal, { FormField, FormTextarea, SubmitBar } from "./Modal";
import LineItemsEditor, { LineItem, OrderDiscount, calcTotals } from "./LineItemsEditor";
import CustomerModal from "./CustomerModal";
import CustomerCombobox from "./CustomerCombobox";

interface Props { onClose: () => void; }

export default function EstimateModal({ onClose }: Props) {
  const create = useCreateEstimate();
  const { data: customers } = useListCustomers();
  const { data: taxRates } = useListTaxRates();
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [profitCostMode, setProfitCostMode] = useState<"auto" | "manual">("auto");
  const [manualPurchaseCost, setManualPurchaseCost] = useState(0);
  const [orderDiscount, setOrderDiscount] = useState<OrderDiscount | null>(null);
  const [orderTaxPercent, setOrderTaxPercent] = useState(0);
  const [taxHint, setTaxHint] = useState<string | null>(null);
  const [taxExempt, setTaxExempt] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const taxRateMap = useMemo(() => {
    const map: Record<string, { rate: number; name: string }> = {};
    for (const r of taxRates ?? []) {
      if (r.region && r.country === "US") {
        map[r.region] = { rate: Number(r.rate), name: r.name };
      }
    }
    return map;
  }, [taxRates]);

  const applyStateTax = (id: string) => {
    const customer = (customers ?? []).find((c: any) => String(c.id) === id);
    const state = (customer as any)?.shippingAddress?.state || (customer as any)?.state;
    const entry = state ? taxRateMap[state] : undefined;
    if (entry !== undefined) {
      setOrderTaxPercent(entry.rate);
      setTaxHint(`${state} — ${entry.rate}% (shipping address)`);
    } else {
      setOrderTaxPercent(0);
      setTaxHint(null);
    }
  };

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
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
    if (exempt) {
      setOrderTaxPercent(0);
      setTaxHint(null);
    } else if (customerId) {
      applyStateTax(customerId);
    }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || items.length === 0) return;
    const effectiveTax = taxExempt ? 0 : orderTaxPercent;
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, effectiveTax);
    let finalItems = [...items];
    if (orderDiscountAmount > 0) {
      finalItems = [...items, { description: "Discount", quantity: 1, unitPrice: -orderDiscountAmount }];
    }
    const sanitizedItems = finalItems.map(item => ({
      ...item,
      taxPercent: taxExempt ? 0 : (item.taxPercent ?? 0),
      discountPercent: item.discountPercent ?? 0,
    }));
    void (async () => {
      try {
        await create.mutateAsync({
          data: {
            customerId: Number(customerId),
            lineItems: sanitizedItems,
            notes: notes || null,
            internalNote: internalNote || null,
          },
        });
        onClose();
      } catch {
        /* global mutation cache shows error toast */
      }
    })();
  };

  return (
    <>
      <Modal
        title="Create Estimate"
        subtitle="Provide a cost estimate for a customer"
        onClose={onClose}
        placement="right"
        maxWidth="max-w-none"
        footer={<SubmitBar onClose={onClose} isLoading={create.isPending} label="Create Estimate" formId="estimate-form" />}
      >
        <form id="estimate-form" onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-4">
            <FormField label="Customer" required>
              <CustomerCombobox
                customers={customers ?? []}
                value={customerId}
                onSelect={handleSelectCustomer}
                onAddNew={() => setShowAddCustomer(true)}
                required
                lightMode
                placeholder="Type customer name or company to search…"
              />
              <div className="flex items-center justify-between mt-1.5">
                {taxHint && !taxExempt ? (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Tax auto-set: {taxHint}
                  </p>
                ) : <span />}
                <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={e => handleTaxExemptChange(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-amber-600"
                  />
                  <span className="text-[11px] font-medium text-amber-700">Tax Exempt</span>
                </label>
              </div>
            </FormField>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              orderDiscount={orderDiscount}
              onOrderDiscountChange={setOrderDiscount}
              orderTaxPercent={taxExempt ? 0 : orderTaxPercent}
              onOrderTaxPercentChange={v => { if (!taxExempt) setOrderTaxPercent(v); }}
              showProfit
              profitCostMode={profitCostMode}
              onProfitCostModeChange={setProfitCostMode}
              manualPurchaseCost={manualPurchaseCost}
              onManualPurchaseCostChange={setManualPurchaseCost}
              taxExempt={taxExempt}
            />
            <FormField label="Notes">
              <FormTextarea placeholder="Any notes for this estimate..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
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
        <CustomerModal
          onClose={() => setShowAddCustomer(false)}
          onCreated={id => { setCustomerId(String(id)); setShowAddCustomer(false); }}
        />
      )}
    </>
  );
}
