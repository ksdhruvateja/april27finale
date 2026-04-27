import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Tag, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useListProducts } from "@workspace/api-client-react";
import { UNIT_OPTIONS, UNIT_VALUES } from "@/lib/units";

export interface LineItem {
  productId?: number | null;
  description: string;
  lineDescription?: string;
  sku?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  salePrice?: number;
  costPrice?: number;
  taxPercent?: number;
  discountPercent?: number;
}

export interface OrderDiscount {
  type: "percent" | "fixed";
  value: number;
}

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  orderDiscount: OrderDiscount | null;
  onOrderDiscountChange: (d: OrderDiscount | null) => void;
  orderTaxPercent: number;
  onOrderTaxPercentChange: (v: number) => void;
  showProfit?: boolean;
  vendorPricing?: boolean;
  profitCostMode?: "auto" | "manual";
  onProfitCostModeChange?: (mode: "auto" | "manual") => void;
  manualPurchaseCost?: number;
  onManualPurchaseCostChange?: (value: number) => void;
  taxExempt?: boolean;
  onTaxExemptChange?: (v: boolean) => void;
}

function emptyItem(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0, unit: "ea" };
}

export function calcTotals(
  items: LineItem[],
  orderDiscount: OrderDiscount | null = null,
  orderTaxPercent: number = 0
) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  let orderDiscountAmount = 0;
  if (orderDiscount && orderDiscount.value > 0) {
    orderDiscountAmount =
      orderDiscount.type === "percent"
        ? subtotal * (orderDiscount.value / 100)
        : Math.min(orderDiscount.value, subtotal);
  }
  const afterDiscount = subtotal - orderDiscountAmount;
  const taxTotal = afterDiscount * (orderTaxPercent / 100);
  return { subtotal, discountTotal: 0, taxTotal, orderDiscountAmount, total: afterDiscount + taxTotal };
}

const inputCls =
  "w-full rounded-md px-2 py-1.5 text-sm focus:outline-none transition-colors";
const inputStyle = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#ffffff",
} as React.CSSProperties;

const selectStyle = {
  background: "rgba(30,25,20,0.95)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#ffffff",
} as React.CSSProperties;

const COLS = "2fr 55px 88px 90px 75px 24px";

// ─── DescSkuCell ──────────────────────────────────────────────────────────────
// One row's description input + SKU input, each with their own portal dropdown.
// Uses a stable useRef (not a callback ref) so React never triggers re-renders
// on ref assignment — the element is always present before any dropdown opens.
interface DescSkuCellProps {
  item: LineItem;
  products: any[];
  inputCls: string;
  inputStyle: React.CSSProperties;
  onDescChange: (val: string) => void;
  onSkuChange: (val: string) => void;
  onSelect: (p: any) => void;
}

