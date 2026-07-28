import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import {
  useListProducts,
  useListCustomers,
  useListTaxRates,
  useCreateInvoice,
  useCreateCustomer,
  getListInvoicesQueryKey,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  User, CreditCard, Banknote, Building2, FileCheck2, Tag,
  X, Package, Zap, Receipt, AlertCircle, Percent, StickyNote,
  UserPlus, ChevronDown, Truck, Printer, Download, MapPin, CalendarClock,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { US_STATES } from "@/lib/usStates";

type PaymentMethod = "cash" | "card" | "bank_transfer" | "check" | "net_terms";
interface NetTerm { id: string; label: string; days?: number; }
type CartItem = {
  productId?: number;
  description: string;
  unitPrice: number;
  quantity: number;
  taxPercent: number;
  discountPercent: number;
  sku?: string;
};

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ComponentType<any>; color: string }[] = [
  { value: "cash",          label: "Cash",          icon: Banknote,   color: "emerald" },
  { value: "card",          label: "Credit Card",   icon: CreditCard, color: "blue"    },
  { value: "bank_transfer", label: "Bank Transfer", icon: Building2,  color: "indigo"  },
  { value: "check",         label: "Check",         icon: FileCheck2, color: "amber"   },
  { value: "net_terms",     label: "Net Terms",     icon: CalendarClock, color: "violet" },
];

type OrderDiscountWalkin = { type: "percent" | "fixed"; value: number };

function calcTotals(
  items: CartItem[],
  orderDiscount: OrderDiscountWalkin | null = null,
  freight = 0,
  taxExempt = false
) {
  let itemSubtotal = 0, taxTotal = 0, itemDiscTotal = 0;
  for (const li of items) {
    const gross = li.quantity * li.unitPrice;
    const disc  = gross * (li.discountPercent / 100);
    const after = gross - disc;
    const tax   = taxExempt ? 0 : after * (li.taxPercent / 100);
    itemDiscTotal += disc;
    itemSubtotal  += after;
    taxTotal      += tax;
  }
  const beforeDiscount = itemSubtotal + taxTotal + freight;
  let orderDiscAmt = 0;
  if (orderDiscount && orderDiscount.value > 0) {
    orderDiscAmt = orderDiscount.type === "percent"
      ? beforeDiscount * (orderDiscount.value / 100)
      : Math.min(orderDiscount.value, beforeDiscount);
  }
  const total = beforeDiscount - orderDiscAmt;
  return { subtotal: itemSubtotal, taxTotal, itemDiscTotal, orderDiscAmt, freight, beforeDiscount, total };
}

