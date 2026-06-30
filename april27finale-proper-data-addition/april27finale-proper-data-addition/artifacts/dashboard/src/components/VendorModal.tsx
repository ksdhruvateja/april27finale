import { useState } from "react";
import { useCreateVendor, useUpdateVendor, getListVendorsQueryKey, useListSalesLeads, useListCustomers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { LightFormField as FormField, LightFormInput as FormInput, LightFormSelect as FormSelect, LightFormTextarea as FormTextarea, LightSubmitBar as SubmitBar } from "./Modal";
import { Plus, X, ShieldCheck, ShieldOff, Phone } from "lucide-react";
import { US_STATES } from "@/lib/usStates";
import { QuickBooksFieldsSection, parseQbExtras, qbExtrasFromForm } from "./QuickBooksFields";

interface AddressObj { address?: string; city?: string; state?: string; zipCode?: string; country?: string; }
interface PhoneEntry { label: string; number: string; }
interface EmailEntry { label: string; email: string; }

interface VendorData {
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
  paymentTerms?: string | null;
  creditLimit?: number | string | null;
  salesRep?: string | null;
  vendorOnboardingDate?: string | null;
  einNumber?: string | null;
  shippingCarrierName?: string | null;
  shippingAccountNumber?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
  quickbooksExtras?: Record<string, unknown> | null;
}

interface Props {
  onClose: () => void;
  vendor?: VendorData;
  onCreated?: (id: number) => void;
}

const PHONE_LABELS = ["Mobile", "Office", "Home", "Private", "Direct", "Fax", "Other"];
const EMAIL_LABELS = ["Work", "Personal", "Billing", "Other"];

function parsePhones(vendor?: VendorData): PhoneEntry[] {
  if (vendor?.phones && Array.isArray(vendor.phones) && vendor.phones.length > 0) {
    return vendor.phones.map((p: any) =>
      typeof p === "string" ? { label: "Mobile", number: p } : { label: p.label ?? "Mobile", number: p.number ?? p }
    );
  }
  if (vendor?.phone) return [{ label: "Mobile", number: vendor.phone }];
  return [{ label: "Mobile", number: "" }];
}

function parseEmails(vendor?: VendorData): EmailEntry[] {
  if (vendor?.emails && Array.isArray(vendor.emails) && vendor.emails.length > 0) {
    return vendor.emails.map((e: any) =>
      typeof e === "string" ? { label: "Work", email: e } : { label: e.label ?? "Work", email: e.email ?? e }
    );
  }
  if (vendor?.email) return [{ label: "Work", email: vendor.email }];
  return [{ label: "Work", email: "" }];
}

function AddressBlock({ label, addr, onChange }: { label: string; addr: AddressObj; onChange: (a: AddressObj) => void }) {
  const set = (k: keyof AddressObj) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...addr, [k]: e.target.value });
  const isBilling = label.toLowerCase().includes("billing");
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-3 border ${isBilling ? "bg-blue-50 border-blue-200" : "bg-emerald-50 border-emerald-200"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isBilling ? "text-blue-700" : "text-emerald-700"}`}>
        <span className={`inline-block w-2 h-2 rounded-full ${isBilling ? "bg-blue-500" : "bg-emerald-500"}`} />
        {label}
      </p>
      <FormField label="Street Address">
        <FormInput placeholder="456 Warehouse Blvd" value={addr.address ?? ""} onChange={set("address")} />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="City">
          <FormInput placeholder="Dallas" value={addr.city ?? ""} onChange={set("city")} />
        </FormField>
        <FormField label="State">
          <FormSelect value={addr.state ?? ""} onChange={set("state")}>
            <option value="">Select state…</option>
            {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="ZIP Code">
          <FormInput placeholder="75001" value={addr.zipCode ?? ""} onChange={set("zipCode")} />
        </FormField>
      </div>
    </div>
  );
}

export default function VendorModal({ onClose, vendor, onCreated }: Props) {
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const queryClient = useQueryClient();
  const isEdit = !!vendor;

  // Fetch sales leads and customers to populate sales rep options
  const { data: salesLeads = [] } = useListSalesLeads();
  const { data: customers = [] } = useListCustomers();
  
  // Combine sales lead names and customer names
  const allRepNames = Array.from(
    new Set([
      ...salesLeads.map((lead: any) => `${lead.firstName} ${lead.lastName}`).filter(Boolean),
      ...customers.map((c: any) => c.name).filter(Boolean)
    ])
  ).sort();

  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    company: vendor?.company ?? "",
    salesRep: vendor?.salesRep ?? "",
    vendorOnboardingDate: vendor?.vendorOnboardingDate ?? "",
    einNumber: vendor?.einNumber ?? "",
    paymentTerms: vendor?.paymentTerms ?? "",
    creditLimit: vendor?.creditLimit ?? "",
    shippingCarrierName: vendor?.shippingCarrierName ?? "",
    shippingAccountNumber: vendor?.shippingAccountNumber ?? "",
    taxNumber: vendor?.taxNumber ?? "",
    notes: vendor?.notes ?? "",
    taxExempt: vendor?.taxExempt ?? false,
  });

  const [qbForm, setQbForm] = useState(() => parseQbExtras(vendor?.quickbooksExtras));

  const [emails, setEmails] = useState<EmailEntry[]>(parseEmails(vendor));
  const [phones, setPhones] = useState<PhoneEntry[]>(parsePhones(vendor));
  const [billingAddress, setBillingAddress] = useState<AddressObj>(
    (vendor?.billingAddress as AddressObj) ?? { address: vendor?.address ?? "", city: vendor?.city ?? "", state: vendor?.state ?? "", zipCode: vendor?.zipCode ?? "", country: "US" }
  );
  const [shippingAddress, setShippingAddress] = useState<AddressObj>(
    (vendor?.shippingAddress as AddressObj) ?? {}
  );
  const [sameAsBilling, setSameAsBilling] = useState<boolean>(() => {
    if (!vendor?.shippingAddress) return false;
    const s = vendor.shippingAddress as AddressObj;
    const b = (vendor?.billingAddress as AddressObj) ?? {};
    return s.address === b.address && s.city === b.city && s.state === b.state && s.zipCode === b.zipCode;
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const validEmails = emails.filter(em => em.email.trim());
    const validPhones = phones.filter(ph => ph.number.trim());
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
      vendorOnboardingDate: form.vendorOnboardingDate || null,
      einNumber: form.einNumber || null,
      paymentTerms: form.paymentTerms || null,
      creditLimit: form.creditLimit || null,
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
      quickbooksExtras: qbExtrasFromForm(qbForm),
    };

    if (isEdit) {
      update.mutate({ id: vendor.id, data }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() }); onClose(); }
      });
    } else {
      create.mutate({ data }, {
        onSuccess: (result: any) => {
          queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
          if (onCreated && result?.id) onCreated(result.id);
          onClose();
        }
      });
    }
  };

  const isPending = isEdit ? update.isPending : create.isPending;

  return (
    <Modal
      title={isEdit ? "Edit Vendor" : "Add Vendor"}
      subtitle={isEdit ? "Update vendor information" : "Create a new vendor record"}
      onClose={onClose}
      lightMode
      maxWidth="max-w-4xl"
      footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEdit ? "Save Changes" : "Add Vendor"} formId="vendor-form" />}
    >
      <form id="vendor-form" onSubmit={handleSubmit}>
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contact Name" required>
              <FormInput placeholder="e.g. Jane Doe" value={form.name} onChange={set("name")} required autoFocus />
            </FormField>
            <FormField label="Company">
              <FormInput placeholder="e.g. Supply Co" value={form.company} onChange={set("company")} />
            </FormField>
          </div>

          {/* Emails */}
          <div className="flex flex-col gap-2">
            <label className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Email Addresses</label>
            {emails.map((em, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={em.label}
                  onChange={e => setEmails(prev => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  className="text-xs rounded-lg px-2 py-2.5 border border-slate-200 bg-white text-slate-700 focus:outline-none w-28 flex-shrink-0"
                >
                  {EMAIL_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <FormInput
                  type="email"
                  placeholder={i === 0 ? "Primary email" : "Additional email"}
                  value={em.email}
                  onChange={e => setEmails(prev => prev.map((x, idx) => idx === i ? { ...x, email: e.target.value } : x))}
                />
                {emails.length > 1 && (
                  <button type="button" onClick={() => setEmails(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setEmails(prev => [...prev, { label: "Work", email: "" }])}
              className="self-start flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              <Plus size={12} /> Add another email
            </button>
          </div>

          {/* Phones */}
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
                <FormInput
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
              className="self-start flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              <Plus size={12} /> Add another phone
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Vendor Onboarding Date">
              <FormInput type="date" value={form.vendorOnboardingDate} onChange={set("vendorOnboardingDate")} />
            </FormField>
          </div>

          {/* Account Settings */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Payment Terms">
              <FormSelect value={form.paymentTerms} onChange={set("paymentTerms")}>
                <option value="">Select terms…</option>
                <option value="net30">Net 30 (pay within 30 days)</option>
                <option value="net60">Net 60 (pay within 60 days)</option>
                <option value="net90">Net 90 (pay within 90 days)</option>
                <option value="cash">Cash (immediate)</option>
                <option value="cod">COD (immediate)</option>
              </FormSelect>
            </FormField>
            <FormField label="Credit Limit ($)">
              <FormInput type="number" step="0.01" min="0" placeholder="e.g. 5000" value={form.creditLimit} onChange={set("creditLimit")} />
            </FormField>
            <FormField label="EIN Number">
              <FormInput placeholder="e.g. 12-3456789" value={form.einNumber} onChange={set("einNumber")} />
            </FormField>
          </div>

          {/* Sales Rep */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Sales Rep">
              <input
                type="text"
                list="salesRepList"
                placeholder="Type name or select..."
                value={form.salesRep}
                onChange={set("salesRep")}
                className="input-light w-full"
              />
              <datalist id="salesRepList">
                {allRepNames.map(rep => <option key={rep} value={rep} />)}
              </datalist>
            </FormField>
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

          <div className="flex gap-3">
            <div className="flex-1">
              <FormField label="Shipping Carrier">
                <FormInput placeholder="e.g. UPS, FedEx, DHL" value={form.shippingCarrierName} onChange={set("shippingCarrierName")} />
              </FormField>
            </div>
            <div className="flex-1">
              <FormField label="Shipping Account #">
                <FormInput placeholder="e.g. 123456" value={form.shippingAccountNumber} onChange={set("shippingAccountNumber")} />
              </FormField>
            </div>
          </div>

          <FormField label="Notes">
            <FormTextarea placeholder="Any additional notes..." value={form.notes} onChange={set("notes")} rows={2} />
          </FormField>

          <QuickBooksFieldsSection
            fields={[
              { key: "vendorQuoteNumber", label: "Vendor Quote #", placeholder: "QuickBooks quote #" },
              { key: "tracking1099", label: "1099 Tracking", placeholder: "1099 status" },
              { key: "openBalance", label: "Open Balance ($)", type: "number", placeholder: "0.00" },
            ]}
            values={qbForm}
            onChange={(key, value) => setQbForm((f) => ({ ...f, [key]: value }))}
          />
        </div>
      </form>
    </Modal>
  );
}
