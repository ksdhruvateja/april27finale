import { useState } from "react";
import { useCreatePurchaseOrder, useListVendors, useListPurchaseOrders, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ShoppingCart, Store, CheckSquare2, Square } from "lucide-react";
import Modal, { FormField, FormSelect, FormInput, FormTextarea, SubmitBar } from "./Modal";
import VendorModal from "./VendorModal";
import { formatCurrency } from "@/lib/utils";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  discountPercent: number;
}

interface InvoiceData {
  id: number;
  lineItems: LineItem[];
  invoiceNumber?: string | null;
}

interface Props {
  invoice: InvoiceData;
  onClose: () => void;
  noteTag?: string;
}

interface PODraft {
  vendorId: string;
  selectedIndices: boolean[];
  expectedDate: string;
  notes: string;
}

function makeDefaultDraft(itemCount: number): PODraft {
  return {
    vendorId: "",
    selectedIndices: Array(itemCount).fill(true),
    expectedDate: "",
    notes: "",
  };
}

export default function InvoicePoModal({ invoice, onClose, noteTag }: Props) {
  const { data: vendors } = useListVendors();
  const { data: allPOs } = useListPurchaseOrders();
  const create = useCreatePurchaseOrder();
  const queryClient = useQueryClient();

  const items = (invoice.lineItems as LineItem[]).filter(
    item => item.description !== "Order Discount" && item.unitPrice >= 0
  );

  const existingCount = allPOs?.filter(p => p.sourceInvoiceId === invoice.id).length ?? 0;

  const [drafts, setDrafts] = useState<PODraft[]>([
    {
      ...makeDefaultDraft(items.length),
      notes: noteTag ?? "",
    },
  ]);
  const [showAddVendor, setShowAddVendor] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const invoiceLabel = invoice.invoiceNumber ?? `FC - ${Math.max(5100, 5099 + Number(invoice.id ?? 0))}`;

  function poLabel(draftIndex: number) {
    const m = invoiceLabel.match(/(\d+)(?!.*\d)/);
    const core = m ? m[1] : String(Math.max(5100, 5099 + Number(invoice.id ?? 0)));
    return `FRZPO-${core}-${existingCount + draftIndex + 1}`;
  }

  function addDraft() {
    setDrafts(d => [...d, { ...makeDefaultDraft(items.length), notes: noteTag ?? "" }]);
  }

  function removeDraft(i: number) {
    setDrafts(d => d.filter((_, idx) => idx !== i));
  }

  function updateDraft(i: number, patch: Partial<PODraft>) {
    setDrafts(d => d.map((draft, idx) => idx === i ? { ...draft, ...patch } : draft));
  }

  function toggleItem(draftIdx: number, itemIdx: number) {
    setDrafts(d => d.map((draft, i) => {
      if (i !== draftIdx) return draft;
      const sel = [...draft.selectedIndices];
      sel[itemIdx] = !sel[itemIdx];
      return { ...draft, selectedIndices: sel };
    }));
  }

  function toggleAll(draftIdx: number) {
    setDrafts(d => d.map((draft, i) => {
      if (i !== draftIdx) return draft;
      const allSelected = draft.selectedIndices.every(Boolean);
      return { ...draft, selectedIndices: Array(items.length).fill(!allSelected) };
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    drafts.forEach((draft, i) => {
      if (!draft.vendorId) errs.push(`PO ${i + 1}: vendor is required`);
      if (!draft.selectedIndices.some(Boolean)) errs.push(`PO ${i + 1}: select at least one item`);
    });
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setIsSubmitting(true);
    try {
      for (const draft of drafts) {
        const selectedItems = items.filter((_, idx) => draft.selectedIndices[idx]);
        await create.mutateAsync({
          data: {
            vendorId: Number(draft.vendorId),
            sourceInvoiceId: invoice.id,
            lineItems: selectedItems,
            expectedDate: draft.expectedDate ? new Date(draft.expectedDate).toISOString() : null,
            notes: draft.notes || null,
          }
        });
      }
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      onClose();
    } catch {
      setErrors(["Failed to create one or more purchase orders. Please try again."]);
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalPOs = drafts.length;

  return (
    <>
      <Modal
        title={`Create Purchase Orders from ${invoiceLabel}`}
        subtitle={`${totalPOs} PO${totalPOs > 1 ? "s" : ""} will be created — items locked to invoice line items`}
        onClose={onClose}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={addDraft}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Plus size={13} /> Add Another PO
            </button>
            <SubmitBar onClose={onClose} isLoading={isSubmitting} label={`Create ${totalPOs} PO${totalPOs > 1 ? "s" : ""}`} formId="invoice-po-form" />
          </div>
        }
      >
        <form id="invoice-po-form" onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-5">
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                {errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}

            {drafts.map((draft, draftIdx) => {
              const allSel = draft.selectedIndices.every(Boolean);
              const noneSel = draft.selectedIndices.every(v => !v);
              const selectedItems = items.filter((_, idx) => draft.selectedIndices[idx]);
              const draftTotal = selectedItems.reduce((sum, item) => {
                const gross = item.quantity * item.unitPrice;
                const disc = gross * (item.discountPercent / 100);
                return sum + (gross - disc);
              }, 0);

              return (
                <div key={draftIdx} className="border border-slate-200 rounded-2xl overflow-hidden">
                  {/* PO Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[hsl(224_50%_15%)]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-lime flex items-center justify-center">
                        <ShoppingCart size={13} className="text-black" />
                      </div>
                      <span className="text-white font-bold text-sm">{poLabel(draftIdx)}</span>
                      <span className="text-white/50 text-xs">from {invoiceLabel}</span>
                    </div>
                    {drafts.length > 1 && (
                      <button type="button" onClick={() => removeDraft(draftIdx)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-red-300 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="px-4 py-4 flex flex-col gap-3 bg-white">
                    {/* Vendor */}
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Vendor" required>
                        <div className="flex gap-2">
                          <FormSelect value={draft.vendorId} onChange={e => updateDraft(draftIdx, { vendorId: e.target.value })} required>
                            <option value="">Select vendor…</option>
                            {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </FormSelect>
                          <button type="button" onClick={() => setShowAddVendor(draftIdx)}
                            title="Add new vendor"
                            className="flex-shrink-0 flex items-center px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[hsl(224_50%_20%)] hover:border-[hsl(224_50%_30%)] text-xs font-medium transition-colors">
                            <Store size={13} />
                          </button>
                        </div>
                      </FormField>
                      <FormField label="Expected Delivery Date">
                        <FormInput type="date" value={draft.expectedDate} onChange={e => updateDraft(draftIdx, { expectedDate: e.target.value })} />
                      </FormField>
                    </div>

                    {/* Invoice Items Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice Items</span>
                        <button type="button" onClick={() => toggleAll(draftIdx)}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                          {allSel ? <CheckSquare2 size={12} /> : <Square size={12} />}
                          {allSel ? "Deselect All" : noneSel ? "Select All" : "Select All"}
                        </button>
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                        {items.map((item, itemIdx) => {
                          const checked = draft.selectedIndices[itemIdx];
                          const gross = item.quantity * item.unitPrice;
                          const disc = gross * (item.discountPercent / 100);
                          const lineTotal = gross - disc;
                          return (
                            <label key={itemIdx}
                              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? "bg-blue-50/60" : "bg-white hover:bg-slate-50"}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleItem(draftIdx, itemIdx)}
                                className="w-4 h-4 rounded accent-[hsl(224_50%_30%)] cursor-pointer flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${checked ? "text-slate-800" : "text-slate-400"}`}>{item.description}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Qty {item.quantity} × {formatCurrency(item.unitPrice)}
                                  {item.discountPercent > 0 && <span className="text-red-400"> − {item.discountPercent}%</span>}
                                  {item.taxPercent > 0 && <span> · {item.taxPercent}% tax</span>}
                                </p>
                              </div>
                              <span className={`text-sm font-semibold flex-shrink-0 ${checked ? "text-slate-700" : "text-slate-300"}`}>
                                {formatCurrency(lineTotal)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex justify-end mt-2">
                        <span className="text-xs text-slate-500">
                          {draft.selectedIndices.filter(Boolean).length} of {items.length} items selected
                          {" · "}<span className="font-semibold text-slate-700">{formatCurrency(draftTotal)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Notes */}
                    <FormField label="Notes">
                      <FormTextarea placeholder="Any notes for this purchase order..." value={draft.notes}
                        onChange={e => updateDraft(draftIdx, { notes: e.target.value })} rows={2} />
                    </FormField>
                  </div>
                </div>
              );
            })}
          </div>
        </form>
      </Modal>

      {showAddVendor !== null && (
        <VendorModal
          onClose={() => setShowAddVendor(null)}
          onCreated={id => { updateDraft(showAddVendor!, { vendorId: String(id) }); setShowAddVendor(null); }}
        />
      )}
    </>
  );
}
