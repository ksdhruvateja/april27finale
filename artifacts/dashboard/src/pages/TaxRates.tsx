import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListTaxRates, useDeleteTaxRate, getListTaxRatesQueryKey } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function TaxRates() {
  const { data: taxRates, isLoading } = useListTaxRates();
  const deleteTaxRate = useDeleteTaxRate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const filtered = taxRates?.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: number) => {
    if (confirm("Delete this tax rate?")) {
      deleteTaxRate.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTaxRatesQueryKey() })
      });
    }
  };

  return (
    <Layout>
      <Header title="Tax Rates" subtitle={`${taxRates?.length ?? 0} configured`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search tax rates..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <button className="bg-[hsl(224_50%_15%)] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[hsl(224_50%_20%)] transition-colors">
            <Plus size={14} /> Add Tax Rate
          </button>
        </div>
        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No tax rates found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Rate</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Region / Country</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Default</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(t => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3.5 text-slate-800 font-medium">{t.name}</td>
                    <td className="px-5 py-3.5 text-slate-800 font-semibold text-right">{t.rate}%</td>
                    <td className="px-5 py-3.5 text-slate-500">{[t.region, t.country].filter(Boolean).join(", ") || "Global"}</td>
                    <td className="px-5 py-3.5">
                      {t.isDefault ? (
                        <CheckCircle2 size={15} className="text-emerald-500" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                          <MoreHorizontal size={14} className="text-slate-500" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[130px]">
                          <DropdownMenuItem className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(t.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
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
    </Layout>
  );
}
