import { useEffect, useRef } from "react";
import { Router as WouterRouter, Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import {
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
import { Toaster } from "@/components/ui/sonner";
import { RoleProvider, useRole } from "@/context/RoleContext";
import { logAudit, setAuditUser, getCurrentAuditUser, AuditEntityType } from "@/lib/auditLog";
import {
  invalidateAfterMutation,
  patchListCache,
  refetchBusinessData,
  refetchMutationLists,
} from "@/lib/query-sync";
import UserSelectModal from "@/components/UserSelectModal";
import FactoryBg from "@/components/FactoryBg";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import Vendors from "@/pages/Vendors";
import Products from "@/pages/Products";
import Quotes from "@/pages/Quotes";
import Invoices from "@/pages/Invoices";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Bills from "@/pages/Bills";
import Shipments from "@/pages/Shipments";
import TaxRates from "@/pages/TaxRates";
import Settings from "@/pages/Settings";
import Accounting from "@/pages/Accounting";
import Banking from "@/pages/Banking";
import UserManagement from "@/pages/UserManagement";
import SalesLeads from "@/pages/SalesLeads";
import Auctions from "@/pages/Auctions";
import Returns from "@/pages/Returns";
import Tickets from "@/pages/Tickets";
import History from "@/pages/History";
import WalkIn from "@/pages/WalkIn";
import Documents from "@/pages/Documents";
import Estimates from "@/pages/Estimates";
import Inventory from "@/pages/Inventory";
import NotFound from "@/pages/not-found";

interface MutationLogDef {
  entityType: AuditEntityType;
  action: string;
  label: string;
}

const MUTATION_LOG_MAP: Record<string, MutationLogDef> = {
  createInvoice:              { entityType: "invoice",  action: "created",   label: "Invoice created" },
  updateInvoice:              { entityType: "invoice",  action: "updated",   label: "Invoice updated" },
  deleteInvoice:              { entityType: "invoice",  action: "deleted",   label: "Invoice deleted" },
  payInvoice:                 { entityType: "invoice",  action: "paid",      label: "Invoice marked paid" },
  createQuote:                { entityType: "quote",    action: "created",   label: "Quote created" },
  updateQuote:                { entityType: "quote",    action: "updated",   label: "Quote updated" },
  deleteQuote:                { entityType: "quote",    action: "deleted",   label: "Quote deleted" },
  convertQuoteToInvoice:      { entityType: "quote",    action: "converted", label: "Quote converted to invoice" },
  createEstimate:             { entityType: "quote",    action: "created",   label: "Estimate created" },
  updateEstimate:             { entityType: "quote",    action: "updated",   label: "Estimate updated" },
  deleteEstimate:             { entityType: "quote",    action: "deleted",   label: "Estimate deleted" },
  convertEstimateToInvoice:   { entityType: "quote",    action: "converted", label: "Estimate converted to invoice" },
  createPurchaseOrder:        { entityType: "po",       action: "created",   label: "Purchase order created" },
  updatePurchaseOrder:        { entityType: "po",       action: "updated",   label: "Purchase order updated" },
  deletePurchaseOrder:        { entityType: "po",       action: "deleted",   label: "Purchase order deleted" },
  convertPurchaseOrderToBill: { entityType: "po",       action: "converted", label: "Purchase order converted to bill" },
  createBill:                 { entityType: "bill",     action: "created",   label: "Bill created" },
  updateBill:                 { entityType: "bill",     action: "updated",   label: "Bill updated" },
  deleteBill:                 { entityType: "bill",     action: "deleted",   label: "Bill deleted" },
  payBill:                    { entityType: "bill",     action: "paid",      label: "Bill marked paid" },
  createShipment:             { entityType: "shipment", action: "created",   label: "Shipment created" },
  updateShipment:             { entityType: "shipment", action: "updated",   label: "Shipment updated" },
  deleteShipment:             { entityType: "shipment", action: "deleted",   label: "Shipment deleted" },
  createCustomer:             { entityType: "customer", action: "created",   label: "Customer created" },
  updateCustomer:             { entityType: "customer", action: "updated",   label: "Customer updated" },
  deleteCustomer:             { entityType: "customer", action: "deleted",   label: "Customer deleted" },
  createVendor:               { entityType: "vendor",   action: "created",   label: "Vendor created" },
  updateVendor:               { entityType: "vendor",   action: "updated",   label: "Vendor updated" },
  deleteVendor:               { entityType: "vendor",   action: "deleted",   label: "Vendor deleted" },
  createProduct:              { entityType: "product",  action: "created",   label: "Product created" },
  updateProduct:              { entityType: "product",  action: "updated",   label: "Product updated" },
  deleteProduct:              { entityType: "product",  action: "deleted",   label: "Product deleted" },
  updateInventoryItem:        { entityType: "product",  action: "updated",   label: "Inventory updated" },
  createTaxRate:              { entityType: "other",    action: "created",   label: "Tax rate created" },
  updateTaxRate:              { entityType: "other",    action: "updated",   label: "Tax rate updated" },
  deleteTaxRate:              { entityType: "other",    action: "deleted",   label: "Tax rate deleted" },
  createSalesLead:            { entityType: "other",    action: "created",   label: "Sales lead created" },
  updateSalesLead:            { entityType: "other",    action: "updated",   label: "Sales lead updated" },
  deleteSalesLead:            { entityType: "other",    action: "deleted",   label: "Sales lead deleted" },
  createAuction:              { entityType: "other",    action: "created",   label: "Auction saved" },
  updateAuction:              { entityType: "other",    action: "updated",   label: "Auction updated" },
  deleteAuction:              { entityType: "other",    action: "deleted",   label: "Auction deleted" },
  createTicket:               { entityType: "other",    action: "created",   label: "Ticket saved" },
  updateTicket:               { entityType: "other",    action: "updated",   label: "Ticket updated" },
  deleteTicket:               { entityType: "other",    action: "deleted",   label: "Ticket deleted" },
};

/** After any API mutation, refetch list queries so the UI matches the database. */
const MUTATION_SAVED_TOAST: Record<string, string> = {
  createCustomer: "Customer saved",
  updateCustomer: "Customer updated",
  deleteCustomer: "Customer deleted",
  createVendor: "Vendor saved",
  updateVendor: "Vendor updated",
  deleteVendor: "Vendor deleted",
  createProduct: "Product saved",
  updateProduct: "Product updated",
  deleteProduct: "Product deleted",
  updateInventoryItem: "Inventory updated",
  createInvoice: "Invoice saved",
  updateInvoice: "Invoice updated",
  deleteInvoice: "Invoice deleted",
  payInvoice: "Invoice payment saved",
  createQuote: "Quote saved",
  updateQuote: "Quote updated",
  deleteQuote: "Quote deleted",
  convertQuoteToInvoice: "Quote converted to invoice",
  createEstimate: "Estimate saved",
  updateEstimate: "Estimate updated",
  deleteEstimate: "Estimate deleted",
  convertEstimateToInvoice: "Estimate converted to invoice",
  createBill: "Bill saved",
  updateBill: "Bill updated",
  deleteBill: "Bill deleted",
  payBill: "Bill payment saved",
  createPurchaseOrder: "Purchase order saved",
  updatePurchaseOrder: "Purchase order updated",
  deletePurchaseOrder: "Purchase order deleted",
  convertPurchaseOrderToBill: "Bill created from PO",
  createShipment: "Shipment saved",
  updateShipment: "Shipment updated",
  deleteShipment: "Shipment deleted",
  createTaxRate: "Tax rate saved",
  updateTaxRate: "Tax rate updated",
  deleteTaxRate: "Tax rate deleted",
  createSalesLead: "Sales lead saved",
  updateSalesLead: "Sales lead updated",
  deleteSalesLead: "Sales lead deleted",
  createAuction: "Auction saved",
  updateAuction: "Auction updated",
  deleteAuction: "Auction deleted",
  createTicket: "Ticket saved",
  updateTicket: "Ticket updated",
  deleteTicket: "Ticket deleted",
};

const MUTATION_INVALIDATE: Record<string, Array<() => readonly unknown[]>> = {
  createCustomer: [getListCustomersQueryKey],
  updateCustomer: [getListCustomersQueryKey],
  deleteCustomer: [getListCustomersQueryKey],
  createVendor: [getListVendorsQueryKey],
  updateVendor: [getListVendorsQueryKey],
  deleteVendor: [getListVendorsQueryKey],
  createProduct: [getListProductsQueryKey, getListInventoryQueryKey],
  updateProduct: [getListProductsQueryKey],
  deleteProduct: [getListProductsQueryKey, getListInventoryQueryKey],
  updateInventoryItem: [getListInventoryQueryKey, getListProductsQueryKey],
  createQuote: [getListQuotesQueryKey],
  updateQuote: [getListQuotesQueryKey],
  deleteQuote: [getListQuotesQueryKey],
  convertQuoteToInvoice: [getListQuotesQueryKey, getListInvoicesQueryKey],
  createEstimate: [getListEstimatesQueryKey],
  updateEstimate: [getListEstimatesQueryKey],
  deleteEstimate: [getListEstimatesQueryKey],
  convertEstimateToInvoice: [getListEstimatesQueryKey, getListInvoicesQueryKey],
  createInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey],
  updateInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey, getListShipmentsQueryKey],
  deleteInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey, getListPurchaseOrdersQueryKey, getListShipmentsQueryKey],
  payInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey],
  createPurchaseOrder: [getListPurchaseOrdersQueryKey, getListInvoicesQueryKey],
  updatePurchaseOrder: [getListPurchaseOrdersQueryKey],
  deletePurchaseOrder: [getListPurchaseOrdersQueryKey],
  convertPurchaseOrderToBill: [getListPurchaseOrdersQueryKey, getListBillsQueryKey],
  createBill: [getListBillsQueryKey],
  updateBill: [getListBillsQueryKey],
  deleteBill: [getListBillsQueryKey],
  payBill: [getListBillsQueryKey],
  createShipment: [getListShipmentsQueryKey, getListInvoicesQueryKey],
  updateShipment: [getListShipmentsQueryKey, getListInvoicesQueryKey],
  deleteShipment: [getListShipmentsQueryKey, getListInvoicesQueryKey],
  createTaxRate: [getListTaxRatesQueryKey],
  updateTaxRate: [getListTaxRatesQueryKey],
  deleteTaxRate: [getListTaxRatesQueryKey],
  createSalesLead: [getListSalesLeadsQueryKey],
  updateSalesLead: [getListSalesLeadsQueryKey],
  deleteSalesLead: [getListSalesLeadsQueryKey],
  createAuction: [() => ["auctions"] as const],
  updateAuction: [() => ["auctions"] as const],
  deleteAuction: [() => ["auctions"] as const],
  createTicket: [() => ["tickets"] as const],
  updateTicket: [() => ["tickets"] as const],
  deleteTicket: [() => ["tickets"] as const],
};

