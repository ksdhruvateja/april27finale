import { Router } from "express";
import { z } from "zod";

const router = Router();

const AddressSchema = z.object({
  name: z.string(),
  company: z.string().optional().nullable(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  country: z.string().default("US"),
  phone: z.string().optional().nullable(),
});

const PackageSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  weight: z.number().positive(),
  description: z.string().optional().nullable(),
});

const RatesRequestSchema = z.object({
  from: AddressSchema,
  to: AddressSchema,
  packages: z.array(PackageSchema).min(1),
  customerCarrierAccount: z.object({
    carrier: z.enum(["ups", "fedex"]),
    accountNumber: z.string(),
  }).optional().nullable(),
});

function addBusinessDays(days: number): string {
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getMockRates(billedToAccount: boolean) {
  if (billedToAccount) {
    return [
      { rateId: "ups-ground", carrier: "UPS", service: "UPS Ground", serviceCode: "03", deliveryDays: 5, estimatedDelivery: addBusinessDays(5), price: 0, currency: "USD", billedToAccount: true },
      { rateId: "ups-3day", carrier: "UPS", service: "UPS 3 Day Select", serviceCode: "12", deliveryDays: 3, estimatedDelivery: addBusinessDays(3), price: 0, currency: "USD", billedToAccount: true },
      { rateId: "ups-2day", carrier: "UPS", service: "UPS 2nd Day Air", serviceCode: "02", deliveryDays: 2, estimatedDelivery: addBusinessDays(2), price: 0, currency: "USD", billedToAccount: true },
      { rateId: "ups-overnight", carrier: "UPS", service: "UPS Next Day Air", serviceCode: "01", deliveryDays: 1, estimatedDelivery: addBusinessDays(1), price: 0, currency: "USD", billedToAccount: true },
      { rateId: "ups-overnight-saver", carrier: "UPS", service: "UPS Next Day Air Saver", serviceCode: "13", deliveryDays: 1, estimatedDelivery: addBusinessDays(1), price: 0, currency: "USD", billedToAccount: true },
    ];
  }
  return [
    { rateId: "ups-ground", carrier: "UPS", service: "UPS Ground", serviceCode: "03", deliveryDays: 5, estimatedDelivery: addBusinessDays(5), price: 14.99, currency: "USD", billedToAccount: false },
    { rateId: "ups-3day", carrier: "UPS", service: "UPS 3 Day Select", serviceCode: "12", deliveryDays: 3, estimatedDelivery: addBusinessDays(3), price: 24.75, currency: "USD", billedToAccount: false },
    { rateId: "ups-2day", carrier: "UPS", service: "UPS 2nd Day Air", serviceCode: "02", deliveryDays: 2, estimatedDelivery: addBusinessDays(2), price: 34.50, currency: "USD", billedToAccount: false },
    { rateId: "ups-overnight", carrier: "UPS", service: "UPS Next Day Air", serviceCode: "01", deliveryDays: 1, estimatedDelivery: addBusinessDays(1), price: 67.25, currency: "USD", billedToAccount: false },
    { rateId: "fedex-ground", carrier: "FedEx", service: "FedEx Ground", serviceCode: "FEDEX_GROUND", deliveryDays: 5, estimatedDelivery: addBusinessDays(5), price: 13.75, currency: "USD", billedToAccount: false },
    { rateId: "fedex-express-saver", carrier: "FedEx", service: "FedEx Express Saver", serviceCode: "FEDEX_EXPRESS_SAVER", deliveryDays: 3, estimatedDelivery: addBusinessDays(3), price: 27.50, currency: "USD", billedToAccount: false },
    { rateId: "fedex-2day", carrier: "FedEx", service: "FedEx 2Day", serviceCode: "FEDEX_2_DAY", deliveryDays: 2, estimatedDelivery: addBusinessDays(2), price: 32.99, currency: "USD", billedToAccount: false },
    { rateId: "fedex-overnight", carrier: "FedEx", service: "FedEx Priority Overnight", serviceCode: "PRIORITY_OVERNIGHT", deliveryDays: 1, estimatedDelivery: addBusinessDays(1), price: 64.50, currency: "USD", billedToAccount: false },
    { rateId: "usps-ground", carrier: "USPS", service: "USPS Ground Advantage", serviceCode: "GROUND_ADVANTAGE", deliveryDays: 5, estimatedDelivery: addBusinessDays(5), price: 9.25, currency: "USD", billedToAccount: false },
    { rateId: "usps-priority", carrier: "USPS", service: "Priority Mail", serviceCode: "PRIORITY", deliveryDays: 3, estimatedDelivery: addBusinessDays(3), price: 10.50, currency: "USD", billedToAccount: false },
    { rateId: "usps-express", carrier: "USPS", service: "Priority Mail Express", serviceCode: "EXPRESS", deliveryDays: 1, estimatedDelivery: addBusinessDays(1), price: 28.75, currency: "USD", billedToAccount: false },
    { rateId: "dhl-express", carrier: "DHL", service: "DHL Express Worldwide", serviceCode: "EXPRESS", deliveryDays: 3, estimatedDelivery: addBusinessDays(3), price: 42.00, currency: "USD", billedToAccount: false },
    { rateId: "dhl-express-easy", carrier: "DHL", service: "DHL Express Easy", serviceCode: "EASY", deliveryDays: 5, estimatedDelivery: addBusinessDays(5), price: 28.50, currency: "USD", billedToAccount: false },
  ];
}

async function getUpsRates(from: z.infer<typeof AddressSchema>, to: z.infer<typeof AddressSchema>, packages: z.infer<typeof PackageSchema>[], accountNumber?: string): Promise<any[]> {
  const clientId = process.env.UPS_CLIENT_ID;
  const clientSecret = process.env.UPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    const tokenRes = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    if (!tokenRes.ok) return [];
    const { access_token } = await tokenRes.json() as { access_token: string };

    const shipperNumber = accountNumber || process.env.UPS_SHIPPER_NUMBER || "";

    const ratePayload = {
      RateRequest: {
        Request: { SubVersion: "2205", RequestOption: "Shop" },
        Shipment: {
          Shipper: { Name: from.name, ShipperNumber: shipperNumber, Address: { AddressLine: [from.address], City: from.city, StateProvinceCode: from.state, PostalCode: from.zip, CountryCode: from.country } },
          ShipTo: { Name: to.name, Address: { AddressLine: [to.address], City: to.city, StateProvinceCode: to.state, PostalCode: to.zip, CountryCode: to.country } },
          ShipFrom: { Name: from.name, Address: { AddressLine: [from.address], City: from.city, StateProvinceCode: from.state, PostalCode: from.zip, CountryCode: from.country } },
          PaymentDetails: accountNumber ? {
            ShipmentCharge: { Type: "01", BillShipper: { AccountNumber: accountNumber } }
          } : {
            ShipmentCharge: { Type: "01", BillShipper: { AccountNumber: shipperNumber } }
          },
          Package: packages.map(pkg => ({
            PackagingType: { Code: "02" },
            Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: String(Math.ceil(pkg.length)), Width: String(Math.ceil(pkg.width)), Height: String(Math.ceil(pkg.height)) },
            PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(pkg.weight) },
          })),
        },
      },
    };

    const rateRes = await fetch("https://onlinetools.ups.com/api/rating/v2205/Shop", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${access_token}`, "transId": `forez-${Date.now()}`, "transactionSrc": "ForezCorp" },
      body: JSON.stringify(ratePayload),
    });
    if (!rateRes.ok) return [];
    const rateData = await rateRes.json() as any;

    const UPS_SERVICE_NAMES: Record<string, string> = {
      "01": "UPS Next Day Air", "02": "UPS 2nd Day Air", "03": "UPS Ground",
      "07": "UPS Worldwide Express", "08": "UPS Worldwide Expedited",
      "11": "UPS Standard", "12": "UPS 3 Day Select", "13": "UPS Next Day Air Saver",
      "14": "UPS Next Day Air Early", "54": "UPS Worldwide Express Plus",
      "59": "UPS 2nd Day Air A.M.", "65": "UPS Worldwide Saver",
    };

    const rates = rateData?.RateResponse?.RatedShipment ?? [];
    return rates.map((r: any) => {
      const code = r.Service?.Code ?? "";
      const days = parseInt(r.GuaranteedDelivery?.BusinessDaysInTransit ?? r.TimeInTransit?.PickupDateForwardDays ?? "0") || null;
      return {
        rateId: `ups-${code}`,
        carrier: "UPS",
        service: UPS_SERVICE_NAMES[code] ?? `UPS Service ${code}`,
        serviceCode: code,
        deliveryDays: days,
        estimatedDelivery: days ? addBusinessDays(days) : null,
        price: accountNumber ? 0 : parseFloat(r.TotalCharges?.MonetaryValue ?? "0"),
        currency: r.TotalCharges?.CurrencyCode ?? "USD",
        billedToAccount: !!accountNumber,
      };
    });
  } catch {
    return [];
  }
}

async function getFedExRates(from: z.infer<typeof AddressSchema>, to: z.infer<typeof AddressSchema>, packages: z.infer<typeof PackageSchema>[], accountNumber?: string): Promise<any[]> {
  const apiKey = process.env.FEDEX_API_KEY;
  const secretKey = process.env.FEDEX_SECRET_KEY;
  if (!apiKey || !secretKey) return [];

  try {
    const tokenRes = await fetch("https://apis.fedex.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: apiKey, client_secret: secretKey }),
    });
    if (!tokenRes.ok) return [];
    const { access_token } = await tokenRes.json() as { access_token: string };

    const acctNum = accountNumber || process.env.FEDEX_ACCOUNT_NUMBER || "";

    const ratePayload = {
      accountNumber: { value: acctNum },
      requestedShipment: {
        shipper: { address: { streetLines: [from.address], city: from.city, stateOrProvinceCode: from.state, postalCode: from.zip, countryCode: from.country } },
        recipient: { address: { streetLines: [to.address], city: to.city, stateOrProvinceCode: to.state, postalCode: to.zip, countryCode: to.country } },
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        rateRequestType: ["LIST", "ACCOUNT"],
        requestedPackageLineItems: packages.map(pkg => ({
          weight: { units: "LB", value: pkg.weight },
          dimensions: { length: Math.ceil(pkg.length), width: Math.ceil(pkg.width), height: Math.ceil(pkg.height), units: "IN" },
        })),
      },
    };

    const rateRes = await fetch("https://apis.fedex.com/rate/v1/rates/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${access_token}`, "X-locale": "en_US" },
      body: JSON.stringify(ratePayload),
    });
    if (!rateRes.ok) return [];
    const rateData = await rateRes.json() as any;

    const FEDEX_DAYS: Record<string, number> = {
      "FEDEX_GROUND": 5, "GROUND_HOME_DELIVERY": 5, "FEDEX_EXPRESS_SAVER": 3,
      "FEDEX_2_DAY": 2, "FEDEX_2_DAY_AM": 2, "STANDARD_OVERNIGHT": 1,
      "PRIORITY_OVERNIGHT": 1, "FIRST_OVERNIGHT": 1,
    };
    const FEDEX_NAMES: Record<string, string> = {
      "FEDEX_GROUND": "FedEx Ground", "GROUND_HOME_DELIVERY": "FedEx Home Delivery",
      "FEDEX_EXPRESS_SAVER": "FedEx Express Saver", "FEDEX_2_DAY": "FedEx 2Day",
      "FEDEX_2_DAY_AM": "FedEx 2Day A.M.", "STANDARD_OVERNIGHT": "FedEx Standard Overnight",
      "PRIORITY_OVERNIGHT": "FedEx Priority Overnight", "FIRST_OVERNIGHT": "FedEx First Overnight",
    };

    const detail = rateData?.output?.rateReplyDetails ?? [];
    return detail.map((r: any) => {
      const code = r.serviceType ?? "";
      const days = FEDEX_DAYS[code] ?? null;
      const charges = r.ratedShipmentDetails?.[0]?.totalNetCharge ?? r.ratedShipmentDetails?.[0]?.totalNetFedExCharge ?? 0;
      return {
        rateId: `fedex-${code.toLowerCase()}`,
        carrier: "FedEx",
        service: FEDEX_NAMES[code] ?? `FedEx ${code}`,
        serviceCode: code,
        deliveryDays: days,
        estimatedDelivery: days ? addBusinessDays(days) : null,
        price: accountNumber ? 0 : parseFloat(String(charges)),
        currency: "USD",
        billedToAccount: !!accountNumber,
      };
    });
  } catch {
    return [];
  }
}

