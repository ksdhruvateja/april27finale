import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import {
  useListProducts, useDeleteProduct, getListProductsQueryKey, useUpdateProduct,
} from "@workspace/api-client-react";
import {
  useListInventory, useUpdateInventoryItem, getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, AlertCircle, CheckCircle2, Boxes } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import ProductModal from "@/components/ProductModal";
import InventoryAdjustModal from "@/components/InventoryAdjustModal";

export default function Products() {
  const { data: products, isLoading } = useListProducts();
  const { data: inventory } = useListInventory();
  const deleteProduct = useDeleteProduct();
  const updateInventory = useUpdateInventoryItem();
  const updateProduct = useUpdateProduct();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [adjustingInventory, setAdjustingInventory] = useState<any | null>(null);
  const [editingSkuProduct, setEditingSkuProduct] = useState<any | null>(null);
  const [newSku, setNewSku] = useState("");

  const inventoryMap = Object.fromEntries(
    (inventory ?? []).map(i => [i.productId, i])
  );

  const q = search.trim().toLowerCase();
  const filtered = products?.filter((p: any) => {
    if (!q) return true;
    const inv = inventoryMap[p.id];
    return [
      p.name,
      p.sku,
      p.description,
      p.category,
      String(p.id ?? ""),
      String(inv?.quantity ?? ""),
      String(inv?.reorderPoint ?? ""),
    ].some(v => String(v ?? "").toLowerCase().includes(q));
  });

  const handleDelete = (id: number) => {
    if (confirm("Delete this product?")) {
      deleteProduct.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
      });
    }
  };

    const handleUpdateSku = (product: any) => {
      setEditingSkuProduct(product);
      setNewSku(product.sku || "");
    };

    const handleSkuSubmit = () => {
      if (!editingSkuProduct) return;
      updateProduct.mutate(
        { id: editingSkuProduct.id, data: { sku: newSku.trim() || null } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
            setEditingSkuProduct(null);
            setNewSku("");
          }
        }
      );
    };

  const handleUpdateStock = (inventoryId: number, currentQty: number) => {
    const newQty = prompt("Update stock quantity:", currentQty.toString());
    if (newQty !== null && !isNaN(Number(newQty))) {
      updateInventory.mutate({ id: inventoryId, data: { quantity: Number(newQty) } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() })
      });
    }
  };

  return (
    <Layout>
      <Header title="Products & Inventory" subtitle={`${products?.length ?? 0} products`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by name or SKU..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button onClick={() => setShowModal(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
            <Plus size={14} /> Add Product
          </button>
        </div>

        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No products found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(239,246,255,0.95)" }}>
                  {/* Basic Info */}
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8", borderRight: "1px solid rgba(59,130,246,0.15)" }}>SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8", borderRight: "1px solid rgba(59,130,246,0.15)" }}>Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8", borderRight: "1px solid rgba(59,130,246,0.15)" }}>Description</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8", borderRight: "1px solid rgba(59,130,246,0.15)" }}>Category</th>

                  {/* Pricing */}
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(139,92,246,0.13)", color: "#6d28d9", borderRight: "1px solid rgba(139,92,246,0.15)" }}>Sale Price</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(139,92,246,0.13)", color: "#6d28d9", borderRight: "1px solid rgba(139,92,246,0.15)" }}>Cost Price</th>

                  {/* Inventory Tracking */}
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.12)", color: "#2563eb", borderRight: "1px solid rgba(59,130,246,0.15)" }}>Initial Stock</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(16,185,129,0.14)", color: "#047857", borderRight: "1px solid rgba(16,185,129,0.15)" }}>Stock In</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(239,68,68,0.13)", color: "#b91c1c", borderRight: "1px solid rgba(239,68,68,0.15)" }}>Stock Out</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(249,115,22,0.13)", color: "#c2410c", borderRight: "1px solid rgba(249,115,22,0.15)" }}>Pending Out</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(168,85,247,0.13)", color: "#7e22ce", borderRight: "1px solid rgba(168,85,247,0.15)" }}>Current Stock</th>

                  {/* Status & Actions */}
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(236,72,153,0.13)", color: "#be185d", borderRight: "1px solid rgba(236,72,153,0.15)" }}>Status</th>
                  <th className="px-4 py-3 w-10" style={{ background: "rgba(239,246,255,0.95)" }} />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(p => {
                  const inv = inventoryMap[p.id];
                  const isInventoryItem = (p as any).isInventoryItem !== false;
                  const isLow = inv && inv.quantity <= inv.reorderPoint;
                  return (
                    <tr key={p.id} style={{ background: "rgba(255,255,255,0.45)", borderBottom: "1px solid rgba(148,163,184,0.20)" }} className="hover:bg-blue-50/60 transition-colors group">
                      <td className="px-4 py-3.5 font-mono text-xs" style={{ color: "#60a5fa" }}>{p.sku || "—"}</td>
                      <td className="px-4 py-3.5 font-semibold" style={{ color: "#0f172a" }}>{p.name}</td>
                      <td className="px-4 py-3.5 text-xs max-w-[180px] truncate" style={{ color: "rgba(71,85,105,0.90)" }}>{(p as any).description || "—"}</td>
                      <td className="px-4 py-3.5">
                        {p.category
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(59,130,246,0.15)", color: "#1d4ed8" }}>{p.category}</span>
                          : <span style={{ color: "rgba(71,85,105,0.70)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: "#c4b5fd" }}>{formatCurrency(p.salePrice)}</td>
                      <td className="px-4 py-3.5 text-right" style={{ color: "rgba(196,181,253,0.7)" }}>{formatCurrency(p.costPrice)}</td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: "#60a5fa" }}>{inv?.initialStock ?? "—"}</td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: "#6ee7b7" }}>{inv?.stockIn ?? "—"}</td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: "#fca5a5" }}>{inv?.stockOut ?? "—"}</td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: "#fdba74" }}>{inv?.pendingOut ?? "—"}</td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: isLow ? "#fca5a5" : "#d8b4fe" }}>
                        {isInventoryItem && inv != null
                          ? <span>{inv.quantity}</span>
                          : <span style={{ color: "rgba(71,85,105,0.70)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {!isInventoryItem ? (
                          <span style={{ color: "rgba(71,85,105,0.70)", fontSize: "0.75rem" }}>Non-inventory</span>
                        ) : !inv ? (
                          <span style={{ color: "rgba(71,85,105,0.70)", fontSize: "0.75rem" }}>Not tracked</span>
                        ) : isLow ? (
                          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#fca5a5" }}>
                            <AlertCircle size={12} /> Low Stock
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#6ee7b7" }}>
                            <CheckCircle2 size={12} /> Optimal
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                            <DropdownMenuItem onClick={() => setEditingProduct(p)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Edit size={13} /> Edit
                            </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateSku(p)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                                <Edit size={13} /> Edit SKU
                              </DropdownMenuItem>
                            {isInventoryItem && inv && (
                              <DropdownMenuItem onClick={() => setAdjustingInventory({ ...inv, productName: p.name })} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                                <Boxes size={13} /> Adjust Stock
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDelete(p.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                              <Trash2 size={13} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showModal && <ProductModal onClose={() => setShowModal(false)} />}
      {editingProduct && <ProductModal product={editingProduct} onClose={() => setEditingProduct(null)} />}
      {adjustingInventory && <InventoryAdjustModal inventory={adjustingInventory} productName={adjustingInventory.productName} onClose={() => setAdjustingInventory(null)} />}

        {/* Edit SKU Modal */}
        {editingSkuProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit SKU</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-600 mb-2">Product: {editingSkuProduct.name}</label>
                <input
                  type="text"
                  placeholder="Enter SKU..."
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSkuSubmit()}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setEditingSkuProduct(null)}
                  className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSkuSubmit}
                  disabled={updateProduct.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {updateProduct.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
}
