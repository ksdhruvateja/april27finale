import Layout from "@/components/Layout";
import Header from "@/components/Header";
import { useState, useEffect, useMemo, useRef } from "react";
import { Truck, Save, CheckCircle2, Eye, EyeOff, Loader2, FileText, Tag, Pencil, Trash2, Plus, X, Check, Hash, CreditCard } from "lucide-react";

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

function useSetting(key: string) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/app-settings/${key}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setValue(d.value); });
  }, [key]);

  const save = async (val: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/app-settings/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: val }),
      });
      if (res.ok) {
        setValue(val);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return { value, setValue, saving, saved, save };
}

function QuoteDefaultsSection() {
  const validity = useSetting("quote_validity_text");
  const terms = useSetting("net_terms");

  // ── Parse stored JSON array ──────────────────────────────────────
  const termsList: string[] = useMemo(() => {
    if (!terms.value) return [];
    try {
      const parsed = JSON.parse(terms.value);
      return Array.isArray(parsed) ? parsed : terms.value ? [terms.value] : [];
    } catch {
      return terms.value ? [terms.value] : [];
    }
  }, [terms.value]);

  const [newTerm, setNewTerm] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingVal, setEditingVal] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const persist = (list: string[]) => terms.save(JSON.stringify(list));

  const addTerm = () => {
    const t = newTerm.trim();
    if (!t) return;
    persist([...termsList, t]);
    setNewTerm("");
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingVal(termsList[idx]);
    setTimeout(() => { editInputRef.current?.select(); }, 30);
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const t = editingVal.trim();
    const updated = [...termsList];
    if (t) updated[editingIdx] = t;
    else updated.splice(editingIdx, 1);
    persist(updated);
    setEditingIdx(null);
  };

  const cancelEdit = () => setEditingIdx(null);

  const deleteTerm = (idx: number) => {
    persist(termsList.filter((_, i) => i !== idx));
  };

  return (
    <div className="glass-card p-6 max-w-2xl flex flex-col gap-6">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Quote & Payment Defaults</h2>
      </div>

      {/* ── Quote Validity Message ─────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Quote Validity Message
        </label>
        <p className="text-xs text-slate-400">
          Shown in the footer of every quote (print &amp; email). Leave blank to use the default "Valid until [expiry date]".
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={validity.value}
            onChange={e => validity.setValue(e.target.value)}
            placeholder="e.g. Quotes are valid for 30 days from the date of issue."
            className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
            onKeyDown={e => { if (e.key === "Enter") validity.save(validity.value); }}
          />
          <button
            onClick={() => validity.save(validity.value)}
            disabled={validity.saving}
            className="flex items-center gap-2 px-4 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {validity.saving ? <Loader2 size={14} className="animate-spin" /> : validity.saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {validity.saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Payment Terms List ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Tag size={11} /> Payment Terms Options
          </label>
          <p className="text-xs text-slate-400 mt-1">
            These appear in the <strong>Payment Terms</strong> dropdown when adding or editing a customer.
            Changes take effect immediately everywhere.
          </p>
        </div>

        {/* Term rows */}
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white divide-y divide-slate-100">
          {termsList.length === 0 && (
            <div className="px-4 py-5 text-center text-slate-400 text-sm">
              No payment terms saved yet. Add one below.
            </div>
          )}

          {termsList.map((term, idx) => (
            <div key={idx} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
              {editingIdx === idx ? (
                <>
                  <input
                    ref={editInputRef}
                    value={editingVal}
                    onChange={e => setEditingVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className="flex-1 text-sm border border-blue-400 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none bg-blue-50"
                    autoFocus
                  />
                  <button onClick={commitEdit} title="Save" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEdit} title="Cancel" className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-800 font-medium">{term}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(idx)}
                      title="Edit"
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteTerm(idx)}
                      title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add new term row */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50">
            <Plus size={14} className="text-slate-400 flex-shrink-0" />
            <input
              ref={addInputRef}
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTerm(); }}
              placeholder="Add a payment term… (e.g. Net 45)"
              className="flex-1 text-sm bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400"
            />
            {newTerm.trim() && (
              <button
                onClick={addTerm}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[hsl(224_50%_15%)] text-white text-xs font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors"
              >
                {terms.saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Add
              </button>
            )}
          </div>
        </div>

        {/* Saved feedback */}
        {terms.saved && (
          <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={12} /> Payment terms updated — changes are live everywhere.
          </p>
        )}
      </div>
    </div>
  );
}

function StripeSection() {
  const [secretKey, setSecretKey]         = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [maskedSecret, setMaskedSecret]   = useState<string | null>(null);
  const [showSecret, setShowSecret]       = useState(false);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [isConfigured, setIsConfigured]   = useState(false);

  useEffect(() => {
    fetch("/api/stripe/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsConfigured(d.configured); });
    fetch("/api/app-settings/stripe_secret_key")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setMaskedSecret(d.value); });
    fetch("/api/app-settings/stripe_publishable_key")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) setPublishableKey(d.value); });
  }, []);

  const handleSave = async () => {
    if (!secretKey.trim() && !publishableKey.trim()) return;
    setSaving(true);
    try {
      const saves = [];
      if (secretKey.trim()) {
        saves.push(fetch("/api/app-settings/stripe_secret_key", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: secretKey.trim() }),
        }));
      }
      if (publishableKey.trim()) {
        saves.push(fetch("/api/app-settings/stripe_publishable_key", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: publishableKey.trim() }),
        }));
      }
      await Promise.all(saves);
      if (secretKey.trim()) {
        const v = secretKey.trim();
        setMaskedSecret(v.slice(0, 8) + "••••••••" + v.slice(-4));
        setSecretKey("");
      }
      setIsConfigured(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Re-check status
      fetch("/api/stripe/status").then(r => r.ok ? r.json() : null).then(d => { if (d) setIsConfigured(d.configured); });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Remove Stripe keys? Payment collection will stop working.")) return;
    await Promise.all([
      fetch("/api/app-settings/stripe_secret_key",      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "" }) }),
      fetch("/api/app-settings/stripe_publishable_key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "" }) }),
    ]);
    setMaskedSecret(null);
    setPublishableKey("");
    setSecretKey("");
    setIsConfigured(false);
  };

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <CreditCard size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Stripe</h2>
        <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          isConfigured
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-slate-100 text-slate-500 border-slate-200"
        }`}>
          {isConfigured ? "● Active" : "○ Not connected"}
        </span>
      </div>
      <p className="text-slate-500 text-sm mb-5">
        Connect your Stripe account to collect invoice payments by card or bank transfer. Get your keys from the{" "}
        <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Stripe Dashboard</a>.
      </p>

      {/* Current status */}
      {isConfigured && !secretKey && (
        <div className="flex items-center justify-between p-3 mb-4 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">Stripe Connected</p>
              {maskedSecret && <p className="text-xs text-green-700 font-mono mt-0.5">sk ···{maskedSecret.slice(-12)}</p>}
            </div>
          </div>
          <button onClick={handleClear} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
            Remove
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Publishable Key */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
            Publishable Key <span className="text-slate-300 normal-case font-normal">(pk_live_… or pk_test_…)</span>
          </label>
          <input
            type="text"
            value={publishableKey}
            onChange={e => setPublishableKey(e.target.value)}
            placeholder="pk_live_…"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-400 transition-colors font-mono"
          />
        </div>

        {/* Secret Key */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
            Secret Key <span className="text-slate-300 normal-case font-normal">(sk_live_… or sk_test_…)</span>
          </label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder={maskedSecret ? maskedSecret : "sk_live_…"}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 pr-10 bg-white text-slate-800 focus:outline-none focus:border-blue-400 transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShowSecret(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Stored securely. Leave blank to keep the existing key.</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || (!secretKey.trim() && !publishableKey.trim())}
          className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_25%)] text-white rounded-xl text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={12} /> Stripe keys saved.
          </p>
        )}
      </div>
    </div>
  );
}

function DocumentNumbersSection() {
  const [invPrefix, setInvPrefix] = useState("FRZI-");
  const [invStart, setInvStart]   = useState("5100");
  const [qPrefix, setQPrefix]     = useState("FRZQ-");
  const [qStart, setQStart]       = useState("5100");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/app-settings/invoice_prefix").then(r => r.ok ? r.json() : null),
      fetch("/api/app-settings/invoice_start").then(r => r.ok ? r.json() : null),
      fetch("/api/app-settings/quote_prefix").then(r => r.ok ? r.json() : null),
      fetch("/api/app-settings/quote_start").then(r => r.ok ? r.json() : null),
    ]).then(([ip, is, qp, qs]) => {
      if (ip?.value) setInvPrefix(ip.value);
      if (is?.value) setInvStart(is.value);
      if (qp?.value) setQPrefix(qp.value);
      if (qs?.value) setQStart(qs.value);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/app-settings/invoice_prefix", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: invPrefix.trim() || "FRZI-" }) }),
        fetch("/api/app-settings/invoice_start",  { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: invStart.trim() || "5100" }) }),
        fetch("/api/app-settings/quote_prefix",   { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: qPrefix.trim() || "FRZQ-" }) }),
        fetch("/api/app-settings/quote_start",    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: qStart.trim() || "5100" }) }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Hash size={16} className="text-[hsl(224_50%_25%)]" />
        <h2 className="text-slate-800 text-base font-bold">Document Numbering</h2>
      </div>
      <p className="text-slate-500 text-sm mb-5">
        Set the prefix and minimum starting number for new invoices and quotes. Changes apply to the next document created.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Invoice Prefix</label>
          <input type="text" value={invPrefix} onChange={e => setInvPrefix(e.target.value)} placeholder="FRZI-"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-400 transition-colors" />
          <p className="text-[10px] text-slate-400 mt-1">e.g. FRZI- → FRZI-5100</p>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Invoice Starting #</label>
          <input type="number" value={invStart} onChange={e => setInvStart(e.target.value)} placeholder="5100" min="1"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-400 transition-colors" />
          <p className="text-[10px] text-slate-400 mt-1">Next invoice will be ≥ this</p>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Quote Prefix</label>
          <input type="text" value={qPrefix} onChange={e => setQPrefix(e.target.value)} placeholder="FRZQ-"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-400 transition-colors" />
          <p className="text-[10px] text-slate-400 mt-1">e.g. FRZQ- → FRZQ-5100</p>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Quote Starting #</label>
          <input type="number" value={qStart} onChange={e => setQStart(e.target.value)} placeholder="5100" min="1"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:border-blue-400 transition-colors" />
          <p className="text-[10px] text-slate-400 mt-1">Next quote will be ≥ this</p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_25%)] text-white rounded-xl text-sm font-semibold hover:bg-[hsl(224_50%_20%)] transition-colors disabled:opacity-50">
          <Save size={14} />
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {saved && <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium"><CheckCircle2 size={12} /> Saved — applies to new documents.</p>}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <Layout>
      <Header title="Settings" />
      <div className="flex-1 overflow-y-auto px-5 py-6 bg-[hsl(220_25%_97%)] flex flex-col gap-6">

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

        {/* Document Numbering */}
        <div className="max-w-2xl">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-3 px-1">Document Numbering</h2>
          <DocumentNumbersSection />
        </div>

        {/* Quote & Payment Defaults */}
        <div className="max-w-2xl">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-3 px-1">Quote & Payment</h2>
          <QuoteDefaultsSection />
        </div>

        {/* Integrations */}
        <div className="max-w-2xl flex flex-col gap-4">
          <h2 className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-1 px-1">Integrations</h2>
          <StripeSection />
          <ShippingSection />
        </div>

      </div>
    </Layout>
  );
}
