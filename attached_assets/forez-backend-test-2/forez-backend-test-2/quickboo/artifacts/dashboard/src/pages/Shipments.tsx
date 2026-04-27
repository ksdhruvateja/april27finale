import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListShipments, useUpdateShipment, getListShipmentsQueryKey } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Truck, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import forézLogo from "@assets/forez_logo_1775627603527.png";
import { downloadCsv, downloadPdfFromHtml } from "@/lib/export-utils";

const STATUS_MAP: Record<string, string> = {
  delivered: "text-emerald-700 bg-emerald-50 border-emerald-200",
  shipped:   "text-blue-700   bg-blue-50   border-blue-200",
  returned:  "text-red-600    bg-red-50    border-red-200",
  pending:   "text-slate-500  bg-slate-50  border-slate-200",
};

const BUSINESS = {
  name:    "Forez Corp",
  line1:   "2402 Ocean Ave",
  line2:   "Ronkonkoma, NY 11779",
  country: "United States",
  phone:   "+1 (516) 860-2513",
  email:   "info@forezcorp.com",
  website: "www.forezcorp.com",
};

async function printShippingSlip(shipment: any) {
  const [customerRes, invoiceRes] = await Promise.all([
    fetch(`/api/customers/${shipment.customerId}`).then(r => r.ok ? r.json() : null),
    shipment.invoiceId ? fetch(`/api/invoices/${shipment.invoiceId}`).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
  ]);

  const customer = customerRes as any;
  const invoice = invoiceRes as any;

  const slipNum = `SHP-${String(shipment.id).padStart(4, "0")}`;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const toName = customer?.company || customer?.name || shipment.customerName || "—";
  const toContact = customer?.company ? customer.name : "";
  const toAddress = [
    customer?.address,
    [customer?.city, customer?.state, customer?.zipCode].filter(Boolean).join(", "),
    customer?.country,
  ].filter(Boolean).join("\n");

  const lineItems: any[] = invoice?.lineItems ?? [];

  const itemsHTML = lineItems.length > 0
    ? lineItems.map((item: any, i: number) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 14px;font-size:13px;color:#1f2937">${item.description || "—"}</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;text-align:center">${item.unit || ""}</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;text-align:right;font-weight:600">${item.quantity ?? 1}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:16px 14px;color:#9ca3af;font-size:12px;text-align:center;font-style:italic">No item details available</td></tr>`;

  const trackingBarcode = shipment.trackingNumber
    ? `<div style="margin-top:18px;padding:14px 18px;background:#f9fafb;border:1px dashed #d1d5db;border-radius:8px;display:flex;align-items:center;gap:14px">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:600">Tracking #</div>
        <div style="font-size:16px;font-family:monospace;font-weight:700;color:#111827;letter-spacing:2px">${shipment.trackingNumber}</div>
       </div>`
    : "";

  const notesHTML = shipment.notes
    ? `<div style="margin-top:18px;padding:14px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
        <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Shipping Notes</div>
        <div style="font-size:12px;color:#78350f;line-height:1.6">${shipment.notes}</div>
       </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Shipping Slip ${slipNum}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:#fff;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{body{padding:0}@page{margin:32px;size:A4}}
</style>
</head>
<body>
<div style="padding:44px 52px;max-width:780px;margin:0 auto">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="${forézLogo}" alt="Forez Corp" style="width:52px;height:52px;object-fit:contain;border-radius:10px;display:block" />
      <div>
        <div style="font-size:20px;font-weight:800;color:#0d1f3c;letter-spacing:-0.5px">${BUSINESS.name}</div>
        <div style="font-size:10px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-top:3px">Industrial &amp; Commercial Supplies</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:30px;font-weight:900;letter-spacing:-1.5px;color:#0d1f3c;line-height:1">SHIPPING SLIP</div>
      <div style="font-size:13px;font-weight:700;color:#6b7280;margin-top:6px;letter-spacing:0.5px">${slipNum}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px">${today}</div>
      ${shipment.carrier ? `<div style="margin-top:6px;display:inline-block;padding:3px 12px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;border-radius:99px;border:1px solid #bfdbfe">${shipment.carrier}</div>` : ""}
    </div>
  </div>

  <!-- Divider -->
  <div style="height:2px;background:#0d1f3c;margin-bottom:28px;border-radius:2px"></div>

  <!-- Address Block -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:28px">

    <!-- From -->
    <div style="padding:18px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">From</div>
      <div style="font-size:14px;font-weight:800;color:#0d1f3c;margin-bottom:6px">${BUSINESS.name}</div>
      <div style="font-size:12px;color:#4b5563;line-height:1.8">
        ${BUSINESS.line1}<br/>
        ${BUSINESS.line2}<br/>
        ${BUSINESS.country}
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:8px;line-height:1.7">
        📞 ${BUSINESS.phone}<br/>
        ✉ ${BUSINESS.email}
      </div>
    </div>

    <!-- To -->
    <div style="padding:18px 20px;background:#f0f9ff;border:2px solid #0d1f3c;border-radius:10px">
      <div style="font-size:10px;font-weight:700;color:#0d1f3c;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">Ship To</div>
      <div style="font-size:14px;font-weight:800;color:#0d1f3c;margin-bottom:4px">${toName}</div>
      ${toContact ? `<div style="font-size:12px;color:#374151;margin-bottom:6px">Attn: ${toContact}</div>` : ""}
      <div style="font-size:12px;color:#4b5563;line-height:1.8;white-space:pre-line">${toAddress || "Address not on file"}</div>
      ${customer?.phone ? `<div style="font-size:11px;color:#6b7280;margin-top:8px">📞 ${customer.phone}</div>` : ""}
      ${customer?.email ? `<div style="font-size:11px;color:#6b7280">✉ ${customer.email}</div>` : ""}
    </div>
  </div>

  <!-- Shipment Meta -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
    <div style="padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Status</div>
      <div style="font-size:13px;font-weight:700;color:#1f2937;margin-top:4px;text-transform:capitalize">${shipment.status}</div>
    </div>
    <div style="padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Carrier</div>
      <div style="font-size:13px;font-weight:700;color:#1f2937;margin-top:4px">${shipment.carrier || "—"}</div>
    </div>
    <div style="padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Ship Date</div>
      <div style="font-size:13px;font-weight:700;color:#1f2937;margin-top:4px">${shipment.shippedAt ? new Date(shipment.shippedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"}</div>
    </div>
  </div>

  ${trackingBarcode}

  <!-- Items Table -->
  <div style="margin-top:24px">
    <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">Package Contents</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Item / Description</th>
          <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Unit</th>
          <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  </div>

  ${notesHTML}

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:18px;border-top:2px solid #0d1f3c;display:flex;justify-content:space-between;align-items:flex-end">
    <div style="display:flex;align-items:center;gap:8px">
      <img src="${forézLogo}" alt="Forez Corp" style="width:20px;height:20px;object-fit:contain;border-radius:4px;display:block" />
      <div style="font-size:12px;font-weight:700;color:#0d1f3c">${BUSINESS.name}</div>
    </div>
    <div style="font-size:11px;color:#9ca3af;text-align:right">
      ${BUSINESS.line1} · ${BUSINESS.line2}<br/>
      ${BUSINESS.phone} · ${BUSINESS.website}
    </div>
  </div>

</div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=850,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export default function Shipments() {
  const { data: shipments, isLoading } = useListShipments();
  const updateShipment = useUpdateShipment();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [printingId, setPrintingId] = useState<number | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = (shipments ?? [])
    .filter((s: any) => {
      if (!q) return true;
      return [
        s.customerName,
        s.trackingNumber,
        s.carrier,
        s.status,
        s.notes,
        s.internalNote,
        `SHP-${String(s.id ?? "").padStart(4, "0")}`,
        String(s.id ?? ""),
      ].some(v => String(v ?? "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const bt = new Date((b as any).createdAt ?? 0).getTime();
      const at = new Date((a as any).createdAt ?? 0).getTime();
      if (bt !== at) return bt - at;
      return (b.id ?? 0) - (a.id ?? 0);
    });

  const handleUpdateStatus = (id: number) => {
    const status = prompt("New status (pending, shipped, delivered, returned):", "shipped") as "pending" | "shipped" | "delivered" | "returned";
    if (status) {
      updateShipment.mutate({ id, data: { status } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() })
      });
    }
  };

  const handlePrintSlip = async (s: any) => {
    setPrintingId(s.id);
    try {
      await printShippingSlip(s);
    } finally {
      setPrintingId(null);
    }
  };

  const downloadAllExcel = () => {
    const rows = filtered.map((s) => [
      `SHP-${String(s.id).padStart(4, "0")}`,
      s.customerName,
      s.carrier ?? "",
      s.trackingNumber ?? "",
      formatDate(s.shippedAt),
      s.status,
    ]);
    downloadCsv("shipments.csv", ["Shipment", "Customer", "Carrier", "Tracking Number", "Shipped At", "Status"], rows);
  };

  const downloadAllPdf = () => {
    const tableHtml = `<table><thead><tr><th>Shipment</th><th>Customer</th><th>Carrier</th><th>Tracking Number</th><th>Shipped At</th><th>Status</th></tr></thead><tbody>${
      filtered.map((s) => `<tr><td>SHP-${String(s.id).padStart(4, "0")}</td><td>${s.customerName}</td><td>${s.carrier ?? "—"}</td><td>${s.trackingNumber ?? "—"}</td><td>${formatDate(s.shippedAt)}</td><td>${s.status}</td></tr>`).join("")
    }</tbody></table>`;
    downloadPdfFromHtml("Shipments", tableHtml);
  };

  return (
    <Layout>
      <Header title="Shipments" subtitle={`${shipments?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by customer or tracking #..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadAllExcel} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All Excel
            </button>
            <button onClick={downloadAllPdf} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Download All PDF
            </button>
            <button className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
              <Plus size={14} /> Create Shipment
            </button>
          </div>
        </div>
        <div className="glass-card">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No shipments found.</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Shipment</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Carrier</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Tracking #</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Shipped</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">SHP-{s.id.toString().padStart(4, "0")}</td>
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{s.customerName}</td>
                    <td className="px-5 py-3.5 text-slate-500">{s.carrier || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{s.trackingNumber || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{formatDate(s.shippedAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_MAP[s.status] ?? STATUS_MAP.pending}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                          <MoreHorizontal size={14} className="text-slate-500" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[160px]">
                          <DropdownMenuItem
                            onClick={() => handlePrintSlip(s)}
                            disabled={printingId === s.id}
                            className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"
                          >
                            <FileText size={13} />
                            {printingId === s.id ? "Generating…" : "Print Shipping Slip"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(s.id)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Truck size={13} /> Update Status</DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
