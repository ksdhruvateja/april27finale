import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { formatDate } from "@/lib/utils";
import {
  useListCustomers, useListInvoices, useListQuotes, useListPurchaseOrders, useListVendors,
} from "@workspace/api-client-react";
import {
  Plus, Search, X, ChevronDown, ChevronUp, Headphones,
  MessageSquare, AlertCircle, CheckCircle2, Clock, Trash2,
  Edit, StickyNote, Save, Mail, Phone, Hash, User, FileText, Loader2,
} from "lucide-react";

type TicketStatus = "open" | "pending" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type ContactMethod = "email" | "phone" | "in_person" | "other";

interface TicketNote { id: string; text: string; createdAt: string; }

interface Ticket {
  id: number;
  orderRef: string;
  customerId?: number | null;
  customer: { name: string; email: string; phone: string };
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  contactMethod: ContactMethod;
  notes: TicketNote[];
  createdAt: string;
}

/* ── API helpers ──────────────────────────────────────────────────────────── */
const BASE = "/api/tickets";
async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null as T;
  return res.json();
}

const TICKETS_KEY = ["tickets"] as const;

function useListTickets() {
  return useQuery<Ticket[]>({ queryKey: TICKETS_KEY, queryFn: () => apiFetch(BASE), staleTime: 30_000 });
}
function useCreateTicket() {
  return useMutation<Ticket, Error, Omit<Ticket, "id" | "createdAt">>({
    mutationKey: ["createTicket"],
    mutationFn: data => apiFetch(BASE, { method: "POST", body: JSON.stringify({
      orderRef: data.orderRef, customerId: data.customerId,
      customerName: data.customer.name, customerEmail: data.customer.email, customerPhone: data.customer.phone,
      subject: data.subject, description: data.description, status: data.status,
      priority: data.priority, contactMethod: data.contactMethod, notes: data.notes,
    }) }),
  });
}
function useUpdateTicket() {
  return useMutation<Ticket, Error, { id: number; data: Partial<Omit<Ticket, "id" | "createdAt">> }>({
    mutationKey: ["updateTicket"],
    mutationFn: ({ id, data }) => apiFetch(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify({
      ...(data.orderRef !== undefined && { orderRef: data.orderRef }),
      ...(data.customerId !== undefined && { customerId: data.customerId }),
      ...(data.customer && { customerName: data.customer.name, customerEmail: data.customer.email, customerPhone: data.customer.phone }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.contactMethod !== undefined && { contactMethod: data.contactMethod }),
      ...(data.notes !== undefined && { notes: data.notes }),
    }) }),
  });
}
function useDeleteTicket() {
  return useMutation<null, Error, number>({
    mutationKey: ["deleteTicket"],
    mutationFn: id => apiFetch(`${BASE}/${id}`, { method: "DELETE" }),
  });
}

/* ── Constants ────────────────────────────────────────────────────────────── */
const STATUS_MAP: Record<TicketStatus, { label: string; cls: string; icon: JSX.Element }> = {
  open:    { label: "Open",    cls: "text-blue-700 bg-blue-50 border-blue-200",    icon: <Clock size={10} /> },
  pending: { label: "Pending", cls: "text-amber-700 bg-amber-50 border-amber-200", icon: <AlertCircle size={10} /> },
  closed:  { label: "Closed",  cls: "text-slate-500 bg-slate-50 border-slate-200", icon: <CheckCircle2 size={10} /> },
};
const PRIORITY_MAP: Record<TicketPriority, { label: string; cls: string }> = {
  low:    { label: "Low",    cls: "text-slate-500 bg-slate-50 border-slate-200" },
  medium: { label: "Medium", cls: "text-blue-600 bg-blue-50 border-blue-200" },
  high:   { label: "High",   cls: "text-orange-600 bg-orange-50 border-orange-200" },
  urgent: { label: "Urgent", cls: "text-red-600 bg-red-50 border-red-200" },
};

const emptyForm = (): Omit<Ticket, "id" | "notes" | "createdAt"> => ({
  orderRef: "", customerId: null,
  customer: { name: "", email: "", phone: "" },
  subject: "", description: "", status: "open", priority: "medium", contactMethod: "email",
});

const inputCls  = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 transition-colors";
const selectCls = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors";

