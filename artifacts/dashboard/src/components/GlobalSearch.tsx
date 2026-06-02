import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import {
  Search, X, Users, Store, FileText, ShoppingCart, Receipt,
  TrendingUp, Package, Truck, ArrowLeftRight, Link2,
  CheckCircle2, Clock, Circle, ChevronRight, Tag,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useListCustomers, useListVendors, useListInvoices,
  useListQuotes, useListPurchaseOrders, useListBills,
  useListSalesLeads, useListShipments,
} from "@workspace/api-client-react";
import { useListAuctions } from "@/lib/auctions-api";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  forezDocFallbackNumber,
  formatInvoiceNumber,
  formatQuoteNumber,
} from "@/lib/forez-document-numbers";

function match(term: string, ...fields: (string | number | undefined | null)[]): boolean {
  const t = term.toLowerCase().trim();
  if (!t || t.length < 2) return false;
  return fields.some(f => {
    if (f == null) return false;
    return String(f).toLowerCase().includes(t);
  });
}

function invFallback(id: number) { return forezDocFallbackNumber("invoice", id).toLowerCase(); }
function quoteFallback(id: number) { return forezDocFallbackNumber("quote", id).toLowerCase(); }

interface JourneyDoc {
  id: number;
  label: string;
  sub: string;
  status: string;
  amount?: number;
  href: string;
  Icon: React.ElementType;
  color: string;
  dim?: boolean;
}

interface Journey {
  customerName: string;
  docs: JourneyDoc[];
}

interface FlatResult {
  id: number;
  label: string;
  sub: string;
  type: string;
  href: string;
  Icon: React.ElementType;
  color: string;
}

const staleOpts = { query: { staleTime: 30000, refetchOnWindowFocus: false } } as const;

