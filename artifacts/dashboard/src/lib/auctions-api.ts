import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AuctionOrder {
  id: number;
  projectName: string;
  bidAmount: number;
  costAmount: number;
  invoiceId: number | null;
  linkedInvoiceIds: number[];
  purchaseOrderIds: number[];
  shipmentIds: number[];
  billIds: number[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateAuctionInput = Omit<AuctionOrder, "id" | "createdAt" | "updatedAt">;
export type UpdateAuctionInput = Partial<CreateAuctionInput>;

const KEY = ["auctions"] as const;

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null as T;
  return res.json();
}

export function useListAuctions() {
  return useQuery<AuctionOrder[]>({
    queryKey: KEY,
    queryFn: () => apiFetch<AuctionOrder[]>("/api/auctions"),
    staleTime: 1000 * 30,
  });
}

export function useCreateAuction() {
  const qc = useQueryClient();
  return useMutation<AuctionOrder, Error, CreateAuctionInput>({
    mutationFn: (data) => apiFetch("/api/auctions", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAuction() {
  const qc = useQueryClient();
  return useMutation<AuctionOrder, Error, { id: number; data: UpdateAuctionInput }>({
    mutationFn: ({ id, data }) => apiFetch(`/api/auctions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAuction() {
  const qc = useQueryClient();
  return useMutation<null, Error, number>({
    mutationFn: (id) => apiFetch(`/api/auctions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export const AUCTIONS_KEY = KEY;

export interface InventoryLocation {
  id: number;
  name: string;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface StockMovement {
  id: number;
  productId: number;
  productName?: string | null;
  productSku?: string | null;
  movementType: "in" | "out" | "transfer" | "adjust" | "initial";
  quantity: number;
  locationId?: number | null;
  toLocationId?: number | null;
  referenceId?: number | null;
  referenceType?: string | null;
  notes?: string | null;
  createdAt: string;
}

export function useListInventoryLocations() {
  return useQuery<InventoryLocation[]>({
    queryKey: ["inventory-locations"],
    queryFn: () => apiFetch("/api/inventory-locations"),
  });
}

export function useCreateInventoryLocation() {
  const qc = useQueryClient();
  return useMutation<InventoryLocation, Error, { name: string; address?: string; notes?: string }>({
    mutationFn: (data) => apiFetch("/api/inventory-locations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-locations"] }),
  });
}

export function useDeleteInventoryLocation() {
  const qc = useQueryClient();
  return useMutation<null, Error, number>({
    mutationFn: (id) => apiFetch(`/api/inventory-locations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-locations"] }),
  });
}

export function useListStockMovements(productId?: number) {
  return useQuery<StockMovement[]>({
    queryKey: ["stock-movements", productId],
    queryFn: () => apiFetch(`/api/stock-movements${productId ? `?productId=${productId}` : ""}`),
  });
}

export function useCreateStockMovement() {
  const qc = useQueryClient();
  return useMutation<StockMovement, Error, Omit<StockMovement, "id" | "createdAt" | "productName" | "productSku">>({
    mutationFn: (data) => apiFetch("/api/stock-movements", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function listAuctionsSync(): AuctionOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("forez.auctions.v1");
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