/* ── Autocomplete dropdown ────────────────────────────────────────────────── */
interface AcItem { label: string; sublabel?: string; badge?: string; badgeCls?: string; onSelect: () => void; }
function AcDropdown({ items, show }: { items: AcItem[]; show: boolean }) {
  if (!show || items.length === 0) return null;
  return (
    <div className="absolute left-0 right-0 top-full mt-1 z-[200] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
      <div className="max-h-52 overflow-y-auto">
        {items.map((item, i) => (
          <button key={i} type="button" onMouseDown={e => { e.preventDefault(); item.onSelect(); }}
            className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{item.label}</p>
              {item.sublabel && <p className="text-xs text-slate-400 truncate mt-0.5">{item.sublabel}</p>}
            </div>
            {item.badge && (
              <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.badgeCls ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function genNoteId() { return `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

/* ── Main component ───────────────────────────────────────────────────────── */
export default function Tickets() {
  const qc = useQueryClient();
  const { data: tickets = [], isLoading } = useListTickets();
  const createTicket = useCreateTicket();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState<Record<number, string>>({});
  const [custAcOpen, setCustAcOpen] = useState(false);
  const [refAcOpen, setRefAcOpen] = useState(false);
  const [autoFillSource, setAutoFillSource] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<Record<number, string>>({});
  const [statusMenuId, setStatusMenuId] = useState<number | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (statusMenuId === null) return;
    function handleOutsideClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [statusMenuId]);

  const { data: customers = [] } = useListCustomers();
  const { data: vendors = [] }   = useListVendors();
  const { data: invoices = [] }  = useListInvoices();
  const { data: quotes = [] }    = useListQuotes();
  const { data: pos = [] }       = useListPurchaseOrders();

  /* ── localStorage migration (one-time) ─────────────────────────────────── */
  useEffect(() => {
    const raw = localStorage.getItem("forez_tickets_v1");
    if (!raw) return;
    try {
      const localTickets: any[] = JSON.parse(raw);
      if (!Array.isArray(localTickets) || localTickets.length === 0) { localStorage.removeItem("forez_tickets_v1"); return; }
      if (tickets.length > 0) { localStorage.removeItem("forez_tickets_v1"); return; }
      Promise.all(localTickets.map(t =>
        apiFetch(BASE, { method: "POST", body: JSON.stringify({
          orderRef: t.orderRef ?? "", customerId: t.customerId ?? null,
          customerName: t.customer?.name ?? "", customerEmail: t.customer?.email ?? "", customerPhone: t.customer?.phone ?? "",
          subject: t.subject ?? "Migrated ticket", description: t.description ?? "",
          status: t.status ?? "open", priority: t.priority ?? "medium", contactMethod: t.contactMethod ?? "email",
          notes: Array.isArray(t.notes) ? t.notes : [],
        }) })
      )).then(() => {
        localStorage.removeItem("forez_tickets_v1");
        qc.invalidateQueries({ queryKey: TICKETS_KEY });
      });
    } catch { localStorage.removeItem("forez_tickets_v1"); }
  }, [tickets.length]);

  /* ── Modal helpers ──────────────────────────────────────────────────────── */
  const openCreate = () => { setEditTicket(null); setForm(emptyForm()); setAutoFillSource(null); setFormError(null); setShowModal(true); };
  const openEdit = (t: Ticket) => {
    setEditTicket(t);
    setForm({ orderRef: t.orderRef, customerId: t.customerId ?? null, customer: { ...t.customer }, subject: t.subject, description: t.description, status: t.status, priority: t.priority, contactMethod: t.contactMethod });
    setAutoFillSource(null);
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = () => {
    setFormError(null);
    if (!form.subject.trim() || !form.customer.name.trim()) {
      setFormError("Customer name and subject are required.");
      return;
    }
    if (form.contactMethod === "email" && !form.customer.email.trim()) {
      setFormError("Email address is required when contact method is Email.");
      return;
    }
    if (form.contactMethod === "phone" && !form.customer.phone.trim()) {
      setFormError("Phone number is required when contact method is Phone.");
      return;
    }
    if (editTicket) {
      updateTicket.mutate({ id: editTicket.id, data: { ...form, notes: editTicket.notes } }, { onSuccess: () => setShowModal(false) });
    } else {
      createTicket.mutate({ ...form, notes: [] }, { onSuccess: () => setShowModal(false) });
    }
  };

  const handleSend = (ticketId: number, type: "email" | "text") => {
    setSendStatus(prev => ({ ...prev, [ticketId]: `sending-${type}` }));
    setTimeout(() => {
      setSendStatus(prev => ({ ...prev, [ticketId]: `sent-${type}` }));
      setTimeout(() => setSendStatus(prev => ({ ...prev, [ticketId]: "idle" })), 3000);
    }, 1200);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this ticket?")) return;
    deleteTicket.mutate(id);
    if (expandedId === id) setExpandedId(null);
  };

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const addNote = (ticket: Ticket) => {
    const text = (noteText[ticket.id] ?? "").trim();
    if (!text) return;
    const note: TicketNote = { id: genNoteId(), text, createdAt: new Date().toISOString() };
    const updatedNotes = [...ticket.notes, note];
    updateTicket.mutate({ id: ticket.id, data: { notes: updatedNotes } });
    setNoteText(prev => ({ ...prev, [ticket.id]: "" }));
  };

  const deleteNote = (ticket: Ticket, noteId: string) => {
    const updatedNotes = ticket.notes.filter(n => n.id !== noteId);
    updateTicket.mutate({ id: ticket.id, data: { notes: updatedNotes } });
  };

  const setStatus = (ticket: Ticket, status: TicketStatus) => {
    updateTicket.mutate({ id: ticket.id, data: { status } });
  };

  /* ── Customer autocomplete ──────────────────────────────────────────────── */
  const custQuery = form.customer.name.toLowerCase().trim();
  const custSuggestions = useMemo((): AcItem[] => {
    const list = (customers as any[]);
    const matches = custQuery
      ? list.filter((c: any) => (c.name ?? "").toLowerCase().includes(custQuery) || (c.company ?? "").toLowerCase().includes(custQuery) || (c.email ?? "").toLowerCase().includes(custQuery) || (c.phone ?? "").toLowerCase().includes(custQuery))
      : list.slice(0, 20);
    return matches.slice(0, 12).map((c: any) => ({
      label: c.company ? `${c.name} (${c.company})` : c.name,
      sublabel: [c.email, c.phone].filter(Boolean).join(" · "),
      badge: "Customer", badgeCls: "bg-blue-50 text-blue-600 border-blue-200",
      onSelect: () => {
        setForm(f => ({ ...f, customerId: c.id, customer: { name: c.company ? `${c.name} (${c.company})` : (c.name ?? ""), email: c.email ?? "", phone: c.phone ?? "" } }));
        setAutoFillSource(null);
        setCustAcOpen(false);
      },
    }));
  }, [customers, custQuery]);

  /* ── Order ref autocomplete ─────────────────────────────────────────────── */
  const refQuery = form.orderRef.toLowerCase().trim();
  const refSuggestions = useMemo((): AcItem[] => {
    const results: AcItem[] = [];
    const customerMap = new Map((customers as any[]).map((c: any) => [c.id, c]));
    const vendorMap   = new Map((vendors   as any[]).map((v: any) => [v.id, v]));
    const push = (label: string, sublabel: string, badge: string, badgeCls: string, onSelect: () => void) => {
      if (results.length < 15) results.push({ label, sublabel, badge, badgeCls, onSelect });
    };
    const matchesRef = (val: string) => !refQuery || val.toLowerCase().includes(refQuery);

    for (const inv of (invoices as any[])) {
      const num = inv.invoiceNumber || `FRZI-${5099 + Number(inv.id)}`;
      if (!matchesRef(num) && !matchesRef(String(inv.id))) continue;
      const c = customerMap.get(Number(inv.customerId));
      const customerName = c ? (c.company || c.name) : (inv.customerName ?? "");
      push(num, `Invoice · ${customerName}${inv.total != null ? ` · $${Number(inv.total).toFixed(2)}` : ""}`, "Invoice", "bg-indigo-50 text-indigo-600 border-indigo-200", () => {
        setForm(f => ({ ...f, orderRef: num, customerId: c ? c.id : f.customerId, customer: c ? { name: c.company ? `${c.name} (${c.company})` : (c.name ?? ""), email: c.email ?? "", phone: c.phone ?? "" } : f.customer }));
        if (c) setAutoFillSource(`Invoice ${num}`);
        setRefAcOpen(false);
      });
    }
    for (const q of (quotes as any[])) {
      const num = q.quoteNumber || `FRZQ-${5099 + Number(q.id)}`;
      if (!matchesRef(num) && !matchesRef(String(q.id))) continue;
      const c = customerMap.get(Number(q.customerId));
      const customerName = c ? (c.company || c.name) : "";
      push(num, `Quote · ${customerName}${q.total != null ? ` · $${Number(q.total).toFixed(2)}` : ""}`, "Quote", "bg-violet-50 text-violet-600 border-violet-200", () => {
        setForm(f => ({ ...f, orderRef: num, customerId: c ? c.id : f.customerId, customer: c ? { name: c.company ? `${c.name} (${c.company})` : (c.name ?? ""), email: c.email ?? "", phone: c.phone ?? "" } : f.customer }));
        if (c) setAutoFillSource(`Quote ${num}`);
        setRefAcOpen(false);
      });
    }
    for (const po of (pos as any[])) {
      const num = po.poNumber || `PO-${po.id}`;
      if (!matchesRef(num) && !matchesRef(String(po.id))) continue;
      const v = vendorMap.get(Number(po.vendorId));
      const vendorName = v ? (v.company || v.name) : (po.vendorName ?? "");
      push(num, `Purchase Order · ${vendorName}${po.total != null ? ` · $${Number(po.total).toFixed(2)}` : ""}`, "PO", "bg-emerald-50 text-emerald-600 border-emerald-200", () => {
        setForm(f => ({ ...f, orderRef: num, customer: v ? { name: v.company ? `${v.name} (${v.company})` : (v.name ?? ""), email: v.email ?? "", phone: v.phone ?? "" } : f.customer }));
        if (v) setAutoFillSource(`PO ${num}`);
        setRefAcOpen(false);
      });
    }
    if (!refQuery && results.length === 0) return [];
    return results;
  }, [invoices, quotes, pos, customers, vendors, refQuery]);

  /* ── Filter ─────────────────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return [t.orderRef, t.subject, t.customer.name, t.customer.email, t.description].some(f => String(f ?? "").toLowerCase().includes(q));
    });
  }, [tickets, search, statusFilter]);

  const counts = useMemo(() => ({
    open:    tickets.filter(t => t.status === "open").length,
    pending: tickets.filter(t => t.status === "pending").length,
    closed:  tickets.filter(t => t.status === "closed").length,
  }), [tickets]);

  const isSaving = createTicket.isPending || updateTicket.isPending;

  return (
    <Layout>
      <Header title="Tickets" subtitle={`${tickets.length} total`} />
      <div className="page-scroll-body px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">

        {/* Top bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button onClick={openCreate} className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors flex-shrink-0">
            <Plus size={14} /> New Ticket
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 flex-wrap items-center">
          {(["all", "open", "pending", "closed"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                statusFilter === s
                  ? s === "all"     ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]"
                  : s === "open"    ? "bg-blue-600 text-white border-blue-600"
                  : s === "pending" ? "bg-amber-500 text-white border-amber-500"
                                    : "bg-slate-600 text-white border-slate-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}>
              {s === "all" ? "All" : STATUS_MAP[s].label}
              <span className={`text-[10px] px-1.5 py-0 rounded-full font-bold ${statusFilter === s ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {s === "all" ? tickets.length : counts[s]}
              </span>
            </button>
          ))}
        </div>

        {/* Tickets list */}
        <div className="glass-card flex flex-col">
          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <Loader2 size={24} className="text-indigo-400 animate-spin" />
              <p className="text-slate-400 text-sm">Loading tickets…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Headphones size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">{tickets.length === 0 ? "No tickets yet — create one to get started." : "No tickets match your filters."}</p>
            </div>
          ) : filtered.map((t, idx) => {
            const isExpanded = expandedId === t.id;
            const { label: sLabel, cls: sCls } = STATUS_MAP[t.status];
            const { label: pLabel, cls: pCls } = PRIORITY_MAP[t.priority];
            return (
              <div key={t.id} className={`border-b border-slate-100 last:border-0 ${idx === 0 ? "" : ""}`}>
                <div className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors group ${isExpanded ? "bg-slate-50" : ""}`}
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <div className="flex-shrink-0 mt-0.5">
                    {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-slate-800 text-sm">{t.subject}</span>

                      {/* Inline status dropdown */}
                      <div
                        className="relative"
                        ref={statusMenuId === t.id ? statusMenuRef : undefined}
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setStatusMenuId(statusMenuId === t.id ? null : t.id)}
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all hover:opacity-80 cursor-pointer select-none ${sCls}`}
                        >
                          {STATUS_MAP[t.status].icon} {sLabel}
                          <ChevronDown size={8} className={`ml-0.5 transition-transform ${statusMenuId === t.id ? "rotate-180" : ""}`} />
                        </button>
                        {statusMenuId === t.id && (
                          <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[120px]">
                            {(["open", "pending", "closed"] as TicketStatus[]).map(s => (
                              <button
                                key={s}
                                onClick={() => { setStatus(t, s); setStatusMenuId(null); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 ${t.status === s ? "bg-slate-50/80" : ""}`}
                              >
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_MAP[s].cls}`}>
                                  {STATUS_MAP[s].icon} {STATUS_MAP[s].label}
                                </span>
                                {t.status === s && <span className="text-indigo-500 ml-auto text-[10px] font-bold">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${pCls}`}>{pLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      <span className="font-medium text-slate-600 flex items-center gap-1"><User size={10} />{t.customer.name}</span>
                      {t.orderRef && <span className="flex items-center gap-1 font-mono text-indigo-500"><Hash size={10} />{t.orderRef}</span>}
                      <span>{formatDate(t.createdAt)}</span>
                      {t.notes.length > 0 && <span className="flex items-center gap-1"><MessageSquare size={10} />{t.notes.length} note{t.notes.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><Edit size={13} /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-slate-50/70 border-t border-slate-100 px-5 py-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-slate-400 font-semibold uppercase tracking-wider mb-1">Customer</p>
                        <p className="text-slate-700 font-medium">{t.customer.name}</p>
                        {t.customer.email && <p className="text-slate-500 flex items-center gap-1 mt-0.5"><Mail size={10} />{t.customer.email}</p>}
                        {t.customer.phone && <p className="text-slate-500 flex items-center gap-1 mt-0.5"><Phone size={10} />{t.customer.phone}</p>}
                      </div>
                      <div>
                        <p className="text-slate-400 font-semibold uppercase tracking-wider mb-1">Contact Method</p>
                        <p className="text-slate-700 capitalize">{t.contactMethod.replace("_", " ")}</p>
                      </div>
                      {t.orderRef && (
                        <div>
                          <p className="text-slate-400 font-semibold uppercase tracking-wider mb-1">Order Ref</p>
                          <p className="text-slate-700 font-mono text-indigo-600">{t.orderRef}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-slate-400 font-semibold uppercase tracking-wider mb-1">Status</p>
                        <div className="flex gap-1 flex-wrap">
                          {(["open", "pending", "closed"] as TicketStatus[]).map(s => (
                            <button key={s} onClick={() => setStatus(t, s)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${t.status === s ? STATUS_MAP[s].cls + " ring-1 ring-offset-1 ring-current" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
                              {STATUS_MAP[s].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Send via Email / Text */}
                    <div className="flex flex-wrap items-center gap-2 py-1 border-t border-b border-slate-100">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Send Update:</span>
                      {t.customer.email ? (
                        <button
                          onClick={() => handleSend(t.id, "email")}
                          disabled={sendStatus[t.id]?.startsWith("sending")}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            sendStatus[t.id] === "sent-email" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : sendStatus[t.id] === "sending-email" ? "bg-blue-50 border-blue-200 text-blue-500"
                            : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                          }`}>
                          <Mail size={11} />
                          {sendStatus[t.id] === "sending-email" ? "Sending…" : sendStatus[t.id] === "sent-email" ? "✓ Email Sent" : `Email · ${t.customer.email}`}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic flex items-center gap-1"><Mail size={10} /> No email on file</span>
                      )}
                      {t.customer.phone ? (
                        <button
                          onClick={() => handleSend(t.id, "text")}
                          disabled={sendStatus[t.id]?.startsWith("sending")}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            sendStatus[t.id] === "sent-text" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : sendStatus[t.id] === "sending-text" ? "bg-blue-50 border-blue-200 text-blue-500"
                            : "bg-white border-slate-200 text-slate-600 hover:border-green-300 hover:text-green-600"
                          }`}>
                          <Phone size={11} />
                          {sendStatus[t.id] === "sending-text" ? "Sending…" : sendStatus[t.id] === "sent-text" ? "✓ Text Sent" : `Text · ${t.customer.phone}`}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic flex items-center gap-1"><Phone size={10} /> No phone on file</span>
                      )}
                    </div>

                    {t.description && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{t.description}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <StickyNote size={11} /> Notes ({t.notes.length})
                      </p>
                      <div className="flex flex-col gap-2">
                        {t.notes.map(n => (
                          <div key={n.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.text}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{formatDate(n.createdAt)}</p>
                            </div>
                            <button onClick={() => deleteNote(t, n.id)} className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors flex-shrink-0">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <input type="text" placeholder="Add a note…" value={noteText[t.id] ?? ""}
                            onChange={e => setNoteText(prev => ({ ...prev, [t.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(t); } }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
                          <button onClick={() => addNote(t)} disabled={!(noteText[t.id] ?? "").trim()}
                            className="px-3 py-2 rounded-lg bg-[hsl(224_50%_15%)] text-white text-xs font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-40 flex items-center gap-1">
                            <Save size={12} /> Save
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[hsl(224_50%_15%)] flex items-center justify-center">
                  <Headphones size={14} className="text-white" />
                </div>
                <h3 className="text-slate-800 font-bold text-base">{editTicket ? "Edit Ticket" : "New Support Ticket"}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Customer Name */}
                <div className="relative">
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <User size={11} className="text-blue-500" /> Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" placeholder="Type name or company…" value={form.customer.name}
                    onChange={e => { setForm(f => ({ ...f, customerId: null, customer: { ...f.customer, name: e.target.value } })); setAutoFillSource(null); setCustAcOpen(true); }}
                    onFocus={() => setCustAcOpen(true)}
                    onBlur={() => setTimeout(() => setCustAcOpen(false), 150)}
                    className={inputCls} autoComplete="off" />
                  <AcDropdown show={custAcOpen} items={custSuggestions} />
                  {autoFillSource ? (
                    <span className="absolute right-2 top-[34px] text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold pointer-events-none">
                      ✓ Auto-filled from {autoFillSource}
                    </span>
                  ) : form.customerId ? (
                    <span className="absolute right-2 top-[34px] text-[10px] text-blue-500 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 font-semibold pointer-events-none">
                      ✓ Linked
                    </span>
                  ) : null}
                </div>

                {/* Order Ref */}
                <div className="relative">
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <FileText size={11} className="text-indigo-500" /> Order / Invoice Ref
                  </label>
                  <input type="text" placeholder="Search invoices, quotes, POs…" value={form.orderRef}
                    onChange={e => { setForm(f => ({ ...f, orderRef: e.target.value })); setAutoFillSource(null); setRefAcOpen(true); }}
                    onFocus={() => setRefAcOpen(true)}
                    onBlur={() => setTimeout(() => setRefAcOpen(false), 150)}
                    className={inputCls} autoComplete="off" />
                  <AcDropdown show={refAcOpen} items={refSuggestions} />
                </div>
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <Mail size={11} className="text-slate-400" /> Email
                  </label>
                  <input type="email" placeholder="customer@example.com" value={form.customer.email}
                    onChange={e => setForm(f => ({ ...f, customer: { ...f.customer, email: e.target.value } }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <Phone size={11} className="text-slate-400" /> Phone
                  </label>
                  <input type="tel" placeholder="+1 555-0100" value={form.customer.phone}
                    onChange={e => setForm(f => ({ ...f, customer: { ...f.customer, phone: e.target.value } }))} className={inputCls} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Subject <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Brief description of the issue" value={form.subject} onChange={setField("subject")} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description</label>
                <textarea placeholder="Detailed description…" value={form.description} onChange={setField("description")} rows={4}
                  className={inputCls + " resize-none"} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Status</label>
                  <select value={form.status} onChange={setField("status")} className={selectCls}>
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Priority</label>
                  <select value={form.priority} onChange={setField("priority")} className={selectCls}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Contact Method</label>
                  <select value={form.contactMethod} onChange={setField("contactMethod")} className={selectCls}>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In Person</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {formError && (
              <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700 font-medium">
                <AlertCircle size={13} className="flex-shrink-0" /> {formError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-50 flex items-center gap-2">
                {isSaving && <Loader2 size={13} className="animate-spin" />}
                {editTicket ? "Save Changes" : "Create Ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
