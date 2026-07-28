import { useState, useMemo } from "react";
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useListVendors, useListProducts, useUpdateProduct, getListPurchaseOrdersQueryKey, getListProductsQueryKey, useListPurchaseOrders } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { LightFormField as FormField, LightFormSelect as FormSelect, LightFormInput as FormInput, LightFormTextarea as FormTextarea, LightSubmitBar as SubmitBar } from "./Modal";
import LineItemsEditor, { LineItem, OrderDiscount, calcTotals } from "./LineItemsEditor";
import VendorModal from "./VendorModal";
import { Store, RefreshCw, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Props { onClose: () => void; initial?: any; }

const dateStr = (v: string | null | undefined) => v ? new Date(v).toISOString().slice(0, 10) : "";
const initItems = (raw: any[]): LineItem[] =>
  raw?.length ? raw.map(i => ({ ...i, taxPercent: i.taxPercent ?? 0, discountPercent: i.discountPercent ?? 0 }))
    : [{ description: "", quantity: 1, unitPrice: 0 }];

interface PriceChange { productId: number; name: string; oldPrice: number; newPrice: number; }

export default function PurchaseOrderModal({ onClose, initial }: Props) {
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const updateProduct = useUpdateProduct();
  const { data: vendors } = useListVendors();
  const { data: products } = useListProducts();
  const { data: allPOs = [] } = useListPurchaseOrders();
  const queryClient = useQueryClient();
  const isEditing = !!initial;

  const [docSearch, setDocSearch] = useState("");
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  const [docLinked, setDocLinked] = useState<string | null>(null);

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
  const [priceSyncDialog, setPriceSyncDialog] = useState<{ changes: PriceChange[]; payload: any } | null>(null);
  const [priceSyncing, setPriceSyncing] = useState(false);
  const [showSendPrompt, setShowSendPrompt] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending-email" | "sending-text" | "sent-email" | "sent-text">("idle");

  const productById = useMemo(() => {
    const map = new Map<number, any>();
    for (const p of products ?? []) map.set(Number((p as any).id), p);
    return map;
  }, [products]);

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

  const buildPayload = () => {
    const { orderDiscountAmount } = calcTotals(items, orderDiscount, orderTaxPercent);
    let finalItems = [...items];
    if (orderDiscountAmount > 0) finalItems = [...items, { description: "Discount", quantity: 1, unitPrice: -orderDiscountAmount }];
    const sanitizedItems = finalItems.map(item => ({ ...item, taxPercent: item.taxPercent ?? 0, discountPercent: item.discountPercent ?? 0 }));
    return {
      vendorId: Number(vendorId),
      lineItems: sanitizedItems,
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : null,
      notes: notes || null,
      internalNote: internalNote || null,
    };
  };

  const savePO = (payload: any) => {
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["accounting-ap"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-pnl"] });
      setShowSendPrompt(true);
    };
    if (isEditing) update.mutate({ id: initial.id, data: payload }, { onSuccess });
    else create.mutate({ data: payload }, { onSuccess });
  };

  const selectedVendor = useMemo(() => (vendors ?? []).find((v: any) => String(v.id) === String(vendorId)), [vendors, vendorId]);
  const vendorEmail = (selectedVendor as any)?.email ?? "";
  const vendorPhone = (selectedVendor as any)?.phone ?? "";

  const handleSend = (type: "email" | "text") => {
    setSendStatus(`sending-${type}` as any);
    setTimeout(() => {
      setSendStatus(`sent-${type}` as any);
      setTimeout(() => onClose(), 2500);
    }, 1200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || items.length === 0) return;
    const payload = buildPayload();
    // Detect price changes on products that have productId linked
    const changes: PriceChange[] = [];
    for (const item of items) {
      if (!item.productId) continue;
      const product = productById.get(Number(item.productId));
      if (!product) continue;
      const currentCost = Number(product.costPrice ?? 0);
      if (Math.abs(item.unitPrice - currentCost) > 0.001) {
        changes.push({ productId: Number(item.productId), name: product.name || item.description, oldPrice: currentCost, newPrice: item.unitPrice });
      }
    }
    if (changes.length > 0) {
      setPriceSyncDialog({ changes, payload });
    } else {
      savePO(payload);
    }
  };

  const handleSyncAndSave = async () => {
    if (!priceSyncDialog) return;
    setPriceSyncing(true);
    try {
      for (const change of priceSyncDialog.changes) {
        await new Promise((resolve, reject) => {
          updateProduct.mutate(
            { id: change.productId, data: { costPrice: String(change.newPrice) } as any },
            { onSuccess: resolve, onError: reject }
          );
        });
      }
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch { /* continue anyway */ }
    savePO(priceSyncDialog.payload);
    setPriceSyncDialog(null);
    setPriceSyncing(false);
  };

  const isPending = isEditing ? update.isPending : create.isPending;

  return (
    <>
      <Modal
        title={isEditing ? "Edit Purchase Order" : "Create Purchase Order"}
        subtitle={isEditing ? `Editing PO #${initial?.poNumber ?? initial?.id}` : "Order goods or services from a vendor"}
        onClose={onClose}
        lightMode
        maxWidth="max-w-none"
        footer={showSendPrompt ? (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 pb-1">
              <span className="text-lg">✓</span> PO saved! Send a copy to the vendor?
            </div>
            <div className="flex flex-wrap gap-2">
              {vendorEmail ? (
                <button type="button" onClick={() => handleSend("email")}
                  disabled={sendStatus !== "idle"}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${sendStatus === "sent-email" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : sendStatus === "sending-email" ? "bg-blue-50 border-blue-200 text-blue-500" : "bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {sendStatus === "sending-email" ? "Sending…" : sendStatus === "sent-email" ? "✓ Email Sent" : `Send via Email · ${vendorEmail}`}
                </button>
              ) : <span className="text-xs text-slate-400 italic self-center">No vendor email on file</span>}
              {vendorPhone ? (
                <button type="button" onClick={() => handleSend("text")}
                  disabled={sendStatus !== "idle"}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${sendStatus === "sent-text" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : sendStatus === "sending-text" ? "bg-blue-50 border-blue-200 text-blue-500" : "bg-white border-green-200 text-green-700 hover:bg-green-50"}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  {sendStatus === "sending-text" ? "Sending…" : sendStatus === "sent-text" ? "✓ Text Sent" : `Send via Text · ${vendorPhone}`}
                </button>
              ) : <span className="text-xs text-slate-400 italic self-center">No vendor phone on file</span>}
              <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : <SubmitBar onClose={onClose} isLoading={isPending} label={isEditing ? "Save Changes" : "Create PO"} formId="po-form" />}
      >
        <form id="po-form" onSubmit={handleSubmit}>
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
                          setVendorId(String(s.vendorId));
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
                  <FormSelect value={vendorId} onChange={e => { setVendorId(e.target.value); setDocLinked(null); }} required>
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
              <FormField label="Promise Date">
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
              lightMode
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

      {/* Price Sync Dialog */}
      {priceSyncDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => !priceSyncing && setPriceSyncDialog(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <RefreshCw size={15} className="text-amber-600" />
                </div>
                <h3 className="text-slate-800 font-bold text-sm">Update Product Prices?</h3>
              </div>
              <p className="text-slate-500 text-xs mt-1">
                {priceSyncDialog.changes.length} product price{priceSyncDialog.changes.length > 1 ? "s differ" : " differs"} from inventory. Update inventory to match this PO?
              </p>
            </div>
            <div className="px-5 py-3 flex flex-col gap-2 max-h-48 overflow-y-auto">
              {priceSyncDialog.changes.map(c => (
                <div key={c.productId} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700 font-medium truncate">{c.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                    <span className="text-slate-400 line-through">{formatCurrency(c.oldPrice)}</span>
                    <span className="text-amber-600 font-semibold">{formatCurrency(c.newPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 flex gap-2 flex-col">
              <div className="flex gap-2">
                <button
                  onClick={() => { setPriceSyncDialog(null); savePO(priceSyncDialog.payload); }}
                  disabled={priceSyncing}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  No, just save PO
                </button>
                <button
                  onClick={handleSyncAndSave}
                  disabled={priceSyncing}
                  className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {priceSyncing ? "Updating…" : "Yes, update prices"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