function mutationKeyName(mutation: { options: { mutationKey?: unknown } }): string | undefined {
  const key = mutation.options.mutationKey;
  return Array.isArray(key) ? (key[0] as string) : undefined;
}

function mutationErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Could not save changes to the database. Check that the API is running.";
}

function extractEntityRef(data: any, variables: any): { id: string; ref: string } {
  const src = data ?? {};
  const vars = variables?.data ?? variables ?? {};
  const id = String(
    src.id ?? vars.id ?? "?"
  );
  const ref =
    src.invoiceNumber ??
    src.quoteNumber ??
    src.estimateNumber ??
    src.poNumber ??
    src.billNumber ??
    src.trackingNumber ??
    src.name ??
    src.company ??
    src.companyName ??
    src.leadName ??
    src.subject ??
    src.sku ??
    vars.invoiceNumber ??
    vars.quoteNumber ??
    vars.name ??
    vars.company ??
    vars.companyName ??
    src.projectName ??
    vars.projectName ??
    (id !== "?" ? `#${id}` : "—");
  return { id, ref: String(ref) };
}

let queryClient: QueryClient;

function applyListCachePatch(key: string | undefined, data: unknown, variables: unknown) {
  if (!data || typeof data !== "object" || !("id" in data)) return;
  const record = data as { id: number };
  const id = (variables as { id?: number })?.id;

  if (key === "createInvoice" || key === "convertQuoteToInvoice" || key === "convertEstimateToInvoice") {
    patchListCache(queryClient, getListInvoicesQueryKey(), "create", record);
  }
  if (key === "updateInvoice") patchListCache(queryClient, getListInvoicesQueryKey(), "update", record);
  if (key === "deleteInvoice" && id != null) patchListCache(queryClient, getListInvoicesQueryKey(), "delete", null, id);
  if (key === "payInvoice") patchListCache(queryClient, getListInvoicesQueryKey(), "update", record);

  if (key === "createQuote") patchListCache(queryClient, getListQuotesQueryKey(), "create", record);
  if (key === "updateQuote") patchListCache(queryClient, getListQuotesQueryKey(), "update", record);
  if (key === "deleteQuote" && id != null) patchListCache(queryClient, getListQuotesQueryKey(), "delete", null, id);

  if (key === "createEstimate") patchListCache(queryClient, getListEstimatesQueryKey(), "create", record);
  if (key === "updateEstimate") patchListCache(queryClient, getListEstimatesQueryKey(), "update", record);
  if (key === "deleteEstimate" && id != null) patchListCache(queryClient, getListEstimatesQueryKey(), "delete", null, id);

  if (key === "createBill") patchListCache(queryClient, getListBillsQueryKey(), "create", record);
  if (key === "updateBill") patchListCache(queryClient, getListBillsQueryKey(), "update", record);
  if (key === "deleteBill" && id != null) patchListCache(queryClient, getListBillsQueryKey(), "delete", null, id);

  if (key === "createPurchaseOrder") patchListCache(queryClient, getListPurchaseOrdersQueryKey(), "create", record);
  if (key === "updatePurchaseOrder") patchListCache(queryClient, getListPurchaseOrdersQueryKey(), "update", record);
  if (key === "deletePurchaseOrder" && id != null) {
    patchListCache(queryClient, getListPurchaseOrdersQueryKey(), "delete", null, id);
  }
}

