import { useEffect } from "react";
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
};

/** After any API mutation, refetch list queries so the UI matches the database. */
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
  updateInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey],
  deleteInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey],
  payInvoice: [getListInvoicesQueryKey, getListCustomersQueryKey],
  createPurchaseOrder: [getListPurchaseOrdersQueryKey],
  updatePurchaseOrder: [getListPurchaseOrdersQueryKey],
  deletePurchaseOrder: [getListPurchaseOrdersQueryKey],
  convertPurchaseOrderToBill: [getListPurchaseOrdersQueryKey, getListBillsQueryKey],
  createBill: [getListBillsQueryKey],
  updateBill: [getListBillsQueryKey],
  deleteBill: [getListBillsQueryKey],
  payBill: [getListBillsQueryKey],
  createShipment: [getListShipmentsQueryKey],
  updateShipment: [getListShipmentsQueryKey],
  createTaxRate: [getListTaxRatesQueryKey],
  updateTaxRate: [getListTaxRatesQueryKey],
  deleteTaxRate: [getListTaxRatesQueryKey],
  createSalesLead: [getListSalesLeadsQueryKey],
  updateSalesLead: [getListSalesLeadsQueryKey],
  deleteSalesLead: [getListSalesLeadsQueryKey],
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
    (id !== "?" ? `#${id}` : "—");
  return { id, ref: String(ref) };
}

let queryClient: QueryClient;

const mutationCache = new MutationCache({
  onSuccess(data: unknown, variables: unknown, _context: unknown, mutation) {
    const key = mutationKeyName(mutation);
    if (key) {
      const invalidators = MUTATION_INVALIDATE[key];
      if (invalidators) {
        for (const getKey of invalidators) {
          void queryClient.invalidateQueries({ queryKey: getKey() });
        }
      }
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
      staleTime: 30 * 1000,
      gcTime: 30 * 60 * 1000,
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
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  return (
    <>
      <Toaster richColors closeButton position="top-right" />
      <AuditUserSync />
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
