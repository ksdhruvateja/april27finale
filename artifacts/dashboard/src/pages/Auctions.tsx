import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import {
  useListInvoices,
  useListPurchaseOrders,
  useListBills,
  useListShipments,
  getListInvoicesQueryKey,
  getListPurchaseOrdersQueryKey,
  getListBillsQueryKey,
  getListShipmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, X, Trash2, TrendingUp, TrendingDown, Minus, ShoppingCart, Truck } from "lucide-react";
import {
  useListAuctions,
  useCreateAuction,
  useDeleteAuction,
  useUpdateAuction,
  AUCTIONS_KEY,
  listAuctionsSync,
  type AuctionOrder,
} from "@/lib/auctions-api";
import { formatCurrency, formatDate } from "@/lib/utils";
import InvoiceModal from "@/components/InvoiceModal";
import InvoicePoModal from "@/components/InvoicePoModal";
import ShipmentModal from "@/components/ShipmentModal";
import InvoiceView from "@/components/InvoiceView";


export default function Auctions() {
  const queryClient = useQueryClient();
  const { data: auctionData, isLoading: auctionsLoading } = useListAuctions();
  const { data: invoices } = useListInvoices();
  const { data: purchaseOrders } = useListPurchaseOrders();
  const { data: bills } = useListBills();
  const { data: shipments } = useListShipments();

  const createAuction = useCreateAuction();
  const deleteAuction = useDeleteAuction();
  const updateAuction = useUpdateAuction();

  const items: AuctionOrder[] = auctionData ?? [];
  const [showCreate, setShowCreate] = useState(false);

  // Modal state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [poInvoice, setPoInvoice] = useState<any | null>(null);
  const [poNoteTag, setPoNoteTag] = useState<string>("");
  const [shipmentInvoice, setShipmentInvoice] = useState<any | null>(null);
  const [shipmentNoteTag, setShipmentNoteTag] = useState<string>("");
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [viewPo, setViewPo] = useState<any | null>(null);
  const [viewShipment, setViewShipment] = useState<any | null>(null);

  const [activeCardAuctionId, setActiveCardAuctionId] = useState<number | null>(null);
  const [duplicatePOGuard, setDuplicatePOGuard] = useState<{ inv: any; noteTag: string; auctionId: number | null; existingPOs: any[] } | null>(null);
  const [duplicateShipGuard, setDuplicateShipGuard] = useState<{ inv: any; noteTag: string; auctionId: number | null; existingShips: any[] } | null>(null);
  const [invoiceCreateTag, setInvoiceCreateTag] = useState<string | null>(null);
  const [invoiceCreateAuctionId, setInvoiceCreateAuctionId] = useState<number | null>(null);
  const [invoiceAttachToFormFlow, setInvoiceAttachToFormFlow] = useState(false);
  const [invoiceIdsBeforeCreate, setInvoiceIdsBeforeCreate] = useState<number[]>([]);
  const [billingBusy, setBillingBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [linkedInvoiceIds, setLinkedInvoiceIds] = useState<number[]>([]);

  // One-time migration: move localStorage auctions to DB
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || auctionsLoading || !auctionData) return;
    migratedRef.current = true;
    const localItems = listAuctionsSync();
    if (localItems.length === 0) return;
    if (auctionData.length > 0) {
      localStorage.removeItem("forez.auctions.v1");
      return;
    }
    (async () => {
      for (const a of localItems) {
        try {
          await createAuction.mutateAsync({
            projectName: a.projectName,
            bidAmount: Number(a.bidAmount ?? 0),
            costAmount: Number(a.costAmount ?? 0),
            invoiceId: a.invoiceId ?? null,
            linkedInvoiceIds: (a as any).linkedInvoiceIds ?? [],
            purchaseOrderIds: (a as any).purchaseOrderIds ?? [],
            shipmentIds: (a as any).shipmentIds ?? [],
            billIds: (a as any).billIds ?? [],
            notes: a.notes ?? "",
          });
        } catch (_) { /* skip failed */ }
      }
      localStorage.removeItem("forez.auctions.v1");
    })();
  }, [auctionsLoading, auctionData]);

  const nextAuctionNumber = useMemo(
    () => ((items.length ? Math.max(...items.map((a) => a.id)) : 0) + 1),
    [items],
  );
  const auctionTag = `Auction Order ${nextAuctionNumber}`;

  // After invoice is created, attach it to the correct auction / form
  useEffect(() => {
    if (!invoices?.length) return;
    if (invoiceIdsBeforeCreate.length === 0) return;
    const newlyCreated = (invoices as any[]).find(
      (inv) => !invoiceIdsBeforeCreate.includes(Number(inv.id)),
    );
    if (!newlyCreated) return;
    if (invoiceAttachToFormFlow) {
      setInvoiceId(String(newlyCreated.id));
      setLinkedInvoiceIds((prev) => (prev.includes(Number(newlyCreated.id)) ? prev : [...prev, Number(newlyCreated.id)]));
    }
    setShowInvoiceModal(false);
    setInvoiceIdsBeforeCreate([]);

    const tagToApply = invoiceCreateTag ?? auctionTag;
    fetch(`/api/invoices/${newlyCreated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internalNote: tagToApply }),
    }).catch(() => {});
    if (invoiceCreateAuctionId != null) {
      updateAuction.mutate({
        id: invoiceCreateAuctionId,
        data: {
          linkedInvoiceIds: [
            ...(items.find(a => a.id === invoiceCreateAuctionId)?.linkedInvoiceIds ?? []),
            Number(newlyCreated.id),
          ].filter((v, i, arr) => arr.indexOf(v) === i),
        },
      });
    }
    setInvoiceCreateTag(null);
    setInvoiceCreateAuctionId(null);
    setInvoiceAttachToFormFlow(false);
  }, [invoices, invoiceIdsBeforeCreate]);

  // No tag-based backfill — each auction links only its explicitly created documents.

  const selectedInvoice = useMemo(
    () => (invoices ?? []).find((inv: any) => String(inv.id) === invoiceId) as any | undefined,
    [invoices, invoiceId],
  );
  const effectiveInvoiceIds = useMemo(
    () => Array.from(new Set([...linkedInvoiceIds, ...(invoiceId ? [Number(invoiceId)] : [])])),
    [linkedInvoiceIds, invoiceId],
  );
  const linkedInvoices = useMemo(
    () => (invoices ?? []).filter((inv: any) => effectiveInvoiceIds.includes(Number(inv.id))),
    [invoices, effectiveInvoiceIds],
  );
  const linkedPos = useMemo(
    () => (purchaseOrders ?? []).filter((po: any) => effectiveInvoiceIds.includes(Number(po.sourceInvoiceId ?? 0))),
    [purchaseOrders, effectiveInvoiceIds],
  );
  const linkedShipments = useMemo(
    () => (shipments ?? []).filter((s: any) => effectiveInvoiceIds.includes(Number(s.invoiceId ?? 0))),
    [shipments, effectiveInvoiceIds],
  );
  const linkedPoIds = useMemo(() => new Set(linkedPos.map((po: any) => Number(po.id))), [linkedPos]);
  const linkedBills = useMemo(
    () => (bills ?? []).filter((b: any) =>
      b.sourcePurchaseOrderId != null && linkedPoIds.has(Number(b.sourcePurchaseOrderId))
    ),
    [bills, linkedPoIds],
  );

  useEffect(() => {
    if (!invoiceId) return;
    const inv = (invoices ?? []).find((i: any) => String(i.id) === invoiceId);
    if (!inv) return;
    const invoiceTotal = Number((inv as any).total ?? 0);
    if (invoiceTotal > 0) setBidAmount(String(invoiceTotal));
  }, [invoiceId, invoices]);

  const runningCostEstimate = useMemo(() => {
    const poTotal = linkedPos.reduce((sum: number, po: any) => sum + Number(po.total ?? 0), 0);
    const billTotal = linkedBills.reduce((sum: number, b: any) => sum + Number(b.total ?? 0), 0);
    const shipmentCost = linkedShipments.reduce((sum: number, s: any) => sum + Number(s.shippingCost ?? 0), 0);
    return poTotal + billTotal + shipmentCost;
  }, [linkedPos, linkedBills, linkedShipments]);

  const invoiceLookup = useMemo(() => new Map((invoices ?? []).map((i) => [i.id, i])), [invoices]);

  const resetForm = () => {
    setProjectName(""); setBidAmount(""); setInvoiceId(""); setLinkedInvoiceIds([]); setNotes("");
  };

  const submit = async () => {
    if (!projectName.trim()) { alert("Project name is required."); return; }
    try {
      setSubmitting(true);
      const linkedInvoiceId = invoiceId ? Number(invoiceId) : null;
      const createdPoIds = linkedPos.map((po: any) => Number(po.id));
      const createdShipmentIds = linkedShipments.map((s: any) => Number(s.id));
      const createdBillIds = linkedBills.map((b: any) => Number(b.id));
      await createAuction.mutateAsync({
        projectName: projectName.trim(),
        bidAmount: Number(bidAmount || 0),
        costAmount: runningCostEstimate,
        invoiceId: linkedInvoiceId,
        linkedInvoiceIds: effectiveInvoiceIds,
        purchaseOrderIds: createdPoIds,
        shipmentIds: createdShipmentIds,
        billIds: createdBillIds,
        notes: [auctionTag, notes.trim()].filter(Boolean).join(" | "),
      });
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      resetForm();
      setShowCreate(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create auction workflow.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBills = async () => {
    if (!invoiceId || linkedPos.length === 0) return;
    setBillingBusy(true);
    try {
      for (const po of linkedPos) {
        await fetch(`/api/purchase-orders/${po.id}/convert`, { method: "POST" });
      }
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } finally { setBillingBusy(false); }
  };

  const handleDeleteAuction = (a: AuctionOrder) => {
    if (!window.confirm(`Delete auction "${a.projectName}"? This only removes the auction record — linked invoices/POs/shipments remain in the system.`)) return;
    deleteAuction.mutate(a.id);
  };

  const handleDeleteInvoice = async (invId: number) => {
    if (!window.confirm("Permanently delete this invoice?")) return;
    await fetch(`/api/invoices/${invId}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  };
  const handleDeletePo = async (poId: number) => {
    if (!window.confirm("Permanently delete this purchase order?")) return;
    await fetch(`/api/purchase-orders/${poId}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
  };
  const handleDeleteShipment = async (shipId: number) => {
    if (!window.confirm("Permanently delete this shipment?")) return;
    await fetch(`/api/shipments/${shipId}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
  };

  const openPoModal = (inv: any, noteTag: string, auctionId: number | null = null) => {
    const existingPOs = (purchaseOrders ?? []).filter((po: any) => po.sourceInvoiceId === inv.id);
    if (existingPOs.length > 0) {
      setDuplicatePOGuard({ inv, noteTag, auctionId, existingPOs });
    } else {
      setPoNoteTag(noteTag);
      setPoInvoice(inv);
      if (auctionId !== null) setActiveCardAuctionId(auctionId);
    }
  };

  const openShipModal = (inv: any, noteTag: string, auctionId: number | null = null) => {
    const existingShips = (shipments ?? []).filter((s: any) => s.invoiceId === inv.id);
    if (existingShips.length > 0) {
      setDuplicateShipGuard({ inv, noteTag, auctionId, existingShips });
    } else {
      setShipmentNoteTag(noteTag);
      setShipmentInvoice(inv);
      if (auctionId !== null) setActiveCardAuctionId(auctionId);
    }
  };

  return (
    <Layout>
      <Header title="Auctions" subtitle={`${items.length} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Strict auction flow: new invoice → purchase order → shipping → billing.
          </p>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors"
          >
            <Plus size={14} /> Create New Auction Order
          </button>
        </div>

        {showCreate && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-800">
            <div>
              <label className="text-xs font-semibold text-slate-600">Project Name</label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400"
                placeholder="Enter project name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Amount Bid For (auto-filled from invoice)</label>
              <input
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400"
                placeholder="0.00"
              />
            </div>

            <div className="md:col-span-2 border border-slate-200 rounded-lg bg-white p-3 text-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Step 1: Create Invoice</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">New invoice gets tied automatically to this auction.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceIdsBeforeCreate(((invoices ?? []) as any[]).map((inv) => Number(inv.id)));
                    setInvoiceCreateTag(auctionTag);
                    setInvoiceAttachToFormFlow(true);
                    setShowInvoiceModal(true);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Create Invoice
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                {selectedInvoice
                  ? `Linked invoice: ${(selectedInvoice.invoiceNumber ?? `FRZI - ${Math.max(5100, 5099 + Number(selectedInvoice.id ?? 0))}`)} · ${selectedInvoice.customerName}`
                  : "No invoice linked yet. Create one using the button above."}
              </p>
            </div>

            <div className="md:col-span-2 border border-slate-200 rounded-lg bg-white p-3 text-slate-800">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Step 2: Purchase Orders</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Create linked PO(s); notes are pre-tagged for this auction.</p>
                </div>
                <button
                  type="button"
                  disabled={!invoiceId}
                  onClick={() => { if (selectedInvoice) openPoModal(selectedInvoice, auctionTag); }}
                  className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200"
                >
                  + Create Purchase Order
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {invoiceId ? `${linkedPos.length} purchase order(s) currently linked to this invoice.` : "Select invoice first to create linked purchase order(s)."}
              </p>
            </div>

            <div className="md:col-span-2 border border-slate-200 rounded-lg bg-white p-3 text-slate-800">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Step 3: Shipping</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Create shipment against linked invoice items.</p>
                </div>
                <button
                  type="button"
                  disabled={!selectedInvoice}
                  onClick={() => { if (selectedInvoice) openShipModal(selectedInvoice, auctionTag); }}
                  className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200"
                >
                  + Create Shipping
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {invoiceId ? `${linkedShipments.length} shipment(s) linked to this invoice.` : "Create invoice first to enable shipping flow."}
              </p>
            </div>

            <div className="md:col-span-2 border border-slate-200 rounded-lg bg-white p-3 text-slate-800">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Step 4: Billing</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Convert linked PO(s) into bills.</p>
                </div>
                <button
                  type="button"
                  disabled={!invoiceId || linkedPos.length === 0 || billingBusy}
                  onClick={handleCreateBills}
                  className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200"
                >
                  {billingBusy ? "Creating..." : "+ Create Billing"}
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {invoiceId ? `${linkedBills.length} bill(s) linked via PO conversion/tag.` : "Create invoice first to enable billing flow."}
              </p>
            </div>

            <div className="md:col-span-2 border border-blue-200 bg-blue-50/60 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800">Comment Tag: {auctionTag}</p>
              <p className="text-[11px] text-blue-700 mt-1">This tag is added to auction notes and prefilled in PO/shipping notes where supported.</p>
            </div>

            <div className="md:col-span-2 border border-emerald-200 bg-emerald-50/60 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-800">Amount Costing Us (auto-calculated)</p>
              <p className="text-sm font-bold text-emerald-900 mt-1">{formatCurrency(runningCostEstimate)}</p>
              <p className="text-[11px] text-emerald-700 mt-1">Sum of purchase orders + billing + shipping cost. Updated live as you add items.</p>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Notes / Invoice-style details</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[80px] bg-white text-slate-800 placeholder:text-slate-400"
                placeholder="Add project details, line-item context, and instructions..."
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                onClick={() => { resetForm(); setShowCreate(false); }}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={submit}
                className="px-3 py-2 rounded-lg bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] disabled:opacity-60"
              >
                {submitting ? "Creating..." : "Create Auction Workflow"}
              </button>
            </div>
          </div>
        )}

        {auctionsLoading ? (
          <div className="text-center py-10 text-sm text-slate-400">Loading auctions…</div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center text-sm text-slate-500">
            No auction orders yet. Create one to start tracking linked invoice, purchase orders, shipping, and billing.
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {items.map((a) => {
              const stableRowTag = `Auction Order ${a.id}`;
              const linkedInvoice = a.invoiceId ? invoiceLookup.get(a.invoiceId) : null;
              const explicitInvoiceIds = a.linkedInvoiceIds as number[];

              const rowInvoices = (invoices ?? []).filter((inv: any) =>
                (explicitInvoiceIds?.includes(Number(inv.id ?? 0)) ?? false) ||
                Number(inv.id ?? 0) === Number(a.invoiceId ?? 0)
              );
              const rowInvoiceIds = new Set(rowInvoices.map((inv: any) => Number(inv.id)));

              const rowPos = (purchaseOrders ?? []).filter((po: any) =>
                rowInvoiceIds.has(Number(po.sourceInvoiceId ?? 0))
              );
              const rowPoIds = new Set(rowPos.map((po: any) => Number(po.id)));

              const rowBills = (bills ?? []).filter((b: any) =>
                b.sourcePurchaseOrderId != null && rowPoIds.has(Number(b.sourcePurchaseOrderId ?? 0))
              );
              const rowShipments = (shipments ?? []).filter((s: any) =>
                rowInvoiceIds.has(Number(s.invoiceId ?? 0))
              );

              const totalLinkedCost =
                rowPos.reduce((sum: number, po: any) => sum + Number(po.total ?? 0), 0) +
                rowBills.reduce((sum: number, b: any) => sum + Number(b.total ?? 0), 0) +
                rowShipments.reduce((sum: number, s: any) => sum + Number(s.shippingCost ?? 0), 0);
              const totalRevenue = rowInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total ?? 0), 0);
              const margin = totalRevenue - totalLinkedCost;

              const cardPrimaryInvoice = (linkedInvoice as any) ?? rowInvoices[0] ?? null;

              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  {/* Auction Header */}
                  <div className="flex items-center justify-between gap-4 px-5 py-4 bg-[hsl(224_50%_15%)] text-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        #{a.id}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base leading-tight truncate">{a.projectName}</h3>
                        <p className="text-xs text-white/60 mt-0.5">Created {formatDate(a.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[11px] text-white/60">Revenue</p>
                        <p className="text-base font-bold">{formatCurrency(totalRevenue > 0 ? totalRevenue : a.bidAmount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-white/60">Cost</p>
                        <p className="text-base font-bold text-red-300">{formatCurrency(totalLinkedCost > 0 ? totalLinkedCost : a.costAmount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-white/60">Margin</p>
                        <div className="flex items-center gap-1 justify-end">
                          {margin > 0 ? <TrendingUp size={13} className="text-emerald-400" /> : margin < 0 ? <TrendingDown size={13} className="text-red-400" /> : <Minus size={13} className="text-white/40" />}
                          <p className={`text-base font-bold ${margin > 0 ? "text-emerald-300" : margin < 0 ? "text-red-300" : "text-white/60"}`}>{formatCurrency(margin)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAuction(a)}
                        className="p-2 rounded-lg text-white/50 hover:text-red-300 hover:bg-white/10 transition-colors"
                        title="Delete auction"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Four-column grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-y divide-slate-100">
                    {/* Invoices */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Invoices</p>
                        <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-semibold">{rowInvoices.length}</span>
                      </div>
                      {rowInvoices.length === 0 ? (
                        <p className="text-xs text-slate-400 italic mb-3">Not linked</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {rowInvoices.map((inv: any) => (
                            <div key={inv.id} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                              <p className="text-[11px] font-semibold text-blue-800 truncate">
                                {inv.invoiceNumber ?? `FRZI-${Math.max(5100, 5099 + Number(inv.id ?? 0))}`}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">{inv.customerName ?? "Customer"}</p>
                              <p className="text-[11px] font-bold text-slate-700 mt-1">{formatCurrency(Number(inv.total ?? 0))}</p>
                              <div className="flex gap-1.5 mt-2">
                                <button
                                  type="button"
                                  onClick={() => setViewInvoice(inv)}
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-blue-200 bg-white text-[10px] text-blue-700 font-semibold hover:bg-blue-50"
                                >
                                  <Eye size={9} /> View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvoice(Number(inv.id))}
                                  className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-red-100 bg-white text-[10px] text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 size={9} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceIdsBeforeCreate(((invoices ?? []) as any[]).map((inv) => Number(inv.id)));
                          setInvoiceCreateTag(stableRowTag);
                          setInvoiceCreateAuctionId(a.id);
                          setInvoiceAttachToFormFlow(false);
                          setActiveCardAuctionId(a.id);
                          setShowInvoiceModal(true);
                        }}
                        className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-dashed border-blue-300 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
                      >
                        + Create Invoice
                      </button>
                    </div>

                    {/* Purchase Orders */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">Purchase Orders</p>
                        <span className="text-[10px] bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 font-semibold">{rowPos.length}</span>
                      </div>
                      {rowPos.length === 0 ? (
                        <p className="text-xs text-slate-400 italic mb-3">None linked</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {rowPos.map((po: any) => {
                            const poLabel = po.sourceInvoiceId && po.poSequence
                              ? `FRZPO-${String(po.sourceInvoiceId).padStart(4, "0")}-${po.poSequence}`
                              : `FRZPO-${String(po.id).padStart(4, "0")}`;
                            return (
                              <div key={po.id} className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                                <p className="text-[11px] font-semibold text-sky-800 truncate">{poLabel}</p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">{po.vendorName ?? "Vendor"}</p>
                                <p className="text-[11px] font-bold text-slate-700 mt-1">{formatCurrency(Number(po.total ?? 0))}</p>
                                <div className="flex gap-1.5 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => setViewPo(po)}
                                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-sky-200 bg-white text-[10px] text-sky-700 font-semibold hover:bg-sky-50"
                                  >
                                    <Eye size={9} /> View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePo(Number(po.id))}
                                    className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-red-100 bg-white text-[10px] text-red-500 hover:bg-red-50"
                                  >
                                    <Trash2 size={9} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {cardPrimaryInvoice && (
                        <button
                          type="button"
                          onClick={() => { if (cardPrimaryInvoice) openPoModal(cardPrimaryInvoice, stableRowTag, a.id); }}
                          className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-dashed border-sky-300 text-sky-600 font-semibold hover:bg-sky-50 transition-colors"
                        >
                          + Create Purchase Order
                        </button>
                      )}
                    </div>

                    {/* Shipping */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Shipping</p>
                        <span className="text-[10px] bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-semibold">{rowShipments.length}</span>
                      </div>
                      {rowShipments.length === 0 ? (
                        <p className="text-xs text-slate-400 italic mb-3">None linked</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {rowShipments.map((ship: any) => (
                            <div key={ship.id} className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2">
                              <p className="text-[11px] font-semibold text-purple-800 truncate">{`SHP-${String(ship.id).padStart(4, "0")}`}</p>
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">{ship.carrier ?? "Carrier"}</p>
                              <p className="text-[11px] font-bold text-slate-700 mt-1">{formatCurrency(Number(ship.shippingCost ?? 0))}</p>
                              <div className="flex gap-1.5 mt-2">
                                <button
                                  type="button"
                                  onClick={() => setViewShipment(ship)}
                                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-purple-200 bg-white text-[10px] text-purple-700 font-semibold hover:bg-purple-50"
                                >
                                  <Eye size={9} /> View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteShipment(Number(ship.id))}
                                  className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-red-100 bg-white text-[10px] text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 size={9} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {cardPrimaryInvoice && (
                        <button
                          type="button"
                          onClick={() => { if (cardPrimaryInvoice) openShipModal(cardPrimaryInvoice, stableRowTag, a.id); }}
                          className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-dashed border-purple-300 text-purple-600 font-semibold hover:bg-purple-50 transition-colors"
                        >
                          + Create Shipping
                        </button>
                      )}
                    </div>

                    {/* Cost Breakdown */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Cost Breakdown</p>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold">{rowBills.length} bills</span>
                      </div>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                          <span className="text-slate-500">Purchase Orders</span>
                          <span className="font-semibold text-slate-700">{formatCurrency(rowPos.reduce((s: number, p: any) => s + Number(p.total ?? 0), 0))}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                          <span className="text-slate-500">Bills</span>
                          <span className="font-semibold text-slate-700">{formatCurrency(rowBills.reduce((s: number, b: any) => s + Number(b.total ?? 0), 0))}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                          <span className="text-slate-500">Shipping</span>
                          <span className="font-semibold text-slate-700">{formatCurrency(rowShipments.reduce((s: number, sh: any) => s + Number(sh.shippingCost ?? 0), 0))}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                          <span className="font-semibold text-slate-600">Total Cost</span>
                          <span className="font-bold text-red-600">{formatCurrency(totalLinkedCost > 0 ? totalLinkedCost : a.costAmount)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 border-b border-slate-100">
                          <span className="text-slate-500">Revenue</span>
                          <span className="font-semibold text-emerald-700">{formatCurrency(totalRevenue > 0 ? totalRevenue : a.bidAmount)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1">
                          <span className="font-bold text-slate-700">Net Margin</span>
                          <span className={`font-bold ${margin >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatCurrency(margin)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {a.notes && (
                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                      <p className="text-xs text-slate-500 italic">{a.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvoiceModal && (
        <InvoiceModal onClose={() => { setShowInvoiceModal(false); setActiveCardAuctionId(null); }} />
      )}

      {/* Duplicate PO Guard */}
      {duplicatePOGuard && (() => {
        const { inv, noteTag, auctionId, existingPOs } = duplicatePOGuard;
        const poLabel = (po: any) => {
          const invNum = inv.invoiceNumber ?? `FRZI-${Math.max(5100, 5099 + Number(inv.id ?? 0))}`;
          const m = invNum.match(/^FRZI[\s-]+(.+)$/i);
          const core = m ? m[1].trim() : String(inv.id ?? 0);
          return po.poSequence ? `FRZPO-${core}-${po.poSequence}` : `FRZPO-${String(po.id).padStart(4, "0")}`;
        };
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setDuplicatePOGuard(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><ShoppingCart size={16} className="text-amber-600" /></div>
                <div>
                  <h3 className="text-slate-800 font-bold text-base leading-tight">PO Already Exists</h3>
                  <p className="text-slate-400 text-xs">{inv.invoiceNumber ?? inv.customerName ?? "Invoice"}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 mb-5">
                <p className="text-sm text-slate-600">
                  This invoice already has {existingPOs.length === 1 ? "a purchase order" : `${existingPOs.length} purchase orders`}:
                </p>
                <div className="flex flex-col gap-1.5">
                  {existingPOs.map((po: any) => (
                    <div key={po.id} className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <span className="font-mono text-xs font-bold text-amber-800">{poLabel(po)}</span>
                      <span className="text-xs text-slate-500 capitalize">{po.status ?? "—"}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Do you want to create another purchase order anyway?</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDuplicatePOGuard(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  No, Cancel
                </button>
                <button onClick={() => {
                  setDuplicatePOGuard(null);
                  setPoNoteTag(noteTag);
                  setPoInvoice(inv);
                  if (auctionId !== null) setActiveCardAuctionId(auctionId);
                }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors flex items-center justify-center gap-2">
                  <ShoppingCart size={14} /> Yes, Create Another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Duplicate Shipment Guard */}
      {duplicateShipGuard && (() => {
        const { inv, noteTag, auctionId, existingShips } = duplicateShipGuard;
        const shipLabel = (s: any) => s.trackingNumber ? `#${s.trackingNumber}` : `SHP-${String(s.id).padStart(4, "0")}`;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setDuplicateShipGuard(null)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center"><Truck size={16} className="text-sky-600" /></div>
                <div>
                  <h3 className="text-slate-800 font-bold text-base leading-tight">Shipment Already Exists</h3>
                  <p className="text-slate-400 text-xs">{inv.invoiceNumber ?? inv.customerName ?? "Invoice"}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 mb-5">
                <p className="text-sm text-slate-600">
                  This invoice already has {existingShips.length === 1 ? "a shipment" : `${existingShips.length} shipments`}:
                </p>
                <div className="flex flex-col gap-1.5">
                  {existingShips.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-sky-50 border border-sky-100 rounded-lg">
                      <span className="font-mono text-xs font-bold text-sky-800">{shipLabel(s)}</span>
                      <span className="text-xs text-slate-500 capitalize">{s.status ?? "—"}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Do you want to create another shipment anyway?</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDuplicateShipGuard(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                  No, Cancel
                </button>
                <button onClick={() => {
                  setDuplicateShipGuard(null);
                  setShipmentNoteTag(noteTag);
                  setShipmentInvoice(inv);
                  if (auctionId !== null) setActiveCardAuctionId(auctionId);
                }}
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition-colors flex items-center justify-center gap-2">
                  <Truck size={14} /> Yes, Create Another
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {poInvoice && (
        <InvoicePoModal
          invoice={{ id: poInvoice.id, lineItems: poInvoice.lineItems ?? [], invoiceNumber: poInvoice.invoiceNumber ?? null }}
          noteTag={poNoteTag || auctionTag}
          onClose={() => { setPoInvoice(null); setPoNoteTag(""); setActiveCardAuctionId(null); queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() }); }}
        />
      )}
      {shipmentInvoice && (
        <ShipmentModal
          customerId={shipmentInvoice.customerId}
          invoiceId={shipmentInvoice.id}
          customerName={shipmentInvoice.customerName ?? "Customer"}
          lineItems={(shipmentInvoice.lineItems ?? []).map((li: any) => ({ description: li.description, quantity: li.quantity }))}
          defaultInternalNote={shipmentNoteTag || auctionTag}
          onClose={() => { setShipmentInvoice(null); setShipmentNoteTag(""); setActiveCardAuctionId(null); queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() }); }}
        />
      )}
      {viewInvoice && (
        <InvoiceView
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onCreatePO={() => { const inv = viewInvoice; setViewInvoice(null); if (inv) openPoModal(inv, ""); }}
        />
      )}
      {viewPo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setViewPo(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-800 font-bold text-base">Purchase Order Details</h3>
              <button onClick={() => setViewPo(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="text-sm text-slate-700 space-y-2">
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">PO Number</span><span>{viewPo.sourceInvoiceId && viewPo.poSequence ? `FRZPO-${String(viewPo.sourceInvoiceId).padStart(4, "0")}-${viewPo.poSequence}` : `FRZPO-${String(viewPo.id).padStart(4, "0")}`}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Vendor</span><span>{viewPo.vendorName ?? "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Status</span><span>{viewPo.status ?? "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Expected Delivery</span><span>{formatDate(viewPo.expectedDate)}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Total</span><span className="font-bold text-slate-800">{formatCurrency(Number(viewPo.total ?? 0))}</span></div>
              {viewPo.notes && <div className="py-1.5"><span className="font-semibold text-slate-600 block mb-1">Notes</span><span className="text-slate-500 text-xs">{viewPo.notes}</span></div>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { handleDeletePo(Number(viewPo.id)); setViewPo(null); }} className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 flex items-center gap-1.5"><Trash2 size={13} /> Delete PO</button>
              <button onClick={() => setViewPo(null)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
      {viewShipment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setViewShipment(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-800 font-bold text-base">Shipment Details</h3>
              <button onClick={() => setViewShipment(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="text-sm text-slate-700 space-y-2">
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Shipment #</span><span>{`SHP-${String(viewShipment.id).padStart(4, "0")}`}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Customer</span><span>{viewShipment.customerName ?? "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Carrier</span><span>{viewShipment.carrier ?? "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Tracking #</span><span>{viewShipment.trackingNumber ?? "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Status</span><span>{viewShipment.status ?? "—"}</span></div>
              <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="font-semibold text-slate-600">Shipping Cost</span><span className="font-bold text-slate-800">{formatCurrency(Number(viewShipment.shippingCost ?? 0))}</span></div>
              {viewShipment.notes && <div className="py-1.5"><span className="font-semibold text-slate-600 block mb-1">Notes</span><span className="text-slate-500 text-xs">{viewShipment.notes}</span></div>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { handleDeleteShipment(Number(viewShipment.id)); setViewShipment(null); }} className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 flex items-center gap-1.5"><Trash2 size={13} /> Delete Shipment</button>
              <button onClick={() => setViewShipment(null)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
