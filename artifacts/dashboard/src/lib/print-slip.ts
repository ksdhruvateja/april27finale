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
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#fff;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px;line-height:1.6}
  .page{max-width:760px;margin:0 auto;padding:28px 40px}
  .doc-hdr{text-align:center;padding-bottom:14px;border-bottom:1.5px solid #111;margin-bottom:0}
  .co-logo{width:72px;height:72px;object-fit:contain;display:block;margin:0 auto 8px}
  .co-name{font-size:18px;font-weight:700;color:#111;letter-spacing:-0.1px}
  .co-addr{font-size:10.5px;color:#888;margin-top:4px;line-height:1.6}
  .doc-meta{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #d0d0d0;margin-bottom:18px}
  .doc-type{font-size:20px;font-weight:700;color:#111;letter-spacing:1px}
  .doc-right{text-align:right}
  .mrow{display:flex;justify-content:flex-end;align-items:baseline;gap:20px;line-height:2.2}
  .mlbl{font-size:9.5px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.8px;white-space:nowrap}
  .mval{font-size:12px;font-weight:600;color:#222;min-width:120px;text-align:right}
  .carrier-pill{display:inline-block;margin-top:7px;padding:2px 10px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border:1.5px solid #1e40af;color:#1e40af}
  .addr-grid{display:flex;gap:0;padding-bottom:16px;border-bottom:1px solid #ddd;margin-bottom:18px}
  .addr-block{flex:1;padding-right:24px}
  .addr-block+.addr-block{padding-left:24px;padding-right:0;border-left:1px solid #e0e0e0}
  .addr-block.highlight .addr-lbl{color:#111}
  .addr-lbl{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#bbb;margin-bottom:5px}
  .addr-name{font-size:13px;font-weight:700;color:#111;margin-bottom:2px}
  .addr-text{font-size:11px;color:#666;line-height:1.75}
  .tracking-bar{display:flex;justify-content:space-between;align-items:center;border:1px solid #bbb;padding:10px 14px;margin-bottom:16px}
  .tracking-lbl{font-size:9px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.5px}
  .tracking-val{font-size:14px;font-family:'Courier New',monospace;font-weight:700;color:#111;letter-spacing:1.5px}
  .section-lbl{font-size:8.5px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
  table.items{width:100%;border-collapse:collapse;margin-bottom:18px}
  table.items thead tr{background:#f2f2f2;border-top:1.5px solid #bbb;border-bottom:1.5px solid #bbb}
  table.items th{padding:9px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#444;text-align:left}
  table.items th.c{text-align:center}
  table.items th.r{text-align:right}
  table.items tbody tr{border-bottom:1px solid #eee}
  table.items tbody tr:last-child{border-bottom:1.5px solid #bbb}
  table.items td{padding:10px 12px;font-size:12px;color:#333;vertical-align:middle}
  table.items td.c{text-align:center;color:#666}
  table.items td.r{text-align:right;font-weight:600;color:#222}
  .iname{font-weight:600;color:#111}
  .notes-box{margin-bottom:18px;padding-top:10px;border-top:1px solid #e8e8e8}
  .notes-lbl{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#aaa;margin-bottom:5px}
  .notes-box p{font-size:12px;color:#444;line-height:1.7}
  .sig-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:24px;margin-top:24px;margin-bottom:28px}
  .sig-block .sig-line{border-bottom:1px solid #999;height:28px;margin-bottom:4px}
  .sig-block .sig-lbl{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#aaa}
  .doc-footer{padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}
  .foot-l,.foot-r{font-size:9.5px;color:#aaa}
  @media print{body{padding:0}#ptoolbar,#ptoolbar-spacer{display:none!important}@page{margin:18px 28px;size:letter}}
</style>
</head>
<body>
  <div id="ptoolbar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1e293b;color:#f1f5f9;display:flex;align-items:center;gap:10px;padding:10px 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
    <span style="font-weight:700;color:#94a3b8;flex:1">📄 Packing Slip Preview</span>
    <span id="editHint" style="font-size:11px;color:#60a5fa;display:none;margin-right:8px">✦ Click any text field to edit</span>
    <button id="editBtn" onclick="toggleEdit()" style="background:#334155;color:#f1f5f9;border:1px solid #475569;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:600">✏️ Edit Content</button>
    <button onclick="window.print()" style="background:#0d2044;color:#fff;border:1px solid #1e3a6e;border-radius:6px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:700">🖨️ Print</button>
  </div>
  <div id="ptoolbar-spacer" style="height:52px"></div>
  <script>
    var _editing=false,_els=[];
    function toggleEdit(){
      _editing=!_editing;
      var btn=document.getElementById('editBtn');
      var hint=document.getElementById('editHint');
      if(_editing){
        btn.textContent='✓ Done Editing';btn.style.background='#059669';btn.style.borderColor='#10b981';hint.style.display='inline';
        document.querySelectorAll('.addr-name,.addr-text,.notes-box p,.foot-l,.foot-r,.iname').forEach(function(el){
          el.contentEditable='true';el.style.outline='2px dashed #60a5fa';el.style.borderRadius='3px';el.style.minHeight='1em';_els.push(el);
        });
      } else {
        btn.textContent='✏️ Edit Content';btn.style.background='#334155';btn.style.borderColor='#475569';hint.style.display='none';
        _els.forEach(function(el){el.contentEditable='false';el.style.outline='';el.style.borderRadius='';});_els=[];
      }
    }
  </script>
<div class="page">

  <div class="doc-hdr">
    <img src="${logoSrc}" class="co-logo" alt="${fromName}"/>
    <div class="co-name">${fromName}</div>
    <div class="co-addr">${fromLine1} · ${fromLine2}</div>
  </div>

  <div class="doc-meta">
    <div class="doc-type">PACKING SLIP</div>
    <div class="doc-right">
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
