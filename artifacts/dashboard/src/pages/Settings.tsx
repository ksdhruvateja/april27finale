import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useState, useEffect } from "react";
import {
  Truck, Save, CheckCircle2, Eye, EyeOff, Loader2,
  Plus, Trash2, Edit2, X, Check, FileText, MapPin
} from "lucide-react";

/* ── shared helpers ──────────────────────────────────────────────────── */
const DEFAULT_NET_TERMS = [
  { id: "net30",        label: "Net 30" },
  { id: "net60",        label: "Net 60" },
  { id: "net90",        label: "Net 90" },
  { id: "cash",         label: "Cash" },
  { id: "cash_advance", label: "Cash Advance" },
  { id: "cod",          label: "COD" },
];

export interface NetTerm { id: string; label: string; }
export interface CompanyAddress {
  id: string; name: string;
  line1: string; line2?: string;
  city: string; state: string; zip: string;
  phone?: string;
}

async function getAppSetting(key: string): Promise<string | null> {
  const r = await fetch(`/api/app-settings/${key}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d?.value ?? null;
}

async function putAppSetting(key: string, value: string) {
  await fetch(`/api/app-settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

/* ── Net Terms Section ───────────────────────────────────────────────── */
function NetTermsSection() {
  const [terms, setTerms] = useState<NetTerm[]>(DEFAULT_NET_TERMS);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAppSetting("net_terms").then(v => {
      if (v) {
        try { setTerms(JSON.parse(v)); } catch { setTerms(DEFAULT_NET_TERMS); }
      }
      setLoaded(true);
    });
  }, []);

  const persist = async (newTerms: NetTerm[]) => {
    setSaving(true);
    try {
      await putAppSetting("net_terms", JSON.stringify(newTerms));
      setTerms(newTerms);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const startEdit = (t: NetTerm) => { setEditingId(t.id); setEditLabel(t.label); };
  const saveEdit = () => {
    if (!editLabel.trim() || !editingId) return;
    persist(terms.map(t => t.id === editingId ? { ...t, label: editLabel.trim() } : t));
    setEditingId(null);
  };
  const deleteTerm = (id: string) => {
    if (!confirm("Delete this term? Customers using it won't be affected but the term won't appear in new dropdowns.")) return;
    persist(terms.filter(t => t.id !== id));
  };
  const addTerm = () => {
    if (!addLabel.trim()) return;
    const id = addLabel.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!id || terms.find(t => t.id === id)) return;
    persist([...terms, { id, label: addLabel.trim() }]);
    setAddLabel("");
    setAdding(false);
  };

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Payment / Net Terms</h2>
        {saved && <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-green-600"><Check size={11}/>Saved</span>}
        {saving && <Loader2 size={12} className="ml-auto animate-spin text-slate-400" />}
      </div>
      <p className="text-slate-500 text-sm mb-4">
        These terms appear in customer profiles and are synced automatically. Renaming a term updates it everywhere.
      </p>

      {!loaded ? (
        <div className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-400"/></div>
      ) : (
        <div className="flex flex-col gap-0 rounded-xl border border-slate-200 overflow-hidden mb-3">
          {terms.map((t, i) => (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-3 bg-white ${i < terms.length - 1 ? "border-b border-slate-100" : ""}`}>
              {editingId === t.id ? (
                <>
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                    className="flex-1 text-sm bg-slate-50 border border-blue-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">id: {t.id}</span>
                  <button onClick={saveEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"><Check size={14}/></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X size={14}/></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-800">{t.label}</span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{t.id}</span>
                  <button onClick={() => startEdit(t)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={13}/></button>
                  <button onClick={() => deleteTerm(t.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13}/></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            placeholder="Term name, e.g. Net 45"
            value={addLabel}
            onChange={e => setAddLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTerm(); if (e.key === "Escape") setAdding(false); }}
            className="flex-1 text-sm bg-white border border-blue-300 rounded-lg px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
          />
          <button onClick={addTerm} className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">Add</button>
          <button onClick={() => setAdding(false)} className="px-3 py-2 text-slate-500 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors">
          <Plus size={14}/> Add term
        </button>
      )}
    </div>
  );
}

/* ── Company Addresses Section ───────────────────────────────────────── */
const EMPTY_ADDR: Omit<CompanyAddress, "id"> = { name: "", line1: "", line2: "", city: "", state: "", zip: "", phone: "" };
const US_STATE_CODES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function CompanyAddressesSection() {
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<CompanyAddress | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<CompanyAddress, "id">>(EMPTY_ADDR);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAppSetting("company_addresses").then(v => {
      if (v) { try { setAddresses(JSON.parse(v)); } catch {} }
      setLoaded(true);
    });
  }, []);

  const persist = async (next: CompanyAddress[]) => {
    setSaving(true);
    try {
      await putAppSetting("company_addresses", JSON.stringify(next));
      setAddresses(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const saveAdd = () => {
    if (!form.name.trim() || !form.line1.trim()) return;
    persist([...addresses, { ...form, id: Date.now().toString() }]);
    setForm(EMPTY_ADDR);
    setAdding(false);
  };

  const saveEdit = () => {
    if (!editing || !form.name.trim() || !form.line1.trim()) return;
    persist(addresses.map(a => a.id === editing.id ? { ...form, id: editing.id } : a));
    setEditing(null);
  };

  const startEdit = (a: CompanyAddress) => {
    setEditing(a);
    setForm({ name: a.name, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, zip: a.zip, phone: a.phone ?? "" });
    setAdding(false);
  };

  const deleteAddr = (id: string) => {
    if (!confirm("Delete this address?")) return;
    persist(addresses.filter(a => a.id !== id));
  };

  const AddrForm = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Address Name *</label>
          <input placeholder="e.g. Main Office" value={form.name} onChange={setF("name")}
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"/>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Phone</label>
          <input placeholder="+1 (555) 000-0000" value={form.phone ?? ""} onChange={setF("phone")}
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"/>
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Street Address *</label>
        <input placeholder="123 Main St" value={form.line1} onChange={setF("line1")}
          className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"/>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Suite / Unit</label>
        <input placeholder="Suite 100" value={form.line2 ?? ""} onChange={setF("line2")}
          className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"/>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">City *</label>
          <input placeholder="New York" value={form.city} onChange={setF("city")}
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"/>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">State</label>
          <select value={form.state} onChange={setF("state")}
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400">
            <option value="">—</option>
            {US_STATE_CODES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">ZIP Code</label>
          <input placeholder="10001" value={form.zip} onChange={setF("zip")}
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"/>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">Save Address</button>
        <button onClick={onCancel} className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Company Addresses</h2>
        {saved && <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-green-600"><Check size={11}/>Saved</span>}
        {saving && <Loader2 size={12} className="ml-auto animate-spin text-slate-400" />}
      </div>
      <p className="text-slate-500 text-sm mb-4">
        Add multiple office / warehouse addresses. When printing quotes and invoices you'll choose which address to show.
      </p>

      {!loaded ? (
        <div className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-400"/></div>
      ) : (
        <>
          {addresses.length > 0 && (
            <div className="flex flex-col gap-0 rounded-xl border border-slate-200 overflow-hidden mb-3">
              {addresses.map((a, i) => (
                <div key={a.id} className={`flex items-start gap-3 px-4 py-3 bg-white ${i < addresses.length - 1 ? "border-b border-slate-100" : ""}`}>
                  {editing?.id === a.id ? (
                    <div className="flex-1">
                      <AddrForm onSave={saveEdit} onCancel={() => setEditing(null)} />
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br/>
                          {[a.city, a.state, a.zip].filter(Boolean).join(", ")}
                          {a.phone && ` · ${a.phone}`}
                        </p>
                      </div>
                      <button onClick={() => startEdit(a)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"><Edit2 size={13}/></button>
                      <button onClick={() => deleteAddr(a.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"><Trash2 size={13}/></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {addresses.length === 0 && !adding && (
            <div className="flex items-center justify-center py-6 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm mb-3">
              No addresses saved yet
            </div>
          )}

          {adding ? (
            <AddrForm onSave={saveAdd} onCancel={() => { setAdding(false); setForm(EMPTY_ADDR); }} />
          ) : !editing && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors">
              <Plus size={14}/> Add address
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ── Shipping Section ───────────────────────────────────────────────── */
function ShippingSection() {
  const [apiKey, setApiKey] = useState("");
  const [masked, setMasked] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/easyship/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsConfigured(d.configured); });
    fetch("/api/app-settings/easyship_api_key")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setMasked(d.value); });
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/app-settings/easyship_api_key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: apiKey.trim() }),
      });
      if (res.ok) {
        setSaved(true);
        setMasked(apiKey.slice(0, 6) + "••••••••" + apiKey.slice(-4));
        setApiKey("");
        setShow(false);
        setIsConfigured(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally { setSaving(false); }
  };

  const handleClear = async () => {
    if (!confirm("Remove the Shipping API key? Rates will switch to sample mode.")) return;
    await fetch("/api/app-settings/easyship_api_key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "" }),
    });
    setMasked(null);
    setIsConfigured(false);
  };

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Truck size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Shipping</h2>
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          isConfigured
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {isConfigured ? "● Active" : "○ Not connected"}
        </span>
      </div>
      <p className="text-slate-500 text-sm mb-5">
        Connect your shipping account to fetch live carrier rates and generate shipping labels.
      </p>

      {masked && !apiKey && (
        <div className="flex items-center justify-between p-3 mb-4 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">API Key Connected</p>
              <p className="text-xs text-green-700 font-mono mt-0.5">{masked}</p>
            </div>
          </div>
          <button onClick={handleClear} className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">Remove</button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Shipping API Key</label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={masked ? "Enter new key to replace…" : "Paste your API key here…"}
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors font-mono"
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            />
            <button onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Your API key is stored securely and never shared.</p>
        </div>
        <button onClick={handleSave} disabled={!apiKey.trim() || saving}
          className="flex items-center gap-2 self-start px-4 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : saved
            ? <><CheckCircle2 size={14} /> Saved!</>
            : <><Save size={14} /> Save API Key</>}
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function Settings() {
  return (
    <Layout>
      <Header title="Settings" />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6 bg-[hsl(220_25%_97%)] flex flex-col gap-6">

        {/* Company Settings */}
        <div className="glass-card p-6 max-w-2xl">
          <h2 className="text-slate-800 text-base font-bold mb-1">Company Settings</h2>
          <p className="text-slate-500 text-sm mb-5">Manage your workspace, billing, and team members.</p>
          <div className="flex flex-col gap-0 rounded-xl border border-slate-200 overflow-hidden">
            {[
              { title: "Company Profile",   desc: "Update company name, logo, and contact info.", action: "Edit" },
              { title: "Team Members",      desc: "Invite users and manage roles.",               action: "Manage" },
              { title: "Billing & Plan",    desc: "Manage your subscription and payment methods.", action: "Upgrade" },
            ].map((row, i, arr) => (
              <div key={row.title} className={`flex items-center justify-between px-5 py-4 bg-white ${i < arr.length - 1 ? "border-b border-slate-100" : ""}`}>
                <div>
                  <h3 className="text-slate-800 font-medium text-sm">{row.title}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">{row.desc}</p>
                </div>
                <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
                  {row.action}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Net Terms */}
        <div className="max-w-2xl">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-3 px-1">Payment Terms</h2>
          <NetTermsSection />
        </div>

        {/* Company Addresses */}
        <div className="max-w-2xl">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-3 px-1">Company Addresses</h2>
          <CompanyAddressesSection />
        </div>

        {/* Integrations */}
        <div className="max-w-2xl">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-3 px-1">Integrations</h2>
          <ShippingSection />
        </div>

      </div>
    </Layout>
  );
}
