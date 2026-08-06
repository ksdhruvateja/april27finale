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
<title>Packing Slip ${slipNum} — ${fromName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px;line-height:1.5}
  .page{max-width:800px;margin:0 auto;padding:36px 48px}
  .doc-hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2.5px solid #0d2044;margin-bottom:26px}
  .co-left{display:flex;align-items:flex-start;gap:14px}
  .co-logo{width:52px;height:52px;object-fit:contain;border-radius:8px;flex-shrink:0}
  .co-name{font-size:17px;font-weight:800;color:#0d2044;letter-spacing:-0.3px;line-height:1.2}
  .co-addr{font-size:11px;color:#6b7280;margin-top:5px;line-height:1.7}
  .doc-right{text-align:right}
  .doc-type{font-size:28px;font-weight:900;color:#0d2044;letter-spacing:-0.3px;line-height:1;margin-bottom:12px}
  .mrow{display:flex;justify-content:flex-end;align-items:baseline;gap:14px;line-height:2.1}
  .mlbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap}
  .mval{font-size:12.5px;font-weight:700;color:#111827;min-width:120px;text-align:right}
  .carrier-pill{display:inline-block;margin-top:8px;padding:3px 11px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe}
  .addr-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .addr-block{padding:14px 16px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa}
  .addr-block.highlight{border-color:#0d2044;border-width:2px;background:#fff}
  .addr-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #efefef}
  .addr-block.highlight .addr-lbl{color:#0d2044}
  .addr-name{font-size:13.5px;font-weight:700;color:#0d2044;margin-bottom:3px}
  .addr-text{font-size:11.5px;color:#6b7280;line-height:1.75}
  .tracking-bar{display:flex;justify-content:space-between;align-items:center;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:6px;padding:11px 16px;margin-bottom:20px}
  .tracking-lbl{font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:1.5px}
  .tracking-val{font-size:15px;font-family:'Courier New',monospace;font-weight:800;color:#1d4ed8;letter-spacing:2px}
  .section-lbl{font-size:9.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
  table.items{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px}
  table.items thead tr{background:#0d2044}
  table.items th{padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.85);text-align:left}
  table.items th.c{text-align:center}
  table.items th.r{text-align:right}
  table.items tbody tr{border-bottom:1px solid #f0f0f0}
  table.items tbody tr:last-child{border-bottom:none}
  table.items td{padding:11px 14px;font-size:12.5px;color:#374151;vertical-align:middle}
  table.items td.c{text-align:center;color:#6b7280}
  table.items td.r{text-align:right;font-weight:700;color:#111827}
  .iname{font-weight:600;color:#111827}
  .notes-box{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;margin-bottom:20px}
  .notes-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#b45309;margin-bottom:5px}
  .notes-box p{font-size:12px;color:#78350f;line-height:1.7}
  .sig-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:24px;margin-top:28px;margin-bottom:32px}
  .sig-block .sig-line{border-bottom:1.5px solid #cbd5e1;height:30px;margin-bottom:5px}
  .sig-block .sig-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8}
  .doc-footer{padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
  .foot-l,.foot-r{font-size:10px;color:#9ca3af}
  @media print{body{padding:0}@page{margin:22px 36px;size:letter}}
</style>
</head>
<body>
<div class="page">

  <div class="doc-hdr">
    <div class="co-left">
      <img src="${logoSrc}" class="co-logo" alt="${fromName}"/>
      <div>
        <div class="co-name">${fromName}</div>
        <div class="co-addr">${fromLine1}<br/>${fromLine2}</div>
      </div>
    </div>
    <div class="doc-right">
      <div class="doc-type">PACKING SLIP</div>
      <div class="mrow"><span class="mlbl">Slip No.</span><span class="mval">${slipNum}</span></div>
      <div class="mrow"><span class="mlbl">Date</span><span class="mval">${today}</span></div>
      ${invNum ? `<div class="mrow"><span class="mlbl">Invoice</span><span class="mval" style="font-family:'Courier New',monospace;font-size:11px">${invNum}</span></div>` : ""}
      ${shipment.carrier ? `<div><span class="carrier-pill">${shipment.carrier}</span></div>` : ""}
    </div>
  </div>

  <div class="addr-grid">
    <div class="addr-block">
      <div class="addr-lbl">From</div>
      <div class="addr-name">${fromName}</div>
      <div class="addr-text">${fromLine1}<br/>${fromLine2}</div>
    </div>
    <div class="addr-block highlight">
      <div class="addr-lbl">Ship To</div>
      <div class="addr-name">${toName}</div>
      ${toContact ? `<div class="addr-text" style="margin-bottom:2px">Attn: ${toContact}</div>` : ""}
      <div class="addr-text">${toAddr1 ? toAddr1 + "<br/>" : ""}${toAddr2 || (!toAddr1 ? "<em style='color:#9ca3af'>Address not on file</em>" : "")}${toCountry ? "<br/>" + toCountry : ""}</div>
    </div>
  </div>

  ${shipment.trackingNumber ? `
  <div class="tracking-bar">
    <div class="tracking-lbl">Tracking Number</div>
    <div class="tracking-val">${shipment.trackingNumber}</div>
  </div>` : ""}

  <div class="section-lbl">Package Contents</div>
  <table class="items">
    <thead>
      <tr>
        <th style="width:60%">Description</th>
        <th class="c" style="width:20%">Unit</th>
        <th class="r" style="width:20%">Qty Shipped</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>

  ${shipment.notes ? `<div class="notes-box"><div class="notes-lbl">Shipping Notes</div><p>${shipment.notes}</p></div>` : ""}

  <div class="sig-grid">
    <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Received By (Signature &amp; Print)</div></div>
    <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Date Received</div></div>
    <div class="sig-block"><div class="sig-line"></div><div class="sig-lbl">Condition</div></div>
  </div>

  <div class="doc-footer">
    <div class="foot-l">${fromLine1} · ${fromLine2}</div>
    <div class="foot-r">Please inspect contents upon receipt</div>
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