export default function WalkIn() {
  const { data: products }  = useListProducts();
  const { data: customers } = useListCustomers();
  const { data: taxRates }  = useListTaxRates();
  const createInvoice       = useCreateInvoice();
  const createCustomer      = useCreateCustomer();
  const queryClient         = useQueryClient();

  const defaultTaxPct = useMemo(() => {
    if (!taxRates || (taxRates as any[]).length === 0) return 0;
    return Number((taxRates as any[])[0]?.rate ?? 0);
  }, [taxRates]);

  const [search,         setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [payMethod,      setPayMethod]      = useState<PaymentMethod>("cash");
  const [netTermsList,   setNetTermsList]   = useState<NetTerm[]>([]);
  useEffect(() => {
    fetch("/api/app-settings/net_terms")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) try { setNetTermsList(JSON.parse(d.value)); } catch {} });
  }, []);
  const [selectedCustId, setSelectedCustId] = useState<number | null>(null);
  const [custSearch,     setCustSearch]     = useState("");
  const [custOpen,       setCustOpen]       = useState(false);
  const [internalNote,   setInternalNote]   = useState("");
  const [success, setSuccess] = useState<{
    invoiceId: number;
    total: number;
    customerName: string;
    payMethod: PaymentMethod;
    items: CartItem[];
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    orderDiscAmt: number;
    freight: number;
    paidAt: string;
    internalNote: string;
    dueDate?: string; // set when payMethod === "net_terms"
    netTermLabel?: string;
  } | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [orderDiscount,  setOrderDiscount]  = useState<OrderDiscountWalkin | null>(null);
  const [freight,        setFreight]        = useState(0);
  const [showFreight,    setShowFreight]    = useState(false);
  const [taxExempt,      setTaxExempt]      = useState(false);

  /* New Customer inline form */
  const [showNewCust,    setShowNewCust]    = useState(false);
  const [newCustName,    setNewCustName]    = useState("");
  const [newCustCompany, setNewCustCompany] = useState("");
  const [newCustEmail,   setNewCustEmail]   = useState("");
  const [newCustPhone,   setNewCustPhone]   = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustCity,    setNewCustCity]    = useState("");
  const [newCustState,   setNewCustState]   = useState("");
  const [newCustZip,     setNewCustZip]     = useState("");
  const [savingCust,     setSavingCust]     = useState(false);
  const [custError,      setCustError]      = useState<string | null>(null);

  const custRef       = useRef<HTMLDivElement>(null);
  const [custDropRect, setCustDropRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (custOpen && custRef.current) {
      setCustDropRect(custRef.current.getBoundingClientRect());
    } else {
      setCustDropRect(null);
    }
  }, [custOpen]);

  const productList  = (products  ?? []) as any[];
  const customerList = (customers ?? []) as any[];

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of productList) if (p.category) cats.add(p.category);
    return ["all", ...Array.from(cats).sort()];
  }, [productList]);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return productList.filter(p => {
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      const matchS   = !s || [p.name, p.sku, p.category, p.description]
        .some(v => String(v ?? "").toLowerCase().includes(s));
      return matchCat && matchS && p.status !== "discontinued";
    });
  }, [productList, search, categoryFilter]);

  const filteredCustomers = useMemo(() => {
    const s = custSearch.trim().toLowerCase();
    return customerList.filter(c =>
      !s || [c.name, c.company, c.email].some((v: any) => String(v ?? "").toLowerCase().includes(s))
    ).slice(0, 8);
  }, [customerList, custSearch]);

  const selectedCustomer = useMemo(
    () => customerList.find(c => c.id === selectedCustId) ?? null,
    [customerList, selectedCustId]
  );

  function addToCart(product: any) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        productId:       product.id,
        description:     product.name,
        unitPrice:       Number(product.salePrice ?? product.costPrice ?? 0),
        quantity:        1,
        taxPercent:      defaultTaxPct,
        discountPercent: 0,
        sku:             product.sku,
      }];
    });
  }

  function updateCartQty(idx: number, qty: number) {
    if (qty <= 0) { removeFromCart(idx); return; }
    setCart(prev => prev.map((it, i) => i === idx ? { ...it, quantity: qty } : it));
  }

  function updateCartPrice(idx: number, price: number) {
    setCart(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: price } : it));
  }

  function updateCartDisc(idx: number, disc: number) {
    setCart(prev => prev.map((it, i) => i === idx ? { ...it, discountPercent: Math.min(100, Math.max(0, disc)) } : it));
  }

  function removeFromCart(idx: number) {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }

  // Compute net-terms due date for UI preview
  const netTermsDueDate = useMemo(() => {
    if (payMethod !== "net_terms") return null;
    const term = netTermsList.find(t => t.id === selectedCustomer?.accountType);
    const days = term?.days ?? 30;
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  }, [payMethod, netTermsList, selectedCustomer]);

  const netTermLabel = useMemo(() => {
    if (payMethod !== "net_terms") return null;
    const term = netTermsList.find(t => t.id === selectedCustomer?.accountType);
    return term?.label ?? (selectedCustomer ? null : null);
  }, [payMethod, netTermsList, selectedCustomer]);

  function clearSale() {
    setCart([]);
    setSelectedCustId(null);
    setCustSearch("");
    setInternalNote("");
    setPayMethod("cash");
    setError(null);
    setOrderDiscount(null);
    setFreight(0);
    setShowFreight(false);
    setTaxExempt(false);
    setShowNewCust(false);
    setNewCustName(""); setNewCustCompany(""); setNewCustEmail(""); setNewCustPhone("");
    setNewCustAddress(""); setNewCustCity(""); setNewCustState(""); setNewCustZip("");
    setCustError(null);
  }

  async function saveNewCustomer() {
    if (!newCustName.trim()) { setCustError("Name is required."); return; }
    setSavingCust(true); setCustError(null);
    try {
      const result: any = await createCustomer.mutateAsync({
        data: {
          name:            newCustName.trim(),
          company:         newCustCompany.trim() || null,
          email:           newCustEmail.trim()   || null,
          phone:           newCustPhone.trim()   || null,
          customerAddress: newCustAddress.trim() || null,
          customerCity:    newCustCity.trim()    || null,
          customerState:   newCustState.trim()   || null,
          customerZip:     newCustZip.trim()     || null,
        } as any,
      });
      await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setSelectedCustId(result?.id ?? null);
      setShowNewCust(false);
      setNewCustName(""); setNewCustCompany(""); setNewCustEmail(""); setNewCustPhone("");
      setNewCustAddress(""); setNewCustCity(""); setNewCustState(""); setNewCustZip("");
    } catch (e: any) {
      setCustError(e?.message ?? "Could not create customer.");
    } finally {
      setSavingCust(false);
    }
  }

  const { subtotal, taxTotal, itemDiscTotal, orderDiscAmt, freight: freightCalc, beforeDiscount, total } = calcTotals(cart, orderDiscount, showFreight ? freight : 0, taxExempt);

  const customerName =
    selectedCustomer
      ? (selectedCustomer.company || selectedCustomer.name)
      : "Walk-in Customer";

  const customerId = selectedCustId ?? null;

  function buildReceiptHTML(data: NonNullable<typeof success>) {
    const methodLabel: Record<PaymentMethod, string> = {
      cash: "Cash", card: "Credit Card", bank_transfer: "Bank Transfer", check: "Check", net_terms: "Net Terms",
    };
    const rows = data.items.map(li => {
      const gross = li.quantity * li.unitPrice;
      const afterDisc = gross * (1 - li.discountPercent / 100);
      const lineTotal = afterDisc * (1 + li.taxPercent / 100);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${li.description}${li.sku ? `<br><span style="color:#94a3b8;font-size:11px">${li.sku}</span>` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center">${li.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right">$${li.unitPrice.toFixed(2)}</td>
        ${li.discountPercent > 0 ? `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#ef4444">-${li.discountPercent}%</td>` : `<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#cbd5e1">—</td>`}
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">$${lineTotal.toFixed(2)}</td>
      </tr>`;
    }).join("");
    const paidDate = new Date(data.paidAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const isNetTerms = data.payMethod === "net_terms";
    const dueDateStr = data.dueDate ? new Date(data.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" }) : "";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>${isNetTerms ? "Invoice" : "Receipt"} #${data.invoiceId}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;padding:32px;max-width:600px;margin:0 auto}
        h1{font-size:20px;font-weight:900;margin-bottom:2px}
        .sub{color:#64748b;font-size:12px;margin-bottom:24px}
        .badge{display:inline-block;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;margin-bottom:20px}
        .badge-paid{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
        .badge-terms{background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        th{background:#f8fafc;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border-bottom:2px solid #e2e8f0}
        th:last-child,th:nth-child(3),th:nth-child(4){text-align:right}
        .total-row{display:flex;justify-content:space-between;padding:4px 0;color:#475569;font-size:13px}
        .grand-total{display:flex;justify-content:space-between;padding:10px 0 0;border-top:2px solid #1e293b;font-size:18px;font-weight:900;color:#1e293b}
        .footer{margin-top:28px;text-align:center;color:#94a3b8;font-size:11px;border-top:1px solid #f1f5f9;padding-top:16px}
        @media print{body{padding:16px}}
      </style>
    </head><body>
      <h1>Forez Corp</h1>
      <div class="sub">${isNetTerms ? "Walk-in Invoice" : "Walk-in Sale Receipt"} · Invoice #${data.invoiceId}</div>
      <div class="badge ${isNetTerms ? "badge-terms" : "badge-paid"}">${isNetTerms ? `📅 Net Terms${data.netTermLabel ? " — " + data.netTermLabel : ""}${dueDateStr ? " · Due " + dueDateStr : ""}` : `✓ Paid — ${methodLabel[data.payMethod]}`}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <div><strong>Customer</strong><br><span style="color:#475569">${data.customerName}</span></div>
        <div style="text-align:right"><strong>${isNetTerms ? "Invoice Date" : "Date"}</strong><br><span style="color:#475569">${paidDate}</span>${isNetTerms && dueDateStr ? `<br><strong>Due</strong><br><span style="color:#7c3aed">${dueDateStr}</span>` : ""}</div>
      </div>
      <table>
        <thead><tr>
          <th>Item</th><th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th><th style="text-align:right">Disc</th><th style="text-align:right">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end"><div style="min-width:220px">
        <div class="total-row"><span>Subtotal</span><span>$${data.subtotal.toFixed(2)}</span></div>
        ${data.discountTotal > 0 ? `<div class="total-row"><span>Item Discounts</span><span style="color:#ef4444">−$${data.discountTotal.toFixed(2)}</span></div>` : ""}
        ${data.taxTotal > 0 ? `<div class="total-row"><span>Tax</span><span>$${data.taxTotal.toFixed(2)}</span></div>` : ""}
        ${data.freight > 0 ? `<div class="total-row"><span>Freight / Shipping</span><span>$${data.freight.toFixed(2)}</span></div>` : ""}
        ${data.orderDiscAmt > 0 ? `<div class="total-row"><span>Order Discount</span><span style="color:#16a34a">−$${data.orderDiscAmt.toFixed(2)}</span></div>` : ""}
        <div class="grand-total"><span>${isNetTerms ? "Amount Due" : "Total Paid"}</span><span>$${data.total.toFixed(2)}</span></div>
      </div></div>
      ${data.internalNote ? `<div style="margin-top:16px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e"><strong>Note:</strong> ${data.internalNote}</div>` : ""}
      <div class="footer">Thank you for your business! · Forez Corp</div>
    </body></html>`;
  }

  function printReceipt() {
    if (!success) return;
    const html = buildReceiptHTML(success);
    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  function downloadReceipt() {
    if (!success) return;
    const html = buildReceiptHTML(success);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${success.invoiceId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function completeSale() {
    if (cart.length === 0) { setError("Add at least one item to complete a sale."); return; }
    if (payMethod === "net_terms" && !selectedCustId) {
      setError("Select a customer to use Net Terms — the due date is based on their payment terms.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const cartSnapshot  = [...cart];
      const noteSnapshot  = internalNote.trim();
      const methodSnapshot = payMethod;
      const nameSnapshot  = customerName;
      const freightSnapshot = showFreight ? freight : 0;
      const isNetTerms    = methodSnapshot === "net_terms";

      // Compute net-terms due date
      const termForSale   = isNetTerms ? netTermsList.find(t => t.id === selectedCustomer?.accountType) : undefined;
      const termDays      = termForSale?.days ?? 30;
      const termDueDate   = isNetTerms ? new Date(Date.now() + termDays * 86400000).toISOString().slice(0, 10) : undefined;
      const termLabel     = termForSale?.label;

      let lineItems = cart.map(li => ({
        description:     li.description,
        quantity:        li.quantity,
        unitPrice:       li.unitPrice,
        taxPercent:      taxExempt ? 0 : li.taxPercent,
        discountPercent: li.discountPercent,
      }));
      if (freightCalc > 0)  lineItems = [...lineItems, { description: "Freight / Shipping", quantity: 1, unitPrice: freightCalc,   taxPercent: 0, discountPercent: 0 }];
      if (orderDiscAmt > 0) lineItems = [...lineItems, { description: "Order Discount",      quantity: 1, unitPrice: -orderDiscAmt, taxPercent: 0, discountPercent: 0 }];
      const paidAt = new Date().toISOString();
      const payload: any = {
        customerName,
        customerId:     customerId ?? undefined,
        lineItems,
        subtotal,
        taxTotal,
        discountTotal:  itemDiscTotal,
        total,
        status:         isNetTerms ? "sent" : "paid",
        paymentMethod:  isNetTerms ? "net_terms" : payMethod,
        ...(isNetTerms ? { dueDate: termDueDate, paymentNote: `Net terms: ${termLabel ?? "—"}` } : { paidAt }),
        notes:          noteSnapshot || undefined,
        isQuickInvoice: true,
      };
      const result: any = await createInvoice.mutateAsync({ data: payload });
      await queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["accounting-pnl"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-ar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setSuccess({
        invoiceId:     result?.id ?? 0,
        total,
        customerName:  nameSnapshot,
        payMethod:     methodSnapshot,
        items:         cartSnapshot,
        subtotal,
        taxTotal,
        discountTotal: itemDiscTotal,
        orderDiscAmt,
        freight:       freightSnapshot,
        paidAt,
        internalNote:  noteSnapshot,
        dueDate:       termDueDate,
        netTermLabel:  termLabel,
      });
      clearSale();
    } catch (e: any) {
      setError(e?.message ?? "Failed to complete sale. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-0">
        <Header title="Walk-in Sale" subtitle="Point-of-sale — invoice & billing on the spot" />

        <div className="flex flex-1 min-h-0 gap-4 p-4 overflow-hidden">

          {/* ── LEFT: Product browser ───────────────────────── */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-3">

            {/* Search + category filter */}
            <div className="glass-card p-3 flex items-center gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search products by name, SKU…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 overflow-x-auto">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      categoryFilter === cat
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                    }`}
                  >
                    {cat === "all" ? "All" : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Package size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredProducts.map(product => {
                    const inCart = cart.find(i => i.productId === product.id);
                    const price  = Number(product.salePrice ?? product.costPrice ?? 0);
                    return (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className={`relative text-left rounded-xl border p-3 flex flex-col gap-1.5 transition-all group hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${
                          inCart
                            ? "border-indigo-300 bg-indigo-50/60 shadow-sm"
                            : "border-slate-200 bg-white hover:border-indigo-200"
                        }`}
                      >
                        {inCart && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                            {inCart.quantity}
                          </span>
                        )}
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-blue-50 flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-indigo-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">{product.name}</p>
                          {product.sku && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{product.sku}</p>}
                          {product.category && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 mt-1">
                              <Tag size={8} /> {product.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-auto pt-1 border-t border-slate-100">
                          <span className="text-sm font-black text-indigo-700">{formatCurrency(price)}</span>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] font-black transition-all ${
                            inCart ? "bg-indigo-600" : "bg-slate-200 group-hover:bg-indigo-500"
                          }`}>
                            <Plus size={11} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Order panel ──────────────────────────── */}
          <div className="w-[500px] flex-shrink-0 flex flex-col min-h-0 gap-3 overflow-y-auto">

            {/* ── Cart ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden" style={{ minHeight: 320 }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={14} className="text-indigo-500" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Cart {cart.length > 0 && <span className="text-indigo-600">({cart.length} item{cart.length !== 1 ? "s" : ""})</span>}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button onClick={clearSale} className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
                    Clear All
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <ShoppingCart size={32} className="opacity-20" />
                  <p className="text-sm">Click products on the left to add them</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {cart.map((item, idx) => {
                    const gross     = item.quantity * item.unitPrice;
                    const after     = gross * (1 - item.discountPercent / 100);
                    const lineTotal = after * (1 + item.taxPercent / 100);
                    return (
                      <div key={idx} className="px-4 py-3 flex flex-col gap-2 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{item.description}</p>
                            {item.sku && <p className="text-[11px] text-slate-400 font-mono">{item.sku}</p>}
                          </div>
                          <button onClick={() => removeFromCart(idx)}
                            className="p-1 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                            <button onClick={() => updateCartQty(idx, item.quantity - 1)}
                              className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-100 transition-colors">
                              <Minus size={11} />
                            </button>
                            <input type="number" min="1" value={item.quantity}
                              onChange={e => updateCartQty(idx, parseInt(e.target.value) || 1)}
                              className="w-12 text-center text-sm font-bold text-slate-800 border-x border-slate-200 py-1.5 focus:outline-none bg-white"
                            />
                            <button onClick={() => updateCartQty(idx, item.quantity + 1)}
                              className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-100 transition-colors">
                              <Plus size={11} />
                            </button>
                          </div>
                          <span className="text-xs text-slate-400">×</span>
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                            <input type="number" min="0" step="0.01" value={item.unitPrice}
                              onChange={e => updateCartPrice(idx, parseFloat(e.target.value) || 0)}
                              className="w-full pl-6 pr-2 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-300 bg-white"
                            />
                          </div>
                          <span className="text-sm font-black text-indigo-700 whitespace-nowrap ml-auto min-w-[64px] text-right">
                            {formatCurrency(lineTotal)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Disc %</label>
                          <input type="number" min="0" max="100" step="1" value={item.discountPercent}
                            onChange={e => updateCartDisc(idx, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-amber-300 bg-white"
                          />
                          {item.discountPercent > 0 && (
                            <span className="text-xs text-red-500 font-semibold">−{item.discountPercent}%</span>
                          )}
                          <label className="text-xs text-slate-500 font-medium whitespace-nowrap ml-auto">Tax</label>
                          <span className="text-sm text-slate-600 font-semibold">{item.taxPercent}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Totals + controls */}
              {cart.length > 0 && (
                <div className="border-t border-slate-200 px-4 py-4 bg-slate-50/60 flex flex-col gap-2">

                  {/* Subtotal row */}
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span>
                  </div>

                  {/* Per-item discounts */}
                  {itemDiscTotal > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>Item Discounts</span>
                      <span className="font-semibold">−{formatCurrency(itemDiscTotal)}</span>
                    </div>
                  )}

                  {/* Tax row + Tax Exempt toggle */}
                  <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2">
                    <Percent size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-600 flex-1">Tax</span>
                    {!taxExempt && taxTotal > 0 && (
                      <span className="text-sm font-semibold text-slate-700 mr-1">+{formatCurrency(taxTotal)}</span>
                    )}
                    <button
                      onClick={() => setTaxExempt(v => !v)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                        taxExempt
                          ? "bg-amber-50 border-amber-300 text-amber-700"
                          : "bg-slate-100 border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600"
                      }`}
                    >
                      {taxExempt ? "EXEMPT ✓" : "Tax Exempt"}
                    </button>
                  </div>

                  {/* Freight toggle */}
                  {!showFreight ? (
                    <button
                      onClick={() => setShowFreight(true)}
                      className="self-start flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Truck size={11} /> Add freight / shipping charge
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2">
                      <Truck size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-600 flex-1">Freight / Shipping</span>
                      <span className="text-slate-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={freight || ""}
                        onChange={e => setFreight(Math.max(0, Number(e.target.value)))}
                        className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right focus:outline-none bg-slate-50 text-slate-800 focus:border-blue-300"
                        autoFocus
                      />
                      {freightCalc > 0 && (
                        <span className="text-sm font-semibold text-slate-700 min-w-[60px] text-right">+{formatCurrency(freightCalc)}</span>
                      )}
                      <button
                        onClick={() => { setShowFreight(false); setFreight(0); }}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Pre-discount total line (visible only when discount is being added) */}
                  {orderDiscount && beforeDiscount > 0 && (
                    <div className="flex justify-between text-sm text-slate-500 pt-1 border-t border-slate-200 mt-0.5">
                      <span>Total before discount</span>
                      <span className="font-semibold">{formatCurrency(beforeDiscount)}</span>
                    </div>
                  )}

                  {/* ─── TOTAL line ─────────────────────────────────── */}
                  {!orderDiscount && (
                    <div className="flex justify-between items-center pt-2 border-t-2 border-slate-300 mt-1">
                      <span className="text-base font-black text-slate-800">Total</span>
                      <span className="text-2xl font-black text-indigo-700">{formatCurrency(total)}</span>
                    </div>
                  )}
                  {orderDiscount && (
                    <div className="flex justify-between items-center pt-1 border-t border-dashed border-slate-300 mt-0.5">
                      <span className="text-sm font-bold text-slate-500">Subtotal</span>
                      <span className="text-base font-bold text-slate-600">{formatCurrency(beforeDiscount)}</span>
                    </div>
                  )}

                  {/* Order discount — after-total */}
                  {!orderDiscount ? (
                    <button
                      onClick={() => setOrderDiscount({ type: "percent", value: 0 })}
                      className="self-start flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-green-600 transition-colors"
                    >
                      <Tag size={11} /> Add discount on total
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2">
                      <Tag size={12} className="text-green-600 flex-shrink-0" />
                      <span className="text-sm text-green-700 flex-1 font-medium">Discount on Total</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0"
                        value={orderDiscount.value || ""}
                        onChange={e => setOrderDiscount({ ...orderDiscount, value: Number(e.target.value) })}
                        className="w-20 px-2 py-1 border border-green-200 rounded-lg text-sm text-right focus:outline-none bg-white text-slate-800 focus:border-green-400"
                        autoFocus
                      />
                      <button
                        onClick={() => setOrderDiscount({ ...orderDiscount, type: orderDiscount.type === "percent" ? "fixed" : "percent" })}
                        className="text-xs font-bold bg-green-100 border border-green-200 rounded-lg px-2 py-1 min-w-[28px] text-green-700 hover:bg-green-200 transition-colors"
                      >
                        {orderDiscount.type === "percent" ? "%" : "$"}
                      </button>
                      {orderDiscAmt > 0 && (
                        <span className="text-sm font-semibold text-green-700 min-w-[60px] text-right">−{formatCurrency(orderDiscAmt)}</span>
                      )}
                      <button onClick={() => setOrderDiscount(null)} className="text-slate-300 hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Amount Due (final total when discount applied) */}
                  {orderDiscount && (
                    <div className="flex justify-between items-center pt-2 border-t-2 border-green-300 mt-1">
                      <span className="text-base font-black text-slate-800">Amount Due</span>
                      <span className="text-2xl font-black text-green-700">{formatCurrency(total)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Customer ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex-shrink-0">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-indigo-500" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer</span>
                </div>
                {!showNewCust && (
                  <button
                    onClick={() => { setShowNewCust(true); setCustError(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                  >
                    <UserPlus size={12} />
                    Add New Customer
                  </button>
                )}
                {showNewCust && (
                  <button onClick={() => setShowNewCust(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-semibold transition-colors flex items-center gap-1">
                    <X size={12} /> Cancel
                  </button>
                )}
              </div>

              {/* Existing customer search */}
              {!showNewCust && (
                <div className="relative" ref={custRef}>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={selectedCustomer
                        ? (selectedCustomer.company
                            ? `${selectedCustomer.company} — ${selectedCustomer.name}`
                            : (selectedCustomer.name || "Customer"))
                        : custSearch}
                      onChange={e => { setCustSearch(e.target.value); setSelectedCustId(null); setCustOpen(true); }}
                      onFocus={() => { if (selectedCustId) { setSelectedCustId(null); setCustSearch(""); } setCustOpen(true); }}
                      placeholder="Search existing customers… (leave blank for walk-in)"
                      className="w-full border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 bg-white"
                    />
                    {selectedCustId ? (
                      <button onClick={() => { setSelectedCustId(null); setCustSearch(""); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={14} />
                      </button>
                    ) : (
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    )}
                  </div>

                  {selectedCustomer && (
                    <div className="mt-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black flex-shrink-0">
                        {(selectedCustomer.company || selectedCustomer.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-indigo-800 truncate">
                          {selectedCustomer.company || selectedCustomer.name}
                        </p>
                        {selectedCustomer.company && (
                          <p className="text-xs text-indigo-600 truncate">{selectedCustomer.name}</p>
                        )}
                        {selectedCustomer.email && (
                          <p className="text-xs text-indigo-500 truncate">{selectedCustomer.email}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {!selectedCustomer && (
                    <p className="mt-1.5 text-xs text-slate-400 pl-1">Leave empty to record as a walk-in customer</p>
                  )}

                  {custOpen && !selectedCustId && filteredCustomers.length > 0 && custDropRect && createPortal(
                    <>
                      <div className="fixed inset-0 z-[999]" onClick={() => setCustOpen(false)} />
                      <div
                        className="fixed z-[1000] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
                        style={{ top: custDropRect.bottom + 4, left: custDropRect.left, width: custDropRect.width, maxHeight: 260, overflowY: "auto" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {filteredCustomers.map(c => (
                          <button key={c.id}
                            onMouseDown={() => { setSelectedCustId(c.id); setCustSearch(""); setCustOpen(false); }}
                            className="w-full text-left px-3 py-2.5 flex flex-col hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors">
                            {c.company
                              ? <>
                                  <span className="text-sm font-semibold text-slate-800">{c.company}</span>
                                  <span className="text-xs text-slate-500">{c.name}</span>
                                </>
                              : <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                            }
                            {c.email && <span className="text-xs text-slate-400">{c.email}</span>}
                          </button>
                        ))}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              )}

              {/* Add New Customer inline form */}
              {showNewCust && (
                <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50/50 flex flex-col gap-2.5">
                  <p className="text-xs font-semibold text-indigo-700 mb-0.5">New Customer Details</p>

                  {/* Name + Company */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Full Name <span className="text-red-500">*</span></label>
                      <input
                        value={newCustName}
                        onChange={e => setNewCustName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Company <span className="text-slate-400 font-normal">(optional)</span></label>
                      <input
                        value={newCustCompany}
                        onChange={e => setNewCustCompany(e.target.value)}
                        placeholder="Acme Corp"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Email <span className="text-slate-400 font-normal">(optional)</span></label>
                      <input
                        type="email"
                        value={newCustEmail}
                        onChange={e => setNewCustEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Phone <span className="text-slate-400 font-normal">(optional)</span></label>
                      <input
                        value={newCustPhone}
                        onChange={e => setNewCustPhone(e.target.value)}
                        placeholder="(555) 000-0000"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Address section */}
                  <div className="border-t border-indigo-200/60 pt-2.5 mt-0.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin size={11} className="text-indigo-400" />
                      <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">Address <span className="text-indigo-400 normal-case font-normal tracking-normal">(optional)</span></span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Street Address</label>
                        <input
                          value={newCustAddress}
                          onChange={e => setNewCustAddress(e.target.value)}
                          placeholder="123 Main St"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-xs font-semibold text-slate-600 mb-1 block">City</label>
                          <input
                            value={newCustCity}
                            onChange={e => setNewCustCity(e.target.value)}
                            placeholder="New York"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="text-xs font-semibold text-slate-600 mb-1 block">State</label>
                          <select
                            value={newCustState}
                            onChange={e => setNewCustState(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-300 bg-white"
                          >
                            <option value="">—</option>
                            {US_STATES.map(s => (
                              <option key={s.code} value={s.code}>{s.code}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-1">
                          <label className="text-xs font-semibold text-slate-600 mb-1 block">ZIP</label>
                          <input
                            value={newCustZip}
                            onChange={e => setNewCustZip(e.target.value)}
                            placeholder="10001"
                            maxLength={10}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {custError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{custError}</p>
                  )}
                  <button
                    onClick={saveNewCustomer}
                    disabled={savingCust || !newCustName.trim()}
                    className="w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {savingCust
                      ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                      : <><UserPlus size={13} /> Save &amp; Select Customer</>
                    }
                  </button>
                </div>
              )}
            </div>

            {/* ── Payment method ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={14} className="text-indigo-500" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Payment Method</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map(opt => {
                  const Icon   = opt.icon;
                  const active = payMethod === opt.value;
                  const activeClass =
                    opt.value === "cash"          ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm"
                    : opt.value === "card"        ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
                    : opt.value === "bank_transfer"? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm"
                    : opt.value === "check"       ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm"
                                                  : "bg-violet-50 border-violet-300 text-violet-700 shadow-sm";
                  return (
                    <button key={opt.value} onClick={() => setPayMethod(opt.value)}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition-all ${active ? activeClass : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    >
                      <Icon size={15} className="flex-shrink-0" />
                      <span className="text-sm font-semibold">{opt.label}</span>
                      {active && <CheckCircle2 size={13} className="ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {/* Net Terms due-date preview */}
              {payMethod === "net_terms" && (
                <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-3">
                  <CalendarClock size={15} className="text-violet-500 mt-0.5 flex-shrink-0" />
                  <div>
                    {selectedCustomer ? (
                      netTermLabel ? (
                        <>
                          <p className="text-sm font-semibold text-violet-800">
                            {selectedCustomer.company || selectedCustomer.name} — {netTermLabel}
                          </p>
                          <p className="text-xs text-violet-600 mt-0.5">
                            Invoice will be <span className="font-bold">sent</span> (not paid), due&nbsp;
                            <span className="font-bold">{netTermsDueDate ? new Date(netTermsDueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-amber-700 font-medium">
                          Customer has no payment terms set — a 30-day default will be used.{" "}
                          <span className="text-violet-700 font-semibold">Due {netTermsDueDate ? new Date(netTermsDueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>
                        </p>
                      )
                    ) : (
                      <p className="text-sm text-amber-700 font-medium">Select a customer to use Net Terms.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Internal Note ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2.5">
                <StickyNote size={14} className="text-indigo-500" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Internal Note</span>
                <span className="text-xs text-slate-400 font-normal ml-1">(not shown on invoice)</span>
              </div>
              <textarea
                value={internalNote}
                onChange={e => setInternalNote(e.target.value)}
                placeholder="Add an internal note for this sale — visible only to staff…"
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 bg-white resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Complete sale button */}
            <button
              onClick={completeSale}
              disabled={saving || cart.length === 0}
              className={`w-full py-4 rounded-2xl text-white font-black text-base tracking-wide shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${
                payMethod === "net_terms"
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
              }`}
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
              ) : payMethod === "net_terms" ? (
                <><CalendarClock size={16} /> Create Invoice {cart.length > 0 ? `— ${formatCurrency(total)}` : ""} on Net Terms</>
              ) : (
                <><Zap size={16} /> Charge {cart.length > 0 ? formatCurrency(total) : ""} &amp; Generate Invoice</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success overlay */}
      {success && (() => {
        const isNT = success.payMethod === "net_terms";
        return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6" onClick={() => setSuccess(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className={`relative z-10 bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center ${isNT ? "border border-violet-200" : "border border-emerald-200"}`} onClick={e => e.stopPropagation()}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isNT ? "bg-violet-100" : "bg-emerald-100"}`}>
              {isNT ? <CalendarClock size={32} className="text-violet-500" /> : <CheckCircle2 size={32} className="text-emerald-500" />}
            </div>
            <h2 className="text-xl font-black text-slate-800 mb-1">{isNT ? "Invoice Created!" : "Sale Complete!"}</h2>
            <p className="text-slate-500 text-sm mb-1">
              Invoice #{success.invoiceId > 0 ? success.invoiceId : "—"} created{isNT ? " — sent on Net Terms" : " & marked paid"}
            </p>
            <p className="text-slate-600 text-xs mb-1">{success.customerName}</p>
            {isNT ? (
              <div className="my-4">
                <p className="text-2xl font-black text-violet-700">{formatCurrency(success.total)}</p>
                <div className="mt-2 inline-flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2">
                  <CalendarClock size={14} className="text-violet-500" />
                  <span className="text-sm font-semibold text-violet-700">
                    {success.netTermLabel ?? "Net Terms"} — Due {success.dueDate ? new Date(success.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-3xl font-black text-emerald-600 my-4">{formatCurrency(success.total)}</p>
            )}

            {/* Print / Download row */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={printReceipt}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
              >
                <Printer size={14} className="text-slate-500" /> {isNT ? "Print Invoice" : "Print Receipt"}
              </button>
              <button
                onClick={downloadReceipt}
                className="flex-1 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-sm hover:bg-indigo-100 flex items-center justify-center gap-2 transition-colors"
              >
                <Download size={14} /> Download
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSuccess(null)}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors"
              >
                <Receipt size={14} /> New Sale
              </button>
              <button
                onClick={() => setSuccess(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </Layout>
  );
}
