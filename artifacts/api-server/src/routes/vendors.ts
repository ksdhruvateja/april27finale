import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import {
  GetVendorParams,
  UpdateVendorParams,
  DeleteVendorParams,
} from "@workspace/api-zod";
import { z } from "zod";
import {
  ContactEntry,
  contactEmailsField,
  contactPhonesField,
  normalizeContactList,
} from "../lib/normalize-contacts.js";

const router = Router();

const CreateVendorPayload = z.object({
  name: z.string().min(1),
  company: z.string().nullish(),
  email: z.string().nullish(),
  emails: contactEmailsField,
  phone: z.string().nullish(),
  phones: contactPhonesField,
  address: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  zipCode: z.string().nullish(),
  country: z.string().nullish(),
  billingAddress: z.record(z.string(), z.unknown()).nullish(),
  shippingAddress: z.record(z.string(), z.unknown()).nullish(),
  taxExempt: z.boolean().optional(),
  paymentTerms: z.string().nullish(),
  salesRep: z.string().nullish(),
  einNumber: z.string().nullish(),
  shippingCarrierName: z.string().nullish(),
  shippingAccountNumber: z.string().nullish(),
  taxNumber: z.string().nullish(),
  notes: z.string().nullish(),
  quickbooksExtras: z.record(z.string(), z.unknown()).nullish(),
});

const UpdateVendorPayload = CreateVendorPayload.partial();

router.get("/vendors", async (_req, res): Promise<void> => {
  const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.createdAt);
  res.json(vendors);
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = CreateVendorPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const normalizedEmails = normalizeContactList(parsed.data.emails as unknown[] | undefined, "email");
  const normalizedPhones = normalizeContactList(parsed.data.phones as unknown[] | undefined, "phone");
  const [vendor] = await db.insert(vendorsTable).values({
    ...parsed.data,
    email: parsed.data.email ?? normalizedEmails?.[0]?.email ?? null,
    phone: parsed.data.phone ?? normalizedPhones?.[0]?.number ?? null,
    emails: normalizedEmails,
    phones: normalizedPhones,
  }).returning();
  res.status(201).json(vendor);
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const params = GetVendorParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, params.data.id));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(vendor);
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVendorPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updatePayload: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.emails !== undefined) {
    const normalizedEmails = normalizeContactList(parsed.data.emails as unknown[] | undefined, "email");
    updatePayload.emails = normalizedEmails;
    if (parsed.data.email === undefined) updatePayload.email = normalizedEmails?.[0]?.email ?? null;
  }
  if (parsed.data.phones !== undefined) {
    const normalizedPhones = normalizeContactList(parsed.data.phones as unknown[] | undefined, "phone");
    updatePayload.phones = normalizedPhones;
    if (parsed.data.phone === undefined) updatePayload.phone = normalizedPhones?.[0]?.number ?? null;
  }
  const [vendor] = await db.update(vendorsTable).set(updatePayload).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(vendor);
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const params = DeleteVendorParams.safeParse({ id: Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vendor] = await db.delete(vendorsTable).where(eq(vendorsTable.id, params.data.id)).returning();
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
