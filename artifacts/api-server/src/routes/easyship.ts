import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const EASYSHIP_BASE = "https://public-api.easyship.com";

async function getApiKey(): Promise<string | null> {
  if (process.env.EASYSHIP_API_KEY) return process.env.EASYSHIP_API_KEY;
  try {
    const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "easyship_api_key"));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function easyHeaders(apiKey: string) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

function demoRates(from: any, to: any) {
  return [
    { courierId: "demo-ups-ground",    courierName: "UPS Ground",              minDays: 3, maxDays: 5, totalCharge: 12.49, currency: "USD" },
    { courierId: "demo-ups-2day",      courierName: "UPS 2nd Day Air",         minDays: 2, maxDays: 2, totalCharge: 28.95, currency: "USD" },
    { courierId: "demo-fedex-ground",  courierName: "FedEx Ground",            minDays: 3, maxDays: 5, totalCharge: 11.75, currency: "USD" },
    { courierId: "demo-fedex-express", courierName: "FedEx Express Saver",     minDays: 3, maxDays: 3, totalCharge: 22.30, currency: "USD" },
    { courierId: "demo-usps-priority", courierName: "USPS Priority Mail",      minDays: 1, maxDays: 3, totalCharge: 8.95,  currency: "USD" },
    { courierId: "demo-dhl-express",   courierName: "DHL Express Worldwide",   minDays: 1, maxDays: 3, totalCharge: 34.50, currency: "USD" },
  ];
}

router.post("/easyship/rates", async (req, res): Promise<void> => {
  const apiKey = await getApiKey();

  const { from, to, packages, declaredValue } = req.body;

  if (!apiKey) {
    res.json({
      source: "demo",
      rates: demoRates(from, to),
    });
    return;
  }

  try {
    const items = (packages ?? []).map((pkg: any) => ({
      actual_weight: pkg.weight,
      height: pkg.height,
      width: pkg.width,
      length: pkg.length,
      declared_currency: "USD",
      declared_customs_value: declaredValue ?? 10,
    }));

    const body = {
      origin_country_alpha2: from?.country ?? "US",
      origin_postal_code: from?.zip ?? "",
      destination_country_alpha2: to?.country ?? "US",
      destination_postal_code: to?.zip ?? "",
      incoterms: "DDU",
      insurance: { is_insured: false },
      items,
    };

    const response = await fetch(`${EASYSHIP_BASE}/rate/v1/rates`, {
      method: "POST",
      headers: easyHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("EasyShip rates error:", response.status, errText);
      res.status(502).json({
        error: "EasyShip could not return rates",
        details: errText,
        source: "error",
      });
      return;
    }

    const data: any = await response.json();
    const rates = (data.rates ?? []).map((r: any) => ({
      courierId: r.courier_id,
      courierName: r.courier_name,
      courierLogo: r.courier_logo ?? null,
      minDays: r.min_delivery_time ?? null,
      maxDays: r.max_delivery_time ?? null,
      deliveryDate: r.delivery_time_frame ?? null,
      totalCharge: r.total_charge ?? r.shipment_charge ?? 0,
      currency: r.currency ?? "USD",
      fuelSurcharge: r.fuel_surcharge ?? 0,
      insuranceFee: r.insurance_fee ?? 0,
    }));

    res.json({ source: "live", rates });
  } catch (err) {
    console.error("EasyShip rates fetch error:", err);
    res.status(500).json({
      error: "EasyShip rates request failed",
      details: err instanceof Error ? err.message : String(err),
      source: "error",
    });
  }
});

router.post("/easyship/book", async (req, res): Promise<void> => {
  const apiKey = await getApiKey();
  const { courierId, from, to, packages, declaredValue, notes, insurance } = req.body;

  if (!apiKey || courierId?.startsWith("demo-")) {
    res.json({
      source: "demo",
      easyshipShipmentId: `DEMO-${Date.now()}`,
      trackingNumber: `DEMO${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      labelUrl: null,
      carrier: courierId?.replace("demo-", "").split("-")[0]?.toUpperCase() ?? "DEMO",
      totalCharge: req.body.totalCharge ?? 0,
    });
    return;
  }

  try {
    const items = (packages ?? []).map((pkg: any) => ({
      actual_weight: pkg.weight,
      height: pkg.height,
      width: pkg.width,
      length: pkg.length,
      declared_currency: "USD",
      declared_customs_value: declaredValue ?? 10,
    }));

    const body = {
      selected_courier_id: courierId,
      incoterms: "DDU",
      insurance: { is_insured: !!insurance, insured_amount: insurance ?? 0, insured_currency: "USD" },
      origin_address: {
        line_1: from.address,
        city: from.city,
        state: from.state,
        postal_code: from.zip,
        country_alpha2: from.country ?? "US",
        contact_name: from.name,
        contact_phone: from.phone ?? "",
        contact_email: from.email ?? "",
      },
      destination_address: {
        line_1: to.address,
        city: to.city,
        state: to.state,
        postal_code: to.zip,
        country_alpha2: to.country ?? "US",
        contact_name: to.name,
        contact_phone: to.phone ?? "",
      },
      shipment_description: notes ?? "",
      items,
    };

    const response = await fetch(`${EASYSHIP_BASE}/shipment/v1/shipments`, {
      method: "POST",
      headers: easyHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("EasyShip book error:", response.status, errText);
      res.status(502).json({ error: "EasyShip booking failed", details: errText });
      return;
    }

    const data: any = await response.json();
    const ship = data.shipment ?? data;

    res.json({
      source: "live",
      easyshipShipmentId: ship.easyship_shipment_id,
      trackingNumber: ship.tracking_number ?? null,
      labelUrl: ship.label_url ?? null,
      carrier: ship.selected_courier?.courier_name ?? ship.courier_name ?? null,
      totalCharge: ship.total_charge ?? ship.shipment_charge ?? 0,
    });
  } catch (err) {
    console.error("EasyShip book error:", err);
    res.status(500).json({ error: "Booking failed" });
  }
});

router.get("/easyship/label/:shipmentId", async (req, res): Promise<void> => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    res.status(400).json({ error: "EasyShip API key not configured" });
    return;
  }

  try {
    const response = await fetch(
      `${EASYSHIP_BASE}/shipment/v1/shipments/${req.params.shipmentId}/label`,
      { headers: easyHeaders(apiKey) }
    );
    if (!response.ok) {
      res.status(502).json({ error: "Could not fetch label" });
      return;
    }
    const data: any = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Label fetch failed" });
  }
});

router.get("/easyship/status", async (_req, res): Promise<void> => {
  const apiKey = await getApiKey();
  res.json({ configured: !!apiKey, source: apiKey ? "live" : "demo" });
});

export default router;