const mutationCache = new MutationCache({
  onSuccess(data: unknown, variables: unknown, _context: unknown, mutation) {
    const key = mutationKeyName(mutation);
    if (key) {
      applyListCachePatch(key, data, variables);
      const invalidators = MUTATION_INVALIDATE[key];
      if (invalidators) {
        const getKeys = invalidators.map((getKey) =>
          typeof getKey === "function" ? getKey : () => getKey,
        );
        void refetchMutationLists(queryClient, getKeys).then(() =>
          invalidateAfterMutation(queryClient, key),
        );
      } else {
        void invalidateAfterMutation(queryClient, key);
      }
    }

    const savedLabel = key ? MUTATION_SAVED_TOAST[key] : undefined;
    if (savedLabel) {
      const { ref } = extractEntityRef(data, variables);
      toast.success(savedLabel, {
        description: ref && ref !== "—" ? `Stored in database · ${ref}` : "Stored in database until you delete it",
      });
    }

    if (!key) return;
    const def = MUTATION_LOG_MAP[key];
    if (!def) return;

    const { id, ref } = extractEntityRef(data, variables);
    const user = getCurrentAuditUser();

    logAudit({
      user,
      action: def.action,
      entityType: def.entityType,
      entityId: id,
      entityRef: ref,
      description: `${def.label}${ref && ref !== `#${id}` ? ` — ${ref}` : ""}`,
    });
  },
  onError(error: unknown, _variables: unknown, _context: unknown, mutation) {
    const key = mutationKeyName(mutation);
    const label = (key && MUTATION_LOG_MAP[key]?.label) || "Save failed";
    toast.error(label, { description: mutationErrorMessage(error) });
  },
});

queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 15 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

function AccessDenied() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="glass-card p-10 max-w-sm text-center">
        <div className="text-[32px] mb-3">🔒</div>
        <h2 className="text-[17px] font-black mb-2" style={{ color: "#ffffff" }}>Access Denied</h2>
        <p className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>
          You don't have permission to view this page.
        </p>
      </div>
    </div>
  );
}

function GuardedRoute({ component: Component, path }: { component: React.ComponentType; path: string }) {
  const { hasAccess, currentUser } = useRole();
  if (!currentUser) return null;
  if (!hasAccess(path)) return <AccessDenied />;
  return <Component />;
}

function AuditUserSync() {
  const { currentUser } = useRole();
  useEffect(() => {
    setAuditUser(currentUser);
  }, [currentUser]);
  return null;
}

/** After sign-in or restored session, pull invoices/quotes/etc. from the database. */
function DataSyncOnAuth() {
  const { currentUser } = useRole();
  const syncedRef = useRef<string | null>(null);
  const hadUserRef = useRef(false);

  useEffect(() => {
    if (!currentUser) {
      syncedRef.current = null;
      if (hadUserRef.current) {
        queryClient.clear();
      }
      hadUserRef.current = false;
      return;
    }
    hadUserRef.current = true;
    const sessionKey = `${currentUser.email}:${currentUser.role}`;
    if (syncedRef.current === sessionKey) return;
    syncedRef.current = sessionKey;
    void refetchBusinessData(queryClient);
  }, [currentUser]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/"                component={() => <GuardedRoute component={Dashboard}      path="/" />} />
      <Route path="/customers"       component={() => <GuardedRoute component={Customers}      path="/customers" />} />
      <Route path="/vendors"         component={() => <GuardedRoute component={Vendors}        path="/vendors" />} />
      <Route path="/products"        component={() => <GuardedRoute component={Products}       path="/products" />} />
      <Route path="/quotes"          component={() => <GuardedRoute component={Quotes}         path="/quotes" />} />
      <Route path="/invoices"        component={() => <GuardedRoute component={Invoices}       path="/invoices" />} />
      <Route path="/purchase-orders" component={() => <GuardedRoute component={PurchaseOrders} path="/purchase-orders" />} />
      <Route path="/bills"           component={() => <GuardedRoute component={Bills}          path="/bills" />} />
      <Route path="/shipments"       component={() => <GuardedRoute component={Shipments}      path="/shipments" />} />
      <Route path="/tax-rates"       component={() => <GuardedRoute component={TaxRates}       path="/tax-rates" />} />
      <Route path="/settings"        component={() => <GuardedRoute component={Settings}       path="/settings" />} />
      <Route path="/accounting"      component={() => <GuardedRoute component={Accounting}     path="/accounting" />} />
      <Route path="/banking"         component={() => <GuardedRoute component={Banking}        path="/banking" />} />
      <Route path="/users"           component={() => <GuardedRoute component={UserManagement} path="/users" />} />
      <Route path="/sales-leads"     component={() => <GuardedRoute component={SalesLeads}      path="/sales-leads" />} />
      <Route path="/auctions"        component={() => <GuardedRoute component={Auctions}        path="/auctions" />} />
      <Route path="/returns-refunds" component={() => <GuardedRoute component={Returns}         path="/returns-refunds" />} />
      <Route path="/tickets"         component={() => <GuardedRoute component={Tickets}          path="/tickets" />} />
      <Route path="/history"         component={() => <GuardedRoute component={History}          path="/history" />} />
      <Route path="/walk-in"         component={() => <GuardedRoute component={WalkIn}           path="/walk-in" />} />
      <Route path="/documents"       component={() => <GuardedRoute component={Documents}        path="/documents" />} />
      <Route path="/estimates"       component={() => <GuardedRoute component={Estimates}        path="/estimates" />} />
      <Route path="/inventory"       component={() => <GuardedRoute component={Inventory}        path="/inventory" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  return (
    <>
      <Toaster richColors closeButton position="top-right" />
      <AuditUserSync />
      <DataSyncOnAuth />
      <FactoryBg />
      <UserSelectModal />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <RoleProvider>
          <AppInner />
        </RoleProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
