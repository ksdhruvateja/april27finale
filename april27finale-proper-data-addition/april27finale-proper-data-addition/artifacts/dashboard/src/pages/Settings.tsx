import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useState, useEffect } from "react";
import { Truck, Save, CheckCircle2, Eye, EyeOff, Loader2, CreditCard, Link, Mail, Send } from "lucide-react";

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
        Connect your shipping account to fetch live carrier rates and generate shipping labels directly from Team Forez Corp.
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

function EmailSection() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const load = async () => {
      const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"];
      const results = await Promise.all(
        keys.map(k => fetch(`/api/app-settings/${k}`).then(r => r.ok ? r.json() : null))
      );
      const [h, p, u, pw, f] = results;
      if (h?.value) { setHost(h.value); setIsConfigured(true); }
      if (p?.value) setPort(p.value);
      if (u?.value) setUser(u.value);
      if (pw?.value) setPass(pw.value);
      if (f?.value) setFrom(f.value);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/app-settings/smtp_host", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: host.trim() }) }),
        fetch("/api/app-settings/smtp_port", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: port.trim() || "587" }) }),
        fetch("/api/app-settings/smtp_user", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: user.trim() }) }),
        fetch("/api/app-settings/smtp_pass", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: pass.trim() }) }),
        fetch("/api/app-settings/smtp_from", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: from.trim() }) }),
      ]);
      setIsConfigured(!!host.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Email (SMTP)</h2>
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          isConfigured ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {isConfigured ? "● Active" : "○ Not configured"}
        </span>
      </div>
      <p className="text-slate-500 text-sm mb-5">
        Configure your outgoing mail server so Team Forez Corp can automatically send invoice payment reminders to customers.
      </p>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">SMTP Host</label>
            <input type="text" value={host} onChange={e => setHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Port</label>
            <input type="number" value={port} onChange={e => setPort(e.target.value)}
              placeholder="587"
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Username / Email</label>
          <input type="email" value={user} onChange={e => setUser(e.target.value)}
            placeholder="you@gmail.com"
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Password / App Password</label>
          <div className="relative">
            <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)}
              placeholder="App password or SMTP password"
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors font-mono" />
            <button onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">For Gmail, generate an <strong>App Password</strong> in your Google Account security settings.</p>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">From Address (optional)</label>
          <input type="text" value={from} onChange={e => setFrom(e.target.value)}
            placeholder='Team Forez Corp <noreply@yourdomain.com>'
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors" />
          <p className="text-xs text-slate-400 mt-1.5">If blank, emails will be sent from your username.</p>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 self-start px-4 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : saved ? <><CheckCircle2 size={14} /> Saved!</>
            : <><Save size={14} /> Save Email Settings</>}
        </button>
      </div>
    </div>
  );
}

function PaymentSection() {
  const [secretKey, setSecretKey]   = useState("");
  const [maskedKey, setMaskedKey]   = useState<string | null>(null);
  const [showKey, setShowKey]       = useState(false);
  const [payUrl, setPayUrl]         = useState("");
  const [savedUrl, setSavedUrl]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/app-settings/stripe_secret_key")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) { setMaskedKey(d.value); setIsConfigured(true); } });
    fetch("/api/app-settings/payment_link_url")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setSavedUrl(d.value); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (secretKey.trim()) {
        const r = await fetch("/api/app-settings/stripe_secret_key", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: secretKey.trim() }),
        });
        if (r.ok) {
          setMaskedKey(secretKey.slice(0, 6) + "••••••••" + secretKey.slice(-4));
          setSecretKey("");
          setShowKey(false);
          setIsConfigured(true);
        }
      }
      if (payUrl.trim() !== (savedUrl ?? "")) {
        await fetch("/api/app-settings/payment_link_url", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: payUrl.trim() }),
        });
        setSavedUrl(payUrl.trim() || null);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    if (!confirm("Remove the Stripe API key?")) return;
    await fetch("/api/app-settings/stripe_secret_key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "" }),
    });
    setMaskedKey(null);
    setIsConfigured(false);
  };

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Payments</h2>
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          isConfigured
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {isConfigured ? "● Active" : "○ Not connected"}
        </span>
      </div>
      <p className="text-slate-500 text-sm mb-5">
        Connect your Stripe account to enable the <strong>View and Pay</strong> button on printed invoices. Customers can click the link to pay online.
      </p>

      {maskedKey && !secretKey && (
        <div className="flex items-center justify-between p-3 mb-4 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">Stripe API Key Connected</p>
              <p className="text-xs text-green-700 font-mono mt-0.5">{maskedKey}</p>
            </div>
          </div>
          <button onClick={handleClearKey} className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors">
            Remove
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
            Stripe Secret Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder={maskedKey ? "Enter new key to replace…" : "sk_live_… or sk_test_…"}
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors font-mono"
            />
            <button onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Used server-side to create Stripe Checkout sessions. Never exposed to customers.</p>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Link size={11} /> Payment Link URL
          </label>
          <input
            type="url"
            value={payUrl || savedUrl || ""}
            onChange={e => setPayUrl(e.target.value)}
            placeholder="https://buy.stripe.com/… or your checkout page URL"
            className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            This URL appears as the <strong>View and Pay</strong> button on invoice prints. You can use a Stripe Payment Link or your own checkout page. Invoice ID will be appended automatically.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={(!secretKey.trim() && payUrl.trim() === (savedUrl ?? "")) || saving}
          className="flex items-center gap-2 self-start px-4 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : saved
            ? <><CheckCircle2 size={14} /> Saved!</>
            : <><Save size={14} /> Save Payment Settings</>}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <Layout>
      <Header title="Settings" />
      <div className="page-scroll-body px-5 py-6 bg-[hsl(220_25%_97%)] flex flex-col gap-6">

        {/* Company Settings */}
        <div className="glass-card p-6 max-w-2xl">
          <h2 className="text-slate-800 text-base font-bold mb-1">Company Settings</h2>
          <p className="text-slate-500 text-sm mb-5">Manage your Team Forez Corp workspace, billing, and team members.</p>
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
          <div className="flex flex-col gap-4">
            <PaymentSection />
            <EmailSection />
            <ShippingSection />
          </div>
        </div>

      </div>
    </Layout>
  );
}
