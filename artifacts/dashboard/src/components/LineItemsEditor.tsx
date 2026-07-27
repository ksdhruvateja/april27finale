import { useState, useRef, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Tag, X, GripVertical } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useListProducts } from "@workspace/api-client-react";
import { UNIT_OPTIONS, UNIT_VALUES } from "@/lib/units";

export interface SpecNote {
  tag?: string;
  note: string;
}

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
  lineDiscountType?: "percent" | "fixed";
  lineDiscountFixed?: number;
  specNotes?: SpecNote[];
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
  freightCost?: number;
  onFreightCostChange?: (v: number) => void;
  freightMode?: "dollar" | "percent";
  onFreightModeChange?: (mode: "dollar" | "percent") => void;
  showProfit?: boolean;
  vendorPricing?: boolean;
  profitCostMode?: "auto" | "manual";
  onProfitCostModeChange?: (mode: "auto" | "manual") => void;
  manualPurchaseCost?: number;
  onManualPurchaseCostChange?: (value: number) => void;
  taxExempt?: boolean;
  onTaxExemptChange?: (v: boolean) => void;
  lightMode?: boolean;
}

function emptyItem(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0, unit: "ea" };
}

export function lineItemNet(i: LineItem): number {
  const gross = i.quantity * i.unitPrice;
  const discVal = i.lineDiscountType === "fixed"
    ? Math.min(i.lineDiscountFixed ?? 0, gross)
    : gross * ((i.discountPercent ?? 0) / 100);
  return gross - discVal;
}

export function calcTotals(
  items: LineItem[],
  orderDiscount: OrderDiscount | null = null,
  orderTaxPercent: number = 0,
  freightCost: number = 0
) {
  const subtotal = items.reduce((s, i) => s + lineItemNet(i), 0);
  let orderDiscountAmount = 0;
  if (orderDiscount && orderDiscount.value > 0) {
    orderDiscountAmount =
      orderDiscount.type === "percent"
        ? subtotal * (orderDiscount.value / 100)
        : Math.min(orderDiscount.value, subtotal);
  }
  const afterDiscount = subtotal - orderDiscountAmount;
  const taxTotal = afterDiscount * (orderTaxPercent / 100);
  const freight = Math.max(0, freightCost);
  return { subtotal, discountTotal: orderDiscountAmount, taxTotal, orderDiscountAmount, freight, total: afterDiscount + taxTotal + freight };
}

const inputCls =
  "w-full rounded-md px-2 py-1.5 text-sm focus:outline-none transition-colors";

const COLS = "20px 80px 1fr 52px 65px 82px 96px 70px 22px";

// ─── SkuDescCells — renders two grid cells: SKU col + Product Name col ────────
interface SkuDescCellsProps {
  item: LineItem;
  products: any[];
  inputCls: string;
  inputStyle: React.CSSProperties;
  lightMode?: boolean;
  colBorder: string;
  onDescChange: (val: string) => void;
  onSkuChange: (val: string) => void;
  onSelect: (p: any) => void;
}

