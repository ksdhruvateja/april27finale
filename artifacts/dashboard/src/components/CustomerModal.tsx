import { useState, useEffect } from "react";
import { useCreateCustomer, useUpdateCustomer, getListCustomersQueryKey, useListSalesLeads, useListCustomers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { LightFormField, LightFormInput, LightFormSelect, LightFormTextarea, LightSubmitBar } from "./Modal";
import { Plus, X, ShieldCheck, ShieldOff, Phone, AlertCircle } from "lucide-react";
import { US_STATES } from "@/lib/usStates";

interface NetTerm { id: string; label: string; days?: number; }
const DEFAULT_NET_TERMS: NetTerm[] = [
  { id: "net30",        label: "Net 30",       days: 30 },
  { id: "net60",        label: "Net 60",       days: 60 },
  { id: "net90",        label: "Net 90",       days: 90 },
  { id: "cash",         label: "Cash",         days: 0  },
  { id: "cash_advance", label: "Cash Advance", days: 0  },
  { id: "cod",          label: "COD",          days: 0  },
];

interface AddressObj { address?: string; city?: string; state?: string; zipCode?: string; country?: string; }
interface PhoneEntry { label: string; number: string; }
interface EmailEntry { label: string; email: string; }

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
  taxExempt?: boolean;
  accountType?: string | null;
  creditLimit?: number | string | null;
  salesRep?: string | null;
  shippingCarrierName?: string | null;
  shippingAccountNumber?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

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
  const queryClient = useQueryClient();
  const isEdit = !!customer;
  const [apiError, setApiError] = useState<string | null>(null);
  const [netTerms, setNetTerms] = useState<NetTerm[]>(DEFAULT_NET_TERMS);

  useEffect(() => {
    fetch("/api/app-settings/net_terms")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.value) {
          try { setNetTerms(JSON.parse(d.value)); } catch {}
        }
      });
  }, []);

  const { data: salesLeads = [] } = useListSalesLeads();
  const { data: customers = [] } = useListCustomers();
  const allRepNames = Array.from(
    new Set([
      ...salesLeads.map((lead: any) => `${lead.firstName} ${lead.lastName}`).filter(Boolean),
      ...customers.map((c: any) => c.name).filter(Boolean)
    ])
  ).sort();

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

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setForm(f => {
      const matchedLead = salesLeads.find((lead: any) => {
        const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase();
        return fullName === name.trim().toLowerCase();
      });
      const salesRep = !f.salesRep && matchedLead
        ? `${(matchedLead as any).firstName} ${(matchedLead as any).lastName}`
        : f.salesRep;
      return { ...f, name, salesRep };
    });
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
            <LightFormField label="Full Name" required>
              <LightFormInput placeholder="e.g. John Smith" value={form.name} onChange={handleNameChange} required autoFocus />
            </LightFormField>
            <LightFormField label="Company">
              <LightFormInput placeholder="e.g. Acme Corp" value={form.company} onChange={set("company")} />
            </LightFormField>
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
  );
}
