import {
  LayoutDashboard, Users, Store, Package, FileText,
  Receipt, ShoppingCart, CreditCard, Truck, Percent,
  Settings, BookOpen, Building2, UserCog, LogOut, UserCheck, Gavel, ArrowLeftRight, Headphones, Clock, Zap, FolderOpen,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import brandLogo from "@assets/image_1785249843852.png";
import { useRole, UserRole, checkAccess } from "@/context/RoleContext";
import { useCompanyProfile } from "@/lib/companyProfile";

const navGroups = [
  {
    label: "MAIN",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",  href: "/" },
      { icon: Gavel,           label: "Auctions",   href: "/auctions" },
      { icon: Headphones,      label: "Tickets",    href: "/tickets" },
    ],
  },
  {
    label: "SALES",
    items: [
      { icon: Users,           label: "Customers",        href: "/customers"       },
      { icon: FileText,        label: "Quotes",           href: "/quotes"          },
      { icon: Receipt,         label: "Invoices",         href: "/invoices"        },
      { icon: Zap,             label: "Walk-in Sale",     href: "/walk-in"         },
      { icon: UserCheck,       label: "Sales Leads",      href: "/sales-leads"     },
      { icon: ArrowLeftRight,  label: "Returns & Refunds",href: "/returns-refunds" },
    ],
  },
  {
    label: "PURCHASING",
    items: [
      { icon: Store,        label: "Vendors",         href: "/vendors"         },
      { icon: ShoppingCart, label: "Purchase Orders", href: "/purchase-orders" },
      { icon: CreditCard,   label: "Bills",           href: "/bills"           },
    ],
  },
  {
    label: "INVENTORY",
    items: [
      { icon: Package, label: "Products",  href: "/products"  },
      { icon: Truck,   label: "Shipments", href: "/shipments" },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { icon: Percent,   label: "Tax Rates",  href: "/tax-rates"  },
      { icon: BookOpen,  label: "Accounting", href: "/accounting" },
      { icon: Building2, label: "Banking",    href: "/banking"    },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { icon: FolderOpen, label: "Documents",  href: "/documents" },
      { icon: UserCog,    label: "Users",      href: "/users"    },
      { icon: Clock,      label: "History",    href: "/history"  },
      { icon: Settings,   label: "Settings",   href: "/settings" },
    ],
  },
];

const ROLE_LABEL: Record<UserRole, string> = {
  developer:  "Developer",
  admin:      "Admin",
  sales:      "Sales",
  shipper:    "Shipper",
  accountant: "Accountant",
  viewer:     "Viewer",
  custom:     "Custom",
};

interface SidebarProps {
  embedded?: boolean;
}

export default function Sidebar({ embedded }: SidebarProps) {
  const [location] = useLocation();
  const { currentUser, setCurrentUser } = useRole();
  const role = (currentUser?.role ?? "viewer") as UserRole;
  const companyProfile = useCompanyProfile();
  const navScrollRef = useRef<HTMLDivElement>(null);
  const SCROLL_KEY = "sidebar-nav-scroll-top";

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const saved = window.sessionStorage.getItem(SCROLL_KEY);
    if (saved) el.scrollTop = Number(saved) || 0;
  }, [location]);

  const visibleGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        checkAccess(role, item.href, currentUser?.customPermissions)
      ),
    }))
    .filter(group => group.items.length > 0);

  const roleLabel = role === "custom"
    ? "Custom Role"
    : ROLE_LABEL[role];

  return (
    <div className="flex flex-col h-full w-full bg-[#d9edff]/88 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 py-5 flex-shrink-0 border-b border-[#c2dbf3]">
        <img src={brandLogo} alt="Logo" className="w-9 h-9 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[14px] font-black leading-none tracking-tight text-slate-900">
            {companyProfile.name}
          </div>
          <div className="text-[10px] mt-0.5 font-semibold tracking-wide uppercase text-slate-500">
            Business Dashboard
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <div
        ref={navScrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide py-4 px-3 flex flex-col gap-1"
        onScroll={() => {
          if (navScrollRef.current) {
            window.sessionStorage.setItem(SCROLL_KEY, String(navScrollRef.current.scrollTop));
          }
        }}
      >
        {visibleGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? "mt-3" : ""}>
            <div
              className="text-[9.5px] font-black tracking-widest px-3 mb-1.5 uppercase select-none text-slate-400"
              style={{ letterSpacing: "0.12em" }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === "/"
                ? location === "/"
                : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 mb-0.5 border ${
                      isActive
                        ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                        : "bg-transparent border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-200"
                    }`}
                    onClick={() => {
                      if (navScrollRef.current) {
                        window.sessionStorage.setItem(SCROLL_KEY, String(navScrollRef.current.scrollTop));
                      }
                    }}
                  >
                    <Icon
                      size={14}
                      strokeWidth={isActive ? 2.5 : 2.0}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      className="text-[12.5px] truncate leading-none"
                      style={{
                        fontWeight: isActive ? 800 : 600,
                      }}
                    >
                      {item.label}
                    </span>
                    {isActive && (
                      <div className="ml-auto w-1 h-4 rounded-full flex-shrink-0 bg-blue-500" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex-shrink-0 px-3 py-4 border-t border-[#c2dbf3]">
        {currentUser ? (
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all bg-slate-50 border border-slate-200 hover:bg-slate-100"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 bg-blue-600">
              {(currentUser.name ?? currentUser.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold leading-none truncate text-slate-800">
                {currentUser.name ?? currentUser.email}
              </div>
              <div className="text-[10px] mt-0.5 font-semibold text-slate-500">
                {roleLabel}
              </div>
            </div>
            <button
              onClick={() => setCurrentUser(null)}
              title="Sign out"
              className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all text-slate-400 hover:text-blue-600"
            >
              <LogOut size={12} />
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 text-[11px] font-semibold text-slate-400">
            Not signed in
          </div>
        )}
      </div>
    </div>
  );
}
