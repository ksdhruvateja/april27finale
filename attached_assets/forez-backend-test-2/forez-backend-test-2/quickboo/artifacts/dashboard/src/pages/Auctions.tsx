import { useEffect, useMemo, useState } from "react";
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
import { Plus, Eye, X } from "lucide-react";
import { appendInvoiceToAuction, createAuction, listAuctions, setAuctionInvoiceLinks, type AuctionOrder, useAuctionsSync } from "@/lib/auctions-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import InvoiceModal from "@/components/InvoiceModal";
import InvoicePoModal from "@/components/InvoicePoModal";
import ShipmentModal from "@/components/ShipmentModal";
import InvoiceView from "@/components/InvoiceView";

export default function Auctions() {
  const queryClient = useQueryClient();
  const { data: invoices } = useListInvoices();
  const { data: purchaseOrders } = useListPurchaseOrders();
  const { data: bills } = useListBills();
  const { data: shipments } = useListShipments();
  const [items, setItems] = useState<AuctionOrder[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [poInvoice, setPoInvoice] = useState<any | null>(null);
  const [shipmentInvoice, setShipmentInvoice] = useState<any | null>(null);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [viewPo, setViewPo] = useState<any | null>(null);
  const [viewShipment, setViewShipment] = useState<any | null>(null);
  const [invoiceCreateTag, setInvoiceCreateTag] = useState<string | null>(null);
  const [invoiceCreateAuctionId, setInvoiceCreateAuctionId] = useState<number | null>(null);
  const [invoiceAttachToFormFlow, setInvoiceAttachToFormFlow] = useState(false);
  const [invoiceIdsBeforeCreate, setInvoiceIdsBeforeCreate] = useState<number[]>([]);
  const [billingBusy, setBillingBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [linkedInvoiceIds, setLinkedInvoiceIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  const load = () => setItems(listAuctions());
  const nextAuctionNumber = useMemo(
    () => ((items.length ? Math.max(...items.map((a) => a.id)) : 0) + 1),
    [items],
  );
  const auctionTag = `Auction Order ${nextAuctionNumber}`;

  useEffect(() => {
    load();
    return useAuctionsSync(load);
  }, []);

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

    // Best effort: tag invoice comment/internal notes for traceability.
    const tagToApply = invoiceCreateTag ?? auctionTag;
    fetch(`/api/invoices/${newlyCreated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internalNote: tagToApply }),
    }).catch(() => {});
    if (invoiceCreateAuctionId != null) {
      appendInvoiceToAuction(invoiceCreateAuctionId, Number(newlyCreated.id));
      load();
    }
    setInvoiceCreateTag(null);
    setInvoiceCreateAuctionId(null);
    setInvoiceAttachToFormFlow(false);
  }, [invoices, invoiceIdsBeforeCreate, auctionTag, invoiceCreateTag, invoiceAttachToFormFlow, invoiceCreateAuctionId]);

  // Backfill/sync linked invoice IDs for existing auctions so all related invoices show reliably.
  useEffect(() => {
    if (!items.length || !invoices?.length) return;
    for (const a of items) {
      const tagFromNotes = String(a.notes ?? "").match(/Auction Order \d+/)?.[0] ?? null;
      const stableTag = `Auction Order ${a.id}`;
      const currentIds = new Set((a as any).linkedInvoiceIds ?? []);
      if (a.invoiceId) currentIds.add(Number(a.invoiceId));
      const matched = (invoices as any[])
        .filter((inv) =>
          String(inv.internalNote ?? "").includes(stableTag)
          || String(inv.notes ?? "").includes(stableTag)
          || (tagFromNotes ? String(inv.internalNote ?? "").includes(tagFromNotes) || String(inv.notes ?? "").includes(tagFromNotes) : false)
          || (a.projectName ? String(inv.internalNote ?? "").includes(a.projectName) || String(inv.notes ?? "").includes(a.projectName) : false)
        )
        .map((inv) => Number(inv.id));
      const merged = Array.from(new Set([...Array.from(currentIds), ...matched]));
      const prev = Array.from(currentIds).sort((x, y) => x - y).join(",");
      const next = merged.slice().sort((x, y) => x - y).join(",");
      if (prev !== next) {
        setAuctionInvoiceLinks(a.id, merged);
      }
    }
  }, [items, invoices]);

  useEffect(() => {
    if (!invoiceId) return;
    const selectedInvoice = (invoices ?? []).find((inv: any) => String(inv.id) === invoiceId);
    if (!selectedInvoice) return;
    const invoiceTotal = Number((selectedInvoice as any).total ?? 0);
    const linkedPos = (purchaseOrders ?? []).filter((po: any) => String(po.sourceInvoiceId) === invoiceId);
    const linkedPoTotal = linkedPos.reduce((sum: number, po: any) => sum + Number(po.total ?? 0), 0);

    // Auto-fill estimate values from the selected invoice flow.
    setBidAmount(invoiceTotal > 0 ? String(invoiceTotal) : "");
    setCostAmount(linkedPoTotal > 0 ? String(linkedPoTotal) : (invoiceTotal > 0 ? String(invoiceTotal) : ""));
  }, [invoiceId, invoices, purchaseOrders]);

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
  const linkedPoIds = useMemo(
    () => new Set(linkedPos.map((po: any) => Number(po.id))),
    [linkedPos],
  );
  const linkedBills = useMemo(
    () => (bills ?? []).filter((b: any) => {
      const byPo = b.sourcePurchaseOrderId != null && linkedPoIds.has(Number(b.sourcePurchaseOrderId));
      const byTag = String(b.notes ?? "").includes(auctionTag) || String(b.internalNote ?? "").includes(auctionTag);
      return byPo || byTag;
    }),
    [bills, linkedPoIds, auctionTag],
  );
  const runningCostEstimate = useMemo(() => {
    const invoiceTax = linkedInvoices.reduce((sum: number, inv: any) => sum + Number(inv.taxTotal ?? 0), 0);
    const poTotal = linkedPos.reduce((sum: number, po: any) => sum + Number(po.total ?? 0), 0);
    const billTotal = linkedBills.reduce((sum: number, b: any) => sum + Number(b.total ?? 0), 0);
    const shipmentCost = linkedShipments.reduce((sum: number, s: any) => sum + Number(s.shippingCost ?? 0), 0);
    return invoiceTax + poTotal + billTotal + shipmentCost;
  }, [linkedInvoices, linkedPos, linkedBills, linkedShipments]);

  const invoiceLookup = useMemo(
    () => new Map((invoices ?? []).map((i) => [i.id, i])),
    [invoices],
  );
  const poLookup = useMemo(
    () => new Map((purchaseOrders ?? []).map((p) => [p.id, p])),
    [purchaseOrders],
  );
  const billLookup = useMemo(
    () => new Map((bills ?? []).map((b) => [b.id, b])),
    [bills],
  );

  const resetForm = () => {
    setProjectName("");
    setBidAmount("");
    setCostAmount("");
    setInvoiceId("");
    setLinkedInvoiceIds([]);
    setNotes("");
  };

  const submit = async () => {
    if (!projectName.trim()) {
      alert("Project name is required.");
      return;
    }
    if (!invoiceId) {
      alert("Create a new invoice first from Step 1.");
      return;
    }

    try {
      setSubmitting(true);
      const linkedInvoiceId = Number(invoiceId);
      const invoiceLinkedPos = (purchaseOrders ?? []).filter((po: any) => effectiveInvoiceIds.includes(Number(po.sourceInvoiceId ?? 0)));
      const createdPoIds: number[] = invoiceLinkedPos.map((po: any) => po.id);
      const createdShipmentIds: number[] = (shipments ?? [])
        .filter((s: any) => effectiveInvoiceIds.includes(Number(s.invoiceId ?? 0)))
        .map((s: any) => Number(s.id));
      const createdBillIds: number[] = linkedBills.map((b: any) => Number(b.id));

      createAuction({
        projectName: projectName.trim(),
        bidAmount: Number(bidAmount || 0),
        costAmount: runningCostEstimate > 0 ? Number(runningCostEstimate) : Number(costAmount || 0),
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
      load();
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
    } finally {
      setBillingBusy(false);
    }
  };

  return (
    <Layout>
      <Header title="Auctions" subtitle={`${items.length} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Strict auction flow: new invoice -&gt; purchase order -&gt; shipping -&gt; billing.
          </p>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors"
          >
            <Plus size={14} /> Create New Auction Order
          </button>
        </div>

        {showCreate && (
          <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-800">
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
              <label className="text-xs font-semibold text-slate-600">Amount Bid For</label>
              <input
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Amount Costing Us</label>
              <input
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400"
                placeholder="0.00"
              />
            </div>
            <div className="md:col-span-2 border border-slate-200 rounded-lg bg-white p-3 text-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Step 1: Create Invoice</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">New invoice gets tied automatically to this auction flow.</p>
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
                  ? `Linked invoice: ${(selectedInvoice.invoiceNumber ?? `FC - ${Math.max(5100, 5099 + Number(selectedInvoice.id ?? 0))}`)} · ${selectedInvoice.customerName}`
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
                  onClick={() => {
                    if (selectedInvoice) setPoInvoice(selectedInvoice);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200"
                >
                  + Create Purchase Order
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {(invoiceId
                  ? `${linkedPos.length} purchase order(s) currently linked to this invoice.`
                  : "Select invoice first to create linked purchase order(s).")}
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
                  onClick={() => setShipmentInvoice(selectedInvoice ?? null)}
                  className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 disabled:text-slate-400 disabled:bg-slate-100 disabled:border-slate-200"
                >
                  + Create Shipping
                </button>
              </div>
              <p className="text-xs text-slate-600">
                {(invoiceId ? `${linkedShipments.length} shipment(s) linked to this invoice.` : "Create invoice first to enable shipping flow.")}
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
                {(invoiceId ? `${linkedBills.length} bill(s) linked via PO conversion/tag.` : "Create invoice first to enable billing flow.")}
              </p>
            </div>

            <div className="md:col-span-2 border border-blue-200 bg-blue-50/60 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800">Comment Tag: {auctionTag}</p>
              <p className="text-[11px] text-blue-700 mt-1">
                This tag is added to auction notes and prefilled in PO/shipping notes where supported.
              </p>
            </div>

            <div className="md:col-span-2 border border-emerald-200 bg-emerald-50/60 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-800">Current Running Expense</p>
              <p className="text-sm font-bold text-emerald-900 mt-1">{formatCurrency(runningCostEstimate)}</p>
              <p className="text-[11px] text-emerald-700 mt-1">
                Includes invoice tax + purchase orders + billing + shipping cost (if available).
              </p>
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

        <div className="glass-card overflow-hidden">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No auction orders yet. Create one to start tracking linked invoice, purchase orders, shipping, and billing.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((a) => {
                const auctionTagMatch = String(a.notes ?? "").match(/Auction Order \d+/);
                const rowTag = auctionTagMatch?.[0] ?? null;
                const stableRowTag = `Auction Order ${a.id}`;
                const linkedInvoice = a.invoiceId ? invoiceLookup.get(a.invoiceId) : null;
                const explicitInvoiceIds = (a as any).linkedInvoiceIds as number[] | undefined;
                const rowInvoices = (invoices ?? []).filter((inv: any) =>
                  (explicitInvoiceIds?.includes(Number(inv.id ?? 0)) ?? false)
                  || Number(inv.id ?? 0) === Number(a.invoiceId ?? 0)
                  || (rowTag ? String(inv.internalNote ?? "").includes(rowTag) || String(inv.notes ?? "").includes(rowTag) : false)
                  || String(inv.internalNote ?? "").includes(stableRowTag)
                  || String(inv.notes ?? "").includes(stableRowTag)
                );
                const rowInvoiceIds = new Set(rowInvoices.map((inv: any) => Number(inv.id)));
                const rowPos = (purchaseOrders ?? []).filter((po: any) =>
                  rowInvoiceIds.has(Number(po.sourceInvoiceId ?? 0))
                  || (rowTag ? String(po.notes ?? "").includes(rowTag) || String(po.internalNote ?? "").includes(rowTag) : false)
                  || String(po.notes ?? "").includes(stableRowTag)
                  || String(po.internalNote ?? "").includes(stableRowTag)
                );
                const rowPoIds = new Set(rowPos.map((po: any) => Number(po.id)));
                const rowBills = (bills ?? []).filter((b: any) =>
                  rowPoIds.has(Number(b.sourcePurchaseOrderId ?? 0))
                  || (rowTag ? String(b.notes ?? "").includes(rowTag) || String(b.internalNote ?? "").includes(rowTag) : false)
                  || String(b.notes ?? "").includes(stableRowTag)
                  || String(b.internalNote ?? "").includes(stableRowTag)
                );
                const rowShipments = (shipments ?? []).filter((s: any) =>
                  rowInvoiceIds.has(Number(s.invoiceId ?? 0))
                  || (rowTag ? String(s.notes ?? "").includes(rowTag) || String(s.internalNote ?? "").includes(rowTag) : false)
                  || String(s.notes ?? "").includes(stableRowTag)
                  || String(s.internalNote ?? "").includes(stableRowTag)
                );
                const totalLinkedCost =
                  rowInvoices.reduce((sum: number, inv: any) => sum + Number(inv.taxTotal ?? 0), 0) +
                  rowPos.reduce((sum: number, po: any) => sum + Number(po.total ?? 0), 0) +
                  rowBills.reduce((sum: number, b: any) => sum + Number(b.total ?? 0), 0) +
                  rowShipments.reduce((sum: number, s: any) => sum + Number(s.shippingCost ?? 0), 0);
                return (
                  <div key={a.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-slate-800">{a.projectName}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Created {formatDate(a.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Bid / Cost</p>
                        <p className="text-sm font-bold text-slate-800">
                          {formatCurrency(a.bidAmount)} / {formatCurrency(a.costAmount)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3 text-xs">
                      <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                        <p className="font-semibold text-blue-700">Invoices</p>
                        {rowInvoices.length === 0 ? (
                          <p className="text-slate-600 mt-1">Not linked</p>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {rowInvoices.map((inv: any) => (
                              <div key={inv.id} className="flex items-center justify-between gap-2 rounded border border-blue-200 bg-white px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-blue-700 truncate">
                                    {(inv.invoiceNumber ?? `FC - ${Math.max(5100, 5099 + Number(inv.id ?? 0))}`)}
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {inv.customerName ?? "Customer"} · {formatCurrency(Number(inv.total ?? 0))}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setViewInvoice(inv)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-200 bg-blue-50 text-[10px] text-blue-700 font-semibold hover:bg-blue-100 whitespace-nowrap"
                                >
                                  <Eye size={10} />
                                  Quick View
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const tag = stableRowTag;
                            setInvoiceIdsBeforeCreate(((invoices ?? []) as any[]).map((inv) => Number(inv.id)));
                            setInvoiceCreateTag(tag);
                            setInvoiceCreateAuctionId(a.id);
                            setInvoiceAttachToFormFlow(false);
                            setShowInvoiceModal(true);
                          }}
                          className="mt-2 text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                        >
                          + Create Invoice
                        </button>
                      </div>
                      <div className="rounded-lg bg-sky-50 border border-sky-100 p-2">
                        <p className="font-semibold text-sky-700">Purchase Orders</p>
                        <p className="text-slate-600 mt-1">{rowPos.length} linked</p>
                        {rowPos.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {rowPos.map((po: any) => {
                              const poLabel = po.sourceInvoiceId && po.poSequence
                                ? `FRZPO-${String(po.sourceInvoiceId).padStart(4, "0")}-${po.poSequence}`
                                : `FRZPO-${String(po.id).padStart(4, "0")}`;
                              return (
                                <div key={po.id} className="flex items-center justify-between gap-2 rounded border border-sky-200 bg-white px-2 py-1.5">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-sky-700 truncate">{poLabel}</p>
                                    <p className="text-[10px] text-slate-500 truncate">
                                      {po.vendorName ?? "Vendor"} · {formatCurrency(Number(po.total ?? 0))}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setViewPo(po)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-sky-200 bg-sky-50 text-[10px] text-sky-700 font-semibold hover:bg-sky-100 whitespace-nowrap"
                                  >
                                    <Eye size={10} />
                                    Quick View
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {linkedInvoice && (
                          <button
                            type="button"
                            onClick={() => setPoInvoice(linkedInvoice as any)}
                            className="mt-2 text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                          >
                            + Create Purchase Order
                          </button>
                        )}
                      </div>
                      <div className="rounded-lg bg-purple-50 border border-purple-100 p-2">
                        <p className="font-semibold text-purple-700">Shipping</p>
                        <p className="text-slate-600 mt-1">{rowShipments.length} shipments linked</p>
                        {rowShipments.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {rowShipments.map((ship: any) => (
                              <div key={ship.id} className="flex items-center justify-between gap-2 rounded border border-purple-200 bg-white px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-purple-700 truncate">{`SHP-${String(ship.id).padStart(4, "0")}`}</p>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {ship.carrier ?? "Carrier"} · {ship.status ?? "pending"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setViewShipment(ship)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-purple-200 bg-purple-50 text-[10px] text-purple-700 font-semibold hover:bg-purple-100 whitespace-nowrap"
                                >
                                  <Eye size={10} />
                                  Quick View
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {(linkedInvoice || rowInvoices[0]) && (
                          <button
                            type="button"
                            onClick={() => {
                              const shipInv = (linkedInvoice as any) ?? rowInvoices[0];
                              if (shipInv) setShipmentInvoice(shipInv);
                            }}
                            className="mt-2 text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                          >
                            + Create Shipping
                          </button>
                        )}
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2">
                        <p className="font-semibold text-emerald-700">Linked Cost Basis</p>
                        <p className="text-slate-600 mt-1">{formatCurrency(totalLinkedCost)}</p>
                      </div>
                    </div>
                    {a.notes && <p className="text-xs text-slate-600 mt-2">{a.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {showInvoiceModal && (
        <InvoiceModal
          onClose={() => {
            setShowInvoiceModal(false);
          }}
        />
      )}
      {poInvoice && (
        <InvoicePoModal
          invoice={{
            id: poInvoice.id,
            lineItems: poInvoice.lineItems ?? [],
            invoiceNumber: poInvoice.invoiceNumber ?? null,
          }}
          noteTag={auctionTag}
          onClose={() => setPoInvoice(null)}
        />
      )}
      {shipmentInvoice && (
        <ShipmentModal
          customerId={shipmentInvoice.customerId}
          invoiceId={shipmentInvoice.id}
          customerName={shipmentInvoice.customerName ?? "Customer"}
          lineItems={(shipmentInvoice.lineItems ?? []).map((li: any) => ({ description: li.description, quantity: li.quantity }))}
          defaultInternalNote={auctionTag}
          onClose={() => setShipmentInvoice(null)}
        />
      )}
      {viewInvoice && (
        <InvoiceView
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onCreatePO={() => {
            setPoInvoice(viewInvoice);
            setViewInvoice(null);
          }}
        />
      )}
      {viewPo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setViewPo(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-800 font-bold text-base">Purchase Order Quick View</h3>
              <button onClick={() => setViewPo(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="text-sm text-slate-700 space-y-1">
              <p><span className="font-semibold">PO:</span> {viewPo.sourceInvoiceId && viewPo.poSequence ? `FRZPO-${String(viewPo.sourceInvoiceId).padStart(4, "0")}-${viewPo.poSequence}` : `FRZPO-${String(viewPo.id).padStart(4, "0")}`}</p>
              <p><span className="font-semibold">Vendor:</span> {viewPo.vendorName ?? "—"}</p>
              <p><span className="font-semibold">Status:</span> {viewPo.status ?? "—"}</p>
              <p><span className="font-semibold">Expected:</span> {formatDate(viewPo.expectedDate)}</p>
              <p><span className="font-semibold">Total:</span> {formatCurrency(Number(viewPo.total ?? 0))}</p>
            </div>
          </div>
        </div>
      )}
      {viewShipment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setViewShipment(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-800 font-bold text-base">Shipment Quick View</h3>
              <button onClick={() => setViewShipment(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="text-sm text-slate-700 space-y-1">
              <p><span className="font-semibold">Shipment:</span> {`SHP-${String(viewShipment.id).padStart(4, "0")}`}</p>
              <p><span className="font-semibold">Customer:</span> {viewShipment.customerName ?? "—"}</p>
              <p><span className="font-semibold">Carrier:</span> {viewShipment.carrier ?? "—"}</p>
              <p><span className="font-semibold">Tracking:</span> {viewShipment.trackingNumber ?? "—"}</p>
              <p><span className="font-semibold">Status:</span> {viewShipment.status ?? "—"}</p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
