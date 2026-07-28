const forézLogo = "/forez-logo.png";

const BUSINESS = {
  name:    "Forez Corp",
  tagline: "Industrial & Commercial Supplies",
  line1:   "2402 Ocean Ave",
  line2:   "Ronkonkoma, NY 11779",
  country: "United States",
  phone:   "+1 (516) 860-2513",
  email:   "info@forezcorp.com",
  website: "www.forezcorp.com",
};

export interface CompanyAddress {
  id: string; name: string;
  line1: string; line2?: string;
  city: string; state: string; zip: string;
  phone?: string;
}

export async function fetchCompanyAddresses(): Promise<CompanyAddress[]> {
  try {
    const r = await fetch("/api/app-settings/company_addresses");
    if (!r.ok) return [];
    const d = await r.json();
    if (d?.value) return JSON.parse(d.value) as CompanyAddress[];
  } catch {}
  return [];
}

export async function printShippingSlip(shipment: any, fromAddr?: CompanyAddress | null) {
  const [customerRes, invoiceRes] = await Promise.all([
    fetch(`/api/customers/${shipment.customerId}`).then(r => r.ok ? r.json() : null),
    shipment.invoiceId ? fetch(`/api/invoices/${shipment.invoiceId}`).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
  ]);

  const customer = customerRes as any;
  const invoice  = invoiceRes as any;

  /* ── From address (company) ── */
  const fromName  = fromAddr?.name  ?? BUSINESS.name;
  const fromLine1 = fromAddr?.line1 ?? BUSINESS.line1;
  const fromLine2 = fromAddr
    ? [fromAddr.city, fromAddr.state, fromAddr.zip].filter(Boolean).join(", ")
    : BUSINESS.line2;
  const fromPhone = fromAddr?.phone ?? null;

  /* ── Slip metadata ── */
  const slipNum = `PKG-${String(shipment.id).padStart(4, "0")}`;
  const today   = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  /* ── Ship-to (no email, no phone) ── */
  const toName    = customer?.company || customer?.name || shipment.customerName || "—";
  const toContact = customer?.company ? customer.name : "";
  const toAddress = [
    customer?.address,
    [customer?.city, customer?.state, customer?.zipCode].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");

  /* ── Line items ── */
  const lineItems: any[] = invoice?.lineItems ?? [];
  const itemsHTML = lineItems.length > 0
    ? lineItems.map((item: any) => `
      <tr>
        <td style="padding:11px 16px;font-size:13px;color:#1f2937;border-bottom:1px solid #f3f4f6">
          <span style="font-weight:600">${item.description || "—"}</span>
          ${item.lineDescription ? `<br/><span style="font-size:11px;color:#9ca3af;line-height:1.5">${item.lineDescription}</span>` : ""}
        </td>
        <td style="padding:11px 16px;font-size:13px;color:#6b7280;text-align:center;border-bottom:1px solid #f3f4f6">${item.unit || "—"}</td>
        <td style="padding:11px 16px;font-size:14px;font-weight:700;color:#0d1f3c;text-align:right;border-bottom:1px solid #f3f4f6">${item.quantity ?? 1}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:20px 16px;color:#d1d5db;font-size:12px;text-align:center;font-style:italic">No item details available</td></tr>`;

  /* ── Tracking number block ── */
  const trackingHTML = shipment.trackingNumber
    ? `<div style="margin-top:20px;padding:14px 20px;background:#f0f9ff;border:1.5px solid #bfdbfe;border-radius:10px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:10px;color:#3b82f6;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Tracking Number</div>
        <div style="font-size:17px;font-family:'Courier New',monospace;font-weight:800;color:#1e40af;letter-spacing:3px">${shipment.trackingNumber}</div>
       </div>`
    : "";

  /* ── Notes ── */
  const notesHTML = shipment.notes
    ? `<div style="margin-top:16px;padding:14px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
        <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Shipping Notes</div>
        <div style="font-size:12px;color:#78350f;line-height:1.6">${shipment.notes}</div>
       </div>`
    : "";

  /* ── Signature line ── */
  const sigHTML = `
    <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:40px">
      <div>
        <div style="border-top:1.5px solid #d1d5db;padding-top:8px">
          <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px">Received By</div>
        </div>
      </div>
      <div>
        <div style="border-top:1.5px solid #d1d5db;padding-top:8px">
          <div style="font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px">Date Received</div>
        </div>
      </div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Packing Slip ${slipNum}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:#fff;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{body{padding:0}@page{margin:28px 32px;size:A4}}
</style>
</head>
<body>
<div style="padding:44px 56px;max-width:800px;margin:0 auto">

  <!-- Header banner -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0">
    <!-- Left: logo + company -->
    <div style="display:flex;align-items:center;gap:16px">
      <img src="${forézLogo}" alt="Forez Corp"
           style="width:58px;height:58px;object-fit:contain;border-radius:12px;background:#f0f9ff;padding:4px;display:block"/>
      <div>
        <div style="font-size:22px;font-weight:900;color:#0d1f3c;letter-spacing:-0.5px;line-height:1">${BUSINESS.name}</div>
        <div style="font-size:9.5px;color:#94a3b8;letter-spacing:2.5px;text-transform:uppercase;margin-top:4px">${BUSINESS.tagline}</div>
        <div style="font-size:10.5px;color:#6b7280;margin-top:5px;line-height:1.5">
          ${fromLine1} · ${fromLine2}${fromPhone ? `<br/>${fromPhone}` : ""}
        </div>
      </div>
    </div>
    <!-- Right: document title -->
    <div style="text-align:right">
      <div style="font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:3px;margin-bottom:6px">Packing Slip</div>
      <div style="font-size:32px;font-weight:900;color:#0d1f3c;letter-spacing:-1.5px;line-height:1">${slipNum}</div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:6px;font-weight:500">${today}</div>
      ${shipment.carrier ? `<div style="margin-top:8px;display:inline-block;padding:4px 14px;background:#dbeafe;color:#1e40af;font-size:10px;font-weight:800;border-radius:99px;border:1px solid #bfdbfe;letter-spacing:0.5px">${shipment.carrier}</div>` : ""}
    </div>
  </div>

  <!-- Rule -->
  <div style="height:3px;background:linear-gradient(90deg,#0d1f3c 60%,#3b82f6 100%);border-radius:2px;margin:22px 0"></div>

  <!-- Address blocks -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px">
    <!-- From -->
    <div style="padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
      <div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px">From</div>
      <div style="font-size:14px;font-weight:800;color:#0d1f3c;margin-bottom:5px">${fromName}</div>
      <div style="font-size:12px;color:#475569;line-height:1.8">
        ${fromLine1}<br/>
        ${fromLine2}
        ${fromPhone ? `<br/><span style="font-size:11px;color:#94a3b8">${fromPhone}</span>` : ""}
      </div>
    </div>
    <!-- Ship To -->
    <div style="padding:18px 20px;background:#eff6ff;border:2px solid #0d1f3c;border-radius:12px">
      <div style="font-size:9px;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px">Ship To</div>
      <div style="font-size:14px;font-weight:800;color:#0d1f3c;margin-bottom:4px">${toName}</div>
      ${toContact ? `<div style="font-size:11.5px;color:#475569;margin-bottom:5px;font-weight:500">Attn: ${toContact}</div>` : ""}
      <div style="font-size:12px;color:#475569;line-height:1.8;white-space:pre-line">${toAddress || "Address not on file"}</div>
    </div>
  </div>

  <!-- Shipment meta chips -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px">
    <div style="padding:13px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px">Status</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;text-transform:capitalize">${shipment.status || "—"}</div>
    </div>
    <div style="padding:13px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px">Carrier</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a">${shipment.carrier || "—"}</div>
    </div>
    <div style="padding:13px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px">Ship Date</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a">${shipment.shippedAt ? new Date(shipment.shippedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : today}</div>
    </div>
  </div>

  ${trackingHTML}

  <!-- Items table -->
  <div style="margin-top:22px">
    <div style="font-size:9px;font-weight:800;color:#0d1f3c;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px">Package Contents</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#0d1f3c">
          <th style="padding:11px 16px;text-align:left;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px">Item / Description</th>
          <th style="padding:11px 16px;text-align:center;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:90px">Unit</th>
          <th style="padding:11px 16px;text-align:right;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;width:80px">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
  </div>

  ${notesHTML}
  ${sigHTML}

  <!-- Footer -->
  <div style="margin-top:36px;padding-top:16px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${forézLogo}" alt="Forez Corp"
           style="width:24px;height:24px;object-fit:contain;border-radius:5px;background:#f0f9ff;padding:2px;display:block"/>
      <div>
        <div style="font-size:12px;font-weight:800;color:#0d1f3c">${BUSINESS.name}</div>
        <div style="font-size:9.5px;color:#94a3b8">${BUSINESS.website}</div>
      </div>
    </div>
    <div style="font-size:10.5px;color:#cbd5e1;text-align:right;line-height:1.6">
      ${fromLine1} · ${fromLine2}
    </div>
  </div>

</div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=880,height=720");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 450);
}
