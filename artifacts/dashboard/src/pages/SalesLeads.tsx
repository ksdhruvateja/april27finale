import { useState, useMemo, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import {
  useListSalesLeads, useCreateSalesLead, useUpdateSalesLead,
  useDeleteSalesLead, getListSalesLeadsQueryKey, type SalesLead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, MoreHorizontal, Edit, Trash2, UserCheck,
  Mail, Phone, Check, X, Loader2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
}

const emptyForm = (): FormState => ({ firstName: "", lastName: "", email: "", mobile: "" });

/* ── Add / Edit modal ── */
function SalesLeadModal({
  initial,
  onClose,
}: {
  initial?: SalesLead;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useCreateSalesLead();
  const update = useUpdateSalesLead();
  const isEditing = !!initial;

  const [form, setForm] = useState<FormState>(
    initial
      ? { firstName: initial.firstName, lastName: initial.lastName, email: initial.email ?? "", mobile: initial.mobile ?? "" }
      : emptyForm(),
  );
  const [saving, setSaving]   = useState(false);
  const [errMsg, setErrMsg]   = useState<string | null>(null);

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    setErrMsg(null);
    const data = {
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      email:     form.email.trim()  || null,
      mobile:    form.mobile.trim() || null,
    };
    try {
      if (isEditing) {
        await update.mutateAsync({ id: initial.id, data });
      } else {
        await create.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
      onClose();
    } catch (err: any) {
      setErrMsg(err?.message ?? "Could not save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-black text-slate-800 mb-5">
          {isEditing ? "Edit Sales Person" : "Add Sales Person"}
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
          {errMsg && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errMsg}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving
                ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                : isEditing ? "Save Changes" : "Add Sales Person"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Edit modal (used only for editing existing records) ── */
function EditModal({ lead, onClose }: { lead: SalesLead; onClose: () => void }) {
  const queryClient = useQueryClient();
  const update = useUpdateSalesLead();
  const [form, setForm] = useState<FormState>({
    firstName: lead.firstName,
    lastName:  lead.lastName,
    email:     lead.email  ?? "",
    mobile:    lead.mobile ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    update.mutate(
      {
        id: lead.id,
        data: {
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
          email:     form.email.trim()  || null,
          mobile:    form.mobile.trim() || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
          onClose();
        },
        onError: () => setSaving(false),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-black text-slate-800 mb-5">Edit Sales Person</h2>
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
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Inline add row component ── */
function InlineAddRow({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient();
  const create       = useCreateSalesLead();
  const [form, setForm] = useState<FormState>(emptyForm());
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    await create.mutateAsync(
      {
        data: {
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
          email:     form.email.trim()  || null,
          mobile:    form.mobile.trim() || null,
        },
      },
    );
    await queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() });
    onCancel();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") onCancel();
  };

  const inp = "border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 bg-white w-full placeholder:text-slate-300";

  return (
    <tr className="bg-blue-50/70 border-b border-blue-200">
      {/* Avatar + first/last name */}
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0 text-blue-600 text-[10px] font-black">
            {(form.firstName[0] ?? "?").toUpperCase()}{(form.lastName[0] ?? "").toUpperCase()}
          </div>
          <div className="flex gap-1.5 flex-1">
            <input
              ref={firstRef}
              value={form.firstName} onChange={set("firstName")} onKeyDown={handleKey}
              placeholder="First *" className={inp} style={{ width: 90 }}
            />
            <input
              value={form.lastName} onChange={set("lastName")} onKeyDown={handleKey}
              placeholder="Last *" className={inp} style={{ width: 90 }}
            />
          </div>
        </div>
      </td>
      {/* Email */}
      <td className="px-5 py-2.5">
        <input
          type="email" value={form.email} onChange={set("email")} onKeyDown={handleKey}
          placeholder="jane@example.com" className={inp}
        />
      </td>
      {/* Mobile */}
      <td className="px-5 py-2.5">
        <input
          type="tel" value={form.mobile} onChange={set("mobile")} onKeyDown={handleKey}
          placeholder="+1 (555) 000-0000" className={inp}
        />
      </td>
      {/* Actions */}
      <td className="px-5 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={handleSave}
            disabled={create.isPending || !form.firstName.trim() || !form.lastName.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {create.isPending
              ? <Loader2 size={12} className="animate-spin" />
              : <Check size={12} />
            }
            Save
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Main page ── */
export default function SalesLeads() {
  const { data: leads, isLoading } = useListSalesLeads();
  const deleteLead  = useDeleteSalesLead();
  const queryClient = useQueryClient();

  const [search,      setSearch]      = useState("");
  const [showAdd,     setShowAdd]     = useState(false);   // modal for adding
  const [showInline,  setShowInline]  = useState(false);   // inline row in table
  const [editingLead, setEditingLead] = useState<SalesLead | null>(null);

  /* Alphabetical sort by last name, then first name */
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const base = (leads ?? []).filter(l => {
      const full = `${l.firstName} ${l.lastName}`.toLowerCase();
      return (
        full.includes(s) ||
        (l.email  ?? "").toLowerCase().includes(s) ||
        (l.mobile ?? "").includes(s)
      );
    });
    return [...base].sort((a, b) => {
      const la = `${a.lastName} ${a.firstName}`.toLowerCase();
      const lb = `${b.lastName} ${b.firstName}`.toLowerCase();
      return la.localeCompare(lb);
    });
  }, [leads, search]);

  const handleDelete = (id: number) => {
    if (confirm("Delete this sales person?")) {
      deleteLead.mutate(id, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSalesLeadsQueryKey() }),
      });
    }
  };

  return (
    <Layout>
      <Header title="Sales People" subtitle={`${leads?.length ?? 0} total`} />

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">

        {/* Toolbar */}
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text" placeholder="Search by name, email, mobile…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-200"
          >
            <Plus size={14} /> Add Sales Person
          </button>
        </div>

        {/* Table */}
        <div className="glass-card overflow-hidden border border-blue-100/70">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-blue-400" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[72vh]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-blue-100 bg-blue-50/70">
                    <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Email</th>
                    <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Mobile</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {/* Inline add row — quick entry directly in the table */}
                  {showInline && (
                    <InlineAddRow onCancel={() => setShowInline(false)} />
                  )}

                  {filtered.length === 0 && !showInline && (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center">
                        <UserCheck size={32} className="text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm font-medium">
                          {search
                            ? "No people match your search."
                            : "No sales people yet — click Add Sales Person to get started."}
                        </p>
                      </td>
                    </tr>
                  )}

                  {filtered.map(lead => (
                    <tr key={lead.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-700 text-[11px] font-black">
                              {lead.firstName[0]}{lead.lastName[0]}
                            </span>
                          </div>
                          <span className="font-semibold text-slate-800 text-sm">
                            {lead.firstName} {lead.lastName}
                          </span>
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
                            <DropdownMenuTrigger
                              className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"
                              onClick={e => e.stopPropagation()}
                            >
                              <MoreHorizontal size={14} className="text-slate-500" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                              <DropdownMenuItem
                                onClick={() => setEditingLead(lead)}
                                className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"
                              >
                                <Edit size={13} /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(lead.id)}
                                className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"
                              >
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

      {showAdd && (
        <SalesLeadModal onClose={() => setShowAdd(false)} />
      )}
      {editingLead && (
        <SalesLeadModal initial={editingLead} onClose={() => setEditingLead(null)} />
      )}
    </Layout>
  );
}
