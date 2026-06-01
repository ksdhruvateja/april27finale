import { useState, useMemo, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useListCustomers, useDeleteCustomer, useCreateCustomer, getListCustomersQueryKey, useListInvoices } from "@workspace/api-client-react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Eye, X, Phone, Mail, MapPin, BarChart2, ChevronDown, ChevronUp, Upload, Download, AlertCircle, CheckSquare, Square, FileSpreadsheet, Check, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CustomerModal from "@/components/CustomerModal";
import * as XLSX from "xlsx";

type Customer = {
  id: number; name: string; company?: string | null; email?: string | null;
  emails?: any[] | null; phone?: string | null; phones?: any[] | null;
  address?: string | null; city?: string | null;
  state?: string | null; zipCode?: string | null; country?: string | null;
  shippingAccountNumber?: string | null; notes?: string | null;
  taxExempt?: boolean; accountType?: string | null; creditLimit?: any;
  salesRep?: string | null; taxNumber?: string | null;
  billingAddress?: any; shippingAddress?: any; amountOwed?: number;
};

type ImportRow = {
  name: string; company?: string; email?: string; phone?: string;
  address?: string; city?: string; state?: string; zipCode?: string;
  country?: string; accountType?: string; creditLimit?: number | null;
  notes?: string; taxExempt?: boolean; salesRep?: string; taxNumber?: string;
  shippingAccountNumber?: string;
  quickbooksExtras?: Record<string, unknown>;
  _valid: boolean; _error?: string;
};

function CustomerViewModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const phones: any[] = customer.phones ?? (customer.phone ? [{ label: "Mobile", number: customer.phone }] : []);
  const emails: any[] = customer.emails ?? (customer.email ? [{ label: "Work", email: customer.email }] : []);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-slate-800 text-base">{customer.company || customer.name}</h2>
            {customer.company && <p className="text-sm text-slate-400 mt-0.5">{customer.name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {phones.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Phone size={11} /> Phone Numbers</p>
              <div className="space-y-1.5">
                {phones.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 min-w-[52px] text-center">{p.label ?? "Phone"}</span>
                    <span className="text-sm text-slate-700">{p.number ?? p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {emails.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Mail size={11} /> Email Addresses</p>
              <div className="space-y-1.5">
                {emails.map((em: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 min-w-[52px] text-center">{em.label ?? "Email"}</span>
                    <span className="text-sm text-slate-700">{em.email ?? em}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(customer.city || customer.state) && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><MapPin size={11} /> Location</p>
              <p className="text-sm text-slate-700">{[customer.address, [customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ")].filter(Boolean).join(", ")}</p>
            </div>
          )}
          {customer.accountType && (
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[11px] text-slate-400 font-semibold uppercase">Account Type</p>
                <p className="text-sm text-slate-700 font-medium mt-0.5">{customer.accountType}</p>
              </div>
              {customer.creditLimit && (
                <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[11px] text-slate-400 font-semibold uppercase">Credit Limit</p>
                  <p className="text-sm text-slate-700 font-medium mt-0.5">${Number(customer.creditLimit).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}
          {customer.salesRep && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Sales Rep</p>
              <p className="text-sm text-slate-700">{customer.salesRep}</p>
            </div>
          )}
          {customer.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_COLUMNS = [
  "Name", "Company", "Email", "Phone", "Address", "City", "State",
  "ZipCode", "Country", "AccountType", "CreditLimit", "SalesRep",
  "TaxNumber", "TaxExempt", "Notes"
];

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    ["John Smith", "Acme Corp", "john@acme.com", "555-1234", "123 Main St", "New York", "NY", "10001", "US", "net30", "5000", "Jane Rep", "", "false", ""],
    ["Sara Jones", "Beta LLC", "sara@beta.com", "555-5678", "456 Elm Ave", "Chicago", "IL", "60601", "US", "net60", "", "", "", "false", ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Customers");
  XLSX.writeFile(wb, "customers_import_template.xlsx");
}

function parseImportRows(rows: any[][]): ImportRow[] {
  const [header, ...data] = rows;
  const normalizeHeader = (h: string) => h.toLowerCase().replace(/[\s_-]/g, "");
  const hMap: Record<string, number> = {};
  header.forEach((h: any, i: number) => { hMap[normalizeHeader(String(h ?? ""))] = i; });
  const col = (row: any[], key: string) => {
    const idx = hMap[key];
    return idx !== undefined ? String(row[idx] ?? "").trim() : "";
  };
  return data
    .filter(row => row.some(cell => cell !== "" && cell !== null && cell !== undefined))
    .map(row => {
      const name = col(row, "name") || col(row, "customer");
      if (!name) return { name: "", _valid: false, _error: "Name is required" };
      const creditLimitRaw = col(row, "creditlimit");
      const creditLimit = creditLimitRaw ? Number(creditLimitRaw) : null;
      const taxExemptRaw = col(row, "taxexempt").toLowerCase();
      const taxExempt = taxExemptRaw === "true" || taxExemptRaw === "yes" || taxExemptRaw === "1";
      const openBalRaw = col(row, "openbalance");
      const openBalance = openBalRaw ? Number(String(openBalRaw).replace(/[$,]/g, "")) : null;
      const refNum = col(row, "referencenumber") || col(row, "reference");
      const custType = col(row, "customertype");
      const noteLines = [
        col(row, "notes"),
        refNum ? `Reference #: ${refNum}` : "",
        openBalance != null && !isNaN(openBalance) ? `QuickBooks Open Balance: $${openBalance.toLocaleString()}` : "",
        custType ? `Customer Type: ${custType}` : "",
        col(row, "attachments") ? `Attachments: ${col(row, "attachments")}` : "",
      ].filter(Boolean);
      return {
        name,
        company: col(row, "company") || col(row, "companyname") || undefined,
        email: col(row, "email") || undefined,
        phone: col(row, "phone") || undefined,
        address: col(row, "address") || col(row, "streetaddress") || undefined,
        city: col(row, "city") || undefined,
        state: col(row, "state") || undefined,
        zipCode: col(row, "zipcode") || col(row, "zip") || col(row, "postalcode") || undefined,
        country: col(row, "country") || undefined,
        accountType: col(row, "accounttype") || undefined,
        creditLimit: isNaN(creditLimit as number) ? null : creditLimit,
        salesRep: col(row, "salesrep") || undefined,
        taxNumber: col(row, "taxnumber") || undefined,
        shippingAccountNumber: col(row, "shippingaccountnumber") || col(row, "shippingaccount") || undefined,
        taxExempt,
        notes: noteLines.length ? noteLines.join("\n") : undefined,
        quickbooksExtras: {
          ...(refNum ? { referenceNumber: refNum } : {}),
          ...(openBalance != null && !isNaN(openBalance) ? { openBalance } : {}),
          ...(custType ? { customerType: custType } : {}),
        },
        _valid: true,
      };
    });
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const createCustomer = useCreateCustomer();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setDone(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      setRows(parseImportRows(raw));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows = rows.filter(r => r._valid);
  const invalidRows = rows.filter(r => !r._valid);

  const handleImport = async () => {
    if (!validRows.length) return;
    setImporting(true);
    let ok = 0; let fail = 0;
    for (const row of validRows) {
      try {
        await new Promise<void>((resolve, reject) => {
          createCustomer.mutate({ data: {
            name: row.name,
            company: row.company ?? null,
            email: row.email ?? null,
            emails: row.email ? [row.email] : null,
            phone: row.phone ?? null,
            phones: row.phone ? [row.phone] : null,
            address: row.address ?? null,
            city: row.city ?? null,
            state: row.state ?? null,
            zipCode: row.zipCode ?? null,
            country: row.country ?? null,
            accountType: row.accountType as any ?? null,
            creditLimit: row.creditLimit ?? null,
            salesRep: row.salesRep ?? null,
            taxNumber: row.taxNumber ?? null,
            shippingAccountNumber: row.shippingAccountNumber ?? null,
            taxExempt: row.taxExempt ?? false,
            notes: row.notes ?? null,
            quickbooksExtras: row.quickbooksExtras ?? null,
          }}, { onSuccess: () => { ok++; resolve(); }, onError: () => { fail++; resolve(); } });
        });
      } catch { fail++; }
    }
    await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
    setImporting(false);
    setDone({ ok, fail });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(10px)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-[15px]">Import Customers</h2>
              <p className="text-xs text-slate-400">Upload Excel (.xlsx) or CSV file</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50">
            <div>
              <p className="text-[13px] font-semibold text-slate-700">Need a template?</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Download the Excel template with the correct column format</p>
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors">
              <Download size={13} /> Download Template
            </button>
          </div>

          {/* Column reference */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider mb-1.5">Expected Columns</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_COLUMNS.map(col => (
                <span key={col} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-blue-200 text-blue-700">{col}</span>
              ))}
            </div>
            <p className="text-[10px] text-blue-500 mt-2">Only <strong>Name</strong> is required. Column names are case-insensitive.</p>
          </div>

          {/* Drop zone */}
          {!done && (
            <div
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-slate-300 bg-slate-50/50"}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${dragOver ? "bg-emerald-100" : "bg-slate-100"}`}>
                <Upload size={22} className={dragOver ? "text-emerald-600" : "text-slate-400"} />
              </div>
              <div className="text-center">
                {fileName ? (
                  <p className="font-semibold text-slate-700 text-sm">{fileName}</p>
                ) : (
                  <>
                    <p className="font-semibold text-slate-700 text-sm">Drop your file here or click to browse</p>
                    <p className="text-xs text-slate-400 mt-1">Supports .xlsx, .xls, .csv</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Done state */}
          {done && (
            <div className={`rounded-2xl p-6 flex flex-col items-center gap-3 ${done.fail === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${done.fail === 0 ? "bg-emerald-100" : "bg-amber-100"}`}>
                <Check size={24} className={done.fail === 0 ? "text-emerald-600" : "text-amber-600"} />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 text-[15px]">Import Complete</p>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="text-emerald-600 font-semibold">{done.ok} imported</span>
                  {done.fail > 0 && <span className="text-red-500 font-semibold ml-2">{done.fail} failed</span>}
                </p>
              </div>
              <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">Done</button>
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && !done && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-slate-600 uppercase tracking-wider">
                  Preview — {validRows.length} valid row{validRows.length !== 1 ? "s" : ""}
                  {invalidRows.length > 0 && <span className="text-red-500 ml-2">({invalidRows.length} invalid)</span>}
                </p>
                <span className="text-xs text-slate-400">{rows.length} total rows</span>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Status</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Name</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Company</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Email</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Phone</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">City</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-semibold">Account Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className={`border-b border-slate-100 ${!row._valid ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                          <td className="px-3 py-1.5">
                            {row._valid
                              ? <span className="text-emerald-600 font-semibold">✓</span>
                              : <span className="text-red-500 font-semibold" title={row._error}>✗</span>}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-slate-800 whitespace-nowrap">{row.name || <span className="text-red-400 italic">missing</span>}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row.company || "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row.email || "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row.phone || "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row.city || "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{row.accountType || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button
              onClick={handleImport}
              disabled={validRows.length === 0 || importing}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? "Importing…" : `Import ${validRows.length} Customer${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Customers() {
  const { data: customers, isLoading } = useListCustomers();
  const { data: invoices } = useListInvoices();
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [chartView, setChartView] = useState<"revenue" | "owed" | "type">("revenue");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const debouncedSearch = useDebounce(search, 250);

  const revenueByCustomer = useMemo(() => {
    const by: Record<string, number> = {};
    for (const inv of (invoices ?? []) as any[]) {
      if (inv.status === "paid") {
        const name = inv.customerName || "Unknown";
        by[name] = (by[name] ?? 0) + Number(inv.total ?? 0);
      }
    }
    return Object.entries(by).map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [invoices]);

  const customerHealthData = useMemo(() => {
    const by: Record<string, { paid: number; outstanding: number }> = {};
    for (const inv of (invoices ?? []) as any[]) {
      const name = inv.customerName || "Unknown";
      if (!by[name]) by[name] = { paid: 0, outstanding: 0 };
      if (inv.status === "paid") by[name].paid += Number(inv.total ?? 0);
      else if (["sent","overdue","partial","payment_hold"].includes(inv.status ?? "")) by[name].outstanding += Number(inv.total ?? 0);
    }
    return Object.entries(by).map(([name, v]) => ({ name, paid: Math.round(v.paid*100)/100, outstanding: Math.round(v.outstanding*100)/100, total: Math.round((v.paid+v.outstanding)*100)/100 })).filter(d => d.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [invoices]);

  const owedByCustomer = useMemo(() => {
    const by: Record<string, number> = {};
    for (const c of (customers ?? []) as any[]) {
      const owed = Number(c.amountOwed ?? 0);
      if (owed > 0) by[c.company || c.name || "Unknown"] = owed;
    }
    return Object.entries(by).map(([name, owed]) => ({ name, owed: Math.round(owed*100)/100 })).sort((a, b) => b.owed - a.owed).slice(0, 12);
  }, [customers]);

  const accountTypePie = useMemo(() => {
    const by: Record<string, number> = {};
    for (const c of (customers ?? []) as any[]) {
      const t = (c as any).accountType || "Standard";
      by[t] = (by[t] ?? 0) + 1;
    }
    const COLORS = ["#3b82f6","#6366f1","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6"];
    return Object.entries(by).map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }));
  }, [customers]);

  const filtered = useMemo(() => {
    const s = debouncedSearch.toLowerCase();
    if (!s) return customers ?? [];
    return (customers ?? []).filter(c =>
      c.name.toLowerCase().includes(s) ||
      (c.company ?? "").toLowerCase().includes(s) ||
      (c.email ?? "").toLowerCase().includes(s) ||
      (c.phone ?? "").includes(s)
    );
  }, [customers, debouncedSearch]);

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this customer?")) {
      deleteCustomer.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() })
      });
    }
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    if (!confirm(`Delete ${count} selected customer${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    for (const id of ids) {
      await new Promise<void>(resolve => {
        deleteCustomer.mutate({ id }, { onSuccess: () => resolve(), onError: () => resolve() });
      });
    }
    await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
    setSelected(new Set());
    setBulkDeleting(false);
  };

  return (
    <Layout>
      <Header title="Customers" subtitle={`${filtered?.length ?? 0} shown · ${customers?.length ?? 0} total`} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gradient-to-br from-[#eef6ff] via-[#f8fbff] to-[#edf4ff]">
        <div className="flex-shrink-0 px-5 pt-4 pb-3 flex flex-col gap-4">

        {/* Toolbar */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search by name, company, email..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCharts(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${showCharts ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <BarChart2 size={14} /> {showCharts ? "Hide Charts" : "Analytics"}
              {showCharts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors">
              <Upload size={14} /> Import
            </button>
            <button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-sm shadow-blue-200">
              <Plus size={14} /> Add Customer
            </button>
          </div>
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
            <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
            <div className="flex-1" />
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors"
            >
              Clear selection
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {bulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
            </button>
          </div>
        )}

        {/* Analytics panel */}
        {showCharts && (
          <div className="glass-card analytics-panel p-5 flex flex-col gap-4 max-h-[min(42vh,520px)] overflow-y-auto">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {([
                  { v: "revenue", label: "Revenue Paid" },
                  { v: "owed",    label: "Amount Owed"  },
                  { v: "type",    label: "Account Types"},
                ] as const).map(({ v, label }, idx) => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`px-3.5 py-2 text-xs font-semibold transition-colors ${idx > 0 ? "border-l border-slate-200" : ""} ${chartView === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-auto">{customers?.length ?? 0} customers</span>
            </div>
            {chartView === "revenue" ? (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Customer Payment Health — Paid vs. Outstanding</p>
                {customerHealthData.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No invoice data yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(customerHealthData.length * 42, 180)}>
                    <BarChart data={customerHealthData} layout="vertical" margin={{ left: 4, right: 60, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+"k" : v}`} stroke="#e2e8f0" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} stroke="none" width={120} />
                      <Tooltip formatter={(v: any, name: string) => [`$${Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`, name === "paid" ? "Paid" : "Outstanding"]} />
                      <Legend iconType="circle" iconSize={8} formatter={v => v === "paid" ? "Paid" : "Outstanding"} />
                      <Bar dataKey="paid" name="paid" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                      <Bar dataKey="outstanding" name="outstanding" stackId="a" fill="#f59e0b" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : chartView === "owed" ? (
              <div className="flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[280px]">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Outstanding Balance by Customer</p>
                  {owedByCustomer.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No outstanding balances.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={owedByCustomer} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+"k" : v}`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Owed"]} />
                        <Bar dataKey="owed" radius={[0, 4, 4, 0]}>
                          {owedByCustomer.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? "#ef4444" : i < 3 ? "#f97316" : "#f59e0b"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex gap-6 flex-wrap items-center">
                <div className="flex-shrink-0">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Account Type Distribution</p>
                  <ResponsiveContainer width={240} height={200}>
                    <PieChart>
                      <Pie data={accountTypePie} cx="50%" cy="50%" outerRadius={88} dataKey="value" nameKey="name" paddingAngle={3}>
                        {accountTypePie.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, n: string) => [v, n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3 min-w-[200px]">
                  {accountTypePie.map((entry: any) => (
                    <div key={entry.name} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                      <div>
                        <p className="text-[10px] text-slate-400 truncate max-w-[80px]">{entry.name}</p>
                        <p className="text-xl font-bold text-slate-700 leading-tight">{entry.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 px-5 pb-4 flex flex-col">
        <div className="glass-card flex-1 min-h-0 flex flex-col overflow-hidden border border-blue-100/70">
          {isLoading ? (
            <div className="p-10 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : filtered?.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">No customers found.</div>
          ) : (
            <>
            <div className="flex-shrink-0 px-4 py-2 border-b border-blue-100 bg-blue-50/90 text-xs text-slate-600 flex items-center justify-between">
              <span>Showing <strong className="text-slate-800">{filtered.length}</strong> customer{filtered.length !== 1 ? "s" : ""}</span>
              <span className="text-slate-400">Scroll the list below to see all</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-blue-100 bg-blue-50/95">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center text-blue-600 hover:text-blue-800 transition-colors">
                      {allSelected ? <CheckSquare size={15} /> : someSelected ? <CheckSquare size={15} className="text-blue-400" /> : <Square size={15} className="text-slate-300 hover:text-blue-400" />}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Name / Company</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Phone</th>
                  <th className="px-5 py-3 text-left text-blue-700 font-medium text-[11px] uppercase tracking-wider">Account Type</th>
                  <th className="px-5 py-3 text-right text-blue-700 font-medium text-[11px] uppercase tracking-wider">Amount Owed</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered?.map(c => {
                  const phones: any[] = (c as any).phones ?? (c.phone ? [{ label: "Mobile", number: c.phone }] : []);
                  const emails: any[] = (c as any).emails ?? (c.email ? [{ label: "Work", email: c.email }] : []);
                  const isSelected = selected.has(c.id);
                  return (
                    <tr key={c.id}
                      className={`border-b border-slate-100 transition-colors group cursor-pointer ${isSelected ? "bg-indigo-50" : "hover:bg-blue-50/50"}`}
                      onClick={() => setViewingCustomer(c as Customer)}
                    >
                      <td className="px-4 py-3.5" onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                        <button className="flex items-center justify-center text-indigo-500 hover:text-indigo-700 transition-colors">
                          {isSelected ? <CheckSquare size={15} /> : <Square size={15} className="text-slate-300 group-hover:text-slate-400" />}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-slate-800 font-semibold">{c.company || c.name}</p>
                        {c.company && <p className="text-xs text-slate-400 mt-0.5">{c.name}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        {emails.length === 0 ? <span className="text-slate-400">—</span> : (
                          <div className="space-y-0.5">
                            {emails.slice(0, 2).map((em: any, i: number) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium text-indigo-500">{em.label ?? "Email"}</span>
                                <span className="text-slate-600 text-xs">{em.email ?? em}</span>
                              </div>
                            ))}
                            {emails.length > 2 && <p className="text-[10px] text-slate-400">+{emails.length - 2} more</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {phones.length === 0 ? <span className="text-slate-400">—</span> : (
                          <div className="space-y-0.5">
                            {phones.slice(0, 2).map((ph: any, i: number) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium text-blue-500">{ph.label ?? "Phone"}</span>
                                <span className="text-slate-600 text-xs">{ph.number ?? ph}</span>
                              </div>
                            ))}
                            {phones.length > 2 && <p className="text-[10px] text-slate-400">+{phones.length - 2} more</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {(c as Customer).accountType ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{(c as Customer).accountType}</span>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {(() => {
                          const owed = (c as Customer).amountOwed ?? 0;
                          if (owed === 0) return <span className="text-slate-400 text-xs">—</span>;
                          return (
                            <span className="flex items-center justify-end gap-1 text-sm font-semibold text-red-600">
                              <AlertCircle size={11} className="text-red-400" />
                              {formatCurrency(owed)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreHorizontal size={14} className="text-slate-500" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white border-slate-200 shadow-lg text-slate-800 min-w-[130px]">
                            <DropdownMenuItem onClick={() => setViewingCustomer(c as Customer)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Eye size={13} /> View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingCustomer(c as Customer)} className="gap-2 cursor-pointer text-sm hover:bg-slate-50 focus:bg-slate-50"><Edit size={13} /> Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(c.id)} className="gap-2 text-red-500 cursor-pointer text-sm hover:bg-red-50 focus:bg-red-50 focus:text-red-500"><Trash2 size={13} /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>
        </div>
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
      {editingCustomer && <CustomerModal customer={editingCustomer} onClose={() => setEditingCustomer(null)} />}
      {viewingCustomer && <CustomerViewModal customer={viewingCustomer} onClose={() => setViewingCustomer(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </Layout>
  );
}
