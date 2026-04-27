import { useState } from "react";
import { useCreateCustomer, useUpdateCustomer, getListCustomersQueryKey, useListSalesLeads, useListCustomers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormInput, FormSelect, FormTextarea, SubmitBar } from "./Modal";
import { Plus, X, ShieldCheck, ShieldOff } from "lucide-react";
import { US_STATES } from "@/lib/usStates";

interface AddressObj { address?: string; city?: string; state?: string; zipCode?: string; country?: string; }

interface CustomerData {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
  emails?: string[] | null;
  phone?: string | null;
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
  shippingAccountNumber?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

interface Props {
  onClose: () => void;
  customer?: CustomerData;
  onCreated?: (id: number) => void;
}

function AddressBlock({ label, addr, onChange }: { label: string; addr: AddressObj; onChange: (a: AddressObj) => void }) {
  const set = (k: keyof AddressObj) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...addr, [k]: e.target.value });
  const isBilling = label.toLowerCase().includes("billing");
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={isBilling
        ? { background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.35)", boxShadow: "0 0 0 1px rgba(59,130,246,0.08) inset, 0 2px 12px rgba(59,130,246,0.12)" }
        : { background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)", boxShadow: "0 0 0 1px rgba(16,185,129,0.08) inset, 0 2px 12px rgba(16,185,129,0.12)" }
      }
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
        style={isBilling ? { color: "#93c5fd" } : { color: "#6ee7b7" }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={isBilling
            ? { background: "#3b82f6", boxShadow: "0 0 6px rgba(59,130,246,0.7)" }
            : { background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.7)" }
          }
        />
        {label}
      </p>
      <FormField label="Street Address">
        <FormInput placeholder="123 Main St" value={addr.address ?? ""} onChange={set("address")} />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="City">
          <FormInput placeholder="New York" value={addr.city ?? ""} onChange={set("city")} />
        </FormField>
        <FormField label="State">
          <FormSelect value={addr.state ?? ""} onChange={set("state")}>
            <option value="">Select state…</option>
            {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
          </FormSelect>
        </FormField>
        <FormField label="ZIP Code">
          <FormInput placeholder="10001" value={addr.zipCode ?? ""} onChange={set("zipCode")} />
        </FormField>
      </div>
    </div>
  );
}

export default function CustomerModal({ onClose, customer, onCreated }: Props) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const queryClient = useQueryClient();
  const isEdit = !!customer;

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
    name: customer?.name ?? "",
    company: customer?.company ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    salesRep: customer?.salesRep ?? "",
    accountType: customer?.accountType ?? "",
    creditLimit: customer?.creditLimit != null ? String(customer.creditLimit) : "",
    shippingAccountNumber: customer?.shippingAccountNumber ?? "",
    taxNumber: customer?.taxNumber ?? "",
    notes: customer?.notes ?? "",
    taxExempt: customer?.taxExempt ?? false,
  });

  const [emails, setEmails] = useState<string[]>(
    (customer?.emails as string[] | null) ?? (customer?.email ? [customer.email] : [""])
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

  const addEmail = () => setEmails(e => [...e, ""]);
  const removeEmail = (i: number) => setEmails(e => e.filter((_, idx) => idx !== i));
  const setEmail = (i: number, val: string) => setEmails(e => e.map((x, idx) => idx === i ? val : x));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const primaryEmail = emails[0] || null;
    const allEmails = emails.filter(Boolean);
    const data: any = {
      name: form.name,
      company: form.company || null,
      email: primaryEmail,
      emails: allEmails.length > 0 ? allEmails : null,
      phone: form.phone || null,
      salesRep: form.salesRep || null,
      accountType: form.accountType || null,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
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

    if (isEdit) {
      update.mutate({ id: customer.id, data }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); onClose(); }
      });
    } else {
      create.mutate({ data }, {
        onSuccess: (result: any) => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          if (onCreated && result?.id) onCreated(result.id);
          onClose();
        }
      });
    }
  };

  const isPending = isEdit ? update.isPending : create.isPending;

  return (
    <Modal
      title={isEdit ? "Edit Customer" : "Add Customer"}
      subtitle={isEdit ? "Update customer information" : "Create a new customer record"}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={<SubmitBar onClose={onClose} isLoading={isPending} label={isEdit ? "Save Changes" : "Add Customer"} formId="customer-form" />}
    >
      <form id="customer-form" onSubmit={handleSubmit}>
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Full Name" required>
              <FormInput placeholder="e.g. John Smith" value={form.name} onChange={set("name")} required autoFocus />
            </FormField>
            <FormField label="Company">
              <FormInput placeholder="e.g. Acme Corp" value={form.company} onChange={set("company")} />
            </FormField>
          </div>

          {/* Emails */}
          <div className="flex flex-col gap-2">
            <label className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Email Addresses</label>
            {emails.map((em, i) => (
              <div key={i} className="flex gap-2">
                <FormInput
                  type="email"
                  placeholder={i === 0 ? "Primary email" : "Additional email"}
                  value={em}
                  onChange={e => setEmail(i, e.target.value)}
                />
                {emails.length > 1 && (
                  <button type="button" onClick={() => removeEmail(i)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addEmail}
              className="self-start flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              <Plus size={12} /> Add another email
            </button>
          </div>

          {/* Phone */}
          <FormField label="Phone">
            <FormInput placeholder="+1-555-0100" value={form.phone} onChange={set("phone")} />
          </FormField>

          {/* Account Settings */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Account Type">
              <FormSelect value={form.accountType} onChange={set("accountType")}>
                <option value="">Select type…</option>
                <option value="net30">Net 30</option>
                <option value="net60">Net 60</option>
                <option value="net90">Net 90</option>
                <option value="cash_advance">Cash Advance</option>
                <option value="cod">COD</option>
              </FormSelect>
            </FormField>
            <FormField label="Credit Limit ($)">
              <FormInput type="number" step="0.01" min="0" placeholder="e.g. 5000" value={form.creditLimit} onChange={set("creditLimit")} />
            </FormField>
            <FormField label="EIN Number">
              <FormInput placeholder="e.g. 12-3456789" value={form.taxNumber} onChange={set("taxNumber")} />
            </FormField>
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

          {/* Tax Exempt Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
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
                ? "This customer is tax exempt — taxes will not be applied automatically. You can still add tax manually."
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
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Shipping Account #">
              <FormInput placeholder="e.g. UPS-123456" value={form.shippingAccountNumber} onChange={set("shippingAccountNumber")} />
            </FormField>
          </div>

          <FormField label="Notes">
            <FormTextarea placeholder="Any additional notes..." value={form.notes} onChange={set("notes")} rows={2} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
