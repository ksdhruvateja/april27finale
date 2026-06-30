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

function save(list: AuctionOrder[]): void {
  window.localStorage.setItem(AUCTIONS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(AUCTIONS_EVENT));
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
  save([next, ...current]);
  return next;
}

export function deleteAuction(id: number): void {
  const current = listAuctions();
  save(current.filter((a) => a.id !== id));
}

export function updateAuction(id: number, updates: Partial<Omit<AuctionOrder, "id" | "createdAt">>): void {
  const current = listAuctions();
  save(current.map((a) => (a.id === id ? { ...a, ...updates } : a)));
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
  save(next);
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
  save(next);
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
