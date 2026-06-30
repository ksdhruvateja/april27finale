const BASE =
  process.env.DWOLLA_ENV === "production"
    ? "https://api.dwolla.com"
    : "https://api-sandbox.dwolla.com";

export function isConfigured(): boolean {
  return !!(process.env.DWOLLA_KEY && process.env.DWOLLA_SECRET);
}

async function getToken(): Promise<string> {
  const key = process.env.DWOLLA_KEY;
  const secret = process.env.DWOLLA_SECRET;
  if (!key || !secret) throw new Error("DWOLLA_KEY and DWOLLA_SECRET are not set");
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${creds}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dwolla auth failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export interface AchTransferParams {
  amount: number;
  currency?: string;
  note?: string;
  destRoutingNumber: string;
  destAccountNumber: string;
  destName: string;
}

export interface DwollaResult {
  transferId: string;
  status: string;
}

export async function initiateAchTransfer(params: AchTransferParams): Promise<DwollaResult> {
  const token = await getToken();
  const hdrs = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.dwolla.v1.hal+json",
    "Content-Type": "application/vnd.dwolla.v1.hal+json",
  };

  const rootRes = await fetch(`${BASE}/`, { headers: hdrs });
  if (!rootRes.ok) throw new Error(`Dwolla root error (${rootRes.status})`);
  const root = await rootRes.json() as { _links: { account: { href: string } } };
  const accountUrl = root._links?.account?.href;
  if (!accountUrl) throw new Error("Could not resolve Dwolla account URL");

  const fsRes = await fetch(`${accountUrl}/funding-sources`, { headers: hdrs });
  if (!fsRes.ok) throw new Error(`Dwolla funding-sources error (${fsRes.status})`);
  const fsData = await fsRes.json() as { _embedded: { "funding-sources": Array<{ removed?: boolean; bankAccountType?: string; _links: { self: { href: string } } }> } };
  const sources = fsData._embedded?.["funding-sources"] ?? [];
  const sourceFundingUrl = sources.find(s => !s.removed && s.bankAccountType !== "balance")?._links?.self?.href;
  if (!sourceFundingUrl) throw new Error("No verified funding source in Dwolla account — add one in the Dwolla dashboard first");

  const custBody = {
    firstName: params.destName.split(" ")[0] || params.destName,
    lastName: params.destName.split(" ").slice(1).join(" ") || "Vendor",
    email: `vendor-${Date.now()}@noreply.forez.internal`,
    type: "receive-only",
    businessName: params.destName,
  };
  const custRes = await fetch(`${BASE}/customers`, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify(custBody),
  });
  if (!custRes.ok && custRes.status !== 303) {
    const err = await custRes.text();
    throw new Error(`Dwolla customer error (${custRes.status}): ${err}`);
  }
  const custUrl = custRes.headers.get("location");
  if (!custUrl) throw new Error("Dwolla did not return customer location header");

  const destFsBody = {
    routingNumber: params.destRoutingNumber,
    accountNumber: params.destAccountNumber,
    bankAccountType: "checking",
    name: `${params.destName} Checking`,
  };
  const destFsRes = await fetch(`${custUrl}/funding-sources`, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify(destFsBody),
  });
  if (!destFsRes.ok && destFsRes.status !== 303) {
    const err = await destFsRes.text();
    throw new Error(`Dwolla dest funding-source error (${destFsRes.status}): ${err}`);
  }
  const destFundingUrl = destFsRes.headers.get("location");
  if (!destFundingUrl) throw new Error("Dwolla did not return destination funding-source location");

  const transferBody = {
    _links: {
      source: { href: sourceFundingUrl },
      destination: { href: destFundingUrl },
    },
    amount: {
      currency: params.currency ?? "USD",
      value: params.amount.toFixed(2),
    },
    metadata: { note: params.note ?? "" },
  };
  const tRes = await fetch(`${BASE}/transfers`, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify(transferBody),
  });
  if (!tRes.ok) {
    const err = await tRes.text();
    throw new Error(`Dwolla transfer error (${tRes.status}): ${err}`);
  }
  const transferUrl = tRes.headers.get("location");
  if (!transferUrl) throw new Error("Dwolla did not return transfer location");
  return { transferId: transferUrl, status: "pending" };
}