const SkuDescCells = memo(function SkuDescCells({ item, products, inputCls, inputStyle, lightMode, colBorder, onDescChange, onSkuChange, onSelect }: SkuDescCellsProps) {
  const descRef = useRef<HTMLDivElement>(null);
  const skuRef  = useRef<HTMLDivElement>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [skuOpen,  setSkuOpen]  = useState(false);

  const normalize = (value: unknown) => String(value ?? "").toLowerCase().trim();

  const descSugg = useMemo(() => {
    if (!products?.length) return [];
    const sorted = [...products].sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    const lq = normalize(item.description ?? "");
    if (!lq) return sorted.slice(0, 50);
    return sorted.filter((p: any) =>
      normalize(p.name).includes(lq) ||
      normalize(p.sku).includes(lq) ||
      normalize(p.description).includes(lq) ||
      String(p.id ?? "").includes(lq)
    );
  }, [products, item.description]);

  const skuSugg = useMemo(() => {
    if (!products?.length) return [];
    const sorted = [...products].sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    const lq = normalize(item.sku ?? "");
    if (!lq) return sorted.filter((p: any) => p.sku || p.name).slice(0, 50);
    return sorted.filter((p: any) =>
      normalize(p.sku).includes(lq) ||
      normalize(p.name).includes(lq) ||
      String(p.id ?? "").includes(lq)
    );
  }, [products, item.sku]);

  const skuInputStyle: React.CSSProperties = lightMode
    ? { background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#0f172a", fontFamily: "monospace", fontSize: "12px" }
    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", fontFamily: "monospace", fontSize: "12px" };

  const dropRow = (p: any) => (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold truncate" style={{ color: lightMode ? "#0f172a" : "#ffffff" }}>{p.name}</span>
        {p.isInventoryItem === false && (
          <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.2)", color: "#d97706" }}>
            Non-Inv
          </span>
        )}
      </div>
      {p.sku && <span className="text-xs font-mono" style={{ color: "#60a5fa" }}>{p.sku}</span>}
      {p.description && <span className="text-xs truncate" style={{ color: lightMode ? "#94a3b8" : "rgba(255,255,255,0.40)" }}>{p.description}</span>}
      {p.isInventoryItem === false && p.estimatedLeadDays && (
        <span className="text-[10px] font-semibold" style={{ color: "#f59e0b" }}>
          ⏱ ~{p.estimatedLeadDays} day lead time (internal)
        </span>
      )}
    </div>
  );

  return (
    <>
      {/* ── SKU column ──────────────────────────────────────── */}
      <div ref={skuRef} style={{ borderRight: colBorder, paddingRight: "6px" }}>
        <input
          className="w-full rounded px-2 py-1.5 focus:outline-none"
          style={skuInputStyle}
          placeholder="SKU / Code…"
          value={item.sku ?? ""}
          onChange={e => { onSkuChange(e.target.value); setSkuOpen(true); }}
          onFocus={() => setSkuOpen(true)}
          onBlur={() => setTimeout(() => setSkuOpen(false), 200)}
        />
        <PortalDropdown anchorEl={skuRef.current} open={skuOpen && skuSugg.length > 0} minWidth={240} lightMode={lightMode}>
          {skuSugg.map((p: any) => (
            <button key={p.id} type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setSkuOpen(false); }}
              className="w-full text-left flex items-center justify-between px-3 py-2 gap-2 transition-colors"
              style={{ borderBottom: lightMode ? "1px solid #f1f5f9" : "1px solid rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = lightMode ? "#f8fafc" : "rgba(255,255,255,0.06)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              {dropRow(p)}
              <span className="text-xs font-medium flex-shrink-0" style={{ color: lightMode ? "#64748b" : "rgba(255,255,255,0.65)" }}>
                {formatCurrency(Number(p.salePrice ?? 0))}
              </span>
            </button>
          ))}
        </PortalDropdown>
      </div>

      {/* ── Product Name / Description column ───────────────── */}
      <div ref={descRef} style={{ borderRight: colBorder, paddingRight: "6px" }}>
        <input
          className={inputCls + " text-sm"}
          style={inputStyle}
          placeholder="Product name / description…"
          value={item.description}
          onChange={e => { onDescChange(e.target.value); setDescOpen(true); }}
          onFocus={() => setDescOpen(true)}
          onBlur={() => setTimeout(() => setDescOpen(false), 200)}
        />
        <PortalDropdown anchorEl={descRef.current} open={descOpen && products.length > 0} lightMode={lightMode}>
          {descSugg.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: lightMode ? "#94a3b8" : "rgba(255,255,255,0.40)" }}>No matching products</p>
          ) : descSugg.map((p: any) => (
            <button key={p.id} type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setDescOpen(false); }}
              className="w-full text-left flex items-center justify-between px-3 py-2 gap-2 transition-colors"
              style={{ borderBottom: lightMode ? "1px solid #f1f5f9" : "1px solid rgba(255,255,255,0.05)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = lightMode ? "#f8fafc" : "rgba(255,255,255,0.06)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              {dropRow(p)}
              <span className="text-xs font-medium flex-shrink-0" style={{ color: lightMode ? "#64748b" : "rgba(255,255,255,0.65)" }}>
                {formatCurrency(Number(p.salePrice ?? 0))}
              </span>
            </button>
          ))}
        </PortalDropdown>
      </div>
    </>
  );
});

