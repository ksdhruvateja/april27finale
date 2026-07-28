import { useState, useEffect, useMemo, useRef } from "react";
import { useCreateCustomer, useUpdateCustomer, getListCustomersQueryKey, useListSalesLeads, useListCustomers, useCreateSalesLead, getListSalesLeadsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { LightFormField, LightFormInput, LightFormSelect, LightFormTextarea, LightSubmitBar } from "./Modal";
import { Plus, X, ShieldCheck, ShieldOff, Phone, AlertCircle, Users, ChevronDown, ChevronUp, UserPlus, Search, Mail } from "lucide-react";
import { US_STATES } from "@/lib/usStates";

interface NetTerm { id: string; label: string; days?: number; }
const DEFAULT_NET_TERMS: NetTerm[] = [
  { id: "net30",        label: "Net 30",       days: 30  },
  { id: "net60",        label: "Net 60",       days: 60  },
  { id: "net90",        label: "Net 90",       days: 90  },
  { id: "cash",         label: "Cash",         days: 0   },
  { id: "cash_advance", label: "Cash Advance", days: 0   },
  { id: "cod",          label: "COD",          days: 0   },
];

interface AddressObj { address?: string; city?: string; state?: string; zipCode?: string; country?: string; }
interface PhoneEntry { label: string; number: string; }
interface EmailEntry { label: string; email: string; }
interface CompanyAddress {
  id: string;
  type: string;       // "Warehouse" | "Office" | custom
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

interface CustomerData {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
  emails?: any[] | null;
  phone?: string | null;
  phones?: any[] | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  billingAddress?: AddressObj | null;
  shippingAddress?: AddressObj | null;
  companyAddresses?: CompanyAddress[] | null;
  taxExempt?: boolean;
  accountType?: string | null;
  creditLimit?: number | string | null;
  salesRep?: string | null;
  shippingCarrierName?: string | null;
  shippingAccountNumber?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

const PRESET_ADDRESS_TYPES = ["Warehouse", "Office", "Showroom", "Distribution Center", "Retail"];
const nanoid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  onClose: () => void;
  customer?: CustomerData;
  onCreated?: (id: number) => void;
}

const PHONE_LABELS = ["Mobile", "Office", "Home", "Private", "Direct", "Fax", "Other"];
const EMAIL_LABELS = ["Work", "Personal", "Billing", "Other"];

function parsePhones(customer?: CustomerData): PhoneEntry[] {
  if (customer?.phones && Array.isArray(customer.phones) && customer.phones.length > 0) {
    return customer.phones.map((p: any) =>
      typeof p === "string" ? { label: "Mobile", number: p } : { label: p.label ?? "Mobile", number: p.number ?? p }
    );
  }
  if (customer?.phone) return [{ label: "Mobile", number: customer.phone }];
  return [{ label: "Mobile", number: "" }];
}

function parseEmails(customer?: CustomerData): EmailEntry[] {
  if (customer?.emails && Array.isArray(customer.emails) && customer.emails.length > 0) {
    return customer.emails.map((e: any) =>
      typeof e === "string" ? { label: "Work", email: e } : { label: e.label ?? "Work", email: e.email ?? e }
    );
  }
  if (customer?.email) return [{ label: "Work", email: customer.email }];
  return [{ label: "Work", email: "" }];
}

function AddressBlock({ label, addr, onChange }: { label: string; addr: AddressObj; onChange: (a: AddressObj) => void }) {
  const set = (k: keyof AddressObj) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...addr, [k]: e.target.value });
  const isBilling = label.toLowerCase().includes("billing");
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={isBilling
        ? { background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.25)" }
        : { background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.25)" }
      }
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isBilling ? "text-blue-600" : "text-emerald-600"}`}>
        <span className={`inline-block w-2 h-2 rounded-full ${isBilling ? "bg-blue-500" : "bg-emerald-500"}`} />
        {label}
      </p>
      <LightFormField label="Street Address">
        <LightFormInput placeholder="123 Main St" value={addr.address ?? ""} onChange={set("address")} />
      </LightFormField>
      <div className="grid grid-cols-3 gap-3">
        <LightFormField label="City">
          <LightFormInput placeholder="New York" value={addr.city ?? ""} onChange={set("city")} />
        </LightFormField>
        <LightFormField label="State">
          <LightFormSelect value={addr.state ?? ""} onChange={set("state")}>
            <option value="">Select state…</option>
            {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
          </LightFormSelect>
        </LightFormField>
        <LightFormField label="ZIP Code">
          <LightFormInput placeholder="10001" value={addr.zipCode ?? ""} onChange={set("zipCode")} />
        </LightFormField>
      </div>
    </div>
  );
}

export default function CustomerModal({ onClose, customer, onCreated }: Props) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const createLead = useCreateSalesLead();
  const queryClient = useQueryClient();
  const isEdit = !!customer;
  const [apiError, setApiError] = useState<string | null>(null);
  const [netTerms, setNetTerms] = useState<NetTerm[]>(DEFAULT_NET_TERMS);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/app-settings/net_terms")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.value) {
          try { setNetTerms(JSON.parse(d.value)); } catch {}
        }
      });
  }, []);

  const { data: salesLeads = [] } = useListSalesLeads({ query: { refetchOnMount: true, staleTime: 0 } });
  const { data: allCustomers = [] } = useListCustomers();

  // Build autocomplete list from salesRep values already saved on existing customers
  const allRepNames = useMemo(() =>
    Array.from(new Set(
      (allCustomers as any[]).map((c: any) => c.salesRep).filter(Boolean)
    )).sort()
  , [allCustomers]);

  // ── Sales Leads panel state ───────────────────────────────────────────────
  const [showLeadsPanel, setShowLeadsPanel] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [showAddLeadForm, setShowAddLeadForm] = useState(false);
  const [addLeadForm, setAddLeadForm] = useState({ firstName: "", lastName: "", email: "", mobile: "" });
  const [addLeadError, setAddLeadError] = useState<string | null>(null);

  // ── Name suggestion dropdown ──────────────────────────────────────────────
  const [nameSugOpen, setNameSugOpen] = useState(false);

  // Close suggestion on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        nameInputRef.current && !nameInputRef.current.contains(e.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)
      ) setNameSugOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [form, setForm] = useState({
    name: customer?.name ?? "",
    company: customer?.company ?? "",
    salesRep: customer?.salesRep ?? "",
    accountType: customer?.accountType ?? "",
    creditLimit: customer?.creditLimit != null ? String(customer.creditLimit) : "",
    shippingCarrierName: customer?.shippingCarrierName ?? "",
    shippingAccountNumber: customer?.shippingAccountNumber ?? "",
    taxNumber: customer?.taxNumber ?? "",
    notes: customer?.notes ?? "",
    taxExempt: customer?.taxExempt ?? false,
  });

  const [phones, setPhones] = useState<PhoneEntry[]>(parsePhones(customer));
  const [emails, setEmails] = useState<EmailEntry[]>(parseEmails(customer));

  const [companyAddresses, setCompanyAddresses] = useState<CompanyAddress[]>(
    (customer?.companyAddresses as CompanyAddress[]) ?? []
  );

  const [billingAddress, setBillingAddress] = useState<AddressObj>(
    (customer?.billingAddress as AddressObj) ?? { address: customer?.address ?? "", city: customer?.city ?? "", state: customer?.state ?? "", zipCode: customer?.zipCode ?? "", country: "US" }
  );
  const [shippingAddress, setShippingAddress] = useState<AddressObj>(
    (customer?.shippingAddress as AddressObj) ?? {}
  );
  const [sameAsBilling, setSameAsBilling] = useState<boolean>(() => {
    if (!customer?.shippingAddress) return false;
    const s = customer.shippingAddress as AddressObj;
    const b = (customer?.billingAddress as AddressObj) ?? {};
    return s.address === b.address && s.city === b.city && s.state === b.state && s.zipCode === b.zipCode;
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Deduplicate leads by full name (keep highest id = most recent)
  const uniqueLeads = useMemo(() => {
    const seen = new Map<string, any>();
    for (const l of (salesLeads as any[])) {
      const key = `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim().toLowerCase();
      if (!seen.has(key) || l.id > seen.get(key).id) seen.set(key, l);
    }
    return Array.from(seen.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [salesLeads]);

  // Must be after form state ─────────────────────────────────────────────────
  const nameSuggestions = useMemo(() => {
    const q = form.name.trim().toLowerCase();
    if (!q) return [];
    return uniqueLeads.filter((l: any) => {
      const full = `${l.firstName ?? ""} ${l.lastName ?? ""}`.toLowerCase();
      return full.includes(q);
    }).slice(0, 8);
  }, [uniqueLeads, form.name]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setNameSugOpen(name.trim().length > 0);
    setForm(f => ({ ...f, name }));
  };

  /** Fill the form from a selected sales lead */
  const selectLead = (lead: any) => {
    const fullName = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
    setForm(f => ({ ...f, name: fullName }));
    if (lead.email && emails[0]?.email === "")
      setEmails(prev => [{ label: "Work", email: lead.email }, ...prev.slice(1)]);
    if (lead.mobile && phones[0]?.number === "")
      setPhones(prev => [{ label: "Mobile", number: lead.mobile }, ...prev.slice(1)]);
    setNameSugOpen(false);
  };

  /** Inline add-lead form submission */
  const handleAddLeadSubmit = async () => {
    setAddLeadError(null);
    const firstName = addLeadForm.firstName.trim();
    const lastName  = addLeadForm.lastName.trim();
    if (!firstName || !lastName) { setAddLeadError("First and last name are required."); return; }
    try {
      const lead: any = await createLead.mutateAsync({
        data: { firstName, lastName, email: addLeadForm.email.trim() || null, mobile: addLeadForm.mobile.trim() || null },
      });
      queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
      selectLead(lead);
      setShowAddLeadForm(false);
      setAddLeadForm({ firstName: "", lastName: "", email: "", mobile: "" });
    } catch (err: any) {
      setAddLeadError(err?.response?.data?.error ?? err?.message ?? "Failed to create lead");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const validPhones = phones.filter(p => p.number.trim());
    const validEmails = emails.filter(em => em.email.trim());
    const primaryEmail = validEmails[0]?.email || null;
    const primaryPhone = validPhones[0]?.number || null;
    const data: any = {
      name: form.name,
      company: form.company || null,
      email: primaryEmail,
      emails: validEmails.length > 0 ? validEmails : null,
      phone: primaryPhone,
      phones: validPhones.length > 0 ? validPhones : null,
      salesRep: form.salesRep || null,
      accountType: form.accountType || null,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
      shippingCarrierName: form.shippingCarrierName || null,
      shippingAccountNumber: form.shippingAccountNumber || null,
      taxNumber: form.taxNumber || null,
      notes: form.notes || null,
      taxExempt: form.taxExempt,
      billingAddress: Object.values(billingAddress).some(Boolean) ? billingAddress : null,
      shippingAddress: sameAsBilling
        ? (Object.values(billingAddress).some(Boolean) ? billingAddress : null)
        : (Object.values(shippingAddress).some(Boolean) ? shippingAddress : null),
      companyAddresses: companyAddresses.filter(a => a.address.trim()),
      address: billingAddress.address || null,
      city: billingAddress.city || null,
      state: billingAddress.state || null,
      zipCode: billingAddress.zipCode || null,
      country: billingAddress.country || "US",
    };

    setApiError(null);
    if (isEdit) {
      update.mutate({ id: customer.id, data }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); onClose(); },
        onError: (err: any) => setApiError(err?.message ?? "Failed to save customer. Please try again."),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: (result: any) => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          if (onCreated && result?.id) onCreated(result.id);
          onClose();
        },
        onError: (err: any) => setApiError(err?.message ?? "Failed to create customer. Please try again."),
      });
    }
  };

  const isPending = isEdit ? update.isPending : create.isPending;

  return (
    <>
    <Modal
      title={isEdit ? "Edit Customer" : "Add Customer"}
      subtitle={isEdit ? "Update customer information" : "Create a new customer record"}
      onClose={onClose}
      maxWidth="max-w-3xl"
      theme="light"
      footer={
        <LightSubmitBar onClose={onClose} isLoading={isPending} label={isEdit ? "Save Changes" : "Add Customer"} formId="customer-form" />
      }
    >
      <form id="customer-form" onSubmit={handleSubmit}>
        {apiError && (
          <div className="mx-6 mt-4 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-red-500" />
            <span>{apiError}</span>
          </div>
        )}
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            {/* Name field + sliding suggestions */}
            <LightFormField label="Full Name" required>
              <div className="relative">
                <input
                  ref={nameInputRef}
                  required
                  autoFocus
                  placeholder="e.g. John Smith"
                  value={form.name}
                  onChange={handleNameChange}
                  onFocus={() => { if (form.name.trim()) setNameSugOpen(true); }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[hsl(224_50%_40%)] transition-colors"
                />
                {/* Slide-down suggestions */}
                {nameSugOpen && nameSuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-lg border border-[hsl(224_50%_25%)] animate-in slide-in-from-top-1 duration-150"
                    style={{ background: "hsl(224 50% 15%)" }}
                  >
                    <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-white/10">
                      <Users size={10} className="text-white/50" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Sales Leads</span>
                    </div>
                    {nameSuggestions.map((lead: any) => {
                      const full = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
                      return (
                        <button
                          key={lead.id}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); selectLead(lead); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {full[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate">{full}</p>
                            {(lead.email || lead.mobile) && (
                              <p className="text-[11px] text-white/60 truncate">
                                {lead.email ?? lead.mobile}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setNameSugOpen(false); setShowLeadsPanel(true); setShowAddLeadForm(true); setAddLeadForm(f => ({ ...f, firstName: form.name.split(" ")[0] ?? "", lastName: form.name.split(" ").slice(1).join(" ") ?? "" })); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-white/10 hover:bg-white/10 transition-colors text-left"
                    >
                      <UserPlus size={13} className="text-white/70 flex-shrink-0" />
                      <span className="text-sm font-medium text-white/80">Add as new sales lead…</span>
                    </button>
                  </div>
                )}
              </div>
            </LightFormField>
            <LightFormField label="Company">
              <LightFormInput placeholder="e.g. Acme Corp" value={form.company} onChange={set("company")} />
            </LightFormField>
          </div>

          {/* ── Sales Leads Panel ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Header toggle */}
            <button
              type="button"
              onClick={() => setShowLeadsPanel(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
              style={{ background: showLeadsPanel ? "hsl(224 50% 15%)" : undefined }}
            >
              <div className="flex items-center gap-2">
                <Users size={14} className={showLeadsPanel ? "text-white/80" : "text-slate-500"} />
                <span className={`text-sm font-semibold ${showLeadsPanel ? "text-white" : "text-slate-700"}`}>
                  Sales Leads
                </span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${showLeadsPanel ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {uniqueLeads.length}
                </span>
              </div>
              {showLeadsPanel
                ? <ChevronUp size={14} className="text-white/70" />
                : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {showLeadsPanel && (
              <div className="flex flex-col">
                {/* Search */}
                <div className="px-3 py-2.5 border-b border-slate-100">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search leads…"
                      value={leadsSearch}
                      onChange={e => setLeadsSearch(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors"
                    />
                  </div>
                </div>

                {/* Lead list */}
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                  {uniqueLeads
                    .filter((l: any) => {
                      const q = leadsSearch.toLowerCase();
                      const full = `${l.firstName ?? ""} ${l.lastName ?? ""}`.toLowerCase();
                      return !q || full.includes(q) || (l.email ?? "").toLowerCase().includes(q) || (l.mobile ?? "").includes(q);
                    })
                    .map((lead: any) => {
                      const full = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
                      const isSelected = form.name.trim().toLowerCase() === full.toLowerCase();
                      return (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => selectLead(lead)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                            style={{ background: "hsl(224 50% 15%)" }}>
                            {full[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold truncate ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>{full}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              {lead.email && <span className="text-[11px] text-slate-400 flex items-center gap-1 truncate"><Mail size={9} />{lead.email}</span>}
                              {lead.mobile && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Phone size={9} />{lead.mobile}</span>}
                            </div>
                          </div>
                          {isSelected && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full flex-shrink-0">Selected</span>}
                        </button>
                      );
                    })}
                  {(salesLeads as any[]).length === 0 && (
                    <p className="px-4 py-5 text-center text-xs text-slate-400">No sales leads yet. Add one below.</p>
                  )}
                </div>

                {/* Add New Lead button / inline form */}
                {!showAddLeadForm ? (
                  <div className="px-3 py-2.5 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddLeadForm(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-indigo-200 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 hover:border-indigo-400 transition-all"
                    >
                      <UserPlus size={13} /> Add New Sales Lead
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t border-slate-100 flex flex-col gap-3"
                    style={{ background: "hsl(224 50% 97%)" }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-semibold text-[hsl(224_50%_25%)] flex items-center gap-1.5">
                        <UserPlus size={12} /> New Sales Lead
                      </p>
                      <button type="button" onClick={() => { setShowAddLeadForm(false); setAddLeadError(null); setAddLeadForm({ firstName: "", lastName: "", email: "", mobile: "" }); }}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-white transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">First Name *</label>
                        <input required value={addLeadForm.firstName}
                          onChange={e => setAddLeadForm(f => ({ ...f, firstName: e.target.value }))}
                          placeholder="Jane"
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Last Name *</label>
                        <input required value={addLeadForm.lastName}
                          onChange={e => setAddLeadForm(f => ({ ...f, lastName: e.target.value }))}
                          placeholder="Doe"
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 transition-colors" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Email</label>
                        <input type="email" value={addLeadForm.email}
                          onChange={e => setAddLeadForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="jane@example.com"
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Mobile</label>
                        <input type="tel" value={addLeadForm.mobile}
                          onChange={e => setAddLeadForm(f => ({ ...f, mobile: e.target.value }))}
                          placeholder="+1 555-000-1234"
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 transition-colors" />
                      </div>
                    </div>
                    {addLeadError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{addLeadError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowAddLeadForm(false); setAddLeadError(null); }}
                        className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-white transition-colors">
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={createLead.isPending}
                        onClick={() => handleAddLeadSubmit()}
                        className="flex-1 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        style={{ background: "hsl(224 50% 15%)" }}>
                        {createLead.isPending ? "Saving…" : <><UserPlus size={12} /> Save & Select</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Emails with labels */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email Addresses</label>
            {emails.map((em, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={em.label}
                  onChange={e => setEmails(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  className="text-xs rounded-lg px-2 py-2.5 border border-slate-200 bg-white text-slate-700 focus:outline-none w-28 flex-shrink-0"
                >
                  {EMAIL_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <LightFormInput
                  type="email"
                  placeholder={i === 0 ? "Primary email" : "Additional email"}
                  value={em.email}
                  onChange={e => setEmails(prev => prev.map((x, idx) => idx === i ? { ...x, email: e.target.value } : x))}
                />
                {emails.length > 1 && (
                  <button type="button" onClick={() => setEmails(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setEmails(prev => [...prev, { label: "Work", email: "" }])}
              className="self-start flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
              <Plus size={12} /> Add another email
            </button>
          </div>

          {/* Phones with labels */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Phone size={11} /> Phone Numbers
            </label>
            {phones.map((ph, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={ph.label}
                  onChange={e => setPhones(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  className="text-xs rounded-lg px-2 py-2.5 border border-slate-200 bg-white text-slate-700 focus:outline-none w-28 flex-shrink-0"
                >
                  {PHONE_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <LightFormInput
                  type="tel"
                  placeholder={i === 0 ? "Primary phone" : "Additional phone"}
                  value={ph.number}
                  onChange={e => setPhones(prev => prev.map((x, idx) => idx === i ? { ...x, number: e.target.value } : x))}
                />
                {phones.length > 1 && (
                  <button type="button" onClick={() => setPhones(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setPhones(prev => [...prev, { label: "Mobile", number: "" }])}
              className="self-start flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
              <Plus size={12} /> Add another phone
            </button>
          </div>

          {/* Account Settings */}
          <div className="grid grid-cols-2 gap-3">
            <LightFormField label="Payment Terms">
              <LightFormSelect value={form.accountType} onChange={set("accountType")}>
                <option value="">Select terms…</option>
                {netTerms.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </LightFormSelect>
            </LightFormField>
            <LightFormField label="Credit Limit ($)">
              <LightFormInput type="number" step="0.01" min="0" placeholder="e.g. 5000" value={form.creditLimit} onChange={set("creditLimit")} />
            </LightFormField>
            <LightFormField label="EIN Number">
              <LightFormInput placeholder="e.g. 12-3456789" value={form.taxNumber} onChange={set("taxNumber")} />
            </LightFormField>
            <LightFormField label="Sales Rep">
              <div className="relative">
                <LightFormInput
                  type="text"
                  list="salesRepList"
                  placeholder="Type name or select..."
                  value={form.salesRep}
                  onChange={set("salesRep")}
                />
                <datalist id="salesRepList">
                  {allRepNames.map(rep => <option key={rep} value={rep} />)}
                </datalist>
              </div>
            </LightFormField>
          </div>

          {/* Tax Exempt Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
            <button type="button"
              onClick={() => setForm(f => ({ ...f, taxExempt: !f.taxExempt }))}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                form.taxExempt
                  ? "bg-lime-500 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
              }`}>
              {form.taxExempt ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
              {form.taxExempt ? "Tax Exempt" : "Taxable"}
            </button>
            <span className="text-xs text-slate-500">
              {form.taxExempt
                ? "This customer is tax exempt — taxes will not be applied automatically."
                : "Normal tax rates apply to this customer."}
            </span>
          </div>

          {/* Addresses */}
          <div className="flex flex-col gap-3">
            <AddressBlock label="Billing Address" addr={billingAddress} onChange={addr => {
              setBillingAddress(addr);
              if (sameAsBilling) setShippingAddress(addr);
            }} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !sameAsBilling;
                  setSameAsBilling(next);
                  if (next) setShippingAddress({ ...billingAddress });
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  sameAsBilling
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${sameAsBilling ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`}>
                  {sameAsBilling && <svg viewBox="0 0 10 10" className="w-2 h-2 fill-white"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                Shipping address same as billing
              </button>
            </div>
            {!sameAsBilling && (
              <AddressBlock label="Shipping Address" addr={shippingAddress} onChange={setShippingAddress} />
            )}
          </div>

          {/* Company Addresses */}
          <CompanyAddressesEditor addresses={companyAddresses} onChange={setCompanyAddresses} />

          {/* Other */}
          <div className="flex gap-3">
            <div className="flex-1">
              <LightFormField label="Shipping Carrier">
                <LightFormInput placeholder="e.g. UPS, FedEx, DHL" value={form.shippingCarrierName} onChange={set("shippingCarrierName")} />
              </LightFormField>
            </div>
            <div className="flex-1">
              <LightFormField label="Shipping Account #">
                <LightFormInput placeholder="e.g. 123456" value={form.shippingAccountNumber} onChange={set("shippingAccountNumber")} />
              </LightFormField>
            </div>
          </div>

          <LightFormField label="Notes">
            <LightFormTextarea placeholder="Any additional notes..." value={form.notes} onChange={set("notes")} rows={3} />
          </LightFormField>
        </div>
      </form>
    </Modal>
    </>
  );
}

// ─── CompanyAddressesEditor ────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Warehouse: "bg-amber-50 border-amber-200 text-amber-700",
  Office: "bg-blue-50 border-blue-200 text-blue-700",
  Showroom: "bg-violet-50 border-violet-200 text-violet-700",
  "Distribution Center": "bg-orange-50 border-orange-200 text-orange-700",
  "Retail": "bg-emerald-50 border-emerald-200 text-emerald-700",
};
const typeColor = (t: string) => TYPE_COLORS[t] ?? "bg-indigo-50 border-indigo-200 text-indigo-700";

function CompanyAddressesEditor({
  addresses,
  onChange,
}: {
  addresses: CompanyAddress[];
  onChange: (a: CompanyAddress[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const blank = (): CompanyAddress => ({
    id: nanoid(),
    type: "Warehouse",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "US",
  });

  const [draft, setDraft] = useState<CompanyAddress>(blank);
  const [customType, setCustomType] = useState("");
  const [typeMode, setTypeMode] = useState<"preset" | "custom">("preset");

  const startAdd = () => {
    setDraft(blank());
    setCustomType("");
    setTypeMode("preset");
    setEditingId(null);
    setAdding(true);
  };

  const startEdit = (addr: CompanyAddress) => {
    const isPreset = PRESET_ADDRESS_TYPES.includes(addr.type);
    setDraft({ ...addr });
    setCustomType(isPreset ? "" : addr.type);
    setTypeMode(isPreset ? "preset" : "custom");
    setEditingId(addr.id);
    setAdding(true);
  };

  const cancel = () => { setAdding(false); setEditingId(null); };

  const save = () => {
    const finalType = typeMode === "custom" ? (customType.trim() || "Custom") : draft.type;
    const entry: CompanyAddress = { ...draft, type: finalType };
    if (!entry.address.trim()) return;
    if (editingId) {
      onChange(addresses.map(a => a.id === editingId ? entry : a));
    } else {
      onChange([...addresses, entry]);
    }
    setAdding(false);
    setEditingId(null);
  };

  const remove = (id: string) => onChange(addresses.filter(a => a.id !== id));

  const setF = (k: keyof CompanyAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Company Addresses
        </p>
        {!adding && (
          <button type="button" onClick={startAdd}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1 transition-colors hover:bg-indigo-100">
            <Plus size={11} /> Add Address
          </button>
        )}
      </div>

      {/* Existing address cards */}
      {addresses.length > 0 && (
        <div className="flex flex-col gap-2">
          {addresses.map(addr => (
            <div key={addr.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 border mb-1.5 ${typeColor(addr.type)}`}>
                  {addr.type}
                </span>
                <p className="text-sm text-slate-700 truncate">{addr.address}</p>
                {(addr.city || addr.state || addr.zipCode) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                <button type="button" onClick={() => startEdit(addr)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-xs">✏️</button>
                <button type="button" onClick={() => remove(addr.id)}
                  className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {adding && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4 flex flex-col gap-3">
          <p className="text-xs font-bold text-indigo-700">{editingId ? "Edit Address" : "New Address"}</p>

          {/* Type selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Address Type</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ADDRESS_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => { setTypeMode("preset"); setDraft(d => ({ ...d, type: t })); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    typeMode === "preset" && draft.type === t
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                  }`}>
                  {t}
                </button>
              ))}
              <button type="button"
                onClick={() => setTypeMode("custom")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  typeMode === "custom"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                }`}>
                Custom…
              </button>
            </div>
            {typeMode === "custom" && (
              <LightFormInput
                autoFocus
                placeholder="e.g. Fulfillment Hub, HQ, R&D Lab…"
                value={customType}
                onChange={e => setCustomType(e.target.value)}
              />
            )}
          </div>

          {/* Address fields */}
          <LightFormField label="Street Address" required>
            <LightFormInput placeholder="123 Main St" value={draft.address} onChange={setF("address")} required />
          </LightFormField>
          <div className="grid grid-cols-3 gap-3">
            <LightFormField label="City">
              <LightFormInput placeholder="New York" value={draft.city ?? ""} onChange={setF("city")} />
            </LightFormField>
            <LightFormField label="State">
              <select
                value={draft.state ?? ""}
                onChange={setF("state")}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400 transition-colors"
              >
                <option value="">Select…</option>
                {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
              </select>
            </LightFormField>
            <LightFormField label="ZIP">
              <LightFormInput placeholder="10001" value={draft.zipCode ?? ""} onChange={setF("zipCode")} />
            </LightFormField>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={save}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors">
              {editingId ? "Save Changes" : "Add Address"}
            </button>
            <button type="button" onClick={cancel}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
