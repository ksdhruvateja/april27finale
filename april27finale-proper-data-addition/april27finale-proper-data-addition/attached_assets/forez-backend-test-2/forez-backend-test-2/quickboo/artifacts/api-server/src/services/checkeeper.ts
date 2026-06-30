const BASE = "https://my.checkeeper.com/api/v2";

export function isConfigured(): boolean {
  return !!process.env.CHECKEEPER_TOKEN;
}

export interface CheckParams {
  payTo: string;
  amount: number;
  date: string;
  checkNumber: string;
  memo?: string;
  routingNumber: string;
  accountNumber: string;
  payerName: string;
  payerAddress?: string;
  payeeAddress?: string;
}

export interface CheckkeeperResult {
  checkId: string;
  status: string;
  pdfUrl?: string;
}

export async function submitCheck(params: CheckParams): Promise<CheckkeeperResult> {
  const token = process.env.CHECKEEPER_TOKEN;
  if (!token) throw new Error("CHECKEEPER_TOKEN is not set");

  const body: Record<string, string> = {
    token,
    date: params.date,
    number: params.checkNumber,
    routing: params.routingNumber,
    account: params.accountNumber,
    name: params.payTo,
    amount: params.amount.toFixed(2),
  };
  if (params.memo) body.memo = params.memo;
  if (params.payerName) body.bank_name = params.payerName;
  if (params.payeeAddress) body.address = params.payeeAddress;

  const res = await fetch(`${BASE}/check/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Checkeeper error (${res.status}): ${err}`);
  }
  const data = await res.json() as Record<string, unknown>;
  return {
    checkId: String(data.id ?? data.check_id ?? data.number ?? params.checkNumber),
    status: String(data.status ?? "submitted"),
    pdfUrl: data.pdf as string | undefined ?? data.pdf_url as string | undefined,
  };
}
