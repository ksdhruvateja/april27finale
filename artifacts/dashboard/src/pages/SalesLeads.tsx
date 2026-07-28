import { useState } from "react";
import { logAudit } from "@/lib/auditLog";
import { useRole } from "@/context/RoleContext";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import {
  useListSalesLeads, useCreateSalesLead, useUpdateSalesLead,
  useDeleteSalesLead, getListSalesLeadsQueryKey, type SalesLead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus, MoreHorizontal, Edit, Trash2, UserCheck, Mail, Phone } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
}

const emptyForm = (): FormState => ({ firstName: "", lastName: "", email: "", mobile: "" });

function SalesLeadModal({ initial, onClose }: { initial?: SalesLead; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateSalesLead();
  const update = useUpdateSalesLead();
  const [form, setForm] = useState<FormState>(
    initial
      ? { firstName: initial.firstName, lastName: initial.lastName, email: initial.email ?? "", mobile: initial.mobile ?? "" }
      : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const isEditing = !!initial;

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    const data = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || null,
      mobile: form.mobile.trim() || null,
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
      onClose();
    };
    const onError = () => setSaving(false);
    if (isEditing) {
      update.mutate({ id: initial.id, data }, { onSuccess, onError });
    } else {
      create.mutate(data, { onSuccess, onError });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-[17px] font-black text-slate-800 mb-5">
          {isEditing ? "Edit Sales Lead" : "Add Sales Lead"}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">First Name *</label>
              <input
                value={form.firstName} onChange={set("firstName")} required autoFocus
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Jane"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Last Name *</label>
              <input
                value={form.lastName} onChange={set("lastName")} required
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Email</label>
            <input
              type="email" value={form.email} onChange={set("email")}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="jane@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mobile</label>
            <input
              type="tel" value={form.mobile} onChange={set("mobile")}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SalesLeads() {
  const { data: leads, isLoading } = useListSalesLeads();
  const deleteLead = useDeleteSalesLead();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState<SalesLead | null>(null);
  const { currentUser } = useRole();
  const auditUser = () => ({ name: currentUser?.name ?? "", email: currentUser?.email ?? "", role: currentUser?.role ?? "unknown" });

  const filtered = leads?.filter(l => {
    const s = search.toLowerCase();
    const full = `${l.firstName} ${l.lastName}`.toLowerCase();
    return (
      full.includes(s) ||
      (l.email ?? "").toLowerCase().includes(s) ||
      (l.mobile ?? "").includes(s)
    );
  });

  const handleDelete = (id: number) => {
    const lead = leads?.find(l => l.id === id);
    if (confirm("Delete this sales lead?")) {
      deleteLead.mutate(id, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
          logAudit({ user: auditUser(), action: "deleted", entityType: "other", entityId: String(id), entityRef: lead ? `${lead.firstName} ${lead.lastName}` : `#${id}`, description: `Sales lead deleted: ${lead ? `${lead.firstName} ${lead.lastName}` : id}` });
        },
      });
    }
  };

  return (
    <Layout>
      <Header title="Sales Leads" subtitle={`${leads?.length ?? 0} total`} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-5 py-4 gap-4 bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex-shrink-0 flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text" placeholder="Search by name, email, mobile…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200"
          >
            <Plus size={14} /> Add Sales Lead
          </button>
        </div>

        <div className="glass-card flex-1 min-h-0 flex flex-col overflow-hidden border border-blue-100/70">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
          ) : !filtered?.length ? (
            <div className="p-12 text-center">
              <UserCheck size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">
                {search ? "No leads match your search." : "No sales leads yet. Add your first one!"}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-blue-100 bg-blue-50/95">
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Mobile</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 text-[11px] font-black">
                            {lead.firstName[0]}{lead.lastName[0]}
                          </span>
                        </div>
                        <span className="font-semibold text-slate-800 text-sm">{lead.firstName} {lead.lastName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-blue-600 text-sm hover:underline">
                          <Mail size={12} /> {lead.email}
                        </a>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {lead.mobile ? (
                        <div className="flex items-center gap-1.5 text-slate-600 text-sm">
                          <Phone size={12} className="text-slate-400" /> {lead.mobile}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1.5 hover:bg-slate-100 rounded-lg transition-all" onClick={e => e.stopPropagation()}>
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                            <DropdownMenuItem onClick={() => setEditingLead(lead)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50">
                              <Edit size={13} /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(lead.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500">
                              <Trash2 size={13} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {showModal && <SalesLeadModal onClose={() => setShowModal(false)} />}
      {editingLead && <SalesLeadModal initial={editingLead} onClose={() => setEditingLead(null)} />}
    </Layout>
  );
}
