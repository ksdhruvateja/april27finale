import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import {
  useListProducts, useDeleteProduct, getListProductsQueryKey, useUpdateProduct, useCreateProduct,
  useListInvoices, useListPurchaseOrders, useListCustomers, useListVendors,
} from "@workspace/api-client-react";
import {
  useListInventory, useUpdateInventoryItem, getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, AlertCircle, CheckCircle2, Boxes, X, BarChart3, History, MapPin, Camera, TrendingUp, Users, ShoppingBag, Tag, ArrowDown, ArrowUp, RefreshCw, PackagePlus, Store, ChevronDown, ChevronUp, BarChart2, Clock, Filter, Package, Archive, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend, PieChart, Pie } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import ProductModal from "@/components/ProductModal";
import * as XLSX from "xlsx";
import InventoryAdjustModal from "@/components/InventoryAdjustModal";
import BulkStockInModal from "@/components/BulkStockInModal";
import {
  useListInventoryLocations, useCreateInventoryLocation, useDeleteInventoryLocation,
  useListStockMovements, useCreateStockMovement, type InventoryLocation,
} from "@/lib/auctions-api";

type AnalyticsPeriod = "1mo" | "3mo" | "6mo" | "12mo";

interface ProductAnalytics {
  totalQty: number;
  totalRevenue: number;
  uniqueBuyers: number;
  uniqueInvoices: number;
  avgDiscount: number;
  discountedOrders: number;
  months: number;
  breakdown: Record<string, { qty: number; revenue: number; buyers: number }>;
  topCustomers?: { customerId: number; name: string; qty: number; revenue: number }[];
}

function useProductAnalytics(productId: number | null) {
  return useQuery<ProductAnalytics>({
    queryKey: ["product-analytics", productId],
    queryFn: () => fetch(`/api/products/${productId}/analytics?months=12`, { credentials: "include" }).then(r => r.json()),
    enabled: productId != null,
    staleTime: 1000 * 60 * 2,
  });
}

function movementLabel(type: string) {
  return { in: "Stock In", out: "Stock Out", transfer: "Transfer", adjust: "Adjustment", initial: "Initial Stock" }[type] ?? type;
}
function movementColor(type: string) {
  return { in: "text-emerald-600", out: "text-red-500", transfer: "text-blue-600", adjust: "text-amber-600", initial: "text-slate-500" }[type] ?? "text-slate-600";
}
function movementBg(type: string) {
  return { in: "bg-emerald-50 border-emerald-200", out: "bg-red-50 border-red-200", transfer: "bg-blue-50 border-blue-200", adjust: "bg-amber-50 border-amber-200", initial: "bg-slate-50 border-slate-200" }[type] ?? "bg-slate-50 border-slate-200";
}

