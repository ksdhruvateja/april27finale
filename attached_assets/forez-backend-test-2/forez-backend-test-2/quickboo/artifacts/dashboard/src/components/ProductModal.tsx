import { useState } from "react";
import { useCreateProduct, useUpdateProduct, useListVendors, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormInput, FormSelect, FormTextarea, SubmitBar } from "./Modal";
import { Package, Archive } from "lucide-react";
import { UNIT_OPTIONS, UNIT_VALUES } from "@/lib/units";

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
  unit?: string | null;
  notes?: string | null;
}

interface Props {
  onClose: () => void;
  product?: ProductData;
}

export default function ProductModal({ onClose, product }: Props) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const { data: vendors } = useListVendors();
  const queryClient = useQueryClient();
  const isEdit = !!product;

  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? "",
    unit: product?.unit ?? "ea",
    salePrice: product?.salePrice != null ? String(product.salePrice) : "",
    costPrice: product?.costPrice != null ? String(product.costPrice) : "",
    taxPercent: product?.taxPercent != null ? String(product.taxPercent) : "0",
    discountPercent: product?.discountPercent != null ? String(product.discountPercent) : "0",
    discountAmount: product?.discountAmount != null ? String(product.discountAmount) : "0",
    minOrderQty: product?.minOrderQty != null ? String(product.minOrderQty) : "1",
    preferredVendorId: product?.preferredVendorId != null ? String(product.preferredVendorId) : "",
    isInventoryItem: product?.isInventoryItem !== false,
    notes: product?.notes ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

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
      discountPercent: Number(form.discountPercent) || 0,
      discountAmount: Number(form.discountAmount) || 0,
      minOrderQty: Number(form.minOrderQty) || 1,
      preferredVendorId: form.preferredVendorId ? Number(form.preferredVendorId) : null,
      isInventoryItem: form.isInventoryItem,
      notes: form.notes || null,
    };

    if (isEdit) {
      update.mutate({ id: product.id, data }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); }
      });
    } else {
      create.mutate({ data }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); }
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
      footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEdit ? "Save Changes" : "Add Product"} formId="product-form" />}
    >
      <form id="product-form" onSubmit={handleSubmit}>
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Inventory type toggle */}
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
                  ? "bg-[hsl(224_50%_15%)] text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-400"
              }`}>
              <Archive size={13} /> Non-Inventory Item
            </button>
            <span className="text-xs text-slate-400">
              {form.isInventoryItem ? "Stock is tracked for this item" : "No stock tracking (services, etc.)"}
            </span>
          </div>

          {/* Product Name */}
          <FormField label="Product Name" required>
            <FormInput placeholder="e.g. Cloud Storage 1TB" value={form.name} onChange={set("name")} required autoFocus />
          </FormField>

          {/* Description directly below name */}
          <FormField label="Product Description">
            <FormTextarea placeholder="Short description of the product or service..." value={form.description} onChange={set("description")} rows={2} />
          </FormField>

          {/* SKU */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SKU Number">
              <FormInput placeholder="CS-1TB-001" value={form.sku} onChange={set("sku")} />
            </FormField>
            <FormField label="Category">
              <FormInput placeholder="Software, Services…" value={form.category} onChange={set("category")} />
            </FormField>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Selling Price ($)" required>
              <FormInput type="number" step="0.01" min="0" placeholder="49.99" value={form.salePrice} onChange={set("salePrice")} required />
            </FormField>
            <FormField label="Cost Price ($)" required>
              <FormInput type="number" step="0.01" min="0" placeholder="12.00" value={form.costPrice} onChange={set("costPrice")} required />
            </FormField>
            <FormField label="Unit">
              <select
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-slate-400 transition-colors"
                value={UNIT_VALUES.has(form.unit) ? form.unit : "__custom__"}
                onChange={e => {
                  if (e.target.value === "__custom__") {
                    setForm(f => ({ ...f, unit: "" }));
                  } else {
                    setForm(f => ({ ...f, unit: e.target.value }));
                  }
                }}
              >
                {UNIT_OPTIONS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
              {(!UNIT_VALUES.has(form.unit)) && (
                <div className="mt-1.5">
                  <FormInput
                    placeholder="e.g. pallet, sheet, bundle…"
                    value={form.unit}
                    onChange={set("unit")}
                  />
                </div>
              )}
            </FormField>
          </div>

          {/* Discount */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Discount (%)">
              <FormInput type="number" step="0.01" min="0" max="100" placeholder="0" value={form.discountPercent} onChange={set("discountPercent")} />
            </FormField>
            <FormField label="Discount ($)">
              <FormInput type="number" step="0.01" min="0" placeholder="0.00" value={form.discountAmount} onChange={set("discountAmount")} />
            </FormField>
          </div>

          {/* Min Qty */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Minimum Order Qty">
              <FormInput type="number" step="1" min="1" placeholder="1" value={form.minOrderQty} onChange={set("minOrderQty")} />
            </FormField>
          </div>

          {/* Preferred Vendor */}
          <FormField label="Preferred Vendor">
            <FormSelect value={form.preferredVendorId} onChange={set("preferredVendorId")}>
              <option value="">No preferred vendor</option>
              {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}{v.company ? ` (${v.company})` : ""}</option>)}
            </FormSelect>
          </FormField>

          <FormField label="Internal Notes">
            <FormTextarea placeholder="Internal notes about this product..." value={form.notes} onChange={set("notes")} rows={2} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
