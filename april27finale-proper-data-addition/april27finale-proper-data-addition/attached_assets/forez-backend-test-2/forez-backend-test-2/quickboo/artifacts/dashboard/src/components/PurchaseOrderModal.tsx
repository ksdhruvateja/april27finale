import { useState } from "react";
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useListVendors, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormSelect, FormInput, FormTextarea, SubmitBar } from "./Modal";
import LineItemsEditor, { LineItem, OrderDiscount, calcTotals } from "./LineItemsEditor";
import VendorModal from "./VendorModal";
import { Store } from "lucide-react";

interface Props { onClose: () => void; initial?: any; }

const dateStr = (v: string | null | undefined) => v ? new Date(v).toISOString().slice(0, 10) : "";
const initItems = (raw: any[]): LineItem[] =>
  raw?.length ? raw.map(i => ({ ...i, taxPercent: i.taxPercent ?? 0, discountPercent: i.discountPercent ?? 0 }))
    : [{ description: "", quantity: 1, unitPrice: 0 }];

export default function PurchaseOrderModal({ onClose, initial }: Props) {
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const { data: vendors } = useListVendors();
  const queryClient = useQueryClient();
  const isEditing = !!initial;

  const [vendorId, setVendorId] = useState(initial?.vendorId ? String(initial.vendorId) : "");
  const [expectedDate, setExpectedDate] = useState(dateStr(initial?.expectedDate));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [internalNote, setInternalNote] = useState(initial?.internalNote ?? "");
  const [items, setItems] = useState<LineItem[]>(initItems(initial?.lineItems ?? []));
  const [orderDiscount, setOrderDiscount] = useState<OrderDiscount | null>(null);
  const [orderTaxPercent, setOrderTaxPercent] = useState<number>(
    (initial?.lineItems as any[])?.[0]?.taxPercent ?? 0
  );
  const [showAddVendor, setShowAddVendor] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || items.length === 0) return;
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, orderTaxPercent);
    let finalItems = [...items];
    if (orderDiscountAmount > 0) finalItems = [...items, { description: "Discount", quantity: 1, unitPrice: -orderDiscountAmount }];
    const sanitizedItems = finalItems.map(item => ({ ...item, taxPercent: item.taxPercent ?? 0, discountPercent: item.discountPercent ?? 0 }));

    const payload = {
      vendorId: Number(vendorId),
      lineItems: sanitizedItems,
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : null,
      notes: notes || null,
      internalNote: internalNote || null,
    };

    const onSuccess = () => { queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() }); onClose(); };

    if (isEditing) update.mutate({ id: initial.id, data: payload }, { onSuccess });
    else create.mutate({ data: payload }, { onSuccess });
  };

  const isPending = isEditing ? update.isPending : create.isPending;

  return (
    <>
      <Modal
        title={isEditing ? "Edit Purchase Order" : "Create Purchase Order"}
        subtitle={isEditing ? `Editing PO #${initial?.poNumber ?? initial?.id}` : "Order goods or services from a vendor"}
        onClose={onClose}
        placement="right"
        maxWidth="max-w-none"
        footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEditing ? "Save Changes" : "Create PO"} formId="po-form" />}
      >
        <form id="po-form" onSubmit={handleSubmit}>
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
              <FormField label="Expected Delivery Date">
                <FormInput type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
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
              <FormTextarea placeholder="Any notes for this purchase order..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
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
        <VendorModal onClose={() => setShowAddVendor(false)} onCreated={id => { setVendorId(String(id)); setShowAddVendor(false); }} />
      )}
    </>
  );
}
