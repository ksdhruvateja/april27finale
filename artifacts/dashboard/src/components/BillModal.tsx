import { useState, useMemo } from "react";
import { useCreateBill, useListVendors, useListPurchaseOrders } from "@workspace/api-client-react";
import Modal, { LightFormField as FormField, LightFormSelect as FormSelect, LightFormInput as FormInput, LightFormTextarea as FormTextarea, LightSubmitBar as SubmitBar } from "./Modal";
import LineItemsEditor, { LineItem, OrderDiscount, calcTotals } from "./LineItemsEditor";
import VendorModal from "./VendorModal";
import { Store } from "lucide-react";

interface Props { onClose: () => void; }

export default function BillModal({ onClose }: Props) {
  const create = useCreateBill();
  const { data: vendors } = useListVendors();
  const { data: allPOs = [] } = useListPurchaseOrders();
  const [docSearch, setDocSearch] = useState("");
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  const [docLinked, setDocLinked] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const docQuery = docSearch.trim().toLowerCase();
  const docSuggestions = useMemo(() => {
    if (!docQuery) return [];
    const vendorMap = new Map((vendors ?? []).map((v: any) => [v.id, v]));
    const results: { label: string; sub: string; badge: string; badgeCls: string; vendorId: number; docNum: string }[] = [];
    for (const po of (allPOs as any[])) {
      const num = po.poNumber || `PO-${po.id}`;
      if (!num.toLowerCase().includes(docQuery) && !String(po.id).includes(docQuery)) continue;
      const v = vendorMap.get(Number(po.vendorId));
      if (!v) continue;
      results.push({ label: v.company ? `${v.name} (${v.company})` : v.name, sub: `${num} · PO${po.total != null ? ` · $${Number(po.total).toFixed(2)}` : ""}`, badge: "PO", badgeCls: "bg-emerald-50 text-emerald-600 border-emerald-200", vendorId: v.id, docNum: num });
      if (results.length >= 8) break;
    }
    return results;
  }, [allPOs, vendors, docQuery]);

  const handleSelectVendor = (id: string) => {
    setVendorId(id);
    setDocLinked(null);
    if (dueDate) return;
    const vendor = (vendors ?? []).find((v: any) => String(v.id) === id);
    const terms = (vendor as any)?.paymentTerms as string | null | undefined;
    if (!terms) return;
    const today = new Date();
    const daysMap: Record<string, number> = { net30: 30, net60: 60, net90: 90 };
    const days = daysMap[terms];
    if (days !== undefined) {
      const d = new Date(today); d.setDate(d.getDate() + days);
      setDueDate(d.toISOString().split("T")[0]);
    } else if (terms === "cash" || terms === "cod") {
      setDueDate(today.toISOString().split("T")[0]);
    }
  };
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
    void (async () => {
      try {
        await create.mutateAsync({
          data: {
            vendorId: Number(vendorId),
            lineItems: finalItems,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
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
        title="Create Bill"
        subtitle="Record a vendor bill to be paid"
        onClose={onClose}
        lightMode
        maxWidth="max-w-none"
        footer={<SubmitBar onClose={onClose} isLoading={create.isPending} label="Create Bill" formId="bill-form" />}
      >
        <form id="bill-form" onSubmit={handleSubmit}>
          <div className="px-6 py-4 flex flex-col gap-4">
            {/* Doc # lookup */}
            <div className="relative">
              <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Find vendor by PO #
              </label>
              <input
                type="text"
                placeholder="Type a purchase order number…"
                value={docSearch}
                onChange={e => { setDocSearch(e.target.value); setDocSearchOpen(true); }}
                onFocus={() => setDocSearchOpen(true)}
                onBlur={() => setTimeout(() => setDocSearchOpen(false), 150)}
                autoComplete="off"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 transition-colors"
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
                          handleSelectVendor(String(s.vendorId));
                          setDocSearch(s.docNum);
                          setDocLinked(s.docNum);
                          setDocSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-emerald-50 transition-colors border-b border-slate-50 last:border-0"
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
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Vendor" required>
                <div className="flex gap-2">
                  <FormSelect value={vendorId} onChange={e => handleSelectVendor(e.target.value)} required>
                    <option value="">Select vendor…</option>
                    {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}{(v as any).paymentTerms ? ` · ${(v as any).paymentTerms.toUpperCase().replace("NET","Net ")}` : ""}</option>)}
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
              lightMode
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
