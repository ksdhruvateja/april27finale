import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListVendors, useDeleteVendor, getListVendorsQueryKey } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import VendorModal from "@/components/VendorModal";

type Vendor = {
  id: number; name: string; company?: string | null; email?: string | null;
  phone?: string | null; address?: string | null; city?: string | null;
  state?: string | null; zipCode?: string | null; country?: string | null;
  shippingAccountNumber?: string | null; notes?: string | null;
};

export default function Vendors() {
  const { data: vendors, isLoading } = useListVendors();
  const deleteVendor = useDeleteVendor();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  const filtered = vendors?.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: number) => {
    if (confirm("Delete this vendor?")) {
      deleteVendor.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() })
      });
    }
  };

  return (
    <Layout>
      <Header title="Vendors" subtitle={`${vendors?.length ?? 0} total`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search vendors..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200">
            <Plus size={14} /> Add Vendor
          </button>
        </div>
        <div className="glass-card overflow-hidden border border-blue-100/70">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No vendors found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-100 bg-blue-50/70">
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Location</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(v => (
                  <tr key={v.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors group">
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{v.name}</td>
                    <td className="px-5 py-3.5 text-slate-500">{v.email || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-500">{v.phone || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-500">{[v.city, v.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-5 py-3.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                          <MoreHorizontal size={14} className="text-slate-500" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[130px]">
                          <DropdownMenuItem onClick={() => setEditingVendor(v as Vendor)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(v.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showModal && <VendorModal onClose={() => setShowModal(false)} />}
      {editingVendor && (
        <VendorModal vendor={editingVendor} onClose={() => setEditingVendor(null)} />
      )}
    </Layout>
  );
}
