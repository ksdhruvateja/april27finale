import { useState } from "react";
import { useCreateProduct, useUpdateProduct, useListVendors, useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { LightFormField as FormField, LightFormInput as FormInput, LightFormSelect as FormSelect, LightFormTextarea as FormTextarea, LightSubmitBar as SubmitBar } from "./Modal";
import { Package, Archive, RefreshCw, Percent, DollarSign, Clock, TrendingUp, Info, Calculator, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { UNIT_OPTIONS, UNIT_VALUES } from "@/lib/units";
import { QuickBooksFieldsSection, parseQbExtras, qbExtrasFromForm } from "./QuickBooksFields";

interface ProductData {
  id: number;
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  salePrice: number;
  costPrice: number;
  taxPercent: number;
  discountPercent: number;
  discountAmount?: number;
  minOrderQty?: number;
  preferredVendorId?: number | null;
  isInventoryItem?: boolean;
  estimatedLeadDays?: number | null;
  optimalStockMin?: number | null;
  unit?: string | null;
  notes?: string | null;
  quickbooksExtras?: Record<string, unknown> | null;
}

export type ProductPreset = Partial<
  Pick<ProductData, "name" | "sku" | "description" | "unit" | "salePrice" | "costPrice">
>;

interface Props {
  onClose: () => void;
  product?: ProductData;
  /** Prefill fields when creating from a line item or elsewhere */
  initial?: ProductPreset;
  onCreated?: (product: ProductData) => void;
}

function generateFzcp(existingSkus: string[]): string {
  const nums = existingSkus
    .map(s => s?.match(/^FZCP-(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const candidates = Array.from({ length: 100 }, () => Math.floor(10000 + Math.random() * 89999));
  const fresh = candidates.find(n => !nums.includes(n));
  return `FZCP-${fresh ?? Math.floor(10000 + Math.random() * 89999)}`;
}

export default function ProductModal({ onClose, product, initial, onCreated }: Props) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const { data: vendors } = useListVendors();
  const { data: allProducts } = useListProducts();
  const queryClient = useQueryClient();
  const isEdit = !!product;
  const seed = product ?? initial;

  const initDiscountType = (): "percent" | "dollar" => {
    if (!product) return "percent";
    if ((product.discountAmount ?? 0) > 0 && (product.discountPercent ?? 0) === 0) return "dollar";
    return "percent";
  };

  const [form, setForm] = useState({
    name: seed?.name ?? "",
    description: seed?.description ?? "",
    sku: seed?.sku ?? "",
    category: product?.category ?? "",
    unit: seed?.unit ?? product?.unit ?? "ea",
    salePrice: seed?.salePrice != null ? String(seed.salePrice) : (product?.salePrice != null ? String(product.salePrice) : ""),
    costPrice: seed?.costPrice != null ? String(seed.costPrice) : (product?.costPrice != null ? String(product.costPrice) : ""),
    taxPercent: product?.taxPercent != null ? String(product.taxPercent) : "0",
    discountPercent: product?.discountPercent != null ? String(product.discountPercent) : "0",
    discountAmount: product?.discountAmount != null ? String(product.discountAmount) : "0",
    discountType: initDiscountType(),
    minOrderQty: product?.minOrderQty != null ? String(product.minOrderQty) : "1",
    preferredVendorId: product?.preferredVendorId != null ? String(product.preferredVendorId) : "",
    isInventoryItem: product?.isInventoryItem !== false,
    estimatedLeadDays: product?.estimatedLeadDays != null ? String(product.estimatedLeadDays) : "",
    optimalStockMin: product?.optimalStockMin != null ? String(product.optimalStockMin) : "",
    notes: product?.notes ?? "",
  });

  const [qbForm, setQbForm] = useState(() => parseQbExtras(product?.quickbooksExtras));

  const [generatingSku, setGeneratingSku] = useState(false);

  // ── Price Calculator ──────────────────────────────────────────────────
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMode, setCalcMode] = useState<"percent" | "amount">("percent");
  const [calcValue, setCalcValue] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleAutoSku = async () => {
    setGeneratingSku(true);
    const skus = ((allProducts ?? []) as any[]).map((p: any) => p.sku ?? "");
    const generated = generateFzcp(skus);
    setForm(f => ({ ...f, sku: generated }));
    setGeneratingSku(false);
  };

  const saleP = parseFloat(form.salePrice) || 0;
  const costP = parseFloat(form.costPrice) || 0;
  const discP = form.discountType === "percent" ? parseFloat(form.discountPercent) || 0 : 0;
  const discA = form.discountType === "dollar" ? parseFloat(form.discountAmount) || 0 : 0;
  const effectivePrice = saleP - (saleP * discP / 100) - discA;
  const margin = saleP > 0 ? ((effectivePrice - costP) / effectivePrice) * 100 : 0;

  // Calculator preview
  const calcNum = parseFloat(calcValue) || 0;
  const calcResult = costP > 0 && calcNum > 0
    ? (calcMode === "percent" ? costP * (1 + calcNum / 100) : costP + calcNum)
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.salePrice || !form.costPrice) return;
    const data: any = {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      description: form.description || null,
      unit: form.unit || null,
      salePrice: Number(form.salePrice),
      costPrice: Number(form.costPrice),
      taxPercent: Number(form.taxPercent) || 0,
      discountPercent: form.discountType === "percent" ? Number(form.discountPercent) || 0 : 0,
      discountAmount: form.discountType === "dollar" ? Number(form.discountAmount) || 0 : 0,
      minOrderQty: Number(form.minOrderQty) || 1,
      preferredVendorId: form.preferredVendorId ? Number(form.preferredVendorId) : null,
      isInventoryItem: form.isInventoryItem,
      estimatedLeadDays: !form.isInventoryItem && form.estimatedLeadDays ? Number(form.estimatedLeadDays) : null,
      optimalStockMin: form.isInventoryItem && form.optimalStockMin ? Number(form.optimalStockMin) : null,
      notes: form.notes || null,
      quickbooksExtras: qbExtrasFromForm(qbForm),
    };

    if (isEdit) {
      update.mutate({ id: product.id, data }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); }
      });
    } else {
      create.mutate({ data }, {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          onCreated?.(created as ProductData);
          onClose();
        },
      });
    }
  };

  const isPending = isEdit ? update.isPending : create.isPending;

  return (
    <Modal
      title={isEdit ? "Edit Product" : "Add Product"}
      subtitle={isEdit ? "Update product details" : "Add a new product to your catalog"}
      onClose={onClose}
      maxWidth="max-w-3xl"
      lightMode
      footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEdit ? "Save Changes" : "Add Product"} formId="product-form" />}
    >
      <form id="product-form" onSubmit={handleSubmit}>
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* ── Inventory type ─────────────────────────────────────── */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
            <button type="button"
              onClick={() => setForm(f => ({ ...f, isInventoryItem: true }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                form.isInventoryItem
                  ? "bg-[hsl(224_50%_15%)] text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-400"
              }`}>
              <Package size={13} /> Inventory Item
            </button>
            <button type="button"
              onClick={() => setForm(f => ({ ...f, isInventoryItem: false }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                !form.isInventoryItem
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-400"
              }`}>
              <Archive size={13} /> Non-Inventory Item
            </button>
            <span className="text-xs text-slate-400">
              {form.isInventoryItem ? "Stock is tracked for this item" : "No stock tracking — service, digital, or special order"}
            </span>
          </div>

          {/* ── Product Name ───────────────────────────────────────── */}
          <FormField label="Product Name" required>
            <FormInput placeholder="e.g. Cloud Storage 1TB" value={form.name} onChange={set("name")} required autoFocus />
          </FormField>

          {/* ── Description ───────────────────────────────────────── */}
          <FormField label="Description">
            <FormTextarea placeholder="Short description of the product or service (shown on invoices and quotes)..." value={form.description} onChange={set("description")} rows={2} />
          </FormField>

          {/* ── SKU + Category ────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SKU">
              <div className="flex gap-1.5">
                <FormInput
                  placeholder="e.g. FZCP-12345"
                  value={form.sku}
                  onChange={set("sku")}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleAutoSku}
                  disabled={generatingSku}
                  title="Auto-generate SKU from database"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw size={12} className={generatingSku ? "animate-spin" : ""} />
                  Auto
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Format: FZCP-XXXXX — checked against database</p>
            </FormField>
            <FormField label="Category">
              <FormInput placeholder="Software, Services…" value={form.category} onChange={set("category")} />
            </FormField>
          </div>

          {/* ── Pricing ───────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={13} className="text-slate-500" />
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Pricing</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="My Price (Cost)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <FormInput type="number" step="0.01" min="0" placeholder="0.00" value={form.costPrice} onChange={set("costPrice")} required className="pl-6" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">What you pay — internal only</p>
              </FormField>
              <FormField label="Selling Price (Customer)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <FormInput type="number" step="0.01" min="0" placeholder="0.00" value={form.salePrice} onChange={set("salePrice")} required className="pl-6" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Auto-filled in invoices & quotes</p>
              </FormField>
              <FormField label="Unit">
                <select
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400 transition-colors"
                  value={UNIT_VALUES.has(form.unit) ? form.unit : "__custom__"}
                  onChange={e => {
                    if (e.target.value === "__custom__") setForm(f => ({ ...f, unit: "" }));
                    else setForm(f => ({ ...f, unit: e.target.value }));
                  }}
                >
                  {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
                {!UNIT_VALUES.has(form.unit) && (
                  <div className="mt-1.5">
                    <FormInput placeholder="e.g. pallet, sheet, bundle…" value={form.unit} onChange={set("unit")} />
                  </div>
                )}
              </FormField>
            </div>

            {/* ── Price Calculator ───────────────────────────────── */}
            <div className="border border-indigo-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setCalcOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Calculator size={13} className="text-indigo-600" />
                  <span className="text-xs font-semibold text-indigo-700">Price Calculator</span>
                  <span className="text-[10px] text-indigo-400">— auto-set selling price from cost + markup</span>
                </div>
                {calcOpen ? <ChevronUp size={13} className="text-indigo-500" /> : <ChevronDown size={13} className="text-indigo-500" />}
              </button>

              {calcOpen && (
                <div className="px-4 py-3 bg-white flex flex-col gap-3">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-medium">Markup by:</span>
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => { setCalcMode("percent"); setCalcValue(""); }}
                        className={`flex items-center gap-1 px-3 py-1.5 font-semibold transition-colors ${calcMode === "percent" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                      >
                        <Percent size={11} /> Percentage
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCalcMode("amount"); setCalcValue(""); }}
                        className={`flex items-center gap-1 px-3 py-1.5 font-semibold transition-colors border-l border-slate-200 ${calcMode === "amount" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                      >
                        <DollarSign size={11} /> Fixed Amount
                      </button>
                    </div>
                  </div>

                  {/* Input row */}
                  <div className="flex items-center gap-3">
                    <div className="relative w-40">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        {calcMode === "percent" ? "%" : "$"}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={calcMode === "percent" ? "e.g. 30" : "e.g. 50.00"}
                        value={calcValue}
                        onChange={e => setCalcValue(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors"
                      />
                    </div>

                    {/* Preview */}
                    {calcResult !== null && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="text-slate-400">
                          ${costP.toFixed(2)}
                          {calcMode === "percent" ? ` + ${calcNum}%` : ` + $${calcNum.toFixed(2)}`}
                        </span>
                        <ArrowRight size={12} className="text-indigo-400" />
                        <span className="font-bold text-indigo-700 text-sm">${calcResult.toFixed(2)}</span>
                      </div>
                    )}

                    {/* Apply button */}
                    {calcResult !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, salePrice: calcResult!.toFixed(2) }));
                          setCalcOpen(false);
                          setCalcValue("");
                        }}
                        className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        Apply →
                      </button>
                    )}
                  </div>

                  {!costP && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Enter your cost price first, then the calculator will work.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Margin preview */}
            {saleP > 0 && costP > 0 && (
              <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${margin >= 30 ? "bg-emerald-50 border border-emerald-200" : margin >= 10 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
                <span className={`font-semibold ${margin >= 30 ? "text-emerald-700" : margin >= 10 ? "text-amber-700" : "text-red-700"}`}>
                  Gross margin: {margin.toFixed(1)}%
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-600">Effective price: ${effectivePrice.toFixed(2)}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-600">Profit/unit: ${(effectivePrice - costP).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* ── Discount ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Default Discount</p>
                <span className="text-[10px] text-slate-400">(applied to invoices & quotes)</span>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, discountType: "percent" }))}
                  className={`flex items-center gap-1 px-3 py-1.5 font-semibold transition-colors ${form.discountType === "percent" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  <Percent size={11} /> %
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, discountType: "dollar" }))}
                  className={`flex items-center gap-1 px-3 py-1.5 font-semibold transition-colors border-l border-slate-200 ${form.discountType === "dollar" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  <DollarSign size={11} /> $
                </button>
              </div>
            </div>
            {form.discountType === "percent" ? (
              <div className="flex items-center gap-3">
                <div className="w-40">
                  <FormInput type="number" step="0.01" min="0" max="100" placeholder="0" value={form.discountPercent} onChange={set("discountPercent")} />
                </div>
                {parseFloat(form.discountPercent) > 0 && saleP > 0 && (
                  <span className="text-xs text-indigo-600 font-semibold">
                    = ${(saleP * parseFloat(form.discountPercent) / 100).toFixed(2)} off
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <FormInput type="number" step="0.01" min="0" placeholder="0.00" value={form.discountAmount} onChange={set("discountAmount")} className="pl-6" />
                </div>
                {parseFloat(form.discountAmount) > 0 && saleP > 0 && (
                  <span className="text-xs text-indigo-600 font-semibold">
                    = {((parseFloat(form.discountAmount) / saleP) * 100).toFixed(1)}% off
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Inventory: Optimal stock threshold ────────────────── */}
          {form.isInventoryItem && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Stock Status Thresholds</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Optimal Stock (min qty)">
                  <FormInput type="number" step="1" min="0" placeholder="e.g. 20" value={form.optimalStockMin} onChange={set("optimalStockMin")} />
                  <p className="text-[10px] text-slate-400 mt-1">
                    When stock ≥ this → <span className="text-emerald-600 font-semibold">Optimal</span>
                  </p>
                </FormField>
                <div className="flex flex-col justify-center">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="text-slate-600">Optimal — stock ≥ threshold</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="text-slate-600">Low — above reorder point</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-slate-600">Non-optimal — at/below reorder</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Non-inventory: Estimated lead time ────────────────── */}
          {!form.isInventoryItem && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-amber-600" />
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Estimated Arrival Time</p>
                <span className="ml-auto flex items-center gap-1 text-[10px] bg-amber-100 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 font-semibold">
                  <Info size={9} /> Internal only — not shown to customer
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-40">
                  <FormInput type="number" step="1" min="1" placeholder="e.g. 7" value={form.estimatedLeadDays} onChange={set("estimatedLeadDays")} />
                </div>
                <span className="text-sm text-slate-600">business days</span>
                {form.estimatedLeadDays && (
                  <span className="text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-1 rounded-lg border border-amber-200">
                    ~{Math.ceil(parseInt(form.estimatedLeadDays) / 7)} week{Math.ceil(parseInt(form.estimatedLeadDays) / 7) !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-amber-600">
                This will appear automatically when this item is selected during invoice or quote creation — visible only to you, not the customer.
              </p>
            </div>
          )}

          {/* ── Tax + Min Qty ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tax (%)">
              <FormInput type="number" step="0.01" min="0" max="100" placeholder="0" value={form.taxPercent} onChange={set("taxPercent")} />
            </FormField>
            <FormField label="Min Order Qty">
              <FormInput type="number" step="1" min="1" placeholder="1" value={form.minOrderQty} onChange={set("minOrderQty")} />
            </FormField>
          </div>

          {/* ── Preferred Vendor ──────────────────────────────────── */}
          <FormField label="Preferred Vendor">
            <FormSelect value={form.preferredVendorId} onChange={set("preferredVendorId")}>
              <option value="">No preferred vendor</option>
              {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}{v.company ? ` (${v.company})` : ""}</option>)}
            </FormSelect>
          </FormField>

          {/* ── Internal Notes ────────────────────────────────────── */}
          <FormField label="Internal Notes">
            <FormTextarea placeholder="Internal notes about this product (not shown to customers)..." value={form.notes} onChange={set("notes")} rows={2} />
          </FormField>

          <QuickBooksFieldsSection
            fields={[
              { key: "itemType", label: "Item Type", placeholder: "Inventory / Non-Inventory" },
              { key: "quantityOnHand", label: "Quantity on Hand", type: "number", placeholder: "0" },
              { key: "incomeAccount", label: "Income Account", placeholder: "QuickBooks income account" },
              { key: "expenseAccount", label: "Expense Account", placeholder: "QuickBooks expense account" },
            ]}
            values={qbForm}
            onChange={(key, value) => setQbForm((f) => ({ ...f, [key]: value }))}
          />
        </div>
      </form>
    </Modal>
  );
}
