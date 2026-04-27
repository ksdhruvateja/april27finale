import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useState, useEffect } from "react";
import { Truck, Save, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

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
    } finally {
      setSaving(false);
    }
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
        Connect your shipping account to fetch live carrier rates and generate shipping labels directly from QuickBoo.
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
          <button
            onClick={handleClear}
            className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors"
          >
            Remove
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Shipping API Key
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={masked ? "Enter new key to replace…" : "Paste your API key here…"}
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors font-mono"
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            />
            <button
              onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Your API key is stored securely and never shared.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={!apiKey.trim() || saving}
          className="flex items-center gap-2 self-start px-4 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
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

export default function Settings() {
  return (
    <Layout>
      <Header title="Settings" />
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-6 bg-[hsl(220_25%_97%)] flex flex-col gap-6">

        {/* Company Settings */}
        <div className="glass-card p-6 max-w-2xl">
          <h2 className="text-slate-800 text-base font-bold mb-1">Company Settings</h2>
          <p className="text-slate-500 text-sm mb-5">Manage your QuickBoo workspace, billing, and team members.</p>
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

        {/* Integrations */}
        <div className="max-w-2xl">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-3 px-1">Integrations</h2>
          <ShippingSection />
        </div>

      </div>
    </Layout>
  );
}
