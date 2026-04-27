import { Router as WouterRouter, Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RoleProvider, useRole } from "@/context/RoleContext";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

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
      <Route path="/auctions"        component={() => <GuardedRoute component={Auctions}       path="/auctions" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  return (
    <>
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
