import { Bell, RefreshCw, ChevronLeft, Search, X } from "lucide-react";
import GlobalSearch from "./GlobalSearch";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  tabs?: string[];
  activeTab?: number;
  setActiveTab?: (i: number) => void;
  onBack?: () => void;
  actions?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}

export default function Header({
  title = "Dashboard",
  subtitle,
  tabs = [],
  activeTab = 0,
  setActiveTab,
  onBack,
  actions,
  searchValue,
  onSearchChange,
}: HeaderProps) {
  return (
    <div className="flex-shrink-0 px-6 md:px-7 bg-[#e9f4ff]/88 border-b border-[#c8e1f7] backdrop-blur-xl">
      <div className="flex items-center gap-4 py-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft size={15} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="leading-none truncate text-[22px] font-black text-slate-800 tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] mt-1 font-semibold truncate text-slate-500/90">
              {subtitle}
            </p>
          )}
        </div>

        <div className="hidden sm:block">
          {typeof onSearchChange === "function" ? (
            <div className="relative w-full max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                placeholder="Search in current tab..."
                className="w-full pl-8 pr-8 py-2 text-[12.5px] rounded-xl border border-[#c8def4] bg-white/90 text-slate-700 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ) : (
            <GlobalSearch />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="w-8 h-8 rounded-xl flex items-center justify-center transition-all border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200">
            <RefreshCw size={13} />
          </button>
          <button type="button" className="relative w-8 h-8 rounded-xl flex items-center justify-center transition-all border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200">
            <Bell size={13} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
          </button>
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {tabs.length > 0 && setActiveTab && (
        <div className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
          {tabs.map((tab, i) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-[13px] border-b-2 transition-all whitespace-nowrap rounded-t-lg ${
                i === activeTab
                  ? "border-blue-500 text-blue-600 font-bold bg-blue-50"
                  : "border-transparent text-slate-500 font-semibold hover:text-slate-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
