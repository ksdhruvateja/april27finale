import { useState } from "react";
import { useCreateBill, useListVendors, getListBillsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormSelect, FormInput, FormTextarea, SubmitBar } from "./Modal";
import LineItemsEditor, { LineItem, OrderDiscount, calcTotals } from "./LineItemsEditor";
import VendorModal from "./VendorModal";
import { Store } from "lucide-react";

interface Props { onClose: () => void; }

export default function BillModal({ onClose }: Props) {
  const create = useCreateBill();
  const { data: vendors } = useListVendors();
  const queryClient = useQueryClient();
  const [vendorId, setVendorId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    {
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxPercent: 0,
      discountPercent: 0,
    },
  ]);
  const [orderDiscount, setOrderDiscount] = useState<OrderDiscount | null>(null);
  const [orderTaxPercent, setOrderTaxPercent] = useState(0);
  const [showAddVendor, setShowAddVendor] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || items.length === 0) return;
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, orderTaxPercent);
    let finalItems = items.map((item) => ({
      ...item,
      taxPercent: item.taxPercent ?? 0,
      discountPercent: item.discountPercent ?? 0,
    }));
    if (orderDiscountAmount > 0) {
      finalItems = [
        ...finalItems,
        {
          description: "Discount",
          quantity: 1,
          unitPrice: -orderDiscountAmount,
          taxPercent: 0,
          discountPercent: 0,
        },
      ];
    }
    create.mutate({
      data: {
        vendorId: Number(vendorId),
        lineItems: finalItems,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes || null,
        internalNote: internalNote || null,
      }
    }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() }); onClose(); }
    });
  };

  return (
    <>
      <Modal
        title="Create Bill"
        subtitle="Record a vendor bill to be paid"
        onClose={onClose}
        placement="right"
        maxWidth="max-w-none"
        footer={<SubmitBar onClose={onClose} isLoading={create.isPending} label="Create Bill" formId="bill-form" />}
      >
        <form id="bill-form" onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Vendor" required>
                <div className="flex gap-2">
                  <FormSelect value={vendorId} onChange={e => setVendorId(e.target.value)} required>
                    <option value="">Select vendor…</option>
                    {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </FormSelect>
                  <button type="button" onClick={() => setShowAddVendor(true)}
                    title="Add new vendor"
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[hsl(224_50%_20%)] hover:border-[hsl(224_50%_30%)] text-xs font-medium transition-colors">
                    <Store size={13} />
                  </button>
                </div>
              </FormField>
              <FormField label="Due Date">
                <FormInput type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </FormField>
            </div>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              orderDiscount={orderDiscount}
              onOrderDiscountChange={setOrderDiscount}
              orderTaxPercent={orderTaxPercent}
              onOrderTaxPercentChange={setOrderTaxPercent}
              vendorPricing
            />
            <FormField label="Notes">
              <FormTextarea placeholder="Any notes for this bill..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
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
      {showAddVendor && (
        <VendorModal
          onClose={() => setShowAddVendor(false)}
          onCreated={id => { setVendorId(String(id)); setShowAddVendor(false); }}
        />
      )}
    </>
  );
}
