import { pgTable, text, serial, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  emails: jsonb("emails").default([]),
  phone: text("phone"),
  phones: jsonb("phones").default([]),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  billingAddress: jsonb("billing_address"),
  shippingAddress: jsonb("shipping_address"),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  paymentTerms: text("payment_terms"),
  salesRep: text("sales_rep"),
  einNumber: text("ein_number"),
  shippingCarrierName: text("shipping_carrier_name"),
  shippingAccountNumber: text("shipping_account_number"),
  taxNumber: text("tax_number"),
  notes: text("notes"),
  quickbooksExtras: jsonb("quickbooks_extras").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