function PortalDropdown({
  anchorEl,
  open,
  children,
  minWidth,
  lightMode,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  children: React.ReactNode;
  minWidth?: number;
  lightMode?: boolean;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) { setRect(null); return; }
    const update = () => setRect(anchorEl.getBoundingClientRect());
    update();
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
        background: lightMode ? "#ffffff" : "rgba(20,16,12,0.97)",
        border: lightMode ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(12px)",
        borderRadius: "0.75rem",
        boxShadow: lightMode
          ? "0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)"
          : "0 25px 50px -12px rgba(0,0,0,0.9)",
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
  freightCost = 0,
  onFreightCostChange,
  freightMode: freightModeProp = "dollar",
  onFreightModeChange,
  showProfit = false,
  vendorPricing = false,
  profitCostMode = "auto",
  onProfitCostModeChange,
  manualPurchaseCost = 0,
  onManualPurchaseCostChange,
  taxExempt = false,
  onTaxExemptChange,
  lightMode = false,
}: Props) {
  const { data: products } = useListProducts();

  // ─── Drag-and-drop state ──────────────────────────────────────────────────
  const dragIdxRef = useRef<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragIdxRef.current = idx;
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdxRef.current !== null && dragIdxRef.current !== idx) setDropIdx(idx);
  };
  const handleDrop = (idx: number) => {
    const from = dragIdxRef.current;
    if (from === null || from === idx) { dragIdxRef.current = null; setDropIdx(null); return; }
    const reordered = [...items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);
    onChange(reordered);
    dragIdxRef.current = null;
    setDropIdx(null);
  };
  const handleDragEnd = () => { dragIdxRef.current = null; setDropIdx(null); };

  // ─── Light / dark style tokens ────────────────────────────────────────────
  const inputStyle: React.CSSProperties = lightMode
    ? { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a" }
    : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" };

  const selectStyle: React.CSSProperties = lightMode
    ? { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a" }
    : { background: "rgba(30,25,20,0.95)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" };

  const [freightMode, setFreightMode] = useState<"dollar" | "percent">(freightModeProp);
  const preSubtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const freightDollarValue = freightMode === "percent"
    ? (preSubtotal > 0 ? (freightCost / 100) * preSubtotal : 0)
    : freightCost;
  const handleFreightModeToggle = () => {
    const next = freightMode === "dollar" ? "percent" : "dollar";
    setFreightMode(next);
    onFreightModeChange?.(next);
    if (onFreightCostChange) {
      if (next === "percent" && preSubtotal > 0) {
        onFreightCostChange(+(Math.min(100, (freightCost / preSubtotal) * 100)).toFixed(4));
      } else if (next === "dollar" && preSubtotal > 0) {
        onFreightCostChange(+((freightCost / 100) * preSubtotal).toFixed(2));
      }
    }
  };

  const c = {
    label:      lightMode ? "#64748b"              : "rgba(255,255,255,0.50)",
    muted:      lightMode ? "#94a3b8"              : "rgba(255,255,255,0.40)",
    secondary:  lightMode ? "#475569"              : "rgba(255,255,255,0.60)",
    primary:    lightMode ? "#0f172a"              : "#ffffff",
    border:     lightMode ? "#e2e8f0"              : "rgba(255,255,255,0.10)",
    separator:  lightMode ? "#f1f5f9"              : "rgba(255,255,255,0.06)",
    headerBg:   lightMode ? "#f8fafc"              : "rgba(255,255,255,0.05)",
    headerBdr:  lightMode ? "#e2e8f0"              : "rgba(255,255,255,0.09)",
    headerText: lightMode ? "#64748b"              : "rgba(255,255,255,0.45)",
    totalsBg:   lightMode ? "#f8fafc"              : "rgba(255,255,255,0.05)",
    totalsBdr:  lightMode ? "#e2e8f0"              : "rgba(255,255,255,0.08)",
    totalLine:  lightMode ? "#e2e8f0"              : "rgba(255,255,255,0.10)",
    deleteBtn:  lightMode ? "#94a3b8"              : "rgba(255,255,255,0.25)",
    addBtn:     lightMode ? "#94a3b8"              : "rgba(255,255,255,0.40)",
    linedescTxt:lightMode ? "#94a3b8"              : "rgba(255,255,255,0.45)",
    linedescFocusBdr: lightMode ? "#cbd5e1"        : "rgba(255,255,255,0.18)",
    specNoteTxt:lightMode ? "#475569"              : "rgba(255,255,255,0.55)",
    removeSpec: lightMode ? "#94a3b8"              : "rgba(255,255,255,0.20)",
    taxExempt:  lightMode ? "#92400e"              : "#fcd34d",
    taxMuted:   lightMode ? "#94a3b8"              : "rgba(255,255,255,0.40)",
    pct:        lightMode ? "#64748b"              : "rgba(255,255,255,0.45)",
    discBtn:    lightMode ? "#94a3b8"              : "rgba(255,255,255,0.35)",
    profitLbl:  lightMode ? "#64748b"              : "rgba(255,255,255,0.45)",
    profitVal:  lightMode ? "#0f172a"              : "rgba(255,255,255,0.80)",
  };

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

  const addSpecNote = (idx: number) =>
    onChange(items.map((item, i) => i === idx ? { ...item, specNotes: [...(item.specNotes ?? []), { tag: "", note: "" }] } : item));

  const updateSpecNote = (idx: number, noteIdx: number, field: keyof SpecNote, val: string) =>
    onChange(items.map((item, i) => i === idx ? {
      ...item,
      specNotes: (item.specNotes ?? []).map((sn, si) => si === noteIdx ? { ...sn, [field]: val } : sn)
    } : item));

  const removeSpecNote = (idx: number, noteIdx: number) =>
    onChange(items.map((item, i) => i === idx ? {
      ...item,
      specNotes: (item.specNotes ?? []).filter((_, si) => si !== noteIdx)
    } : item));

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

  const { subtotal, taxTotal, orderDiscountAmount, freight, total } = calcTotals(
    items,
    orderDiscount,
    orderTaxPercent,
    freightDollarValue
  );

  const smallInputStyle: React.CSSProperties = lightMode
    ? { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a" }
    : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff" };

  const toggleBtnStyle: React.CSSProperties = lightMode
    ? { background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569" }
    : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)" };

  return (
    <div className="flex flex-col gap-3" style={{ padding: lightMode ? "16px" : undefined }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: c.label }}>Line Items</span>

      {items.length === 0 && (
        <div
          className="rounded-lg p-4 text-center text-sm"
          style={{ border: `1px dashed ${c.border}`, color: c.muted }}
        >
          No line items yet — click + below to add one.
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
          {/* ── Column header ─────────────────────────────────────────── */}
          <div
            className="grid text-[10px] uppercase tracking-wider font-bold px-2 py-2 gap-0"
            style={{ gridTemplateColumns: COLS, background: c.headerBg, borderBottom: `1px solid ${c.headerBdr}`, color: c.headerText }}
          >
            <span />
            <span style={{ borderRight: `1px solid ${c.headerBdr}`, paddingRight: "6px" }}>SKU</span>
            <span style={{ borderRight: `1px solid ${c.headerBdr}`, paddingRight: "6px" }}>Product Name</span>
            <span className="text-right" style={{ borderRight: `1px solid ${c.headerBdr}`, paddingRight: "6px" }}>Qty</span>
            <span style={{ borderRight: `1px solid ${c.headerBdr}`, paddingRight: "6px" }}>Unit</span>
            <span className="text-right" style={{ borderRight: `1px solid ${c.headerBdr}`, paddingRight: "6px" }}>Unit Price</span>
            <span className="text-center" style={{ borderRight: `1px solid ${c.headerBdr}`, paddingRight: "4px" }}>Disc</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {items.map((item, idx) => {
            const colBorder = lightMode ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.07)";
            return (
            <div
              key={idx}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              style={{
                borderBottom: `1px solid ${c.separator}`,
                outline: dropIdx === idx ? `2px solid #3b82f6` : undefined,
                opacity: dragIdxRef.current === idx ? 0.5 : 1,
                transition: "outline 100ms",
              }}
              className="last:border-0"
            >
              {/* Main row */}
              <div
                className="grid items-center gap-0 px-2 py-1"
                style={{ gridTemplateColumns: COLS }}
              >
                {/* Drag handle + row number */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-bold leading-none select-none" style={{ color: c.muted }}>{idx + 1}</span>
                  <span className="cursor-grab active:cursor-grabbing select-none" style={{ color: c.muted }} title="Drag to reorder">
                    <GripVertical size={12} />
                  </span>
                </div>

                <SkuDescCells
                  item={item}
                  products={products ?? []}
                  inputCls={inputCls}
                  inputStyle={inputStyle}
                  lightMode={lightMode}
                  colBorder={colBorder}
                  onDescChange={val => updateItem(idx, "description", val)}
                  onSkuChange={val => updateItemStr(idx, "sku", val)}
                  onSelect={p => selectProduct(idx, p)}
                />

                {/* Qty */}
                <div style={{ borderRight: colBorder, paddingRight: "6px" }}>
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
                </div>

                {/* Unit */}
                <div style={{ borderRight: colBorder, paddingRight: "6px" }}>
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
                </div>

                {/* Unit Price */}
                <div style={{ borderRight: colBorder, paddingRight: "6px" }}>
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
                </div>

                {/* Discount — per-line, $ or % toggle */}
                <div style={{ borderRight: colBorder, paddingRight: "4px" }} className="flex items-center gap-0.5">
                  <input
                    type="number"
                    min="0"
                    step={item.lineDiscountType === "fixed" ? "0.01" : "0.1"}
                    max={item.lineDiscountType === "percent" ? 100 : undefined}
                    placeholder="0"
                    value={item.lineDiscountType === "fixed" ? (item.lineDiscountFixed || "") : (item.discountPercent || "")}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (item.lineDiscountType === "fixed") {
                        onChange(items.map((it, i) => i === idx ? { ...it, lineDiscountFixed: v } : it));
                      } else {
                        updateItem(idx, "discountPercent", v);
                      }
                    }}
                    className="w-12 rounded px-1 py-1.5 text-right text-xs focus:outline-none"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(items.map((it, i) => i === idx ? { ...it, lineDiscountType: it.lineDiscountType === "fixed" ? "percent" : "fixed" } : it))}
                    className="text-[10px] font-bold rounded px-1 py-0.5 min-w-[22px] transition-colors"
                    style={toggleBtnStyle}
                    title="Toggle % / $ discount"
                  >
                    {item.lineDiscountType === "fixed" ? "$" : "%"}
                  </button>
                </div>

                {/* Amount — net after discount */}
                {(() => {
                  const gross = item.quantity * item.unitPrice;
                  const discVal = item.lineDiscountType === "fixed"
                    ? Math.min(item.lineDiscountFixed ?? 0, gross)
                    : gross * ((item.discountPercent ?? 0) / 100);
                  const lineAmt = gross - discVal;
                  return (
                    <span className="text-right text-sm font-semibold pr-1 pt-1.5 block" style={{ color: c.primary }}>
                      {formatCurrency(lineAmt)}
                    </span>
                  );
                })()}

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="p-1 rounded transition-colors mt-0.5"
                  style={{ color: c.deleteBtn }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.12)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = c.deleteBtn; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Non-inventory lead time notice — internal only */}
              {(() => {
                const resolvedProduct = products?.find((pp: any) => pp.id === item.productId);
                if (!resolvedProduct || resolvedProduct.isInventoryItem !== false || !resolvedProduct.estimatedLeadDays) return null;
                return (
                  <div className="mx-3 mt-1 mb-0.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                    style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#d97706" }}>
                    <span>⏱</span>
                    <span>Estimated arrival: ~{resolvedProduct.estimatedLeadDays} business days</span>
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.2)", color: "#92400e" }}>
                      INTERNAL ONLY
                    </span>
                  </div>
                );
              })()}

            </div>
          );
          })}

          <div style={{ borderTop: `1px solid ${c.separator}` }} className="px-3 py-2">
            <button
              type="button"
              onClick={() => addItem()}
              className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
              style={{ color: c.addBtn }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#3b82f6"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = c.addBtn}
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
          style={{ color: c.addBtn, border: `1px dashed ${c.border}` }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#3b82f6"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(59,130,246,0.40)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = c.addBtn; (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
        >
          <Plus size={13} /> Add line item
        </button>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2 items-end">
          <div
            className="flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm w-full max-w-sm"
            style={{ background: c.totalsBg, border: `1px solid ${c.totalsBdr}` }}
          >
            <div className="flex justify-between" style={{ color: c.secondary }}>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {!orderDiscount ? (
              <button
                type="button"
                onClick={() => onOrderDiscountChange({ type: "percent", value: 0 })}
                className="self-start flex items-center gap-1 text-[11px] font-semibold transition-colors mt-0.5"
                style={{ color: c.discBtn }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#3b82f6"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = c.discBtn}
              >
                <Tag size={10} /> Add discount
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1" style={{ color: c.secondary }}>Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={orderDiscount.value || ""}
                  onChange={e => onOrderDiscountChange({ ...orderDiscount, value: Number(e.target.value) })}
                  className="w-20 rounded-md px-2 py-1 text-xs text-right focus:outline-none"
                  style={smallInputStyle}
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
                  style={toggleBtnStyle}
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
                  style={{ color: c.deleteBtn }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#f87171"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = c.deleteBtn}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {onFreightCostChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1" style={{ color: c.secondary }}>Freight</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={freightCost || ""}
                  onChange={e => {
                    const raw = Number(e.target.value);
                    onFreightCostChange(Math.max(0, raw));
                  }}
                  className="w-20 rounded-md px-2 py-1 text-xs text-right focus:outline-none"
                  style={smallInputStyle}
                />
                <button
                  type="button"
                  onClick={handleFreightModeToggle}
                  className="text-[11px] font-bold rounded px-1.5 py-0.5 min-w-[24px] transition-colors"
                  style={toggleBtnStyle}
                  title={freightMode === "dollar" ? "Switch to percentage of subtotal" : "Switch to fixed dollar amount"}
                >
                  {freightMode === "dollar" ? "$" : "%"}
                </button>
                <span className="text-sm w-20 text-right" style={{ color: c.secondary }}>
                  {freight > 0 ? formatCurrency(freight) : "—"}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-sm flex-1" style={{ color: c.secondary }}>Tax</span>
              {onTaxExemptChange && (
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={e => onTaxExemptChange(e.target.checked)}
                    className="w-3 h-3 rounded"
                  />
                  <span className="text-[10px] font-semibold" style={{ color: c.taxExempt }}>Tax Exempt</span>
                </label>
              )}
              {taxExempt ? (
                <>
                  <span className="text-sm w-20 text-right" style={{ color: c.taxMuted }}>—</span>
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
                      style={smallInputStyle}
                    />
                    <span className="text-xs font-semibold" style={{ color: c.pct }}>%</span>
                  </div>
                  <span className="text-sm w-20 text-right" style={{ color: c.secondary }}>
                    {taxTotal > 0 ? formatCurrency(taxTotal) : "—"}
                  </span>
                </>
              )}
            </div>

            <div
              className="flex justify-between font-bold pt-2 mt-1"
              style={{ borderTop: `1px solid ${c.totalLine}`, color: c.primary }}
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
            const expectedRevenue = Math.max(0, grossRevenue - orderDiscountAmount);
            const grossProfit = expectedRevenue - purchaseCost;
            const margin = expectedRevenue > 0 ? (grossProfit / expectedRevenue) * 100 : 0;
            const isPositive = grossProfit >= 0;
            return (
              <div
                className="rounded-xl px-4 py-3 mt-1"
                style={{
                  border: `1px solid ${isPositive ? "rgba(52,211,153,0.30)" : "rgba(248,113,113,0.30)"}`,
                  background: isPositive ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: c.profitLbl }}>Profit Estimate</p>
                <div className="flex items-center justify-between mb-2.5 gap-3">
                  <span className="text-xs" style={{ color: c.secondary }}>Cost Source</span>
                  <select
                    value={profitCostMode}
                    onChange={e => onProfitCostModeChange?.(e.target.value as "auto" | "manual")}
                    className="rounded-md px-2 py-1 text-xs"
                    style={smallInputStyle}
                  >
                    <option value="auto">Auto (product cost)</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                {profitCostMode === "manual" && (
                  <div className="flex items-center justify-between mb-2.5 gap-3">
                    <span className="text-xs" style={{ color: c.secondary }}>Manual Purchase Cost</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualPurchaseCost || ""}
                      onChange={e => onManualPurchaseCostChange?.(Number(e.target.value))}
                      className="w-28 rounded-md px-2 py-1 text-xs text-right focus:outline-none"
                      style={smallInputStyle}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between" style={{ color: c.secondary }}>
                    <span>Purchase Cost</span>
                    <span className="font-medium" style={{ color: c.profitVal }}>{formatCurrency(purchaseCost)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: c.secondary }}>
                    <span>Expected Revenue</span>
                    <span className="font-medium" style={{ color: c.profitVal }}>{formatCurrency(expectedRevenue)}</span>
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
