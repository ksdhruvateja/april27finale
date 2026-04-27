import { useState } from "react";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListInventory, useUpdateInventoryItem, getListInventoryQueryKey } from "@workspace/api-client-react";
import { Search, MoreHorizontal, Edit, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Inventory() {
  const { data: inventory, isLoading } = useListInventory();
  const updateInventory = useUpdateInventoryItem();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const filtered = inventory?.filter(i =>
    i.productName.toLowerCase().includes(search.toLowerCase()) ||
    i.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdateStock = (id: number, currentQty: number) => {
    const newQty = prompt("Update stock quantity:", currentQty.toString());
    if (newQty && !isNaN(Number(newQty))) {
      updateInventory.mutate({ id, data: { quantity: Number(newQty) } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() })
      });
    }
  };

  return (
    <Layout>
      <Header title="Inventory" subtitle={`${inventory?.length ?? 0} items`} />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 flex flex-col gap-4 bg-[hsl(220_25%_97%)]">
        <div className="flex justify-between items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by product or SKU..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
        </div>
        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-slate-800 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No inventory items found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">SKU</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Product</th>
                  <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">In Stock</th>
                  <th className="px-5 py-3 text-right text-slate-400 font-medium text-[11px] uppercase tracking-wider">Reorder Point</th>
                  <th className="px-5 py-3 text-left text-slate-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(item => {
                  const isLow = item.quantity <= item.reorderPoint;
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{item.sku || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-800 font-medium">{item.productName}</td>
                      <td className={`px-5 py-3.5 font-semibold text-right ${isLow ? "text-red-600" : "text-slate-800"}`}>
                        {item.quantity} <span className="text-slate-400 font-normal text-xs">{item.unit}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-right">{item.reorderPoint}</td>
                      <td className="px-5 py-3.5">
                        {isLow ? (
                          <div className="flex items-center gap-1.5 text-red-500 text-xs font-medium">
                            <AlertCircle size={13} /> Low Stock
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 size={13} /> Optimal
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[140px]">
                            <DropdownMenuItem onClick={() => handleUpdateStock(item.id, item.quantity)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Update Stock</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
