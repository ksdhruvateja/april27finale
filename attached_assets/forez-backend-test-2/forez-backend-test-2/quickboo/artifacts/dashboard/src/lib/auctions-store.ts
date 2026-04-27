export interface AuctionOrder {
  id: number;
  projectName: string;
  bidAmount: number;
  costAmount: number;
  invoiceId: number | null;
  linkedInvoiceIds?: number[];
  purchaseOrderIds: number[];
  shipmentIds: number[];
  billIds: number[];
  notes: string;
  createdAt: string;
}

const AUCTIONS_KEY = "forez.auctions.v1";
const AUCTIONS_EVENT = "forez:auctions-updated";

function parse(raw: string | null): AuctionOrder[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function listAuctions(): AuctionOrder[] {
  if (typeof window === "undefined") return [];
  return parse(window.localStorage.getItem(AUCTIONS_KEY)).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function createAuction(input: Omit<AuctionOrder, "id" | "createdAt">): AuctionOrder {
  const current = listAuctions();
  const next: AuctionOrder = {
    ...input,
    id: current.length ? Math.max(...current.map((a) => a.id)) + 1 : 1,
    createdAt: new Date().toISOString(),
  };
  const merged = [next, ...current];
  window.localStorage.setItem(AUCTIONS_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(AUCTIONS_EVENT));
  return next;
}

export function appendInvoiceToAuction(auctionId: number, invoiceId: number): void {
  const current = listAuctions();
  const next = current.map((a) => {
    if (a.id !== auctionId) return a;
    const ids = Array.from(new Set([...(a.linkedInvoiceIds ?? (a.invoiceId ? [a.invoiceId] : [])), invoiceId]));
    return {
      ...a,
      linkedInvoiceIds: ids,
      invoiceId: a.invoiceId ?? invoiceId,
    };
  });
  window.localStorage.setItem(AUCTIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(AUCTIONS_EVENT));
}

export function setAuctionInvoiceLinks(auctionId: number, invoiceIds: number[]): void {
  const current = listAuctions();
  const normalized = Array.from(new Set(invoiceIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  const next = current.map((a) => {
    if (a.id !== auctionId) return a;
    return {
      ...a,
      linkedInvoiceIds: normalized,
      invoiceId: a.invoiceId ?? normalized[0] ?? null,
    };
  });
  window.localStorage.setItem(AUCTIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(AUCTIONS_EVENT));
}

export function useAuctionsSync(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(AUCTIONS_EVENT, handler as EventListener);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(AUCTIONS_EVENT, handler as EventListener);
    window.removeEventListener("storage", handler);
  };
}
