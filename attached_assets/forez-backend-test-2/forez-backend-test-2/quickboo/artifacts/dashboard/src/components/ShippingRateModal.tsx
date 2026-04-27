import { useState, useEffect } from "react";
import { useCreateShipment, getListShipmentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Package, Truck, Shield, CheckCircle2, ChevronRight, Plus, Trash2, Loader2, AlertCircle, Info, RefreshCw, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const BUSINESS = {
  name: "Forez Corp",
  address: "2402 Ocean Ave",
  city: "Ronkonkoma",
  state: "NY",
  zip: "11779",
  country: "US",
  phone: "+1 (516) 860-2513",
};

const PACKAGING_TYPES = [
  { value: "box", label: "Box" },
  { value: "envelope", label: "Envelope" },
  { value: "tube", label: "Tube" },
  { value: "pallet", label: "Pallet" },
  { value: "pak", label: "Pak / Flat" },
];

const CARRIER_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  UPS:   { bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-200",  badge: "bg-amber-600 text-white" },
  FedEx: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200", badge: "bg-purple-600 text-white" },
  USPS:  { bg: "bg-blue-50",   text: "text-blue-800",   border: "border-blue-200",   badge: "bg-blue-600 text-white" },
  DHL:   { bg: "bg-yellow-50", text: "text-yellow-800", border: "border-yellow-200", badge: "bg-yellow-500 text-white" },
};

interface PackageItem {
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  description: string;
  packagingType: string;
}

interface RateOption {
  rateId: string;
  carrier: string;
  service: string;
  serviceCode: string;
  deliveryDays: number | null;
  estimatedDelivery: string | null;
  price: number;
  currency: string;
  billedToAccount: boolean;
}

interface RatesResponse {
  source: "demo" | "live";
  billedToAccount: boolean;
  accountNumber: string | null;
  carrier: string | null;
  rates: RateOption[];
}

interface CustomerInfo {
  name: string;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  phone?: string | null;
  shippingAccountNumber?: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
}

interface Props {
  customerId: number;
  invoiceId?: number | null;
  customerName: string;
  lineItems?: LineItem[];
  defaultInternalNote?: string;
  onClose: () => void;
}

type Step = "packages" | "rates" | "confirm";

const newPkg = (desc = ""): PackageItem => ({
  id: Math.random().toString(36).slice(2),
  length: 12, width: 10, height: 6, weight: 5,
  description: desc,
  packagingType: "box",
});

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "packages", label: "Package Info" },
    { id: "rates", label: "Select Rate" },
    { id: "confirm", label: "Confirm" },
  ];
  const idx = steps.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-0 px-6 py-3 border-b border-slate-100">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${i <= idx ? "text-[hsl(224_50%_20%)]" : "text-slate-400"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${i < idx ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]" : i === idx ? "border-[hsl(224_50%_25%)] text-[hsl(224_50%_20%)]" : "border-slate-300 text-slate-400"}`}>
              {i < idx ? "✓" : i + 1}
            </div>
            {s.label}
          </div>
          {i < steps.length - 1 && <div className={`w-8 h-px mx-2 ${i < idx ? "bg-[hsl(224_50%_25%)]" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function ShippingRateModal({ customerId, invoiceId, customerName, lineItems = [], defaultInternalNote, onClose }: Props) {
  const create = useCreateShipment();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("packages");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PackageItem[]>([
    newPkg(lineItems[0]?.description ?? "")
  ]);
  const [ratesData, setRatesData] = useState<RatesResponse | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [addInsurance, setAddInsurance] = useState(false);
  const [declaredValue, setDeclaredValue] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalNote, setInternalNote] = useState(defaultInternalNote ?? "");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${customerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCustomer(data); });
  }, [customerId]);

  const toAddress = {
    name: customer?.company || customer?.name || customerName,
    company: customer?.company ?? undefined,
    address: customer?.address ?? "Address not on file",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    zip: customer?.zipCode ?? "",
    country: customer?.country ?? "US",
    phone: customer?.phone ?? undefined,
  };

  const carrierAccount = customer?.shippingAccountNumber
    ? { carrier: "ups" as const, accountNumber: customer.shippingAccountNumber }
    : null;

  const fetchRates = async () => {
    setLoadingRates(true);
    setRatesError(null);
    setSelectedRateId(null);
    try {
      const res = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { name: BUSINESS.name, address: BUSINESS.address, city: BUSINESS.city, state: BUSINESS.state, zip: BUSINESS.zip, country: BUSINESS.country, phone: BUSINESS.phone },
          to: toAddress,
          packages: packages.map(p => ({ length: p.length, width: p.width, height: p.height, weight: p.weight, description: p.description || undefined })),
          customerCarrierAccount: carrierAccount,
        }),
      });
      if (!res.ok) throw new Error("Failed to fetch rates");
      const data: RatesResponse = await res.json();
      setRatesData(data);
      if (data.rates.length > 0) setSelectedRateId(data.rates[0].rateId);
      setStep("rates");
    } catch {
      setRatesError("Unable to fetch rates. Please check your connection and try again.");
    } finally {
      setLoadingRates(false);
    }
  };

  const selectedRate = ratesData?.rates.find(r => r.rateId === selectedRateId) ?? null;

  const handleCreate = async () => {
    if (!selectedRate) return;
    setIsCreating(true);
    const notes = [
      specialInstructions,
      addInsurance && declaredValue ? `Insurance declared value: $${declaredValue}` : "",
      ratesData?.billedToAccount ? `Billed to customer ${String(ratesData.carrier ?? "").toUpperCase()} account: ${ratesData.accountNumber}` : "",
    ].filter(Boolean).join(" | ");

    create.mutate({
      data: {
        customerId,
        invoiceId: invoiceId ?? undefined,
        status: "pending",
        carrier: selectedRate.carrier,
        trackingNumber: null,
        notes: notes || null,
        internalNote: internalNote || null,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        onClose();
      },
      onSettled: () => setIsCreating(false),
    });
  };

  function updatePkg(id: string, patch: Partial<PackageItem>) {
    setPackages(pkgs => pkgs.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  function addPkg() {
    setPackages(pkgs => [...pkgs, newPkg()]);
  }

  function removePkg(id: string) {
    setPackages(pkgs => pkgs.filter(p => p.id !== id));
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/85" onClick={onClose} />
      <div
        className="relative z-10 w-full bg-[#0b0b10] text-white border-l border-white/15 shadow-2xl flex flex-col h-full
          [&_.bg-slate-50]:!bg-white/5
          [&_.bg-blue-50]:!bg-blue-500/10
          [&_.border-slate-200]:!border-white/15
          [&_.border-slate-100]:!border-white/10
          [&_.border-blue-200]:!border-blue-400/25
          [&_.text-slate-800]:!text-white
          [&_.text-slate-700]:!text-white/90
          [&_.text-slate-600]:!text-white/80
          [&_.text-slate-500]:!text-white/65
          [&_.text-slate-400]:!text-white/50
          [&_.text-blue-500]:!text-blue-300
          [&_input]:!bg-white/8
          [&_input]:!border-white/15
          [&_input]:!text-white
          [&_input]:placeholder:!text-white/40
          [&_select]:!bg-white/8
          [&_select]:!border-white/15
          [&_select]:!text-white
          [&_textarea]:!bg-white/8
          [&_textarea]:!border-white/15
          [&_textarea]:!text-white
          [&_textarea]:placeholder:!text-white/40"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-800 font-bold text-base flex items-center gap-2">
              <Truck size={16} className="text-[hsl(224_50%_25%)]" />
              Create Shipment
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {customerName}
              {customer?.shippingAccountNumber && (
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                  UPS Account: {customer.shippingAccountNumber}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <StepIndicator current={step} />

        <div className="flex-1 overflow-y-auto scrollbar-hide">

          {/* ── Step 1: Package Details ── */}
          {step === "packages" && (
            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Address summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">From</p>
                  <p className="text-sm font-semibold text-slate-800">{BUSINESS.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{BUSINESS.address}, {BUSINESS.city}, {BUSINESS.state} {BUSINESS.zip}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5">Ship To</p>
                  <p className="text-sm font-semibold text-slate-800">{toAddress.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {toAddress.address}{toAddress.city ? `, ${toAddress.city}` : ""}{toAddress.state ? `, ${toAddress.state}` : ""} {toAddress.zip}
                  </p>
                </div>
              </div>

              {/* Items from invoice */}
              {lineItems.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Items in this shipment</p>
                  <div className="flex flex-col gap-1">
                    {lineItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">{item.description}</span>
                        <span className="text-slate-400 font-medium">Qty {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Packages */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Package size={14} />
                    Package Dimensions & Weight
                  </p>
                  <button onClick={addPkg} className="flex items-center gap-1 text-xs font-medium text-[hsl(224_50%_25%)] hover:text-[hsl(224_50%_15%)] transition-colors">
                    <Plus size={12} /> Add Package
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {packages.map((pkg, i) => (
                    <div key={pkg.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                        <span className="text-xs font-semibold text-slate-600">Package {i + 1}</span>
                        {packages.length > 1 && (
                          <button onClick={() => removePkg(pkg.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description (optional)</label>
                          <input
                            value={pkg.description}
                            onChange={e => updatePkg(pkg.id, { description: e.target.value })}
                            placeholder="e.g. Industrial parts, electronics…"
                            className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 text-slate-800 placeholder:text-slate-400"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Packaging Type</label>
                            <select
                              value={pkg.packagingType}
                              onChange={e => updatePkg(pkg.id, { packagingType: e.target.value })}
                              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 text-slate-800"
                            >
                              {PACKAGING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Weight (lbs)</label>
                            <input
                              type="number" min="0.1" step="0.1"
                              value={pkg.weight}
                              onChange={e => updatePkg(pkg.id, { weight: parseFloat(e.target.value) || 0 })}
                              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 text-slate-800"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Dimensions (inches) — L × W × H</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(["length", "width", "height"] as const).map(dim => (
                              <div key={dim} className="relative">
                                <input
                                  type="number" min="0.1" step="0.1"
                                  value={pkg[dim]}
                                  onChange={e => updatePkg(pkg.id, { [dim]: parseFloat(e.target.value) || 0 })}
                                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 text-slate-800 pr-8"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 uppercase font-bold">{dim[0]}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* UPS account notice */}
              {carrierAccount && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <Info size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Customer UPS Account Detected</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Rates will be fetched exclusively from UPS and billed directly to account <span className="font-mono font-bold">{carrierAccount.accountNumber}</span>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Rate Selection ── */}
          {step === "rates" && (
            <div className="px-6 py-5 flex flex-col gap-4">

              {loadingRates && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={28} className="animate-spin text-[hsl(224_50%_25%)]" />
                  <p className="text-slate-500 text-sm font-medium">Fetching live rates…</p>
                </div>
              )}

              {ratesError && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Could not fetch rates</p>
                    <p className="text-xs text-red-600 mt-1">{ratesError}</p>
                    <button onClick={fetchRates} className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 transition-colors">
                      <RefreshCw size={11} /> Try again
                    </button>
                  </div>
                </div>
              )}

              {ratesData && !loadingRates && (
                <>
                  {/* Demo badge */}
                  {ratesData.source === "demo" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                      <Info size={12} className="text-slate-400" />
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold">Sample rates shown</span> — connect your carrier API keys to see live pricing.
                      </p>
                    </div>
                  )}

                  {/* Billed to account banner */}
                  {ratesData.billedToAccount && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <CheckCircle2 size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-800">Billed to Customer {String(ratesData.carrier ?? "").toUpperCase()} Account</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          Account <span className="font-mono font-bold">{ratesData.accountNumber}</span> — shipping charges billed directly to customer. Select a service below.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {ratesData.rates.length === 0 && (
                      <p className="text-center text-slate-400 text-sm py-8">No rates available for this route.</p>
                    )}
                    {ratesData.rates.map(rate => {
                      const colors = CARRIER_COLORS[rate.carrier] ?? CARRIER_COLORS.UPS;
                      const selected = selectedRateId === rate.rateId;
                      return (
                        <button
                          key={rate.rateId}
                          onClick={() => setSelectedRateId(rate.rateId)}
                          className={`w-full text-left flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all ${selected ? "border-[hsl(224_50%_25%)] bg-[hsl(224_50%_97%)]" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selected ? "bg-[hsl(224_50%_25%)]" : "bg-slate-300"}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.badge}`}>{rate.carrier}</span>
                                <span className="text-sm font-semibold text-slate-800">{rate.service}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {rate.deliveryDays ? `${rate.deliveryDays} business day${rate.deliveryDays > 1 ? "s" : ""}` : "Estimated delivery"}{rate.estimatedDelivery ? ` · Arrives ${rate.estimatedDelivery}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            {rate.billedToAccount ? (
                              <span className="text-sm font-bold text-amber-700">Billed to Account</span>
                            ) : (
                              <span className="text-base font-bold text-slate-800">{formatCurrency(rate.price)}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={fetchRates}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors self-start"
                  >
                    <RefreshCw size={11} /> Refresh rates
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === "confirm" && selectedRate && (
            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Selected service summary */}
              <div className="p-4 rounded-xl border border-[hsl(224_50%_25%)]/30 bg-[hsl(224_50%_97%)]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selected Service</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CARRIER_COLORS[selectedRate.carrier]?.badge ?? "bg-slate-600 text-white"}`}>
                      {selectedRate.carrier}
                    </span>
                    <span className="text-sm font-bold text-slate-800">{selectedRate.service}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">
                    {selectedRate.billedToAccount ? "Billed to Account" : formatCurrency(selectedRate.price)}
                  </span>
                </div>
                {selectedRate.estimatedDelivery && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Estimated delivery: <span className="font-semibold">{selectedRate.estimatedDelivery}</span>
                    {selectedRate.deliveryDays ? ` (${selectedRate.deliveryDays} business day${selectedRate.deliveryDays > 1 ? "s" : ""})` : ""}
                  </p>
                )}
              </div>

              {/* Package summary */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {packages.length} Package{packages.length > 1 ? "s" : ""}
                </p>
                {packages.map((pkg, i) => (
                  <div key={pkg.id} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-slate-600">Pkg {i + 1}{pkg.description ? ` — ${pkg.description}` : ""}</span>
                    <span className="text-slate-500">{pkg.length}×{pkg.width}×{pkg.height} in · {pkg.weight} lbs</span>
                  </div>
                ))}
              </div>

              {/* Declared value / Insurance */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Shipment Insurance</span>
                  </div>
                  <button
                    onClick={() => setAddInsurance(v => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${addInsurance ? "bg-[hsl(224_50%_25%)]" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${addInsurance ? "left-4.5 left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
                {addInsurance && (
                  <div className="px-4 py-3 flex flex-col gap-2">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Declared Value (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={declaredValue}
                        onChange={e => setDeclaredValue(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-sm border border-slate-200 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-slate-400 text-slate-800"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Carrier insurance covers loss or damage up to the declared amount.</p>
                  </div>
                )}
              </div>

              {/* Billed to account final notice */}
              {selectedRate.billedToAccount && ratesData && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <Info size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    Shipping will be billed to <span className="font-bold">{customerName}'s</span> {String(ratesData.carrier ?? "").toUpperCase()} account <span className="font-mono font-bold">{ratesData.accountNumber}</span>.
                  </p>
                </div>
              )}

              {/* Special Instructions */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Special Instructions (optional)</label>
                <textarea
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. Fragile — handle with care, leave at front desk…"
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 text-slate-800 placeholder:text-slate-400 resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Internal Notes</label>
                <textarea
                  value={internalNote}
                  onChange={e => setInternalNote(e.target.value)}
                  placeholder="Internal only — never shown on customer print/email."
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 text-slate-800 placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={() => {
              if (step === "rates") setStep("packages");
              else if (step === "confirm") setStep("rates");
              else onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {step === "packages" ? "Cancel" : "← Back"}
          </button>

          {step === "packages" && (
            <button
              onClick={fetchRates}
              disabled={loadingRates || packages.some(p => !p.weight || !p.length || !p.width || !p.height)}
              className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingRates ? <><Loader2 size={14} className="animate-spin" /> Fetching Rates…</> : <>Get Shipping Rates <ChevronRight size={14} /></>}
            </button>
          )}

          {step === "rates" && (
            <button
              onClick={() => setStep("confirm")}
              disabled={!selectedRateId}
              className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue <ChevronRight size={14} />
            </button>
          )}

          {step === "confirm" && (
            <button
              onClick={handleCreate}
              disabled={isCreating || !selectedRate}
              className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><CheckCircle2 size={14} /> Create Shipment</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
