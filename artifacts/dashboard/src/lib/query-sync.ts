import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardStatsQueryKey,
  getListBillsQueryKey,
  getListCustomersQueryKey,
  getListEstimatesQueryKey,
  getListInventoryQueryKey,
  getListInvoicesQueryKey,
  getListProductsQueryKey,
  getListPurchaseOrdersQueryKey,
  getListQuotesQueryKey,
  getListSalesLeadsQueryKey,
  getListShipmentsQueryKey,
  getListTaxRatesQueryKey,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";

const PRIMARY_LIST_KEYS = [
  getListInvoicesQueryKey,
  getListQuotesQueryKey,
  getListEstimatesQueryKey,
  getListBillsQueryKey,
  getListPurchaseOrdersQueryKey,
  getListShipmentsQueryKey,
  getListCustomersQueryKey,
  getListVendorsQueryKey,
  getListProductsQueryKey,
  getListInventoryQueryKey,
  getListSalesLeadsQueryKey,
  getListTaxRatesQueryKey,
  getGetDashboardStatsQueryKey,
] as const;

/** Load all business records from the API (after sign-in or page reload with session). */
export async function refetchBusinessData(qc: QueryClient): Promise<void> {
  await Promise.all([
    ...PRIMARY_LIST_KEYS.map((getKey) => qc.refetchQueries({ queryKey: getKey() })),
    qc.refetchQueries({ queryKey: ["auctions"] }),
    qc.refetchQueries({ queryKey: ["tickets"] }),
    qc.refetchQueries({ queryKey: ["returns-refunds"] }),
    qc.refetchQueries({ queryKey: ["documents"] }),
    qc.refetchQueries({ queryKey: ["bank-accounts"] }),
    qc.refetchQueries({ queryKey: ["accounting-pnl"] }),
    qc.refetchQueries({ queryKey: ["accounting-ar"] }),
    qc.refetchQueries({ queryKey: ["accounting-ap"] }),
  ]);
}

/** Refetch list queries immediately after a save so lists match the database. */
export async function refetchMutationLists(
  qc: QueryClient,
  getKeys: Array<() => readonly unknown[]>,
): Promise<void> {
  await Promise.all(
    getKeys.map((getKey) => qc.refetchQueries({ queryKey: getKey() })),
  );
}

type ListRecord = { id: number };

/** Instantly show a new/updated row in list views before refetch completes. */
export function patchListCache<T extends ListRecord>(
  qc: QueryClient,
  queryKey: readonly unknown[],
  action: "create" | "update" | "delete",
  record?: T | null,
  deleteId?: number,
): void {
  qc.setQueryData<T[]>(queryKey, (old) => {
    const list = old ?? [];
    if (action === "create" && record) {
      const idx = list.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], ...record };
        return next;
      }
      return [record, ...list];
    }
    if (action === "update" && record) {
      return list.map((r) => (r.id === record.id ? { ...r, ...record } : r));
    }
    if (action === "delete" && deleteId != null) {
      return list.filter((r) => r.id !== deleteId);
    }
    return list;
  });
}

const ACCOUNTING_KEYS = [
  ["accounting-pnl"],
  ["accounting-ar"],
  ["accounting-ap"],
  ["accounting-gl"],
  ["accounting-customer-revenue"],
  ["accounting-product-profit"],
] as const;

const FINANCIAL_MUTATIONS = new Set([
  "createInvoice",
  "updateInvoice",
  "deleteInvoice",
  "payInvoice",
  "createQuote",
  "updateQuote",
  "deleteQuote",
  "convertQuoteToInvoice",
  "createEstimate",
  "updateEstimate",
  "deleteEstimate",
  "convertEstimateToInvoice",
  "createPurchaseOrder",
  "updatePurchaseOrder",
  "deletePurchaseOrder",
  "convertPurchaseOrderToBill",
  "createBill",
  "updateBill",
  "deleteBill",
  "payBill",
  "createShipment",
  "updateShipment",
  "deleteShipment",
]);

/** Refetch dashboard, accounting, and cross-linked lists after any write. */
export async function invalidateAfterMutation(
  qc: QueryClient,
  mutationKey: string | undefined,
): Promise<void> {
  if (!mutationKey) return;

  if (FINANCIAL_MUTATIONS.has(mutationKey)) {
    await qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    for (const key of ACCOUNTING_KEYS) {
      await qc.invalidateQueries({ queryKey: key });
    }
    await qc.invalidateQueries({ queryKey: ["auctions"] });
  }

  switch (mutationKey) {
    case "createInvoice":
    case "updateInvoice":
    case "deleteInvoice":
    case "payInvoice":
    case "convertQuoteToInvoice":
    case "convertEstimateToInvoice":
      await qc.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      await qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      await qc.invalidateQueries({ queryKey: getListBillsQueryKey() });
      break;
    case "createShipment":
    case "updateShipment":
    case "deleteShipment":
      await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      break;
    case "createPurchaseOrder":
    case "updatePurchaseOrder":
    case "deletePurchaseOrder":
    case "convertPurchaseOrderToBill":
      await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      await qc.invalidateQueries({ queryKey: getListBillsQueryKey() });
      break;
    case "createBill":
    case "updateBill":
    case "deleteBill":
    case "payBill":
      await qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      break;
    case "createCustomer":
    case "updateCustomer":
    case "deleteCustomer":
      await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      await qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      await qc.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
      await qc.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      break;
    case "createProduct":
    case "updateProduct":
    case "deleteProduct":
    case "updateInventoryItem":
      await qc.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      await qc.invalidateQueries({ queryKey: ["stock-movements"] });
      await qc.invalidateQueries({ queryKey: ["product-analytics"] });
      break;
    case "createAuction":
    case "updateAuction":
    case "deleteAuction":
      await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      await qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      await qc.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      await qc.invalidateQueries({ queryKey: getListBillsQueryKey() });
      break;
    case "createTicket":
    case "updateTicket":
    case "deleteTicket":
      break;
    default:
      break;
  }

  await qc.invalidateQueries({ queryKey: ["returns-refunds"] });
}