const STATUS_MAP: Record<string, string> = {
  paid:       "text-emerald-700 bg-emerald-50 border-emerald-200",
  accepted:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  approved:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  delivered:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  completed:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  refunded:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  sent:       "text-blue-700 bg-blue-50 border-blue-200",
  shipped:    "text-indigo-700 bg-indigo-50 border-indigo-200",
  received:   "text-purple-700 bg-purple-50 border-purple-200",
  invoiced:   "text-purple-700 bg-purple-50 border-purple-200",
  draft:      "text-slate-500 bg-slate-50 border-slate-200",
  pending:    "text-amber-700 bg-amber-50 border-amber-200",
  overdue:    "text-red-700 bg-red-50 border-red-200",
  rejected:   "text-red-700 bg-red-50 border-red-200",
  declined:   "text-red-700 bg-red-50 border-red-200",
  cancelled:  "text-slate-400 bg-slate-50 border-slate-200",
};

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounce(query, 220);

  const { data: customers = [] }      = useListCustomers(staleOpts);
  const { data: vendors = [] }        = useListVendors(staleOpts);
  const { data: invoices = [] }       = useListInvoices(staleOpts);
  const { data: quotes = [] }         = useListQuotes(staleOpts);
  const { data: purchaseOrders = [] } = useListPurchaseOrders(staleOpts);
  const { data: bills = [] }          = useListBills(staleOpts);
  const { data: salesLeads = [] }     = useListSalesLeads(staleOpts);
  const { data: shipments = [] }      = useListShipments(staleOpts);
  const { data: auctionList = [] }    = useListAuctions();
  const { data: returnsRefunds = [] } = useQuery<any[]>({
    queryKey: ["returns-refunds"],
    queryFn: () => fetch("/api/returns-refunds").then(r => r.json()),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // ── Journey lookup ────────────────────────────────────────────────────────
  const journeys = useMemo((): Journey[] => {
    const t = debounced.trim().toLowerCase();
    if (t.length < 2) return [];

    const foundInvIds = new Set<number>();
    const addInv = (inv: any) => { if (inv?.id) foundInvIds.add(inv.id); };
    const findInv = (id: number) => (invoices as any[]).find((i: any) => i.id === id);

    // Match invoices directly
    for (const inv of invoices as any[]) {
      if (match(t,
        inv.id, String(inv.id).padStart(4, "0"),
        inv.invoiceNumber, invFallback(inv.id), `frzi-${inv.id}`,
        inv.trackingNumber, inv.customerName, inv.notes, inv.status, inv.paymentMethod,
      )) addInv(inv);
    }
    // Match via quotes → invoice
    for (const q of quotes as any[]) {
      if (match(t,
        q.id, String(q.id).padStart(4, "0"),
        q.quoteNumber, quoteFallback(q.id), `frzq-${q.id}`,
        q.trackingNumber, q.customerName, q.notes, q.status,
      )) addInv((invoices as any[]).find((i: any) => i.quoteId === q.id));
    }
    // Match via auction → invoice
    for (const a of auctionList as any[]) {
      if (match(t,
        a.id, String(a.id).padStart(4, "0"),
        `auction-${a.id}`, a.projectName, a.title, a.status,
        a.buyerName, a.sellerName, a.notes, a.lotNumber,
      ) && a.invoiceId) addInv(findInv(a.invoiceId));
    }
    // Match via PO → invoice
    for (const po of purchaseOrders as any[]) {
      if (match(t,
        po.id, String(po.id).padStart(4, "0"),
        `frzpo-${String(po.id).padStart(4, "0")}`, po.poNumber,
        po.vendorName, po.notes, po.status,
      ) && po.sourceInvoiceId) addInv(findInv(po.sourceInvoiceId));
    }
    // Match via shipment → invoice
    for (const s of shipments as any[]) {
      if (match(t,
        s.id, String(s.id).padStart(4, "0"),
        `ship-${String(s.id).padStart(4, "0")}`,
        s.trackingNumber, s.carrier, s.customerName, s.notes, s.status,
      ) && s.invoiceId) addInv(findInv(s.invoiceId));
    }
    // Match via bill → PO → invoice
    for (const b of bills as any[]) {
      if (match(t,
        b.id, String(b.id).padStart(4, "0"),
        `bill-${String(b.id).padStart(4, "0")}`,
        b.vendorName, b.notes, b.status,
      )) {
        for (const po of (purchaseOrders as any[]).filter((p: any) => p.billId === b.id)) {
          if (po.sourceInvoiceId) addInv(findInv(po.sourceInvoiceId));
        }
      }
    }
    // Match via return → invoice
    for (const r of returnsRefunds as any[]) {
      if (match(t,
        r.id, String(r.id).padStart(4, "0"),
        `#${String(r.id).padStart(4, "0")}`,
        r.customerName, r.invoiceNumber, r.reason, r.notes, r.type, r.status, r.refundMethod,
      ) && r.invoiceId) addInv(findInv(r.invoiceId));
    }

    return Array.from(foundInvIds).map(invId => {
      const inv = findInv(invId);
      if (!inv) return null;
      const quote = inv.quoteId ? (quotes as any[]).find((q: any) => q.id === inv.quoteId) : null;
      const auctions = (auctionList as any[]).filter((a: any) => a.invoiceId === invId);
      const pos   = (purchaseOrders as any[]).filter((p: any) => p.sourceInvoiceId === invId);
      const invBills = (bills as any[]).filter((b: any) =>
        pos.some((p: any) => p.billId === b.id)
      );
      const ships   = (shipments as any[]).filter((s: any) => s.invoiceId === invId);
      const returns = (returnsRefunds as any[]).filter((r: any) => r.invoiceId === invId);

      const docs: JourneyDoc[] = [];

      // Auctions first (sale source)
      for (const a of auctions) docs.push({
        id: a.id,
        label: a.projectName ?? a.title ?? `Auction #${a.id}`,
        sub: [a.lotNumber ? `Lot ${a.lotNumber}` : null, a.buyerName ?? null].filter(Boolean).join(" · "),
        status: a.status ?? "draft",
        amount: a.finalPrice != null ? Number(a.finalPrice) : a.reservePrice != null ? Number(a.reservePrice) : undefined,
        href: "/auctions",
        Icon: Tag,
        color: "text-amber-600 bg-amber-50",
      });

      if (quote) docs.push({
        id: quote.id,
        label: formatQuoteNumber(quote.id, quote.quoteNumber),
        sub: `Created ${formatDate(quote.createdAt)}`,
        status: quote.status,
        amount: Number(quote.total),
        href: "/quotes",
        Icon: FileText,
        color: "text-emerald-600 bg-emerald-50",
      });

      docs.push({
        id: inv.id,
        label: formatInvoiceNumber(inv.id, inv.invoiceNumber),
        sub: inv.dueDate ? `Due ${formatDate(inv.dueDate)}` : `Created ${formatDate(inv.createdAt)}`,
        status: inv.status,
        amount: Number(inv.total),
        href: "/invoices",
        Icon: Receipt,
        color: "text-blue-600 bg-blue-50",
      });

      for (const po of pos) docs.push({
        id: po.id,
        label: po.poNumber ?? `FRZPO-${String(po.id).padStart(4, "0")}`,
        sub: po.vendorName ?? "",
        status: po.status,
        amount: Number(po.total),
        href: "/purchase-orders",
        Icon: ShoppingCart,
        color: "text-orange-600 bg-orange-50",
      });

      for (const b of invBills) docs.push({
        id: b.id,
        label: `BILL-${String(b.id).padStart(4, "0")}`,
        sub: b.vendorName ?? (b.dueDate ? `Due ${formatDate(b.dueDate)}` : ""),
        status: b.status,
        amount: b.amount ? Number(b.amount) : undefined,
        href: "/bills",
        Icon: TrendingUp,
        color: "text-rose-600 bg-rose-50",
      });

      if (ships.length === 0) {
        docs.push({
          id: 0,
          label: "Shipment not yet created",
          sub: "No shipment linked to this invoice",
          status: "pending",
          href: "/shipments",
          Icon: Truck,
          color: "text-slate-400 bg-slate-50",
          dim: true,
        });
      } else {
        for (const s of ships) docs.push({
          id: s.id,
          label: `SHIP-${String(s.id).padStart(4, "0")}`,
          sub: s.trackingNumber ? `${s.carrier ? s.carrier + " · " : ""}${s.trackingNumber}` : (s.carrier ?? ""),
          status: s.status,
          href: "/shipments",
          Icon: Truck,
          color: "text-indigo-600 bg-indigo-50",
        });
      }

      for (const r of returns) docs.push({
        id: r.id,
        label: `${r.type === "refund" ? "Refund" : r.type === "return_refund" ? "Return & Refund" : "Return"} #${String(r.id).padStart(4, "0")}`,
        sub: r.reason ?? "",
        status: r.status,
        amount: r.refundAmount ? Number(r.refundAmount) : undefined,
        href: "/returns-refunds",
        Icon: ArrowLeftRight,
        color: "text-pink-600 bg-pink-50",
      });

      return { customerName: inv.customerName ?? "", docs };
    }).filter(Boolean) as Journey[];
  }, [debounced, invoices, quotes, purchaseOrders, bills, shipments, returnsRefunds, auctionList]);

  // ── Flat results (contacts + standalone auction results) ──────────────────
  const flatResults = useMemo((): FlatResult[] => {
    const t = debounced.trim().toLowerCase();
    if (t.length < 2) return [];
    const out: FlatResult[] = [];

    (customers as any[]).forEach(r => {
      if (match(t, r.id, r.name, r.company, r.email, r.phone))
        out.push({ id: r.id, label: r.company || r.name || `Customer #${r.id}`, sub: r.company ? r.name || r.email || "" : r.email || "", type: "Customer", href: "/customers", Icon: Users, color: "text-sky-600 bg-sky-50" });
    });
    (vendors as any[]).forEach(r => {
      if (match(t, r.id, r.name, r.company, r.email, r.phone))
        out.push({ id: r.id, label: r.company || r.name || `Vendor #${r.id}`, sub: r.company ? r.name || r.email || "" : r.email || "", type: "Vendor", href: "/vendors", Icon: Store, color: "text-violet-600 bg-violet-50" });
    });
    (salesLeads as any[]).forEach(r => {
      if (match(t, r.id, r.name, r.company, r.email, r.phone))
        out.push({ id: r.id, label: r.name || r.company || `Lead #${r.id}`, sub: r.email || r.company || "", type: "Sales Lead", href: "/sales-leads", Icon: Package, color: "text-amber-600 bg-amber-50" });
    });
    // Auctions with no invoiceId appear as flat results
    (auctionList as any[]).forEach(r => {
      if (!r.invoiceId && match(t, r.id, r.projectName, r.title, r.status, r.buyerName, r.sellerName, r.lotNumber))
        out.push({ id: r.id, label: r.projectName ?? r.title ?? `Auction #${r.id}`, sub: r.status ?? "", type: "Auction", href: "/auctions", Icon: Tag, color: "text-amber-600 bg-amber-50" });
    });

    return out.slice(0, 20);
  }, [debounced, customers, vendors, salesLeads, auctionList]);

  const hasResults = journeys.length > 0 || flatResults.length > 0;

  useEffect(() => {
    const shouldOpen = focused && debounced.trim().length >= 2;
    setOpen(shouldOpen);
    if (shouldOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - Math.max(rect.width, 420)),
        width: Math.max(rect.width, 420),
      });
    }
  }, [focused, debounced]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const portal = document.getElementById("gs-portal");
        if (portal && portal.contains(e.target as Node)) return;
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleNav(href: string) {
    navigate(href);
    setQuery("");
    setOpen(false);
    setFocused(false);
  }

  function handleClear() {
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function StatusBadge({ status }: { status: string }) {
    return (
      <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize flex-shrink-0 ${STATUS_MAP[status] ?? STATUS_MAP.draft}`}>
        {status}
      </span>
    );
  }

  const done = (s: string) => ["paid","accepted","approved","received","delivered","shipped","completed","refunded"].includes(s);

  const dropdown = open ? (
    <div
      id="gs-portal"
      style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
      className="fixed z-[99999] bg-white border border-slate-200/80 rounded-2xl shadow-2xl overflow-hidden max-h-[520px] overflow-y-auto"
    >
      {!hasResults ? (
        <div className="px-4 py-8 text-center text-slate-400 text-[13px]">
          No results for "<span className="font-semibold text-slate-600">{debounced}</span>"
        </div>
      ) : (
        <div>
          {/* ── Journey chains ─────────────────────────────── */}
          {journeys.map((j, ji) => (
            <div key={ji} className="border-b border-slate-100 last:border-0">
              {/* Journey header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50/70 border-b border-indigo-100">
                <Link2 size={12} className="text-indigo-500 flex-shrink-0" />
                <span className="text-indigo-700 text-[11px] font-bold uppercase tracking-wider">Order Journey</span>
                <span className="text-indigo-500 text-[11px] font-medium truncate">· {j.customerName}</span>
              </div>

              {/* Journey steps */}
              <div className="px-4 py-2">
                {j.docs.map((doc, di) => {
                  const isDone = done(doc.status);
                  const isLast = di === j.docs.length - 1;
                  return (
                    <div key={`${doc.href}-${doc.id}-${di}`} className="flex gap-2.5">
                      {/* Timeline spine */}
                      <div className="flex flex-col items-center w-5 flex-shrink-0 pt-1">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
                          doc.dim ? "bg-slate-200" : isDone ? "bg-emerald-500" : "bg-indigo-400"
                        }`}>
                          {doc.dim ? <Circle size={8} className="text-slate-400" /> : isDone ? <CheckCircle2 size={9} /> : <Clock size={8} />}
                        </div>
                        {!isLast && <div className="w-px flex-1 min-h-[14px] bg-slate-150 my-0.5" style={{ background: "#e2e8f0" }} />}
                      </div>

                      {/* Step content — clickable */}
                      <button
                        type="button"
                        onClick={() => !doc.dim && handleNav(doc.href)}
                        disabled={doc.dim}
                        className={`flex-1 flex items-center gap-2 pb-2.5 text-left min-w-0 group/step ${doc.dim ? "cursor-default opacity-50" : "hover:opacity-80 transition-opacity"}`}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${doc.color}`}>
                          <doc.Icon size={10} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[12px] font-semibold truncate ${doc.dim ? "text-slate-400" : "text-slate-700 group-hover/step:text-indigo-600"}`}>
                            {doc.label}
                          </div>
                          {doc.sub && (
                            <div className="text-[10.5px] text-slate-400 truncate">{doc.sub}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <StatusBadge status={doc.status} />
                          {doc.amount != null && (
                            <span className="text-[11px] font-semibold text-slate-700 min-w-[52px] text-right">
                              {formatCurrency(doc.amount)}
                            </span>
                          )}
                          {!doc.dim && <ChevronRight size={10} className="text-slate-300 group-hover/step:text-indigo-400" />}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Flat contacts / leads ───────────────────────── */}
          {flatResults.length > 0 && (
            <div className={journeys.length > 0 ? "border-t border-slate-100" : ""}>
              <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                Contacts & Leads
              </div>
              {flatResults.map(item => (
                <button
                  type="button"
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleNav(item.href)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left group"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <item.Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-slate-800 truncate group-hover:text-blue-700">
                      {item.label}
                    </div>
                    {item.sub && (
                      <div className="text-[11px] text-slate-400 truncate">{item.sub}</div>
                    )}
                  </div>
                  <div className="text-[10px] font-medium text-slate-300 group-hover:text-blue-400 flex-shrink-0">
                    {item.type}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/80 text-[10.5px] text-slate-400 text-center sticky bottom-0">
            {journeys.length > 0
              ? `${journeys.length} order journey${journeys.length > 1 ? "s" : ""} found${flatResults.length > 0 ? ` · ${flatResults.length} contact${flatResults.length > 1 ? "s" : ""}` : ""}`
              : `${flatResults.length} result${flatResults.length !== 1 ? "s" : ""}`
            }
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className={`relative flex items-center transition-all duration-150 ${focused ? "ring-2 ring-blue-200" : ""} rounded-xl`}>
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
          onFocus={() => setFocused(true)}
          placeholder="Search by invoice, PO, tracking, vendor…"
          className="w-full pl-8 pr-8 py-2 text-[12.5px] rounded-xl border border-[#c8def4] bg-white/90 text-slate-700 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
        />
        {query && (
          <button type="button" onClick={handleClear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={12} />
          </button>
        )}
      </div>

      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