function DescSkuCell({ item, products, inputCls, inputStyle, onDescChange, onSkuChange, onSelect }: DescSkuCellProps) {
  const descRef = useRef<HTMLDivElement>(null);
  const skuRef  = useRef<HTMLDivElement>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [skuOpen,  setSkuOpen]  = useState(false);

  const normalize = (value: unknown) => String(value ?? "").toLowerCase().trim();

  const getSugg = (q: string) => {
    if (!products?.length) return [];
    if (!q.trim()) return products;
    const lq = normalize(q);
    return products.filter((p: any) =>
      normalize(p.name).includes(lq) ||
      normalize(p.sku).includes(lq) ||
      normalize(p.description).includes(lq) ||
      String(p.id ?? "").includes(lq)
    );
  };

  const getSkuSugg = (q: string) => {
    if (!products?.length) return [];
    if (!q.trim()) return products.filter((p: any) => p.sku || p.name).slice(0, 25);
    const lq = normalize(q);
    return products.filter((p: any) =>
      normalize(p.sku).includes(lq) ||
      normalize(p.name).includes(lq) ||
      String(p.id ?? "").includes(lq)
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Description input */}
      <div ref={descRef}>
        <textarea
          className={inputCls + " text-[15px]"}
          style={inputStyle}
          placeholder="Description or product name…"
          value={item.description}
          rows={1}
          onChange={e => { onDescChange(e.target.value); setDescOpen(true); }}
          onInput={e => {
            const target = e.currentTarget;
            target.style.height = "auto";
            target.style.height = `${target.scrollHeight}px`;
          }}
          onFocus={() => setDescOpen(true)}
          onBlur={() => setTimeout(() => setDescOpen(false), 200)}
        />
        <PortalDropdown
          anchorEl={descRef.current}
          open={descOpen && (products ?? []).length > 0}
        >
          {getSugg(item.description).length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: "rgba(255,255,255,0.40)" }}>No matching products</p>
          ) : getSugg(item.description).map((p: any) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setDescOpen(false); }}
              className="w-full text-left flex items-center justify-between px-3 py-2 gap-2 transition-colors"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate" style={{ color: "#ffffff" }}>{p.name}</span>
                {p.sku && <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.40)" }}>{p.sku}</span>}
                {p.description && (
                  <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.40)" }}>{p.description}</span>
                )}
              </div>
              <span className="text-xs font-medium flex-shrink-0" style={{ color: "rgba(255,255,255,0.65)" }}>
                {formatCurrency(Number(p.salePrice ?? 0))}
              </span>
            </button>
          ))}
        </PortalDropdown>
      </div>

      {/* SKU searchable input */}
      <div ref={skuRef} style={{ marginTop: "4px", marginBottom: "8px" }}>
        <input
          className="text-sm rounded px-2 py-1.5 focus:outline-none w-44"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)" }}
          placeholder="Search by SKU or product…"
          value={item.sku ?? ""}
          onChange={e => { onSkuChange(e.target.value); setSkuOpen(true); }}
          onFocus={() => setSkuOpen(true)}
          onBlur={() => setTimeout(() => setSkuOpen(false), 200)}
        />
        <PortalDropdown
          anchorEl={skuRef.current}
          open={skuOpen && getSkuSugg(item.sku ?? "").length > 0}
          minWidth={240}
        >
          {getSkuSugg(item.sku ?? "").map((p: any) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setSkuOpen(false); }}
              className="w-full text-left flex items-center justify-between px-3 py-2 gap-2 transition-colors"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate" style={{ color: "#ffffff" }}>{p.name}</span>
                {p.sku && <span className="text-xs font-mono" style={{ color: "#60a5fa" }}>{p.sku}</span>}
              </div>
              <span className="text-xs font-medium flex-shrink-0" style={{ color: "rgba(255,255,255,0.65)" }}>
                {formatCurrency(Number(p.salePrice ?? 0))}
              </span>
            </button>
          ))}
        </PortalDropdown>
      </div>
    </div>
  );
}