function ProductDetailDrawer({ product, inventory, onClose }: {
  product: any; inventory: any; onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "analytics" | "movements" | "locations">("overview");
  const [period, setPeriod] = useState<AnalyticsPeriod>("3mo");
  const [savingPrefVendor, setSavingPrefVendor] = useState(false);
  const [topCustSort, setTopCustSort] = useState<"units" | "revenue">("units");

  const { data: analytics, isLoading: analyticsLoading } = useProductAnalytics(product.id);
  const { data: movements, isLoading: movementsLoading } = useListStockMovements(product.id);
  const { data: locations } = useListInventoryLocations();
  const { data: allVendors = [] } = useListVendors();
  const updateProduct = useUpdateProduct();
  const createMovement = useCreateStockMovement();
  const createLocation = useCreateInventoryLocation();
  const deleteLocation = useDeleteInventoryLocation();

  const [movForm, setMovForm] = useState({ type: "in", qty: "", locationId: "", toLocationId: "", notes: "" });
  const [newLocName, setNewLocName] = useState("");
  const [newLocAddress, setNewLocAddress] = useState("");
  const [showAddLoc, setShowAddLoc] = useState(false);
  const qc = useQueryClient();

  const periodData = analytics?.breakdown?.[period];
  const stats = [
    { label: `Sales (${period})`, value: periodData ? formatCurrency(periodData.revenue) : "—", icon: TrendingUp, color: "text-emerald-600" },
    { label: `Units Sold (${period})`, value: periodData ? periodData.qty.toFixed(0) : "—", icon: ShoppingBag, color: "text-blue-600" },
    { label: `Buyers (${period})`, value: periodData ? String(periodData.buyers) : "—", icon: Users, color: "text-indigo-600" },
    { label: "Discount Orders", value: analytics ? String(analytics.discountedOrders) : "—", icon: Tag, color: "text-amber-600" },
  ];

  const handleLogMovement = async () => {
    if (!movForm.qty || Number(movForm.qty) <= 0) return;
    await createMovement.mutateAsync({
      productId: product.id,
      movementType: movForm.type as any,
      quantity: Number(movForm.qty),
      locationId: movForm.locationId ? Number(movForm.locationId) : null,
      toLocationId: movForm.toLocationId ? Number(movForm.toLocationId) : null,
      notes: movForm.notes || null,
      referenceId: null,
      referenceType: "manual",
    });
    setMovForm({ type: "in", qty: "", locationId: "", toLocationId: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["stock-movements", product.id] });
  };

  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    await createLocation.mutateAsync({ name: newLocName.trim(), address: newLocAddress.trim() || undefined });
    setNewLocName(""); setNewLocAddress(""); setShowAddLoc(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-[hsl(224_50%_15%)] text-white">
          <div>
            <p className="text-[11px] font-mono text-white/50">{product.sku || "—"}</p>
            <h2 className="font-bold text-base mt-0.5">{product.name}</h2>
            {product.category && <span className="text-[11px] bg-white/10 rounded px-2 py-0.5 mt-1 inline-block">{product.category}</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50">
          {([
            { key: "overview",   label: "Overview",   color: "text-blue-700  border-blue-500  bg-blue-50/80"   },
            { key: "analytics",  label: "Analytics",  color: "text-violet-700 border-violet-500 bg-violet-50/80" },
            { key: "movements",  label: "Movements",  color: "text-emerald-700 border-emerald-500 bg-emerald-50/80" },
            { key: "locations",  label: "Locations",  color: "text-amber-700  border-amber-500  bg-amber-50/80"  },
          ] as const).map(({ key: t, label, color }) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`flex-1 text-xs py-2.5 font-semibold capitalize transition-all border-b-2 ${tab === t ? `${color} border-b-2` : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-white/60"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Sale Price</p>
                  <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(product.salePrice)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Cost Price</p>
                  <p className="text-xl font-bold text-slate-600 mt-1">{formatCurrency(product.costPrice)}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase">Gross Margin</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">
                    {product.salePrice > 0 ? `${(((product.salePrice - product.costPrice) / product.salePrice) * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-[10px] font-semibold text-amber-600 uppercase">Current Stock</p>
                  <p className={`text-xl font-bold mt-1 ${inventory && inventory.quantity <= inventory.reorderPoint ? "text-red-600" : "text-slate-800"}`}>
                    {inventory ? `${inventory.quantity} ${product.unit ?? "units"}` : "—"}
                  </p>
                </div>
              </div>
              {product.description && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Description</p>
                  <p className="text-sm text-slate-600">{product.description}</p>
                </div>
              )}
              {(product.taxPercent > 0 || product.discountPercent > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  {product.taxPercent > 0 && (
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                      <p className="text-[10px] font-semibold text-blue-500 uppercase">Tax</p>
                      <p className="text-base font-bold text-blue-700 mt-1">{product.taxPercent}%</p>
                    </div>
                  )}
                  {product.discountPercent > 0 && (
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                      <p className="text-[10px] font-semibold text-purple-500 uppercase">Default Discount</p>
                      <p className="text-base font-bold text-purple-700 mt-1">{product.discountPercent}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "analytics" && (
            <div className="space-y-4">
              <div className="flex gap-1.5">
                {(["1mo", "3mo", "6mo", "12mo"] as AnalyticsPeriod[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${period === p ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {analyticsLoading ? (
                <div className="py-8 text-center text-sm text-slate-400">Loading analytics...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {stats.map(s => (
                      <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <s.icon size={12} className={s.color} />
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">{s.label}</p>
                        </div>
                        <p className="text-xl font-bold text-slate-800">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {analytics && (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase mb-3">Period Comparison</p>
                      <div className="space-y-2">
                        {(["1mo", "3mo", "6mo", "12mo"] as AnalyticsPeriod[]).map(p => {
                          const d = analytics.breakdown?.[p];
                          const maxRev = Math.max(...Object.values(analytics.breakdown ?? {}).map((v: any) => v.revenue), 1);
                          const pct = d ? (d.revenue / maxRev) * 100 : 0;
                          return (
                            <div key={p} className="flex items-center gap-3">
                              <span className="w-10 text-[10px] font-semibold text-slate-500">{p}</span>
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-slate-700 w-20 text-right">{d ? formatCurrency(d.revenue) : "—"}</span>
                              <span className="text-[10px] text-slate-400 w-12 text-right">{d ? `${d.qty} units` : ""}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {analytics && analytics.discountedOrders > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase mb-1">Discount History (12mo)</p>
                      <p className="text-sm text-slate-700">{analytics.discountedOrders} orders had discounts</p>
                      <p className="text-xs text-slate-500 mt-0.5">Avg discount: {analytics.avgDiscount.toFixed(1)}%</p>
                    </div>
                  )}
                  {analytics && analytics.totalQty === 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
                      <BarChart3 size={28} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No sales data yet in the selected period</p>
                    </div>
                  )}

                  {/* Top Customers Ranking */}
                  {analytics && (analytics.topCustomers?.length ?? 0) > 0 && (() => {
                    const sorted = [...(analytics.topCustomers ?? [])].sort(
                      (a, b) => topCustSort === "units" ? b.qty - a.qty : b.revenue - a.revenue
                    );
                    const maxVal = topCustSort === "units"
                      ? Math.max(...sorted.map(c => c.qty), 1)
                      : Math.max(...sorted.map(c => c.revenue), 1);
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <Users size={13} className="text-indigo-500" />
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Top Customers</p>
                          </div>
                          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px]">
                            <button
                              onClick={() => setTopCustSort("units")}
                              className={`px-2.5 py-1 font-semibold transition-colors ${topCustSort === "units" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                            >
                              By Units
                            </button>
                            <button
                              onClick={() => setTopCustSort("revenue")}
                              className={`px-2.5 py-1 font-semibold transition-colors border-l border-slate-200 ${topCustSort === "revenue" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                            >
                              By Revenue
                            </button>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {sorted.map((c, idx) => {
                            const val = topCustSort === "units" ? c.qty : c.revenue;
                            const pct = (val / maxVal) * 100;
                            return (
                              <div key={c.customerId} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="text-base w-5 flex-shrink-0 text-center">
                                  {idx < 3 ? medals[idx] : <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                                  <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-slate-300" : idx === 2 ? "bg-orange-300" : "bg-indigo-200"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  {topCustSort === "units" ? (
                                    <>
                                      <p className="text-xs font-bold text-slate-800">{c.qty} <span className="font-normal text-slate-400">units</span></p>
                                      <p className="text-[10px] text-slate-400">{formatCurrency(c.revenue)}</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-xs font-bold text-slate-800">{formatCurrency(c.revenue)}</p>
                                      <p className="text-[10px] text-slate-400">{c.qty} units</p>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Preferred Vendor */}
                  <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Store size={13} className="text-violet-600 flex-shrink-0" />
                      <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Preferred Vendor</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={product.preferredVendorId ?? ""}
                        onChange={async e => {
                          const vid = e.target.value ? Number(e.target.value) : null;
                          setSavingPrefVendor(true);
                          try {
                            await updateProduct.mutateAsync({ id: product.id, data: { preferredVendorId: vid } as any });
                            product.preferredVendorId = vid;
                          } finally { setSavingPrefVendor(false); }
                        }}
                        className="flex-1 text-sm border border-violet-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-violet-400"
                      >
                        <option value="">— No preference —</option>
                        {(allVendors as any[]).map((v: any) => (
                          <option key={v.id} value={v.id}>{v.company || v.name || `Vendor #${v.id}`}</option>
                        ))}
                      </select>
                      {savingPrefVendor && <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                    </div>
                    {product.preferredVendorId && (() => {
                      const pv = (allVendors as any[]).find((v: any) => v.id === product.preferredVendorId);
                      return pv ? <p className="text-[11px] text-violet-500 mt-1.5">{pv.email || pv.phone || ""}</p> : null;
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "movements" && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-bold text-slate-600 mb-3">Log Stock Movement</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Type</label>
                    <select value={movForm.type} onChange={e => setMovForm(p => ({ ...p, type: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-800">
                      <option value="in">Stock In</option>
                      <option value="out">Stock Out</option>
                      <option value="transfer">Transfer</option>
                      <option value="adjust">Adjustment</option>
                      <option value="initial">Initial Stock</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Quantity</label>
                    <input type="number" placeholder="0" value={movForm.qty} onChange={e => setMovForm(p => ({ ...p, qty: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-800" />
                  </div>
                  {(locations?.length ?? 0) > 0 && (
                    <>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">{movForm.type === "transfer" ? "From Location" : "Location"}</label>
                        <select value={movForm.locationId} onChange={e => setMovForm(p => ({ ...p, locationId: e.target.value }))}
                          className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-800">
                          <option value="">Default</option>
                          {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                      {movForm.type === "transfer" && (
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">To Location</label>
                          <select value={movForm.toLocationId} onChange={e => setMovForm(p => ({ ...p, toLocationId: e.target.value }))}
                            className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-800">
                            <option value="">Select...</option>
                            {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Notes</label>
                    <input placeholder="Optional note..." value={movForm.notes} onChange={e => setMovForm(p => ({ ...p, notes: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-800" />
                  </div>
                </div>
                <button
                  onClick={handleLogMovement}
                  disabled={createMovement.isPending || !movForm.qty}
                  className="mt-3 w-full bg-[hsl(224_50%_15%)] text-white rounded-lg py-2 text-xs font-semibold hover:bg-[hsl(224_50%_20%)] disabled:opacity-50"
                >
                  {createMovement.isPending ? "Logging..." : "Log Movement"}
                </button>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 mb-2">Movement History</p>
                {movementsLoading ? (
                  <div className="py-4 text-center text-xs text-slate-400">Loading...</div>
                ) : !movements?.length ? (
                  <div className="py-4 text-center text-xs text-slate-400">No movements yet for this product.</div>
                ) : (
                  <div className="space-y-2">
                    {[...movements].reverse().map(m => (
                      <div key={m.id} className={`rounded-lg border p-3 ${movementBg(m.movementType)}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {m.movementType === "in" || m.movementType === "initial" ? <ArrowDown size={12} className="text-emerald-600" /> : m.movementType === "out" ? <ArrowUp size={12} className="text-red-500" /> : <RefreshCw size={12} className="text-blue-500" />}
                            <span className={`text-xs font-semibold ${movementColor(m.movementType)}`}>{movementLabel(m.movementType)}</span>
                          </div>
                          <span className="text-xs font-bold text-slate-700">{m.movementType === "out" ? "-" : "+"}{m.quantity} {product.unit ?? "units"}</span>
                        </div>
                        {m.notes && <p className="text-[10px] text-slate-500 mt-1">{m.notes}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">{new Date(m.createdAt).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "locations" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-600">Inventory Locations</p>
                <button onClick={() => setShowAddLoc(v => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(224_50%_15%)] text-white font-semibold">
                  + Add Location
                </button>
              </div>
              {showAddLoc && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                  <input placeholder="Location name (e.g. Warehouse A)" value={newLocName} onChange={e => setNewLocName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white text-slate-800" />
                  <input placeholder="Address (optional)" value={newLocAddress} onChange={e => setNewLocAddress(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white text-slate-800" />
                  <button onClick={handleAddLocation} disabled={!newLocName.trim() || createLocation.isPending}
                    className="w-full bg-[hsl(224_50%_15%)] text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-50">
                    {createLocation.isPending ? "Adding..." : "Add Location"}
                  </button>
                </div>
              )}
              {!locations?.length ? (
                <div className="py-6 text-center">
                  <MapPin size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No locations yet. Add one to track stock per location.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {locations.map(loc => {
                    const locMovements = movements?.filter(m => m.locationId === loc.id || m.toLocationId === loc.id) ?? [];
                    const stockIn = locMovements.filter(m => m.toLocationId === loc.id || (m.locationId === loc.id && ["in", "initial"].includes(m.movementType))).reduce((s, m) => s + Number(m.quantity), 0);
                    const stockOut = locMovements.filter(m => m.locationId === loc.id && ["out"].includes(m.movementType)).reduce((s, m) => s + Number(m.quantity), 0);
                    return (
                      <div key={loc.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><MapPin size={12} className="text-slate-400" />{loc.name}</p>
                            {loc.address && <p className="text-[10px] text-slate-400 mt-0.5">{loc.address}</p>}
                          </div>
                          <button onClick={() => deleteLocation.mutate(loc.id)} className="text-red-400 hover:text-red-600 p-1 rounded"><Trash2 size={12} /></button>
                        </div>
                        <div className="flex gap-3 text-xs">
                          <span className="text-emerald-600 font-semibold">In: {stockIn}</span>
                          <span className="text-red-500 font-semibold">Out: {stockOut}</span>
                          <span className="text-slate-600 font-semibold">Net: {stockIn - stockOut}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BarcodeScanner({ onFound, onClose }: { onFound: (sku: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setError("Barcode scanning requires Chrome or Edge on HTTPS. Try manually entering the SKU.");
      return;
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setScanning(true);
        const detector = new (window as any).BarcodeDetector({ formats: ["ean_13", "ean_8", "qr_code", "code_128", "code_39", "upc_a", "upc_e"] });
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              stopStream();
              onFound(code);
            } else {
              requestAnimationFrame(scan);
            }
          } catch { requestAnimationFrame(scan); }
        };
        requestAnimationFrame(scan);
      } catch (e: any) {
        setError(e?.message ?? "Could not access camera.");
      }
    })();
    return () => { stopStream(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70" onClick={() => { stopStream(); onClose(); }}>
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 bg-[hsl(224_50%_15%)] text-white">
          <div className="flex items-center gap-2"><Camera size={16} /><h3 className="font-bold text-sm">Scan Barcode</h3></div>
          <button onClick={() => { stopStream(); onClose(); }}><X size={16} /></button>
        </div>
        {error ? (
          <div className="p-6 text-center">
            <AlertCircle size={32} className="text-amber-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : (
          <div className="relative bg-black">
            <video ref={videoRef} className="w-full h-64 object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-32 border-2 border-white/60 rounded-lg" />
            </div>
            {scanning && <p className="absolute bottom-2 left-0 right-0 text-center text-white/70 text-xs">Hold barcode in the frame</p>}
          </div>
        )}
        <div className="p-4">
          <p className="text-xs text-slate-500 text-center">Scanning will automatically detect barcodes and SKUs</p>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const { data: products, isLoading } = useListProducts();
  const { data: inventory } = useListInventory();
  const deleteProduct = useDeleteProduct();
  const updateInventory = useUpdateInventoryItem();
  const updateProduct = useUpdateProduct();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [adjustingInventory, setAdjustingInventory] = useState<any | null>(null);
  const [editingSkuProduct, setEditingSkuProduct] = useState<any | null>(null);
  const [newSku, setNewSku] = useState("");
  const [detailProduct, setDetailProduct] = useState<any | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showBulkStockIn, setShowBulkStockIn] = useState(false);
  const [editingName, setEditingName] = useState<{ id: number; value: string } | null>(null);
  const [editingSkuInline, setEditingSkuInline] = useState<{ id: number; value: string } | null>(null);
  const [editingSalePrice, setEditingSalePrice] = useState<{ id: number; value: string } | null>(null);
  const [editingCostPrice, setEditingCostPrice] = useState<{ id: number; value: string } | null>(null);
  const [editingQty, setEditingQty] = useState<{ id: number; invId: number; value: string } | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows]           = useState<Record<string, string>[]>([]);
  const [importErrors, setImportErrors]       = useState<string[]>([]);
  const [importProgress, setImportProgress]   = useState<{ done: number; total: number } | null>(null);
  const [importDone, setImportDone]           = useState(false);
  const importFileRef                         = useRef<HTMLInputElement>(null);
  const createProduct                         = useCreateProduct();

  const [showInsights, setShowInsights]       = useState(false);
  const [insightView, setInsightView]         = useState<"customers" | "vendors" | "products" | "trend" | "orders" | "stock" | "margin" | "category">("customers");
  const [insightProduct, setInsightProduct]   = useState<string>("__all__");
  const [insightPeriod, setInsightPeriod]     = useState<"all" | "1mo" | "3mo" | "6mo" | "12mo" | "2yr" | "3yr">("all");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showProductFilter, setShowProductFilter] = useState(false);

  const { data: invoicesForAnalytics }  = useListInvoices();
  const { data: posForAnalytics }       = useListPurchaseOrders();
  const { data: customersForAnalytics } = useListCustomers();
  const { data: vendorsForAnalytics }   = useListVendors();

  const customerMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const c of (customersForAnalytics ?? []) as any[]) m.set(Number(c.id), c);
    return m;
  }, [customersForAnalytics]);

  const vendorMap = useMemo(() => {
    const m = new Map<number, any>();
    for (const v of (vendorsForAnalytics ?? []) as any[]) m.set(Number(v.id), v);
    return m;
  }, [vendorsForAnalytics]);

  function getInsightPeriodStart(p: string): Date | null {
    if (p === "all") return null;
    const months = ({ "1mo": 1, "3mo": 3, "6mo": 6, "12mo": 12, "2yr": 24, "3yr": 36 } as Record<string,number>)[p] ?? 0;
    const d = new Date(); d.setMonth(d.getMonth() - months); return d;
  }

  const allInvLineItems = useMemo(() => {
    const result: { productName: string; buyerName: string; qty: number; revenue: number; date: string }[] = [];
    for (const inv of (invoicesForAnalytics ?? []) as any[]) {
      const customer = customerMap.get(Number(inv.customerId));
      const buyerName = customer?.company || customer?.name || inv.customerName || "Unknown";
      const date = (inv.createdAt ?? inv.date ?? "") as string;
      for (const li of (inv.lineItems ?? []) as any[]) {
        const pName = li.description || li.name || "—";
        result.push({ productName: pName, buyerName, qty: Number(li.quantity ?? 0), revenue: Number(li.unitPrice ?? 0) * Number(li.quantity ?? 0), date });
      }
    }
    return result;
  }, [invoicesForAnalytics, customerMap]);

  const allPoLineItems = useMemo(() => {
    const result: { productName: string; vendorName: string; qty: number; cost: number }[] = [];
    for (const po of (posForAnalytics ?? []) as any[]) {
      const vendor = vendorMap.get(Number(po.vendorId));
      const vendorName = vendor?.company || vendor?.name || po.vendorName || "Unknown";
      for (const li of (po.lineItems ?? []) as any[]) {
        const pName = li.description || li.name || "—";
        result.push({ productName: pName, vendorName, qty: Number(li.quantity ?? 0), cost: Number(li.unitPrice ?? 0) * Number(li.quantity ?? 0) });
      }
    }
    return result;
  }, [posForAnalytics, vendorMap]);

  const allProductNames = useMemo(() => {
    const s = new Set<string>();
    allInvLineItems.forEach(r => s.add(r.productName));
    allPoLineItems.forEach(r => s.add(r.productName));
    return Array.from(s).sort();
  }, [allInvLineItems, allPoLineItems]);

  const customerChartData = useMemo(() => {
    const periodStart = getInsightPeriodStart(insightPeriod);
    let base = insightProduct === "__all__" ? allInvLineItems : allInvLineItems.filter(r => r.productName === insightProduct);
    if (periodStart) base = base.filter(r => !r.date || new Date(r.date) >= periodStart);
    const byCustomer: Record<string, { qty: number; revenue: number }> = {};
    for (const r of base) {
      if (!byCustomer[r.buyerName]) byCustomer[r.buyerName] = { qty: 0, revenue: 0 };
      byCustomer[r.buyerName].qty += r.qty;
      byCustomer[r.buyerName].revenue += r.revenue;
    }
    return Object.entries(byCustomer)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [allInvLineItems, insightProduct, insightPeriod]);

  const vendorChartData = useMemo(() => {
    const filtered = insightProduct === "__all__" ? allPoLineItems : allPoLineItems.filter(r => r.productName === insightProduct);
    const byVendor: Record<string, { qty: number; cost: number }> = {};
    for (const r of filtered) {
      if (!byVendor[r.vendorName]) byVendor[r.vendorName] = { qty: 0, cost: 0 };
      byVendor[r.vendorName].qty += r.qty;
      byVendor[r.vendorName].cost += r.cost;
    }
    return Object.entries(byVendor)
      .map(([name, v]) => ({ name, qty: v.qty, cost: Math.round(v.cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 12);
  }, [allPoLineItems, insightProduct]);

  const productChartData = useMemo(() => {
    const periodStart = getInsightPeriodStart(insightPeriod);
    let base = allInvLineItems;
    if (periodStart) base = base.filter(r => !r.date || new Date(r.date) >= periodStart);
    const byProduct: Record<string, { qty: number; revenue: number }> = {};
    for (const r of base) {
      if (!byProduct[r.productName]) byProduct[r.productName] = { qty: 0, revenue: 0 };
      byProduct[r.productName].qty += r.qty;
      byProduct[r.productName].revenue += r.revenue;
    }
    return Object.entries(byProduct)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 14);
  }, [allInvLineItems, insightPeriod]);

  /* ── Multi-product filtered base ──────────────────────────── */
  const filteredInvItems = useMemo(() => {
    const periodStart = getInsightPeriodStart(insightPeriod);
    let base = allInvLineItems;
    if (periodStart) base = base.filter(r => !r.date || new Date(r.date) >= periodStart);
    if (selectedProducts.size > 0) base = base.filter(r => selectedProducts.has(r.productName));
    return base;
  }, [allInvLineItems, insightPeriod, selectedProducts]);

  const filteredPoItems = useMemo(() => {
    let base = allPoLineItems;
    if (selectedProducts.size > 0) base = base.filter(r => selectedProducts.has(r.productName));
    return base;
  }, [allPoLineItems, selectedProducts]);

  /* ── Trend chart (revenue & qty by month) ─────────────────── */
  const trendChartData = useMemo(() => {
    const byMonth: Record<string, { revenue: number; qty: number; cost: number }> = {};
    for (const r of filteredInvItems) {
      const mo = r.date ? r.date.slice(0, 7) : "Unknown";
      if (!byMonth[mo]) byMonth[mo] = { revenue: 0, qty: 0, cost: 0 };
      byMonth[mo].revenue += r.revenue;
      byMonth[mo].qty     += r.qty;
    }
    for (const r of filteredPoItems) {
      const mo = "cost"; // PO items don't have date in current data structure
      byMonth[mo] = byMonth[mo] ?? { revenue: 0, qty: 0, cost: 0 };
    }
    return Object.entries(byMonth)
      .filter(([mo]) => mo !== "cost" && mo !== "Unknown")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        revenue: Math.round(v.revenue * 100) / 100,
        qty: v.qty,
      }));
  }, [filteredInvItems, filteredPoItems]);

  /* ── Awaiting payment (pending invoices with matching products) */
  const awaitingPaymentData = useMemo(() => {
    return ((invoicesForAnalytics ?? []) as any[])
      .filter((inv: any) => inv.status !== "paid" && inv.status !== "cancelled")
      .filter((inv: any) => {
        if (selectedProducts.size === 0) return true;
        const names = ((inv.lineItems ?? []) as any[]).map((li: any) => li.description || li.name || "");
        return names.some((n: string) => selectedProducts.has(n));
      })
      .map((inv: any) => ({
        id: inv.id,
        forezInv: inv.invoiceNumber || `FRZI-${5099 + Number(inv.id)}`,
        buyerName: (() => {
          const c = (customersForAnalytics ?? [] as any[]).find((c: any) => Number(c.id) === Number(inv.customerId));
          return c?.company || c?.name || inv.customerName || "Unknown";
        })(),
        products: ((inv.lineItems ?? []) as any[]).map((li: any) => li.description || "").filter(Boolean).join(", "),
        total: Number(inv.total ?? 0),
        status: inv.status,
        date: inv.createdAt,
        dueDate: inv.dueDate,
      }))
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
      .slice(0, 20);
  }, [invoicesForAnalytics, selectedProducts, customersForAnalytics]);

  /* ── PO demand by product (for Orders view) ───────────────── */
  const poDemandData = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let base = (posForAnalytics ?? []) as any[];
    if (selectedProducts.size > 0) {
      base = base.filter((po: any) =>
        ((po.lineItems ?? []) as any[]).some((li: any) => selectedProducts.has(li.description || li.name || ""))
      );
    }
    for (const po of base) byStatus[po.status ?? "draft"] = (byStatus[po.status ?? "draft"] ?? 0) + 1;
    const topProductsDemand: Record<string, number> = {};
    const periodStart = getInsightPeriodStart(insightPeriod);
    for (const r of filteredPoItems) {
      topProductsDemand[r.productName] = (topProductsDemand[r.productName] ?? 0) + r.qty;
    }
    return {
      statusCounts: byStatus,
      topProducts: Object.entries(topProductsDemand)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 12),
    };
  }, [posForAnalytics, selectedProducts, filteredPoItems, insightPeriod]);

  /* ── Stock levels per product ──────────────────────────────── */
  const stockLevelData = useMemo(() => {
    const prods = (products ?? []) as any[];
    return prods.map((p: any) => {
      const inv = (inventory ?? []).find((i: any) => i.productId === p.id);
      const qty = Number(inv?.quantity ?? 0);
      const low = Number(p.reorderPoint ?? p.minStock ?? 5);
      const status = qty <= 0 ? "out" : qty <= low ? "low" : qty <= low * 3 ? "ok" : "high";
      return { name: p.name ?? `#${p.id}`, qty, low, status };
    }).filter((r: any) => r.name !== "—").sort((a: any, b: any) => a.qty - b.qty).slice(-20);
  }, [products, inventory]);

  const stockColors: Record<string, string> = { out: "#ef4444", low: "#f59e0b", ok: "#3b82f6", high: "#10b981" };

  /* ── Revenue vs Cost (margin) per product ──────────────────── */
  const marginData = useMemo(() => {
    const periodStart = getInsightPeriodStart(insightPeriod);
    const revBase = periodStart ? allInvLineItems.filter(r => !r.date || new Date(r.date) >= periodStart) : allInvLineItems;
    const revByProd: Record<string, number> = {};
    for (const r of revBase) revByProd[r.productName] = (revByProd[r.productName] ?? 0) + r.revenue;
    const costByProd: Record<string, number> = {};
    for (const r of allPoLineItems) costByProd[r.productName] = (costByProd[r.productName] ?? 0) + r.cost;
    const allNames = new Set([...Object.keys(revByProd), ...Object.keys(costByProd)]);
    return Array.from(allNames).map(name => {
      const rev = Math.round((revByProd[name] ?? 0) * 100) / 100;
      const cost = Math.round((costByProd[name] ?? 0) * 100) / 100;
      const margin = rev > 0 ? Math.round((rev - cost) / rev * 100) : 0;
      return { name, revenue: rev, cost, margin };
    }).filter(r => r.revenue > 0 || r.cost > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 14);
  }, [allInvLineItems, allPoLineItems, insightPeriod]);

  /* ── Products by category ──────────────────────────────────── */
  const categoryData = useMemo(() => {
    const by: Record<string, { count: number; revenue: number }> = {};
    const revByProd: Record<string, number> = {};
    for (const r of allInvLineItems) revByProd[r.productName] = (revByProd[r.productName] ?? 0) + r.revenue;
    for (const p of (products ?? []) as any[]) {
      const cat = p.category || "Uncategorized";
      if (!by[cat]) by[cat] = { count: 0, revenue: 0 };
      by[cat].count += 1;
      by[cat].revenue += revByProd[p.name] ?? 0;
    }
    const COLS = ["#6366f1","#10b981","#f59e0b","#3b82f6","#ef4444","#8b5cf6","#14b8a6","#ec4899","#f97316","#64748b"];
    return Object.entries(by).map(([name, v], i) => ({
      name, count: v.count, revenue: Math.round(v.revenue*100)/100, fill: COLS[i % COLS.length],
    })).sort((a, b) => b.revenue - a.revenue);
  }, [products, allInvLineItems]);

  const inventoryMap = Object.fromEntries(
    (inventory ?? []).map(i => [i.productId, i])
  );

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return products ?? [];
    return (products ?? []).filter((p: any) => {
      const inv = inventoryMap[p.id];
      return [
        p.name, p.sku, p.description, p.category,
        String(p.id ?? ""), String(inv?.quantity ?? ""),
      ].some(v => String(v ?? "").toLowerCase().includes(q));
    });
  }, [products, inventoryMap, debouncedSearch]);

  const handleDelete = (id: number) => {
    if (confirm("Delete this product?")) {
      deleteProduct.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }) });
    }
  };

  const handleUpdateSku = (product: any) => { setEditingSkuProduct(product); setNewSku(product.sku || ""); };
  const handleSkuSubmit = () => {
    if (!editingSkuProduct) return;
    updateProduct.mutate({ id: editingSkuProduct.id, data: { sku: newSku.trim() || null } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditingSkuProduct(null); setNewSku(""); }
    });
  };

  const saveInlineName = (id: number, value: string) => {
    if (!value.trim()) { setEditingName(null); return; }
    updateProduct.mutate({ id, data: { name: value.trim() } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditingName(null); }
    });
  };

  const saveInlineSku = (id: number, value: string) => {
    updateProduct.mutate({ id, data: { sku: value.trim() || null } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditingSkuInline(null); }
    });
  };

  const saveInlineSalePrice = (id: number, value: string) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) { setEditingSalePrice(null); return; }
    updateProduct.mutate({ id, data: { salePrice: parsed } as any }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditingSalePrice(null); }
    });
  };

  const saveInlineCostPrice = (id: number, value: string) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) { setEditingCostPrice(null); return; }
    updateProduct.mutate({ id, data: { costPrice: parsed } as any }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); setEditingCostPrice(null); }
    });
  };

  const saveInlineQty = (invId: number, value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) { setEditingQty(null); return; }
    updateInventory.mutate({ id: invId, data: { quantity: parsed } as any }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() }); setEditingQty(null); }
    });
  };

  const handleBarcodeFound = (code: string) => {
    setShowScanner(false);
    setSearch(code);
    const match = products?.find((p: any) => p.sku === code);
    if (match) setDetailProduct(match);
  };

  const CSV_HEADERS = [
    "name","sku","category","description","salePrice","costPrice",
    "taxPercent","discountPercent","minOrderQty","isInventoryItem",
    "estimatedLeadDays","optimalStockMin","unit","notes",
  ];

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values: string[] = [];
      let cur = ""; let inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      values.push(cur.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").replace(/^"|"$/g, ""); });
      rows.push(row);
    }
    return rows;
  }

  function handleExport() {
    const prods = products ?? [];
    const csvLines = [CSV_HEADERS.join(",")];
    for (const p of prods as any[]) {
      const row = CSV_HEADERS.map(h => {
        const val = String(p[h] ?? "");
        return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val.replace(/"/g, '""')}"` : val;
      });
      csvLines.push(row.join(","));
    }
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "products.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSampleCSV() {
    const sample = [
      CSV_HEADERS.join(","),
      `"Widget Pro","WGT-001","Electronics","High-quality widget",29.99,15.00,8.5,0,1,true,7,50,"pcs","Best seller"`,
      `"Bolt Pack 50","BLT-050","Hardware","Stainless steel bolts pack of 50",4.99,2.50,0,5,10,true,3,200,"pack",""`,
      `"Consulting Hour","SVC-001","Services","1 hour consulting session",150.00,0,0,0,1,false,,,,"hr","Non-inventory service"`,
    ].join("\n");
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "products_sample.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function mapQuickBooksProductRow(r: Record<string, string>): Record<string, string> {
    const qbName = r["Product/Service Name"] ?? r["product/servicename"];
    if (!qbName) return r;
    const itemType = r["Item type"] ?? "";
    const noteParts = [
      itemType ? `Item Type: ${itemType}` : "",
      r["Variant Name"] ? `Variant: ${r["Variant Name"]}` : "",
      r["Income Account"] ? `Income Account: ${r["Income Account"]}` : "",
      r["Expense Account"] ? `Expense Account: ${r["Expense Account"]}` : "",
      r.Taxable ? `Taxable: ${r.Taxable}` : "",
    ].filter(Boolean);
    return {
      name: qbName,
      sku: r.SKU ?? "",
      category: r.Category ?? "",
      description: r["Sales Description"] || r["Purchase Description"] || "",
      salePrice: r.Price || "0",
      costPrice: r.Cost || "0",
      taxPercent: (r.Taxable ?? "").toLowerCase() === "yes" ? "8.875" : "0",
      minOrderQty: "1",
      isInventoryItem: itemType.toLowerCase() !== "non-inventory" && itemType.toLowerCase() !== "service" ? "true" : "false",
      optimalStockMin: r["Reorder Point"] ?? "",
      notes: noteParts.join("\n"),
      quickbooksExtras: JSON.stringify({
        itemType: itemType || null,
        quantityOnHand: r["Quantity on hand"] ?? null,
        incomeAccount: r["Income Account"] ?? null,
        expenseAccount: r["Expense Account"] ?? null,
        variantName: r["Variant Name"] ?? null,
      }),
    };
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      const rows = raw.map(mapQuickBooksProductRow);
      const errs: string[] = [];
      rows.forEach((r, i) => { if (!r.name?.trim()) errs.push(`Row ${i + 2}: "name" is required`); });
      setImportRows(rows);
      setImportErrors(errs);
      setImportProgress(null);
      setImportDone(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  async function runImport() {
    const validRows = importRows.filter(r => r.name?.trim());
    setImportProgress({ done: 0, total: validRows.length });
    setImportDone(false);
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const data: any = {
        name: r.name.trim(),
        sku: r.sku || null,
        category: r.category || null,
        description: r.description || null,
        salePrice: parseFloat(r.salePrice) || 0,
        costPrice: parseFloat(r.costPrice) || 0,
        taxPercent: parseFloat(r.taxPercent) || 0,
        discountPercent: parseFloat(r.discountPercent) || 0,
        minOrderQty: parseInt(r.minOrderQty) || 1,
        isInventoryItem: r.isInventoryItem?.toLowerCase() !== "false",
        estimatedLeadDays: r.estimatedLeadDays ? parseInt(r.estimatedLeadDays) : null,
        optimalStockMin: r.optimalStockMin ? parseInt(r.optimalStockMin) : null,
        unit: r.unit || null,
        notes: r.notes || null,
        quickbooksExtras: r.quickbooksExtras
          ? (typeof r.quickbooksExtras === "string" ? JSON.parse(r.quickbooksExtras) : r.quickbooksExtras)
          : null,
      };
      await new Promise<void>((resolve) => {
        createProduct.mutate({ data }, { onSettled: () => resolve() });
      });
      setImportProgress({ done: i + 1, total: validRows.length });
    }
    await queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    setImportDone(true);
  }

  return (
    <Layout>
      <Header title="Products & Inventory" subtitle={`${products?.length ?? 0} products`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-md flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search by name, SKU, category..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
            </div>
            <button
              onClick={() => setShowScanner(true)}
              title="Scan barcode"
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <Camera size={16} />
            </button>
          </div>
          <button
            onClick={() => setShowBulkStockIn(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border"
            style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#15803d" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#dcfce7"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#f0fdf4"; }}
          >
            <PackagePlus size={14} /> Bulk Stock In
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            title="Export all products as CSV"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => { setImportRows([]); setImportErrors([]); setImportProgress(null); setImportDone(false); setShowImportModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
            title="Import products from CSV"
          >
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setShowModal(true)} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
            <Plus size={14} /> Add Product
          </button>
          <button
            onClick={() => setShowInsights(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${showInsights ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700"}`}
          >
            <BarChart2 size={14} />
            Insights
            {showInsights ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {/* ── PRODUCT INSIGHTS PANEL ───────────────────────────────── */}
        {showInsights && (
          <div className="glass-card p-5 flex flex-col gap-4">
            {/* Insight controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* View toggle */}
              <div className="flex flex-wrap rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {([
                  { v: "customers", label: "By Customer",   icon: <Users size={12}/>,   color: "bg-blue-600"   },
                  { v: "vendors",   label: "By Vendor",     icon: <Store size={12}/>,   color: "bg-violet-600" },
                  { v: "products",  label: "By Product",    icon: <BarChart2 size={12}/>,color: "bg-emerald-600"},
                  { v: "trend",     label: "Revenue Trend", icon: <TrendingUp size={12}/>,color: "bg-indigo-600"},
                  { v: "orders",    label: "Orders",        icon: <Package size={12}/>, color: "bg-amber-600"  },
                  { v: "stock",     label: "Stock Levels",  icon: <Boxes size={12}/>,   color: "bg-sky-600"    },
                  { v: "margin",    label: "Margin",        icon: <Tag size={12}/>,     color: "bg-rose-600"   },
                  { v: "category",  label: "Categories",    icon: <Filter size={12}/>,  color: "bg-teal-600"   },
                ] as const).map(({ v, label, icon, color }, idx) => (
                  <button key={v} onClick={() => setInsightView(v as any)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${idx > 0 ? "border-l border-slate-200" : ""} ${insightView === v ? `${color} text-white` : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {icon} {label}
                  </button>
                ))}
              </div>

              {/* Period filter */}
              <div className="flex items-center gap-0.5 rounded-lg overflow-hidden border border-slate-200 bg-white text-xs shadow-sm">
                {(["1mo", "3mo", "6mo", "12mo", "2yr", "3yr", "all"] as const).map(p => (
                  <button key={p} onClick={() => setInsightPeriod(p)}
                    className={`px-2.5 py-1.5 font-semibold transition-colors ${insightPeriod === p ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                    {p === "all" ? "All Time" : p}
                  </button>
                ))}
              </div>

              {/* Multi-product filter */}
              <div className="relative">
                <button onClick={() => setShowProductFilter(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${selectedProducts.size > 0 ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <Filter size={11} />
                  {selectedProducts.size === 0 ? "All Products" : `${selectedProducts.size} selected`}
                  <ChevronDown size={11} />
                </button>
                {showProductFilter && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2 min-w-[200px] max-h-52 overflow-y-auto">
                    <div className="flex justify-between px-2 py-1 mb-1">
                      <button onClick={() => setSelectedProducts(new Set())} className="text-[10px] text-slate-400 hover:text-slate-600">Clear all</button>
                      <button onClick={() => setSelectedProducts(new Set(allProductNames))} className="text-[10px] text-blue-500 hover:text-blue-700">Select all</button>
                    </div>
                    {allProductNames.map(n => (
                      <label key={n} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" className="rounded accent-blue-600 w-3.5 h-3.5"
                          checked={selectedProducts.has(n)}
                          onChange={e => setSelectedProducts(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(n) : next.delete(n);
                            return next;
                          })} />
                        <span className="text-xs text-slate-700 truncate max-w-[160px]" title={n}>{n}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Product filter single (for customer/vendor views) */}
              {(insightView === "customers" || insightView === "vendors") && (
                <div className="min-w-[150px] max-w-[180px]">
                  <select value={insightProduct} onChange={e => setInsightProduct(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                    <option value="__all__">All Products</option>
                    {allProductNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}

              <span className="text-xs text-slate-400 ml-auto">
                {insightView === "customers" ? `${customerChartData.length} customers`
                  : insightView === "vendors" ? `${vendorChartData.length} vendors`
                  : insightView === "products" ? `${productChartData.length} products`
                  : insightView === "trend" ? `${trendChartData.length} months`
                  : insightView === "stock" ? `${stockLevelData.length} products`
                  : insightView === "margin" ? `${marginData.length} products`
                  : insightView === "category" ? `${categoryData.length} categories`
                  : `${awaitingPaymentData.length} pending`}
              </span>
            </div>

            {insightView === "products" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Revenue by Product {insightPeriod !== "all" ? `· Last ${insightPeriod}` : "(All time)"}
                  </p>
                  {productChartData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No sales data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={productChartData} margin={{ top: 4, right: 8, bottom: 50, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} width={48} />
                        <Tooltip formatter={(v: any, name: string) => [name === "revenue" ? `$${Number(v).toFixed(2)}` : v, name === "revenue" ? "Revenue" : "Qty"]} />
                        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                          {productChartData.map((_: any, i: number) => (
                            <Cell key={i} fill={["#10b981","#34d399","#6ee7b7","#059669","#047857","#065f46","#6d28d9","#7c3aed","#a78bfa","#3b82f6","#60a5fa","#2563eb","#f59e0b","#d97706"][i % 14]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[220px] max-w-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Product Breakdown</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(16,185,129,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Product</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productChartData.length === 0 ? (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No data</td></tr>
                        ) : productChartData.map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-[130px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{r.qty}</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-600">${r.revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : insightView === "customers" ? (
              <div className="flex gap-6 flex-wrap">
                {/* Bar chart */}
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Revenue by Customer {insightProduct !== "__all__" ? `· ${insightProduct}` : "(All Products)"}
                  </p>
                  {customerChartData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No sales data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={customerChartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} width={48} />
                        <Tooltip formatter={(v: any, name: string) => [name === "revenue" ? `$${Number(v).toFixed(2)}` : v, name === "revenue" ? "Revenue" : "Qty"]} />
                        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                          {customerChartData.map((_: any, i: number) => (
                            <Cell key={i} fill={["#3b82f6","#6366f1","#8b5cf6","#a78bfa","#60a5fa","#818cf8","#93c5fd","#c4b5fd","#ddd6fe","#bfdbfe"][i % 10]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {/* Table */}
                <div className="flex-1 min-w-[220px] max-w-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Customer Breakdown</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(59,130,246,0.07)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Customer</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerChartData.length === 0 ? (
                          <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No data</td></tr>
                        ) : customerChartData.map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{r.qty}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-600">${r.revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : insightView === "vendors" ? (
              <div className="flex gap-6 flex-wrap">
                {/* Bar chart */}
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Supply Cost by Vendor {insightProduct !== "__all__" ? `· ${insightProduct}` : "(All Products)"}
                  </p>
                  {vendorChartData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No purchase order data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={vendorChartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} width={48} />
                        <Tooltip formatter={(v: any, name: string) => [name === "cost" ? `$${Number(v).toFixed(2)}` : v, name === "cost" ? "Total Cost" : "Qty"]} />
                        <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                          {vendorChartData.map((_: any, i: number) => (
                            <Cell key={i} fill={["#8b5cf6","#a78bfa","#7c3aed","#6d28d9","#c4b5fd","#ddd6fe","#ede9fe","#7e22ce","#9333ea","#a855f7"][i % 10]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {/* Table */}
                <div className="flex-1 min-w-[220px] max-w-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Vendor Breakdown</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(139,92,246,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Vendor</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorChartData.length === 0 ? (
                          <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No data</td></tr>
                        ) : vendorChartData.map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-[140px]" title={r.name}>{r.name}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{r.qty}</td>
                            <td className="px-3 py-2 text-right font-semibold text-violet-600">${r.cost.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : insightView === "trend" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[320px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Monthly Revenue Trend {selectedProducts.size > 0 ? `· ${selectedProducts.size} products` : "(All Products)"}
                  </p>
                  {trendChartData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No time-series data available.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={trendChartData} margin={{ top: 4, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} width={52} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} width={36} />
                        <Tooltip formatter={(v: any, name: string) => [name === "revenue" ? `$${Number(v).toFixed(2)}` : v, name === "revenue" ? "Revenue" : "Units Sold"]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: "#6366f1" }} activeDot={{ r: 6 }} name="revenue" />
                        <Line yAxisId="right" type="monotone" dataKey="qty" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} strokeDasharray="5 3" name="qty" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[200px] max-w-sm">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Month-by-Month</p>
                  <div className="overflow-hidden rounded-lg border border-slate-100 max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr style={{ background: "rgba(99,102,241,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Month</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Units</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendChartData.length === 0 ? (
                          <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No data</td></tr>
                        ) : [...trendChartData].reverse().map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-3 py-2 font-medium text-slate-700">{r.month}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{r.qty}</td>
                            <td className="px-3 py-2 text-right font-semibold text-indigo-600">${r.revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* orders view */
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    PO Demand by Product {selectedProducts.size > 0 ? `· ${selectedProducts.size} selected` : "(All)"}
                  </p>
                  {poDemandData.topProducts.length === 0 ? (
                    <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No PO data yet.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={poDemandData.topProducts} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                        <Tooltip formatter={(v: any) => [v, "Units"]} />
                        <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                          {poDemandData.topProducts.map((_: any, i: number) => (
                            <Cell key={i} fill={["#f59e0b","#fbbf24","#fcd34d","#d97706","#b45309","#92400e","#f97316","#fb923c"][i % 8]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  {/* PO status mini counters */}
                  <div className="flex gap-2 flex-wrap mt-3">
                    {Object.entries(poDemandData.statusCounts).map(([s, n]) => (
                      <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        {s}: <span className="text-slate-800">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-w-[300px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Clock size={11} /> Awaiting Payment ({awaitingPaymentData.length})
                  </p>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "rgba(245,158,11,0.08)" }}>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Invoice</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Customer</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Total</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {awaitingPaymentData.length === 0 ? (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">All invoices paid!</td></tr>
                        ) : awaitingPaymentData.map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}>
                            <td className="px-3 py-2 font-mono text-blue-600">{r.forezInv}</td>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[120px]" title={r.buyerName}>{r.buyerName}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">${r.total.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${
                                r.status === "overdue" ? "bg-red-100 text-red-700"
                                : r.status === "pending" ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                              }`}>{r.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* — Stock Levels view — */}
            {insightView === "stock" && (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Inventory Levels by Product (color = health)
                </p>
                {stockLevelData.length === 0 ? (
                  <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No inventory data yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(220, stockLevelData.length * 26)}>
                    <BarChart data={stockLevelData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={130} />
                      <Tooltip formatter={(v: any) => [`${v} units`, "Qty in stock"]} />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                        {stockLevelData.map((r: any, i: number) => (
                          <Cell key={i} fill={stockColors[r.status] ?? "#94a3b8"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex gap-3 mt-3 flex-wrap">
                  {(["out","low","ok","high"] as const).map(label => (
                    <span key={label} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="w-3 h-3 rounded-full" style={{ background: stockColors[label] }} />
                      {label === "out" ? "Out of Stock" : label === "low" ? "Low Stock" : label === "ok" ? "Normal" : "Well Stocked"}
                      <span className="text-slate-400">({stockLevelData.filter((r: any) => r.status === label).length})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* — Margin Analysis view — */}
            {insightView === "margin" && (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Revenue vs. Cost per Product (Margin Analysis)
                </p>
                {marginData.length === 0 ? (
                  <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No revenue/cost data yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={marginData} margin={{ top: 4, right: 16, bottom: 60, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v: any) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                      <Tooltip formatter={(v: any, name: string) => [`$${Number(v).toFixed(2)}`, name === "revenue" ? "Revenue" : "COGS"]} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="cost" name="COGS" fill="#f43f5e" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex gap-4 mt-3 flex-wrap">
                  {marginData.slice(0, 5).map((r: any) => (
                    <div key={r.name} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-700 truncate max-w-[100px]" title={r.name}>{r.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.margin >= 40 ? "bg-emerald-100 text-emerald-700" : r.margin >= 15 ? "bg-blue-100 text-blue-700" : r.margin >= 0 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        {r.margin}% margin
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* — Category Mix view — */}
            {insightView === "category" && (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-shrink-0">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Revenue by Category</p>
                  {categoryData.length === 0 ? (
                    <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No category data yet.</div>
                  ) : (
                    <ResponsiveContainer width={260} height={260}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110}
                          label={({ name, percent }: any) => percent > 0.05 ? `${(percent*100).toFixed(0)}%` : ""}
                          labelLine={false}>
                          {categoryData.map((r: any, i: number) => (
                            <Cell key={i} fill={r.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Revenue"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Category Breakdown</p>
                  <div className="space-y-2">
                    {categoryData.map((r: any) => (
                      <div key={r.name} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: r.fill }} />
                        <span className="text-xs text-slate-700 flex-1 truncate" title={r.name}>{r.name}</span>
                        <span className="text-xs text-slate-500">{r.count} prod{r.count !== 1 ? "s" : ""}</span>
                        <span className="text-xs font-semibold text-slate-700 text-right min-w-[70px]">${r.revenue.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No products found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(239,246,255,0.95)" }}>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8" }}>SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8" }}>Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8" }}>Description</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(59,130,246,0.13)", color: "#1d4ed8" }}>Category</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(139,92,246,0.13)", color: "#6d28d9" }}>Sale Price</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(139,92,246,0.13)", color: "#6d28d9" }}>Cost Price</th>
                  <th className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(16,185,129,0.14)", color: "#047857" }}>Stock</th>
                  <th className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider" style={{ background: "rgba(236,72,153,0.13)", color: "#be185d" }}>Status</th>
                  <th className="px-4 py-3 w-10" style={{ background: "rgba(239,246,255,0.95)" }} />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(p => {
                  const inv = inventoryMap[p.id];
                  const isInventoryItem = (p as any).isInventoryItem !== false;
                  const isLow = inv && inv.quantity <= inv.reorderPoint;
                  return (
                    <tr key={p.id}
                      style={{
                        background: detailProduct?.id === p.id ? "rgba(99,102,241,0.09)" : "rgba(255,255,255,0.45)",
                        borderBottom: "1px solid rgba(148,163,184,0.20)",
                        boxShadow: detailProduct?.id === p.id ? "inset 3px 0 0 #6366f1" : "none",
                      }}
                      className={`transition-colors group cursor-pointer ${detailProduct?.id === p.id ? "" : "hover:bg-blue-50/60"}`}
                      onClick={() => setDetailProduct(p)}
                    >
                      <td className="px-4 py-3.5 font-mono text-xs" style={{ color: "#60a5fa" }} onClick={e => e.stopPropagation()}>
                        {editingSkuInline?.id === p.id ? (
                          <input
                            autoFocus
                            value={editingSkuInline.value}
                            onChange={e => setEditingSkuInline({ id: p.id, value: e.target.value })}
                            onBlur={() => saveInlineSku(p.id, editingSkuInline.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveInlineSku(p.id, editingSkuInline.value); if (e.key === "Escape") setEditingSkuInline(null); }}
                            className="font-mono text-xs border border-blue-300 rounded px-2 py-0.5 w-28 focus:outline-none focus:border-blue-500 bg-white text-slate-800"
                          />
                        ) : (
                          <span
                            title="Click to edit SKU"
                            className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 transition-colors"
                            onClick={() => setEditingSkuInline({ id: p.id, value: p.sku || "" })}
                          >
                            {p.sku || <span className="text-slate-300 italic text-[10px]">+ SKU</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-semibold" style={{ color: "#0f172a" }} onClick={e => e.stopPropagation()}>
                        {editingName?.id === p.id ? (
                          <input
                            autoFocus
                            value={editingName.value}
                            onChange={e => setEditingName({ id: p.id, value: e.target.value })}
                            onBlur={() => saveInlineName(p.id, editingName.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveInlineName(p.id, editingName.value); if (e.key === "Escape") setEditingName(null); }}
                            className="text-sm font-semibold border border-blue-300 rounded px-2 py-0.5 w-48 focus:outline-none focus:border-blue-500 bg-white text-slate-800"
                          />
                        ) : (
                          <span
                            title="Click to edit name"
                            className="cursor-text hover:bg-blue-50 rounded px-1 py-0.5 transition-colors"
                            onClick={() => setEditingName({ id: p.id, value: p.name })}
                          >
                            {p.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs max-w-[180px] truncate" style={{ color: "rgba(71,85,105,0.90)" }}>{(p as any).description || "—"}</td>
                      <td className="px-4 py-3.5">
                        {p.category
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(59,130,246,0.15)", color: "#1d4ed8" }}>{p.category}</span>
                          : <span style={{ color: "rgba(71,85,105,0.70)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: "#7c3aed" }} onClick={e => e.stopPropagation()}>
                        {editingSalePrice?.id === p.id ? (
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingSalePrice.value}
                            onChange={e => setEditingSalePrice({ id: p.id, value: e.target.value })}
                            onBlur={() => saveInlineSalePrice(p.id, editingSalePrice.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveInlineSalePrice(p.id, editingSalePrice.value); if (e.key === "Escape") setEditingSalePrice(null); }}
                            className="text-sm font-semibold border border-violet-300 rounded px-2 py-0.5 w-24 text-right focus:outline-none focus:border-violet-500 bg-white text-slate-800"
                          />
                        ) : (
                          <span
                            title="Click to edit sale price"
                            className="cursor-text hover:bg-violet-50 rounded px-1 py-0.5 transition-colors"
                            onClick={() => setEditingSalePrice({ id: p.id, value: String(p.salePrice ?? 0) })}
                          >
                            {formatCurrency(p.salePrice)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs" style={{ color: "rgba(124,58,237,0.7)" }} onClick={e => e.stopPropagation()}>
                        {editingCostPrice?.id === p.id ? (
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingCostPrice.value}
                            onChange={e => setEditingCostPrice({ id: p.id, value: e.target.value })}
                            onBlur={() => saveInlineCostPrice(p.id, editingCostPrice.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveInlineCostPrice(p.id, editingCostPrice.value); if (e.key === "Escape") setEditingCostPrice(null); }}
                            className="text-xs border border-violet-300 rounded px-2 py-0.5 w-24 text-right focus:outline-none focus:border-violet-500 bg-white text-slate-800"
                          />
                        ) : (
                          <span
                            title="Click to edit cost price"
                            className="cursor-text hover:bg-violet-50 rounded px-1 py-0.5 transition-colors"
                            onClick={() => setEditingCostPrice({ id: p.id, value: String(p.costPrice ?? 0) })}
                          >
                            {formatCurrency(p.costPrice)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-right" style={{ color: isLow ? "#ef4444" : "#047857" }} onClick={e => e.stopPropagation()}>
                        {isInventoryItem && inv != null ? (
                          editingQty?.id === p.id ? (
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              step="1"
                              value={editingQty.value}
                              onChange={e => setEditingQty({ id: p.id, invId: inv.id, value: e.target.value })}
                              onBlur={() => saveInlineQty(editingQty.invId, editingQty.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveInlineQty(editingQty.invId, editingQty.value); if (e.key === "Escape") setEditingQty(null); }}
                              className="text-sm font-semibold border border-emerald-300 rounded px-2 py-0.5 w-20 text-right focus:outline-none focus:border-emerald-500 bg-white text-slate-800"
                            />
                          ) : (
                            <span
                              title="Click to edit stock quantity"
                              className="cursor-text hover:bg-emerald-50 rounded px-1 py-0.5 transition-colors"
                              onClick={() => setEditingQty({ id: p.id, invId: inv.id, value: String(inv.quantity) })}
                            >
                              {inv.quantity}
                            </span>
                          )
                        ) : (
                          <span style={{ color: "rgba(71,85,105,0.70)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {!isInventoryItem ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 w-fit">
                              <Archive size={9} /> Non-Inventory
                            </span>
                            {(p as any).estimatedLeadDays && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock size={9} /> ~{(p as any).estimatedLeadDays}d lead time
                              </span>
                            )}
                          </div>
                        ) : !inv ? (
                          <span style={{ color: "rgba(71,85,105,0.70)", fontSize: "0.75rem" }}>Not tracked</span>
                        ) : isLow ? (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-red-500">
                            <AlertCircle size={12} /> Low Stock
                          </div>
                        ) : (p as any).optimalStockMin != null && Number(inv.quantity) >= Number((p as any).optimalStockMin) ? (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                            <CheckCircle2 size={12} /> Optimal
                          </div>
                        ) : (p as any).optimalStockMin != null && Number(inv.quantity) < Number((p as any).optimalStockMin) ? (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                            <AlertCircle size={12} /> Non-Optimal
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                            <CheckCircle2 size={12} /> In Stock
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                            <DropdownMenuItem onClick={() => setDetailProduct(p)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <BarChart3 size={13} /> Details & Analytics
                            </DropdownMenuItem>
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

      {detailProduct && (
        <ProductDetailDrawer
          product={detailProduct}
          inventory={inventoryMap[detailProduct.id]}
          onClose={() => setDetailProduct(null)}
        />
      )}

      {showScanner && (
        <BarcodeScanner onFound={handleBarcodeFound} onClose={() => setShowScanner(false)} />
      )}

      {showModal && <ProductModal onClose={() => setShowModal(false)} />}
      {editingProduct && <ProductModal product={editingProduct} onClose={() => setEditingProduct(null)} />}
      {adjustingInventory && <InventoryAdjustModal inventory={adjustingInventory} productName={adjustingInventory.productName} onClose={() => setAdjustingInventory(null)} />}
      {showBulkStockIn && (
        <BulkStockInModal
          onClose={() => setShowBulkStockIn(false)}
          products={(products ?? []) as any[]}
          inventory={(inventory ?? []) as any[]}
        />
      )}

      {editingSkuProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit SKU</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-600 mb-2">Product: {editingSkuProduct.name}</label>
              <input type="text" placeholder="Enter SKU..." value={newSku} onChange={e => setNewSku(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSkuSubmit()}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-500" autoFocus />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditingSkuProduct(null)} className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleSkuSubmit} disabled={updateProduct.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {updateProduct.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT MODAL ─────────────────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <FileSpreadsheet size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Import Products from CSV</h2>
                  <p className="text-xs text-slate-500">Upload a CSV file to bulk-add products to your catalog</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
              {/* Step 1 — Download sample */}
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-indigo-800 mb-1">Step 1 — Download the sample template</p>
                  <p className="text-xs text-indigo-600">The template includes all supported columns with 3 example rows. Fill it in with your products and save as CSV.</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Columns: <span className="font-mono text-slate-700 text-[11px]">{CSV_HEADERS.join(", ")}</span>
                  </p>
                </div>
                <button onClick={downloadSampleCSV}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
                  <Download size={14} /> Sample CSV
                </button>
              </div>

              {/* Step 2 — Upload */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Step 2 — Upload your CSV file</p>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
                  <Upload size={24} className="text-slate-400" />
                  <span className="text-sm text-slate-600 font-medium">Click to choose a CSV file</span>
                  <span className="text-xs text-slate-400">Only .csv files are supported</span>
                  <input ref={importFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
                </label>
              </div>

              {/* Validation errors */}
              {importErrors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">{importErrors.length} validation issue{importErrors.length > 1 ? "s" : ""} — rows without a name will be skipped</span>
                  </div>
                  <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                    {importErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {importRows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Preview — {importRows.length} row{importRows.length !== 1 ? "s" : ""} detected
                    {importErrors.length > 0 && <span className="text-amber-600 ml-1">({importRows.filter(r => r.name?.trim()).length} valid)</span>}
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                          {["name","sku","category","salePrice","costPrice","unit","isInventoryItem"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, i) => {
                          const invalid = !row.name?.trim();
                          return (
                            <tr key={i} className={`border-b border-slate-100 ${invalid ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                              <td className="px-3 py-2 text-slate-400">{i + 2}</td>
                              {["name","sku","category","salePrice","costPrice","unit","isInventoryItem"].map(h => (
                                <td key={h} className={`px-3 py-2 whitespace-nowrap ${h === "name" && invalid ? "text-red-500 font-semibold" : "text-slate-700"}`}>
                                  {row[h] || <span className="text-slate-300">—</span>}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {importProgress && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {importDone ? "Import complete!" : `Importing… ${importProgress.done} of ${importProgress.total}`}
                    </span>
                    {importDone && <CheckCircle size={18} className="text-emerald-600" />}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${importDone ? "bg-emerald-500" : "bg-indigo-500"}`}
                      style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                    />
                  </div>
                  {importDone && (
                    <p className="text-xs text-emerald-700 mt-2 font-medium">
                      {importProgress.done} product{importProgress.done !== 1 ? "s" : ""} added successfully — your product list has been updated.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 text-sm font-medium transition-colors">
                {importDone ? "Close" : "Cancel"}
              </button>
              <button
                onClick={runImport}
                disabled={importRows.filter(r => r.name?.trim()).length === 0 || (importProgress != null && !importDone)}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Upload size={14} />
                {importDone
                  ? "Done"
                  : `Import ${importRows.filter(r => r.name?.trim()).length > 0 ? `${importRows.filter(r => r.name?.trim()).length} Product${importRows.filter(r => r.name?.trim()).length !== 1 ? "s" : ""}` : "Products"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
