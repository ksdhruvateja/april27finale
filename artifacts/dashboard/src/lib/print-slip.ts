import { fetchCompanyProfile } from "@/lib/companyProfile";

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
  const [customerRes, invoiceRes, companyProfile] = await Promise.all([
    fetch(`/api/customers/${shipment.customerId}`).then(r => r.ok ? r.json() : null),
    shipment.invoiceId ? fetch(`/api/invoices/${shipment.invoiceId}`).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
    fetchCompanyProfile(),
  ]);

  const customer = customerRes as any;
  const invoice  = invoiceRes as any;

  /* ── From address (company) ── */
  const fromName  = fromAddr?.name  ?? companyProfile.name;
  const fromLine1 = fromAddr?.line1 ?? companyProfile.line1;
  const fromLine2 = fromAddr
    ? [fromAddr.city, fromAddr.state, fromAddr.zip].filter(Boolean).join(", ")
    : companyProfile.line2;

  /* ── Slip metadata ── */
  const slipNum = `PKG-${String(shipment.id).padStart(4, "0")}`;
  const today   = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const invNum  = invoice?.invoiceNumber ?? (invoice?.id ? `INV-${String(invoice.id).padStart(4, "0")}` : null);

  /* ── Ship-to (address only, no email/phone per user request) ── */
  const toName    = customer?.company || customer?.name || shipment.customerName || "—";
  const toContact = customer?.company ? customer.name : "";
  const toAddr1   = customer?.address || "";
  const toAddr2   = [customer?.city, customer?.state, customer?.zipCode].filter(Boolean).join(", ");
  const toCountry = customer?.country && customer.country !== "US" ? customer.country : "";

  /* ── Line items ── */
  const lineItems: any[] = invoice?.lineItems ?? [];
  const itemsHTML = lineItems.length > 0
    ? lineItems.map((item: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
        <td style="padding:10px 14px;font-size:12.5px;color:#111827;border-bottom:1px solid #e5e7eb">
          <span style="font-weight:600">${item.description || "—"}</span>
        </td>
        <td style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:center;border-bottom:1px solid #e5e7eb">${item.unit || "ea"}</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#111827;text-align:right;border-bottom:1px solid #e5e7eb">${item.quantity ?? 1}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="padding:18px 14px;color:#9ca3af;font-size:11.5px;text-align:center;font-style:italic">No item details available</td></tr>`;

  const logoSrc = companyProfile.logo ?? "/forez-logo.png";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Packing Slip ${slipNum}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px}
  @media print{body{padding:0}@page{margin:22px 28px;size:letter}}
</style>
</head>
<body>
<div style="max-width:740px;margin:0 auto;padding:36px 44px;background:#fff">

  <!-- ── Header ── -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:0">
    <tr>
      <!-- Left: logo + company -->
      <td style="vertical-align:top;width:60%">
        <div style="display:flex;align-items:center;gap:12px">
          <img src="${logoSrc}" alt="${fromName}" style="width:48px;height:48px;object-fit:contain;border-radius:8px;background:#f1f5f9;padding:3px"/>
          <div>
            <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">${fromName}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;letter-spacing:0.5px;text-transform:uppercase">${companyProfile.tagline}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.6">${fromLine1}<br/>${fromLine2}</div>
          </div>
        </div>
      </td>
      <!-- Right: document heading -->
      <td style="vertical-align:top;text-align:right">
        <div style="font-size:26px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;line-height:1">PACKING SLIP</div>
        <div style="font-size:14px;font-weight:700;color:#3b82f6;margin-top:4px">${slipNum}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">${today}</div>
        ${invNum ? `<div style="font-size:11px;color:#64748b;margin-top:3px">Invoice: <strong>${invNum}</strong></div>` : ""}
        ${shipment.carrier ? `<div style="margin-top:8px;display:inline-block;padding:3px 12px;background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;border-radius:99px;border:1px solid #bfdbfe;letter-spacing:0.3px">${shipment.carrier}</div>` : ""}
      </td>
    </tr>
  </table>

  <!-- ── Rule ── -->
  <div style="height:2px;background:#0f172a;margin:18px 0 20px"></div>

  <!-- ── Address blocks ── -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:22px">
    <tr>
      <!-- From -->
      <td style="width:48%;vertical-align:top;padding-right:12px">
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;background:#f8fafc">
          <div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">From</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">${fromName}</div>
          <div style="font-size:12px;color:#475569;line-height:1.7">${fromLine1}<br/>${fromLine2}</div>
        </div>
      </td>
      <!-- Ship To -->
      <td style="width:52%;vertical-align:top;padding-left:12px">
        <div style="border:2px solid #0f172a;border-radius:8px;padding:14px 16px;background:#fff">
          <div style="font-size:9px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">Ship To</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">${toName}</div>
          ${toContact ? `<div style="font-size:11.5px;color:#64748b;margin-bottom:4px">Attn: ${toContact}</div>` : ""}
          <div style="font-size:12px;color:#475569;line-height:1.7">${toAddr1 ? toAddr1 + "<br/>" : ""}${toAddr2 || (toAddr1 ? "" : "<em style='color:#9ca3af'>Address not on file</em>")}${toCountry ? "<br/>" + toCountry : ""}</div>
        </div>
      </td>
    </tr>
  </table>

  ${shipment.trackingNumber ? `
  <!-- ── Tracking ── -->
  <div style="margin-bottom:20px;padding:12px 16px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;display:flex;align-items:center;justify-content:space-between">
    <div style="font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:1.5px">Tracking Number</div>
    <div style="font-size:15px;font-family:'Courier New',monospace;font-weight:800;color:#1d4ed8;letter-spacing:2.5px">${shipment.trackingNumber}</div>
  </div>` : ""}

  <!-- ── Items table ── -->
  <div style="margin-bottom:${shipment.notes ? "18px" : "28px"}">
    <div style="font-size:9.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Package Contents</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb">Description</th>
          <th style="padding:9px 14px;text-align:center;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;width:80px;border-bottom:1px solid #e5e7eb">Unit</th>
          <th style="padding:9px 14px;text-align:right;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;width:70px;border-bottom:1px solid #e5e7eb">Qty</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>
  </div>

  ${shipment.notes ? `
  <!-- ── Notes ── -->
  <div style="margin-bottom:24px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
    <div style="font-size:9.5px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Shipping Notes</div>
    <div style="font-size:12px;color:#78350f;line-height:1.6">${shipment.notes}</div>
  </div>` : ""}

  <!-- ── Signature ── -->
  <table style="width:100%;border-collapse:collapse;margin-top:8px;margin-bottom:32px">
    <tr>
      <td style="width:50%;padding-right:20px;vertical-align:bottom">
        <div style="border-bottom:1.5px solid #cbd5e1;padding-bottom:4px;margin-bottom:5px">&nbsp;</div>
        <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px">Received By</div>
      </td>
      <td style="width:30%;padding-right:20px;vertical-align:bottom">
        <div style="border-bottom:1.5px solid #cbd5e1;padding-bottom:4px;margin-bottom:5px">&nbsp;</div>
        <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px">Date Received</div>
      </td>
      <td style="width:20%;vertical-align:bottom">
        <div style="border-bottom:1.5px solid #cbd5e1;padding-bottom:4px;margin-bottom:5px">&nbsp;</div>
        <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px">Condition</div>
      </td>
    </tr>
  </table>

  <!-- ── Footer ── -->
  <div style="border-top:1px solid #e5e7eb;padding-top:14px;display:flex;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:8px">
      <img src="${logoSrc}" alt="${fromName}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;background:#f1f5f9;padding:2px"/>
      <span style="font-size:11.5px;font-weight:700;color:#0f172a">${fromName}</span>
      ${companyProfile.website ? `<span style="font-size:10.5px;color:#94a3b8">· ${companyProfile.website}</span>` : ""}
    </div>
    <div style="font-size:10px;color:#cbd5e1;text-align:right">
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
