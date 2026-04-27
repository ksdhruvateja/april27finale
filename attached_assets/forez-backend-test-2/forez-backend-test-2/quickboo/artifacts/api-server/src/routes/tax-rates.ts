import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, taxRatesTable } from "@workspace/db";
import {
  CreateTaxRateBody,
  UpdateTaxRateBody,
  GetTaxRateParams,
  UpdateTaxRateParams,
  DeleteTaxRateParams,
} from "@workspace/api-zod";

const router = Router();

const US_STATE_TAX_RATES: Array<{ code: string; name: string; rate: number }> = [
  { code: "AL", name: "Alabama", rate: 4.0 },
  { code: "AK", name: "Alaska", rate: 0.0 },
  { code: "AZ", name: "Arizona", rate: 5.6 },
  { code: "AR", name: "Arkansas", rate: 6.5 },
  { code: "CA", name: "California", rate: 7.25 },
  { code: "CO", name: "Colorado", rate: 2.9 },
  { code: "CT", name: "Connecticut", rate: 6.35 },
  { code: "DE", name: "Delaware", rate: 0.0 },
  { code: "FL", name: "Florida", rate: 6.0 },
  { code: "GA", name: "Georgia", rate: 4.0 },
  { code: "HI", name: "Hawaii", rate: 4.0 },
  { code: "ID", name: "Idaho", rate: 6.0 },
  { code: "IL", name: "Illinois", rate: 6.25 },
  { code: "IN", name: "Indiana", rate: 7.0 },
  { code: "IA", name: "Iowa", rate: 6.0 },
  { code: "KS", name: "Kansas", rate: 6.5 },
  { code: "KY", name: "Kentucky", rate: 6.0 },
  { code: "LA", name: "Louisiana", rate: 4.45 },
  { code: "ME", name: "Maine", rate: 5.5 },
  { code: "MD", name: "Maryland", rate: 6.0 },
  { code: "MA", name: "Massachusetts", rate: 6.25 },
  { code: "MI", name: "Michigan", rate: 6.0 },
  { code: "MN", name: "Minnesota", rate: 6.88 },
  { code: "MS", name: "Mississippi", rate: 7.0 },
  { code: "MO", name: "Missouri", rate: 4.23 },
  { code: "MT", name: "Montana", rate: 0.0 },
  { code: "NE", name: "Nebraska", rate: 5.5 },
  { code: "NV", name: "Nevada", rate: 6.85 },
  { code: "NH", name: "New Hampshire", rate: 0.0 },
  { code: "NJ", name: "New Jersey", rate: 6.63 },
  { code: "NM", name: "New Mexico", rate: 5.0 },
  { code: "NY", name: "New York", rate: 4.0 },
  { code: "NC", name: "North Carolina", rate: 4.75 },
  { code: "ND", name: "North Dakota", rate: 5.0 },
  { code: "OH", name: "Ohio", rate: 5.75 },
  { code: "OK", name: "Oklahoma", rate: 4.5 },
  { code: "OR", name: "Oregon", rate: 0.0 },
  { code: "PA", name: "Pennsylvania", rate: 6.0 },
  { code: "RI", name: "Rhode Island", rate: 7.0 },
  { code: "SC", name: "South Carolina", rate: 6.0 },
  { code: "SD", name: "South Dakota", rate: 4.5 },
  { code: "TN", name: "Tennessee", rate: 7.0 },
  { code: "TX", name: "Texas", rate: 6.25 },
  { code: "UT", name: "Utah", rate: 4.85 },
  { code: "VT", name: "Vermont", rate: 6.0 },
  { code: "VA", name: "Virginia", rate: 5.3 },
  { code: "WA", name: "Washington", rate: 6.5 },
  { code: "WV", name: "West Virginia", rate: 6.0 },
  { code: "WI", name: "Wisconsin", rate: 5.0 },
  { code: "WY", name: "Wyoming", rate: 4.0 },
  { code: "DC", name: "District of Columbia", rate: 6.0 },
];

async function ensureAllUsStateTaxRates() {
  const existing = await db.select().from(taxRatesTable);
  const existingRegions = new Set(
    existing
      .filter((r) => r.country === "US" && r.region)
      .map((r) => String(r.region).toUpperCase()),
  );

  const missing = US_STATE_TAX_RATES.filter((state) => !existingRegions.has(state.code));
  if (missing.length === 0) return;

  await db.insert(taxRatesTable).values(
    missing.map((state) => ({
      name: `${state.name} Sales Tax`,
      rate: String(state.rate),
      country: "US",
      region: state.code,
      isDefault: false,
    })),
  );
}

router.get("/tax-rates", async (_req, res): Promise<void> => {
  await ensureAllUsStateTaxRates();
  const rates = await db.select().from(taxRatesTable).orderBy(taxRatesTable.createdAt);
  res.json(rates.map(r => ({ ...r, rate: Number(r.rate) })));
});

router.post("/tax-rates", async (req, res): Promise<void> => {
  const parsed = CreateTaxRateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rate] = await db.insert(taxRatesTable).values({
    name: parsed.data.name,
    rate: String(parsed.data.rate),
    country: parsed.data.country ?? null,
    region: parsed.data.region ?? null,
    isDefault: parsed.data.isDefault ?? false,
  }).returning();
  res.status(201).json({ ...rate, rate: Number(rate.rate) });
});

router.get("/tax-rates/:id", async (req, res): Promise<void> => {
  const params = GetTaxRateParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [rate] = await db.select().from(taxRatesTable).where(eq(taxRatesTable.id, params.data.id));
  if (!rate) {
    res.status(404).json({ error: "Tax rate not found" });
    return;
  }
  res.json({ ...rate, rate: Number(rate.rate) });
});

router.patch("/tax-rates/:id", async (req, res): Promise<void> => {
  const params = UpdateTaxRateParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTaxRateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.rate !== undefined) updateData.rate = String(parsed.data.rate);

  const [rate] = await db.update(taxRatesTable).set(updateData).where(eq(taxRatesTable.id, params.data.id)).returning();
  if (!rate) {
    res.status(404).json({ error: "Tax rate not found" });
    return;
  }
  res.json({ ...rate, rate: Number(rate.rate) });
});

router.delete("/tax-rates/:id", async (req, res): Promise<void> => {
  const params = DeleteTaxRateParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [rate] = await db.delete(taxRatesTable).where(eq(taxRatesTable.id, params.data.id)).returning();
  if (!rate) {
    res.status(404).json({ error: "Tax rate not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