// Renders children in a fixed portal positioned below anchorEl,
// completely outside the modal's scroll container so wheel events
// never bubble to the modal.
function PortalDropdown({
  anchorEl,
  open,
  children,
  minWidth,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  children: React.ReactNode;
  minWidth?: number;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) { setRect(null); return; }
    const update = () => setRect(anchorEl.getBoundingClientRect());
    update();
    // Keep position in sync if the modal scrolls
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorEl]);

  if (!open || !rect) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        width: minWidth != null ? Math.max(rect.width, minWidth) : rect.width,
        zIndex: 99999,
        background: "rgba(20,16,12,0.97)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(12px)",
        borderRadius: "0.75rem",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.9)",
        overflow: "hidden",
      }}
    >
      <div style={{ maxHeight: "176px", overflowY: "auto" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function LineItemsEditor({
  items,
  onChange,
  orderDiscount,
  onOrderDiscountChange,
  orderTaxPercent,
  onOrderTaxPercentChange,
  showProfit = false,
  vendorPricing = false,
  profitCostMode = "auto",
  onProfitCostModeChange,
  manualPurchaseCost = 0,
  onManualPurchaseCostChange,
  taxExempt = false,
  onTaxExemptChange,
}: Props) {
  const { data: products } = useListProducts();

  const productById = useMemo(() => {
    const map = new Map<number, any>();
    for (const p of products ?? []) map.set(Number((p as any).id), p);
    return map;
  }, [products]);

  const productBySku = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of products ?? []) {
      const skuKey = String((p as any).sku ?? "").trim().toLowerCase();
      if (skuKey) map.set(skuKey, p);
    }
    return map;
  }, [products]);

  const parseMoney = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const resolveProductForItem = (item: LineItem) => {
    if (item.productId != null && productById.has(Number(item.productId))) {
      return productById.get(Number(item.productId));
    }
    const skuKey = String(item.sku ?? "").trim().toLowerCase();
    if (skuKey && productBySku.has(skuKey)) {
      return productBySku.get(skuKey);
    }
    return null;
  };

  const addItem = (preset?: Partial<LineItem>) => {
    onChange([...items, { ...emptyItem(), ...preset }]);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof LineItem, val: string | number) =>
    onChange(
      items.map((item, i) =>
        i === idx ? { ...item, [field]: typeof val === "string" ? val : Number(val) } : item
      )
    );

  const updateItemStr = (idx: number, field: keyof LineItem, val: string) =>
    onChange(items.map((item, i) => (i === idx ? { ...item, [field]: val } : item)));

  const selectProduct = (idx: number, p: any) => {
    const linePrice = vendorPricing
      ? Number(p.costPrice ?? p.salePrice ?? 0)
      : Number(p.salePrice ?? 0);
    const productUnit = p.unit && p.unit.trim() ? p.unit.trim() : "ea";
    onChange(
      items.map((item, i) =>
        i === idx
          ? {
              ...item,
              productId: p.id,
              description: p.name,
              lineDescription: p.description || "",
              sku: p.sku || "",
              unit: productUnit,
              unitPrice: linePrice,
              salePrice: Number(p.salePrice ?? 0),
              costPrice: Number(p.costPrice ?? 0),
            }
          : item
      )
    );
  };

  const resolveUnitOptions = (currentUnit?: string) => {
    if (!currentUnit || UNIT_VALUES.has(currentUnit)) return UNIT_OPTIONS;
    return [{ value: currentUnit, label: `${currentUnit} (custom)` }, ...UNIT_OPTIONS];
  };

  const { subtotal, taxTotal, orderDiscountAmount, total } = calcTotals(
    items,
    orderDiscount,
    orderTaxPercent
  );

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.50)" }}>Line Items</span>

      {items.length === 0 && (
        <div
          className="rounded-lg p-4 text-center text-sm"
          style={{ border: "1px dashed rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.40)" }}
        >
          No line items yet — click + below to add one.
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
          <div
            className="grid text-[11px] uppercase tracking-wider font-semibold px-3 py-2"
            style={{ gridTemplateColumns: COLS, background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)" }}
          >
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              className="last:border-0"
            >
              {/* Main row */}
              <div
                className="grid items-start gap-1.5 px-3 pt-2.5 pb-1"
                style={{ gridTemplateColumns: COLS }}
              >
                {/* Description + SKU — portal dropdowns managed inside DescSkuCell */}
                <DescSkuCell
                  item={item}
                  products={products ?? []}
                  inputCls={inputCls}
                  inputStyle={inputStyle}
                  onDescChange={val => updateItem(idx, "description", val)}
                  onSkuChange={val => updateItemStr(idx, "sku", val)}
                  onSelect={p => selectProduct(idx, p)}
                />

                {/* Qty */}
                <input
                  className={inputCls + " text-right"}
                  style={inputStyle}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="1"
                  value={item.quantity || ""}
                  onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                />

                {/* Unit */}
                <select
                  className={inputCls}
                  style={selectStyle}
                  value={item.unit ?? "ea"}
                  onChange={e => updateItemStr(idx, "unit", e.target.value)}
                >
                  {resolveUnitOptions(item.unit).map(u => (
                    <option key={u.value} value={u.value}>{u.value}</option>
                  ))}
                </select>

                {/* Unit Price */}
                <input
                  className={inputCls + " text-right"}
                  style={inputStyle}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={item.unitPrice || ""}
                  onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))}
                />

                {/* Amount */}
                <span className="text-right text-sm font-medium pr-0.5 pt-1.5 block" style={{ color: "#ffffff" }}>
                  {formatCurrency(item.quantity * item.unitPrice)}
                </span>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="p-1 rounded transition-colors mt-0.5"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.12)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Line description sub-row */}
              <div className="px-3 pt-1 pb-2.5">
                <textarea
                  className="w-full text-xs bg-transparent focus:outline-none pb-0.5 transition-colors resize-none"
                  style={{ color: "rgba(255,255,255,0.45)", borderBottom: "1px solid transparent", minHeight: "18px" }}
                  placeholder="Line description (optional)…"
                  value={item.lineDescription ?? ""}
                  rows={1}
                  onChange={e => {
                    updateItemStr(idx, "lineDescription", e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)"}
                  onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = "transparent"}
                />
              </div>
            </div>
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} className="px-3 py-2">
            <button
              type="button"
              onClick={() => addItem()}
              className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
              style={{ color: "rgba(255,255,255,0.40)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#3b82f6"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.40)"}
            >
              <Plus size={13} /> Add line item
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <button
          type="button"
          onClick={() => addItem()}
          className="self-start flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
          style={{ color: "rgba(255,255,255,0.40)", border: "1px dashed rgba(255,255,255,0.18)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#3b82f6"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(59,130,246,0.40)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.40)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)"; }}
        >
          <Plus size={13} /> Add line item
        </button>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div
            className="flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex justify-between" style={{ color: "rgba(255,255,255,0.60)" }}>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {!orderDiscount ? (
              <button
                type="button"
                onClick={() => onOrderDiscountChange({ type: "percent", value: 0 })}
                className="self-start flex items-center gap-1 text-[11px] font-semibold transition-colors mt-0.5"
                style={{ color: "rgba(255,255,255,0.35)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#3b82f6"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)"}
              >
                <Tag size={10} /> Add discount
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1" style={{ color: "rgba(255,255,255,0.60)" }}>Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={orderDiscount.value || ""}
                  onChange={e => onOrderDiscountChange({ ...orderDiscount, value: Number(e.target.value) })}
                  className="w-20 rounded-md px-2 py-1 text-xs text-right focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" }}
                />
                <button
                  type="button"
                  onClick={() =>
                    onOrderDiscountChange({
                      ...orderDiscount,
                      type: orderDiscount.type === "percent" ? "fixed" : "percent",
                    })
                  }
                  className="text-[11px] font-bold rounded px-1.5 py-0.5 min-w-[24px] transition-colors"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)" }}
                >
                  {orderDiscount.type === "percent" ? "%" : "$"}
                </button>
                <span className="text-sm w-20 text-right" style={{ color: "#f87171" }}>
                  {orderDiscountAmount > 0 ? `−${formatCurrency(orderDiscountAmount)}` : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => onOrderDiscountChange(null)}
                  className="transition-colors"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#f87171"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)"}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-sm flex-1" style={{ color: "rgba(255,255,255,0.60)" }}>Tax</span>
              {onTaxExemptChange && (
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={e => onTaxExemptChange(e.target.checked)}
                    className="w-3 h-3 rounded"
                  />
                  <span className="text-[10px] font-semibold" style={{ color: "#fcd34d" }}>Tax Exempt</span>
                </label>
              )}
              {taxExempt ? (
                <>
                  <span className="text-sm w-20 text-right" style={{ color: "rgba(255,255,255,0.40)" }}>—</span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={orderTaxPercent || ""}
                      onChange={e => onOrderTaxPercentChange(Number(e.target.value))}
                      className="w-20 rounded-md px-2 py-1 text-xs text-right focus:outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" }}
                    />
                    <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>%</span>
                  </div>
                  <span className="text-sm w-20 text-right" style={{ color: "rgba(255,255,255,0.60)" }}>
                    {taxTotal > 0 ? formatCurrency(taxTotal) : "—"}
                  </span>
                </>
              )}
            </div>

            <div
              className="flex justify-between font-bold pt-2 mt-1"
              style={{ borderTop: "1px solid rgba(255,255,255,0.10)", color: "#ffffff" }}
            >
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {showProfit && (() => {
            const autoPurchaseCost = vendorPricing
              ? subtotal
              : items.reduce((s, i) => {
                  const product = resolveProductForItem(i);
                  const costFromItem = parseMoney(i.costPrice);
                  const costFromProduct = parseMoney((product as any)?.costPrice);
                  const effectiveCost = costFromItem ?? costFromProduct ?? 0;
                  return s + i.quantity * effectiveCost;
                }, 0);
            const purchaseCost = profitCostMode === "manual" ? manualPurchaseCost : autoPurchaseCost;
            const grossRevenue = vendorPricing
              ? items.reduce((s, i) => {
                  const product = resolveProductForItem(i);
                  const saleFromItem = parseMoney(i.salePrice);
                  const saleFromProduct = parseMoney((product as any)?.salePrice);
                  const effectiveSale = saleFromItem ?? saleFromProduct ?? Number(i.unitPrice ?? 0);
                  return s + i.quantity * effectiveSale;
                }, 0)
              : subtotal;
            // Profit should be based on net revenue before tax (after order-level discount).
            const expectedRevenue = Math.max(0, grossRevenue - orderDiscountAmount);
            const grossProfit = expectedRevenue - purchaseCost;
            const margin = expectedRevenue > 0 ? (grossProfit / expectedRevenue) * 100 : 0;
            const isPositive = grossProfit >= 0;
            return (
              <div
                className="rounded-xl px-4 py-3 mt-1"
                style={{
                  border: `1px solid ${isPositive ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                  background: isPositive ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>Profit Estimate</p>
                <div className="flex items-center justify-between mb-2.5 gap-3">
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.60)" }}>Cost Source</span>
                  <select
                    value={profitCostMode}
                    onChange={e => onProfitCostModeChange?.(e.target.value as "auto" | "manual")}
                    className="rounded-md px-2 py-1 text-xs"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" }}
                  >
                    <option value="auto">Auto (product cost)</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                {profitCostMode === "manual" && (
                  <div className="flex items-center justify-between mb-2.5 gap-3">
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.60)" }}>Manual Purchase Cost</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualPurchaseCost || ""}
                      onChange={e => onManualPurchaseCostChange?.(Number(e.target.value))}
                      className="w-28 rounded-md px-2 py-1 text-xs text-right focus:outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" }}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between" style={{ color: "rgba(255,255,255,0.60)" }}>
                    <span>Purchase Cost</span>
                    <span className="font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>{formatCurrency(purchaseCost)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: "rgba(255,255,255,0.60)" }}>
                    <span>Expected Revenue</span>
                    <span className="font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>{formatCurrency(expectedRevenue)}</span>
                  </div>
                  <div
                    className="flex justify-between font-bold pt-1.5 mt-0.5"
                    style={{
                      borderTop: `1px solid ${isPositive ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                      color: isPositive ? "#34d399" : "#f87171",
                    }}
                  >
                    <span>Gross Profit</span>
                    <span>{isPositive ? "+" : ""}{formatCurrency(grossProfit)} ({margin.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
