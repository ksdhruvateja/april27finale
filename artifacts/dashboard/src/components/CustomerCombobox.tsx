import { useMemo, useRef, useState } from "react";
import { Search, UserPlus, Check, Building2 } from "lucide-react";

interface Customer {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface Props {
  customers: Customer[];
  value: string;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  required?: boolean;
  allowEmpty?: boolean;
  lightMode?: boolean;
  placeholder?: string;
}

function customerHaystack(c: Customer): string {
  return [c.name, c.company, c.email, c.phone]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function customerLabel(c: Customer): string {
  return c.company ? `${c.name} — ${c.company}` : c.name;
}

function matchesQuery(c: Customer, rawQuery: string): boolean {
  const terms = rawQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = customerHaystack(c);
  return terms.every((t) => hay.includes(t));
}

export default function CustomerCombobox({
  customers,
  value,
  onSelect,
  onAddNew,
  required,
  allowEmpty = false,
  lightMode = false,
  placeholder = "Type customer name or company to search…",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = customers.find((c) => String(c.id) === value) ?? null;
  const selectedDisplay = selected ? customerLabel(selected) : "";

  const filtered = useMemo(() => {
    const q = query.trim();
    const matches = customers.filter((c) => matchesQuery(c, q));
    const sorted = [...matches].sort((a, b) =>
      (a.company || a.name).localeCompare(b.company || b.name, undefined, { sensitivity: "base" }),
    );
    if (!q) return sorted.slice(0, 12);
    return sorted.slice(0, 15);
  }, [customers, query]);

  const showDropdown = open && (filtered.length > 0 || query.trim().length > 0);

  const close = () => {
    setOpen(false);
    if (selected) setQuery("");
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: lightMode ? "#94a3b8" : "rgba(255,255,255,0.40)" }}
        />
        <input
          ref={inputRef}
          type="text"
          required={required && !value}
          placeholder={placeholder}
          value={open ? query : selectedDisplay}
          onFocus={() => {
            setOpen(true);
            setQuery(selectedDisplay);
          }}
          onBlur={() => setTimeout(close, 180)}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (value && next !== selectedDisplay) onSelect("");
          }}
          className="w-full rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none transition-colors"
          style={
            lightMode
              ? {
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  color: "#0f172a",
                }
              : {
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#ffffff",
                }
          }
          autoComplete="off"
        />
        {selected && !open && (
          <Check
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#34d399" }}
          />
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 top-full mt-1 z-[250] w-full rounded-xl shadow-2xl overflow-hidden"
          style={
            lightMode
              ? {
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 8px 32px rgba(15,23,42,0.12)",
                }
              : {
                  background: "rgba(20,16,12,0.97)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  backdropFilter: "blur(12px)",
                }
          }
        >
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p
                className="text-center text-sm py-4 px-3"
                style={{ color: lightMode ? "#94a3b8" : "rgba(255,255,255,0.40)" }}
              >
                No customers match &ldquo;{query.trim()}&rdquo;
              </p>
            ) : (
              <>
                {!query.trim() && (
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider px-3 pt-2 pb-1"
                    style={{ color: lightMode ? "#94a3b8" : "rgba(255,255,255,0.35)" }}
                  >
                    Customers — type to narrow
                  </p>
                )}
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(String(c.id));
                      setQuery("");
                      setOpen(false);
                    }}
                    className="w-full text-left flex items-center justify-between px-3 py-2.5 gap-2 transition-colors"
                    style={{
                      background:
                        value === String(c.id)
                          ? lightMode
                            ? "rgba(59,130,246,0.08)"
                            : "rgba(59,130,246,0.10)"
                          : "transparent",
                      borderBottom: lightMode ? "1px solid #f1f5f9" : "1px solid rgba(255,255,255,0.05)",
                    }}
                    onMouseEnter={(e) => {
                      if (value !== String(c.id))
                        (e.currentTarget as HTMLElement).style.background = lightMode
                          ? "#f8fafc"
                          : "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        value === String(c.id)
                          ? lightMode
                            ? "rgba(59,130,246,0.08)"
                            : "rgba(59,130,246,0.10)"
                          : "transparent";
                    }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: lightMode ? "#0f172a" : "#ffffff" }}
                      >
                        {c.name}
                      </span>
                      {c.company && (
                        <span
                          className="text-xs flex items-center gap-1 truncate"
                          style={{ color: lightMode ? "#64748b" : "rgba(255,255,255,0.45)" }}
                        >
                          <Building2 size={10} />
                          {c.company}
                        </span>
                      )}
                    </div>
                    {c.email && (
                      <span
                        className="text-xs flex-shrink-0 hidden sm:block max-w-[140px] truncate"
                        style={{ color: lightMode ? "#94a3b8" : "rgba(255,255,255,0.40)" }}
                      >
                        {c.email}
                      </span>
                    )}
                    {value === String(c.id) && (
                      <Check size={13} style={{ color: "#34d399", flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
          <div style={{ borderTop: lightMode ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.08)" }}>
            {allowEmpty && value && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect("");
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                style={{ color: lightMode ? "#64748b" : "rgba(255,255,255,0.5)" }}
              >
                Clear customer (walk-in)
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onAddNew();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{ color: "#3b82f6" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.08)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <UserPlus size={13} />
              Add New Customer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
