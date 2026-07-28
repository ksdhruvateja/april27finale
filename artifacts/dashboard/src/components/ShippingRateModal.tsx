import { useState, useEffect, useCallback, useMemo } from "react";
import { useCompanyProfile } from "@/lib/companyProfile";
import { useCreateShipment, getListShipmentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Package, Truck, Shield, CheckCircle2, ChevronRight,
  Plus, Trash2, Loader2, AlertCircle, Info, RefreshCw,
  X, Printer, Home, Users, MapPin, Car,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { printShippingSlip, fetchCompanyAddresses, CompanyAddress } from "@/lib/print-slip";

// BUSINESS is now loaded dynamically via useCompanyProfile() inside the component

const PACKAGING_TYPES = [
  { value: "box", label: "Box" },
  { value: "envelope", label: "Envelope" },
  { value: "tube", label: "Tube" },
  { value: "pallet", label: "Pallet" },
  { value: "pak", label: "Pak / Flat" },
];

interface PackageItem {
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  description: string;
  packagingType: string;
}

interface ShippingRate {
  courierId: string;
  courierName: string;
  minDays?: number | null;
  maxDays?: number | null;
  deliveryDate?: string | null;
  totalCharge: number;
  currency: string;
}

interface RatesData {
  source: "demo" | "live";
  rates: ShippingRate[];
}

interface BookingResult {
  easyshipShipmentId: string;
  trackingNumber?: string | null;
  labelUrl?: string | null;
  carrier?: string | null;
  totalCharge: number;
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
  vendorCarrierName?: string | null;
  vendorCarrierAccount?: string | null;
  onClose: () => void;
}

type Step = "type" | "packages" | "rates" | "confirm" | "simple" | "success";
type ShippingType = "inhouse" | "carrier" | "pickup";
type CarrierSubtype = "easyship" | "uber" | "salesperson" | "customer";

const newPkg = (desc = ""): PackageItem => ({
  id: Math.random().toString(36).slice(2),
  length: 12, width: 10, height: 6, weight: 5,
  description: desc,
  packagingType: "box",
});

function StepIndicator({ current, isCarrier }: { current: Step; isCarrier: boolean }) {
  const steps: { id: Step; label: string }[] = isCarrier
    ? [{ id: "packages", label: "Package Info" }, { id: "rates", label: "Select Rate" }, { id: "confirm", label: "Confirm" }]
    : [{ id: "simple", label: "Details" }];
  const allSteps: Step[] = isCarrier
    ? ["packages", "rates", "confirm", "success"]
    : ["simple", "success"];
  const idx = allSteps.indexOf(current);
  return (
    <div className="flex items-center gap-0 px-6 py-3 border-b border-slate-100 bg-white">
      {steps.map((s, i) => {
        const stepIdx = allSteps.indexOf(s.id);
        const done = idx > stepIdx;
        const active = idx === stepIdx;
        return (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${done || active ? "text-[hsl(224_50%_20%)]" : "text-slate-400"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                done ? "bg-[hsl(224_50%_15%)] text-white border-[hsl(224_50%_15%)]"
                : active ? "border-[hsl(224_50%_25%)] text-[hsl(224_50%_20%)] bg-[hsl(224_50%_97%)]"
                : "border-slate-300 text-slate-400 bg-white"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-6 h-px mx-2 ${done ? "bg-[hsl(224_50%_25%)]" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function ShippingRateModal({ customerId, invoiceId, customerName, lineItems = [], defaultInternalNote, vendorCarrierName, vendorCarrierAccount, onClose }: Props) {
  const profile = useCompanyProfile();
  const create = useCreateShipment();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("type");
  const [shippingType, setShippingType] = useState<ShippingType | null>(null);
  const [carrierSubtype, setCarrierSubtype] = useState<CarrierSubtype | null>(null);
  const [simpleNote, setSimpleNote] = useState("");
  const [simpleDate, setSimpleDate] = useState("");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PackageItem[]>([newPkg(lineItems[0]?.description ?? "")]);
  const [ratesData, setRatesData] = useState<RatesData | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
  const [addInsurance, setAddInsurance] = useState(false);
  const [declaredValue, setDeclaredValue] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalNote, setInternalNote] = useState(defaultInternalNote ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [createdShipment, setCreatedShipment] = useState<any>(null);
  const [printingSlip, setPrintingSlip] = useState(false);
  const [companyAddresses, setCompanyAddresses] = useState<CompanyAddress[]>([]);
  const [addrPickerOpen, setAddrPickerOpen] = useState(false);
  const [pendingPrintShip, setPendingPrintShip] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/customers/${customerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCustomer(data); });
  }, [customerId]);

  useEffect(() => {
    fetchCompanyAddresses().then(setCompanyAddresses);
  }, []);

  const toAddress = {
    name: customer?.company || customer?.name || customerName,
    address: customer?.address ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    zip: customer?.zipCode ?? "",
    country: customer?.country ?? "US",
    phone: customer?.phone ?? "",
  };

  const fetchRates = async () => {
    setLoadingRates(true);
    setRatesError(null);
    setSelectedCourierId(null);
    try {
      const res = await fetch("/api/easyship/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { zip: profile.zip, country: "US" },
          to: { zip: toAddress.zip || "10001", country: toAddress.country },
          packages: packages.map(p => ({ length: p.length, width: p.width, height: p.height, weight: p.weight })),
          declaredValue: parseFloat(declaredValue) || 10,
        }),
      });
      if (!res.ok) throw new Error("Rate fetch failed");
      const data: RatesData = await res.json();
      setRatesData(data);
      if (data.rates.length > 0) setSelectedCourierId(data.rates[0].courierId);
      setStep("rates");
    } catch {
      setRatesError("Unable to fetch rates. Check the destination address and try again.");
    } finally {
      setLoadingRates(false);
    }
  };

  const selectedRate = ratesData?.rates.find(r => r.courierId === selectedCourierId) ?? null;

  const executePrintSlip = useCallback(async (ship: any, fromAddr?: CompanyAddress | null) => {
    setPrintingSlip(true);
    try {
      await printShippingSlip(ship, fromAddr);
    } finally {
      setPrintingSlip(false);
    }
  }, []);

  const handlePrintSlip = useCallback((ship: any) => {
    if (companyAddresses.length >= 1) {
      setPendingPrintShip(ship);
      setAddrPickerOpen(true);
    } else {
      executePrintSlip(ship, null);
    }
  }, [companyAddresses, executePrintSlip]);

  const handlePrintPreviewLabel = useCallback(() => {
    const previewShip = {
      id: invoiceId ?? 0,
      customerId,
      invoiceId: invoiceId ?? null,
      carrier: shippingType === "inhouse" ? "In-House Delivery"
        : shippingType === "pickup" ? "Pickup"
        : selectedRate?.courierName ?? "Carrier (TBD)",
      trackingNumber: bookingResult?.trackingNumber ?? null,
      notes: specialInstructions || simpleNote || null,
      status: bookingResult ? "pending" : "preparing",
      shippedAt: null,
    };
    if (companyAddresses.length >= 1) {
      setPendingPrintShip(previewShip);
      setAddrPickerOpen(true);
    } else {
      executePrintSlip(previewShip, null);
    }
  }, [customerId, invoiceId, shippingType, selectedRate, bookingResult, specialInstructions, simpleNote, companyAddresses, executePrintSlip]);

  const handleCreate = async () => {
    if (!selectedRate) return;
    setIsCreating(true);
    setRatesError(null);
    try {
      const bookRes = await fetch("/api/easyship/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierId: selectedRate.courierId,
          from: { name: profile.name, address: profile.line1, city: profile.city, state: profile.state, zip: profile.zip, country: "US", phone: profile.phone, email: profile.email },
          to: toAddress,
          packages: packages.map(p => ({ length: p.length, width: p.width, height: p.height, weight: p.weight })),
          declaredValue: parseFloat(declaredValue) || 10,
          totalCharge: selectedRate.totalCharge,
          notes: specialInstructions || null,
          insurance: addInsurance && declaredValue ? parseFloat(declaredValue) : 0,
        }),
      });

      if (!bookRes.ok) {
        const err = await bookRes.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Booking failed");
      }

      const booking: BookingResult = await bookRes.json();
      setBookingResult(booking);

      const notes = [
        specialInstructions,
        addInsurance && declaredValue ? `Insurance declared value: $${declaredValue}` : "",
      ].filter(Boolean).join(" | ");

      create.mutate({
        data: {
          customerId,
          invoiceId: invoiceId ?? undefined,
          status: "pending",
          carrier: booking.carrier ?? selectedRate.courierName,
          trackingNumber: booking.trackingNumber ?? null,
          notes: notes || null,
          internalNote: internalNote || null,
        },
      }, {
        onSuccess: (newShip: any) => {
          if (newShip?.id) {
            fetch(`/api/shipments/${newShip.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shippingCost: booking.totalCharge,
                easyshipShipmentId: booking.easyshipShipmentId,
                labelUrl: booking.labelUrl ?? null,
              }),
            });
            const fullShip = {
              ...newShip,
              carrier: booking.carrier ?? selectedRate.courierName,
              trackingNumber: booking.trackingNumber ?? null,
              notes: notes || null,
              status: "pending",
              customerId,
              invoiceId: invoiceId ?? null,
            };
            setCreatedShipment(fullShip);
            // Auto-print packing slip
            setTimeout(() => handlePrintSlip(fullShip), 300);
          }
          queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
          setStep("success");
        },
        onError: () => {
          setRatesError("Failed to save the shipment. Please try again.");
          setIsCreating(false);
        },
        onSettled: () => setIsCreating(false),
      });
    } catch (err: any) {
      setRatesError(err?.message ?? "Booking failed");
      setIsCreating(false);
    }
  };

  function updatePkg(id: string, patch: Partial<PackageItem>) {
    setPackages(pkgs => pkgs.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  const canProceed = packages.every(p => p.weight > 0 && p.length > 0 && p.width > 0 && p.height > 0);

  const handleSimpleCreate = () => {
    setIsCreating(true);
    const subtypeLabel = carrierSubtype === "uber" ? "Delivery Service"
      : carrierSubtype === "salesperson" ? "Sales Rep Delivery"
      : carrierSubtype === "customer" ? "Customer Pickup / Own Carrier"
      : null;
    const carrierLabel = shippingType === "inhouse" ? "In-House Delivery"
      : shippingType === "pickup" ? "Pickup"
      : subtypeLabel ?? "Carrier";
    const notes = [simpleNote, simpleDate ? `Scheduled: ${simpleDate}` : ""].filter(Boolean).join(" | ");
    create.mutate({
      data: {
        customerId,
        invoiceId: invoiceId ?? undefined,
        status: "pending",
        carrier: carrierLabel,
        trackingNumber: null,
        notes: notes || null,
        internalNote: internalNote || null,
      },
    }, {
      onSuccess: (newShip: any) => {
        const fullShip = { ...newShip, carrier: carrierLabel, status: "pending", customerId, invoiceId: invoiceId ?? null };
        setCreatedShipment(fullShip);
        setTimeout(() => handlePrintSlip(fullShip), 300);
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        setStep("success");
        setIsCreating(false);
      },
      onError: () => {
        setRatesError("Failed to save the shipment. Please try again.");
        setIsCreating(false);
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Address picker overlay */}
      {addrPickerOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4" onClick={() => setAddrPickerOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-slate-600" />
              <h3 className="text-slate-900 font-bold text-base">Choose Print Address</h3>
            </div>
            <div className="flex flex-col gap-2">
              {companyAddresses.map(a => (
                <button key={a.id}
                  onClick={() => {
                    setAddrPickerOpen(false);
                    if (pendingPrintShip) { executePrintSlip(pendingPrintShip, a); setPendingPrintShip(null); }
                  }}
                  className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br/>{[a.city, a.state, a.zip].filter(Boolean).join(", ")}</p>
                </button>
              ))}
              <button
                onClick={() => {
                  setAddrPickerOpen(false);
                  if (pendingPrintShip) { executePrintSlip(pendingPrintShip, null); setPendingPrintShip(null); }
                }}
                className="text-left px-4 py-3 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors">
                <p className="text-sm font-semibold text-slate-500">Use profile default address</p>
              </button>
            </div>
            <button onClick={() => setAddrPickerOpen(false)} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div
        className="relative z-10 w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 bg-white">
          <div>
            <h2 className="text-slate-800 font-bold text-base flex items-center gap-2">
              <Truck size={16} className="text-[hsl(224_50%_25%)]" />
              Create Shipment
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">{customerName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintPreviewLabel}
              disabled={printingSlip}
              title="Print packing slip / shipping label"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Printer size={13} />
              {printingSlip ? "Printing…" : "Print Label"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {step !== "success" && step !== "type" && <StepIndicator current={step} isCarrier={carrierSubtype === "easyship"} />}

        <div className="flex-1 overflow-y-auto scrollbar-hide bg-[hsl(220_25%_97%)]">

          {/* ── Step 0: Shipping Type Selection ── */}
          {step === "type" && (
            <div className="px-6 py-6 flex flex-col gap-5">
              {(vendorCarrierName || vendorCarrierAccount) && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-50 border border-sky-200">
                  <Truck size={15} className="text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-sky-700 font-semibold text-xs">Vendor Shipping Account</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {vendorCarrierName && (
                        <span className="text-sky-800 text-xs">Carrier: <span className="font-medium">{vendorCarrierName}</span></span>
                      )}
                      {vendorCarrierAccount && (
                        <span className="text-sky-800 text-xs">Account #: <span className="font-medium">{vendorCarrierAccount}</span></span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-slate-800 font-bold text-sm mb-1">How is this order being shipped?</h3>
                <p className="text-slate-500 text-xs">Select the shipping method that applies to this order.</p>
              </div>
              <div className="flex flex-col gap-3">
                {/* In-house */}
                <button
                  onClick={() => { setShippingType("inhouse"); setCarrierSubtype(null); setStep("simple"); }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white border-2 border-slate-200 hover:border-[hsl(224_50%_25%)] hover:shadow-md text-left transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Home size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-slate-800 font-semibold text-sm group-hover:text-[hsl(224_50%_20%)]">In-House Delivery</p>
                    <p className="text-slate-400 text-xs mt-0.5">Delivered by your own team or vehicle — no carrier needed.</p>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-[hsl(224_50%_25%)]" />
                </button>

                {/* Carrier */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setShippingType("carrier"); setCarrierSubtype(null); }}
                    className={`flex items-center gap-4 p-4 rounded-xl bg-white border-2 text-left transition-all group ${shippingType === "carrier" ? "border-[hsl(224_50%_25%)] shadow-md" : "border-slate-200 hover:border-[hsl(224_50%_25%)] hover:shadow-md"}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
                      <Truck size={18} className="text-sky-600" />
                    </div>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm group-hover:text-[hsl(224_50%_20%)]">Carrier / Third-Party</p>
                      <p className="text-slate-400 text-xs mt-0.5">Use a shipping carrier — book rates and print labels.</p>
                    </div>
                    <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-[hsl(224_50%_25%)]" />
                  </button>
                  {shippingType === "carrier" && (
                    <div className="ml-6 flex flex-col gap-1.5 pl-4 border-l-2 border-[hsl(224_50%_20%)]">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">How is it being shipped?</p>
                      {([
                        { id: "easyship" as CarrierSubtype, label: "Book via Carrier — Get Rates", sub: "Compare UPS, FedEx, USPS rates · book & print label", icon: <Truck size={14} className="text-sky-600" />, highlight: true },
                        { id: "uber" as CarrierSubtype, label: "Delivery Service", sub: "On-demand or local courier delivery", icon: <Car size={14} className="text-amber-500" />, highlight: false },
                        { id: "salesperson" as CarrierSubtype, label: "Sales Rep Delivery", sub: "Sales representative will hand-deliver the order", icon: <Users size={14} className="text-emerald-500" />, highlight: false },
                        { id: "customer" as CarrierSubtype, label: "Customer Pickup / Own Carrier", sub: "Customer collects in person or arranges their own shipping", icon: <MapPin size={14} className="text-purple-500" />, highlight: false },
                      ]).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setCarrierSubtype(opt.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                            carrierSubtype === opt.id
                              ? "border-[hsl(224_50%_25%)] bg-[hsl(224_50%_97%)]"
                              : opt.highlight
                                ? "border-sky-200 bg-sky-50 hover:border-sky-300"
                                : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          {opt.icon}
                          <div>
                            <p className={`text-xs font-semibold ${carrierSubtype === opt.id ? "text-[hsl(224_50%_20%)]" : opt.highlight ? "text-sky-700" : "text-slate-700"}`}>{opt.label}</p>
                            <p className="text-[10px] text-slate-400">{opt.sub}</p>
                          </div>
                          {carrierSubtype === opt.id && <CheckCircle2 size={14} className="ml-auto text-[hsl(224_50%_25%)]" />}
                        </button>
                      ))}
                      <button
                        disabled={!carrierSubtype}
                        onClick={() => {
                          if (!carrierSubtype) return;
                          carrierSubtype === "easyship" ? setStep("packages") : setStep("simple");
                        }}
                        className="mt-1 w-full py-2.5 rounded-xl bg-[hsl(224_50%_15%)] text-white text-sm font-semibold hover:bg-[hsl(224_50%_20%)] disabled:opacity-40 transition-colors"
                      >
                        {carrierSubtype === "easyship" ? "Continue to Package Details →" : "Continue →"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Pickup */}
                <button
                  onClick={() => { setShippingType("pickup"); setCarrierSubtype(null); setStep("simple"); }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white border-2 border-slate-200 hover:border-[hsl(224_50%_25%)] hover:shadow-md text-left transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                    <MapPin size={18} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-slate-800 font-semibold text-sm group-hover:text-[hsl(224_50%_20%)]">Pickup</p>
                    <p className="text-slate-400 text-xs mt-0.5">Customer picks up the order in person at your location.</p>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-[hsl(224_50%_25%)]" />
                </button>
              </div>
            </div>
          )}

          {/* ── Simple Step: In-house / Pickup ── */}
          {step === "simple" && (
            <div className="px-6 py-5 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep("type")} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors">
                  ← Back
                </button>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  {shippingType === "pickup" ? <MapPin size={16} className="text-emerald-600" />
                    : shippingType === "carrier" ? <Truck size={16} className="text-sky-600" />
                    : <Home size={16} className="text-indigo-600" />}
                </div>
                <div>
                  <p className="text-slate-800 font-semibold text-sm">
                    {shippingType === "pickup" ? "Pickup"
                      : shippingType === "carrier" ? (
                          carrierSubtype === "uber" ? "Delivery Service"
                          : carrierSubtype === "salesperson" ? "Sales Rep Delivery"
                          : carrierSubtype === "customer" ? "Customer Pickup / Own Carrier"
                          : "Carrier"
                        )
                      : "In-House Delivery"}
                  </p>
                  <p className="text-slate-400 text-xs">{customerName}</p>
                </div>
              </div>

              {/* Address preview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">From</p>
                  <p className="text-sm font-semibold text-slate-800">{profile.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{profile.line1}<br />{profile.city}, {profile.state} {profile.zip}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 shadow-sm">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">
                    {shippingType === "pickup" || carrierSubtype === "customer" ? "Pickup By" : "Deliver To"}
                  </p>
                  <p className="text-sm font-semibold text-slate-800">{toAddress.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{toAddress.address || "Address not on file"}</p>
                </div>
              </div>

              {(vendorCarrierName || vendorCarrierAccount) && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-50 border border-sky-200">
                  <Truck size={15} className="text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-sky-700 font-semibold text-xs">Vendor Shipping Account</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {vendorCarrierName && (
                        <span className="text-sky-800 text-xs">Carrier: <span className="font-medium">{vendorCarrierName}</span></span>
                      )}
                      {vendorCarrierAccount && (
                        <span className="text-sky-800 text-xs">Account #: <span className="font-medium">{vendorCarrierAccount}</span></span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {lineItems.length > 0 && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Items</p>
                  <div className="flex flex-col gap-1">
                    {lineItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">{item.description}</span>
                        <span className="text-slate-400 font-medium">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                  {shippingType === "pickup" ? "Pickup Date" : "Delivery Date"} <span className="text-slate-400 font-normal normal-case">(optional)</span>
                </label>
                <input type="date" value={simpleDate} onChange={e => setSimpleDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors" />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Notes <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                <textarea value={simpleNote} onChange={e => setSimpleNote(e.target.value)} rows={2}
                  placeholder="Any special instructions or notes…"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 resize-none transition-colors" />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Internal Note <span className="text-slate-400 font-normal normal-case">(not printed)</span></label>
                <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={2}
                  placeholder="Internal team note…"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 resize-none transition-colors" />
              </div>

              {ratesError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{ratesError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Package Details ── */}
          {step === "packages" && (
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Address cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">From</p>
                  <p className="text-sm font-semibold text-slate-800">{profile.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {profile.line1}<br />{profile.city}, {profile.state} {profile.zip}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 shadow-sm">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Ship To</p>
                  <p className="text-sm font-semibold text-slate-800">{toAddress.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {toAddress.address || "Address not on file"}
                    {toAddress.city ? <><br />{toAddress.city}{toAddress.state ? `, ${toAddress.state}` : ""} {toAddress.zip}</> : ""}
                  </p>
                </div>
              </div>

              {/* Line items */}
              {lineItems.length > 0 && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Items in shipment</p>
                  <div className="flex flex-col gap-1">
                    {lineItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700">{item.description}</span>
                        <span className="text-slate-400 font-medium">×{item.quantity}</span>
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
                    Package Details
                  </p>
                  <button
                    onClick={() => setPackages(p => [...p, newPkg()])}
                    className="flex items-center gap-1 text-xs font-semibold text-[hsl(224_50%_25%)] hover:text-[hsl(224_50%_15%)] transition-colors"
                  >
                    <Plus size={12} /> Add Package
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {packages.map((pkg, i) => (
                    <div key={pkg.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-600">Package {i + 1}</span>
                        {packages.length > 1 && (
                          <button
                            onClick={() => setPackages(p => p.filter(x => x.id !== pkg.id))}
                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description</label>
                          <input
                            value={pkg.description}
                            onChange={e => updatePkg(pkg.id, { description: e.target.value })}
                            placeholder="e.g. Industrial parts, electronics…"
                            className="mt-1 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Packaging</label>
                            <select
                              value={pkg.packagingType}
                              onChange={e => updatePkg(pkg.id, { packagingType: e.target.value })}
                              className="mt-1 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
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
                              className="mt-1 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                            Dimensions (in) — L × W × H
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {(["length", "width", "height"] as const).map(dim => (
                              <div key={dim} className="relative">
                                <input
                                  type="number" min="0.1" step="0.1"
                                  value={pkg[dim]}
                                  onChange={e => updatePkg(pkg.id, { [dim]: parseFloat(e.target.value) || 0 })}
                                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 pr-7 text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 uppercase font-bold">
                                  {dim[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Rate Selection ── */}
          {step === "rates" && (
            <div className="px-6 py-5 flex flex-col gap-4">
              {loadingRates && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={28} className="animate-spin text-[hsl(224_50%_25%)]" />
                  <p className="text-slate-500 text-sm font-medium">Fetching available rates…</p>
                </div>
              )}

              {ratesError && !loadingRates && (
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
                  {ratesData.source === "demo" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                      <Info size={12} className="text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        <span className="font-semibold">Sample rates shown.</span> Add your Shipping API key in Settings to see live pricing.
                      </p>
                    </div>
                  )}

                  {ratesData.rates.length === 0 && (
                    <p className="text-center text-slate-400 text-sm py-8">No rates available for this route.</p>
                  )}

                  <div className="flex flex-col gap-2">
                    {ratesData.rates.map((rate, idx) => {
                      const selected = selectedCourierId === rate.courierId;
                      const isBest = idx === 0;
                      return (
                        <button
                          key={rate.courierId}
                          onClick={() => setSelectedCourierId(rate.courierId)}
                          className={`w-full text-left flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all bg-white ${
                            selected ? "border-[hsl(224_50%_25%)] shadow-sm" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${selected ? "border-[hsl(224_50%_25%)] bg-[hsl(224_50%_15%)]" : "border-slate-300 bg-white"}`}>
                              {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-slate-800">{rate.courierName}</span>
                                {isBest && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                                    Best Value
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {rate.minDays != null && rate.maxDays != null
                                  ? rate.minDays === rate.maxDays
                                    ? `${rate.minDays} business day${rate.minDays !== 1 ? "s" : ""}`
                                    : `${rate.minDays}–${rate.maxDays} business days`
                                  : "Estimated delivery"}
                                {rate.deliveryDate ? ` · Est. ${rate.deliveryDate}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <span className="text-base font-bold text-slate-800">{formatCurrency(rate.totalCharge)}</span>
                            <p className="text-[10px] text-slate-400">{rate.currency}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={fetchRates}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors self-start"
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
              {(vendorCarrierName || vendorCarrierAccount) && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-50 border border-sky-200">
                  <Truck size={15} className="text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-sky-700 font-semibold text-xs">Vendor Shipping Account</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {vendorCarrierName && (
                        <span className="text-sky-800 text-xs">Carrier: <span className="font-medium">{vendorCarrierName}</span></span>
                      )}
                      {vendorCarrierAccount && (
                        <span className="text-sky-800 text-xs">Account #: <span className="font-medium">{vendorCarrierAccount}</span></span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Selected service */}
              <div className="p-4 rounded-xl border border-[hsl(224_50%_25%)]/20 bg-[hsl(224_50%_97%)] shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selected Service</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">{selectedRate.courierName}</span>
                  <span className="text-lg font-bold text-slate-800">{formatCurrency(selectedRate.totalCharge)}</span>
                </div>
                {(selectedRate.minDays != null || selectedRate.deliveryDate) && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {selectedRate.minDays != null && selectedRate.maxDays != null
                      ? selectedRate.minDays === selectedRate.maxDays
                        ? `Delivery in ${selectedRate.minDays} business day${selectedRate.minDays !== 1 ? "s" : ""}`
                        : `Delivery in ${selectedRate.minDays}–${selectedRate.maxDays} business days`
                      : ""}
                    {selectedRate.deliveryDate ? ` · Est. ${selectedRate.deliveryDate}` : ""}
                  </p>
                )}
              </div>

              {/* Package summary */}
              <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
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

              {/* Insurance toggle */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Shipment Insurance</span>
                  </div>
                  <button
                    onClick={() => setAddInsurance(v => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${addInsurance ? "bg-[hsl(224_50%_25%)]" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${addInsurance ? "left-[18px]" : "left-0.5"}`} />
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
                        className="w-full text-sm bg-white border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                )}
              </div>

              {ratesError && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700">{ratesError}</p>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Special Instructions (optional)</label>
                <textarea
                  value={specialInstructions}
                  onChange={e => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. Fragile — handle with care…"
                  rows={2}
                  className="w-full text-sm bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Internal Notes</label>
                <textarea
                  value={internalNote}
                  onChange={e => setInternalNote(e.target.value)}
                  placeholder="Internal only — never shown to customer."
                  rows={2}
                  className="w-full text-sm bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Step 4a: Simple Success (in-house / pickup / non-EasyShip carrier) ── */}
          {step === "success" && !bookingResult && createdShipment && (
            <div className="px-6 py-10 flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 border-4 border-green-400 flex items-center justify-center">
                  <CheckCircle2 size={40} className="text-green-600" />
                </div>
                <div>
                  <h3 className="text-slate-800 font-extrabold text-2xl tracking-tight">Shipment Saved!</h3>
                  <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                    Shipment record created and packing slip is printing.
                  </p>
                </div>
              </div>
              <div className="w-full bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5 shadow-sm">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium">Method</span>
                  <span className="text-slate-800 font-semibold">{createdShipment.carrier}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium">Status</span>
                  <span className="text-emerald-600 font-semibold capitalize">{createdShipment.status ?? "Pending"}</span>
                </div>
                {createdShipment.notes && (
                  <div className="flex justify-between items-start text-sm border-t border-slate-100 pt-2.5 mt-0.5">
                    <span className="text-slate-500 font-medium">Notes</span>
                    <span className="text-slate-700 text-right max-w-[60%]">{createdShipment.notes}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => createdShipment && handlePrintSlip(createdShipment)}
                disabled={printingSlip || !createdShipment}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-xl hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {printingSlip ? <><Loader2 size={15} className="animate-spin" /> Printing…</> : <><Printer size={15} /> Print Packing Slip</>}
              </button>
              <button onClick={onClose} className="w-full px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                Close
              </button>
            </div>
          )}

          {/* ── Step 4b: Carrier Success (EasyShip booked) ── */}
          {step === "success" && bookingResult && (
            <div className="px-6 py-10 flex flex-col items-center gap-6">
              {/* Big congratulations */}
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 border-4 border-green-400 flex items-center justify-center">
                  <CheckCircle2 size={40} className="text-green-600" />
                </div>
                <div>
                  <h3 className="text-slate-800 font-extrabold text-2xl tracking-tight">Congratulations!</h3>
                  <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                    Your shipment has been booked and saved.<br />
                    The packing slip is printing now.
                  </p>
                </div>
              </div>

              {/* Shipment summary card */}
              <div className="w-full bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5 shadow-sm">
                {bookingResult.trackingNumber && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Tracking #</span>
                    <span className="text-slate-800 font-mono font-bold">{bookingResult.trackingNumber}</span>
                  </div>
                )}
                {bookingResult.carrier && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Carrier</span>
                    <span className="text-slate-800 font-semibold">{bookingResult.carrier}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm border-t border-slate-100 pt-2.5 mt-0.5">
                  <span className="text-slate-500 font-medium">Shipping Cost</span>
                  <span className="text-slate-800 font-bold text-base">{formatCurrency(bookingResult.totalCharge)}</span>
                </div>
              </div>

              {/* Print slip button */}
              <button
                onClick={() => createdShipment && handlePrintSlip(createdShipment)}
                disabled={printingSlip || !createdShipment}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-xl hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {printingSlip ? <><Loader2 size={15} className="animate-spin" /> Printing…</> : <><Printer size={15} /> Print Packing Slip Again</>}
              </button>

              <button
                onClick={onClose}
                className="w-full px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "success" && step !== "type" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
            <button
              onClick={() => {
                if (step === "simple") setStep("type");
                else if (step === "packages") setStep("type");
                else if (step === "rates") setStep("packages");
                else if (step === "confirm") setStep("rates");
                else onClose();
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ← Back
            </button>

            {step === "simple" && (
              <button
                onClick={handleSimpleCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><CheckCircle2 size={14} /> Save Shipment</>}
              </button>
            )}

            {step === "packages" && (
              <button
                onClick={fetchRates}
                disabled={loadingRates || !canProceed}
                className="flex items-center gap-2 px-5 py-2 bg-[hsl(224_50%_15%)] text-white text-sm font-semibold rounded-lg hover:bg-[hsl(224_50%_20%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingRates
                  ? <><Loader2 size={14} className="animate-spin" /> Fetching…</>
                  : <>Get Shipping Rates <ChevronRight size={14} /></>}
              </button>
            )}

            {step === "rates" && (
              <button
                onClick={() => setStep("confirm")}
                disabled={!selectedCourierId}
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
                {isCreating
                  ? <><Loader2 size={14} className="animate-spin" /> Booking…</>
                  : <><CheckCircle2 size={14} /> Book Shipment</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
