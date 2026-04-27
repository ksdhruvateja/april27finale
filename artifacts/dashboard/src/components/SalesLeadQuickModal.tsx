import { useState } from "react";
import { getListSalesLeadsQueryKey, useCreateSalesLead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  onClose: () => void;
  onCreated: (fullName: string) => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
}

const emptyForm = (): FormState => ({ firstName: "", lastName: "", email: "", mobile: "" });

export default function SalesLeadQuickModal({ onClose, onCreated }: Props) {
  const create = useCreateSalesLead();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName || !lastName) return;

    create.mutate(
      {
        data: {
          firstName,
          lastName,
          email: form.email.trim() || null,
          mobile: form.mobile.trim() || null,
        },
      },
      {
        onSuccess: (lead) => {
          queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
          onCreated(`${lead.firstName} ${lead.lastName}`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85" onClick={onClose}>
      <div
        className="bg-white/95 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-slate-200 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-black text-slate-800 mb-5">Add Sales Lead</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">First Name *</label>
              <input
                value={form.firstName}
                onChange={setField("firstName")}
                required
                autoFocus
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Jane"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Last Name *</label>
              <input
                value={form.lastName}
                onChange={setField("lastName")}
                required
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={setField("email")}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="jane@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mobile</label>
            <input
              type="tel"
              value={form.mobile}
              onChange={setField("mobile")}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {create.isPending ? "Saving..." : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
