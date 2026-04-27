import { useState, useMemo } from "react";
import { useUpdateInventoryItem, getListInventoryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Package, CheckCircle2, X } from "lucide-react";

interface Product {
  id: number;
  name: string;
  sku?: string | null;
  category?: string | null;
}

interface InventoryItem {
  id: number;
  productId: number;
  initialStock: number;
  stockIn: number;
  stockOut: number;
  pendingOut: number;
  quantity: number;
  reorderPoint: number;
}

interface Props {
  onClose: () => void;
  products: Product[];
  inventory: InventoryItem[];
}

export default function BulkStockInModal({ onClose, products, inventory }: Props) {
  const queryClient = useQueryClient();
  const updateInventory = useUpdateInventoryItem();

  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);

  const inventoryMap = useMemo(() =>
    Object.fromEntries(inventory.map(i => [i.productId, i])),
    [inventory]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const totalToUpdate = Object.values(quantities).filter(v => Number(v) > 0).length;

  const handleSubmit = async () => {
    const toUpdate: Array<{ inv: InventoryItem; add: number }> = [];
    for (const [productIdStr, qtyStr] of Object.entries(quantities)) {
      const productId = Number(productIdStr);
      const qty = Number(qtyStr);
      if (qty <= 0) continue;
      const inv = inventoryMap[productId];
      if (!inv) continue;
      toUpdate.push({ inv, add: qty });
    }
    if (toUpdate.length === 0) return;

    setSaving(true);
    let count = 0;
    for (const { inv, add } of toUpdate) {
      const newStockIn = inv.stockIn + add;
      const newQty = inv.initialStock + newStockIn - inv.stockOut - inv.pendingOut;
      await new Promise<void>((resolve, reject) => {
        updateInventory.mutate(
          { id: inv.id, data: { stockIn: newStockIn, quantity: newQty } },
          { onSuccess: () => { count++; resolve(); }, onError: reject }
        );
      });
    }
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
    setUpdatedCount(count);
    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(8px)" }}>
        <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4 max-w-sm w-full mx-4" style={{ border: "1px solid #e2e8f0" }}>
          <CheckCircle2 size={48} className="text-emerald-500" />
          <h2 className="text-xl font-bold text-slate-800">Stock Updated!</h2>
          <p className="text-slate-500 text-sm text-center">
            Successfully added stock to <strong>{updatedCount}</strong> product{updatedCount !== 1 ? "s" : ""}.
          </p>
          <button
            onClick={onClose}
            className="mt-2 w-full py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: "linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 40%, #f8faff 100%)" }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(255,255,255,0.85)", borderBottom: "1px solid #cbd5e1", backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-3">
          <Package size={20} className="text-blue-500" />
          <div>
            <h2 className="font-bold text-slate-800 text-[15px]">Bulk Stock In</h2>
            <p className="text-xs text-slate-500">Enter quantities to add to multiple products at once</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Search bar */}
      <div className="flex-shrink-0 px-6 py-4" style={{ background: "rgba(255,255,255,0.60)", borderBottom: "1px solid #e2e8f0" }}>
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products by name, SKU, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
            style={{ background: "#ffffff", border: "1px solid #cbd5e1", color: "#0f172a" }}
            autoFocus
          />
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm">No products match your search.</div>
          )}
          {filtered.map(product => {
            const inv = inventoryMap[product.id];
            const currentStock = inv?.quantity ?? 0;
            const qty = quantities[product.id] ?? "";
            const addQty = Number(qty);
            const newStock = addQty > 0 ? currentStock + addQty : currentStock;

            return (
              <div
                key={product.id}
                className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors"
                style={{
                  background: addQty > 0 ? "rgba(59,130,246,0.07)" : "rgba(255,255,255,0.80)",
                  border: addQty > 0 ? "1px solid rgba(59,130,246,0.30)" : "1px solid #e2e8f0",
                }}
              >
                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">{product.name}</span>
                    {product.sku && (
                      <span className="text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">
                        {product.sku}
                      </span>
                    )}
                    {product.category && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                        {product.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500">
                      In stock: <strong className={currentStock <= 0 ? "text-red-500" : "text-slate-700"}>{currentStock}</strong>
                    </span>
                    {addQty > 0 && (
                      <span className="text-xs text-emerald-600 font-medium">
                        → {newStock} after adding
                      </span>
                    )}
                  </div>
                </div>

                {/* Quantity input */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400 font-medium">Add qty:</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={qty}
                    onChange={e => setQuantities(prev => {
                      const val = e.target.value;
                      if (!val || val === "0") {
                        const next = { ...prev };
                        delete next[product.id];
                        return next;
                      }
                      return { ...prev, [product.id]: val };
                    })}
                    className="w-20 px-3 py-2 text-sm text-right rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all font-mono"
                    style={{
                      background: addQty > 0 ? "#eff6ff" : "#ffffff",
                      border: addQty > 0 ? "1px solid #3b82f6" : "1px solid #cbd5e1",
                      color: "#0f172a",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(255,255,255,0.90)", borderTop: "1px solid #cbd5e1", backdropFilter: "blur(8px)" }}
      >
        <div className="text-sm text-slate-500">
          {totalToUpdate > 0
            ? <span className="text-blue-600 font-semibold">{totalToUpdate} product{totalToUpdate !== 1 ? "s" : ""} to update</span>
            : "Enter quantities above to stock in products"}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={totalToUpdate === 0 || saving}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}
          >
            {saving ? "Updating…" : `Stock In ${totalToUpdate > 0 ? totalToUpdate + " Product" + (totalToUpdate !== 1 ? "s" : "") : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
