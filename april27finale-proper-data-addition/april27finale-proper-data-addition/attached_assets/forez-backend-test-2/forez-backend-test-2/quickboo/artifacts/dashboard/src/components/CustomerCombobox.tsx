import { useState, useRef, useEffect } from "react";
import { Search, UserPlus, Check, Building2 } from "lucide-react";

interface Customer {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
}

interface Props {
  customers: Customer[];
  value: string;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  required?: boolean;
}

export default function CustomerCombobox({ customers, value, onSelect, onAddNew, required }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = customers.find(c => String(c.id) === value) ?? null;
  const displayValue = open ? query : (selected ? (selected.company ? `${selected.name} — ${selected.company}` : selected.name) : "");

  const filtered = customers.filter(c => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  }).slice(0, 12);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.40)" }} />
        <input
          ref={inputRef}
          type="text"
          required={required && !value}
          placeholder="Search by name or company…"
          value={displayValue}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          className="w-full rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#ffffff",
          }}
        />
        {selected && !open && (
          <Check size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#34d399" }} />
        )}
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute left-0 top-full mt-1 z-[80] w-full rounded-xl shadow-2xl overflow-hidden"
          style={{ background: "rgba(20,16,12,0.97)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}
        >
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-sm py-4" style={{ color: "rgba(255,255,255,0.40)" }}>No customers found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    onSelect(String(c.id));
                    setOpen(false);
                  }}
                  className="w-full text-left flex items-center justify-between px-3 py-2.5 gap-2 transition-colors"
                  style={{ background: value === String(c.id) ? "rgba(59,130,246,0.10)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  onMouseEnter={e => { if (value !== String(c.id)) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = value === String(c.id) ? "rgba(59,130,246,0.10)" : "transparent"; }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate" style={{ color: "#ffffff" }}>{c.name}</span>
                    {c.company && (
                      <span className="text-xs flex items-center gap-1 truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                        <Building2 size={10} />{c.company}
                      </span>
                    )}
                  </div>
                  {c.email && <span className="text-xs flex-shrink-0 hidden sm:block" style={{ color: "rgba(255,255,255,0.40)" }}>{c.email}</span>}
                  {value === String(c.id) && <Check size={13} style={{ color: "#34d399", flexShrink: 0 }} />}
                </button>
              ))
            )}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                setOpen(false);
                onAddNew();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{ color: "#3b82f6" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.08)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
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