router.post("/shipping/rates", async (req, res): Promise<void> => {
  const parsed = RatesRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { from, to, packages, customerCarrierAccount } = parsed.data;
  const billedToAccount = !!customerCarrierAccount;
  const upsConfigured = !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET);
  const fedexConfigured = !!(process.env.FEDEX_API_KEY && process.env.FEDEX_SECRET_KEY);
  const anyConfigured = upsConfigured || fedexConfigured;

  if (!anyConfigured) {
    res.json({
      source: "demo",
      billedToAccount,
      accountNumber: customerCarrierAccount?.accountNumber ?? null,
      carrier: customerCarrierAccount?.carrier ?? null,
      rates: getMockRates(billedToAccount),
    });
    return;
  }

  let rates: any[] = [];

  if (billedToAccount && customerCarrierAccount?.carrier === "ups") {
    rates = await getUpsRates(from, to, packages, customerCarrierAccount.accountNumber);
    if (rates.length === 0) rates = getMockRates(true);
  } else if (billedToAccount && customerCarrierAccount?.carrier === "fedex") {
    rates = await getFedExRates(from, to, packages, customerCarrierAccount.accountNumber);
    if (rates.length === 0) rates = getMockRates(true);
  } else {
    const [upsRates, fedexRates] = await Promise.all([
      upsConfigured ? getUpsRates(from, to, packages) : Promise.resolve(getMockRates(false).filter(r => r.carrier === "UPS")),
      fedexConfigured ? getFedExRates(from, to, packages) : Promise.resolve(getMockRates(false).filter(r => r.carrier === "FedEx")),
    ]);
    const uspsRates = getMockRates(false).filter(r => r.carrier === "USPS");
    const dhlRates = getMockRates(false).filter(r => r.carrier === "DHL");
    rates = [...upsRates, ...fedexRates, ...uspsRates, ...dhlRates];
  }

  rates.sort((a, b) => a.price - b.price);

  res.json({
    source: anyConfigured ? "live" : "demo",
    billedToAccount,
    accountNumber: customerCarrierAccount?.accountNumber ?? null,
    carrier: customerCarrierAccount?.carrier ?? null,
    rates,
  });
});

export default router;
